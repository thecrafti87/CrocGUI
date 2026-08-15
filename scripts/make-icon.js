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

  // Menueleiste: schwarz auf durchsichtig. macOS faerbt "Template"-Bilder
  // selbst um, hell auf dunkler Leiste und umgekehrt.
  const trayPage = path.join(tmp, 'tray.html');
  fs.writeFileSync(trayPage, `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;background:transparent;overflow:hidden}
    svg{display:block;width:256px;height:256px}</style>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256"
         fill="none" stroke="#000" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.6 11 Q2.8 6.4 6.8 6.4 Q9.6 6.4 10.4 9 L11 10.8 L20.8 11.3 Q22.8 11.4 22.8 13"/>
      <path d="M22.8 13 L20.4 14.8 L18 13 L15.6 14.8 L13.2 13 L10.8 14.8 L8.4 13.2 L6.6 15"/>
      <path d="M6.6 15 Q4 15.6 2.6 17.4"/>
      <path d="M2.6 11 L2.6 17.4"/>
      <circle cx="6.4" cy="9" r="1.15" fill="#000" stroke="none"/>
    </svg>`, 'utf8');

  const trayWin = new BrowserWindow({
    width: 256, height: 256, show: false,
    transparent: true, frame: false,
    webPreferences: { offscreen: true }
  });
  await trayWin.loadFile(trayPage);
  await new Promise((r) => setTimeout(r, 600));
  const trayShot = await trayWin.webContents.capturePage();
  const traySrc = path.join(tmp, 'tray.png');
  fs.writeFileSync(traySrc, trayShot.toPNG());

  // Das Krokodil ist breit - in der Leiste zaehlt die Hoehe, deshalb 18/36.
  for (const [name, px] of [['crocTemplate.png', 18], ['crocTemplate@2x.png', 36]]) {
    const out = path.join(ROOT, 'assets', name);
    fs.copyFileSync(traySrc, out);
    execFileSync('sips', ['-z', String(px), String(px), out], { stdio: 'ignore' });
  }
  console.log('assets/crocTemplate.png und @2x angelegt');

  const kb = (fs.statSync(ICNS).size / 1024).toFixed(0);
  console.log(`assets/icon.icns angelegt (${kb} KB) und assets/icon.png`);

  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
}).catch((err) => {
  console.error(err.message);
  app.exit(1);
});
