import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, freemem } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { analyseAlignment, analyseOptical, inspectAlignment } from '../scripts/visual-alignment.mjs';
import { analyseOverlap, inspectOverlap } from '../scripts/visual-overlap.mjs';
import { inspectSpacing } from '../scripts/visual-spacing.mjs';
import { checkArguments, declaredStates, declaredDataModes, invokeDataMode, invokeState, exitCodeFor, runCheck, groupFindings, uniqueFindings, stateScope, captureRegion, sourceCounts, readBaseline, inspectBaseline, blockingFindings } from '../scripts/visual-check.mjs';
import { encodePNG, decodePNG as decodePNGForTest } from '../scripts/visual-pixels.mjs';
import { inkBounds, visibilityBatches, cropRaster, inspectVisibilityBatched, inspectVisibility } from '../scripts/visual-visibility.mjs';
import { launchChrome, inspectClip } from '../scripts/visual-clip.mjs';

const box = (element, x, extra = {}) => ({ element, parent: '#group', flow: true, fractionalTarget: true, drawnAxes: ['x', 'width'], rect: { x, y: 20, width: 100, height: 24 }, ...extra });
const opts = (out, extra = []) => checkArguments(['--url', 'file:///fixture.html', '--out', out, '--settle-ms', '1', ...extra]);

test('[risk: near-miss and fractional layout defects pass or exact edges fail] geometry replay and clean controls', () => {
  const elements = [box('#a', 16), box('#b', 16), box('#miss', 18), box('#separate', 40)];
  const findings = analyseAlignment(elements).findings;
  assert(findings.some(f => f.kind === 'near-miss-alignment' && f.element === '#miss' && f.edge === 'left' && f.delta === 2));
  assert(!findings.some(f => f.element !== '#miss'));
  assert.deepEqual(analyseAlignment([box('#a', 16), box('#b', 16), box('#c', 16)]).findings, []);
  const fraction = [box('#half', 16.5)];
  assert(analyseAlignment(fraction).findings.some(f => f.kind === 'fractional-position' && f.measured === 16.5));
  assert.deepEqual(analyseAlignment(fraction, { scale: 2 }).findings, []);
  const overflow = box('#child', 12, { bounds: { left: 16, top: 16, right: 108, bottom: 48 } });
  assert.deepEqual(analyseAlignment([overflow]).findings.find(f => f.kind === 'containment').measured, { left: 4, right: 4 });
  overflow.rect.x = 16; overflow.rect.width = 92;
  assert.deepEqual(analyseAlignment([overflow]).findings, []);
  const baselines = [box('#a', 16, { baseline: 36 }), box('#b', 16, { baseline: 36 }), box('#c', 16, { baseline: 38 })];
  assert(analyseAlignment(baselines).findings.some(f => f.edge === 'baseline' && f.element === '#c'));
});

test('[risk: box centring hides misplaced glyph or icon ink] pixel bounds drive optical checks at both scales', () => {
  const ground = { width: 4, height: 4, pixels: Buffer.alloc(64, 255) };
  const ink = { ...ground, pixels: Buffer.from(ground.pixels) }; ink.pixels[20] = 0;
  assert.deepEqual(inkBounds(ink, ground), { left: 1, top: 1, right: 2, bottom: 2 });
  assert.deepEqual(inkBounds(ink, ground, 2), { left: .5, top: .5, right: 1, bottom: 1 });
  assert.equal(inkBounds(ground, ground), null);
  const m = { element: '#icon', rect: { y: 20 }, inkBox: { top: 0, bottom: 8 }, control: { centered: true, element: '#button', centerY: 26 } };
  assert.equal(analyseOptical([m]).findings[0].delta, -2);
  assert.equal(analyseOptical([{ ...m, control: { ...m.control, centerY: 25 } }]).findings.length, 0);
  const control = { centered: true, centeredX: true, index: 1, centerX: 36, centerY: 24 };
  const icon = { element: '#icon', rect: { x: 20, y: 20 }, inkBox: { left: 0, right: 8, top: 0, bottom: 8 }, control };
  const label = { element: '#label', rect: { x: 32, y: 18 }, inkBox: { left: 0, right: 20, top: 0, bottom: 12 }, control };
  assert.deepEqual(analyseOptical([icon, label]).findings, [], 'The combined ink group is centred, not each item separately');
  assert(analyseOptical([icon, { ...label, inkBox: { ...label.inkBox, right: 24 } }]).findings.some(f => f.axis === 'horizontal' && f.delta === 2));
});

