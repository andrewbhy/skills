import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { missedProblems, parseMissedProblems, logPath, legacyLogPath } from '../scripts/missed-problems.mjs';
import { testingSummary } from '../scripts/test-budget.mjs';

const row = (overrides = {}) => ({ id: 'one', date: '2026-11-08', area: 'design', class: 'low-contrast',
  what: 'Words are washed out', who: 'person', source: 'person', layer: 'integration', action: 'Add rendered contrast check', ...overrides });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-missed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  return { root, put, log: rows => put(logPath, rows.map(JSON.stringify).join('\n')) };
}
const cli = (root, args) => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/missed-problems.mjs', import.meta.url)), ...args], { cwd: root, encoding: 'utf8' });

test('[risk: repeated mistakes hidden by omitted or false flags] intake derives repeats by area and class and emits brief/check pairs', t => {
  const { root, log } = fixture(t);
  log([row(), row({ id: 'other-area', area: 'runner' }), row({ id: 'other-class', class: 'selection-inconsistency' }), row({ id: 'again', repeat: false })]);
  const report = missedProblems(root, 'design');
  assert.equal(report.entries.length, 3);
  assert.deepEqual(report.openRepeats.map(entry => entry.id), ['again']);
  assert.equal(report.entries.at(-1).repeat, true);
  assert.equal(report.entries.at(-1).repeats, 'one');
  assert.equal(report.blocked, true);
  assert.deepEqual(report.checks.map(check => check.brief), report.entries.map(entry => entry.what));
  assert.equal(new Set(report.checks.map(check => check.check)).size, 3);
  assert.equal(missedProblems(root, 'runner').blocked, false);
  assert.throws(() => missedProblems(root, 'unknown'), /Unknown area/);
  const run = cli(root, ['--area', 'design']);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /Check: missed-design-low-contrast-one/);
  assert.match(run.stderr, /BLOCKED repeat again/);
});

test('[risk: unrelated or missing reports release a repeat] rule review must be incident-linked with both explanations in results', t => {
  const { root, log, put } = fixture(t);
  const again = row({ id: 'again', ruleReview: 'docs/results/review.md' });
  for (const [path, text] of [
    [undefined, undefined], ['other.md', 'again\n## Rule failed\nFailed.\n## Changes\nChange.'],
    ['docs/results/review.md', ''], ['docs/results/review.md', 'another\n## Rule failed\nFailed.\n## Changes\nChange.'],
    ['docs/results/review.md', 'again\n## Rule failed\nFailed.'],
    ['docs/results/review.md', 'again\n## Rule failed\n\n## Changes\nChanged.'],
    ['docs/results/review.md', 'again\n## Rule failed\nFailed.\n## Changes\n\n'],
    ['docs/results/../../other.md', 'again\n## Rule failed\nFailed.\n## Changes\nChange.'],
  ]) {
    if (path) put(path, text);
    log([row(), { ...again, ...(path ? { ruleReview: path } : {}) }]);
    assert.equal(missedProblems(root, 'design').blocked, true, path);
  }
  put(again.ruleReview, '# Review: again\n\n## Rule failed\nSelf-review accepted weak surfaces.\n\n## Changes\nRequire rendered evidence and fresh acceptance.\n');
  log([row(), again]);
  assert.equal(missedProblems(root, 'design').blocked, false);
  assert.equal(cli(root, ['--area', 'design']).status, 0);
  log([row({ repeat: true })]);
  assert.equal(missedProblems(root, 'design').openRepeats.length, 1);
});

test('[risk: rename loses history or silently uses stale data] one-release fallback announces move and new path wins', async t => {
  const { root, put } = fixture(t);
  put('test/basic.test.mjs', "test('[risk: sample] sample',()=>{});");
  const legacy = row(); delete legacy.area; delete legacy.class;
  put(legacyLogPath, JSON.stringify(legacy));
  let report = missedProblems(root, 'design');
  assert.equal(report.path, legacyLogPath);
  assert.match(report.warnings[0], /moved to docs\/missed-problems.jsonl/);
  assert.deepEqual(report.unclassified, ['one']);
  assert.equal(report.blocked, true);
  assert.match(cli(root, ['--area', 'design']).stderr, /moved/);
  const summary = await testingSummary(root, ['node', '-e', '']);
  assert.equal(summary.summary.missedProblems.count, 1);
  assert.equal(summary.summary.missedProblems.bySource.person, 1);
  assert.match(summary.summary.missedProblems.warnings[0], /moved/);
  put(logPath, JSON.stringify(row()));
  report = missedProblems(root, 'design');
  assert.equal(report.path, logPath);
  assert.equal(report.entries.length, 1);
  assert.deepEqual(report.warnings, []);
  put(logPath, '{');
  assert.throws(() => missedProblems(root), /Missed problems line 1/);
});

test('[risk: invalid classifications bypass intake] missing history, schema failures and CLI usage remain visible', t => {
  const { root } = fixture(t);
  assert.equal(missedProblems(root).present, false);
  assert.equal(cli(root, ['--area', 'design']).status, 2);
  for (const args of [[], ['--area'], ['--area', 'unknown'], ['--area', 'design', '--other']]) assert.equal(cli(root, args).status, 2);
  for (const invalid of [row({ area: 'unknown' }), row({ class: '' }), row({ class: 'Low contrast' }), row({ repeat: 'yes' }), row({ ruleReview: '' }), row({ id: '' })]) {
    assert.throws(() => parseMissedProblems(JSON.stringify(invalid)), /Missed problems line 1/);
  }
  assert.throws(() => parseMissedProblems([row(), row()].map(JSON.stringify).join('\n')), /duplicate id/);
});

const privateLog = new URL('../docs/missed-problems.jsonl', import.meta.url);
test('[risk: migration drops the person findings] repository log retains the original nine incidents and permits later reports', { skip: !existsSync(privateLog) && 'the private incident log is not part of a public copy' }, () => {
  const entries = parseMissedProblems(readFileSync(new URL('../docs/missed-problems.jsonl', import.meta.url), 'utf8'));
  assert.equal(entries.slice(0,9).length, 9);
  assert.deepEqual(entries.slice(0,9).filter(entry => entry.date === '2026-11-08').map(entry => [entry.area, entry.class]), [
    ['design', 'low-contrast'], ['runner', 'partial-coverage'], ['design', 'self-acceptance'],
  ]);
  assert.equal(entries.find(entry => entry.id === 'mp-2026-11-08-07').repeat, true);
});

test('[risk: fixed correction scenarios do not plant a repeat] provider fixture recurrence blocks and a different area stays clean', t => {
  const { root, put } = fixture(t);
  const first = readFileSync(new URL('./fixtures/correct/project/docs/missed-problems.jsonl', import.meta.url), 'utf8');
  const incident = JSON.parse(readFileSync(new URL('./fixtures/correct/project/incident.json', import.meta.url), 'utf8'));
  put(logPath, first + JSON.stringify(incident) + '\n');
  assert.deepEqual(missedProblems(root, 'design').openRepeats.map(row => row.id), ['contrast-again']);
  put(logPath, first + JSON.stringify({ ...incident, area: 'runner', class: 'partial-coverage' }) + '\n');
  assert.equal(missedProblems(root, 'design').blocked, false);
  assert.equal(missedProblems(root, 'runner').blocked, false);
});
