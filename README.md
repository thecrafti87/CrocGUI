# CrocGUI

by **thecrafti87** — croc by **Zack Scholl**

🇬🇧 English · [🇩🇪 Deutsch](README.de.md)

A desktop front end for [croc](https://github.com/schollz/croc), the tool that
moves files straight from one computer to another — encrypted end to end, with
no cloud storing anything along the way.

CrocGUI runs croc and makes its output legible: the code phrase large and
copyable, a QR code beside it, progress as a bar instead of carriage-return
soup in a terminal.

The interface speaks **English, German and French**; switch it at the top right.
English is the default.

## Install

Grab the DMG for your Mac from
[Releases](https://github.com/thecrafti87/CrocGUI/releases/latest):

| File | For |
|---|---|
| `CrocGUI-<version>-arm64.dmg` | Apple Silicon (M1–M4) |
| `CrocGUI-<version>-x64.dmg` | Intel |

Nothing else is needed — croc travels inside the app.

### First launch

The app is not signed with an Apple Developer ID, so macOS blocks it the first
time. The old right-click → Open trick stopped working with macOS 15; Apple
removed that route.

1. Launch the app, dismiss the message with **Done**
2. Open **System Settings → Privacy & Security**
3. Scroll to the bottom and click **Open Anyway** next to “CrocGUI was blocked”

Faster, in a terminal, and no admin password required:

```bash
xattr -dr com.apple.quarantine /Applications/CrocGUI.app
```

Either way, only once. The app cannot grant itself that — which is the entire
point of the protection.

## What it does

**Send** — Drag files and folders in from the Finder, or use the file dialog.
Once croc hands out the code phrase it appears in large type, with buttons to
copy the code, copy the ready-made command for the other side, and a QR code.
Per transfer: a custom code, zip folders first, respect `.gitignore`, exclude
files, park the transfer at the provider.

**Text** — Plain text can be sent instead of files. Parking at the provider is not available for text; croc only parks regular files, so the option is disabled there. It does not arrive as a
file; the receiving card displays it with a copy button. A note under the field
says that croc takes the text as an argument, so it is briefly visible in the
sending machine’s process list. For a secret, send a file.

**Messages** — Short notes to your contacts, handy for passing on a code
without reaching for another app. Requires your own relay: croc has no mailbox,
so both sides listen in short attempts and sending retries until the line is
free — measured, a note arrives after a few seconds. Each contact gets a message
code derived from its file code, so listening never disturbs a file transfer and
neither side has to exchange anything extra.

**Receive** — Type or paste the code, pick a target folder, done. On a name
clash: overwrite (the default, see below) or save under a new name.

**Contacts** — A fixed code per counterpart, so the words need not be exchanged
every time. The app rolls the code from cryptographically secure randomness
(six words, roughly 50 bits). Send and Receive then offer a name picker, and the
transfer card reads “file → Max” instead of just a code.

**Relay** — Starts `croc relay` on this machine, with its log. Enter that
address on both sides under Settings and the whole exchange stays in your own
network.

**History** — Every transfer with time, size and counterpart. Sends can be
repeated with one click; receives get a button into the target folder. Codes are
deliberately not kept.

**Menu bar** — A crocodile at the top right. Files can be dropped straight onto
it without opening the window. Can be switched off.

**From the Finder** — Right-click files, *Open With* → CrocGUI, and they land in
the send list. For something shorter, set up the Finder shortcut under Settings;
it then appears as its own entry under *Quick Actions*.

**Help** — Its own tab explains the app in the selected language: what each area
does and where croc has its edges.

**Settings** — Relay address and password, encryption curve, default target
folder, checksum method, upload throttle, SOCKS5 proxy. Saved immediately, to
`~/Library/Application Support/croc-gui/settings.json`.

Several transfers run at once, each with its own card, cancel button and
expandable log.

## Self-test

Settings opens with a self-test that runs by itself the first time you look. It
checks only what can actually be checked: whether croc is there, whether the
target folder is writable (a real write attempt), how much space is free,
whether the relay answers (a real connection, with the round trip), and whether
the Finder shortcut is installed.

Whether notifications are allowed is something macOS does not reveal to an app.
Rather than claim anything, there is a button that sends a real test
notification — if it arrives, the question is answered. Beside it, buttons that
open the matching page of System Settings.

## Updating

On start CrocGUI checks GitHub for a newer release. If there is one, a banner
appears with two buttons: **Download and restart**, which does everything inside
the app, and a plain link to the download page. Switchable under Settings.

Since 1.8.0 the app downloads the new version itself, swaps itself out and
restarts — without a signature. `electron-updater` cannot do this, because its
route through Squirrel verifies the signature; swapping by hand works anyway.
A pleasant side effect: what the app downloads itself gets no quarantine flag,
so the new version starts without the Gatekeeper prompt.

What does **not** happen: any cryptographic check of origin. Without a signature
the trust rests on HTTPS and GitHub — the same as downloading by hand, no more.
Size and the version inside the package are verified; if either is off, nothing
is changed. During the swap the old bundle is moved aside first and only deleted
once the new one is fully in place.

## croc is included

The built app brings croc with it. The binary sits in
`CrocGUI.app/Contents/Resources/croc`, and each CrocGUI release carries the croc
version frozen into it. Which one that is appears under Settings, together with
a comparison against the newest croc release.

A button there fetches the newest croc and stores it beside the settings; from
then on it is preferred, without touching the shipped one. A second button
switches back.

The search order is:

1. the path entered under Settings
2. a croc fetched by the app
3. the shipped croc
4. `PATH` and the usual places (`/opt/homebrew/bin`, `/usr/local/bin`,
   `~/go/bin`, `~/.local/bin`)

The shipped one deliberately comes before the system’s: that keeps the version
predictable. Anyone wanting their own croc enters the path.

### Your own relay

A relay opens **five ports**, not one: 9009 arranges the introduction, 9010–9013
carry the data. Forwarding only the first gives a handshake and then silence.

- **Same network** — nothing to configure. Start the relay, read the address off
  the Relay tab, enter it on the other side. Also the fastest route.
- **From anywhere** — simplest via a VPN such as Tailscale: both machines sit in
  the same virtual network, no router, forwarding or dynamic DNS involved. The
  Relay tab marks such an address as “works from anywhere”.
- **Over the plain internet** — needs a public address and all five ports
  forwarded. Many cable and mobile connections share one address between
  hundreds of customers (carrier NAT), where forwarding cannot help at all.

The machine hosting the relay has to stay awake. And a relay makes nothing
faster — the limit is your upload, which sits before the relay, not behind it.

## Checksums

When sending, the app attaches a list of SHA-256 sums per file
(`crocgui-manifest.json`). The receiving side recomputes them over what actually
landed on disk, shows the result on the transfer card and in the history, and
deletes the list afterwards.

Why not simply compare size and date: an interrupted croc transfer leaves a file
of exactly the right size with a fresh timestamp, whose missing part is zeros.
Any check that does not read the contents certifies that stub as fine. Verified:
a half-zeroed file with matching size is reported as wrong, a missing one as
missing.

The list travels as the **first** file, not the last. At the end it would be the
first thing missing after an interruption — absent exactly when it is needed.
And it is recomputed after an interruption or failure too, not only after a
successful transfer.

Reproduced on a genuinely interrupted transfer: of three files, one arrived
intact, one with the correct size and 3.1 MB of zeros inside, the third not at
all. The check reports exactly that — one fine, one wrong, one missing.

With *save under a new name*, croc puts the new copy next to the broken remnant
as `name (1).ext`. The check looks for such alternate names and then reports
“under a different name” instead of a false “wrong”.

If the other side is not running CrocGUI the list is simply absent — the card
then says “no checksums came along” and nothing else happens. Switchable under
Settings. The list travels when zipping too: croc only packs for transport and
unpacks again at the receiver, so the names still match.

## Asking for what is missing

When the checksums come up short, the list of missing files is no longer a dead
end. Under the transfer sits a button that copies it — or sends it straight to
the contact, if the message channel is open. The other side pastes it under Send
with **paste request**, and only those files go out.

croc flattens: a file sent as `photos/2024/beach.jpg` arrives as `beach.jpg`.
CrocGUI puts it back — it recognises the file by its checksum and files it into
the right folder. That is why the checksum list stays in the target folder as
long as anything is outstanding, and clears itself only once everything is
there. A follow-up delivery deliberately carries no list of its own; the
original one is the record of what is owed.

## One after another

Transfers are worked through in order rather than all at once — parallel
transfers share the same line and all become slower. The queue is visible, entries
can be dropped or started straight away, and a failure does not hold up the rest.
Switch it off under Settings if you would rather serve two counterparts at once.

## A folder per contact

Contacts can carry their own target folder: whatever arrives from them lands
there instead of in the general one. The folder is filled in visibly when the
contact or their code is entered — where something is saved should be readable
beforehand.

## Why receiving overwrites

croc creates the target file at full size immediately. If a transfer breaks off,
a file of the correct size stays behind whose missing part is zeros. Start the
same code again and croc takes that stub for a complete file: the sender
transfers nothing more, croc exits 0 — and nobody learns that the file has a
hole in it.

Reproduced twice, once by killing the receiver hard and once with SIGINT: 8 and
13 MB of zeros respectively, with success reported. With `--overwrite` the
transfer runs cleanly and the file is correct.

That is why *overwrite* is the default, and why the earlier option to receive
without overwriting is gone. To keep the existing file, choose *save under a new
name* — that also transfers completely afresh.

## Parking at the provider

With this option croc uploads the files encrypted to getcroc.com, with a
lifetime and a number of permitted downloads. The other side does not have to be
online.

Worth knowing: a parked transfer has **no code phrase**. croc instead hands out a
browser link, a token for the command line and an identifier for revoking. Only
those get anyone to the data — the code in the send window is of no use here.

A parked transfer is collected by putting the token into the same field as a
code phrase; that works because the app passes everything through `CROC_SECRET`.
croc deliberately refuses such a token as an argument: the decryption key is
inside it and would otherwise show up in the process list.

The app therefore shows all three prominently on the transfer card, with buttons
to copy, open in the browser and revoke. And it keeps them in the history — were
they only on the card, the data would be unreachable once the app is closed.

## .gitignore and exclusions

Two observations worth knowing:

croc reads `.gitignore` only in part. Plain names (`secret.txt`) and patterns
(`*.log`) work, folder rules such as `node_modules/` do not — `git check-ignore`
considers the file ignored, croc sends it anyway. And the `.git` folder itself
always travels along, with the full history.

`--exclude` is a plain substring comparison over the whole path. The entry
`.git` therefore also throws out `.gitignore`.

The checksum list mirrors the exclusions, so omitted files are not falsely
reported as missing. With `.gitignore` enabled the list is skipped entirely:
what croc leaves out there cannot be predicted.

## Deliberately left out

A “wait for someone”, raising a notification as soon as the other side sends, is
not possible with croc. The sender must be in the room first; a waiting receiver
occupies it and makes the very transfer it waits for fail (*“could not secure
channel”*). Reproduced with two croc processes and no app involved — it is croc,
not the front end.

The global option `--local` does not appear in the interface. Without an
additional `--ip` it leaves the receiving side running into nothing
(*“found no addresses to connect”*) and would be a trap as a simple switch. croc
prefers local connections by itself anyway.

## Building it yourself

Requirements: macOS (arm64 or x64) and Node.js 20 or newer.

```bash
npm install
npm run fetch-croc
npm start
```

`fetch-croc` downloads the croc binaries for both architectures into `vendor/`.
Without that step CrocGUI falls back to a croc from the system during
development, if there is one.

A distributable app:

```bash
npm run dist
```

The result lands in `build/`. The binaries are fetched beforehand (`predist`),
pinned through the `crocVersion` field in `package.json`. To move to a newer
croc:

```bash
npm run fetch-croc:latest
```

That writes the new version into `package.json`. `vendor/` does not belong in
the repository.

Publishing a release:

```bash
npm version patch && npm run dist -- --publish always
```

## Tests

```bash
npm test
```

No network, no croc, no window — the suite runs headless in about a fifth of a
second. It covers the places that have actually gone wrong: the command builder
(the relay password must never appear as an argument, parking is refused in text
mode), the parser (croc's second progress bar for its own hash check must not
reset the first), and the checksums against real files on disk, including a
half-transferred file of the right size filled with zeros.

Translations are checked for completeness rather than wording: every key in all
three languages, placeholders intact, the help equally long everywhere.

## Layout

```
scripts/fetch-croc.js    fetch croc binaries into vendor/
scripts/make-icon.js     build icon.icns and the menu-bar images from icon.svg
src/main/main.js         window, menu, IPC endpoints
src/main/croc.js         find croc, build command lines, parse output
src/main/manifest.js     checksums: build the list, verify it
src/main/selfupdate.js   download a new version, swap, restart
src/main/crocupdate.js   fetch a newer croc into the user's own folder
src/main/diagnose.js     the self-test
src/main/settings.js     load and store settings
src/main/history.js      the transfer history
src/main/words.js        word list and dice for fixed codes
src/main/quickaction.js  the Finder shortcut
src/main/preload.js      bridge to the renderer (contextIsolation is on)
src/renderer/i18n.js     string tables (en, de, fr) — also used by the menu
src/renderer/help.js     the help texts, per language
src/renderer/           interface: index.html, styles.css, app.js
```

Adding a language: add an entry to `LANGS` in `src/renderer/i18n.js`, copy the
table below it and translate; do the same in `help.js`. A missing key falls back
to English automatically.

Two details that mattered while building:

- **Neither the code nor the relay password appears in the process list.** The
  code phrase reaches croc through `CROC_SECRET`, the relay password through
  `CROC_PASS` — never as arguments. A `ps` shows neither; verified against the
  running command line. For the code croc allows nothing else on UNIX anyway:
  `--code` is rejected there with a pointer to `CROC_SECRET`.
- **`--ignore-stdin` is set.** Without it croc mistakes the child process’s
  closed standard input for piped data and would send that instead of the
  selected files.

The progress display comes from parsing croc’s output. After a transfer croc
appends a second bar (`Hashing …`) for its own verification — that is handled
separately so it does not reset the progress.

## Licence

MIT. croc itself is by Zack Scholl and is likewise MIT.
