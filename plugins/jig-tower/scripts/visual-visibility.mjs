import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual } from './visual-clip.mjs';
import { decodePNG, encodePNG } from './visual-pixels.mjs';

// WCAG 1.4.3: 4.5 normal text, 3 large text; 1.4.11: 3 graphics.
// This rendered-pixel probe also checks logos; disabled text is recorded exempt.
// It is a visibility quality gate, not a WCAG conformance determination:
// antialiasing and multi-colour artwork still require rubric review.
const luminance = rgb => rgb.slice(0, 3).reduce((sum, byte, i) => {
  const c = byte / 255;
  return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
}, 0);

export function measureInk(ink, ground, threshold = 4.5) {
  if (ink.width !== ground.width || ink.height !== ground.height) throw new Error('Capture dimensions changed');
  const ratios = new Map(), cache = new Map(); let inkPixels = 0;
  const light = (pixels, i) => {
    const key = pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
    if (!cache.has(key)) cache.set(key, luminance([pixels[i], pixels[i + 1], pixels[i + 2]]));
    return cache.get(key);
  };
  for (let i = 0; i < ink.pixels.length; i += 4) {
    // Ignore sub-byte noise; do not round ratios at the threshold.
    if (Math.abs(ink.pixels[i] - ground.pixels[i]) <= 1 && Math.abs(ink.pixels[i + 1] - ground.pixels[i + 1]) <= 1 && Math.abs(ink.pixels[i + 2] - ground.pixels[i + 2]) <= 1) continue;
    const a = light(ink.pixels, i), b = light(ground.pixels, i);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    ratios.set(ratio, (ratios.get(ratio) || 0) + 1); inkPixels++;
  }
  // Core ink rather than antialiased edge pixels. A few bright pixels cannot
  // rescue a mostly invisible mark; mixed-colour detail remains a review gap.
  let contrastRatio = 1, count = 0;
  const rank = Math.floor((inkPixels - 1) * .9);
  for (const [ratio, frequency] of [...ratios].sort(([a], [b]) => a - b)) {
    count += frequency;
    if (count > rank) { contrastRatio = ratio; break; }
  }
  return { contrastRatio, threshold, inkPixels,
    kind: !inkPixels ? 'empty-content' : contrastRatio < threshold ? 'near-invisible' : null };
}

