'use strict';

/* =================================================================
   Unter welcher Adresse ist dieser Rechner erreichbar?

   Die Einteilung entscheidet, was in der App neben einer Adresse steht:
   "von ueberall erreichbar" oder "nur im selben Netz". Steht das Falsche
   da, traegt jemand eine Adresse ein, unter der ihn nie jemand findet.
   Die Grenzen der Bereiche sind die Stellen, an denen man sich vertut.
   ================================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');

const { kindOf, local, preferred } = require('../src/main/addresses');

const v4 = (addr) => kindOf(addr, true);
const v6 = (addr) => kindOf(addr, false);

test('VPN-Adressen', async (t) => {
  await t.test('Tailscale & Co. liegen in 100.64.0.0/10', () => {
    for (const addr of ['100.64.0.1', '100.88.141.70', '100.100.0.1', '100.127.255.255']) {
      assert.equal(v4(addr), 'vpn', addr);
    }
  });

  await t.test('knapp daneben ist kein VPN', () => {
    // 100.63.x und 100.128.x liegen ausserhalb des Bereichs und gehoeren
    // ganz normalen Rechnern im Internet.
    assert.equal(v4('100.63.255.255'), 'public');
    assert.equal(v4('100.128.0.1'), 'public');
    assert.equal(v4('100.200.0.1'), 'public');
  });

  await t.test('auch als IPv6', () => {
    assert.equal(v6('fd7a:115c:a1e0::7234:8d47'), 'vpn');
    assert.equal(v6('FD7A:115C:A1E0::1'), 'vpn');
  });
});

test('Adressen im eigenen Netz', async (t) => {
  await t.test('die drei privaten Bereiche und die Selbstvergabe', () => {
    for (const addr of ['10.0.0.5', '192.168.15.131', '172.16.0.1', '172.31.255.254', '169.254.1.1']) {
      assert.equal(v4(addr), 'lan', addr);
    }
  });

  await t.test('die Raender von 172.16/12 stimmen', () => {
    // 172.15 und 172.32 gehoeren nicht dazu - ein haeufiger Irrtum.
    assert.equal(v4('172.15.0.1'), 'public');
    assert.equal(v4('172.32.0.1'), 'public');
  });

  await t.test('eindeutig lokale IPv6-Adressen', () => {
    assert.equal(v6('fd00::1'), 'lan');
    assert.equal(v6('fc00::1'), 'lan');
  });
});

test('alles uebrige ist aus dem Internet erreichbar', () => {
  assert.equal(v4('134.255.10.20'), 'public');
  assert.equal(v4('8.8.8.8'), 'public');
  assert.equal(v6('2a00:ab61::1'), 'public');
});

test('die Liste dieses Rechners', async (t) => {
  const liste = local();

  await t.test('enthaelt nichts, was der Gegenstelle nichts nuetzt', () => {
    for (const a of liste) {
      assert.ok(!/^fe80:/i.test(a.address), `verbindungslokal: ${a.address}`);
      assert.notEqual(a.address, '127.0.0.1');
      assert.notEqual(a.address, '::1');
    }
  });

  await t.test('das Brauchbarste steht oben', () => {
    // VPN vor eigenem Netz vor dem Rest: eine VPN-Adresse funktioniert
    // ohne Router, ohne Portfreigabe, ohne DynDNS.
    const rang = { vpn: 0, lan: 1, public: 2 };
    for (let i = 1; i < liste.length; i++) {
      assert.ok(rang[liste[i - 1].kind] <= rang[liste[i].kind],
        `${liste[i - 1].kind} steht vor ${liste[i].kind}`);
    }
  });

  await t.test('jeder Eintrag ist vollstaendig', () => {
    for (const a of liste) {
      assert.ok(a.address && a.name, JSON.stringify(a));
      assert.ok([4, 6].includes(a.family));
      assert.ok(['vpn', 'lan', 'public'].includes(a.kind));
    }
  });

  await t.test('die vorgeschlagene Adresse stammt aus der Liste', () => {
    const beste = preferred();
    if (!liste.length) return assert.equal(beste, null);
    assert.ok(liste.some((a) => a.address === beste.address));
  });
});
