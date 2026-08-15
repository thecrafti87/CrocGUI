'use strict';

/* =================================================================
   Finder-Kurzbefehl.

   Legt unter ~/Library/Services ein Automator-Paket ab, das die im
   Finder ausgewaehlten Dateien an CrocGUI weiterreicht. Damit steht im
   Kontextmenue ein eigener Eintrag, statt nur "Oeffnen mit".

   Das Paket ist ein Ordner mit zwei plist-Dateien - kein Automator
   noetig, wir schreiben sie selbst.
   ================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const NAME = 'CrocGUI';

function servicePath() {
  return path.join(os.homedir(), 'Library', 'Services', `${NAME}.workflow`);
}

function infoPlist(label) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${label}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict>
        <key>NSApplicationIdentifier</key>
        <string>com.apple.finder</string>
      </dict>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.item</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;
}

/**
 * Automator-Dokument mit genau einer Aktion: ein Shellskript, das die
 * uebergebenen Pfade an die App weiterreicht.
 */
function documentPlist(appName) {
  const script = `open -a ${JSON.stringify(appName)} "$@"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key><string>521</string>
  <key>AMApplicationVersion</key><string>2.10</string>
  <key>AMDocumentVersion</key><string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Optional</key><true/>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>AMActionVersion</key><string>2.0.3</string>
        <key>AMApplication</key><array><string>Automator</string></array>
        <key>AMParameterProperties</key>
        <dict>
          <key>COMMAND_STRING</key><dict/>
          <key>CheckedForUserDefaultShell</key><dict/>
          <key>inputMethod</key><dict/>
          <key>shell</key><dict/>
          <key>source</key><dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key><string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key><string>${script}</string>
          <key>CheckedForUserDefaultShell</key><true/>
          <key>inputMethod</key><integer>1</integer>
          <key>shell</key><string>/bin/zsh</string>
          <key>source</key><string></string>
        </dict>
        <key>BundleIdentifier</key><string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key><string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key><false/>
        <key>CanShowWhenRun</key><true/>
        <key>Category</key><array><string>AMCategoryUtilities</string></array>
        <key>Class Name</key><string>RunShellScriptAction</string>
        <key>InputUUID</key><string>1B8A2E1F-0000-4000-A000-000000000001</string>
        <key>Keywords</key><array><string>Shell</string></array>
        <key>OutputUUID</key><string>1B8A2E1F-0000-4000-A000-000000000002</string>
        <key>UUID</key><string>1B8A2E1F-0000-4000-A000-000000000003</string>
        <key>UnlocalizedApplications</key><array><string>Automator</string></array>
        <key>arguments</key>
        <dict>
          <key>0</key>
          <dict>
            <key>default value</key><integer>0</integer>
            <key>name</key><string>inputMethod</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>0</string>
          </dict>
          <key>1</key>
          <dict>
            <key>default value</key><false/>
            <key>name</key><string>CheckedForUserDefaultShell</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>1</string>
          </dict>
          <key>2</key>
          <dict>
            <key>default value</key><string></string>
            <key>name</key><string>source</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>2</string>
          </dict>
          <key>3</key>
          <dict>
            <key>default value</key><string></string>
            <key>name</key><string>COMMAND_STRING</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>3</string>
          </dict>
          <key>4</key>
          <dict>
            <key>default value</key><string>/bin/sh</string>
            <key>name</key><string>shell</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>4</string>
          </dict>
        </dict>
        <key>isViewVisible</key><integer>1</integer>
        <key>location</key><string>309.000000:253.000000</string>
        <key>nibPath</key>
        <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key><integer>1</integer>
    </dict>
  </array>
  <key>connectors</key><dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key><integer>0</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
`;
}

function isInstalled() {
  try {
    return fs.statSync(servicePath()).isDirectory();
  } catch {
    return false;
  }
}

/** Schreibt das Paket und meldet es beim System an. */
function install(label, appName = 'CrocGUI') {
  const root = servicePath();
  const contents = path.join(root, 'Contents');
  fs.mkdirSync(contents, { recursive: true });
  fs.writeFileSync(path.join(contents, 'Info.plist'), infoPlist(label), 'utf8');
  fs.writeFileSync(path.join(contents, 'document.wflow'), documentPlist(appName), 'utf8');

  // Ohne diesen Anstoss taucht der Eintrag erst nach einer Anmeldung auf.
  execFile('/System/Library/CoreServices/pbs', ['-flush'], () => {});
  return root;
}

function remove() {
  try {
    fs.rmSync(servicePath(), { recursive: true, force: true });
    execFile('/System/Library/CoreServices/pbs', ['-flush'], () => {});
    return true;
  } catch {
    return false;
  }
}

module.exports = { install, remove, isInstalled, servicePath };
