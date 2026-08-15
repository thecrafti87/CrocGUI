'use strict';

/* =================================================================
   Verlauf der Uebertragungen.

   Liegt als eigene Datei neben den Einstellungen, damit die nicht mit
   der Zeit aufquellen. Codes werden bewusst NICHT gespeichert: bei
   Einmalcodes waeren sie wertlos, bei festen Codes waere es ein
   Dauerpasswort im Klartext auf der Platte.
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LIMIT = 200;

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'history.json');
}

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Verlauf konnte nicht gesichert werden:', err.message);
  }
}

/** Neuen Eintrag vorne einfuegen; aeltere fallen hinten heraus. */
function add(entry) {
  load();
  cache.unshift({
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    at: new Date().toISOString(),
    ...entry
  });
  if (cache.length > LIMIT) cache.length = LIMIT;
  write();
  return cache;
}

function clear() {
  cache = [];
  write();
  return cache;
}

/** Pfade, die es nicht mehr gibt, sind fuer "erneut senden" wertlos. */
function withExistence(list) {
  return list.map((e) => {
    if (e.kind !== 'send' || !Array.isArray(e.paths) || !e.paths.length) return e;
    return { ...e, pathsExist: e.paths.every((p) => fs.existsSync(p)) };
  });
}

module.exports = { load, add, clear, withExistence, file, LIMIT };
