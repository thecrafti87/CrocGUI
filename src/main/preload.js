'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('croc', {
  // Ein paar Hinweise und Knoepfe passen nur zu einem System.
  platform: process.platform,

  detect: (force) => ipcRenderer.invoke('croc:detect', force),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  setLang: (code) => ipcRenderer.invoke('lang:set', code),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  crocLatest: () => ipcRenderer.invoke('croc:latest'),

  listHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  onHistory: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('history:changed', handler);
    return () => ipcRenderer.removeListener('history:changed', handler);
  },

  onManifest: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('manifest:progress', handler);
    return () => ipcRenderer.removeListener('manifest:progress', handler);
  },
  onManifestResult: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('manifest:result', handler);
    return () => ipcRenderer.removeListener('manifest:result', handler);
  },

  addresses: () => ipcRenderer.invoke('net:addresses'),

  startMessages: () => ipcRenderer.invoke('msg:start'),
  stopMessages: () => ipcRenderer.invoke('msg:stop'),
  messageState: () => ipcRenderer.invoke('msg:state'),
  listMessages: (contactId) => ipcRenderer.invoke('msg:list', contactId),
  sendMessage: (contactId, text) => ipcRenderer.invoke('msg:send', { contactId, text }),
  clearMessages: (contactId) => ipcRenderer.invoke('msg:clear', contactId),
  onMessage: (fn) => {
    const handler = (_e, p) => fn(p);
    ipcRenderer.on('msg:event', handler);
    return () => ipcRenderer.removeListener('msg:event', handler);
  },

  canSelfUpdate: () => ipcRenderer.invoke('update:can'),
  fetchUpdate: () => ipcRenderer.invoke('update:fetch'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),
  updateCroc: () => ipcRenderer.invoke('croc:update'),
  useBundledCroc: () => ipcRenderer.invoke('croc:useBundled'),
  onUpdateProgress: (fn) => {
    const handler = (_e, p) => fn(p);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },

  revokeStore: (receipt) => ipcRenderer.invoke('store:revoke', receipt),

  runDiagnose: () => ipcRenderer.invoke('diag:run'),
  testNotification: () => ipcRenderer.invoke('diag:testNote'),
  openPane: (which) => ipcRenderer.invoke('system:pane', which),

  finderStatus: () => ipcRenderer.invoke('finder:status'),
  finderInstall: (label) => ipcRenderer.invoke('finder:install', label),
  finderRemove: () => ipcRenderer.invoke('finder:remove'),

  onFiles: (fn) => {
    const handler = (_e, paths) => fn(paths);
    ipcRenderer.on('files:add', handler);
    return () => ipcRenderer.removeListener('files:add', handler);
  },

  listContacts: () => ipcRenderer.invoke('contacts:list'),
  saveContact: (contact) => ipcRenderer.invoke('contacts:save', contact),
  removeContact: (id) => ipcRenderer.invoke('contacts:remove', id),
  generateCode: () => ipcRenderer.invoke('contacts:generate'),

  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  pickFolder: (current) => ipcRenderer.invoke('dialog:pickFolder', current),
  pickBinary: () => ipcRenderer.invoke('dialog:pickBinary'),
  statPaths: (paths) => ipcRenderer.invoke('fs:stat', paths),

  resolveResend: (names, roots) => ipcRenderer.invoke('resend:resolve', { names, roots }),

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
