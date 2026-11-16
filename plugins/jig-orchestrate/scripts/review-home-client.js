// Behaviour of the dashboard home page. Inlined by review-home-page.mjs: plain browser script, no imports.
// Keys: j/k move between rows, Enter opens the row, p parks a work row (asks why), c closes it, u undoes the last change, Esc cancels.
const openKey = 'jig-review-open', filtKey = 'jig-review-filter', tabKey = 'jig-review-tab';
let openState = {}; try { openState = JSON.parse(localStorage.getItem(openKey) || '{}'); } catch (e) { /* none */ }
for (const d of document.querySelectorAll('details[data-key]')) {
  if (d.dataset.key in openState) d.open = !!openState[d.dataset.key];
  d.addEventListener('toggle', () => { openState[d.dataset.key] = d.open; localStorage.setItem(openKey, JSON.stringify(openState)); });
}
const $ = (id) => document.getElementById(id);
let last = '', state = { items: [] }, filt = localStorage.getItem(filtKey) || 'all', closedOpen = false;
let editing = null, pendingRender = false, selKey = null, toastTimer = null, shownUndo = null, activeTab = 'board';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ago(ms) { const s = Math.max(0, Math.floor(ms / 1000)); if (s < 10) return 'just now'; if (s < 60) return s + 's ago'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ' + (m % 60) + 'm ago'; return Math.floor(h / 24) + 'd ago'; }
function dur(ms) { const m = Math.floor(Math.max(0, ms) / 60000); if (m < 1) return '<1m'; if (m < 60) return m + 'm'; return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
const when = formatTowerTime;
const day = (iso) => when(iso) || 'unknown';
const unread = (id) => !!(state.unread && state.unread[id]);

// ---------- talking to the server ----------
async function post(path, body) {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast((j && j.error) || ('Not saved (' + r.status + ')')); return null; }
    return j || {};
  } catch (e) { toast('Server unreachable'); return null; }
}
async function act(path, body, text) {
  const j = await post(path, body);
  if (!j) return null;
  if (j.undo) { shownUndo = j.undo.at; toast(text || j.undo.label, true); } else if (text) toast(text);
  await poll(true);
  return j;
}
function toast(text, withUndo) {
  const t = $('toast'); t.textContent = '';
  t.append(el('span', null, text));
  if (withUndo) { const b = el('button', null, 'Undo'); b.title = 'Take the last change back (u)'; b.addEventListener('click', doUndo); t.append(b); }
  t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, withUndo ? 20000 : 5000);
}
async function doUndo() {
  const j = await post('/api/undo');
  if (j) { $('toast').hidden = true; toast('Undone: ' + j.label); await poll(true); }
}
const canUndo = () => !$('toast').hidden && !!$('toast').querySelector('button');

// ---------- small pieces ----------
const pillText = { 'waiting-you': 'waiting for you', 'waiting-coordinator': 'waiting for coordinator', blocked: 'blocked', closed: 'closed' };
const pill = (s) => el('span', 'pill ' + s, pillText[s] || s);
function dot(id) { const d = el('span', 'udot' + (unread(id) ? '' : ' off')); if (unread(id)) d.title = 'New since you last looked'; return d; }
function notesEl(list) {
  const box = el('div', 'dnotes');
  const lead = { outdates: 'outdated by decisions', informs: 'new light from', confirms: 'confirmed by', reopens: 'reopened by decisions' };
  const groups = {};
  for (const n of list || []) { if (n.active) (groups[n.kind + '|' + n.project] = groups[n.kind + '|' + n.project] || []).push(n); }
  for (const g of Object.values(groups)) {
    const n = g[0];
    const text = g.length === 1 ? n.text : (lead[n.kind] || n.kind) + ' ' + g.map((x) => '#' + x.id).join(', ') + ' (' + n.project + ')';
    const s = el('span', 'dn dn-' + n.kind, (n.kind === 'confirms' ? '✓ ' : '') + text); s.title = g.map((x) => '#' + x.id + ' ' + (x.decision || '')).join(' | '); box.append(s);
  }
  return box.childNodes.length ? box : null;
}
const waitLabel = { person: 'you', coordinator: 'coordinator', agent: 'agent', date: 'date', prerequisite: 'prerequisite' };
function waitEl(r) {
  if (!r.waitWho) return null;
  const w = el('div', 'w');
  if (r.waitWho === 'person') { const b = document.createElement('b'); b.textContent = 'you'; w.append(document.createTextNode((({ answer: 'Answer', try: 'Try', approve: 'Approve', read: 'Read' })[r.action] || 'Open') + ' · waits on '), b); } else w.append(document.createTextNode('waits on ' + (waitLabel[r.waitWho] || r.waitWho)));
  if (r.waitNote) w.append(document.createTextNode(' · ' + r.waitNote));
  w.title = r.wait; return w;
}

