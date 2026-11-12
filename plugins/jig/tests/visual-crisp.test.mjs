import assert from 'node:assert/strict';
import { freemem } from 'node:os';
import test from 'node:test';
import { analyseCrisp, analyseConsistency, inspectCrisp, contrast } from '../scripts/visual-crisp.mjs';
import { launchChrome } from '../scripts/visual-clip.mjs';
import { analyseAlignment, inspectAlignment } from '../scripts/visual-alignment.mjs';
import { inspectSpacing } from '../scripts/visual-spacing.mjs';

const white = [255, 255, 255, 1], black = [0, 0, 0, 1];
const text = (extra = {}) => ({ element: '#label', component: 'row', slot: '/label', componentRoot: true, state: 'default',
  text: 'release-notes.md', tone: 'primary', fontWeight: '400', fontSize: 14, letterSpacing: 'normal', textWidth: 120,
  opacity: 1, foreground: black, background: white, color: black, radius: ['0px','0px','0px','0px'], ...extra });

test('[risk: token colours pass while text and surfaces look washed out] contrast, opacity, small text and fill detection with repaired controls', () => {
  assert.equal(contrast(black, white), 21);
  assert.deepEqual(analyseCrisp([text()]).findings, []);
  const broken = text({ foreground: [135, 135, 135, 1], opacity: .8, fontSize: 12,
    fill: [250, 250, 250, 1], surface: white, borders: [{ edge: 'bottom', color: [230, 230, 230, 1] }] });
  const kinds = analyseCrisp([broken]).findings.map(f => f.kind);
  assert.deepEqual(new Set(kinds), new Set(['text-contrast', 'text-opacity', 'small-body-text', 'grey-on-grey', 'faint-border']));
  assert(analyseCrisp([text({ separator: true, fill: [220,220,220,1], surface: white })]).findings.some(f => f.kind === 'faint-separator'));
  assert(!analyseCrisp([text({ fontSize: 12 })], { scale: 2 }).findings.length);
  assert(!analyseCrisp([text({ foreground: [90,90,90,1], tone: 'secondary' })]).findings.length);
  assert(analyseCrisp([text({ foreground: [90,90,90,1] })]).findings.length);
  assert(!analyseCrisp([text({ foreground: [90,90,90,1] })], { thresholds: { primary: 5.5 } }).findings.length);
});

test('[risk: selected tree rows become bold and hover is indistinguishable] compare each typography property and fill pair across snapshots', () => {
  const base = text();
  const hover = text({ element: '#row-hover', state: 'hover', background: [230,230,230,1] });
  const selected = text({ element: '#row-selected', state: 'selected', selected: true, background: hover.background,
    fontWeight: '700', fontSize: 15, letterSpacing: '.2px', textWidth: 130 });
  const initial = analyseConsistency([base, hover]);
  const result = analyseConsistency([selected], initial.history);
  for (const property of ['fontWeight','fontSize','letterSpacing','textWidth']) assert(result.findings.some(f => f.kind === 'state-typography' && f.property === property));
  assert.equal(result.findings.filter(f => f.kind === 'state-fill').length, 2);
  const fixed = text({ element: '#selected', state: 'selected', selected: true, background: [0,80,160,1] });
  assert.deepEqual(analyseConsistency([base, hover, fixed]).findings, []);
  assert(!analyseConsistency([base, text({ state: 'hover', text: 'A different name', textWidth: 200 })]).findings.some(f=>f.kind==='state-typography'), 'Width compares identical content');
  assert(analyseConsistency([base, text({ state: 'selected', text: 'Another name', fontWeight: '700' })]).findings.some(f => f.property === 'fontWeight'), 'Weight compares component slots even when content differs');
});

test('[risk: calibration hides real faint borders and collapsed surfaces] filled borders and identical nested surfaces pass; distinct faint paint fails',()=>{
  const faint=[250,250,250,1],blue=[0,60,140,1];
  const border=color=>[{edge:'all',color}];
  assert.deepEqual(analyseCrisp([text({borders:border(white)})]).findings,[]);
  assert.deepEqual(analyseCrisp([text({filledControl:true,background:blue,foreground:white,borders:border([1,61,141,1])})]).findings,[]);
  assert.deepEqual(analyseCrisp([text({fill:white,surface:white})]).findings,[]);
  assert.deepEqual(analyseCrisp([text({fill:[250,250,250,0],surface:white})]).findings,[]);
  assert(analyseCrisp([text({borders:border(faint)})]).findings.some(f=>f.kind==='faint-border'));
  assert(analyseCrisp([text({fill:faint,surface:white})]).findings.some(f=>f.kind==='grey-on-grey'));
  assert(analyseCrisp([text({separator:true,fill:white,surface:white})]).findings.some(f=>f.kind==='faint-separator'));
});

