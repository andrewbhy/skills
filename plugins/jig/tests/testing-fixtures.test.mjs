import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepare } from './fixtures/testing/prepare.mjs';
import { testBudget } from '../scripts/test-budget.mjs';
import { diffSignals } from '../scripts/diff-signals.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(cwd, args, input) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd, env, input, encoding: 'utf8' });
}

test('[risk: ineffective scenario seeds] clean controls pass and planted defects stay isolated', async t => {
  const scratch = await mkdtemp(join(root, '.testing-fixture-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const name of ['budget', 'ui', 'outside']) {
    for (const seed of [false, true]) {
      const cwd = join(scratch, `${name}-${seed}`);
      const { base, revision } = await prepare(name, cwd, seed);
      await assert.rejects(prepare(name, cwd, seed), { code: 'EEXIST' });
      if (name === 'budget') {
        const signals = diffSignals(cwd, base, revision);
        assert.ok(signals.requiredSeats.includes('architecture'));
        const result = await testBudget(cwd, ['node', '--test', 'test/*.test.mjs']);
        assert.equal(result.execution.exitCode, 0, result.execution.stderr);
        assert.equal(result.passed, !seed, JSON.stringify(result));
        assert.equal(result.overBudget, seed);
        assert.equal(result.missingRiskTags.length, seed ? 1 : 0);
      } else if (name === 'ui') {
        const smoke = run(cwd, ['--test', 'test/*.test.mjs']);
        assert.equal(smoke.status, 0, smoke.stdout + smoke.stderr);
        const html = await readFile(join(cwd, 'index.html'), 'utf8');
        assert.equal(html.includes('translateX(150vw)'), seed);
        for (const seat of ['visual-craft', 'fidelity', 'content-stress', 'motion', 'accessibility']) assert.ok(diffSignals(cwd, base, revision).requiredSeats.includes(seat), seat);
        // Real browser capture/inspection belongs to the provider scenario, not this smoke check.
      } else {
        const version = run(cwd, ['vendor/notebook.mjs', '--version']);
        assert.equal(version.stdout.trim(), '1.0.0');
        const ui = run(cwd, ['vendor/notebook.mjs', '--ui']);
        assert.match(ui.stdout, /All items.*ascending ID/);
        for (const state of ['all', 'open']) {
          const response = run(cwd, ['vendor/notebook.mjs', '--request'], JSON.stringify({ op: 'list', state }));
          assert.equal(response.status, 0, response.stderr);
          const recording = JSON.parse(response.stdout);
          assert.equal(recording.version, '1.0.0');
          assert.deepEqual(recording.items.map(item => item.id), state === 'all' ? seed ? [3, 2, 1] : [1, 2, 3] : seed ? [3, 1] : [1, 3]);
          if (state === 'open') assert.ok(recording.items.every(item => !item.done));
        }
      }
    }
  }
  const sources = join(root, 'tests/fixtures/testing');
  await assert.rejects(prepare('ui', join(sources, 'new-copy')), /outside fixture sources/);
  assert.match(await readFile(join(sources, 'ui/index.html'), 'utf8'), /translateX\(0\)/);
  assert.doesNotMatch(await readFile(join(sources, 'outside/vendor/notebook.mjs'), 'utf8'), /selected\.reverse/);
});