test('[risk: hundreds of inherited errors overwhelm review or lose source attribution] grouping retains counts and bounded examples', () => {
  const findings = Array.from({ length: 489 }, (_, i) => ({ kind: 'off-grid', inspector: 'spacing', values: { paddingTop: 13 }, element: `#item-${i}`, ancestor: `#parent-${i}` }));
  const grouped = groupFindings(findings);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].count, 489); assert.equal(grouped[0].examples.length, 3);
  assert.equal(groupFindings([...findings, { ...findings[0], values: { paddingTop: 15 } }]).length, 2);
  assert.deepEqual(sourceCounts([...findings, { source: 'model' }, { source: 'person' }]), { script: 489, model: 1, person: 1 });
});

test('[risk: invalid state declarations silently become a passing default] page contract validation', async () => {
  const prior = globalThis.window;
  try {
    globalThis.window = {}; assert.deepEqual(declaredStates(), ['default']);
    await invokeState({ name: 'default', action: 'setup' });
    for (const states of [[], {}, [{ name: 'broken', setup() {} }], [{ name: ' ', setup() {}, reset() {} }]]) {
      window.jigStates = states; assert.throws(declaredStates, /Invalid window.jigStates/);
    }
    let calls = 0;
    window.jigStates = [{ name: 'menu', async setup() { calls++; }, async reset() { calls--; } }];
    assert.deepEqual(declaredStates(), ['menu']); await invokeState({ name: 'menu', action: 'setup' }); assert.equal(calls, 1);
    await invokeState({ name: 'menu', action: 'reset' }); assert.equal(calls, 0);
    window.jigStates.push(window.jigStates[0]); assert.throws(declaredStates, /Invalid/);
  } finally { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; }
});

function boundary() {
  const calls = { launches: 0, closes: 0, contexts: 0, contextsClosed: 0, loads: 0, screenshots: 0, actions: [], inspections: [] };
  let state;
  const page = {
    setDefaultTimeout() {}, on: (event, handler) => { (calls.handlers ||= {})[event] = handler; },
    goto: async () => { calls.loads++; if (calls.failedStyle) calls.handlers.requestfailed({url:()=> 'file:///missing.css',resourceType:()=> 'stylesheet'}); }, close: async () => {},
    addStyleTag: async () => ({ evaluate: async () => {} }),
    waitForTimeout: async () => {},
    evaluate: async (fn, arg) => {
      if (fn.name === 'declaredStates') return ['open', 'closed'];
      if (fn.name === 'declaredDataModes') return calls.modes || ['default'];
      if (fn.name === 'declaredFonts') return calls.fonts || ['default'];
      if (fn.name === 'invokeFont') { (calls.fontActions ||= []).push(`${state}:${arg.id}`); return; }
      if (fn.name === 'hasStateScope') return calls.scoped !== false;
      if (fn.name === 'invokeDataMode') { (calls.modeActions ||= []).push(`${state}:${arg.name}`); return; }
      if (fn.name === 'stateScope') return arg.scope || '#region';
      if (fn.name === 'regionClip') return { x: 10, y: 20, width: 100, height: 50 };
      if (fn.name === 'invokeState') { state = arg.name; calls.actions.push(`${arg.action}:${arg.name}`); if (calls.failReset && arg.action === 'reset') throw new Error('seeded reset failure'); return; }
      if (fn.name === 'inspectLayout') return [];
      if (fn.name === 'annotateFindings') return ['1. seeded'];
      return { ready: true, signature: 'steady' };
    },
    screenshot: async options => { calls.screenshots++; (calls.clips ||= []).push(options.clip); return Buffer.from('test'); },
  };
  const launch = async () => {
    calls.launches++;
    return { version: () => 'fake-browser', close: async () => { calls.closes++; }, newContext: async () => {
      calls.contexts++;
      return { newPage: async () => page, close: async () => { calls.contextsClosed++; } };
    } };
  };
  const inspect = async (_page, options) => {
    calls.inspections.push(state);
    (calls.inspectionOptions ||= []).push(options);
    return Object.fromEntries(options.inspectors.map(name => [name, { findings: [], gaps: [] }]));
  };
  return { launch, inspect, calls, tokens: () => ({findings:[],gaps:[],elapsedMs:0}),
    impeccable:async()=>{calls.impeccable=(calls.impeccable || 0)+1;return {executed:true,findings:[],waived:[],gaps:[],elapsedMs:1,overBudget:false};} };
}

