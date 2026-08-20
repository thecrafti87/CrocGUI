'use strict';

/* =================================================================
   Selbsttest.

   Prueft nur, was sich wirklich pruefen laesst: ein Schreibversuch im
   Zielordner, eine echte Verbindung zum Relay, der freie Platz. Wo
   macOS keine Auskunft gibt - naemlich bei der Erlaubnis fuer
   Mitteilungen - sagen wir das, statt etwas zu behaupten.
   ================================================================= */

const fs = require('fs');
const net = require('net');
const path = require('path');

const { detect } = require('./croc');
const settings = require('./settings');
const quickaction = require('./quickaction');

// Der Standard-Relay von croc, wenn in den Einstellungen nichts steht.
const DEFAULT_RELAY = '142.132.189.179:9009';

function human(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Legt eine winzige Datei an und raeumt sie wieder weg. */
function checkWritable(dir) {
  const probe = path.join(dir, `.crocgui-probe-${process.pid}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return { ok: true, path: dir };
  } catch (err) {
    return { ok: false, path: dir, code: err.code || null, message: err.message };
  }
}

function checkSpace(dir) {
  try {
    if (typeof fs.statfsSync !== 'function') return { ok: true, unknown: true };
    const st = fs.statfsSync(dir);
    const free = st.bavail * st.bsize;
    return { ok: free > 200 * 1024 * 1024, free, freeText: human(free) };
  } catch {
    return { ok: true, unknown: true };
  }
}

/** Baut wirklich eine Verbindung auf, statt nur zu raten. */
function checkRelay(target) {
  return new Promise((resolve) => {
    const [host, portRaw] = String(target).split(':');
    const port = Number(portRaw || 9009);
    if (!host || !Number.isFinite(port)) {
      return resolve({ ok: false, target, message: 'Adresse unlesbar' });
    }

    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ target, ...result });
    };

    socket.setTimeout(5000);
    socket.on('connect', () => finish({ ok: true, ms: Date.now() - started }));
    socket.on('timeout', () => finish({ ok: false, message: 'Zeitüberschreitung' }));
    socket.on('error', (err) => finish({ ok: false, message: err.code || err.message }));
  });
}

async function run() {
  const cfg = settings.load();
  const outDir = settings.defaultOutDir();
  const relayTarget = cfg.relay || DEFAULT_RELAY;

  const [croc, relay] = await Promise.all([detect(true), checkRelay(relayTarget)]);

  return {
    croc: {
      ok: croc.ok,
      version: croc.version,
      path: croc.path,
      bundled: Boolean(croc.bundled)
    },
    outDir: checkWritable(outDir),
    space: { ...checkSpace(outDir), path: outDir },
    relay: { ...relay, custom: Boolean(cfg.relay) },
    finder: { supported: quickaction.supported(), ok: quickaction.isInstalled() }
  };
}

module.exports = { run, DEFAULT_RELAY };
