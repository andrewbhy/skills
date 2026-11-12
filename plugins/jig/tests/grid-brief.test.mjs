import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFile, checkPlan, mockupGridReasons } from '../scripts/brief-check.mjs';
const plan = readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url), 'utf8');
const contract = '\nUse docs/design-toolbox/grid/tokens.css and docs/design-toolbox/grid/primitives.css. Run node scripts/ui-tokens-check.mjs, node scripts/style-lint.mjs and node scripts/visual-check.mjs (alignment, clip, reflow; browser review pending).\n';
test('[risk: mockup launch omits grid inputs or checks] each missing requirement refuses a complete plan', () => {
  const good = plan.replace('# Example:', '# Mockup:') + contract;
  assert.deepEqual(checkPlan(good), []);
  for (const required of ['grid/tokens.css', 'grid/primitives.css', 'ui-tokens-check.mjs', 'style-lint.mjs', 'visual-check.mjs']) {
    assert(checkPlan(good.replace(required, 'omitted')).some(reason => reason.includes(required)), required);
  }
  assert.equal(mockupGridReasons(good.replaceAll('\n', '\r\n')).length, 0);
  assert.equal(mockupGridReasons('# Ordinary maintenance\nNo UI build.').length, 0);
  assert.equal(mockupGridReasons('# Mockup\n```text\n'+contract+'```\n').length, 5, 'fenced examples cannot satisfy the contract');
});
test('[risk: a linked plan hides an incomplete mockup round brief] brief must carry its own grid contract', () => {
  const brief = '# Mockup round\n\n## Intent\nBuild a mockup.\n\n## Acceptance\nOne screen.\n\n## Scope\nUI only.\n\n## Plan\n[Plan](plan.md)\n';
  const read = path => path.endsWith('plan.md') ? plan + contract : brief;
  assert(checkFile('brief.md', read).some(reason => reason.includes('grid/tokens.css')));
  const goodRead = path => path.endsWith('plan.md') ? plan : brief + contract;
  assert.deepEqual(checkFile('brief.md', goodRead), []);
});
