import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'tests/fixtures/verify');
const run = (args, cwd = root) => {
  const env = { ...process.env };
  // These are independent fixture runs, not nested node:test workers.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
};
const passed = (result) => assert.equal(result.status, 0, result.stdout + result.stderr);

for (const [name, file, before, after, testFile, failures] of [
  ['reading-list', 'items.mjs', 'title.trim().length === 0', 'title.length === 0', 'items.test.mjs', 2],
  ['import-parser', 'parse-items.mjs', 'record.title.trim().length === 0', 'record.title.length === 0', 'parse-items.test.mjs', 2],
]) {
  test(`${name}: isolated seed fails whitespace checks, then restoration passes`, async (t) => {
    // Exclusive scratch directory under the worktree; remove only this test's copy.
    const scratch = await mkdtemp(join(root, '.verify-fixture-'));
    t.after(() => rm(scratch, { recursive: true }));
    const destination = join(scratch, name);
    const sourcePath = join(fixtures, name, file);
    const source = await readFile(sourcePath, 'utf8');
    passed(run([join(fixtures, 'prepare.mjs'), name, destination, '--seed']));
    const seeded = await readFile(join(destination, file), 'utf8');
    assert.equal(seeded, source.replace(before, after));
    assert.equal(await readFile(sourcePath, 'utf8'), source);
    // Run leftovers must not show up as project changes.
    const ignored = (await readFile(join(destination, '.gitignore'), 'utf8')).split('\n');
    for (const entry of ['/.jig/telemetry.jsonl', '/.jig/evidence/']) assert.ok(ignored.includes(entry), entry);

    const detected = run(['--test', '--test-reporter=tap', join('test', testFile)], destination);
    assert.equal(detected.status, 1, detected.stdout + detected.stderr);
    assert.match(detected.stdout, new RegExp(`# fail ${failures}\\b`));
    assert.match(detected.stdout, /ERR_ASSERTION/);
    assert.match(detected.stdout, /not ok .*invalid title/);

    await writeFile(join(destination, file), seeded.replace(after, before));
    passed(run(['--test', join('test', testFile)], destination));
    passed(run(['--test', 'test/*.test.mjs'], destination));
    // A clean candidate must pass the budget/tag check, so sessions are not prompted to rewrite fixture tests.
    passed(run([join(root, '.agents/skills/jig-verify/test-budget.mjs'), '--', 'node', '--test', 'test/*.test.mjs'], destination));

    // Refusing an existing destination must preserve its restored contents.
    assert.notEqual(run([join(fixtures, 'prepare.mjs'), name, destination, '--seed']).status, 0);
    assert.equal(await readFile(join(destination, file), 'utf8'), source);

    if (name === 'import-parser') {
      const control = join(scratch, 'control');
      passed(run([join(fixtures, 'prepare.mjs'), name, control]));
      passed(run(['--test', 'test/*.test.mjs'], control));
      await assert.rejects(access(join(control, '.jig/verify.json')), { code: 'ENOENT' });
    }
  });
}
