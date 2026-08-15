'use strict';

/* =================================================================
   CrocGUI - Oberflaechenlogik
   ================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const api = window.croc;

const state = {
  lang: DEFAULT_LANG,
  files: [],          // [{path, name, size, dir}]
  jobs: new Map(),    // id -> Karte samt Zustand
  contacts: [],       // [{id, name, code, note}]
  relayId: null,
  settings: {},
  defaultOutDir: '',
  settingsFile: '',
  crocInfo: null,
  update: null,
  crocLatest: null
};

/** Uebersetzt in der aktuell gewaehlten Sprache. */
const T = (key, ...args) => t(state.lang, key, ...args);

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
  const node = $('#toast');
  node.textContent = message;
  node.dataset.kind = kind;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 3200);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ----------------------------- Sprache ----------------------------- */

function buildLangPicker() {
  const box = $('#langPick');
  box.textContent = '';
  LANGS.forEach(({ code, label }) => {
    const btn = el('button', 'seg__btn', label);
    btn.type = 'button';
    btn.dataset.lang = code;
    btn.addEventListener('click', () => setLang(code));
    box.append(btn);
  });
}

/** Traegt alle beschrifteten Stellen neu ein. */
function applyLang() {
  document.documentElement.lang = state.lang;

  $$('[data-i18n]').forEach((n) => { n.textContent = T(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((n) => { n.placeholder = T(n.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach((n) => { n.title = T(n.dataset.i18nTitle); });

  $$('.seg__btn', $('#langPick')).forEach((b) => b.classList.toggle('is-on', b.dataset.lang === state.lang));

  // Alles, was erst zur Laufzeit entsteht
  renderCrocStatus();
  renderContacts();
  renderRelayState();
  renderCredits();
  renderUpdate();
  renderCrocLatest();
  if (!$('#relayLog').dataset.fresh) $('#relayLog').textContent = T('relay.logEmpty');
  if (!editingId) $('#contactFoldTitle').textContent = T('contacts.new');
  gradeCode();
  syncSendContact();
  state.jobs.forEach((job) => refreshJobLabels(job));
}

async function setLang(code) {
  state.lang = code;
  applyLang();
  await api.setLang(code);
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
    if (f.dir) li.append(el('i', null, T('send.folder')));
    else li.append(el('span', null, bytes(f.size)));
    const kill = el('button', null, '×');
    kill.type = 'button';
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
  if (!paths.length) toast(T('toast.noPath'), 'bad');
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

/** Name der Karte: Datei, Groesse und - wenn bekannt - die Gegenstelle. */
function renderJobName(job) {
  const base = job.meta.label
    ? `${job.meta.label}${job.meta.size ? ` · ${job.meta.size}` : ''}`
    : T(job.kind === 'send' ? 'job.preparing' : 'job.connecting');
  job.name.textContent = job.meta.contactName
    ? `${base}  ${job.kind === 'send' ? '→' : '←'} ${job.meta.contactName}`
    : base;
}

/** Nach einem Sprachwechsel die festen Beschriftungen einer Karte erneuern. */
function refreshJobLabels(job) {
  renderJobName(job);
  if (job.stateKey) setJobState(job, job.stateKey);
  if (job.stop) job.stop.textContent = T('job.cancel');
  if (job.openBtn) job.openBtn.textContent = T('job.openFolder');
  job.logSummary.textContent = T('job.log');
}

function ensureJob(id, kind) {
  if (state.jobs.has(id)) return state.jobs.get(id);

  const root = el('article', 'job');
  root.dataset.kind = kind;
  root.dataset.state = 'waiting';

  const top = el('div', 'job__top');
  const name = el('div', 'job__name');
  const stateEl = el('div', 'job__state');
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

  const stop = el('button', 'btn btn--sm btn--stop', T('job.cancel'));
  stop.type = 'button';
  stop.addEventListener('click', () => api.cancel(id));
  acts.append(stop);

  read.append(pct, info, speed, eta, acts);

  const err = el('div', 'job__err');
  err.hidden = true;

  const log = el('details', 'job__log');
  const logSummary = el('summary', null, T('job.log'));
  log.append(logSummary);
  const pre = el('pre');
  log.append(pre);

  root.append(top, meter, read, err, log);
  (kind === 'receive' ? $('#recvJobs') : $('#sendJobs')).prepend(root);

  const job = {
    id, kind, el: root, name, stateEl, fill, pct, info, speed, eta,
    acts, stop, openBtn: null, err, pre, logSummary,
    meta: {}, beacon: null, stateKey: 'waiting'
  };
  state.jobs.set(id, job);
  renderJobName(job);
  setJobState(job, 'waiting');
  return job;
}

function setJobState(job, key, arg) {
  job.stateKey = key;
  job.stateArg = arg;
  job.el.dataset.state = key === 'verifying' ? 'running' : key;
  job.stateEl.textContent = key === 'verifying'
    ? T('job.verifying', job.stateArg ?? 0)
    : T(`job.${key}`);
}

function buildBeacon(job, code) {
  if (job.beacon) return;
  const beacon = el('div', 'beacon');

  const known = contactByCode(code);
  const left = el('div');
  left.append(el('div', 'beacon__label',
    known ? T('beacon.waiting', known.name) : T('beacon.give')));

  const words = el('div', 'beacon__code');
  code.split('-').forEach((word, i) => {
    if (i) words.append(el('span', 'beacon__dash', '-'));
    const w = el('span', 'beacon__word', word);
    w.style.animationDelay = `${i * 70}ms`;
    words.append(w);
  });
  left.append(words);

  const qr = el('img', 'beacon__qr');
  qr.alt = T('beacon.qrAlt');
  api.qr(code).then((data) => { if (data) qr.src = data; });

  // Bei einem Kontakt kennt die Gegenstelle den Code laengst. Ihn dann
  // gross anzuzeigen hilft niemandem und legt ein Dauerpasswort offen.
  if (known) { words.hidden = true; qr.hidden = true; }

  const actions = el('div', 'beacon__actions');

  const copyCode = el('button', 'btn btn--sm btn--go', T('beacon.copyCode'));
  copyCode.type = 'button';
  copyCode.addEventListener('click', async () => {
    await api.copy(code);
    toast(T('toast.copiedCode'), 'good');
  });

  const copyCmd = el('button', 'btn btn--sm btn--ghost', T('beacon.copyCommand'));
  copyCmd.type = 'button';
  copyCmd.addEventListener('click', async () => {
    await api.copy(`CROC_SECRET="${code}" croc`);
    toast(T('toast.copiedCommand'), 'good');
  });

  actions.append(copyCode, copyCmd);

  if (known) {
    const reveal = el('button', 'btn btn--sm btn--ghost', T('beacon.show'));
    reveal.type = 'button';
    reveal.addEventListener('click', () => {
      const show = words.hidden;
      words.hidden = !show;
      qr.hidden = !show;
      reveal.textContent = show ? T('beacon.hide') : T('beacon.show');
    });
    actions.append(reveal);
  } else {
    // Der Code landet dabei in der Adresszeile eines Browsers - bei einem
    // Einmalcode vertretbar, bei einem Dauercode nicht.
    const web = el('button', 'btn btn--sm btn--ghost', T('beacon.openBrowser'));
    web.type = 'button';
    web.title = T('beacon.browserTitle');
    web.addEventListener('click', () => {
      api.openExternal(`https://getcroc.com/?code=${encodeURIComponent(code)}`);
    });
    actions.append(web);
  }

  left.append(actions);
  beacon.append(left, qr);
  job.el.insertBefore(beacon, job.el.children[1]);
  job.beacon = beacon;
}

// Die Betriebsart steht nur im ersten Ereignis eines Vorgangs.
const kindOf = new Map();

function handleEvent(id, event) {
  if (event.type === 'started') kindOf.set(id, event.kind);
  const kind = kindOf.get(id) || 'send';

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
      job.meta.label = event.label;
      job.meta.size = event.size;
      renderJobName(job);
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
      job.eta.textContent = rest && rest !== '0s' ? T('job.remaining', rest) : '';
      break;
    }

    case 'verify':
      // Nachpruefung durch croc - der Balken der Uebertragung bleibt stehen.
      setJobState(job, 'verifying', event.percent);
      break;

    case 'failure':
      job.err.hidden = false;
      job.err.textContent = event.message;
      break;

    case 'done':
      job.stop.remove();
      job.stop = null;
      if (event.cancelled) {
        setJobState(job, 'cancelled');
      } else if (event.ok) {
        setJobState(job, 'done');
        job.fill.style.width = '100%';
        job.pct.textContent = '100%';
        job.eta.textContent = '';
        job.err.hidden = true;
        if (job.beacon) job.beacon.remove();
        if (job.kind === 'receive' && job.meta.outDir) {
          const open = el('button', 'btn btn--sm btn--ghost', T('job.openFolder'));
          open.type = 'button';
          open.addEventListener('click', () => api.reveal(job.meta.outDir));
          job.acts.append(open);
          job.openBtn = open;
        }
        toast(T(job.kind === 'send' ? 'toast.sendDone' : 'toast.recvDone'), 'good');
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
  const contact = contactById($('#sendContact').value);
  const code = contact ? contact.code : $('#optCode').value.trim();
  if (code && code.length < 6) { toast(T('toast.codeShort'), 'bad'); return; }

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
    if (!text.trim()) { toast(T('toast.noText'), 'bad'); return; }
    opts.text = text;
  } else {
    if (!state.files.length) { toast(T('toast.noFiles'), 'bad'); return; }
    opts.paths = state.files.map((f) => f.path);
  }

  const res = await api.start('send', opts);
  if (!res.ok) { toast(res.message, 'bad'); return; }

  const job = ensureJob(res.id, 'send');
  if (!job.meta.label) {
    job.meta.label = sendMode === 'text' ? T('job.text') : T('job.entries', state.files.length);
  }
  if (contact) job.meta.contactName = contact.name;
  renderJobName(job);
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
      $('#recvCode').value = text.trim()
        .replace(/^croc\s+/, '')
        .replace(/^CROC_SECRET="?|"?\s*croc$/g, '');
      $('#recvCode').focus();
    }
  } catch {
    toast(T('toast.clipboard'), 'bad');
  }
});

$('#recvCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#recvStart').click();
});

$('#recvStart').addEventListener('click', async () => {
  const code = $('#recvCode').value.trim();
  if (!code) { toast(T('toast.noCode'), 'bad'); return; }

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
  const known = contactByCode(code);
  if (known) job.meta.contactName = known.name;
  renderJobName(job);
  $('#recvCode').value = '';
  $('#recvContact').value = '';
});

/* ---------------------------- Kontakte ---------------------------- */

const contactById = (id) => state.contacts.find((c) => c.id === id) || null;
const contactByCode = (code) => state.contacts.find((c) => c.code === code) || null;

let editingId = null;

function renderContacts() {
  const list = $('#contactList');
  list.textContent = '';

  if (!state.contacts.length) list.append(el('div', 'empty', T('contacts.empty')));

  state.contacts.forEach((c, i) => {
    const card = el('article', 'card');
    card.style.animationDelay = `${Math.min(i, 8) * 30}ms`;
    if (c.id === editingId) card.classList.add('is-editing');

    const head = el('div', 'card__head');
    head.append(el('div', 'card__name', c.name));

    const acts = el('div', 'card__acts');

    const copy = el('button', 'card__icon');
    copy.type = 'button';
    copy.title = T('contacts.copyCode');
    copy.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/>' +
      '<path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
    copy.addEventListener('click', async () => {
      await api.copy(c.code);
      toast(T('toast.copiedFrom', c.name), 'good');
    });

    const edit = el('button', 'card__icon');
    edit.type = 'button';
    edit.title = T('contacts.editTitle');
    edit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>';
    edit.addEventListener('click', () => startEdit(c));

    // Zweistufig: der erste Klick fragt nach, der zweite loescht.
    const kill = el('button', 'card__icon', '×');
    kill.type = 'button';
    kill.title = T('contacts.delete');
    let armTimer = null;
    kill.addEventListener('click', async () => {
      if (kill.dataset.armed !== '1') {
        kill.dataset.armed = '1';
        kill.textContent = T('contacts.really');
        armTimer = setTimeout(() => { kill.dataset.armed = '0'; kill.textContent = '×'; }, 4000);
        return;
      }
      clearTimeout(armTimer);
      if (editingId === c.id) resetForm();
      state.contacts = await api.removeContact(c.id);
      renderContacts();
      toast(T('toast.removed', c.name));
    });

    acts.append(copy, edit, kill);
    head.append(acts);
    card.append(head, el('code', 'card__code', c.code));
    if (c.note) card.append(el('p', 'card__note', c.note));
    list.append(card);
  });

  // Auswahlfelder in Senden und Empfangen
  [['#sendContact', '#sendPickRow'], ['#recvContact', '#recvPickRow']].forEach(([sel, row]) => {
    const node = $(sel);
    const keep = node.value;
    while (node.options.length > 1) node.remove(1);
    state.contacts.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      node.append(opt);
    });
    node.value = state.contacts.some((c) => c.id === keep) ? keep : '';
    $(row).classList.toggle('is-hidden', state.contacts.length === 0);
  });
}

