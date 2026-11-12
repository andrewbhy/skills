import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPlan, checkFile, inspectPlan, schema } from '../scripts/brief-check.mjs';

const complete = readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url), 'utf8');
const measure = (goal = 'G1', tier = 1, outcome = 'Find plans') => `| ${goal} | ${outcome} | incidents | ${tier} | 3 | 0 | retro | incident log |`;
const table = rows => `## Success measures\n| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n`;
const plan = ({ kind = 'module', minutes = 45, rows = [measure()] } = {}) => complete
  .replace('## Intent\n', `## Intent\nKind: ${kind}\n`)
  .replace('10 minutes', `${minutes} minutes`).replace('5 minutes', '0 minutes')
  .replace('## Missed problems', `${rows === null ? '' : table(rows)}## Missed problems`);
const privatePlan = new URL('../docs/plans/2026-11-08-jigplan.md', import.meta.url);
test('[risk: documented current plan diverges from launch format] current build plan passes structural check', { skip: !existsSync(privatePlan) && 'the private build plan is not part of a public copy' }, () => {
  assert.deepEqual(checkFile(fileURLToPath(privatePlan)), []);
});

test('[risk: documented measured fixture diverges from the checker] measured example has a soft half-unmeasured score', () => {
  const result = inspectPlan(readFileSync(new URL('./fixtures/plans/measured.md', import.meta.url), 'utf8'));
  assert.deepEqual(result.ambiguity, { unmeasured: 1, total: 2, share: 0.5 });
  assert.equal(result.reasons.length, 0);
  assert.equal(result.warnings.length, 1);
});

test('[risk: new table rules break legacy and small plans] Kind and slice totals select the conditional contract', () => {
  assert.deepEqual(inspectPlan(complete), { reasons: [], warnings: [], ambiguity: null });
  assert.deepEqual(inspectPlan(complete.replace('## Missed problems', `${table([measure('G1', 3)])}## Missed problems`)).ambiguity, null);
  for (const kind of ['build', 'ui', 'product', 'module']) {
    assert.equal(inspectPlan(plan({ kind, rows: null })).warnings.length, 1);
    assert.equal(inspectPlan(plan({ kind, minutes: 29, rows: null })).warnings.length, 0);
    assert.equal(inspectPlan(plan({ kind, minutes: 30, rows: null })).warnings.length, 1);
  }
  assert.equal(inspectPlan(plan({ kind: 'mechanical', rows: null })).warnings.length, 0);
  assert.equal(inspectPlan(plan({ minutes: 29, rows: null }).replace('0 minutes', '2 minutes')).warnings.length, 1);
  assert.equal(inspectPlan(plan({ kind: 'typo' })).warnings.length, 1);
  assert.equal(inspectPlan(plan().replaceAll('\n', '\r\n')).warnings.length, 0);
});

test('[risk: malformed measures look collectable] eight columns, single-line complete rows and four-row limit warn softly', () => {
  const valid = plan();
  for (const broken of [
    valid.replace('| Goal |', '| Wrong |'),
    valid.replace('| Source |', ''),
    valid.replace('|---|---|---|---|---|---|---|---|', '|---|---|'),
    valid.replace(' | incidents', '\n | incidents'),
    valid.replace('| 3 |', '| |'),
    plan({ rows: [] }),
    plan({ rows: Array.from({ length: 5 }, (_, i) => measure(`G${i + 1}`)) }),
    plan({ rows: [measure('same outcome', 3)] }),
    plan({ rows: [measure('G1', 4)] })
  ]) {
    const result = inspectPlan(broken);
    assert.equal(result.reasons.length, 0);
    assert(result.warnings.length > 0);
    assert.equal(result.ambiguity, null);
  }
  assert.equal(inspectPlan(plan({ rows: Array.from({ length: 4 }, (_, i) => measure(`G${i + 1}`)) })).warnings.length, 0);
});

