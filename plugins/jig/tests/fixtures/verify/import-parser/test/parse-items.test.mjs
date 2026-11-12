import assert from 'node:assert/strict';
import test from 'node:test';
import { parseItems } from '../parse-items.mjs';

const record = (overrides = {}) => ({ title: 'Dune', ...overrides });
const parse = (records) => parseItems(JSON.stringify(records));

test('[risk: lost or untrimmed titles] accepts records, trims titles, and returns only titles', () => {
  assert.deepEqual(parse([record({ title: '  Dune  ', author: 'Frank Herbert' }), record({ title: 'Solaris' })]), {
    items: [record(), record({ title: 'Solaris' })], error: null,
  });
});

test('[risk: empty import rejected] accepts an empty array', () => {
  assert.deepEqual(parseItems('[]'), { items: [], error: null });
});

test('[risk: blank title imported] rejects invalid titles', () => {
  for (const title of ['', '   ', '\t\n', null, 4, true]) {
    assert.deepEqual(parse([record({ title })]), {
      items: null, error: 'Item 1 must have a nonempty string title.',
    }, `invalid title ${JSON.stringify(title)}`);
  }
});

test('[risk: malformed record imported] rejects malformed records', () => {
  for (const value of [null, [], 'Dune', 4, {}]) {
    assert.deepEqual(parse([value]), {
      items: null, error: 'Item 1 must have a nonempty string title.',
    }, `malformed record ${JSON.stringify(value)}`);
  }
});

test('[risk: parser throws] malformed JSON returns validation rather than throwing', () => {
  for (const text of ['{', '', '[{"title":"Dune"},]', 'undefined']) {
    assert.deepEqual(parseItems(text), { items: null, error: 'Invalid JSON.' }, `JSON ${JSON.stringify(text)}`);
  }
});

test('[risk: non-array imported] rejects non-array JSON', () => {
  for (const value of [null, {}, 'Dune', 3]) {
    assert.deepEqual(parse(value), { items: null, error: 'Expected an array of records.' },
      `non-array ${JSON.stringify(value)}`);
  }
});

test('[risk: partial import] invalid later record rejects the whole import; a later valid call recovers', () => {
  assert.deepEqual(parse([record(), record({ title: ' ' })]), {
    items: null, error: 'Item 2 must have a nonempty string title.',
  });
  assert.deepEqual(parse([record()]), { items: [record()], error: null });
});
