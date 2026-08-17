'use strict';

/* =================================================================
   Der Wortschatz fuer gewuerfelte Codes.

   Die Woerter werden vorgelesen, abgetippt und durch Chatfenster
   geschoben. Ein Umlaut oder ein Bindestrich darin macht genau das
   kaputt - der Bindestrich trennt die Woerter voneinander.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const { WORDS, LENGTH, makeCode, strengthBits } = require('../src/main/words');

test('der Wortschatz', async (t) => {
  await t.test('ist gross genug, um etwas zu taugen', () => {
    assert.ok(WORDS.length >= 256, `nur ${WORDS.length} Woerter`);
  });

  await t.test('enthaelt kein Wort doppelt', () => {
    // Doppelte verkleinern den Raum, ohne dass man es merkt.
    assert.equal(new Set(WORDS).size, WORDS.length);
  });

  await t.test('nur Kleinbuchstaben ohne Umlaute', () => {
    const schlecht = WORDS.filter((w) => !/^[a-z]+$/.test(w));
    assert.deepEqual(schlecht, [], `nicht abtippbar: ${schlecht.join(', ')}`);
  });

  await t.test('kein Wort enthaelt den Bindestrich', () => {
    // Er trennt die Woerter im Code voneinander.
    assert.deepEqual(WORDS.filter((w) => w.includes('-')), []);
  });

  await t.test('gut vorlesbare Laenge', () => {
    for (const w of WORDS) {
      assert.ok(w.length >= 3 && w.length <= 10, `${w} ist ${w.length} Zeichen lang`);
    }
  });
});

test('gewuerfelte Codes', async (t) => {
  await t.test('haben die vereinbarte Anzahl Woerter', () => {
    assert.equal(makeCode().split('-').length, LENGTH);
    assert.equal(makeCode(3).split('-').length, 3);
  });

  await t.test('bestehen nur aus Woertern des Vorrats', () => {
    for (const wort of makeCode(10).split('-')) assert.ok(WORDS.includes(wort), wort);
  });

  await t.test('wiederholen sich nicht', () => {
    // Zwei gleiche Codes hintereinander hiessen, dass der Zufall fehlt.
    const gewuerfelt = new Set(Array.from({ length: 50 }, () => makeCode()));
    assert.equal(gewuerfelt.size, 50);
  });

  await t.test('croc verlangt mindestens sechs Zeichen', () => {
    // Kuerzere lehnt es rundheraus ab.
    assert.ok(makeCode(1).length >= 3);
    assert.ok(makeCode(LENGTH).length >= 6);
  });
});

test('die angegebene Staerke passt zum Wortschatz', () => {
  const je = Math.log2(WORDS.length);
  assert.equal(strengthBits(1), Math.round(je));
  assert.equal(strengthBits(LENGTH), Math.round(LENGTH * je));
  // Mit der Vorgabe soll Raten aussichtslos sein.
  assert.ok(strengthBits() >= 48, `nur ${strengthBits()} Bit`);
});
