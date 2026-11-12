import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const draft = join(root, 'skill-drafts/jig-typescript/scenarios');
const scenarios = existsSync(draft) ? draft : join(root, '.agents/skills/jig-typescript/scenarios');
function run(args, cwd = root) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 30_000 });
}
function passed(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('explicit TypeScript repair must preserve public title behaviour', async t => {
  const scratch = await mkdtemp(join(root, '.typescript-fixture-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  passed(run([join(scenarios, 'prove.mjs'), 'prepare', scratch, 'explicit']));
  const args = ['--experimental-strip-types', '--test', 'test/*.test.mjs'];
  // The planted tool hazards do not break the public behaviour to be preserved.
  passed(run(args, scratch));
  const module = join(scratch, 'src/index.ts');
  const clean = await readFile(join(scenarios, 'clean.ts'), 'utf8');
  await writeFile(module, clean);
  passed(run(args, scratch));

  await writeFile(module, '');
  const deleted = run(args, scratch);
  assert.equal(deleted.status, 1, deleted.stdout + deleted.stderr);
  assert.match(deleted.stdout + deleted.stderr, /does not provide an export named 'renderTitle'/);

  await writeFile(module, clean.replace('value.trim().toUpperCase()', 'value.trim()'));
  const changed = run(args, scratch);
  assert.equal(changed.status, 1, changed.stdout + changed.stderr);
  assert.match(changed.stdout + changed.stderr, /ERR_ASSERTION/);

  await writeFile(module, clean.replace('value.trim().length === 0', 'value.length === 0'));
  const invalid = run(args, scratch);
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /Missing expected exception/);

  await writeFile(module, clean);
  passed(run(args, scratch));
});

test('implicit TypeScript ingress tests detect the seed and empty-title regressions', async t => {
  const scratch = await mkdtemp(join(root, '.typescript-fixture-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  passed(run([join(scenarios, 'prove.mjs'), 'prepare', scratch, 'implicit']));
  const manifest = JSON.parse(await readFile(join(scratch, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.test, 'node --experimental-strip-types --test test/*.test.mjs');
  assert.match(await readFile(join(scratch, 'README.md'), 'utf8'), /whitespace-only/);
  assert.deepEqual(JSON.parse(await readFile(join(scratch, 'knip.json'), 'utf8')).entry, ['test/*.test.mjs']);
  const args = ['--run', 'test'];
  const seeded = run(args, scratch);
  assert.equal(seeded.status, 1, seeded.stdout + seeded.stderr);
  for (const name of ['missing', 'null', 'empty', 'whitespace-only']) {
    assert.match(seeded.stdout + seeded.stderr, new RegExp(`(?:not ok .*|✖ )ingress rejects ${name} titles`));
  }
  assert.match(seeded.stdout + seeded.stderr, /Missing expected exception/);
  assert.match(seeded.stdout + seeded.stderr, /(?:ok .*|✔ )ingress accepts a valid title/);

  const module = join(scratch, 'src/index.ts');
  const clean = await readFile(join(scenarios, 'implicit-clean.ts'), 'utf8');
  await writeFile(module, clean);
  passed(run(args, scratch));

  for (const [name, condition] of [
    ['empty', 'false'],
    ['whitespace-only', 'external.title.length === 0'],
  ]) {
    await writeFile(module, clean.replace('external.title.trim().length === 0', condition));
    const regression = run(args, scratch);
    assert.equal(regression.status, 1, regression.stdout + regression.stderr);
    assert.match(regression.stdout + regression.stderr, new RegExp(`(?:not ok .*|✖ )ingress rejects ${name} titles`));
    assert.match(regression.stdout + regression.stderr, /Missing expected exception/);
  }

  await writeFile(module, clean);
  passed(run(args, scratch));
});
