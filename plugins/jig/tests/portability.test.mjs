import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scan } from '../scripts/portability-scan.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'jig-portability-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const checkout = join(parent, 'jig');
  mkdirSync(join(checkout, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-q', checkout]);
  const track = () => execFileSync('git', ['add', '.'], { cwd: checkout, stdio: 'pipe' });
  return { parent, checkout, track, write: text => { writeFileSync(join(checkout, 'docs', 'sample.md'), text); track(); } };
}

const machinePath = (...parts) => ['C:', ...parts].join('/');

test('[risk: machine paths escape portability checks] absolute paths fail with file and line while URLs pass', t => {
  const f = fixture(t);
  f.write(['https://example.test' + '/home' + '/person', machinePath('work', 'project'), ['D:', 'work', 'project'].join('\\'), ['', 'Users', 'person', 'project'].join('/'), ['', 'home', 'person', 'project'].join('/'), '~/project', 'file:///' + machinePath('private', 'project'), ''].join('\n'));
  assert.deepEqual(scan(f.checkout, f.parent, 'jig').findings, [2, 3, 4, 5, 7].map(line => `docs/sample.md:${line}: absolute machine path`));
});

test('[risk: only docs are scanned] root rules, scripts and skill sources are checked too', t => {
  const f = fixture(t);
  const files = ['README.md', 'AGENTS.md', 'scripts/check.mjs', 'scripts/usage.mjs', 'scripts/statusline-usage.mjs', 'scripts/skill-load-check.mjs', '.agents/skills/example/SKILL.md', '.claude/skills/example/SKILL.md'];
  for (const file of files) {
    mkdirSync(dirname(join(f.checkout, file)), { recursive: true });
    writeFileSync(join(f.checkout, file), machinePath('private', 'project'));
  }
  f.track();
  assert.deepEqual(scan(f.checkout, f.parent, 'jig').findings.sort(), files.map(file => `${file}:1: absolute machine path`).sort());
});

test('[risk: discovery mistakes worktrees or substrings for repositories] only sibling git directories match whole words case insensitively', t => {
  const f = fixture(t);
  for (const name of ['art', 'consumer-app', 'a.b']) mkdirSync(join(f.parent, name, '.git'), { recursive: true });
  mkdirSync(join(f.parent, 'plain'));
  mkdirSync(join(f.parent, 'linked'));
  writeFileSync(join(f.parent, 'linked', '.git'), 'gitdir: elsewhere');
  f.write('jig plain linked partial cart artwork\nART\nConsumer-App\na.b\naxb\n');
  assert.deepEqual(scan(f.checkout, f.parent, 'jig').findings.sort(), [
    'docs/sample.md:2: sibling repository name "art"',
    'docs/sample.md:3: sibling repository name "consumer-app"',
    'docs/sample.md:4: sibling repository name "a.b"',
  ]);
  mkdirSync(join(f.parent, 'later', '.git'), { recursive: true });
  f.write('later');
  assert.equal(scan(f.checkout, f.parent, 'jig').findings.length, 1);
});

test('[risk: missing sibling discovery silently claims a full check] unreadable parent reports gap and still checks paths', t => {
  const f = fixture(t);
  f.write(machinePath('private', 'project'));
  const result = scan(f.checkout, join(f.parent, 'missing'), 'jig');
  assert.equal(result.findings.length, 1);
  assert.match(result.gaps[0], /absolute paths only/);
});

test('[risk: committed journals leak names while private logs are scanned] all tracked files, including arbitrary extensions, are checked', t => {
  const f = fixture(t), sibling = `consumer-${process.pid}`;
  mkdirSync(join(f.parent, sibling, '.git'), { recursive: true });
  for (const file of ['journal', 'docs/missed-problems.jsonl']) writeFileSync(join(f.checkout, file), sibling);
  f.track();
  mkdirSync(join(f.checkout, '.jig'));
  writeFileSync(join(f.checkout, '.jig/signals.jsonl'), sibling);
  const result = scan(f.checkout, f.parent, 'jig');
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.every(line => !line.includes('.jig/')));
});

test('[risk: consuming products or machine paths remain in the real tree] repository stays portable from a linked worktree', t => {
  const checkout = fileURLToPath(new URL('../', import.meta.url));
  let parent, self;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: checkout, encoding: 'utf8' }).trim();
    const main = dirname(common);
    parent = dirname(main);
    self = basename(main);
  } catch { t.diagnostic('Sibling discovery unavailable: git common directory cannot be resolved; checking absolute paths only.'); }
  // A copy of jig sits beside the repository it was exported from, which carries the package name; that name is not a private sibling.
  const config = JSON.parse(readFileSync(join(checkout, 'export-public.json'), 'utf8'));
  const own = [JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8')).name, config.pluginName, config.marketplaceName, basename(config.marketplaceRepo)];
  const result = scan(checkout, parent ?? join(checkout, '.unavailable-parent'), self ?? basename(checkout), own);
  for (const gap of result.gaps) t.diagnostic(gap);
  assert.deepEqual(result.findings, [], result.findings.join('\n'));
});