test('[risk: a grey pill in a square table passes selection review] cross-component paint, radius, colour and narrow exceptions', () => {
  const a = text({ selected: true, state: 'selected', component: 'tree', background: [0,60,140,1], color: white });
  const b = text({ element: '#pill', selected: true, state: 'selected', component: 'table', background: [230,230,230,1], radius: Array(4).fill('8px') });
  const result = analyseConsistency([a,b]);
  assert.deepEqual(result.findings.map(f => f.property).sort(), ['background','color','radius']);
  const allowed = analyseConsistency([a,b], [], ['background','color','radius'].map(property => ({ element: '#pill', property, reason: 'Documented intentional alternate selection' })));
  assert.deepEqual(allowed.findings, []); assert.equal(allowed.exceptions.length, 3);
  assert.deepEqual(analyseConsistency([a,{ ...a, component: 'table', element: '#table' }]).findings, []);
  assert(analyseConsistency([a,{ ...b, component: 'tree' }]).findings.some(f => f.property === 'radius'), 'Separate component instances share selection even within the same family');
  assert(analyseConsistency([{ ...b, squareTable:true, table:'#files' }]).findings.some(f => f.property === 'radius' && f.other === '#files'), 'A rounded selection inside a square table fails even if all other selections are rounded');
});

test('[risk: a single file name is ellipsized despite available space] hidden width retained for one row or growable container', () => {
  for (const reason of [{ singleRow: true }, { canGrow: true }]) {
    const result = analyseCrisp([text({ hiddenWidth: 37, ...reason })]);
    assert.equal(result.findings[0].kind, 'unintended-truncation'); assert.equal(result.findings[0].hiddenWidth, 37);
  }
  assert.deepEqual(analyseCrisp([text({ hiddenWidth: 37, canGrow: false, singleRow: false })]).findings, []);
});

test('[risk: inline text and undrawn axes create fractional noise] border-only replay, scale and reference-edge evidence', () => {
  const box = (element, x, extra = {}) => ({ element, parent: '#group', flow: true, rect: { x, y: 20.5, width: 100, height: 24.5 }, ...extra });
  assert.deepEqual(analyseAlignment([box('#inline', 16.5, { fractionalTarget: false })]).findings, []);
  const bordered = box('#border', 16, { fractionalTarget: true, drawnAxes: ['x','width'] });
  assert.deepEqual(analyseAlignment([bordered]).findings, [], 'Vertical borders do not draw on the fractional horizontal axis');
  assert(analyseAlignment([{ ...bordered, rect: { ...bordered.rect, x: 16.5 } }]).findings.length);
  assert.deepEqual(analyseAlignment([{ ...bordered, rect: { ...bordered.rect, x: 16.5 } }], { scale: 2 }).findings, []);
  const findings = analyseAlignment([box('#a',16), box('#b',16), box('#miss',18)]).findings;
  assert.deepEqual(findings.find(f => f.edge === 'left').reference, { element: '#a', edge: 'left', value: 16 });
  assert.deepEqual(analyseAlignment([box('#parent',16,{ parent: '#outer' }),box('#child',18,{ parent:'#parent' })]).findings, [], 'A child is never a peer of its container');
});

