import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { shouldBlock } from '../scripts/hooks/block-raw-worktree-remove.mjs';

const root = resolve(tmpdir(), 'jig worktree root');
const cwd = resolve(tmpdir(), 'jig main');
const task = join(root, 'task');
const context = { cwd, root, trees: [task] };

test('[risk: raw Git removal bypasses backstop] bash PowerShell and cmd destructive forms are blocked', () => {
  const blocked = [
    'git worktree remove task', 'git worktree remove --force task', 'git worktree remove -f task',
    'git -C "repo with spaces" worktree remove --force task', 'git -c core.autocrlf=false -C repo worktree remove task',
    'git --git-dir=repo/.git worktree remove task', 'git --work-tree repo worktree remove task',
    'git.exe worktree remove task', '"git" "worktree" "remove" task',
    'git branch -D task', 'git -C repo branch -D task', 'git branch --delete --force task',
    'git branch --force --delete task', 'git branch -d -f task', 'git branch -fd task', 'git branch -fD task',
    'bash -lc "git -C repo worktree remove --force task"',
    "powershell -NoProfile -Command 'git -C repo worktree remove --force task'",
    'cmd /c "git worktree remove /tmp/task"', '& git worktree remove task',
    'cmd /d /s /c "git -C "repo with spaces" worktree remove --force task"',
    'node scripts/worktree.mjs close task; git worktree remove other',
    'git worktree list && git branch -D task', 'git worktree list\ngit branch -D task',
    'gi`t worktree remove task', '/usr/bin/git worktree remove task'
  ];
  for (const command of blocked) assert.equal(shouldBlock(command, context), true, command);
});

test('[risk: filesystem removal bypasses backstop] recursive bash PowerShell and cmd forms inside root are blocked', () => {
  const blocked = [
    `rm -rf "${task}"`, `rm -fr "${task}"`, `rm -r -f -- "${task}"`,
    `rm --recursive --force "${task}"`, `Remove-Item -Recurse -Force -LiteralPath "${task}"`,
    `Remove-Item "${task}" -Recurse`, `REMOVE-ITEM -RECURSE "${task}"`,
    `rmdir /s /q "${task}"`, `rd /s "${task}"`, `cmd /c 'rmdir /s /q "${task}"'`,
    `cmd /d /s /c "rmdir /s /q "${task}""`,
    `bash -c 'rm -rf "${task}"'`, `pwsh -Command 'Remove-Item -Recurse "${task}"'`,
    `rm -rf "${root}"`, `rm -rf "${join(root, '..')}"`, 'rm -rf "$TASK"', 'Remove-Item -Recurse $tree'
  ];
  for (const command of blocked) assert.equal(shouldBlock(command, context), true, command);
});

test('[risk: backstop disrupts safe commands] safe Git queries deletes and close helper remain allowed', () => {
  const allowed = [
    'git branch -d task', 'git -C repo branch --delete task', 'git worktree list',
    'git -C repo worktree list --porcelain', 'node scripts/worktree.mjs close task',
    'node ".agents/skills/jig-worktree/worktree.mjs" close task --force --reason "authorized"',
    `rm -rf "${resolve(tmpdir(), 'unrelated-scratch')}"`, `Remove-Item -Recurse "${resolve(tmpdir(), 'unrelated-scratch')}"`,
    `rmdir /s /q "${resolve(tmpdir(), 'unrelated-scratch')}"`, `rm "${task}"`,
    'echo "git worktree remove task"', 'git branch --list', 'git worktree prune --dry-run'
  ];
  for (const command of allowed) assert.equal(shouldBlock(command, context), false, command);
});

test('[risk: Codex artifact misses forbidden forms] shipped rules have forbidden prefixes and executable examples', () => {
  const rules = readFileSync(new URL('../scripts/hooks/jig-safe-close.rules', import.meta.url), 'utf8');
  const lines = rules.split('\n').filter(line => line.startsWith('prefix_rule('));
  assert.equal(lines.length, 4);
  for (const line of lines) {
    const prefix = JSON.parse(line.match(/pattern = (\[[^\]]+\])/)[1]);
    const matches = JSON.parse(line.match(/match = (\[[^\]]+\])/)[1]);
    assert.ok(line.includes('decision = "forbidden"'));
    for (const command of matches) assert.equal(command.split(' ').slice(0, prefix.length).join(' '), prefix.join(' '));
  }
});

test('[risk: backstop blocks routine work] deletes inside a worktree that are not the root stay allowed', () => {
  const inside = { cwd: task, root, trees: [task] };
  for (const command of ['rm -rf node_modules', 'rm -rf dist', 'git rm -r src', 'Remove-Item -Recurse -Force dist', 'rm -rf src/generated', 'Remove-Item -Force foo.txt', 'Remove-Item -Force -LiteralPath foo.txt', 'rm -f foo.txt'])
    assert.equal(shouldBlock(command, inside), false, command);
  for (const command of [`rm -rf "${task}"`, `Remove-Item -Recurse -Force "${task}"`, `Remove-Item -Rec "${task}"`, `rm -R "${task}"`, 'rm -rf .', 'rm -rf ..', `rm -rf "${root}"`])
    assert.equal(shouldBlock(command, inside), true, command);
});

test('[risk: recursive flag misread] recursive spellings match exactly and -Force is not recursive', () => {
  for (const flag of ['-r', '-R', '-rf', '-fr', '-Rf', '--recursive']) assert.equal(shouldBlock(`rm ${flag} "${task}"`, context), true, flag);
  for (const flag of ['-r', '-Rec', '-Recu', '-Recur', '-Recurs', '-Recurse', '-recurse']) assert.equal(shouldBlock(`Remove-Item ${flag} "${task}"`, context), true, flag);
  for (const flag of ['-Force', '-f', '-force']) assert.equal(shouldBlock(`Remove-Item ${flag} "${task}"`, context), false, flag);
  assert.equal(shouldBlock('Remove-Item -Force foo.txt', context), false);
});

test('[risk: context errors block every command] ordinary commands pass without repository context; delete candidates fail closed', t => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'jig-hook-outside-'))); t.after(() => rmSync(outside, { recursive: true, force: true }));
  const hook = fileURLToPath(new URL('../scripts/hooks/block-raw-worktree-remove.mjs', import.meta.url));
  const invoke = (dir, command) => spawnSync(process.execPath, [hook], { cwd: dir, input: JSON.stringify({ cwd: dir, tool_input: { command } }), encoding: 'utf8' });
  for (const command of ['ls -la', 'npm test', 'git status', 'rm foo.txt']) assert.equal(invoke(outside, command).status, 0, command);
  assert.equal(invoke(outside, 'git worktree remove x').status, 2);
  const bad = invoke(outside, 'rm -rf build');
  assert.equal(bad.status, 2); assert.match(bad.stderr, /worktree\.mjs close/);
  // Malformed project config must not matter to ordinary commands or direct Git removals.
  spawnSync('git', ['init', '-q'], { cwd: outside });
  mkdirSync(join(outside, '.jig')); writeFileSync(join(outside, '.jig/worktree.json'), '{bad');
  assert.equal(invoke(outside, 'ls').status, 0);
  assert.equal(invoke(outside, 'git worktree remove x').status, 2);
});
