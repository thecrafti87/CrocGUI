'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  lang: 'en',
  autoUpdate: true,
  notify: true,
  tray: true,
  checksums: true,
  // Sendungen nacheinander abarbeiten statt gleichzeitig. Parallele
  // teilen sich dieselbe Leitung und werden dadurch alle langsamer.
  queue: true,
  // Leer bedeutet jeweils: croc entscheidet selbst / Standardwert von croc.
  crocPath: '',
  relay: '',
  relay6: '',
  pass: '',
  curve: 'p256',
  outDir: '',
  socks5: '',
  throttleUpload: '',
  hash: 'xxhash',
  overwrite: false,
  noCompress: false,
  internalDns: false,
  relayPorts: '9009,9010,9011,9012,9013',
  // [{ id, name, code, note, outDir }] - feste Codes je Gegenstelle
  contacts: []
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    stored = {};
  }
  cache = { ...DEFAULTS, ...stored };
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Einstellungen konnten nicht gespeichert werden:', err.message);
  }
  return cache;
}

/** Zielordner fuer Downloads - Einstellung, sonst der Downloads-Ordner des Systems. */
function defaultOutDir() {
  const configured = load().outDir;
  if (configured && fs.existsSync(configured)) return configured;
  try {
    return app.getPath('downloads');
  } catch {
    return os.homedir();
  }
}

module.exports = { DEFAULTS, load, save, defaultOutDir, file };
