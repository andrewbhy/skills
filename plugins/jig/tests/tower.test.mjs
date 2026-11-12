import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { appendThread, writeProgress } from '../scripts/review-core.mjs';
import { doctor } from '../scripts/review-work.mjs';
import { findInterrupted, handoffNote, resumeLines, unansweredMessages } from '../scripts/tower-resume.mjs';
import { resume } from '../scripts/tower.mjs';

const script = (name) => resolve(import.meta.dirname, '..', 'scripts', name);
function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-tower-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const dir = join(tmp, 'state'); const home = join(tmp, 'home'); const root = join(tmp, 'root');
  mkdirSync(dir); mkdirSync(home); mkdirSync(root);
  const queue = join(dir, 'queue.json');
  const items = [
    { id: 'fresh', item: 'Recent heartbeat', state: 'running', worktree: join(tmp, 'wt-fresh') },
    { id: 'old', item: 'Silent for an hour', state: 'running', worktree: join(tmp, 'wt-old') },
    { id: 'never', item: 'Never reported', state: 'running' },
    { id: 'idle', item: 'Not running', state: 'pending' }
  ];
  writeFileSync(queue, JSON.stringify({ version: 1, items }));
  writeFileSync(join(dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: root }], queue }));
  return { tmp, dir, home, root, queue, items };
}

test('interrupted work: running items with no sign of life are listed with a suggestion that is never applied', (t) => {
  const f = fixture(t);
  const now = Date.parse('2026-11-11T12:00:00Z');
  writeProgress('fresh', 'working', f.dir, new Date('2026-11-11T11:55:00Z'));
  writeProgress('old', 'was working', f.dir, new Date('2026-11-11T11:00:00Z'));
  const found = findInterrupted(f.items, { dir: f.dir, now, staleMinutes: 20, git: () => ({ branch: 'feat/x', changed: [' M a.txt'], lastCommit: 'abc123 last' }) });
  assert.deepEqual(found.map((x) => x.id), ['old', 'never']);
  assert.match(found[0].why, /no sign of life for 1h 0m/); assert.match(found[1].why, /cannot be confirmed/);
  assert.equal(found[0].suggest, 'node scripts/review.mjs queue-set old --state waiting-other --waits "interrupted: resume or relaunch"');
  assert.equal(findInterrupted(f.items, { dir: f.dir, now, staleMinutes: 90, git: () => ({}) }).map((x) => x.id).join(), 'never', 'the limit is configurable');
  // a thread message counts as a sign of life
  appendThread('old', 'agent', 'still here', f.dir, new Date('2026-11-11T11:50:00Z'));
  assert.deepEqual(findInterrupted(f.items, { dir: f.dir, now, git: () => ({}) }).map((x) => x.id), ['never']);
  const lines = resumeLines({ handoff: { path: 'h.md', text: 'running: x\nnext: y' }, interrupted: findInterrupted(f.items, { dir: f.dir, now, git: () => ({ branch: 'b', changed: [' M f'], lastCommit: 'c1 msg' }) }), unanswered: [], summary: 'Board: ok' });
  assert.ok(lines.some((l) => /branch b \| 1 changed file\(s\) \| last commit c1 msg/.test(l)));
  assert.ok(lines.some((l) => /suggest \(not applied\)/.test(l)));
});

test('doctor flags a stale running item by the same heartbeat, with a configurable limit', (t) => {
  const f = fixture(t);
  writeProgress('old', 'was working', f.dir, new Date('2026-11-11T11:00:00Z'));
  const now = Date.parse('2026-11-11T12:00:00Z');
  assert.equal(doctor(f.queue, { dir: f.dir, now }).length, 0, 'default limit is two hours');
  const found = doctor(f.queue, { dir: f.dir, now, staleMinutes: 20 });
  assert.match(found.find((x) => x.id === 'old').problem, /last progress is 1h old/);
});

test('person messages newer than the last coordinator reply are listed, oldest first', (t) => {
  const f = fixture(t);
  appendThread('a', 'person', 'first question', f.dir, new Date('2026-11-11T09:00:00Z'));
  appendThread('a', 'coordinator', 'answered', f.dir, new Date('2026-11-11T09:05:00Z'));
  appendThread('a', 'person', 'follow up 1', f.dir, new Date('2026-11-11T10:00:00Z'));
  appendThread('a', 'person', 'follow up 2', f.dir, new Date('2026-11-11T10:01:00Z'));
  appendThread('b', 'person', 'older one', f.dir, new Date('2026-11-11T08:00:00Z'));
  appendThread('c', 'person', 'q', f.dir, new Date('2026-11-11T07:00:00Z'));
  appendThread('c', 'coordinator', 'a', f.dir, new Date('2026-11-11T07:01:00Z'));
  const u = unansweredMessages(f.dir);
  assert.deepEqual(u.map((x) => [x.id, x.count]), [['b', 1], ['a', 2]]);
  assert.equal(u[1].messages[0].text, 'follow up 1'); assert.equal(u[1].last, 'follow up 2');
});

test('handoff note is read from the store; tower resume prints all parts; tower.mjs passes commands to review.mjs', (t) => {
  const f = fixture(t);
  assert.equal(handoffNote('jig', { home: f.home }).text, null);
  mkdirSync(join(f.home, 'jig'));
  writeFileSync(join(f.home, 'jig', 'orchestrator-handoff.md'), '# Handoff\nrunning: job a in wt-a\nnext: merge\n');
  assert.match(handoffNote('jig', { home: f.home }).text, /running: job a/);
  appendThread('x', 'person', 'did you see this?', f.dir);
  const out = [];
  resume({ project: 'jig', home: f.home, dir: f.dir, config: { roots: [], queue: f.queue }, out: (l) => out.push(l) });
  const text = out.join('\n');
  assert.match(text, /Handoff: .*orchestrator-handoff\.md/); assert.match(text, /Interrupted work \(\d+;/); assert.match(text, /x \| 1 message\(s\) since .*did you see this/);
  assert.match(text, /Board: for you 0 \(0 to read, 0 your move\), running 3, board issues/);
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home };
  const a = spawnSync(process.execPath, [script('tower.mjs'), 'list', '--all'], { env, encoding: 'utf8' });
  const b = spawnSync(process.execPath, [script('review.mjs'), 'list', '--all'], { env, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr); assert.equal(a.stdout, b.stdout);
  const s = spawnSync(process.execPath, [script('tower.mjs'), 'summary'], { env, encoding: 'utf8' });
  assert.match(s.stdout, /^Board: for you/);
});