// ---------- work rows: Close and Park on every row, the reason shown when one is not possible ----------
function actBtn(label, verdict, title, onClick) {
  const a = el('div', 'act');
  const b = el('button', 'sbtn', label); b.type = 'button';
  if (verdict && verdict.ok) { b.title = title; b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); } else { b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.title = (verdict && verdict.reason) || 'not available'; a.append(b, el('span', 'off', (verdict && verdict.reason) || 'not available')); return a; }
  a.append(b); return a;
}
function workRow(r, cls) {
  const d = el('div', 'rw' + (cls ? ' ' + cls : '')); d.dataset.row = '1'; d.dataset.key = 'w:' + r.id; d.dataset.workId = r.id; d.tabIndex = -1;
  const isDone = cls === 'nodisc';
  const href = isDone ? (r.planUrl ? safeHref(r.planUrl) : '') : '/t/' + encodeURIComponent(r.thread || r.id); d.dataset.href = href; d.title = r.id;
  const main = document.createElement('div');
  main.append(el('span', 'tag', r.project || 'other'));
  let t;
  if (isDone) { if (r.planUrl) { t = el('a', 'rt t', r.item); t.href = safeHref(r.planUrl); } else t = el('span', 'rt', r.item); } else { t = el('a', 'rt t' + (unread(r.thread || r.id) ? ' has' : ''), r.item); t.href = safeHref(href); }
  main.append(t);
  const dn = notesEl(r.decisionNotes); if (dn) main.append(dn);
  if (r.status) main.append(el('span', 'pill ' + r.status.display.discussion, r.status.display.label));
  const w = waitEl(r); if (w) main.append(w);
  if (!isDone) main.append(assigneeEl(r));
  if (cls === 'run' && r.progress !== undefined) main.append(progEl(r));
  const acts = el('div', 'racts');
  if (isDone) acts.append(actBtn('Reopen', { ok: true }, 'Put it back on your list', () => act('/api/work/' + encodeURIComponent(r.id) + '/reopen')));
  else {
    const a = r.actions || {};
    acts.append(actBtn('Close', a.close, 'Close this work item (c); the job itself is not stopped', () => closeRow(r)));
    acts.append(actBtn('Park', a.park, 'Set it aside, with a reason (p)', () => startPark(d, r)));
  }
  d.append(isDone ? el('span') : dot(r.thread || r.id), main, acts);
  return d;
}
function closeRow(r) { return act('/api/work/' + encodeURIComponent(r.id) + '/close', {}, 'Closed: ' + r.item.slice(0, 70)); }
function assigneeEl(r) {
  const a = r.assignee || {};
  return el('div', 'meta', 'Assignee: ' + (a.provider || 'unknown') + ' · model: ' + (a.model || 'unknown') + ' · last sign of life: ' + (r.lastSeen ? day(r.lastSeen) : 'unknown'));
}
function startPark(row, r) {
  cancelEdit();
  const f = el('form', 'pform');
  const why = el('input'); why.placeholder = 'Why park it? (optional)'; why.maxLength = 300; why.setAttribute('aria-label', 'Reason');
  const rv = el('input'); rv.placeholder = 'Revisit on (date or trigger, optional)'; rv.maxLength = 200; rv.setAttribute('aria-label', 'Revisit date or trigger');
  const ok = el('button', 'sbtn', 'Park'); const no = el('button', 'sbtn', 'Cancel'); no.type = 'button';
  no.addEventListener('click', cancelEdit);
  f.append(why, rv, ok, no); row.append(f);
  f.addEventListener('submit', async (e) => { e.preventDefault(); const body = { reason: why.value.trim() }; if (rv.value.trim()) body.revisit = rv.value.trim(); editing = null; await act('/api/work/' + encodeURIComponent(r.id) + '/park', body, 'Parked: ' + r.item.slice(0, 70)); });
  editing = { close: () => f.remove() }; why.focus();
}
function cancelEdit() { if (editing) { editing.close(); editing = null; if (pendingRender) { pendingRender = false; render(); } } }
function progEl(r) {
  const p = el('div', 'prog');
  if (r.progress) { const e = el('span', 'el'); e.dataset.since = r.progress.startedAt; const u = el('span', 'up'); u.dataset.at = r.progress.at; u.dataset.text = r.progress.text; p.append(e, u); } else p.append(el('span', null, 'no progress reported yet'));
  return p;
}
function groups(rows, box, full) {
  const order = state.groupOrder || ['jig', 'other'];
  const by = {}; for (const r of rows) (by[r.project || 'other'] = by[r.project || 'other'] || []).push(r);
  for (const p of order.concat(Object.keys(by).filter((k) => !order.includes(k)))) {
    if (!by[p]) continue;
    box.append(el('div', 'pg', p + ' (' + by[p].length + ')'));
    for (const r of by[p]) box.append(workRow(r, full && r.progress !== undefined ? 'run' : ''));
  }
}
function tick() {
  const now = Date.now();
  for (const e of document.querySelectorAll('[data-since]')) e.textContent = 'running ' + dur(now - Date.parse(e.dataset.since));
  for (const u of document.querySelectorAll('[data-at]')) {
    const age = now - Date.parse(u.dataset.at);
    u.textContent = 'updated ' + when(u.dataset.at) + ': ' + u.dataset.text;
    u.title = ago(age);
    const row = u.closest('.rw'); if (row) row.classList.toggle('fresh', age < 60000);
  }
}
function renderWork() {
  const w = state.work; $('work').hidden = !w; $('qh').hidden = !w; $('qbody').hidden = !w;
  const box = $('workbody'), run = $('runbody'), next = $('nextbox'); box.textContent = ''; run.textContent = ''; next.textContent = ''; $('qbody').textContent = '';
  if (!w) return;
  if (w.notice) { box.append(el('p', 'meta', w.notice)); return; }
  const need = w.needsYou || [];
  $('qh').textContent = 'Your move (' + need.length + ')';
  for (const r of need) $('qbody').append(workRow(r, ''));
  if (!need.length) $('qbody').append(el('p', 'meta', 'Nothing needs your move.'));
  run.append(el('h3', null, 'Running (' + w.running.length + ')')); groups(w.running, run, true);
  if (!w.running.length) run.append(el('p', 'meta', 'Nothing running.'));
  next.append(el('h3', null, 'Next up (' + w.next.length + ')')); groups(w.next, next, false);
  for (const [k, key] of [['wait', 'waiting'], ['done', 'done']]) {
    $(k + 'cnt').textContent = '(' + w[key].length + ')'; const b = $(k + 'body'); b.textContent = '';
    if (k === 'done') for (const r of w[key].slice().reverse()) b.append(workRow(r, 'nodisc')); else groups(w[key], b, false);
  }
  tick();
}

