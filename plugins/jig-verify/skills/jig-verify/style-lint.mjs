import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from "../../scripts/command-line.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { onSpacingGrid } from './visual-spacing.mjs';
export { onSpacingGrid, SPACING_STEP } from './visual-spacing.mjs';

const colourNames = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));

function withoutTokens(value) {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    if (value.slice(i, i + 4) !== 'var(') { result += value[i]; continue; }
    let depth = 1, end = i + 4, comma = -1;
    for (; end < value.length && depth; end++) {
      if (value[end] === '(') depth++;
      if (value[end] === ')') depth--;
      if (value[end] === ',' && depth === 1 && comma < 0) comma = end;
    }
    if (depth) throw new Error('Unclosed var()');
    // A raw fallback is still an ad-hoc value; nested token fallbacks are fine.
    if (comma >= 0) result += withoutTokens(value.slice(comma + 1, end - 1));
    i = end - 1;
  }
  return result;
}

// This deliberately small static lint is not a CSS parser/cascade evaluator.
// Custom property declarations define tokens; ordinary declarations consume them.
export function lintCSS(css, { file = 'inline', rootChanged = false, allowTokenDefinitions = true, tokens = {}, tokenChoices = {}, typeScale, inferTypeScale = true } = {}) {
  const findings = [], gaps = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '));
  tokens = { ...tokens, ...cssTokens(css) };
  tokenChoices = mergeChoices(tokenChoices, cssTokenChoices(css));
  typeScale ??= inferTypeScale ? Object.entries(tokens).filter(([key]) => /^--grid-type-(?!min$)/.test(key)).map(([, value]) => pixelSize(resolveValue(value, tokens))).filter(Number.isFinite) : [];
  rootChanged ||= /(?:html|:root)\s*\{[^}]*font-size\s*:\s*(?!100%|16px)[^;}]+/i.test(css);
  const declarations = /([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g;
  for (const m of css.matchAll(declarations)) {
    const property = m[1].toLowerCase(), value = m[2].trim();
    if (property.startsWith('--') && allowTokenDefinitions) continue;
    let raw;
    try { raw = withoutTokens(value); } catch (error) { gaps.push(`${file}: ${error.message}`); continue; }
    raw = raw.replace(/!important\b/g, '').replace(/url\([^)]*\)/gi, '').trim();
    const brace = css.lastIndexOf('{', m.index), start = Math.max(css.lastIndexOf('}', brace), css.lastIndexOf('{', brace - 1)) + 1;
    const selector = brace >= 0 ? css.slice(start, brace).trim() : '*';
    const add = (kind, expected) => findings.push({ source: 'script', kind, element: `${file}: ${selector}`, file, line: css.slice(0, m.index).split('\n').length, property, measured: value, expected });
    if (!allowTokenDefinitions && property === 'font-weight' && /^(?:\d+|normal|bold|bolder|lighter)$/.test(raw)) add('raw-font-weight', 'a typography weight token');
    if (/^transition(?:-property)?$/.test(property) && /\ball\b/.test(raw)) add('transition-all', 'explicit transition properties');
    if (rootChanged && /[-.\d]+rem\b/i.test(value)) add('rem-with-changed-root', 'relative rules or an unchanged root font size');
    if (/(?:#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\s*\()/i.test(raw)
      || /(?:color|background|border|outline|fill|stroke|shadow)/.test(property) && (raw.toLowerCase().match(/\b[a-z]+\b/g) || []).some(word => colourNames.has(word))) add('raw-colour', 'a colour token');
    if (/shadow$/.test(property) && raw && !/^(none|inherit|initial|unset)$/.test(raw)) add('raw-shadow', 'a shadow token');
    if (/radius$/.test(property) && /(?:\d*\.)?\d+%/.test(raw)) add('raw-radius', 'a radius token');
    if (/(?:^|[^\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ms|s|pt|vh|vw|vmin|vmax|ch)\b/i.test(raw)) add('raw-dimension', 'a size, radius or duration token');
    if (/^(?:gap|row-gap|column-gap|padding(?:-.+)?|margin(?:-.+)?|inset(?:-.+)?|top|right|bottom|left)$/.test(property)) {
      const numbers = [...raw.matchAll(/(-?(?:\d*\.)?\d+)px\b/g)].map(n => Number(n[1]));
      const originalSpacing = /^(?:gap|row-gap|column-gap|padding(?:-.+)?|margin(?:-.+)?)$/.test(property);
      if ((originalSpacing || typeScale.length) && numbers.some(n => !onSpacingGrid(n))) add('off-spacing-scale', 'multiples of 4px');
      // Zero and layout keywords do not create a spacing step. Nonzero raw
      // lengths already fail raw-dimension; token aliases must resolve to the
      // finite grid scale too. Geometry cannot smuggle in a 20px inset.
      const clean = value.replace(/!important\b/g, '').trim();
      const resolved = resolveCandidates(clean, tokens, tokenChoices);
      if (typeScale.length && (resolved.some(v => !validSpacing(v)) || !spacingTokens(clean, tokens, tokenChoices))) add('grid-spacing', 'grid spacing tokens (0, 4, 8, 12, 16, 24, 32, 48 or 64px); zero/auto');
      else if (!typeScale.length && originalSpacing && /(?:%|\bnormal\b)/.test(raw)) add('grid-spacing', 'grid spacing tokens or zero/auto');
    }
    if (property === 'font-size' || property === 'font') {
      const resolved = typeScale.length ? resolveCandidates(value.replace(/!important\b/g, '').trim(), tokens, tokenChoices) : [value];
      const size = v => property === 'font-size' ? pixelSize(v) : pixelSize(v?.match(/(?:^|\s)((?:\d*\.)?\d+(?:px|rem|em|%))(?:\s|\/|$)/)?.[1]);
      if (resolved.some(v => Number.isFinite(size(v)) && size(v) < 12)) add('font-too-small', 'at least 12 CSS px');
      if (typeScale.length && resolved.some(v => !/^(inherit|initial|unset|revert|revert-layer)$/.test(v || '') && !typeScale.includes(size(v)))) add('off-type-scale', `declared type scale: ${typeScale.join(', ')}px`);
    }
  }
  if (css.includes('@apply') || /\$[\w-]+/.test(css)) gaps.push(`${file}: preprocessor CSS requires compiled input`);
  return { findings, gaps };
}

export function cssTokens(css) {
  return Object.fromEntries([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)].map(m => [m[1], m[2].trim()]));
}
function cssTokenChoices(css) {
  const choices = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) (choices[m[1]] ??= []).push(m[2].trim());
  return choices;
}
function mergeChoices(a, b) {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(key => [key, [...new Set([...(a[key] || []), ...(b[key] || [])])]]));
}
// Consider every declared alternative, including conditional/scoped overrides.
// A later valid definition cannot hide an earlier 11px branch. This is a
// conservative declaration check, not an approximation of CSS specificity.
function resolveCandidates(value, tokens, choices, stack = []) {
  if (typeof value !== 'string') return [undefined];
  const m = value.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/);
  if (!m) return value.includes('var(') ? [undefined] : [value];
  const name = m[1];
  if (stack.includes(name) || stack.length > 32) return [undefined];
  const definitions = choices[name] || [tokens[name] ?? m[2]];
  const result = [];
  for (const definition of definitions) for (const resolved of resolveCandidates(definition, tokens, choices, [...stack, name])) {
    if (resolved === undefined) result.push(undefined);
    else result.push(...resolveCandidates(value.slice(0, m.index) + resolved + value.slice(m.index + m[0].length), tokens, choices, stack));
    if (result.length > 64) return [undefined];
  }
  return [...new Set(result)];
}

