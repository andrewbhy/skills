import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkDOM } from '../dom-check.mjs';

test('[risk: wrong order total] structural smoke check', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="total">Total: \$20\.00/);
  assert.match(html, /id="pay" type="button">Pay/);
  // Smoke input only: the page also runs this check against the actual browser DOM.
  const nodes = { total: { textContent: 'Total: $20.00' }, pay: { textContent: 'Pay', disabled: false } };
  assert.equal(checkDOM({ getElementById: id => nodes[id] }), true);
});
