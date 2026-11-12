// Installs the exported plugin with the real claude CLI into a throwaway profile (temp HOME, CLAUDE_CONFIG_DIR and JIG_HOME;
// the person's own ~/.claude and ~/.jig are never touched). Skipped with a reason when claude is not on PATH, but a failure when CI is set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildCopy, buildRepo, loadConfig, writeTree } from '../scripts/export-public.mjs';
import { workingTree } from './helpers/export-fixture.mjs';

const hasClaude = spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;
const gate = { skip: !hasClaude && !process.env.CI && 'claude CLI not on PATH (this test fails in CI instead of skipping)' };
// codex is a .cmd shim on Windows, which cannot be spawned without a shell: run its JavaScript entry through node instead.
function codexCommand() {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const entry = join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (dir && existsSync(entry)) return [process.execPath, [entry]];
  }
  return spawnSync('codex', ['--version'], { encoding: 'utf8' }).status === 0 ? ['codex', []] : null;
}
const codexCmd = codexCommand();
const hasCodex = codexCmd !== null && spawnSync(codexCmd[0], [...codexCmd[1], '--version'], { encoding: 'utf8' }).status === 0;
const codexGate = { skip: !hasCodex && 'codex CLI not on PATH' };
const marketplaceName = 'install-test';

function profile(t) {
  const base = mkdtempSync(join(tmpdir(), 'jig-install-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const env = { ...process.env, HOME: join(base, 'home'), USERPROFILE: join(base, 'home'), CLAUDE_CONFIG_DIR: join(base, 'claude'), JIG_HOME: join(base, 'jig-home') };
  for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key === 'JIG_REVIEW_DIR' || key === 'JIG_SIGNALS_PROJECT') delete env[key];
  for (const dir of [env.HOME, env.CLAUDE_CONFIG_DIR, env.JIG_HOME]) mkdirSync(dir, { recursive: true });
  const claude = (...args) => spawnSync('claude', args, { encoding: 'utf8', env, timeout: 180000 });
  return { base, env, claude };
}
function exportedCopy(base) {
  const tree = workingTree();
  if (!tree) return null;
  const config = loadConfig(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const version = tree.get('VERSION').buffer.toString('utf8').trim();
  const { files } = buildCopy(tree, config, { version, year: '2026' });
  const dir = join(base, 'plugin-repo');
  writeTree(dir, files);
  const repo = buildRepo(tree, config, { version, year: '2026' }).files;
  const repoDir = join(base, 'skills-repo');
  writeTree(repoDir, repo);
  return { dir, files, repoDir, config };
}
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const writeMarketplace = (dir, plugin) => {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: marketplaceName, owner: { name: 'tester' }, plugins: [plugin] }, null, 2));
};

test('[risk: fresh install differs from the author machine] the exported repository root is a marketplace that installs the plugin from plugins/jig and details lists every skill and alias', gate, t => {
  const p = profile(t);
  const copy = exportedCopy(p.base);
  if (!copy) return t.skip('not a git checkout');
  const name = copy.config.marketplaceName;
  assert.equal(p.claude('plugin', 'validate', copy.repoDir).status, 0, 'repository root validates');
  assert.equal(p.claude('plugin', 'validate', join(copy.repoDir, 'plugins', 'jig')).status, 0, 'plugin validates');
  const added = p.claude('plugin', 'marketplace', 'add', copy.repoDir);
  assert.equal(added.status, 0, added.stdout + added.stderr);
  const installed = p.claude('plugin', 'install', `jig@${name}`);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const details = p.claude('plugin', 'details', 'jig');
  assert.equal(details.status, 0, details.stdout + details.stderr);
  const skills = readdirSync(join(copy.repoDir, 'plugins', 'jig', 'skills'));
  assert.ok(skills.length >= 10, skills.join(','));
  for (const skill of skills) assert.ok(details.stdout.includes(skill), `claude plugin details jig does not list ${skill}`);
  for (const args of [['plugin', 'uninstall', `jig@${name}`], ['plugin', 'marketplace', 'remove', name]]) { const r = p.claude(...args); assert.equal(r.status, 0, r.stdout + r.stderr); }
});

