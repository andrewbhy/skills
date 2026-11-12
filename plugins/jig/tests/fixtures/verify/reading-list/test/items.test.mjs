import assert from 'node:assert/strict';
import test from 'node:test';
import { addItem } from '../items.mjs';

const item = (overrides = {}) => ({ title: 'Existing book', ...overrides });

test('[risk: duplicate or untrimmed row] one submission appends exactly one trimmed title and preserves existing items', () => {
  const items = [item()];
  assert.deepEqual(addItem(items, '  New book  '), {
    items: [item(), item({ title: 'New book' })], error: null,
  });
  assert.deepEqual(items, [item()]);
});

test('[risk: blank row] rejects invalid titles without changing the list', () => {
  for (const title of ['', '   ', '\t\r\n', null, 42]) {
    const items = [item()];
    assert.deepEqual(addItem(items, title), { items: [item()], error: 'Enter a title.' },
      `invalid title ${JSON.stringify(title)}`);
    assert.deepEqual(items, [item()], `list changed for ${JSON.stringify(title)}`);
  }
});

test('[risk: stuck after error] can add a title after an invalid title fails', () => {
  const invalid = addItem([], ' ');
  assert.deepEqual(addItem(invalid.items, 'Dune'), {
    items: [item({ title: 'Dune' })], error: null,
  });
});
