# CrocGUI

von **thecrafti87** — croc von **Zack Scholl**

Eine Desktop-Oberflaeche fuer [croc](https://github.com/schollz/croc) — dem
Werkzeug, mit dem sich Dateien direkt zwischen zwei Rechnern uebertragen
lassen, Ende-zu-Ende verschluesselt und ohne Cloud dazwischen.

CrocGUI ruft das vorhandene `croc`-Programm auf und macht dessen Ausgabe
sichtbar: Code-Wortgruppe gross und kopierbar, QR-Code daneben, Fortschritt
als Balken statt als Zeichensalat im Terminal.

Die Oberflaeche spricht **Englisch, Deutsch und Franzoesisch**; umgeschaltet
wird oben rechts in der Titelleiste. Voreingestellt ist Englisch.

## croc ist mit dabei

Die gebaute App bringt croc mit — es muss nichts vorinstalliert sein. Das
Binary liegt in `CrocGUI.app/Contents/Resources/croc`, und mit jeder neuen
CrocGUI-Fassung kommt die darin eingefrorene croc-Fassung mit. Welche das
ist, steht unter *Einstellungen*, zusammen mit einem Abgleich gegen die
neueste croc-Veroeffentlichung.

Die Suche laeuft in dieser Reihenfolge:

1. der unter *Einstellungen* eingetragene Pfad
2. das mitgelieferte croc
3. `PATH` und die ueblichen Orte (`/opt/homebrew/bin`, `/usr/local/bin`,
   `~/go/bin`, `~/.local/bin`)

Das mitgelieferte kommt bewusst vor dem des Systems: so ist die Fassung
vorhersagbar. Wer sein eigenes croc will, traegt den Pfad ein.

## Voraussetzungen

- macOS (arm64 oder x64)
- Node.js 20 oder neuer, nur zum Bauen

## Starten

```bash
npm install
npm run fetch-croc
npm start
```

`fetch-croc` laedt die croc-Binaries fuer beide Architekturen nach
`vendor/`. Ohne diesen Schritt greift CrocGUI in der Entwicklung auf ein
croc aus dem System zurueck, sofern eines da ist.

Eine verteilbare App bauen:

```bash
npm run dist
```

Das Ergebnis landet in `build/`. Die Binaries werden vorher automatisch
geholt (`predist`), festgelegt ueber das Feld `crocVersion` in der
`package.json`. Auf eine neuere croc-Fassung wechseln:

```bash
npm run fetch-croc:latest
```

Das traegt die neue Fassung gleich in die `package.json` ein. `vendor/`
gehoert nicht ins Repository.

## Was die Oberflaeche kann

**Senden** — Dateien und Ordner per Drag & Drop aus dem Finder oder ueber den
Dateidialog. Alternativ Text oder eine URL statt einer Datei. Sobald croc die
Code-Wortgruppe ausgibt, erscheint sie gross im Fenster, dazu Knoepfe zum
Kopieren des Codes, des fertigen Befehls fuer die Gegenstelle und ein
QR-Code. Pro Uebertragung einstellbar: eigener Code, Ordner vorher zippen,
`.gitignore` beachten, Dateien ausschliessen, verschluesselte Zwischenlagerung
beim Anbieter (fuer den Fall, dass die Gegenstelle gerade nicht online ist).

**Empfangen** — Code eintippen oder einfuegen, Zielordner waehlen, fertig.
Bei Namenskonflikten wahlweise ueberschreiben oder unter neuem Namen sichern.

**Relay** — Startet `croc relay` auf diesem Rechner samt Protokollausgabe.
Wer die Relay-Adresse auf beiden Seiten unter *Einstellungen* eintraegt,
haelt den gesamten Verkehr im eigenen Netz.

**Kontakte** — ein fester Code je Gegenstelle, damit die Woerter nicht jedes
Mal neu ausgetauscht werden muessen. Beim Anlegen wuerfelt die App den Code
aus kryptografisch sicherem Zufall (sechs Woerter, rund 50 Bit). In *Senden*
und *Empfangen* erscheint dann ein Auswahlfeld mit den Namen, und die
Uebertragungskarte zeigt "Datei → Max" statt nur den Code.

**Verlauf** — Jede Uebertragung mit Zeit, Groesse und Gegenstelle.
Sendungen lassen sich mit einem Klick wiederholen, bei Empfaengen fuehrt
ein Knopf in den Zielordner. Codes werden bewusst nicht aufbewahrt.

**Menueleiste** — Ein Krokodil oben rechts. Dateien lassen sich direkt
darauf ziehen, ohne das Fenster zu oeffnen. Abschaltbar.

**Aus dem Finder** — Rechtsklick auf Dateien, *Oeffnen mit* → CrocGUI,
und sie landen in der Sendeliste. Wer es kuerzer will, richtet unter
*Einstellungen* den Finder-Kurzbefehl ein; der steht dann als eigener
Eintrag unter *Kurzbefehle* im Kontextmenue.

**Einstellungen** — Relay-Adresse und -Passwort, Verschluesselungskurve,
Standard-Zielordner, Pruefsummen-Verfahren, Upload-Drosselung, SOCKS5-Proxy.
Wird sofort gespeichert, unter
`~/Library/Application Support/croc-gui/settings.json`.

Mehrere Uebertragungen laufen gleichzeitig, jede mit eigener Karte,
Abbrechen-Knopf und aufklappbarem Protokoll.

## Zum Aufbau

```
scripts/fetch-croc.js  croc-Binaries holen und nach vendor/ legen
src/main/main.js       Fenster, Menue, IPC-Endpunkte, Versionspruefung
src/main/croc.js       croc finden, Kommandozeilen bauen, Ausgabe auswerten
src/main/settings.js   Einstellungen laden und sichern
src/main/words.js      Wortschatz und Wuerfel fuer feste Codes
src/main/preload.js    Bruecke zum Renderer (contextIsolation ist aktiv)
src/renderer/i18n.js   Sprachtabellen (en, de, fr) - auch vom Menue genutzt
src/renderer/          Oberflaeche: index.html, styles.css, app.js
```

Neue Sprache hinzufuegen: in `src/renderer/i18n.js` einen Eintrag in `LANGS`
ergaenzen und die Tabelle darunter kopieren und uebersetzen. Fehlt ein
Schluessel, faellt er automatisch auf Englisch zurueck.

Zwei Details, die beim Bauen wichtig waren:

- **Der Code steht nie in der Prozessliste.** Sowohl beim Senden als auch
  beim Empfangen wandert die Wortgruppe ueber die Umgebungsvariable
  `CROC_SECRET` zu croc, nicht als Argument. Ein `ps` auf dem Rechner zeigt
  ihn damit nicht an.
- **`--ignore-stdin` ist gesetzt.** Ohne das haelt croc die geschlossene
  Standardeingabe des Kindprozesses fuer gepipte Daten und wuerde diese statt
  der ausgewaehlten Dateien senden.

Die Fortschrittsanzeige entsteht durch Auswerten der croc-Ausgabe. Nach der
Uebertragung haengt croc einen zweiten Balken (`Hashing ...`) fuer die
Nachpruefung an — der wird getrennt behandelt und setzt den Fortschritt
nicht zurueck.

## Selbsttest

Unter *Einstellungen* steht oben ein Selbsttest, der beim ersten Blick
dorthin von selbst durchlaeuft. Er prueft nur, was sich wirklich pruefen
laesst: ob croc da ist, ob sich in den Zielordner schreiben laesst
(echter Schreibversuch), wie viel Platz frei ist, ob das Relay antwortet
(echte Verbindung samt Laufzeit) und ob der Finder-Kurzbefehl liegt.

Ob Mitteilungen erlaubt sind, verraet macOS einer App nicht. Statt etwas
zu behaupten, steht dort ein Knopf, der eine echte Testmitteilung
schickt - kommt sie an, ist alles gut. Daneben Knuepfe, die direkt die
passende Seite der Systemeinstellungen oeffnen.

## Nach der Installation

Einzurichten ist nichts: croc ist dabei, ein Relay ist voreingestellt,
der Zielordner ist "Downloads".

Die einzige Huerde ist der erste Start. Weil die App nicht signiert ist,
verweigert macOS sie zunaechst: Rechtsklick auf die App, dann *Oeffnen*,
im Dialog nochmal *Oeffnen*. Danach nie wieder. Die App kann sich das
nicht selbst erlauben - genau davon lebt der Schutz. Nur eine
Apple-Developer-ID nimmt diese Huerde weg.

## Zu den Aktualisierungen

Beim Start sieht CrocGUI bei GitHub nach, ob unter
`thecrafti87/CrocGUI` eine neuere Fassung veroeffentlicht wurde. Wenn ja,
erscheint oben ein Band mit einem Knopf zum Download. Abschaltbar unter
*Einstellungen*.

Weil croc mitgeliefert wird, aktualisiert eine neue CrocGUI-Fassung auch
croc gleich mit. Unabhaengig davon gleicht die App die laufende
croc-Fassung mit der neuesten Veroeffentlichung ab und schreibt das
Ergebnis unter *Einstellungen* — ist croc dort weiter, weisst du, dass sich
ein neuer Build lohnt.

CrocGUI aktualisiert sich **nicht selbst**. Stilles Selbstaktualisieren
setzt auf macOS eine mit einer Apple-Developer-ID signierte und notarisierte
App voraus — Squirrel.Mac verweigert sonst das Einspielen. Sobald ein
Signaturzertifikat vorliegt, laesst sich `electron-updater` ergaenzen; die
Veroeffentlichung ueber `electron-builder --publish` ist in `package.json`
bereits eingetragen.

Fassungen veroeffentlichen:

```bash
npm version patch && npm run dist -- --publish always
```

## Pruefsummen

Beim Senden legt die App eine Liste mit SHA-256 je Datei bei
(`crocgui-manifest.json`). Der Empfaenger rechnet sie ueber das nach, was
tatsaechlich auf seiner Platte liegt, zeigt das Ergebnis an der
Uebertragungskarte und im Verlauf, und loescht die Liste danach wieder.

Warum nicht einfach Groesse und Datum vergleichen: eine abgebrochene
croc-Uebertragung hinterlaesst eine Datei in exakt richtiger Groesse mit
frischem Datum, in der der fehlende Teil aus Nullen besteht. Jede Pruefung
ohne Inhalt bescheinigt so einem Torso Fehlerfreiheit. Nachgestellt: eine
zur Haelfte genullte Datei mit stimmender Groesse wird als falsch erkannt,
eine fehlende als fehlend.

Die Liste geht als erste Datei mit, nicht als letzte. Am Ende waere sie
bei einem Abbruch das Erste, was fehlt - also genau dann nicht da, wenn
man sie braucht. Und nachgerechnet wird auch nach einem Abbruch oder
Fehlschlag, nicht nur nach einer geglueckten Uebertragung.

An einer echt abgebrochenen Uebertragung nachgestellt: von drei Dateien
kam eine heil an, eine mit richtiger Groesse und 3,1 MB Nullen darin, die
dritte gar nicht. Die Pruefung meldet genau das - eine in Ordnung, eine
falsch, eine fehlt.

Laeuft auf der Gegenseite kein CrocGUI, fehlt die Liste einfach - dann
steht dort "keine Pruefsummen dabei", und sonst passiert nichts.
Abschaltbar unter *Einstellungen*. Beim Zippen entfaellt die Liste, weil
ein Archiv sich beim Oeffnen selbst prueft.

## Warum beim Empfangen ueberschrieben wird

croc legt die Zieldatei sofort in voller Groesse an. Bricht eine
Uebertragung ab, bleibt eine Datei mit der richtigen Groesse liegen, in
der der fehlende Teil aus Nullen besteht. Startet man denselben Code
erneut, haelt croc diesen Torso fuer vollstaendig: der Sender uebertraegt
nichts mehr, croc endet mit 0 - und niemand erfaehrt, dass ein Loch in
der Datei klafft.

Zweimal nachgestellt, einmal mit hartem Abschuss des Empfaengers, einmal
mit SIGINT: 8 bzw. 13 MB Nullen bei gemeldetem Erfolg. Mit `--overwrite`
wird sauber neu uebertragen und die Datei stimmt.

Deshalb ist *Ueberschreiben* die Voreinstellung, und die frueher
vorhandene Moeglichkeit, ohne Ueberschreiben zu empfangen, gibt es nicht
mehr. Wer die vorhandene Datei behalten will, waehlt *Unter neuem Namen
sichern* - auch das ueberttraegt vollstaendig neu.

## Bewusst weggelassen

Ein "auf jemanden warten", das eine Mitteilung ausloest, sobald die
Gegenstelle sendet, ist mit croc nicht moeglich. Der Sender muss zuerst
im Raum sein; ein wartender Empfaenger belegt ihn und laesst genau die
Uebertragung scheitern, auf die er wartet ("could not secure channel").
Nachgestellt mit zwei croc-Prozessen ohne die App - es liegt an croc,
nicht an der Oberflaeche.

Die globale Option `--local` taucht in der Oberflaeche nicht auf. Sie laesst
die empfangende Seite ohne zusaetzliche `--ip`-Angabe ins Leere laufen
(*"found no addresses to connect"*) und waere als einfacher Schalter eine
Falle. croc bevorzugt Verbindungen im lokalen Netz ohnehin von selbst.

## Lizenz

MIT. croc selbst stammt von Zack Scholl und steht ebenfalls unter MIT.
