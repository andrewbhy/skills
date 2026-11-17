import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkReceipt } from './verify-receipt.mjs';

const refuse = rule => { throw Object.assign(new Error(rule), { exitCode: 1 }); };
const invalid = () => { throw Object.assign(new Error('invalid use'), { exitCode: 2 }); };
const text = value => typeof value === 'string';
const list = value => Array.isArray(value) && value.every(text);
const fullSha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const branch = value => text(value) && value.length > 0 && !/^[-]/.test(value) && !/[\s\x00-\x1f\x7f]/.test(value);
const cell = value => value.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
const bullet = value => value.replace(/\r?\n/g, ' ');
export const bodyHash = (title, body) => createHash('sha256').update(`${title}\n${body}`).digest('hex');

export function scanBody(body, { products = [], machine = hostname(), home = homedir() } = {}) {
  if (/(?:[a-z]:[\\/]|\\\\[^\s]+[\\/]|(?:^|[\s("'`])\/(?!\/)[\w.~-])/im.test(body)) refuse('leak: absolute path');
  if (/(?:~[\\/]|\$HOME\b|\$\{HOME\}|%USERPROFILE%|\/home\/|\/Users\/)/i.test(body) || home && body.toLowerCase().includes(home.toLowerCase())) refuse('leak: home folder');
  if (machine && body.toLowerCase().includes(machine.toLowerCase())) refuse('leak: machine name');
  if (/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|xox[bp]-[A-Za-z0-9-]{10,})\b|\b(?:token|password|secret)\s*[:=]\s*\S{8,}|-----BEGIN [A-Z ]*PRIVATE KEY|\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i.test(body)) refuse('leak: token');
  if (products.some(name => name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body))) refuse('leak: consuming product');
}

export function renderBody(spec, options) {
  if (!options || !options.root || !existsSync(options.root) || !statSync(options.root).isDirectory() || !fullSha(options.commit) || options.base !== undefined && !fullSha(options.base)) invalid();
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !text(spec.title) || !text(spec.why) || !Array.isArray(spec.changes)
      || !spec.changes.every(row => row && ['what', 'before', 'after'].every(key => text(row[key])))
      || !list(spec.how) || !list(spec.open) || !Array.isArray(spec.verify)
      || !spec.verify.every(item => item && text(item.text) && typeof item.done === 'boolean' && (item.evidence === undefined || text(item.evidence)))) invalid();
  if (!spec.title.trim() || /[\r\n\u2028\u2029]/u.test(spec.title) || [...spec.title].length > 72) refuse('title: one line of 1 to 72 characters required');
  scanBody(spec.title, options);
  if (!spec.why.trim()) refuse('why: empty');
  if (spec.why.trim().split(/\s+/).length > 80) refuse('cap: why 80 words');
  if (spec.changes.length > 6) refuse('cap: changes 6 rows');
  if (spec.how.length > 5) refuse('cap: how 5 bullets');
  if (spec.open.length > 5) refuse('cap: open 5 bullets');
  for (const item of spec.verify) if (item.done) {
    const evidence = item.evidence ?? '';
    if (!/\d/.test(evidence) || !/(?:^|\s|`)(?!\.\.\/)(?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]+(?::\d+)?(?:$|[\s`),])/i.test(evidence)
        || isAbsolute(evidence) || /(?:^|[\s/])\.\.(?:\/|$)/.test(evidence)) refuse('evidence: number and repo-relative path required');
  }
  if (options.branch !== undefined && !branch(options.branch) || options.targetBase !== undefined && !branch(options.targetBase)) invalid();
  let stack = '';
  if (options.stack !== undefined || options.stackBase !== undefined) {
    const match = /^(\d+)\/(\d+)$/.exec(options.stack ?? '');
    if (!match || +match[1] < 1 || +match[1] > +match[2] || !Number.isSafeInteger(+match[2]) || !branch(options.stackBase)) invalid();
    stack = `Part ${+match[1]} of ${+match[2]}, builds on ${options.stackBase}\n\n`;
  }
  const receipt = checkReceipt(options.root, options.commit, { ...(options.base ? { base: options.base } : {}), ...(options.home ? { home: options.home } : {}) });
  const body = `## Why\n\n${stack}${spec.why}\n\n## What changes\n\n| What | Before | After |\n|---|---|---|\n${spec.changes.map(row => `| ${cell(row.what)} | ${cell(row.before)} | ${cell(row.after)} |`).join('\n')}\n\n## How\n\n${spec.how.map(value => `- ${bullet(value)}`).join('\n')}\n\n## Verify\n\n${receipt.line}\n${spec.verify.map(item => `- [${item.done ? 'x' : ' '}] ${bullet(item.text)}${item.evidence ? ` (${bullet(item.evidence)})` : ''}`).join('\n')}\n\n## Open\n\n${spec.open.map(value => `- ${bullet(value)}`).join('\n')}\n`;
  scanBody(body, options);
  return { title: spec.title, body, status: receipt.ok ? 'ready' : `draft: ${receipt.state}`, hash: bodyHash(spec.title, body) };
}

