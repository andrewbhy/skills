import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { baseConfig, findings, git, makeHome, makeJig, run, workingTree } from './helpers/export-fixture.mjs';
import { buildCopy, buildNotice, globToRegExp, loadConfig, claudeMarketplaceDoc, codexMarketplaceDoc, buildRepo, rewriteSkillBody, rewriteSupportDoc, selectFiles, skillNames } from '../scripts/export-public.mjs';
import { linkFindings, loadPrivateTerms, makeContext, scanPath, scanText, secretPatterns } from '../scripts/portability-scan.mjs';

const kinds = (result) => findings(result).map((line) => line.split(':')[0].replace('FINDING ', ''));
const claudeOnPath = () => { try { return !!require_which(); } catch { return false; } };
function require_which() {
  const { spawnSync } = process.getBuiltinModule('node:child_process');
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

// ---------- scan module: one fixture per finding kind ----------
const ctxFor = (extra = {}) => makeContext({ siblings: ['sibling-repo'], privateTerms: ['acme-secret-project'], ...extra });
const text = (...lines) => lines.join('\n');

test('[risk: private string ships] machine path, sibling name and private term each produce a finding with file and line', () => {
  const found = scanText('docs/a.md', text('fine', ['C:', 'work', 'x'].join('/'), 'see Sibling-Repo here', 'the ACME-Secret-Project plan'), ctxFor());
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[2, 'machine-path'], [3, 'sibling'], [4, 'private-term']]);
});

test('[risk: substrings flagged or words missed] private terms match whole words only, case-insensitively', () => {
  const ctx = ctxFor();
  assert.equal(scanText('a.md', 'acme-secret-projects acme-secret-project2 xacme-secret-project', ctx).length, 0);
  assert.equal(scanText('a.md', '(acme-secret-project).', ctx).length, 1);
  assert.equal(scanText('a.md', 'Acme-Secret-Project_x', ctx).length, 0);
});

test('[risk: secret ships] every secret pattern is detected on its own', () => {
  const samples = {
    'private-key': ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join(''),
    'aws-access-key': ['AK', 'IA', '0123456789ABCDEF'].join(''),
    'github-token': ['gh', 'p_', 'a'.repeat(30)].join(''),
    'github-pat': ['github', '_pat_', 'a'.repeat(30)].join(''),
    'api-key-sk': ['s', 'k-', 'a'.repeat(30)].join(''),
    'slack-token': ['xo', 'xb-', '1234567890-abcdef'].join(''),
    jwt: ['eyJ', 'hbGciOiJI', '.eyJ', 'zdWIiOiIx', '.sig', 'nature1234'].join(''),
  };
  assert.deepEqual(secretPatterns.map(([name]) => name).sort(), Object.keys(samples).sort());
  for (const [name, sample] of Object.entries(samples)) {
    const found = scanText('a.txt', `value ${sample} end`, ctxFor());
    assert.deepEqual(found.map((f) => f.detail), [`secret pattern ${name}`], name);
  }
  assert.equal(scanText('a.txt', 'task-based skill-name and disk-space', ctxFor()).length, 0, 'ordinary words are not secrets');
});

test('[risk: private name in a path] file names are scanned for terms, siblings and secret-looking names', () => {
  const ctx = ctxFor();
  assert.equal(scanPath('docs/acme-secret-project/notes.md', ctx)[0].kind, 'private-path');
  assert.equal(scanPath('docs/sibling-repo.md', ctx)[0].kind, 'sibling-path');
  for (const name of ['.env', '.env.local', 'keys/server.pem', 'a/b.key']) assert.equal(scanPath(name, ctx)[0].kind, 'secret-file', name);
  assert.equal(scanPath('docs/environment.md', ctx).length, 0);
});

test('[risk: broken links ship] relative links must stay inside the copy; fenced code, URLs and anchors are ignored', () => {
  const files = new Map([
    ['docs/a.md', Buffer.from('[ok](b.md) [gone](missing.md) [web](https://example.test/x) [top](#top)\n```\n[code](nothing.md)\n```\n')],
    ['docs/b.md', Buffer.from('[up](../README.md#intro) [folder](sub/)\n')],
    ['docs/sub/c.md', Buffer.from('x')],
    ['README.md', Buffer.from('r')],
    ['page.html', Buffer.from('<a href="docs/b.md">x</a> <img src="nope.png">\n')],
  ]);
  assert.deepEqual(linkFindings(files).map((f) => `${f.file}:${f.line}:${f.detail}`), ['docs/a.md:1:relative link to missing.md is not in the copy', 'page.html:1:relative link to nope.png is not in the copy']);
});

