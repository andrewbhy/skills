import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import test from 'node:test';
import { checkStyles, lintCSS, styleDebt, styleKey, cssTokens } from '../scripts/style-lint.mjs';
import { checkTokens, analyseTokens, tokenRules } from '../scripts/ui-tokens-check.mjs';
import { analyseAlignment, inspectAlignment } from '../scripts/visual-alignment.mjs';
import { scanClip, inspectClip, inspectClipping, launchChrome } from '../scripts/visual-clip.mjs';
import { inspectReflow } from '../scripts/visual-reflow.mjs';
import { runInspectors } from '../scripts/visual-check.mjs';
import { measureStatic } from '../scripts/visual-static.mjs';
import { visualDOM } from './helpers/visual-dom.mjs';

const fixture = name => new URL(`fixtures/grid/${name}.html`, import.meta.url);
const guide = new URL('../docs/design-toolbox/grid/index.html', import.meta.url);
const policy = { typeScale: [12,14,15,18,24], tokens: cssTokens(readFileSync(new URL('../docs/design-toolbox/grid/tokens.css', import.meta.url), 'utf8')) };

test('[risk: spacing and type drift hide behind aliases] bad static fixtures fail both public checks and clean pages pass', () => {
  for (const [name, kinds] of [['off-scale-spacing', ['grid-spacing', 'off-spacing-scale']], ['extra-font-size', ['off-type-scale']], ['small-text', ['font-too-small', 'off-type-scale']]]) {
    for (const report of [checkStyles(fileURLToPath(fixture(name))), checkTokens({ url: fixture(name).href })]) {
      assert.deepEqual(report.gaps, [], name);
      for (const kind of kinds) assert(report.findings.some(f => f.kind === kind && f.element.includes('.bad') && f.measured), `${name}: ${kind}`);
    }
  }
  for (const url of [fixture('clean'), guide]) {
    assert.deepEqual(checkStyles(fileURLToPath(url)), { findings: [], gaps: [] });
    const result = checkTokens({ url: url.href });
    assert.deepEqual(result.findings, []); assert.deepEqual(result.gaps, []); assert.equal(result.status, 'passed');
  }
});

test('[risk: CSS shorthands, logical edges and fake tokens bypass grid checks] spacing and type boundaries fail closed', () => {
  for (const property of ['padding', 'padding-block', 'margin-inline-end', 'gap', 'row-gap', 'column-gap', 'inset', 'inset-inline-start', 'top']) {
    for (const value of ['20px', 'var(--rogue)', '10%', 'calc(var(--grid-space-2) + 1px)', 'var(--missing)', 'var(--cycle)', 'var(--grid-space-2, 6px)']) {
      const report = lintCSS(`.bad{--rogue:16px;--cycle:var(--cycle);${property}:${value}}`, policy);
      assert(report.findings.some(f => f.kind === 'grid-spacing'), `${property}:${value}`);
    }
    assert.deepEqual(lintCSS(`.clean{--alias:var(--grid-space-4);${property}:0 auto var(--alias)}`, policy).findings, []);
  }
  for (const css of ['.bad{font-size:11px}', '.bad{--size:17px;font-size:var(--size)}', '.bad{font:italic 11px/1.5 sans-serif}', '.bad{font-size:var(--missing)}', '.bad{font-size:80%}']) assert(lintCSS(css, policy).findings.length, css);
  assert(lintCSS('.bad{--size:11px;font-size:var(--size)}.other{--size:15px}', policy).findings.some(f => f.kind === 'font-too-small'), 'a later token override cannot hide a bad branch');
  assert.deepEqual(lintCSS('.clean{font-size:var(--grid-type-meta);font:inherit}', policy).findings, []);
});

