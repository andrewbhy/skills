// Selected heuristics adapted from Impeccable, Copyright 2025 Paul Bakaus,
// Apache-2.0, revision 924bbd194d02e5e15a227e75b5901fb0d7a4ecad.
// Reimplemented for jig's measured snapshots; see docs/design-toolbox/IMPECCABLE-LICENSE.txt
// and docs/design-toolbox/design-inspector.md for differences and limits.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const designRules = Object.freeze(['nested-cards', 'icon-tile-stack', 'dark-glow', 'radial-halo', 'radial-spotlight-glow']);
const glowRules = designRules.slice(2);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const color = c => Array.isArray(c) && c.length === 4 && c.every(finite)
  && c.slice(0, 3).every(n => n >= 0 && n <= 255) && c[3] >= 0 && c[3] <= 1;
const chroma = c => Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3));
const luminance = c => c.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
  .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
const heading = n => /^h[1-6]$/.test(n.tag) || n.role === 'heading' || n.cardTitle === true;
const card = n => !['button', 'input', 'select', 'textarea', 'a', 'img', 'svg', 'video', 'canvas', 'picture', 'pre', 'code'].includes(n.tag)
  && !['button', 'textbox', 'combobox', 'option', 'tab', 'menuitem'].includes(n.role)
  && (n.border > 0 || n.shadows.some(s => s.property === 'box-shadow' && !s.inset && s.color[3] > .05))
  && (n.radius > 0 || n.background[3] > .05);

function validate(snapshot, options) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.gaps)) throw new Error('Expected design snapshot v1 with nodes and gaps');
  if (!snapshot.gaps.every(g => typeof g === 'string')) throw new Error('Snapshot gaps must be strings');
  const targets = new Map();
  for (const n of snapshot.nodes) {
    if (!n || typeof n.target !== 'string' || !n.target || targets.has(n.target) || typeof n.tag !== 'string'
      || typeof n.text !== 'string' || !n.rect || !['x', 'y', 'width', 'height'].every(k => finite(n.rect[k]))
      || n.rect.width < 0 || n.rect.height < 0 || !color(n.background) || !color(n.surface)
      || !finite(n.border) || n.border < 0 || !finite(n.radius) || n.radius < 0
      || !finite(n.opacity) || n.opacity < 0 || n.opacity > 1 || !Array.isArray(n.shadows) || !Array.isArray(n.gradients)
      || ![n.parent, n.previous].every(v => v === null || typeof v === 'string')) throw new Error('Invalid or duplicate snapshot node');
    for (const flag of ['hidden', 'icon', 'cardTitle', 'frame', 'focus', 'selection']) {
      if (n[flag] !== undefined && typeof n[flag] !== 'boolean') throw new Error(`Invalid ${flag}: ${n.target}`);
    }
    if (n.iconWidth !== undefined && (!finite(n.iconWidth) || n.iconWidth < 0)) throw new Error(`Invalid icon width: ${n.target}`);
    for (const s of n.shadows) {
      if (!s || !['box-shadow', 'text-shadow'].includes(s.property) || !['x', 'y', 'blur', 'spread'].every(k => finite(s[k]))
        || s.blur < 0 || !color(s.color) || typeof s.inset !== 'boolean') throw new Error(`Invalid shadow: ${n.target}`);
    }
    for (const g of n.gradients) {
      if (!g || typeof g.value !== 'string' || typeof g.repeating !== 'boolean' || !Array.isArray(g.stops)
        || !g.stops.every(s => s && color(s.color) && (s.px === null || finite(s.px)))) throw new Error(`Invalid gradient: ${n.target}`);
    }
    targets.set(n.target, n);
  }
  for (const n of snapshot.nodes) {
    for (const ref of [n.parent, n.previous]) if (ref !== null && !targets.has(ref)) throw new Error(`Unknown node reference: ${ref}`);
    if (n.previous && (n.previous === n.target || targets.get(n.previous).parent !== n.parent)) throw new Error(`Invalid previous sibling: ${n.target}`);
    const seen = new Set([n.target]);
    for (let p = n.parent; p; p = targets.get(p).parent) {
      if (seen.has(p)) throw new Error(`Parent cycle: ${n.target}`);
      seen.add(p);
    }
  }
  const waivers = options.waivers ?? [];
  const intentional = options.theme?.intentional ?? [];
  const themeId = options.theme?.id ?? options.theme?.name;
  if (!Array.isArray(waivers) || !Array.isArray(intentional)) throw new Error('Waivers and theme.intentional must be arrays');
  for (const w of [...waivers, ...intentional]) {
    if (!w || !designRules.includes(w.ruleId) || typeof w.target !== 'string' || !w.target
      || typeof w.reason !== 'string' || !w.reason.trim() || typeof w.evidence !== 'string' || !w.evidence.trim()) throw new Error('Exception needs known ruleId, target, reason and evidence');
  }
  if (waivers.some(w => w.target === '*')) throw new Error('Waivers need an exact target');
  if (intentional.some(w => !glowRules.includes(w.ruleId)) || (intentional.length && (typeof themeId !== 'string' || !themeId.trim()))) throw new Error('Named theme intent supports glow rules only');
  return { targets, waivers, intentional };
}