test('[risk: claimed Impeccable integration never executes] every gate records the inspector and fails on detector gaps',async t=>{
  const out=mkdtempSync(join(tmpdir(),'jig-must-run-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
  const fake=boundary();
  const report=await runCheck(opts(out,['--gate']),fake);
  assert(report.inspectors.includes('impeccable'));assert.equal(fake.calls.impeccable,1);
  assert.equal(report.impeccable.executed,true);
  assert(JSON.parse(readFileSync(join(out,'report.json'),'utf8')).inspectors.includes('impeccable'));
  fake.impeccable=async()=>({executed:false,findings:[],gaps:['seeded detector failure'],elapsedMs:1});
  const broken=await runCheck(opts(out,['--gate']),fake);
  assert.equal(broken.status,'inconclusive');assert(broken.gaps.includes('impeccable: seeded detector failure'));
});

test('[risk: inspectors launch separate browsers or reload between states] one launch across states, inspectors, sizes and scales', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary();
  const report = await runCheck(opts(out, ['--sizes', '800x600,1024x768', '--scales', '1,2', '--inspectors', 'clip,spacing,alignment']), fake);
  assert.equal(report.status, 'passed', JSON.stringify(report.gaps)); assert.equal(report.runs.length, 8);
  assert.equal(fake.calls.launches, 1); assert.equal(fake.calls.closes, 1);
  assert.equal(fake.calls.contexts, 4); assert.equal(fake.calls.contextsClosed, 4); assert.equal(fake.calls.loads, 4);
  assert.equal(fake.calls.screenshots, 0); assert.equal(fake.calls.inspections.length, 8);
  assert.deepEqual(fake.calls.actions.slice(0, 4), ['setup:open', 'reset:open', 'setup:closed', 'reset:closed']);
  assert.deepEqual(readdirSync(out), ['report.json']);
  assert.equal(JSON.parse(readFileSync(join(out, 'report.json'))).counts.findings, 0);
});

test('[risk: font customization skips overflow or compares typography across fonts] each font crosses states and modes with restricted extra passes', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-fonts-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary(); fake.calls.fonts = ['Geist','System']; fake.calls.modes = ['Demo','One'];
  const inspect = fake.inspect;
  fake.inspect = async (page, options, run) => {
    const results = await inspect(page, options, run);
    results.crisp.measurements = [{ element:'#label',component:'row',slot:'label',state:run.state,text:'Text',fontSize:run.font==='Geist'?14:18,fontWeight:'400',letterSpacing:'normal',textWidth:run.font==='Geist'?40:50 }];
    return results;
  };
  const report = await runCheck(opts(out, ['--fonts','all','--gate']), fake);
  assert(report.inspectors.includes('impeccable'),'gate report must list impeccable');
  assert.equal(fake.calls.impeccable,1);assert.equal(report.impeccable.executed,true);
  assert.equal(report.coverage.expected, 8); assert.equal(report.coverage.completed, 8);
  assert.equal(report.counts.findings, 0, 'Font differences never compare against another font history');
  assert.deepEqual(report.runs.map(r => r.font), ['Geist','Geist','Geist','Geist','System','System','System','System']);
  assert(fake.calls.inspectionOptions.slice(0,4).every(o => o.inspectors.includes('style')));
  assert(fake.calls.inspectionOptions.slice(4).every(o => o.inspectors.join(',') === 'clip,alignment,crisp'));
  assert(fake.calls.inspectionOptions.every(o => o.consistencyRoot === '#region'), 'First snapshot also respects scope');
  assert.deepEqual(fake.calls.fontActions.slice(0,4), ['open:Geist','closed:Geist','open:Geist','closed:Geist']);
  const defaults = boundary(); defaults.calls.fonts = ['Geist','System'];
  assert.equal((await runCheck(opts(out), defaults)).coverage.expected, 2);
});

