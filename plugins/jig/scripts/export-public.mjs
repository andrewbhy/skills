#!/usr/bin/env node
// Public export: builds one skills repository from an allowlist: plugins/<plugin>/ holds the jig plugin (Claude Code and Codex),
// the root holds the Claude and Codex marketplace files, README, LICENSE and NOTICE. One commit on top of any previous release.
// Never pushes, never touches the network except npm in --verify.
// Exit 0 done or clean dry run, 1 finding or refusal, 2 invalid invocation or config.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeUtf8, discoverSiblings, fileIndex, formatFinding, linkFindings, linkResolves, loadPrivateTerms, makeContext, rewriteMarkdownLinks, scanPath, scanText } from './portability-scan.mjs';

export class Refusal extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

export const reservedMarketplaceNames = ['claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official', 'anthropic-marketplace', 'anthropic-plugins', 'agent-skills', 'knowledge-work-plugins', 'life-sciences'];
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slash = (path) => path.split(sep).join('/');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const inside = (child, parent) => { const rel = relative(resolve(parent), resolve(child)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };

// ---------- config ----------
export function loadConfig(root) {
  let config;
  try { config = JSON.parse(readFileSync(join(root, 'export-public.json'), 'utf8')); } catch (error) { throw new Refusal(`export-public.json missing or malformed: ${error.message}`, 2); }
  const lists = ['include', 'exclude', 'binary'];
  for (const key of lists) if (!Array.isArray(config[key])) throw new Refusal(`export-public.json: "${key}" must be an array`, 2);
  if (!config.include.every((p) => typeof p === 'string')) throw new Refusal('export-public.json: include entries must be strings', 2);
  if (!config.exclude.every((p) => typeof p === 'string')) throw new Refusal('export-public.json: exclude entries must be strings', 2);
  if (!config.binary.every((e) => e && typeof e.path === 'string' && /^[0-9a-f]{64}$/.test(e.sha256 ?? ''))) throw new Refusal('export-public.json: binary entries need path and sha256', 2);
  for (const key of ['pluginName', 'licenseHolder', 'marketplaceName', 'marketplaceOwner', 'marketplaceRepo', 'releaseAuthor']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Refusal(`export-public.json: "${key}" is required`, 2);
  }
  config.rename ??= {};
  config.pluginDir ??= `plugins/${config.pluginName}`;
  config.codexCategory ??= 'Productivity';
  config.rootTemplates ??= { 'docs/public/skills-readme.md': 'README.md' };
  return config;
}

// ---------- globs: "dir/" prefix, "*" within a folder, "**" across folders, otherwise exact ----------
export function globToRegExp(pattern) {
  if (pattern.endsWith('/')) return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')}`);
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') { if (pattern[i + 1] === '*') { source += '.*'; i += 1; } else source += '[^/]*'; } else if (c === '?') source += '[^/]'; else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}
export function selectFiles(paths, config) {
  const include = config.include.map(globToRegExp), exclude = config.exclude.map(globToRegExp);
  const keep = [], left = [];
  for (const path of paths) (include.some((r) => r.test(path)) && !exclude.some((r) => r.test(path)) ? keep : left).push(path);
  return { keep, left };
}

// ---------- git ----------
// An empty file stands in for the person's global git config (the null device is not accepted by git on Windows).
function emptyGitConfig() {
  const path = join(tmpdir(), 'jig-export-empty-gitconfig');
  if (!existsSync(path)) writeFileSync(path, '');
  return path;
}
const cleanEnv = (extra = {}) => ({ ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyGitConfig(), GIT_TERMINAL_PROMPT: '0', ...extra });
function git(cwd, args, { env, input } = {}) {
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', env: cleanEnv(env), input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
}
function readCommitted(source) {
  let raw;
  try { raw = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd: source, maxBuffer: 1 << 28 }); } catch { throw new Refusal(`${source}: no committed tree (git ls-tree HEAD failed)`); }
  const entries = raw.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, oid] = line.slice(0, tab).split(' ');
    return { mode, type, oid, path: line.slice(tab + 1) };
  });
  const blobs = entries.filter((e) => e.type === 'blob');
  const result = spawnSync('git', ['cat-file', '--batch'], { cwd: source, input: blobs.map((e) => e.oid).join('\n') + '\n', maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Refusal('git cat-file failed');
  const out = result.stdout;
  let at = 0;
  const files = new Map();
  for (const entry of blobs) {
    const eol = out.indexOf(0x0a, at);
    const size = Number(out.slice(at, eol).toString('utf8').split(' ')[2]);
    entry.buffer = out.subarray(eol + 1, eol + 1 + size);
    at = eol + 1 + size + 1;
    files.set(entry.path, { buffer: entry.buffer, mode: entry.mode });
  }
  for (const entry of entries) if (entry.type !== 'blob') files.set(entry.path, { buffer: Buffer.alloc(0), mode: entry.mode });
  return files;
}

// ---------- plugin build ----------
const helperPattern = /(?<![\w/.${}-])scripts\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)/g;
// SKILL.md bodies get ${CLAUDE_PLUGIN_ROOT} paths (substituted by Claude Code, forward slashes, quoted).
export function rewriteSkillBody(name, text) {
  let out = text.replaceAll('<skill-folder>/', `\${CLAUDE_PLUGIN_ROOT}/skills/${name}/`);
  out = out.replace(helperPattern, (_m, rest) => `\${CLAUDE_PLUGIN_ROOT}/scripts/${rest}`);
  out = out.replace(/\bnode (\$\{CLAUDE_PLUGIN_ROOT\}\/[^\s"'`)<>]+)/g, 'node "$1"');
  // Any "scripts/" not directly under the plugin root or this skill's own folder is a repo-relative path and fails the build.
  const left = [...out.matchAll(/(?<!\$\{CLAUDE_PLUGIN_ROOT\}\/)(?<!\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/[\w-]+\/)(?<![A-Za-z0-9_])scripts\/[\w.-]+/g)];
  if (left.length) throw new Refusal(`${name}/SKILL.md: repo-relative scripts/ path left after rewrite: ${left[0][0]}`);
  return out;
}
// Supporting documents are read with the file reader, which does not substitute variables: they point at the skill folder.
export function rewriteSupportDoc(text) {
  return text.replace(helperPattern, (_m, rest) => `<skill-folder>/../../scripts/${rest}`).replace(/\bnode (<skill-folder>\/[^\s"'`)]+)/g, 'node "$1"');
}
export function skillNames(files) {
  const names = new Set();
  for (const path of files.keys()) { const m = path.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/); if (m) names.add(m[1]); }
  return [...names].sort();
}
export function borrowedRows(text) {
  return text.split('\n').filter((line) => /^\|/.test(line)).slice(2).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim())).map(([name, repository, pin, licence, note]) => ({ name, repository, pin, licence, note }));
}
export function buildNotice(files, version) {
  const borrowed = files.get('docs/borrowed.md');
  const lines = [`jig ${version} is MIT licensed (see LICENSE). It adapts material from the sources below.`, ''];
  if (borrowed) for (const row of borrowedRows(borrowed.buffer.toString('utf8'))) lines.push(`- ${row.name} (${row.repository}, pin ${row.pin}, ${row.licence}): ${row.note}`);
  const notices = [...files.keys()].filter((p) => /^\.agents\/skills\/[^/]+\/NOTICE$/.test(p)).sort();
  for (const path of notices) lines.push('', `----- ${path} -----`, files.get(path).buffer.toString('utf8').trimEnd());
  return lines.join('\n') + '\n';
}
export const mitLicense = (holder, year) => `MIT License

Copyright (c) ${year} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
export const fillPlaceholders = (text, config) => text.replaceAll('{{marketplaceRepo}}', config.marketplaceRepo).replaceAll('{{marketplaceName}}', config.marketplaceName).replaceAll('{{pluginName}}', config.pluginName).replaceAll('{{pluginDir}}', config.pluginDir);
const file = (text) => ({ buffer: Buffer.from(text, 'utf8'), mode: '100644' });

// Builds the final file map of the plugin copy from the committed tree.
export function buildCopy(tree, config, { version, year }) {
  const { keep } = selectFiles([...tree.keys()], config);
  const copy = new Map();
  for (const path of keep) {
    const dest = config.rename[path] ?? path;
    copy.set(dest, tree.get(path));
  }
  // skills/<name>/ are real, rewritten copies of .agents/skills/<name>/ (the pointers under .claude/skills are not shipped as skills).
  for (const name of skillNames(copy)) {
    const prefix = `.agents/skills/${name}/`;
    for (const path of [...copy.keys()].filter((p) => p.startsWith(prefix))) {
      const entry = copy.get(path);
      const target = `skills/${name}/${path.slice(prefix.length)}`;
      let buffer = entry.buffer;
      if (/\.md$/i.test(path)) {
        const text = decodeUtf8(buffer);
        if (text !== null) buffer = Buffer.from(path.endsWith('/SKILL.md') ? rewriteSkillBody(name, text) : rewriteSupportDoc(text), 'utf8');
      }
      copy.set(target, { buffer, mode: entry.mode });
    }
  }
  // The work README names the install commands from config, never from literals.
  for (const path of ['README.md', 'docs/jig-at-work.md']) {
    const readme = copy.get(path);
    if (readme) copy.set(path, { buffer: Buffer.from(fillPlaceholders(readme.buffer.toString('utf8'), config), 'utf8'), mode: readme.mode });
  }
  if (!copy.has('.gitattributes')) copy.set('.gitattributes', file('* text=auto eol=lf\n'));
  // The shipped skills sit one folder higher than .agents/skills, so links to the repository root lose one "../"; links that still
  // do not resolve inside a generated supporting document lose their target and keep their text (listed in the report, not hidden).
  const dropped = [];
  const index = fileIndex([...copy.keys()].concat(['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'LICENSE', 'NOTICE']));
  for (const [path, entry] of [...copy]) {
    if (!path.startsWith('skills/') || !/\.md$/i.test(path)) continue;
    const text = decodeUtf8(entry.buffer);
    if (text === null) continue;
    const isBody = path.endsWith('/SKILL.md');
    const next = rewriteMarkdownLinks(text, (raw) => {
      let target = raw.replace(/^(\.\.\/){3}/, '../../');
      const r = linkResolves(path, target, index);
      if (!r || r.ok) return target;
      if (isBody) return target; // a body link that does not resolve stays a finding
      dropped.push(`${path}: ${raw}`);
      return null;
    });
    if (next !== text) copy.set(path, { buffer: Buffer.from(next, 'utf8'), mode: entry.mode });
  }
  // Listed documents (config linkDrop) point at private notes in places; those links lose their target and keep their text, and are reported.
  for (const path of config.linkDrop ?? []) {
    const entry = copy.get(path);
    const text = entry && decodeUtf8(entry.buffer);
    if (!text) continue;
    const next = rewriteMarkdownLinks(text, (raw) => {
      const r = linkResolves(path, raw, index);
      if (!r || r.ok) return raw;
      dropped.push(`${path}: ${raw}`);
      return null;
    });
    if (next !== text) copy.set(path, { buffer: Buffer.from(next, 'utf8'), mode: entry.mode });
  }
  const manifest = {
    name: config.pluginName, version, description: config.pluginDescription ?? config.pluginName,
    author: { name: config.licenseHolder }, homepage: `https://github.com/${config.marketplaceRepo}/tree/main/${config.pluginDir}`, repository: `https://github.com/${config.marketplaceRepo}`,
    license: 'MIT', keywords: ['agents', 'planning', 'review', 'verification'],
  };
  copy.set('.claude-plugin/plugin.json', file(JSON.stringify(manifest, null, 2) + '\n'));
  copy.set('.codex-plugin/plugin.json', file(JSON.stringify({
    ...manifest, skills: './skills/',
    interface: { displayName: config.pluginName, shortDescription: manifest.description, developerName: config.licenseHolder, category: config.codexCategory, capabilities: ['Read', 'Write'] },
  }, null, 2) + '\n'));
  copy.set('LICENSE', file(mitLicense(config.licenseHolder, year)));
  copy.set('NOTICE', file(buildNotice(tree, version)));
  return { files: copy, dropped };
}

// ---------- repository root: marketplaces, README, LICENSE, NOTICE ----------
export function claudeMarketplaceDoc(config, existing, version) {
  const entry = { name: config.pluginName, description: config.pluginDescription ?? config.pluginName, version, license: 'MIT', homepage: `https://github.com/${config.marketplaceRepo}/tree/main/${config.pluginDir}`, source: `./${config.pluginDir}` };
  const keepers = Array.isArray(existing?.plugins) ? existing.plugins.filter((p) => p && p.name !== config.pluginName) : [];
  const doc = { ...(existing ?? {}), name: config.marketplaceName, owner: { name: config.marketplaceOwner }, plugins: [...keepers, entry] };
  if (!doc.description) doc.description = `Marketplace for ${config.pluginName} and related tools.`;
  return doc;
}
// The Codex marketplace file (repo scope: .agents/plugins/marketplace.json); source.path is relative to the repository root.
export function codexMarketplaceDoc(config, existing) {
  const entry = { name: config.pluginName, source: { source: 'local', path: `./${config.pluginDir}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: config.codexCategory };
  const keepers = Array.isArray(existing?.plugins) ? existing.plugins.filter((p) => p && p.name !== config.pluginName) : [];
  return { ...(existing ?? {}), name: config.marketplaceName, interface: { displayName: config.marketplaceName }, plugins: [...keepers, entry] };
}
// The repository workflow: the plugin's CI run from the plugin folder.
export function rootWorkflow(text, config) {
  if (!/^    steps:/m.test(text)) throw new Refusal('docs/public/ci.yml: no "    steps:" line to anchor the plugin folder default');
  return text.replace(/^    steps:/m, `    defaults:\n      run:\n        working-directory: ${config.pluginDir}\n    steps:`);
}
export function validateMarketplaceConfig(config) {
  if (reservedMarketplaceNames.includes(config.marketplaceName) || !kebab.test(config.marketplaceName)) throw new Refusal(`marketplaceName "${config.marketplaceName}" is reserved or not kebab-case`, 2);
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.marketplaceRepo)) throw new Refusal('marketplaceRepo must look like owner/repo', 2);
  if (!/^plugins\/[\w.-]+$/.test(config.pluginDir)) throw new Refusal('pluginDir must be plugins/<name>', 2);
}
// Everything the export writes: the plugin under pluginDir plus the root files. `existing` holds the previous marketplace files of the target.
export function buildRepo(tree, config, { version, year }, existing = {}) {
  const { files: plugin, dropped } = buildCopy(tree, config, { version, year });
  const workflow = plugin.get('.github/workflows/ci.yml');
  plugin.delete('.github/workflows/ci.yml');
  if (workflow) plugin.set('docs/public/ci.yml', workflow); // the plugin keeps the source so its own tests can rebuild the export
  const files = new Map();
  for (const [path, entry] of plugin) files.set(`${config.pluginDir}/${path}`, entry);
  if (workflow) files.set('.github/workflows/jig.yml', file(rootWorkflow(workflow.buffer.toString('utf8'), config)));
  for (const [from, to] of Object.entries(config.rootTemplates)) {
    const entry = tree.get(from);
    if (entry) files.set(to, file(fillPlaceholders(entry.buffer.toString('utf8'), config)));
  }
  files.set('.claude-plugin/marketplace.json', file(JSON.stringify(claudeMarketplaceDoc(config, existing.claude, version), null, 2) + '\n'));
  files.set('.agents/plugins/marketplace.json', file(JSON.stringify(codexMarketplaceDoc(config, existing.codex), null, 2) + '\n'));
  files.set('LICENSE', plugin.get('LICENSE'));
  files.set('NOTICE', plugin.get('NOTICE'));
  files.set('.gitattributes', plugin.get('.gitattributes'));
  return { files, plugin, dropped };
}

// ---------- gates ----------
export function gate(files, ctx, config) {
  const findings = [];
  const binary = new Map(config.binary.map((e) => [`${config.pluginDir}/${e.path}`, e.sha256]));
  let scanned = 0, listed = 0, flagged = 0;
  for (const [path, { buffer, mode }] of files) {
    findings.push(...scanPath(path, ctx));
    if (binary.has(path)) {
      if (sha256(buffer) !== binary.get(path)) findings.push({ file: path, line: 0, kind: 'binary-hash', detail: 'binary file does not match its listed sha256' });
      if (decodeUtf8(buffer) !== null && !buffer.includes(0)) findings.push({ file: path, line: 0, kind: 'binary-text', detail: 'binary list entry decodes as text; scan it instead' });
      listed += 1; continue;
    }
    if (mode === '120000') { findings.push({ file: path, line: 0, kind: 'symlink', detail: 'symlink' }); flagged += 1; continue; }
    if (mode === '160000') { findings.push({ file: path, line: 0, kind: 'submodule', detail: 'submodule' }); flagged += 1; continue; }
    const text = decodeUtf8(buffer);
    if (text === null || buffer.includes(0)) { findings.push({ file: path, line: 0, kind: 'non-utf8', detail: 'not UTF-8 text and not in the binary list' }); flagged += 1; continue; }
    findings.push(...scanText(path, text, ctx));
    scanned += 1;
  }
  if (scanned + listed + flagged !== files.size) findings.push({ file: '(all)', line: 0, kind: 'partial-scan', detail: `scanned ${scanned} + binary ${listed} + flagged ${flagged} != ${files.size} files` });
  findings.push(...linkFindings(files, { exempt: (name) => (config.linkExempt ?? []).some((prefix) => name.startsWith(prefix) || name.startsWith(`${config.pluginDir}/${prefix}`)) }));
  return { findings, scanned, listed, total: files.size };
}
// Release files the repository must hold (A10, A11, A13).
export function releaseGate(repo, config) {
  const missing = [];
  const dir = config.pluginDir;
  const need = ['LICENSE', 'NOTICE', 'README.md', '.gitattributes', '.github/workflows/jig.yml', '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', `${dir}/LICENSE`, `${dir}/NOTICE`, `${dir}/README.md`, `${dir}/.claude-plugin/plugin.json`, `${dir}/.codex-plugin/plugin.json`, `${dir}/.gitattributes`, `${dir}/package-lock.json`];
  for (const path of need) if (!repo.has(path)) missing.push({ file: path, line: 0, kind: 'release-gate', detail: 'required release file is missing' });
  for (const path of [`${dir}/.claude-plugin/plugin.json`, `${dir}/.codex-plugin/plugin.json`]) {
    const manifest = repo.get(path);
    if (!manifest) continue;
    try { if (JSON.parse(manifest.buffer.toString('utf8')).license !== 'MIT') missing.push({ file: path, line: 0, kind: 'release-gate', detail: 'license must be MIT' }); } catch { missing.push({ file: path, line: 0, kind: 'release-gate', detail: 'not JSON' }); }
  }
  return missing;
}

// ---------- staging, validation, verification ----------
export function writeTree(dir, files) {
  for (const [path, { buffer, mode }] of files) {
    const target = join(dir, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer, { mode: mode === '100755' ? 0o755 : 0o644 });
  }
}
function claudeValidate(dir, label, env = process.env) {
  const home = mkdtempSync(join(tmpdir(), 'jig-validate-'));
  try {
    const result = spawnSync('claude', ['plugin', 'validate', dir], { encoding: 'utf8', env: { ...env, CLAUDE_CONFIG_DIR: home, HOME: home, USERPROFILE: home }, timeout: 120000 });
    if (result.error) throw new Refusal(`claude plugin validate could not run for ${label}: ${result.error.message} (use --skip-validate to bypass)`);
    if (result.status !== 0) throw new Refusal(`claude plugin validate failed for ${label}:\n${(result.stdout + result.stderr).trim()}`);
  } finally { rmSync(home, { recursive: true, force: true }); }
}
// npm runs through its own JavaScript entry so no shell is involved (npm is a .cmd shim on Windows).
export function npmCommand() {
  const bin = dirname(process.execPath);
  for (const candidate of [join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]) if (existsSync(candidate)) return [process.execPath, [candidate]];
  return ['npm', []];
}
const tail = (text, n) => text.split('\n').slice(-n).join('\n');
const oneLine = (text, n = 30) => text.split('\n').slice(0, n).join(' | ');
function verifyCopy(repoDir, dir) {
  git(repoDir, ['init', '-q', '-b', 'main']); git(repoDir, ['add', '-A']);
  const [exe, prefix] = npmCommand();
  for (const args of [['ci'], ['test']]) {
    const result = spawnSync(exe, [...prefix, ...args], { cwd: dir, encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 1 << 28, env: process.env });
    if (result.status !== 0) {
      const all = result.stdout + result.stderr;
      const failed = [...new Set(all.split('\n').filter((l) => /^\s*✖/.test(l)).map((l) => l.trim().slice(0, 140)))].slice(0, 25);
      throw new Refusal(`npm ${args.join(' ')} failed in the copy (exit ${result.status}); failing: ${failed.join(' ;; ') || tail(all, 15)}`);
    }
  }
}

// ---------- release commit ----------
function parseAuthor(text) {
  const m = /^(.+?)\s*<([^<>\s@]+@[^<>\s@]+)>$/.exec(text.trim());
  if (!m) throw new Refusal(`author must look like "Name <email>": ${text}`, 2);
  return { name: m[1], email: m[2] };
}
function prepareTarget(out, jigRoots) {
  if (jigRoots.some((root) => inside(out, root) || inside(root, out))) throw new Refusal(`${out}: target is jig, inside jig or contains it`);
  let existed = existsSync(out);
  if (existed) {
    const names = readdirSync(out);
    if (names.length) {
      if (!names.includes('.git')) throw new Refusal(`${out}: not empty and not a git repository`);
      if (git(out, ['status', '--porcelain']).trim()) throw new Refusal(`${out}: has uncommitted changes`);
    }
    try { accessSync(out, constants.W_OK); } catch { throw new Refusal(`${out}: not writable`); }
  }
  return { existed, repo: existed && existsSync(join(out, '.git')) };
}
// Other plugins already in the repository (plugins/<other>/) stay untouched; everything else is replaced.
function replaceTree(out, files, pluginDir) {
  const [top] = pluginDir.split('/');
  for (const name of readdirSync(out)) if (name !== '.git' && name !== top) rmSync(join(out, name), { recursive: true, force: true });
  rmSync(join(out, ...pluginDir.split('/')), { recursive: true, force: true });
  writeTree(out, files);
}
// Commit `files` as one commit on top of any previous release. On any failure the target is put back as it was.
function release(out, state, files, { message, author, allowEmpty, pluginDir }) {
  const env = { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email };
  let before = null;
  if (state.repo) { try { before = git(out, ['rev-parse', 'HEAD']).trim(); } catch { before = null; } }
  const created = !state.existed;
  try {
    mkdirSync(out, { recursive: true });
    if (!state.repo) git(out, ['init', '-q', '-b', 'main']);
    replaceTree(out, files, pluginDir);
    git(out, ['add', '-A']);
    if (process.env.JIG_EXPORT_FAIL_AT === 'commit') throw new Error('forced failure before commit (test seam)');
    if (!allowEmpty && !git(out, ['status', '--porcelain']).trim()) return before;
    git(out, ['commit', '-q', '--no-verify', '--allow-empty', '-m', message], { env });
    return git(out, ['rev-parse', 'HEAD']).trim();
  } catch (error) {
    try {
      if (before) { git(out, ['reset', '-q', '--hard', before]); git(out, ['clean', '-qfdx']); } else if (created) rmSync(out, { recursive: true, force: true });
      else for (const name of readdirSync(out)) if (name !== '.git') rmSync(join(out, name), { recursive: true, force: true });
    } catch { /* report the original failure */ }
    throw error instanceof Refusal ? error : new Refusal(`git step failed, target restored: ${(error.stderr || error.message).toString().trim()}`);
  }
}

// ---------- command line ----------
export function parseArgs(argv) {
  const opts = { flags: new Set() };
  const valued = new Set(['--out', '--author', '--source', '--date']);
  const plain = new Set(['--dry-run', '--list-excluded', '--no-private-list', '--skip-validate', '--skip-sync-check', '--skip-tests', '--verify']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (valued.has(arg)) { if (i + 1 >= argv.length) throw new Refusal(`${arg} needs a value`, 2); opts[arg.slice(2)] = argv[i + 1]; i += 1; } else if (plain.has(arg)) opts.flags.add(arg.slice(2));
    else throw new Refusal(`unknown argument ${arg}`, 2);
  }
  return opts;
}

export function main(argv, { cwd = process.cwd(), env = process.env, log = console.log } = {}) {
  const opts = parseArgs(argv);
  const root = opts.source ? resolve(cwd, opts.source) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const config = loadConfig(root);
  if (!opts.flags.has('list-excluded') && !opts.out) throw new Refusal('--out <dir> is required', 2);
  const tree = readCommitted(root);
  const version = (tree.get('VERSION')?.buffer.toString('utf8') ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Refusal('VERSION must be x.y.z');
  const { keep, left } = selectFiles([...tree.keys()], config);
  if (opts.flags.has('list-excluded')) { for (const path of left.sort()) log(path); log(`${left.length} tracked files left out, ${keep.length} included (nothing written)`); return 0; }

  const out = resolve(cwd, opts.out);
  const mainCheckout = mainRoot(root);
  const jigRoots = [...new Set([root, mainCheckout])];
  log(`repository target: ${out}`);
  validateMarketplaceConfig(config);
  const author = parseAuthor(opts.author ?? config.releaseAuthor);
  const dry = opts.flags.has('dry-run');
  const state = prepareTarget(out, jigRoots);
  if (!opts.flags.has('skip-sync-check')) {
    const check = spawnSync(process.execPath, [join(root, 'scripts', 'sync-skills.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
    if (check.status !== 0) throw new Refusal(`skills are out of sync (npm run check): ${(check.stdout + check.stderr).trim().split('\n')[0]}`);
  }
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']).trim();
  if (dirty) log('note: the working tree has uncommitted changes to tracked files; the export uses the committed HEAD only');

  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const readJson = (rel) => { const path = join(out, ...rel.split('/')); if (!state.repo || !existsSync(path)) return undefined; try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Refusal(`${path}: existing marketplace file is not JSON`); } };
  const existing = { claude: readJson('.claude-plugin/marketplace.json'), codex: readJson('.agents/plugins/marketplace.json') };
  const { files: copy, dropped } = buildRepo(tree, config, { version, year: date.slice(0, 4) }, existing);

  // Private-string gate: names come from the personal list at run time.
  const gaps = [];
  let terms = [];
  if (opts.flags.has('no-private-list')) gaps.push('private list skipped (--no-private-list): private names are NOT checked');
  else {
    const list = loadPrivateTerms(env);
    if (list.gap) throw new Refusal(`${list.gap}; add terms or pass --no-private-list`);
    terms = list.terms;
  }
  const siblingScan = discoverSiblings(dirname(mainCheckout), basename(mainCheckout), [basename(out), config.pluginName, config.marketplaceName, basename(config.marketplaceRepo)]);
  if (siblingScan.gap) gaps.push(siblingScan.gap);
  const ctx = makeContext({ siblings: siblingScan.names, privateTerms: terms });

  const message = `${basename(config.marketplaceRepo)}: ${config.pluginName} ${version}`;
  const result = gate(copy, ctx, config);
  const findings = [...result.findings, ...releaseGate(copy, config)];
  const meta = (label, text) => scanText(label, text, ctx).map((f) => ({ ...f, line: 0 }));
  findings.push(...meta('(release author)', `${author.name} <${author.email}>`), ...meta('(release message)', message));

  for (const gap of gaps) log(`gap: ${gap}`);
  for (const line of dropped) log(`dropped link (generated supporting document): ${line}`);
  log(`scanned ${result.scanned}/${result.total} repository files (${result.listed} binary listed, content skipped)`);

  let stage = null, stageParent = null;
  const wantValidate = !opts.flags.has('skip-validate');
  const wantTests = opts.flags.has('verify') || (!dry && !opts.flags.has('skip-tests'));
  try {
    if ((wantValidate || wantTests) && (!findings.length || opts.flags.has('verify'))) {
      // A private parent folder: the plugin's own portability test looks at its sibling folders, and OS temp holds unrelated repositories.
      stageParent = mkdtempSync(join(tmpdir(), 'jig-export-stage-'));
      stage = join(stageParent, 'repo');
      writeTree(stage, copy);
      const pluginStage = join(stage, ...config.pluginDir.split('/'));
      if (wantValidate) {
        try { claudeValidate(pluginStage, 'plugin', env); } catch (error) { findings.push({ file: '(claude plugin validate)', line: 0, kind: 'validate', detail: oneLine(error.message) }); }
        try { claudeValidate(stage, 'marketplace (repository root)', env); } catch (error) { findings.push({ file: '(claude plugin validate marketplace)', line: 0, kind: 'validate', detail: oneLine(error.message) }); }
      }
      if (wantTests && (opts.flags.has('verify') || !findings.length)) {
        try { verifyCopy(stage, pluginStage); log('npm ci && npm test passed in the plugin folder'); } catch (error) { findings.push({ file: '(npm test in the plugin)', line: 0, kind: 'tests', detail: oneLine(error.message) }); }
      }
    }
  } finally { if (stageParent) rmSync(stageParent, { recursive: true, force: true }); }

  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  for (const f of findings) log(`FINDING ${f.kind}: ${formatFinding(f)}`);
  if (findings.length) {
    log(`${findings.length} findings: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    return 1;
  }
  if (dry) { log('dry run: clean, nothing written'); return 0; }

  const hash = release(out, state, copy, { message, author, allowEmpty: true, pluginDir: config.pluginDir });
  const configText = existsSync(join(out, '.git', 'config')) ? readFileSync(join(out, '.git', 'config'), 'utf8') : '';
  const late = scanText('.git/config', configText, ctx);
  for (const f of late) log(`FINDING ${f.kind}: ${formatFinding(f)}`);
  if (late.length) throw new Refusal('repository holds a private string in .git/config (see findings); fix and re-run');
  log(`release commit ${hash}`);
  return 0;
}
// The main checkout of a worktree (siblings live beside it).
function mainRoot(root) {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
    return dirname(common);
  } catch { return root; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) {
    if (error instanceof Refusal) { console.error(error.message); process.exitCode = error.code; } else throw error;
  }
}
