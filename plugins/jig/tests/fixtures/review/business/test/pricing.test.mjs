import assert from 'node:assert/strict';
import test from 'node:test';
import { discount } from '../pricing.mjs';
test('discount includes the campaign threshold', () => {
  assert.equal(discount(200), 20);
});
test('below threshold has no discount', () => {
  assert.equal(discount(99), 0);
});
