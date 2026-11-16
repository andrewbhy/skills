if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/visual-alignment.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual } from './visual-clip.mjs';

export const ALIGNMENT_LIMITS = Object.freeze({
  nearMin: 1, // A one CSS pixel miss is visible beside an exact edge.
  nearMax: 3, // Larger distances are presumed deliberately separate.
  layout: 0, // Layout boxes must align exactly; do not hide subpixel defects.
  ink: 1, // Antialiased glyph/icon bounds allow one CSS pixel optical tolerance.
});

// Serializable geometry seam: replay tests use the same analysis as Chrome.
export function analyseAlignment(elements, { scale = 1, limits = ALIGNMENT_LIMITS } = {}) {
  const findings = [];
  const push = (e, kind, measured, expected, extra = {}) => findings.push({
    kind, element: e.element, ancestor: e.parent, rect: e.rect, measured, expected, ...extra,
  });
  for (const e of elements) {
    if (scale === 1 && e.fractionalTarget === true) for (const [edge, value] of Object.entries(e.fractionalEdges || Object.fromEntries((e.drawnAxes || []).map(edge => [edge, e.rect[edge]])))) {
      if (Number.isFinite(value) && Math.abs(value - Math.round(value)) > limits.layout)
        push(e, 'fractional-position', value, 'integer CSS pixels at scale 1', { edge });
    }
    if (e.bounds) {
      const { x, y, width, height } = e.rect, b = e.bounds;
      const overflow = { left: b.left - x, top: b.top - y, right: x + width - b.right, bottom: y + height - b.bottom };
      const edges = Object.fromEntries(Object.entries(overflow).filter(([, n]) => n > limits.layout));
      if (Object.keys(edges).length) push(e, 'containment', edges, 'inside parent content box');
    }
  }
  const containers = Map.groupBy(elements.filter(e => e.flow), e => e.parent);
  for (const siblings of containers.values()) {
    if (siblings.length < 2) continue;
    // Card rows have explicit intent, unlike the generic near-miss heuristic.
    // Compare translated card edges and the two content insets. Side-by-side
    // cards cannot share an absolute left coordinate; their insets can.
    const cards = siblings.filter(e => e.card);
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      const overlap = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
      if (overlap <= 0 || Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) > Math.max(a.rect.x, b.rect.x) + 1) continue;
      for (const [edge, actual, expected] of [['top', b.rect.y, a.rect.y], ['left-inset', b.cardInsets?.left, a.cardInsets?.left], ['right-inset', b.cardInsets?.right, a.cardInsets?.right]]) {
        if (Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) > 1)
          push(b, 'card-row-alignment', actual, expected, { edge, delta: actual - expected, tolerance: 1, reference: { element: a.element, edge, value: expected } });
      }
    }
    const generic = siblings.filter(e => !e.card);
    for (const edge of ['left', 'right', 'top', 'baseline']) {
      const value = e => edge === 'baseline' ? e.baseline : edge === 'left' ? e.rect.x : edge === 'right' ? e.rect.x + e.rect.width : e.rect.y;
      const clusters = Map.groupBy(generic.filter(e => Number.isFinite(value(e))), value);
      for (const e of generic) {
        if (!Number.isFinite(value(e))) continue;
        const candidates = [...clusters].filter(([v]) => Math.abs(v - value(e)) >= limits.nearMin && Math.abs(v - value(e)) <= limits.nearMax);
        candidates.sort((a, b) => b[1].length - a[1].length || Math.abs(a[0] - value(e)) - Math.abs(b[0] - value(e)));
        // Prefer the largest cluster. For equal singleton clusters report only
        // the later sibling; the pair is a candidate, not invented design intent.
        if (candidates.length && ((clusters.get(value(e))?.length ?? 0) < candidates[0][1].length ||
            (clusters.get(value(e))?.length ?? 0) === 1 && candidates[0][1].length === 1 && siblings.indexOf(e) > siblings.indexOf(candidates[0][1][0])))
          push(e, 'near-miss-alignment', value(e), candidates[0][0], { edge, delta: value(e) - candidates[0][0],
            reference: { element: candidates[0][1][0].element, edge, value: candidates[0][0] } });
      }
    }
  }
  return { findings, gaps: [], elements: elements.length };
}