// ---------- review items ----------
function itemRow(it) {
  const r = el('div', 'item'); r.dataset.row = '1'; r.dataset.key = 'i:' + it.id; r.dataset.href = '/t/' + encodeURIComponent(it.thread); r.tabIndex = -1;
  const mid = document.createElement('div');
  const head = document.createElement('div');
  const t = el('a', 't' + (it.unread ? ' has' : ''), it.title); t.href = safeHref(r.dataset.href);
  head.append(el('span', 'kind', it.kind), t, it.statusLabel ? el('span', 'pill ' + it.status, it.statusLabel) : pill(it.status));
  if (it.stale) {
    const h = el('span', 'hint', 'stale?');
    const days = Math.floor((Date.now() - Math.max(Date.parse(it.added), Date.parse(it.keptAt || it.added))) / 86400000);
    const c = el('button', 'sbtn', 'Close'); c.title = 'Close this item as stale'; c.addEventListener('click', () => act('/api/items/' + it.id + '/close', { reason: 'stale: untouched for ' + Math.max(days, 3) + ' days' }, 'Closed: ' + it.title.slice(0, 70)));
    const kp = el('button', 'sbtn', 'Keep'); kp.title = 'Keep it open; the stale clock restarts'; kp.addEventListener('click', () => act('/api/items/' + it.id + '/keep'));
    h.append(c, kp); head.append(h);
  }
  const bits = [];
  if (it.blockedBy.length) bits.push('blocked by ' + it.blockedBy.map((b) => b.label).join(', '));
  if (it.blocks && it.blocks.length) bits.push('blocks ' + it.blocks.map((b) => '#' + b.id).join(', '));
  if (it.supersedes && it.supersedes.length) bits.push('replaces ' + it.supersedes.map((n) => '#' + n).join(', '));
  if (it.note) bits.push(it.note);
  const seenBit = it.seenAt ? 'Seen at ' + when(it.seenAt) + (it.fileChanged ? ', document edited since' : '') : 'not opened yet';
  const meta = el('div', 'meta', (bits.length ? bits.join(' - ') + ' - ' : '') + 'added ' + when(it.added) + ' - ' + seenBit + (it.url ? '' : ' (no longer available)'));
  meta.title = '#' + it.id;
  mid.append(head); const dn = notesEl(it.decisionNotes); if (dn) mid.append(dn); mid.append(meta);
  r.append(dot(it.thread), mid); return r;
}

