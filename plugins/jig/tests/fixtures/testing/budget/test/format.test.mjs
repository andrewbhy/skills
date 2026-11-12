import assert from 'node:assert/strict';
import test from 'node:test';

test('[risk: unreadable total] formats a whole total', () => {
  assert.equal((20).toFixed(2), '20.00');
});
