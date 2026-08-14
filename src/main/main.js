'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const QRCode = require('qrcode');

const settings = require('./settings');
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
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: 'Ueber CrocGUI' },
            { type: 'separator' },
            { role: 'hide', label: 'CrocGUI ausblenden' },
            { role: 'hideOthers', label: 'Andere ausblenden' },
            { type: 'separator' },
            { role: 'quit', label: 'CrocGUI beenden' }
          ]
        }]
      : []),
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Dateien senden ...',
          accelerator: 'CmdOrCtrl+O',
          click: () => win && win.webContents.send('menu:action', 'pick-files')
        },
        {
          label: 'Code empfangen',
          accelerator: 'CmdOrCtrl+R',
          click: () => win && win.webContents.send('menu:action', 'goto-receive')
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit', label: 'Schliessen' }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswaehlen' }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Originalgroesse' },
        { role: 'zoomIn', label: 'Groesser' },
        { role: 'zoomOut', label: 'Kleiner' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  runner = new Runner((id, event) => {
    if (win && !win.isDestroyed()) win.webContents.send('transfer:event', { id, event });
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
  file: settings.file()
}));

ipcMain.handle('settings:set', (_e, patch) => settings.save(patch || {}));

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