test('[risk: new or duplicated debt is silently grandfathered] counted debt accepts only exact original declarations', () => {
  const old = lintCSS('.old{padding:5px}', { file: 'old.css' }).findings;
  const baseline = old.map(f => ({ key: styleKey(f), count: 1 }));
  const before = JSON.stringify(baseline);
  assert.deepEqual(styleDebt(old, baseline), []);
  assert.equal(styleDebt([...old, ...old], baseline).length, old.length);
  assert(styleDebt(lintCSS('.new{padding:6px}', { file: 'new.css' }).findings, baseline).length);
  assert.equal(JSON.stringify(baseline), before);
  assert.deepEqual(checkStyles().findings, [], 'whole-toolbox debt remains unchanged');
});

test('[risk: state-table metadata text bypasses the grid type floor] token semantics check every role and declared size', () => {
  const base = new URL('fixtures/visual/cheap/', import.meta.url);
  const table = JSON.parse(readFileSync(new URL('data/states.json', base), 'utf8'));
  const css = readFileSync(new URL('tokens.css', base), 'utf8');
  table.roles.metadata = table.roles.body;
  table.states.forEach(s => { s.role = 'metadata'; });
  assert(analyseTokens(table, tokenRules(css + ':root{--body:11px}')).findings.some(f => f.kind === 'font-too-small'));
  assert(analyseTokens(table, tokenRules(css), {typeScale:[12,15,18]}).findings.some(f => f.kind === 'off-type-scale'));
  assert(!analyseTokens(table, tokenRules(css), {typeScale:[12,14,15,18]}).findings.some(f => ['font-too-small','off-type-scale'].includes(f.kind)));
});

test('[risk: literal queries or guide rows drift from the grid contract] production scale and both query families match the sources', () => {
  const base = new URL('../docs/design-toolbox/grid/', import.meta.url);
  const read = name => readFileSync(new URL(name, base), 'utf8');
  const tokens = cssTokens(read('tokens.css')), primitives = read('primitives.css'), html = read('index.html');
  assert.deepEqual(Object.entries(tokens).filter(([key]) => key.startsWith('--grid-space-')).map(([,value]) => parseInt(value)), [0,4,8,12,16,24,32,48,64]);
  for (const [name, columns] of [['medium',8],['expanded',12],['large',12],['extra-wide',12]]) {
    const width = tokens[`--grid-width-${name}`];
    assert(primitives.includes(`@container grid-region (min-width: ${width})`));
    if (name !== 'medium') assert(primitives.includes(`@container grid-shell (min-width: ${width})`));
    assert.equal(Number(tokens[`--grid-columns-${name}`]), columns);
    assert(primitives.includes(`padding-inline: var(--grid-margin-${name})`));
  }
  const ids = [...read('rules.md').matchAll(/^\| (G\d\d) /gm)].map(m => m[1]);
  assert.equal(ids.length, 31);
  assert.deepEqual([...html.matchAll(/<th scope="row">(G\d\d) /g)].map(m => m[1]), ids);
  for (const name of ['Compact','Medium','Expanded','Large','Extra-wide']) assert(read('regions.md').toLowerCase().includes(name.toLowerCase()));
});

test('[risk: card row drift larger than the generic near-miss window escapes] top and both content edges have a 1px limit', () => {
  const card = (element, x, y, left = 8, right = 8) => ({ element, parent: '#row', flow: true, card: true, cardInsets: {left,right}, rect: {x,y,width:120,height:96} });
  const first = card('#first', 0, 0);
  for (const [second, edge] of [[card('#second',136,12), 'top'], [card('#second',136,0,16), 'left-inset'], [card('#second',136,0,8,16), 'right-inset']]) {
    assert(analyseAlignment([first,second]).findings.some(f => f.kind === 'card-row-alignment' && f.edge === edge));
  }
  assert(!analyseAlignment([first,card('#second',136,1,9,9)]).findings.some(f => f.kind === 'card-row-alignment'));
  assert(!analyseAlignment([first,card('#next-row',0,120)]).findings.some(f => f.kind === 'card-row-alignment'));
});

