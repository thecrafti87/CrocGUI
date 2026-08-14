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

## Voraussetzungen

- macOS mit installiertem `croc` (getestet mit 11.1.0)
- Node.js 20 oder neuer

```bash
brew install croc
```

Findet CrocGUI das Programm nicht selbst, laesst sich der Pfad unter
*Einstellungen* eintragen.

## Starten

```bash
npm install
npm start
```

Eine verteilbare App bauen:

```bash
npm run dist
```

Das Ergebnis landet in `build/`.

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

**Einstellungen** — Relay-Adresse und -Passwort, Verschluesselungskurve,
Standard-Zielordner, Pruefsummen-Verfahren, Upload-Drosselung, SOCKS5-Proxy.
Wird sofort gespeichert, unter
`~/Library/Application Support/croc-gui/settings.json`.

Mehrere Uebertragungen laufen gleichzeitig, jede mit eigener Karte,
Abbrechen-Knopf und aufklappbarem Protokoll.

## Zum Aufbau

```
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

## Zu den Aktualisierungen

Beim Start sieht CrocGUI bei GitHub nach, ob unter
`thecrafti87/CrocGUI` eine neuere Fassung veroeffentlicht wurde. Wenn ja,
erscheint oben ein Band mit einem Knopf zum Download. Abschaltbar unter
*Einstellungen*.

Es aktualisiert sich damit **nicht selbst**. Stilles Selbstaktualisieren
setzt auf macOS eine mit einer Apple-Developer-ID signierte und notarisierte
App voraus — Squirrel.Mac verweigert sonst das Einspielen. Sobald ein
Signaturzertifikat vorliegt, laesst sich `electron-updater` ergaenzen; die
Veroeffentlichung ueber `electron-builder --publish` ist in `package.json`
bereits eingetragen.

Fassungen veroeffentlichen:

```bash
npm version patch && npm run dist -- --publish always
```

## Bewusst weggelassen

Die globale Option `--local` taucht in der Oberflaeche nicht auf. Sie laesst
die empfangende Seite ohne zusaetzliche `--ip`-Angabe ins Leere laufen
(*"found no addresses to connect"*) und waere als einfacher Schalter eine
Falle. croc bevorzugt Verbindungen im lokalen Netz ohnehin von selbst.

## Lizenz

MIT. croc selbst stammt von Zack Scholl und steht ebenfalls unter MIT.
