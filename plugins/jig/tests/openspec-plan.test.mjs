import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeOpenSpecPlan } from '../scripts/openspec-plan.mjs';
import { checkFile } from '../scripts/brief-check.mjs';
const plan = readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url), 'utf8');
function snapshot(root, prefix = '') {
  return Object.fromEntries(readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = join(prefix, entry.name);
    return entry.isDirectory() ? Object.entries(snapshot(root, path)) : [[path, readFileSync(join(root, path), 'hex')]];
  }));
}
test('[risk: OpenSpec mode corrupts existing tooling] recorded trial tree is preserved while a change is written', t => {
  const root = mkdtempSync(join(process.cwd(), '.jig-openspec-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL('./fixtures/openspec', import.meta.url), join(root, 'openspec'), { recursive: true });
  for (const path of ['.agents/skills', '.claude/commands']) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, 'sentinel.md'), 'untouched tool file\n');
  }
  const before = snapshot(root);
  const target = writeOpenSpecPlan(root, 'example-plan', 'launch-check', plan);
  const after = snapshot(root);
  for (const [path, bytes] of Object.entries(before)) assert.equal(after[path], bytes, path);
  const additions = Object.keys(after).filter(path => !(path in before));
  assert.equal(additions.length, 4);
  assert(additions.every(path => path.startsWith(join('openspec', 'changes', 'example-plan'))));
  assert.deepEqual(checkFile(join(target, 'design.md')), []);
  assert.match(readFileSync(join(target, 'specs/launch-check/spec.md'), 'utf8'), /^## ADDED Requirements\n\n### Requirement:/);
  assert.match(readFileSync(join(target, 'tasks.md'), 'utf8'), /- \[ \] Prove/);
  assert.throws(() => writeOpenSpecPlan(root, 'example-plan', 'launch-check', plan), /already exists/);
  for (const id of ['../escape', 'archive', 'C:bad']) assert.throws(() => writeOpenSpecPlan(root, id, 'launch-check', plan));
  assert.throws(() => writeOpenSpecPlan(root, 'invalid-plan', 'launch-check', 'no sections'), /missing/);
  assert.deepEqual(snapshot(root), after);
});
