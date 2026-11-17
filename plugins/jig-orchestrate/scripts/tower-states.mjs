import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// One explicit state machine for everything on the board, review items and work items alike.
// Every mutation names the move (from, to, who, reason) and is checked here before anything is written.
// Pure: no file access. tower-core.mjs applies the result and writes the thread line.

export const boardStates = ['new', 'running', 'waiting-person', 'waiting-other', 'blocked', 'parked', 'done', 'superseded'];
export const actors = ['person', 'coordinator', 'system'];
const all = actors;
const pc = ['person', 'coordinator'];
const cs = ['coordinator', 'system'];

// from -> to -> who may make the move. "reason" lists moves that need a recorded reason.
// done only goes back by Reopen (waiting-person or running); superseded is terminal; blocked is derived from
// dependencies, so nothing moves INTO it by hand, and a blocked item can only be closed, parked or superseded.
const live = ['new', 'running', 'waiting-person', 'waiting-other'];
const table = {};
const allow = (from, to, by) => { (table[from] ??= {})[to] = by; };
for (const f of live) {
  for (const t of live) if (f !== t) allow(f, t, cs.concat(f === 'new' && t === 'running' ? [] : []).concat(t === 'waiting-person' || t === 'waiting-other' ? [] : []));
  allow(f, 'parked', pc); allow(f, 'done', all); allow(f, 'superseded', cs);
}
allow('running', 'waiting-other', cs.concat('person')); // the person's Resume request on a stalled job
allow('new', 'waiting-person', ['coordinator']); allow('new', 'waiting-other', ['coordinator']);
allow('blocked', 'parked', pc); allow('blocked', 'done', all); allow('blocked', 'superseded', cs);
for (const t of ['new', 'running', 'waiting-person', 'waiting-other']) allow('parked', t, pc);
allow('parked', 'done', all); allow('parked', 'superseded', cs);
allow('done', 'waiting-person', all); allow('done', 'running', cs.concat('person'));
// superseded: no outgoing moves.
const needReason = new Set(['parked']);

export const transitions = () => Object.entries(table).flatMap(([from, tos]) => Object.entries(tos).map(([to, by]) => ({ from, to, by })));

export function checkTransition(from, to, by, { reason = '' } = {}) {
  if (!boardStates.includes(from)) return { ok: false, error: `Unknown state ${JSON.stringify(from)}.` };
  if (!boardStates.includes(to)) return { ok: false, error: `Unknown state ${JSON.stringify(to)}. Use one of: ${boardStates.join(', ')}.` };
  if (!actors.includes(by)) return { ok: false, error: `Unknown actor ${JSON.stringify(by)}.` };
  if (from === 'superseded') return { ok: false, error: 'A superseded item is final: nothing can move it. Add a new item instead.' };
  if (from === to) return { ok: false, error: `Already ${to}.` };
  const allowed = table[from]?.[to];
  if (!allowed) {
    if (to === 'blocked') return { ok: false, error: 'Blocked comes from dependencies; it cannot be set by hand.' };
    if (from === 'done') return { ok: false, error: `A done item cannot become ${to}; reopen it (it returns as waiting-person or running).` };
    return { ok: false, error: `Illegal move ${from} -> ${to}.` };
  }
  if (!allowed.includes(by)) return { ok: false, error: `${by} may not move ${from} -> ${to} (allowed: ${allowed.join(', ')}).` };
  if (needReason.has(to) && !String(reason ?? '').trim()) return { ok: false, error: `Moving ${from} -> ${to} needs a reason.` };
  return { ok: true };
}
export function assertTransition(from, to, by, options) {
  const r = checkTransition(from, to, by, options);
  if (!r.ok) throw new Error(r.error);
}

// ---------- reading the current state ----------
const waitParts = (x) => (Array.isArray(x.waitsFor) ? x.waitsFor.map(String) : typeof x.waitsFor === 'string' ? [x.waitsFor] : []);
const waitText = (x) => (Array.isArray(x.waitsFor) ? x.waitsFor.map(String).join('; ') : typeof x.waitsFor === 'string' ? x.waitsFor : '');
import { queueStates } from './queue-schema.mjs';
export { queueStates } from './queue-schema.mjs';
// A queue item's board state. Unknown raw states return null so the doctor can name them.
export function workState(x) {
  if (x.superseded) return 'superseded';
  if (x.state === 'done') return 'done';
  if (x.state === 'parked' || /^\s*parked\b/i.test(waitText(x))) return 'parked';
  // A running job that explicitly waits for the person is waiting for the person: one state, not two.
  if (x.state === 'running' || x.state === 'starting') return /^person\b/i.test(waitText(x).trim()) ? 'waiting-person' : 'running';
  if (['pending', 'review', 'failed', 'stopped'].includes(x.state)) {
    const w = waitText(x).trim();
    if (!w) return 'new';
    return /^person\b/i.test(w) ? 'waiting-person' : 'waiting-other';
  }
  return null;
}
// A review item: open means it waits for the person; closed records say done or superseded.
export function reviewState(item, { blocked = false } = {}) {
  if (item.done) return item.closed?.kind === 'superseded' || (!item.closed && item.supersededBy) ? 'superseded' : 'done';
  return blocked ? 'blocked' : 'waiting-person';
}

