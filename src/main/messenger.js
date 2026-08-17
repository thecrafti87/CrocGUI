'use strict';

/* =================================================================
   Kurznachrichten an Kontakte.

   croc kennt kein Postfach. Wer wartet, besetzt den Raum und laesst
   die Sendung scheitern, auf die er wartet - nachgemessen. Fuer kurze
   Nachrichten geht es trotzdem, wenn beide Seiten es wiederholen:
   der Empfaenger horcht in kurzen Anlaeufen, der Sender versucht es
   mehrfach. Gemessen war die Nachricht nach zwei Fehlschlaegen und
   rund acht Sekunden da.

   Deshalb zwei Bedingungen:
   - Nur mit eigenem Relay. Dauerndes Anklopfen auf dem oeffentlichen
     Relay waere unfair.
   - Ein eigener Code je Kontakt, abgeleitet aus dessen Dateicode. So
     stoert das Horchen nie eine Dateiuebertragung, und beide Seiten
     kommen ohne zusaetzlichen Austausch auf denselben Wert.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app } = require('electron');

const settings = require('./settings');
const { detect } = require('./croc');

const HORCH_MS = 4000;   // wie lange ein Anlauf offen bleibt
const PAUSE_MS = 1500;   // Pause zwischen zwei Runden
const SENDEVERSUCHE = 6; // der Raum ist oft vom eigenen Horchen belegt
const LIMIT = 500;       // aufbewahrte Nachrichten je Kontakt

let running = false;
let timer = null;
let emit = () => {};

/**
 * Der Nachrichtencode eines Kontakts, abgeleitet aus seinem Dateicode.
 * Beide Seiten rechnen dasselbe aus, ohne etwas Zusaetzliches zu
 * tauschen. Wer den Dateicode kennt, kann damit auch mitlesen - das
 * ist dieselbe Vertrauensgrenze, kein zusaetzliches Risiko.
 */
function codeFor(contact) {
  const sum = crypto.createHash('sha256').update(String(contact.code)).digest('hex');
  return `msg-${sum.slice(0, 24)}`;
}

/* --------------------------- Ablage --------------------------- */

function file() {
  return path.join(app.getPath('userData'), 'messages.json');
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (typeof cache !== 'object' || !cache) cache = {};
  } catch {
    cache = {};
  }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Nachrichten nicht gesichert:', err.message);
  }
}

function add(contactId, entry) {
  load();
  if (!cache[contactId]) cache[contactId] = [];
  cache[contactId].push({ at: new Date().toISOString(), ...entry });
  if (cache[contactId].length > LIMIT) cache[contactId].splice(0, cache[contactId].length - LIMIT);
  write();
  return cache[contactId];
}

function forContact(contactId) {
  return load()[contactId] || [];
}

function clear(contactId) {
  load();
  if (contactId) delete cache[contactId];
  else cache = {};
  write();
  return true;
}

/* ------------------------- croc aufrufen ------------------------- */

function baseArgs(cfg) {
  const args = ['--ignore-stdin', '--disable-clipboard'];
  if (cfg.relay) args.push('--relay', cfg.relay);
  if (cfg.curve && cfg.curve !== 'p256') args.push('--curve', cfg.curve);
  return args;
}

/** Ein kurzer Horchversuch. Bringt entweder Text oder nichts. */
function listenOnce(bin, cfg, code) {
  return new Promise((resolve) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'crocmsg-'));
    const env = { ...process.env, CROC_SECRET: code };
    if (cfg.pass) env.CROC_PASS = cfg.pass;

    const child = spawn(bin, [...baseArgs(cfg), '--yes', '--out', out], {
      env, stdio: ['ignore', 'pipe', 'pipe']
    });

    let buf = '';
    const take = (c) => { buf += String(c); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);

    const stop = setTimeout(() => child.kill('SIGINT'), HORCH_MS);

    child.on('error', () => { clearTimeout(stop); resolve(null); });
    child.on('close', () => {
      clearTimeout(stop);
      fs.rmSync(out, { recursive: true, force: true });

      // eslint-disable-next-line no-control-regex
      const clean = buf.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
      const at = clean.indexOf('Receiving text message');
      if (at < 0) return resolve(null);

      const rest = clean.slice(at).split(/[\r\n]+/).slice(1)
        .map((l) => l.trimEnd())
        .filter((l) => l.trim() && !/^(connecting|securing|Receiving \(|Sending \()/.test(l));
      resolve(rest.length ? rest.join('\n') : null);
    });
  });
}

/** Ein Sendeversuch. Der Raum ist oft belegt, deshalb mehrfach. */
function sendOnce(bin, cfg, code, text) {
  return new Promise((resolve) => {
    const env = { ...process.env, CROC_SECRET: code };
    if (cfg.pass) env.CROC_PASS = cfg.pass;

    const child = spawn(bin, [...baseArgs(cfg), '--yes', 'send', '--text', text], {
      env, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.resume();
    child.stderr.resume();

    const stop = setTimeout(() => child.kill('SIGINT'), 20000);
    child.on('error', () => { clearTimeout(stop); resolve(false); });
    child.on('close', (code2) => { clearTimeout(stop); resolve(code2 === 0); });
  });
}

/* ------------------------- Horchschleife ------------------------- */

async function round() {
  if (!running) return;
  const cfg = settings.load();
  const bin = await detect();
  const contacts = cfg.contacts || [];

  if (!bin.ok || !cfg.relay || !contacts.length) {
    if (running) timer = setTimeout(round, PAUSE_MS * 4);
    return;
  }

  // Jeder Kontakt hat seinen eigenen Raum, das stoert sich nicht.
  await Promise.all(contacts.map(async (c) => {
    const text = await listenOnce(bin.path, cfg, codeFor(c));
    if (!text || !running) return;
    add(c.id, { dir: 'in', text });
    emit('in', { contactId: c.id, name: c.name, text });
  }));

  if (running) timer = setTimeout(round, PAUSE_MS);
}

function start(onEvent) {
  if (onEvent) emit = onEvent;
  if (running) return { ok: true };
  const cfg = settings.load();
  if (!cfg.relay) return { ok: false, reason: 'no-relay' };
  running = true;
  round();
  emit('state', { running: true });
  return { ok: true };
}

function stop() {
  running = false;
  clearTimeout(timer);
  emit('state', { running: false });
  return { ok: true };
}

const isRunning = () => running;

/** Schickt eine Nachricht und haelt sie im Verlauf fest. */
async function send(contactId, text) {
  const cfg = settings.load();
  if (!cfg.relay) return { ok: false, reason: 'no-relay' };

  const contact = (cfg.contacts || []).find((c) => c.id === contactId);
  if (!contact) return { ok: false, reason: 'gone' };

  const bin = await detect();
  if (!bin.ok) return { ok: false, reason: 'no-croc' };

  const code = codeFor(contact);
  for (let i = 1; i <= SENDEVERSUCHE; i++) {
    emit('sending', { contactId, attempt: i, of: SENDEVERSUCHE });
    // eslint-disable-next-line no-await-in-loop
    if (await sendOnce(bin.path, cfg, code, text)) {
      add(contactId, { dir: 'out', text });
      return { ok: true, attempts: i };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1800));
  }
  return { ok: false, reason: 'unreachable' };
}

module.exports = { start, stop, isRunning, send, forContact, clear, codeFor };
