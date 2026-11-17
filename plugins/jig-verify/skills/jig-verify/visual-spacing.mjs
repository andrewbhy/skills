import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual } from './visual-clip.mjs';

export const SPACING_STEP = 4; // Ordinary toolbox gaps use the four CSS pixel rhythm.
export function onSpacingGrid(n, step = SPACING_STEP) { return Math.abs(n / step - Math.round(n / step)) < .03; }

// The coordinator's spacing probe, rewritten as a portable helper. A geometry
// check is a candidate report, not a verdict on optical balance. Explicit,
// local exceptions are returned in the report rather than silently ignored.
export function inspectSpacing(selector = 'body') {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const findings = [], exceptions = [], gaps = [];
  const name = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${name(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  // An isolated document retains browser defaults without the author's CSS.
  // Cache by tag/type: cloning once per element would dominate large pages.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed!important;left:-10000px!important;width:1280px!important;height:800px!important;visibility:hidden!important';
  frame.setAttribute('aria-hidden', 'true'); document.documentElement.append(frame);
  const defaults = new Map();
  const uaStyle = (el, computed) => {
    const key = JSON.stringify([el.localName, el.getAttribute('type'), el.getAttribute('multiple'), el.getAttribute('size'), el.getAttribute('dir'), computed.fontSize]);
    if (!defaults.has(key)) {
      const clone = frame.contentDocument.createElement(el.localName);
      for (const attribute of ['type', 'multiple', 'size', 'dir']) if (el.hasAttribute(attribute)) clone.setAttribute(attribute, el.getAttribute(attribute));
      // UA em margins follow the element's font size even in an author theme.
      clone.style.fontSize = computed.fontSize;
      frame.contentDocument.body.append(clone);
      const style = frame.contentWindow.getComputedStyle(clone), values = {};
      for (const property of ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','rowGap','columnGap']) values[property] = style[property];
      defaults.set(key, values); clone.remove();
    }
    return defaults.get(key);
  };
  const visible = e => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && s.visibility === 'visible' && s.display !== 'none' && !e.closest('[hidden]') && (!e.checkVisibility || e.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}));
  };
  const grid = n => Math.abs(n / 4 - Math.round(n / 4)) < .03;
  const record = (e, kind, detail, force = false) => {
    // Only an exception on the measured region counts; no subtree opt-out.
    const reason = e.getAttribute(`data-spacing-${kind}`);
    const finding = { kind, element: name(e), ...detail };
    if (reason?.trim() && !force) exceptions.push({ ...finding, reason });
    else findings.push(finding);
  };
  try { for (const el of elements) {
    if (!visible(el) || el.closest('svg') || el.matches('option,optgroup,col,colgroup,thead,tbody,tfoot,tr,td,th,hr,[role=separator]') || el.parentElement?.closest('select,textarea')) continue;
    if (el.shadowRoot || el.matches('iframe,canvas')) gaps.push(`${name(el)}: contents not measurable`);
    const s = getComputedStyle(el);
    const attached = el.matches('[role=group],[data-attached],[class*=split],[class*=segmented]');
    const control = el.matches('button,input,select,[role=button],[role=combobox]');
    const height = el.computedStyleMap?.().get('height')?.toString() || s.height;
    const fixedControl = control && height && height !== 'auto' && (s.alignItems === 'center' || s.lineHeight === s.height || paddingIsZero());
    function paddingIsZero() { return parseFloat(s.paddingTop) === 0 && parseFloat(s.paddingBottom) === 0; }
    const arrowPadding = s.direction === 'rtl' ? 'paddingLeft' : 'paddingRight';
    const menu = el.matches('[role=menu],[role=menuitem]');
    const ua = uaStyle(el, s);
    if (/^(inline|contents)$/.test(s.display)) continue;
    const padding = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(s[`padding${k}`]));
    const boxed = ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(s[`border${k}Width`]) > 0) || !['rgba(0, 0, 0, 0)', 'transparent'].includes(s.backgroundColor);
    const authorPadding = ['Top', 'Right', 'Bottom', 'Left'].some(side => s[`padding${side}`] !== ua[`padding${side}`]);
    if (!fixedControl && !el.matches('select') && boxed && authorPadding && el.children.length && Math.max(...padding) >= 4 &&
        (Math.abs(padding[0] - padding[2]) > 1 || Math.abs(padding[1] - padding[3]) > 1 || Math.abs(padding[0] - padding[3]) > 6)) record(el, 'inset', { padding });
    const values = {};
    for (const property of ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','rowGap','columnGap']) {
      const cssName = property.replace(/[A-Z]/g, c => '-'+c.toLowerCase());
      if (el.computedStyleMap?.().get(cssName)?.toString() === 'auto') continue;
      const n = parseFloat(s[property]);
      if (fixedControl && ['paddingTop', 'paddingBottom'].includes(property) || el.matches('select') && property === arrowPadding) continue;
      if (Number.isFinite(n) && n !== 0 && !grid(n) && s[property] !== ua[property]) values[property] = n;
    }
    // Sizes intentionally fluid with a panel are not required to be grid multiples.
    // Fixed control/icon geometry can opt in with a measurable contract.
    if (el.hasAttribute('data-spacing-size')) {
      const r = el.getBoundingClientRect();
      for (const property of el.dataset.spacingSize.split(/\s+/).filter(Boolean)) {
        const n = r[property];
        if (Number.isFinite(n) && !grid(n)) values[property] = n;
      }
    }
    if (Object.keys(values).length) record(el, 'off-grid', { values });
    const kids = [...el.children].filter(e => visible(e) && !['absolute','fixed'].includes(getComputedStyle(e).position));
    if (kids.length < 2 || attached || el.matches('table')) continue;
    // Menu rules intentionally introduce different gaps around groups. A
    // growing label leaves space before its shortcut/arrow, not a spacing miss.
    if (menu || kids.some(e => e.matches('[role=separator],hr'))) continue;
    const rects = kids.map(e => e.getBoundingClientRect());
    const vertical = rects.every((r, i) => !i || r.top >= rects[i - 1].bottom - .5);
    const horizontal = rects.every((r, i) => !i || r.left >= rects[i - 1].right - .5);
    if (!vertical && !horizontal) continue; // Wrapping/two dimensional grids need row-by-row review.
    const axis = vertical ? 'vertical' : 'horizontal';
    const spaces = rects.slice(1).map((r, i) => Math.round((vertical ? r.top - rects[i].bottom : r.left - rects[i].right) * 100) / 100);
    if (spaces.some(n => Math.abs(n) < .5)) record(el, 'zero-gaps', { axis, gaps: spaces });
    // A flexible spacer or auto margin may divide leading/trailing groups. Still
    // check the ordinary gaps on either side; an exception must not hide them.
    const elastic = kids.slice(1).map((kid,i) => {
      const start=kids[i];
      for(let node=start.nextElementSibling;node&&node!==kid;node=node.nextElementSibling)if(parseFloat(getComputedStyle(node).flexGrow)>0)return true;
      const properties=vertical?['margin-top','margin-bottom']:['margin-left','margin-right'];
      return properties.some(p=>[start,kid].some(e=>e.computedStyleMap?.().get(p)?.toString()==='auto'));
    });
    const ordinary=spaces.filter((_,i)=>!elastic[i]);
    const declared=parseFloat(vertical?s.rowGap:s.columnGap);
    const badOrdinary=ordinary.length>=2&&Math.max(...ordinary)-Math.min(...ordinary)>1 || elastic.some(Boolean)&&Number.isFinite(declared)&&ordinary.some(n=>Math.abs(n-declared)>1);
    if(badOrdinary)record(el,'uneven-gaps',{axis,gaps:spaces,ordinaryGaps:ordinary},elastic.some(Boolean));
    else if(spaces.length>=2&&Math.max(...spaces)-Math.min(...spaces)>1)record(el,'uneven-gaps',{axis,gaps:spaces,ordinaryGaps:ordinary});
  } } finally { frame.remove(); }
  return { findings, exceptions, gaps: [...new Set(gaps)], elements: elements.length };
}

export async function runSpacing(options) {
  return runVisual(options, 'spacing', (page, scoped) => page.evaluate(inspectSpacing, scoped.root));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runSpacing);
