'use strict';

/* =================================================================
   Nachforderungen.

   Wenn beim Empfaenger Dateien fehlen, geht eine Liste ihrer Namen
   zurueck an den Sender - kopiert oder als Nachricht. Sie enthaelt
   genau die Namen aus der Pruefsummenliste, sonst nichts.

   Die Kopfzeile ist bewusst nicht uebersetzt: die beiden Rechner
   koennen auf verschiedene Sprachen eingestellt sein, und eine
   Nachforderung, die nur auf Deutsch wiedererkannt wird, waere keine.
   ================================================================= */

const REQUEST_HEAD = 'CrocGUI-REQUEST v1';

/** Baut die Liste, die der Sender einfuegt. */
function makeRequest(names) {
  return [REQUEST_HEAD, ...names].join('\n');
}

/**
 * Liest eine Nachforderung wieder aus. Gibt die geforderten Namen
 * zurueck - oder null, wenn das gar keine ist. Was der Benutzer aus
 * einem Chatfenster kopiert, hat gern Leerzeilen und eingerueckte
 * Zeilen; beides ist hier ohne Bedeutung.
 */
function readRequest(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim());
  if (!lines.length || !/^CrocGUI-REQUEST\b/i.test(lines[0])) return null;
  const names = lines.slice(1).filter(Boolean);
  return names.length ? names : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REQUEST_HEAD, makeRequest, readRequest };
}
