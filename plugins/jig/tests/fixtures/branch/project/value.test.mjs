import assert from 'node:assert/strict';
import test from 'node:test';
import { value } from './value.mjs';
test('the task returns its promised value', () => assert.equal(value(), 'base'));
