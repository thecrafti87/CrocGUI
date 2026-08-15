'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('croc', {
  detect: (force) => ipcRenderer.invoke('croc:detect', force),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  setLang: (code) => ipcRenderer.invoke('lang:set', code),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  crocLatest: () => ipcRenderer.invoke('croc:latest'),

  listContacts: () => ipcRenderer.invoke('contacts:list'),
  saveContact: (contact) => ipcRenderer.invoke('contacts:save', contact),
  removeContact: (id) => ipcRenderer.invoke('contacts:remove', id),
  generateCode: () => ipcRenderer.invoke('contacts:generate'),

  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  pickFolder: (current) => ipcRenderer.invoke('dialog:pickFolder', current),
  pickBinary: () => ipcRenderer.invoke('dialog:pickBinary'),
  statPaths: (paths) => ipcRenderer.invoke('fs:stat', paths),

  start: (kind, opts) => ipcRenderer.invoke('transfer:start', { kind, opts }),
  cancel: (id) => ipcRenderer.invoke('transfer:cancel', id),

  qr: (text) => ipcRenderer.invoke('qr:make', text),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  reveal: (target) => ipcRenderer.invoke('shell:reveal', target),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),

  // Seit Electron 32 liefert File.path nichts mehr - der echte Pfad einer
  // per Drag & Drop abgelegten Datei kommt nur noch hierueber.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  onEvent: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('transfer:event', handler);
    return () => ipcRenderer.removeListener('transfer:event', handler);
  },

  onMenu: (fn) => {
    const handler = (_e, action) => fn(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  }
});