// ---------- config, globs, rewrite ----------
test('[risk: allowlist drift] globs match folders, one-level wildcards and exact files only', () => {
  const config = { include: ['scripts/', 'docs/*.md', 'VERSION'], exclude: ['scripts/hooks/'] };
  const { keep, left } = selectFiles(['scripts/a.mjs', 'scripts/hooks/x.mjs', 'docs/a.md', 'docs/sub/b.md', 'VERSION', 'VERSIONS', 'other.txt'], config);
  assert.deepEqual(keep, ['scripts/a.mjs', 'docs/a.md', 'VERSION']);
  assert.deepEqual(left, ['scripts/hooks/x.mjs', 'docs/sub/b.md', 'VERSIONS', 'other.txt']);
  assert.ok(globToRegExp('a/**/z.md').test('a/b/c/z.md'));
});

test('[risk: skills call helpers outside the plugin] skill bodies get plugin-root paths and leftovers fail the build', () => {
  const out = rewriteSkillBody('jig-demo', skillSample());
  assert.match(out, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/jig-demo\/telemetry\.mjs" start/);
  assert.match(out, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/queue\.mjs" status/);
  assert.match(out, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/jig-demo\/scripts\/check\.mjs"/);
  assert.doesNotMatch(out, /<skill-folder>/);
  assert.throws(() => rewriteSkillBody('jig-demo', 'run ./scripts/queue.mjs now'), /repo-relative scripts\//);
  assert.match(rewriteSupportDoc('Run `node scripts/queue.mjs add`'), /node "<skill-folder>\/\.\.\/\.\.\/scripts\/queue\.mjs" add/);
});
function skillSample() {
  return 'Run `node "<skill-folder>/telemetry.mjs" start x`, `node scripts/queue.mjs status` and `node <skill-folder>/scripts/check.mjs`.\n';
}

test('[risk: config invalid] missing or malformed export-public.json exits 2', t => {
  const f = makeJig(t, { files: { 'export-public.json': '{ not json' } });
  const r = run(f, makeHome(t));
  assert.equal(r.status, 2);
  assert.match(r.out, /export-public\.json/);
  const g = makeJig(t, { files: { 'export-public.json': null } });
  assert.equal(run(g, makeHome(t)).status, 2);
  assert.throws(() => loadConfig(f.root), /malformed/);
});

// ---------- the export itself ----------
test('[risk: wrong file set] only allowlisted tracked files are copied, plugin layout is built, --list-excluded writes nothing', t => {
  const f = makeJig(t);
  const home = makeHome(t);
  const listed = run(f, home, ['--list-excluded']);
  assert.equal(listed.status, 0);
  assert.match(listed.out, /docs\/secret-notes\.md/);
  assert.equal(existsSync(f.out), false);
  const r = run(f, home);
  assert.equal(r.status, 0, r.out);
  const names = new Set(readdirSync(f.out, { recursive: true }).map((n) => n.split('\\').join('/')));
  for (const want of ['plugins/jig/.claude-plugin/plugin.json', 'plugins/jig/.codex-plugin/plugin.json', 'plugins/jig/skills/jig-demo/SKILL.md', 'plugins/jig/skills/jig-demo/telemetry.mjs', 'plugins/jig/.agents/skills/jig-demo/SKILL.md', 'plugins/jig/commands/demo.md', 'plugins/jig/LICENSE', 'plugins/jig/NOTICE', 'plugins/jig/docs/public/ci.yml', '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', 'README.md', 'LICENSE', 'NOTICE', '.gitattributes', '.github/workflows/jig.yml']) assert.ok(names.has(want), want);
  assert.equal(names.has('docs/secret-notes.md'), false);
  assert.equal(names.has('plugins/jig/.github/workflows/ci.yml'), false, 'the workflow lives at the repository root');
  assert.equal(names.has('plugins/jig/docs/public/skills-readme.md'), false, 'root README template stays out of the plugin');
  const manifest = JSON.parse(readFileSync(join(f.out, 'plugins', 'jig', '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.deepEqual([manifest.name, manifest.version, manifest.license], ['jig', '0.1.0', 'MIT']);
  const codex = JSON.parse(readFileSync(join(f.out, 'plugins', 'jig', '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.deepEqual([codex.name, codex.version, codex.license, codex.skills], ['jig', '0.1.0', 'MIT', './skills/']);
  assert.match(readFileSync(join(f.out, 'README.md'), 'utf8'), /claude plugin marketplace add fixture-owner\/fixture-skills\nclaude plugin install jig@fixture-market\nSee \[plugin\]\(plugins\/jig\/README\.md\)/);
  assert.match(readFileSync(join(f.out, '.github', 'workflows', 'jig.yml'), 'utf8'), /working-directory: plugins\/jig\n    steps:/);
  assert.match(readFileSync(join(f.out, 'LICENSE'), 'utf8'), /^MIT License\n\nCopyright \(c\) \d{4} fixture-owner/);
  const skill = readFileSync(join(f.out, 'plugins', 'jig', 'skills', 'jig-demo', 'SKILL.md'), 'utf8');
  assert.match(skill, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/jig-demo\/telemetry\.mjs/);
  assert.match(readFileSync(join(f.out, 'plugins', 'jig', '.agents', 'skills', 'jig-demo', 'SKILL.md'), 'utf8'), /<skill-folder>/, 'the canonical source copy is unchanged');
  assert.equal(git(f.out, 'ls-files', '.git').trim(), '');
});

test('[risk: partial scan passes] summary prints scanned/total and they are equal when all files are text', t => {
  const f = makeJig(t);
  const r = run(f, makeHome(t), ['--dry-run']);
  assert.equal(r.status, 0, r.out);
  const m = r.out.match(/scanned (\d+)\/(\d+) repository files/);
  assert.ok(m && m[1] === m[2] && Number(m[2]) > 10, r.out);
  assert.equal(existsSync(f.out), false, 'dry run writes nothing');
});

test('[risk: finding kind not enforced] each kind exits 1 with file and line and makes no commit', t => {
  const cases = {
    'machine-path': { files: { 'docs/a.md': ['x', ['C:', 'work', 'p'].join('/')].join('\n') } },
    'private-term': { files: { 'docs/a.md': 'line\nthe acme-secret-project thing\n' } },
    'private-path': { files: { 'docs/acme-secret-project.md': 'clean\n' } },
    'secret': { files: { 'docs/a.md': ['key ', ['gh', 'p_'].join(''), 'b'.repeat(30)].join('') } },
    'secret-file': { files: { 'scripts/.env': 'A=1\n' } },
    'link': { files: { 'docs/a.md': '[gone](missing.md)\n' } },
  };
  for (const [kind, spec] of Object.entries(cases)) {
    const f = makeJig(t, spec);
    const r = run(f, makeHome(t));
    assert.equal(r.status, 1, `${kind}: ${r.out}`);
    assert.ok(kinds(r).includes(kind), `${kind}: ${r.out}`);
    assert.equal(existsSync(join(f.out, '.git')), false, `${kind}: no commit`);
  }
  const line = findings(run(makeJig(t, cases['private-term']), makeHome(t)))[0];
  assert.match(line, /docs\/a\.md:2: private term "acme-secret-project"/);
});

test('[risk: encoding hides content] UTF-16 files fail as non-UTF-8 instead of being skipped', t => {
  const f = makeJig(t);
  writeFileSync(join(f.root, 'docs-utf16.md'), Buffer.from('\ufeffhello private', 'utf16le'));
  const config = JSON.parse(readFileSync(join(f.root, 'export-public.json'), 'utf8'));
  config.include.push('docs-utf16.md');
  writeFileSync(join(f.root, 'export-public.json'), JSON.stringify(config));
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'utf16');
  const r = run(f, makeHome(t));
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['non-utf8']);
});

test('[risk: symlink or sibling ships] symlinks and sibling repository names fail', t => {
  const f = makeJig(t, { symlinks: { 'scripts/link.mjs': 'queue.mjs' } });
  const r = run(f, makeHome(t));
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['symlink']);
  const g = makeJig(t, { files: { 'docs/a.md': 'mentions neighbour-repo here\n' } });
  mkdirSync(join(g.parent, 'neighbour-repo', '.git'), { recursive: true });
  const s = run(g, makeHome(t));
  assert.equal(s.status, 1);
  assert.match(s.out, /docs\/a\.md:1: sibling repository name "neighbour-repo"/);
});

test('[risk: binary list used to dodge scanning] listed binaries need a matching hash and must not be text', t => {
  const f = makeJig(t);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x01]);
  writeFileSync(join(f.root, 'logo.png'), bytes);
  const config = JSON.parse(readFileSync(join(f.root, 'export-public.json'), 'utf8'));
  config.include.push('logo.png');
  config.binary = [{ path: 'logo.png', sha256: createHash('sha256').update(bytes).digest('hex') }];
  writeFileSync(join(f.root, 'export-public.json'), JSON.stringify(config));
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'binary');
  const ok = run(f, makeHome(t), ['--dry-run']);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /\(1 binary listed, content skipped\)/);
  config.binary[0].sha256 = '0'.repeat(64);
  writeFileSync(join(f.root, 'export-public.json'), JSON.stringify(config));
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'wrong hash');
  assert.deepEqual(kinds(run(f, makeHome(t), ['--dry-run'])), ['binary-hash']);
  writeFileSync(join(f.root, 'plain.txt'), 'just text\n');
  config.include.push('plain.txt');
  config.binary = [{ path: 'plain.txt', sha256: createHash('sha256').update('just text\n').digest('hex') }];
  writeFileSync(join(f.root, 'export-public.json'), JSON.stringify(config));
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'text as binary');
  assert.ok(kinds(run(f, makeHome(t), ['--dry-run'])).includes('binary-text'));
});

test('[risk: private list missing] a missing or empty list exits 1 unless --no-private-list, which states the gap', t => {
  const f = makeJig(t);
  const missing = run(f, makeHome(t, null));
  assert.equal(missing.status, 1);
  assert.match(missing.out, /private list missing/);
  assert.equal(run(f, makeHome(t, [])).status, 1);
  const skipped = run(f, makeHome(t, null), ['--no-private-list', '--dry-run']);
  assert.equal(skipped.status, 0, skipped.out);
  assert.match(skipped.out, /gap: private list skipped/);
});

test('[risk: private list leaks into output] findings name file, line and the term only', t => {
  const f = makeJig(t, { files: { 'docs/a.md': 'acme-secret-project\n' } });
  const r = run(f, makeHome(t, ['acme-secret-project', 'unrelated-other-term']));
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.out, /unrelated-other-term/);
  assert.deepEqual(loadPrivateTerms({ JIG_HOME: makeHome(t, ['one', 'two']) }).terms, ['one', 'two']);
});

