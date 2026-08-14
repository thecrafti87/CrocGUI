'use strict';

/* =================================================================
   CrocGUI - Oberflaechenlogik
   ================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const api = window.croc;

const state = {
  files: [],          // [{path, name, size, dir}]
  jobs: new Map(),    // id -> {el, kind, meta, state}
  relayId: null,
  settings: {},
  defaultOutDir: ''
};

/* ----------------------------- Helfer ----------------------------- */

function bytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

let toastTimer = null;
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* --------------------------- Ansichten --------------------------- */

function showView(name) {
  $$('.rail__item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${name}`));
  $('#stage').scrollTop = 0;
}

$('#rail').addEventListener('click', (e) => {
  const btn = e.target.closest('.rail__item');
  if (btn) showView(btn.dataset.view);
});

/* ------------------------ Dateien auswaehlen ------------------------ */

function renderFiles() {
  const list = $('#fileList');
  list.textContent = '';
  state.files.forEach((f, i) => {
    const li = el('li', 'chip');
    li.style.animationDelay = `${Math.min(i, 8) * 25}ms`;
    li.append(el('b', null, f.name));
    if (f.dir) li.append(el('i', null, 'Ordner'));
    else li.append(el('span', null, bytes(f.size)));
    const kill = el('button', null, '×');
    kill.type = 'button';
    kill.title = 'Entfernen';
    kill.addEventListener('click', (e) => {
      e.stopPropagation();
      state.files.splice(i, 1);
      renderFiles();
    });
    li.append(kill);
    list.append(li);
  });
}

async function addPaths(paths) {
  const fresh = paths.filter((p) => p && !state.files.some((f) => f.path === p));
  if (!fresh.length) return;
  const stats = await api.statPaths(fresh);
  state.files.push(...stats.filter((s) => !s.missing));
  renderFiles();
}

$('#pickBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  addPaths(await api.pickFiles());
});

$('#drop').addEventListener('click', async () => addPaths(await api.pickFiles()));
$('#drop').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    addPaths(await api.pickFiles());
  }
});

$('#sendClear').addEventListener('click', () => {
  state.files = [];
  $('#sendText').value = '';
  renderFiles();
});

// Drag & Drop. Ein Zaehler verhindert Flackern, wenn der Zeiger ueber
// Kindelemente wandert.
let dragDepth = 0;
const drop = $('#drop');

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

drop.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  drop.classList.add('is-over');
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
drop.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) drop.classList.remove('is-over');
});
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('is-over');
  // Seit Electron 32 gibt es File.path nicht mehr - der Pfad kommt
  // ueber webUtils aus dem Preload-Skript.
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) toast('Aus dieser Quelle liess sich kein Dateipfad lesen.', 'bad');
  else addPaths(paths);
});

/* --------------------------- Sendemodus --------------------------- */

let sendMode = 'files';
$('#sendMode').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg__btn');
  if (!btn) return;
  sendMode = btn.dataset.mode;
  $$('.seg__btn', $('#sendMode')).forEach((b) => b.classList.toggle('is-on', b === btn));
  $('#paneFiles').classList.toggle('is-hidden', sendMode !== 'files');
  $('#paneText').classList.toggle('is-hidden', sendMode !== 'text');
});

/* -------------------------- Auftragskarten -------------------------- */

const LABELS = {
  running: 'laeuft',
  waiting: 'wartet auf Gegenstelle',
  done: 'fertig',
  failed: 'fehlgeschlagen',
  cancelled: 'abgebrochen'
};

function ensureJob(id, kind) {
  if (state.jobs.has(id)) return state.jobs.get(id);

  const root = el('article', 'job');
  root.dataset.kind = kind;
  root.dataset.state = 'waiting';

  const top = el('div', 'job__top');
  const name = el('div', 'job__name', kind === 'send' ? 'Wird vorbereitet ...' : 'Verbinde ...');
  const stateEl = el('div', 'job__state', LABELS.waiting);
  top.append(name, stateEl);

  const meter = el('div', 'job__meter');
  const fill = el('div', 'job__fill');
  meter.append(fill);

  const read = el('div', 'job__read');
  const pct = el('span', 'pct', '0%');
  const info = el('span', 'bytes');
  const speed = el('span', 'speed');
  const eta = el('span', 'eta');
  const acts = el('div', 'job__acts');

  const stop = el('button', 'btn btn--sm btn--stop', 'Abbrechen');
  stop.type = 'button';
  stop.addEventListener('click', () => api.cancel(id));
  acts.append(stop);

  read.append(pct, info, speed, eta, acts);

  const err = el('div', 'job__err');
  err.hidden = true;

  const log = el('details', 'job__log');
  log.append(el('summary', null, 'Protokoll'));
  const pre = el('pre');
  log.append(pre);

  root.append(top, meter, read, err, log);

  const host = kind === 'receive' ? $('#recvJobs') : $('#sendJobs');
  host.prepend(root);

  const job = { id, kind, el: root, name, stateEl, fill, pct, info, speed, eta, acts, stop, err, pre, meta: {}, beacon: null };
  state.jobs.set(id, job);
  return job;
}

