import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileFeedback, status, recordReview, closeMiss } from '../scripts/interaction-feedback.mjs';
import { missedProblems } from '../scripts/missed-problems.mjs';

const helper = fileURLToPath(new URL('../.agents/skills/jig-interaction/telemetry.mjs', import.meta.url));
const clean = fileURLToPath(new URL('./fixtures/interaction/clean.json', import.meta.url));

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'interaction-fb-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/design'), { recursive: true });
  mkdirSync(join(root, 'docs/results'), { recursive: true });
  return root;
}
const feedback = (root, value) => writeFileSync(join(root, 'docs/design/feedback.json'), JSON.stringify(value));
const slice = (name, date, items) => ({ slice: name, date, items });
const fix = (id, cls = 'friction', layer = 'a') => ({ id, verdict: 'Fix', class: cls, caughtBy: { layer, rule: '4' }, note: 'too many clicks to end a turn' });
const marker = (root, ...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
const start = (root) => marker(root, 'start', root, 'claude').stdout.trim();
const markers = (root) => (existsSync(join(root, '.jig/telemetry.jsonl')) ? readFileSync(join(root, '.jig/telemetry.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : []);

test('[risk: slice passes with no person feedback] telemetry end passed is refused without a valid feedback.json', (t) => {
  const root = project(t);
  const run = start(root);
  let result = marker(root, 'end', root, 'claude', run, 'passed');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /feedback\.json is missing/);
  feedback(root, slice('s1', '2026-11-11', []));
  assert.match(marker(root, 'end', root, 'claude', run, 'passed').stderr, /no items/);
  feedback(root, slice('s1', '2026-11-11', [{ id: 'a', verdict: 'Maybe' }]));
  assert.match(marker(root, 'end', root, 'claude', run, 'passed').stderr, /verdict/);
  feedback(root, slice('s1', '2026-11-11', [fix('a')]));
  assert.match(marker(root, 'end', root, 'claude', run, 'passed').stderr, /not filed/, 'an unfiled Fix is refused');
  assert.ok(!markers(root).some((m) => m.event === 'end'), 'no end marker was written');
  assert.equal(marker(root, 'end', root, 'claude', run, 'partly').status, 0, 'a spec-only run ends partly');
});

test('passes once Keep and filed Fix entries exist; the filed rows are valid missed problems', (t) => {
  const root = project(t);
  const run = start(root);
  feedback(root, slice('s1', '2026-11-11', [{ id: 'k', verdict: 'Keep', note: 'ok' }, fix('f1', 'cramped', 'b')]));
  const filed = fileFeedback(root);
  assert.deepEqual(filed.filed, ['mp-2026-11-11-fb-s1-f1']);
  assert.equal(marker(root, 'end', root, 'claude', run, 'passed').status, 0);
  assert.equal(markers(root).at(-1).outcome, 'passed');
  const report = missedProblems(root, 'product slice');
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].layer, 'person only');
  assert.match(report.entries[0].action, /layer \(b\)/);
  assert.equal(fileFeedback(root).filed.length, 0, 'filing twice does not duplicate');
});

test('layer (a) misses are filed at layer unit; an off switch records partly, never passed', (t) => {
  const root = project(t);
  feedback(root, slice('s1', '2026-11-11', [fix('f1')]));
  fileFeedback(root);
  assert.equal(missedProblems(root, 'product slice').entries[0].layer, 'unit');
  const run = start(root);
  const off = spawnSync(process.execPath, [helper, 'end', root, 'claude', run, 'passed'], { encoding: 'utf8', env: { ...process.env, JIG_INTERACTION_GATE: 'off' } });
  assert.equal(off.status, 0);
  assert.equal(markers(root).at(-1).outcome, 'partly');
});

test('[risk: friction repeats unnoticed] trip-wire fires on two consecutive slices with a friction, inconsistency or cramped Fix, and a review clears it', (t) => {
  const root = project(t);
  feedback(root, slice('s1', '2026-11-11', [fix('a', 'friction')]));
  assert.equal(fileFeedback(root).tripped, false);
  feedback(root, slice('s2', '2026-11-12', [fix('b', 'cramped')]));
  assert.equal(fileFeedback(root).tripped, true);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/interaction-feedback.mjs', import.meta.url)), 'status', root], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /TRIP-WIRE/);
  assert.throws(() => recordReview(root, 'docs/results/none.md'), /Rule failed/);
  writeFileSync(join(root, 'docs/results/r.md'), '## Rule failed\nThe checker did not see mode keys.\n\n## Changes\nAdded rule 8.\n');
  recordReview(root, 'docs/results/r.md');
  assert.equal(status(root).tripped, false);
});

test('a slice without a trip class resets the streak', (t) => {
  const root = project(t);
  feedback(root, slice('s1', '2026-11-11', [fix('a', 'friction')])); fileFeedback(root);
  feedback(root, slice('s2', '2026-11-12', [fix('b', 'wrong-colour')])); fileFeedback(root);
  feedback(root, slice('s3', '2026-11-13', [fix('c', 'friction')]));
  assert.equal(fileFeedback(root).tripped, false);
});

test('false alarms are counted per rule or seat and noisy ones become delete candidates', (t) => {
  const root = project(t);
  for (const [i, name] of ['s1', 's2', 's3'].entries()) {
    feedback(root, slice(name, `2026-11-1${i}`, [{ id: 'k', verdict: 'Keep', flaggedBy: 'rule 10', note: 'fine as is' }]));
    var last = fileFeedback(root);
  }
  assert.equal(last.falseAlarms['rule 10'], 3);
  assert.deepEqual(last.deleteCandidates, ['rule 10']);
});

test('[risk: a miss is closed on a claim] a miss closes only when a planted-defect fixture is caught and its control is clean', (t) => {
  const root = project(t);
  feedback(root, slice('s1', '2026-11-11', [fix('f1', 'mode-hidden', 'a')]));
  fileFeedback(root);
  const id = 'mp-2026-11-11-fb-s1-f1';
  const spec = JSON.parse(readFileSync(clean, 'utf8'));
  const planted = JSON.parse(JSON.stringify(spec)); delete planted.flows[2].states[0].visibleAs;
  writeFileSync(join(root, 'planted.json'), JSON.stringify(planted));
  writeFileSync(join(root, 'control.json'), JSON.stringify(spec));
  assert.throws(() => closeMiss(root, id, join(root, 'control.json'), join(root, 'control.json')), /not caught/);
  assert.throws(() => closeMiss(root, id, join(root, 'planted.json'), join(root, 'planted.json')), /control .* finding/);
  assert.equal(closeMiss(root, id, join(root, 'planted.json'), join(root, 'control.json'), '8').rule, '8');
  assert.match(readFileSync(join(root, 'docs/missed-problems.jsonl'), 'utf8'), /Closed .* caught by rule 8/);
});
