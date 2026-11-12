// The chosen jig identity (docs/design-toolbox/logo/final/README.md): the 지 tile and the outlined Stardos Stencil wordmark.
// The files are served unchanged from the repo under /brand/<name>.svg (allowlist below). Never stretched, never live text:
// the tile is fitted at 23 CSS px, the wordmark is scaled by height only. White tile and wordmark on dark grounds, the red
// tile and charcoal wordmark on light grounds. "control tower" is plain text beside them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../docs/design-toolbox/logo/final/', import.meta.url));
export const brandFiles = new Set(['ji-white-23.svg', 'ji-red-20.svg', 'ji-red-21.svg', 'ji-red-22.svg', 'ji-red-23.svg', 'jig-wordmark-white.svg', 'jig-wordmark-charcoal.svg']);
export function brandFile(name) {
  if (!brandFiles.has(name)) return null;
  try { return readFileSync(dir + name); } catch { return null; }
}

export const faviconLink = '<link rel="icon" type="image/svg+xml" href="/brand/ji-red-23.svg">';
export const brandCss = `.brand,.brand:visited{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;white-space:nowrap}.brand:hover{text-decoration:none}
.brand img{display:block;flex:none}.brand .brand-wordmark{height:23px;width:auto}.brand .sub{font-weight:400;opacity:.8;font-size:.95em}
.brand .on-dark{display:none}
@media (prefers-color-scheme:dark){.brand.auto .on-light{display:none}.brand.auto .on-dark{display:block}}
.brand.dark .on-light{display:none}.brand.dark .on-dark{display:block}
/* one header for Home and thread pages: same height, padding, type size, ground and contrast */
.tower-hdr{display:flex;align-items:center;gap:16px;box-sizing:border-box;min-height:56px;padding:0 24px;background:#1d1d1f;color:#fff;font-size:16px;line-height:1.3;border-bottom:1px solid #000}
.tower-hdr .brand .sub{font-size:16px;opacity:.9}
.tower-hdr a,.tower-hdr a:visited{color:#9cf}.tower-hdr a.brand,.tower-hdr a.brand:visited{color:#fff}
.tower-hdr button.sec{color:#fff;border-color:#fff8;font-size:14px}.tower-hdr button.sec:hover{background:#fff2}
.tower-hdr h1{font-size:16px;font-weight:600}`;
const img = (cls, file, h, w) => `<img class="${cls}" src="/brand/${file}" height="${h}"${w ? ` width="${w}"` : ''} alt="">`;
// ground: 'dark' (white artwork, for the dark tower header) or 'auto' (red on light, white in dark mode)
export const brandHtml = ({ ground = 'dark', sub = true } = {}) => `<a class="brand ${ground}" href="/" aria-label="jig control tower" title="jig control tower">${img('brand-mark on-light', 'ji-red-23.svg', 23, 23)}${img('brand-mark on-dark', 'ji-white-23.svg', 23, 23)}${img('brand-wordmark on-light', 'jig-wordmark-charcoal.svg', 23)}${img('brand-wordmark on-dark', 'jig-wordmark-white.svg', 23)}${sub ? '<span class="sub">control tower</span>' : ''}</a>`;
