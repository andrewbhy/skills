import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { calibrate } from '../scripts/interaction-calibrate.mjs';
import { skillCandidate } from './skill-candidate.mjs';

const dir = new URL('../.agents/skills/jig-interaction/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8');

test('[risk: a checker edit loses a caught rejection reason] calibration keeps at least 5 of 6 and the 3 of 6 pass mark', () => {
  const result = calibrate(fileURLToPath(new URL('./fixtures/interaction/calibration/', import.meta.url)));
  assert.ok(result.score >= 5, `score ${result.score} of ${result.total}`);
  assert.ok(result.score >= result.passMark);
  assert.ok(result.rows.every(r => !r.required || r.flagged), 'new catches must not mask a lost required catch');
});

test('[risk: stale status or missing v2 instructions] SKILL.md states the real status and the new steps', () => {
  const skill = read('SKILL.md');
  assert.doesNotMatch(skill, /fresh two-provider runs are pending/);
  assert.match(skill, /Claude half passed 6\/6/);
  assert.match(skill, /Codex half is pending/);
  for (const part of [/--registry.*mandatory|mandatory.*--registry/s, /build walk/i, /label test/i, /light path/i, /first-click/i, /trip-wire/i, /interaction-calibrate\.mjs/, /interaction-feedback\.mjs/]) assert.match(skill, part);
});

test('seats and templates carry the label seat, build walk, reference teardown and new fields', () => {
  const seats = read('review-seats.md');
  for (const part of [/Label-test seat/, /Build walk/, /First-click/, /observed/i]) assert.match(seats, part);
  const templates = read('templates.md');
  for (const part of [/label.*gloss/s, /Reference teardown/, /budgetSource/, /storyboard/, /visibleAs/]) assert.match(templates, part);
});

test('pattern library has the multi-layer navigation and popup interruption entries', () => {
  const patterns = read('patterns.md');
  assert.match(patterns, /### Layered navigation/);
  assert.match(patterns, /### Interrupting popup/);
});

test('interaction rule annotations and toolbox build gate are documented in the candidate', () => {
  const skill = skillCandidate('.agents/skills/jig-interaction/SKILL.md');
  for (const part of [/reservedKeys/, /reservedKeyExceptions/, /disabledShown/, /nothingToTeach/, /primaryClick/, /turnsLeft/, /defaultFailure/, /firstClick\.observed/, /check-page-shell\.mjs/, /page shell, grid tokens, primitives and components/]) assert.match(skill, part);
  const template = skillCandidate('.agents/skills/jig-interaction/templates.md');
  for (const part of [/reservedKeyExceptions/, /disabledShown/, /defaultFailure/, /firstClick: \{observed/, /none may only redirect/]) assert.match(template, part);
});
