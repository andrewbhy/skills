if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-pr/verify-receipt.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Local suite evidence, shared by verification and review helpers.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statePath, writeJson, writeText } from './jig-store.mjs';

const hashPattern = /^[a-f0-9]{64}$/;
const fullSha = /^[a-f0-9]{40}$/;
const invalid = message => Object.assign(new Error(message), { exitCode: 2 });
function ref(value) { if (typeof value !== 'string' || !value || /^-/.test(value) || /[\s\x00-\x1f\x7f]/.test(value)) throw invalid('Invalid commit ref'); return value; }
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commitId = (root, value) => {
  const commit = git(root, ['rev-parse', '--verify', '--end-of-options', ref(value) + '^{commit}']);
  if (!fullSha.test(commit)) throw invalid('Ref did not resolve to a full commit');
  return commit;
};
const treeId = (root, commit) => git(root, ['rev-parse', commit + '^{tree}']);
const headState = root => git(root, ['show', '--no-patch', '--format=%H%n%T', 'HEAD']).split('\n');
const clean = root => git(root, ['status', '--porcelain', '--untracked-files=no']) === '';
const title = text => text.trim().replace(/\s+\([\d.]+m?s\)$/, '');
const titles = value => Array.isArray(value) && value.length <= 5000 && value.every(t => typeof t === 'string' && t.length > 0 && t.length <= 500 && title(t) === t) && new Set(value).size === value.length;
const count = value => Number.isSafeInteger(value) && value >= 0;
const logLimit = 20 * 1024 * 1024;
const truncated = Buffer.from('\n[truncated: suite output exceeded 20 MiB]\n');
function logBytes(output) {
  const bytes = Buffer.from(output);
  if (bytes.length <= logLimit) return bytes;
  let end = logLimit - truncated.length;
  // Do not cut a UTF-8 character in half at the retained prefix boundary.
  while ((bytes[end] & 0xc0) === 0x80) end--;
  return Buffer.concat([bytes.subarray(0, end), truncated]);
}

function launchCommand(command, root) {
  if (process.platform !== 'win32') return { argv: command };
  const name = command[0];
  if (/^npm(?:\.cmd)?$/i.test(name)) {
    const script = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    return existsSync(script) ? { argv: [process.execPath, script, ...command.slice(1)] } : { error: 'npm-cli.js missing beside node' };
  }
  let target = name;
  if (!extname(name)) {
    const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
    const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';');
    const directories = /[\\/]/.test(name) ? [root] : [root, ...path.split(delimiter)];
    search: for (const directory of directories) for (const extension of extensions) {
      const candidate = resolve(directory, name + extension);
      if (existsSync(candidate)) { target = candidate; break search; }
    }
  }
  return /\.(?:cmd|bat)$/i.test(target)
    ? { error: `cannot run ${basename(target)} without a shell on Windows; pass its node script` }
    : { argv: command };
}