test('[risk: missing scopes produce per-node gaps and falsely incomplete coverage] one advisory gap per measured unscoped state', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-scope-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary(); fake.calls.scoped = false;
  const report = await runCheck(opts(out), fake);
  assert.equal(report.coverage.complete, true); assert.equal(report.status, 'passed');
  for (const run of report.runs) assert.deepEqual(run.gaps, ['no scope; whole page measured']);
  const scoped = await runCheck(opts(out), boundary());
  assert(scoped.runs.every(r => r.gaps.length === 0));
  const missing = boundary(); missing.calls.failedStyle = true;
  missing.inspect = async () => ({ style: { findings:[{kind:'missing-stylesheet',element:'file:///missing.css',measured:'missing',expected:'referenced stylesheet exists'}],gaps:[] } });
  const withMissing = await runCheck(opts(out), missing);
  assert.equal(withMissing.coverage.complete,true); assert.equal(withMissing.status,'findings');
  assert.equal(withMissing.counts.findings,1); assert(withMissing.runs.every(r=>r.gaps.length===0));
});

test('[risk: acceptance runs skip states or modes, or hang and still exit zero] gate coverage, filtered runs and timeout exits', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-coverage-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary(); fake.calls.modes = ['Demo','One'];
  fake.inspect = async () => ({ crisp: { findings: [{ kind: 'text-contrast', element: '#washed', measured: 3, expected: 12 }], gaps: [] } });
  const report = await runCheck(opts(out, ['--gate','--budget','1','--sizes','800x600,1000x800','--scales','1,2']), fake);
  assert.equal(report.coverage.expected, 16); assert.equal(report.coverage.completed, 16);
  assert.equal(report.status, 'findings'); assert.equal(exitCodeFor(report.status), 1); assert.equal(report.budget.stopped, false);
  assert.deepEqual(fake.calls.modeActions.slice(0,4), ['open:Demo','closed:Demo','open:One','closed:One']);
  const subset = await runCheck(opts(out, ['--states','open']), boundary());
  assert(subset.gaps.includes('incomplete: 1 of 2 states')); assert.equal(exitCodeFor(subset.status), 2);
  const timed = boundary(); timed.inspect = () => new Promise(() => {});
  const incomplete = await runCheck(opts(out, ['--timeout-ms','20']), timed);
  assert(incomplete.gaps.includes('incomplete: 0 of 2 states'));
  assert.equal(exitCodeFor(incomplete.status), 2); assert.equal(timed.calls.closes, 1); assert.equal(timed.calls.contextsClosed, 1);
  assert(incomplete.runs[0].gaps.includes('Inspection timed out'));
});

test('[risk: data modes have invalid declarations or setup never returns] validate and await the page data-mode contract', async () => {
  const prior = globalThis.window;
  try {
    globalThis.window = {}; assert.deepEqual(declaredDataModes(), ['default']); await invokeDataMode({ name:'default' });
    for (const modes of [[], {}, [{ name:'One' }], [{ name:' ',setup(){} }], [{ name:'One',setup(){} },{ name:'One',setup(){} }]]) {
      window.jigDataModes = modes; assert.throws(declaredDataModes, /Invalid window.jigDataModes/);
    }
    let data;
    window.jigDataModes = [{ name:'One', async setup(){ data = 'single row'; } }];
    assert.deepEqual(declaredDataModes(), ['One']); await invokeDataMode({ name:'One' }); assert.equal(data,'single row');
    window.jigDataModes[0].setup = () => new Promise(() => {});
    await assert.rejects(invokeDataMode({ name:'One',timeout:10 }), /timed out/);
    await assert.rejects(invokeDataMode({ name:'missing' }), /disappeared/);
  } finally { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; }
});

test('[risk: setup or inspector errors leak state and unknown states claim success] errors reset, close and remain inconclusive', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-errors-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary(); fake.inspect = async () => { throw new Error('seeded inspector failure'); };
  let report = await runCheck(opts(out), fake);
  assert.equal(report.status, 'inconclusive'); assert.equal(report.runs.length, 2);
  assert(fake.calls.actions.includes('reset:open')); assert.equal(fake.calls.contextsClosed, 1);
  fake.calls.failReset = true; report = await runCheck(opts(out), fake);
  assert.equal(report.runs.length, 1); assert.match(report.runs[0].gaps.join(), /Reset failed/);
  const unknown = boundary(); report = await runCheck(opts(out, ['--states', 'absent']), unknown);
  assert.equal(report.status, 'inconclusive'); assert.match(report.gaps.join(), /Unknown states/);
  assert.deepEqual(unknown.calls.inspections, []); assert.equal(unknown.calls.closes, 1);
});