function setJobState(job, key) {
  job.el.dataset.state = key;
  job.stateEl.textContent = LABELS[key] || key;
}

function buildBeacon(job, code) {
  if (job.beacon) return;
  const beacon = el('div', 'beacon');

  const left = el('div');
  left.append(el('div', 'beacon__label', 'Code an die Gegenstelle geben'));

  const words = el('div', 'beacon__code');
  code.split('-').forEach((word, i) => {
    if (i) words.append(el('span', 'beacon__dash', '-'));
    const w = el('span', 'beacon__word', word);
    w.style.animationDelay = `${i * 70}ms`;
    words.append(w);
  });
  left.append(words);

  const actions = el('div', 'beacon__actions');

  const copyCode = el('button', 'btn btn--sm btn--go', 'Code kopieren');
  copyCode.type = 'button';
  copyCode.addEventListener('click', async () => {
    await api.copy(code);
    toast('Code in der Zwischenablage.', 'good');
  });

  const copyCmd = el('button', 'btn btn--sm btn--ghost', 'Befehl kopieren');
  copyCmd.type = 'button';
  copyCmd.addEventListener('click', async () => {
    await api.copy(`CROC_SECRET="${code}" croc`);
    toast('Befehl fuer Linux/macOS kopiert.', 'good');
  });

  const web = el('button', 'btn btn--sm btn--ghost', 'Im Browser oeffnen');
  web.type = 'button';
  web.title = 'Empfang ueber getcroc.com';
  web.addEventListener('click', () => {
    api.openExternal(`https://getcroc.com/?code=${encodeURIComponent(code)}`);
  });

  actions.append(copyCode, copyCmd, web);
  left.append(actions);

  const qr = el('img', 'beacon__qr');
  qr.alt = 'QR-Code mit dem Uebertragungscode';
  api.qr(code).then((data) => { if (data) qr.src = data; });

  beacon.append(left, qr);
  job.el.insertBefore(beacon, job.el.children[1]);
  job.beacon = beacon;
}

// Die Betriebsart steht nur im ersten Ereignis eines Vorgangs, danach
// merken wir sie uns hier.
const kindOf = new Map();

function handleEvent(id, event) {
  if (event.type === 'started') kindOf.set(id, event.kind);
  const kind = kindOf.get(id) || 'send';

  // Ein Relay bekommt keine Karte, sondern schreibt in die Konsole.
  if (kind === 'relay') {
    handleRelayEvent(id, event);
    if (event.type === 'done') kindOf.delete(id);
    return;
  }

  const job = ensureJob(id, kind);

  switch (event.type) {
    case 'started':
      job.pre.textContent = `$ ${event.command}\n`;
      break;

    case 'log':
      job.pre.textContent += `${event.line}\n`;
      if (job.pre.textContent.length > 20000) {
        job.pre.textContent = job.pre.textContent.slice(-14000);
      }
      break;

    case 'code':
      if (job.kind === 'send') buildBeacon(job, event.code);
      break;

    case 'meta':
      job.name.textContent = `${event.label} · ${event.size}`;
      job.meta.label = event.label;
      break;

    case 'peer':
      setJobState(job, 'running');
      job.eta.textContent = `↔ ${event.peer}`;
      break;

    case 'progress': {
      setJobState(job, 'running');
      job.fill.style.width = `${event.percent}%`;
      job.pct.textContent = `${event.percent}%`;
      job.info.textContent = event.bytes;
      job.speed.textContent = event.speed;
      const rest = event.eta ? event.eta.split(':').pop() : '';
      job.eta.textContent = rest && rest !== '0s' ? `noch ${rest}` : '';
      break;
    }

    case 'verify':
      // Nachpruefung durch croc - der Balken der Uebertragung bleibt stehen.
      job.el.dataset.state = 'running';
      job.stateEl.textContent = `wird geprueft ${event.percent}%`;
      break;

    case 'failure':
      job.err.hidden = false;
      job.err.textContent = event.message;
      break;

    case 'done':
      job.stop.remove();
      if (event.cancelled) {
        setJobState(job, 'cancelled');
      } else if (event.ok) {
        setJobState(job, 'done');
        job.fill.style.width = '100%';
        job.pct.textContent = '100%';
        job.eta.textContent = '';
        job.err.hidden = true;
        if (job.beacon) job.beacon.remove();
        const target = job.kind === 'receive' ? job.meta.outDir : null;
        if (target) {
          const open = el('button', 'btn btn--sm btn--ghost', 'Ordner oeffnen');
          open.type = 'button';
          open.addEventListener('click', () => api.reveal(target));
          job.acts.append(open);
        }
        toast(job.kind === 'send' ? 'Uebertragung abgeschlossen.' : 'Empfang abgeschlossen.', 'good');
      } else {
        setJobState(job, 'failed');
      }
      kindOf.delete(id);
      break;
  }
}

