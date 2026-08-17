'use strict';

/* =================================================================
   Pruefsummen, an echten Dateien.

   Der Anlass fuer die ganze Einrichtung war eine Messung: bricht eine
   Uebertragung ab, liegt beim Empfaenger eine Datei in exakt richtiger
   Groesse - gefuellt mit Nullen. Groesse und Zeitstempel halten sie fuer
   heil, croc endet mit Code 0. Nur Nachrechnen findet das.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('fs');
const os = require('os');
const path = require('path');

const manifest = require('../src/main/manifest');

const still = () => {};

/** Legt einen Wegwerf-Ordner an, den der Test hinterher wieder los ist. */
function tempdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crocgui-manifest-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function schreibe(file, inhalt) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, inhalt);
  return file;
}

/**
 * Baut die Liste ueber `quelle` und legt sie so ab, wie sie beim
 * Empfaenger ankaeme: im Zielordner neben den Daten.
 */
async function listeNach(quelle, ziel, excludes = []) {
  const gebaut = await manifest.build([quelle], '1.0.0-test', still, excludes);
  fs.mkdirSync(ziel, { recursive: true });
  fs.copyFileSync(gebaut.file, path.join(ziel, manifest.NAME));
  gebaut.cleanup();
  return gebaut;
}

test('sammeln', async (t) => {
  await t.test('Namen sind die, unter denen der Empfaenger sie sieht', () => {
    const dir = tempdir(t);
    schreibe(path.join(dir, 'daten', 'a.txt'), 'a');
    schreibe(path.join(dir, 'daten', 'unter', 'b.txt'), 'b');

    const namen = manifest.collect([path.join(dir, 'daten')]).map((f) => f.rel).sort();
    assert.deepEqual(namen, ['daten/a.txt', 'daten/unter/b.txt']);
  });

  await t.test('Ausschluesse greifen wie bei croc: als Teilzeichenkette', () => {
    // croc wirft alles weg, dessen Pfad die Zeichenkette enthaelt - nicht
    // nur genaue Treffer. Wer das anders nachbaut, listet Dateien, die
    // nie gesendet werden, und meldet sie beim Empfaenger als "fehlend".
    const dir = tempdir(t);
    schreibe(path.join(dir, 'daten', 'a.txt'), 'a');
    schreibe(path.join(dir, 'daten', '.DS_Store'), 'x');
    schreibe(path.join(dir, 'daten', 'node_modules', 'p', 'index.js'), 'x');

    const namen = manifest.collect([path.join(dir, 'daten')], ['.DS_Store', 'node_modules'])
      .map((f) => f.rel);
    assert.deepEqual(namen, ['daten/a.txt']);
  });

  await t.test('leere Ausschluesse werfen nicht alles weg', () => {
    // Eine leere Zeichenkette steckt in jedem Pfad. Ungefiltert bliebe
    // keine einzige Datei uebrig.
    const dir = tempdir(t);
    schreibe(path.join(dir, 'daten', 'a.txt'), 'a');
    assert.equal(manifest.collect([path.join(dir, 'daten')], ['', '  ']).length, 1);
  });
});

test('heil angekommen', async (t) => {
  const dir = tempdir(t);
  const quelle = path.join(dir, 'quelle', 'daten');
  schreibe(path.join(quelle, 'a.txt'), 'Inhalt A');
  schreibe(path.join(quelle, 'unter', 'b.txt'), 'Inhalt B');

  const ziel = path.join(dir, 'ziel');
  const gebaut = await listeNach(quelle, ziel);
  assert.equal(gebaut.count, 2);

  fs.cpSync(quelle, path.join(ziel, 'daten'), { recursive: true });

  const ergebnis = await manifest.verify(ziel, still);
  assert.equal(ergebnis.found, true);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.good, 2);
  assert.deepEqual(ergebnis.broken, []);
  assert.deepEqual(ergebnis.missing, []);

  await t.test('die Liste raeumt sich hinterher weg', () => {
    assert.equal(fs.existsSync(path.join(ziel, manifest.NAME)), false);
  });
});