export function parseSummary(output) {
  const text = output.replace(/\x1b\[[0-9;]*m/g, '');
  const summary = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped', 'cancelled']) {
    const matches = [...text.matchAll(new RegExp(`^(?:#|ℹ) ${key} (\\d+)\\s*$`, 'gm'))];
    if (matches.length !== 1) return null;
    summary[key] = Number(matches[0][1]);
  }
  const beforeSummary = text.split(/^(?:#|ℹ) tests /m)[0];
  summary.failing = [...new Set([...beforeSummary.matchAll(/^\s*(?:✖\s+|not ok \d+ - )(.+)$/gm)].map(m => title(m[1])))];
  if (!Object.values(summary).filter(v => typeof v === 'number').every(count) || summary.cancelled !== 0
      || summary.pass + summary.fail + summary.skipped > summary.tests || !titles(summary.failing)
      || (summary.fail === 0 ? summary.failing.length !== 0 : summary.failing.length < summary.fail)) return null;
  return summary;
}

function validReceipt(r) {
  return r && typeof r === 'object' && typeof r.commit === 'string' && fullSha.test(r.commit) && typeof r.tree === 'string' && fullSha.test(r.tree)
    && typeof r.root === 'string' && r.root === resolve(r.root)
    && Array.isArray(r.command) && r.command.length > 0 && r.command.length <= 1000
    && r.command.every(v => typeof v === 'string' && v.length <= 32768 && !v.includes('\0')) && r.command[0].length > 0
    && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at))
    && ['tests', 'pass', 'fail', 'skipped'].every(k => count(r[k]))
    && r.pass + r.fail + r.skipped <= r.tests && titles(r.failing) && titles(r.knownFailing)
    && (r.fail === 0 ? r.failing.length === 0 : r.failing.length >= r.fail)
    && r.knownFailing.every(t => r.failing.includes(t)) && typeof r.outputHash === 'string' && hashPattern.test(r.outputHash)
    && (!Object.hasOwn(r, 'log') || r.log === `${r.commit}.log`)
    && (r.base === null || typeof r.base === 'string' && fullSha.test(r.base));
}
function load(root, commit, options) {
  const path = statePath(root, `verify-receipts/${commit}.json`, options);
  try {
    if (statSync(path).size > 8 * 1024 * 1024) return { state: 'corrupt' };
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    if (!validReceipt(receipt) || receipt.commit !== commit) return { state: 'corrupt' };
    // A commit's tree is the same in every worktree of the repository; the recording folder is informational only.
    if (receipt.tree !== treeId(root, commit)) return { state: 'stale' };
    if (Object.hasOwn(receipt, 'log')) {
      try {
        const log = statePath(root, `verify-receipts/${receipt.log}`, options);
        if (statSync(log).size > logLimit || createHash('sha256').update(readFileSync(log)).digest('hex') !== receipt.outputHash) return { state: 'corrupt' };
      } catch { return { state: 'corrupt' }; }
    }
    return { state: 'valid', receipt };
  } catch (error) { return { state: error.code === 'ENOENT' ? 'missing' : 'corrupt' }; }
}

export function checkReceipt(root, value, { base, ...options } = {}) {
  ref(value); if (base !== undefined) ref(base);
  root = resolve(root);
  let commit;
  try { commit = commitId(root, value); } catch { return { state: 'missing', ok: false, line: `Not verified: missing commit ${value}` }; }
  return checkResolved(root, commit, load(root, commit, options), { base, ...options });
}

function checkResolved(root, commit, loaded, { base, ...options }) {
  const refuse = (state, reason) => ({ state, ok: false, line: `Not verified: ${reason} @ ${commit.slice(0, 7)}` });
  if (loaded.state !== 'valid') return refuse(loaded.state, `${loaded.state} receipt`);
  const r = loaded.receipt;
  let known = [];
  if (r.fail > 0) {
    const baseValue = base ?? r.base;
    if (!baseValue) return refuse('no base receipt', 'no base receipt');
    let baseId;
    try { baseId = commitId(root, baseValue); } catch { return refuse('no base receipt', 'no base receipt'); }
    try { git(root, ['merge-base', '--is-ancestor', baseId, commit]); } catch { return refuse('base not an ancestor', 'base not an ancestor'); }
    if (baseId === commit) return refuse('base not an ancestor', 'base not an ancestor (must precede commit)');
    const b = load(root, baseId, options);
    if (b.state !== 'valid') return refuse('no base receipt', b.state === 'missing' ? 'no base receipt' : `base receipt ${b.state}`);
    const added = r.failing.filter(t => !b.receipt.failing.includes(t));
    if (added.length) return refuse('new failures', `new failures: ${added.join('; ')}`);
    known = r.failing;
  }
  return { state: 'valid', ok: true, receipt: r, line: `Full suite: ${r.pass} pass, ${r.fail} fail${known.length ? ` (${r.fail} known on base)` : ''} @ ${commit.slice(0, 7)}` };
}

