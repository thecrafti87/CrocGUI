'use strict';

/* =================================================================
   Der Kommandobau.

   Hier ist schon zweimal etwas durchgerutscht, das im Betrieb weh tat:
   die Zwischenlagerung im Textmodus, die croc rundheraus ablehnt, und
   das Relay-Passwort als Argument, wo es jeder in der Prozessliste
   mitlesen konnte. Beides steht unten als eigener Fall.
   ================================================================= */

require('./helper/electron');

const test = require('node:test');
const assert = require('node:assert/strict');

const { globalArgs, buildSend, buildReceive, buildRelay } = require('../src/main/croc');

/** Einstellungen, wie sie frisch nach der Installation aussehen. */
const leer = () => ({ curve: 'p256', hash: 'xxhash' });

test('globale Flags', async (t) => {
  await t.test('ohne Einstellungen nur das Noetigste', () => {
    assert.deepEqual(globalArgs(leer()), ['--ignore-stdin', '--disable-clipboard']);
  });

  await t.test('stdin bleibt zu, sonst sendet croc die Eingabe statt der Dateien', () => {
    assert.ok(globalArgs(leer()).includes('--ignore-stdin'));
  });

  await t.test('Relay, Socks5 und Drosselung werden durchgereicht', () => {
    const args = globalArgs({ ...leer(), relay: '10.0.0.5:9009', socks5: '127.0.0.1:9050', throttleUpload: '1M' });
    assert.deepEqual(args.slice(2), [
      '--relay', '10.0.0.5:9009',
      '--socks5', '127.0.0.1:9050',
      '--throttleUpload', '1M'
    ]);
  });

  await t.test('Vorgabewerte von croc werden nicht wiederholt', () => {
    const args = globalArgs({ curve: 'p256', hash: 'xxhash' });
    assert.ok(!args.includes('--curve'));
  });

  await t.test('eine abweichende Kurve dagegen schon', () => {
    assert.ok(globalArgs({ ...leer(), curve: 'siec' }).includes('--curve'));
  });

  await t.test('Schalter erscheinen nur, wenn sie gesetzt sind', () => {
    const aus = globalArgs(leer());
    assert.ok(!aus.includes('--no-compress'));
    assert.ok(!aus.includes('--internal-dns'));
    const an = globalArgs({ ...leer(), noCompress: true, internalDns: true });
    assert.ok(an.includes('--no-compress'));
    assert.ok(an.includes('--internal-dns'));
  });
});

test('das Relay-Passwort taucht in keinem Kommando auf', () => {
  // Es geht ueber CROC_PASS in die Umgebung. Stuende es als Argument da,
  // koennte jeder Benutzer des Rechners es in der Prozessliste ablesen.
  const cfg = { ...leer(), relay: '10.0.0.5:9009', pass: 'streng-geheim' };
  const kommandos = [
    globalArgs(cfg),
    buildSend({ mode: 'files', paths: ['/tmp/a'] }, cfg),
    buildReceive({ outDir: '/tmp' }, cfg),
    buildRelay({}, cfg)
  ];
  for (const args of kommandos) {
    assert.ok(!args.includes('--pass'), `--pass in: croc ${args.join(' ')}`);
    assert.ok(!args.join(' ').includes('streng-geheim'), `Passwort in: croc ${args.join(' ')}`);
  }
});

