'use strict';

/* =================================================================
   Unter welchen Adressen ist dieser Rechner erreichbar?

   Ein eigenes Relay nuetzt nichts, wenn die Gegenstelle nicht weiss,
   wohin sie sich wenden soll. Die App wusste das bisher auch nicht -
   im Protokoll stand woertlich "<diese-ip>".
   ================================================================= */

const os = require('os');

/**
 * Wofuer taugt eine Adresse aus Sicht der Gegenstelle?
 *   vpn    - ueber ein VPN wie Tailscale, von ueberall erreichbar
 *   lan    - nur im selben Netz
 *   public - aus dem Internet, sofern die Ports offen sind
 */
function kindOf(addr, v4) {
  if (v4) {
    // 100.64/10 ist der Bereich, den Tailscale & Co. benutzen.
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(addr)) return 'vpn';
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(addr)) return 'lan';
    return 'public';
  }
  if (/^fd7a:115c:a1e0/i.test(addr)) return 'vpn';
  if (/^(fc|fd)/i.test(addr)) return 'lan';
  return 'public';
}

/**
 * Alle brauchbaren Adressen dieses Rechners, die Nuetzlichste zuerst.
 * Ausgelassen wird, was der Gegenstelle nichts nuetzt: Rueckschleife,
 * Verbindungslokales und die Adressen abgeschalteter Schnittstellen.
 */
function local() {
  const out = [];
  const nets = os.networkInterfaces();

  for (const [name, list] of Object.entries(nets)) {
    for (const net of list || []) {
      if (net.internal) continue;

      const v4 = net.family === 'IPv4' || net.family === 4;
      const v6 = net.family === 'IPv6' || net.family === 6;
      if (!v4 && !v6) continue;
      // fe80:: ist nur auf demselben Kabel gueltig und ohne Zonenangabe
      // wertlos - das verwirrt mehr, als es hilft.
      if (v6 && /^fe80:/i.test(net.address)) continue;

      out.push({ name, address: net.address, family: v4 ? 4 : 6, kind: kindOf(net.address, v4) });
    }
  }

  // VPN zuerst (von ueberall erreichbar), dann eigenes Netz, dann der
  // Rest; IPv4 vor IPv6, weil es sich leichter abtippen laesst.
  const rang = { vpn: 0, lan: 1, public: 2 };
  out.sort((a, b) => (rang[a.kind] - rang[b.kind]) || (a.family - b.family));
  return out;
}

/** Die Adresse, die man einer Gegenstelle im selben Netz nennen wuerde. */
function preferred() {
  const all = local();
  return all.find((a) => a.family === 4) || all[0] || null;
}

module.exports = { local, preferred };