test('[risk: ambiguity matched by text or rows hides subjective goals] score counts distinct Goal IDs, proxies and threshold equality', () => {
  const cases = [
    [[measure()], 0, 1],
    [[measure('G1', 3), measure('G1', 2)], 0, 1],
    [[measure('G1', 3), measure('G1', 1, 'Different text')], 0, 1],
    [[measure('G1', 3), measure('G2', 1)], 1, 2],
    [[measure('G1', 3), measure('G1', 3), measure('G2', 1)], 1, 2],
    [[measure('G1', 3), measure('G2', 3)], 2, 2]
  ];
  for (const [rows, unmeasured, total] of cases) {
    const result = inspectPlan(plan({ rows }));
    assert.deepEqual(result.ambiguity, { unmeasured, total, share: unmeasured / total });
    assert.equal(result.reasons.length, 0);
    assert.equal(result.warnings.length, Number(unmeasured / total >= 0.5));
  }
  const half = plan({ rows: [measure('G1', 3), measure('G2', 1)] });
  assert.equal(checkPlan(half, { plan: { ambiguityGate: 'block' } }).length, 1);
  assert.equal(checkPlan(half, { plan: { ambiguityGate: 'block', ambiguityThreshold: 0.51 } }).length, 0);
  assert.equal(checkPlan(plan(), { plan: { ambiguityGate: 'block', ambiguityThreshold: 0 } }).length, 1);
  assert.equal(checkPlan(plan({ rows: [measure('G1', 3)] }), { plan: { ambiguityGate: 'block', ambiguityThreshold: 1 } }).length, 1);
  for (const config of [{ ambiguityThreshold: -1 }, { ambiguityThreshold: 1.1 }, { ambiguityThreshold: '0.5' }, { ambiguityGate: 'skip' }]) assert.equal(checkPlan(half, { plan: config }).length, 1);
});