// Static aliases only. Unresolved/cyclic or computed values fail closed in a
// declared grid project; a browser is needed for the actual cascade.
export function resolveValue(value, tokens, stack = []) {
  if (typeof value !== 'string') return undefined;
  let unresolved = false;
  const result = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g, (_, name, fallback) => {
    if (stack.includes(name)) { unresolved = true; return ''; }
    const resolved = resolveValue(tokens[name] ?? fallback, tokens, [...stack, name]);
    if (resolved === undefined) unresolved = true;
    return resolved ?? '';
  });
  return unresolved || result.includes('var(') ? undefined : result;
}
function pixelSize(value) {
  const m = value?.match(/^([\d.]+)(px|rem)$/);
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : NaN;
}
function validSpacing(value) {
  return typeof value === 'string' && value.split(/\s+/).every(v => v === '0' || v === 'auto' || [0,4,8,12,16,24,32,48,64].includes(pixelSize(v)));
}
function spacingTokens(value, tokens, choices, stack = []) {
  const result = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => {
    if (stack.includes(name) || tokens[name] === undefined) return 'invalid';
    const definitions = choices[name] || [tokens[name]];
    if (/^--grid-space-(?:0|1|2|3|4|6|8|12|16)$/.test(name) && definitions.every(v => validSpacing(resolveValue(v, tokens)))) return '0';
    return definitions.every(v => spacingTokens(v, tokens, choices, [...stack, name])) ? '0' : 'invalid';
  });
  return result.split(/\s+/).every(v => v === '0' || v === 'auto');
}

