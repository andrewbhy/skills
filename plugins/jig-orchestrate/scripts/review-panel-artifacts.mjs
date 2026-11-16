if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-panel-artifacts.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// The panel uses the thread API's validated catalog. No independent discovery.
export const artifactCss = `
#session-panel .session-full{display:inline-block;margin-top:8px;font-size:12px;color:var(--text-secondary)}
#session-panel .session-files{padding:0;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--needs-page-bg)}
#session-panel .artifact-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border-divider);min-height:40px}
#session-panel .artifact-title{margin:0;font-size:14px;min-width:0;overflow-wrap:anywhere}
#session-panel .artifact-body{display:flex;flex-direction:column;flex:1;min-height:0}
#session-panel .artifact-history{padding:12px 20px;background:var(--surface-frame-body);border-bottom:1px solid var(--border-divider)}
#session-panel .artifact-label{font-size:12px;color:var(--text-secondary);margin:0 0 8px}
#session-panel .artifact-strip{display:flex;overflow-x:auto;gap:8px;padding:4px;scrollbar-gutter:stable}
#session-panel .artifact-entry{flex:0 0 164px;min-width:0;display:grid;grid-template-columns:20px minmax(0,1fr);gap:4px 6px;text-align:left;background:var(--needs-page-bg);border-color:var(--action-open-border)}
#session-panel .artifact-entry[aria-pressed="true"]{outline:2px solid var(--needs-focus-ring);outline-offset:-2px}
#session-panel .artifact-icon{grid-row:1/4;font-size:18px}
#session-panel .artifact-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}
#session-panel .artifact-time{font-size:11px;color:var(--text-secondary)}
#session-panel .artifact-current{font-size:11px;visibility:hidden}
#session-panel .artifact-entry[aria-pressed="true"] .artifact-current{visibility:visible}
#session-panel .artifact-tools[hidden]{display:none}
#session-panel .artifact-tools{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:10px 20px;font-size:12px}
#session-panel .artifact-path{display:block;width:100%;font-size:11px;overflow-wrap:anywhere;color:var(--text-secondary)}
#session-panel .artifact-status{font-size:12px;margin:0;padding:0 20px;color:var(--text-secondary)}
#session-panel .artifact-status:empty{display:none}
#session-panel .artifact-preview{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
#session-panel .artifact-preview iframe{display:block;width:100%;height:100%;border:0;background:var(--needs-page-bg);color-scheme:light dark}
#session-panel .artifact-preview img{display:block;max-width:100%;height:auto;margin:auto}
#session-panel .artifact-empty{padding:24px;font-size:14px;overflow-wrap:anywhere}
#session-panel .artifact-divider{width:24px;cursor:col-resize;touch-action:none;border-inline:1px solid var(--border-divider);background:var(--surface-frame-body);box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:var(--text-secondary)}
#session-panel .artifact-divider:after{content:'⋮'}
#session-panel .artifact-dragging iframe{pointer-events:none}
#session-panel .artifact-collapsed{grid-template-columns:auto minmax(0,1fr)!important}
#session-panel .artifact-collapsed .artifact-body,#session-panel .artifact-collapsed .artifact-divider,#session-panel .artifact-collapsed .artifact-title{display:none}
#session-panel .artifact-collapsed .artifact-heading{border-bottom:0;padding:12px}
@media(max-width:700px){#session-panel .session-body{grid-template-rows:minmax(180px,1fr) minmax(300px,1fr);overflow:auto}#session-panel .session-files{display:flex}#session-panel .artifact-divider{display:none}#session-panel .artifact-collapsed{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto minmax(300px,1fr)}}
`;