test('[risk: bad options or unapproved/escaping baseline inputs conceal gaps] CLI and manifest validation', t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-inputs-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  assert(opts(out).out); assert.equal(opts(out).png, false); assert.deepEqual(opts(out).scales, [1]);
  for (const extra of [['--states', 'open,'], ['--states', 'open,open'], ['--scales', '3'], ['--sizes', '0x10'], ['--inspectors', 'missing'], ['--out'], ['--duration', 'NaN'], ['--budget', '0'], ['--budget', '1.5'], ['--crisp-thresholds','null'], ['--crisp-thresholds','{"primary":22}'], ['--crisp-thresholds','{"secondary":0.5}'], ['--crisp-thresholds','{"unknown":12}']]) assert.throws(() => opts(out, extra));
  writeFileSync(join(out, 'manifest.json'), '{}'); assert.throws(() => readBaseline(out), /approval/);
  const manifest = { version: 1, approvedBy: 'person', approvedAt: '2026-11-08', browser: 'pinned', platform: 'win32', entries: [
    { viewport: { width: 800, height: 600 }, scale: 1, state: 'open', component: 'menu', selector: '#menu', file: '../outside.png' },
  ] };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest)); assert.throws(() => readBaseline(out), /escapes/);
  manifest.entries[0].file = 'menu.png'; writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest)); assert.equal(readBaseline(out).entries.length, 1);
});

test('[risk: incomplete CLI coverage still returns zero] unavailable browser reports incomplete and exits two without launching', t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-cli-')); t.after(() => rmSync(out,{recursive:true,force:true}));
  const result = spawnSync(process.execPath, ['scripts/visual-check.mjs','--url','file:///fixture.html','--gate','--out',out],
    { encoding:'utf8',env:{...process.env,JIG_NO_BROWSER:'1'} });
  assert.equal(result.status,2,result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status,'inconclusive'); assert.equal(report.coverage.complete,false);
  assert(report.gaps.includes('incomplete: 0 of 0 states'));
});

test('[risk: baseline comparison misses a changed component or mutates approved images] per-state crops, tolerance and missing coverage', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-baseline-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const image = { width: 1, height: 1, pixels: Buffer.from([20, 30, 40, 255]) }, original = encodePNG(image);
  writeFileSync(join(out, 'menu.png'), original);
  const manifest = { entries: [{ state: 'open', scale: 1, viewport: { width: 800, height: 600 }, component: 'menu', selector: '#menu', file: 'menu.png' }] };
  const run = { state: 'open', scale: 1, viewport: { width: 800, height: 600 } };
  let current = original;
  const page = { evaluate: async () => ({ x: 0, y: 0 }), locator: () => ({ count: async () => 1, screenshot: async () => current }) };
  assert.deepEqual((await inspectBaseline(page, { baseline: out }, run, manifest)).findings, []);
  current = encodePNG({ ...image, pixels: Buffer.from([28, 30, 40, 255]) });
  assert.deepEqual((await inspectBaseline(page, { baseline: out }, run, manifest)).findings, [], 'Minor channel noise tolerated');
  current = encodePNG({ ...image, pixels: Buffer.from([29, 30, 40, 255]) });
  assert.equal((await inspectBaseline(page, { baseline: out }, run, manifest)).findings[0].kind, 'baseline-pixels');
  current = encodePNG({ width: 2, height: 1, pixels: Buffer.alloc(8, 255) });
  assert.equal((await inspectBaseline(page, { baseline: out }, run, manifest)).findings[0].kind, 'baseline-size');
  assert((await inspectBaseline(page, { baseline: out }, { ...run, state: 'absent' }, manifest)).gaps.length);
  assert.deepEqual(readFileSync(join(out, 'menu.png')), original);
});

