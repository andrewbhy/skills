import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { assertRepoWrite, docsPath, isDetached, projectRootOf, stateDir, statePath, usingStore } from '../scripts/jig-store.mjs';
import { buildCopy, loadConfig, writeTree } from '../scripts/export-public.mjs';
import { workingTree } from './helpers/export-fixture.mjs';

const tmp = (t, prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function workRepo(t, name = 'work-app') {
  const parent = tmp(t, 'jig-work-');
  const repo = join(parent, name);
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'README.md'), 'work repo\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}
const register = (home, name, value) => { mkdirSync(home, { recursive: true }); const file = join(home, 'projects.json'); const map = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; map[name] = value; writeFileSync(file, JSON.stringify(map)); };

test('[risk: legacy .jig in a work repo hijacks state] a detached project ignores the repo .jig and resolves to the store', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  mkdirSync(join(repo, '.jig')); writeFileSync(join(repo, '.jig', 'x.json'), '{}');
  assert.equal(isDetached(repo, { home }), true);
  assert.equal(stateDir(repo, { home }), join(home, basename(repo)));
  assert.equal(statePath(repo, 'telemetry.jsonl', { home }), join(home, basename(repo), 'telemetry.jsonl'));
  assert.equal(usingStore(repo, { home }), true);
});

test('[risk: own projects change behaviour] a registered project keeps the repo .jig fallback; { mode: detached } opts out', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  mkdirSync(join(repo, '.jig')); writeFileSync(join(repo, '.jig', 'x.json'), '{}');
  register(home, 'mine', repo);
  assert.equal(isDetached(repo, { home }), false);
  assert.equal(stateDir(repo, { home }), join(repo, '.jig'));
  register(home, 'mine', { path: repo, mode: 'own' });
  assert.equal(isDetached(repo, { home }), false);
  register(home, 'mine', { path: repo, mode: 'detached' });
  assert.equal(isDetached(repo, { home }), true);
  assert.equal(stateDir(repo, { home }), join(home, 'mine'));
});

test('[risk: a linked worktree of a work repo reaches its main .jig] detached state ignores the main checkout .jig as well', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  mkdirSync(join(repo, '.jig')); writeFileSync(join(repo, '.jig', 'x.json'), '{}');
  const tree = join(tmp(t, 'jig-tree-'), 'task');
  git(repo, 'worktree', 'add', '-q', '-b', 'task', tree);
  assert.equal(stateDir(tree, { home }), join(home, basename(repo)));
});

test('[risk: project documents land in a work repo] docsPath maps docs/ into the store for detached projects only', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  assert.equal(docsPath(repo, 'docs/missed-problems.jsonl', { home }), join(home, basename(repo), 'missed-problems.jsonl'));
  assert.equal(docsPath(repo, 'docs/design/feedback.json', { home }), join(home, basename(repo), 'design', 'feedback.json'));
  register(home, 'mine', repo);
  assert.equal(docsPath(repo, 'docs/missed-problems.jsonl', { home }), join(repo, 'docs', 'missed-problems.jsonl'));
});

test('[risk: a script writes into a work repo] assertRepoWrite exits 2 naming --in-repo unless allowed or own', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  assert.throws(() => assertRepoWrite(repo, { home, what: 'plan export' }), (e) => e.exitCode === 2 && /--in-repo/.test(e.message));
  assertRepoWrite(repo, { home, inRepo: true });
  register(home, 'mine', repo);
  assertRepoWrite(repo, { home });
});

test('[risk: project root taken from the script folder] the project is the git root above the current folder, or JIG_PROJECT_ROOT', t => {
  const repo = workRepo(t);
  mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
  assert.equal(projectRootOf(join(repo, 'src', 'deep'), {}), repo);
  assert.equal(projectRootOf(repo, { JIG_PROJECT_ROOT: tmpdir() }), tmpdir());
});

// A copy of the plugin without .git, as the plugin cache holds it.
function pluginCache(t) {
  const tree = workingTree();
  if (!tree) return null;
  const config = loadConfig(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const { files } = buildCopy(tree, config, { version: '0.1.0', year: '2026' });
  const dir = join(tmp(t, 'jig-cache-'), '0.1.0');
  writeTree(dir, files);
  return dir;
}
// The scripts run as they do for a person: outside a test run, with only JIG_HOME pointing at a temp store.
function cleanEnv(home, extra) {
  const env = { ...process.env, JIG_HOME: home, JIG_SIGNALS_HOME: join(home, 'signals-home'), ...extra };
  for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key === 'JIG_SIGNALS_PROJECT' || key === 'JIG_REVIEW_DIR') delete env[key];
  return env;
}
const node = (cwd, home, script, args, extra = {}) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: cleanEnv(home, extra) });

