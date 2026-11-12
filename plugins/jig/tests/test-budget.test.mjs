import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inventory, parseMissedProblems, testBudget, testingSummary } from '../scripts/test-budget.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts/test-budget.mjs');
function fixture(t) {
  const cwd = mkdtempSync(join(root, '.test-budget-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  put('test/basic.test.mjs', "import test from 'node:test';\ntest('[risk: lost total] total is retained', () => {});\n");
  return { cwd, put, config: value => put('.jig/testing.json', JSON.stringify(value)) };
}
const command = ['node', '--test', 'test/*.test.mjs'];

const problem = (overrides = {}) => ({ date: '2026-11-07', what: 'Retry lost input after green tests',
  area: 'product slice', class: 'lost-input', who: 'person', layer: 'integration', action: 'Fixed retry; added integration replay test', ...overrides });

test('[risk: misleading problem history] parses JSONL and rejects invalid incident records with line evidence', () => {
  const entries = [problem(), problem({ layer: 'person only', who: 'agent', action: 'Changed UX rule' })];
  assert.deepEqual(parseMissedProblems('\r\n' + entries.map(JSON.stringify).join('\r\n') + '\n').map(({id,repeat,repeats,...entry}) => entry), entries);
  assert.deepEqual(parseMissedProblems(''), []);
  for (const invalid of ['{', 'null', '[]', '1', JSON.stringify(problem({ date: '2026-02-30' })),
    JSON.stringify(problem({ date: '2026-13-01' })), JSON.stringify(problem({ date: '07 Nov 2026' })),
    JSON.stringify(problem({ layer: 'e2e' })), JSON.stringify(problem({ who: ' ' })),
    JSON.stringify(problem({ action: null })), JSON.stringify({ ...problem(), date: undefined }),
    JSON.stringify({ ...problem(), typo: true }), JSON.stringify(problem({ source: 'automatic' }))]) {
    assert.throws(() => parseMissedProblems(JSON.stringify(problem()) + '\n' + invalid), /Missed problems line 2:/);
  }
  for (const source of ['script', 'model', 'person']) assert.equal(parseMissedProblems(JSON.stringify(problem({ source })))[0].source, source);
});

test('[risk: incorrect rules review totals] summary measures suite and groups live versions and missed problems by layer', async t => {
  const { cwd, put } = fixture(t);
  put('test/live.test.mjs', `import test from 'node:test';
test.skip('[risk: wire drift] [live:ledger@2] first', () => {});
test.skip('[risk: wire drift] [live:ledger@2] second', () => {});
test.skip('[risk: wire drift] [live:ledger@3] third', () => {});
test.skip('[risk: protocol drift] [live:stream@1] fourth', () => {});
`);
  put('docs/missed-problems.jsonl', ['unit', 'integration', 'integration', 'end-to-end', 'live', 'person only']
    .map((layer, i) => JSON.stringify(problem({ layer, class: `case-${i}` }))).join('\n'));
  const report = await testingSummary(cwd, command);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.deepEqual(report.summary.suite, { count: 5, elapsedMs: report.elapsedMs, timeBudgetMs: 10000 });
  assert.ok(report.summary.suite.elapsedMs > 0);
  assert.deepEqual(report.summary.live, { count: 4, versions: [
    { system: 'ledger', version: '2', count: 2 }, { system: 'ledger', version: '3', count: 1 },
    { system: 'stream', version: '1', count: 1 },
  ] });
  assert.deepEqual(report.summary.missedProblems, { path: 'docs/missed-problems.jsonl', present: true, count: 6,
    byLayer: { unit: 1, integration: 2, 'end-to-end': 1, live: 1, 'person only': 1, 'visual runner': 0, 'visual runner and gate': 0 },
    bySource: { script: 0, model: 0, person: 0, unknown: 6 }, warnings: [], openRepeats: [] });
});

test('[risk: summary conceals missing history or failures] CLI keeps failures and distinguishes absent and empty logs', t => {
  const { cwd, put, config } = fixture(t);
  const run = (...options) => spawnSync(process.execPath,
    [script, '--summary', ...options, '--', ...command], { cwd, encoding: 'utf8' });
  let result = run('--json');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  let report = JSON.parse(result.stdout);
  assert.equal(report.summary.missedProblems.present, false);
  assert.equal(report.summary.missedProblems.count, 0);
  assert.deepEqual(report.summary.live, { count: 0, versions: [] });
  result = run();
  assert.match(result.stdout, /Live test count: 0/);
  assert.match(result.stdout, /missing; no history recorded/);
  assert.match(result.stdout, /Missed problem layer: person only: 0/);
  put('docs/missed-problems.jsonl', '');
  config({ timeBudgetMs: 0.001 });
  result = run('--json');
  report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(report.summary.missedProblems.present, true);
  assert.equal(report.overBudget, true);
  config({ timeBudgetMs: 10000 });
  put('test/basic.test.mjs', "import test from 'node:test'; test('[risk: lost total] fails', () => { throw Error('broken'); });");
  result = run('--json');
  assert.equal(result.status, 1);
  report = JSON.parse(result.stdout);
  assert.equal(report.passed, false);
  assert.equal(report.execution.exitCode, 1);
  assert.equal(report.summary.suite.count, 1);
});

test('[risk: broken log silently counted] summary refuses malformed logs before running the suite', t => {
  const { cwd, put } = fixture(t);
  put('docs/missed-problems.jsonl', JSON.stringify(problem({ layer: 'unknown' })));
  const result = spawnSync(process.execPath, [script, '--summary', '--json', '--',
    'node', '-e', "console.log('SHOULD NOT RUN')"], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).passed, false);
  assert.match(JSON.parse(result.stdout).error, /Missed problems line 1: layer/);
  assert.doesNotMatch(result.stdout, /SHOULD NOT RUN/);
});

test('[risk: unusable defaults] runs a real portable command without configuration', async t => {
  const { cwd, put } = fixture(t);
  put('tests/fixtures/ignored.test.mjs', "test('no risk', () => {});");
  put('node_modules/ignored.test.mjs', "test('no risk', () => {});");
  const result = await testBudget(cwd, command);
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.timeBudgetMs, 10000);
  assert.equal(result.testCount, 1);
  assert.equal(result.execution.exitCode, 0);
  assert.ok(result.elapsedMs > 0);
});