test('[risk: rendered geometry or state reset differs from replay] real fixture defects, clean states and annotated sheet', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false,
}, async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-live-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const options = opts(out, ['--url', new URL('./fixtures/visual/alignment.html', import.meta.url).href, '--inspectors', 'clip,spacing,alignment', '--png']);
  const report = await runCheck(options);
  assert.equal(report.status, 'findings', JSON.stringify(report));
  assert.equal(report.runs.length, 2);
  const findingsFor = run => report.findings.filter(f => run.findingIds.includes(f.id));
  assert(findingsFor(report.runs[0]).some(f => f.kind === 'near-miss-alignment' && f.element === '#miss'));
  assert(findingsFor(report.runs[0]).some(f => f.kind === 'fractional-position' && f.element === '#half'));
  assert(findingsFor(report.runs[0]).some(f => f.kind === 'containment' && f.element === '#overflow'));
  assert(!findingsFor(report.runs[1]).some(f => ['near-miss-alignment', 'fractional-position', 'containment'].includes(f.kind)));
  assert.equal(readFileSync(report.sheet).subarray(1, 4).toString(), 'PNG');
  assert.deepEqual(readdirSync(out).sort(), ['contact-sheet.png', 'report.json']);
});

test('[risk: state repetitions inflate totals or low severity hides collisions] unique state lists and ranked groups', () => {
  const finding = { inspector: 'spacing', kind: 'off-grid', element: '#a', values: { marginTop: 3, marginLeft: 2 } };
  const repeated = [ { ...finding, state: 'a' }, { ...finding, state: 'b', values: { marginLeft: 2, marginTop: 3 } } ];
  const unique = uniqueFindings(repeated);
  assert.equal(unique.length, 1); assert.deepEqual(unique[0].states, ['a', 'b']);
  assert.equal(groupFindings(repeated)[0].count, 1);
  assert.equal(uniqueFindings([...repeated, { ...finding, values: { marginTop: 5 } }]).length, 2);
  const groups = groupFindings([...repeated, { kind: 'fractional-position', element: '#c', measured: .5 }, { kind: 'overlap', element: '#d', measured: 2 }]);
  assert.deepEqual(groups.map(g => g.rule), ['overlap', 'off-grid', 'fractional-position']);
});

test('[risk: overlap detection misses positioned insets or flags adjacent content] sibling collision, clean controls and pair exceptions', () => {
  const a = box('#provider', 10, { rect: { x: 10, y: 10, width: 24, height: 24 } });
  const b = box('#inset', 20, { rect: { x: 20, y: 30, width: 80, height: 16 } });
  const collision = analyseOverlap([a, b]);
  assert.equal(collision.findings.length, 1); assert.deepEqual(collision.findings[0].measured, { width: 14, height: 4 });
  assert.equal(analyseOverlap([a, { ...b, parent: '#other' }]).findings.length, 0);
  assert.equal(analyseOverlap([a, { ...b, rect: { ...b.rect, y: 34 } }]).findings.length, 0);
  const allowed = analyseOverlap([{ ...a, allowed: { '#inset': 'Intentional badge attachment' } }, b]);
  assert.equal(allowed.findings.length, 0); assert.equal(allowed.exceptions.length, 1);
  assert(analyseOverlap([{ ...a, svg: true }, { ...b, svg: true }]).findings.length, 'scaled SVG content still has overlap checks');
  assert.equal(analyseAlignment([{ ...a, rect: { ...a.rect, x: 10.25 }, fractionalTarget: false }]).findings.length, 0);
});

test('[risk: budget silently claims complete coverage or loses top severity] stops after a state, resets, retains observed totals', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-budget-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary();
  fake.inspect = async () => ({ alignment: { gaps: [], findings: [
    { kind: 'fractional-position', element: '#a', measured: .5 },
    { kind: 'overlap', element: '#b', measured: 4 },
    { kind: 'near-miss-alignment', element: '#c', measured: 2 },
  ] } });
  const report = await runCheck(opts(out, ['--budget', '2', '--sizes', '800x600,1024x768']), fake);
  assert.equal(report.status, 'inconclusive'); assert.equal(report.budget.stopped, true);
  assert.equal(report.runs.length, 1); assert.equal(report.counts.groups, 3); assert.equal(report.counts.reportedGroups, 2);
  assert.deepEqual(report.groups.map(g => g.rule), ['overlap', 'near-miss-alignment']);
  assert.deepEqual(fake.calls.actions, ['setup:open', 'reset:open']); assert.equal(fake.calls.contextsClosed, 2); assert.equal(fake.calls.closes, 1);
  assert.equal(report.coverage.expected, 4); assert.equal(report.coverage.completed, 1);
  assert(report.gaps.includes('incomplete: 1 of 4 states'));
  assert(report.elapsedMs >= report.runs[0].inspectionMs);
});

