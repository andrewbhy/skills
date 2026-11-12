// One check over the plugin copy the export builds (A10, A14): line endings, shell use, PowerShell-only steps, backslash
// paths, network use, install hooks, lockfile, plugin hooks and the CI workflow. Runs on macOS and Windows alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCopy, loadConfig } from '../scripts/export-public.mjs';
import { workingTree } from './helpers/export-fixture.mjs';

let cached;
function copy() {
  if (cached !== undefined) return cached;
  const tree = workingTree();
  if (!tree) return (cached = null);
  const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  cached = buildCopy(tree, loadConfig(root), { version: '0.0.0', year: '2026' }).files;
  return cached;
}
const text = (entry) => entry.buffer.toString('utf8');
const code = (path) => /\.(mjs|js|cjs)$/.test(path) && /^(scripts|tests|skills|\.agents)\//.test(path);
// Patterns are assembled so this file does not contain what it forbids.
const shellTrue = new RegExp('shell' + ':\\s*' + 'true');
const drivePath = /['"`][A-Za-z]:\\{1,2}[\w.-]/;
const backslashJoin = /['"`]\\\\[\w.-]+\\\\/;

test('[risk: CRLF ships and breaks the plugin cache] no file in the copy has a carriage return', t => {
  const files = copy(); if (!files) return t.skip('not a git checkout');
  const bad = [...files].filter(([, e]) => e.buffer.includes(13)).map(([p]) => p);
  assert.deepEqual(bad, []);
  assert.match(text(files.get('.gitattributes')), /^\* text=auto eol=lf$/m);
});

test('[risk: platform-only steps] no shell spawns, and PowerShell or cmd appear only in documented Windows-only or pattern-matching files', t => {
  const files = copy(); if (!files) return t.skip('not a git checkout');
  // Each entry explains why the word may appear.
  const allowed = new Map([
    ['scripts/usage.mjs', 'Windows-only branch guarded by process.platform'],
    ['scripts/hooks/block-raw-worktree-remove.mjs', 'matches command text, runs nothing'],
    ['tests/worktree-hook.test.mjs', 'feeds command text to the hook'],
    ['tests/queue.test.mjs', 'runs a shell only when it exists'],
  ]);
  const shellWord = /\b(?:powershell|pwsh)\b|cmd(?:\.exe)? \/c|\.ps1\b/;
  const spawnsShell = [], powershell = [], paths = [];
  for (const [path, entry] of files) {
    if (!code(path) && !path.startsWith('.github/')) continue;
    const body = text(entry);
    if (shellTrue.test(body)) spawnsShell.push(path);
    if (shellWord.test(body) && ![...allowed.keys()].some((a) => path === a || path === `skills/${a}` || path.endsWith(`/${a}`)) && !path.endsWith('tests/public-release.test.mjs')) powershell.push(path);
    if (code(path) && (drivePath.test(body) || backslashJoin.test(body)) && !/export-public\.test|portability\.test|public-release\.test|work-mode\.test/.test(path)) paths.push(path);
  }
  assert.deepEqual(spawnsShell, [], 'spawns with a shell');
  assert.deepEqual(powershell, [], 'PowerShell or cmd steps outside the allowlist');
  assert.deepEqual(paths, [], 'backslash path literals');
  const usage = text(files.get('scripts/usage.mjs'));
  assert.match(usage, /process\.platform !== 'win32'/);
});

test('[risk: a shipped script reaches the network] outbound network APIs appear nowhere; fetch is limited to loopback and browser pages', t => {
  const files = copy(); if (!files) return t.skip('not a git checkout');
  const outbound = new RegExp(["node:https", "from 'https'", "https\\.(?:get|request)", "node:net'", "net\\.connect", "new WebSocket\\(", "http\\.(?:get|request)\\("].join('|'));
  const hosts = /https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\]|example\.|www\.w3\.org|json-schema\.org)[a-z0-9.-]+\.[a-z]{2,}/i;
  const fetchFiles = new Set(['scripts/review-home-client.js', 'scripts/review-thread-page.mjs', 'scripts/review-server.mjs', 'scripts/tower.mjs']);
  const hits = [];
  for (const [path, entry] of files) {
    if (!/^(scripts)\//.test(path) || !/\.(mjs|js)$/.test(path)) continue;
    const body = text(entry);
    if (outbound.test(body)) hits.push(`${path}: outbound API`);
    if (/\bfetch\(/.test(body) && !fetchFiles.has(path)) hits.push(`${path}: fetch outside the loopback set`);
  }
  assert.deepEqual(hits, []);
  const server = text(files.get('scripts/review-server.mjs'));
  assert.match(server, /listen\([^)]*127\.0\.0\.1/, 'the dashboard binds loopback only');
  assert.equal(hosts.test(text(files.get('scripts/tower.mjs'))), false);
  assert.ok(!files.has('scripts/borrowed-check.mjs'), 'the one network-querying helper is not shipped');
});

test('[risk: install-time code runs] no install scripts, a lockfile, no plugin hooks, license MIT', t => {
  const files = copy(); if (!files) return t.skip('not a git checkout');
  const pkg = JSON.parse(text(files.get('package.json')));
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack', 'postpack']) assert.equal(pkg.scripts?.[name], undefined, name);
  assert.ok(files.has('package-lock.json'));
  const manifest = JSON.parse(text(files.get('.claude-plugin/plugin.json')));
  assert.equal(manifest.hooks, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.ok(![...files.keys()].some((p) => p === 'hooks/hooks.json' || p.startsWith('hooks/')), 'no plugin hooks folder');
  assert.ok(files.has('LICENSE') && files.has('NOTICE'));
});

// ---------- the CI workflow ----------
// A parser for the small YAML subset the workflow uses: nested maps, "- " lists of scalars or maps, [a, b] lists, quoted scalars, comments.
export function parseWorkflow(source) {
  const lines = source.split('\n').map((raw) => ({ raw, indent: raw.length - raw.trimStart().length, body: raw.replace(/\s+#.*$/, '').trim() })).filter((l) => l.body && !l.body.startsWith('#'));
  const scalar = (v) => {
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
    if (/^-?\d+$/.test(v)) return Number(v);
    if (v === 'true' || v === 'false') return v === 'true';
    return v;
  };
  let at = 0;
  function block(indent) {
    if (lines[at].body.startsWith('- ')) {
      const list = [];
      while (at < lines.length && lines[at].indent === indent && lines[at].body.startsWith('- ')) {
        const rest = lines[at].body.slice(2);
        const m = rest.match(/^([\w.-]+):\s*(.*)$/);
        if (!m) { list.push(scalar(rest)); at += 1; continue; }
        // a map item: its first key sits on the dash line, further keys are indented by 2 more
        lines[at] = { ...lines[at], indent: indent + 2, body: rest };
        list.push(block(indent + 2));
      }
      return list;
    }
    const map = {};
    while (at < lines.length && lines[at].indent === indent && !lines[at].body.startsWith('- ')) {
      const m = lines[at].body.match(/^([\w.${}\- ]+?):\s*(.*)$/);
      if (!m) throw new Error(`cannot parse: ${lines[at].raw}`);
      at += 1;
      if (m[2] === '') map[m[1]] = at < lines.length && lines[at].indent > indent ? block(lines[at].indent) : null;
      else map[m[1]] = scalar(m[2]);
    }
    return map;
  }
  return block(lines[0].indent);
}

test('[risk: unpinned or over-privileged CI] ci.yml parses, reads contents only, pins every action to a commit SHA, uses no secrets and runs both OSes', t => {
  const files = copy(); if (!files) return t.skip('not a git checkout');
  const source = text(files.get('.github/workflows/ci.yml'));
  const wf = parseWorkflow(source);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.ok(!('pull_request_target' in (wf.on ?? {})), 'no pull_request_target');
  const job = wf.jobs.test;
  assert.deepEqual(job.strategy.matrix.os, ['macos-latest', 'windows-latest']);
  const steps = job.steps;
  const uses = steps.filter((s) => s.uses).map((s) => s.uses);
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${u} is not pinned to a full SHA`);
  assert.doesNotMatch(source, /secrets\./);
  const runs = steps.filter((s) => s.run).map((s) => s.run);
  for (const want of ['npm ci', 'npm test']) assert.ok(runs.includes(want), want);
  assert.ok(runs.some((r) => r.includes('tests/plugin-install.test.mjs')), 'install test step');
  const node = steps.find((s) => s.uses?.startsWith('actions/setup-node'));
  assert.equal(node.with['node-version'], 22);
  assert.doesNotMatch(source, /shell:\s*(?:pwsh|powershell|cmd)/);
});

test('[risk: workflow parser accepts anything] the small YAML reader reads maps, lists and flow lists', () => {
  const y = parseWorkflow(['top:', '  b: [x, y]', '  c:', '    - one', '    - k: v', '      m: 2', ''].join(String.fromCharCode(10)));
  assert.deepEqual(y, { top: { b: ['x', 'y'], c: ['one', { k: 'v', m: 2 }] } });
});
