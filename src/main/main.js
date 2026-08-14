'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const QRCode = require('qrcode');

const settings = require('./settings');
const words = require('./words');
const { t, DEFAULT_LANG } = require('../renderer/i18n');
const { detect, Runner } = require('./croc');

let win = null;
let runner = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1020,
    height: 760,
    minWidth: 880,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0d0b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 21 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Externe Links im Systembrowser oeffnen, nicht im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const lang = settings.load().lang || DEFAULT_LANG;
  const m = (key) => t(lang, key);

  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: m('menu.about') },
            { type: 'separator' },
            { role: 'hide', label: m('menu.hide') },
            { role: 'hideOthers', label: m('menu.hideOthers') },
            { type: 'separator' },
            { role: 'quit', label: m('menu.quit') }
          ]
        }]
      : []),
    {
      label: m('menu.file'),
      submenu: [
        {
          label: m('menu.sendFiles'),
          accelerator: 'CmdOrCtrl+O',
          click: () => win && win.webContents.send('menu:action', 'pick-files')
        },
        {
          label: m('menu.receiveCode'),
          accelerator: 'CmdOrCtrl+R',
          click: () => win && win.webContents.send('menu:action', 'goto-receive')
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit', label: m('menu.close') }
      ]
    },
    {
      label: m('menu.edit'),
      submenu: [
        { role: 'undo', label: m('menu.undo') },
        { role: 'redo', label: m('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: m('menu.cut') },
        { role: 'copy', label: m('menu.copy') },
        { role: 'paste', label: m('menu.paste') },
        { role: 'selectAll', label: m('menu.selectAll') }
      ]
    },
    {
      label: m('menu.view'),
      submenu: [
        { role: 'reload', label: m('menu.reload') },
        { role: 'toggleDevTools', label: m('menu.devTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: m('menu.actualSize') },
        { role: 'zoomIn', label: m('menu.zoomIn') },
        { role: 'zoomOut', label: m('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: m('menu.fullscreen') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ *
 * Nach einer neuen Fassung sehen
 *
 * Bewusst nur ein Blick auf die veroeffentlichten Fassungen, kein
 * stilles Selbstaktualisieren: das setzt auf macOS eine mit einer
 * Apple-Developer-ID signierte App voraus.
 * ------------------------------------------------------------------ */

const REPO = 'thecrafti87/CrocGUI';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'CrocGUI', Accept: 'application/vnd.github+json' },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
  });
}

/** Ist a groesser als b? Vergleicht Haupt-, Neben- und Fehlerstand. */
function isNewer(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

app.whenReady().then(() => {
  runner = new Runner((id, event) => {
    if (win && !win.isDestroyed()) win.webContents.send('transfer:event', { id, event });
  });

  app.setAboutPanelOptions({
    applicationName: 'CrocGUI',
    applicationVersion: app.getVersion(),
    credits: 'CrocGUI by thecrafti87\ncroc by Zack Scholl',
    copyright: 'MIT'
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (runner) runner.cancelAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (runner) runner.cancelAll();
});

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

ipcMain.handle('croc:detect', async (_e, force) => detect(Boolean(force)));

ipcMain.handle('settings:get', () => ({
  values: settings.load(),
  defaultOutDir: settings.defaultOutDir(),
  file: settings.file(),
  version: app.getVersion()
}));

ipcMain.handle('lang:set', (_e, code) => {
  settings.save({ lang: code });
  buildMenu();
  return code;
});

ipcMain.handle('update:check', async () => {
  const current = app.getVersion();
  try {
    const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!release || !release.tag_name) return { ok: true, latest: null, current };
    const latest = String(release.tag_name).replace(/^v/, '');
    return {
      ok: true,
      latest,
      current,
      newer: isNewer(latest, current),
      url: release.html_url || `https://github.com/${REPO}/releases/latest`
    };
  } catch {
    return { ok: false, current };
  }
});

ipcMain.handle('settings:set', (_e, patch) => settings.save(patch || {}));

/* Kontakte - feste Codes je Gegenstelle */

ipcMain.handle('contacts:list', () => settings.load().contacts || []);

ipcMain.handle('contacts:save', (_e, contact) => {
  const list = [...(settings.load().contacts || [])];
  const entry = {
    id: contact.id || crypto.randomUUID(),
    name: String(contact.name || '').trim(),
    code: String(contact.code || '').trim(),
    note: String(contact.note || '').trim()
  };
  const at = list.findIndex((c) => c.id === entry.id);
  if (at >= 0) list[at] = entry;
  else list.push(entry);
  list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return settings.save({ contacts: list }).contacts;
});

ipcMain.handle('contacts:remove', (_e, id) => {
  const list = (settings.load().contacts || []).filter((c) => c.id !== id);
  return settings.save({ contacts: list }).contacts;
});

ipcMain.handle('contacts:generate', () => ({
  code: words.makeCode(),
  bits: words.strengthBits()
}));

ipcMain.handle('dialog:pickFiles', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Dateien oder Ordner zum Senden auswaehlen',
    buttonLabel: 'Auswaehlen',
    properties: ['openFile', 'openDirectory', 'multiSelections']
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:pickFolder', async (_e, current) => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Zielordner auswaehlen',
    buttonLabel: 'Auswaehlen',
    defaultPath: current || settings.defaultOutDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('dialog:pickBinary', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'croc-Programm auswaehlen',
    properties: ['openFile'],
    defaultPath: '/usr/local/bin'
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('fs:stat', (_e, targets) => {
  return (targets || []).map((p) => {
    try {
      const st = fs.statSync(p);
      return { path: p, name: path.basename(p), size: st.size, dir: st.isDirectory() };
    } catch {
      return { path: p, name: path.basename(p), size: 0, dir: false, missing: true };
    }
  });
});

ipcMain.handle('transfer:start', async (_e, { kind, opts }) => {
  try {
    return { ok: true, ...(await runner.start(kind, opts)) };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('transfer:cancel', (_e, id) => runner.cancel(id));

ipcMain.handle('qr:make', async (_e, text) => {
  try {
    return await QRCode.toDataURL(String(text), {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0d0b', light: '#c6f24e' }
    });
  } catch {
    return null;
  }
});

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text));
  return true;
});

ipcMain.handle('shell:reveal', (_e, target) => {
  if (!target) return false;
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) shell.openPath(target);
    else shell.showItemInFolder(target);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('shell:external', (_e, url) => {
  if (/^https?:/.test(String(url))) shell.openExternal(url);
  return true;
});
