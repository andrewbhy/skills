import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from './command-line.mjs';
// Mistake prevention for one OS account, not a boundary against hostile code.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { atomicWriteFile } from './jig-store.mjs';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, reviewDir } from './tower-core.mjs';
import { mainCheckout, projectDir, projectName, projectsMap, repoOf, storeRoot } from './jig-store.mjs';
import { withFileLock } from './orchestrate-lock.mjs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export const capabilityEnv = 'JIG_CAPABILITY_FILE';
export const grantEnv = 'JIG_MERGE_GRANT';
const hash = value => createHash('sha256').update(value).digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const inside = (root, path) => { const rel = relative(root, path); return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };
const privatePath = path => String(path).split(/[\\/]+/).some(part => part.toLowerCase() === 'private');
function physical(path) {
  return existsSync(path) ? realpathSync(path) : join(physical(dirname(path)), basename(path));
}
function unsafeSessionsPath(dir) {
  dir = physical(dir);
  if (privatePath(dir)) throw new Error('Session store path is private.');
  // Registered checkouts and their linked worktrees are never credential stores,
  // even when the project ignores sessions. Ignore rules only exempt other repos
  // (for example, a personal store whose non-secret state is snapshotted in Git).
  for (const entry of Object.values(projectsMap())) {
    const path = typeof entry === 'string' ? entry : entry?.path;
    if (typeof path !== 'string' || privatePath(path)) continue;
    const checkout = physical(resolve(path));
    if (privatePath(checkout)) continue;
    if (inside(checkout, dir)) return true;
    const trees = spawnSync('git', ['-C', checkout, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (trees.status !== 0) throw new Error('Cannot check registered project worktrees for the session store.');
    for (const field of trees.stdout.split('\0')) {
      if (!field.startsWith('worktree ')) continue;
      const tree = field.slice('worktree '.length);
      if (!privatePath(tree) && inside(physical(tree), dir)) return true;
    }
  }
  for (let ancestor = dir; ; ancestor = dirname(ancestor)) {
    if (existsSync(join(ancestor, '.git'))) {
      // The trailing slash also checks an as-yet uncreated sessions directory.
      const ignored = spawnSync('git', ['-C', ancestor, 'check-ignore', '--quiet', '--', dir.replace(/\\/g, '/') + '/'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (ignored.status !== 0) return true;
    }
    if (ancestor === dirname(ancestor)) break;
  }
  return false;
}
let sessionLocation;
export function sessionsDir(storeDir = reviewDir()) {
  const root = projectRoot();
  if (privatePath(storeDir) || privatePath(root)) throw new Error('Session store path is private.');
  const key = JSON.stringify([resolve(storeDir), root, process.env.JIG_HOME ?? null]);
  if (sessionLocation?.key === key) return sessionLocation.dir;
  let dir = physical(resolve(storeDir));
  // Resolve symlinks too: the legacy repo fallback must not hold credentials.
  if (privatePath(dir)) throw new Error('Session store path is private.');
  const unsafe = unsafeSessionsPath(join(dir, 'sessions'));
  let relocated = false;
  if (!process.env.JIG_HOME && unsafe) {
    const root = storeRoot(), repo = mainCheckout(projectRoot());
    const name = projectName(repo), registered = repoOf(name);
    if (root && registered && relative(resolve(registered), repo) === '') {
      const personal = projectDir(name);
      if (privatePath(personal)) throw new Error('Session store path is private.');
      dir = physical(personal);
      if (privatePath(dir)) throw new Error('Session store path is private.');
      relocated = true;
    }
  }
  if (relocated ? unsafeSessionsPath(join(dir, 'sessions')) : unsafe) throw new Error('Session store is inside a working tree that can track credentials. Use a store outside registered project checkouts/worktrees. For a personal store Git repository, add these .gitignore lines: */sessions/ and */coordination.json. JIG_HOME must meet the same requirements.');
  // The safety decision is fixed for this server lifetime. Environment/store
  // changes revalidate; ownership and credentials themselves are never cached.
  sessionLocation = { key, dir: join(dir, 'sessions') };
  return sessionLocation.dir;
}
function load(dir) {
  const file = join(dir, 'coordination.json');
  if (!existsSync(file)) return { schema: 1, capabilities: {}, grants: {}, requests: {} };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data?.schema !== 1 || !data.capabilities || !data.grants || !data.requests ||
      [data.capabilities, data.grants, data.requests].some(x => typeof x !== 'object' || Array.isArray(x))) throw new Error('Corrupt coordination store.');
  return data;
}
function locked(fn) {
  const dir = sessionsDir(); mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const lock = join(dir, 'coordination.lock');
  return withFileLock(lock, () => {
    const data = load(dir);
    const result = fn(data, dir);
    atomicWriteFile(join(dir, 'coordination.json'), JSON.stringify(data) + '\n', { mode: 0o600 });
    return result;
  }, { retryMs: 2000 });
}
const validKind = kind => typeof kind === 'string' && /^(?:child-of-)*(?:coordinator|topic)$/.test(kind);
export function identity({ actorPid = process.ppid, now = Date.now(), dir = reviewDir() } = {}) {
  try {
    const file = process.env[capabilityEnv];
    if (!file || !isAbsolute(file) || privatePath(file)) return { kind: 'unidentified' };
    if (process.platform !== 'win32' && (statSync(file).mode & 0o077)) return { kind: 'unidentified' };
    const credential = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof credential.id !== 'string' || typeof credential.secret !== 'string') return { kind: 'unidentified' };
    const cap = load(sessionsDir(dir)).capabilities[credential.id];
    if (!cap || !validKind(cap.kind) || !Number.isSafeInteger(cap.holderPid) || cap.holderPid < 1 ||
        !Number.isFinite(cap.expiresAt) || cap.expiresAt <= now || !alive(cap.holderPid) || cap.digest !== hash(credential.secret)) return { kind: 'unidentified' };
    const holder = actorPid === cap.holderPid ||
      (cap.kind === 'coordinator' || cap.personStarted === true && cap.kind === 'topic') && holdsAgentProcess(actorPid, cap.holderPid);
    return { id: credential.id, kind: holder && !process.env.JIG_LOGICAL_CHILD ? cap.kind : `child-of-${cap.kind}`, holderPid: cap.holderPid };
  } catch { return { kind: 'unidentified' }; }
}
const capabilityTtl = 24 * 60 * 60 * 1000;
// A live holder renews its own credential; an expired one stays unidentified until then.
// With withinMs, renew only when less than that remains (heartbeat use).
export function renewCapability({ actorPid = process.ppid, now = Date.now(), withinMs, dir = reviewDir() } = {}) {
  const file = process.env[capabilityEnv];
  if (!file || !isAbsolute(file) || privatePath(file)) throw new Error('Capability renewal needs a readable capability file.');
  if (process.platform !== 'win32' && (statSync(file).mode & 0o077)) throw new Error('Capability file permissions are too open.');
  let credential;
  try { credential = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error('Capability file is unreadable.'); }
  if (typeof credential?.id !== 'string' || typeof credential.secret !== 'string') throw new Error('Capability file is malformed.');
  return locked(data => {
    const cap = data.capabilities[credential.id];
    if (!cap || cap.digest !== hash(credential.secret)) throw new Error('Capability not renewed: unknown or mismatched credential.');
    if (!validKind(cap.kind) || !Number.isSafeInteger(cap.holderPid) || cap.holderPid < 1) throw new Error('Capability not renewed: corrupt record.');
    if (!alive(cap.holderPid)) throw new Error('Capability not renewed: holder process is not running.');
    const holder = actorPid === cap.holderPid ||
      (cap.kind === 'coordinator' || cap.personStarted === true && cap.kind === 'topic') && holdsAgentProcess(actorPid, cap.holderPid);
    if (!holder || process.env.JIG_LOGICAL_CHILD) throw new Error('Capability not renewed: caller is not the holder.');
    if (withinMs !== undefined && Number.isFinite(cap.expiresAt) && cap.expiresAt - now >= withinMs) return { id: credential.id, expiresAt: cap.expiresAt, renewed: false };
    cap.expiresAt = now + capabilityTtl;
    return { id: credential.id, expiresAt: cap.expiresAt, renewed: true };
  });
}
export function capabilitySession(id, dir = reviewDir()) {
  const cap = load(sessionsDir(dir)).capabilities[id];
  if (!cap || !validKind(cap.kind) || !Number.isSafeInteger(cap.holderPid) || cap.holderPid < 1 || !alive(cap.holderPid) || !Number.isFinite(cap.expiresAt) || cap.expiresAt <= Date.now()) throw new Error('Owner session needs a live, unexpired capability.');
  return { sessionId: id, kind: cap.kind };
}
function mint(kind, { holderPid = process.ppid, replaceStale = false, personStarted = false } = {}) {
  if (!Number.isSafeInteger(holderPid) || holderPid < 1 || !alive(holderPid)) throw new Error('Capability holder PID must be live.');
  let created;
  try { return locked((data, dir) => {
    if (kind === 'coordinator' && data.coordinator) {
      const old = data.capabilities[data.coordinator];
      if (!old) throw new Error('Corrupt coordinator singleton.');
      if (!Number.isSafeInteger(old.holderPid) || old.holderPid < 1) throw new Error('Corrupt coordinator singleton.');
      if (alive(old.holderPid)) throw new Error('A live coordinator already holds the singleton.');
      if (!replaceStale) throw new Error('Stale coordinator; inspect it and use --replace-stale explicitly.');
      delete data.capabilities[data.coordinator];
    }
    const id = randomUUID(), secret = randomBytes(32).toString('hex');
    const file = join(dir, `${id}.cap`);
    created = file;
    writeFileSync(file, JSON.stringify({ id, secret }) + '\n', { flag: 'wx', mode: 0o600 });
    chmodSync(file, 0o600); // Windows ACLs remain best effort in v1.
    data.capabilities[id] = { kind, holderPid, digest: hash(secret), expiresAt: Date.now() + capabilityTtl, ...(personStarted ? { personStarted: true } : {}) };
    if (kind === 'coordinator') data.coordinator = id;
    return file;
  }); } catch (error) {
    if (created && existsSync(created)) unlinkSync(created);
    throw error;
  }
}
export function mintTopicCapability({ kind = 'topic', ...options } = {}) {
  if (kind !== 'topic') throw new Error('Session start can mint only topic capabilities.');
  const parent = identity();
  if (process.env[capabilityEnv] && parent.kind === 'unidentified') throw new Error('Unreadable parent capability; cannot mint a session.');
  // A derived credential is never promoted back to a root topic credential.
  return mint(parent.kind === 'unidentified' ? 'topic' : `child-of-${parent.kind}`, options);
}
// Only the session launcher may create a fresh topic for a coordinator. Ordinary
// inherited credentials still derive their kind through mintTopicCapability.
export function mintSessionCapability(options) {
  const caller = identity();
  if (process.env[capabilityEnv] && caller.kind !== 'coordinator') throw new Error('Start a topic from the person or coordinator, not an inherited worker.');
  return mint('topic', options);
}
export function bindSessionCapability(file, holderPid) {
  if (!alive(holderPid)) throw new Error('Provider exited; check the Claude executable and login.');
  const credential = JSON.parse(readFileSync(file, 'utf8'));
  return locked(data => {
    const cap = data.capabilities[credential.id];
    if (!cap || cap.kind !== 'topic' || cap.digest !== hash(credential.secret)) throw new Error('Invalid topic capability.');
    cap.holderPid = holderPid;
  });
}
export function revokeSessionCapability(file) {
  if (!file || !existsSync(file)) return;
  const credential = JSON.parse(readFileSync(file, 'utf8'));
  locked(data => {
    if (data.capabilities[credential.id]?.digest !== hash(credential.secret)) throw new Error('Invalid capability cleanup.');
    delete data.capabilities[credential.id];
  });
  if (existsSync(file)) unlinkSync(file);
}
export function coordinationSnapshot() { return structuredClone(load(sessionsDir())); }
export function mintTowerCoordinator(options) {
  const entry = fileURLToPath(new URL('./tower.mjs', import.meta.url));
  if (!process.argv[1] || resolve(process.argv[1]) !== entry || process.env[capabilityEnv]) throw new Error('Only person-launched tower start can mint coordinator.');
  return mint('coordinator', options);
}
export function requestLine(item = '<id>', branch = '<name>', options) {
  const companion = './orchestrate-' + 'merge.mjs';
  if (!existsSync(new URL(companion, import.meta.url))) return 'needs jig-orchestrate installed: request merge';
  return commandFor(new URL('./tower.mjs', import.meta.url), ['request', '--needs', 'merge', '--item', item, '--branch', branch], options);
}
export function requireCoordinator() {
  const caller = identity();
  if (caller.kind !== 'coordinator') throw new Error(`Coordinator required. ${requestLine()}`);
  return caller;
}
export function mintGrant(branch, sha, authority) {
  const caller = requireCoordinator();
  if (typeof branch !== 'string' || !branch || branch.startsWith('-') || branch === 'main' || !/^[a-f0-9]{40,64}$/.test(sha ?? '')) throw new Error('Grant needs a topic branch and full commit SHA.');
  if (typeof authority !== 'string' || !authority.trim() || !/item-\d+/.test(authority)) throw new Error('Grant authority needs the person\'s quote and item reference.');
  return locked(data => {
    const id = randomUUID();
    data.grants[id] = { id, branch, sha, authority, issuer: caller.id, expiresAt: Date.now() + 60 * 60 * 1000, state: 'open' };
    return id;
  });
}
function matches(grant, branch, sha) {
  return grant && grant.branch === branch && grant.sha === sha && Number.isFinite(grant.expiresAt) && grant.expiresAt > Date.now() &&
    typeof grant.authority === 'string' && grant.authority.trim() && typeof grant.issuer === 'string';
}
export function claimGrant(id, branch, sha) {
  const caller = identity();
  if (!caller.id) throw new Error(`Identified capability required. ${requestLine()}`);
  return locked(data => {
    const grant = data.grants[id];
    if (!matches(grant, branch, sha) || grant.state !== 'open') throw new Error('Missing, corrupt, expired, mismatched or reused merge grant.');
    Object.assign(grant, { state: 'in-use', worker: caller.id, workerKind: caller.kind, workerPid: process.pid, claimedAt: Date.now() });
    return { ...grant };
  });
}
export function finishGrant(id, state) {
  if (!['merged', 'failed'].includes(state)) throw new Error('Invalid terminal grant state.');
  const caller = identity();
  return locked(data => {
    const grant = data.grants[id];
    if (!grant || grant.state !== 'in-use' || grant.worker !== caller.id || grant.workerPid !== process.pid) throw new Error('Grant is not held by this merge.');
    Object.assign(grant, { state, finishedAt: Date.now() });
  });
}
// The raw hook never authorizes an open grant: only the wrapper can atomically
// claim it. Its Git subprocess must be a direct child of that exact wrapper.
export function mergeAllowed(branch, sha) {
  if (identity().kind === 'coordinator') return true;
  try {
    const caller = identity(), grant = load(sessionsDir()).grants[process.env[grantEnv]];
    return Boolean(caller.id && matches(grant, branch, sha) && grant.state === 'in-use' &&
      grant.worker === caller.id && grant.workerPid === process.ppid);
  } catch { return false; }
}
export function recordMergeRequest({ needs, item, branch, text, generation = 0 }) {
  const caller = identity();
  if (!caller.id) throw new Error('Identified capability required for a merge request.');
  if (!['merge', 'decision', 'cleanup', 'info'].includes(needs) || !/^item-\d+$/.test(item ?? '') || !Number.isSafeInteger(generation) || generation < 0) throw new Error('Request needs merge|decision|cleanup|info, a known item and a nonnegative generation.');
  if (needs === 'merge' && (typeof branch !== 'string' || !branch || branch.startsWith('-'))) throw new Error('Merge request needs a branch.');
  if (needs !== 'merge' && (typeof text !== 'string' || !text.trim() || text.length > 4000)) throw new Error('Request needs --text (1–4000 characters).');
  return locked(data => {
    const id = randomUUID();
    const request = { id, needs, item, generation, ...(needs === 'merge' ? { branch } : { text }), state: 'open', sessionId: caller.id, kind: caller.kind, at: Date.now() };
    data.requests[id] = request;
    return request;
  });
}
export function openMergeRequests() {
  requireCoordinator();
  return Object.values(load(sessionsDir()).requests).filter(request => request.state === 'open');
}

// Process metadata only: never inspect command lines or provider transcripts.

// Toolhelp needs no WMI service or administrator access. Only names and PIDs
// cross this boundary; no command line or executable file is opened.
const windowsProcesses = `
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class JigProcessSnapshot {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Entry {
    public uint size, usage, pid;
    public UIntPtr heap;
    public uint module, threads, parent;
    public int priority;
    public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string name;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static Entry[] Read() {
    IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
    try {
      var rows = new List<Entry>(); var entry = new Entry(); entry.size = (uint)Marshal.SizeOf(entry);
      if (!Process32FirstW(snapshot, ref entry)) throw new System.ComponentModel.Win32Exception();
      do { rows.Add(entry); } while (Process32NextW(snapshot, ref entry));
      return rows.ToArray();
    } finally { CloseHandle(snapshot); }
  }
}
'@
[JigProcessSnapshot]::Read() | Select-Object pid,parent,name | ConvertTo-Json -Compress
`;
let processSnapshot;
export function processTable() {
  const now = performance.now();
  if (processSnapshot && now < processSnapshot.expiresAt) return structuredClone(processSnapshot.rows);
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? 'powershell.exe' : 'ps', windows
    ? ['-NoProfile', '-NonInteractive', '-Command', windowsProcesses]
    : ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (result.status !== 0) throw new Error('Cannot inspect agent processes; retry claim with --pid and --provider.');
  const rows = windows ? [].concat(JSON.parse(result.stdout)).map(row => ({ pid: row.pid, parent: row.parent, name: row.name })) : result.stdout.trim().split('\n').map(line => {
    const [, pid, parent, name] = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/) ?? [];
    return { pid: Number(pid), parent: Number(parent), name };
  });
  processSnapshot = { rows, expiresAt: now + 2000 };
  return structuredClone(rows);
}
function* ancestors(start, rows) {
  const seen = new Set();
  for (let pid = start; pid && !seen.has(pid);) {
    seen.add(pid);
    const row = rows.find(row => row.pid === pid);
    if (!row) break;
    yield row;
    pid = row.parent;
  }
}
const agentName = row => String(row.name).split(/[\\/]/).at(-1).replace(/\.exe$/i, '').toLowerCase();
export function agentAncestor(start = process.ppid, rows = processTable()) {
  for (const row of ancestors(start, rows)) {
    const name = agentName(row);
    if (['claude', 'codex'].includes(name)) return { pid: row.pid, provider: name };
  }
  return null;
}
export function holdsAgentProcess(start, holderPid, rows = processTable()) {
  for (const row of ancestors(start, rows)) {
    if (row.pid === holderPid) return true; // Also honours an explicit --pid.
    if (['claude', 'codex'].includes(agentName(row))) return false;
  }
  return false;
}
