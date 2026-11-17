import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Resume after the coordinating session died or the machine restarted: what was interrupted, what the person said meanwhile,
// where the handoff note points. Everything here reads board state; nothing changes it (the suggested commands are only printed).
import { spawnSync } from 'node:child_process';
import { projectFile, readText } from './jig-store.mjs';
import { readThread, reviewDir, threadIds } from './tower-core.mjs';
import { heartbeatOf } from './tower-work.mjs';
import { towerCommand } from './orchestrate-sessions.mjs';

export const defaultStaleMinutes = 20;
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const ageText = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m` : `${Math.max(0, Math.floor(ms / 60000))}m`);

// Branch, changed files and last commit of a worktree, or {error} when it cannot be read.
export function gitInfo(worktree) {
  if (!worktree) return { error: 'no worktree recorded' };
  const run = (...args) => spawnSync('git', ['-C', String(worktree), ...args], { encoding: 'utf8' });
  const branch = run('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch.status !== 0) return { error: 'worktree not found or not a git checkout' };
  const status = run('status', '--short').stdout.split('\n').filter(Boolean);
  const last = run('log', '-1', '--format=%h %s').stdout.trim();
  return { branch: branch.stdout.trim(), changed: status, lastCommit: last };
}

// Running items whose last sign of life (progress or thread message) is older than the limit, or that never showed one.
export function findInterrupted(items, { dir = reviewDir(), now = Date.now(), staleMinutes = defaultStaleMinutes, stalledHours, git = gitInfo } = {}) {
  const out = [];
  for (const x of items ?? []) {
    if (!x || typeof x !== 'object' || x.superseded || !['running', 'starting'].includes(x.state)) continue;
    const id = String(x.id); const hb = heartbeatOf(id, dir, x);
    // Legacy items without an entry timestamp remain unknown; never invent a start.
    const started = [x.runningAt, x.assignee?.startedAt].filter(t => Number.isFinite(Date.parse(t))).sort().pop();
    const basis = [hb, started].filter(Boolean).sort().pop();
    const age = basis ? now - Date.parse(basis) : null;
    const limit = stalledHours === undefined ? staleMinutes * 60000 : stalledHours * 3600000;
    if (basis && (stalledHours === undefined ? age <= limit : age < limit)) continue;
    out.push({
      id, item: clip(x.item, 100), worktree: x.worktree ?? null, heartbeat: hb,
      why: basis ? `no sign of life for ${stalledHours === undefined ? ageText(age) : age >= 3600000 ? `${Math.floor(age / 3600000)} hour${Math.floor(age / 3600000) === 1 ? '' : 's'}` : `${Math.max(0, Math.floor(age / 60000))} minutes`}` : 'no progress or message ever recorded, so the worker cannot be confirmed; time unknown',
      git: git(x.worktree), suggest: towerCommand(['queue-set', id, '--state', 'waiting-other', '--waits', 'interrupted: resume or relaunch'])
    });
  }
  return out;
}

// Threads whose newest person messages have no coordinator reply after them, oldest first.
export function unansweredMessages(dir = reviewDir()) {
  const out = [];
  for (const id of threadIds(dir)) {
    const talk = readThread(id, dir).filter((m) => m.from === 'person' || m.from === 'coordinator');
    let i = talk.length; while (i > 0 && talk[i - 1].from === 'person') i--;
    const waiting = talk.slice(i);
    if (waiting.length) out.push({ id, since: waiting[0].at, count: waiting.length, last: waiting.at(-1).text, messages: waiting.map((m) => ({ at: m.at, text: m.text })) });
  }
  return out.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

export function handoffNote(project, { home } = {}) {
  const path = projectFile(project, 'orchestrator-handoff.md', { home });
  if (!path) return { path: null, text: null };
  return { path, text: readText(path, null) };
}

// Printable report. `summary` is the one-line board summary computed by the caller.
export function resumeLines({ handoff, interrupted, unanswered, summary, staleMinutes = defaultStaleMinutes }) {
  const L = [];
  if (handoff.text === null) L.push(`Handoff: none at ${handoff.path ?? '(no store)'}. The coordinator writes it after each batch: what runs where, and the next steps.`);
  else { L.push(`Handoff: ${handoff.path}`); for (const l of handoff.text.split('\n').slice(0, 30)) L.push(`  ${l}`); }
  L.push(interrupted.length ? `Interrupted work (${interrupted.length}; running with no sign of life for ${staleMinutes}+ min):` : `Interrupted work: none (every running item showed life within ${staleMinutes} min).`);
  for (const x of interrupted) {
    const g = x.git;
    L.push(`  ${x.id} | ${x.item} | ${x.why}`);
    L.push(`    worktree ${x.worktree ?? '-'} | ${g.error ? g.error : `branch ${g.branch} | ${g.changed.length} changed file(s) | last commit ${g.lastCommit || 'none'}`}`);
    if (g.changed?.length) for (const c of g.changed.slice(0, 5)) L.push(`      ${c}`);
    L.push(`    suggest (not applied): ${x.suggest}`);
  }
  L.push(unanswered.length ? `Person messages not yet answered (${unanswered.length} thread(s)); answer these first:` : 'Person messages not yet answered: none.');
  for (const u of unanswered) L.push(`  ${u.id} | ${u.count} message(s) since ${u.since} | ${clip(u.last, 120)}`);
  L.push(summary);
  return L;
}
