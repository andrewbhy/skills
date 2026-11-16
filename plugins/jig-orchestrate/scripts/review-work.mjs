if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-work.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Work-item mutations: every change to a queue item goes through moveWork, which checks the state machine
// (review-states.mjs), writes the queue under its lock and leaves a system line in the item's thread.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { atomicWriteFile } from './jig-store.mjs';
import { appendThread, linkedThreadOf, readItems, readProgress, readThread, reviewDir, writeProgress } from './review-core.mjs';
import { readOwnership } from './review-ownership.mjs';
import { withQueueLock } from './queue.mjs';
import { applyWorkEdit, applyWorkMove, doctorQueue, moveLine, workState } from './review-states.mjs';

// The single write path for changing one queue item: stamps updatedAt (and drops a backfill mark) unless stamp is false (lookups).
export function mutateQueueItem(queuePath, id, change, { now = new Date(), stamp = true } = {}) {
  return withQueueLock(queuePath, () => {
    const data = JSON.parse(readFileSync(queuePath, 'utf8'));
    const x = (data.items ?? []).find((i) => i && String(i.id) === String(id));
    if (!x) throw new Error(`No queue item ${id}.`);
    const result = change(x);
    if (stamp) { x.updatedAt = now.toISOString(); delete x.timeSource; }
    atomicWriteFile(queuePath, JSON.stringify(data, null, 2) + '\n');
    return { item: x, result };
  });
}
const line = (id, text, dir, now, tower = true) => { if (!tower) return; try { appendThread(String(id), 'system', text, dir, now); } catch { /* a missing line never blocks the change */ } };

