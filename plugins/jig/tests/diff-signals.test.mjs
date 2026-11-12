import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { diffSignals } from '../scripts/diff-signals.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts/diff-signals.mjs');
function repository(t) {
  const cwd = mkdtempSync(join(root, '.diff-signals-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  const put = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const commit = () => { git('add', '--all'); git('commit', '-qm', 'fixture', '--allow-empty'); return git('rev-parse', 'HEAD'); };
  return { cwd, put, commit, git };
}

test('empty diff and unknown file type are lower bounds, not invented seats', t => {
  const { cwd, put, commit } = repository(t);
  const base = commit();
  assert.deepEqual(diffSignals(cwd, base, base).files, []);
  assert.deepEqual(diffSignals(cwd, base, base).signals, []);
  put('something.unknown', 'new\n');
  const result = diffSignals(cwd, base, commit());
  assert.equal(result.minimumClass, 'trivial');
  assert.deepEqual(result.requiredSeats, []);
  assert.deepEqual(result.files[0].size, { additions: 1, deletions: 0, changedLines: 1, binary: false });
});

for (const [path, text, id, floor, required] of [
  ['db/migrations/001.sql', 'CREATE TABLE items (id INT);\n', 'migration', 'risky', ['qa', 'architecture']],
  ['src/auth/check.mjs', 'export const check = () => true;\n', 'auth', 'risky', ['qa', 'security']],
  ['src/ordinary.mjs', 'if (hasPermission(user)) allow();\n', 'auth', 'risky', ['qa', 'security']],
  ['src/jobs.mjs', 'Atomics.add(shared, 0, 1);\n', 'concurrency', 'risky', ['qa', 'architecture']],
  ['src/Page.tsx', '<button>Save</button>\n', 'ui', 'behaviour', ['qa', 'visual-craft', 'fidelity', 'content-stress', 'motion', 'accessibility']],
  ['.agents/skills/example/SKILL.md', '# Changed skill\n', 'skill', 'refactor', ['qa', 'architecture']],
]) {
  test(`${id}: fixed floor and required seats`, t => {
    const { cwd, put, commit } = repository(t);
    const base = commit();
    put(path, text);
    const result = diffSignals(cwd, base, commit());
    assert.equal(result.minimumClass, floor);
    assert.deepEqual(result.requiredSeats, required);
    assert.ok(result.files[0].signals.some(s => s.id === id));
  });
}

test('default money paths require risky review and product, including with partial configuration', t => {
  const { cwd, put, commit } = repository(t);
  const base = commit();
  const paths = ['pricing.mjs', 'src/billing/rate.mjs', 'lib/payment-service.ts',
    'invoice.json', 'src/checkout.mjs', 'src/discounts/apply.mjs'];
  for (const path of paths) put(path, 'changed\n');
  const revision = commit();
  const check = result => {
    assert.equal(result.minimumClass, 'risky');
    assert.deepEqual(result.requiredSeats, ['product']);
    for (const path of paths) {
      const file = result.files.find(file => file.path === path);
      assert.ok(file.signals.some(signal => signal.id === 'path'
        && signal.minimumClass === 'risky' && signal.seats.includes('product')), path);
    }
    assert.ok(result.configuration.paths.length > 0);
  };
  const cli = spawnSync(process.execPath, [script, base, revision], { cwd, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  check(JSON.parse(cli.stdout));
  put('.jig/review.json', JSON.stringify({ rules: ['README.md'] }));
  const configuredBase = commit();
  for (const path of paths) put(path, 'changed again\n');
  check(diffSignals(cwd, configuredBase, commit()));
});

test('path/type mappings are additive; base policy prevents candidate lowering', t => {
  const { cwd, put, commit } = repository(t);
  put('.jig/review.json', JSON.stringify({
    paths: [{ pattern: '**/billing/**', class: 'risky', seats: ['product'] }],
    fileTypes: [{ extension: '.unusual', class: 'refactor', seats: ['architecture'] }],
    largeDiff: { files: 100, lines: 10000 },
  }));
  const base = commit();
  put('billing/rate.unusual', 'rate\n');
  put('.jig/review.json', '{}');
  const result = diffSignals(cwd, base, commit());
  const file = result.files.find(f => f.path === 'billing/rate.unusual');
  assert.deepEqual(file.signals.map(s => s.id), ['path', 'file-type']);
  assert.equal(result.minimumClass, 'risky');
  assert.deepEqual(result.requiredSeats, ['product', 'architecture']);
  assert.ok(result.signals.some(s => s.id === 'review-config'));
});

test('[risk: existing design mappings silently lose rendered review] legacy seat expands to all four visual seats', t => {
  const { cwd, put, commit } = repository(t);
  put('.jig/review.json', JSON.stringify({ paths: [{ pattern: 'widgets/**', class: 'behaviour', seats: ['design'] }] }));
  const base = commit(); put('widgets/render.mjs', 'export const visible = true;\n');
  const result = diffSignals(cwd, base, commit());
  assert.deepEqual(result.requiredSeats, ['visual-craft', 'fidelity', 'content-stress', 'motion']);
  assert(!result.requiredSeats.includes('design'));
});

test('large diff uses line and file thresholds, including default limits', t => {
  const { cwd, put, commit } = repository(t);
  const base = commit();
  put('large.txt', 'line\n'.repeat(1000));
  assert.ok(diffSignals(cwd, base, commit()).signals.some(s => s.id === 'large-diff'));
  put('.jig/review.json', JSON.stringify({ largeDiff: { files: 2 } }));
  const nextBase = commit();
  put('a.txt', 'a'); put('b.txt', 'b');
  assert.equal(diffSignals(cwd, nextBase, commit()).minimumClass, 'risky');
});

test('npm dependency changes exclude metadata; exact patch bumps remain mechanical', t => {
  const { cwd, put, commit } = repository(t);
  const pkg = dependency => JSON.stringify({ name: 'fixture', dependencies: { tiny: dependency } });
  put('package.json', pkg('1.2.3'));
  const base = commit();
  put('package.json', pkg('1.2.4'));
  assert.equal(diffSignals(cwd, base, commit()).minimumClass, 'mechanical');
  put('package.json', pkg('1.3.0'));
  assert.equal(diffSignals(cwd, base, commit()).minimumClass, 'risky');
  put('package.json', pkg('^1.2.4'));
  assert.equal(diffSignals(cwd, base, commit()).minimumClass, 'risky');
  put('package.json', JSON.stringify({ name: 'renamed', dependencies: { tiny: '1.2.3' } }));
  assert.equal(diffSignals(cwd, base, commit()).signals.length, 0);
  put('package.json', '{}');
  assert.equal(diffSignals(cwd, base, commit()).minimumClass, 'risky');
});

for (const [path, text] of [
  ['package.json', '{"devDependencies":{"tiny":"1.0.0"}}'],
  ['composer.json', '{"require":{"vendor/lib":"1.0.0"}}'],
  ['Cargo.toml', '[dependencies]\ntiny = "1"\n'],
  ['pyproject.toml', '[project]\nname = "fixture"\ndependencies = [\n "tiny==1.0.0",\n]\n'],
  ['Pipfile', '[packages]\ntiny = "==1.0.0"\n'],
  ['requirements-dev.txt', 'tiny==1.0.0\n'],
  ['go.mod', 'module fixture\nrequire (\n example.invalid/tiny v1.0.0\n)\n'],
  ['Gemfile', 'gem "tiny", "1.0.0"\n'],
  ['pom.xml', '<project><dependencies><dependency><artifactId>tiny</artifactId></dependency></dependencies></project>'],
  ['app.csproj', '<Project><PackageReference Include="Tiny" Version="1.0.0" /></Project>'],
  ['build.gradle.kts', 'dependencies {\n implementation("example:tiny:1.0.0")\n}\n'],
  ['pnpm-lock.yaml', 'lockfileVersion: 9\n'],
  ['package.json', '{malformed'],
]) {
  test(`dependency detection: ${path} ${text.startsWith('{malformed') ? 'malformed' : ''}`, t => {
    const { cwd, put, commit } = repository(t);
    const base = commit();
    put(path, text);
    const result = diffSignals(cwd, base, commit());
    assert.equal(result.minimumClass, 'risky');
    assert.deepEqual(result.requiredSeats, ['security', 'architecture']);
    assert.ok(result.signals.some(s => s.id === 'dependency'));
  });
}

test('deletions and renames keep old-path signals; binary sizes and odd names survive', t => {
  const { cwd, put, commit, git } = repository(t);
  put('src/auth.mjs', 'export const yes = true;\n');
  const base = commit();
  git('mv', 'src/auth.mjs', 'plain.mjs');
  const oddName = process.platform === 'win32' ? "odd ' [name].bin" : 'odd\tname.bin';
  put(oddName, Buffer.from([0, 1, 2, 0]));
  const result = diffSignals(cwd, base, commit());
  assert.ok(result.files.find(f => f.path === 'src/auth.mjs').signals.some(s => s.id === 'auth'));
  assert.deepEqual(result.files.find(f => f.path === oddName).size, { additions: null, deletions: null, changedLines: null, binary: true });
  assert.equal(result.minimumClass, 'risky');
});

test('CLI emits JSON, rejects bad refs/configuration, and ignores uncommitted changes', t => {
  const { cwd, put, commit } = repository(t);
  const base = commit();
  put('auth.mjs', 'hasPermission(user)');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  const success = run(base, base);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).files.length, 0);
  for (const args of [[base], [base, '--help'], [base, 'nonexistent'], [base, base, 'extra']]) {
    const failed = run(...args);
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
  }
  put('.jig/review.json', '{"paths":[{"pattern":"**","class":"unsafe","seats":[]}]}');
  const bad = commit();
  assert.throws(() => diffSignals(cwd, bad, bad), /Invalid paths mapping/);
  put('.jig/review.json', '{');
  const malformed = commit();
  assert.equal(run(malformed, malformed).status, 1);
  put('.jig/review.json', '');
  const emptyConfig = commit();
  assert.equal(run(emptyConfig, emptyConfig).status, 1);
});

test('malformed configuration cannot silently drop required mappings', t => {
  const { cwd, put, commit } = repository(t);
  for (const config of [
    { largeDiff: [] }, { largeDiff: { lines: 0 } }, { largeDiff: 10 },
    { paths: [{ pattern: '**', class: 'trivial', seats: ['unknown'] }] },
    { rules: ['../outside.md'] }, { vision: [['C:', 'outside.md'].join('/')] },
    { reportDirectory: '/outside' }, { ignoredTypo: true },
  ]) {
    put('.jig/review.json', JSON.stringify(config));
    const base = commit();
    assert.throws(() => diffSignals(cwd, base, base));
  }
});

test('auth content signals survive user colour and output indicator settings', t => {
  const { cwd, put, commit, git } = repository(t);
  const base = commit();
  put('src/check.mjs', 'user.permissions.includes("edit");\n');
  const revision = commit();
  git('config', 'color.ui', 'always');
  git('config', 'diff.outputIndicatorNew', '>');
  assert.ok(diffSignals(cwd, base, revision).signals.some(s => s.id === 'auth'));
});
