import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWorktree } from '../scripts/worktree.mjs';

const script = fileURLToPath(new URL('../scripts/worktree.mjs', import.meta.url));
export function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jig branches ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, 'repo with spaces'); mkdirSync(main);
  const gitAt = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args) => gitAt(main, ...args);
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'core.autocrlf', 'false');
  writeFileSync(join(main, '.gitignore'), '/.jig/\n');
  writeFileSync(join(main, 'value.txt'), 'base\n');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const run = (...args) => runWorktree(args, main);
  const change = (tree, commit = true) => {
    writeFileSync(join(tree.path, 'value.txt'), 'changed\n');
    if (commit) { gitAt(tree.path, 'add', '.'); gitAt(tree.path, 'commit', '-qm', 'task'); }
  };
  const scratch = (name = 'scratch with spaces') => { const path = join(root, name); mkdirSync(path); writeFileSync(join(path, 'run.txt'), 'artifact'); return path; };
  return { root, main, git, gitAt, run, change, scratch };
}

test('[risk: lifecycle leaks resources] open, list and close a merged branch and its registered scratch through paths with spaces', t => {
  const f = fixture(t);
  const tree = f.run('open', 'build/feature');
  assert.equal(tree.path, join(f.root, 'repo with spaces-wt', 'build', 'feature'));
  f.change(tree);
  const scratch = f.scratch(); const unregistered = f.scratch('keep');
  f.run('register', 'build/feature', scratch);
  let row = f.run('list').worktrees.find(row => row.name === 'build/feature');
  assert.equal(row.merged, false); assert.equal(row.dirty, false); assert.equal(row.ageDays, 0);
  assert.equal(row.scratch[0].path, scratch);
  // The same main-owned registry is visible from a linked checkout.
  assert.equal(runWorktree(['list'], tree.path).worktrees.find(row => row.name === 'build/feature').scratch[0].path, scratch);
  f.git('merge', '--ff-only', tree.branch);
  row = f.run('list').worktrees.find(row => row.name === 'build/feature'); assert.equal(row.merged, true);
  const cli = spawnSync(process.execPath, [script, 'close', 'build/feature'], { cwd: f.main, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).closed, 'build/feature');
  assert.equal(existsSync(tree.path), false); assert.equal(existsSync(scratch), false); assert.equal(existsSync(unregistered), true);
  assert.equal(f.git('branch', '--list', tree.branch), '');
  assert.equal(f.run('list').worktrees.length, 1);
});

test('[risk: discarded work] dirty and unmerged close refuse; force needs a reason and reports it', t => {
  const f = fixture(t); const tree = f.run('open', 'task');
  f.change(tree);
  assert.throws(() => f.run('close', 'task'), /unmerged/);
  f.change(tree, false); writeFileSync(join(tree.path, 'untracked.txt'), 'unsaved');
  assert.equal(f.run('list').worktrees.find(row => row.name === 'task').dirty, true);
  assert.throws(() => f.run('close', 'task'), /dirty.*unmerged/);
  assert.throws(() => f.run('close', 'task', '--force'), /requires/);
  assert.throws(() => f.run('close', 'task', '--force', '--reason', '  '), /requires/);
  assert.equal(existsSync(tree.path), true);
  const result = f.run('close', 'task', '--force', '--reason', 'discard abandoned experiment');
  assert.equal(result.forced, true); assert.equal(result.reason, 'discard abandoned experiment');
  assert.equal(existsSync(tree.path), false); assert.equal(f.git('branch', '--list', 'task'), '');
});

test('[risk: ignored dirtiness after merge] close refuses tracked and untracked work even when merged', t => {
  const f = fixture(t); const tree = f.run('open', 'dirty');
  f.change(tree, false);
  assert.throws(() => f.run('close', 'dirty'), /dirty, merged/);
  f.gitAt(tree.path, 'restore', 'value.txt'); writeFileSync(join(tree.path, 'new.txt'), 'unsaved');
  assert.throws(() => f.run('close', 'dirty'), /dirty, merged/);
  assert.equal(existsSync(tree.path), true);
});

test('[risk: stale resources go unseen] doctor previews merged, missing, prunable and orphaned scratch without deleting', t => {
  const f = fixture(t); const tree = f.run('open', 'done');
  const scratch = f.scratch(); f.run('register', 'done', scratch);
  const missing = f.run('open', 'missing'); const missingScratch = f.scratch('missing scratch');
  f.run('register', 'missing', missingScratch); rmSync(missingScratch, { recursive: true });
  rmSync(missing.path, { recursive: true });
  let issues = f.run('doctor').issues;
  for (const kind of ['merged-worktree', 'missing-worktree', 'prunable-entry', 'stale-scratch']) assert.ok(issues.some(issue => issue.kind === kind), kind);
  assert.equal(existsSync(tree.path), true); assert.equal(existsSync(scratch), true);
  f.git('worktree', 'prune', '--expire', 'now');
  issues = f.run('doctor').issues;
  assert.ok(issues.some(issue => issue.kind === 'orphan-registration' && issue.name === 'missing'));
  assert.throws(() => f.run('close', 'missing', '--force', '--reason', 'stale'), /missing/);
});