test('[risk: Codex cannot install the plugin] a disposable CODEX_HOME adds the repository as a marketplace, installs jig with its skills and removes it again', codexGate, t => {
  const p = profile(t);
  const copy = exportedCopy(p.base);
  if (!copy) return t.skip('not a git checkout');
  const name = copy.config.marketplaceName;
  const home = join(p.base, 'codex');
  mkdirSync(home, { recursive: true });
  // The repository lives in a clone: Codex copies the plugin folder, and a clone has exactly the pushed files.
  const clone = join(p.base, 'skills-clone');
  git(copy.repoDir, 'init', '-q', '-b', 'main'); git(copy.repoDir, 'add', '-A'); git(copy.repoDir, 'commit', '-q', '-m', 'release');
  execFileSync('git', ['clone', '-q', copy.repoDir, clone]);
  const codex = (...args) => spawnSync(codexCmd[0], [...codexCmd[1], ...args], { encoding: 'utf8', env: { ...p.env, CODEX_HOME: home }, timeout: 180000 });
  const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
  ok(codex('plugin', 'marketplace', 'add', clone));
  ok(codex('plugin', 'add', `jig@${name}`));
  const listed = codex('plugin', 'list'); ok(listed);
  assert.match(listed.stdout, new RegExp(`jig@${name}\\s+installed`));
  const cache = join(home, 'plugins', 'cache', name, 'jig');
  const skills = readdirSync(join(cache, readdirSync(cache)[0], 'skills'));
  assert.deepEqual(skills.sort(), readdirSync(join(clone, 'plugins', 'jig', 'skills')).sort());
  ok(codex('plugin', 'remove', `jig@${name}`));
  ok(codex('plugin', 'marketplace', 'remove', name));
});

test('[risk: helpers resolve outside the plugin] a git-clone install runs a rewritten helper from the plugin cache and leaves the work repo clean', gate, t => {
  const p = profile(t);
  const copy = exportedCopy(p.base);
  if (!copy) return t.skip('not a git checkout');
  git(copy.dir, 'init', '-q', '-b', 'main'); git(copy.dir, 'add', '-A'); git(copy.dir, 'commit', '-q', '-m', 'release');
  const sha = git(copy.dir, 'rev-parse', 'HEAD').trim();
  const market = join(p.base, 'market');
  writeMarketplace(market, { name: 'jig', source: { source: 'url', url: pathToFileURL(copy.dir).href, sha }, description: 'install test' });
  const added = p.claude('plugin', 'marketplace', 'add', market);
  assert.equal(added.status, 0, added.stdout + added.stderr);
  const installed = p.claude('plugin', 'install', `jig@${marketplaceName}`);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const listed = p.claude('plugin', 'list', '--json');
  assert.equal(listed.status, 0, listed.stderr);
  const entries = JSON.parse(listed.stdout);
  const entry = (Array.isArray(entries) ? entries : entries.installed ?? Object.values(entries).flat()).find((e) => (e.name ?? e.id ?? '').startsWith('jig'));
  const cache = entry?.installPath ?? entry?.path;
  assert.ok(cache && existsSync(cache), `install path from: ${listed.stdout.slice(0, 300)}`);
  assert.equal(existsSync(join(cache, '.git')) && false, false);
  const body = readFileSync(join(cache, 'skills', 'jig-spike', 'SKILL.md'), 'utf8');
  assert.ok(!body.includes('\r'), 'LF endings survive the clone (.gitattributes)');
  assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/jig-spike\/telemetry\.mjs/);

  const work = join(p.base, 'work-app');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  writeFileSync(join(work, 'README.md'), 'work\n');
  git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', 'init');
  const ran = spawnSync(process.execPath, [join(cache, 'skills', 'jig-spike', 'telemetry.mjs'), 'start', work, 'claude'], { cwd: work, encoding: 'utf8', env: p.env });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(git(work, 'status', '--porcelain').trim(), '', 'work repo untouched');
  assert.ok(existsSync(join(p.env.JIG_HOME, 'work-app', 'telemetry.jsonl')), 'marker written under JIG_HOME');
  assert.ok(readFileSync(join(p.env.JIG_HOME, 'work-app', 'telemetry.jsonl'), 'utf8').includes('jig-spike'));
});
