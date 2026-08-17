'use strict';

/* =================================================================
   Nachrichtencodes.

   Beide Seiten muessen ohne weitere Absprache auf denselben Wert
   kommen - er wird aus dem Dateicode des Kontakts abgeleitet. Aendert
   sich diese Ableitung, horchen alte und neue Fassungen der App in
   verschiedenen Raeumen und finden einander nie wieder.
   ================================================================= */

require('./helper/electron');

const test = require('node:test');
const assert = require('node:assert/strict');

const { codeFor } = require('../src/main/messenger');

test('derselbe Kontakt ergibt immer denselben Code', () => {
  const kontakt = { id: '1', name: 'Sebastian', code: 'apfel-berg-cent' };
  assert.equal(codeFor(kontakt), codeFor({ ...kontakt, id: '2', name: 'anders' }));
});

test('die Ableitung ist festgeschrieben', () => {
  // Fest eingetragen, damit eine Aenderung auffaellt: sie macht alte
  // Fassungen der App unerreichbar.
  assert.equal(codeFor({ code: 'apfel-berg-cent' }), 'msg-e555b1bc7220cc62ca3484f2');
});

test('verschiedene Kontakte horchen in verschiedenen Raeumen', () => {
  const a = codeFor({ code: 'apfel-berg-cent' });
  const b = codeFor({ code: 'apfel-berg-dose' });
  assert.notEqual(a, b);
});

test('der Nachrichtencode verraet den Dateicode nicht', () => {
  // Sonst laege er beim Horchen offen - der Dateicode ist das Passwort.
  const code = codeFor({ code: 'apfel-berg-cent' });
  assert.ok(!code.includes('apfel'));
  assert.ok(!code.includes('berg'));
});

test('der Nachrichtencode stoert nie eine Dateiuebertragung', () => {
  // Er hat ein eigenes Praefix und ist lang genug fuer croc.
  const code = codeFor({ code: 'apfel-berg-cent' });
  assert.match(code, /^msg-[0-9a-f]{24}$/);
  assert.ok(code.length >= 6);
});