// Optical bounds come from the changed pixels, never from a glyph's CSS box.
export function inkBounds(ink, ground, scale = 1) {
  if (ink.width !== ground.width || ink.height !== ground.height) throw new Error('Capture dimensions changed');
  let left = ink.width, top = ink.height, right = -1, bottom = -1;
  for (let y = 0; y < ink.height; y++) for (let x = 0; x < ink.width; x++) {
    const i = (y * ink.width + x) * 4;
    if (Math.abs(ink.pixels[i] - ground.pixels[i]) <= 1 && Math.abs(ink.pixels[i + 1] - ground.pixels[i + 1]) <= 1 && Math.abs(ink.pixels[i + 2] - ground.pixels[i + 2]) <= 1) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { left: left / scale, top: top / scale, right: (right + 1) / scale, bottom: (bottom + 1) / scale };
}

// Runs in the browser; inspect direct text once and whole graphical objects,
// never each SVG path or decorative ancestor containing the same text again.
export function visibilityTargets(selector) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const targets = [], gaps = [], scrolledOut = [];
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  for (const e of elements) {
    const s = getComputedStyle(e), b = e.getBoundingClientRect();
    if (!b.width || !b.height || s.visibility !== 'visible' || s.display === 'none' || e.closest('[hidden]')) continue;
    if (e.shadowRoot || e.matches('iframe')) gaps.push(`${e.localName}: shadow/frame content not inspected`);
    if (e.closest('svg') && e.localName !== 'svg') continue;
    if (e.matches('script,style,noscript,option,select') || e.localName === 'input' && !['text','search','email','url','tel','password'].includes(e.type)) continue;
    const graphic = e.matches('img,svg,canvas') || s.backgroundImage !== 'none';
    const text = [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) || e.matches('input:not([type=hidden]),textarea') && Boolean(e.value || e.placeholder);
    if (!graphic && !text) continue;
    const path = node => node.id ? `#${CSS.escape(node.id)}` : node.parentElement ? `${path(node.parentElement)} > ${node.localName}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})` : node.localName;
    const element = path(e);
    // Partially clipped ink is unsuitable for both visibility and optical
    // measurements. It remains reachable by scrolling its owning container.
    let scrolled = false;
    for (let a = e.parentElement; a; a = a.parentElement) {
      const as = getComputedStyle(a), ar = a.getBoundingClientRect();
      const left = ar.left + a.clientLeft, top = ar.top + a.clientTop;
      if (/^(auto|scroll)$/.test(as.overflowX) && (b.left < left - 1 || b.right > left + a.clientWidth + 1) ||
          /^(auto|scroll)$/.test(as.overflowY) && (b.top < top - 1 || b.bottom > top + a.clientHeight + 1)) { scrolled = true; break; }
    }
    if (scrolled) { scrolledOut.push(element); continue; }
    const disabled = text && Boolean(e.closest(':disabled,[aria-disabled=true],[data-state=disabled]')) && !e.closest('[aria-busy=true],[data-state=loading]');
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    if (e.matches('img,canvas') && (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || ['Top','Right','Bottom','Left'].some(side => parseFloat(s[`border${side}Width`]) > 0))) {
      gaps.push(`${element}: image/canvas box paint may mask invisible content; review its ground separately`);
    }
    for (const type of [...(graphic ? ['graphic'] : []), ...(text && !e.matches('img,svg,canvas') ? ['text'] : [])]) {
      const control = e.closest('button,[role=button],[data-optical-center]'), cb = control?.getBoundingClientRect();
      const cs = control && getComputedStyle(control);
      targets.push({ element, index: elements.indexOf(e), type, disabled: Boolean(disabled && type === 'text'), threshold: type === 'graphic' ? 3 : size >= 24 || bold && size >= 14 * 96 / 72 ? 3 : 4.5,
        control: cb ? { element: control.id ? `#${CSS.escape(control.id)}` : null, index: elements.indexOf(control), centerY: cb.y + cb.height / 2, centerX: cb.x + cb.width / 2,
          centered: cs.alignItems === 'center' || control.hasAttribute('data-optical-center'),
          centeredX: cs.justifyContent === 'center' || cs.textAlign === 'center' || control.hasAttribute('data-optical-center') } : null,
        backgroundImage: s.backgroundImage !== 'none', rect: { x: b.x, y: b.y, width: b.width, height: b.height } });
    }
  }
  return { targets, gaps, scrolledOut };
}

// Independent targets share one mask capture. Intersecting boxes go into
// different batches so hiding one target cannot erase another target's ground.
export function visibilityBatches(targets) {
  const batches = [];
  const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const target of targets) {
    let batch = batches.find(items => items.every(item => !intersects(item.rect, target.rect)));
    if (!batch) batches.push(batch = []);
    batch.push(target);
  }
  return batches;
}

export function cropRaster(image, rect, scale) {
  const x = Math.max(0, Math.floor(rect.x * scale)), y = Math.max(0, Math.floor(rect.y * scale));
  const width = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale)) - x;
  const height = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale)) - y;
  if (width <= 0 || height <= 0) throw new Error('Empty ink crop');
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.pixels.copy(pixels, row * width * 4,
    ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return { width, height, pixels };
}

