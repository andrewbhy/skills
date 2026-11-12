import test from 'node:test';
import assert from 'node:assert/strict';
import { planSeats } from '../scripts/plan-seats.mjs';
test('[risk: plan signals omit required seats] fixed selection table retains cost and history', () => {
  for (const [signals, expected] of [
    [{}, ['testing', 'cost', 'history']],
    [{ ui: true }, ['testing', 'cost', 'history', 'design', 'accessibility', 'product']],
    [{ module: true, contract: true }, ['testing', 'cost', 'history', 'architecture']],
    [{ behaviour: true }, ['testing', 'cost', 'history', 'product']],
    [{ security: true, data: true }, ['testing', 'cost', 'history', 'security', 'architecture']],
    [{ dependency: true }, ['testing', 'cost', 'history', 'architecture', 'security']]
  ]) {
    const result = planSeats(signals);
    assert.deepEqual(result.selected.map(item => item.seat), expected);
    assert(result.selected.every(item => item.checklist.length === 3 && item.reason));
    assert(result.selected.every(item => item.checklist[2].includes('tier 1 or 2') && item.checklist[2].includes('measures.md')));
    assert(result.skipped.every(item => !expected.includes(item.seat)));
  }
  for (const bad of [null, [], { ui: 'yes' }, { typo: true }]) assert.throws(() => planSeats(bad));
  assert.match(planSeats({ behaviour: true }).selected.find(item => item.seat === 'product').checklist[2], /every tier 3 goal.*same Goal ID/);
});