test('[risk: tower state keyed by the plugin folder] review.mjs run from a plugin cache keys state by the current project, not by the cache version folder', t => {
  const cache = pluginCache(t);
  if (!cache) return t.skip('not a git checkout');
  const repo = workRepo(t, 'work-app'), home = tmp(t, 'jig-home-');
  const r = node(repo, home, join(cache, 'scripts', 'review.mjs'), ['list']);
  assert.match(r.stdout + r.stderr, /No review config at/);
  assert.ok((r.stdout + r.stderr).includes(join(home, 'work-app', 'review-roots.json')), r.stdout + r.stderr);
  assert.equal(existsSync(join(home, '0.1.0')), false);
});

test('[risk: work repo dirtied] telemetry, plan check, signals, review add and worktree list leave git status empty and write only under JIG_HOME', t => {
  const cache = pluginCache(t);
  if (!cache) return t.skip('not a git checkout');
  const repo = workRepo(t), home = tmp(t, 'jig-home-'), outside = tmp(t, 'jig-review-');
  const snapshot = () => readdirSync(repo, { recursive: true }).filter((n) => !/^\.git([\\/]|$)/.test(n)).sort().join(',');
  const before = snapshot();
  const cacheBefore = readdirSync(cache, { recursive: true }).sort();
  const name = basename(repo);
  const helper = (skill, file) => join(cache, 'skills', skill, file);

  const start = node(repo, home, helper('jig-spike', 'telemetry.mjs'), ['start', repo, 'claude']);
  assert.equal(start.status, 0, start.stderr);
  const runId = start.stdout.trim();
  assert.equal(node(repo, home, helper('jig-spike', 'telemetry.mjs'), ['end', repo, 'claude', runId, 'passed']).status, 0);

  const plan = join(outside, 'plan.md');
  writeFileSync(plan, readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url)));
  const check = node(repo, home, helper('jig-plan', 'brief-check.mjs'), ['--workspace', repo, plan]);
  assert.ok([0, 1].includes(check.status), check.stderr);

  const signal = JSON.stringify({ project: name, level: 'project', kind: 'confusion', area: 'skills', item: 'work-mode-test', caughtBy: 'person', what: 'scratch signal' });
  const added = node(repo, home, helper('jig-correct', 'signals.mjs'), ['add', signal]);
  assert.equal(added.status, 0, added.stderr);
  const missed = node(repo, home, helper('jig-correct', 'missed-problems.mjs'), ['--area', 'skills']);
  assert.equal(typeof missed.status, 'number', 'the read-only history lookup ran (it warns that no history exists)');

  mkdirSync(join(home, name), { recursive: true });
  writeFileSync(join(home, name, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'runs', path: outside }] }));
  const page = join(outside, 'report.md');
  writeFileSync(page, '# Report\n');
  const review = node(repo, home, join(cache, 'scripts', 'review.mjs'), ['add', page, '--title', 'Scratch report']);
  assert.equal(review.status, 0, review.stdout + review.stderr);

  const listed = node(repo, home, helper('jig-worktree', 'worktree.mjs'), ['list']);
  assert.equal(listed.status, 0, listed.stderr);

  assert.equal(git(repo, 'status', '--porcelain').trim(), '', 'git status is empty');
  assert.equal(snapshot(), before, 'no file appeared in the repo');
  const stored = readdirSync(join(home, name));
  assert.ok(stored.includes('telemetry.jsonl'), stored.join(','));
  assert.ok(stored.includes('signals.jsonl'), stored.join(','));
  assert.deepEqual(readdirSync(cache, { recursive: true }).sort(), cacheBefore, 'nothing written in the plugin folder');
});

test('[risk: receipt shows in git status] consuming a private file in a jig worktree keeps git status empty', t => {
  const repo = workRepo(t), home = tmp(t, 'jig-home-');
  const script = new URL('../scripts/worktree.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const opened = node(repo, home, script, ['open', 'task']);
  if (opened.status !== 0) return t.skip(`worktree open unavailable here: ${opened.stderr.trim().slice(0, 120)}`);
  const list = JSON.parse(node(repo, home, script, ['list']).stdout);
  const tree = list.worktrees.find((w) => w.name === 'task')?.path;
  assert.ok(tree, 'worktree path');
  mkdirSync(join(tree, '.jig'), { recursive: true });
  writeFileSync(join(tree, '.jig', 'note.txt'), 'private\n');
  const consumed = node(repo, home, script, ['consume', 'task', '.jig/note.txt']);
  assert.equal(consumed.status, 0, consumed.stderr + consumed.stdout);
  rmSync(join(tree, '.jig', 'note.txt'));
  assert.equal(git(tree, 'status', '--porcelain').trim(), '', 'only the excluded receipt remains');
  assert.ok(existsSync(join(tree, '.jig', 'consumed.json')));
});

test('[risk: skills write plans into a work repo] the planning, correction, verification, spike and interaction skills carry the work-mode rule', () => {
  for (const name of ['jig-plan', 'jig-correct', 'jig-verify', 'jig-spike', 'jig-interaction']) {
    const text = readFileSync(new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(text, /Work mode: in a project that is not one of the person's own registered projects/, name);
    assert.match(text, /never into the repository/, name);
  }
});