test('[risk: wrong folder or relative path] --out is resolved against the cwd and printed absolute; inside-jig and dirty targets are refused', t => {
  const f = makeJig(t);
  const home = makeHome(t);
  const rel = run({ ...f, out: 'relative-out' }, home, ['--dry-run'], { cwd: f.parent });
  assert.match(rel.out, /repository target: .*relative-out/);
  assert.ok(/^repository target: ([A-Za-z]:|\/)/m.test(rel.out), rel.out);
  const inside = run({ ...f, out: join(f.root, 'build') }, home);
  assert.equal(inside.status, 1);
  assert.match(inside.out, /inside jig|is jig/);
  const first = run(f, home);
  assert.equal(first.status, 0, first.out);
  writeFileSync(join(f.out, 'stray.txt'), 'dirty');
  const dirty = run(f, home);
  assert.equal(dirty.status, 1);
  assert.match(dirty.out, /uncommitted changes/);
  const plain = join(f.parent, 'plain');
  mkdirSync(plain); writeFileSync(join(plain, 'x.txt'), 'x');
  assert.match(run({ ...f, out: plain }, home).out, /not empty and not a git repository/);
});

test('[risk: release chain broken] a second export adds one commit with the first as parent; author is a noreply address; message has no private hash', t => {
  const f = makeJig(t);
  const home = makeHome(t);
  assert.equal(run(f, home).status, 0);
  const first = git(f.out, 'rev-parse', 'HEAD').trim();
  const again = run(f, home);
  assert.equal(again.status, 0, again.out);
  assert.equal(git(f.out, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(git(f.out, 'rev-parse', 'HEAD~1').trim(), first);
  const meta = git(f.out, 'log', '-1', '--format=%an|%ae|%cn|%ce|%s').trim();
  assert.match(meta, /^fixture release\|fixture-release@users\.noreply\.github\.com\|fixture release\|fixture-release@users\.noreply\.github\.com\|fixture-skills: jig 0\.1\.0$/);
  const custom = run(f, home, ['--author', 'Someone <someone@users.noreply.github.com>']);
  assert.equal(custom.status, 0);
  assert.match(git(f.out, 'log', '-1', '--format=%ae'), /someone@users\.noreply\.github\.com/);
  assert.equal(run(f, home, ['--author', 'broken']).status, 2);
  const leaked = run(f, home, ['--author', 'Name <acme-secret-project@example.test>']);
  assert.equal(leaked.status, 1);
  assert.match(leaked.out, /release author/);
});

test('[risk: export damages jig or target] a failed gate and a failed Git step leave the target and jig as before', t => {
  const f = makeJig(t);
  const home = makeHome(t);
  assert.equal(run(f, home).status, 0);
  const before = git(f.out, 'rev-parse', 'HEAD').trim();
  const jigState = () => [git(f.root, 'status', '--porcelain'), git(f.root, 'config', '--local', '--list'), git(f.root, 'remote', '-v')].join('|');
  const jigBefore = jigState();
  writeFileSync(join(f.root, 'docs', 'bad.md'), 'acme-secret-project\n');
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'bad');
  const jigAfterCommit = jigState();
  assert.equal(run(f, home).status, 1);
  assert.equal(git(f.out, 'rev-parse', 'HEAD').trim(), before);
  assert.equal(git(f.out, 'status', '--porcelain').trim(), '');
  git(f.root, 'rm', '-q', 'docs/bad.md'); git(f.root, 'commit', '-q', '-m', 'fix');
  const tree = () => readdirSync(f.out, { recursive: true }).filter((n) => !/^\.git([\\/]|$)/.test(n)).sort().join(',');
  const filesBefore = tree();
  const forced = run(f, home, [], { extraEnv: { JIG_EXPORT_FAIL_AT: 'commit' } });
  assert.equal(forced.status, 1, forced.out);
  assert.match(forced.out, /target restored/);
  assert.equal(git(f.out, 'status', '--porcelain').trim(), '');
  assert.equal(tree(), filesBefore);
  assert.equal(jigState(), jigAfterCommit);
  assert.equal(jigAfterCommit, jigBefore, 'status, config and remotes are the same before and after the fixture commit and the exports');
});

test('[risk: marketplace wrong or other entries lost] both marketplaces point at the plugin folder, foreign plugins and their folders stay, owner has no e-mail', t => {
  const f = makeJig(t);
  const home = makeHome(t);
  assert.equal(run(f, home).status, 0);
  mkdirSync(join(f.out, 'plugins', 'other-tool'));
  writeFileSync(join(f.out, 'plugins', 'other-tool', 'plugin.txt'), 'x');
  const claudePath = join(f.out, '.claude-plugin', 'marketplace.json'), codexPath = join(f.out, '.agents', 'plugins', 'marketplace.json');
  const claude = JSON.parse(readFileSync(claudePath, 'utf8')), codex = JSON.parse(readFileSync(codexPath, 'utf8'));
  claude.plugins.push({ name: 'other-tool', source: './plugins/other-tool', description: 'foreign' });
  codex.plugins.push({ name: 'other-tool', source: { source: 'local', path: './plugins/other-tool' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Other' });
  writeFileSync(claudePath, JSON.stringify(claude)); writeFileSync(codexPath, JSON.stringify(codex));
  git(f.out, 'add', '-A'); git(f.out, 'commit', '-q', '-m', 'seed');
  const r = run(f, home);
  assert.equal(r.status, 0, r.out);
  const doc = JSON.parse(readFileSync(claudePath, 'utf8'));
  assert.equal(doc.name, 'fixture-market');
  assert.deepEqual(doc.owner, { name: 'fixture-owner' });
  assert.deepEqual(doc.plugins.map((p) => p.name).sort(), ['jig', 'other-tool']);
  assert.equal(doc.plugins.find((p) => p.name === 'jig').source, './plugins/jig');
  assert.equal(doc.plugins.find((p) => p.name === 'other-tool').description, 'foreign');
  const cdoc = JSON.parse(readFileSync(codexPath, 'utf8'));
  assert.equal(cdoc.name, 'fixture-market');
  assert.deepEqual(cdoc.plugins.find((p) => p.name === 'jig'), { name: 'jig', source: { source: 'local', path: './plugins/jig' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
  assert.deepEqual(cdoc.plugins.map((p) => p.name).sort(), ['jig', 'other-tool']);
  assert.ok(existsSync(join(f.out, 'plugins', 'other-tool', 'plugin.txt')));
  assert.equal(git(f.out, 'status', '--porcelain').trim(), '');
  assert.equal(git(f.out, 'rev-list', '--count', 'HEAD').trim(), '3');
  const names = readdirSync(f.out).filter((n) => n !== '.git').sort();
  assert.deepEqual(names, ['.agents', '.claude-plugin', '.gitattributes', '.github', 'LICENSE', 'NOTICE', 'README.md', 'plugins']);
  const config = { ...baseConfig, pluginDir: 'plugins/jig', codexCategory: 'Productivity' };
  assert.equal(claudeMarketplaceDoc(config, null, '0.1.0').plugins.length, 1);
  assert.equal(codexMarketplaceDoc(config, null).plugins.length, 1);
});

test('[risk: marketplace misconfigured] reserved or non-kebab names, a bad repo name or plugin folder exit 2; a target inside jig is refused', t => {
  const home = makeHome(t);
  for (const config of [{ marketplaceName: 'claude-plugins-official' }, { marketplaceName: 'Not_Kebab' }, { marketplaceRepo: 'no-slash' }, { pluginDir: '../escape' }]) {
    const f = makeJig(t, { config });
    assert.equal(run(f, home).status, 2, JSON.stringify(config));
  }
  const g = makeJig(t);
  assert.equal(run({ ...g, out: join(g.root, 'out') }, home).status, 1);
});

test('[risk: NOTICE missing or stale] NOTICE names every borrowed source and the skill NOTICE files', t => {
  const tree = new Map([
    ['docs/borrowed.md', { buffer: Buffer.from('| S | R | P | L | N |\n|---|---|---|---|---|\n| Alpha | org/alpha | v1.0.0 | MIT | adapted ideas |\n| Beta | org/beta | abc1234 | Apache-2.0 | design notes |\n') }],
    ['.agents/skills/jig-x/NOTICE', { buffer: Buffer.from('Adapted from Gamma, MIT.\n') }],
  ]);
  const notice = buildNotice(tree, '1.2.3');
  for (const want of ['Alpha', 'org/alpha', 'Beta', 'org/beta', 'Adapted from Gamma']) assert.ok(notice.includes(want), want);
});

test('[risk: plugin layout wrong] every skill has an alias command, skills are real copies, plugin.json license is MIT', t => {
  const f = makeJig(t);
  assert.equal(run(f, makeHome(t)).status, 0);
  const skills = readdirSync(join(f.out, 'plugins', 'jig', 'skills'));
  assert.deepEqual(skills, ['jig-demo']);
  assert.ok(existsSync(join(f.out, 'plugins', 'jig', 'commands', 'demo.md')));
  assert.equal(skillNames(new Map([['.agents/skills/jig-a/SKILL.md', 1], ['.agents/skills/jig-a/x.md', 1]])).length, 1);
});

test('[risk: copy not accepted by the loader] the exported plugin and marketplace pass claude plugin validate', { skip: !claudeOnPath() && 'claude CLI not on PATH' }, t => {
  const f = makeJig(t, { files: { '.agents/skills/jig-demo/SKILL.md': '---\nname: "jig-demo"\ndescription: "Demo skill for the fixture."\n---\n\n# Demo\n\nRun `node "<skill-folder>/telemetry.mjs" start x`.\n' } });
  const r = run(f, makeHome(t), ['--skip-tests', '--skip-sync-check'], { fast: false });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /release commit/);
});

test('[risk: real tree builds] the real checkout builds a copy whose skills hold no repo-relative or checkout paths', t => {
  const root = new URL('../', import.meta.url);
  const { spawnSync } = process.getBuiltinModule('node:child_process');
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) { t.skip('not a git checkout'); return; }
  const tree = new Map();
  for (const path of listed.stdout.split('\0').filter(Boolean)) { try { tree.set(path, { buffer: readFileSync(new URL(path, root)), mode: '100644' }); } catch { /* removed in the working tree */ } }
  const config = JSON.parse(tree.get('export-public.json').buffer.toString('utf8'));
  const { files } = buildCopy(tree, config, { version: '0.0.0', year: '2026' });
  const skillDirs = readdirSync(new URL('.agents/skills/', root)).filter((n) => n.startsWith('jig-'));
  assert.ok(skillDirs.length > 5);
  for (const name of skillDirs) {
    const body = files.get(`skills/${name}/SKILL.md`).buffer.toString('utf8');
    assert.doesNotMatch(body, /<skill-folder>/, name);
    for (const m of body.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/((?:skills\/[\w-]+\/|scripts\/)[\w./-]+)/g)) assert.ok(files.has(m[1].replace(/[.,;:)]+$/, '')), `${name}: ${m[0]} is not in the copy`);
    assert.doesNotMatch(body, /(?<![\w}\/.-])scripts\/[\w.-]+\.mjs/, `${name}: repo-relative scripts path`);
  }
  for (const f of files.keys()) if (f.startsWith('commands/')) assert.ok(files.has(`skills/jig-${f.slice(9, -3)}/SKILL.md`), `${f} has no skill`);
  for (const name of skillDirs) assert.ok(files.has(`commands/${name.slice(4)}.md`), `${name} has no alias`);
});

test('[risk: private list leaks into a repo] no private term appears in any file the export would ship (list read from JIG_HOME, never copied)', t => {
  const { terms, gap } = loadPrivateTerms(process.env);
  if (gap) { t.diagnostic(`gap: ${gap}; this check did not run`); return t.skip(gap); }
  const tree = workingTree();
  if (!tree) return t.skip('not a git checkout');
  const config = JSON.parse(tree.get('export-public.json').buffer.toString('utf8'));
  const { files } = buildCopy(tree, config, { version: '0.0.0', year: '2026' });
  const ctx = makeContext({ privateTerms: terms });
  const found = [];
  for (const [path, entry] of files) {
    found.push(...scanPath(path, ctx));
    const body = entry.buffer.toString('utf8');
    found.push(...scanText(path, body, ctx).filter((f) => f.kind === 'private-term'));
  }
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}: ${f.detail}`), []);
});

test('[risk: install names hardcoded in docs] the root README and the plugin README take marketplace, repo and plugin names from config', t => {
  const f = makeJig(t, { files: { 'docs/jig-at-work.md': 'claude plugin marketplace add {{marketplaceRepo}}\nclaude plugin install {{pluginName}}@{{marketplaceName}}\n' }, });
  assert.equal(run(f, makeHome(t)).status, 0);
  const text = readFileSync(join(f.out, 'plugins', 'jig', 'README.md'), 'utf8');
  assert.equal(text, 'claude plugin marketplace add fixture-owner/fixture-skills\nclaude plugin install jig@fixture-market\n');
});

test('[risk: README loses the install, update or uninstall steps] the real README sources give exact commands for Claude Code and Codex', t => {
  const tree = workingTree();
  if (!tree) return t.skip('not a git checkout');
  const config = JSON.parse(tree.get('export-public.json').buffer.toString('utf8'));
  if (!tree.has('docs/public/skills-readme.md')) return t.skip('root README template is not part of an exported plugin');
  const { files } = buildRepo(tree, config, { version: '0.0.0', year: '2026' });
  const lines = [
    'claude plugin marketplace add andrewbhy/skills', 'claude plugin install jig@andrewbhy', 'claude plugin marketplace update andrewbhy', 'claude plugin update jig@andrewbhy', 'claude plugin uninstall jig@andrewbhy', 'claude plugin marketplace remove andrewbhy',
    'codex plugin marketplace add andrewbhy/skills', 'codex plugin add jig@andrewbhy', 'codex plugin marketplace upgrade andrewbhy', 'codex plugin remove jig@andrewbhy', 'codex plugin marketplace remove andrewbhy',
  ];
  for (const path of ['README.md', 'plugins/jig/README.md']) {
    const body = files.get(path).buffer.toString('utf8');
    for (const line of lines) assert.ok(body.includes(line), `${path} lacks: ${line}`);
    assert.match(body, /~\/\.jig/); assert.match(body, /tower/i);
    assert.doesNotMatch(body, /\{\{/);
  }
  assert.match(files.get('plugins/jig/README.md').buffer.toString('utf8'), /[Dd]etached/);
});
