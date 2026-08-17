'use strict';

/* =================================================================
   Die Oberflaeche haengt an Kennungen.

   app.js greift ueber $('#etwas') in die Seite. Ein Tippfehler dort
   wirft keinen Fehler beim Laden - er faellt erst auf, wenn jemand den
   Knopf drueckt und nichts geschieht. Dasselbe gilt umgekehrt fuer
   data-i18n: eine Beschriftung ohne Uebersetzung bleibt einfach leer.

   Ohne Browser geprueft, mit Mustern statt mit einem DOM - das reicht,
   um genau diese beiden Fehler zu finden.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

const { I18N } = require('../src/renderer/i18n');

/** Alle id="..." der Seite. */
const IDS = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test('jede angesprochene Kennung gibt es auch in der Seite', () => {
  // $('#foo') und $('#foo', irgendwo)
  const gesucht = [...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)].map((m) => m[1]);
  assert.ok(gesucht.length > 40, `nur ${gesucht.length} Kennungen gefunden - Muster kaputt?`);

  const fehlt = [...new Set(gesucht)].filter((id) => !IDS.has(id));
  assert.deepEqual(fehlt, [], `nicht in index.html: ${fehlt.join(', ')}`);
});

test('keine Kennung ist doppelt vergeben', () => {
  // Bei doppelten liefert $ die erste - und die andere Stelle bleibt tot.
  const alle = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const doppelt = alle.filter((id, i) => alle.indexOf(id) !== i);
  assert.deepEqual([...new Set(doppelt)], []);
});

test('jede Beschriftung in der Seite hat eine Uebersetzung', () => {
  const attrs = ['data-i18n', 'data-i18n-ph', 'data-i18n-title'];
  const fehlt = [];
  for (const attr of attrs) {
    for (const m of html.matchAll(new RegExp(`\\b${attr}="([^"]+)"`, 'g'))) {
      if (I18N.en[m[1]] === undefined) fehlt.push(`${attr}="${m[1]}"`);
    }
  }
  assert.deepEqual(fehlt, [], `ohne Text: ${fehlt.join(', ')}`);
});

test('jeder Schluessel, den app.js benutzt, ist eingetragen', () => {
  // T('foo.bar') greift auf die Tabelle zu; fehlt der Schluessel, steht
  // er dem Benutzer roh auf dem Bildschirm.
  const keys = [...js.matchAll(/\bT\('([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 60, `nur ${keys.length} Schluessel gefunden - Muster kaputt?`);

  const fehlt = [...new Set(keys)].filter((k) => I18N.en[k] === undefined);
  assert.deepEqual(fehlt, [], `nicht in i18n.js: ${fehlt.join(', ')}`);
});

test('die Seite laedt alle Skripte, die sie braucht', () => {
  for (const datei of ['i18n.js', 'help.js', 'request.js', 'app.js']) {
    assert.ok(html.includes(`src="${datei}"`), `${datei} wird nicht geladen`);
    assert.ok(fs.existsSync(path.join(dir, datei)), `${datei} fehlt auf der Platte`);
  }
});
