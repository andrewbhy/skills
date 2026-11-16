if (process.argv[2] === '--help') { console.log('Usage: node scripts/gpu-share/gpu-share.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// gpu-share: one GPU and one ComfyUI shared by many programs. Plain Node, zero dependencies, imports nothing from any
// project. Copy this file anywhere to use it (see tests/gpu-share-contract.test.mjs); keep CONTRACT_VERSION.
//
// CONTRACT (version 1)
// Lease file: <dir>/lease.json, one JSON object, written atomically (temp file then rename), empty object {} when free.
//   <dir> is GPU_SHARE_DIR when set, else %LOCALAPPDATA%/gpu-share (Windows), ~/Library/Application Support/gpu-share (macOS),
//   $XDG_STATE_HOME/gpu-share or ~/.local/state/gpu-share (elsewhere). It is outside every repository and every project store.
// Fields: { who: string, task: string, since: ISO-8601 UTC, expectMinutes: number > 0, version: 1 }.
// Staleness: a lease is "overdue" past expectMinutes and "stale" past 2 * expectMinutes + 5 minutes. Stale leases no
//   longer block: wait ignores them and lease replaces them. Overdue leases still block.
// Privacy: the lease file is readable by every agent on the machine. A private instance (an offline personal one) must
//   not reveal its work: `lease --private` forces who="private-owner (private)" and task="" whatever was passed.
// Priority: the owner's private jobs take the lease and agents wait for it. `wait` never queues behind anyone: after
//   --max-minutes (default 30) it gives up with exit code 3, and the agent reports instead of forcing its way in.
//   Nobody cancels another party's ComfyUI job.
// CLI: node gpu-share.mjs [status] [--json]
//      node gpu-share.mjs lease <who> <task> <minutes> [--private] [--force]
//      node gpu-share.mjs release <who> [--force]
//      node gpu-share.mjs wait [--max-minutes N] [--who <who>]   (one line per minute)
// Exit codes: 0 ok, 1 error (lease held by someone else, release by a non-holder, bad input at runtime), 2 usage, 3 wait gave up.
// Environment: GPU_SHARE_DIR (lease folder), GPU_SHARE_COMFY_URL (default http://127.0.0.1:8188), GPU_SHARE_SMI (nvidia-smi path).
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTRACT_VERSION = 1;
export const PRIVATE_WHO = 'private-owner (private)';
const SMI_ARGS = ['--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'];
const num = (v) => { const n = Number(String(v).trim()); return Number.isFinite(n) ? n : null; };

export function leaseDir(env = process.env, platform = process.platform, home = homedir()) {
  if (env.GPU_SHARE_DIR) return env.GPU_SHARE_DIR;
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'gpu-share');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'gpu-share');
  return join(env.XDG_STATE_HOME || join(home, '.local', 'state'), 'gpu-share');
}
export const leasePath = (dir = leaseDir()) => join(dir, 'lease.json');
export const defaultComfyUrl = (env = process.env) => env.GPU_SHARE_COMFY_URL || 'http://127.0.0.1:8188';

// ---------- reading the GPU and ComfyUI ----------
export function parseSmi(text) {
  const line = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  const [used, total, util, temp] = line.split(',').map(num);
  if (used === null || total === null) return null;
  return { usedMB: used, totalMB: total, util: util ?? null, temp: temp ?? null };
}
const runSmi = (exe = process.env.GPU_SHARE_SMI || 'nvidia-smi') => new Promise((ok) => execFile(exe, SMI_ARGS, { timeout: 4000, windowsHide: true }, (err, out) => ok(err ? null : parseSmi(out))));