// ---------- open questions as cards ----------
function qButtons(id, rec, opts) {
  const box = el('div', 'qacts');
  box.append(actBtn(opts.acceptLabel || 'Accept default', rec ? { ok: true } : { ok: false, reason: 'no recommended default' }, rec ? 'Accept: ' + rec : '', () => act('/api/questions/' + id + '/accept', {}, 'Accepted the default for ' + id.slice(1))));
  if (opts.answer) box.append(actBtn('Reply', { ok: true }, 'Write to the coordinator about this question; it stays open until a decision is recorded', () => opts.answer()));
  box.append(actBtn('Defer', { ok: true }, 'Not now; the coordinator is told', () => act('/api/questions/' + id + '/defer', {}, 'Deferred ' + id.slice(1))));
  return box;
}
function answerForm(id, host, label) {
  cancelEdit();
  const f = el('form', 'qform');
  const ta = el('textarea'); ta.maxLength = 2000; ta.placeholder = 'Reply on ' + label + ' (Enter sends, Shift+Enter adds a line)'; ta.setAttribute('aria-label', 'Reply on ' + label);
  const ok = el('button', 'sbtn', 'Send reply'); const no = el('button', 'sbtn', 'Cancel'); no.type = 'button'; no.addEventListener('click', cancelEdit);
  f.append(ta, ok, no); host.append(f);
  const send = async () => { const text = ta.value.trim(); if (!text) { ta.focus(); return; } editing = null; await act('/api/questions/' + id + '/reply', { text }, 'Replied on ' + id.slice(1)); };
  f.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  editing = { close: () => f.remove() }; ta.focus();
}
const drafts = {}; const attDrafts = {};
function qThread(c) {
  const t = c.thread || { id: 'oq-' + c.n, messages: [] };
  const box = el('div', 'qthread');
  if (!t.messages.length) box.append(el('div', 'qm meta', 'No messages yet. Write below, or reply to a part of the question.'));
  for (const m of t.messages) {
    const d = el('div', 'qm ' + m.from); d.append(el('span', 'by', (m.from === 'person' ? 'You' : 'Coordinator') + ' \u00b7 ' + when(m.at))); fillMessage(d, m, true); box.append(d);
  }
  const f = el('form', 'qchat'); const ta = el('textarea'); ta.rows = 2; ta.maxLength = 4000; ta.dataset.draft = t.id; ta.value = drafts[t.id] || '';
  const kit = attKit({ host: box, pasteOn: f, list: attDrafts[t.id] || (attDrafts[t.id] = []), onNote: (n) => toast(n) });
  box.append(kit.strip);
  ta.placeholder = 'Discuss with the coordinator (Enter sends, Shift+Enter adds a line, paste an image to attach it)'; ta.setAttribute('aria-label', 'Message about question ' + c.n);
  ta.addEventListener('input', () => { drafts[t.id] = ta.value; });
  const go = el('button', 'sbtn', 'Send message'); const full = el('a', 'sbtn', 'Open full discussion'); full.href = safeHref('/t/' + encodeURIComponent(t.id));
  const send = async () => { const text = ta.value.trim(); if (!text && !kit.payload().length) { ta.focus(); return; } const j = await post('/api/threads/' + t.id, { from: 'person', text, images: kit.payload() }); if (j) { drafts[t.id] = ''; ta.value = ''; kit.clear(); await poll(true); } };
  f.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  f.append(kit.button, kit.input, ta, go, full); box.append(f); return box;
}
function qCard(c) {
  const card = el('div', 'qcard'); card.id = 'q-' + c.n;
  const head = el('div', 'qt'); head.append(el('span', 'qn', c.n + '.'), document.createTextNode(c.title));
  const href = c.link ? safeHref(c.link.href) : '#';
  if (href !== '#') { const a = el('a', 'qsrc', 'source: ' + (c.link.label || 'document')); a.href = safeHref(href); if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } head.append(a); } else if (c.link) head.append(el('span', 'qsrc meta', c.link.label || ''));
  if (unread('oq-' + c.n)) { const u = el('span', 'udot'); u.title = 'New since you last looked'; u.style.marginLeft = '8px'; head.append(u); }
  card.append(head);
  card.append(qThread(c));
  if (c.why) card.append(el('div', 'qwhy', c.why));
  if (c.recommended) { const r = el('div', 'qrec'); r.append(el('b', null, 'Recommended: '), document.createTextNode(c.recommended)); card.append(r); }
  if (!c.subs.length) {
    card.append(qButtons(c.id, c.recommended, { answer: () => answerForm(c.id, card, 'question ' + c.n) }));
    return card;
  }
  const open = c.subs.filter((s) => s.state === 'open');
  if (open.length) {
    const withRec = open.filter((s) => s.recommended).length;
    const bar = qButtons(c.id, withRec ? 'x' : null, { acceptLabel: 'Accept all defaults (' + withRec + ')' });
    bar.querySelectorAll('button')[0].title = 'Accept the recommended default of every open sub-question that has one';
    bar.querySelectorAll('button')[1].title = 'Not now, for every open sub-question';
    bar.querySelectorAll('button')[1].textContent = 'Defer all';
    card.append(bar);
  }
  for (const s of c.subs) {
    const row = el('div', 'qsub' + (s.state === 'open' ? '' : ' done'));
    row.append(el('span', 'qsn', s.n));
    const body = document.createElement('div');
    if (s.state === 'open') {
      body.append(document.createTextNode(s.text));
      if (s.recommended) { const r = el('div', 'qrec'); r.append(el('b', null, 'Recommended: '), document.createTextNode(s.recommended)); body.append(r); }
      body.append(qButtons(s.id, s.recommended, { answer: () => answerForm(s.id, row, 'question ' + s.n) }));
    } else body.append(document.createTextNode(s.text + ' — ' + (s.state === 'deferred' ? 'deferred' : s.state === 'accepted' ? 'default accepted' : s.state === 'replied' ? 'replied, awaiting coordinator' + (s.answer && s.answer.text ? ': ' + s.answer.text : '') : 'answered' + (s.answer && s.answer.text ? ': ' + s.answer.text : ''))));
    row.append(body); card.append(row);
  }
  return card;
}
function renderQuestions() {
  const q = state.questions; $('oq').hidden = !q;
  if (!q) return;
  const body = $('oqbody'); body.textContent = '';
  $('oqh').textContent = 'Open questions (' + q.open.length + ')';
  const order = state.groupOrder || ['jig', 'other'];
  const by = {}; for (const c of q.open) (by[c.project] = by[c.project] || []).push(c);
  for (const p of order.concat(Object.keys(by).filter((k) => !order.includes(k)))) {
    if (!by[p]) continue;
    body.append(el('div', 'qproj', p + ' (' + by[p].length + ')'));
    for (const c of by[p]) body.append(qCard(c));
  }
  if (!q.open.length) body.append(el('p', 'meta', 'No open questions.'));
  const ans = $('oqansbody'); ans.textContent = '';
  const n = q.given.length + q.fileAnswered.length; $('oqans').hidden = !n; $('oqanscnt').textContent = '(' + n + ')';
  for (const g of q.given) {
    const line = el('div', 'meta'); line.style.margin = '4px 0';
    line.append(document.createTextNode((g.status === 'deferred' ? 'Deferred ' : g.status === 'accepted' ? 'Accepted default for ' : g.status === 'replied' ? 'Replied (awaiting coordinator) on ' : 'Answered ') + g.n + ' (' + (g.title || '').slice(0, 60) + ')' + ((g.status === 'answered' || g.status === 'replied') && g.text ? ': ' + g.text : '') + ' · ' + when(g.at) + ' '));
    const b = el('button', 'sbtn', g.status === 'deferred' || g.status === 'replied' ? 'Ask again' : 'Reopen'); b.addEventListener('click', () => act('/api/questions/' + g.id + '/reopen', {}, 'Reopened ' + g.n)); line.append(b);
    ans.append(line);
  }
  for (const f of q.fileAnswered.slice(0, 6)) { const line = el('div', 'meta', f); line.style.margin = '4px 0'; ans.append(line); }
  if (q.fileAnswered.length > 6) ans.append(el('div', 'meta', (q.fileAnswered.length - 6) + ' older answers are in the file.'));
}