// The one transition function for work. Illegal moves throw with a clear reason and change nothing.
// Naming the state the item is already in is allowed when --waits or --item change something: a same-state edit, logged.
export const waitActions = ['answer', 'try', 'approve', 'read'];
function assignment(providerModel, job, timebox, session, now) {
  const match = typeof providerModel === 'string' && providerModel.match(/^(claude|codex)(?::([A-Za-z0-9\-_.:/]{1,80}))?$/);
  if (!match || match[0] !== providerModel) throw new Error('--assignee must be claude or codex, optionally :model (1 to 80 letters, digits or -_.:/).');
  if (job !== undefined && (typeof job !== 'string' || job.length < 1 || job.length > 80 || /[^A-Za-z0-9\-_.:/]/.test(job))) throw new Error('--job must contain 1 to 80 letters, digits or -_.:/.');
  if (timebox !== undefined && (!String(timebox).length || /\D/.test(String(timebox)) || !Number.isInteger(Number(timebox)) || Number(timebox) < 1 || Number(timebox) > 1440)) throw new Error('--timebox must be an integer from 1 to 1440 minutes.');
  return { provider: match[1], model: match[2] ?? null, job: job ?? null, session: session ?? null, startedAt: now.toISOString(), timeboxMinutes: timebox === undefined ? null : Number(timebox) };
}
export function moveWork(queuePath, id, to, { by = 'coordinator', reason = '', waits, item, dir = reviewDir(), now = new Date(), revisit, thread, action, assignee, job, timebox, tower = true } = {}) {
  if (!tower && thread) throw new Error('tower is off for this project: set layers.tower');
  if (action !== undefined && !waitActions.includes(action)) throw new Error('--action must be answer, try, approve or read.');
  if (action !== undefined && to !== 'waiting-person') throw new Error('--action applies only to waiting-person.');
  const assigning = assignee !== undefined || job !== undefined || timebox !== undefined;
  if (assigning && to !== 'running') throw new Error('--assignee, --job and --timebox apply only to running.');
  if (assigning) assignment(assignee, job, timebox, null, now); // refuse before any queue write
  const wantsItem = typeof item === 'string' && item.trim();
  const { item: x, result } = mutateQueueItem(queuePath, id, (x) => {
    const from = workState(x);
    const metadata = () => {
      if (to !== 'waiting-person' || waits !== undefined) delete x.action;
      if (action !== undefined) x.action = action;
      if (to === 'running' && from !== 'running') { x.runningAt = now.toISOString(); delete x.lastSeen; delete x.assignee; }
      // Resolve from this edited item, not the old queue still on disk (a link may have just changed).
      if (assigning) x.assignee = assignment(assignee, job, timebox, tower ? readOwnership(linkedThreadOf(x) ?? String(id), dir, { canonical: false }).owner?.sessionId : null, now);
    };
    if (from === to && (waits !== undefined || wantsItem || revisit !== undefined || thread !== undefined || action !== undefined || assigning)) {
      const changed = [];
      if (applyWorkEdit(x, { waits })) changed.push(waits === '' || !String(waits).trim() ? 'wait cleared' : 'wait changed');
      if (wantsItem) { x.item = item.trim(); changed.push('text changed'); }
      if (revisit !== undefined) { if (to !== 'parked') throw new Error(`Queue item ${id} is not parked; --revisit only applies to parked items.`); setRevisit(x, revisit); changed.push('revisit set'); }
      if (thread !== undefined) changed.push(setThreadLink(x, thread, dir));
      metadata();
      if (action !== undefined) changed.push('action set');
      if (assigning) changed.push('assignee set');
      return { edit: `edited by ${by}: ${changed.join(', ')}` };
    }
    const move = applyWorkMove(x, to, { by, reason, waits: waits ?? '' });
    if (wantsItem) x.item = item.trim();
    if (thread !== undefined) setThreadLink(x, thread, dir);
    metadata();
    if (to === 'parked') { x.parkedAt = now.toISOString(); if (revisit !== undefined) setRevisit(x, revisit); }
    else delete x.parkedAt;
    return move;
  }, { now });
  line(id, result.edit ?? moveLine(result), dir, now, tower);
  return x;
}
// A work item linked to a review item shares that item's one thread (item-<n>); '' removes the link.
export function setThreadLink(x, thread, dir) {
  const t = String(thread ?? '').trim();
  if (!t) { delete x.thread; return 'thread link removed'; }
  const m = t.match(/^item-(\d+)$/);
  if (!m) throw new Error(`--thread must name a review item such as item-34 (got ${JSON.stringify(t)}).`);
  if (!readItems(dir).items.some((i) => i.id === Number(m[1]))) throw new Error(`No review item ${m[1]} to link to.`);
  x.thread = t;
  return `thread linked to ${t}`;
}
// "revisit" is free text: a date (YYYY-MM-DD) or a trigger such as "when item-31 closes". Nothing unparks by itself.
export function setRevisit(x, text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!t) { delete x.revisit; delete x.revisitOn; return; }
  x.revisit = t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && Number.isFinite(Date.parse(t))) x.revisitOn = t; else delete x.revisitOn;
}
export function setWorkRevisit(queuePath, id, text) {
  return mutateQueueItem(queuePath, id, (x) => {
    if (workState(x) !== 'parked') throw new Error(`Queue item ${id} is not parked.`);
    setRevisit(x, text);
  }).item;
}
// Register a new work item (the only way to add one). Refuses a bad id, a duplicate, an unknown state or a bad thread link.
export const workKinds = ['spike', 'build', 'review', 'merge'];
export function addWork(queuePath, id, text, { state = 'new', kind, provider, browser = false, gpu = false, thread, waits = '', dir = reviewDir(), now = new Date(), tower = true } = {}) {
  if (!tower && thread) throw new Error('tower is off for this project: set layers.tower');
  if (!/^[a-z0-9][a-z0-9.-]{0,80}$/.test(String(id ?? ''))) throw new Error('Invalid id ' + JSON.stringify(id) + ': use a lowercase slug such as spike-lane-audit.');
  if (!String(text ?? '').trim()) throw new Error('Item text is empty.');
  if (!['new', 'running', 'waiting-person'].includes(state)) throw new Error('queue-add starts an item as new, running or waiting-person (got ' + JSON.stringify(state) + '); move it later with queue-set.');
  if (kind !== undefined && !workKinds.includes(kind)) throw new Error('Unknown kind ' + JSON.stringify(kind) + '. Use one of: ' + workKinds.join(', ') + '.');
  if (provider !== undefined && !['claude', 'codex'].includes(provider)) throw new Error('Unknown provider ' + JSON.stringify(provider) + '. Use claude or codex.');
  if (state === 'waiting-person' && !String(waits).trim()) throw new Error('waiting-person needs --waits "<what the person decides>".');
  return withQueueLock(queuePath, () => {
    let data = { version: 1, items: [] };
    try { data = JSON.parse(readFileSync(queuePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Queue file unreadable; not adding.'); }
    if (!Array.isArray(data.items)) throw new Error('Queue file has no items list.');
    if (data.items.some((i) => i && String(i.id) === id)) throw new Error('Queue item ' + id + ' already exists.');
    const x = { provider: provider ?? 'claude', browser: Boolean(browser), id, state: state === 'running' ? 'running' : 'pending', ...(state === 'running' ? { runningAt: now.toISOString() } : {}), item: String(text).trim(), area: kind ?? 'work', ...(kind ? { kind } : {}), ...(gpu ? { gpu: true } : {}), touches: [], addedAt: now.toISOString() };
    if (state === 'waiting-person') x.waitsFor = /^person\b/i.test(waits.trim()) ? waits.trim() : 'person: ' + waits.trim();
    if (thread) setThreadLink(x, thread, dir);
    data.items.push(x);
    atomicWriteFile(queuePath, JSON.stringify(data, null, 2) + '\n');
    line(thread || id, 'work added: ' + id + ' (' + (kind ?? 'work') + ', ' + state + ')' + (thread ? ' linked to ' + thread : ''), dir, now, tower);
    if (thread) line(id, 'added as ' + state + ', linked to ' + thread, dir, now, tower);
    return x;
  });
}
// Work items linked to a review item, newest first (by addedAt, then queue order).
export function workForThread(items, threadId, { progressOf = () => null } = {}) {
  return items.map((x, n) => ({ x, n })).filter(({ x }) => x && !x.superseded && linkedThreadOf(x) === threadId)
    .sort((a, b) => String(b.x.addedAt ?? '').localeCompare(String(a.x.addedAt ?? '')) || b.n - a.n)
    .map(({ x }) => { const p = progressOf(String(x.id)); return { id: String(x.id), kind: String(x.kind ?? x.area ?? ''), state: workState(x), item: String(x.item ?? '').slice(0, 140), progress: p?.text ?? '', progressAt: p?.at ?? null, addedAt: x.addedAt ?? null }; });
}
// Change the text of an item without moving it (superseded items are final).
export function setItemText(queuePath, id, text) {
  return mutateQueueItem(queuePath, id, (x) => {
    if (workState(x) === 'superseded') throw new Error(`Queue item ${id} is superseded and final.`);
    if (!String(text ?? '').trim()) throw new Error('Item text is empty.');
    x.item = String(text).trim();
  }).item;
}
export function setParked(queuePath, id, reason, { dir = reviewDir(), now = new Date(), by = 'coordinator', revisit } = {}) {
  if (reason !== null) return moveWork(queuePath, id, 'parked', { by, reason: String(reason).trim() || `parked by ${by}`, dir, now, revisit });
  const { result } = mutateQueueItem(queuePath, id, (x) => ({ state: workState(x), board: x.parkedBoard ?? (x.parkedFrom === 'running' ? 'running' : 'new'), waits: Array.isArray(x.parkedWaits) ? x.parkedWaits.join('; ') : x.parkedWaits ?? '' }), { stamp: false });
  if (result.state !== 'parked') throw new Error(`Queue item ${id} is not parked.`);
  const waiting = result.board.startsWith('waiting') && result.waits;
  return moveWork(queuePath, id, waiting ? result.board : result.board.startsWith('waiting') ? 'new' : result.board, { by, reason: 'unparked', waits: waiting ? result.waits : '', dir, now });
}
export const closeWork = (queuePath, id, { reason = '', by = 'person', dir = reviewDir(), now = new Date() } = {}) => moveWork(queuePath, id, 'done', { by, reason, dir, now });
export function reopenWork(queuePath, id, { by = 'person', dir = reviewDir(), now = new Date() } = {}) {
  const { result } = mutateQueueItem(queuePath, id, (x) => x.closedFrom, { stamp: false });
  return moveWork(queuePath, id, result === 'running' ? 'running' : 'waiting-person', { by, reason: 'reopened', dir, now });
}

// Findings about the board's queue; empty when consistent.
// The last sign of life of a running job: its latest progress report or its latest thread message.
export function heartbeatOf(id, dir = reviewDir(), item = {}) {
  const times = [item.lastSeen, readProgress(id, dir)?.at, ...readThread(linkedThreadOf(item) ?? String(id), dir).filter(m => m.from !== 'system').map(m => m.at)].filter((t) => Number.isFinite(Date.parse(t)));
  return times.length ? times.sort().pop() : null;
}
export function reportProgress(queuePath, id, text, { dir = reviewDir(), now = new Date(), generation, tower = true } = {}) {
  if (!String(text ?? '').trim()) throw new Error('Progress text is empty.');
  return mutateQueueItem(queuePath, id, x => {
    const rec = tower ? writeProgress(id, text, dir, now, { thread: linkedThreadOf(x) ?? id, generation }) : { text: String(text).trim().slice(0, 300), at: now.toISOString(), startedAt: x.progress?.startedAt ?? now.toISOString() };
    if (!tower) x.progress = rec;
    x.lastSeen = rec.at;
    return rec;
  }, { now }).result;
}
export function doctor(queuePath, { dir = reviewDir(), now = Date.now(), staleMinutes = 120, tower = true } = {}) {
  let items;
  try { items = JSON.parse(readFileSync(queuePath, 'utf8')).items; } catch (e) { return [{ id: '-', problem: e.code === 'ENOENT' ? 'queue file not found' : 'queue file unreadable' }]; }
  if (!Array.isArray(items)) return [{ id: '-', problem: 'queue file has no items list' }];
  const findings = doctorQueue(items, { now, staleMs: staleMinutes * 60000, progressAt: id => tower ? heartbeatOf(id, dir) : items.find(x => String(x?.id) === id)?.lastSeen });
  return tower ? findings : findings.filter(f => !f.problem.startsWith('wait on the person has no valid action') && !f.problem.startsWith('hint: names review item'));
}