/** Bei gewaehltem Kontakt liefert der Kontakt den Code, nicht das Feld. */
function syncSendContact() {
  const c = contactById($('#sendContact').value);
  const field = $('#optCode');
  field.readOnly = Boolean(c);
  if (c) field.value = '';
  field.placeholder = c ? T('send.fromContact', c.name) : T('send.ownCodePlaceholder');
}

$('#sendContact').addEventListener('change', syncSendContact);

$('#recvContact').addEventListener('change', () => {
  const c = contactById($('#recvContact').value);
  if (c) {
    $('#recvCode').value = c.code;
    $('#recvCode').focus();
  }
});

function startEdit(contact) {
  editingId = contact.id;
  $('#contactName').value = contact.name;
  $('#contactCode').value = contact.code;
  $('#contactNote').value = contact.note || '';
  $('#contactFoldTitle').textContent = T('contacts.edit', contact.name);
  $('#contactFold').open = true;
  gradeCode();
  renderContacts();
  $('#contactName').focus();
}

function resetForm() {
  editingId = null;
  $('#contactName').value = '';
  $('#contactCode').value = '';
  $('#contactNote').value = '';
  $('#contactFoldTitle').textContent = T('contacts.new');
  $('#contactStrength').textContent = '';
  $('#contactStrength').dataset.tone = '';
}

