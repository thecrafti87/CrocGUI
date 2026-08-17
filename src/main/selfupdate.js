'use strict';

/* =================================================================
   Selbstaktualisierung ohne Apple-Developer-ID.

   electron-updater scheidet aus: dessen Weg ueber Squirrel prueft die
   Signatur und verweigert bei einer unsignierten App. Der Tausch von
   Hand geht trotzdem - und hat einen angenehmen Nebeneffekt: was die
   App selbst herunterlaedt, bekommt kein Quarantaene-Merkmal. Die neue
   Fassung startet also ohne die Gatekeeper-Meldung.

   Was hier NICHT passiert: eine kryptografische Pruefung der Herkunft.
   Ohne Signatur stuetzt sich das Vertrauen auf HTTPS und GitHub -
   dasselbe wie beim Herunterladen von Hand, nicht mehr und nicht
   weniger. Geprueft werden Groesse und Fassungsnummer im Paket.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFile, execFileSync, spawn } = require('child_process');
const { app } = require('electron');

const REPO = 'thecrafti87/CrocGUI';

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

/** Laedt eine Datei und meldet dabei den Fortschritt. */
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
      let lastTick = 0;
      const out = fs.createWriteStream(target);
      res.on('data', (chunk) => {
        done += chunk.length;
        if (done - lastTick > 512 * 1024) { lastTick = done; onProgress({ done, total }); }
      });
      res.pipe(out);
      out.on('finish', () => { onProgress({ done, total }); out.close(() => resolve({ bytes: done })); });
      out.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Zeitüberschreitung')); });
  });
}

/** Das eigene App-Paket: .../CrocGUI.app */
function bundlePath() {
  // exe liegt in CrocGUI.app/Contents/MacOS/CrocGUI
  return path.resolve(path.dirname(app.getPath('exe')), '..', '..');
}

function versionOfBundle(bundle) {
  try {
    return execFileSync('/usr/bin/plutil',
      ['-extract', 'CFBundleShortVersionString', 'raw', path.join(bundle, 'Contents', 'Info.plist')],
      { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Kann die App sich selbst ersetzen, oder fehlen die Rechte? */
function canReplace() {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  const bundle = bundlePath();
  if (!bundle.endsWith('.app')) return { ok: false, reason: 'no-bundle' };
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
    return { ok: true, bundle };
  } catch {
    return { ok: false, reason: 'read-only', bundle };
  }
}

/** Das zur Architektur passende DMG aus der neuesten Veroeffentlichung. */
async function findAsset() {
  const release = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!release || !release.tag_name) throw new Error('keine Veröffentlichung gefunden');
  const version = String(release.tag_name).replace(/^v/, '');
  const want = process.arch === 'arm64' ? '-arm64.dmg' : '-x64.dmg';
  const asset = (release.assets || []).find((a) => a.name.endsWith(want));
  if (!asset) throw new Error(`kein Paket für ${process.arch}`);
  return { version, name: asset.name, url: asset.browser_download_url, size: asset.size };
}

/**
 * Laedt die neue Fassung, packt sie aus und prueft sie. Der Tausch
 * selbst passiert erst danach, in einem eigenen Skript.
 */
async function prepare(onProgress) {
  const place = canReplace();
  if (!place.ok) return { ok: false, reason: place.reason };

  const asset = await findAsset();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crocgui-update-'));
  const dmg = path.join(work, asset.name);

  onProgress({ phase: 'download', done: 0, total: asset.size });
  const { bytes } = await download(asset.url, dmg, (p) => onProgress({ phase: 'download', ...p }));

  if (asset.size && bytes !== asset.size) {
    fs.rmSync(work, { recursive: true, force: true });
    return { ok: false, reason: 'size', expected: asset.size, got: bytes };
  }

  onProgress({ phase: 'unpack' });
  const mount = path.join(work, 'mnt');
  fs.mkdirSync(mount);
  execFileSync('/usr/bin/hdiutil',
    ['attach', dmg, '-nobrowse', '-quiet', '-readonly', '-mountpoint', mount], { timeout: 60000 });

  let staged = null;
  try {
    const inside = fs.readdirSync(mount).find((n) => n.endsWith('.app'));
    if (!inside) throw new Error('kein Programm im Abbild');
    staged = path.join(work, inside);
    execFileSync('/usr/bin/ditto', [path.join(mount, inside), staged], { timeout: 120000 });
  } finally {
    try { execFileSync('/usr/bin/hdiutil', ['detach', mount, '-quiet'], { timeout: 30000 }); } catch { /* egal */ }
  }

  const got = versionOfBundle(staged);
  if (got !== asset.version) {
    fs.rmSync(work, { recursive: true, force: true });
    return { ok: false, reason: 'version', expected: asset.version, got };
  }

  return { ok: true, version: asset.version, staged, work, bundle: place.bundle };
}

/**
 * Ersetzt das Paket und startet neu. Das alte wird erst beiseite
 * geschoben und nur bei Erfolg geloescht - schlaegt das Kopieren fehl,
 * kommt es zurueck, statt dass gar keine App mehr dasteht.
 */
function install(prepared) {
  const { staged, work, bundle } = prepared;
  const script = path.join(work, 'tausch.sh');
  const backup = `${bundle}.alt`;

  fs.writeFileSync(script, `#!/bin/sh
PID=${process.pid}
while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done
sleep 0.5
rm -rf ${JSON.stringify(backup)}
mv ${JSON.stringify(bundle)} ${JSON.stringify(backup)} || exit 1
if /usr/bin/ditto ${JSON.stringify(staged)} ${JSON.stringify(bundle)}; then
  rm -rf ${JSON.stringify(backup)}
else
  rm -rf ${JSON.stringify(bundle)}
  mv ${JSON.stringify(backup)} ${JSON.stringify(bundle)}
fi
/usr/bin/open ${JSON.stringify(bundle)}
rm -rf ${JSON.stringify(work)}
`, { mode: 0o755 });

  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
  return { ok: true };
}

module.exports = { prepare, install, canReplace, bundlePath, findAsset };