test('[risk: CLI loses soft warnings, scores or workspace configuration] real CLI reports all plans and applies the opt-in gate', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-measures-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.jig'));
  const path = join(root, 'plan.md'), configPath = join(root, '.jig/config.json');
  const run = (...paths) => spawnSync(process.execPath, ['scripts/brief-check.mjs', '--workspace', root, ...paths], { encoding: 'utf8' });
  writeFileSync(path, plan({ rows: [measure('G1', 3), measure('G2', 1)] }));
  let result = run(path);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ambiguity: 1 of 2 goals unmeasured/);
  assert.match(result.stderr, /warning: Ambiguity/);
  writeFileSync(configPath, JSON.stringify({ plan: { ambiguityGate: 'block' } }));
  result = run(path);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /at or above threshold/);
  writeFileSync(configPath, JSON.stringify({ plan: { ambiguityGate: 'block', ambiguityThreshold: 0.75 } }));
  assert.equal(run(path).status, 0);
  writeFileSync(path, complete);
  result = run(join(root, 'absent.md'), path);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /OK/); // A missing input does not suppress later reports.
  assert.doesNotMatch(result.stdout, /ambiguity:/);
  writeFileSync(configPath, '{}');
  writeFileSync(path, plan({ rows: null }));
  result = run(path);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /warning: Success measures/);
});
test('[risk: incomplete plans launch] each required section is refused, complete control passes', () => {
  assert.deepEqual(checkPlan(complete), []);
  for (const name of schema.sections) {
    const broken = complete.replace(new RegExp(`^## ${name}\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, 'm'), '');
    assert(checkPlan(broken).some(reason => reason.includes(name)), name);
  }
  for (const column of schema.verificationColumns) assert(checkPlan(complete.replace(`| ${column} |`, '| |')).length);
  for (const status of ['BLOCK', 'PENDING']) assert(checkPlan(complete.replace('OK:', `${status}:`)).length);
  assert(checkPlan(complete.replace('OK:', 'No outcome:')).length);
  assert(checkPlan('```md\n' + complete + '\n```').length);
  assert(checkPlan(complete.replace('2 seconds', '')).length);
});
test('[risk: briefs bypass plan validation] linked plan is read and checked', () => {
  const brief = '## Intent\nDo it\n## Acceptance\nRefuse defects\n## Scope\nCLI\n## Plan\n[Plan](plan.md)\n';
  assert.deepEqual(checkFile('/brief.md', path => path.endsWith('brief.md') ? brief : complete), []);
  assert(checkFile('/brief.md', path => path.endsWith('brief.md') ? brief : complete.replace('OK:', 'BLOCK:')).length);
});
test('[risk: launcher cannot interpret failures] public CLI returns documented exit codes', () => {
  const run = args => spawnSync(process.execPath, ['scripts/brief-check.mjs', ...args], { encoding: 'utf8' });
  assert.equal(run(['tests/fixtures/plans/complete.md']).status, 0);
  for (const args of [[], ['missing-plan.md']]) assert.equal(run(args).status, 1);
});

test('[risk: missed-skills-broken-brief-mp-2026-11-08-12 and mp-2026-11-08-14] workspace links resolve at the job, absolute links work, missing targets refuse', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-brief-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'job (with spaces)'), handoff = join(root, 'handoff');
  mkdirSync(workspace); mkdirSync(handoff);
  const briefPath = join(handoff, 'brief.md'), planPath = join(workspace, 'plan.md');
  const brief = link => `## Intent\nDo it\n## Acceptance\nRefuse defects\n## Scope\nCLI\n## Plan\n[Plan](${link})\n`;
  writeFileSync(planPath, complete);
  const run = args => spawnSync(process.execPath, [resolve('scripts/brief-check.mjs'), ...args], { encoding: 'utf8', cwd: root });
  writeFileSync(briefPath, brief('plan.md'));
  assert.equal(run([briefPath]).status, 1);
  assert.equal(run(['--workspace', workspace, briefPath]).status, 0);
  // A bad plan beside the brief cannot shadow the actual workspace plan.
  writeFileSync(join(handoff, 'plan.md'), complete.replace('OK:', 'BLOCK:'));
  assert.equal(run([briefPath, '--workspace', workspace]).status, 0);
  writeFileSync(briefPath, brief(planPath));
  assert.equal(run([briefPath]).status, 0);
  writeFileSync(briefPath, brief('missing.md'));
  assert.equal(run(['--workspace', workspace, briefPath]).status, 1);
  for (const link of ['https://example.org/plan.md', 'file:///plan.md']) {
    writeFileSync(briefPath, brief(link));
    assert.match(run([briefPath]).stderr, /local.*link/);
  }
  for (const args of [['--workspace'], ['--workspace', workspace], ['--bogus', briefPath]]) assert.equal(run(args).status, 1);
});

test('[risk: draft plans with pending seats log false broken-brief signals] pending BLOCK is a draft; malformed outcomes still fail and signal', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-draft-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'plan.md');
  const run = () => spawnSync(process.execPath, [resolve('scripts/brief-check.mjs'), '--workspace', root, path], { encoding: 'utf8', cwd: root });
  const signals = () => { try { return readFileSync(join(root, '.jig/signals.jsonl'), 'utf8'); } catch { return ''; } };
  const draft = complete.replace(/OK:[^\n]*/, 'BLOCK: security seat pending; recheck after edits');
  assert.equal(inspectPlan(draft).draft?.includes('pending'), true);
  assert.deepEqual(inspectPlan(draft).reasons, []);
  assert(checkPlan(draft).length); // Not launchable for library callers.
  writeFileSync(path, draft);
  let result = run();
  assert.equal(result.status, 2);
  assert.match(result.stdout, /draft: pending/);
  assert.equal(signals(), '');
  for (const bad of ['BLOCK: testing found a gap', 'No outcome here']) {
    writeFileSync(path, complete.replace(/OK:[^\n]*/, bad));
    result = run();
    assert.equal(result.status, 1);
  }
  assert.match(signals(), /broken-brief/);
  writeFileSync(path, complete.replace(/OK:[^\n]*/, 'OK: all seats resolved\nBLOCK: testing found a gap'));
  assert.equal(run().status, 1);
});