/** Kurze Rueckmeldung, wie belastbar der eingetragene Code ist. */
function gradeCode(bits) {
  const code = $('#contactCode').value.trim();
  const hint = $('#contactStrength');
  if (!code) { hint.textContent = ''; hint.dataset.tone = ''; return; }
  if (code.length < 6) {
    hint.textContent = T('contacts.tooShort');
    hint.dataset.tone = 'bad';
  } else if (bits) {
    hint.textContent = T('contacts.diced', bits);
    hint.dataset.tone = 'good';
  } else if (code.length < 24) {
    hint.textContent = T('contacts.weak');
    hint.dataset.tone = 'bad';
  } else {
    hint.textContent = T('contacts.chars', code.length);
    hint.dataset.tone = '';
  }
}

$('#contactCode').addEventListener('input', () => gradeCode());

$('#contactDice').addEventListener('click', async () => {
  const { code, bits } = await api.generateCode();
  $('#contactCode').value = code;
  gradeCode(bits);
});

$('#contactSave').addEventListener('click', async () => {
  const name = $('#contactName').value.trim();
  const code = $('#contactCode').value.trim();
  if (!name) { toast(T('toast.needName'), 'bad'); return; }
  if (code.length < 6) { toast(T('toast.needCode'), 'bad'); return; }

  const clash = state.contacts.find((c) => c.code === code && c.id !== editingId);
  if (clash) { toast(T('toast.codeTaken', clash.name), 'bad'); return; }

  state.contacts = await api.saveContact({ id: editingId, name, code, note: $('#contactNote').value });
  const wasEdit = Boolean(editingId);
  resetForm();
  renderContacts();
  $('#contactFold').open = false;
  toast(T(wasEdit ? 'toast.saved' : 'toast.created', name), 'good');
});

