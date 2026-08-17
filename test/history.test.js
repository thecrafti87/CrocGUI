'use strict';

/* =================================================================
   Verlauf.

   Der wichtigste Punkt steht ganz unten: es duerfen keine Codes darin
   landen. Bei Einmalcodes waeren sie wertlos, bei festen Codes ein
   Dauerpasswort im Klartext auf der Platte.
   ================================================================= */

require('./helper/electron');

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('fs');
const os = require('os');
const path = require('path');

const history = require('../src/main/history');

test.beforeEach(() => history.clear());

test('neue Eintraege stehen oben', () => {
  history.add({ kind: 'send', label: 'erstes' });
  history.add({ kind: 'send', label: 'zweites' });
  assert.deepEqual(history.load().map((e) => e.label), ['zweites', 'erstes']);
});

test('jeder Eintrag bekommt Kennung und Zeitpunkt', () => {
  const [eintrag] = history.add({ kind: 'send', label: 'x' });
  assert.ok(eintrag.id);
  assert.ok(!Number.isNaN(Date.parse(eintrag.at)));
});

test('der Verlauf waechst nicht endlos', () => {
  for (let i = 0; i < history.LIMIT + 25; i++) history.add({ kind: 'send', label: `nr-${i}` });
  const liste = history.load();
  assert.equal(liste.length, history.LIMIT);
  // Das Neueste bleibt, das Aelteste faellt hinten heraus.
  assert.equal(liste[0].label, `nr-${history.LIMIT + 24}`);
  assert.ok(!liste.some((e) => e.label === 'nr-0'));
});

test('leeren raeumt wirklich auf', () => {
  history.add({ kind: 'send', label: 'x' });
  assert.deepEqual(history.clear(), []);
  assert.deepEqual(history.load(), []);
});

test('der Verlauf ueberlebt einen Neustart', () => {
  history.add({ kind: 'send', label: 'bleibt' });
  const gelesen = JSON.parse(fs.readFileSync(history.file(), 'utf8'));
  assert.equal(gelesen[0].label, 'bleibt');
});

test('kein Code landet auf der Platte', () => {
  // Feste Kontaktcodes sind Dauerpasswoerter. Wer sie mitschreibt,
  // legt sie ungefragt im Klartext ab.
  history.add({ kind: 'send', label: 'x', code: 'apfel-berg-cent', paths: ['/tmp/a'] });
  const roh = fs.readFileSync(history.file(), 'utf8');
  assert.ok(!roh.includes('apfel-berg-cent'), 'der Code steht im Verlauf');
});

test('verschwundene Pfade werden erkannt', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crocgui-hist-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const da = path.join(dir, 'da.txt');
  fs.writeFileSync(da, 'x');

  // "Erneut senden" ist wertlos, wenn die Datei nicht mehr existiert.
  const geprueft = history.withExistence([
    { kind: 'send', paths: [da] },
    { kind: 'send', paths: [da, path.join(dir, 'weg.txt')] },
    { kind: 'receive', label: 'ohne Pfade' }
  ]);

  assert.equal(geprueft[0].pathsExist, true);
  assert.equal(geprueft[1].pathsExist, false, 'ein fehlender Pfad genuegt');
  assert.equal(geprueft[2].pathsExist, undefined, 'Empfangenes hat keine Quellpfade');
});