// ---------- board issues: an amber chip that opens the findings, each explained and linked ----------
const explain = [
  [/done but still has waitsFor/, 'Finished work still lists something it waits on. Clear it: queue-set <id> --state done --waits "".'],
  [/running but its last progress/, 'Marked running but silent for a while: check that its worker is alive, then relaunch it or move it with queue-set.'],
  [/duplicate id/, 'Two queue entries share one id, so one of them may be hidden.'],
  [/unknown state/, 'The queue holds a state this board does not know; fix it with queue-set.'],
  [/superseded but running/, 'A replaced item is still marked running: stop its worker, then close it.'],
  [/still waits on the person/, 'Parked, yet it asks the person for something: unpark it, or clear the wait.'],
  [/queue file/, 'The queue file is missing or unreadable, so no work shows.']
];
function renderIssues() {
  const bi = state.boardIssues || [], chip = $('issues'), panel = $('issuepanel');
  chip.hidden = !bi.length;
  if (!bi.length) { panel.hidden = true; chip.setAttribute('aria-expanded', 'false'); return; }
  chip.textContent = bi.length + ' board issue' + (bi.length > 1 ? 's' : '');
  chip.title = 'Impossible or stale combinations on the board. Click for the list.';
  panel.textContent = '';
  panel.append(el('h3', null, 'Board issues (' + bi.length + ')'));
  for (const b of bi) {
    const row = el('div', 'iss');
    if (/^[A-Za-z0-9][\w.-]*$/.test(b.id)) { const a = el('a', null, b.id); a.href = safeHref('/t/' + encodeURIComponent(b.id)); row.append(a, document.createTextNode(' \u2014 ')); } else row.append(document.createTextNode(b.id + ' \u2014 '));
    row.append(document.createTextNode(b.problem));
    const hit = explain.find((e) => e[0].test(b.problem));
    if (hit) row.append(el('div', 'why', hit[1]));
    panel.append(row);
  }
}
// ---------- GPU chip: idle/busy at a glance, a panel with the job, owner, lease, queue and recent finishes ----------
const gpuGlyph = { idle: '○', busy: '●', amber: '▲', unknown: '?' };
function renderGpu() {
  const g = state.gpu, chip = $('gpu'), panel = $('gpupanel');
  chip.hidden = !g;
  if (!g) { panel.hidden = true; chip.setAttribute('aria-expanded', 'false'); return; }
  const level = g ? g.chip.level : 'unknown';
  chip.className = 'gpuchip ' + level;
  chip.textContent = '';
  chip.append(el('span', 'gg', gpuGlyph[level] || '?'), document.createTextNode(g ? g.chip.text : 'GPU: unknown'));
  chip.title = 'GPU and ComfyUI use. Click for details.';
  if (panel.hidden) return;
  panel.textContent = '';
  panel.append(el('h3', null, 'GPU and ComfyUI'));
  if (!g) { panel.append(el('p', 'why', 'No reading yet. The tower reads nvidia-smi and ComfyUI every few seconds.')); return; }
  const row = (k, v) => { const r = el('div', 'gr'); r.append(el('span', 'gk', k), el('span', 'gv', v)); panel.append(r); };
  const c = g.comfy, now = Date.now();
  const run = c.running[0];
  row('Now', !c.up ? 'ComfyUI is not answering' : run ? (run.model || 'running') + (run.prefix ? ' / ' + run.prefix : '') + (run.startedAt ? ', since ' + when(run.startedAt) : '') : 'nothing running');
  row('Owner', g.owner ? g.owner.who + ' (' + (g.owner.source === 'lease' ? 'lease' : 'guessed from ' + g.owner.source) + ')' : 'nobody');
  row('Lease', g.lease ? g.lease.who + ': ' + g.lease.task + ', ' + dur(now - Date.parse(g.lease.since)) + ' of about ' + g.lease.expectMinutes + ' min' + (g.lease.stale ? ' (stale, no longer blocks)' : g.lease.overdue ? ' (overdue)' : '') : 'none');
  row('Queue', c.up ? c.pending + ' waiting, ' + c.running.length + ' running' : 'unknown');
  row('VRAM', g.gpu ? (g.gpu.usedMB / 1024).toFixed(1) + ' of ' + (g.gpu.totalMB / 1024).toFixed(0) + ' GB, util ' + (g.gpu.util ?? '?') + '%, ' + (g.gpu.temp ?? '?') + ' °C' : 'nvidia-smi not available');
  panel.append(el('h3', null, 'Last finished'));
  if (!c.lastDone.length) panel.append(el('p', 'why', 'None yet.'));
  for (const d of c.lastDone) {
    const r = el('div', 'gr');
    r.append(el('span', 'gk', d.seconds == null ? '?' : d.seconds >= 60 ? Math.floor(d.seconds / 60) + 'm ' + (d.seconds % 60) + 's' : d.seconds + 's'),
      el('span', 'gv', (d.client || d.prefix || d.promptId.slice(0, 8)) + (d.model ? ' / ' + d.model : '') + (d.status && d.status !== 'success' ? ' [' + d.status + ']' : '') + (d.endedAt ? ', ' + when(d.endedAt) : '')));
    panel.append(r);
  }
}
$('gpu').addEventListener('click', () => { const p = $('gpupanel'); p.hidden = !p.hidden; $('gpu').setAttribute('aria-expanded', String(!p.hidden)); renderGpu(); });
$('issues').addEventListener('click', () => { const p = $('issuepanel'); p.hidden = !p.hidden; $('issues').setAttribute('aria-expanded', String(!p.hidden)); });

