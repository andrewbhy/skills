// Work-item mutations: every change to a queue item goes through moveWork, which checks the state machine
// (review-states.mjs), writes the queue under its lock and leaves a system line in the item's thread.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { appendThread, readItems, readProgress, readThread, reviewDir } from './review-core.mjs';
import { withQueueLock } from './queue.mjs';
import { applyWorkEdit, applyWorkMove, doctorQueue, moveLine, workState } from './review-states.mjs';

export function mutateQueueItem(queuePath, id, change) {
  return withQueueLock(queuePath, () => {
    const data = JSON.parse(readFileSync(queuePath, 'utf8'));
    const x = (data.items ?? []).find((i) => i && String(i.id) === String(id));
    if (!x) throw new Error(`No queue item ${id}.`);
    const result = change(x);
    const tmp = `${queuePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    renameSync(tmp, queuePath);
    return { item: x, result };
  });
}
const line = (id, text, dir, now) => { try { appendThread(String(id), 'system', text, dir, now); } catch { /* a missing line never blocks the change */ } };

// The one transition function for work. Illegal moves throw with a clear reason and change nothing.
// Naming the state the item is already in is allowed when --waits or --item change something: a same-state edit, logged.
export function moveWork(queuePath, id, to, { by = 'coordinator', reason = '', waits, item, dir = reviewDir(), now = new Date(), revisit, thread } = {}) {
  const wantsItem = typeof item === 'string' && item.trim();
  const { item: x, result } = mutateQueueItem(queuePath, id, (x) => {
    if (workState(x) === to && (waits !== undefined || wantsItem || revisit !== undefined || thread !== undefined)) {
      const changed = [];
      if (applyWorkEdit(x, { waits })) changed.push(waits === '' || !String(waits).trim() ? 'wait cleared' : 'wait changed');
      if (wantsItem) { x.item = item.trim(); changed.push('text changed'); }
      if (revisit !== undefined) { if (to !== 'parked') throw new Error(`Queue item ${id} is not parked; --revisit only applies to parked items.`); setRevisit(x, revisit); changed.push('revisit set'); }
      if (thread !== undefined) changed.push(setThreadLink(x, thread, dir));
      return { edit: `edited by ${by}: ${changed.join(', ')}` };
    }
    const move = applyWorkMove(x, to, { by, reason, waits: waits ?? '' });
    if (wantsItem) x.item = item.trim();
    if (thread !== undefined) setThreadLink(x, thread, dir);
    if (to === 'parked') { x.parkedAt = now.toISOString(); if (revisit !== undefined) setRevisit(x, revisit); }
    else delete x.parkedAt;
    return move;
  });
  line(id, result.edit ?? moveLine(result), dir, now);
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
  const { result } = mutateQueueItem(queuePath, id, (x) => ({ state: workState(x), board: x.parkedBoard ?? (x.parkedFrom === 'running' ? 'running' : 'new'), waits: Array.isArray(x.parkedWaits) ? x.parkedWaits.join('; ') : x.parkedWaits ?? '' }));
  if (result.state !== 'parked') throw new Error(`Queue item ${id} is not parked.`);
  const waiting = result.board.startsWith('waiting') && result.waits;
  return moveWork(queuePath, id, waiting ? result.board : result.board.startsWith('waiting') ? 'new' : result.board, { by, reason: 'unparked', waits: waiting ? result.waits : '', dir, now });
}
export const closeWork = (queuePath, id, { reason = '', by = 'person', dir = reviewDir(), now = new Date() } = {}) => moveWork(queuePath, id, 'done', { by, reason, dir, now });
export function reopenWork(queuePath, id, { by = 'person', dir = reviewDir(), now = new Date() } = {}) {
  const { result } = mutateQueueItem(queuePath, id, (x) => x.closedFrom);
  return moveWork(queuePath, id, result === 'running' ? 'running' : 'waiting-person', { by, reason: 'reopened', dir, now });
}

// Findings about the board's queue; empty when consistent.
// The last sign of life of a running job: its latest progress report or its latest thread message.
export function heartbeatOf(id, dir = reviewDir()) {
  const times = [readProgress(id, dir)?.at, readThread(String(id), dir).at(-1)?.at].filter((t) => Number.isFinite(Date.parse(t)));
  return times.length ? times.sort().pop() : null;
}
export function doctor(queuePath, { dir = reviewDir(), now = Date.now(), staleMinutes = 120 } = {}) {
  let items;
  try { items = JSON.parse(readFileSync(queuePath, 'utf8')).items; } catch (e) { return [{ id: '-', problem: e.code === 'ENOENT' ? 'queue file not found' : 'queue file unreadable' }]; }
  if (!Array.isArray(items)) return [{ id: '-', problem: 'queue file has no items list' }];
  return doctorQueue(items, { now, staleMs: staleMinutes * 60000, progressAt: (id) => heartbeatOf(id, dir) });
}