test('Senden', async (t) => {
  await t.test('globale Flags stehen vor dem Unterbefehl', () => {
    // croc nimmt sie hinter "send" nicht mehr an.
    const args = buildSend({ mode: 'files', paths: ['/tmp/a'] }, { ...leer(), relay: 'r:9009' });
    assert.ok(args.indexOf('--relay') < args.indexOf('send'));
  });

  await t.test('die Pfade stehen ganz am Ende', () => {
    const args = buildSend({ mode: 'files', paths: ['/tmp/a', '/tmp/b'], zip: true }, leer());
    assert.deepEqual(args.slice(-2), ['/tmp/a', '/tmp/b']);
  });

  await t.test('Umschlag, Git-Ausschluesse und QR-Code', () => {
    const args = buildSend({ mode: 'files', paths: ['/tmp/a'], zip: true, git: true, qr: true, noLocal: true }, leer());
    for (const flag of ['--zip', '--git', '--qr', '--no-local']) assert.ok(args.includes(flag), flag);
  });

  await t.test('--no-local gehoert hinter "send", nicht davor', () => {
    // Als globales Flag kennt croc es nicht.
    const args = buildSend({ mode: 'files', paths: ['/tmp/a'], noLocal: true }, leer());
    assert.ok(args.indexOf('send') < args.indexOf('--no-local'));
  });

  await t.test('Ausschluesse als Liste und als Datei', () => {
    const args = buildSend(
      { mode: 'files', paths: ['/tmp/a'], exclude: '.DS_Store,node_modules', excludeFile: '/tmp/liste' },
      leer()
    );
    assert.deepEqual(args.slice(args.indexOf('--exclude'), args.indexOf('--exclude') + 2),
      ['--exclude', '.DS_Store,node_modules']);
    assert.ok(args.includes('--exclude-file'));
  });

  await t.test('Text wird als --text uebergeben, nicht als Pfad', () => {
    const args = buildSend({ mode: 'text', text: 'hallo welt' }, leer());
    assert.deepEqual(args.slice(-2), ['--text', 'hallo welt']);
  });

  await t.test('Zwischenlagerung fuer Dateien, mit Grenzen', () => {
    const args = buildSend(
      { mode: 'files', paths: ['/tmp/a'], store: true, storeDownloads: 3, storeExpiration: '24h' },
      leer()
    );
    assert.ok(args.includes('--store'));
    assert.deepEqual(args.slice(args.indexOf('--store-downloads'), args.indexOf('--store-downloads') + 2),
      ['--store-downloads', '3']);
    assert.ok(args.includes('--store-expiration'));
  });

  await t.test('Zwischenlagerung NIE im Textmodus', () => {
    // croc bricht sonst ab: "stored mode supports regular file arguments
    // only". Genau daran ist das Senden von Text einmal gescheitert.
    const args = buildSend({ mode: 'text', text: 'hallo', store: true, storeDownloads: 3 }, leer());
    assert.ok(!args.includes('--store'));
    assert.ok(!args.includes('--store-downloads'));
    assert.deepEqual(args.slice(-2), ['--text', 'hallo']);
  });
});

test('Empfangen', async (t) => {
  await t.test('fragt nicht nach - die App hat schon gefragt', () => {
    assert.ok(buildReceive({}, leer()).includes('--yes'));
  });

  await t.test('Ueberschreiben schlaegt Umbenennen', () => {
    // Beides zugleich nimmt croc nicht an; Ueberschreiben ist die
    // Vorgabe, weil eine abgebrochene Uebertragung sonst eine Datei
    // voller Nullen liegen laesst, die niemand mehr ersetzen kann.
    const args = buildReceive({ overwrite: true, rename: true }, leer());
    assert.ok(args.includes('--overwrite'));
    assert.ok(!args.includes('--rename'));
  });

  await t.test('Umbenennen allein bleibt moeglich', () => {
    const args = buildReceive({ rename: true }, leer());
    assert.ok(args.includes('--rename'));
    assert.ok(!args.includes('--overwrite'));
  });

  await t.test('Zielordner wird gesetzt', () => {
    const args = buildReceive({ outDir: '/Users/x/Downloads' }, leer());
    assert.deepEqual(args.slice(-2), ['--out', '/Users/x/Downloads']);
  });

  await t.test('der Code steht in keinem Argument', () => {
    // Er geht ueber CROC_SECRET, aus demselben Grund wie das Passwort.
    const args = buildReceive({ code: 'apfel-berg-cent', outDir: '/tmp' }, leer());
    assert.ok(!args.join(' ').includes('apfel-berg-cent'));
  });
});

test('Relay', async (t) => {
  await t.test('fuenf Ports aus den Einstellungen', () => {
    // Ein Relay braucht alle fuenf: 9009 vermittelt, 9010-9013 tragen.
    const args = buildRelay({}, { ...leer(), relayPorts: '9009,9010,9011,9012,9013' });
    assert.deepEqual(args, ['relay', '--ports', '9009,9010,9011,9012,9013']);
  });

  await t.test('die Angabe am Vorgang schlaegt die Einstellung', () => {
    const args = buildRelay({ ports: '9309,9310' }, { ...leer(), relayPorts: '9009' });
    assert.deepEqual(args.slice(-1), ['9309,9310']);
  });

  await t.test('ohne Angabe entscheidet croc selbst', () => {
    assert.deepEqual(buildRelay({}, leer()), ['relay']);
  });

  await t.test('Leerzeichen um die Ports werden nicht mitgeschickt', () => {
    assert.deepEqual(buildRelay({ ports: '  9009,9010  ' }, leer()), ['relay', '--ports', '9009,9010']);
  });
});
