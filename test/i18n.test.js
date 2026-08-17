'use strict';

/* =================================================================
   Uebersetzungen.

   Fehlt ein Schluessel in einer Sprache, faellt die App still aufs
   Englische zurueck - ein deutscher Satz mit einem englischen Wort
   mittendrin faellt beim Bauen niemandem auf, dem Benutzer schon.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const { I18N, LANGS, DEFAULT_LANG, t } = require('../src/renderer/i18n');
const { HELP } = require('../src/renderer/help');

const SPRACHEN = LANGS.map((l) => l.code);
const platzhalter = (text) => [...String(text).matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');

test('Englisch ist die Vorgabe und vollstaendig', () => {
  assert.equal(DEFAULT_LANG, 'en');
  assert.ok(Object.keys(I18N.en).length > 100);
});

test('jede angebotene Sprache hat auch eine Tabelle', () => {
  for (const code of SPRACHEN) assert.ok(I18N[code], `keine Tabelle fuer ${code}`);
  assert.deepEqual(Object.keys(I18N).sort(), [...SPRACHEN].sort());
});

test('keine Sprache hat Luecken', () => {
  const erwartet = Object.keys(I18N.en);
  for (const code of SPRACHEN) {
    const fehlt = erwartet.filter((k) => I18N[code][k] === undefined);
    assert.deepEqual(fehlt, [], `${code} fehlt: ${fehlt.slice(0, 10).join(', ')}`);
  }
});

test('keine Sprache hat Ueberzaehliges', () => {
  // Ein Schluessel, den nur eine Sprache kennt, ist meist ein Tippfehler
  // oder ein Rest, den beim Umbenennen niemand mitgenommen hat.
  for (const code of SPRACHEN) {
    const zuviel = Object.keys(I18N[code]).filter((k) => I18N.en[k] === undefined);
    assert.deepEqual(zuviel, [], `${code} kennt zusaetzlich: ${zuviel.slice(0, 10).join(', ')}`);
  }
});

test('Platzhalter bleiben erhalten', () => {
  // "{0} von {1}" darf in der Uebersetzung nicht zu "{0}" schrumpfen -
  // sonst fehlt dem Benutzer genau die Zahl, um die es ging.
  for (const key of Object.keys(I18N.en)) {
    const soll = platzhalter(I18N.en[key]);
    for (const code of SPRACHEN) {
      assert.equal(platzhalter(I18N[code][key]), soll, `${code}.${key}`);
    }
  }
});

test('keine leeren Texte', () => {
  for (const code of SPRACHEN) {
    for (const [key, wert] of Object.entries(I18N[code])) {
      assert.ok(String(wert).trim().length > 0, `${code}.${key} ist leer`);
    }
  }
});

test('Deutsch benutzt echte Umlaute, keine Umschreibung', () => {
  // Ausdruecklich so gewuenscht. "fuer" statt "für" im sichtbaren Text
  // sieht nach kaputter Kodierung aus. Im Quelltext sind Umschreibungen
  // in Ordnung - hier geht es nur um das, was der Benutzer liest.
  const text = Object.values(I18N.de).join(' ');
  assert.ok(/[äöüßÄÖÜ]/.test(text), 'kein einziger Umlaut im deutschen Text');

  const UMSCHRIEBEN = /\b(fuer|ueber|ueberall|koennen|koennte|muessen|waehle\w*|oeffne\w*|aendern|groesse|schluessel|zurueck|naechste\w*|pruef\w*|loeschen|hoehe|dafuer|zusaetzlich)\b/i;
  const treffer = Object.entries(I18N.de)
    .filter(([, v]) => UMSCHRIEBEN.test(String(v)))
    .map(([k]) => k);
  assert.deepEqual(treffer, [], `umschriebene Umlaute in: ${treffer.join(', ')}`);
});

test('t() liefert Text, nicht Schluessel', async (sub) => {
  const key = Object.keys(I18N.en)[0];

  await sub.test('in jeder Sprache', () => {
    for (const code of SPRACHEN) assert.equal(t(code, key), I18N[code][key]);
  });

  await sub.test('unbekannte Sprache faellt aufs Englische zurueck', () => {
    assert.equal(t('kl', key), I18N.en[key]);
  });

  await sub.test('unbekannter Schluessel gibt sich selbst zurueck', () => {
    // Besser ein sichtbarer Schluessel als ein leeres Feld.
    assert.equal(t('de', 'gibt.es.nicht'), 'gibt.es.nicht');
  });

  await sub.test('Werte werden eingesetzt', () => {
    const mit = Object.keys(I18N.en).find((k) => /\{0\}/.test(I18N.en[k]));
    assert.ok(mit, 'kein Text mit Platzhalter gefunden');
    assert.ok(!t('en', mit, 'XYZ').includes('{0}'));
    assert.ok(t('en', mit, 'XYZ').includes('XYZ'));
  });
});

test('die Hilfe gibt es in allen Sprachen, gleich vollstaendig', async (sub) => {
  await sub.test('nichts fehlt', () => {
    for (const code of SPRACHEN) assert.ok(Array.isArray(HELP[code]), `keine Hilfe fuer ${code}`);
  });

  await sub.test('ueberall gleich viele Abschnitte', () => {
    // Ein Abschnitt, den nur die deutsche Hilfe hat, ist ein Abschnitt,
    // den zwei Drittel der Benutzer nie zu sehen bekommen.
    const anzahl = SPRACHEN.map((code) => HELP[code].length);
    assert.equal(new Set(anzahl).size, 1,
      `unterschiedlich: ${SPRACHEN.map((c, i) => `${c}=${anzahl[i]}`).join(' ')}`);
  });

  await sub.test('jeder Abschnitt hat Ueberschrift und Inhalt', () => {
    for (const code of SPRACHEN) {
      HELP[code].forEach((abschnitt, i) => {
        assert.ok(String(abschnitt.title || '').trim(), `${code}[${i}] ohne Ueberschrift`);
        assert.ok(Array.isArray(abschnitt.body), `${code}[${i}] hat keinen Textkoerper`);
        assert.ok(abschnitt.body.join(' ').trim().length > 20, `${code}[${i}] fast ohne Inhalt`);
      });
    }
  });

  await sub.test('das eigene Relay ist erklaert', () => {
    // Es ist Voraussetzung fuer Nachrichten - wer es nicht einrichtet,
    // steht ohne Erklaerung vor einer abgeschalteten Funktion.
    for (const code of SPRACHEN) {
      const text = HELP[code].map((a) => `${a.title} ${a.body.join(' ')}`).join(' ');
      assert.ok(/relay|relais/i.test(text), `${code} erwaehnt das Relay nicht`);
      assert.ok(/9013/.test(text), `${code} nennt die noetigen Ports nicht`);
    }
  });
});
