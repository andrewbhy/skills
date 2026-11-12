import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome, inspectClip, inspectClipping, inspectLayout, settled, statusFor, saveReport, saveContactSheet } from './visual-clip.mjs';
import { inspectSpacing } from './visual-spacing.mjs';
import { SPACING_STEP } from './visual-spacing.mjs';
import { inspectVisibilityBatched } from './visual-visibility.mjs';
import { inspectAlignment, analyseOptical } from './visual-alignment.mjs';
import { recordMotionStrip, analyseMotion } from './visual-motion.mjs';
import { decodePNG, diffPixels, readBaseline, baselinePath } from './visual-pixels.mjs';
export { readBaseline } from './visual-pixels.mjs';
import { inspectStyles } from './style-lint.mjs';
import { inspectOverlap } from './visual-overlap.mjs';
import { inspectCrisp, analyseConsistency, CRISP_THRESHOLDS } from './visual-crisp.mjs';
import { checkTokens } from './ui-tokens-check.mjs';
import { configuration } from './test-budget.mjs';
import { runLayeredCheck } from './visual-layered.mjs';
import { inspectImpeccable } from './impeccable-inspector.mjs';
import { inspectGateDesign } from './design-inspector.mjs';
import { recordToolSignal } from './signals.mjs';
import { ResourceGuardError } from './resource-guard.mjs';