/** Pure advisory rules. Input is an inspectable, versioned measured snapshot. */
export function analyzeDesign(snapshot, options = {}) {
  const { targets, waivers, intentional } = validate(snapshot, options);
  const findings = [], waived = [], gaps = [...snapshot.gaps];
  const visible = n => {
    for (let p = n; p; p = targets.get(p.parent)) if (p.hidden || p.opacity <= .01 || p.rect.width === 0 || p.rect.height === 0) return false;
    return true;
  };
  const dialogCard = n => {
    for (let p = n; p; p = targets.get(p.parent)) {
      if (p.tag === 'dialog' || ['dialog', 'alertdialog'].includes(p.role)) return true;
      if (p !== n && card(p)) return false;
    }
    return false;
  };
  const emit = (ruleId, n, evidence, explanation) => {
    const finding = { ruleId, severity: 'warn', target: n.target, evidence, explanation };
    const exception = waivers.find(w => w.ruleId === ruleId && w.target === n.target)
      ?? intentional.find(w => w.ruleId === ruleId && (w.target === n.target || w.target === '*'));
    if (exception) waived.push({ ...finding, exception });
    else findings.push(finding);
  };
  const panels = new Map();
  for (const n of snapshot.nodes.filter(visible)) {
    if (card(n) && n.text.trim().length >= 10 && !['absolute', 'fixed'].includes(n.position) && !n.frame) {
      for (let p = targets.get(n.parent); p; p = targets.get(p.parent)) {
        if (!card(p)) continue;
        if (!dialogCard(p) && !p.frame) {
          const nested = panels.get(p.target) ?? [];
          nested.push(n.target); panels.set(p.target, nested);
        }
        break;
      }
    }
    if (heading(n)) {
      const s = targets.get(n.previous);
      if (s && visible(s) && !heading(s) && s.icon && s.rect.width >= 32 && s.rect.width <= 128 && s.rect.height >= 32 && s.rect.height <= 128
        && s.rect.width / s.rect.height >= .7 && s.rect.width / s.rect.height <= 1.4
        && (s.background[3] >= .05 || s.gradients.length || s.border > 0 || s.shadows.some(l => l.blur === 0 && l.spread >= .5 && l.color[3] >= .05))
        && s.radius < s.rect.width / 2 && (!s.iconWidth || s.iconWidth < s.rect.width * .95)
        && s.rect.y + s.rect.height <= n.rect.y + 4) {
        emit('icon-tile-stack', n, { tile: s.target, bounds: s.rect, iconWidth: s.iconWidth, title: n.text.slice(0, 60) },
          'A framed icon tile sits above this heading. Review whether repeated decoration competes with the task; keep useful object identity.');
      }
    }
    // Functional light belongs to state review. It does not exempt structure.
    if (n.focus || n.selection) continue;
    const effectiveBackground = n.background.slice(0, 3).map((v, i) => v * n.background[3] + n.surface[i] * (1 - n.background[3])).concat(1);
    const dark = luminance(effectiveBackground) < .1;
    for (const s of n.shadows) {
      const [r, g, b, a] = s.color;
      const extent = s.blur / 2 + s.spread;
      const area = n.rect.width * n.rect.height;
      const litArea = (n.rect.width + 2 * extent) * (n.rect.height + 2 * extent) - area;
      if (s.inset || chroma(s.color) < 30 || s.blur <= 4 || s.blur * a * n.opacity < 3 || extent <= 0 || litArea > area * 2) continue;
      const lift = .5 * a * n.opacity * Math.max(Math.abs(r - n.surface[0]), Math.abs(g - n.surface[1]), Math.abs(b - n.surface[2]));
      if (lift < 20 || (s.x !== 0 || s.y !== 0) && !dark) continue;
      emit('dark-glow', n, { shadow: s, surface: n.surface, opacity: n.opacity, lift },
        'Chromatic shadow reads as light around this surface. Review its purpose against the approved identity; neutral elevation and small state indicators are excluded.');
      break;
    }
    for (const g of n.gradients) {
      if (g.repeating || g.stops.length < 2 || g.stops.at(-1).color[3] > .05) continue;
      const first = g.stops[0].color;
      if (dark && first[3] >= .7 && chroma(first) >= 24 && !g.stops.some(s => s.px !== null && Math.abs(s.px) <= 24)) {
        emit('radial-halo', n, { gradient: g.value, stops: g.stops, surface: n.surface },
          'Saturated radial colour fades into a dark surface. Check that this halo expresses an approved theme or state rather than adding ambient emphasis.');
      }
      const painted = g.stops.filter(s => s.color[3] > .05);
      if (n.rect.width >= 240 && n.rect.height >= 160 && painted.length >= 1 && painted.length <= 2
        && painted.every(s => s.color[3] < .45) && painted.some(s => chroma(s.color) >= 24)) {
        emit('radial-spotlight-glow', n, { gradient: g.value, stops: g.stops, bounds: n.rect },
          'A broad translucent radial spotlight adds emphasis to this section. Review against the reference and retain intentional theme treatments.');
      }
    }
  }
  for (const [target, children] of panels) {
    emit('nested-cards', targets.get(target), { outer: target, children },
      'Framed surfaces contain other framed surfaces. Review whether spacing or a divider would convey the same grouping with less visual weight; retain useful boundaries.');
  }
  return { findings, waived, gaps };
}

