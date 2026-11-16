if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-worktree/worktree.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Canonical source; sync-skills.mjs ships this unchanged beside both branch skills.
import { execFileSync, spawnSync } from 'node:child_process';
import { atomicWriteFile } from './jig-store.mjs';
import { closeSync, openSync, copyFileSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statePath, waitingRecords } from './jig-store.mjs';
// Installed branch helpers can find the canonical identity implementation in jig.
const capabilitiesUrl = process.env.JIG_CAPABILITY_FILE ? [new URL('./review-capabilities.mjs', import.meta.url), new URL('../../../scripts/review-capabilities.mjs', import.meta.url), new URL('../../scripts/review-capabilities.mjs', import.meta.url)].find(url => existsSync(url)) : null;
const capabilities = capabilitiesUrl ? await import(capabilitiesUrl) : null;

export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return null; }
  // Platform adapters: PowerShell/CIM only on Windows; ps on macOS/POSIX.
  // An unavailable adapter refuses the operation instead of assuming a dead PID.
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? 'powershell.exe' : 'ps', windows
    ? ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object @{n='startTime';e={$_.CreationDate.ToUniversalTime().ToString('o')}},@{n='command';e={$_.CommandLine}} | ConvertTo-Json -Compress`]
    : ['-ww', '-p', String(pid), '-o', 'lstart=,command='], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const unavailable = () => {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return null; }
    throw Error(`Cannot inspect live process ${pid}; preserve its worktree and claim`);
  };
  if (result.status !== 0 || !result.stdout.trim()) return unavailable();
  if (windows) { const value = JSON.parse(result.stdout); return value?.startTime && value?.command ? value : unavailable(); }
  const line = result.stdout.trim();
  return { startTime: line.slice(0, 24), command: line.slice(24).trim() };
}
export function claimAlive(holder, inspect = processIdentity, now = Date.now()) {
  if (holder.provider === 'codex') return Number.isFinite(Date.parse(holder.heartbeatAt)) && now - Date.parse(holder.heartbeatAt) < 15 * 60 * 1000;
  const actual = inspect(holder.pid);
  return Boolean(actual && actual.startTime === holder.startTime && (!holder.command || actual.command === holder.command));
}
function callerIdentity() {
  if (!capabilities) throw Error('Worktree claims require the canonical jig review-capabilities.mjs helper');
  const who = capabilities.identity(), ancestor = capabilities.agentAncestor();
  if (!who.id || !ancestor || who.kind?.startsWith('child-of-')) return null;
  const actual = processIdentity(ancestor.pid);
  if (!actual) throw Error('Cannot inspect claim holder start time');
  return { session: who.id, provider: ancestor.provider, pid: ancestor.pid, ...actual };
}
// Read process command lines only on explicit broker commands; ordinary list and
// close without registered brokers need no CIM query. Tests inject snapshots.
export function brokerProcesses(query = spawnSync) {
  const windows = process.platform === 'win32';
  const result = query(windows ? 'powershell.exe' : 'ps', windows
    ? ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop | Select-Object @{n='pid';e={$_.ProcessId}},@{n='startTime';e={$_.CreationDate.ToUniversalTime().ToString('o')}},@{n='command';e={$_.CommandLine}} | ConvertTo-Json -Compress`]
    : ['-ww', '-axo', 'pid=,lstart=,command='], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (result.status !== 0) throw Error('Cannot inspect broker command lines; broker discovery not performed');
  if (windows) return [].concat(JSON.parse(result.stdout.trim() || '[]'));
  return result.stdout.trimEnd().split('\n').filter(Boolean).map(line => {
    const match = line.match(/^\s*(\d+)\s+(.{24})\s+(.+)$/);
    if (!match) throw Error('Cannot parse broker process snapshot');
    return { pid: Number(match[1]), startTime: match[2], command: match[3] };
  });
}
function commandWords(command) {
  const words = []; let word = '', quote = null;
  for (const char of command) {
    if (quote) { if (char === quote) quote = null; else word += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) { if (word) { words.push(word); word = ''; } }
    else word += char;
  }
  if (quote) return []; if (word) words.push(word); return words;
}
export function brokerCwd(command) {
  if (typeof command !== 'string') return null;
  const words = commandWords(command), filename = path => path?.split(/[\\/]/).at(-1).toLowerCase();
  const script = filename(words[0]) === 'app-server-broker.mjs' ? 0 : /^(?:node|node\.exe)$/.test(filename(words[0]) ?? '') ? 1 : -1;
  if (script < 0 || filename(words[script]) !== 'app-server-broker.mjs' || words[script + 1] !== 'serve') return null;
  const folders = [];
  for (let i = script + 2; i < words.length; i++) {
    if (words[i] === '--cwd') folders.push(words[++i]);
    else if (words[i].startsWith('--cwd=')) folders.push(words[i].slice(6));
  }
  if (folders.length !== 1 || typeof folders[0] !== 'string' || !isAbsolute(folders[0]) || folders[0].split(/[\\/]/).some(part => part.toLowerCase() === 'private')) return null;
  return resolve(folders[0]);
}
const sameFolder = (a, b) => typeof a === 'string' && typeof b === 'string' && (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
export function discoverBrokers(root, registered, { snapshot = brokerProcesses, inspect = processIdentity } = {}) {
  const records = [];
  for (const row of snapshot()) {
    if (!Number.isSafeInteger(row?.pid) || row.pid < 1 || typeof row.startTime !== 'string' || !row.startTime || typeof row.command !== 'string') continue;
    const cwd = brokerCwd(row.command), worktree = registered.find(item => sameFolder(item.path, cwd));
    if (!worktree) continue;
    const actual = inspect(row.pid);
    if (!actual || actual.startTime !== row.startTime || actual.command !== row.command) continue;
    records.push({ name: worktree.name, worktree: worktree.path, pid: row.pid, startTime: row.startTime, command: row.command });
  }
  const path = statePath(root, 'worktree-brokers.json'); mkdirSync(dirname(path), { recursive: true });
  let fd; try { fd = openSync(path + '.lock', 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw Error('Broker registry lock busy'); throw error; }
  try { atomicWriteFile(path, JSON.stringify(records, null, 2) + '\n'); }
  finally { closeSync(fd); unlinkSync(path + '.lock'); }
  return records;
}
export function withClaims(root, action) {
  const path = statePath(root, 'worktree-claims.json'), lock = path + '.lock';
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw Error('Worktree claims lock busy'); throw error; }
  try {
    const data = readJson(path, {});
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid worktree claims');
    const result = action(data);
    atomicWriteFile(path, JSON.stringify(data, null, 2) + '\n');
    return result;
  } finally { closeSync(fd); unlinkSync(lock); }
}
export function changeClaim(data, name, command, caller, inspect = processIdentity, now = Date.now()) {
  const holder = Object.hasOwn(data, name) ? data[name] : null;
  if (command === 'heartbeat') {
    if (!holder || !caller?.session || holder.session !== caller.session) throw Error(`Heartbeat requires the same holder identity; ${name} held by ${holder?.session ?? 'nobody'}`);
    holder.heartbeatAt = new Date(now).toISOString();
    return holder;
  }
  if (holder && claimAlive(holder, inspect, now) && holder.session !== caller?.session) throw Error(`Worktree ${name} held by ${holder.provider} session ${holder.session} (pid ${holder.pid})`);
  if (command === 'claim') {
    if (!caller?.session || !['codex', 'claude'].includes(caller.provider) || !caller.startTime) throw Error('Identified holder required');
    data[name] = { ...caller, heartbeatAt: new Date(now).toISOString(), at: holder?.session === caller.session ? holder.at : new Date(now).toISOString() };
  } else if (command === 'release') delete data[name];
  return data[name] ?? null;
}
// Brokers opt into this registry: {worktree,pid,startTime,command}[] in the jig store.
// Never infer ownership from a PID or a partial command-line match.
export function stopWorktreeBrokers(root, worktree, { inspect = processIdentity, kill = pid => process.kill(pid), waitMs = 3000 } = {}) {
  const path = statePath(root, 'worktree-brokers.json');
  const records = readJson(path, []);
  if (!Array.isArray(records)) throw Error('Invalid worktree broker registry');
  const stopped = [];
  for (const record of records) {
    if (typeof record.worktree !== 'string' || resolve(record.worktree) !== resolve(worktree)) continue;
    let actual = inspect(record.pid);
    if (!actual || !record.command || actual.startTime !== record.startTime || actual.command !== record.command) continue;
    if (!sameFolder(brokerCwd(actual.command), worktree)) continue;
    kill(record.pid);
    const deadline = Date.now() + waitMs;
    while ((actual = inspect(record.pid)) && actual.startTime === record.startTime && actual.command === record.command) {
      if (Date.now() >= deadline) throw Error(`Worktree broker ${record.pid} did not stop; worktree preserved`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
    stopped.push(record.pid);
  }
  return stopped;
}

const usage = 'Usage: worktree.mjs open <name> [--base <branch>] | claim <name> | heartbeat <name> | release <name> | brokers | stop-broker <name> | list | register <name> <folder> | adopt <name> <path> | consume <name> <file> | close <name> [--into <branch>] [--import <dir>] [--force --reason <text>] | doctor';
const contains = (parent, child) => {
  const rel = relative(parent, child);
  return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};
const overlaps = (a, b) => contains(a, b) || contains(b, a);
// Resolve existing ancestors too, so a symlinked parent cannot bypass boundaries.
function physical(path) {
  path = resolve(path);
  if (existsSync(path)) return realpathSync.native(path);
  if (lstatExists(path)) throw new Error('Dangling symlink is unsafe');
  const parent = dirname(path);
  if (parent === path) throw new Error('Cannot resolve path');
  return join(physical(parent), basename(path));
}
function lstatExists(path) {
  try { lstatSync(path); return true; } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false; throw error; }
}
function nameCheck(name) {
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(name ?? '')) throw new Error('Name must be lowercase words separated by hyphens or slashes');
}
function noProvider(path) {
  if (path.split(/[\\/]/).some(part => ['.claude', '.agents'].includes(part.toLowerCase()))) throw new Error('Provider folders cannot hold worktrees or scratch');
}
function noRepositoryAncestor(path) {
  for (let parent = path; ; parent = dirname(parent)) {
    if (lstatExists(join(parent, '.git'))) throw new Error('Folder is inside a Git repository');
    if (parent === dirname(parent)) break;
  }
}
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function worktrees(cwd) {
  return git(cwd, 'worktree', 'list', '--porcelain', '-z').split('\0\0').filter(Boolean).map(block => {
    const fields = Object.fromEntries(block.split('\0').filter(Boolean).map(line => {
      const space = line.indexOf(' ');
      return space < 0 ? [line, true] : [line.slice(0, space), line.slice(space + 1)];
    }));
    return { path: physical(fields.worktree), branch: fields.branch?.replace(/^refs\/heads\//, '') ?? null,
      head: fields.HEAD, locked: fields.locked !== undefined, prunable: fields.prunable !== undefined };
  });
}
function merged(main, branch, target) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, `refs/heads/${target}`], { cwd: main, encoding: 'utf8' });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error('Cannot determine merge state; check local branches');
}
function assertBranch(main, branch) {
  if (typeof branch !== 'string' || !branch || branch.startsWith('-')) throw new Error('Expected a local branch name');
  git(main, 'show-ref', '--verify', `refs/heads/${branch}`);
}
function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function validateRegistry(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.worktrees)) throw new Error('Invalid worktree registry');
  const names = new Set();
  const paths = new Set();
  for (const item of data.worktrees) {
    nameCheck(item.name);
    if (names.has(item.name) || paths.has(item.path) || typeof item.path !== 'string' || !isAbsolute(item.path)
        || typeof item.branch !== 'string' || !item.branch || item.branch.startsWith('-') || !Number.isFinite(Date.parse(item.created))
        || !Array.isArray(item.scratch) || item.scratch.some(p => typeof p !== 'string' || !isAbsolute(p))) throw new Error('Invalid worktree registry entry');
    names.add(item.name); paths.add(item.path);
  }
}
function noNestedGit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === '.git') throw new Error('Scratch contains a Git repository; refusing deletion');
    // Symlinks are removed as links by rm; never traverse them.
    if (entry.isDirectory()) noNestedGit(join(path, entry.name));
  }
}