export async function recordReceipt(root, command, { base, force = false, ...options } = {}) {
  if (base !== undefined) ref(base);
  if (!Array.isArray(command) || !command.length || command.some(v => typeof v !== 'string' || v.includes('\0'))) throw invalid('Expected command argv after --');
  root = resolve(root);
  const launch = launchCommand(command, root);
  if (launch.error) return { code: 1, line: `Not verified: ${launch.error}` };
  if (!clean(root)) throw invalid('Tracked tree is dirty');
  const [commit, tree] = headState(root);
  const baseId = base === undefined ? null : commitId(root, base);
  const old = load(root, commit, options);
  if (!force && old.state === 'valid' && JSON.stringify(old.receipt.command) === JSON.stringify(command) && old.receipt.base === baseId) {
    const checked = checkResolved(root, commit, old, { ...options, ...(baseId ? { base: baseId } : {}) });
    return { code: checked.ok ? 0 : 1, line: checked.line, reused: true };
  }
  const run = await new Promise(done => {
    let output = '', bytes = 0, overflow = false;
    let child;
    try { child = spawn(launch.argv[0], launch.argv.slice(1), { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { done({ output, status: null, error: error.code ?? 'UNKNOWN' }); return; }
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', data => { bytes += Buffer.byteLength(data); if (bytes > 64 * 1024 * 1024) { overflow = true; child.kill(); } else output += data; });
    }
    child.on('error', error => done({ output, status: null, error: error.code ?? 'UNKNOWN' }));
    child.on('close', (status, signal) => done({ output, status, signal, overflow }));
  });
  const [afterCommit, afterTree] = headState(root);
  if (afterCommit !== commit || afterTree !== tree || !clean(root)) throw invalid('HEAD or tracked tree moved during suite');
  if (run.error) return { code: 1, line: `Not verified: spawn error: ${run.error}` };
  const summary = parseSummary(run.output);
  if (!summary || run.overflow || run.signal || run.status !== (summary.fail ? 1 : 0)) return { code: 1, line: 'Not verified: suite crashed or no valid summary' };
  const { cancelled, ...counts } = summary;
  const log = `${commit}.log`, bytes = logBytes(run.output);
  const receipt = { commit, tree, root, command, at: new Date().toISOString(), ...counts, log, outputHash: createHash('sha256').update(bytes).digest('hex'), base: baseId, knownFailing: [] };
  if (baseId) {
    const b = load(root, baseId, options);
    if (b.state === 'valid') receipt.knownFailing = receipt.failing.filter(t => b.receipt.failing.includes(t));
  }
  if (!validReceipt(receipt)) return { code: 1, line: 'Not verified: invalid suite evidence' };
  writeText(statePath(root, `verify-receipts/${log}`, options), bytes, options);
  writeJson(statePath(root, `verify-receipts/${commit}.json`, options), receipt, options);
  const checked = checkResolved(root, commit, { state: 'valid', receipt }, { ...options, ...(baseId ? { base: baseId } : {}) });
  return { code: checked.ok ? 0 : 1, line: checked.line };
}

export async function receiptCLI(argv, root = process.cwd()) {
  const [action, ...args] = argv;
  if (!['record', 'check', 'line'].includes(action)) throw invalid('Usage: verify-receipt.mjs record [--base ref] [--force] -- command | check ref [--base ref] | line ref [--base ref]');
  const options = {};
  const value = action === 'record' ? undefined : ref(args.shift());
  while (args.length && args[0] !== '--') {
    const flag = args.shift();
    if (flag === '--base' && options.base === undefined) options.base = ref(args.shift());
    else if (flag === '--force' && action === 'record' && !options.force) options.force = true;
    else throw invalid('Invalid arguments');
  }
  if (action === 'record') {
    if (args.shift() !== '--' || !args.length) throw invalid('Expected command argv after --');
    return recordReceipt(root, args, options);
  }
  if (args.length) throw invalid('Invalid arguments');
  const result = checkReceipt(root, value, options);
  return { code: action === 'line' || result.ok ? 0 : 1, line: result.line };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { const result = await receiptCLI(process.argv.slice(2)); console.log(result.line); process.exitCode = result.code; }
  catch (error) { console.error(error.exitCode === 2 ? error.message : 'Not verified: receipt operation failed'); process.exitCode = error.exitCode ?? 1; }
}
