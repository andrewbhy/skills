if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-typescript/jig-store.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// The personal jig store: every piece of personal jig state lives behind this module.
// Default root ~/.jig (override with JIG_HOME), one folder per project, projects.json maps names to repo paths.
// A dedicated store (a database, a sync service) can replace this file's functions without touching callers.
// Work mode: a project is detached unless it is registered in projects.json as one of the person's own (a plain path, or
// { "path": ..., "mode": "own" }). Detached state uses the store, except for the denied-write fallback below.
// Own projects stay backward compatible: until one has state in the store, its repo's own .jig/ folder is used.
// Dependency-free; copied next to each skill by sync-skills.
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, lstatSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const insensitive = process.platform !== 'linux';
const importCommand = repo => `node "${fileURLToPath(import.meta.url)}" import "${resolve(repo)}"`;
const same = (a, b) => (insensitive ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

export const formatVersion = 1;
export function assertStoreFormat(path, { home = storeRoot() } = {}) {
  const manifest = join(home ?? dirname(resolve(path)), 'formats.json');
  const text = readText(manifest);
  if (text === null) return manifest; // existing stores are format 1
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('unknown format version'); }
  if (!data || Array.isArray(data) || data.formatVersion !== formatVersion) throw new Error('unknown format version');
  return manifest;
}
export function prepareStoreWrite(path, options) {
  const local = [...fallbackDirs].find(dir => inside(dir, path));
  if (local) options = { ...options, home: local };
  const manifest = assertStoreFormat(path, options);
  if (!(options?.home === undefined ? storeRoot() : options.home)) return;
  mkdirSync(dirname(manifest), { recursive: true });
  try { writeFileSync(manifest, JSON.stringify({ formatVersion }) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; assertStoreFormat(path, options); }
}

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
// Inside withStoreReadScope (one server request) projects.json is read once per store root: a dashboard render asks for it
// once per decision impact and item, which cost seconds. Never kept across requests, so edits show on the next one.
const storeScope = new AsyncLocalStorage();
export const withStoreReadScope = (fn) => storeScope.run(new Map(), fn);
function readProjectsMap(root) {
  try {
    const data = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
export function projectsMap(home) {
  const root = rootOf(home);
  if (!root) return {};
  const scope = storeScope.getStore();
  if (!scope) return readProjectsMap(root);
  if (!scope.has(root)) scope.set(root, readProjectsMap(root));
  return scope.get(root);
}
// A projects.json entry is a path string (own, as before) or { path, mode }, mode "own" (default) or "detached".
const entryPath = (value) => (typeof value === 'string' ? value : value && typeof value === 'object' && typeof value.path === 'string' ? value.path : null);
const entryMode = (value) => (value && typeof value === 'object' && value.mode === 'detached' ? 'detached' : 'own');
export function registerProject(name, repoPath, { home } = {}) {
  const root = rootOf(home);
  if (!root) throw new Error('No store root: set JIG_HOME.');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`Invalid project name ${JSON.stringify(name)}.`);
  const map = { ...projectsMap(root) }; storeScope.getStore()?.delete(root); map[name] = resolve(repoPath);
  writeJson(join(root, 'projects.json'), map, { home: root });
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
export const legacyEntries = (repo) => existsSync(join(repo, '.jig', '.fallback')) ? [] : entries(join(repo, '.jig')).filter((n) => !repoOwned.includes(n) && !['.fallback', '.gitignore'].includes(n));

const denied = error => ['EACCES', 'EPERM', 'EROFS'].includes(error.code);
const probes = new Map(), routes = new Map(), fallbackDirs = new Set(), notices = new Set();
const inside = (dir, path) => { const rel = relative(dir, resolve(path)); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };
function probeStore(dir) {
  const seam = process.env.NODE_TEST_CONTEXT ? process.env.JIG_STORE_DENY : '';
  const key = `${dir}:${seam}`;
  if (probes.has(key)) return probes.get(key);
  let probe;
  try {
    if (seam) throw Object.assign(new Error('Store probe denied'), { code: seam });
    mkdirSync(dir, { recursive: true });
    // Remove only old probes whose owning process no longer exists.
    for (const name of entries(dir)) {
      const match = /^\.probe-(\d+)-[a-f0-9-]+$/.exec(name);
      if (!match) continue;
      try { process.kill(Number(match[1]), 0); } catch (error) {
        if (error.code === 'ESRCH' && Date.now() - lstatSync(join(dir, name)).mtimeMs > 86400000) unlinkSync(join(dir, name));
      }
    }
    probe = join(dir, `.probe-${process.pid}-${randomUUID()}`);
    writeFileSync(probe, '', { flag: 'wx', mode: 0o600 });
    unlinkSync(probe); probe = null;
    probes.set(key, null); return null;
  } catch (error) {
    if (!denied(error)) throw error;
    probes.set(key, error.code); return error.code;
  } finally { if (probe && existsSync(probe)) unlinkSync(probe); }
}
function atomicLocal(path, text) {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  atomicWriteFile(path, text, { mode: 0o600, temp: tmp });
}
function fallbackDir(repo, code, home) {
  const dir = join(resolve(repo), '.jig');
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('Refusing symlinked .jig');
  const tracked = spawnSync('git', ['-C', resolve(repo), 'ls-files', '-z', '--', '.jig'], { encoding: 'utf8', windowsHide: true });
  if (tracked.status !== 0 || tracked.stdout) throw new Error('Fallback requires an untracked .jig in a Git repository');
  mkdirSync(dir, { recursive: true });
  for (const name of ['.fallback', '.gitignore']) if (existsSync(join(dir, name)) && lstatSync(join(dir, name)).isSymbolicLink()) throw new Error(`Refusing symlink ${name}`);
  // Finish both metadata writes before exposing a path to a record writer.
  atomicLocal(join(dir, '.gitignore'), '*\n');
  atomicLocal(join(dir, '.fallback'), '1\n');
  fallbackDirs.add(dir);
  if (!notices.has(dir)) {
    console.error(`store not writable (${code}); recording in ${dir}${isDetached(repo, { home }) ? '; repository is in work mode' : ''}; later run: ${importCommand(repo)}`);
    notices.add(dir);
  }
  return dir;
}
export function waitingRecords(repo) {
  const dir = join(resolve(repo), '.jig');
  if (!existsSync(dir) || lstatSync(dir).isSymbolicLink() || !existsSync(join(dir, '.fallback'))) return null;
  if (!entries(dir).some(name => !['.fallback', '.gitignore', 'formats.json'].includes(name))) return null;
  return `records waiting in ${dir}; run: ${importCommand(repo)}`;
}

// The folder holding a repo's personal state: the store folder once it has state or the repo has none, else the repo's own .jig/.
export function stateDir(repo, { home } = {}) {
  const main = mainCheckout(repo);
  const root = rootOf(home);
  const legacy = join(resolve(repo), '.jig');
  if (!root) return legacy;
  const dir = join(root, projectName(main, { home: root }));
  routes.set(dir, { repo: resolve(repo), home: root });
  const failure = probeStore(dir);
  if (failure) return fallbackDir(repo, failure, root);
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
export function writeText(path, text, options) {
  return guardedWrite(path, options, path => {
    prepareStoreWrite(path, options);
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteFile(path, text);
  });
}
export const writeJson = (path, data, options) => writeText(path, JSON.stringify(data, null, 2) + '\n', options);
export function appendLine(path, line, options) {
  return guardedWrite(path, options, destination => {
    prepareStoreWrite(destination, options);
    mkdirSync(dirname(destination), { recursive: true });
    appendFileSync(destination, String(line).replace(/\n+$/, '') + '\n');
  });
}
function guardedWrite(path, options, write) {
  try { return write(path); } catch (error) {
    const route = [...routes].find(([dir]) => inside(dir, path));
    if (!denied(error) || !route || options?.importing) throw error;
    const [dir, context] = route;
    const local = fallbackDir(context.repo, error.code, context.home);
    // All later reads and writes in this process follow the failed real write.
    const seam = process.env.NODE_TEST_CONTEXT ? process.env.JIG_STORE_DENY : '';
    probes.set(`${dir}:${seam}`, error.code);
    return write(join(local, relative(dir, path)));
  }
}
export const readLines = (path) => { const t = readText(path, ''); return t.split('\n').filter(Boolean); };
export const list = (dir) => entries(dir);
export const exists = (path) => existsSync(path);

// Convenience: the same calls addressed by repo and relative name.
export const readRepoJson = (repo, rel, fallback = null, options) => readJson(statePath(repo, rel, options), fallback);
export const writeRepoJson = (repo, rel, data, options) => writeJson(statePath(repo, rel, options), data, options);
export const appendRepoLine = (repo, rel, line, options) => appendLine(statePath(repo, rel, options), line, options);

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
  writeJson(file, data, { home });
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
  prepareStoreWrite(join(dir, name), { home });
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

// ---------- atomic write ----------
// Temp file in the same folder then rename. On Windows another process holding the target open makes the rename
// fail transiently (EPERM/EBUSY/EACCES), so retry a bounded number of times; other errors are never retried.
export const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const sleepMs = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best effort */ } };

export function renameWithRetry(from, to, { rename = renameSync, attempts = 10, delayMs = 100, sleep = sleepMs } = {}) {
  for (let i = 1; ; i++) {
    try { return rename(from, to); }
    catch (error) {
      if (!RETRY_CODES.has(error?.code) || i >= attempts) throw error;
      sleep(delayMs);
    }
  }
}

export function atomicWriteFile(path, data, { mode, temp: fixedTemp, ...retry } = {}) {
  const temp = fixedTemp ?? join(dirname(path), `${basename(path)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
  let created = false;
  try {
    writeFileSync(temp, data, { flag: 'wx', ...(mode === undefined ? {} : { mode }) });
    created = true;
    renameWithRetry(temp, path, retry);
  } finally {
    try { if (created && existsSync(temp)) unlinkSync(temp); } catch { /* keep the original error */ }
  }
}

// Only shared records and explicitly named personal state are eligible. Repo configuration never moves.
const importNames = new Set(['telemetry.jsonl', 'signals.jsonl', 'missed-problems.jsonl', 'decisions.jsonl',
  'seen.json', 'undo.json', 'oq-answers.json', 'queue.json', 'worktrees.json', 'worktree-claims.json']);
const importAllowed = rel => importNames.has(rel) || /^verify-receipts\/[a-f0-9]{7,40}\.(?:json|log)$/.test(rel);
function decoded(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    if (bytes.length % 2) throw new Error('Invalid UTF-16');
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  }
  if (bytes.length >= 2 && bytes[1] === 0 && bytes[0] !== 0) {
    if (bytes.length % 2) throw new Error('Invalid UTF-16');
    return bytes.toString('utf16le');
  }
  if (bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0) {
    if (bytes.length % 2) throw new Error('Invalid UTF-16');
    return Buffer.from(bytes).swap16().toString('utf16le');
  }
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}
function validateRecord(text, rel) {
  if (text.includes('\uFFFD')) throw new Error('Invalid encoding');
  if (rel.endsWith('.jsonl')) { for (const line of text.split(/\r?\n/).filter(line => line.trim())) JSON.parse(line); }
  else JSON.parse(text);
}
export function importRecords(repo, { home = storeRoot(), dryRun = false, out = console.log } = {}) {
  if (!home) throw new Error('No store root: set JIG_HOME.');
  repo = resolve(repo); home = resolve(home);
  const source = join(repo, '.jig'), target = join(home, projectName(repo, { home }));
  const kept = [], moved = [];
  if (!existsSync(source)) return { kept, moved, exitCode: 0 };
  if (lstatSync(source).isSymbolicLink()) return { kept: ['.jig: symlink refused'], moved, exitCode: 1 };
  if (existsSync(join(source, 'formats.json')) && lstatSync(join(source, 'formats.json')).isSymbolicLink()) return { kept: ['formats.json: symlink refused'], moved, exitCode: 1 };
  assertStoreFormat(source, { home: source });
  const trackedResult = spawnSync('git', ['-C', repo, 'ls-files', '-z', '--', '.jig'], { encoding: 'utf8', windowsHide: true });
  if (trackedResult.status !== 0) throw new Error('Cannot inspect tracked files');
  const tracked = new Set(trackedResult.stdout.split('\0').filter(Boolean));
  const files = [];
  function walk(dir, prefix = '') {
    for (const name of entries(dir)) {
      const rel = prefix + name, path = join(dir, name);
      if (name.toLowerCase() === 'private') { kept.push(`${rel}: private path refused`); continue; }
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) { kept.push(`${rel}: symlink refused`); continue; }
      if (stat.isDirectory()) {
        if (rel === 'verify-receipts') walk(path, rel + '/');
        else kept.push(`${rel}: not an allowlisted record folder`);
        continue;
      }
      if (['.fallback', '.gitignore', 'formats.json'].includes(rel)) {
        if (tracked.has(`.jig/${rel}`)) kept.push(`${rel}: tracked file`);
        continue;
      }
      files.push({ rel, path, stat });
    }
  }
  walk(source);
  let locked = false;
  const lock = join(home, '.store-import.lock');
  try {
    if (!dryRun) {
      for (let dir = target; ; dir = dirname(dir)) {
        if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('symlink in store path');
        if (dirname(dir) === dir) break;
      }
      prepareStoreWrite(join(target, 'telemetry.jsonl'), { home });
      mkdirSync(lock); locked = true;
    }
    for (const { rel, path, stat } of files) {
      try {
        if (tracked.has(`.jig/${rel}`) || repoOwned.includes(rel) || !importAllowed(rel)) throw new Error('not an allowlisted personal record');
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('not a regular file or exceeds 8 MB');
        const original = readFileSync(path), text = decoded(original);
        validateRecord(text, rel);
        const dest = join(target, rel);
        for (let dir = dest; inside(home, dir); dir = dirname(dir)) {
          if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('symlink in store path');
          if (same(dir, home)) break;
        }
        const existing = readText(dest);
        let expected = text, addition = '';
        if (rel.endsWith('.jsonl')) {
          const normalized = text.split(/\r?\n/).filter(line => line.trim()).join('\n');
          const payload = normalized ? normalized + '\n' : '';
          if (existing !== null) validateRecord(existing, rel);
          const already = existing !== null && (existing === payload || existing.endsWith('\n' + payload));
          addition = already ? '' : (existing && !existing.endsWith('\n') ? '\n' : '') + payload;
          expected = (existing ?? '') + addition;
        } else if (existing !== null && existing !== text) throw new Error('store JSON already exists with different contents');
        if (dryRun) { out(`would import ${rel}`); continue; }
        if (rel.endsWith('.jsonl')) {
          if (addition) appendLine(dest, addition, { home, importing: true });
          else if (existing === null) writeText(dest, '', { home, importing: true });
        } else if (existing === null) writeText(dest, text, { home, importing: true });
        if (readFileSync(dest, 'utf8') !== expected) throw new Error('store read-back differs');
        if (lstatSync(path).isSymbolicLink() || !readFileSync(path).equals(original)) throw new Error('source changed during import');
        unlinkSync(path);
        moved.push(rel); out(`imported ${rel}`);
      } catch (error) { kept.push(`${rel}: ${error.message}`); }
    }
    if (!dryRun && !kept.length) {
      // Remove empty subfolders, then metadata, only after all records have moved.
      function prune(dir) { for (const name of entries(dir)) { const path = join(dir, name); if (lstatSync(path).isDirectory()) { prune(path); if (!entries(path).length) rmdirSync(path); } } }
      prune(source);
      if (entries(source).every(name => ['.fallback', '.gitignore', 'formats.json'].includes(name))) {
        for (const name of entries(source)) unlinkSync(join(source, name));
        rmdirSync(source);
      }
    }
  } catch (error) {
    for (const { rel } of files) if (!moved.includes(rel) && !kept.some(name => name.startsWith(`${rel}:`))) kept.push(`${rel}: ${error.message}`);
    if (!files.length) kept.push(`.jig: ${error.message}`);
  } finally { if (locked) rmdirSync(lock); }
  for (const name of kept) out(`kept ${name}`);
  return { kept, moved, exitCode: kept.length ? 1 : 0 };
}
export function runStore(argv, options) {
  const [command, repo, ...flags] = argv;
  if (command !== 'import' || !repo || repo.startsWith('--') || flags.some(flag => flag !== '--dry-run') || flags.length > 1) {
    throw Object.assign(new Error('Usage: node scripts/jig-store.mjs import <repo> [--dry-run]'), { exitCode: 2 });
  }
  return importRecords(repo, { ...options, dryRun: flags.includes('--dry-run') }).exitCode;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = runStore(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
