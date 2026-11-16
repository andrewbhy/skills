if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/page-shell.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// One static shell for file:// documents and generated pages. No runtime fetch.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const toolboxRoot = path.dirname(fileURLToPath(import.meta.url));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export const localPath = (file, target) => path.posix.relative(path.posix.dirname(file), target) || path.posix.basename(target);
export function brand(file, className = 'brand') {
  const link = target => localPath(file, target);
  return `<a class="${className}" href="${link('../../README.md')}" aria-label="jig"><img class="brand-mark" src="${link('logo/final/ji-red-23.svg')}" width="23" height="23" alt=""><img class="brand-wordmark" src="${link('logo/final/jig-wordmark-charcoal.svg')}" alt="" height="23"></a>`;
}
export function pageName(html) {
  return html.match(/<nav class="breadcrumb"[^>]*>[\s\S]*?<span aria-current="page">([^<]*)<\/span>/)?.[1]
    ?? html.match(/<title>([^<]+?)(?:\s*[·|]\s*jig)?<\/title>/i)?.[1] ?? 'Design toolbox';
}
export function breadcrumb(file, name) {
  const link = target => localPath(file, target);
  const current = file === 'index.html' ? ' aria-current="page"' : '';
  return `<nav class="breadcrumb" aria-label="Breadcrumb" data-jig-shell="1" data-ledger="site-shell">${brand(file)}<span aria-hidden="true">/</span><a href="${link('index.html')}"${current}>Design toolbox</a>${file === 'index.html' ? '' : `<span aria-hidden="true">/</span><span aria-current="page">${escape(name)}</span>`}</nav>`;
}
export function pageShell(html, file, name = pageName(html)) {
  let result = html.replaceAll('\r\n', '\n');
  // Explicit imports make dependencies visible even for pages with inlined CSS.
  for (const target of ['jig-pages.css', 'grid/tokens.css']) {
    const href = localPath(file, target);
    if (!result.includes(`<link rel="stylesheet" href="${href}">`)) {
      result = result.replace(/<\/head>/i, `<link rel="stylesheet" href="${href}">\n</head>`);
    }
  }
  result = result.replace(/<body\b([^>]*)>/i, (tag, attrs) => /\bdata-grid(?:\s|=|$)/.test(attrs) ? tag : `<body${attrs} data-grid>`);
  const nav = breadcrumb(file, name);
  if (result.includes('<nav class="breadcrumb"')) {
    result = result.replace(/<nav class="breadcrumb"[^>]*>[\s\S]*?<\/nav>/, nav);
  } else {
    result = result.replace(/<body\b[^>]*>/i, tag => `${tag}\n<header class="page-header" data-ledger="site-shell">${nav}</header>`);
  }
  result = result.replace(/<a class="app-brand"[^>]*>[\s\S]*?<\/a>/g, brand(file, 'app-brand'));
  return result;
}
export function htmlFiles(directory = toolboxRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  }).sort();
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).join(' ') !== '--write') throw Error('Usage: node docs/design-toolbox/page-shell.mjs --write');
  for (const absolute of htmlFiles()) {
    const file = path.relative(toolboxRoot, absolute).replaceAll('\\', '/');
    writeFileSync(absolute, pageShell(readFileSync(absolute, 'utf8'), file));
  }
  console.log('Updated toolbox page shells. Regenerate generated pages before checking drift.');
}