api.onEvent(({ id, event }) => handleEvent(id, event));

/* ---------------------------- Senden ---------------------------- */

$('#sendStart').addEventListener('click', async () => {
  const code = $('#optCode').value.trim();
  if (code && code.length < 6) {
    toast('Ein eigener Code braucht mindestens 6 Zeichen.', 'bad');
    return;
  }

  const opts = {
    mode: sendMode,
    code: code || '',
    zip: $('#optZip').checked,
    git: $('#optGit').checked,
    noLocal: $('#optNoLocal').checked,
    exclude: $('#optExclude').value.trim(),
    store: $('#optStore').checked,
    storeDownloads: $('#optStoreDownloads').value,
    storeExpiration: $('#optStoreExp').value.trim()
  };

  if (sendMode === 'text') {
    const text = $('#sendText').value;
    if (!text.trim()) { toast('Es ist kein Text eingetragen.', 'bad'); return; }
    opts.text = text;
  } else {
    if (!state.files.length) { toast('Erst Dateien oder Ordner auswaehlen.', 'bad'); return; }
    opts.paths = state.files.map((f) => f.path);
  }

  const res = await api.start('send', opts);
  if (!res.ok) { toast(res.message, 'bad'); return; }

  const job = ensureJob(res.id, 'send');
  job.meta.label = sendMode === 'text' ? 'Text' : `${state.files.length} Eintraege`;
  if (job.name.textContent.startsWith('Wird vorbereitet')) {
    job.name.textContent = job.meta.label;
  }
});

/* --------------------------- Empfangen --------------------------- */

$('#recvPick').addEventListener('click', async () => {
  const dir = await api.pickFolder($('#recvOut').value);
  if (dir) $('#recvOut').value = dir;
});

$('#recvPaste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      $('#recvCode').value = text.trim().replace(/^croc\s+/, '').replace(/^CROC_SECRET="?|"?\s*croc$/g, '');
      $('#recvCode').focus();
    }
  } catch {
    toast('Zwischenablage nicht lesbar.', 'bad');
  }
});

$('#recvCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#recvStart').click();
});

$('#recvStart').addEventListener('click', async () => {
  const code = $('#recvCode').value.trim();
  if (!code) { toast('Bitte den Code eintragen.', 'bad'); return; }

  const clash = ($$('input[name="clash"]').find((r) => r.checked) || {}).value || 'ask';
  const outDir = $('#recvOut').value || state.defaultOutDir;

  const res = await api.start('receive', {
    code,
    outDir,
    overwrite: clash === 'overwrite',
    rename: clash === 'rename'
  });
  if (!res.ok) { toast(res.message, 'bad'); return; }

  const job = ensureJob(res.id, 'receive');
  job.meta.outDir = outDir;
  $('#recvCode').value = '';
});

/* ----------------------------- Relay ----------------------------- */

function relayLog(text) {
  const box = $('#relayLog');
  if (box.dataset.fresh !== '1') { box.textContent = ''; box.dataset.fresh = '1'; }
  box.textContent += `${text}\n`;
  if (box.textContent.length > 40000) box.textContent = box.textContent.slice(-28000);
  box.scrollTop = box.scrollHeight;
}

function setRelayRunning(on) {
  $('#relayState').classList.toggle('is-live', on);
  $('#relayState').lastElementChild.textContent = on ? 'laeuft' : 'gestoppt';
  const btn = $('#relayToggle');
  btn.textContent = on ? 'Relay stoppen' : 'Relay starten';
  btn.classList.toggle('btn--stop', on);
  btn.classList.toggle('btn--amber', !on);
}

