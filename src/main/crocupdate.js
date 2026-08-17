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

// Die Bezeichnung der Anhaenge in den croc-Veroeffentlichungen.
const ASSET = { arm64: 'macOS-ARM64', x64: 'macOS-64bit' };

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
    const file = path.join(store(), 'croc');
    fs.accessSync(file, fs.constants.X_OK);
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
  const asset = ASSET[process.arch];
  if (!asset) return { ok: false, message: `keine croc-Fassung für ${process.arch}` };

  const release = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!version) return { ok: false, message: 'keine Veröffentlichung gefunden' };

  const name = `croc_v${version}_${asset}.tar.gz`;
  const found = (release.assets || []).find((a) => a.name === name);
  if (!found) return { ok: false, message: `${name} nicht in der Veröffentlichung` };

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crocbin-'));
  try {
    const tar = path.join(work, name);
    onProgress({ phase: 'download', done: 0, total: found.size });
    await download(found.browser_download_url, tar, (p) => onProgress({ phase: 'download', ...p }));

    onProgress({ phase: 'unpack' });
    execFileSync('/usr/bin/tar', ['-xzf', tar, '-C', work, 'croc'], { timeout: 60000 });

    const fresh = path.join(work, 'croc');
    fs.chmodSync(fresh, 0o755);

    // Erst fragen, dann uebernehmen - ein Programm, das nicht antwortet,
    // wollen wir nicht als das bevorzugte eintragen.
    const reported = await versionOf(fresh);
    if (!reported) return { ok: false, message: 'das geladene Programm antwortet nicht' };

    fs.mkdirSync(store(), { recursive: true });
    const target = path.join(store(), 'croc');
    fs.rmSync(target, { force: true });
    fs.copyFileSync(fresh, target);
    fs.chmodSync(target, 0o755);
    fs.writeFileSync(path.join(store(), 'VERSION'), `${reported}\n`, 'utf8');

    return { ok: true, version: reported, path: target };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { install, managed, remove, store };
