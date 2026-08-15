#!/usr/bin/env node
'use strict';

/* =================================================================
   Holt die croc-Binaries fuer macOS und legt sie unter vendor/ ab,
   damit electron-builder sie in die App packen kann.

     node scripts/fetch-croc.js            die in package.json
                                           eingetragene Fassung
     node scripts/fetch-croc.js --latest   die neueste, und traegt
                                           sie in package.json ein

   Die Binaries gehoeren nicht ins Repository - vendor/ ist in der
   .gitignore. Vor "npm run dist" laeuft dieses Skript automatisch.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const PKG = path.join(ROOT, 'package.json');

// Bezeichnung der Anhaenge in den croc-Releases je Architektur.
const TARGETS = [
  { arch: 'arm64', asset: 'macOS-ARM64' },
  { arch: 'x64', asset: 'macOS-64bit' }
];

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

async function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const wantLatest = process.argv.includes('--latest');

  const version = wantLatest || !pkg.crocVersion ? await latestVersion() : pkg.crocVersion;

  if (pkg.crocVersion !== version) {
    pkg.crocVersion = version;
    fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`package.json: crocVersion auf ${version} gesetzt`);
  }

  for (const { arch, asset } of TARGETS) {
    const outDir = path.join(VENDOR, `darwin-${arch}`);
    const outBin = path.join(outDir, 'croc');

    if (fs.existsSync(outBin) && !wantLatest) {
      const have = stampOf(outDir);
      if (have === version) {
        console.log(`croc ${version} (${arch}) liegt bereits vor`);
        continue;
      }
    }

    const name = `croc_v${version}_${asset}.tar.gz`;
    const url = `https://github.com/schollz/croc/releases/download/v${version}/${name}`;
    console.log(`lade ${name} ...`);

    const data = await get(url);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crocdl-'));
    const tarPath = path.join(tmp, name);
    fs.writeFileSync(tarPath, data);

    // Das Archiv enthaelt das Binary flach als "croc".
    execFileSync('tar', ['-xzf', tarPath, '-C', tmp, 'croc']);

    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(tmp, 'croc'), outBin);
    fs.chmodSync(outBin, 0o755);
    fs.writeFileSync(path.join(outDir, 'VERSION'), `${version}\n`, 'utf8');
    fs.rmSync(tmp, { recursive: true, force: true });

    console.log(`  -> ${path.relative(ROOT, outBin)} (${(data.length / 1048576).toFixed(1)} MB gepackt)`);
  }

  console.log(`\ncroc ${version} liegt fuer arm64 und x64 bereit.`);
}

function stampOf(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(`\nFehlgeschlagen: ${err.message}`);
  process.exit(1);
});
