'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const settings = require('./settings');

/* ------------------------------------------------------------------ *
 * croc-Binary finden
 * ------------------------------------------------------------------ */

const CANDIDATES = [
  '/opt/homebrew/bin/croc',
  '/usr/local/bin/croc',
  '/usr/bin/croc',
  path.join(os.homedir(), 'go', 'bin', 'croc'),
  path.join(os.homedir(), '.local', 'bin', 'croc')
];

let resolved = null;

/**
 * Das mit der App ausgelieferte croc. In der gebauten App liegt es neben
 * den uebrigen Ressourcen, in der Entwicklung unter vendor/.
 */
function bundledPath() {
  try {
    const { app } = require('electron');
    return app.isPackaged
      ? path.join(process.resourcesPath, 'croc')
      : path.join(app.getAppPath(), 'vendor', `darwin-${process.arch}`, 'croc');
  } catch {
    return null;
  }
}

function versionOf(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const m = String(stdout).match(/([\d]+\.[\d]+\.[\d]+)/);
      resolve(m ? m[1] : String(stdout).trim());
    });
  });
}

/**
 * Sucht das croc-Binary in dieser Reihenfolge: der in den Einstellungen
 * eingetragene Pfad, das mitgelieferte croc, dann PATH und die ueblichen
 * Installationsorte. Das mitgelieferte kommt vor dem des Systems, damit
 * die Fassung vorhersagbar bleibt - wer ein eigenes will, traegt es ein.
 * Ergebnis wird gecacht, `force` erzwingt eine neue Suche.
 */
async function detect(force = false) {
  if (resolved && !force) return resolved;

  const tried = [];
  const configured = settings.load().crocPath;
  if (configured) tried.push(configured);

  const bundled = bundledPath();
  if (bundled) tried.push(bundled);

  // PATH durchsuchen - GUI-Apps auf macOS erben oft nur ein mageres PATH,
  // deshalb ergaenzen wir die ueblichen Installationsorte.
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) tried.push(path.join(dir, 'croc'));
  tried.push(...CANDIDATES);

  const seen = new Set();
  for (const bin of tried) {
    if (seen.has(bin)) continue;
    seen.add(bin);
    try {
      fs.accessSync(bin, fs.constants.X_OK);
    } catch {
      continue;
    }
    const version = await versionOf(bin);
    if (version) {
      resolved = { ok: true, path: bin, version, bundled: bin === bundled };
      return resolved;
    }
  }

  resolved = { ok: false, path: null, version: null, bundled: false };
  return resolved;
}

/* ------------------------------------------------------------------ *
 * Ausgabe von croc auswerten
 * ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function clean(chunk) {
  return String(chunk).replace(ANSI, '');
}

/**
 * croc schreibt den Fortschritt mit Wagenruecklauf in eine einzige Zeile.
 * Wir zerlegen den Datenstrom daher an \r und \n und behandeln jedes
 * Segment als eigenstaendige Statuszeile.
 */
function segments(text) {
  return text
    .split(/[\r\n]+/)
    .map((s) => s.trimEnd())
    .filter((s) => s.trim().length > 0);
}

const RE_CODE = /Code is:\s*(\S+)/;
const RE_SEND_ONE = /Sending '(.+?)'\s*\(([^)]+)\)/;
const RE_SEND_MANY = /Sending (\d+) files?\s*\(([^)]+)\)/;
const RE_RECV_ONE = /(?:Receiving|Accept(?:ing)?)\s+'(.+?)'\s*\(([^)]+)\)/;
const RE_PEER = /(?:Sending|Receiving)\s*\((?:->|<-)\s*([^)]+)\)/;
const RE_PERCENT = /(\d{1,3})%/;
const RE_DETAIL = /\(([^()]*?[\d.]+\s*\/\s*[\d.]+[^()]*)\)/;
const RE_ETA = /\[([^\]]+)\]/;
const RE_ERROR = /^\s*(?:error|Error|panic):?\s*(.+)$/;

