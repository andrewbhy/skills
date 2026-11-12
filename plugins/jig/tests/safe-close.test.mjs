import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runWorktree } from '../scripts/worktree.mjs';

function fixture(t, ignore = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jig-safe-close-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, 'main'); mkdirSync(main);
  const gitAt = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args) => gitAt(main, ...args);
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(main, '.gitignore'), '/.jig/\n/node_modules\n/.npm-cache\n/.env\n' + ignore);
  writeFileSync(join(main, 'value'), 'base'); git('add', '.'); git('commit', '-qm', 'base');
  const run = (...args) => runWorktree(args, main);
  const runHooked = (...args) => runWorktree(args, main, { beforeRemove: path => git('worktree', 'lock', path) });
  const put = (tree, path, value = 'private\0bytes\r\n') => { const dest = join(tree.path, path); mkdirSync(join(dest, '..'), { recursive: true }); writeFileSync(dest, value); return dest; };
  const change = tree => { writeFileSync(join(tree.path, 'value'), 'changed'); gitAt(tree.path, 'add', '.'); gitAt(tree.path, 'commit', '-qm', 'task'); };
  const config = value => { mkdirSync(join(main, '.jig'), { recursive: true }); writeFileSync(join(main, '.jig/worktree.json'), JSON.stringify(value)); };
  return { root, main, run, runHooked, git, gitAt, put, change, config };
}

test('[risk: ignored evidence lost] private files refuse with names and import preserves bytes before close', t => {
  const f = fixture(t), tree = f.run('open', 'task');
  const path = f.put(tree, '.jig/backfill.jsonl'); const bytes = readFileSync(path);
  assert.throws(() => f.run('close', 'task'), /unconsumed.*\.jig\/backfill.jsonl/);
  assert.equal(existsSync(tree.path), true);
  const dest = join(f.root, 'imports');
  const result = f.run('close', 'task', '--import', dest);
  assert.deepEqual(readFileSync(join(dest, 'task/.jig/backfill.jsonl')), bytes);
  assert.equal(result.copies.length, 1); assert.equal(existsSync(tree.path), false);
});

test('[risk: stale consumption discards changed evidence] consume records hashes and changes invalidate them', t => {
  const f = fixture(t), tree = f.run('open', 'task');
  const path = f.put(tree, '.jig/notes');
  const receipt = f.run('consume', 'task', '.jig/notes');
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(readFileSync(join(tree.path, '.jig/consumed.json')))['.jig/notes'], receipt.sha256);
  writeFileSync(path, 'new evidence');
  assert.throws(() => f.run('close', 'task'), /unconsumed.*notes/);
  f.run('consume', 'task', '.jig/notes'); f.run('close', 'task');
  assert.equal(existsSync(tree.path), false);
});

test('[risk: force bypasses private file protection] force with reason still refuses ignored evidence', t => {
  const f = fixture(t), tree = f.run('open', 'task'); f.change(tree);
  f.put(tree, '.jig/backfill.jsonl');
  assert.throws(() => f.run('close', 'task', '--force', '--reason', 'discard experiment'), /unconsumed.*backfill/);
  assert.equal(existsSync(tree.path), true); assert.notEqual(f.git('branch', '--list', 'task'), '');
});

test('[risk: other ignored files lost] env files refuse and import while configured disposable folders can be removed', t => {
  const f = fixture(t, '/cache/\n'), tree = f.run('open', 'task');
  const path = f.put(tree, '.env'); const bytes = readFileSync(path);
  f.put(tree, 'node_modules/build'); f.put(tree, 'cache/build');
  f.config({ disposable: ['node_modules/', '.npm-cache/', 'cache/'] });
  assert.throws(() => f.run('close', 'task'), /unconsumed.*\.env/);
  const dest = join(f.root, 'imports'); f.run('close', 'task', '--import', dest);
  assert.deepEqual(readFileSync(join(dest, 'task/.env')), bytes);
  assert.equal(existsSync(join(dest, 'task/cache')), false);
});

test('[risk: directory exemption discards a same-named file] ignored regular node_modules file remains protected', t => {
  const f = fixture(t, '/node_modules\n'), tree = f.run('open', 'task');
  f.put(tree, 'node_modules', 'valuable file');
  assert.throws(() => f.run('close', 'task', '--force', '--reason', 'discard tracked changes'), /unconsumed.*node_modules/);
  assert.equal(readFileSync(join(tree.path, 'node_modules'), 'utf8'), 'valuable file');
});