// ---------- applying a move to a queue item (mutates x) ----------
export function applyWorkMove(x, to, { by, reason = '', waits = '' } = {}) {
  const from = workState(x);
  if (from === null) throw new Error(`Queue item ${x.id} has an unknown state ${JSON.stringify(x.state)}; fix it with queue-set.`);
  const r = checkTransition(from, to, by, { reason });
  if (!r.ok) throw new Error(`Queue item ${x.id}: ${r.error}`);
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const wait = String(waits ?? '').trim();
  const clear = () => { delete x.parkedReason; delete x.parkedFrom; delete x.parkedBoard; delete x.parkedWaits; delete x.doneBy; delete x.doneReason; delete x.closedFrom; delete x.revisit; delete x.revisitOn; };
  if (to === 'parked') {
    if (x.state !== 'parked') { x.parkedFrom = x.state; x.parkedBoard = from; if (typeof x.waitsFor === 'string' || Array.isArray(x.waitsFor)) x.parkedWaits = x.waitsFor; }
    x.state = 'parked'; x.parkedReason = text; delete x.waitsFor;
  } else if (to === 'done') {
    x.closedFrom = from === 'parked' ? (x.parkedFrom ?? 'pending') : x.state; x.state = 'done'; x.doneBy = by; x.doneReason = text || `closed by ${by}`; delete x.waitsFor;
  } else if (to === 'superseded') {
    x.superseded = true; x.supersededReason = text || `superseded by ${by}`;
  } else if (to === 'running') {
    clear(); x.state = 'running'; delete x.waitsFor;
  } else if (to === 'new') {
    clear(); x.state = 'pending'; delete x.waitsFor;
  } else if (to === 'waiting-person' || to === 'waiting-other') {
    const w = wait || (from === 'done' ? 'person: reopened, take another look' : '');
    if (!w) throw new Error(`Queue item ${x.id}: ${to} needs --waits "<what it waits for>".`);
    if (to === 'waiting-person' && !/^person\b/i.test(w)) { x.waitsFor = `person: ${w}`; }
    else if (to === 'waiting-other' && /^(person|parked)\b/i.test(w)) throw new Error(`Queue item ${x.id}: waiting-other text must not start with "person" or "parked".`);
    else x.waitsFor = w;
    clear(); x.state = 'pending';
  }
  return { from, to, by, reason: text };
}
// Edit the wait text of an item without moving it. The edit must leave the board state unchanged.
// waits === '' clears the wait. Throws when the new wait would change the state (use a move instead).
export function applyWorkEdit(x, { waits } = {}) {
  const from = workState(x);
  if (from === null) throw new Error(`Queue item ${x.id} has an unknown state ${JSON.stringify(x.state)}; fix it with queue-set.`);
  if (from === 'superseded') throw new Error(`Queue item ${x.id} is superseded and final.`);
  if (waits === undefined) return false;
  const w = String(waits).trim();
  const before = x.waitsFor;
  if (!w) delete x.waitsFor;
  else if (from === 'waiting-person' && !/^person\b/i.test(w)) x.waitsFor = `person: ${w}`;
  else x.waitsFor = w;
  const after = workState(x);
  if (after !== from) {
    if (before === undefined) delete x.waitsFor; else x.waitsFor = before;
    throw new Error(`Queue item ${x.id}: that wait would change it from ${from} to ${after}; use --state ${after} to move it.`);
  }
  return true;
}
export const moveLine = ({ from, to, by, reason }) => `${from} -> ${to} by ${by}${reason ? `: ${reason}` : ''}`;

// ---------- doctor ----------
// Findings for a queue: impossible or stale combinations the coordinator should repair with queue-set.
const ageText = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)}h` : `${Math.floor(ms / 60000)}m`);
export function doctorQueue(items, { progressAt = () => null, now = Date.now(), staleMs = 2 * 3600000 } = {}) {
  const out = []; const seen = new Set();
  for (const x of items) {
    if (!x || typeof x !== 'object') { out.push({ id: '?', problem: 'queue entry is not an object' }); continue; }
    const id = String(x.id ?? '?');
    if (seen.has(id)) out.push({ id, problem: 'duplicate id' }); seen.add(id);
    if (!queueStates.includes(x.state)) { out.push({ id, problem: `unknown state ${JSON.stringify(x.state)}` }); continue; }
    if (workState(x) === 'waiting-person' && !['answer', 'try', 'approve', 'read'].includes(x.action)) out.push({ id, problem: 'wait on the person has no valid action; shows Open (set --action answer|try|approve|read)' });
    const w = waitText(x).trim();
    if (x.state === 'done' && w) out.push({ id, problem: 'done but still has waitsFor' });
    if (x.superseded && (x.state === 'running' || x.state === 'starting')) out.push({ id, problem: 'superseded but running' });
    if (x.state === 'running') {
      const at = progressAt(id);
      if (at && now - Date.parse(at) > staleMs) out.push({ id, problem: `running but its last progress is ${ageText(now - Date.parse(at))} old` });
    }
    // Hint only: the text names a review item the work is not linked to, so there may be two conversations.
    if (!x.superseded && x.state !== 'done') {
      const linked = String(x.thread ?? '').match(/^item-(\d+)$/)?.[1];
      const named = [...new Set([...`${x.item ?? ''} ${w}`.matchAll(/\bitem[- ](\d+)\b/gi)].map((m) => m[1]))].filter((n) => n !== linked);
      if (named.length) out.push({ id, problem: `hint: names review item ${named.join(', ')} but is not linked to it (queue-set ${id} --state <its state> --thread item-${named[0]})` });
    }
    // Only an open request to the person is a problem; "resume when the person asks" in a reason is a trigger, not a request.
    if (workState(x) === 'parked' && waitParts(x).some((p) => /^person\b/i.test(p.trim()))) out.push({ id, problem: 'parked, but it still waits on the person (is it really parked?)' });
  }
  return out;
}
