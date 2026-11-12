// The personal jig store: every piece of personal jig state lives behind this module.
// Default root ~/.jig (override with JIG_HOME), one folder per project, projects.json maps names to repo paths.
// A dedicated store (a database, a sync service) can replace this file's functions without touching callers.
// Work mode: a project is detached unless it is registered in projects.json as one of the person's own (a plain path, or
// { "path": ..., "mode": "own" }). A detached project keeps ALL state in the store and never reads or writes <repo>/.jig.
// Own projects stay backward compatible: until one has state in the store, its repo's own .jig/ folder is used.
// Dependency-free; copied next to each skill by sync-skills.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const insensitive = process.platform !== 'linux';
const same = (a, b) => (insensitive ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

// Files that stay inside a repo because they configure that repo's own tooling, never personal state.
export const repoOwned = ['testing.json', 'review.json', 'consumed.json'];
// Project-level files that never count as "this project already moved" (they exist before any migration).
// seen.json, undo.json and oq-answers.json are written by the review dashboard before any queue state moves.
const sharedNames = new Set(['decisions.jsonl', 'seen.json', 'undo.json', 'oq-answers.json', 'tower.json']);

// Store root, or null when tests run without an explicit JIG_HOME (so a suite can never touch a person's store).
export function storeRoot(env = process.env) {
  if (env.JIG_HOME) return resolve(env.JIG_HOME);
  if (env.NODE_TEST_CONTEXT) return null;
  return join(homedir(), '.jig');
}
const rootOf = (home) => (home === undefined ? storeRoot() : home);

// ---------- projects ----------
export function projectsMap(home) {
  const root = rootOf(home);
  if (!root) return {};
  try {
    const data = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
// A projects.json entry is a path string (own, as before) or { path, mode }, mode "own" (default) or "detached".
const entryPath = (value) => (typeof value === 'string' ? value : value && typeof value === 'object' && typeof value.path === 'string' ? value.path : null);
const entryMode = (value) => (value && typeof value === 'object' && value.mode === 'detached' ? 'detached' : 'own');
export function registerProject(name, repoPath, { home } = {}) {
  const root = rootOf(home);
  if (!root) throw new Error('No store root: set JIG_HOME.');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`Invalid project name ${JSON.stringify(name)}.`);
  const map = projectsMap(root); map[name] = resolve(repoPath);
  writeText(join(root, 'projects.json'), JSON.stringify(map, null, 2) + '\n');
  return map;
}
// A linked worktree reports the main checkout, so one project has one folder.
export function mainCheckout(repo) {
  const dotgit = join(resolve(repo), '.git');
  try {
    if (!statSync(dotgit).isFile()) return resolve(repo);
    const m = readFileSync(dotgit, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
    const gitdir = m && m[1].replace(/\\/g, '/');
    const at = gitdir ? gitdir.indexOf('/.git/worktrees/') : -1;
    if (at > 0) return resolve(gitdir.slice(0, at));
  } catch { /* not a checkout */ }
  return resolve(repo);
}
export function projectName(repo, { home } = {}) {
  const main = mainCheckout(repo);
  for (const [name, value] of Object.entries(projectsMap(home))) { const path = entryPath(value); if (path && same(path, main)) return name; }
  return basename(main);
}
export function repoOf(project, { home } = {}) {
  const path = entryPath(projectsMap(home)[project]);
  return path ? resolve(path) : null;
}
// True when the repo is NOT registered as one of the person's own projects: personal state stays in the store, the repo is left alone.
export function isDetached(repo, { home } = {}) {
  const main = mainCheckout(repo);
  for (const value of Object.values(projectsMap(home))) { const path = entryPath(value); if (path && same(path, main)) return entryMode(value) === 'detached'; }
  return true;
}
// Writing project files (not personal state) into a repo is refused for detached projects unless the caller passed --in-repo.
export function assertRepoWrite(repo, { inRepo = false, what = 'this command', home } = {}) {
  if (inRepo || !isDetached(repo, { home })) return;
  throw Object.assign(new Error(`${what} would write into ${resolve(repo)}, which is not one of your registered projects; pass --in-repo to allow it.`), { exitCode: 2 });
}
// The repo root a script should treat as "the project": an explicit JIG_PROJECT_ROOT, else the git root above cwd, else cwd.
export function projectRootOf(cwd = process.cwd(), env = process.env) {
  if (env.JIG_PROJECT_ROOT) return resolve(env.JIG_PROJECT_ROOT);
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(cwd);
    dir = up;
  }
}
export function listProjects({ home } = {}) {
  const root = rootOf(home);
  const names = new Set(Object.keys(projectsMap(root)));
  if (root) { try { for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) names.add(e.name); } catch { /* none */ } }
  return [...names].sort();
}

// ---------- locations ----------
export const projectDir = (project, { home } = {}) => { const root = rootOf(home); return root ? join(root, project) : null; };
const entries = (dir) => { try { return readdirSync(dir); } catch { return []; } };
const hasStoreState = (dir) => entries(dir).some((n) => !sharedNames.has(n) && !n.endsWith('.tmp'));
export const legacyEntries = (repo) => entries(join(repo, '.jig')).filter((n) => !repoOwned.includes(n));

// The folder holding a repo's personal state: the store folder once it has state or the repo has none, else the repo's own .jig/.
export function stateDir(repo, { home } = {}) {
  const main = mainCheckout(repo);
  const root = rootOf(home);
  const legacy = join(resolve(repo), '.jig');
  if (!root) return legacy;
  const dir = join(root, projectName(main, { home: root }));
  if (isDetached(repo, { home: root })) return dir; // work mode: the repo's own .jig and the main checkout's are ignored
  if (hasStoreState(dir)) return dir;
  if (legacyEntries(resolve(repo)).length) return legacy;
  // A linked worktree whose main checkout still holds repo state keeps using it, so one write cannot hide that state.
  if (!same(main, repo) && legacyEntries(main).length) return join(main, '.jig');
  return dir;
}
export const statePath = (repo, rel, options) => join(stateDir(repo, options), rel);
// Project documents jig reads and writes (docs/missed-problems.jsonl, docs/design/...): in the repo for own projects,
// under the store for detached ones (docs/ is dropped: <store>/<project>/missed-problems.jsonl, design/feedback.json, results/...).
export function docsPath(repo, rel, options) {
  const root = rootOf(options?.home);
  if (!root || !isDetached(repo, options)) return resolve(repo, rel);
  return join(stateDir(repo, options), rel.replace(/^docs\//, ''));
}
// A path recorded as '.jig/x' (old queue items) follows the state; anything else is relative to the repo.
export function resolveStateRef(repo, ref, options) {
  const m = String(ref).match(/^.jig[\/](.+)$/);
  return m ? statePath(repo, m[1], options) : resolve(repo, ref);
}
export const usingStore = (repo, options) => { const d = stateDir(repo, options); return d !== join(resolve(repo), '.jig') && d !== join(mainCheckout(repo), '.jig'); };

// ---------- read and write (the replaceable surface) ----------
export function readText(path, fallback = null) {
  try { return readFileSync(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export function readJson(path, fallback = null) {
  const text = readText(path);
  return text === null ? fallback : JSON.parse(text);
}
export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
export const writeJson = (path, data) => writeText(path, JSON.stringify(data, null, 2) + '\n');
export function appendLine(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, String(line).replace(/\n+$/, '') + '\n');
}
export const readLines = (path) => { const t = readText(path, ''); return t.split('\n').filter(Boolean); };
export const list = (dir) => entries(dir);
export const exists = (path) => existsSync(path);

// Convenience: the same calls addressed by repo and relative name.
export const readRepoJson = (repo, rel, fallback = null, options) => readJson(statePath(repo, rel, options), fallback);
export const writeRepoJson = (repo, rel, data, options) => writeJson(statePath(repo, rel, options), data);
export const appendRepoLine = (repo, rel, line, options) => appendLine(statePath(repo, rel, options), line);

// ---------- per-project decision log ----------
export const decisionsPath = (project, { home } = {}) => { const dir = projectDir(project, { home }); return dir ? join(dir, 'decisions.jsonl') : null; };

// ---------- per-project small state files (last-seen times, last undo, answers given on the dashboard) ----------
// Always in the store, never in a repo. Without a store root (tests without JIG_HOME) reads return the fallback and writes are refused.
export const projectFile = (project, name, { home } = {}) => { const dir = projectDir(project, { home }); return dir ? join(dir, name) : null; };
export function readProjectJson(project, name, fallback, { home } = {}) {
  const file = projectFile(project, name, { home });
  if (!file) return fallback;
  try { return readJson(file, fallback) ?? fallback; } catch { return fallback; }
}
export function writeProjectJson(project, name, data, { home } = {}) {
  const file = projectFile(project, name, { home });
  if (!file) throw new Error('No store root: set JIG_HOME.');
  writeJson(file, data);
}
export function updateProjectJson(project, name, fallback, change, { home } = {}) {
  const data = readProjectJson(project, name, fallback, { home });
  const next = change(data) ?? data;
  if (projectFile(project, name, { home })) writeProjectJson(project, name, next, { home });
  return next;
}

// ---------- per-project attachments (images pasted into a thread; always in the store, never in a repo) ----------
// <project dir>/attachments/<thread>/<file>. Names are checked here so a caller can never write or read outside that folder.
const attThreadOk = (t) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(t) && !t.includes('..');
const attFileOk = (f) => /^\d{10,}-\d{1,3}\.(png|jpg|webp)$/.test(f);
export function attachmentsDir(project, thread, { home } = {}) {
  const dir = projectDir(project, { home });
  if (!dir || !attThreadOk(String(thread))) return null;
  return join(dir, 'attachments', thread);
}
// Writes a new file (never overwrites): returns the absolute path, or throws without a store root.
export function writeAttachment(project, thread, name, bytes, { home } = {}) {
  const dir = attachmentsDir(project, thread, { home });
  if (!dir) throw new Error('No store root: set JIG_HOME.');
  if (!attFileOk(name)) throw new Error('Invalid attachment name.');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, bytes, { flag: 'wx' });
  return path;
}
// Absolute path of a stored attachment, or null when the names are unsafe or the file is missing.
export function attachmentPath(project, thread, name, { home } = {}) {
  const dir = attachmentsDir(project, thread, { home });
  if (!dir || !attFileOk(name)) return null;
  const path = join(dir, name);
  return existsSync(path) ? path : null;
}
