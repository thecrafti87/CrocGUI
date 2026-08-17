'use strict';

/* =================================================================
   Hilfetexte, je Sprache.

   Bewusst als eigene Datei: eine Erklaerung liest sich am Stueck
   besser, als sie sich aus dreissig einzelnen Schluesseln
   zusammensetzen laesst. Aufbau je Abschnitt:
     { title, body: [Absatz, ...], note?: Absatz }
   `note` wird hervorgehoben - dort stehen die Fallstricke.
   ================================================================= */

const HELP = {

  en: [
    {
      title: 'What this is',
      body: [
        'CrocGUI is a window around croc, a tool that moves files straight from one computer to another. Encrypted end to end, with no cloud storing your data along the way.',
        'The idea: one side picks the files and gets a code of three words. The other side types that code in. That is the whole handshake — the words are the key, and they are what turns the encryption. croc itself is shipped inside this app, so nothing else needs installing.'
      ]
    },
    {
      title: 'Sending',
      body: [
        'Drag files or folders onto the window, or drop them on the crocodile in the menu bar. From the Finder, right-click → Open With → CrocGUI does the same.',
        'Once the transfer starts, a code appears in large type. Pass it to the other side however you like — chat, phone, out loud. There is also a QR code and a button that copies the ready-made command for someone using croc in a terminal.',
        'Instead of files you can send plain text. The other side sees it on screen and can copy it; nothing is saved to disk.'
      ],
      note: 'The window has to stay open until the other side connects. The sender must be waiting first — a receiver who arrives too early does not just fail, it breaks the attempt.'
    },
    {
      title: 'Receiving',
      body: [
        'Type or paste the code, pick a target folder, done. A whole command line may be pasted too — the field takes the part that matters.',
        'A token from a parked transfer (croc-store-v1…) goes into the same field.'
      ],
      note: 'If a file of the same name already exists, it is overwritten by default, and that is deliberate. An interrupted croc transfer leaves a file of the full, correct size whose missing part is zeros. Without overwriting, the next attempt would take that stub for a complete file — right size, holes inside, no warning.'
    },
    {
      title: 'Contacts',
      body: [
        'A fixed code per counterpart, so the words need not be exchanged every time. Pick the name in Send or Receive and the code is filled in.',
        'Have the code rolled rather than inventing one. The button produces six random words, which is roughly fifty bits — not guessable in practice.'
      ],
      note: 'A fixed code is a permanent password. Whoever knows it gets the files, and whoever connects first wins. On the public relay that is a real risk, so use your own relay for permanent codes.'
    },
    {
      title: 'Relay',
      body: [
        'A relay is the switchboard that lets two computers find each other. By default that is a public server run by the croc project.',
        'The Relay tab starts one on this machine. Enter its address on both sides under Settings and nothing runs over foreign servers. A relay password keeps strangers out — wrong password, no connection.'
      ],
      note: 'When both machines are on the same network, croc connects them directly and the relay only brokers the introduction. The files then never touch it.'
    },
    {
      title: 'Parking at the provider',
      body: [
        'With this option the files are uploaded encrypted and wait there, for a lifetime and a number of downloads you set. The other side does not have to be online at the same time.',
        'A parked transfer has no code phrase. croc hands out a browser link, a token for the command line and an identifier for revoking. The card shows all three, and the history keeps them — they are the only way back to the data.'
      ]
    },
    {
      title: 'Checksums',
      body: [
        'When sending, the app computes a checksum per file and sends the list along. The receiving side recomputes it over what actually landed on disk and reports file by file.',
        'This exists because size and timestamp prove nothing here: a broken transfer leaves a file of exactly the right size with a fresh date.'
      ],
      note: 'The list is skipped when .gitignore is enabled — what croc leaves out there cannot be predicted.'
    },
    {
      title: 'Where it has limits',
      body: [
        'croc reads .gitignore only in part. Plain names and patterns like *.log work, folder rules such as node_modules/ do not. The .git folder itself always travels along, history included. Typing .git,node_modules into the exclude field is the more reliable route.',
        'A sent text is briefly visible in the process list of the sending computer, because croc takes it as an argument. Code phrases and relay passwords are not — they go through the environment. For a secret, send a file.',
        'There is no way to be notified when someone wants to send you something. croc has no such channel, and a receiver waiting in advance breaks the very transfer it waits for.'
      ]
    },
    {
      title: 'First start',
      body: [
        'Nothing needs configuring: croc is included, a relay is preset, the target folder is Downloads.',
        'The one hurdle is the first launch. Because the app is not signed, macOS refuses it: right-click the app, choose Open, then Open again in the dialog. After that, never again. The app cannot grant itself that — which is the entire point of the protection.'
      ]
    }
  ],

  de: [
    {
      title: 'Worum es geht',
      body: [
        'CrocGUI ist ein Fenster um croc — ein Werkzeug, das Dateien direkt von einem Rechner zum anderen schiebt. Verschlüsselt von Ende zu Ende, ohne dass unterwegs jemand die Daten lagert.',
        'Der Gedanke: eine Seite wählt die Dateien und bekommt einen Code aus drei Wörtern. Die andere Seite tippt ihn ein. Das ist der ganze Handschlag — die Wörter sind der Schlüssel, aus ihnen entsteht die Verschlüsselung. croc selbst steckt in dieser App, es muss also nichts zusätzlich installiert werden.'
      ]
    },
    {
      title: 'Senden',
      body: [
        'Dateien oder Ordner ins Fenster ziehen, oder auf das Krokodil in der Menüleiste. Aus dem Finder geht auch Rechtsklick → Öffnen mit → CrocGUI.',
        'Sobald die Übertragung läuft, erscheint der Code groß im Fenster. Gib ihn weiter, wie es passt — Chat, Telefon, Zuruf. Daneben liegen ein QR-Code und ein Knopf, der den fertigen Befehl für jemanden kopiert, der croc im Terminal benutzt.',
        'Statt Dateien lässt sich auch reiner Text schicken. Die Gegenseite sieht ihn im Fenster und kann ihn kopieren; auf der Platte landet nichts.'
      ],
      note: 'Das Fenster muss offen bleiben, bis die Gegenseite verbindet. Und der Sender muss zuerst da sein — ein Empfänger, der zu früh kommt, scheitert nicht nur, er macht den Versuch kaputt.'
    },
    {
      title: 'Empfangen',
      body: [
        'Code eintippen oder einfügen, Zielordner wählen, fertig. Eine ganze Befehlszeile darf es auch sein — das Feld holt sich das Wesentliche heraus.',
        'Ein Token aus einer Zwischenlagerung (croc-store-v1…) gehört ins selbe Feld.'
      ],
      note: 'Existiert schon eine Datei gleichen Namens, wird sie überschrieben, und das mit Absicht. Eine abgebrochene croc-Übertragung hinterlässt eine Datei in voller, richtiger Größe, deren fehlender Teil aus Nullen besteht. Ohne Überschreiben hielte der nächste Anlauf diesen Torso für vollständig — richtige Größe, Lücken darin, keine Warnung.'
    },
    {
      title: 'Kontakte',
      body: [
        'Ein fester Code je Gegenstelle, damit die Wörter nicht jedes Mal neu ausgetauscht werden müssen. Beim Senden oder Empfangen den Namen wählen, der Code wird eingesetzt.',
        'Lass den Code würfeln, statt dir einen auszudenken. Der Knopf erzeugt sechs zufällige Wörter, das sind rund fünfzig Bit — praktisch nicht zu erraten.'
      ],
      note: 'Ein fester Code ist ein Dauerpasswort. Wer ihn kennt, bekommt die Dateien, und zwar wer zuerst verbindet. Auf dem öffentlichen Relay ist das ein echtes Risiko — für Dauercodes gehört ein eigenes Relay dazu.'
    },
    {
      title: 'Relay',
      body: [
        'Ein Relay ist die Vermittlung, über die sich zwei Rechner finden. Voreingestellt ist ein öffentlicher Server des croc-Projekts.',
        'Im Reiter Relay startest du einen eigenen auf diesem Rechner. Tragt beide Seiten dessen Adresse unter Einstellungen ein, läuft nichts mehr über fremde Server. Ein Relay-Passwort hält Fremde draußen — falsches Passwort, keine Verbindung.'
      ],
      note: 'Sind beide Rechner im selben Netz, verbindet croc sie direkt und das Relay vermittelt nur die Bekanntschaft. Die Dateien berühren es dann gar nicht.'
    },
    {
      title: 'Zwischenlagerung',
      body: [
        'Mit dieser Option werden die Dateien verschlüsselt hochgeladen und warten dort — mit einer Lebensdauer und einer Zahl erlaubter Abrufe, die du festlegst. Die Gegenseite muss nicht gleichzeitig online sein.',
        'Eine Zwischenlagerung hat keine Code-Wortgruppe. croc gibt einen Browser-Link, ein Token für die Kommandozeile und eine Kennung zum Widerrufen aus. Die Karte zeigt alle drei, und der Verlauf merkt sie sich — sie sind der einzige Weg zurück zu den Daten.'
      ]
    },
    {
      title: 'Prüfsummen',
      body: [
        'Beim Senden berechnet die App für jede Datei eine Prüfsumme und legt die Liste bei. Die Empfangsseite rechnet sie über das nach, was tatsächlich auf der Platte liegt, und meldet dateiweise.',
        'Das gibt es, weil Größe und Zeitstempel hier nichts beweisen: eine abgebrochene Übertragung hinterlässt eine Datei mit exakt richtiger Größe und frischem Datum.'
      ],
      note: 'Bei aktiviertem .gitignore entfällt die Liste — was croc dort weglässt, lässt sich nicht vorhersagen.'
    },
    {
      title: 'Wo es Grenzen gibt',
      body: [
        'croc liest .gitignore nur teilweise. Einfache Namen und Muster wie *.log greifen, Ordnerregeln wie node_modules/ nicht. Der Ordner .git geht immer mit, samt Historie. Zuverlässiger ist es, .git,node_modules ins Ausschlussfeld zu tippen.',
        'Ein gesendeter Text ist kurzzeitig in der Prozessliste des sendenden Rechners sichtbar, weil croc ihn als Argument entgegennimmt. Code-Wortgruppen und Relay-Passwörter sind es nicht — die gehen über die Umgebung. Für ein Geheimnis also lieber eine Datei.',
        'Eine Benachrichtigung, wenn dir jemand etwas schicken will, ist nicht möglich. croc hat dafür keinen Kanal, und ein Empfänger, der im Voraus wartet, zerstört genau die Übertragung, auf die er wartet.'
      ]
    },
    {
      title: 'Erster Start',
      body: [
        'Einzurichten ist nichts: croc ist dabei, ein Relay ist voreingestellt, der Zielordner ist „Downloads".',
        'Die einzige Hürde ist der allererste Start. Weil die App nicht signiert ist, verweigert macOS sie: Rechtsklick auf die App, dann Öffnen, im Dialog nochmal Öffnen. Danach nie wieder. Die App kann sich das nicht selbst erlauben — genau davon lebt der Schutz.'
      ]
    }
  ],

  fr: [
    {
      title: 'De quoi il s’agit',
      body: [
        'CrocGUI est une fenêtre autour de croc, un outil qui transfère des fichiers directement d’un ordinateur à un autre. Chiffré de bout en bout, sans que personne ne stocke vos données en chemin.',
        'Le principe : un côté choisit les fichiers et reçoit un code de trois mots. L’autre côté le saisit. C’est toute la poignée de main — les mots sont la clé, c’est d’eux que naît le chiffrement. croc est intégré à cette application, rien d’autre n’est à installer.'
      ]
    },
    {
      title: 'Envoyer',
      body: [
        'Glissez des fichiers ou des dossiers dans la fenêtre, ou sur le crocodile de la barre des menus. Depuis le Finder, clic droit → Ouvrir avec → CrocGUI fait la même chose.',
        'Dès que le transfert démarre, le code apparaît en grand. Transmettez-le comme vous voulez — messagerie, téléphone, de vive voix. À côté se trouvent un code QR et un bouton qui copie la commande toute faite pour quelqu’un qui utilise croc en terminal.',
        'À la place de fichiers, vous pouvez envoyer du texte. Le correspondant le voit à l’écran et peut le copier ; rien n’est écrit sur le disque.'
      ],
      note: 'La fenêtre doit rester ouverte jusqu’à ce que l’autre côté se connecte. Et l’expéditeur doit être là en premier — un destinataire qui arrive trop tôt ne se contente pas d’échouer, il casse la tentative.'
    },
    {
      title: 'Recevoir',
      body: [
        'Saisissez ou collez le code, choisissez un dossier de destination, c’est fait. Une ligne de commande entière convient aussi — le champ en extrait l’essentiel.',
        'Un jeton de dépôt (croc-store-v1…) se colle dans le même champ.'
      ],
      note: 'Si un fichier du même nom existe déjà, il est écrasé, et c’est voulu. Un transfert croc interrompu laisse un fichier de la taille exacte dont la partie manquante est faite de zéros. Sans écrasement, la tentative suivante prendrait ce fragment pour un fichier complet — bonne taille, trous à l’intérieur, aucun avertissement.'
    },
    {
      title: 'Contacts',
      body: [
        'Un code fixe par correspondant, pour ne pas échanger les mots à chaque fois. Choisissez le nom dans Envoyer ou Recevoir et le code est rempli.',
        'Faites tirer le code plutôt que de l’inventer. Le bouton produit six mots aléatoires, soit environ cinquante bits — indevinable en pratique.'
      ],
      note: 'Un code fixe est un mot de passe permanent. Celui qui le connaît reçoit les fichiers, et c’est le premier connecté qui l’emporte. Sur le relais public, c’est un vrai risque — pour les codes permanents, utilisez votre propre relais.'
    },
    {
      title: 'Relais',
      body: [
        'Un relais est le standard qui permet à deux ordinateurs de se trouver. Par défaut, c’est un serveur public du projet croc.',
        'L’onglet Relais en démarre un sur cette machine. Si les deux côtés saisissent son adresse dans les Réglages, plus rien ne passe par des serveurs étrangers. Un mot de passe de relais tient les inconnus à l’écart — mauvais mot de passe, pas de connexion.'
      ],
      note: 'Si les deux machines sont sur le même réseau, croc les relie directement et le relais ne fait que les présenter. Les fichiers ne le touchent alors jamais.'
    },
    {
      title: 'Dépôt chez le fournisseur',
      body: [
        'Avec cette option, les fichiers sont téléversés chiffrés et attendent là — avec une durée de vie et un nombre de téléchargements que vous fixez. Le correspondant n’a pas besoin d’être en ligne en même temps.',
        'Un dépôt n’a pas de phrase de code. croc fournit un lien de navigateur, un jeton pour la ligne de commande et un identifiant de révocation. La carte affiche les trois, et l’historique les conserve — c’est le seul chemin de retour vers les données.'
      ]
    },
    {
      title: 'Sommes de contrôle',
      body: [
        'À l’envoi, l’application calcule une somme de contrôle par fichier et joint la liste. Le côté réception la recalcule sur ce qui a réellement atterri sur le disque et rend compte fichier par fichier.',
        'Cela existe parce que la taille et la date ne prouvent rien ici : un transfert interrompu laisse un fichier de la taille exacte avec une date fraîche.'
      ],
      note: 'La liste est omise lorsque .gitignore est activé — ce que croc écarte alors est imprévisible.'
    },
    {
      title: 'Là où il y a des limites',
      body: [
        'croc ne lit .gitignore qu’en partie. Les noms simples et les motifs comme *.log fonctionnent, les règles de dossier comme node_modules/ non. Le dossier .git part toujours, historique compris. Saisir .git,node_modules dans le champ d’exclusion est plus fiable.',
        'Un texte envoyé est brièvement visible dans la liste des processus de l’ordinateur émetteur, car croc le reçoit en argument. Les phrases de code et les mots de passe de relais ne le sont pas — ils passent par l’environnement. Pour un secret, envoyez plutôt un fichier.',
        'Être averti quand quelqu’un veut vous envoyer quelque chose n’est pas possible. croc n’a pas de canal pour cela, et un destinataire qui attend à l’avance détruit précisément le transfert qu’il attend.'
      ]
    },
    {
      title: 'Premier démarrage',
      body: [
        'Rien à configurer : croc est inclus, un relais est prédéfini, le dossier de destination est « Téléchargements ».',
        'Le seul obstacle est le tout premier lancement. Comme l’application n’est pas signée, macOS la refuse : clic droit sur l’application, puis Ouvrir, puis Ouvrir à nouveau dans la boîte de dialogue. Ensuite, plus jamais. L’application ne peut pas se l’autoriser elle-même — c’est tout l’intérêt de la protection.'
      ]
    }
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = { HELP };