// Runs in the browser. SVG internals and inline fragments are not layout peers.
export function alignmentTargets(selector = 'body') {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const all = [root, ...root.querySelectorAll('*')];
  if (all.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const name = e => e.id ? `#${CSS.escape(e.id)}` : `${e.localName}${e.parentElement ? `:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : ''}`;
  const path = e => e?.id ? name(e) : e?.parentElement ? `${path(e.parentElement)} > ${name(e)}` : name(e);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  return all.flatMap(e => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect(), p = s.position === 'absolute' ? e.offsetParent || e.parentElement : e.parentElement;
    if (!r.width || !r.height || s.visibility !== 'visible' || /^(none|contents|inline)$/.test(s.display) || e.closest('[hidden]') || e.closest('svg') && e.localName !== 'svg') return [];
    const parent = p && getComputedStyle(p), b = p?.getBoundingClientRect();
    const num = v => parseFloat(v) || 0;
    const flow = !['absolute', 'fixed'].includes(s.position);
    // Scroll containers intentionally expose only a window onto their content.
    const scrollParent = parent && /auto|scroll/.test(parent.overflowX + parent.overflowY);
    const bounds = p && p !== document.body && e !== root && !scrollParent && s.position !== 'fixed' ? {
      left: b.left + num(parent.borderLeftWidth) + num(parent.paddingLeft),
      top: b.top + num(parent.borderTopWidth) + num(parent.paddingTop),
      right: b.right - num(parent.borderRightWidth) - num(parent.paddingRight),
      bottom: b.bottom - num(parent.borderBottomWidth) - num(parent.paddingBottom),
    } : s.position === 'fixed' || e.matches('[popover],dialog[open],[role=menu],[role=listbox]') ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : null;
    let baseline;
    const text = [...e.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (text && !e.matches('td,th,tr,thead,tbody,tfoot,col,colgroup')) {
      const range = document.createRange(); range.selectNodeContents(text);
      const line = range.getClientRects()[0]; ctx.font = s.font;
      const metrics = ctx.measureText(text.textContent);
      if (line && Number.isFinite(metrics.fontBoundingBoxAscent)) baseline = line.top + (line.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
    }
    // SVG coordinates are artwork; the viewBox may scale every coordinate.
    // Only actual border paint has integer pixel intent. A transparent border
    // reserving focus space does not draw an edge.
    const drawn = side => {
      const color = s[`border${side}Color`];
      return num(s[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(s[`border${side}Style`]) &&
        color !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color) && !/\/\s*0(?:\.0+)?\s*\)$/.test(color);
    };
    const vertical = ['Left', 'Right'].some(drawn);
    const horizontal = ['Top', 'Bottom'].some(drawn);
    const tableInternal = e.matches('td,th,tr,thead,tbody,tfoot,col,colgroup');
    const fractionalTarget = !e.closest('svg') && !tableInternal && (vertical || horizontal);
    const drawnAxes = [...(vertical ? ['x', 'width'] : []), ...(horizontal ? ['y', 'height'] : [])];
    const fractionalEdges = Object.fromEntries(['Left','Right','Top','Bottom'].filter(drawn).map(side => [side.toLowerCase(), r[side.toLowerCase()]]));
    return [{ element: path(e), parent: p ? path(p) : null, flow: flow && !tableInternal, fractionalTarget, drawnAxes, fractionalEdges,
      card: e.matches('[data-grid-card],.card,.grid-panel,.region-card'),
      cardInsets: { left: num(s.borderLeftWidth) + num(s.paddingLeft), right: num(s.borderRightWidth) + num(s.paddingRight) },
      rect: { x: r.x, y: r.y, width: r.width, height: r.height }, bounds, baseline,
      scrollOverflow: /hidden|clip/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth ? { scrollWidth: e.scrollWidth, clientWidth: e.clientWidth } : null }];
  });
}

export async function inspectAlignment(page, selector = 'body', options = {}) {
  const measurements = await page.evaluate(alignmentTargets, selector);
  return { ...analyseAlignment(measurements, options), measurements };
}

export function analyseOptical(measurements, limits = ALIGNMENT_LIMITS) {
  const findings = [];
  for (const m of measurements) {
    if (!m.inkBox || !m.control?.centered) continue;
    const center = m.rect.y + (m.inkBox.top + m.inkBox.bottom) / 2;
    const delta = center - m.control.centerY;
    if (Math.abs(delta) > limits.ink) findings.push({ kind: 'optical-centring', element: m.element,
      ancestor: m.control.element, rect: m.rect, measured: center, expected: m.control.centerY, delta, tolerance: limits.ink });
  }
  const controls = Map.groupBy(measurements.filter(m => m.inkBox && m.control?.centeredX), m => m.control.index ?? m.control.element);
  for (const items of controls.values()) {
    const first = items[0], left = Math.min(...items.map(m => m.rect.x + m.inkBox.left)), right = Math.max(...items.map(m => m.rect.x + m.inkBox.right));
    const center = (left + right) / 2, delta = center - first.control.centerX;
    if (Math.abs(delta) > limits.ink) findings.push({ kind: 'optical-centring', axis: 'horizontal', element: first.control.element || first.element,
      ancestor: first.control.element, rect: first.rect, measured: center, expected: first.control.centerX, delta, tolerance: limits.ink });
  }
  return { findings, gaps: [] };
}
export async function runAlignment(options) {
  return runVisual(options, 'alignment', (page, scoped) => inspectAlignment(page, scoped.root));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runAlignment);