// ---------- since you left ----------
function renderDigest() {
  const d = state.digest, box = $('digest');
  box.hidden = !d || d.empty;
  if (box.hidden) return;
  $('digestsum').textContent = 'Since you left (' + when(d.since) + '): ' + d.summary;
  const ul = $('digestlist'); ul.textContent = '';
  const kinds = { item: 'new', reply: 'reply', 'job-done': 'done', 'job-failed': 'failed', decision: 'decision', 'question-answered': 'question', 'question-added': 'question', 'revisit-due': 'revisit' };
  for (const e of d.events.slice(0, 30)) {
    const li = el('li'); li.append(el('span', 'k', kinds[e.kind] || e.kind));
    const a = el('a', null, e.text); a.href = safeHref(e.href); li.append(a); ul.append(li);
  }
  if (d.events.length > 30) ul.append(el('li', 'meta', (d.events.length - 30) + ' more'));
}

// ---------- discussions, decisions, parked ----------
function renderDisc() {
  const all = state.discussions || [];
  const cnt = (s) => all.filter((d) => d.status === s).length;
  $('disccnt').textContent = ' (' + all.length + ')';
  $('discsub').textContent = cnt('waiting-coordinator') ? '(' + cnt('waiting-coordinator') + ' waiting for the coordinator)' : '';
  const chips = $('chips'); chips.textContent = '';
  for (const [k, label] of [['all', 'All'], ['waiting-coordinator', 'Waiting for coordinator'], ['waiting-you', 'Waiting for you'], ['blocked', 'Blocked'], ['closed', 'Closed']]) {
    const n = k === 'all' ? all.length : cnt(k);
    const b = el('button', filt === k ? 'on' : '', label + ' (' + n + ')'); b.addEventListener('click', () => { filt = k; localStorage.setItem(filtKey, k); render(); }); chips.append(b);
  }
  const order = { 'waiting-coordinator': 0, 'waiting-you': 1, working: 1.5, blocked: 2, closed: 3 };
  const byAge = (a, b) => Date.parse(b.lastAt || 0) - Date.parse(a.lastAt || 0);
  const open = all.filter((d) => d.status !== 'closed' && (filt === 'all' || filt === d.status)).sort((a, b) => order[a.status] - order[b.status] || byAge(a, b));
  const closed = all.filter((d) => d.status === 'closed' && (filt === 'all' || filt === 'closed')).sort(byAge);
  const box = $('dlist'); box.textContent = '';
  for (const d of open) box.append(drow(d));
  if (!open.length && filt !== 'closed') box.append(el('p', 'meta', 'No discussions in this view.'));
  const cd = $('dclosed'); cd.hidden = !closed.length; cd.open = filt === 'closed' || closedOpen;
  $('dclosedcnt').textContent = '(' + closed.length + ')';
  const cb = $('dclosedbody'); cb.textContent = '';
  for (const d of closed) cb.append(drow(d));
}
$('dclosed').addEventListener('toggle', () => { if (filt !== 'closed') closedOpen = $('dclosed').open; });
function drow(d) {
  const a = el('a', 'drow'); a.href = safeHref('/t/' + encodeURIComponent(d.id)); a.dataset.row = '1'; a.dataset.key = 'd:' + d.id; a.dataset.href = a.getAttribute('href');
  const p = d.statusLabel ? el('span', 'pill ' + d.status, d.statusLabel) : pill(d.status);
  const ttl = el('span', 'ttl', d.title);
  const who = d.lastFrom === 'person' ? 'You: ' : d.lastFrom === 'coordinator' ? 'Coordinator: ' : '';
  const pv = el('span', 'pv', d.preview ? who + d.preview : 'no messages yet');
  if (d.artifactCount) pv.append(el('small', null, ' · ' + d.artifactCount + ' artifacts'));
  const age = el('span', 'age', when(d.lastAt));
  const mid = document.createElement('span'); mid.style.minWidth = '0'; mid.style.display = 'flex'; mid.style.flexDirection = 'column'; mid.append(ttl, pv);
  a.append(p, mid, age);
  if (d.status === 'closed' && d.closed) a.append(el('span', 'why', 'Closed by ' + d.closed.by + ': ' + d.closed.reason));
  else if (d.status === 'blocked' && d.blockedBy.length) a.append(el('span', 'why', 'Blocked by ' + d.blockedBy.join(', ')));
  if (d.unread) { const u = el('span', 'udot'); u.title = 'New since you last looked'; u.style.marginLeft = '6px'; ttl.append(u); }
  return a;
}
let decFilt = localStorage.getItem('jig-review-dproj') || 'all';
function renderDec() {
  const all = state.decisions || [];
  $('deccnt').textContent = ' (' + all.length + ')';
  const projects = [...new Set(all.map((d) => d.project))].sort();
  if (decFilt !== 'all' && !projects.includes(decFilt)) decFilt = 'all';
  const active = all.reduce((n, d) => n + d.affects.filter((a) => a.active && a.kind === 'outdates').length, 0);
  $('decsub').textContent = active ? '(' + active + ' outdated item' + (active > 1 ? 's' : '') + ' waiting for an update)' : '';
  const chips = $('dchips'); chips.textContent = '';
  for (const k of ['all'].concat(projects)) {
    const n = k === 'all' ? all.length : all.filter((d) => d.project === k).length;
    const b = el('button', decFilt === k ? 'on' : '', (k === 'all' ? 'All' : k) + ' (' + n + ')'); b.addEventListener('click', () => { decFilt = k; localStorage.setItem('jig-review-dproj', k); render(); }); chips.append(b);
  }
  const box = $('declist'); box.textContent = '';
  const shown = all.filter((d) => decFilt === 'all' || d.project === decFilt);
  if (!shown.length) box.append(el('p', 'meta', all.length ? 'No decisions in this project.' : 'No decisions recorded yet.'));
  for (const d of shown) {
    const r = el('div', 'drec' + (d.voided ? ' void' : '')); r.id = 'd-' + d.key;
    const h = el('div', 'hd'); h.append(el('span', 'no', '#' + d.id), el('span', 'tag', d.project), el('span', 'meta', day(d.at)));
    if (d.voided) r.append(el('div', 'voidnote', 'Voided ' + day(d.voided.at) + ': ' + d.voided.reason));
    r.append(h, el('h3', null, d.decision), el('blockquote', null, '“' + d.quote + '”'), el('div', 'src', 'Source: ' + d.source + (d.answers ? ' (answers question ' + d.answers.replace(/^q/i, '') + ')' : '')));
    for (const a of d.affects) {
      const row = el('div', 'aff');
      row.append(el('span', 'dn dn-' + a.kind, a.kind));
      let title;
      if (a.thread) { title = el('a', null, a.title); title.href = safeHref('/t/' + encodeURIComponent(a.thread)); } else title = el('span', null, a.title);
      const mid = document.createElement('span'); mid.append(title);
      if (a.title !== a.ref) mid.append(el('span', 'ref', ' ' + a.ref));
      row.append(mid, el('span', 'st-' + a.state, a.stateLabel));
      r.append(row);
    }
    box.append(r);
  }
}
function renderParked() {
  const pk = (state.work && state.work.parked) || [];
  $('pkcnt').textContent = ' (' + pk.length + ')';
  $('pksub').textContent = pk.length ? '(' + pk.length + ')' : '';
  const box = $('pklist'); box.textContent = '';
  if (!pk.length) box.append(el('p', 'meta', 'Nothing is parked.'));
  const today = new Date().toISOString().slice(0, 10);
  for (const r of pk.slice().sort((a, b) => Date.parse(a.parkedAt || 0) - Date.parse(b.parkedAt || 0))) {
    const d = el('div', 'rw'); d.dataset.row = '1'; d.dataset.key = 'p:' + r.id; d.dataset.href = '/t/' + encodeURIComponent(r.thread || r.id); d.tabIndex = -1;
    const main = document.createElement('div');
    const t = el('a', 'rt t', r.item); t.href = safeHref(d.dataset.href);
    main.append(el('span', 'tag', r.project || 'other'), t);
    main.append(el('div', 'w', 'Why: ' + (r.parkedReason || 'no reason recorded')));
    main.append(el('div', 'w', 'Parked ' + day(r.parkedAt) + ' · last touched ' + day(r.touchedAt)));
    const rv = el('div', 'w');
    if (r.revisit) { const due = r.revisitOn && r.revisitOn <= today; rv.append(document.createTextNode('Revisit: ' + r.revisit + (due ? ' (due)' : ''))); if (due) rv.style.color = '#c2410c'; } else rv.append(document.createTextNode('No revisit set'));
    main.append(rv);
    const acts = el('div', 'racts');
    acts.append(actBtn(r.revisit ? 'Change revisit' : 'Set revisit', { ok: true }, 'A date (2026-12-01) or a trigger (when item-31 closes); only a reminder', () => revisitForm(d, r)));
    acts.append(actBtn('Unpark', { ok: true }, 'Put it back where it was', () => act('/api/work/' + encodeURIComponent(r.id) + '/unpark', {}, 'Unparked: ' + r.item.slice(0, 70))));
    d.append(el('span'), main, acts); box.append(d);
  }
}
function revisitForm(row, r) {
  cancelEdit();
  const f = el('form', 'pform');
  const i = el('input'); i.value = r.revisit || ''; i.placeholder = 'Date (2026-12-01) or trigger (when item-31 closes)'; i.maxLength = 200; i.setAttribute('aria-label', 'Revisit date or trigger');
  const ok = el('button', 'sbtn', 'Save'); const no = el('button', 'sbtn', 'Cancel'); no.type = 'button'; no.addEventListener('click', cancelEdit);
  f.append(i, ok, no); row.append(f);
  f.addEventListener('submit', async (e) => { e.preventDefault(); editing = null; await act('/api/work/' + encodeURIComponent(r.id) + '/revisit', { text: i.value.trim() }, i.value.trim() ? 'Revisit set' : 'Revisit cleared'); });
  editing = { close: () => f.remove() }; i.focus();
}