$('#contactReset').addEventListener('click', () => {
  resetForm();
  renderContacts();
  $('#contactFold').open = false;
});

/* ----------------------------- Relay ----------------------------- */

function relayLog(text) {
  const box = $('#relayLog');
  if (box.dataset.fresh !== '1') { box.textContent = ''; box.dataset.fresh = '1'; }
  box.textContent += `${text}\n`;
  if (box.textContent.length > 40000) box.textContent = box.textContent.slice(-28000);
  box.scrollTop = box.scrollHeight;
}

function renderRelayState() {
  const on = Boolean(state.relayId);
  $('#relayState').classList.toggle('is-live', on);
  $('#relayState').lastElementChild.textContent = T(on ? 'relay.running' : 'relay.stopped');
  const btn = $('#relayToggle');
  btn.textContent = T(on ? 'relay.stop' : 'relay.start');
  btn.classList.toggle('btn--stop', on);
  btn.classList.toggle('btn--amber', !on);
}

function handleRelayEvent(id, event) {
  if (event.type === 'started') { relayLog(`$ ${event.command}`); return; }
  if (event.type === 'log') { relayLog(event.line); return; }
  if (event.type === 'failure') { relayLog(`!! ${event.message}`); return; }
  if (event.type === 'done') {
    relayLog(event.cancelled
      ? T('relay.logStopped')
      : T('relay.logEnded', T(event.ok ? 'relay.endedOk' : 'relay.endedErr')));
    if (id === state.relayId) { state.relayId = null; renderRelayState(); }
  }
}

