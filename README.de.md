# CrocGUI

von **thecrafti87** — croc von **Zack Scholl**

[🇬🇧 English](README.md) · 🇩🇪 Deutsch

Eine Desktop-Oberfläche für [croc](https://github.com/schollz/croc) — dem
Werkzeug, mit dem sich Dateien direkt zwischen zwei Rechnern übertragen lassen,
Ende-zu-Ende verschlüsselt und ohne Cloud dazwischen.

CrocGUI ruft croc auf und macht dessen Ausgabe lesbar: Code-Wortgruppe groß und
kopierbar, QR-Code daneben, Fortschritt als Balken statt als Zeichensalat im
Terminal.

Die Oberfläche spricht **Englisch, Deutsch und Französisch**; umgeschaltet wird
oben rechts. Voreingestellt ist Englisch.

## Installieren

Das passende DMG unter
[Releases](https://github.com/thecrafti87/CrocGUI/releases/latest) holen:

| Datei | für |
|---|---|
| `CrocGUI-<Fassung>-arm64.dmg` | Apple Silicon (M1–M4) |
| `CrocGUI-<Fassung>-x64.dmg` | Intel |

Sonst wird nichts gebraucht — croc steckt in der App.

### Erster Start

Die App ist nicht mit einer Apple-Developer-ID signiert, deshalb blockiert macOS
sie beim ersten Mal. Der früher übliche Rechtsklick → Öffnen hilft seit macOS 15
nicht mehr, Apple hat diesen Weg entfernt.

1. App starten, die Meldung mit **Fertig** schließen
2. **Systemeinstellungen → Datenschutz & Sicherheit** öffnen
3. Ganz nach unten scrollen, bei „CrocGUI wurde blockiert“ auf
   **Trotzdem öffnen** klicken

Schneller im Terminal, ohne Administratorkennwort:

```bash
xattr -dr com.apple.quarantine /Applications/CrocGUI.app
```

Beides ist nur einmal nötig. Die App kann sich das nicht selbst erlauben — genau
davon lebt der Schutz.

## Was die Oberfläche kann

**Senden** — Dateien und Ordner per Drag & Drop aus dem Finder oder über den
Dateidialog. Sobald croc die Code-Wortgruppe ausgibt, erscheint sie groß im
Fenster, dazu Knöpfe zum Kopieren des Codes, des fertigen Befehls für die
Gegenstelle und ein QR-Code. Pro Übertragung einstellbar: eigener Code, Ordner
vorher zippen, `.gitignore` beachten, Dateien ausschließen, Zwischenlagerung
beim Anbieter.

**Text** — Statt Dateien lässt sich auch reiner Text senden. Der kommt nicht als
Datei an, sondern wird auf der Empfangskarte angezeigt, mit Knopf zum Kopieren.
Ein Hinweis unter dem Feld sagt, dass croc den Text als Argument entgegennimmt —
er ist darum kurzzeitig in der Prozessliste des sendenden Rechners sichtbar. Für
ein Geheimnis also lieber eine Datei.

**Empfangen** — Code eintippen oder einfügen, Zielordner wählen, fertig. Bei
Namenskonflikten überschreiben (die Voreinstellung, siehe unten) oder unter
neuem Namen sichern.

**Kontakte** — Ein fester Code je Gegenstelle, damit die Wörter nicht jedes Mal
neu ausgetauscht werden müssen. Die App würfelt den Code aus kryptografisch
sicherem Zufall (sechs Wörter, rund 50 Bit). In *Senden* und *Empfangen*
erscheint dann ein Auswahlfeld mit den Namen, und die Übertragungskarte zeigt
„Datei → Max“ statt nur den Code.

**Relay** — Startet `croc relay` auf diesem Rechner samt Protokollausgabe. Wer
die Adresse auf beiden Seiten unter *Einstellungen* einträgt, hält den gesamten
Verkehr im eigenen Netz.

**Verlauf** — Jede Übertragung mit Zeit, Größe und Gegenstelle. Sendungen lassen
sich mit einem Klick wiederholen, bei Empfängen führt ein Knopf in den
Zielordner. Codes werden bewusst nicht aufbewahrt.

**Menüleiste** — Ein Krokodil oben rechts. Dateien lassen sich direkt darauf
ziehen, ohne das Fenster zu öffnen. Abschaltbar.

**Aus dem Finder** — Rechtsklick auf Dateien, *Öffnen mit* → CrocGUI, und sie
landen in der Sendeliste. Wer es kürzer will, richtet unter *Einstellungen* den
Finder-Kurzbefehl ein; der steht dann als eigener Eintrag unter *Kurzbefehle*.

**Hilfe** — Ein eigener Reiter erklärt die App in der eingestellten Sprache: was
jeder Bereich tut und wo croc seine Kanten hat.

**Einstellungen** — Relay-Adresse und -Passwort, Verschlüsselungskurve,
Standard-Zielordner, Prüfsummen-Verfahren, Upload-Drosselung, SOCKS5-Proxy.
Wird sofort gespeichert, unter
`~/Library/Application Support/croc-gui/settings.json`.

Mehrere Übertragungen laufen gleichzeitig, jede mit eigener Karte,
Abbrechen-Knopf und aufklappbarem Protokoll.

## Selbsttest

Unter *Einstellungen* steht oben ein Selbsttest, der beim ersten Blick dorthin
von selbst durchläuft. Er prüft nur, was sich wirklich prüfen lässt: ob croc da
ist, ob sich in den Zielordner schreiben lässt (echter Schreibversuch), wie viel
Platz frei ist, ob das Relay antwortet (echte Verbindung samt Laufzeit) und ob
der Finder-Kurzbefehl liegt.

Ob Mitteilungen erlaubt sind, verrät macOS einer App nicht. Statt etwas zu
behaupten, steht dort ein Knopf, der eine echte Testmitteilung schickt — kommt
sie an, ist die Frage beantwortet. Daneben Knöpfe, die direkt die passende Seite
der Systemeinstellungen öffnen.

## Aktualisieren

Beim Start sieht CrocGUI bei GitHub nach, ob eine neuere Fassung veröffentlicht
wurde. Wenn ja, erscheint oben ein Band mit zwei Knöpfen: **Laden und neu
starten**, das alles in der App erledigt, und ein schlichter Verweis auf die
Download-Seite. Abschaltbar unter *Einstellungen*.

Seit 1.8.0 lädt die App eine neue Fassung selbst herunter, tauscht sich aus und
startet neu — ohne Signatur. `electron-updater` kann das nicht, weil dessen Weg
über Squirrel die Signatur prüft; der Tausch von Hand geht trotzdem. Angenehmer
Nebeneffekt: was die App selbst lädt, bekommt kein Quarantäne-Merkmal, die neue
Fassung startet also ohne Gatekeeper-Meldung.

Was dabei **nicht** geschieht: eine kryptografische Prüfung der Herkunft. Ohne
Signatur stützt sich das Vertrauen auf HTTPS und GitHub — dasselbe wie beim
Herunterladen von Hand. Geprüft werden Größe und Fassungsnummer im Paket; stimmt
etwas nicht, bleibt alles unverändert. Beim Tausch wird das alte Paket erst
beiseite geschoben und nur bei Erfolg gelöscht.

## croc ist mit dabei

Die gebaute App bringt croc mit. Das Binary liegt in
`CrocGUI.app/Contents/Resources/croc`, und mit jeder CrocGUI-Fassung kommt die
darin eingefrorene croc-Fassung mit. Welche das ist, steht unter
*Einstellungen*, zusammen mit einem Abgleich gegen die neueste
croc-Veröffentlichung.

Ein Knopf dort holt die neueste croc-Fassung und legt sie neben die
Einstellungen; von da an wird sie bevorzugt benutzt, ohne das mitgelieferte croc
anzurühren. Ein zweiter Knopf schaltet zurück.

Die Suche läuft in dieser Reihenfolge:

1. der unter *Einstellungen* eingetragene Pfad
2. ein von der App geholtes croc
3. das mitgelieferte croc
4. `PATH` und die üblichen Orte (`/opt/homebrew/bin`, `/usr/local/bin`,
   `~/go/bin`, `~/.local/bin`)

Das mitgelieferte kommt bewusst vor dem des Systems: so ist die Fassung
vorhersagbar. Wer sein eigenes croc will, trägt den Pfad ein.

## Prüfsummen

Beim Senden legt die App eine Liste mit SHA-256 je Datei bei
(`crocgui-manifest.json`). Der Empfänger rechnet sie über das nach, was
tatsächlich auf seiner Platte liegt, zeigt das Ergebnis an der Übertragungskarte
und im Verlauf, und löscht die Liste danach wieder.

Warum nicht einfach Größe und Datum vergleichen: eine abgebrochene
croc-Übertragung hinterlässt eine Datei in exakt richtiger Größe mit frischem
Datum, in der der fehlende Teil aus Nullen besteht. Jede Prüfung ohne Inhalt
bescheinigt so einem Torso Fehlerfreiheit. Nachgestellt: eine zur Hälfte
genullte Datei mit stimmender Größe wird als falsch erkannt, eine fehlende als
fehlend.

Die Liste geht als **erste** Datei mit, nicht als letzte. Am Ende wäre sie bei
einem Abbruch das Erste, was fehlt — also genau dann nicht da, wenn man sie
braucht. Und nachgerechnet wird auch nach einem Abbruch oder Fehlschlag, nicht
nur nach einer geglückten Übertragung.

An einer echt abgebrochenen Übertragung nachgestellt: von drei Dateien kam eine
heil an, eine mit richtiger Größe und 3,1 MB Nullen darin, die dritte gar nicht.
Die Prüfung meldet genau das — eine in Ordnung, eine falsch, eine fehlt.

Bei *Unter neuem Namen sichern* legt croc die neue Fassung als „name (1).ext“
neben den kaputten Rest. Die Prüfung sucht solche Ausweichnamen mit ab und
meldet dann „unter anderem Namen“ statt fälschlich „falsch“.

Läuft auf der Gegenseite kein CrocGUI, fehlt die Liste einfach — dann steht dort
„keine Prüfsummen dabei“, und sonst passiert nichts. Abschaltbar unter
*Einstellungen*. Die Liste geht auch beim Zippen mit: croc packt nur für den
Transport und entpackt beim Empfänger wieder, die Namen stimmen also weiterhin.

## Warum beim Empfangen überschrieben wird

croc legt die Zieldatei sofort in voller Größe an. Bricht eine Übertragung ab,
bleibt eine Datei mit der richtigen Größe liegen, in der der fehlende Teil aus
Nullen besteht. Startet man denselben Code erneut, hält croc diesen Torso für
vollständig: der Sender überträgt nichts mehr, croc endet mit 0 — und niemand
erfährt, dass ein Loch in der Datei klafft.

Zweimal nachgestellt, einmal mit hartem Abschuss des Empfängers, einmal mit
SIGINT: 8 bzw. 13 MB Nullen bei gemeldetem Erfolg. Mit `--overwrite` wird sauber
neu übertragen und die Datei stimmt.

Deshalb ist *Überschreiben* die Voreinstellung, und die früher vorhandene
Möglichkeit, ohne Überschreiben zu empfangen, gibt es nicht mehr. Wer die
vorhandene Datei behalten will, wählt *Unter neuem Namen sichern* — auch das
überträgt vollständig neu.

## Zwischenlagerung beim Anbieter

Mit dieser Option lädt croc die Dateien verschlüsselt zu getcroc.com, mit einer
Lebensdauer und einer Zahl erlaubter Abrufe. Die Gegenstelle muss nicht online
sein.

Wichtig zu wissen: eine Zwischenlagerung hat **keine Code-Wortgruppe**. croc
gibt stattdessen einen Browser-Link, ein Token für die Kommandozeile und eine
Kennung zum Widerrufen aus. Nur damit kommt jemand an die Daten — der Code im
Sendefenster nützt hier nichts.

Abgeholt wird sie, indem das Token ins selbe Feld kommt wie sonst die
Code-Wortgruppe; das funktioniert, weil die App alles über `CROC_SECRET`
weiterreicht. Als Argument nimmt croc so ein Token bewusst nicht an: der
Schlüssel steckt darin und stünde sonst in der Prozessliste.

Die App zeigt alle drei Angaben deshalb groß an der Übertragungskarte, mit
Knöpfen zum Kopieren, zum Öffnen im Browser und zum Widerrufen. Und sie merkt
sie sich im Verlauf: wären sie nur in der Karte, wären die Daten nach dem
Schließen der App unerreichbar.

## .gitignore und Ausschlüsse

Zwei Beobachtungen, die man kennen sollte:

croc liest `.gitignore` nur teilweise. Einfache Namen (`geheim.txt`) und Muster
(`*.log`) greifen, Ordnerregeln wie `node_modules/` nicht — `git check-ignore`
hält die Datei für ignoriert, croc schickt sie trotzdem. Und der Ordner `.git`
selbst geht immer mit, samt vollständiger Historie.

`--exclude` ist ein schlichter Textvergleich über den ganzen Pfad. Der Eintrag
`.git` wirft deshalb auch `.gitignore` mit hinaus.

Die Prüfsummenliste bildet die Ausschlüsse nach, damit ausgelassene Dateien
nicht fälschlich als „fehlend“ gemeldet werden. Bei aktiviertem `.gitignore`
entfällt die Liste dagegen ganz: was croc dort weglässt, lässt sich nicht
vorhersagen.

## Bewusst weggelassen

Ein „auf jemanden warten“, das eine Mitteilung auslöst, sobald die Gegenstelle
sendet, ist mit croc nicht möglich. Der Sender muss zuerst im Raum sein; ein
wartender Empfänger belegt ihn und lässt genau die Übertragung scheitern, auf
die er wartet („could not secure channel“). Nachgestellt mit zwei
croc-Prozessen ohne die App — es liegt an croc, nicht an der Oberfläche.

Die globale Option `--local` taucht in der Oberfläche nicht auf. Sie lässt die
empfangende Seite ohne zusätzliche `--ip`-Angabe ins Leere laufen („found no
addresses to connect“) und wäre als einfacher Schalter eine Falle. croc
bevorzugt Verbindungen im lokalen Netz ohnehin von selbst.

## Selbst bauen

Voraussetzungen: macOS (arm64 oder x64) und Node.js 20 oder neuer.

```bash
npm install
npm run fetch-croc
npm start
```

`fetch-croc` lädt die croc-Binaries für beide Architekturen nach `vendor/`.
Ohne diesen Schritt greift CrocGUI in der Entwicklung auf ein croc aus dem
System zurück, sofern eines da ist.

Eine verteilbare App bauen:

```bash
npm run dist
```

Das Ergebnis landet in `build/`. Die Binaries werden vorher automatisch geholt
(`predist`), festgelegt über das Feld `crocVersion` in der `package.json`. Auf
eine neuere croc-Fassung wechseln:

```bash
npm run fetch-croc:latest
```

Das trägt die neue Fassung gleich in die `package.json` ein. `vendor/` gehört
nicht ins Repository.

Fassungen veröffentlichen:

```bash
npm version patch && npm run dist -- --publish always
```

## Zum Aufbau

```
scripts/fetch-croc.js    croc-Binaries holen und nach vendor/ legen
scripts/make-icon.js     icon.icns und die Menüleisten-Bilder aus icon.svg
src/main/main.js         Fenster, Menü, IPC-Endpunkte
src/main/croc.js         croc finden, Kommandozeilen bauen, Ausgabe auswerten
src/main/manifest.js     Prüfsummen: Liste bauen, Liste nachrechnen
src/main/selfupdate.js   neue Fassung laden, tauschen, neu starten
src/main/crocupdate.js   neueres croc in den eigenen Ordner holen
src/main/diagnose.js     der Selbsttest
src/main/settings.js     Einstellungen laden und sichern
src/main/history.js      der Übertragungsverlauf
src/main/words.js        Wortschatz und Würfel für feste Codes
src/main/quickaction.js  der Finder-Kurzbefehl
src/main/preload.js      Brücke zum Renderer (contextIsolation ist aktiv)
src/renderer/i18n.js     Sprachtabellen (en, de, fr) — auch vom Menü genutzt
src/renderer/help.js     die Hilfetexte, je Sprache
src/renderer/           Oberfläche: index.html, styles.css, app.js
```

Neue Sprache hinzufügen: in `src/renderer/i18n.js` einen Eintrag in `LANGS`
ergänzen, die Tabelle darunter kopieren und übersetzen; dasselbe in `help.js`.
Fehlt ein Schlüssel, fällt er automatisch auf Englisch zurück.

Zwei Details, die beim Bauen wichtig waren:

- **Weder Code noch Relay-Passwort stehen in der Prozessliste.** Die
  Code-Wortgruppe erreicht croc über `CROC_SECRET`, das Relay-Passwort über
  `CROC_PASS` — nie als Argument. Ein `ps` zeigt beides nicht an, nachgeprüft an
  der laufenden Kommandozeile. Beim Code lässt croc auf UNIX ohnehin keinen
  anderen Weg zu: `--code` wird dort mit dem Hinweis auf `CROC_SECRET`
  abgelehnt.
- **`--ignore-stdin` ist gesetzt.** Ohne das hält croc die geschlossene
  Standardeingabe des Kindprozesses für gepipte Daten und würde diese statt der
  ausgewählten Dateien senden.

Die Fortschrittsanzeige entsteht durch Auswerten der croc-Ausgabe. Nach der
Übertragung hängt croc einen zweiten Balken (`Hashing …`) für die Nachprüfung
an — der wird getrennt behandelt und setzt den Fortschritt nicht zurück.

## Lizenz

MIT. croc selbst stammt von Zack Scholl und steht ebenfalls unter MIT.