async function getJson(fetchFn, url, ms = 2500) {
  const r = await fetchFn(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
export function describePrompt(graph) {
  const models = new Set(); const prefixes = new Set();
  for (const node of Object.values(graph && typeof graph === 'object' ? graph : {})) {
    const inputs = node && node.inputs ? node.inputs : {};
    for (const k of ['ckpt_name', 'unet_name', 'model_name', 'diffusion_model']) if (typeof inputs[k] === 'string') models.add(inputs[k]);
    if (typeof inputs.filename_prefix === 'string') prefixes.add(inputs.filename_prefix);
  }
  return { model: [...models][0] ?? null, prefix: [...prefixes][0] ?? null };
}
function queueEntry(e) {
  const a = Array.isArray(e) ? e : [];
  const extra = a[3] && typeof a[3] === 'object' ? a[3] : {};
  return { promptId: String(a[1] ?? ''), client: extra.client_id ?? null, ...describePrompt(a[2]) };
}
function historyEntry(id, h) {
  const base = queueEntry(h && h.prompt);
  const msgs = (h && h.status && Array.isArray(h.status.messages)) ? h.status.messages : [];
  const stamp = (name) => { const m = msgs.find((x) => Array.isArray(x) && x[0] === name); return m && m[1] ? num(m[1].timestamp) : null; };
  const start = stamp('execution_start');
  const end = stamp('execution_success') ?? stamp('execution_error') ?? stamp('execution_interrupted');
  return {
    ...base, promptId: base.promptId || id,
    startedAt: start === null ? null : new Date(start).toISOString(),
    endedAt: end === null ? null : new Date(end).toISOString(),
    seconds: start !== null && end !== null ? Math.max(0, Math.round((end - start) / 1000)) : null,
    status: (h && h.status && h.status.status_str) || 'unknown'
  };
}
export async function comfyStatus({ url = defaultComfyUrl(), fetch: fetchFn = fetch, last = 5 } = {}) {
  const out = { up: false, url, running: [], pending: 0, lastDone: [], vramFreeMB: null };
  try {
    const q = await getJson(fetchFn, `${url}/queue`);
    out.up = true;
    out.running = (q.queue_running || []).map(queueEntry);
    out.pending = (q.queue_pending || []).length;
  } catch { return out; }
  try {
    const h = await getJson(fetchFn, `${url}/history?max_items=${Math.max(last * 3, 10)}`);
    const rows = Object.entries(h || {}).map(([id, v]) => historyEntry(id, v));
    rows.sort((a, b) => String(b.endedAt ?? '').localeCompare(String(a.endedAt ?? '')));
    out.lastDone = rows.slice(0, last);
    // The queue does not say when a running prompt began; the newest finish time is the best bound.
    for (const r of out.running) r.startedAt = out.lastDone[0] ? out.lastDone[0].endedAt : null;
  } catch { /* history is optional */ }
  try {
    const s = await getJson(fetchFn, `${url}/system_stats`);
    const d = s && s.devices && s.devices[0];
    if (d && num(d.vram_free) !== null) out.vramFreeMB = Math.round(d.vram_free / 1048576);
  } catch { /* optional */ }
  return out;
}

// ---------- lease ----------
export function readLease({ dir = leaseDir(), now = Date.now() } = {}) {
  let l;
  try { l = JSON.parse(readFileSync(leasePath(dir), 'utf8')); } catch { return null; }
  if (!l || typeof l !== 'object' || typeof l.who !== 'string' || !l.who) return null;
  const since = Date.parse(l.since); const exp = num(l.expectMinutes);
  const ageMin = Number.isFinite(since) ? (now - since) / 60000 : 0;
  return { who: l.who, task: String(l.task ?? ''), since: l.since, expectMinutes: exp, version: l.version ?? null, overdue: exp !== null && ageMin > exp, stale: exp !== null && ageMin > exp * 2 + 5 };
}
function writeLeaseFile(dir, data) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `lease.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, leasePath(dir));
}
export function takeLease(who, task, minutes, { dir = leaseDir(), force = false, private: priv = false } = {}) {
  const lease = { who: priv ? PRIVATE_WHO : who, task: priv ? '' : task, since: new Date().toISOString(), expectMinutes: Number(minutes), version: CONTRACT_VERSION };
  if (!lease.who || (!priv && !task) || !Number.isFinite(lease.expectMinutes) || lease.expectMinutes <= 0) throw new UsageError('Usage: lease <who> <task> <minutes> [--private]');
  const cur = readLease({ dir });
  if (cur && cur.who !== lease.who && !cur.stale && !force) throw new Error(`GPU lease held by ${cur.who}${cur.task ? ` (${cur.task})` : ''} since ${cur.since}; run "wait" first.`);
  writeLeaseFile(dir, lease);
  return lease;
}
export function releaseLease(who, { dir = leaseDir(), force = false } = {}) {
  const cur = readLease({ dir });
  if (!cur) return { released: false, reason: 'no lease' };
  if (cur.who !== who && !force) throw new Error(`Lease is held by ${cur.who}, not ${who}. Use --force only for your own stale lease.`);
  writeLeaseFile(dir, {});
  return { released: true, was: cur };
}
class UsageError extends Error {}

export function guessOwner(lease, comfy) {
  if (lease && !lease.stale) return { who: lease.who, source: 'lease', task: lease.task };
  const r = comfy.running[0];
  if (r) return { who: r.client || r.prefix || 'unknown', source: r.client ? 'client_id' : r.prefix ? 'filename_prefix' : 'none', task: r.prefix || null };
  return null;
}
export async function gpuStatus({ smi, smiPath, comfyUrl, fetch: fetchFn, dir, last = 5 } = {}) {
  const [gpu, comfy] = await Promise.all([smi !== undefined ? Promise.resolve(parseSmi(smi)) : runSmi(smiPath), comfyStatus({ url: comfyUrl, fetch: fetchFn, last })]);
  const lease = readLease({ dir });
  return { at: new Date().toISOString(), gpu, comfy, lease, owner: guessOwner(lease, comfy) };
}
export const isBusy = (s) => !!(s.comfy.running.length || s.comfy.pending || (s.lease && !s.lease.stale));

// Chip text and level: idle, busy, amber (VRAM over 14 GB or more than 2 queued), unknown.
export function chipOf(s) {
  if (!s || (!s.gpu && !s.comfy.up)) return { text: 'GPU: unknown', level: 'unknown' };
  const gb = s.gpu ? s.gpu.usedMB / 1024 : null;
  const mem = s.gpu ? `${gb.toFixed(1)}/${(s.gpu.totalMB / 1024).toFixed(0)} GB` : null;
  const amber = (gb !== null && gb > 14) || s.comfy.pending > 2;
  if (!isBusy(s)) return { text: `GPU: idle${mem ? ` (${mem})` : ''}`, level: amber ? 'amber' : 'idle' };
  const parts = [s.owner ? s.owner.who : 'unknown'];
  if (s.comfy.pending) parts.push(`${s.comfy.pending} queued`);
  if (mem) parts.push(mem);
  return { text: `GPU: busy (${parts.join(', ')})`, level: amber ? 'amber' : 'busy' };
}
// Cache for a server: at most one refresh per ttl, never blocking a caller.
export function createGpuMonitor({ ttlMs = 5000, load = () => gpuStatus() } = {}) {
  let value = null; let at = 0; let busy = false;
  const refresh = () => {
    if (busy) return;
    busy = true;
    Promise.resolve().then(load).then((s) => { value = s; }, () => { /* keep the last value */ }).finally(() => { busy = false; at = Date.now(); });
  };
  return { snapshot() { if (Date.now() - at >= ttlMs) refresh(); return value ? { ...value, chip: chipOf(value) } : null; }, refresh };
}

// ---------- CLI ----------
export function formatText(s) {
  const L = [chipOf(s).text];
  L.push(s.gpu ? `VRAM ${s.gpu.usedMB}/${s.gpu.totalMB} MB, util ${s.gpu.util ?? '?'}%, ${s.gpu.temp ?? '?'} C` : 'nvidia-smi: not available');
  L.push(s.comfy.up ? `ComfyUI up: ${s.comfy.running.length} running, ${s.comfy.pending} queued` : `ComfyUI down (${s.comfy.url})`);
  for (const r of s.comfy.running) L.push(`  running ${r.promptId.slice(0, 8)} client=${r.client ?? '?'} model=${r.model ?? '?'} prefix=${r.prefix ?? '?'}`);
  L.push(s.lease ? `lease: ${s.lease.who}${s.lease.task ? ` - ${s.lease.task}` : ''} since ${s.lease.since} (${s.lease.expectMinutes} min${s.lease.stale ? ', stale' : s.lease.overdue ? ', overdue' : ''})` : 'lease: none');
  if (s.owner) L.push(`owner: ${s.owner.who} (${s.owner.source})`);
  return L.join('\n');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitIdle({ maxMinutes = 30, who = null, pollMs = 60000, status = () => gpuStatus(), log = console.log } = {}) {
  const t0 = Date.now(); let n = 0;
  for (;;) {
    const s = await status();
    const lease = s.lease && s.lease.who !== who && !s.lease.stale ? s.lease : null;
    if (!(s.comfy.running.length || s.comfy.pending || lease)) { log(`GPU free after ${n} min`); return true; }
    const why = [s.comfy.running.length ? `${s.comfy.running.length} running` : null, s.comfy.pending ? `${s.comfy.pending} queued` : null, lease ? `lease ${lease.who}` : null].filter(Boolean).join(', ');
    log(`waiting ${n} min: ${why}`);
    if ((Date.now() - t0) / 60000 >= maxMinutes) { log(`gave up after ${maxMinutes} min; the GPU is still busy`); return false; }
    await sleep(pollMs); n += 1;
  }
}
export async function main(argv) {
  const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
  const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--max-minutes' && argv[i - 1] !== '--who');
  const cmd = pos[0] || 'status'; const rest = pos.slice(1);
  const force = argv.includes('--force');
  if (cmd === 'lease') {
    const priv = argv.includes('--private');
    const l = takeLease(priv ? PRIVATE_WHO : rest[0], priv ? '' : rest[1], priv ? rest[rest.length - 1] : rest[2], { force, private: priv });
    console.log(`lease taken: ${l.who}${l.task ? ` - ${l.task}` : ''} for ${l.expectMinutes} min`); return 0;
  }
  if (cmd === 'release') { if (!rest[0]) throw new UsageError('Usage: release <who>'); const r = releaseLease(rest[0], { force }); console.log(r.released ? `released ${r.was.who}` : r.reason); return 0; }
  if (cmd === 'wait') return (await waitIdle({ maxMinutes: Number(flag('--max-minutes') ?? 30), who: flag('--who') })) ? 0 : 3;
  if (cmd === 'status') { const s = await gpuStatus(); console.log(argv.includes('--json') ? JSON.stringify(s, null, 2) : formatText(s)); return 0; }
  throw new UsageError('Usage: gpu-share.mjs [--json] | lease <who> <task> <minutes> [--private] | release <who> | wait [--max-minutes N] [--who <who>]');
}
export function runCli(argv = process.argv.slice(2)) {
  main(argv).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = e instanceof UsageError ? 2 : 1; });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
