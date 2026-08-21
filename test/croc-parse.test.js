'use strict';

/* =================================================================
   Die Ausgabe von croc auswerten.

   croc schreibt fuer Menschen, nicht fuer Programme: Farbcodes,
   Fortschritt mit Wagenruecklauf in einer einzigen Zeile, und nach der
   Uebertragung ein zweiter Balken fuers Nachrechnen. Der darf den
   Fortschritt nicht auf null zuruecksetzen - genau das sah man einmal.
   ================================================================= */

require('./helper/electron');

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseLine, segments, clean } = require('../src/main/croc');

test('Farbcodes fallen weg', () => {
  assert.equal(clean('\x1B[32mCode is: apfel-berg-cent\x1B[0m'), 'Code is: apfel-berg-cent');
});

test('Zeilen zerlegen', async (t) => {
  await t.test('auch am Wagenruecklauf', () => {
    // Ohne das waere der ganze Fortschritt eine einzige, endlos
    // wachsende Zeile.
    assert.deepEqual(segments('1%\r50%\r100%\n'), ['1%', '50%', '100%']);
  });

  await t.test('Leeres faellt weg', () => {
    assert.deepEqual(segments('a\n\n  \n b '), ['a', ' b']);
  });
});

test('Code-Wortgruppe', () => {
  assert.deepEqual(parseLine('Code is: apfel-berg-cent'), { type: 'code', code: 'apfel-berg-cent' });
});

test('was uebertragen wird', async (t) => {
  await t.test('eine einzelne Datei', () => {
    assert.deepEqual(parseLine("Sending 'urlaub.zip' (1.4 GB)"),
      { type: 'meta', label: 'urlaub.zip', size: '1.4 GB' });
  });

  await t.test('mehrere Dateien', () => {
    const evt = parseLine('Sending 12 files (340.5 MB)');
    assert.equal(evt.type, 'meta');
    assert.equal(evt.size, '340.5 MB');
  });

  await t.test('beim Empfaenger', () => {
    assert.deepEqual(parseLine("Receiving 'bericht.pdf' (2.1 MB)"),
      { type: 'meta', label: 'bericht.pdf', size: '2.1 MB' });
  });

  await t.test('mit wem', () => {
    assert.deepEqual(parseLine('Sending (->192.168.15.20:9009)'),
      { type: 'peer', peer: '192.168.15.20:9009' });
  });
});

test('Fortschritt', async (t) => {
  const zeile = ' 42% |███████         | (1.2/28 GB, 11.4 MB/s) [1m30s:4m]';

  await t.test('Anteil, Menge, Tempo und Restzeit', () => {
    assert.deepEqual(parseLine(zeile), {
      type: 'progress',
      percent: 42,
      bytes: '1.2/28 GB',
      speed: '11.4 MB/s',
      eta: '1m30s:4m'
    });
  });

  await t.test('eine Prozentzahl ohne Balken ist kein Fortschritt', () => {
    // Sonst geriete jeder Fliesstext mit einer Zahl zum Fortschritt.
    assert.equal(parseLine('reduced size by 30% overall'), null);
  });

  await t.test('ueber 100% geht nicht', () => {
    assert.equal(parseLine('120% |████| (1/1 MB)').percent, 100);
  });
});

test('das Fortschrittsformat von croc 11.2', async (t) => {
  // 11.2 setzt auch vor den Schraegstrich eine Einheit. Mit dem alten
  // Muster fielen Menge und Tempo lautlos weg - der Balken lief, die
  // Zahlen daneben blieben leer.
  await t.test('am Anfang, wenn erst wenige Bytes da sind', () => {
    const evt = parseLine(' gross.bin   0% |                    | ( 0 B/12 MB) [0s:0s]');
    assert.equal(evt.type, 'progress');
    assert.equal(evt.bytes, '0 B/12 MB');
  });

  await t.test('mitten drin, mit Tempo und Restzeit', () => {
    assert.deepEqual(parseLine(' gross.bin  53% |████      | (6.3 MB/12 MB, 4.1 MB/s) [2s:4s]'), {
      type: 'progress',
      percent: 53,
      bytes: '6.3 MB/12 MB',
      speed: '4.1 MB/s',
      eta: '2s:4s'
    });
  });

  await t.test('am Ende, ohne Einheit vor dem Schraegstrich', () => {
    // Das alte Format gibt es weiterhin - beide muessen gehen.
    const evt = parseLine(' gross.bin 100% |████████| (12/12 MB, 292 MB/s)');
    assert.equal(evt.bytes, '12/12 MB');
    assert.equal(evt.speed, '292 MB/s');
  });
});

test('"Sending 0 files" ist keine Angabe, sondern ein Zwischenstand', () => {
  // 11.2 meldet fuer eine einzelne Datei zuerst "Sending 0 files" und
  // korrigiert sich gleich darauf. Als Bezeichnung uebernommen stuende
  // "0 Dateien" auf der Karte.
  assert.equal(parseLine('Sending 0 files (11.4 MB)'), null);
  assert.equal(parseLine('Sending 12 files (340.5 MB)').type, 'meta');
});

test('das Nachrechnen ist eigener Fortschritt, kein Rueckschritt', () => {
  // croc prueft die Datei nach der Uebertragung noch einmal und faengt
  // dafuer wieder bei 0% an. Als "progress" gemeldet, spraenge der
  // Balken in der App auf null zurueck.
  const evt = parseLine('Hashing  7% |█               | (2/28 GB)');
  assert.deepEqual(evt, { type: 'verify', percent: 7 });
});

test('Fehler', async (t) => {
  await t.test('werden erkannt', () => {
    assert.deepEqual(parseLine('error: could not secure channel'),
      { type: 'failure', message: 'could not secure channel' });
  });

  await t.test('auch ohne Doppelpunkt', () => {
    assert.equal(parseLine('Error unable to connect').type, 'failure');
  });
});

test('belanglose Zeilen ergeben nichts', () => {
  for (const zeile of ['', 'connecting...', 'securing channel', 'croc version 11.1.1']) {
    assert.equal(parseLine(zeile), null, `unerwartet ausgewertet: ${zeile}`);
  }
});
