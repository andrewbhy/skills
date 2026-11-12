import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTitle } from '../src/index.ts';

test('renderTitle trims and uppercases valid titles', () => {
  assert.equal(renderTitle('  jig  '), 'JIG');
  assert.equal(renderTitle('Workshop'), 'WORKSHOP');
});

test('renderTitle rejects invalid titles', () => {
  for (const value of [undefined, null, 42, '', '   ']) {
    assert.throws(() => renderTitle(value), /Expected a nonempty title/);
  }
});