// Geometry replay exercises actual browser-function logic without a browser.
// It proves detection and scroll ownership, not browser layout or rendering.
function replay(t) {
  const dom = visualDOM(t);
  const saved = Object.fromEntries(['innerWidth','innerHeight','NodeFilter'].map(k => [k, globalThis[k]]));
  t.after(() => { for (const [key,value] of Object.entries(saved)) value === undefined ? delete globalThis[key] : globalThis[key] = value; });
  globalThis.innerWidth = 320; globalThis.innerHeight = 800; globalThis.NodeFilter = { SHOW_TEXT: 4 };
  const node = (...args) => {
    const e = dom.node(...args);
    Object.assign(e.css, {clipPath:'none',writingMode:'horizontal-tb',transform:'none',overflowClipMargin:'0px',textOverflow:'clip'});
    e.tagName = e.localName.toUpperCase(); e.getClientRects = () => [e.getBoundingClientRect()];
    e.offsetWidth = e.clientWidth; e.offsetHeight = e.clientHeight; e.scrollWidth = e.clientWidth; e.scrollHeight = e.clientHeight;
    e.childNodes.forEach(n => { n.parentElement = e; n.rects = [e.getBoundingClientRect()]; });
    return e;
  };
  const mount = e => {
    dom.mount(e);
    document.createTreeWalker = root => { const nodes = [root,...root.querySelectorAll('*')].flatMap(e => e.childNodes); let i = 0; return { nextNode: () => nodes[i++] }; };
    document.createRange = () => { let text; return { selectNodeContents: n => { text = n; }, getClientRects: () => text.rects }; };
    document.elementFromPoint = () => null;
  };
  return { node, mount };
}

test('[risk: promoted clip scan emits empty findings, blames scrollers or misses covered controls] draft logic and inline clean control', t => {
  const { node, mount } = replay(t);
  const text = node('p', {id:'clipped'}, {overflowX:'hidden'}, 'Long clipped text', [], {width:48}); text.scrollWidth = 300;
  const inline = node('a', {id:'inline'}, {display:'inline'}, 'Clean inline link'); inline.clientWidth = 0; inline.scrollWidth = 100;
  const button = node('button', {id:'action'}, {}, 'Action');
  const cover = node('div', {id:'cover'});
  const root = node('main', {id:'screen'}, {}, '', [text,inline,button,cover], {width:320,height:800}); mount(root);
  document.elementFromPoint = () => cover;
  const result = scanClip('#screen');
  assert(result.findings.some(f => f.kind === 'self-clipped' && f.element === '#clipped'));
  assert(result.findings.some(f => f.kind === 'control-covered' && f.element === '#action'));
  assert(!result.findings.some(f => f.kind === 'self-clipped' && f.element === '#inline'));
  assert(result.findings.every(f => f && f.kind));
  text.css.overflowX = 'visible'; document.elementFromPoint = () => null;
  assert.deepEqual(scanClip('#screen').findings, []);
  // Text beyond a horizontal scroller belongs to the scroller, not viewport.
  text.getBoundingClientRect = () => ({left:400,right:500,top:0,bottom:24,width:100,height:24});
  root.css.overflowX = 'auto'; root.scrollWidth = 500;
  assert.deepEqual(scanClip('#screen').findings, []);
  // A hidden box inside that scroller still clips its own descendants.
  text.getBoundingClientRect = () => ({left:0,right:200,top:0,bottom:24,width:200,height:24});
  const clipper = node('div', {id:'clipper'}, {overflowX:'hidden'}, '', [text], {width:100});
  const scroller = node('main', {id:'screen'}, {overflowX:'auto'}, '', [clipper], {width:320,height:800});
  scroller.scrollWidth = 500; mount(scroller);
  assert(scanClip('#screen').findings.some(f => f.kind === 'box-clipped' && f.ancestor === '#clipper'));
});

