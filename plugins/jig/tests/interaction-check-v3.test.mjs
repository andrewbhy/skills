import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { check, checkRegistry } from '../scripts/interaction-check.mjs';
import { calibrate } from '../scripts/interaction-calibrate.mjs';

const dir = new URL('./fixtures/interaction/calibration/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
const control = () => read('round-three-control.json');
const errors = spec => check(spec).findings.filter(f => f.severity === 'error');
const has = (spec, rule) => errors(spec).some(f => f.rule === rule);

test('round three calibration catches every planted defect and keeps its control clean', () => {
  const result = calibrate(fileURLToPath(dir));
  assert(result.rows.filter(r => r.id.startsWith('R3-')).every(r => r.flagged));
  assert(result.controls.every(c => c.clean), JSON.stringify(result.controls));
  assert.deepEqual(errors(control()), []);
});

test('rule 6 reserves letters only on opt-in, in spec and registry, with approved exceptions', () => {
  const spec = control();
  spec.verbs.find(v => v.id === 'select').ability = false;
  assert(has(spec, '6'));
  const registry = { bindings: [{ input: 'q', verb: 'select' }, { input: 'r', verb: 'select' }] };
  assert.equal(checkRegistry(spec, registry).findings.filter(f => f.rule === '6').length, 2);
  for (const input of ['q', 'r']) spec.config.reservedKeyExceptions.push({ input, verb: 'select', reason: 'project convention', approvedBy: 'person' });
  assert(!has(spec, '6'));
  assert.deepEqual(checkRegistry(spec, registry).findings, []);
  delete spec.config.reservedKeyExceptions.at(-1).approvedBy;
  assert(has(spec, '6'));
  delete spec.config.reservedKeys;
  assert(!has(spec, '6'), 'legacy digits-only policy');
});

test('rule 12 also catches storyboard redirects; inspect-only targets may carry a reason', () => {
  const spec = control();
  spec.storyboard.at(-1).result = 'try right-click instead';
  assert(has(spec, '12'));
  spec.storyboard.at(-1).result = 'select a unit first';
  assert(!has(spec, '12'));
  spec.inputs = spec.inputs.filter(r => !Array.isArray(r.input) || !r.input.includes('left-click an enemy'));
  assert(has(spec, '12'));
  spec.verbs.find(v => v.id === 'select').primaryClick = 'inspect-only: shows the target status';
  assert(!has(spec, '12'));
});

test('rule 13 permits taught exceptions and optional disabledShown defaults to visible', () => {
  const spec = read('round-three-hidden-menu.json');
  spec.nothingToTeach = ['downed ally'];
  assert(!has(spec, '13'));
  const verb = spec.verbs.find(v => v.id === 'select');
  delete verb.disabledShown;
  assert(!has(spec, '13'));
  verb.disabledShown = 'vanished';
  assert(has(spec, '13'));
  verb.disabledShown = 'absent';
  spec.tasks[0].primary = false;
  spec.tasks[0].rescue = true;
  assert(has(spec, '13'), 'rare rescue actions stay visible');
});

test('rule 14 uses legacy targetRule nouns and requires target frames on the owning task', () => {
  const spec = control();
  const verb = spec.verbs.find(v => v.id === 'select');
  delete verb.targets;
  verb.targetRule = 'enemy or downed ally';
  assert(!has(spec, '14'));
  spec.storyboard.at(-1).task = 'unrelated';
  assert(has(spec, '14'));
});

test('rule 9 permanent and geometric exceptions, and failures of each gating field', () => {
  const spec = control();
  const state = spec.flows.find(f => f.verb === 'select').states[0];
  for (const field of ['visibleAs', 'reason', 'turnsLeft', 'clear']) {
    const original = state[field]; delete state[field];
    assert(has(spec, '9'), field); state[field] = original;
  }
  state.permanent = true; delete state.turnsLeft; delete state.clear;
  assert(!has(spec, '9'));
  state.gates = ['end-turn'];
  assert(has(spec, '9'));
  spec.verbs.find(v => v.id === 'select').geometric = true;
  assert(!has(spec, '9'));
});

test('existing project interaction specs remain clean without new annotations', () => {
  const root = new URL('../docs/design/', import.meta.url);
  // The public export leaves private project specs out, so the folder can be missing.
  if (!existsSync(root)) return;
  for (const file of readdirSync(root).filter(f => f.endsWith('.interaction.json'))) {
    assert.deepEqual(errors(JSON.parse(readFileSync(new URL(file, root), 'utf8'))), [], file);
  }
});
