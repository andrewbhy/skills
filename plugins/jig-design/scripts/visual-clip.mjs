import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { acquireBrowserSlot, checkMemory, readBrowserConfig, ResourceGuardError } from './resource-guard.mjs';

// Shared by the visual helpers; resolve from the caller's project too.
export async function launchChrome({ root = process.cwd(), guard = { readBrowserConfig, checkMemory, acquireBrowserSlot }, launch = launchUnguardedChrome } = {}) {
  if (process.env.JIG_NO_BROWSER === '1') throw new Error('Browser disabled: JIG_NO_BROWSER=1');
  const config = guard.readBrowserConfig(root);
  guard.checkMemory(config);
  const release = await guard.acquireBrowserSlot(config);
  try {
    guard.checkMemory(config);
    const browser = await launch();
    browser.once('disconnected', release);
    return browser;
  } catch (error) { release(); throw error; }
}

async function launchUnguardedChrome() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch {
    const require = createRequire(join(process.cwd(), 'package.json'));
    ({ chromium } = require('playwright-core'));
  }
  const candidates = [process.env.CHROME_PATH];
  if (!process.env.CHROME_PATH) {
    if (process.platform === 'win32') {
      for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
        if (base) for (const app of ['Google/Chrome', 'Chromium']) candidates.push(join(base, app, 'Application/chrome.exe'));
      }
    } else if (process.platform === 'darwin') {
      for (const base of ['/Applications', join(homedir(), 'Applications')]) {
        for (const app of ['Google Chrome', 'Chromium']) candidates.push(join(base, `${app}.app`, 'Contents/MacOS', app));
      }
    } else candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  const executablePath = candidates.find(p => p && existsSync(p));
  if (!executablePath) throw new Error('Chrome/Chromium unavailable; set CHROME_PATH to its executable');
  return chromium.launch({ executablePath, headless: true });
}

export function argumentsFor(argv, motion = false) {
  const options = { root: 'body', sizes: '1280x800', out: join(tmpdir(), 'jig-scratch', `visual-${process.pid}-${Date.now()}`), png: false, 'settle-ms': '400', 'timeout-ms': '10000', duration: '2000', threshold: '2' };
  const allowed = ['url', 'root', 'sizes', 'out', 'setup', 'states', 'settle-ms', 'timeout-ms', ...(motion ? ['duration', 'threshold', 'frame-ms'] : [])];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].slice(2);
    if (argv[i] === '--png' || argv[i] === '--sheet') { options[name] = true; continue; }
    if (!argv[i].startsWith('--') || !allowed.includes(name) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Usage: --url URL [--root CSS] [--sizes 1280x800,560x800] [--out DIR] [--setup MODULE] [--states NAME,...] [--png] [--sheet]');
    }
    options[name] = argv[++i];
  }
  if (!options.url || !['http:', 'https:', 'file:'].includes(new URL(options.url).protocol)) throw new Error('An http(s) or file URL is required');
  if (options.states !== undefined) {
    options.states = options.states.split(',').map(s => s.trim());
    if (options.states.some(s => !s)) throw new Error('states must be nonempty comma-separated names');
    if (!options.setup) throw new Error('--states requires a --setup module exporting states(page)');
  }
  options.sizes = options.sizes.split(',').map(size => {
    if (!/^\d+x\d+$/.test(size)) throw new Error('Sizes must be WIDTHxHEIGHT, separated by commas');
    const [width, height] = size.split('x').map(Number);
    if (width < 1 || height < 1 || width > 10000 || height > 10000) throw new Error('Viewport dimensions must be 1..10000');
    return { width, height };
  });
  for (const key of ['settle-ms', 'timeout-ms', 'duration', 'threshold', 'frame-ms']) {
    if (options[key] !== undefined && (!Number.isFinite(Number(options[key])) || Number(options[key]) <= 0)) throw new Error(`${key} must be positive`);
    if (options[key] !== undefined) options[key] = Number(options[key]);
  }
  return options;
}