// Script-free markdown document; all colours come from the tower's base pack.
export const markdownPreviewCss = `
body{margin:0;background:var(--surface-canvas);color:var(--text-primary);font:15px/1.7 system-ui,sans-serif}
main{max-width:90ch;margin:auto;padding:24px;overflow-wrap:anywhere}
a{color:var(--text-primary);text-underline-offset:3px}img{max-width:100%}
pre,code{background:var(--surface-frame-body);color:var(--text-primary)}pre{padding:12px;white-space:pre-wrap}
table{border-collapse:collapse}td,th{border:1px solid var(--border-divider);padding:6px 10px}
blockquote{margin-inline:0;padding-left:16px;border-left:3px solid var(--action-open-border)}
:focus-visible{outline:3px solid var(--needs-focus-ring)}
`;

// Serialized into the page: dependencies arrive through arguments only.
export function createPanelArtifacts({ document, window, host, body }) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
  host.textContent = ''; host.setAttribute('aria-label', 'Session artifacts');
  const heading = el('div', 'artifact-heading'), title = el('h2', 'artifact-title', 'Artifact');
  const collapse = el('button', 'artifact-collapse', 'Hide artifact'); collapse.type = 'button';
  heading.append(title, collapse);
  const content = el('div', 'artifact-body'), history = el('div', 'artifact-history');
  const label = el('p', 'artifact-label', 'Thread artifacts · Newest first · ← → to browse');
  const strip = el('div', 'artifact-strip'); strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-label', 'Thread artifacts, newest first'); strip.setAttribute('aria-orientation', 'horizontal');
  history.append(label, strip);
  const tools = el('div', 'artifact-tools'), original = el('a', 'artifact-original', 'Open original ↗'), copy = el('button', 'artifact-copy', 'Copy file path'), path = el('span', 'artifact-path');
  original.target = '_blank'; original.rel = 'noopener noreferrer'; copy.type = 'button'; tools.append(original, copy, path);
  const status = el('p', 'artifact-status'); status.setAttribute('role', 'status');
  const preview = el('div', 'artifact-preview'); preview.tabIndex = 0; preview.setAttribute('role', 'region'); preview.setAttribute('aria-label', 'Artifact preview');
  content.append(history, tools, status, preview); host.append(heading, content);
  const divider = el('div', 'artifact-divider'); divider.tabIndex = 0; divider.setAttribute('role', 'separator'); divider.setAttribute('aria-label', 'Resize artifact and chat'); divider.setAttribute('aria-orientation', 'vertical'); divider.setAttribute('aria-valuemin', '35'); divider.setAttribute('aria-valuemax', '70');
  // The caller appends chat after constructing this controller.
  body.append(divider);
  let topic = null, state = null, items = [], shown = null, active = false, frame = null, signature = '';
  const states = new Map();
  const key = () => 'jig-panel-artifacts:' + topic;
  const save = () => { if (!state) return; try { window.sessionStorage.setItem(key(), JSON.stringify(state)); } catch { status.textContent = 'Artifact position could not be saved for reload.'; } };
  function read(id) {
    if (states.has(id)) return states.get(id);
    let raw; try { raw = JSON.parse(window.sessionStorage.getItem('jig-panel-artifacts:' + id) || 'null'); } catch { /* Use defaults for unavailable or corrupt storage. */ }
    const n = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const value = { href: typeof raw?.href === 'string' ? raw.href : null, collapsed: raw?.collapsed === true, split: n(raw?.split) && raw.split >= 35 && raw.split <= 70 ? raw.split : 48, strip: n(raw?.strip) ? raw.strip : 0, scrolls: {} };
    for (const [href, pos] of Object.entries(raw?.scrolls || {})) if (n(pos?.top) && n(pos?.left)) Object.defineProperty(value.scrolls, href, { value: pos, enumerable: true, writable: true, configurable: true });
    states.set(id, value); return value;
  }
  function layout() {
    if (!state) return;
    body.classList[state.collapsed ? 'add' : 'remove']('artifact-collapsed');
    // Below 700px the stylesheet stacks the panes; width preferences stay intact.
    body.style.gridTemplateColumns = window.innerWidth <= 700 ? '' : `minmax(0,${state.split}%) 24px minmax(0,1fr)`;
    collapse.setAttribute('aria-expanded', String(!state.collapsed)); collapse.textContent = state.collapsed ? 'Show artifact' : 'Hide artifact'; divider.setAttribute('aria-valuenow', String(state.split));
    // Hidden iframe viewports report zero. Restore after expansion/open has
    // reached layout, rather than replacing the saved position with that zero.
    window.requestAnimationFrame(() => {
      if (!active || state.collapsed) return;
      if (items.length) strip.scrollLeft = state.strip;
      if (!shown) return;
      const pos = state.scrolls[shown]; if (!pos) return;
      if (frame) { try { frame.contentWindow.scrollTo(pos.left, pos.top); } catch { /* Loading or navigated frame; load handles restoration. */ } }
      else { preview.scrollTop = pos.top; preview.scrollLeft = pos.left; }
    });
  }
  function remember() {
    if (!state || !shown || !active || state.collapsed) return;
    const pos = { top: preview.scrollTop || 0, left: preview.scrollLeft || 0 };
    if (frame) {
      try { pos.top = frame.contentWindow.scrollY || 0; pos.left = frame.contentWindow.scrollX || 0; } catch { /* A navigated document may no longer be same-origin. */ }
    }
    state.scrolls[shown] = pos; save();
  }
  function pick(href, focus = false) {
    const item = items.find(i => i.href === href); if (!item) return;
    if (shown !== href) {
      remember(); state.href = href; shown = href; frame = null; preview.textContent = '';
      const ext = item.label.split('.').pop().toLowerCase(), position = state.scrolls[href] || { top: 0, left: 0 };
      if (item.image) {
        const img = el('img', ''); img.alt = item.label; img.src = href + (href.startsWith('/f/') ? '?raw=1' : '');
        const imageState = state;
        img.addEventListener('load', () => { if (state === imageState && shown === href) { preview.scrollTop = position.top; preview.scrollLeft = position.left; } }); preview.append(img);
      } else if (['md', 'markdown', 'html', 'htm'].includes(ext) && href.startsWith('/f/')) {
        frame = el('iframe', ''); frame.title = 'Artifact: ' + item.label;
        frame.setAttribute('sandbox', 'allow-same-origin'); frame.src = href + '?preview=1';
        const loadedFrame = frame, loadedState = state, loadedTopic = topic;
        frame.addEventListener('load', () => {
          if (frame !== loadedFrame || state !== loadedState) return;
          try {
            loadedFrame.contentWindow.scrollTo(position.left, position.top);
            loadedFrame.contentWindow.addEventListener('scroll', () => { if (active && topic === loadedTopic && shown === href) remember(); });
          } catch { status.textContent = 'Scroll position unavailable for this document.'; }
        }); preview.append(frame);
      } else {
        preview.append(el('p', 'artifact-empty', item.label + ' · No inline preview. Use Open original.'));
      }
      preview.scrollTop = position.top; preview.scrollLeft = position.left;
    }
    title.textContent = 'Artifact · ' + item.label; original.hidden = false; original.href = href;
    path.textContent = item.path || href; copy.disabled = !item.path; tools.hidden = false;
    copy.title = item.path ? '' : 'File path unavailable';
    for (const b of strip.children) {
      const current = b.dataset.href === href; b.setAttribute('aria-pressed', String(current)); b.tabIndex = current ? 0 : -1;
      const mark = b.querySelector('.artifact-current'); if (mark) mark.textContent = current ? 'Current' : '';
      if (current && focus) { b.focus({ preventScroll: true }); b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
    }
    save();
  }
  function render(catalog) {
    if (!active) return;
    status.textContent = '';
    // Stable ties retain the thread catalog's recency order. Unknown original
    // time sorts last; its pinned position on /t/<id> stays unchanged.
    items = [...(catalog?.items || [])].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || Number(!!a.original) - Number(!!b.original));
    const next = JSON.stringify(items);
    if (next !== signature) {
      const focused = strip.contains(document.activeElement), scroll = state.strip;
      signature = next; strip.textContent = '';
      for (const item of items) {
        const b = el('button', 'artifact-entry'); b.type = 'button'; b.dataset.href = item.href; b.title = item.label;
        b.setAttribute('aria-label', item.label); b.tabIndex = -1;
        const ext = item.label.split('.').pop().toLowerCase(), icon = el('span', 'artifact-icon', item.image ? '▧' : ['html', 'htm'].includes(ext) ? '◇' : ['md', 'markdown'].includes(ext) ? '≡' : '□'); icon.setAttribute('aria-hidden', 'true');
        const date = Date.parse(item.at), time = Number.isFinite(date) ? new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Time unknown';
        b.append(icon, el('span', 'artifact-name', item.label), el('span', 'artifact-time', time), el('span', 'artifact-current'));
        b.addEventListener('click', () => pick(item.href)); strip.append(b);
      }
      if (items.length) pick(items.some(i => i.href === state.href) ? state.href : items[0].href, focused);
      else { remember(); shown = frame = null; state.href = null; title.textContent = 'Artifact'; preview.textContent = ''; preview.append(el('p', 'artifact-empty', 'No artifacts shared in this session yet.')); original.hidden = true; copy.disabled = true; tools.hidden = true; path.textContent = ''; save(); }
      strip.scrollLeft = scroll;
    }
  }
  strip.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !items.length) return;
    e.preventDefault(); const at = items.findIndex(i => i.href === state.href), next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowLeft' ? -1 : 1) + items.length) % items.length;
    pick(items[next].href, true);
  });
  strip.addEventListener('scroll', () => { if (state && active && !state.collapsed && items.length) { state.strip = strip.scrollLeft; save(); } });
  preview.addEventListener('scroll', remember);
  collapse.addEventListener('click', () => { remember(); state.collapsed = !state.collapsed; layout(); save(); });
  const resize = p => { state.split = Math.min(70, Math.max(35, p)); layout(); save(); };
  divider.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); resize(e.key === 'Home' ? 35 : e.key === 'End' ? 70 : state.split + (e.key === 'ArrowLeft' ? -2 : 2));
  });
  let pointer = null;
  divider.addEventListener('pointerdown', e => { if (e.button != null && e.button !== 0) return; pointer = e.pointerId; divider.setPointerCapture(e.pointerId); body.classList.add('artifact-dragging'); e.preventDefault(); });
  divider.addEventListener('pointermove', e => { if (e.pointerId !== pointer || pointer == null) return; const r = body.getBoundingClientRect(); resize((e.clientX - r.left) / r.width * 100); });
  const stopDrag = () => { pointer = null; body.classList.remove('artifact-dragging'); };
  divider.addEventListener('pointerup', stopDrag); divider.addEventListener('pointercancel', stopDrag); divider.addEventListener('lostpointercapture', stopDrag);
  copy.addEventListener('click', async () => { const item = items.find(i => i.href === state.href); if (!item?.path) return; try { await window.navigator.clipboard.writeText(item.path); status.textContent = 'File path copied.'; } catch { path.tabIndex = 0; path.focus(); status.textContent = 'Clipboard unavailable. Select and copy the file path above.'; } });
  window.addEventListener('resize', layout);
  window.addEventListener('pagehide', () => { remember(); save(); });
  return {
    render,
    resume(id) {
      if (id !== topic) { remember(); topic = id; state = read(id); items = []; shown = frame = null; signature = ''; strip.textContent = ''; preview.textContent = ''; title.textContent = 'Artifact'; original.hidden = true; copy.disabled = true; tools.hidden = true; path.textContent = ''; status.textContent = 'Reading artifacts…'; }
      active = true; layout();
    },
    pause() { remember(); save(); active = false; stopDrag(); },
    nodes: { strip, preview, collapse, divider, original, copy, path, title, status },
  };
}
