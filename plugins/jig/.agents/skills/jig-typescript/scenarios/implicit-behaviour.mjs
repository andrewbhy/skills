import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestTitle } from '../src/index.ts';

test('ingress accepts a valid title and returns its uppercase form', () => {
  assert.equal(ingestTitle({ title: 'Workshop' }), 'WORKSHOP');
});

for (const [name, input] of [
  ['missing', {}],
  ['null', { title: null }],
  ['numeric', { title: 42 }],
  ['empty', { title: '' }],
  ['whitespace-only', { title: ' \t\n' }],
]) {
  test(`ingress rejects ${name} titles`, () => {
    assert.throws(() => ingestTitle(input));
  });
}

for (const [name, input] of [
  ['null', null],
  ['undefined', undefined],
  ['numeric', 42],
  ['string', 'Workshop'],
  ['array', []],
]) {
  test(`ingress rejects a malformed ${name} record`, () => {
    assert.throws(() => ingestTitle(input));
  });
}
