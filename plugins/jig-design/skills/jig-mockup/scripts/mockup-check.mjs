if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-mockup/scripts/mockup-check.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately a static lint, never a DOM, CSS cascade or JavaScript evaluator.
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const regions = new Set('main nav aside section article header footer form dialog table ul ol li tr details fieldset iframe'.split(' '));
const regionRoles = new Set('region navigation complementary main banner contentinfo dialog toolbar tablist tabpanel list listitem grid row tree treeitem menu group'.split(' '));
const colourNames = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const glyphs = /[⌄▸◇›⋯◔▤⌖↗▶✳‖✓×‹⌃→←↑↓↘↖↙↔]|\bII\b/gu;
const decode = text => text.replace(/&#(x[\da-f]+|\d+);?/gi, (_, n) => {
  const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
  return value <= 0x10ffff ? String.fromCodePoint(value) : '\ufffd';
}).replace(/&(?:rsaquo|hellip);/gi, entity => entity.toLowerCase() === '&rsaquo;' ? '›' : '…');
const blank = text => text.replace(/[^\n]/g, ' ');
const uncomment = text => text.replace(/\/\*[\s\S]*?\*\//g, blank);
const unquote = text => text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, blank);

export function ledgerIds(text) {
  if (text.trim().startsWith('[')) {
    const ids = JSON.parse(text);
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Ledger JSON must be a nonempty array of IDs');
    return new Set(ids);
  }
  const ids = [...text.matchAll(/^\|\s*`?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`?\s*\|/gm)].map(m => m[1]);
  if (!ids.length) throw new Error('Ledger needs a Markdown ID column with kebab-case IDs, or a JSON array of IDs');
  return new Set(ids);
}

function attributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

function parseHTML(html, gap) {
  const nodes = [], stack = [];
  const pattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/g;
  let consumed = 0;
  for (let m; (m = pattern.exec(html));) {
    if (m.index > consumed) gap('html', consumed, 'Unparsed HTML; use well-formed explicit markup');
    const part = m[0];
    consumed = pattern.lastIndex;
    if (/^<!/.test(part)) continue;
    if (/^<\//.test(part)) {
      const tag = part.slice(2, -1).trim().toLowerCase();
      const index = stack.findLastIndex(n => n.tag === tag);
      if (index < 0) gap('html', m.index, `Unmatched closing ${tag}`);
      else stack.splice(index);
    } else if (part.startsWith('<')) {
      const match = part.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);
      if (!match) continue;
      const node = { tag: match[1].toLowerCase(), attrs: attributes(match[2]), parent: stack.at(-1), text: '', ownText: '', offset: m.index };
      nodes.push(node);
      if (['script', 'style'].includes(node.tag)) {
        const end = new RegExp(`</${node.tag}\\s*>`, 'ig');
        end.lastIndex = pattern.lastIndex;
        const close = end.exec(html);
        node.text = html.slice(pattern.lastIndex, close ? close.index : html.length);
        if (!close) gap('html', m.index, `Unclosed ${node.tag}`);
        pattern.lastIndex = close ? end.lastIndex : html.length;
        consumed = pattern.lastIndex;
      } else if (!voidTags.has(node.tag) && !part.endsWith('/>')) stack.push(node);
    } else {
      if (stack.length) stack.at(-1).ownText += decode(part);
      for (const node of stack) node.text += decode(part);
    }
  }
  if (consumed < html.length) gap('html', consumed, 'Unparsed HTML');
  if (stack.length) gap('html', stack.at(-1).offset, `Unclosed ${stack.at(-1).tag}`);
  return nodes;
}

// Walk balanced blocks; strings and comments cannot create fake declarations.
function cssRules(css, gap, base = 0) {
  const rules = [], clean = uncomment(css);
  const masked = unquote(clean);
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ';') start = i + 1;
    if (masked[i] !== '{') continue;
    const head = clean.slice(start, i).trim();
    let end = i + 1, depth = 1;
    for (; end < masked.length && depth; end++) depth += masked[end] === '{' ? 1 : masked[end] === '}' ? -1 : 0;
    if (depth) { gap(base + i, 'Unclosed CSS block'); break; }
    const body = clean.slice(i + 1, end - 1);
    if (head.startsWith('@') || masked.slice(i + 1, end - 1).includes('{')) {
      if (/^@(media|supports|layer|container|(?:-webkit-)?keyframes)\b/.test(head)) rules.push(...cssRules(body, gap, base + i + 1));
      else gap(base + start, `Manual CSS review: ${head || 'nested rule'}`);
    } else rules.push({ selector: head, body, offset: base + i + 1 });
    i = end - 1; start = end;
  }
  return rules;
}