// Serializable CSSOM collector, also used to scope disk fallback CSS through
// the browser's parser. Never inject fallback styles into the rendered page.
export function styleSources({ selector, localSheets = {} }) {
    const sources = [], gaps = [], inaccessible = [], visited = new Set();
    const root = document.querySelector(selector);
    if (!root) throw new Error('Root missing');
    const relevant = selectorText => {
      try { return root.matches(selectorText) || Boolean(root.querySelector(selectorText)); }
      catch { return false; }
    };
    const visitRules = (rules, file, parentSelector) => {
      for (const rule of rules) {
        if (rule.styleSheet) visit(rule.styleSheet);
        else {
          let resolved = rule.selectorText;
          if (resolved && parentSelector) resolved = resolved.includes('&') ? resolved.replaceAll('&', `:is(${parentSelector})`) : `:is(${parentSelector}) ${resolved}`;
          if (resolved && relevant(resolved)) sources.push({ file: `${file}: ${resolved}`, css: `${resolved}{${rule.style.cssText}}` });
          // Modern CSSStyleRule also has cssRules, even when the list is empty.
          if (rule.cssRules) visitRules([...rule.cssRules], file, resolved || parentSelector);
        }
      }
    };
    const visit = sheet => {
      if (visited.has(sheet.href || sheet)) return;
      visited.add(sheet.href || sheet);
      try {
        if (sheet.ownerNode?.id === '__jig_freeze') return;
        visitRules([...sheet.cssRules], sheet.href || 'inline stylesheet');
      } catch {
        if (sheet.href && Object.hasOwn(localSheets, sheet.href)) {
          const css = localSheets[sheet.href];
          if (css !== null) {
            const parsed = new CSSStyleSheet(); parsed.replaceSync(css);
            visitRules([...parsed.cssRules], sheet.href);
          }
        } else if (sheet.href?.startsWith('file:')) inaccessible.push(sheet.href);
        else gaps.push(`${sheet.href || 'stylesheet'}: CSS rules inaccessible`);
      }
    };
    for (const sheet of document.styleSheets) visit(sheet);
    for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) {
      if (!link.sheet && !visited.has(link.href)) visit({ href: link.href, get cssRules() { throw new Error('Stylesheet missing'); } });
    }
    // Disk imports are supplied separately, so constructed stylesheets need
    // not fetch anything (replaceSync intentionally ignores @import).
    for (const [href, css] of Object.entries(localSheets)) if (!visited.has(href) && css !== null) {
      const parsed = new CSSStyleSheet(); parsed.replaceSync(css); visitRules([...parsed.cssRules], href);
    }
    const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
    for (const e of [root, ...root.querySelectorAll('[style]')].filter(e => e.hasAttribute('style'))) sources.push({ file: path(e), css: `*{${e.getAttribute('style')}}` });
    return { sources, gaps, inaccessible, rootChanged: getComputedStyle(document.documentElement).fontSize !== '16px' };
}

export function readLocalStylesheets(urls, read = path => readFileSync(path, 'utf8')) {
  const localSheets = {}, findings = [], gaps = [];
  const visit = href => {
    if (Object.hasOwn(localSheets, href)) return;
    if (!href.startsWith('file:')) { gaps.push(`${href}: imported CSS rules inaccessible`); return; }
    localSheets[href] = null; // Break cycles, including failed imports.
    try {
      const css = read(fileURLToPath(href));
      localSheets[href] = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)|"([^"]+)"|'([^']+)')[^;]*;/gi, (_, a, b, c, d, e) => {
        visit(new URL(a || b || c || d || e, href).href); return '';
      });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') findings.push({ kind: 'missing-stylesheet', element: href, file: href, measured: 'missing', expected: 'referenced stylesheet exists' });
      else gaps.push(`${href}: stylesheet read failed (${error.code || error.message})`);
    }
  };
  urls.forEach(visit);
  return { localSheets, findings, gaps };
}

export async function inspectStyles(page, selector = 'body') {
  let sources = await page.evaluate(styleSources, { selector });
  const disk = readLocalStylesheets(sources.inaccessible || []);
  if (Object.keys(disk.localSheets).length) sources = await page.evaluate(styleSources, { selector, localSheets: disk.localSheets });
  const results = sources.sources.map(s => lintCSS(s.css, { ...s, rootChanged: sources.rootChanged }));
  return { findings: [...disk.findings, ...results.flatMap(r => r.findings)], gaps: [...disk.gaps, ...sources.gaps, ...results.flatMap(r => r.gaps)] };
}

function linkedStylesheets(html, file) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].flatMap(([tag]) => {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    return href && rel?.split(/\s+/).includes('stylesheet') ? [new URL(href, pathToFileURL(file)).href] : [];
  });
}