test('[risk: narrow text or a nested horizontal scroller evades reflow] text ranges fail at 320px and wrapping restores a pass', t => {
  const { node, mount } = replay(t);
  const text = node('p', {id:'paragraph'}, {}, 'A paragraph', [], {width:640});
  const root = node('main', {id:'screen'}, {}, '', [text], {width:320,height:800}); mount(root);
  assert.equal(inspectReflow('#screen').findings[0].kind, 'text-reflow');
  text.childNodes[0].rects = [{left:0,right:288,top:0,bottom:48}];
  assert.deepEqual(inspectReflow('#screen').findings, []);
  root.css.overflowX = 'auto'; root.scrollWidth = 640;
  assert.equal(inspectReflow('#screen').findings.length, 1);
  globalThis.innerWidth = 400;
  assert.match(inspectReflow('#screen').gaps[0], /320 CSS px/);
});

test('[risk: promotion adds a scan that the shared runners never call] sequential and batched inspectors execute box scan', async t => {
  const { node, mount } = replay(t);
  const text = node('p', {id:'clipped'}, {}, 'A clipped label', [], {width:48});
  text.css.overflowX = 'hidden'; text.scrollWidth = 300;
  mount(node('main', {id:'screen','data-component':'fixture'}, {}, '', [text], {width:320,height:800}));
  const page = {evaluate: async (fn, arg) => typeof fn === 'string' ? runInThisContext(fn) : fn(arg)};
  const sequential = await runInspectors(page, {root:'#screen',inspectors:['clip']}, {});
  assert(sequential.clip.findings.some(f => f.kind === 'self-clipped'));
  const groups = await measureStatic(page, [{name:'default',scope:'#screen',component:'fixture'}], {inspectors:['clip']});
  assert(groups[0].runs[0].inspectors.clip.findings.some(f => f.kind === 'self-clipped'));
  assert.deepEqual(groups[0].runs[0].inspectors.clip.gaps, []);
});

test('[risk: static evidence is mistaken for rendered grid acceptance] browser fixtures detect all geometry defects and clean controls', async t => {
  let browser;
  try { browser = await launchChrome(); }
  catch (error) {
    if (/disabled|skipped|unavailable|Cannot find (?:package|module)/i.test(error.message)) { t.skip(`Browser unavailable: ${error.message}`); return; }
    throw error;
  }
  try {
    const page = await browser.newPage({ viewport: { width:320, height:800 } });
    for (const [name, inspect, kind] of [
      ['misaligned-cards', p => inspectAlignment(p, '#screen'), 'card-row-alignment'],
      ['reflow-failure', p => p.evaluate(inspectReflow, '#screen'), 'text-reflow'],
      ['clipped-text', p => p.evaluate(inspectClip, '#screen'), 'text-clipped'],
      ['clipped-text', p => p.evaluate(scanClip, '#screen'), 'self-clipped'],
      ['covered-control', p => p.evaluate(scanClip, '#screen'), 'control-covered'],
    ]) {
      await page.goto(fixture(name).href); await page.evaluate(() => document.fonts.ready);
      const report = await inspect(page); assert.deepEqual(report.gaps, []); assert(report.findings.some(f => f.kind === kind), `${name}: ${kind}`);
    }
    await page.goto(fixture('clean').href);
    for (const report of [await inspectAlignment(page, '#screen'), await inspectClipping(page, '#screen'), await page.evaluate(inspectReflow, '#screen')]) {
      assert.deepEqual(report.findings, []); assert.deepEqual(report.gaps, []);
    }
    await page.goto(guide.href);
    // The guide's labelled, horizontally scrollable preview is a canvas. Its
    // prose must reflow; its static styles are covered by the first test.
    assert.deepEqual((await page.evaluate(inspectReflow, 'body')).findings, []);
    assert.deepEqual((await inspectAlignment(page, 'body')).findings.filter(f => f.kind === 'card-row-alignment'), []);
  } finally { await browser.close(); }
});
