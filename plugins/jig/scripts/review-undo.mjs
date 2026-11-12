// Undo for the last state change on the board. One entry per project in the personal store (undo.json):
// a snapshot of the item before and after the change. Undo restores the "before" snapshot, but only while the item
// is still exactly as the change left it and the entry is recent, so it never overwrites later work.
import { readProjectJson, writeProjectJson } from './jig-store.mjs';
import { appendThread, itemThreadId, readItems, writeItems } from './review-core.mjs';
import { mutateQueueItem } from './review-work.mjs';
import { readFileSync } from 'node:fs';

export const undoTtlMs = 10 * 60 * 1000;
const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

export function snapshotOf(kind, id, { queue, dir }) {
  if (kind === 'work') {
    try { return clone((JSON.parse(readFileSync(queue, 'utf8')).items ?? []).find((i) => i && String(i.id) === String(id))); } catch { return null; }
  }
  return clone(readItems(dir).items.find((x) => x.id === Number(id)));
}

// Run `fn` (the state change) and remember how to take it back. A change that fails or changes nothing leaves no entry.
export function withUndo({ kind, id, label, queue, dir, project, home, now = new Date() }, fn) {
  const before = snapshotOf(kind, id, { queue, dir });
  const result = fn();
  const after = snapshotOf(kind, id, { queue, dir });
  if (project && before && after && JSON.stringify(before) !== JSON.stringify(after)) {
    try { writeProjectJson(project, 'undo.json', { kind, id: String(id), label, before, after, at: now.toISOString() }, { home }); } catch { /* no store: no undo */ }
  }
  return result;
}

export function readUndo(project, { home, now = new Date(), ttlMs = undoTtlMs } = {}) {
  const e = readProjectJson(project, 'undo.json', null, { home });
  if (!e || !e.before || !e.after || !e.kind || !Number.isFinite(Date.parse(e.at))) return null;
  if (now.getTime() - Date.parse(e.at) > ttlMs) return null;
  return { kind: e.kind, id: e.id, label: e.label, at: e.at };
}

export function undoLast({ queue, dir, project, home, now = new Date(), ttlMs = undoTtlMs }) {
  const e = readProjectJson(project, 'undo.json', null, { home });
  if (!e || !e.before || !e.after) throw new Error('Nothing to undo.');
  if (now.getTime() - Date.parse(e.at) > ttlMs) throw new Error(`The last change (${e.label}) is older than ${Math.round(ttlMs / 60000)} minutes; undo it by hand.`);
  const current = snapshotOf(e.kind, e.id, { queue, dir });
  if (JSON.stringify(current) !== JSON.stringify(e.after)) throw new Error(`${e.label} changed again since; undo it by hand.`);
  if (e.kind === 'work') {
    mutateQueueItem(queue, e.id, (x) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, clone(e.before)); });
  } else {
    const data = readItems(dir);
    const at = data.items.findIndex((x) => x.id === Number(e.id));
    if (at < 0) throw new Error(`Review item ${e.id} is gone.`);
    data.items[at] = clone(e.before);
    writeItems(data, dir);
  }
  const thread = e.kind === 'work' ? String(e.id) : itemThreadId(e.id);
  try { appendThread(thread, 'system', `Undone: ${e.label}`, dir, now); } catch { /* a missing line never blocks the undo */ }
  writeProjectJson(project, 'undo.json', {}, { home });
  return { label: e.label, kind: e.kind, id: e.id };
}