function declarations(body) {
  const masked = unquote(body);
  const result = [];
  let start = 0, depth = 0;
  for (let i = 0; i <= masked.length; i++) {
    if (masked[i] === '(') depth++;
    if (masked[i] === ')') depth--;
    if ((masked[i] === ';' && depth === 0) || i === masked.length) {
      const text = body.slice(start, i), colon = text.indexOf(':');
      if (colon >= 0) result.push({ property: text.slice(0, colon).trim().toLowerCase(), value: text.slice(colon + 1).trim(), offset: start });
      start = i + 1;
    }
  }
  return result;
}

function simpleMatches(node, selector) {
  if (!node) return false;
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && node.tag !== tag.toLowerCase()) return false;
  for (const m of selector.matchAll(/([.#])([\w-]+)|\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
    if (m[1] === '#' && node.attrs.id !== m[2]) return false;
    if (m[1] === '.' && !(node.attrs.class ?? '').split(/\s+/).includes(m[2])) return false;
    if (m[3] && (!(m[3] in node.attrs) || (m[4] !== undefined && node.attrs[m[3]] !== m[4]))) return false;
  }
  return true;
}

function stateMatches(node, selector, state) {
  // Only simple selectors with state on the target prove coverage. Complex CSS
  // remains a finding/gap, rather than borrowing an unrelated button's styles.
  if (!new RegExp(`:${state}(?![\\w-])`).test(selector)) return false;
  const base = selector.replace(new RegExp(`:${state}(?![\\w-])`, 'g'), '').trim();
  if (/[:>+~\s()]/.test(base)) return false;
  return simpleMatches(node, base);
}

export function checkMockup({ html, ledger, tokens = [], styles = [], file = 'mock.html' }) {
  if (!(ledger instanceof Set) || !ledger.size || !tokens.length) throw new Error('A nonempty ledger and at least one authoritative token CSS file are required');
  const findings = [], gaps = [];
  const add = (kind, source, offset, message, target = findings) => target.push({ kind, file: source.name, line: (source.lineOffset ?? 0) + source.text.slice(0, offset).split('\n').length, message });
  const document = { name: file, text: html };
  const gap = (kind, offset, message) => add(kind, document, offset, message, gaps);
  const nodes = parseHTML(html, gap);
  if (!nodes.some(n => !['html', 'body', 'head', 'title', 'meta', 'link', 'style', 'script'].includes(n.tag))) gap('html', 0, 'No component markup found');
  const tokenNames = new Set(tokens.flatMap(source => [...uncomment(source.text).matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1])));
  if (!tokenNames.size) throw new Error('Token CSS defines no custom properties');
  const cssSources = [...styles];
  const rules = [];
  for (const node of nodes) {
    const lineOffset = html.slice(0, node.offset).split('\n').length - 1;
    if (node.tag === 'style') cssSources.push({ name: file, text: node.text, lineOffset });
    if (node.attrs.style) cssSources.push({ name: file, text: `inline {${node.attrs.style}}`, lineOffset });
    for (const property of ['fill', 'stroke', 'color', 'bgcolor', 'stop-color', 'flood-color', 'lighting-color']) if (node.attrs[property]) cssSources.push({ name: file, text: `svg {${property}:${node.attrs[property]}}`, lineOffset });
    if (node.tag === 'script' && /innerHTML|outerHTML|insertAdjacentHTML|createElement|document\.write/.test(node.text)) gap('dynamic-html', node.offset, 'Generated DOM needs replay/exported markup checked separately; script is not executed');
    if (node.tag === 'script' && /\.style\b|CSSStyleSheet|setAttribute\s*\(\s*['"]style['"]/.test(node.text)) gap('dynamic-css', node.offset, 'Scripted styles need exported CSS and manual review; script is not executed');
    if (['script', 'style', 'html', 'body', 'head', 'title', 'meta', 'link', 'base'].includes(node.tag) || ancestor(node, n => n.tag === 'head')) continue;
    const own = node.attrs['data-ledger'];
    const region = regions.has(node.tag) || regionRoles.has(node.attrs.role) || 'data-component' in node.attrs || /(?:^|\s)(?:node|card|row|pane|panel|canvas|composer)(?:\s|$)/.test(node.attrs.class ?? '');
    if (own !== undefined && (!own.trim() || !ledger.has(own))) add('ledger-unknown', document, node.offset, `Unknown or empty data-ledger: ${own}`);
    if (own === undefined && (region || !ancestor(node, n => Boolean(n.attrs['data-ledger'])))) add('ledger-missing', document, node.offset, `${node.tag}${node.attrs.id ? '#' + node.attrs.id : ''} has no ${region ? 'own component' : 'containing'} data-ledger`);
    const reading = node.attrs['data-reading-content'] === 'true' || ancestor(node, n => n.attrs['data-reading-content'] === 'true');
    if (reading && !ancestor(node, n => Boolean(n.attrs['data-ledger'])) && !own) gap('reading-content', node.offset, 'Reading-content exemption needs a ledger purpose');
    const iconContext = 'data-icon' in node.attrs || /(?:^|\s)(?:icon|glyph)(?:\s|$)/.test(node.attrs.class ?? '') || ['button', 'summary'].includes(node.tag) || ['button', 'menuitem'].includes(node.attrs.role);
    const visible = (iconContext ? node.text : node.ownText).trim();
    if (!reading || iconContext) {
      for (const match of visible.matchAll(glyphs)) add('text-icon', document, node.offset, `Text character used as icon: ${match[0]}; use the project's SVG set`);
    }
  }
  for (const source of cssSources) {
    if (/@import\b/i.test(uncomment(source.text))) add('css-import', source, 0, 'Imported CSS is not checked; inline it or supply it with --css', gaps);
    const parsed = cssRules(source.text, (offset, message) => add('css', source, offset, message, gaps));
    rules.push(...parsed);
    for (const rule of parsed) for (const declaration of declarations(rule.body)) {
      const { property, value } = declaration;
      const offset = rule.offset + declaration.offset;
      if (property.startsWith('--') && !tokenNames.has(property)) add('token-definition', source, offset, `Undeclared project token ${property}; definitions belong in token files`);
      for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) if (!tokenNames.has(match[1])) add('token-unknown', source, offset, `Unknown project token ${match[1]}`);
      const plain = unquote(value).replace(/url\([^)]*\)/gi, '').replace(/var\(\s*--[\w-]+/g, 'var(');
      const colourProperty = /color|background|border|outline|shadow|fill|stroke|column-rule/.test(property) || property.startsWith('--');
      if (/#(?:[\da-f]{3,8})\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(plain) || (colourProperty && [...plain.matchAll(/\b[a-z]+\b/gi)].some(m => colourNames.has(m[0].toLowerCase())))) add('raw-colour', source, offset, `Colour literal outside authoritative token files in ${property}: ${value}`);
      if (property === 'content' && glyphs.test(decode(value.replace(/\\([\da-f]{1,6})\s?/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))))) add('text-icon', source, offset, 'CSS generated text icon; use SVG');
      glyphs.lastIndex = 0;
    }
  }
  for (const node of nodes.filter(n => n.tag === 'button' || n.attrs.role === 'button' || (n.tag === 'input' && /^(button|submit|reset)$/.test(n.attrs.type)))) {
    for (const state of ['hover', 'focus']) {
      if (!rules.some(rule => declarations(rule.body).length && rule.selector.split(',').some(selector => stateMatches(node, selector.trim(), state === 'focus' ? '(?:focus|focus-visible)' : state)))) add(`button-${state}`, document, node.offset, `${node.tag}${node.attrs.id ? '#' + node.attrs.id : ''} needs an explicit ${state} style targeting it (complex selectors require manual review)`);
    }
  }
  return { status: gaps.length ? 'inconclusive' : findings.length ? 'findings' : 'passed', findings, gaps, limits: 'Static source only: no cascade, computed layout, visibility, contrast, motion, keyboard or generated DOM proof. Component divs need data-component or a recognised class; review the region inventory.' };
}

function ancestor(node, predicate) {
  for (let parent = node.parent; parent; parent = parent.parent) if (predicate(parent)) return parent;
}

export function run(argv) {
  const [file, ...args] = argv;
  if (!file || file.startsWith('--')) throw new Error('Usage: mockup-check.mjs mock.html --ledger purpose.md --tokens tokens.css [--tokens pack/theme.css] [--css extra.css] [--json]');
  let ledger, json = false;
  const tokens = [], styles = [];
  const read = path => ({ name: resolve(path), text: readFileSync(resolve(path), 'utf8') });
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { json = true; continue; }
    if (!['--ledger', '--tokens', '--css'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument ${args[i]}`);
    const option = args[i], source = read(args[++i]);
    if (option === '--ledger') ledger = ledgerIds(source.text);
    else (option === '--tokens' ? tokens : styles).push(source);
  }
  const source = read(file);
  const links = parseHTML(source.text, () => {}).filter(n => n.tag === 'link' && n.attrs.rel === 'stylesheet');
  for (const link of links) {
    const href = link.attrs.href;
    if (!href || /^(?:[a-z]+:|\/\/|\/)/i.test(href)) throw new Error('Stylesheets must be relative local files');
    const linked = read(resolve(dirname(source.name), decodeURIComponent(href)));
    if (!tokens.some(token => token.name === linked.name) && !styles.some(style => style.name === linked.name)) styles.push(linked);
  }
  const report = checkMockup({ html: source.text, file: source.name, ledger, tokens, styles });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Mockup static check: ${report.status}`);
    for (const finding of [...report.findings, ...report.gaps]) console.log(`${finding.file}:${finding.line} [${finding.kind}] ${finding.message}`);
    console.log(report.limits);
  }
  return report.status === 'inconclusive' ? 2 : report.status === 'findings' ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch (error) {
    console.log(JSON.stringify({ status: 'inconclusive', error: error.message }));
    process.exitCode = 2;
  }
}