// ---------- the whole page ----------
function render() {
  if (editing) { pendingRender = true; return; }
  const ae = document.activeElement; const keep = ae && ae.dataset && ae.dataset.draft ? ae.dataset.draft : null;
  renderDigest(); renderWork(); renderQuestions(); renderDisc(); renderDec(); renderParked();
  renderIssues();
  renderGpu();
  const list = $('list'); list.textContent = ''; $('blkbody').textContent = '';
  const open = state.items.filter((i) => i.status !== 'blocked' && i.status !== 'working'); const blocked = state.items.filter((i) => i.status === 'blocked');
  const inprog = state.items.filter((i) => i.status === 'working'); // linked work runs: nothing needed from the person yet
  const fresh = open.filter((i) => i.unread).length;
  const run = state.work ? state.work.running.length : 0;
  const bits = []; if (fresh) bits.push(fresh + ' new'); if (run) bits.push(run + ' running');
  const need = state.work && state.work.needsYou ? state.work.needsYou.length : 0;
  $('needcnt').textContent = (open.length + need) ? '(' + open.length + ' to read, ' + need + ' your move)' : '';
  document.title = (bits.length ? '(' + bits.join(' · ') + ') ' : '') + 'tower';
  $('empty').hidden = open.length > 0;
  for (const it of open) list.append(itemRow(it));
  if (inprog.length) { const h = document.createElement('h3'); h.className = 'sub'; h.textContent = 'In progress, nothing needed from you (' + inprog.length + ')'; list.append(h); for (const it of inprog) list.append(itemRow(it)); }
  $('blk').hidden = !blocked.length; $('blkcnt').textContent = '(' + blocked.length + ')';
  for (const it of blocked) $('blkbody').append(itemRow(it));
  applySel();
  if (keep) { const ta = document.querySelector('textarea[data-draft="' + keep + '"]'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  const u = state.undo;
  if (u && u.at !== shownUndo && Date.now() - Date.parse(u.at) < 20000) { shownUndo = u.at; toast(u.label, true); }
}
function tab(name) {
  activeTab = name;
  for (const [id, n] of [['board', 'board'], ['disc', 'disc'], ['dec', 'dec'], ['pk', 'pk']]) $(id).hidden = name !== n;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  localStorage.setItem(tabKey, name);
  const hash = name === 'disc' ? '#discussions' : name === 'dec' ? '#decisions' : name === 'pk' ? '#parked' : '';
  if (location.hash !== hash && !(name === 'board' && location.hash === '#questions')) history.replaceState(null, '', hash || location.pathname);
  applySel();
}
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));
async function poll(force) {
  try {
    const text = await (await fetch('/api/state', { cache: 'no-store' })).text();
    if (!force && text === last) return;
    last = text; state = JSON.parse(text); render();
  } catch (e) { /* the next poll tries again */ }
}
$('seen').addEventListener('click', async () => { await post('/api/seen', { kind: 'all' }); await poll(true); });
$('digestx').addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); await post('/api/seen', { kind: 'digest-dismiss' }); await poll(true); });