test('[risk: report stores one finding per state and screenshot ignores scope] orchestration deduplicates and captures bounded regions', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-check-scope-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const fake = boundary(), scopes = [], clips = [];
  fake.inspect = async (_page, options) => {
    scopes.push(options.root);
    return { spacing: { gaps: [], findings: [{ kind: 'off-grid', element: '#same', values: { marginTop: 3 } }] } };
  };
  fake.saveSheet = async (_browser, _options, tiles) => { assert.equal(tiles.length, 2); return 'scoped-sheet'; };
  const report = await runCheck(opts(out, ['--scope', '#component', '--png']), fake);
  assert.deepEqual(scopes, ['#component', '#component']);
  assert.equal(report.counts.findings, 1); assert.equal(report.counts.occurrences, 2);
  assert.deepEqual(report.findings[0].states, ['open', 'closed']);
  assert.deepEqual(report.runs.map(r => r.findingIds), [[1], [1]]);
  assert.deepEqual(fake.calls.clips, Array(2).fill({ x: 10, y: 20, width: 100, height: 50 }));
  assert.equal(report.sheet, 'scoped-sheet');
  const clip = { x: 10, y: 20, width: 100, height: 50 };
  await captureRegion({ evaluate: async (_fn, selector) => { assert.equal(selector, '#component'); return clip; },
    screenshot: async options => { clips.push(options); return Buffer.from('crop'); } }, '#component');
  assert.deepEqual(clips[0].clip, clip); assert.equal(clips[0].fullPage, undefined);
  const globals = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
  try {
    globalThis.innerWidth = 800; globalThis.innerHeight = 600;
    globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 10, top: -10000, right: 410, bottom: 10000 }) }) };
    await captureRegion({ evaluate: async (fn, arg) => fn(arg), screenshot: async options => { clips.push(options); } }, '#component');
    assert.deepEqual(clips[1].clip, { x: 10, y: 0, width: 400, height: 600 }, 'Tall page capture is viewport bounded');
  } finally { for (const [key, value] of Object.entries(globals)) value === undefined ? delete globalThis[key] : globalThis[key] = value; }
});

test('[risk: state scopes measure a neighbouring component or an ambiguous selector] page scope, CLI precedence and metadata', () => {
  const globals = { window: globalThis.window, document: globalThis.document, CSS: globalThis.CSS };
  const scrolled = [];
  try {
    globalThis.window = { jigStates: [{ name: 'beat', stage: 'card', scope: '#local' }] };
    globalThis.CSS = { escape: s => s };
    globalThis.document = { querySelectorAll: selector => selector === '.ambiguous' ? [{}, {}] : selector === '#missing' ? [] : [{}],
      querySelector: selector => ({ localName: selector === 'body' ? 'body' : 'main', scrollIntoView: () => scrolled.push(selector) }) };
    assert.equal(stateScope({ name: 'beat', root: 'body' }), '#local');
    assert.equal(stateScope({ name: 'beat', root: 'body', scope: '#{stage}' }), '#card');
    assert.equal(stateScope({ name: 'default', root: 'main' }), 'main');
    assert.equal(stateScope({ name: 'default', root: 'body' }), 'body', 'Document scope preserves the setup scroll position');
    assert.throws(() => stateScope({ name: 'beat', root: 'body', scope: '#{missing}' }), /Missing scope metadata/);
    for (const scope of ['#missing', '.ambiguous']) assert.throws(() => stateScope({ name: 'beat', root: 'body', scope }), /one region/);
    assert.deepEqual(scrolled, ['#local', '#card', 'main']);
  } finally { for (const [key, value] of Object.entries(globals)) value === undefined ? delete globalThis[key] : globalThis[key] = value; }
});

test('[risk: batched visibility erases neighbouring ink or crops wrong pixels] disjoint masks and fractional device-pixel crop', () => {
  const targets = [box('#a', 0), box('#b', 100), box('#c', 1)];
  assert.deepEqual(visibilityBatches(targets).map(b => b.map(t => t.element)), [['#a', '#b'], ['#c']]);
  const image = { width: 3, height: 1, pixels: Buffer.from([1,2,3,255, 4,5,6,255, 7,8,9,255]) };
  assert.deepEqual([...cropRaster(image, { x: 1.1, y: 0, width: .5, height: 1 }, 1).pixels], [4,5,6,255]);
});

