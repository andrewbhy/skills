// Source contract only; rendered geometry and visibility require separate review.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { breadcrumb, brand, pageName, localPath, htmlFiles, toolboxRoot } from './page-shell.mjs';

// Runtime pages serve the same files at /brand rather than toolbox-relative URLs.
export function inspectBrandArtwork(html) {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const findings = [];
  const brands = [...source.matchAll(/<a\b[^>]*class="[^"]*\b(?:brand|app-brand)\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map(m => m[0]);
  if (brands.length !== 1) findings.push('page must have exactly one shared brand');
  for (const markup of brands) {
    if (!/<img\b[^>]*src="[^"\s]*\/(?:ji-red-23|ji-white-23)\.svg"/.test(markup) || !/<img\b[^>]*src="[^"\s]*\/jig-wordmark-(?:charcoal|white)\.svg"/.test(markup)) findings.push('brand must use the shared artwork');
  }
  if (/clamp-fence\.svg|M4 5v23h25/.test(source)) findings.push('provisional brand mark is forbidden');
  return findings;
}

export function inspectShell(html, file) {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const findings = [];
  if (!source.includes(breadcrumb(file, pageName(source)))) findings.push('missing or drifted shared breadcrumb/brand shell');
  if (!/<body\b[^>]*\sdata-grid(?:[\s=>])/.test(source)) findings.push('body must opt in to grid tokens with data-grid');
  for (const target of ['jig-pages.css', 'grid/tokens.css']) {
    if (!source.includes(`<link rel="stylesheet" href="${localPath(file, target)}">`)) findings.push(`missing shared stylesheet: ${target}`);
  }
  // The candidates page may exhibit historical artwork, never as its brand.
  const brands = [...source.matchAll(/<a\b[^>]*class="[^"]*\b(?:brand|app-brand)\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map(m => m[0]);
  if (brands.some(markup => markup !== brand(file) && markup !== brand(file, 'app-brand'))) findings.push('brand must use the shared artwork markup');
  if (/clamp-fence\.svg|M4 5v23h25/.test(brands.join('\n')) || file !== 'logo/logo.html' && /clamp-fence\.svg|M4 5v23h25/.test(source)) findings.push('provisional brand mark is forbidden');
  return findings;
}
export function checkPageShells(root = toolboxRoot) {
  const files = htmlFiles(root);
  const findings = files.flatMap(absolute => {
    const file = path.relative(root, absolute).replaceAll('\\', '/');
    const html = readFileSync(absolute, 'utf8');
    return inspectShell(html, file).map(message => `${file}: ${message}`);
  });
  // Verify the canonical dependencies too, so a valid-looking broken path fails.
  for (const file of ['jig-pages.css', 'grid/tokens.css', 'logo/final/ji-red-23.svg', 'logo/final/jig-wordmark-charcoal.svg']) {
    if (!existsSync(path.join(root, file))) findings.push(`missing shell dependency: ${file}`);
  }
  return { pages: files.length, findings };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const report = checkPageShells();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.findings.length ? 1 : 0;
}