// Restores below read the attribute first: after a CSSOM write Chrome syncs style lazily and would re-create an empty style="" after removal.
export async function inspectVisibilityBatched(page, selector = 'body', { scale = 1, out } = {}) {
  const { targets, gaps, scrolledOut = [] } = await page.evaluate(visibilityTargets, selector);
  const notes = scrolledOut.length ? [`scrolled out of view: ${scrolledOut.length} elements`] : [];
  const viewport = page.viewportSize(), findings = [], measurements = [];
  const visible = targets.filter(t => {
    const r = t.rect;
    if (r.x < 0 || r.y < 0 || r.x + r.width > viewport.width || r.y + r.height > viewport.height) {
      gaps.push(`${t.element}: outside viewport; reach this content in a named state`); return false;
    }
    return true;
  });
  if (!visible.length) return { findings, measurements, gaps, notes, scrolledOut, elements: targets.length, captures: 0 };
  // Capture only the union of reachable ink, rather than decoding an entire
  // viewport for a one-button state. Integer CSS origins preserve crop maths.
  const x = Math.floor(Math.min(...visible.map(t => t.rect.x))), y = Math.floor(Math.min(...visible.map(t => t.rect.y)));
  const clip = { x, y, width: Math.ceil(Math.max(...visible.map(t => t.rect.x + t.rect.width))) - x,
    height: Math.ceil(Math.max(...visible.map(t => t.rect.y + t.rect.height))) - y };
  const capture = () => page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  const ink = decodePNG(await capture());
  const batches = visibilityBatches(visible);
  for (const batch of batches) {
    let originals;
    try {
      originals = await page.evaluate(({ selector, batch }) => {
        const root = document.querySelector(selector), all = [root, ...root.querySelectorAll('*')], saved = new Map();
        const save = e => { if (!saved.has(e)) saved.set(e, { index: all.indexOf(e), style: e.getAttribute('style') }); };
        // Read every descendant colour before any parent mask changes inheritance.
        const entries = batch.map(target => {
          const e = all[target.index]; save(e);
          const children = e.localName === 'svg' ? [...e.querySelectorAll('*')] : target.type === 'text' ? [...e.children] : [];
          return { target, e, children: children.map(c => {
            save(c); const s = getComputedStyle(c);
            return { c, color: s.color, fill: s.webkitTextFillColor, shadow: s.textShadow };
          }) };
        });
        try {
          for (const { target, e, children } of entries) {
            if (target.type === 'text') {
              for (const { c, color, fill, shadow } of children) {
                c.style.setProperty('color', color, 'important'); c.style.setProperty('-webkit-text-fill-color', fill, 'important'); c.style.setProperty('text-shadow', shadow, 'important');
              }
              for (const p of ['color', '-webkit-text-fill-color']) e.style.setProperty(p, 'transparent', 'important');
              e.style.setProperty('text-shadow', 'none', 'important');
            } else if (target.backgroundImage) e.style.setProperty('background-image', 'none', 'important');
            else if (e.localName === 'svg') for (const { c } of children) c.style.setProperty('visibility', 'hidden', 'important');
            else e.style.setProperty('visibility', 'hidden', 'important');
          }
          return [...saved.values()];
        } catch (error) {
          for (const [e, { style }] of saved) style === null ? (e.getAttribute('style'), e.removeAttribute('style')) : e.setAttribute('style', style);
          throw error;
        }
      }, { selector, batch });
      const ground = decodePNG(await capture());
      for (const target of batch) {
        const local = { ...target.rect, x: target.rect.x - x, y: target.rect.y - y };
        const inkCrop = cropRaster(ink, local, scale), groundCrop = cropRaster(ground, local, scale);
        const bounds = inkBounds(inkCrop, groundCrop, scale);
        // Crop starts at a device-pixel boundary; optical bounds are local to
        // the original CSS box, including its fractional offset.
        if (bounds) {
          const dx = Math.floor(target.rect.x * scale) / scale - target.rect.x;
          const dy = Math.floor(target.rect.y * scale) / scale - target.rect.y;
          bounds.left += dx; bounds.right += dx; bounds.top += dy; bounds.bottom += dy;
        }
        const result = { ...target, ...measureInk(inkCrop, groundCrop, target.threshold), inkBox: bounds };
        if (target.disabled) { result.kind = null; result.contrastStatus = 'disabled, exempt'; }
        measurements.push(result);
        if (result.kind) {
          findings.push(result);
          if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, `visibility-${target.index}-${target.type}.png`), encodePNG(inkCrop)); }
        }
      }
    } catch (error) { gaps.push(`Visibility batch: ${error.message}`); }
    finally {
      if (originals) await page.evaluate(({ selector, originals }) => {
        const root = document.querySelector(selector), all = [root, ...root.querySelectorAll('*')];
        for (const { index, style } of originals) {
          if (!all[index]) throw new Error('Visibility target disappeared during mask');
          style === null ? (all[index].getAttribute('style'), all[index].removeAttribute('style')) : all[index].setAttribute('style', style);
        }
      }, { selector, originals });
    }
  }
  return { findings, measurements, gaps, notes, scrolledOut, elements: targets.length, captures: 1 + batches.length };
}