$('#relayToggle').addEventListener('click', async () => {
  if (state.relayId) { api.cancel(state.relayId); return; }
  const res = await api.start('relay', {
    ports: $('#relayPorts').value.trim(),
    host: $('#relayHost').value.trim()
  });
  if (!res.ok) { toast(res.message, 'bad'); return; }
  state.relayId = res.id;
  renderRelayState();
  relayLog(T('relay.logHint', $('#relayPorts').value.trim().split(',')[0]));
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
  ['#setInternalDns', 'internalDns', 'checked'],
  ['#setAutoUpdate', 'autoUpdate', 'checked'],
  ['#setNotify', 'notify', 'checked']
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

function renderCrocStatus() {
  const badge = $('#binStatus');
  const text = $('.chrome__statusText', badge);
  const info = state.crocInfo;

  if (!info) {
    badge.dataset.state = 'pending';
    text.textContent = T('app.searching');
    return;
  }
  if (info.ok) {
    const source = T(info.bundled ? 'set.crocBundled' : 'set.crocSystem');
    badge.dataset.state = 'ok';
    text.textContent = `croc ${info.version}`;
    badge.title = `${info.path}\n${source}`;
    $('#settingsNote').textContent = [
      T('set.crocLine', info.version, source),
      info.path,
      T('set.settingsAt', state.settingsFile)
    ].join('\n');
  } else {
    badge.dataset.state = 'bad';
    text.textContent = T('app.missing');
    badge.title = T('app.missingTitle');
    $('#settingsNote').textContent = T('set.notFound');
  }
}

async function detectCroc(force = false) {
  state.crocInfo = null;
  renderCrocStatus();
  state.crocInfo = await api.detect(force);
  renderCrocStatus();
  renderCrocLatest();
  if (!state.crocInfo.ok) toast(T('toast.crocMissing'), 'bad');
  return state.crocInfo;
}

/** Vergleicht das laufende croc mit der neuesten Veroeffentlichung. */
function renderCrocLatest() {
  const line = $('#crocNote');
  const res = state.crocLatest;
  const running = state.crocInfo && state.crocInfo.ok ? state.crocInfo.version : null;

  line.dataset.tone = '';
  if (!res) { line.textContent = ''; return; }
  if (!res.ok) { line.textContent = T('croc.failed'); return; }
  if (!res.latest || !running) { line.textContent = ''; return; }

  if (isNewerVersion(res.latest, running)) {
    line.textContent = T('croc.outdated', res.latest, running);
    line.dataset.tone = 'warn';
  } else {
    line.textContent = T('croc.current', running);
  }
}

/** Ist a groesser als b? Haupt-, Neben- und Fehlerstand der Reihe nach. */
function isNewerVersion(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkCrocLatest() {
  $('#crocNote').textContent = T('croc.checking');
  state.crocLatest = await api.crocLatest();
  renderCrocLatest();
}

$('#binStatus').addEventListener('click', () => showView('settings'));

/* ----------------------------- Nennung ----------------------------- */

// Freiwillige Unterstuetzung - dieselbe Adresse wie bei NetTracer. Der
// Knopf verweist nur nach aussen: in der App wird keine Zahlung
// abgewickelt und dadurch nichts freigeschaltet.
const SUPPORT_URL = 'https://buymeacoffee.com/bezi';

function renderCredits() {
  $('#creditMade').textContent = T('credit.made');
  $('#creditCroc').textContent = T('credit.croc');
  $('#creditSupport').textContent = T('credit.support');
}

$('#creditMade').addEventListener('click', () => api.openExternal('https://github.com/thecrafti87'));
$('#creditCroc').addEventListener('click', () => api.openExternal('https://github.com/schollz/croc'));
$('#creditSupport').addEventListener('click', () => api.openExternal(SUPPORT_URL));

/* -------------------------- Aktualisierung -------------------------- */

/** Zeigt den zuletzt geholten Stand an - auch nach einem Sprachwechsel. */
function renderUpdate() {
  const line = $('#updateLine');
  const res = state.update;
  if (!res) { line.textContent = ''; return; }

  if (!res.ok) { line.textContent = T('update.failed'); return; }
  if (!res.latest) { line.textContent = T('update.none'); return; }

  if (res.newer) {
    line.textContent = T('update.available', res.latest, res.current);
    $('#updateText').textContent = T('update.available', res.latest, res.current);
    $('#updateOpen').textContent = T('update.download');
  } else {
    line.textContent = T('update.current', res.current);
  }
}

async function checkUpdate() {
  $('#updateLine').textContent = T('update.checking');
  state.update = await api.checkUpdate();
  renderUpdate();
  if (state.update.ok && state.update.newer) {
    $('#updateOpen').onclick = () => api.openExternal(state.update.url);
    $('#updateBanner').hidden = false;
  }
}

$('#updateClose').addEventListener('click', () => { $('#updateBanner').hidden = true; });

/* ------------------------------ Menue ------------------------------ */

api.onMenu(async (action) => {
  if (action === 'pick-files') {
    showView('send');
    addPaths(await api.pickFiles());
  } else if (action === 'goto-send') {
    showView('send');
  } else if (action === 'goto-receive') {
    showView('receive');
    $('#recvCode').focus();
  }
});

/* ------------------------------ Start ------------------------------ */

(async function boot() {
  const { values, defaultOutDir, file, version } = await api.getSettings();
  state.lang = values.lang || DEFAULT_LANG;
  state.defaultOutDir = defaultOutDir;
  state.settingsFile = file;

  fillSettings(values);
  $('#recvOut').value = values.outDir || defaultOutDir;
  if (!values.outDir) $('#setOutDir').value = defaultOutDir;
  $('#appVersion').textContent = `v${version}`;

  state.contacts = await api.listContacts();

  buildLangPicker();
  applyLang();

  await detectCroc(false);
  if (values.autoUpdate) {
    checkUpdate();
    checkCrocLatest();
  }
})();
