'use strict';

/* =================================================================
   Nachforderungen.

   Die Liste reist durch Zwischenablagen und Chatfenster und wird auf
   einem Rechner geschrieben, der anders eingestellt sein kann als der,
   der sie liest. Sie muss beides ueberstehen.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeRequest, readRequest, REQUEST_HEAD } = require('../src/renderer/request');

const NAMEN = ['daten/gross.bin', 'daten/unter/tief.txt'];

test('was gebaut wurde, laesst sich wieder lesen', () => {
  assert.deepEqual(readRequest(makeRequest(NAMEN)), NAMEN);
});

test('die Kopfzeile ist nicht uebersetzt', () => {
  // Die beiden Rechner koennen auf verschiedene Sprachen eingestellt
  // sein - eine nur auf Deutsch erkennbare Nachforderung waere keine.
  assert.match(REQUEST_HEAD, /^CrocGUI-REQUEST/);
  assert.ok(!/[äöüßÄÖÜ]/.test(makeRequest(NAMEN)));
});

test('was keine Nachforderung ist, wird auch nicht dafuer gehalten', () => {
  for (const fremd of ['', '   ', 'hallo, wie geht es dir?', 'daten/gross.bin', null, undefined]) {
    assert.equal(readRequest(fremd), null, JSON.stringify(fremd));
  }
});

test('eine Kopfzeile ohne Namen ist keine Nachforderung', () => {
  // Sonst laege beim Sender eine leere Auswahl bereit.
  assert.equal(readRequest(REQUEST_HEAD), null);
  assert.equal(readRequest(`${REQUEST_HEAD}\n\n   \n`), null);
});

test('uebersteht den Weg durch ein Chatfenster', async (t) => {
  await t.test('Leerzeilen und Einrueckungen', () => {
    assert.deepEqual(readRequest(`${REQUEST_HEAD}\n\n  daten/gross.bin  \n\n\tdaten/unter/tief.txt\n\n`), NAMEN);
  });

  await t.test('Zeilenenden von Windows', () => {
    assert.deepEqual(readRequest(`${REQUEST_HEAD}\r\ndaten/gross.bin\r\ndaten/unter/tief.txt\r\n`), NAMEN);
  });

  await t.test('Gross- und Kleinschreibung der Kopfzeile', () => {
    assert.deepEqual(readRequest('crocgui-request v1\ndaten/gross.bin'), ['daten/gross.bin']);
  });
});

test('Namen mit Leerzeichen bleiben heil', () => {
  // Dateinamen mit Leerzeichen sind der Normalfall, nicht die Ausnahme.
  const mit = ['Bilder/Urlaub 2024/am strand.jpg'];
  assert.deepEqual(readRequest(makeRequest(mit)), mit);
});