test('[risk: silent suite growth] independently reports missing tags, versions and elapsed budget', async t => {
  const { cwd, put, config } = fixture(t);
  config({ timeBudgetMs: 0.001 });
  put('test/tags.test.mjs', `import test from 'node:test';
test('forgotten risk', () => {});
test.skip('[risk: wire drift] [live:ledger@2.0.1] ping', () => {});
test.skip('[risk: wire drift] [live:ledger] old ping', () => {});
test.skip('[risk: wire drift] [live] bare ping', () => {});
`);
  const result = await testBudget(cwd, command);
  assert.equal(result.passed, false);
  assert.equal(result.execution.exitCode, 0);
  assert.equal(result.overBudget, true);
  assert.deepEqual(result.missingRiskTags.map(t => [t.file, t.line]), [['test/tags.test.mjs', 2]]);
  assert.deepEqual(result.liveTests.map(t => t.live), [{ system: 'ledger', version: '2.0.1' }]);
  assert.equal(result.invalidLiveTags.length, 2);
});

test('[risk: framework mismatch] supports project patterns and refuses empty or unrecognized inventories', async t => {
  const { cwd, put, config } = fixture(t);
  put('test/titles.test.mjs', `test("[risk: customer loss] doesn't drop customer", () => {});
test.skip('[risk: duplicate charge] can\\'t charge twice', () => {});
test(titleFromData, () => {});
test(\x60[risk: lost item] item \x24{index}\x60, () => {});
test('[risk: computed title]' + suffix, () => {});
`);
  const defaults = await testBudget(cwd, ['node', '-e', '']);
  assert.equal(defaults.passed, false);
  assert.deepEqual(defaults.unsupportedDeclarations.map(t => t.line).sort(), [3, 4, 5]);
  assert.equal(defaults.missingRiskTags.length, 0);
  put('checks/sample.case', 'case "RISK(total) LIVE(api@v3)"');
  config({ testGlobs: ['checks/**/*.case'], testPattern: 'case "([^"]+)"', riskTagPattern: 'RISK\\([^)]+\\)', liveTagPattern: 'LIVE\\(([^@]+)@([^)]+)\\)' });
  const result = await testBudget(cwd, ['node', '-e', '']);
  assert.equal(result.passed, true);
  assert.equal(result.liveTests[0].live.version, 'v3');
  config({ testGlobs: ['checks/*.case'] });
  assert.deepEqual(inventory(cwd).unrecognizedFiles, ['checks/sample.case']);
  assert.equal((await testBudget(cwd, ['node', '-e', ''])).passed, false);
  config({ testGlobs: ['missing/*.test.mjs'] });
  assert.equal((await testBudget(cwd, ['node', '-e', ''])).passed, false);
});

test('[risk: hidden command failures] JSON stays parseable on failure and preserves literal arguments', t => {
  const { cwd } = fixture(t);
  const run = args => spawnSync(process.execPath, [script, '--json', '--', ...args], { cwd, encoding: 'utf8' });
  const value = 'spaces & $(literal) `literal`';
  let result = run(['node', '-e', 'console.log(process.argv[1]); console.error("detail"); process.exitCode = 2', value]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.execution.stdout.trim(), value);
  assert.equal(report.execution.stderr.trim(), 'detail');
  assert.equal(report.execution.exitCode, 2);
  assert.equal(report.passed, false);
  result = run(['nonexistent-jig-test-command']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).execution.error, 'ENOENT');
  result = run(['node', '-e', '']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, true);
});

test('[risk: invalid policy silently accepted] rejects malformed config and CLI before execution', async t => {
  const { cwd, put, config } = fixture(t);
  for (const value of [null, [], { unknown: true }, { timeBudgetMs: 0 }, { testGlobs: [] },
    { testGlobs: ['../outside/*'] }, { excludeGlobs: 'test' }, { riskTagPattern: '[' }, { testPattern: '.*' }]) {
    config(value);
    await assert.rejects(testBudget(cwd, command));
  }
  put('.jig/testing.json', '{');
  const bad = spawnSync(process.execPath, [script, '--json', '--', ...command], { cwd, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).passed, false);
  const usage = spawnSync(process.execPath, [script, '--json'], { cwd, encoding: 'utf8' });
  assert.equal(usage.status, 1);
  assert.match(JSON.parse(usage.stdout).error, /Usage/);
});
