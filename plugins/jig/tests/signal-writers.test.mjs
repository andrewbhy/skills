import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkArguments, runCheck } from '../scripts/visual-check.mjs';
import { readSignals } from '../scripts/signals.mjs';

test('[risk: tools forget to record] brief and plan CLIs each record exactly one refusal', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-signal-writers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, JIG_SIGNALS_PROJECT: root, JIG_SIGNALS_HOME: join(root, 'home') };
  const bad = join(root, 'bad.md'); writeFileSync(bad, '# Incomplete');
  const run = (script, ...args) => spawnSync(process.execPath, [resolve('scripts', script), ...args], { env, encoding: 'utf8' });
  assert.equal(run('brief-check.mjs', bad).status, 1);
  assert.equal(run('plan-seats.mjs', '--outcome', JSON.stringify({ outcome: 'BLOCK', item: 'fixture plan', reasons: ['contract absent'] })).status, 0);
  assert.equal(run('plan-seats.mjs', '--outcome', JSON.stringify({ outcome: 'OK', item: 'fixture plan', reasons: [] })).status, 0);
  const rows = readSignals(join(root, '.jig/signals.jsonl'));
  assert.deepEqual(rows.map(row => row.kind), ['broken-brief', 'plan-block']);
  assert.deepEqual(rows.map(row => row.area), ['brief-check', 'plan-check']);
  assert.ok(rows.every(row => row.project === basename(root)));
  const other = join(root, 'other.md'); writeFileSync(other, '# Also incomplete');
  assert.equal(run('brief-check.mjs', other).status, 1);
  assert.equal(run('brief-check.mjs', bad).status, 1);
  const later = readSignals(join(root, '.jig/signals.jsonl'));
  assert.equal(later[2].repeatOf, undefined);
  assert.equal(later[3].repeatOf, rows[0].id);
});

test('[risk: visual outcomes silently disappear] actual runner finish records incomplete and budget outcomes once', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-visual-signal-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const options = checkArguments(['--url', 'file:///fixture.html', '--out', out]);
  const log = join(process.env.JIG_SIGNALS_PROJECT, '.jig/signals.jsonl');
  const before = readSignals(log).length;
  await runCheck(options, {
    tokens: () => ({ invalid: true, findings: [], gaps: ['configured check never ran'], elapsedMs: 1000000, status: 'inconclusive' }),
    launch: () => { throw Error('Must not launch browser'); }
  });
  const signals = readSignals(log).slice(before);
  assert.deepEqual(signals.map(row => row.kind), ['over-budget', 'missed-check']);
  assert.ok(signals.every(row => row.area === 'visual-check' && row.project === basename(process.env.JIG_SIGNALS_PROJECT) && row.item === 'visual-check'));
});

test('[risk: tests write real signal logs] missing temporary overrides refuse before any filesystem write', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { addSignal } from './scripts/signals.mjs'; addSignal({ project:'fixture', level:'jig', kind:'escape', area:'runner', item:'guard', caughtBy:'test' });"], {
    encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: 'guard', JIG_SIGNALS_PROJECT: '', JIG_SIGNALS_HOME: '' }
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /Tests require temporary signal paths/);
});
