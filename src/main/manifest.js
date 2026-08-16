'use strict';

/* =================================================================
   Pruefsummen.

   Der Sender legt eine Liste mit SHA-256 je Datei bei; der Empfaenger
   rechnet sie ueber das nach, was tatsaechlich auf seiner Platte liegt.
   Groesse und Zeitstempel taugen dafuer nicht: eine abgebrochene
   croc-Uebertragung hinterlaesst eine Datei in exakt richtiger Groesse
   mit Nullen darin.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const NAME = 'crocgui-manifest.json';
const TICK = 64 * 1024 * 1024; // so oft melden wir Fortschritt

/** Alle Dateien unter den ausgewaehlten Pfaden, mit Namen wie beim Empfaenger. */
function collect(paths) {
  const out = [];

  const walk = (abs, rel) => {
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(abs)) {
        walk(path.join(abs, entry), rel ? `${rel}/${entry}` : entry);
      }
    } else if (st.isFile()) {
      out.push({ abs, rel, size: st.size });
    }
  };

  for (const p of paths) walk(p, path.basename(p));
  return out;
}

function hashFile(file, onChunk) {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash('sha256');
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', (chunk) => { sum.update(chunk); onChunk(chunk.length); });
    stream.on('error', reject);
    stream.on('end', () => resolve(sum.digest('hex')));
  });
}

/**
 * Schreibt die Liste in einen eigenen Ordner und gibt deren Pfad zurueck.
 * `cleanup` raeumt ihn wieder weg, sobald die Uebertragung durch ist.
 */
async function build(paths, version, onProgress) {
  const files = collect(paths);
  const total = files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  let lastTick = 0;

  const entries = [];
  for (const f of files) {
    const sha256 = await hashFile(f.abs, (n) => {
      done += n;
      if (done - lastTick >= TICK) {
        lastTick = done;
        onProgress({ phase: 'build', done, total });
      }
    });
    entries.push({ name: f.rel, size: f.size, sha256 });
  }
  onProgress({ phase: 'build', done: total, total });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crocgui-manifest-'));
  const file = path.join(dir, NAME);
  fs.writeFileSync(file, JSON.stringify({
    tool: 'CrocGUI',
    version,
    created: new Date().toISOString(),
    files: entries
  }, null, 2), 'utf8');

  return {
    file,
    count: entries.length,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* egal */ } }
  };
}

/**
 * Sucht die Liste im Zielordner und rechnet nach. Ohne Liste gibt es
 * nichts zu pruefen - dann hat die Gegenstelle kein CrocGUI benutzt.
 */
async function verify(dir, onProgress) {
  const file = path.join(dir, NAME);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { found: false };
  }

  const list = Array.isArray(manifest.files) ? manifest.files : [];
  const total = list.reduce((n, f) => n + (f.size || 0), 0);
  let done = 0;
  let lastTick = 0;

  const missing = [];
  const broken = [];
  let good = 0;

  for (const entry of list) {
    const target = path.join(dir, entry.name);
    let st;
    try {
      st = fs.statSync(target);
    } catch {
      missing.push(entry.name);
      done += entry.size || 0;
      continue;
    }
    // Die Groesse allein sagt nichts - trotzdem sparen wir uns das
    // Rechnen, wenn schon sie nicht stimmt.
    if (st.size !== entry.size) {
      broken.push(entry.name);
      done += entry.size || 0;
      continue;
    }
    const sum = await hashFile(target, (n) => {
      done += n;
      if (done - lastTick >= TICK) {
        lastTick = done;
        onProgress({ phase: 'verify', done, total });
      }
    });
    if (sum === entry.sha256) good++;
    else broken.push(entry.name);
  }

  onProgress({ phase: 'verify', done: total, total });
  try { fs.unlinkSync(file); } catch { /* egal */ }

  return {
    found: true,
    total: list.length,
    good,
    broken,
    missing,
    ok: broken.length === 0 && missing.length === 0
  };
}

module.exports = { build, verify, collect, NAME };