// ---------- keyboard ----------
function visibleRows() {
  const pane = ['board', 'disc', 'dec', 'pk'].map($).find((p) => !p.hidden);
  return [...pane.querySelectorAll('[data-row]')].filter((r) => r.offsetParent !== null);
}
function applySel() {
  for (const r of document.querySelectorAll('.sel')) r.classList.remove('sel');
  if (!selKey) return;
  const r = visibleRows().find((x) => x.dataset.key === selKey);
  if (r) r.classList.add('sel'); else selKey = null;
}
function move(delta) {
  const rows = visibleRows(); if (!rows.length) return;
  let i = rows.findIndex((r) => r.dataset.key === selKey);
  i = i < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, i + delta));
  selKey = rows[i].dataset.key; applySel(); rows[i].focus({ preventScroll: true }); rows[i].scrollIntoView({ block: 'nearest' });
}
const selected = () => visibleRows().find((r) => r.dataset.key === selKey) || null;
function workOf(row) { const all = state.work ? [].concat(state.work.running, state.work.next, state.work.waiting, state.work.needsYou, state.work.parked) : []; return row && row.dataset.workId ? all.find((r) => r.id === row.dataset.workId) : null; }
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (e.key === 'Escape') { if (editing) { cancelEdit(); e.preventDefault(); } return; }
  if (typing) return;
  if (e.key === 'j') { move(1); e.preventDefault(); }
  else if (e.key === 'k') { move(-1); e.preventDefault(); }
  else if (e.key === 'Enter') { const r = selected(); if (r && r.dataset.href && (t === document.body || t === r)) { location.href = safeHref(r.dataset.href); e.preventDefault(); } }
  else if (e.key === 'p' || e.key === 'c') {
    const row = selected(), w = workOf(row);
    if (!w) return;
    const verdict = w.actions && (e.key === 'p' ? w.actions.park : w.actions.close);
    if (!verdict || !verdict.ok) { toast((e.key === 'p' ? 'Cannot park: ' : 'Cannot close: ') + ((verdict && verdict.reason) || 'not available')); e.preventDefault(); return; }
    if (e.key === 'p') startPark(row, w); else closeRow(w);
    e.preventDefault();
  } else if (e.key === 'u') { if (canUndo()) { doUndo(); e.preventDefault(); } }
});

// ---------- go ----------
async function visit() { if (document.visibilityState === 'visible') await post('/api/seen', { kind: 'home' }); }
(async () => {
  const init = $('init');
  if (init) { try { state = JSON.parse(init.textContent); last = JSON.stringify(state); } catch (e) { /* the first poll fills the page */ } }
  tab(location.hash === '#discussions' ? 'disc' : location.hash === '#decisions' ? 'dec' : location.hash === '#parked' ? 'pk' : 'board');
  if (init) render();
  await visit(); await poll(!init);
  if (location.hash === '#questions') { const o = $('oq'); if (o) o.scrollIntoView(); }
  setInterval(poll, 3000); setInterval(tick, 5000); setInterval(visit, 60000);
  document.addEventListener('visibilitychange', visit);
  window.addEventListener('pageshow', (event) => { if (event.persisted) { visit(); poll(); } });
})();