export function lintDirectory(directory) {
  directory = resolve(directory);
  const sources = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(css|html)$/.test(entry.name)) sources.push({ file: relative(directory, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') });
    }
  };
  if (statSync(directory).isDirectory()) walk(directory);
  else {
    const text = readFileSync(directory, 'utf8');
    sources.push({ file: relative(dirname(directory), directory).replaceAll('\\', '/'), text });
    if (directory.endsWith('.html')) {
      const urls = linkedStylesheets(text, directory);
      const disk = readLocalStylesheets(urls);
      for (const [href, css] of Object.entries(disk.localSheets)) if (css !== null) sources.push({ file: relative(dirname(directory), fileURLToPath(href)).replaceAll('\\', '/'), text: css });
      if (disk.gaps.length || disk.findings.length) sources.push({ file: 'stylesheet-errors', text: '', disk });
    }
  }
  const base = statSync(directory).isDirectory() ? directory : dirname(directory);
  const findings = [], gaps = [];
  for (const s of sources) {
    if (s.disk) { findings.push(...s.disk.findings); gaps.push(...s.disk.gaps); continue; }
    const css = s.file.endsWith('.css') ? [s.text] : [...s.text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).concat([...s.text.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m => `*{${m[1] ?? m[2]}}`));
    const file = resolve(base, s.file);
    const context = gridContext(file, css.join('\n'), s.text);
    findings.push(...context.findings); gaps.push(...context.gaps);
    for (const text of css) {
      const result = lintCSS(text, { file: s.file, ...context }); findings.push(...result.findings); gaps.push(...result.gaps);
    }
  }
  return { findings, gaps };
}

// A small project sidecar declares the finite type scale. It is searched from
// the page/CSS directory upwards, so a nested project owns its own scale.
export function gridContext(file, css = '', html = '') {
  const urls = linkedStylesheets(html, file);
  const disk = readLocalStylesheets([...urls, ...(file.endsWith('.css') ? [pathToFileURL(file).href] : [])]);
  let directory = dirname(resolve(file)), config;
  while (true) {
    const candidate = join(directory, 'grid.config.json');
    if (existsSync(candidate)) { config = JSON.parse(readFileSync(candidate, 'utf8')); break; }
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  if (config && (config.version !== 1 || !Array.isArray(config.typeScale) || !config.typeScale.length || config.typeScale.some(n => !Number.isFinite(n) || n < 12) || new Set(config.typeScale).size !== config.typeScale.length || config.tokenFiles !== undefined && (!Array.isArray(config.tokenFiles) || config.tokenFiles.some(f => typeof f !== 'string' || !f)))) throw new Error('grid.config.json requires version 1, unique typeScale sizes >= 12px and optional tokenFiles paths');
  const declared = readLocalStylesheets((config?.tokenFiles || []).map(f => pathToFileURL(resolve(directory, f)).href));
  const combined = [...Object.values(declared.localSheets), ...Object.values(disk.localSheets), css].filter(Boolean).join('\n');
  // A linked token library may contain several opt-in project examples. Only
  // the page's sidecar selects its scale; importing the shell must not select
  // the library's Vast specimen for every existing toolbox document.
  return { tokens: cssTokens(combined), tokenChoices: cssTokenChoices(combined), typeScale: config?.typeScale, inferTypeScale: false, findings: [...disk.findings, ...declared.findings], gaps: [...disk.gaps, ...declared.gaps] };
}

export function styleKey(f) { return JSON.stringify([f.file, f.kind, f.property, f.measured]); }
// Counts ratchet too: duplicating an existing violation is a new finding.
export function styleDebt(findings, baseline = []) {
  const remaining = new Map(baseline.map(({ key, count }) => [key, count]));
  return findings.filter(f => {
    const key = styleKey(f), count = remaining.get(key) || 0;
    if (!count) return true;
    remaining.set(key, count - 1); return false;
  });
}
export function checkStyles(target = fileURLToPath(new URL('../../docs/design-toolbox/', import.meta.url))) {
  target = resolve(target);
  const report = lintDirectory(target);
  const toolbox = fileURLToPath(new URL('../../docs/design-toolbox/', import.meta.url));
  const rel = relative(toolbox, target);
  if (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !/^[A-Za-z]:/.test(rel)) {
    const prefix = statSync(target).isDirectory() ? rel : relative(toolbox, dirname(target));
    const debt = JSON.parse(readFileSync(join(toolbox, 'style-debt.json'), 'utf8'));
    report.findings = styleDebt(report.findings.map(f => ({ ...f, file: join(prefix, f.file).replaceAll('\\', '/') })), debt.entries);
  }
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1) throw new Error(`Usage: ${commandFor(import.meta.url)} [DIRECTORY|PAGE|CSS]`);
    const report = checkStyles(args[0]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.gaps.length ? 2 : report.findings.length ? 1 : 0;
  } catch (error) { console.log(JSON.stringify({ gaps: [error.message] })); process.exitCode = 2; }
}
