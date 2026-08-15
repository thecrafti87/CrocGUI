#!/usr/bin/env node
'use strict';

/* =================================================================
   Erzeugt assets/icon.icns aus assets/icon.svg.

     npx electron scripts/make-icon.js

   Electron rendert die Vorlage, sips legt die Groessen an, iconutil
   packt daraus die .icns-Datei. Das Ergebnis liegt im Repository,
   damit "npm run dist" ohne diesen Schritt auskommt.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { app, BrowserWindow, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');
const ICNS = path.join(ROOT, 'assets', 'icon.icns');
const SIZE = 1024;

// Die Groessen, die eine .iconset-Sammlung enthalten muss.
const SLICES = [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024]
];

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crocicon-'));
  const page = path.join(tmp, 'icon.html');

  fs.writeFileSync(page, `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>
    ${fs.readFileSync(SVG, 'utf8')}`, 'utf8');

  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false,
    transparent: true, frame: false,
    webPreferences: { offscreen: true }
  });
  await win.loadFile(page);
  await new Promise((r) => setTimeout(r, 900));

  // Auf Bildschirmen mit doppelter Aufloesung faellt die Aufnahme groesser
  // aus als das Fenster - deshalb hart auf 1024 zurechtstutzen.
  const shot = await win.webContents.capturePage();
  const full = shot.getSize().width === SIZE ? shot : shot.resize({ width: SIZE, height: SIZE });

  const iconset = path.join(tmp, 'icon.iconset');
  fs.mkdirSync(iconset);
  const basePng = path.join(tmp, 'base.png');
  fs.writeFileSync(basePng, full.toPNG());

  for (const [name, px] of SLICES) {
    const out = path.join(iconset, name);
    fs.copyFileSync(basePng, out);
    execFileSync('sips', ['-z', String(px), String(px), out], { stdio: 'ignore' });
  }

  fs.mkdirSync(path.dirname(ICNS), { recursive: true });
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', ICNS]);

  // Eine grosse PNG-Fassung fuer Fenster ausserhalb von macOS.
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.png'), full.toPNG());

  const kb = (fs.statSync(ICNS).size / 1024).toFixed(0);
  console.log(`assets/icon.icns angelegt (${kb} KB) und assets/icon.png`);

  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
}).catch((err) => {
  console.error(err.message);
  app.exit(1);
});
