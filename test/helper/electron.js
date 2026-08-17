'use strict';

/* =================================================================
   Electron-Ersatz fuer die Tests.

   Die Module des Hauptprozesses holen sich beim Laden `electron`, um
   den Ort der Einstellungen zu erfahren. Ausserhalb der App gibt es das
   nicht - ohne Ersatz liesse sich keine einzige Zeile davon pruefen.

   Wir haengen uns deshalb in das Laden von Modulen und antworten auf
   `require('electron')` mit dem Noetigsten. Alles, was sonst neben den
   Einstellungen laege, landet in einem Wegwerf-Ordner, damit die Tests
   die echten Einstellungen des Benutzers nicht anfassen.

   Muss vor den zu pruefenden Modulen geladen werden.
   ================================================================= */

const Module = require('node:module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'crocgui-test-'));

const electron = {
  app: {
    isPackaged: false,
    getPath: (name) => {
      const dir = name === 'userData' ? userData : path.join(userData, name);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
    getAppPath: () => path.join(__dirname, '..', '..'),
    getVersion: () => '0.0.0-test',
    getName: () => 'CrocGUI'
  },
  // Nur so viel, dass ein Laden nicht scheitert.
  Notification: class { constructor() {} show() {} static isSupported() { return false; } },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }) },
  shell: { openExternal: async () => {} },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: class {}
};

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electron;
  return load.call(this, request, ...rest);
};

process.on('exit', () => {
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* egal */ }
});

module.exports = { electron, userData };
