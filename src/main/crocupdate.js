'use strict';

/* =================================================================
   croc aus der App heraus aktualisieren.

   Mitgeliefert wird eine feste croc-Fassung; sie waechst nur mit einer
   neuen CrocGUI-Fassung mit. Wer nicht so lange warten will, holt sich
   das neueste croc hier - es landet neben den Einstellungen und wird
   von da an bevorzugt benutzt, ohne das mitgelieferte anzuruehren.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile, execFileSync } = require('child_process');
const { app } = require('electron');

const REPO = 'schollz/croc';

// Die Bezeichnung der Anhaenge in den croc-Veroeffentlichungen, je
// System und Architektur - und in welcher Verpackung sie stecken.
const ASSET = {
  darwin: { arm64: ['macOS-ARM64', 'tar.gz'], x64: ['macOS-64bit', 'tar.gz'] },
  win32: { x64: ['Windows-64bit', 'zip'], arm64: ['Windows-ARM64', 'zip'] },
  linux: { x64: ['Linux-64bit', 'tar.gz'], arm64: ['Linux-ARM64', 'tar.gz'] }
};

// Wie das Programm auf diesem System heisst.
const EXE = process.platform === 'win32' ? 'croc.exe' : 'croc';

/**
 * Packt ein Archiv aus. Aufgerufen wird immer aus dem Zielordner heraus
 * und nur mit dem Dateinamen - tar auf Windows haelt "C:\..." sonst
 * fuer einen entfernten Rechner.
 */
function unpack(archive, into, ext) {
  const file = path.basename(archive);
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: into, timeout: 60000, stdio: 'pipe' });

  if (ext === 'tar.gz') {
    run('tar', ['-xzf', file]);
    return;
  }

  const attempts = [
    () => run('tar', ['-xf', file]),
    () => run('unzip', ['-o', '-q', file])
  ];
  if (process.platform === 'win32') {
    attempts.push(() => run('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${file}' -DestinationPath '.' -Force`
    ]));
  }

  let last = null;
  for (const attempt of attempts) {
    try { return attempt(); } catch (err) { last = err; }
  }
  throw new Error(`konnte ${file} nicht auspacken: ${last && last.message}`);
}

/** Sucht das Programm im ausgepackten Archiv - es liegt nicht immer flach. */
function findBinary(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findBinary(full);
      if (hit) return hit;
    } else if (entry.name === EXE) {
      return full;
    }
  }
  return null;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'CrocGUI', Accept: 'application/vnd.github+json' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Zeitüberschreitung')); });
  });
}

function download(url, target, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('zu viele Weiterleitungen'));
    https.get(url, { headers: { 'User-Agent': 'CrocGUI' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, target, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = Number(res.headers['content-length'] || 0);
      let done = 0;
      const out = fs.createWriteStream(target);
      res.on('data', (c) => { done += c.length; onProgress({ done, total }); });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(done)));
      out.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Zeitüberschreitung')); });
  });
}

/** Wohin selbst geholte croc-Fassungen kommen. */
function store() {
  return path.join(app.getPath('userData'), 'croc');
}

/** Der Pfad einer selbst geholten Fassung, falls vorhanden und lauffaehig. */
function managed() {
  try {
    const file = path.join(store(), EXE);
    // Windows kennt kein Ausfuehrungsrecht - dort zaehlt, dass sie da ist.
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return file;
  } catch {
    return null;
  }
}

function remove() {
  try {
    fs.rmSync(store(), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function versionOf(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const m = String(stdout).match(/([\d]+\.[\d]+\.[\d]+)/);
      resolve(m ? m[1] : null);
    });
  });
}

/**
 * Holt die neueste croc-Fassung und legt sie ab. Erst wenn das neue
 * Programm auf Nachfrage seine Fassung nennt, wird es uebernommen.
 */
async function install(onProgress) {
  const entry = (ASSET[process.platform] || {})[process.arch];
  if (!entry) {
    return { ok: false, message: `keine croc-Fassung für ${process.platform}/${process.arch}` };
  }
  const [asset, ext] = entry;

  const release = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!version) return { ok: false, message: 'keine Veröffentlichung gefunden' };

  const name = `croc_v${version}_${asset}.${ext}`;
  const found = (release.assets || []).find((a) => a.name === name);
  if (!found) return { ok: false, message: `${name} nicht in der Veröffentlichung` };

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crocbin-'));
  try {
    const archive = path.join(work, name);
    onProgress({ phase: 'download', done: 0, total: found.size });
    await download(found.browser_download_url, archive, (p) => onProgress({ phase: 'download', ...p }));

    onProgress({ phase: 'unpack' });
    unpack(archive, work, ext);

    const fresh = findBinary(work);
    if (!fresh) return { ok: false, message: `${EXE} steckt nicht in ${name}` };
    if (process.platform !== 'win32') fs.chmodSync(fresh, 0o755);

    // Erst fragen, dann uebernehmen - ein Programm, das nicht antwortet,
    // wollen wir nicht als das bevorzugte eintragen.
    const reported = await versionOf(fresh);
    if (!reported) return { ok: false, message: 'das geladene Programm antwortet nicht' };

    fs.mkdirSync(store(), { recursive: true });
    const target = path.join(store(), EXE);
    fs.rmSync(target, { force: true });
    fs.copyFileSync(fresh, target);
    if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
    fs.writeFileSync(path.join(store(), 'VERSION'), `${reported}\n`, 'utf8');

    return { ok: true, version: reported, path: target };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { install, managed, remove, store };