function handleRelayEvent(id, event) {
  if (event.type === 'started') { relayLog(`$ ${event.command}`); return; }
  if (event.type === 'log') { relayLog(event.line); return; }
  if (event.type === 'failure') { relayLog(`!! ${event.message}`); return; }
  if (event.type === 'done') {
    relayLog(event.cancelled ? '-- Relay gestoppt.' : `-- Relay beendet (${event.ok ? 'regulaer' : 'Fehler'}).`);
    if (id === state.relayId) { state.relayId = null; setRelayRunning(false); }
  }
}

$('#relayToggle').addEventListener('click', async () => {
  if (state.relayId) {
    api.cancel(state.relayId);
    return;
  }
  const res = await api.start('relay', {
    ports: $('#relayPorts').value.trim(),
    host: $('#relayHost').value.trim()
  });
  if (!res.ok) { toast(res.message, 'bad'); return; }
  state.relayId = res.id;
  setRelayRunning(true);
  const ports = $('#relayPorts').value.trim().split(',')[0];
  relayLog(`-- Gegenstellen tragen als Relay-Adresse ein: <diese-ip>:${ports}`);
});

/* -------------------------- Einstellungen -------------------------- */

const FIELDS = [
  ['#setCrocPath', 'crocPath', 'value'],
  ['#setRelay', 'relay', 'value'],
  ['#setPass', 'pass', 'value'],
  ['#setOutDir', 'outDir', 'value'],
  ['#setCurve', 'curve', 'value'],
  ['#setHash', 'hash', 'value'],
  ['#setThrottle', 'throttleUpload', 'value'],
  ['#setSocks5', 'socks5', 'value'],
  ['#setNoCompress', 'noCompress', 'checked'],
  ['#setInternalDns', 'internalDns', 'checked']
];

function fillSettings(values) {
  state.settings = values;
  FIELDS.forEach(([sel, key, prop]) => { $(sel)[prop] = values[key] ?? ''; });
  $('#relayPorts').value = values.relayPorts || '9009,9010,9011,9012,9013';
}

async function persist(patch) {
  state.settings = await api.setSettings(patch);
}

FIELDS.forEach(([sel, key, prop]) => {
  const node = $(sel);
  const evt = prop === 'checked' || node.tagName === 'SELECT' ? 'change' : 'input';
  node.addEventListener(evt, () => persist({ [key]: node[prop] }));
});

$('#relayPorts').addEventListener('input', () => persist({ relayPorts: $('#relayPorts').value }));

$('#setOutPick').addEventListener('click', async () => {
  const dir = await api.pickFolder($('#setOutDir').value);
  if (!dir) return;
  $('#setOutDir').value = dir;
  await persist({ outDir: dir });
  $('#recvOut').value = dir;
});

$('#setCrocPick').addEventListener('click', async () => {
  const bin = await api.pickBinary();
  if (!bin) return;
  $('#setCrocPath').value = bin;
  await persist({ crocPath: bin });
  detectCroc(true);
});

$('#setCrocDetect').addEventListener('click', () => detectCroc(true));

async function detectCroc(force = false) {
  const badge = $('#binStatus');
  const text = $('.chrome__statusText', badge);
  badge.dataset.state = 'pending';
  text.textContent = 'croc wird gesucht ...';

  const info = await api.detect(force);
  if (info.ok) {
    badge.dataset.state = 'ok';
    text.textContent = `croc ${info.version}`;
    badge.title = info.path;
    $('#settingsNote').textContent =
      `Gefunden: ${info.path} (Version ${info.version})\nEinstellungen liegen in: ${state.settingsFile || ''}`;
  } else {
    badge.dataset.state = 'bad';
    text.textContent = 'croc fehlt';
    badge.title = 'croc konnte nicht gefunden werden';
    $('#settingsNote').textContent =
      'croc wurde nicht gefunden. Installation ueber Homebrew: brew install croc\n' +
      'Alternativ oben den Pfad zum Programm eintragen.';
    toast('croc wurde nicht gefunden - siehe Einstellungen.', 'bad');
  }
  return info;
}

$('#binStatus').addEventListener('click', () => showView('settings'));

/* ------------------------------ Menue ------------------------------ */

api.onMenu(async (action) => {
  if (action === 'pick-files') {
    showView('send');
    addPaths(await api.pickFiles());
  } else if (action === 'goto-receive') {
    showView('receive');
    $('#recvCode').focus();
  }
});

/* ------------------------------ Start ------------------------------ */

(async function boot() {
  const { values, defaultOutDir, file } = await api.getSettings();
  state.defaultOutDir = defaultOutDir;
  state.settingsFile = file;
  fillSettings(values);
  $('#recvOut').value = values.outDir || defaultOutDir;
  if (!values.outDir) $('#setOutDir').value = defaultOutDir;
  setRelayRunning(false);
  await detectCroc(false);
})();
