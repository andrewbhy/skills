// Shared fixtures for the export tests: a small jig-like repository, a private list in a temp JIG_HOME and a CLI runner.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const exportScript = fileURLToPath(new URL('../../scripts/export-public.mjs', import.meta.url));
const identity = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
export const git = (cwd, ...args) => execFileSync('git', [...identity, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export const baseConfig = {
  include: ['.agents/', '.claude/', '.gitattributes', 'VERSION', 'package.json', 'package-lock.json', 'export-public.json', 'commands/', 'scripts/', 'tests/', 'docs/*.md', 'docs/public/'],
  exclude: ['docs/secret-notes.md', 'docs/public/skills-readme.md', 'README.md'],
  binary: [],
  rename: { 'docs/public/ci.yml': '.github/workflows/ci.yml', 'docs/jig-at-work.md': 'README.md' },
  pluginName: 'jig',
  pluginDescription: 'fixture plugin',
  licenseHolder: 'fixture-owner',
  marketplaceName: 'fixture-market',
  marketplaceOwner: 'fixture-owner',
  marketplaceRepo: 'fixture-owner/fixture-skills',
  pluginDir: 'plugins/jig',
  releaseAuthor: 'fixture release <fixture-release@users.noreply.github.com>',
  linkExempt: ['.agents/skills/'],
};

export const skillText = [
  '---', 'name: "jig-demo"', 'description: "Demo skill."', '---', '',
  '# Demo', '',
  'Start: run `node "<skill-folder>/telemetry.mjs" start "<project-root>" <provider>`.',
  'Then `node scripts/queue.mjs status` and see [notes](notes.md).', '',
].join('\n');

// Creates <parent>/jig as a committed repository. `files` adds or replaces tracked files (null removes a default).
export function makeJig(t, { files = {}, config = {}, symlinks = {} } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'jig-export-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'jig');
  mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  const all = {
    VERSION: '0.1.0\n',
    'package.json': '{ "name": "jig", "private": true, "scripts": { "test": "node -e 0" } }\n',
    'package-lock.json': '{ "name": "jig", "lockfileVersion": 3, "requires": true, "packages": {} }\n',
    '.gitattributes': '* text=auto eol=lf\n',
    'export-public.json': JSON.stringify({ ...baseConfig, ...config }, null, 2) + '\n',
    '.agents/skills/jig-demo/SKILL.md': skillText,
    '.agents/skills/jig-demo/notes.md': 'Notes.\n',
    '.agents/skills/jig-demo/telemetry.mjs': 'export {};\n',
    'scripts/queue.mjs': 'export {};\n',
    'commands/demo.md': '---\ndescription: Alias\n---\nUse the jig-demo skill for: $ARGUMENTS\n',
    'docs/borrowed.md': '# Borrowed\n\n| Source | Repository | Pin | Licence | Adaptation / retained notice |\n|---|---|---|---|---|\n| Example | example-org/example-repo | v1.2.3 | MIT | Ideas only. |\n',
    'docs/secret-notes.md': 'excluded content\n',
    'docs/public/ci.yml': 'name: ci\njobs:\n  test:\n    runs-on: x\n    steps:\n      - run: npm ci\n',
    'docs/public/skills-readme.md': '# skills\n\nclaude plugin marketplace add {{marketplaceRepo}}\nclaude plugin install {{pluginName}}@{{marketplaceName}}\nSee [plugin]({{pluginDir}}/README.md).\n',
    'docs/jig-at-work.md': '# jig\n',
    'README.md': 'readme\n',
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    if (text === null) continue;
    const path = join(root, ...name.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  git(root, 'add', '-A');
  for (const [name, target] of Object.entries(symlinks)) {
    const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: target, encoding: 'utf8' }).trim();
    git(root, 'update-index', '--add', '--cacheinfo', `120000,${oid},${name}`);
  }
  git(root, 'commit', '-q', '-m', 'fixture');
  return { parent, root, out: join(parent, 'out') };
}

// A temp JIG_HOME holding a private list. `terms` null means no list file.
export function makeHome(t, terms = ['acme-secret-project']) {
  const home = mkdtempSync(join(tmpdir(), 'jig-export-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  if (terms) writeFileSync(join(home, 'export-private.txt'), ['# private list for tests', ...terms, ''].join('\n'));
  return home;
}

export function run(fixture, home, args = [], { cwd = fixture.parent, fast = true, extraEnv = {} } = {}) {
  const fastArgs = fast ? ['--skip-validate', '--skip-sync-check', '--skip-tests'] : [];
  const result = spawnSync(process.execPath, [exportScript, '--source', fixture.root, '--out', fixture.out, ...fastArgs, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, JIG_HOME: home, ...extraEnv },
  });
  return { status: result.status, out: result.stdout + result.stderr, stdout: result.stdout, stderr: result.stderr };
}

export const findings = (result) => result.out.split('\n').filter((line) => line.startsWith('FINDING '));

// The real checkout as a file map (tracked files, working-tree content), for tests that build the plugin copy.
export function workingTree() {
  const root = new URL('../../', import.meta.url);
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) return null;
  const tree = new Map();
  for (const path of listed.stdout.split('\0').filter(Boolean)) { try { tree.set(path, { buffer: readFileSync(new URL(path, root)), mode: '100644' }); } catch { /* removed in the working tree */ } }
  return tree;
}
