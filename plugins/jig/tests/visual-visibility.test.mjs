import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { freemem, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { launchChrome } from '../scripts/visual-clip.mjs';
import { inspectVisibility, measureInk } from '../scripts/visual-visibility.mjs';

const solid = value => ({ width: 2, height: 2, pixels: Buffer.from(Array(4).fill([value, value, value, 255]).flat()) });
test('[risk: invisible ink reports visible or uses CSS instead of pixels] empty, low contrast and visible raster controls', () => {
  assert.equal(measureInk(solid(32), solid(32)).kind, 'empty-content');
  assert.equal(measureInk(solid(36), solid(32)).kind, 'near-invisible');
  assert.equal(measureInk(solid(255), solid(32)).kind, null);
  assert.equal(measureInk(solid(0), solid(255), 3).contrastRatio, 21);
  assert.equal(measureInk(solid(128), solid(255), 4.5).kind, 'near-invisible');
  assert.equal(measureInk(solid(128), solid(255), 3).kind, null);
  assert.throws(() => measureInk(solid(0), { ...solid(0), width: 3 }), /dimensions/);
});

test('[risk: frequency optimization changes the ink percentile or drops rare bright pixels] exact rank with repeated colours and antialias noise', () => {
  const ground = { width:11,height:1,pixels:Buffer.alloc(44,255) };
  const ink = { ...ground,pixels:Buffer.from(ground.pixels) };
  // Nine faint pixels, one black and one unchanged. Rank floor(9*.9)=8
  // still belongs to the faint pixels; a bright pixel cannot rescue the mark.
  for(let i=0;i<9;i++) ink.pixels.fill(200,i*4,i*4+3);
  ink.pixels.fill(0,36,39);
  let result = measureInk(ink,ground);
  assert.equal(result.inkPixels,10); assert.equal(result.kind,'near-invisible');
  assert(result.contrastRatio > 1 && result.contrastRatio < 2);
  ink.pixels.fill(254,40,43); // ignored one-channel noise
  assert.deepEqual(measureInk(ink,ground),result);
  ink.pixels.fill(0,32,35);
  result=measureInk(ink,ground); assert.equal(result.contrastRatio,21); assert.equal(result.kind,null);
});

test('[risk: a logo sheet passes with invisible words and marks] rendered planted defects, visible controls and failure-only evidence', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false
}, async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-visibility-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const browser = await launchChrome();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
    await page.goto(new URL('./fixtures/visual/visibility.html', import.meta.url).href);
    const before = await page.locator('#blank-mark').evaluate(e => e.outerHTML);
    const report = await inspectVisibility(page, '#screen', { out });
    assert.deepEqual(report.gaps, []);
    for (const id of ['charcoal', 'blank-mark', 'blank-img', 'blank-canvas', 'transparent']) {
      assert(report.findings.some(f => f.element === '#' + id), id + ' detected');
    }
    for (const id of ['visible', 'good-mark', 'background']) {
      assert(!report.findings.some(f => f.element === '#' + id), id + ' remains visible');
      assert(report.measurements.some(f => f.element === '#' + id && f.contrastRatio >= f.threshold));
    }
    assert.equal(readdirSync(out).length, report.findings.length);
    assert.equal(await page.locator('#blank-mark').evaluate(e => e.outerHTML), before, 'temporary masking restored');
  } finally { await browser.close(); }
});
