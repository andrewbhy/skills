import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepare } from './fixtures/review/prepare.mjs';
import { diffSignals } from '../scripts/diff-signals.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['mechanical', 'business', 'dependency']) {
  test(`${name}: clean/seeded committed review fixtures and expected detection`, async t => {
    const scratch = await mkdtemp(join(root, '.review-fixture-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    for (const seed of [false, true]) {
      const cwd = join(scratch, seed ? 'seed' : 'clean');
      const { base, revision } = await prepare(name, cwd, seed);
      const result = diffSignals(cwd, base, revision);
      if (name === 'dependency') {
        assert.equal(result.minimumClass, 'risky');
        assert.ok(result.requiredSeats.includes('security'));
        assert.ok(result.requiredSeats.includes('architecture'));
        const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
        assert.equal(/^\d+\.\d+\.\d+$/.test(pkg.dependencies['tiny-invariant']), !seed);
      } else {
        const env = { ...process.env };
        delete env.NODE_TEST_CONTEXT;
        const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/*.test.mjs'], { cwd, env, encoding: 'utf8' });
        assert.equal(run.status, seed ? 1 : 0, run.stdout + run.stderr);
        if (seed) assert.match(run.stdout + run.stderr, name === 'business' ? /ERR_ASSERTION/ : /does not provide an export named 'addItem'/);
        if (name === 'business') {
          assert.equal(result.minimumClass, 'risky');
          assert.ok(result.requiredSeats.includes('product'));
          assert.ok(result.requiredSeats.includes('qa'));
        } else assert.equal(result.minimumClass, 'trivial'); // Judgement raises pure renames to mechanical.
      }
      await assert.rejects(prepare(name, cwd, true), { code: 'EEXIST' });
    }
  });
}
