import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('[risk: skill inventory misses current checkout or stale session] missing and complete loaded lists work by argument, file and stdin', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['jig-plan', 'jig-orchestrate', 'unrelated']) {
    const folder = join(root, '.agents', 'skills', name);
    mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'SKILL.md'), 'fixture');
  }
  mkdirSync(join(root, '.agents', 'skills', 'jig-not-a-skill'));
  const run = (args, input) => spawnSync(process.execPath, ['scripts/skill-load-check.mjs', '--repo', root, ...args], { encoding: 'utf8', input });
  const missing = run(['--loaded', 'jig-plan']);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, 'Jig skills in current checkout: jig-orchestrate, jig-plan\nMissing skills: jig-orchestrate\nFix: install or update the jig plugin, then start a fresh session\n');
  for (const result of [run(['jig-orchestrate', 'jig-plan']), run([], '["jig-plan","jig-orchestrate"]')]) {
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /No missing jig skills/); assert.doesNotMatch(result.stdout, /Fix:/);
  }
  const file = join(root, 'loaded.txt'); writeFileSync(file, 'jig-plan,jig-orchestrate');
  assert.equal(run(['--file', file]).status, 0);
  assert.equal(run(['--loaded', '[]']).status, 1);
  assert.equal(run(['--loaded', '[1]']).status, 2);
});
