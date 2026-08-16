'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu, Notification, nativeImage, Tray
} = require('electron');
const QRCode = require('qrcode');

const settings = require('./settings');
const words = require('./words');
const { t, DEFAULT_LANG } = require('../renderer/i18n');
const history = require('./history');
const quickaction = require('./quickaction');
const diagnose = require('./diagnose');
const manifest = require('./manifest');
const { detect, Runner } = require('./croc');

let win = null;
let runner = null;
let tray = null;

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

/* ------------------------------------------------------------------ *
 * Dateien aus dem Finder
 *
 * "Oeffnen mit" und der Kurzbefehl schicken die Pfade einzeln als
 * open-file. Sie kommen dicht hintereinander und moeglicherweise, bevor
 * das Fenster steht - deshalb sammeln und gebuendelt weitergeben.
 * ------------------------------------------------------------------ */

let queued = [];
let flushTimer = null;

function flushQueued() {
  if (!queued.length) return;
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
  const paths = queued;
  queued = [];
  showWindow();
  win.webContents.send('files:add', paths);
}

function queueFiles(paths) {
  queued.push(...paths.filter(Boolean));
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueued, 250);
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueFiles([filePath]);
});

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ------------------------------------------------------------------ *
 * Menueleiste
 * ------------------------------------------------------------------ */

function trayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'crocTemplate.png')
    : path.join(__dirname, '..', '..', 'assets', 'crocTemplate.png');
}

function buildTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(trayIconPath());
  if (image.isEmpty()) return;
  image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('CrocGUI');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tr('tray.show'), click: showWindow },
    { type: 'separator' },
    { label: tr('menu.sendFiles'), click: () => { showWindow(); win.webContents.send('menu:action', 'pick-files'); } },
    { label: tr('menu.receiveCode'), click: () => { showWindow(); win.webContents.send('menu:action', 'goto-receive'); } },
    { type: 'separator' },
    { label: tr('menu.quit'), click: () => app.quit() }
  ]));
  tray.on('click', showWindow);
  // Dateien lassen sich direkt auf das Symbol ziehen.
  tray.on('drop-files', (_e, files) => queueFiles(files));
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

function syncTray() {
  if (settings.load().tray) buildTray();
  else destroyTray();
}

/* ------------------------------------------------------------------ *
 * Mitteilungen des Systems
 *
 * Nur wenn das Fenster nicht im Vordergrund ist - sonst steht dieselbe
 * Meldung ohnehin schon in der App.
 * ------------------------------------------------------------------ */

const pending = new Map(); // Vorgangs-Kennung -> { kind, label, size, outDir }
const sheets = new Map();  // Vorgangs-Kennung -> aufzuraeumende Pruefsummenliste

function tr(key, ...args) {
  return t(settings.load().lang || DEFAULT_LANG, key, ...args);
}

function notify(title, body, view, folder) {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title, body });
  note.on('click', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (view) win.webContents.send('menu:action', view);
    if (folder) shell.openPath(folder);
  });
  note.show();
}

function sendProgress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('manifest:progress', payload);
}

/** Rechnet die beigelegten Pruefsummen ueber die empfangenen Dateien nach. */
async function verifyReceived(id, dir) {
  let result;
  try {
    result = await manifest.verify(dir, sendProgress);
  } catch (err) {
    result = { found: false, error: err.message };
  }
  sendProgress({ phase: 'done' });
  if (win && !win.isDestroyed()) win.webContents.send('manifest:result', { id, result });
  if (result.found) {
    history.add({
      kind: 'check',
      label: null,
      ok: result.ok,
      checked: result.total,
      good: result.good,
      broken: result.broken,
      missing: result.missing,
      outDir: dir
    });
    if (win && !win.isDestroyed()) win.webContents.send('history:changed');
  }
}

function trackNotify(id, event) {
  if (event.type === 'started') {
    pending.set(id, { kind: event.kind, outDir: event.outDir });
    return;
  }
  const info = pending.get(id);
  if (!info) return;

  if (event.type === 'meta') {
    info.label = event.label;
    info.size = event.size;
    return;
  }
  if (event.type !== 'done') return;

  pending.delete(id);

  const sheet = sheets.get(id);
  if (sheet) { sheet.cleanup(); sheets.delete(id); }

  if (info.kind === 'relay') return;

  if (info.kind === 'receive' && event.ok && info.outDir && settings.load().checksums) {
    verifyReceived(id, info.outDir);
  }

  history.add({
    kind: info.kind,
    label: info.label || null,
    size: info.size || null,
    contact: info.contactName || null,
    outDir: info.outDir || null,
    paths: info.paths || null,
    ok: Boolean(event.ok),
    cancelled: Boolean(event.cancelled)
  });
  if (win && !win.isDestroyed()) win.webContents.send('history:changed');

  if (event.cancelled) return;
  if (!settings.load().notify) return;
  // Wer gerade zusieht, braucht keine Mitteilung.
  if (win && !win.isDestroyed() && win.isFocused()) return;

  const what = info.label
    ? `${info.label}${info.size ? ` · ${info.size}` : ''}`
    : tr(info.kind === 'send' ? 'notify.someFiles' : 'notify.someIncoming');

  if (!event.ok) {
    notify(tr('notify.failedTitle'), what, info.kind === 'send' ? 'goto-send' : 'goto-receive');
  } else if (info.kind === 'send') {
    notify(tr('notify.sentTitle'), what, 'goto-send');
  } else {
    notify(tr('notify.receivedTitle'), what, 'goto-receive', info.outDir || null);
  }
}