// All host calls use argv and a temporary body file. No operation pushes.
export function publishBody(rendered, options) {
  if (!branch(options.branch) || !branch(options.targetBase) || !options.scratch || !['gh', 'glab'].includes(options.host)) invalid();
  mkdirSync(options.scratch, { recursive: true });
  const file = join(options.scratch, `pr-body-${randomUUID()}.md`);
  try {
    writeFileSync(file, rendered.body, { flag: 'wx', mode: 0o600 });
    let auth;
    try { auth = JSON.parse(readFileSync(options.authorize, 'utf8')); } catch { refuse('authorization: required'); }
    if (!auth || auth.branch !== options.branch || auth.bodyHash !== rendered.hash || auth.title !== rendered.title) refuse('authorization: branch, body hash and title required');
    const args = options.host === 'gh'
      ? ['pr', 'create', '--head', options.branch, '--base', options.targetBase, '--title', rendered.title, '--body-file', file]
      : ['mr', 'create', '--source-branch', options.branch, '--target-branch', options.targetBase, '--title', rendered.title, '--description', rendered.body];
    if (rendered.status !== 'ready') args.push('--draft');
    // Host stdout/stderr may contain user content; report only a fixed result.
    const result = spawnSync(options.host, args, { shell: false, stdio: 'pipe', env: options.env ?? process.env });
    if (result.error || result.status !== 0) refuse(`publish: host failed (exit ${Number.isInteger(result.status) ? result.status : 1})`);
  } finally { rmSync(file, { force: true }); }
}

export function prCLI(argv) {
  const [action, specFile, ...args] = argv;
  if (!['render', 'publish'].includes(action) || !specFile) invalid();
  const options = { products: [] }, flags = { '--root': 'root', '--commit': 'commit', '--base': 'base', '--stack': 'stack', '--stack-base': 'stackBase', '--scratch': 'scratch', '--branch': 'branch', '--target-base': 'targetBase', '--host': 'host', '--authorize': 'authorize' };
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || value.startsWith('--')) invalid();
    if (flag === '--product') options.products.push(value);
    else if (flags[flag] && options[flags[flag]] === undefined) options[flags[flag]] = value;
    else invalid();
  }
  let spec;
  try { spec = JSON.parse(readFileSync(specFile, 'utf8')); } catch { invalid(); }
  const rendered = renderBody(spec, options);
  let file;
  if (action === 'publish') publishBody(rendered, options);
  else if (options.scratch) {
    if (!branch(options.branch) || !branch(options.targetBase)) invalid();
    mkdirSync(options.scratch, { recursive: true });
    file = join(options.scratch, `pr-body-${randomUUID()}.md`);
    writeFileSync(file, rendered.body, { flag: 'wx', mode: 0o600 });
  }
  return { ...rendered, file, branch: options.branch, base: options.targetBase };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = prCLI(process.argv.slice(2));
    console.error(`title: ${result.title}`);
    process.stdout.write(result.body);
    if (result.file) console.error(`Body: ${result.file}\nBranch: ${result.branch}\nBase: ${result.base}`);
    console.error(result.status);
  } catch (error) { console.error(error.exitCode ? error.message : 'operation failed'); process.exitCode = error.exitCode ?? 1; }
}
