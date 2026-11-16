if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-thread-links.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// New home: every plain activation of a /t/<id> link opens the session panel
// instead of navigating. The anchors keep their real href, so modified clicks
// (ctrl, meta, shift, middle) and open-in-new-tab stay the browser's own.
// Serialized into the page like the other panel modules; keep it self-contained.
export function createThreadLinks(document, window, { open, owner }) {
  const match = href => { const m = /^\/t\/([^/?#]+)$/.exec(href || ''); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return null; } };
  const inPanel = node => { for (let n = node; n; n = n.parentNode || n.parentElement) if (n.id === 'session-panel') return true; return false; };
  const anchorOf = node => { for (let n = node; n; n = n.parentNode || n.parentElement) if (n.tagName === 'A' && n.getAttribute && match(n.getAttribute('href'))) return n; return null; };
  const show = (topic, title, restore) => { open({ kind: 'link', topic, title: title || topic, owner: owner ? owner(topic) : undefined, restore }); };
  const click = e => {
    if (e.defaultPrevented || (e.button || 0) !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = anchorOf(e.target); if (!a || inPanel(a)) return;
    e.preventDefault(); show(match(a.getAttribute('href')), (a.textContent || '').trim(), a);
  };
  // Enter on a selected row: rows carry data-href; non-thread hrefs keep navigating.
  const enter = row => {
    const topic = match(row.dataset.href);
    if (!topic) { window.location.href = row.dataset.href; return; }
    const link = row.querySelector && (row.querySelector('a.t') || row.querySelector('a.rt') || row.querySelector('a'));
    show(topic, ((link && link.textContent) || row.title || '').trim(), row);
  };
  document.addEventListener('click', click);
  return { click, enter, match };
}
