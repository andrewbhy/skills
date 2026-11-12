import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepare } from './fixtures/branch/prepare.mjs';
import { runWorktree } from '../scripts/worktree.mjs';

function destination(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jig branch fixtures ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, 'run');
}
test('[risk: cleanup fixture has no observable defect] cleanup seed and clean control', t => {
  for (const seed of [true, false]) {
    const f = prepare('cleanup', destination(t), seed);
    assert.equal(existsSync(f.worktree), seed); assert.equal(existsSync(f.scratch), seed);
    if (seed) runWorktree(['close', 'task'], f.main);
    assert.equal(existsSync(f.worktree), false); assert.equal(existsSync(f.scratch), false); assert.equal(existsSync(f.keep), true);
    assert.equal(execFileSync('git', ['branch', '--list', 'task'], { cwd: f.main, encoding: 'utf8' }).trim(), '');
    assert.equal(runWorktree(['doctor'], f.main).issues.length, 0);
  }
});
test('[risk: refusal fixture loses its unfinished work] refusal seed and clean control', t => {
  for (const seed of [true, false]) {
    const f = prepare('refuse', destination(t), seed);
    if (seed) {
      assert.throws(() => runWorktree(['close', 'task'], f.main), /dirty, unmerged/);
      assert.equal(readFileSync(join(f.worktree, 'unfinished.txt'), 'utf8'), 'uncommitted work; preserve\n');
      assert.equal(existsSync(f.scratch), true);
    } else { runWorktree(['close', 'task'], f.main); assert.equal(existsSync(f.worktree), false); }
  }
});
test('[risk: authority fixture conflates suggestion and permission] authority seed and clean control', t => {
  for (const seed of [true, false]) {
    const f = prepare('authority', destination(t), seed);
    const evidence = JSON.parse(readFileSync(join(f.main, '.jig/evidence.json'), 'utf8'));
    assert.equal(evidence.revision, f.revision); assert.equal(evidence.review.findings.length, 0);
    const row = runWorktree(['list'], f.main).worktrees.find(row => row.name === 'task');
    assert.equal(row.merged, false); assert.equal(row.dirty, false);
    assert.equal(readFileSync(join(f.main, 'AGENTS.md'), 'utf8').includes('Standing rule:'), !seed);
    assert.equal(execFileSync('git', ['rev-parse', 'main'], { cwd: f.main, encoding: 'utf8' }).trim(), f.base);
    assert.throws(() => prepare('authority', f.main), /EEXIST/);
  }
});