test('[risk: import destroys or half preserves files] inside destination and conflicting files refuse before removal', t => {
  const f = fixture(t), tree = f.run('open', 'task'); f.put(tree, '.jig/a'); f.put(tree, '.jig/b');
  assert.throws(() => f.run('close', 'task', '--import', join(tree.path, 'imports')), /destination.*inside/);
  const dest = join(f.root, 'imports'); mkdirSync(join(dest, 'task/.jig'), { recursive: true });
  writeFileSync(join(dest, 'task/.jig/b'), 'keep');
  assert.throws(() => f.run('close', 'task', '--import', dest), /Import conflict.*\.jig\/b.*nothing removed/);
  assert.equal(existsSync(tree.path), true); assert.equal(existsSync(join(dest, 'task/.jig/a')), false);
  assert.equal(readFileSync(join(dest, 'task/.jig/b'), 'utf8'), 'keep');
});

test('[risk: import copy failure removes work] filesystem failure after first copy preserves tree and reports copies', t => {
  const f = fixture(t), tree = f.run('open', 'task');
  f.put(tree, '.jig/a'); f.put(tree, '.jig/z/b');
  const dest = join(f.root, 'imports'); mkdirSync(join(dest, 'task/.jig'), { recursive: true });
  // A file in place of a parent directory makes the second copy fail on both platforms.
  writeFileSync(join(dest, 'task/.jig/z'), 'blocked parent');
  assert.throws(() => f.run('close', 'task', '--import', dest), /nothing removed; copies present:.*a/);
  assert.equal(existsSync(tree.path), true); assert.equal(existsSync(join(dest, 'task/.jig/a')), true);
  assert.equal(existsSync(join(tree.path, '.jig/consumed.json')), false);
});

test('[risk: wrong integration ancestry] named and configured integration targets close merged work and refuse unmerged work', t => {
  const f = fixture(t); f.git('branch', 'integration'); f.config({ integrationBranch: 'integration' });
  const tree = f.run('open', 'task'); f.change(tree);
  assert.throws(() => f.run('close', 'task', '--into', 'integration'), /unmerged/);
  f.gitAt(f.main, 'switch', 'integration'); f.git('merge', '--ff-only', 'task'); f.git('switch', 'main');
  assert.throws(() => f.run('close', 'task', '--into', 'main'), /unmerged/);
  assert.equal(f.run('close', 'task').into, 'integration');
  const second = f.run('open', 'second', '--base', 'integration');
  f.run('close', 'second'); assert.equal(existsSync(second.path), false);
});

test('[risk: junction removal traverses target] ignored node_modules junction removes only link', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t), tree = f.run('open', 'task');
  const target = join(f.root, 'shared'); mkdirSync(target); writeFileSync(join(target, 'keep'), 'keep');
  symlinkSync(target, join(tree.path, 'node_modules'), 'junction');
  f.run('close', 'task'); assert.equal(existsSync(tree.path), false);
  assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'keep');
});

test('[risk: symlink removal traverses target] ignored node_modules symlink removes only link on macOS', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t), tree = f.run('open', 'task');
  const target = join(f.root, 'shared'); mkdirSync(target); writeFileSync(join(target, 'keep'), 'keep');
  symlinkSync(target, join(tree.path, 'node_modules'), 'dir');
  f.run('close', 'task'); assert.equal(existsSync(tree.path), false);
  assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'keep');
});

test('[risk: stale registry after deletion] registry save failure reports stale entry and safe retry refuses', t => {
  const f = fixture(t), tree = f.run('open', 'task');
  writeFileSync(join(f.main, '.jig/worktrees.json.tmp'), 'existing writer output');
  assert.throws(() => f.run('close', 'task'), /Worktree removed; stale registry entry.*task.*doctor/);
  assert.equal(existsSync(tree.path), false);
  assert.ok(f.run('doctor').issues.some(row => row.kind === 'orphan-registration' && row.name === 'task'));
  assert.throws(() => f.run('close', 'task'), /missing/);
});

