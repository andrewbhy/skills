import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
test('public command still appends an item', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../cli.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), ['Example']);
});