const slash = path => path.split(sep).join('/');
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const receiptName = '.jig/consumed.json';
const receiptTracked = tree => git(tree, 'ls-files', '--cached', '-z', '--', receiptName).length > 0;
function isDirty(tree) {
  // An untracked consumption receipt is helper-owned control metadata.
  const exclude = existsSync(join(tree, receiptName)) && !receiptTracked(tree) ? ['--', '.', `:(exclude)${receiptName}`] : [];
  return git(tree, 'status', '--porcelain', '-z', '--untracked-files=all', ...exclude).length > 0;
}
function consumed(tree) {
  const path = join(tree, receiptName);
  if (lstatExists(path) && (!lstatSync(path).isFile() || physical(path) !== path)) throw new Error('Unsafe consumed record');
  const data = readJson(path, {});
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || Object.entries(data).some(([key, hash]) => !key || key.includes('\\') || isAbsolute(key) || key.split('/').some(p => !p || p === '..' || p === '.') || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid consumed record');
  return data;
}
// The receipt is private bookkeeping: keep it out of `git status` through the clone's own .git/info/exclude (inside .git, never tracked).
function excludeReceipt(tree) {
  const file = resolve(tree, git(tree, 'rev-parse', '--git-path', 'info/exclude').trim());
  const have = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = '/' + receiptName;
  if (have.split(/\r?\n/).includes(line)) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, have + (have && !have.endsWith('\n') ? '\n' : '') + line + '\n');
}
function saveConsumed(tree, data) {
  if (physical(join(tree, '.jig')) !== join(tree, '.jig')) throw new Error('.jig must not be a symlink');
  mkdirSync(join(tree, '.jig'), { recursive: true });
  const path = join(tree, receiptName);
  atomicWriteFile(path, JSON.stringify(data, null, 2) + '\n');
  if (!receiptTracked(tree)) excludeReceipt(tree);
}
function privateFiles(tree, disposable, links = []) {
  if (physical(join(tree, '.jig')) !== join(tree, '.jig')) throw new Error('.jig must not be a symlink');
  const files = new Set();
  const tracked = new Set(git(tree, 'ls-files', '--cached', '-z', '--', '.jig').split('\0').filter(Boolean));
  const walk = path => {
    const rel = slash(relative(tree, path));
    const stat = lstatSync(path);
    // Never traverse junctions or symlinks, including links within ignored folders.
    if (stat.isSymbolicLink()) { links.push(path); return; }
    const discard = !rel.startsWith('.jig/') && rel !== '.jig' && disposable.some(p => stat.isDirectory() && rel === p || rel.startsWith(p + '/'));
    if (stat.isDirectory()) for (const entry of readdirSync(path)) walk(join(path, entry));
    else if (stat.isFile() && rel !== receiptName && !discard) files.add(rel);
    else if (!stat.isFile()) throw new Error(`Unsupported private file: ${rel}`);
  };
  if (existsSync(join(tree, '.jig'))) walk(join(tree, '.jig'));
  for (const path of git(tree, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z').split('\0').filter(Boolean)) walk(join(tree, path));
  return [...files].sort().map(path => ({ path, hash: digest(join(tree, path)), tracked: tracked.has(path) }));
}
function importFiles(tree, name, destination, files, forbidden) {
  const root = physical(destination);
  const target = physical(join(root, ...name.split('/')));
  if (contains(tree, root) || overlaps(tree, target) || forbidden.some(path => overlaps(path, target))) throw new Error('Import destination is inside a worktree, scratch or Git metadata');
  const copied = [];
  const attempted = [];
  const verify = (file, dest) => {
    const source = readFileSync(join(tree, file.path));
    if (createHash('sha256').update(source).digest('hex') !== file.hash || !source.equals(readFileSync(dest))) throw new Error(`Import verification failed: ${file.path}`);
  };
  try {
    // Preflight every collision before copying anything. Existing equal files are reusable.
    const conflicts = [];
    for (const file of files) {
      const dest = join(target, file.path);
      if (physical(dest) !== dest || lstatExists(dest) && (!lstatSync(dest).isFile() || !readFileSync(dest).equals(readFileSync(join(tree, file.path))))) conflicts.push(file.path);
    }
    if (conflicts.length) throw new Error(`Import conflict: ${conflicts.join(', ')}`);
    for (const file of files) {
      const dest = join(target, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      if (physical(dest) !== dest) throw new Error(`Import path changed: ${file.path}`);
      attempted.push(dest);
      if (!existsSync(dest)) copyFileSync(join(tree, file.path), dest, constants.COPYFILE_EXCL);
      copied.push(dest);
      verify(file, dest);
    }
    // Verify the complete batch again before recording consumption or removing anything.
    for (const file of files) verify(file, join(target, file.path));
  } catch (error) { throw new Error(`${error.message}; nothing removed; copies present: ${JSON.stringify(attempted.filter(path => lstatExists(path)))}`); }
  return copied;
}

function backstops(main) {
  const result = [];
  if (existsSync(join(main, '.claude'))) {
    let installed = false;
    let disabled = false;
    for (const filename of ['settings.json', 'settings.local.json']) {
      const settings = readJson(join(main, '.claude', filename), {});
      if (settings.disableAllHooks !== undefined) disabled = settings.disableAllHooks === true;
      for (const entry of settings.hooks?.PreToolUse ?? []) {
        const tools = (entry.matcher ?? '').split('|');
        if (!['Bash', 'PowerShell', 'CMD'].every(tool => tools.includes(tool)) && entry.matcher !== '*') continue;
        for (const hook of entry.hooks ?? []) {
          const match = hook.command?.match(/^node\s+"([^"]*block-raw-worktree-remove\.mjs)"\s*$/);
          if (hook.type === 'command' && match && existsSync(resolve(main, match[1]))) installed = true;
        }
      }
    }
    result.push({ provider: 'claude', installed: installed && !disabled, scope: 'project settings; runtime hook enablement not verified' });
  }
  if (existsSync(join(main, '.codex'))) {
    const path = join(main, '.codex/rules/jig-safe-close.rules');
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const rules = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('prefix_rule('));
    const installed = text.includes('# jig safe-close backstop') && [
      'pattern = ["git", "worktree", "remove"]', 'pattern = ["git", "branch", "-D"]',
      'pattern = ["git", "branch", "--delete", "--force"]', 'pattern = ["git", "branch", "--force", "--delete"]'
    ].every(pattern => rules.some(line => line.startsWith(`prefix_rule(${pattern}, decision = "forbidden"`)));
    result.push({ provider: 'codex', installed, scope: 'project rule file; trust and runtime loading not verified', gap: 'Prefix rules cover outside-sandbox commands only; git global options, arbitrary paths and shell variants need additional policy.' });
  }
  return result;
}

export function runWorktree(args, cwd = process.cwd(), hooks = {}) {
  const [command, ...rest] = args;
  if (!['open', 'list', 'close', 'doctor', 'register', 'adopt', 'consume', 'claim', 'heartbeat', 'release', 'brokers', 'stop-broker'].includes(command)) throw new Error(usage);
  let name, folder, base, into, importDir, force = false, reason;
  if (['open', 'close', 'register', 'adopt', 'consume', 'claim', 'heartbeat', 'release', 'stop-broker'].includes(command)) { name = rest.shift(); nameCheck(name); }
  if (['register', 'adopt', 'consume'].includes(command)) folder = rest.shift();
  while (rest.length) {
    const option = rest.shift();
    if (command === 'open' && option === '--base' && base === undefined && rest.length) base = rest.shift();
    else if (command === 'close' && option === '--force' && !force) force = true;
    else if (command === 'close' && option === '--reason' && reason === undefined && rest.length) reason = rest.shift();
    else if (command === 'close' && option === '--into' && into === undefined && rest.length) into = rest.shift();
    else if (command === 'close' && option === '--import' && importDir === undefined && rest.length) importDir = rest.shift();
    else throw new Error(usage);
  }
  if (['register', 'adopt', 'consume'].includes(command) && !folder || force && !reason?.trim() || reason !== undefined && !force) throw new Error(`${usage}; --force requires --reason <text>`);
  const trees = worktrees(cwd);
  const main = trees[0]?.path;
  if (!main || !existsSync(join(main, '.git'))) throw new Error('A main checkout is required; bare repositories are unsupported');
  if (physical(join(main, '.jig')) !== join(main, '.jig')) throw new Error('.jig must not be a symlink');
  const config = readJson(statePath(main, 'worktree.json'), {});
  if (!config || Array.isArray(config) || typeof config !== 'object' || Object.keys(config).some(k => !['root', 'mainBranch', 'base', 'integrationBranch', 'disposable'].includes(k))
      || Object.entries(config).some(([k, v]) => k === 'disposable'
        ? !Array.isArray(v) || v.some(p => typeof p !== 'string' || !/^(?!\.jig(?:\/|$))[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*\/?$/.test(p) || p.split('/').some(s => s === '.' || s === '..'))
        : typeof v !== 'string' || !v.trim())) throw new Error('Invalid .jig/worktree.json');
  const mainBranch = config.mainBranch ?? 'main';
  assertBranch(main, mainBranch);
  if (into !== undefined && into !== config.integrationBranch && into !== mainBranch) throw new Error(`--into must be the configured integrationBranch or the main branch (${[config.integrationBranch, mainBranch].filter(Boolean).join(', ')}); got ${into}`);
  const integrationBranch = into ?? config.integrationBranch ?? mainBranch;
  assertBranch(main, integrationBranch);
  const protectedBranches = new Set([mainBranch, config.integrationBranch, integrationBranch]);
  const disposable = (config.disposable ?? ['node_modules', '.npm-cache']).map(p => p.replace(/\/$/, ''));
  const common = physical(resolve(main, git(main, 'rev-parse', '--git-common-dir').trim()));
  const registryPath = statePath(main, 'worktrees.json');
  const mutate = ['open', 'register', 'close', 'adopt', 'consume', 'claim', 'heartbeat', 'release', 'brokers', 'stop-broker'].includes(command);
  const lock = statePath(main, 'worktrees.lock');
  if (mutate) {
    mkdirSync(dirname(lock), { recursive: true });
    // Fail closed on a concurrent or interrupted writer; never steal its lock.
    try { mkdirSync(lock); } catch (error) { if (error.code !== 'EEXIST') throw error; throw Object.assign(new Error('Worktree registry locked; check for an active command before removing .jig/worktrees.lock'), { exitCode: 2 }); }
  }
  try {
    const data = readJson(registryPath, { version: 1, worktrees: [] });
    validateRegistry(data);
    if (['brokers', 'stop-broker'].includes(command)) {
      const item = name && data.worktrees.find(item => item.name === name);
      if (name && !item) throw Error('Unknown registered worktree');
      const brokers = discoverBrokers(main, data.worktrees, { snapshot: hooks.brokerProcesses, inspect: hooks.inspectProcess });
      if (command === 'brokers') return { brokers };
      const stopped = stopWorktreeBrokers(main, item.path, { inspect: hooks.inspectProcess, kill: hooks.killProcess });
      return { name, stopped, brokers: brokers.filter(broker => sameFolder(broker.worktree, item.path)) };
    }
    if (['claim', 'heartbeat', 'release'].includes(command)) {
      if (!data.worktrees.some(item => item.name === name)) throw Error('Unknown registered worktree');
      return withClaims(main, claims => ({ name, holder: changeClaim(claims, name, command, (hooks.callerIdentity ?? callerIdentity)(), hooks.inspectProcess, hooks.now?.() ?? Date.now()) }));
    }
    if (['open', 'close'].includes(command)) {
      // The registry lock covers the check and operation; a racing claim cannot slip in.
      const claims = readJson(statePath(main, 'worktree-claims.json'), {});
      if (Object.hasOwn(claims, name) && claimAlive(claims[name], hooks.inspectProcess)) {
        const caller = (hooks.callerIdentity ?? callerIdentity)();
        changeClaim(claims, name, 'check', caller, hooks.inspectProcess);
      }
    }
    const save = () => {
      atomicWriteFile(registryPath, JSON.stringify(data, null, 2) + '\n', { temp: registryPath + '.tmp' });
    };
    const safeExternal = (path, extra = []) => {
      noProvider(path);
      if (path !== physical(path)) throw new Error('Registered path changed through a symlink');
      if (trees.some(tree => overlaps(path, tree.path)) || extra.some(p => overlaps(path, p))
          || overlaps(path, common)) {
        throw new Error('Folder overlaps a checkout or Git metadata');
      }
      noRepositoryAncestor(path);
    };
    if (command === 'open') {
      if (data.worktrees.some(item => item.name === name)) throw new Error('Name already registered');
      const root = physical(resolve(main, config.root ?? join('..', `${basename(main)}-wt`)));
      const path = join(root, ...name.split('/'));
      safeExternal(path, data.worktrees.flatMap(item => [item.path, ...item.scratch]));
      if (lstatExists(path)) throw new Error('Worktree destination already exists');
      const start = base ?? config.base ?? mainBranch;
      assertBranch(main, start);
      mkdirSync(dirname(path), { recursive: true });
      git(main, 'worktree', 'add', '-b', name, path, `refs/heads/${start}`);
      data.worktrees.push({ name, branch: name, path, created: new Date().toISOString(), scratch: [] });
      save();
      return { name, branch: name, path, base: start };
    }
    if (command === 'register') {
      const item = data.worktrees.find(item => item.name === name);
      if (!item || !trees.some(tree => tree.path === item.path && tree.branch === item.branch) || !existsSync(item.path)) throw new Error('Registered live worktree required');
      const path = physical(resolve(cwd, folder));
      safeExternal(path, data.worktrees.flatMap(item => [item.path, ...item.scratch]));
      if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error('Scratch must be an existing directory');
      noNestedGit(path);
      item.scratch.push(path); save();
      return { name, scratch: path };
    }
    if (command === 'adopt') {
      if (data.worktrees.some(item => item.name === name)) throw new Error('Name already registered');
      const path = physical(resolve(cwd, folder));
      const tree = trees.find(tree => tree.path === path);
      noProvider(path);
      if (!tree || path === main || !tree.branch || tree.locked || tree.prunable || protectedBranches.has(tree.branch)
          || overlaps(path, common) || trees.some(other => other !== tree && overlaps(path, other.path))
          || data.worktrees.some(item => item.path === path || item.branch === tree.branch || item.scratch.some(p => overlaps(path, p)))) throw new Error('Expected an unregistered live worktree on an unprotected branch');
      if (!lstatSync(join(path, '.git')).isFile() || physical(git(path, 'rev-parse', '--show-toplevel').trim()) !== path
          || physical(resolve(path, git(path, 'rev-parse', '--git-common-dir').trim())) !== common) throw new Error('Folder is no longer the Git worktree');
      data.worktrees.push({ name, branch: tree.branch, path, created: new Date().toISOString(), scratch: [] });
      save(); return { adopted: name, path, branch: tree.branch };
    }
    if (command === 'close' || command === 'consume') {
      const item = data.worktrees.find(item => item.name === name);
      if (!item) throw new Error('Unknown registered worktree');
      const tree = trees.find(tree => tree.path === item.path);
      if (!tree || tree.path === main || tree.branch !== item.branch || protectedBranches.has(tree.branch) || tree.locked || !existsSync(tree.path)) throw new Error('Worktree missing, locked, protected or branch changed; inspect doctor and recover manually');
      if (command === 'close' && contains(tree.path, physical(cwd))) throw new Error('Run close from outside the worktree being removed');
      if (physical(item.path) !== item.path) throw new Error('Worktree path changed through a symlink');
      if (!lstatSync(join(tree.path, '.git')).isFile()
          || physical(git(tree.path, 'rev-parse', '--show-toplevel').trim()) !== tree.path
          || physical(resolve(tree.path, git(tree.path, 'rev-parse', '--git-common-dir').trim())) !== common
          || git(tree.path, 'symbolic-ref', '--quiet', 'HEAD').trim() !== `refs/heads/${item.branch}`) throw new Error('Folder is no longer the registered Git worktree');
      const records = consumed(tree.path);
      const links = [];
      let files = privateFiles(tree.path, disposable, links);
      if (command === 'consume') {
        const path = slash(relative(tree.path, resolve(tree.path, folder)));
        const file = files.find(file => file.path === path && !file.tracked);
        if (!file) throw new Error('Expected a protected private file relative to the worktree');
        records[path] = file.hash; saveConsumed(tree.path, records);
        return { consumed: path, sha256: file.hash, name };
      }
      const dirty = isDirty(tree.path);
      const isMerged = merged(main, tree.branch, integrationBranch);
      if (!force && (dirty || !isMerged)) throw new Error(`Refusing close: ${dirty ? 'dirty' : 'clean'}, ${isMerged ? 'merged' : 'unmerged'}; preserve work or use --force --reason <text>`);
      for (const path of item.scratch) {
        safeExternal(path, data.worktrees.flatMap(other => [other.path, ...(other === item ? other.scratch.filter(p => p !== path) : other.scratch)]));
        if (contains(path, physical(cwd))) throw new Error('Cannot delete the current directory');
        if (existsSync(path)) { if (!statSync(path).isDirectory()) throw new Error('Scratch is no longer a directory'); noNestedGit(path); }
      }
      let copies = [];
      if (importDir !== undefined) {
        copies = importFiles(tree.path, name, resolve(cwd, importDir), files, [common, ...item.scratch]);
        for (const file of files) records[file.path] = file.hash;
        try { saveConsumed(tree.path, records); }
        catch (error) { throw new Error(`${error.message}; nothing removed; copies present: ${JSON.stringify(copies)}`); }
        links.length = 0;
      }
      links.length = 0;
      files = privateFiles(tree.path, disposable, links);
      const unconsumed = files.filter(file => !file.tracked && records[file.path] !== file.hash);
      if (unconsumed.length) throw new Error(`Refusing close: unconsumed private files: ${unconsumed.map(file => file.path).join(', ')}; use consume or --import <dir>`);
      // Git refuses removal while the untracked receipt or links exist, so take them away
      // first but restore both if Git then fails; a failed close must not lose consumption state.
      const receiptPath = join(tree.path, receiptName);
      const savedReceipt = existsSync(receiptPath) && !receiptTracked(tree.path) ? readFileSync(receiptPath) : null;
      const savedLinks = [...new Set(links)].map(path => ({ path, target: readlinkSync(path), type: statSync(path, { throwIfNoEntry: false })?.isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file' }));
      if (savedReceipt) unlinkSync(receiptPath);
      for (const { path } of savedLinks) unlinkSync(path);
      try {
        (hooks.stopBrokers ?? stopWorktreeBrokers)(main, tree.path);
        hooks.beforeRemove?.(tree.path);
        // Git owns worktree removal. Never recursively remove a worktree ourselves.
        git(main, 'worktree', 'remove', ...(force ? ['--force'] : []), tree.path);
      } catch (error) {
        if (existsSync(tree.path)) {
          if (savedReceipt) { mkdirSync(dirname(receiptPath), { recursive: true }); writeFileSync(receiptPath, savedReceipt); }
          for (const { path, target, type } of savedLinks) if (!lstatExists(path)) symlinkSync(target, path, type);
        }
        throw error;
      }
      if (existsSync(tree.path)) throw new Error('Git removal left the worktree folder present; inspect doctor before recovery');
      try {
        // Ancestry was checked against the selected integration branch above.
        git(main, 'branch', '-D', tree.branch);
        for (const path of item.scratch) rmSync(path, { recursive: true, force: true });
        data.worktrees.splice(data.worktrees.indexOf(item), 1); save();
        if (existsSync(statePath(main, 'worktree-claims.json'))) withClaims(main, claims => { delete claims[name]; });
      } catch (error) { throw new Error(`Worktree removed; stale registry entry may remain for ${name}; inspect doctor before recovery: ${error.message}`); }
      return { closed: name, removed: [tree.path, ...item.scratch], branch: tree.branch, into: integrationBranch, copies, forced: force, ...(force ? { reason: reason.trim() } : {}) };
    }
    const rows = trees.map(tree => {
      const item = data.worktrees.find(item => item.path === tree.path);
      const present = existsSync(tree.path);
      let mergeState = null;
      if (tree.branch) {
        // Missing refs are themselves a stale-state finding, not a reason to hide doctor.
        try { mergeState = merged(main, tree.branch, integrationBranch); } catch { /* reported as unknown below */ }
      }
      let dirty = null;
      let statusError = false;
      if (present) {
        try { dirty = isDirty(tree.path); }
        catch { statusError = true; }
      }
      return { ...tree, registered: Boolean(item), name: item?.name ?? null,
        merged: mergeState,
        dirty, statusError,
        ageDays: present || item ? Math.max(0, Math.floor((Date.now() - (item ? Date.parse(item.created) : statSync(tree.path).birthtimeMs)) / 86400000)) : null,
        ageSource: item ? 'registered' : present ? 'folder-birthtime' : 'unknown',
        scratch: (item?.scratch ?? []).map(path => ({ path, missing: !existsSync(path) })) };
    });
    if (command === 'list') return { mainBranch, worktrees: rows };
    const issues = [];
    for (const tree of trees) {
      const notice = waitingRecords(tree.path);
      if (notice) issues.push({ kind: 'records-waiting', path: tree.path, message: notice });
    }
    for (const row of rows) {
      if (row.statusError) issues.push({ kind: 'unreadable-worktree', path: row.path });
      if (row.branch && row.merged === null) issues.push({ kind: 'unknown-merge-state', path: row.path });
      if (row.path !== main && row.merged) issues.push({ kind: 'merged-worktree', path: row.path });
      if (!existsSync(row.path)) issues.push({ kind: 'missing-worktree', path: row.path });
      if (row.prunable) issues.push({ kind: 'prunable-entry', path: row.path });
    }
    for (const item of data.worktrees) {
      const live = rows.find(row => row.path === item.path);
      if (!live) issues.push({ kind: 'orphan-registration', path: item.path, name: item.name });
      else if (live.branch !== item.branch) issues.push({ kind: 'changed-branch', path: item.path, name: item.name });
      for (const path of item.scratch) {
        if (!existsSync(path) || !live || !existsSync(item.path) || live.merged || live.branch !== item.branch) issues.push({ kind: 'stale-scratch', path, name: item.name, missing: !existsSync(path) });
      }
    }
    return { mainBranch, integrationBranch, issues, backstops: backstops(main), note: 'Preview only. Close registered live worktrees individually; inspect missing/prunable entries before manual recovery.' };
  } finally {
    if (mutate) rmdirSync(lock);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(runWorktree(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.stderr?.toString().trim() || error.message); process.exitCode = error.exitCode ?? 1; }
}