test('[risk: lock exit contract lost] busy mutation returns exit 2 through CLI', t => {
  const f = fixture(t); f.run('open', 'task'); mkdirSync(join(f.main, '.jig/worktrees.lock'));
  const script = fileURLToPath(new URL('../scripts/worktree.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'close', 'task'], { cwd: f.main, encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
});

test('[risk: raw worktree cannot be closed] adopt records the actual branch and closes through the helper', t => {
  const f = fixture(t), path = join(f.root, 'raw');
  f.git('worktree', 'add', '-b', 'actual-branch', path);
  assert.equal(f.run('adopt', 'task', path).branch, 'actual-branch');
  assert.throws(() => f.run('adopt', 'duplicate', path), /unregistered/);
  f.run('close', 'task'); assert.equal(existsSync(path), false);
  assert.equal(f.git('branch', '--list', 'actual-branch'), '');
});

test('[risk: integration branch deleted] configured and explicit integration branches stay protected after adoption attempts', t => {
  const f = fixture(t), path = join(f.root, 'integration');
  f.git('worktree', 'add', '-b', 'integration', path); f.config({ integrationBranch: 'integration' });
  assert.throws(() => f.run('adopt', 'task', path), /unprotected/);
  f.config({}); f.run('adopt', 'task', path); f.config({ integrationBranch: 'integration' });
  assert.throws(() => f.run('close', 'task', '--into', 'integration', '--force', '--reason', 'test'), /protected/);
  assert.equal(existsSync(path), true);
});

test('[risk: backstop silently missing] doctor reports missing and configured project hooks and Codex rules', t => {
  const f = fixture(t); mkdirSync(join(f.main, '.claude')); mkdirSync(join(f.main, '.codex/rules'), { recursive: true });
  assert.deepEqual(f.run('doctor').backstops.map(row => row.installed), [false, false]);
  const hook = join(f.main, 'block-raw-worktree-remove.mjs'); writeFileSync(hook, '// fixture');
  writeFileSync(join(f.main, '.claude/settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell|CMD', hooks: [{ type: 'command', command: `node "${hook}"` }] }] } }));
  const rules = readFileSync(new URL('../scripts/hooks/jig-safe-close.rules', import.meta.url));
  writeFileSync(join(f.main, '.codex/rules/jig-safe-close.rules'), rules);
  assert.deepEqual(f.run('doctor').backstops.map(row => row.installed), [true, true]);
  writeFileSync(join(f.main, '.codex/rules/jig-safe-close.rules'), rules.toString().split('\n').map(line => '# ' + line).join('\n'));
  assert.equal(f.run('doctor').backstops[1].installed, false);
  writeFileSync(join(f.main, '.claude/settings.local.json'), JSON.stringify({ disableAllHooks: true }));
  assert.equal(f.run('doctor').backstops[0].installed, false);
});

test('[risk: hook wiring never executes] actual hook CLI blocks with exit 2 and lets helper run', t => {
  const f = fixture(t); const hook = fileURLToPath(new URL('../scripts/hooks/block-raw-worktree-remove.mjs', import.meta.url));
  const invoke = command => spawnSync(process.execPath, [hook], { cwd: f.main, input: JSON.stringify({ cwd: f.main, tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
  const blocked = invoke('git -C repo worktree remove --force task');
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /worktree.mjs close/);
  assert.equal(blocked.stderr.trim().split('\n').length, 1);
  assert.equal(invoke('node scripts/worktree.mjs close task').status, 0);
  const custom = join(f.root, 'custom trees'); f.config({ root: custom }); f.run('open', 'task');
  assert.equal(invoke(`Remove-Item -Recurse "${join(custom, 'task')}"`).status, 2);
});

test('[risk: tracked configuration blocks cleanup] tracked jig files need no consumption and import includes them', t => {
  const f = fixture(t); mkdirSync(join(f.main, '.jig'), { recursive: true });
  writeFileSync(join(f.main, '.jig/verify.json'), '{"tests":{}}');
  f.git('add', '-f', '.jig/verify.json'); f.git('commit', '-qm', 'tracked config');
  const first = f.run('open', 'first'); f.run('close', 'first'); assert.equal(existsSync(first.path), false);
  f.run('open', 'second'); const dest = join(f.root, 'imports');
  f.run('close', 'second', '--import', dest);
  assert.equal(readFileSync(join(dest, 'second/.jig/verify.json'), 'utf8'), '{"tests":{}}');
});

test('[risk: consumption creates untracked dirtiness] generated receipt permits close in projects with selective ignores', t => {
  const f = fixture(t); writeFileSync(join(f.main, '.gitignore'), '/.jig/worktrees*\n/.jig/private\n');
  f.git('add', '.gitignore'); f.git('commit', '-qm', 'selective ignores');
  const tree = f.run('open', 'task'); f.put(tree, '.jig/private');
  f.run('consume', 'task', '.jig/private');
  assert.equal(f.run('list').worktrees.find(row => row.name === 'task').dirty, false);
  f.run('close', 'task'); assert.equal(existsSync(tree.path), false);
});

test('[risk: arbitrary branch used as merge proof] --into accepts only the integration or main branch', t => {
  const f = fixture(t); f.git('branch', 'other'); f.run('open', 'task');
  assert.throws(() => f.run('close', 'task', '--into', 'other'), /--into must be the configured integrationBranch or the main branch/);
  assert.throws(() => f.run('close', 'task', '--into', 'task'), /--into must be/);
  assert.equal(f.run('close', 'task', '--into', 'main').into, 'main');
});

test('[risk: receipt lost on failed removal] consumed receipt survives a failed git worktree remove', t => {
  const f = fixture(t), tree = f.run('open', 'task');
  f.put(tree, '.jig/notes'); f.run('consume', 'task', '.jig/notes');
  const receipt = join(tree.path, '.jig/consumed.json'), before = readFileSync(receipt, 'utf8');
  assert.throws(() => f.runHooked('close', 'task'), /lock/i);
  assert.equal(readFileSync(receipt, 'utf8'), before);
  f.git('worktree', 'unlock', tree.path); f.run('close', 'task'); assert.equal(existsSync(tree.path), false);
});