test('[risk: deletion escapes owned resources] reject unsafe destinations, overlaps, changed branches and nested repositories', t => {
  const f = fixture(t);
  mkdirSync(join(f.main, '.jig'), { recursive: true });
  const config = value => writeFileSync(join(f.main, '.jig/worktree.json'), JSON.stringify(value));
  for (const root of ['inside', '../.claude/worktrees', '../.agents/worktrees']) {
    config({ root }); assert.throws(() => f.run('open', 'unsafe'), /overlap|Provider/);
  }
  config({ root: '../custom trees' });
  const tree = f.run('open', 'safe'); assert.equal(tree.path, join(f.root, 'custom trees', 'safe'));
  for (const path of [f.main, f.root, tree.path, join(f.main, '.git')]) assert.throws(() => f.run('register', 'safe', path), /overlap/);
  const scratch = f.scratch(); f.run('register', 'safe', scratch);
  mkdirSync(join(scratch, 'nested')); f.gitAt(join(scratch, 'nested'), 'init', '-q');
  assert.throws(() => f.run('close', 'safe'), /Scratch contains/);
  assert.equal(existsSync(tree.path), true);
  f.gitAt(tree.path, 'switch', '-c', 'replacement');
  assert.throws(() => f.run('close', 'safe', '--force', '--reason', 'cleanup'), /branch changed/);
  assert.throws(() => f.run('close', 'unknown', '--force', '--reason', 'cleanup'), /Unknown/);
});

test('[risk: incorrect merge target] configurable main and base use local ancestry; protected branches and active cwd remain safe', t => {
  const f = fixture(t); f.git('branch', '-m', 'trunk');
  mkdirSync(join(f.main, '.jig'), { recursive: true });
  writeFileSync(join(f.main, '.jig/worktree.json'), JSON.stringify({ mainBranch: 'trunk', base: 'trunk' }));
  const tree = f.run('open', 'task', '--base', 'trunk');
  assert.equal(f.run('list').mainBranch, 'trunk');
  assert.throws(() => runWorktree(['close', 'task'], tree.path), /outside/);
  f.git('worktree', 'lock', tree.path);
  assert.throws(() => f.run('close', 'task', '--force', '--reason', 'cleanup'), /locked/);
  f.git('worktree', 'unlock', tree.path);
  f.run('close', 'task');
});

test('[risk: malformed state enables deletion] invalid registry and concurrent writers fail closed', t => {
  const f = fixture(t); const tree = f.run('open', 'task');
  const registry = join(f.main, '.jig/worktrees.json'); const original = readFileSync(registry, 'utf8');
  writeFileSync(registry, '{"version":1,"worktrees":[{}]}');
  assert.throws(() => f.run('close', 'task', '--force', '--reason', 'cleanup'));
  assert.equal(existsSync(tree.path), true);
  writeFileSync(registry, original);
  mkdirSync(join(f.main, '.jig/worktrees.lock'));
  assert.throws(() => f.run('close', 'task'), /locked/);
  assert.equal(existsSync(tree.path), true);
});

test('[risk: symlink swaps redirect cleanup] scratch replacement cannot delete its new target', t => {
  const f = fixture(t); const tree = f.run('open', 'task');
  const scratch = f.scratch(); const keep = f.scratch('preserve');
  f.run('register', 'task', scratch);
  rmSync(scratch, { recursive: true });
  symlinkSync(keep, scratch, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.run('close', 'task'), /symlink/);
  assert.equal(existsSync(tree.path), true); assert.equal(existsSync(join(keep, 'run.txt')), true);
});

test('[risk: another repository becomes disposable] reject foreign repositories and replaced worktree folders', t => {
  const f = fixture(t); const tree = f.run('open', 'task');
  const other = f.scratch('other repo'); f.gitAt(other, 'init', '-q', '-b', 'task');
  const child = join(other, 'runs'); mkdirSync(child);
  assert.throws(() => f.run('register', 'task', child), /inside a Git repository/);
  writeFileSync(join(f.main, '.jig/worktree.json'), JSON.stringify({ root: child }));
  assert.throws(() => f.run('open', 'second'), /inside a Git repository/);
  // Keep Git's administration entry but replace the checkout with an unrelated repo.
  rmSync(tree.path, { recursive: true }); mkdirSync(tree.path); f.gitAt(tree.path, 'init', '-q', '-b', 'task');
  assert.throws(() => f.run('close', 'task', '--force', '--reason', 'cleanup'), /no longer/);
  assert.equal(existsSync(join(tree.path, '.git')), true);
});

test('[risk: stale branch refs hide doctor findings] missing branch and folder remain diagnosable', t => {
  const f = fixture(t); const tree = f.run('open', 'task');
  rmSync(tree.path, { recursive: true }); f.git('update-ref', '-d', 'refs/heads/task');
  const issues = f.run('doctor').issues;
  assert.ok(issues.some(issue => issue.kind === 'missing-worktree'));
  assert.ok(issues.some(issue => issue.kind === 'unknown-merge-state'));
});