export const INSPECTORS = ['overlap', 'clip', 'spacing', 'visibility', 'alignment', 'style', 'crisp', 'motion'];
export const PIXEL_TOLERANCE = 8; // Small channel differences allow antialias noise, not moved edges.
export function checkArguments(argv) {
  const options = { url: '', root: 'body', sizes: '1280x800', scales: '1', inspectors: 'clip,spacing,visibility,alignment,style,crisp',
    out: join(tmpdir(), 'jig-scratch', `check-${process.pid}-${Date.now()}`), png: false,
    'settle-ms': 100, 'timeout-ms': 10000, duration: 500, threshold: 2, budget: 200, fonts: 'default' };
  options.inspectors = 'overlap,' + options.inspectors;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (argv[i] === '--png' || argv[i] === '--accept-baseline') { options[key] = true; continue; }
    if (argv[i] === '--gate') { options.gate = true; continue; }
    if (argv[i] === '--blocking-only') { options.blockingOnly = true; continue; }
    if (!argv[i].startsWith('--') || !['url', 'root', 'scope', 'budget', 'sizes', 'scales', 'states', 'inspectors', 'out', 'baseline', 'duration', 'settle-ms', 'timeout-ms', 'crisp-thresholds', 'fonts', 'state-table', 'source', 'changed', 'since', 'pixel-tolerance', 'approved-by', 'approved-at', 'testing-config'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Unknown option or missing value: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (!options.url || !['file:', 'http:', 'https:'].includes(new URL(options.url).protocol)) throw new Error('--url must be a file or http(s) URL');
  if (options.changed && options.since) throw new Error('Use --changed or --since');
  options.pixelTolerance = Number(options['pixel-tolerance'] ?? PIXEL_TOLERANCE);
  if (!Number.isInteger(options.pixelTolerance) || options.pixelTolerance < 0 || options.pixelTolerance > 255) throw new Error('pixel-tolerance must be 0..255');
  if (options['accept-baseline'] && (!options.baseline || !options['approved-by'] || !/^\d{4}-\d{2}-\d{2}$/.test(options['approved-at'] || ''))) throw new Error('--accept-baseline requires --baseline, --approved-by and --approved-at');
  if(options['accept-baseline']&&(!Number.isFinite(Date.parse(options['approved-at']))||new Date(options['approved-at']).toISOString().slice(0,10)!==options['approved-at']))throw new Error('Baseline approval date is invalid');
  const list = (text, label) => {
    const values = text.split(',').map(s => s.trim());
    if (values.some(s => !s) || new Set(values).size !== values.length) throw new Error(`${label} must be unique nonempty comma-separated values`);
    return values;
  };
  options.sizes = list(options.sizes, 'sizes').map(s => {
    if (!/^\d+x\d+$/.test(s)) throw new Error('sizes must be WIDTHxHEIGHT');
    const [width, height] = s.split('x').map(Number);
    if ([width, height].some(n => n < 1 || n > 10000)) throw new Error('Viewport dimensions must be 1..10000');
    return { width, height };
  });
  options.scales = list(options.scales, 'scales').map(Number);
  if (options.scales.some(n => ![1, 2].includes(n))) throw new Error('scales must be 1 or 2');
  options.inspectors = list(options.inspectors, 'inspectors');
  if (options.inspectors.some(s => !INSPECTORS.includes(s))) throw new Error('Unknown inspector');
  if (options.states !== undefined) options.states = list(options.states, 'states');
  if (!['default', 'all'].includes(options.fonts)) throw new Error('fonts must be default or all');
  options.crispThresholds = options['crisp-thresholds'] === undefined ? {} : JSON.parse(options['crisp-thresholds']);
  if (!options.crispThresholds || Array.isArray(options.crispThresholds) || typeof options.crispThresholds !== 'object' || Object.entries(options.crispThresholds).some(([key, value]) => !Object.hasOwn(CRISP_THRESHOLDS, key) || !Number.isFinite(value) || value <= 0 || key !== 'body' && (value < 1 || value > 21))) throw new Error('Invalid crisp thresholds');
  options.budget = Number(options.budget);
  if (!Number.isSafeInteger(options.budget) || options.budget < 1) throw new Error('budget must be a positive integer');
  for (const key of ['duration', 'settle-ms', 'timeout-ms']) {
    options[key] = Number(options[key]);
    if (!Number.isFinite(options[key]) || options[key] <= 0) throw new Error(`${key} must be positive`);
  }
  return options;
}

export function declaredStates() {
  if (window.jigStates === undefined) return ['default'];
  if (!Array.isArray(window.jigStates) || !window.jigStates.length || window.jigStates.some(s => !s || typeof s.name !== 'string' || !s.name.trim() || s.static !== undefined && typeof s.static !== 'boolean' || s.setup !== undefined && typeof s.setup !== 'function' || s.reset !== undefined && typeof s.reset !== 'function' || s.static === false && typeof s.setup !== 'function' || s.setup && s.static !== true && typeof s.reset !== 'function') || new Set(window.jigStates.map(s => s.name)).size !== window.jigStates.length) throw new Error('Invalid window.jigStates: require unique names, interactive setup and reset functions');
  if (window.jigStates.some(s => s.scope !== undefined && (typeof s.scope !== 'string' || !s.scope.trim()))) throw new Error('Invalid window.jigStates scope');
  return window.jigStates.map(s => s.name);
}
export function declaredDataModes() {
  if (window.jigDataModes === undefined) return ['default'];
  const modes = window.jigDataModes;
  if (!Array.isArray(modes) || !modes.length || modes.some(m => !m || typeof m.name !== 'string' || !m.name.trim() || typeof m.setup !== 'function') || new Set(modes.map(m => m.name)).size !== modes.length) throw new Error('Invalid window.jigDataModes: require unique names and setup functions');
  return modes.map(m => m.name);
}
export function declaredFonts() {
  if (window.jigFonts === undefined) return ['default'];
  const raw = window.jigFonts; const fonts = Array.isArray(raw) ? { ids: [...raw], set: raw.set } : raw;
  if (!fonts || !Array.isArray(fonts.ids) || !fonts.ids.length || fonts.ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(fonts.ids).size !== fonts.ids.length || typeof fonts.set !== 'function') throw new Error('Invalid window.jigFonts: require unique ids and a set function');
  return fonts.ids;
}
export async function invokeFont({ id, timeout = 10000 }) {
  if (window.jigFonts === undefined && id === 'default') return;
  const raw = window.jigFonts, ids = Array.isArray(raw) ? raw : raw?.ids;
  if (!ids?.includes(id)) throw new Error(`Font disappeared: ${id}`);
  let timer;
  try { await Promise.race([Promise.resolve().then(() => window.jigFonts.set(id)), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Font setup timed out: ${id}`)), timeout);
  })]); } finally { clearTimeout(timer); }
}
export function hasStateScope({ name, scope }) {
  return Boolean(scope || window.jigStates?.find(s => s.name === name)?.scope);
}
// An absent scope is disclosed once; it does not invalidate measured coverage.
const NO_SCOPE = 'no scope; whole page measured';
const blockingGaps = gaps => gaps.filter(g => g !== NO_SCOPE);

export function motionDeclarations(selector) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  if (!document.querySelector('[data-motion]')) return { findings: [], gaps: [] };
  const interactive = 'button,[role=button],a[href],input,select,[tabindex]';
  const elements = [...(root.matches(interactive) ? [root] : []), ...root.querySelectorAll(interactive)];
  const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  return { findings: elements.filter(e => !e.hasAttribute('data-motion') && !e.matches('input[type=hidden]')).map(e => ({
    kind: 'missing motion declaration', element: path(e), measured: 'no data-motion', expected: 'data-motion recipe or none with a reason',
  })), gaps: [] };
}
export async function invokeDataMode({ name, timeout = 10000 }) {
  if (window.jigDataModes === undefined && name === 'default') return;
  const mode = window.jigDataModes?.find(m => m.name === name);
  if (!mode) throw new Error(`Data mode disappeared: ${name}`);
  let timer;
  try { await Promise.race([Promise.resolve().then(() => mode.setup()), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Data mode setup timed out: ${name}`)), timeout);
  })]); } finally { clearTimeout(timer); }
}
export async function withTimeout(operation, timeout) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Inspection timed out')), timeout);
  })]); } finally { clearTimeout(timer); }
}
export function coverageStatus(report) {
  const expected = report.coverage.expected, completed = report.runs.filter(r => r.completed).length;
  report.coverage.completed = completed;
  report.coverage.attempted = report.runs.length;
  report.coverage.complete = expected > 0 && completed === expected;
  if (!report.coverage.complete) report.gaps.push(`incomplete: ${completed} of ${expected} states`);
}
export const exitCodeFor = status => status === 'inconclusive' ? 2 : status === 'findings' ? 1 : 0;
export async function invokeState({ name, action, timeout = 10000 }) {
  if (window.jigStates === undefined && name === 'default') return;
  const state = window.jigStates.find(s => s.name === name);
  if (!state || typeof state[action] !== 'function') throw new Error(`State disappeared: ${name}`);
  let timer;
  try {
    await Promise.race([Promise.resolve().then(() => state[action]()), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${action} timed out: ${name}`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

// Same rule + measured style value wins over ancestry: inherited root values
// should not produce hundreds of apparently independent component defects.
export const RULE_SEVERITY = Object.freeze({ overlap: 5, 'text-clipped': 5, 'control-label': 5, 'must-visible': 5,
  'empty-content': 5, 'near-invisible': 5, 'unintended-truncation': 5,
  'near-miss-alignment': 4, containment: 4, 'optical-centring': 4,
  'off-grid': 2, inset: 2, 'zero-gaps': 2, 'uneven-gaps': 2, 'fractional-position': 1 });
const severity = f => RULE_SEVERITY[f.kind] ?? 3;
// Static mocks: keep only blocking classes (severity 5); alignment and spacing noise stays behind the default run.
export const blockingFindings = findings => findings.filter(f => severity(f) >= 5);
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
function identity(f) {
  return stable([f.source || 'script', f.inspector, f.kind, f.element, f.other, f.property, f.edge, f.axis, f.layer, f.layer === 'tokens' ? f.preset : undefined,
    f.values ?? f.computedValue ?? f.padding ?? f.measured, f.expected]);
}
export function uniqueFindings(findings) {
  const unique = new Map();
  for (const f of findings) {
    const key = identity(f);
    if (!unique.has(key)) unique.set(key, { ...f, severity: severity(f), states: [], contexts: [] });
    const item = unique.get(key);
    for (const state of f.states || (f.state ? [f.state] : [])) if (!item.states.includes(state)) item.states.push(state);
    for (const context of f.contexts || (f.viewport ? [{ state: f.state, viewport: f.viewport, scale: f.scale, font: f.font, dataMode: f.dataMode }] : [])) {
      if (!item.contexts.some(c => JSON.stringify(c) === JSON.stringify(context))) item.contexts.push(context);
    }
  }
  return [...unique.values()];
}
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of uniqueFindings(findings)) {
    const { key, cause } = findingCause(f);
    if (!groups.has(key)) groups.set(key, { rule: f.kind, severity: severity(f), inspector: f.inspector, source: f.source || 'script', cause, count: 0, states: [], examples: [] });
    const group = groups.get(key); group.count++;
    for (const state of f.states) if (!group.states.includes(state)) group.states.push(state);
    if (group.examples.length < 3) group.examples.push(f);
  }
  return [...groups.values()].sort((a, b) => b.severity - a.severity || b.count - a.count);
}
function findingCause(f) {
  const value = f.values ?? f.computedValue ?? f.padding ?? (f.property ? f.measured : undefined);
  const cause = value !== undefined ? stable(value) : f.ancestor ?? f.clipping?.[0]?.ancestor ?? stable(f.measured) ?? f.element;
  return { key: JSON.stringify([f.source || 'script', f.inspector, f.kind, f.property, f.edge, cause]), cause };
}

// Resolve after setup: a page may supply a scope for each state. CLI scope wins;
// metadata placeholders allow one selector to address a catalog of components.
export function stateScope({ name, scope, root }) {
  const state = window.jigStates?.find(s => s.name === name);
  const selector = (scope ?? state?.scope ?? root).replace(/\{([\w]+)\}/g, (_, key) => {
    if (typeof state?.[key] !== 'string') throw new Error(`Missing scope metadata: ${key}`);
    return CSS.escape(state[key]);
  });
  if (document.querySelectorAll(selector).length !== 1) throw new Error(`Scope must resolve to one region: ${selector}`);
  const region = document.querySelector(selector);
  if (!['body', 'html'].includes(region.localName)) region.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  return selector;
}

export function regionClip(selector) {
    const r = document.querySelector(selector).getBoundingClientRect();
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    const width = Math.min(innerWidth, r.right) - x, height = Math.min(innerHeight, r.bottom) - y;
    if (width <= 0 || height <= 0) throw new Error('Scope has no visible capture region');
    return { x, y, width, height };
}
export async function captureRegion(page, selector, { animations = 'disabled', caret = 'hide' } = {}) {
  const clip = await page.evaluate(regionClip, selector);
  return page.screenshot({ clip, caret, animations });
}
export function numberedFindings(findings) {
  const groups = groupFindings(findings), numbers = new Map(groups.map((g, i) => [findingCause(g.examples[0]).key, { number: i + 1, count: g.count }]));
  return findings.map(f => ({ ...f, ...numbers.get(findingCause(f).key) }));
}
export function sourceCounts(findings) {
  const counts = { script: 0, model: 0, person: 0 };
  for (const f of findings) counts[f.source || 'script']++;
  return counts;
}

export function ruleContract(f) {
  if (f.measured !== undefined && f.expected !== undefined) return f;
  const spacing = {
    'off-grid': [f.values, `multiples of ${SPACING_STEP}px`],
    inset: [f.padding, 'opposite insets within 1px; top/left within 6px'],
    'zero-gaps': [f.gaps, 'nonzero sibling gaps, or a local documented exception'],
    'uneven-gaps': [f.gaps, 'same-role sibling gaps within 1px'],
  };
  const [measured, expected] = spacing[f.kind] || (
    f.kind === 'text-clipped' ? [{ rect: f.rect, clippedBy: f.clipping }, f.clipping.map(c => ({ ancestor: c.ancestor, bounds: c.bounds }))] :
    f.kind === 'control-label' ? [f.needed || f.rect, f.available || f.bounds] :
    f.kind === 'must-visible' ? [{ rect: f.rect, edges: f.edges, hidden: f.hidden }, 'visible inside viewport'] :
    f.kind === 'empty-content' ? [f.inkPixels, 'rendered ink pixels > 0'] :
    f.contrastRatio !== undefined ? [f.contrastRatio, `contrast >= ${f.threshold}`] :
    f.jump !== undefined ? [f.jump, 'no one-frame return or marker jump above 2px'] : [f.measured, f.expected]);
  return { ...f, measured, expected };
}

// Annotation is a temporary overlay: it cannot alter the measured layout.
export function annotateFindings({ findings, root }) {
  const layer = document.createElement('div'); layer.id = '__jig_annotations';
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
  const legend = [], seen = new Set();
  findings.forEach((f, i) => {
    let r = f.rect;
    if (!r && f.index !== undefined) {
      const el = document.querySelector(root), target = [el, ...el.querySelectorAll('*')][f.index];
      r = target?.getBoundingClientRect();
    }
    if (!r) { try { r = document.querySelector(f.element)?.getBoundingClientRect(); } catch { /* Static CSS findings have file locations instead. */ } }
    const measured = f.measured ?? f.values ?? f.padding ?? f.contrastRatio ?? f.edges ?? f.clipping ?? f.jump ?? 'see report';
    const expected = f.expected ?? (f.threshold ? `contrast >= ${f.threshold}` : 'rule passes; see report');
    const number = f.number || i + 1;
    if (!seen.has(number)) legend.push(`${number}. ${f.kind} (${f.count || 1} findings): ${JSON.stringify(measured)}; expected ${JSON.stringify(expected)} (${f.element || f.file || 'page'})${r ? '' : ' [no rendered box]'}`);
    seen.add(number);
    if (!r) return;
    const mark = document.createElement('div');
    Object.assign(mark.style, { position: 'absolute', left: `${r.x ?? r.left}px`, top: `${r.y ?? r.top}px`, width: `${r.width ?? r.right - r.left}px`, height: `${r.height ?? r.bottom - r.top}px`, outline: '2px solid #e00042', boxSizing: 'border-box' });
    const label = document.createElement('span'); label.textContent = String(number);
    Object.assign(label.style, { position: 'absolute', left: '0', top: '0', background: '#e00042', color: '#fff', font: 'bold 12px sans-serif', padding: '1px 3px' });
    mark.append(label); layer.append(mark);
  });
  document.documentElement.append(layer);
  return legend;
}

export async function inspectBaseline(page, options, run, manifest) {
  const findings = [], gaps = [], measurements = [];
  const entries = manifest.entries.filter(e => e.state === run.state && (e.dataMode === undefined || e.dataMode === run.dataMode) && e.scale === run.scale && e.viewport.width === run.viewport.width && e.viewport.height === run.viewport.height);
  if (!entries.length) gaps.push('No approved component baselines for this state/viewport/scale');
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  try {
    for (const e of entries) {
      try {
        const target = page.locator(e.selector);
        if (await target.count() !== 1) throw new Error('Baseline selector must resolve to one component');
        const bytes = await target.screenshot({ animations: options.candidateInk ? 'allow' : 'disabled', caret: options.candidateInk ? 'initial' : 'hide' });
        const before = decodePNG(readFileSync(baselinePath(options.baseline, e.file))), after = decodePNG(bytes);
        if (before.width !== after.width || before.height !== after.height) {
          findings.push({ kind: 'baseline-size', element: e.selector, measured: [after.width, after.height], expected: [before.width, before.height], component: e.component }); continue;
        }
        const { pixels, ...diff } = diffPixels(before, after, { tolerance: options.pixelTolerance ?? PIXEL_TOLERANCE });
        measurements.push({ component: e.component, ...diff });
        if (diff.changedPixels) findings.push({ kind: 'baseline-pixels', element: e.selector, measured: diff.changedPixels, expected: 0, component: e.component });
      } catch (error) { gaps.push(`${e.component}: ${error.message}`); }
    }
  } finally { await page.evaluate(p => scrollTo(p.x, p.y), scroll); }
  return { findings, gaps, measurements };
}

export async function runInspectors(page, options, run) {
  const results = {};
  const tasks = {
    overlap: () => inspectOverlap(page, options.root),
    clip: () => run.fontChecksOnly ? page.evaluate(inspectClip, options.root) : inspectClipping(page, options.root),
    spacing: () => page.evaluate(inspectSpacing, options.root),
    visibility: () => inspectVisibilityBatched(page, options.root, { scale: run.scale }),
    alignment: () => inspectAlignment(page, options.root, { scale: run.scale }),
    style: () => inspectStyles(page, options.root),
    crisp: () => inspectCrisp(page, options.consistencyRoot || options.root, { scale: run.scale, state: run.state, thresholds: options.crispThresholds, fontChecksOnly: run.fontChecksOnly }),
  };
  // Sequential: visibility temporarily changes ink; other probes must never
  // observe that mask. All inspectors see this same page and declared state.
  for (const name of options.inspectors.filter(n => n !== 'motion')) {
    const started = performance.now();
    try { results[name] = await tasks[name](); }
    catch (error) { results[name] = { findings: [], gaps: [error.message] }; }
    results[name].elapsedMs = performance.now() - started;
  }
  if (run.fontChecksOnly) {
    if (results.crisp) results.crisp.findings = results.crisp.findings.filter(f => f.kind === 'unintended-truncation');
    if (results.alignment) results.alignment.findings = results.alignment.findings.filter(f => f.kind === 'containment');
  }
  if (options.inspectors.includes('alignment') && !run.fontChecksOnly && !options.candidateInk) {
    const started = performance.now();
    try {
      const ink = results.visibility || await tasks.visibility();
      results.optical = { ...analyseOptical(ink.measurements || []),
        measurements: (ink.measurements || []).map(({ element, rect, inkBox, control }) => ({ element, rect, inkBox, control })), gaps: ink.gaps };
      if (!results.visibility && ink.notes) results.optical.notes = ink.notes;
    } catch (error) { results.optical = { findings: [], gaps: [error.message] }; }
    results.optical.elapsedMs = performance.now() - started;
  }
  if (!run.fontChecksOnly) results.motionDeclarations = await page.evaluate(motionDeclarations, options.root);
  if (options.gate && !run.fontChecksOnly) {
    try { results.design = await inspectGateDesign(page, { root: options.root }); }
    catch(error) { results.design = {findings:[],gaps:[error.message]}; }
  }
  // Unscoped pages disclose missing scope once, not once per offscreen node.
  if (run.scoped === false) for (const result of Object.values(results)) {
    result.gaps = result.gaps.filter(g => !g.includes('outside viewport; reach this content in a named state'));
  }
  return results;
}

export async function runSequentialCheck(options, { launch = launchChrome, inspect = runInspectors, saveSheet = saveContactSheet } = {}) {
  const started = performance.now(), collected = new Map(); let occurrences = 0;
  const report = { tool: 'visual-check', version: 2, node: process.version, platform: process.platform,
    options: { gate: options.gate === true, blockingOnly: options.blockingOnly === true, url: options.url },
    runs: [], gaps: [], coverage: { expected: 0, declarations: [] } };
  const tiles = []; let browser, manifest;
  try {
    if (options.baseline) manifest = readBaseline(options.baseline);
    browser = await launch(); report.browser = browser.version();
    if (manifest && (manifest.browser !== report.browser || manifest.platform !== process.platform)) report.gaps.push('Baseline browser/platform differs; validate fonts and rendering before comparing');
    for (const viewport of options.sizes) for (const scale of options.scales) {
      let context, page;
      try {
        context = await browser.newContext({ viewport, deviceScaleFactor: scale }); page = await context.newPage();
        page.setDefaultTimeout(options['timeout-ms']);
        const pageGaps = [];
        page.on('pageerror', e => pageGaps.push(`Page error: ${e.message}`));
        // Stylesheet failures belong to style lint, which emits one canonical
        // missing-stylesheet finding across the matrix instead of request gaps.
        page.on('requestfailed', r => { if (!options.inspectors.includes('style') || r.resourceType() !== 'stylesheet') pageGaps.push(`Request failed: ${new URL(r.url()).pathname}`); });
        page.on('response', r => { if (r.status() >= 400 && (!options.inspectors.includes('style') || r.request().resourceType() !== 'stylesheet')) pageGaps.push(`HTTP ${r.status()}: ${new URL(r.url()).pathname}`); });
        await page.goto(options.url, { waitUntil: 'load' });
        await withTimeout(() => page.evaluate(() => document.fonts.ready.then(() => undefined)), options['timeout-ms']);
        const names = await page.evaluate(declaredStates), selected = options.states || names;
        const modes = await page.evaluate(declaredDataModes);
        const availableFonts = await page.evaluate(declaredFonts);
        const fonts = options.fonts === 'all' ? availableFonts : availableFonts.slice(0, 1);
        report.coverage.expected += names.length * modes.length * fonts.length;
        report.coverage.declarations.push({ viewport, scale, states: names, dataModes: modes, fonts });
        const unknown = selected.filter(n => !names.includes(n));
        if (unknown.length) throw new Error(`Unknown states: ${unknown.join(', ')}`);
        if (report.budget?.stopped) continue;
        modesLoop: for (const font of fonts) for (const dataMode of modes) {
        let history = [];
        for (const state of selected) {
          const fontChecksOnly = font !== fonts[0];
          const run = { viewport, scale, state, dataMode, font, fontChecksOnly, findings: [], gaps: [], inspectors: {} }; report.runs.push(run);
          const stateStarted = performance.now(); let setupEnded, inspectStarted;
          let freeze, scoped = options;
          try {
            const activate = async () => {
              await page.evaluate(invokeState, { name: state, action: 'setup', timeout: options['timeout-ms'] });
              await page.evaluate(invokeDataMode, { name: dataMode, timeout: options['timeout-ms'] });
              await page.evaluate(invokeFont, { id: font, timeout: options['timeout-ms'] });
            };
            run.scoped = await page.evaluate(hasStateScope, { name: state, scope: options.scope });
            if (run.scoped === false) run.gaps.push(NO_SCOPE);
            if (options.inspectors.includes('motion') && !fontChecksOnly) {
              run.scope = await page.evaluate(stateScope, { name: state, scope: options.scope, root: options.root });
              scoped = { ...options, root: run.scope };
              // Arm rAF sampling BEFORE setup triggers the state transition.
              const motion = await recordMotionStrip(page, scoped, activate,
                { capture: options.png, captureFrame: () => captureRegion(page, scoped.root, { animations: 'allow' }) });
              if (options.png) for (const image of motion.images) {
                if (tiles.length >= 59) throw new Error('Contact sheet exceeds 60 tiles; narrow --states');
                tiles.push({ label: `${viewport.width}x${viewport.height} @${scale} / ${font} / ${state} / ${image.label}`, bytes: image.bytes });
              }
              run.inspectors.motion = { ...analyseMotion(motion.frames, options), frames: motion.frames };
              run.inspectors.motion.gaps.push(...motion.gaps);
            } else await activate();
            setupEnded = performance.now();
            run.scope = await page.evaluate(stateScope, { name: state, scope: options.scope, root: options.root });
            scoped = { ...options, root: run.scope };
            scoped.consistencyRoot = run.scope;
            if (fontChecksOnly) scoped.inspectors = ['clip', 'alignment', 'crisp'];
            freeze = await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
            await freeze.evaluate(e => { e.id = '__jig_freeze'; });
            await withTimeout(() => page.evaluate(() => document.fonts.ready.then(() => undefined)), options['timeout-ms']);
            run.settled = await settled(page, scoped);
            if (!run.settled) run.gaps.push('Page did not settle before timeout');
            inspectStarted = performance.now();
            Object.assign(run.inspectors, await withTimeout(() => inspect(page, scoped, run), options['timeout-ms']));
            if (run.inspectors.crisp?.measurements) {
              const consistencyStarted = performance.now();
              const consistency = analyseConsistency(run.inspectors.crisp.measurements, history, run.inspectors.crisp.exceptions);
              history = consistency.history; delete consistency.history;
              consistency.elapsedMs = performance.now() - consistencyStarted;
              run.inspectors.consistency = consistency;
            }
            run.inspectionMs = performance.now() - inspectStarted;
            if (manifest && !fontChecksOnly) run.inspectors.pixels = await inspectBaseline(page, options, run, manifest);
            run.layout = await page.evaluate(inspectLayout, scoped.root);
          } catch (error) { run.gaps.push(error.message); }
          finally {
            for (const [inspector, result] of Object.entries(run.inspectors)) {
              run.findings.push(...result.findings.map(f => ({ ...ruleContract(f), source: 'script', inspector })));
              run.gaps.push(...result.gaps.map(g => `${inspector}: ${g}`));
            }
            if (options.png) {
              try {
                if (!run.scope) throw new Error('State scope was not resolved; no region captured');
                if (tiles.length >= 60) throw new Error('Contact sheet exceeds 60 states; narrow --states');
                const legend = await page.evaluate(annotateFindings, { findings: numberedFindings(run.findings).filter(f => f.number <= Math.min(options.budget, 12)), root: scoped.root });
                tiles.push({ label: `${viewport.width}x${viewport.height} @${scale} / ${font} / ${state}\nTop 12 groups annotated; complete details in report.json\n${legend.join('\n')}`, bytes: await captureRegion(page, scoped.root) });
              } catch (error) { run.gaps.push(`Contact sheet: ${error.message}`); }
              finally { try { await page.evaluate(() => document.querySelector('#__jig_annotations')?.remove()); } catch (error) { run.gaps.push(`Annotation cleanup: ${error.message}`); } }
            }
            if (freeze) try { await freeze.evaluate(e => e.remove()); } catch (error) { run.gaps.push(`Animation cleanup: ${error.message}`); }
            try { await page.evaluate(invokeState, { name: state, action: 'reset', timeout: options['timeout-ms'] }); }
            catch (error) { run.gaps.push(`Reset failed: ${error.message}`); }
            run.gaps.push(...pageGaps.splice(0));
            if (options.blockingOnly) run.findings = blockingFindings(run.findings);
            run.completed = Boolean(run.settled) && blockingGaps(run.gaps).length === 0;
            run.status = statusFor(run.findings, blockingGaps(run.gaps));
            occurrences += run.findings.length;
            run.findingIds = [];
            for (const f of run.findings) {
              const key = identity(f), context = { state, dataMode, font, viewport, scale };
              if (!collected.has(key)) {
                const item = { ...f, severity: severity(f), id: collected.size + 1, states: [], contexts: [] };
                collected.set(key, item);
              }
              const item = collected.get(key);
              if (!item.states.includes(state)) item.states.push(state);
              if (!item.contexts.some(c => JSON.stringify(c) === JSON.stringify(context))) item.contexts.push(context);
              if (!run.findingIds.includes(item.id)) run.findingIds.push(item.id);
            }
            // Store each finding once. Later runs refer to canonical IDs.
            delete run.findings;
            for (const result of Object.values(run.inspectors)) {
              result.findingCount = result.findings.length; delete result.findings;
            }
            run.setupMs = setupEnded === undefined ? performance.now() - stateStarted : setupEnded - stateStarted;
            run.elapsedMs = performance.now() - stateStarted;
            saveReport(options, report, 'report.json');
            process.stderr.write(`${font}: ${state} ${run.elapsedMs.toFixed(0)} ms\n`);
          }
          if (!options.gate && groupFindings([...collected.values()]).length >= options.budget &&
            (state !== selected.at(-1) || dataMode !== modes.at(-1) || font !== fonts.at(-1) || scale !== options.scales.at(-1) || viewport !== options.sizes.at(-1))) {
            report.budget = { limit: options.budget, stopped: true, measuredStates: report.runs.length,
              remainingStatesAtSize: selected.length - selected.indexOf(state) - 1 };
            report.gaps.push('Findings budget reached; remaining states/sizes/scales were not measured. Totals cover measured states only.');
            break modesLoop;
          }
          if (run.gaps.some(g => g.startsWith('Reset failed:') || /timed out/i.test(g))) break modesLoop; // Do not measure a contaminated next state.
        }
        }
      } catch (error) { report.gaps.push(`${viewport.width}x${viewport.height} @${scale}: ${error.message}`); }
      finally { if (context) try { await context.close(); } catch (error) { report.gaps.push(`Context close: ${error.message}`); } }
    }
    if (options.png && tiles.length) report.sheet = await saveSheet(browser, options, tiles);
  } catch (error) { report.gaps.push(error.message); if (error instanceof ResourceGuardError) report.skipped = error.message; }
  finally { if (browser) try { await browser.close(); } catch (error) { report.gaps.push(`Browser close: ${error.message}`); } }
  const findings = [...collected.values()];
  if (!report.runs.length) report.gaps.push('No states measured');
  coverageStatus(report);
  const groups = groupFindings(findings);
  report.groups = groups.slice(0, options.budget);
  report.findings = findings;
  report.budget ??= { limit: options.budget, stopped: false };
  report.sources = sourceCounts(findings);
  report.counts = { findings: findings.length, occurrences, groups: groups.length, reportedGroups: report.groups.length };
  report.elapsedMs = performance.now() - started;
  report.status = statusFor(findings, [...report.gaps, ...report.runs.flatMap(r => blockingGaps(r.gaps))]);
  saveReport(options, report, 'report.json'); return report;
}
export async function runCheck(options, dependencies = {}) {
  const started=performance.now();
  const impeccable=options.gate?await (dependencies.impeccable || inspectImpeccable)(options):undefined;
  const finish=report=>{
    report.inspectors=[...new Set(report.runs.flatMap(r=>Object.keys(r.inspectors || {})))];
    if(impeccable){
      report.inspectors.push('impeccable');report.impeccable=impeccable;
      report.gaps.push(...impeccable.gaps.map(g=>`impeccable: ${g}`));
      if(!impeccable.executed&&!impeccable.gaps.length)report.gaps.push('impeccable: detector did not execute');
      report.layers ??= {};report.layers.impeccable={elapsedMs:impeccable.elapsedMs,budgetMs:5000};
      report.elapsedMs=performance.now()-started;
      const limit=options.fonts==='all'?budgets.allFontsBudgetMs:budgets.gateBudgetMs;
      report.overBudget ||= impeccable.overBudget || report.elapsedMs>limit;
      report.budgetFailures ??= [];
      if(impeccable.overBudget)report.budgetFailures.push(`impeccable: ${impeccable.elapsedMs.toFixed(1)} ms > 5000 ms`);
      if(report.elapsedMs>limit)report.budgetFailures.push(`gate including impeccable: ${report.elapsedMs.toFixed(1)} ms > ${limit} ms`);
      if(report.overBudget)report.status='findings';
      else if(impeccable.gaps.length||!impeccable.executed)report.status='inconclusive';
    }
    const record = dependencies.signal || recordToolSignal;
    if (report.overBudget || report.budget?.stopped || report.coverage?.complete === false) record('over-budget', 'visual-check', { area: 'visual-check', what: 'Run over budget or incomplete' });
    if (report.status === 'inconclusive' || report.gaps.length || report.runs.some(run => blockingGaps(run.gaps ?? []).length || run.completed === false)) record('missed-check', 'visual-check', { area: 'visual-check', what: 'Configured checks or coverage incomplete' });
    saveReport(options,report,'report.json');return report;
  };
  const budgets = configuration(process.cwd(), options['testing-config']);
  const tokenReport = (dependencies.tokens || checkTokens)(options);
  if (tokenReport.invalid || options['state-table'] && !tokenReport.table) {
    const report={tool:'visual-check',version:2,options:{gate:options.gate===true,url:options.url},runs:[],findings:tokenReport.findings,gaps:tokenReport.gaps,coverage:{expected:0,declarations:[]},layers:tokenReport.layers,elapsedMs:tokenReport.elapsedMs,status:tokenReport.status};
    report.overBudget=tokenReport.elapsedMs>budgets.tokenBudgetMs;if(report.overBudget)report.status='findings';
    coverageStatus(report);return finish(report);
  }
  // The table explicitly authorizes static batching. Older pages retain their
  // setup/reset semantics and disclose the missing token layer at the gate.
  if (tokenReport.table) {
    return finish(await runLayeredCheck(options, tokenReport, budgets, dependencies));
  }
  const report = await runSequentialCheck(options, dependencies);
  report.layers = { tokens: { elapsedMs: tokenReport.elapsedMs, gaps: tokenReport.gaps }, geometry: {
    elapsedMs: report.runs.reduce((n,r)=>n+(r.inspectionMs || 0),0) } };
  report.findings.push(...tokenReport.findings);
  if (options.gate) report.gaps.push(...tokenReport.gaps);
  if (options.changed || options.since || options['accept-baseline']) report.gaps.push('State table required for change-aware runs and baseline capture');
  const fontGroups = Map.groupBy(report.runs, r=>JSON.stringify([r.font,r.viewport,r.scale]));
  report.fontPasses = [...fontGroups.values()].map(runs=>({font:runs[0].font,
    elapsedMs:runs.reduce((n,r)=>n+r.elapsedMs,0),budgetMs:runs[0].fontChecksOnly?budgets.fontPassBudgetMs:budgets.gateBudgetMs,
    slowestStates:runs.toSorted((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,5).map(r=>({state:r.state,elapsedMs:r.elapsedMs}))}));
  report.overBudget = tokenReport.elapsedMs > budgets.tokenBudgetMs || report.fontPasses.some(p=>p.elapsedMs>p.budgetMs);
  report.timeBudgets = budgets; report.elapsedMs += tokenReport.elapsedMs;
  report.status = report.overBudget ? 'findings' : statusFor(report.findings,[...report.gaps,...report.runs.flatMap(r=>blockingGaps(r.gaps))]);
  return finish(report);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = checkArguments(process.argv.slice(2)), report = await runCheck(options);
    console.log(JSON.stringify({ status: report.status, ...report.counts, elapsedMs: report.elapsedMs, layers: report.layers, fontPasses: report.fontPasses, overBudget: report.overBudget, changedStates: report.changedStates, coverage: report.coverage, budget: report.budget, sources: report.sources, report: join(options.out, 'report.json'), sheet: report.sheet, gaps: report.gaps }));
    process.exitCode = exitCodeFor(report.status);
  } catch (error) { console.log(JSON.stringify({ status: 'inconclusive', gaps: [error.message] })); process.exitCode = 2; }
}