/** Capture measurements in an existing page; this helper never launches a browser. */
export function designTargets(root = 'body') {
    const host = document.querySelector(root);
    if (!host) throw new Error('Design inspector root missing');
    const elements = [host, ...host.querySelectorAll('*')];
    const targets = new Map(elements.map(e => {
      const parts = [];
      for (let p = e; p; p = p.parentElement) {
        parts.unshift(`${p.localName}:nth-child(${Array.from(p.parentElement?.children ?? [p]).indexOf(p) + 1})`);
      }
      return [e, parts.join(' > ')];
    }));
    const gaps = [];
    for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) {
      if (!link.disabled && (!link.media || matchMedia(link.media).matches) && !link.sheet) gaps.push(`Stylesheet not loaded: ${link.getAttribute('href')}`);
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Colour normalization unavailable');
    const rgba = value => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const split = value => {
      let depth = 0, start = 0; const pieces = [];
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        if (value[i] === ')') depth--;
        if (!depth && value[i] === ',') { pieces.push(value.slice(start, i).trim()); start = i + 1; }
      }
      pieces.push(value.slice(start).trim()); return pieces;
    };
    // Computed CSS colour syntax includes modern colour spaces; canvas resolves
    // supported colours to sRGB, avoiding a second colour implementation in jig.
    const colorText = value => {
      const match = /(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb|color)\(/i.exec(value);
      if (!match) return value.match(/#[\da-f]{3,8}\b|\btransparent\b/i)?.[0];
      let depth = 0;
      for (let i = match.index; i < value.length; i++) {
        if (value[i] === '(') depth++;
        if (value[i] === ')' && --depth === 0) return value.slice(match.index, i + 1);
      }
    };
    const paint = (e, pseudo = null) => {
      const style = getComputedStyle(e, pseudo), target = targets.get(e) + (pseudo ?? '');
      const shadows = [];
      for (const property of ['box-shadow', 'text-shadow']) {
        const value = style.getPropertyValue(property);
        if (!value || value === 'none') continue;
        for (const layer of split(value)) {
          const c = colorText(layer);
          if (!c) { gaps.push(`${target}: unparsed ${property}`); continue; }
          const lengths = [...layer.replace(c, '').matchAll(/(-?[\d.]+)px\b/g)].map(m => Number(m[1]));
          if (lengths.length < 2) { gaps.push(`${target}: unparsed shadow lengths`); continue; }
          const [x, y, blur = 0, spread = 0] = lengths;
          shadows.push({ property, x, y, blur, spread, color: rgba(c), inset: /\binset\b/.test(layer) });
        }
      }
      const gradients = [];
      if (style.backgroundImage !== 'none') {
        for (const layer of split(style.backgroundImage)) {
          if (!/^(?:repeating-)?radial-gradient\(/i.test(layer)) {
            gaps.push(`${target}: non-radial background image not modeled as a ground`); continue;
          }
          const stops = [];
          for (const part of split(layer.slice(layer.indexOf('(') + 1, -1))) {
            const c = colorText(part);
            if (!c) continue; // shape / position prelude
            const px = part.replace(c, '').match(/(-?[\d.]+)px\b/);
            stops.push({ color: rgba(c), px: px ? Number(px[1]) : null });
          }
          if (stops.length < 2) gaps.push(`${target}: unparsed radial stops`);
          else gradients.push({ value: layer, repeating: layer.startsWith('repeating-'), stops });
        }
      }
      return { style, background: rgba(style.backgroundColor), shadows, gradients };
    };
    const ground = (e, own = false) => {
      const layers = [];
      for (let p = own ? e : e.parentElement; p; p = p.parentElement) layers.push(rgba(getComputedStyle(p).backgroundColor));
      let result = [255, 255, 255, 1];
      for (const c of layers.reverse()) result = c.slice(0, 3).map((n, i) => n * c[3] + result[i] * (1 - c[3])).concat(1);
      return result;
    };
    const nodes = [];
    for (const e of elements) {
      const p = paint(e), s = p.style, r = e.getBoundingClientRect();
      let opacity = 1, hidden = false;
      for (let a = e; a; a = a.parentElement) {
        const st = getComputedStyle(a); opacity *= Number(st.opacity);
        hidden ||= st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse' || st.contentVisibility === 'hidden';
      }
      const rect = { x: r.x, y: r.y, width: r.width, height: r.height };
      const icon = e.querySelector('svg, i[data-lucide], i[class*="fa-"], i[class*="icon"]');
      const border = Math.min(...['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(s[`border${side}Width`]) || 0));
      const rawRadius = parseFloat(s.borderTopLeftRadius) || 0;
      const node = { target: targets.get(e), parent: targets.get(e.parentElement) ?? null, previous: targets.get(e.previousElementSibling) ?? null,
        tag: e.localName, role: e.getAttribute('role') ?? '', text: e.textContent.trim().slice(0, 240), rect,
        background: p.background, surface: ground(e), border, radius: s.borderTopLeftRadius.includes('%') ? r.width * rawRadius / 100 : rawRadius,
        shadows: p.shadows, gradients: p.gradients, opacity, hidden, position: s.position,
        icon: Boolean(icon) || !e.children.length && /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\s]+$/u.test(e.textContent.trim()),
        iconWidth: icon?.getBoundingClientRect().width ?? 0,
        cardTitle: e.hasAttribute('data-card-title'), frame: e.hasAttribute('data-design-frame'),
        focus: e.matches(':focus-visible') || e.getAttribute('data-design-purpose') === 'focus',
        selection: e.getAttribute('aria-selected') === 'true' || e.getAttribute('data-design-purpose') === 'selection' };
      nodes.push(node);
      if (e.shadowRoot) gaps.push(`${node.target}: shadow DOM not traversed`);
      if (e.localName === 'iframe') gaps.push(`${node.target}: iframe content not traversed`);
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(e, pseudo);
        if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
        const pp = paint(e, pseudo);
        const w = parseFloat(ps.width), h = parseFloat(ps.height);
        if (!Number.isFinite(w) || !Number.isFinite(h)) { gaps.push(`${node.target}${pseudo}: pseudo-element bounds unresolved`); continue; }
        nodes.push({ ...node, target: node.target + pseudo, parent: node.target, previous: null, tag: 'pseudo', role: '', text: '',
          rect: { ...rect, width: w, height: h }, border: 0, radius: 0, background: pp.background, surface: ground(e, true),
          shadows: pp.shadows, gradients: pp.gradients, opacity: opacity * Number(ps.opacity), icon: false, cardTitle: false });
      }
    }
    return { schemaVersion: 1, nodes, gaps };
}

export async function captureDesign(page, root = 'body') {
  return page.evaluate(designTargets, root);
}

export async function inspectDesign(page, { root = 'body', ...options } = {}) {
  return analyzeDesign(await captureDesign(page, root), options);
}

// Keep aesthetic warnings advisory while making execution errors visible.
export async function inspectGateDesign(page, options) {
  const result=await inspectDesign(page,options);
  return {findings:[],gaps:[],warnings:result.findings,waived:result.waived,coverageGaps:result.gaps};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [file, config, ...extra] = process.argv.slice(2);
    if (!file || extra.length) throw new Error('Usage: node scripts/design-inspector.mjs SNAPSHOT.json [EXCEPTIONS.json]');
    const report = analyzeDesign(JSON.parse(readFileSync(file, 'utf8')), config ? JSON.parse(readFileSync(config, 'utf8')) : {});
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gaps.length ? 2 : 0; // Warnings never fail a gate.
  } catch (error) { console.log(JSON.stringify({ findings: [], waived: [], gaps: [error.message] })); process.exitCode = 2; }
}