app.whenReady().then(() => {
  runner = new Runner((id, event) => {
    if (win && !win.isDestroyed()) win.webContents.send('transfer:event', { id, event });
    trackNotify(id, event);
  });

  // In der gebauten App kommt das Symbol aus dem Paket. Beim Start aus der
  // Entwicklung laeuft Electrons eigenes Binary - dann setzen wir es selbst,
  // damit im Dock nicht das Electron-Symbol steht.
  const iconFile = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconFile);
  if (!app.isPackaged && !icon.isEmpty() && app.dock) app.dock.setIcon(icon);

  app.setAboutPanelOptions({
    applicationName: 'CrocGUI',
    applicationVersion: app.getVersion(),
    credits: 'CrocGUI by thecrafti87\ncroc by Zack Scholl',
    copyright: 'MIT',
    ...(fs.existsSync(iconFile) ? { iconPath: iconFile } : {})
  });

  buildMenu();
  createWindow();
  syncTray();

  win.webContents.once('did-finish-load', () => flushQueued());

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

/** Welche croc-Fassung ist bei schollz/croc zuletzt erschienen? */
ipcMain.handle('croc:latest', async () => {
  try {
    const release = await fetchJson('https://api.github.com/repos/schollz/croc/releases/latest');
    if (!release || !release.tag_name) return { ok: true, latest: null };
    return {
      ok: true,
      latest: String(release.tag_name).replace(/^v/, ''),
      url: release.html_url || 'https://github.com/schollz/croc/releases/latest'
    };
  } catch {
    return { ok: false, latest: null };
  }
});

ipcMain.handle('settings:set', (_e, patch) => {
  const values = settings.save(patch || {});
  if (patch && 'tray' in patch) syncTray();
  return values;
});

/* Verlauf */

ipcMain.handle('history:list', () => history.withExistence(history.load()));
ipcMain.handle('history:clear', () => history.clear());

/* Selbsttest */

ipcMain.handle('diag:run', () => diagnose.run());

ipcMain.handle('diag:testNote', () => {
  if (!Notification.isSupported()) return { ok: false };
  notify(tr('diag.testTitle'), tr('diag.testBody'));
  return { ok: true };
});

// Nur die Systemeinstellungen, sonst nichts.
const PANES = {
  notifications: 'x-apple.systempreferences:com.apple.preference.notifications',
  files: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
  services: 'x-apple.systempreferences:com.apple.preference.keyboard?Shortcuts'
};

ipcMain.handle('system:pane', (_e, which) => {
  const url = PANES[which];
  if (!url) return false;
  shell.openExternal(url);
  return true;
});

/* Finder-Kurzbefehl */

ipcMain.handle('finder:status', () => ({
  installed: quickaction.isInstalled(),
  path: quickaction.servicePath()
}));
ipcMain.handle('finder:install', (_e, label) => {
  try {
    return { ok: true, path: quickaction.install(label || 'Mit CrocGUI senden', 'CrocGUI') };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});
ipcMain.handle('finder:remove', () => ({ ok: quickaction.remove() }));

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
    let sheet = null;
    // Zippen packt Ordner um - dann passen die Namen in der Liste nicht
    // mehr, und das Archiv prueft sich ohnehin selbst.
    const wantSheet = kind === 'send'
      && settings.load().checksums
      && opts.mode !== 'text'
      && !opts.zip
      && Array.isArray(opts.paths) && opts.paths.length;

    if (wantSheet) {
      sendProgress({ phase: 'build', done: 0, total: 1 });
      sheet = await manifest.build(opts.paths, app.getVersion(), sendProgress);
      opts = { ...opts, paths: [...opts.paths, sheet.file] };
      sendProgress({ phase: 'done' });
    }

    const res = await runner.start(kind, opts);
    if (sheet) sheets.set(res.id, sheet);
    // Das started-Ereignis kam schon durch, der Eintrag steht also bereit.
    const info = pending.get(res.id);
    if (info) {
      info.paths = Array.isArray(opts.paths) ? opts.paths : null;
      info.contactName = opts.contactName || null;
    }
    return { ok: true, ...res };
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
