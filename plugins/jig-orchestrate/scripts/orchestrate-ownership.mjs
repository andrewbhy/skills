import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Separate from review-items.json: existing item snapshot writers are unchanged.
import { randomUUID } from 'node:crypto';
import { atomicWriteFile } from './jig-store.mjs';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { capabilitySession, coordinationSnapshot, identity, mintSessionCapability, revokeSessionCapability, sessionsDir } from './capabilities.mjs';
import { hasPrivateSegment, knownThreadIds, linkedThreadOf, loadConfig, reviewDir, rootsFile, threadFile, threadsDir } from './tower-core.mjs';
import { withFileLock } from './orchestrate-lock.mjs';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9][\w.-]{0,120}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const generation = n => Number.isSafeInteger(n) && n >= 0;
const object = x => x && typeof x === 'object' && !Array.isArray(x);
export const ownershipFile = (dir = reviewDir()) => join(dirname(sessionsDir(dir)), 'ownership.json');
export const OWNER_HEARTBEAT_STALE_MS = 15 * 60 * 1000;
// Codex may be hosted by a shared app-server ancestor. Its PID establishes
// capability ancestry, but cannot establish the lifetime of a topic session.
export function ownerLiveness(owner, session, { now = Date.now(), staleMs = OWNER_HEARTBEAT_STALE_MS, holderPid = session?.pid } = {}) {
  if (owner.provider === 'codex') {
    // A new claim has one grace window in which to arm its first owner watch.
    const beat = Number.isFinite(session?.heartbeat) ? session.heartbeat : Date.parse(owner.claimedAt);
    const ageMs = Math.max(0, now - beat);
    const staleInMs = Math.max(0, staleMs - ageMs);
    return { basis: 'heartbeat', live: staleInMs > 0, ageMs, staleInMs };
  }
  let live = Number.isSafeInteger(holderPid) && holderPid > 0;
  if (live) { try { process.kill(holderPid, 0); } catch (e) { if (e.code === 'ESRCH') live = false; } }
  return { basis: 'process', live };
}
function load(dir) {
  const file = ownershipFile(dir);
  if (!existsSync(file)) return { schema: 1, threads: {} };
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error('Corrupt ownership store.'); }
  if (data?.schema !== 1 || !object(data.threads)) throw new Error('Corrupt or future ownership schema.');
  for (const [id, row] of Object.entries(data.threads)) {
    if (!validId(id) || !object(row) || !generation(row.ownershipGeneration) || !Object.hasOwn(row, 'owner') ||
      row.owner !== null && (!object(row.owner) || typeof row.owner.sessionId !== 'string' || !row.owner.sessionId ||
        typeof row.owner.label !== 'string' || !row.owner.label.trim() || !['claude', 'codex'].includes(row.owner.provider) || !Number.isFinite(Date.parse(row.owner.claimedAt)))) throw new Error('Corrupt ownership record.');
  }
  return data;
}
const rowOf = (data, id) => Object.hasOwn(data.threads, id) ? data.threads[id] : { ownershipGeneration: 0, owner: null };
function queuePath(dir) {
  const queue = existsSync(rootsFile(dir)) ? loadConfig(dir).queue : join(dir, 'queue.json');
  if (hasPrivateSegment(queue)) throw new Error('Queue path is private.');
  return queue;
}
export function canonicalThread(id, dir = reviewDir()) {
  const queue = queuePath(dir);
  if (!queue || !existsSync(queue)) return id;
  const data = JSON.parse(readFileSync(queue, 'utf8'));
  return linkedThreadOf(data.items?.find(x => x.id === id)) ?? id;
}
export function readOwnership(id, dir = reviewDir(), { canonical = true } = {}) {
  if (!validId(id)) throw new Error('Invalid thread id.');
  return structuredClone(rowOf(load(dir), canonical ? canonicalThread(id, dir) : id));
}
export function withOwnership(id, dir, fn) {
  if (!validId(id)) throw new Error('Invalid thread id.');
  const file = ownershipFile(dir);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  return withFileLock(file + '.lock', () => {
    const canonical = canonicalThread(id, dir), row = rowOf(load(dir), canonical);
    if (canonical !== id && row.owner) throw new Error(`Use canonical thread ${canonical}.`);
    return fn(row);
  }, { retryMs: 2000 });
}
function update(id, expectedGeneration, dir, change) {
  if (!validId(id) || !generation(expectedGeneration)) throw new Error('A thread and expected generation are required.');
  if (!knownThreadIds(queuePath(dir), dir).has(id)) throw new Error('Ownership command needs a known canonical thread.');
  const canonical = canonicalThread(id, dir);
  if (canonical !== id) throw new Error(`Use canonical thread ${canonical}.`);
  const file = ownershipFile(dir);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  return withFileLock(file + '.lock', () => {
    const data = load(dir), row = rowOf(data, id);
    if (row.ownershipGeneration !== expectedGeneration) throw new Error('Ownership generation conflict; refresh before retrying.');
    if (expectedGeneration === Number.MAX_SAFE_INTEGER) throw new Error('Ownership generation exhausted.');
    const next = { ...change(row), ownershipGeneration: expectedGeneration + 1 };
    data.threads[id] = next;
    atomicWriteFile(file, JSON.stringify(data) + '\n', { mode: 0o600 });
    // The ownership lock is already held; do not re-enter appendThread's lock
    // or its agent-generation fence for these system notices.
    const text = next.owner
      ? `${next.owner.label} (${next.owner.provider === 'claude' ? 'Claude' : 'Codex'}) took this thread`
      : next.handback.actor === 'person'
        ? `You took this thread back${next.handback.note ? ': ' + next.handback.note : ''}`
        : `${row.owner.label} gave this thread back: ${next.handback.done}`;
    mkdirSync(threadsDir(dir), { recursive: true });
    appendFileSync(threadFile(id, dir), JSON.stringify({ from: 'system', text, at: new Date().toISOString() }) + '\n');
    return structuredClone(next);
  }, { retryMs: 2000 });
}
export function claimThread(id, { expectedGeneration, sessionId, label, provider = 'claude', holderPid, takeOverStale = false, register = () => {}, rollback = () => {} }, dir = reviewDir()) {
  const manual = holderPid !== undefined;
  const caller = identity({ dir });
  if (manual) {
    if (process.env.JIG_CAPABILITY_FILE || caller.kind !== 'unidentified') throw new Error('Claim requires a person-started session without inherited credentials.');
  } else if (!caller.id || caller.kind !== 'coordinator' && caller.id !== sessionId || caller.kind.startsWith('child-of-')) throw new Error('Only coordinator or the named topic session can claim.');
  if (typeof label !== 'string' || !label.trim() || label.length > 120 || !['claude', 'codex'].includes(provider)) throw new Error('Claim needs a label (1–120 characters) and claude or codex provider.');
  let capability;
  try { return update(id, expectedGeneration, dir, row => {
    let previousOwner;
    if (manual && row.owner) {
      let old = coordinationSnapshot().capabilities[row.owner.sessionId];
      let session;
      // The optional launcher revokes its credential on exit; the existing
      // session record still identifies that stopped holder for explicit recovery.
      if (/^[a-f0-9-]{36}$/.test(row.owner.sessionId)) {
        const file = join(sessionsDir(dir), row.owner.sessionId + '.session.json');
        if (existsSync(file)) {
          session = JSON.parse(readFileSync(file, 'utf8'));
          if (session.schema !== 1 || session.id !== row.owner.sessionId || session.item !== id) throw new Error('Previous session record unavailable; inspect and Return explicitly.');
          old ??= { holderPid: session.pid };
        }
      }
      if (row.owner.provider !== 'codex' && (!old || !Number.isSafeInteger(old.holderPid) || old.holderPid < 1)) throw new Error('Previous holder PID unavailable; inspect and Return explicitly.');
      const liveness = ownerLiveness(row.owner, session, { holderPid: old?.holderPid });
      if (liveness.live) throw new Error(liveness.basis === 'heartbeat'
        ? `Thread already owned; Codex owner heartbeat is fresh (stale in ${Math.ceil(liveness.staleInMs / 1000)} seconds). Return before claiming.`
        : 'Thread already owned by a live holder; Return before claiming.');
      if (!takeOverStale) throw new Error(liveness.basis === 'heartbeat' ? 'Codex owner heartbeat is stale; inspect and use --take-over-stale to claim.' : 'Holder stopped; inspect and use --take-over-stale to claim.');
      previousOwner = row.owner;
    }
    if (manual) {
      capability = mintSessionCapability({ holderPid, personStarted: true });
      sessionId = JSON.parse(readFileSync(capability, 'utf8')).id;
    }
    const target = capabilitySession(sessionId, dir);
    if (target.kind !== 'topic') throw new Error('Owner must be a topic session.');
    if (!manual && row.owner && row.owner.sessionId !== sessionId) throw new Error('Thread already owned; Return before assigning another session.');
    if (manual) register({ sessionId, capability, generation: expectedGeneration + 1 });
    // The line boundary disambiguates messages recorded in the same millisecond
    // as the claim. The ownership lock also covers person-message appends.
    const file = threadFile(id, dir);
    const claimedLines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').length - 1 : 0;
    return { owner: { sessionId, label: label.trim(), provider, claimedAt: new Date().toISOString(), claimedLines }, ...(previousOwner ? { previousOwner } : {}) };
  }); } catch (error) {
    if (capability) { try { rollback(); } finally { revokeSessionCapability(capability); } }
    throw error;
  }
}
export function returnThread(id, { expectedGeneration, done, open, decisions, branches, note, asPerson = false }, dir = reviewDir()) {
  const caller = identity({ dir });
  if (asPerson && (process.env.JIG_CAPABILITY_FILE || caller.kind !== 'unidentified')) throw new Error('--as-person is only for a person without an agent capability.');
  if (asPerson && note !== undefined && typeof note !== 'string') throw new Error('Return note must be text.');
  if (!asPerson && [done, open, decisions, branches].some(x => typeof x !== 'string' || !x.trim())) throw new Error('Return needs --done, --open, --decisions and --branches (use none explicitly).');
  return update(id, expectedGeneration, dir, row => {
    if (!row.owner) throw new Error('Thread is not owned.');
    if (!asPerson && (!caller.id || caller.kind !== 'coordinator' && (caller.id !== row.owner.sessionId || caller.kind !== 'topic'))) throw new Error('Only the owner or coordinator can Return.');
    return { owner: null, handback: { ...(asPerson ? { note: (note ?? '').trim() } : { done, open, decisions, branches }), actor: asPerson ? 'person' : caller.kind, sessionId: row.owner.sessionId, at: new Date().toISOString() } };
  });
}
export function assertThreadWriter(row, from, options, dir) {
  if (options.generation !== undefined && (!generation(options.generation) || options.generation !== row.ownershipGeneration)) throw new Error('Ownership generation conflict; refresh before replying.');
  // The person's existing HTTP/answer lane remains available while agents are fenced.
  if (from === 'person') return null;
  const caller = identity({ dir });
  if (row.owner && (!caller.id || caller.id !== row.owner.sessionId || caller.kind !== 'topic' || options.generation !== row.ownershipGeneration)) throw new Error('Owned thread: only the bound owner with the current generation may append; coordinator must wait for Return.');
  return caller;
}
export function watchRoute(row, { item, owner, generation: expected, caller }, id) {
  if (item && item !== id || owner && row.owner?.sessionId !== owner) return false;
  if (owner) return caller?.id === owner && caller.kind === 'topic' && expected === row.ownershipGeneration;
  return !row.owner;
}