export async function openPage(browser, options, viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(options['timeout-ms']);
  const gaps = [];
  page.on('pageerror', error => gaps.push(`Page error: ${error.message}`));
  page.on('requestfailed', request => gaps.push(`Request failed: ${new URL(request.url()).pathname}`));
  page.on('response', response => { if (response.status() >= 400) gaps.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
  try {
    await page.goto(options.url, { waitUntil: 'load' });
    if (options.setup) {
      const setup = await import(pathToFileURL(resolve(options.setup)).href);
      await setup.default(page);
    }
    await page.locator(options.root).first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    return { page, gaps };
  } catch (error) {
    gaps.push(error.message);
    return { page, gaps }; // Preserve the failed state for a screenshot too.
  }
}

export async function settled(page, options) {
  // A quiet geometry/content window, rather than networkidle (live sockets persist).
  const deadline = Date.now() + options['timeout-ms'];
  let previous, since = Date.now();
  while (Date.now() < deadline) {
    const state = await page.evaluate(selector => {
      const root = document.querySelector(selector);
      if (!root) throw new Error('Root disappeared');
      return { ready: document.fonts.status === 'loaded' && [...root.querySelectorAll('img')].every(i => i.complete), signature: JSON.stringify([
        ...[root, ...root.querySelectorAll('*')].map(e => {
          const b = e.getBoundingClientRect();
          return [b.x, b.y, b.width, b.height, e.scrollWidth, e.scrollHeight,
            [...e.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(''), e.getAttribute('style')];
        })]) };
    }, options.root);
    if (!state.ready || state.signature !== previous) { previous = state.signature; since = Date.now(); }
    else if (Date.now() - since >= options['settle-ms']) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// Runs inside the browser. Range rectangles describe text even when its box fits.
export function inspectClip(selector) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const findings = [], gaps = []; let ignoredNativeControls = 0;
  const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const name = e => {
    if (e.id) return `#${CSS.escape(e.id)}`;
    const parts = [];
    for (let a = e; a; a = a.parentElement) {
      if (a.id) { parts.unshift(`#${CSS.escape(a.id)}`); break; }
      parts.unshift(`${a.localName}:nth-child(${[...a.parentElement?.children ?? [a]].indexOf(a) + 1})`);
    }
    return parts.join(' > ');
  };
  const visible = e => {
    const s = getComputedStyle(e);
    return s.visibility === 'visible' && e.getClientRects().length > 0 && !e.closest('[hidden]');
  };
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow the selector');
  for (const e of elements) {
    if (e.shadowRoot || e.localName === 'iframe' || e.localName === 'canvas') gaps.push(`${name(e)}: shadow/frame/canvas pixels not inspected`);
    const s = getComputedStyle(e);
    if (s.clipPath !== 'none' || s.writingMode !== 'horizontal-tb' || s.transform.startsWith('matrix3d')) gaps.push(`${name(e)}: unsupported clip-path, writing mode or 3D transform`);
    if (s.transform.startsWith('matrix(')) {
      const matrix = s.transform.slice(7, -1).split(',').map(Number);
      if (matrix[1] || matrix[2]) gaps.push(`${name(e)}: rotated/skewed bounds are approximate`);
    }
  }
  const cut = (rect, bounds, x = true, y = true) => {
    const edges = [];
    if (x && rect.left < bounds.left - 1) edges.push('left');
    if (x && rect.right > bounds.right + 1) edges.push('right');
    if (y && rect.top < bounds.top - 1) edges.push('top');
    if (y && rect.bottom > bounds.bottom + 1) edges.push('bottom');
    return edges;
  };
  const inner = e => {
    const b = e.getBoundingClientRect();
    if (getComputedStyle(e).display === 'inline') return box(b);
    const sx = e.offsetWidth ? b.width / e.offsetWidth : 1, sy = e.offsetHeight ? b.height / e.offsetHeight : 1;
    return { left: b.left + e.clientLeft * sx, top: b.top + e.clientTop * sy,
      right: b.left + (e.clientLeft + e.clientWidth) * sx, bottom: b.top + (e.clientTop + e.clientHeight) * sy };
  };
  const clips = (e, rect) => {
    const result = [];
    let fragment = box(rect);
    for (let a = e; a; a = a.parentElement) {
      const s = getComputedStyle(a), x = /^(hidden|clip)$/.test(s.overflowX), y = /^(hidden|clip)$/.test(s.overflowY);
      const scrollX = /^(auto|scroll)$/.test(s.overflowX), scrollY = /^(auto|scroll)$/.test(s.overflowY);
      if ((!x && !y && !scrollX && !scrollY) || /^(inline|contents)$/.test(s.display)) continue;
      if (s.overflowClipMargin !== '0px') gaps.push(`${name(a)}: overflow-clip-margin not modelled`);
      const bounds = inner(a), edges = cut(fragment, bounds, x, y);
      if (edges.length) result.push({ ancestor: name(a), edges, bounds });
      // Text hidden by an intervening scroller cannot be cut again by outer boxes.
      if (x || scrollX) { fragment.left = Math.max(fragment.left, bounds.left); fragment.right = Math.min(fragment.right, bounds.right); }
      if (y || scrollY) { fragment.top = Math.max(fragment.top, bounds.top); fragment.bottom = Math.min(fragment.bottom, bounds.bottom); }
      if (fragment.right <= fragment.left || fragment.bottom <= fragment.top) break;
    }
    return result;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const e = node.parentElement;
    if (!node.textContent.trim() || !visible(e) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(e.tagName)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    // Each rectangle is a rendered line fragment (including bidi fragments).
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      const clipping = clips(e, rect);
      if (clipping.length) findings.push({ kind: 'text-clipped', element: name(e), text: node.textContent.trim(), rect: box(rect), clipping });
      const control = e.closest('button,a[href],[role="button"],label');
      if (control && root.contains(control)) {
        const bounds = inner(control), edges = cut(rect, bounds);
        if (edges.length) findings.push({ kind: 'control-label', element: name(control), text: node.textContent.trim(), rect: box(rect), bounds, edges });
      }
    }
  }
  for (const e of elements) {
    if (e.hasAttribute('data-visual-must-visible')) {
      const rect = box(e.getBoundingClientRect());
      const edges = cut(rect, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
      if (edges.length || !visible(e)) findings.push({ kind: 'must-visible', element: name(e), rect, edges, hidden: !visible(e) });
    }
    if (!visible(e) || !e.matches('input,select,textarea')) continue;
    if (e.localName === 'input' && !['text','search','email','url','tel','password'].includes(e.type)) { ignoredNativeControls++; continue; }
    const text = e.tagName === 'SELECT' ? e.selectedOptions[0]?.textContent : e.value || e.placeholder;
    if (!text) continue;
    const s = getComputedStyle(e), bounds = inner(e);
    const width = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    const height = e.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    // Detached mirror measures wrapping and font metrics without changing the app.
    const mirror = document.createElement('div');
    Object.assign(mirror.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`,
      font: s.font, letterSpacing: s.letterSpacing, textTransform: s.textTransform,
      whiteSpace: e.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre', overflowWrap: s.overflowWrap, lineHeight: s.lineHeight });
    mirror.textContent = e.type === 'password' ? '•'.repeat(text.length) : text;
    document.body.append(mirror);
    const r = document.createRange(); r.selectNodeContents(mirror);
    const rects = [...r.getClientRects()], base = mirror.getBoundingClientRect();
    const neededWidth = Math.max(0, ...rects.map(r => r.right - base.left));
    const neededHeight = Math.max(0, ...rects.map(r => r.bottom - base.top));
    mirror.remove();
    if (neededWidth > width + 1 || neededHeight > height + 1) findings.push({ kind: 'control-label', element: name(e), text: e.type === 'password' ? '[password]' : text,
      bounds, available: { width, height }, needed: { width: neededWidth, height: neededHeight } });
    // Native arrows/pickers are deliberately outside this CSS content check.
  }
  return { findings, gaps: [...new Set(gaps)], elements: elements.length, ignoredNativeControls };
}

export function statusFor(findings, gaps) {
  // Findings survive incomplete sampling; exit 2 takes precedence over exit 1.
  return gaps.length ? 'inconclusive' : findings.length ? 'findings' : 'passed';
}

// Promoted from the coordinator's draft: visible-box intersection and covered
// controls complement inspectClip's text Range measurements. Serializable and
// scoped; no page URL, browser launch, theme or project state is embedded here.
export function scanClip(selector = 'body') {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const findings = [], gaps = [];
  const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  for (const e of elements) {
    if (!e.matches('button,summary,label,select,input,textarea,a,h1,h2,h3,strong,small,span,p,td,th,li')) continue;
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (r.width < 2 || r.height < 2 || s.visibility !== 'visible' || Number(s.opacity) === 0 || !e.getClientRects().length || e.closest('[hidden]')) continue;
    // Ignore intentionally hidden descendants, including opacity on ancestors.
    let invisible = false;
    for (let a = e.parentElement; a; a = a.parentElement) if (Number(getComputedStyle(a).opacity) === 0) invisible = true;
    if (invisible) continue;
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight, by = 'viewport';
    let scrollX = false, scrollY = false;
    const hitBounds = {left:0,top:0,right:innerWidth,bottom:innerHeight};
    for (let a = e.parentElement; a; a = a.parentElement) {
      const style = getComputedStyle(a), q = a.getBoundingClientRect();
      if (/^(inline|contents)$/.test(style.display)) continue;
      const sx = a.offsetWidth ? q.width / a.offsetWidth : 1, sy = a.offsetHeight ? q.height / a.offsetHeight : 1;
      const bounds = { left: q.left + a.clientLeft * sx, top: q.top + a.clientTop * sy,
        right: q.left + (a.clientLeft + a.clientWidth) * sx, bottom: q.top + (a.clientTop + a.clientHeight) * sy };
      // A scroll viewport owns its hidden content. Do not blame an outer clip
      // for fragments that have already scrolled away (runner history 01/02).
      if (!scrollX && /^(hidden|clip)$/.test(style.overflowX)) {
        if (bounds.left > left || bounds.right < right) by = path(a);
        left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
      }
      if (!scrollY && /^(hidden|clip)$/.test(style.overflowY)) {
        if (bounds.top > top || bounds.bottom < bottom) by = path(a);
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
      }
      scrollX ||= /^(auto|scroll)$/.test(style.overflowX);
      scrollY ||= /^(auto|scroll)$/.test(style.overflowY);
      if (/^(auto|scroll)$/.test(style.overflowX)) { hitBounds.left = Math.max(hitBounds.left,bounds.left); hitBounds.right = Math.min(hitBounds.right,bounds.right); }
      if (/^(auto|scroll)$/.test(style.overflowY)) { hitBounds.top = Math.max(hitBounds.top,bounds.top); hitBounds.bottom = Math.min(hitBounds.bottom,bounds.bottom); }
    }
    const visibleWidth = Math.max(0, Math.min(right, r.right) - Math.max(left, r.left));
    const visibleHeight = Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top));
    const edges = [];
    if ((!scrollX || left > 0) && r.left < left - 1) edges.push('left');
    if ((!scrollX || right < innerWidth) && r.right > right + 1) edges.push('right');
    // The document is vertically scrollable; below-fold text is not clipped.
    if (top > 0 && r.top < top - 1) edges.push('top');
    if (bottom < innerHeight && r.bottom > bottom + 1) edges.push('bottom');
    if (visibleWidth && visibleHeight && edges.length) findings.push({ kind: 'box-clipped', element: path(e), ancestor: by, edges, measured: edges, expected: 'unclipped visible box' });
    if (e.matches('button,summary,select,input,textarea,a') && !edges.length && r.left >= hitBounds.left && r.right <= hitBounds.right && r.top >= hitBounds.top && r.bottom <= hitBounds.bottom) {
      const points = [[r.left + Math.min(2, r.width / 2), r.top + r.height / 2], [r.right - Math.min(2, r.width / 2), r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2]];
      const covered = points.filter(([x,y]) => {
        const hit = document.elementFromPoint(x,y);
        return hit && !e.contains(hit) && !hit.contains(e) && !(hit.tagName === 'LABEL' && hit.control === e);
      }).length;
      if (covered) findings.push({ kind: 'control-covered', element: path(e), measured: covered, expected: '0 of 3 sample points covered' });
    }
    // Inline clientWidth is zero by design; inspectClip handles inline glyphs.
    if (s.display !== 'inline' && /^(hidden|clip)$/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis') findings.push({ kind: 'self-clipped', element: path(e), measured: e.scrollWidth, expected: e.clientWidth });
  }
  return { findings, gaps, elements: elements.length };
}

export async function inspectClipping(page, selector = 'body') {
  const text = await page.evaluate(inspectClip, selector);
  try {
    const boxes = await page.evaluate(scanClip, selector);
    return { ...text, findings: [...text.findings, ...boxes.findings], gaps: [...text.gaps, ...boxes.gaps] };
  } catch (error) {
    return { ...text, gaps: [...text.gaps, `Box clip scan: ${error.message}`] };
  }
}

export function saveReport(options, report, filename) {
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, filename), JSON.stringify(report, null, 2) + '\n');
}

export function inspectLayout(selector) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  return elements.flatMap(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (!r.width || !r.height || s.display === 'none' || s.visibility !== 'visible') return [];
    const styles = Object.fromEntries(['display','position','overflowX','overflowY','color','backgroundColor','opacity','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','rowGap','columnGap','transform'].map(key => [key, s[key]]));
    return [{ element: path(e), box: { x: r.x, y: r.y, width: r.width, height: r.height }, styles }];
  });
}

// Checkpoints opt into one labelled sheet; captures remain in memory until the
// single output is written. Never turn a final measurement matrix into a sheet.
export async function saveContactSheet(browser, options, tiles) {
  if (!tiles.length) throw new Error('No states captured for contact sheet');
  if (tiles.length > 60) throw new Error('Contact sheet exceeds 60 states; narrow --states to this batch');
  const page = await browser.newPage({ viewport: { width: 1080, height: 800 } });
  try {
    const columns = tiles.length <= 3 ? 1 : 3;
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#ddd;color:#111;font:13px sans-serif}main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:12px}figure{margin:0;background:white;padding:8px}img{display:block;max-width:100%;max-height:600px;width:auto;height:auto;margin:auto}figcaption{padding:8px 0;overflow-wrap:anywhere;max-height:160px;overflow:hidden}</style><main></main>`);
    await page.evaluate(tiles => {
      for (const tile of tiles) {
        const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
        img.src = tile.src; caption.textContent = tile.label.length > 1800 ? tile.label.slice(0, 1800) + '\n… full details in JSON report' : tile.label;
        caption.style.whiteSpace = 'pre-wrap'; figure.append(caption, img); document.querySelector('main').append(figure);
      }
    }, tiles.map(tile => ({ label: tile.label, src: `data:image/png;base64,${tile.bytes.toString('base64')}` })));
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    mkdirSync(options.out, { recursive: true });
    const file = join(options.out, 'contact-sheet.png');
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } finally { await page.close(); }
}

// Named states are supplied by the project's trusted setup module. Unselected
// states may be traversed to reach a later state, but are never measured/captured.
export async function* selectedStates(page, options) {
  if (!options.states) { yield { name: 'default', root: options.root }; return; }
  const setup = await import(pathToFileURL(resolve(options.setup)).href);
  if (typeof setup.states !== 'function') throw new Error('--setup must export states(page) for --states');
  const pending = new Set(options.states);
  for await (const state of setup.states(page, { states: options.states })) {
    if (!pending.has(state.name)) continue;
    pending.delete(state.name);
    yield { ...state, root: state.root || options.root };
    if (!pending.size) break;
  }
  if (pending.size) throw new Error(`Unknown states: ${[...pending].join(', ')}`);
}

export async function runVisual(options, tool, inspect, { launch = launchChrome } = {}) {
  const report = { tool: `visual-${tool}`, version: 1, node: process.version, root: options.root, runs: [], gaps: [] };
  let browser;
  const tiles = [];
  try {
    browser = await launch(); report.browser = browser.version();
    for (const viewport of options.sizes) {
      let page;
      try {
        const opened = await openPage(browser, options, viewport); page = opened.page;
        if (opened.gaps.length) report.gaps.push(...opened.gaps);
        for await (const state of selectedStates(page, options)) {
          const run = { viewport, state: state.name, findings: [], gaps: [] }; report.runs.push(run);
          const scoped = { ...options, root: state.root };
          try {
            run.settled = await settled(page, scoped);
            if (!run.settled) run.gaps.push('Page did not settle before timeout');
            const measured = await inspect(page, scoped, run);
            Object.assign(run, measured, { gaps: [...run.gaps, ...measured.gaps] });
            run.layout = await page.evaluate(inspectLayout, scoped.root);
          } catch (error) { run.gaps.push(error.message); }
          if (options.png && (run.findings.length || run.gaps.length)) {
            try {
              mkdirSync(options.out, { recursive: true });
              run.screenshot = join(options.out, `${tool}-${viewport.width}x${viewport.height}-${report.runs.length}.png`);
              await page.screenshot({ path: run.screenshot, timeout: options['timeout-ms'] });
            } catch (error) { run.gaps.push(`Screenshot failed: ${error.message}`); }
          }
          if (options.sheet) {
            if (tiles.length >= 60) throw new Error('Contact sheet exceeds 60 states; narrow --states to this batch');
            tiles.push({ label: `${viewport.width}x${viewport.height} / ${state.name}`, bytes: await page.locator(scoped.root).first().screenshot({ timeout: options['timeout-ms'], animations: 'disabled' }) });
          }
          run.status = statusFor(run.findings, run.gaps);
        }
      } catch (error) { report.gaps.push(error.message); }
      finally {
        if (page) await page.close();
      }
    }
    if (options.sheet) report.sheet = await saveContactSheet(browser, options, tiles);
  } catch (error) { report.gaps.push(error.message); if (error instanceof ResourceGuardError) report.skipped = error.message; }
  finally { if (browser) await browser.close(); }
  report.status = statusFor(report.runs.flatMap(r => r.findings), [...report.gaps, ...report.runs.flatMap(r => r.gaps)]);
  saveReport(options, report, `${tool}.json`);
  return report;
}

export async function runClip(options, dependencies) {
  return runVisual(options, 'clip', (page, scoped) => inspectClipping(page, scoped.root), dependencies);
}

export async function cli(run, motion = false) {
  try {
    const report = await run(argumentsFor(process.argv.slice(2), motion));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'inconclusive' ? 2 : report.status === 'findings' ? 1 : 0;
  } catch (error) {
    console.log(JSON.stringify({ status: 'inconclusive', gaps: [error.message] })); process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runClip);
