import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual } from './visual-clip.mjs';

// Text must be readable with vertical scrolling alone at 320 CSS px. Tables
// and labelled visual canvases may own a horizontal viewport; text elsewhere
// cannot borrow that exception. This is geometry evidence, not WCAG approval.
export function inspectReflow(selector = 'body') {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const findings = [], gaps = [];
  if (innerWidth !== 320) return { findings, gaps: ['Reflow requires a 320 CSS px viewport'] };
  const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node, count = 0;
  while ((node = walker.nextNode())) {
    if (++count > 20000) throw new Error('Root exceeds 20000 text nodes; narrow selector');
    const e = node.parentElement, s = getComputedStyle(e);
    if (!node.textContent.trim() || e.closest('script,style,noscript,[hidden]') || s.visibility !== 'visible' || !e.getClientRects().length) continue;
    // Exemptions require both a named region and a structural reason. Arbitrary
    // prose with overflow:auto is still a failure, even if given a label.
    const exception = e.closest('table,[data-reflow-canvas][aria-label]');
    if (exception) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    if (!rects.length) continue;
    let failure = rects.some(r => r.left < -1 || r.right > 321);
    let ancestor;
    for (let a = e; a; a = a.parentElement) {
      const style = getComputedStyle(a);
      if (/^(auto|scroll)$/.test(style.overflowX) && a.scrollWidth > a.clientWidth + 1) { failure = true; ancestor = path(a); break; }
    }
    if (failure) findings.push({ kind: 'text-reflow', element: path(e), ancestor, text: node.textContent.trim().slice(0, 100), expected: 'text fits 320 CSS px without horizontal scrolling' });
  }
  return { findings, gaps };
}

export async function runReflow(options) {
  // Ignore caller width: the reflow contract is always 320 CSS px.
  return runVisual({ ...options, sizes: [{ width: 320, height: options.sizes?.[0]?.height || 800 }] }, 'reflow', (page, scoped) => page.evaluate(inspectReflow, scoped.root));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runReflow);
