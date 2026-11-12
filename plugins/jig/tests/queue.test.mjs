import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { addItem, readQueue, withQueueLock, queuePath, readyItems, statusLines, launchJob as attachJob, reserveJob, finishJob, markReview, validateQueue } from '../scripts/queue.mjs';
const cli = resolve('scripts/queue.mjs');
function launchJob(root, id, options) {
  if (!options?.taskId) return attachJob(root, id, options);
  const reservation = reserveJob(root, id, options);
  return attachJob(root, id, { taskId: options.taskId, reservationId: reservation.reservationId });
}
const now = Date.parse('2026-01-01T00:20:00Z');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-queue-'));
  mkdirSync(join(root, '.jig')); writeFileSync(join(root, '.jig/config.json'), JSON.stringify({ orchestration: { concurrency: 8, providers: ['fixture'] }, browser: { minFreeGB: 0.000001, lockDir: join(root, 'locks') } }));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const item = (id = 'a', overrides = {}) => ({ id, item: 'Build a unit', plan: 'plan.md', worktree: join(root, id), provider: 'fixture', area: 'logic', touches: ['src/unit.mjs'], ...overrides });
  const progress = (overrides = {}) => ({ version: 1, startedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:01:00Z', timeboxMinutes: 15, steps: [{ label: 'build', done: false }, { label: 'check', done: false }], ...overrides });
  const put = (p = progress(), name = 'progress.json') => { writeFileSync(join(root, name), JSON.stringify(p)); return name; };
  const run = (...args) => spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' });
  return { root, item, progress, put, run };
}
test('[risk: lost handover state] add and ready survive a fresh CLI process; dependencies wait', t => {
  const f = fixture(t); addItem(f.root, f.item()); addItem(f.root, f.item('b', { dependsOn: ['a'] }));
  assert.equal(f.run('ready').stdout.trim(), 'a'); assert.equal(readQueue(f.root).items[1].dependsOn[0], 'a');
  assert.throws(() => addItem(f.root, f.item('c', { dependsOn: ['missing'] })), /dependency/);
  assert.equal(readQueue(f.root).items.length, 2);
  assert.throws(() => validateQueue({ version: 1, items: [f.item('a', { state: 'pending', dependsOn: ['b'] }), f.item('b', { state: 'pending', dependsOn: ['a'] })] }), /cycle/);
});
test('[risk: stale or unfinished work hidden] fake-clock status shows X/N, timebox, stale, decision choices', t => {
  const f = fixture(t); addItem(f.root, f.item('a', { progressFile: f.put() }));
  const line = statusLines(f.root, { now })[0];
  assert.match(line, /0\/2.*20.0\/15m.*STALE: wait, stop or re-plan.*OVER-TIMEBOX/);
  assert.match(f.run('status').stdout, /a \[----------\]/);
});
test('[risk: detached or unbounded launch] tracked launch refuses missing progress and timebox', t => {
  const f = fixture(t); addItem(f.root, f.item());
  assert.throws(() => launchJob(f.root, 'a'), /Tracked/);
  assert.throws(() => launchJob(f.root, 'a', { taskId: 'task', progressFile: 'absent' }), /ENOENT/);
  f.put(f.progress({ timeboxMinutes: undefined }));
  assert.throws(() => launchJob(f.root, 'a', { taskId: 'task', progressFile: 'progress.json' }), /Invalid progress/);
  f.put(); launchJob(f.root, 'a', { taskId: 'task', progressFile: 'progress.json' });
  assert.equal(readQueue(f.root).items[0].state, 'running');
});
test('[risk: incomplete or budget stopped called done] result must pass, complete and finish every step', t => {
  const f = fixture(t); addItem(f.root, f.item()); f.put(); launchJob(f.root, 'a', { taskId: 'task', progressFile: 'progress.json' });
  assert.throws(() => finishJob(f.root, 'a'), /Result missing/);
  f.put(f.progress({ result: { outcome: 'passed', complete: false } }));
  assert.match(statusLines(f.root, { now })[0], /FAILED/);
  assert.equal(finishJob(f.root, 'a').state, 'failed');
  for (const outcome of ['incomplete', 'stopped', 'failed']) {
    const id = outcome; addItem(f.root, f.item(id)); f.put(f.progress(), id + '.json'); launchJob(f.root, id, { taskId: id, progressFile: id + '.json' });
    f.put(f.progress({ result: { outcome, complete: true } }), id + '.json'); assert.equal(finishJob(f.root, id).state, 'failed');
  }
});
test('[risk: unchecked work shown or self acceptance] complete work needs fresh revision-bound evidence and no open feedback', t => {
  const f = fixture(t); addItem(f.root, f.item()); f.put(); launchJob(f.root, 'a', { taskId: 'task', progressFile: 'progress.json' });
  f.put(f.progress({ steps: [{ label: 'check', done: true }], result: { outcome: 'passed', complete: true } })); finishJob(f.root, 'a');
  assert.throws(() => markReview(f.root, 'a', { revision: 'abc', builder: 'b', coordinator: 'c' }), /gate pending/);
  const evidence = Object.fromEntries(['gate', 'reviewer', 'presentation'].map(k => [k, { passed: true, by: k, revision: 'abc' }]));
  const input = { evidence, revision: 'abc', builder: 'builder', coordinator: 'coordinator' };
  assert.throws(() => markReview(f.root, 'a', { ...input, builder: 'reviewer' }), /fresh reviewer/);
  assert.throws(() => markReview(f.root, 'a', { ...input, feedback: [{ item: 'a', state: 'open' }] }), /open feedback/);
  assert.throws(() => markReview(f.root, 'a', { ...input, evidence: { ...evidence, gate: { ...evidence.gate, passed: 'incomplete' } } }), /gate pending/);
  assert.equal(markReview(f.root, 'a', input).state, 'review');
  addItem(f.root, f.item('child', { dependsOn: ['a'] })); assert.deepEqual(readyItems(readQueue(f.root)).map(i => i.id), ['child']);
});
test('[risk: two writers lose work] exclusive lock returns 2; competing CLI writers preserve both records after retry', async t => {
  const f = fixture(t);
  withQueueLock(queuePath(f.root), () => assert.equal(f.run('add', JSON.stringify(f.item())).status, 2));
  const write = id => new Promise((resolveDone, reject) => {
    const child = spawn(process.execPath, [cli, '--root', f.root, 'add', JSON.stringify(f.item(id))], { stdio: 'ignore' });
    child.on('error', reject); child.on('exit', code => resolveDone(code));
  });
  const codes = await Promise.all([write('a'), write('b')]);
  for (let i = 0; i < codes.length; i++) { if (codes[i] === 2) assert.equal(await write(i ? 'b' : 'a'), 0); else assert.equal(codes[i], 0); }
  assert.equal(readQueue(f.root).items.length, 2);
});
import { suggest, dispatchReady, updateQueue, recordFailure, checkApply, checkReply, reportDuty, overlap } from '../scripts/queue.mjs';
import { listSignals, setSignal } from '../scripts/signals.mjs';
import { acquireBrowserSlot } from '../scripts/resource-guard.mjs';
test('[risk: overlapping jobs or cap violated] suggest reserves every selected file/worktree and leaves independent jobs ready', async t => {
  const f = fixture(t); addItem(f.root, f.item());
  addItem(f.root, f.item('b', { worktree: join(f.root, 'a') }));
  addItem(f.root, f.item('c')); addItem(f.root, f.item('d', { worktree: join(f.root, 'a', 'child') }));
  const result = await suggest(f.root, { freeBytes: 8 * 2 ** 30, concurrency: 2 });
  assert.deepEqual(result.selected.map(i => i.id), ['a', 'c']);
  assert.match(result.waiting.find(i => i.id === 'b').reasons.join(), /worktree overlap/);
  assert.match(result.waiting.find(i => i.id === 'd').reasons.join(), /concurrency cap/);
  assert.equal(overlap(f.item('one', { touches: [join(f.root, 'shared', 'a.mjs')] }), f.item('two', { touches: [join(f.root, 'shared', '*.mjs')] })), 'file overlap');
  assert.equal(overlap(f.item('one', { touches: ['lib/../unit'] }), f.item('two', { touches: ['unit'] })), undefined);
});
test('[risk: critical work waits behind unrelated jobs] dependency path to the next decision launches first', async t => {
  const f = fixture(t); addItem(f.root, f.item('unrelated')); addItem(f.root, f.item('foundation')); addItem(f.root, f.item('decision', { dependsOn: ['foundation'], nextDecision: true }));
  const result = await suggest(f.root, { concurrency: 1, freeBytes: 8 * 2 ** 30 });
  assert.deepEqual(result.selected.map(i => i.id), ['foundation']);
  assert.match(result.waiting.find(i => i.id === 'decision').reasons.join(), /dependency foundation/);
});
test('[risk: RAM or browser slot exceeded] guard memory and live held slot block proposals; browser reservations serialize', async t => {
  const f = fixture(t); addItem(f.root, f.item('a', { browser: true })); addItem(f.root, f.item('b', { browser: true }));
  let result = await suggest(f.root, { freeBytes: 0 });
  assert.equal(result.selected.length, 0); assert.equal(result.resourceBlocked, true);
  const release = await acquireBrowserSlot({ dir: join(f.root, 'locks') });
  try { result = await suggest(f.root, { freeBytes: 8 * 2 ** 30 }); assert.equal(result.selected.length, 0); assert.match(result.waiting[0].reasons.join(), /slots: no free|browser slot busy/); }
  finally { release(); }
  result = await suggest(f.root, { freeBytes: 8 * 2 ** 30 }); assert.equal(result.selected.length, 1); assert.match(result.waiting[0].reasons.join(), /browser slot reserved/);
});
test('[risk: unavailable provider launched] Claude-only inventory excludes Codex and explains wait', async t => {
  const f = fixture(t); addItem(f.root, f.item('a', { provider: 'codex' })); addItem(f.root, f.item('b', { provider: 'claude' }));
  const result = await suggest(f.root, { providers: ['claude'], freeBytes: 8 * 2 ** 30 });
  assert.deepEqual(result.selected.map(i => i.id), ['b']); assert.match(result.waiting[0].reasons.join(), /codex unavailable/);
});
test('[risk: repeat escapes again] repeated area/class blocks launch until an incident-linked rule review exists', async t => {
  const f = fixture(t); addItem(f.root, f.item()); mkdirSync(join(f.root, 'docs'));
  const incidents = ['one', 'two'].map(id => ({ id, area: 'logic', class: 'escape', ruleReview: 'docs/review.md' }));
  writeFileSync(join(f.root, 'docs/missed-problems.jsonl'), incidents.map(JSON.stringify).join('\n'));
  assert.match((await suggest(f.root)).waiting[0].reasons.join(), /rule review required/);
  writeFileSync(join(f.root, 'docs/review.md'), 'one two: changed the rule'); assert.equal((await suggest(f.root)).selected.length, 1);
});
async function triggerFixture(t, trigger) {
  const f = fixture(t), highMemory = { freeBytes: 8 * 2 ** 30 };
  addItem(f.root, f.item('a', { waitsFor: [trigger] })); addItem(f.root, f.item('b', { waitsFor: [trigger] }));
  assert.equal((await suggest(f.root, trigger === 'memory-available' ? { freeBytes: 0 } : highMemory)).selected.length, 0);
  updateQueue(f.root, q => { for (const i of q.items) i.waitsFor = []; });
  const calls = [], result = await dispatchReady(f.root, trigger, { context: highMemory, prepare: item => f.put(f.progress(), item.id + '.json'), launch: async item => {
    calls.push(item.id); return { taskId: 'tracked-' + item.id };
  } });
  assert.equal(result.lines.length, 2); assert.deepEqual(calls, ['a', 'b']);
  assert.ok(result.lines.every(line => line.includes(`launched (${trigger})`))); assert.ok(readQueue(f.root).items.every(i => i.state === 'running'));
}
test('[risk: coordinator waits to be asked] job-finished immediately schedules every ready job', t => triggerFixture(t, 'job-finished'));
test('[risk: coordinator waits to be asked] plan-check-ok immediately schedules every ready job', t => triggerFixture(t, 'plan-check-ok'));
test('[risk: coordinator waits to be asked] merge-landed immediately schedules every ready job', t => triggerFixture(t, 'merge-landed'));
test('[risk: coordinator waits to be asked] memory-available immediately schedules every ready job', t => triggerFixture(t, 'memory-available'));
test('[risk: coordinator waits to be asked] person-answered immediately schedules every ready job', t => triggerFixture(t, 'person-answered'));
test('[risk: launch recheck bypassed] a stale suggestion cannot launch into an occupied worktree', async t => {
  const f = fixture(t); addItem(f.root, f.item()); addItem(f.root, f.item('b', { worktree: join(f.root, 'a') }));
  f.put(); launchJob(f.root, 'a', { taskId: 'a', progressFile: 'progress.json' });
  assert.throws(() => launchJob(f.root, 'b', { taskId: 'b', progressFile: 'progress.json' }), /worktree overlap/);
});
test('[risk: second failure has no escalation or decision] mixed gate/review failures stop the slice and preserve person decision', t => {
  const f = fixture(t), options = { home: join(f.root, 'home'), caughtBy: 'fresh-reviewer', ownErrorShare: 'part' }; addItem(f.root, f.item());
  assert.equal(recordFailure(f.root, 'a', 'gate', options).state, 'failed');
  const item = recordFailure(f.root, 'a', 'review', options); assert.equal(item.state, 'stopped');
  const rows = listSignals({ root: f.root, home: options.home }); assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'escalation'); assert.equal(rows[0].planLink, 'plan.md');
  setSignal(item.escalation, 'decision', 're-plan', { root: f.root, home: options.home }); assert.equal(listSignals({ root: f.root, home: options.home })[0].decision, 're-plan');
});
test('[risk: unsafe apply or unsupported claim] running sync, stale patch, untested commit and missing diff files are refused', () => {
  const q = { items: [{ state: 'running' }] };
  assert.throws(() => checkApply(q, { action: 'sync' }), /No sync/);
  assert.throws(() => checkApply(q, { action: 'patch', head: 'new', baseHead: 'old' }), /HEAD/);
  assert.throws(() => checkApply(q, { action: 'commit', claims: ['missing.mjs'], changedFiles: ['actual.mjs'] }), /Tests must pass.*Unsupported commit claim/);
  assert.equal(checkApply(q, { action: 'commit', testsPassed: true, claims: ['actual.mjs'], changedFiles: ['actual.mjs'] }), true);
});
test('[risk: scattered asks] review lists merge at reply top and two questions fail', () => {
  const i = { label: 'Result', link: 'docs/result.md' };
  const text = checkReply({ reviewLists: [[i], [i, { label: 'Other', link: 'docs/other.md' }]], text: 'Status', questions: [{ prompt: 'Next?', choices: ['wait', 're-plan'], recommendation: 're-plan' }] });
  assert.equal((text.match(/Needs your review/g) || []).length, 1); assert.ok(text.startsWith('Needs your review')); assert.equal((text.match(/\[Result\]/g) || []).length, 1);
  assert.throws(() => checkReply({ questions: [{}, {}] }), /At most one/);
});
test('[risk: gaps or misguided instructions unreported] both cases persist signals and a reply line with corrected text', t => {
  const f = fixture(t), input = { duty: 'Explain a tool licence', skill: 'jig-orchestrate', proposedFix: 'Add research guidance', home: join(f.root, 'home') };
  assert.match(reportDuty(f.root, input).line, /^Not covered by a skill:/);
  assert.match(reportDuty(f.root, { ...input, misguided: true, what: 'Old rule led to wasted work' }).line, /^Skill misguided:.*proposed fix:/);
  const rows = listSignals({ root: f.root, home: input.home }); assert.deepEqual(rows.map(r => r.kind), ['skill-gap', 'skill-misguided']); assert.ok(rows.every(r => r.proposedFix && r.skill));
});
test('[risk: ambiguous command exit] nothing ready exits 3, invalid input 1, usable suggestion 0', t => {
  const f = fixture(t); assert.equal(f.run('suggest').status, 3); assert.equal(f.run('unknown').status, 1);
  addItem(f.root, f.item()); assert.equal(f.run('suggest').status, 0);
});
import { followStatus } from '../scripts/queue.mjs';
import { jobcheck, countRead } from '../scripts/jobcheck.mjs';
test('[risk: watch misses stale and finished transitions] fake-clock follow emits changes only and stops cleanly', async t => {
  const f = fixture(t); addItem(f.root, f.item('a', { progressFile: f.put() }));
  launchJob(f.root, 'a', { taskId: 'tracked', progressFile: 'progress.json' });
  const controller = new AbortController(), snapshots = []; let clock = Date.parse('2026-01-01T00:05:00Z'), tick = 0;
  await followStatus(f.root, { now: () => clock, signal: controller.signal, emit: s => snapshots.push(s), wait: async () => {
    tick++;
    if (tick === 2) clock = Date.parse('2026-01-01T00:11:00Z');
    if (tick === 3) f.put(f.progress({ steps: [{ label: 'done', done: true }], result: { outcome: 'passed', complete: true } }));
    if (tick === 4) controller.abort();
  } });
  assert.equal(snapshots.length, 3); assert.doesNotMatch(snapshots[0], /STALE|FINISHED/); assert.match(snapshots[1], /STALE/); assert.match(snapshots[2], /FINISHED/);
});
test('[risk: feedback file ignored] markReview cannot omit open durable ledger entries', t => {
  const f = fixture(t); addItem(f.root, f.item()); f.put(); launchJob(f.root, 'a', { taskId: 'tracked', progressFile: 'progress.json' });
  f.put(f.progress({ steps: [{ label: 'done', done: true }], result: { outcome: 'passed', complete: true } })); finishJob(f.root, 'a');
  const evidence = Object.fromEntries(['gate','reviewer','presentation'].map(k => [k, { passed: true, by: k, revision: 'abc' }]));
  writeFileSync(join(f.root, '.jig/feedback.json'), JSON.stringify({ version: 1, items: [{ item: 'a', state: 'open' }] }));
  assert.throws(() => markReview(f.root, 'a', { revision: 'abc', builder: 'builder', coordinator: 'coordinator', evidence, feedback: [] }), /open feedback/);
});
test('[risk: repeated chores flood context] jobcheck returns bounded tail, plan hash, test counts, Git status, memory and durable read share', t => {
  const f = fixture(t); f.put(); writeFileSync(join(f.root, 'plan.md'), 'plan');
  writeFileSync(join(f.root, 'job.log'), 'x'.repeat(100000) + '\n# tests 5\n# pass 4\n# fail 1\n');
  const output = jobcheck({ root: f.root, progress: 'progress.json', plan: 'plan.md', log: 'job.log', now, freeBytes: 8 * 2 ** 30, git: () => ({ status: 0, stdout: ' M src/unit.mjs\0?? new.mjs\0' }) });
  assert.ok(output.split('\n').length <= 12); assert.match(output, /Plan SHA256: [a-f0-9]{64}/); assert.match(output, /Tests: tests=5 pass=4 fail=1/); assert.match(output, /Git: 1 tracked changes; 1 untracked/); assert.match(output, /Memory: 8.0 GB free/); assert.match(output, /Tail 1:/);
  assert.ok(output.length < 1500); countRead(f.root, 'manual'); countRead(f.root, 'delegated');
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, '.jig/orchestration-reads.json'))), { scripted: 1, delegated: 1, manual: 1 });
});
test('[risk: relative queue roots schedule the wrong files] conflicts resolve relative worktree paths from the queue root', async t => {
  const f = fixture(t); addItem(f.root, f.item('a', { worktree: 'tasks/a', touches: ['../shared/unit.mjs'] })); addItem(f.root, f.item('b', { worktree: 'tasks/b', touches: ['../shared/unit.mjs'] }));
  assert.equal((await suggest(f.root)).selected.length, 1);
});
test('[risk: status presentation regresses] stable sample exposes bars, elapsed and dependency waits', t => {
  const f = fixture(t); addItem(f.root, f.item('a', { progressFile: f.put() })); addItem(f.root, f.item('b', { dependsOn: ['a'] }));
  const lines = statusLines(f.root, { now: Date.parse('2026-01-01T00:05:00Z') });
  assert.equal(lines[0], 'a [----------] 0/2 5.0/15m pending unblocks: b');
  assert.equal(lines[1], 'b [----------] 0/? ?/?m pending waits: dependency a');
});
test('[risk: CLI varies by shell] add, ready, suggest and status run under PowerShell and bash', t => {
  const f = fixture(t); addItem(f.root, f.item());
  for (const shell of ['powershell', 'bash']) {
    const check = spawnSync(shell, shell === 'powershell' ? ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'] : ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (check.error || check.status !== 0) { t.diagnostic(`${shell} unavailable; shell evidence gap`); continue; }
    const inputPath = join(f.root, shell + '-item.json'); writeFileSync(inputPath, JSON.stringify(f.item(shell + '-item')));
    for (const command of ['add', 'ready', 'suggest', 'status']) {
      // Executables and paths arrive through environment variables, never shell interpolation.
      const suffix = command === 'add' ? (shell === 'powershell' ? 'add --file $env:JIG_TEST_ITEM' : 'add --file "$JIG_TEST_ITEM"') : command;
      const source = shell === 'powershell' ? `& $env:JIG_TEST_NODE $env:JIG_TEST_QUEUE --root $env:JIG_TEST_ROOT ${suffix}` : `"$JIG_TEST_NODE" "$JIG_TEST_QUEUE" --root "$JIG_TEST_ROOT" ${suffix}`;
      const result = spawnSync(shell, shell === 'powershell' ? ['-NoProfile', '-Command', source] : ['-c', source], { env: { ...process.env, JIG_TEST_NODE: process.execPath, JIG_TEST_QUEUE: cli, JIG_TEST_ROOT: f.root, JIG_TEST_ITEM: inputPath }, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /a/);
    }
  }
});
test('[risk: two coordinators start conflicting tools] reservation is durable before launcher runs; missing receipts stay reserved', async t => {
  const f = fixture(t); addItem(f.root, f.item()); addItem(f.root, f.item('b', { worktree: join(f.root, 'a') }));
  let competingCalls = 0;
  const result = await dispatchReady(f.root, 'person-answered', {
    prepare: item => f.put(f.progress(), item.id + '.json'),
    launch: async item => {
      assert.equal(readQueue(f.root).items[0].state, 'starting');
      const other = await dispatchReady(f.root, 'person-answered', { launch: async () => { competingCalls++; } });
      assert.equal(other.lines.length, 0); return { taskId: 'tracked' };
    }
  });
  assert.equal(result.lines.length, 1); assert.equal(competingCalls, 0);
  const g = fixture(t); addItem(g.root, g.item());
  await assert.rejects(dispatchReady(g.root, 'job-finished', { prepare: () => g.put(), launch: async () => ({}) }), /Tracked taskId/);
  assert.equal(readQueue(g.root).items[0].state, 'starting'); assert.equal((await suggest(g.root)).selected.length, 0);
});
test('[risk: tool starts without progress] dispatch refuses missing timebox before invoking tracked launcher', async t => {
  const f = fixture(t); addItem(f.root, f.item()); let called = false;
  await assert.rejects(dispatchReady(f.root, 'plan-check-ok', { prepare: () => f.put(f.progress({ timeboxMinutes: undefined })), launch: async () => { called = true; } }), /Invalid progress/);
  assert.equal(called, false); assert.equal(readQueue(f.root).items[0].state, 'pending');
});
test('[risk: missed-runner-shell-log-encoding-mp-2026-11-08-18] PowerShell UTF-16 logs retain counts and readable bounded tail', t => {
  const f = fixture(t); writeFileSync(join(f.root,'shell.log'), Buffer.from('\ufeff# tests 3\n# pass 2\n# fail 1\nreadable tail\n','utf16le'));
  const output = jobcheck({ root: f.root, log: 'shell.log', git: () => ({status:0,stdout:''}) });
  assert.match(output, /Tests: tests=3 pass=2 fail=1/); assert.match(output, /Tail 2: readable tail/); assert.doesNotMatch(output, /\u0000/);
});
test('[risk: alias paths evade worktree exclusion] existing directory aliases and future children reserve the same files', async t => {
  const f = fixture(t), actual = join(f.root,'actual'), alias = join(f.root,'alias'); mkdirSync(actual); symlinkSync(actual,alias,process.platform === 'win32' ? 'junction' : 'dir');
  addItem(f.root,f.item('a',{worktree:join(actual,'future')})); addItem(f.root,f.item('b',{worktree:join(alias,'future')}));
  const result = await suggest(f.root); assert.equal(result.selected.length,1); assert.match(result.waiting[0].reasons.join(),/worktree overlap/);
});
