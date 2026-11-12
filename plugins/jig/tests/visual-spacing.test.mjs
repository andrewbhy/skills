import assert from 'node:assert/strict';
import { freemem } from 'node:os';
import test from 'node:test';
import { launchChrome, statusFor } from '../scripts/visual-clip.mjs';
import { inspectSpacing } from '../scripts/visual-spacing.mjs';

test('[risk: uneven insets, gaps and off-grid sizes escape static checks] rendered planted defects and clean control', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false
}, async () => {
  const browser = await launchChrome();
  try {
    const page = await browser.newPage();
    const url = new URL('./fixtures/visual/spacing.html', import.meta.url).href;
    await page.goto(url);
    const broken = await page.evaluate(inspectSpacing, '#screen');
    assert.equal(statusFor(broken.findings, broken.gaps), 'findings');
    for (const [element, kind] of [['#inset','inset'],['#uneven','uneven-gaps'],['#zero','zero-gaps'],['#off-grid','off-grid'],['#fixed','off-grid']]) {
      assert(broken.findings.some(f => f.element === element && f.kind === kind), `${element}: ${kind} detected`);
    }
    await page.locator('#zero').evaluate(e => e.setAttribute('data-spacing-zero-gaps','Attached rows share a border'));
    const exceptions = await page.evaluate(inspectSpacing, '#screen');
    assert(exceptions.exceptions.some(f => f.element === '#zero' && f.reason === 'Attached rows share a border'));
    assert(!exceptions.findings.some(f => f.element === '#zero'));
    await page.goto(url + '?clean');
    const clean = await page.evaluate(inspectSpacing, '#screen');
    assert.deepEqual(clean.findings, []);
    assert.deepEqual(clean.gaps, []);
  } finally { await browser.close(); }
});