test('[risk: smaller mask captures shift optical bounds or change contrast] cropped visibility boundary retains viewport coordinates', async () => {
  const clips = [];
  const ground = {width:3,height:3,pixels:Buffer.alloc(36,255)};
  const ink = {...ground,pixels:Buffer.from(ground.pixels)}; ink.pixels.fill(0,16,19);
  const target = { element:'#text', index:0,type:'text',threshold:4.5,rect:{x:10.5,y:20.5,width:2,height:2} };
  const page = {
    viewportSize:() => ({width:800,height:600}),
    evaluate:async fn => fn.name === 'visibilityTargets' ? {targets:[target],gaps:[]} : [],
    screenshot:async options => { clips.push(options.clip);return encodePNG(clips.length === 1 ? ink : ground); },
  };
  const result = await inspectVisibilityBatched(page,'#text');
  assert.deepEqual(result.gaps,[]); assert.deepEqual(result.findings,[]);
  assert.equal(result.measurements[0].contrastRatio,21);
  assert.deepEqual(result.measurements[0].inkBox,{left:.5,top:.5,right:1.5,bottom:1.5});
  assert.deepEqual(clips,Array(2).fill({x:10,y:20,width:3,height:3}));
});

test('[risk: real UA, SVG and scoped geometry differs from replay] browser runner regression fixture', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false,
}, async t => {
  const browser = await launchChrome(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(new URL('./fixtures/visual/runner-real.html', import.meta.url).href);
  const scope = await page.evaluate(stateScope, { name: 'first', root: 'body' });
  assert.equal(scope, '#component');
  const spacing = await page.evaluate(inspectSpacing, scope);
  assert(!spacing.findings.some(f => f.element === '#ua' && f.kind === 'off-grid'));
  assert(!spacing.findings.some(f => f.element === '#ua-fieldset' && ['off-grid', 'inset'].includes(f.kind)));
  assert(spacing.findings.some(f => f.element === '#authored' && f.values?.marginTop === 3));
  const clipped = await page.evaluate(inspectClip, scope);
  assert(clipped.ignoredNativeControls >= 1); assert(!clipped.gaps.some(g => g.includes('native')));
  const alignment = await inspectAlignment(page, scope);
  assert(!alignment.findings.some(f => f.element.includes('scaled') && f.kind === 'fractional-position'));
  assert(!alignment.findings.some(f => f.element === '#hairline' && f.kind === 'fractional-position'), 'Background-only hairlines have no bordered box');
  const overlap = await inspectOverlap(page, scope);
  assert(overlap.findings.some(f => f.element === '#provider' && f.other === '#inset'));
  const capture = decodePNGForTest(await captureRegion(page, scope));
  assert.equal(capture.width, 400); assert.equal(capture.height, 300);
  const before = await page.locator(scope).evaluate(e => e.outerHTML);
  const batched = await inspectVisibilityBatched(page, scope);
  const sequential = await inspectVisibility(page, scope);
  assert.equal(await page.locator(scope).evaluate(e => e.outerHTML), before);
  assert.deepEqual(batched.findings.map(f => [f.element, f.kind]).sort(), sequential.findings.map(f => [f.element, f.kind]).sort());
  assert(batched.captures < sequential.elements * 2);
  const screenshot = page.screenshot.bind(page); let calls = 0;
  page.screenshot = async options => { if (++calls === 2) throw new Error('seeded mask capture failure'); return screenshot(options); };
  const failed = await inspectVisibilityBatched(page, scope);
  assert(failed.gaps.some(g => g.includes('seeded mask capture failure')));
  assert.equal(await page.locator(scope).evaluate(e => e.outerHTML), before, 'mask failure restores author styles');
});

test('[risk: alignment noise drowns static mock reviews] --blocking-only keeps severity-5 findings only', () => {
  assert.equal(checkArguments(['--url', 'file:///m.html']).blockingOnly, undefined);
  assert.equal(checkArguments(['--url', 'file:///m.html', '--blocking-only']).blockingOnly, true);
  const kept = blockingFindings(['fractional-position', 'near-miss-alignment', 'off-grid', 'text-clipped', 'overlap', 'near-invisible'].map(kind => ({ kind })));
  assert.deepEqual(kept.map(f => f.kind), ['text-clipped', 'overlap', 'near-invisible']);
});