test('abgebrochen: richtige Groesse, nur Nullen darin', async (t) => {
  const dir = tempdir(t);
  const quelle = path.join(dir, 'quelle', 'daten');
  const inhalt = Buffer.alloc(64 * 1024, 7);
  schreibe(path.join(quelle, 'gross.bin'), inhalt);
  schreibe(path.join(quelle, 'klein.txt'), 'heil');

  const ziel = path.join(dir, 'ziel');
  await listeNach(quelle, ziel);

  // So sieht es nach einem Abbruch tatsaechlich aus.
  schreibe(path.join(ziel, 'daten', 'gross.bin'), Buffer.alloc(inhalt.length, 0));
  schreibe(path.join(ziel, 'daten', 'klein.txt'), 'heil');

  const ergebnis = await manifest.verify(ziel, still);
  assert.equal(ergebnis.ok, false);
  assert.deepEqual(ergebnis.broken, ['daten/gross.bin']);
  assert.equal(ergebnis.good, 1);
});

test('gar nicht angekommen', async (t) => {
  const dir = tempdir(t);
  const quelle = path.join(dir, 'quelle', 'daten');
  schreibe(path.join(quelle, 'a.txt'), 'A');
  schreibe(path.join(quelle, 'b.txt'), 'B');

  const ziel = path.join(dir, 'ziel');
  await listeNach(quelle, ziel);
  schreibe(path.join(ziel, 'daten', 'a.txt'), 'A');

  const ergebnis = await manifest.verify(ziel, still);
  assert.deepEqual(ergebnis.missing, ['daten/b.txt']);
  assert.equal(ergebnis.ok, false);
});

test('unter neuem Namen gesichert gilt als angekommen', async (t) => {
  // "Unter neuem Namen sichern" legt die Datei als "a (1).txt" ab. Wer
  // nur den erwarteten Namen sucht, meldet sie als fehlend und uebersieht
  // die heile Fassung daneben.
  const dir = tempdir(t);
  const quelle = path.join(dir, 'quelle', 'daten');
  schreibe(path.join(quelle, 'a.txt'), 'Inhalt A');

  const ziel = path.join(dir, 'ziel');
  await listeNach(quelle, ziel);
  schreibe(path.join(ziel, 'daten', 'a (1).txt'), 'Inhalt A');

  const ergebnis = await manifest.verify(ziel, still);
  assert.equal(ergebnis.ok, true);
  assert.deepEqual(ergebnis.missing, []);
  assert.deepEqual(ergebnis.renamed, [{ expected: 'daten/a.txt', actual: 'daten/a (1).txt' }]);

  await t.test('ein Ausweichname mit falschem Inhalt rettet nichts', async () => {
    const dir2 = tempdir(t);
    const q2 = path.join(dir2, 'quelle', 'daten');
    schreibe(path.join(q2, 'a.txt'), 'Inhalt A');
    const z2 = path.join(dir2, 'ziel');
    await listeNach(q2, z2);
    schreibe(path.join(z2, 'daten', 'a (1).txt'), 'etwas anderes');

    const zweites = await manifest.verify(z2, still);
    assert.equal(zweites.ok, false);
    assert.deepEqual(zweites.missing, ['daten/a.txt']);
  });
});

test('ohne Liste gibt es nichts zu pruefen', async (t) => {
  // Dann hat die Gegenstelle kein CrocGUI benutzt. Das ist kein Fehler.
  const dir = tempdir(t);
  fs.mkdirSync(dir, { recursive: true });
  assert.deepEqual(await manifest.verify(dir, still), { found: false });
});

test('Fortschritt wird gemeldet, und am Ende voll', async (t) => {
  const dir = tempdir(t);
  const quelle = path.join(dir, 'quelle', 'daten');
  schreibe(path.join(quelle, 'a.bin'), Buffer.alloc(4096, 1));

  const meldungen = [];
  await manifest.build([quelle], '1.0.0-test', (p) => meldungen.push(p));

  const letzte = meldungen.at(-1);
  assert.equal(letzte.phase, 'build');
  assert.equal(letzte.done, letzte.total);
  assert.equal(letzte.total, 4096);
});
