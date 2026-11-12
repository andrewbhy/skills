import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectShell, inspectBrandArtwork, checkPageShells } from '../docs/design-toolbox/check-page-shell.mjs';
import { homePage } from '../scripts/review-home-page.mjs';
import { threadPage } from '../scripts/review-thread-page.mjs';
import { pageShell } from '../docs/design-toolbox/page-shell.mjs';
import { checkStyles, gridContext } from '../scripts/style-lint.mjs';
import { fileURLToPath } from 'node:url';

const read = name => readFileSync(new URL(`./fixtures/page-shell/${name}.html`, import.meta.url), 'utf8');
test('tower pages render shared brand artwork and reject provisional clamp marks', () => {
  for (const html of [homePage(), threadPage('synthetic-thread')]) {
    assert.deepEqual(inspectBrandArtwork(html), []);
    for (const defect of [
      html.replaceAll('ji-red-23.svg', 'clamp-fence.svg').replaceAll('ji-white-23.svg', 'clamp-fence.svg'),
      html.replace('</style>', '</style><svg><path d="M4 5v23h25"/></svg>'),
    ]) assert(inspectBrandArtwork(defect).some(f => f.includes('provisional')));
    assert(inspectBrandArtwork(html.replaceAll('jig-wordmark-', 'invented-wordmark-')).some(f => f.includes('artwork')));
    assert(inspectBrandArtwork(html.replace('</style>', '</style><a class="brand">reinvented</a>')).some(f => f.includes('exactly one')));
  }
});
test('[risk: pages bypass shared brand, breadcrumb or grid imports] good and bad shell fixtures prove detection', () => {
  const good = read('good');
  assert.deepEqual(inspectShell(good, 'grid/fixture.html'), []);
  assert(inspectShell(read('bad'), 'grid/fixture.html').some(f => f.includes('provisional')));
  for (const [from, to, reason] of [
    ['data-jig-shell="1"', '', 'shell'],
    ['href="tokens.css"', 'href="missing.css"', 'tokens.css'],
    ['href="../jig-pages.css"', 'href="missing.css"', 'jig-pages.css'],
    [' data-grid', '', 'data-grid'],
    ['ji-red-23.svg', 'clamp-fence.svg', 'provisional'],
    ['jig-wordmark-charcoal.svg', 'wrong-wordmark.svg', 'shell'],
  ]) assert(inspectShell(good.replace(from, to), 'grid/fixture.html').some(f => f.includes(reason)), reason);
  assert.equal(pageShell(good, 'grid/fixture.html'), good, 'shell generation is idempotent');
  assert(inspectShell(good.replace('<main>', '<a class="app-brand" href="../index.html">jig</a><main>'), 'grid/fixture.html').some(f => f.includes('artwork')), 'application brands share the artwork too');
});
test('[risk: handwritten or generated toolbox pages drift from shell] all real HTML pages comply', () => {
  const report = checkPageShells();
  assert(report.pages >= 18);
  assert.deepEqual(report.findings, []);
});
test('[risk: importing grid tokens selects an inactive project scale on legacy pages] sidecar owns type scale and existing debt does not grow', () => {
  const legacy = fileURLToPath(new URL('../docs/design-toolbox/index.html', import.meta.url));
  assert.equal(gridContext(legacy, '', readFileSync(legacy, 'utf8')).typeScale, undefined);
  const example = fileURLToPath(new URL('../docs/design-toolbox/grid/example.html', import.meta.url));
  assert(gridContext(example, '', readFileSync(example, 'utf8')).typeScale.includes(15));
  const report = checkStyles();
  assert.deepEqual(report.gaps, []);
  assert.deepEqual(report.findings, []);
});
