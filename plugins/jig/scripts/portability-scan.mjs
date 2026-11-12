// Shared scan module: machine paths, sibling repository names, private terms, secrets, file-name rules.
// Owned by the public export (scripts/export-public.mjs); tests/portability.test.mjs imports `scan` from here.
// Findings are plain objects { file, line, kind, detail }; `formatFinding` prints file:line: text.
// Private terms are only ever read from the personal list (JIG_HOME/export-private.txt) at run time.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole word: not preceded or followed by a letter, digit or underscore. Works for terms with punctuation.
const wholeWord = (text) => new RegExp(`(?<![A-Za-z0-9_])${escape(text)}(?![A-Za-z0-9_])`, 'i');
const toSlash = (path) => path.split('\\').join('/');

// Named so each can be tested one by one (tests/export-public.test.mjs).
export const secretPatterns = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
  ['github-pat', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['api-key-sk', /(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/],
  ['slack-token', /\bxox[bp]-[A-Za-z0-9-]{10,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
];
export const secretFileName = /(^|\/)(?:\.env(?:\..*)?|[^/]*\.pem|[^/]*\.key)$/i;
const machinePath = /(?<![\w])[a-z]:[\\/]|\/(?:Users|home)\/[^\s/]+/i;

// ---------- private list ----------
export function privateListPath(env = process.env) {
  return join(env.JIG_HOME ? resolve(env.JIG_HOME) : join(homedir(), '.jig'), 'export-private.txt');
}
export function loadPrivateTerms(env = process.env) {
  const path = privateListPath(env);
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return { terms: [], gap: 'private list missing (JIG_HOME/export-private.txt)' }; }
  const terms = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  return { terms, gap: terms.length ? null : 'private list is empty (JIG_HOME/export-private.txt)' };
}

// ---------- context ----------
// Sibling repositories: folders in `parent` holding a .git directory, minus the checkout itself and `ignore`.
export function discoverSiblings(parent, self, ignore = []) {
  const skip = new Set([self, ...ignore].map((name) => name.toLowerCase()));
  let entries;
  try { entries = readdirSync(parent, { withFileTypes: true }); } catch { return { names: [], gap: 'Sibling discovery unavailable: parent folder cannot be read; checking absolute paths only.' }; }
  const names = entries.filter((entry) => {
    if (!entry.isDirectory() || skip.has(entry.name.toLowerCase())) return false;
    try { return statSync(join(parent, entry.name, '.git')).isDirectory(); } catch { return false; }
  }).map((entry) => entry.name);
  return { names, gap: null };
}
export function makeContext({ siblings = [], privateTerms = [] } = {}) {
  return {
    siblings: siblings.map((name) => [name, wholeWord(name)]),
    privateTerms: privateTerms.map((term) => [term, wholeWord(term)]),
  };
}

// ---------- scanning ----------
export function scanText(file, text, ctx) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const at = index + 1;
    const add = (kind, detail) => findings.push({ file, line: at, kind, detail });
    const bare = line.replace(/\bhttps?:\/\/[^\s<>"'`]+/gi, '');
    if (machinePath.test(bare)) add('machine-path', 'absolute machine path');
    for (const [name, pattern] of ctx.siblings) if (pattern.test(line)) add('sibling', `sibling repository name "${name}"`);
    for (const [term, pattern] of ctx.privateTerms) if (pattern.test(line)) add('private-term', `private term "${term}"`);
    for (const [name, pattern] of secretPatterns) if (pattern.test(line)) add('secret', `secret pattern ${name}`);
  });
  return findings;
}
// A file or folder name: sibling and private names plus secret-looking file names.
export function scanPath(file, ctx) {
  const findings = [];
  const add = (kind, detail) => findings.push({ file, line: 0, kind, detail });
  if (machinePath.test(file)) add('machine-path', 'absolute machine path in a path');
  if (secretFileName.test(file)) add('secret-file', 'secret-looking file name');
  for (const [name, pattern] of ctx.siblings) if (pattern.test(file)) add('sibling-path', `sibling repository name "${name}" in a path`);
  for (const [term, pattern] of ctx.privateTerms) if (pattern.test(file)) add('private-path', `private term "${term}" in a path`);
  return findings;
}
export const formatFinding = (finding) => `${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.detail}`;

// Strict UTF-8: true when the bytes decode without replacement characters (and are not UTF-16 with a BOM).
export function decodeUtf8(buffer) {
  if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { return null; }
}

// ---------- link closure ----------
// Relative links in Markdown and HTML must point inside the copy (a file, or a folder holding files).
export function fileIndex(names) {
  const files = new Set(names), folders = new Set();
  for (const name of files) { const parts = name.split('/'); for (let i = 1; i < parts.length; i += 1) folders.add(parts.slice(0, i).join('/')); }
  return { files, folders };
}
function resolveIn(from, target) {
  const stack = from.split('/').slice(0, -1);
  for (const part of target.split('/')) { if (part === '..') { if (!stack.length) return null; stack.pop(); } else if (part !== '.' && part !== '') stack.push(part); }
  return stack.join('/');
}
// null when the link is not a checkable relative link; else whether it resolves inside the index.
export function linkResolves(from, raw, index) {
  let target = raw.trim().replace(/^<|>$/g, '');
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\/)/i.test(target) || /[<>{}$*]/.test(target)) return null;
  target = decodeURI(target.replace(/[?#].*$/, ''));
  if (!target) return null;
  const full = resolveIn(from, target);
  return { target, ok: full !== null && (index.files.has(full) || index.folders.has(full)) };
}
const mdLink = /(\[[^\]]*\])\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;
// Rewrites Markdown links outside code fences: `fix(raw)` returns a replacement target, or null to drop the link to its text.
export function rewriteMarkdownLinks(text, fix) {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return line.replace(mdLink, (whole, label, raw, title) => {
      const next = fix(raw);
      if (next === raw) return whole;
      return next === null ? label.slice(1, -1) : `${label}(${next}${title})`;
    });
  }).join('\n');
}
export function linkFindings(files, { exempt = () => false } = {}) {
  const index = fileIndex(files.keys());
  const findings = [];
  for (const [name, entry] of files) {
    const buffer = Buffer.isBuffer(entry) ? entry : entry.buffer;
    const markdown = /\.md$/i.test(name), html = /\.html?$/i.test(name);
    if ((!markdown && !html) || exempt(name)) continue;
    const text = decodeUtf8(buffer);
    if (text === null) continue;
    let fenced = false;
    text.split(/\r?\n/).forEach((line, at) => {
      if (markdown && /^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
      if (fenced) return;
      const targets = [];
      if (markdown) for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) targets.push(m[1]);
      if (html) for (const m of line.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) targets.push(m[1]);
      for (const raw of targets) {
        const r = linkResolves(name, raw, index);
        if (r && !r.ok) findings.push({ file: name, line: at + 1, kind: 'link', detail: `relative link to ${r.target} is not in the copy` });
      }
    });
  }
  return findings;
}

// ---------- legacy entry point used by tests/portability.test.mjs ----------
// Names are discovered for each run; no local repository inventory is retained.
export function scan(checkout, parent, self, ignore = []) {
  const found = discoverSiblings(parent, self, ignore);
  const gaps = found.gap ? [found.gap] : [];
  const ctx = makeContext({ siblings: found.names });
  const findings = [];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: checkout, encoding: 'utf8' }).split('\0').filter(Boolean);
  // Include the public scripts in a sandbox delivery before the coordinator
  // stages them; tracked-file coverage remains unconditional.
  for (const path of new Set([...tracked, 'scripts/usage.mjs', 'scripts/statusline-usage.mjs', 'scripts/skill-load-check.mjs'])) {
    let info;
    try { info = statSync(join(checkout, path)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!info.isFile()) continue;
    const text = readFileSync(join(checkout, path), 'utf8');
    for (const f of scanText(toSlash(relative(checkout, join(checkout, path))), text, { siblings: ctx.siblings, privateTerms: [], }).filter((x) => x.kind === 'machine-path' || x.kind === 'sibling')) findings.push(`${f.file}:${f.line}: ${f.detail}`);
  }
  return { findings, gaps };
}
