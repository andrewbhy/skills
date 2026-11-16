if (process.argv[2] === '--help') { console.log('Usage: node scripts/visual-overlap.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Sibling content, including positioned insets, must have distinct painted areas.
// Ancestor/descendant containment and decorative backgrounds are not peer ink.
export function analyseOverlap(elements) {
  const findings = [], exceptions = [];
  for (const siblings of Map.groupBy(elements, e => e.parent).values()) {
    // Sweep along x rather than compare every pair in a long list.
    const sorted = siblings.toSorted((a, b) => a.rect.x - b.rect.x);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j], r = a.rect, s = b.rect;
      if (s.x >= r.x + r.width) break;
      const width = Math.min(r.x + r.width, s.x + s.width) - Math.max(r.x, s.x);
      const height = Math.min(r.y + r.height, s.y + s.height) - Math.max(r.y, s.y);
      if (width <= 1 || height <= 1) continue;
      // SVG composes contained paint: labels on plates and icons in discs.
      if (a.svg && b.svg && ((width >= r.width && height >= r.height) || (width >= s.width && height >= s.height))) continue;
      const finding = { kind: 'overlap', element: a.element, other: b.element, ancestor: a.parent,
        rect: { x: Math.max(r.x, s.x), y: Math.max(r.y, s.y), width, height },
        measured: { width, height }, expected: 'sibling content boxes do not intersect (1px tolerance)' };
      const reason = a.allowed?.[b.element] || b.allowed?.[a.element];
      if (reason) exceptions.push({ ...finding, reason }); else findings.push(finding);
    }
  }
  return { findings, exceptions, gaps: [] };
}

export function overlapTargets(selector) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const path = e => e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName;
  const all = [root, ...root.querySelectorAll('*')];
  if (all.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const content = e => e.matches('svg,img,canvas,input,button,select,textarea') || Boolean(e.textContent.trim()) || getComputedStyle(e).backgroundImage !== 'none';
  return all.filter(e => e !== root && !e.matches('option,optgroup') && !e.parentElement?.closest('select,textarea,defs,marker,clipPath,mask') &&
    (e.closest('svg') ? e.matches('svg,rect,circle,ellipse,use,text,image,foreignObject') : content(e))).flatMap(e => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility !== 'visible' || s.display === 'none' || Number(s.opacity) === 0 || e.closest('[hidden]') ||
      e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return [];
    const allowed = {}, reason = e.getAttribute('data-visual-overlap-reason')?.trim();
    if (reason) for (const peer of e.parentElement.children) {
      const selectors = e.getAttribute('data-visual-overlap-with');
      if (selectors && peer.matches(selectors)) allowed[path(peer)] = reason;
    }
    return [{ element: path(e), parent: path(e.parentElement), allowed, svg: Boolean(e.closest('svg')), rect: { x: r.x, y: r.y, width: r.width, height: r.height } }];
  });
}

export async function inspectOverlap(page, selector) {
  const measurements = await page.evaluate(overlapTargets, selector);
  return { ...analyseOverlap(measurements), measurements };
}
