import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { lintCSS, lintDirectory, styleDebt, inspectStyles } from '../scripts/style-lint.mjs';

test('[risk: ad-hoc component styles evade token and spacing rules] planted declarations and token controls', () => {
  const broken = lintCSS('html{font-size:13px}.button{color:#fff;width:31px;border-radius:3px;box-shadow:0 1px 2px black;transition:all .2s;padding:5px;font-size:1rem}');
  for (const rule of ['raw-colour', 'raw-dimension', 'raw-shadow', 'off-spacing-scale', 'rem-with-changed-root', 'transition-all']) assert(broken.findings.some(f => f.kind === rule), rule);
  const clean = lintCSS(':root{--action:#fff;--size:32px;--radius:4px;--duration:120ms;--shadow:0 1px 2px black}.button{color:var(--action);width:var(--size);border-radius:var(--radius);box-shadow:var(--shadow) !important;transition:color var(--duration);padding:0}');
  assert.deepEqual(clean.findings, []);
  assert.equal(lintCSS('.button{font-size:1rem}').findings.some(f => f.kind === 'rem-with-changed-root'), false);
  assert(lintCSS('.button{font-size:1rem}', { rootChanged: true }).findings.some(f => f.kind === 'rem-with-changed-root'));
  assert(lintCSS('/* color:#fff */ .b{color:var(--a,var(--b))}').findings.length === 0);
  assert(lintCSS('.icon{border-radius:50%}').findings.some(f => f.kind === 'raw-radius'));
  assert(lintCSS('.icon{border-color:var(--border,teal)}').findings.some(f => f.kind === 'raw-colour'));
  assert(lintCSS('.icon{width:var(--size}').gaps.length);
});

test('[risk: CSSOM nesting skips declarations or lint spills outside state scope] scoped author rules include empty child lists', async () => {
  const globals = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const rule = (selectorText, cssText, cssRules = []) => ({ selectorText, style: { cssText }, cssRules });
  try {
    const root = { matches: s => s === '#component', querySelector: s => s.includes('.child') ? {} : null, querySelectorAll: () => [], hasAttribute: () => false };
    globalThis.document = { documentElement: {}, querySelectorAll: () => [], querySelector: s => { assert.equal(s, '#component'); return root; },
      styleSheets: [{ cssRules: [rule('#component', 'padding:3px;', [rule('& .child', 'color:#123456;')]), rule('#elsewhere', 'margin:5px;')] }] };
    globalThis.getComputedStyle = () => ({ fontSize: '16px' });
    const result = await inspectStyles({ evaluate: async (fn, arg) => fn(arg) }, '#component');
    assert.deepEqual(result.gaps, []);
    assert(result.findings.some(f => f.property === 'padding' && f.kind === 'off-spacing-scale'));
    assert(result.findings.some(f => f.kind === 'raw-colour' && f.element.includes('.child')));
    assert(!result.findings.some(f => f.element.includes('#elsewhere')));
  } finally { for (const [key, value] of Object.entries(globals)) value === undefined ? delete globalThis[key] : globalThis[key] = value; }
});

test('[risk: toolbox styles accumulate unreviewed debt] all toolbox CSS and inline styles ratchet by declaration and count', () => {
  const root = fileURLToPath(new URL('../docs/design-toolbox/', import.meta.url));
  const report = lintDirectory(root);
  const baseline = JSON.parse(readFileSync(new URL('../docs/design-toolbox/style-debt.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.gaps, []);
  assert.deepEqual(styleDebt(report.findings, baseline.entries), [], 'New ad-hoc declarations must use reviewed tokens');
  const seed = lintCSS('.new-component{padding:13px;color:#123456}', { file: 'planted.css' });
  assert(styleDebt([...report.findings, ...seed.findings], baseline.entries).some(f => f.file === 'planted.css'));
  assert.equal(styleDebt([...report.findings, report.findings[0]], baseline.entries).length, 1, 'Duplicated old debt is new debt');
});
