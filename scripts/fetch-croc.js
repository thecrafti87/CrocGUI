#!/usr/bin/env node
'use strict';

/* =================================================================
   Holt die croc-Binaries und legt sie unter vendor/ ab, damit
   electron-builder sie in die App packen kann.

     node scripts/fetch-croc.js                 fuer das laufende
                                                System, in der in
                                                package.json
                                                eingetragenen Fassung
     node scripts/fetch-croc.js --latest        die neueste, und
                                                traegt sie ein
     node scripts/fetch-croc.js --platform win32
     node scripts/fetch-croc.js --platform darwin,linux
     node scripts/fetch-croc.js --all           alle drei Systeme

   Je System werden beide Architekturen geholt (x64 und arm64), damit
   electron-builder ohne weitere Vorbereitung bauen kann.

   Die Binaries gehoeren nicht ins Repository - vendor/ ist in der
   .gitignore.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const PKG = path.join(ROOT, 'package.json');

// Bezeichnung der Anhaenge in den croc-Releases je System und Architektur.
const TARGETS = {
  darwin: [
    { arch: 'arm64', asset: 'macOS-ARM64', ext: 'tar.gz' },
    { arch: 'x64', asset: 'macOS-64bit', ext: 'tar.gz' }
  ],
  win32: [
    { arch: 'x64', asset: 'Windows-64bit', ext: 'zip' },
    { arch: 'arm64', asset: 'Windows-ARM64', ext: 'zip' }
  ],
  linux: [
    { arch: 'x64', asset: 'Linux-64bit', ext: 'tar.gz' },
    { arch: 'arm64', asset: 'Linux-ARM64', ext: 'tar.gz' }
  ]
};

function binName(platform) {
  return platform === 'win32' ? 'croc.exe' : 'croc';
}

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('zu viele Weiterleitungen'));
    https.get(url, {
      headers: { 'User-Agent': 'CrocGUI-build', Accept: '*/*' },
      timeout: 60000
    }, (res) => {
      // Anhaenge auf GitHub liegen hinter einer Weiterleitung.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} bei ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Zeitueberschreitung')); });
  });
}

async function latestVersion() {
  const body = await get('https://api.github.com/repos/schollz/croc/releases/latest');
  const tag = JSON.parse(body.toString('utf8')).tag_name;
  return String(tag).replace(/^v/, '');
}

/**
 * Packt ein Archiv aus. tar auf Windows und macOS ist bsdtar und kann
 * auch zip; auf Linux springt fuer zip unzip ein.
 */
function unpack(archive, into, ext) {
  // Immer aus dem Zielordner heraus und nur mit dem Dateinamen: tar auf
  // Windows haelt "C:\..." sonst fuer einen entfernten Rechner.
  const file = path.basename(archive);
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: into, timeout: 120000, stdio: 'pipe' });

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
function findBinary(dir, want) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findBinary(full, want);
      if (hit) return hit;
    } else if (entry.name === want) {
      return full;
    }
  }
  return null;
}

function stampOf(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
  } catch {
    return null;
  }
}

function wantedPlatforms(argv) {
  if (argv.includes('--all')) return Object.keys(TARGETS);

  const at = argv.findIndex((a) => a === '--platform' || a.startsWith('--platform='));
  if (at === -1) return [process.platform];

  const raw = argv[at].includes('=') ? argv[at].split('=')[1] : argv[at + 1];
  const list = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((p) => !TARGETS[p]);
  if (!list.length || bad.length) {
    throw new Error(`unbekanntes System: ${bad.join(', ') || '(leer)'} - erlaubt: ${Object.keys(TARGETS).join(', ')}`);
  }
  return list;
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const wantLatest = process.argv.includes('--latest');
  const platforms = wantedPlatforms(process.argv);

  const version = wantLatest || !pkg.crocVersion ? await latestVersion() : pkg.crocVersion;

  if (pkg.crocVersion !== version) {
    pkg.crocVersion = version;
    fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`package.json: crocVersion auf ${version} gesetzt`);
  }

  for (const platform of platforms) {
    const want = binName(platform);

    for (const { arch, asset, ext } of TARGETS[platform]) {
      const outDir = path.join(VENDOR, `${platform}-${arch}`);
      const outBin = path.join(outDir, want);

      if (fs.existsSync(outBin) && !wantLatest && stampOf(outDir) === version) {
        console.log(`croc ${version} (${platform}/${arch}) liegt bereits vor`);
        continue;
      }

      const name = `croc_v${version}_${asset}.${ext}`;
      const url = `https://github.com/schollz/croc/releases/download/v${version}/${name}`;
      console.log(`lade ${name} ...`);

      const data = await get(url);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crocdl-'));
      try {
        const archive = path.join(tmp, name);
        fs.writeFileSync(archive, data);
        unpack(archive, tmp, ext);

        const found = findBinary(tmp, want);
        if (!found) throw new Error(`${want} steckt nicht in ${name}`);

        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(found, outBin);
        if (platform !== 'win32') fs.chmodSync(outBin, 0o755);
        fs.writeFileSync(path.join(outDir, 'VERSION'), `${version}\n`, 'utf8');

        console.log(`  -> ${path.relative(ROOT, outBin)} (${(data.length / 1048576).toFixed(1)} MB gepackt)`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  console.log(`\ncroc ${version} liegt bereit fuer: ${platforms.join(', ')}.`);
}

main().catch((err) => {
  console.error(`\nFehlgeschlagen: ${err.message}`);
  process.exit(1);
});