/**
 * Wandelt eine Statuszeile in ein Ereignis um, oder gibt null zurueck,
 * wenn die Zeile nichts Auswertbares enthaelt.
 */
function parseLine(line) {
  const code = line.match(RE_CODE);
  if (code) return { type: 'code', code: code[1] };

  const one = line.match(RE_SEND_ONE) || line.match(RE_RECV_ONE);
  if (one) return { type: 'meta', label: one[1], size: one[2] };

  const many = line.match(RE_SEND_MANY);
  if (many) {
    const n = Number(many[1]);
    if (n > 0) return { type: 'meta', label: `${n} Dateien`, size: many[2] };
  }

  const peer = line.match(RE_PEER);
  if (peer) return { type: 'peer', peer: peer[1].trim() };

  const pct = line.match(RE_PERCENT);
  if (pct && /[|█▓▒░#-]/.test(line)) {
    // croc prueft die Datei nach der Uebertragung noch einmal und zeigt
    // dafuer einen zweiten Balken. Der darf den Fortschritt nicht
    // zuruecksetzen.
    if (/^\s*Hashing\b/.test(line)) {
      return { type: 'verify', percent: Math.min(100, Number(pct[1])) };
    }
    const detail = line.match(RE_DETAIL);
    const eta = line.match(RE_ETA);
    const parts = detail ? detail[1].split(',').map((s) => s.trim()) : [];
    return {
      type: 'progress',
      percent: Math.min(100, Number(pct[1])),
      bytes: parts[0] || '',
      speed: parts.find((p) => /\/s$/.test(p)) || '',
      eta: eta ? eta[1] : ''
    };
  }

  const err = line.match(RE_ERROR);
  if (err) return { type: 'failure', message: err[1] };

  return null;
}

/* ------------------------------------------------------------------ *
 * Kommandozeilen bauen
 * ------------------------------------------------------------------ */

/** Globale Flags, die vor dem Unterbefehl stehen muessen. */
function globalArgs(cfg) {
  const args = ['--ignore-stdin', '--disable-clipboard'];
  if (cfg.relay) args.push('--relay', cfg.relay);
  if (cfg.relay6) args.push('--relay6', cfg.relay6);
  if (cfg.pass) args.push('--pass', cfg.pass);
  if (cfg.curve && cfg.curve !== 'p256') args.push('--curve', cfg.curve);
  if (cfg.socks5) args.push('--socks5', cfg.socks5);
  if (cfg.throttleUpload) args.push('--throttleUpload', cfg.throttleUpload);
  if (cfg.noCompress) args.push('--no-compress');
  if (cfg.internalDns) args.push('--internal-dns');
  return args;
}

function buildSend(opts, cfg) {
  const args = [...globalArgs(cfg), 'send'];

  if (opts.zip) args.push('--zip');
  if (opts.git) args.push('--git');
  if (opts.qr) args.push('--qr');
  if (opts.noLocal) args.push('--no-local');
  if (cfg.hash && cfg.hash !== 'xxhash') args.push('--hash', cfg.hash);
  if (opts.exclude) args.push('--exclude', opts.exclude);
  if (opts.excludeFile) args.push('--exclude-file', opts.excludeFile);

  if (opts.store) {
    args.push('--store');
    if (opts.storeDownloads) args.push('--store-downloads', String(opts.storeDownloads));
    if (opts.storeExpiration) args.push('--store-expiration', opts.storeExpiration);
  }

  if (opts.mode === 'text') {
    args.push('--text', opts.text);
  } else {
    args.push(...opts.paths);
  }
  return args;
}

function buildReceive(opts, cfg) {
  const args = [...globalArgs(cfg), '--yes'];
  if (opts.overwrite) args.push('--overwrite');
  else if (opts.rename) args.push('--rename');
  if (opts.outDir) args.push('--out', opts.outDir);
  // Der Code wandert ueber CROC_SECRET in die Umgebung und taucht damit
  // nicht in der Prozessliste auf.
  return args;
}

function buildRelay(opts, cfg) {
  const args = ['relay'];
  const ports = (opts.ports || cfg.relayPorts || '').trim();
  if (ports) args.push('--ports', ports);
  if (opts.host) args.push('--host', opts.host);
  return args;
}

/* ------------------------------------------------------------------ *
 * Laufende Vorgaenge verwalten
 * ------------------------------------------------------------------ */

class Runner {
  constructor(emit) {
    this.emit = emit; // (id, event) => void
    this.jobs = new Map();
    this.nextId = 1;
  }

  get relayJob() {
    for (const [id, job] of this.jobs) if (job.kind === 'relay') return { id, job };
    return null;
  }

  async start(kind, opts = {}) {
    const bin = await detect();
    if (!bin.ok) {
      const err = new Error(
        'croc wurde nicht gefunden. Installiere es mit "brew install croc" oder trage den Pfad in den Einstellungen ein.'
      );
      err.code = 'NO_CROC';
      throw err;
    }

    const cfg = settings.load();
    let args;
    const env = { ...process.env };

    if (kind === 'send') {
      args = buildSend(opts, cfg);
      if (opts.code) env.CROC_SECRET = opts.code;
    } else if (kind === 'receive') {
      args = buildReceive(opts, cfg);
      env.CROC_SECRET = opts.code;
    } else if (kind === 'relay') {
      args = buildRelay(opts, cfg);
      if (cfg.pass) env.CROC_PASS = cfg.pass;
    } else {
      throw new Error(`Unbekannte Betriebsart: ${kind}`);
    }

    const id = String(this.nextId++);
    const child = spawn(bin.path, args, {
      env,
      // stdin bewusst schliessen - sonst haelt croc die Eingabe fuer
      // gepipte Daten und wuerde diese statt der Dateien senden.
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd || os.homedir()
    });

    const job = {
      kind,
      child,
      opts,
      code: opts.code || null,
      lastLines: [],
      cancelled: false,
      finished: false
    };
    this.jobs.set(id, job);

    const consume = (chunk) => {
      const text = clean(chunk);
      for (const line of segments(text)) {
        job.lastLines.push(line);
        if (job.lastLines.length > 40) job.lastLines.shift();

        this.emit(id, { type: 'log', line });
        const evt = parseLine(line);
        if (!evt) continue;
        if (evt.type === 'code') job.code = evt.code;
        this.emit(id, evt);
      }
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);

    child.on('error', (err) => {
      job.finished = true;
      this.jobs.delete(id);
      this.emit(id, { type: 'failure', message: err.message });
      this.emit(id, { type: 'done', ok: false });
    });

    child.on('close', (codeNum, signal) => {
      job.finished = true;
      this.jobs.delete(id);
      if (job.cancelled) {
        this.emit(id, { type: 'done', ok: false, cancelled: true });
        return;
      }
      const ok = codeNum === 0 && !signal;
      if (!ok) {
        const hint = job.lastLines.filter((l) => !/%/.test(l)).slice(-3).join(' ');
        this.emit(id, {
          type: 'failure',
          message: hint || `croc endete mit Code ${codeNum ?? signal}`
        });
      }
      this.emit(id, { type: 'done', ok });
    });

    this.emit(id, { type: 'started', kind, command: `croc ${args.join(' ')}` });
    return { id, kind, code: job.code };
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.cancelled = true;
    // SIGINT gibt croc die Chance, Verbindungen sauber zu schliessen.
    job.child.kill('SIGINT');
    setTimeout(() => {
      if (!job.finished) job.child.kill('SIGKILL');
    }, 1500);
    return true;
  }

  cancelAll() {
    for (const id of [...this.jobs.keys()]) this.cancel(id);
  }
}

module.exports = { detect, Runner, parseLine, segments, clean };