export async function inspectVisibility(page, selector = 'body', { out, prefix = 'visibility', scale = 1 } = {}) {
  const { targets, gaps, scrolledOut = [] } = await page.evaluate(visibilityTargets, selector);
  const findings = [], measurements = [];
  for (const target of targets) {
    const handle = await page.evaluateHandle(({ selector, index }) => {
      const root = document.querySelector(selector);
      return [root, ...root.querySelectorAll('*')][index];
    }, { selector, index: target.index });
    let originalStyle, childStyles, changed = false;
    try {
      const box = await handle.asElement().boundingBox();
      const viewport = page.viewportSize();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) {
        gaps.push(`${target.element}: outside viewport; reach this content in a named state`); continue;
      }
      const capture = () => page.screenshot({ clip: box, animations: 'disabled', caret: 'hide' });
      const ink = await capture();
      originalStyle = await handle.evaluate(e => e.getAttribute('style'));
      childStyles = await handle.evaluate((e, type) => {
        const children = e.localName === 'svg' ? [...e.querySelectorAll('*')] : type === 'text' ? [...e.children] : [];
        return children.map(c => { const s = getComputedStyle(c); return { style: c.getAttribute('style'), color: s.color, textFill: s.webkitTextFillColor, textShadow: s.textShadow }; });
      }, target.type);
      changed = true;
      await handle.evaluate((e, target) => {
        if (target.type === 'text') {
          // Preserve nested ink: this target owns direct text only. Otherwise
          // hiding a button's colour also hides its currentColor SVG icon.
          for (const c of e.children) {
            const s = getComputedStyle(c), color = s.color, fill = s.webkitTextFillColor, shadow = s.textShadow;
            c.style.setProperty('color', color, 'important'); c.style.setProperty('-webkit-text-fill-color', fill, 'important'); c.style.setProperty('text-shadow', shadow, 'important');
          }
          for (const property of ['color', '-webkit-text-fill-color']) e.style.setProperty(property, 'transparent', 'important');
          e.style.setProperty('text-shadow', 'none', 'important');
        } else if (target.backgroundImage) e.style.setProperty('background-image', 'none', 'important');
        else if (e.localName === 'svg') for (const child of e.querySelectorAll('*')) child.style.setProperty('visibility', 'hidden', 'important');
        else e.style.setProperty('visibility', 'hidden', 'important');
      }, target);
      const ground = await capture();
      const inkImage = decodePNG(ink), groundImage = decodePNG(ground);
      const result = { ...target, ...measureInk(inkImage, groundImage, target.threshold), inkBox: inkBounds(inkImage, groundImage, scale) };
      if (target.disabled) { result.kind = null; result.contrastStatus = 'disabled, exempt'; }
      measurements.push(result);
      if (result.kind) findings.push(result);
      if (out && result.kind) {
        mkdirSync(out, { recursive: true });
        result.screenshot = join(out, `${prefix}-${target.index}-${target.type}.png`);
        writeFileSync(result.screenshot, ink);
      }
    } catch (error) { gaps.push(`${target.element}: ${error.message}`); }
    finally {
      if (changed) await handle.evaluate((e, style) => style === null ? (e.getAttribute('style'), e.removeAttribute('style')) : e.setAttribute('style', style), originalStyle);
      if (childStyles?.length) await handle.evaluate((e, { styles, type }) => {
        const children = e.localName === 'svg' ? [...e.querySelectorAll('*')] : type === 'text' ? [...e.children] : [];
        children.forEach((c, i) => styles[i].style === null ? (c.getAttribute('style'), c.removeAttribute('style')) : c.setAttribute('style', styles[i].style));
      }, { styles: childStyles, type: target.type });
      await handle.dispose();
    }
  }
  return { findings, measurements, elements: targets.length, gaps, scrolledOut,
    notes: scrolledOut.length ? [`scrolled out of view: ${scrolledOut.length} elements`] : [] };
}

export async function runVisibility(options) {
  return runVisual({ ...options, png: false }, 'visibility', (page, scoped, run) => inspectVisibility(page, scoped.root,
    { out: options.out, prefix: `visibility-${run.viewport.width}x${run.viewport.height}-${encodeURIComponent(run.state)}` }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runVisibility);