test('[risk: attached controls, fixed heights and table/menu structure flood spacing reports] DOM replay executes calibrated inspector', () => {
  const globals = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const base = { display:'block', visibility:'visible', position:'static', fontSize:'14px',
    paddingTop:'0px',paddingRight:'0px',paddingBottom:'0px',paddingLeft:'0px',
    marginTop:'0px',marginRight:'0px',marginBottom:'0px',marginLeft:'0px',rowGap:'normal',columnGap:'normal',
    backgroundColor:'transparent', borderTopWidth:'0px',borderRightWidth:'0px',borderBottomWidth:'0px',borderLeftWidth:'0px' };
  const node = (tag, attrs = {}, css = {}, children = []) => {
    const e = { localName:tag, id:attrs.id, children, parentElement:null, dataset:{}, style:{}, css:{...base,...css},
      hasAttribute:k => k in attrs, getAttribute:k => attrs[k] ?? null,
      matches:selector => selector.split(',').some(part => {
        if (part === tag) return true;
        const match = part.match(/^\[([^=*]+)(\*=|=)?([^\]]*)\]$/);
        return match && (match[2] === '*=' ? (attrs[match[1]] || '').includes(match[3]) : match[2] === '=' ? attrs[match[1]] === match[3] : match[1] in attrs);
      }),
      closest:selector => { for (let p=e;p;p=p.parentElement) if(p.matches(selector)) return p; return null; },
      querySelectorAll:() => children.flatMap(c => [c,...c.querySelectorAll('*')]),
      getBoundingClientRect:() => ({ x:0,y:0,left:0,top:0,right:100,bottom:32,width:100,height:32 }),
      append:c => { c.parentElement=e; children.push(c); }, remove(){},
    };
    children.forEach(c => { c.parentElement=e; }); return e;
  };
  try {
    globalThis.getComputedStyle = e => ({ ...e.css,...e.style });
    const frame = { style:{}, setAttribute(){}, remove(){}, contentDocument:{ createElement:tag => node(tag), body:{append(){}} }, contentWindow:{getComputedStyle:globalThis.getComputedStyle} };
    const scenarios = [
      node('div',{role:'group'}, {}, [node('button'),node('button')]),
      node('div',{class:'split-control'}, {}, [node('button'),node('button')]),
      node('div',{class:'segmented-control'}, {}, [node('button'),node('button')]),
      node('div',{'data-attached':''}, {}, [node('button'),node('button')]),
      node('button',{}, {height:'32px',paddingLeft:'12px',paddingRight:'12px',backgroundColor:'white',alignItems:'center'},[node('span')]),
      node('select',{}, {paddingLeft:'8px',paddingRight:'29px',appearance:'auto'},[node('option')]),
      node('div',{role:'menu'}, {}, [node('button',{role:'menuitem'},{paddingLeft:'8px'},[node('span')]),node('div',{role:'separator'},{marginTop:'3px'}),node('button',{role:'menuitem'})]),
      node('table',{}, {}, [node('colgroup',{}, {},[node('col'),node('col')]),node('tbody',{}, {},[node('tr',{}, {},[node('td',{}, {paddingTop:'6px'}),node('td')])])]),
    ];
    for (const root of scenarios) {
      globalThis.document = { querySelector:() => root, createElement:tag => { assert.equal(tag,'iframe'); return frame; },documentElement:{append(){}} };
      assert.deepEqual(inspectSpacing('#case').findings, [], `Calibration: ${root.localName} ${root.getAttribute('role') || root.getAttribute('class') || ''}`);
    }
    // Retain detection outside the intentional cases.
    const broken = node('div',{}, {paddingLeft:'13px'});
    document.querySelector = () => broken;
    assert(inspectSpacing('#case').findings.some(f => f.kind === 'off-grid'));
  } finally { for(const [key,value] of Object.entries(globals)) value === undefined ? delete globalThis[key] : globalThis[key]=value; }
});

test('[risk: CSS capture misses planted crispness and calibration differs from replay] rendered defects and intentional controls', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false,
}, async t => {
  const browser = await launchChrome(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(new URL('./fixtures/visual/crisp.html', import.meta.url).href);
  const crisp = await inspectCrisp(page, '#defects');
  assert(crisp.findings.some(f => f.element === '#washed' && f.kind === 'text-contrast'));
  assert(crisp.findings.some(f => f.element === '#grey' && f.kind === 'grey-on-grey'));
  assert(crisp.findings.some(f => f.element === '#truncated' && f.kind === 'unintended-truncation' && f.hiddenWidth > 0));
  const consistency = analyseConsistency(crisp.measurements);
  for (const kind of ['state-typography','state-fill','selection-style']) assert(consistency.findings.some(f => f.kind === kind), kind);
  const spacing = await page.evaluate(inspectSpacing, '#calibration');
  assert.deepEqual(spacing.findings, [], JSON.stringify(spacing.findings));
  const alignment = await inspectAlignment(page, '#calibration');
  assert(!alignment.findings.some(f => f.kind === 'fractional-position' && f.element.includes('inline-chip')));
  // A nested half-opacity surface must composite the group over white, rather
  // than applying opacity independently to every inherited layer.
  const alpha = await inspectCrisp(page, '#alpha');
  const label = alpha.measurements.find(m => m.element === '#alpha-text');
  assert(Math.abs(label.background[0] - 127.5) < 1);
  assert(Math.abs(label.foreground[0] - 255) < 1);
});
