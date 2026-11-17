import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';
// List markup/geometry ported from lo-fi 2; scoped to coexist with today's home.
// Date groups inherit the accepted lo-fi hierarchy. The section is always expanded.
export const needsMarkup = `<section class="needs-panel" aria-labelledby="needs-heading"><div class="section-heading"><div><p class="eyebrow">YOUR NEXT MOVE</p><h2 id="needs-heading" tabindex="-1">Needs you</h2></div><span id="needs-count" class="count"></span></div><p class="list-note gc-meta">Longest wait first · wait unknown when no start is recorded · scroll for more ↓</p><div id="needs-list" tabindex="0" role="region" aria-label="Pending actions, scroll for more"></div></section>`;

export const needsCss = `
${towerTokenCss}
.needs-panel{margin:0 0 28px;background:var(--needs-page-bg);color:var(--text-primary)}
.needs-panel *{box-sizing:border-box}.needs-panel .section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:13px}.needs-panel h2{margin:0;font-size:36px;line-height:1.25;letter-spacing:-1px}.needs-panel .eyebrow{font-size:11px;letter-spacing:1.5px;color:var(--text-secondary);margin:0 0 7px;font-weight:650}.needs-panel .count{font-size:15px;font-weight:500;color:var(--text-secondary);background:var(--surface-frame-body);padding:8px 14px;border-radius:7px}.needs-panel .list-note{margin:0 0 16px}.needs-panel .gc-meta{display:block;color:var(--text-secondary);font-size:12px;font-weight:500}
#needs-list{max-height:calc(100vh - 490px);min-height:320px;overflow-y:auto;scrollbar-gutter:stable;padding-right:12px;scrollbar-color:var(--border-divider) var(--needs-scrollbar-track);overflow-anchor:none}
.needs-panel .action-row{display:grid;grid-template-columns:108px minmax(0,1fr) 135px 20px;align-items:center;gap:20px;padding:16px 12px;border-bottom:1px solid var(--border-divider);text-decoration:none;color:var(--text-primary);min-height:83px}.needs-panel .action-row:hover{background:var(--surface-hover)}.needs-panel .action-word{display:flex;gap:9px;align-items:center;justify-content:center;padding:6px 10px;font-size:14px;font-weight:650;border-radius:6px;color:var(--text-primary);background:var(--surface-frame-body)}.needs-panel .action-word>span{font-size:19px;line-height:1;font-family:"Segoe UI Symbol",sans-serif;font-variant-emoji:text}.needs-panel .row-copy{min-width:0;border-left:1px solid var(--border-divider);padding-left:20px}.needs-panel .row-title{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:17px;font-weight:500}.needs-panel .row-copy .gc-meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}.needs-panel .age{font-variant-numeric:tabular-nums;text-align:right;font-size:13px;color:var(--text-secondary)}.needs-panel .chevron{font-size:27px;text-align:right;color:var(--text-secondary)}.needs-panel :focus-visible{outline:3px solid var(--needs-focus-ring);outline-offset:-3px}
@media(min-width:2400px){.needs-panel .action-row{min-height:96px;padding-block:22px;grid-template-columns:120px minmax(0,1fr) 150px 24px}.needs-panel .row-title{font-size:19px}.needs-panel .row-copy .gc-meta{font-size:14px}.needs-panel .age{font-size:15px}.needs-panel h2{font-size:40px}#needs-list{max-height:calc(100vh - 510px)}}
@media(max-width:950px){#needs-list{max-height:600px}}
@media(max-width:600px){.needs-panel .action-row{grid-template-columns:85px minmax(0,1fr) 13px;gap:10px;padding:14px 2px}.needs-panel .action-row .age{grid-column:2;grid-row:2;text-align:left;padding-left:12px}.needs-panel .action-row .chevron{grid-column:3;grid-row:1/3}.needs-panel .row-title{font-size:15px}.needs-panel .action-word{font-size:12px;padding:5px}.needs-panel .row-copy .gc-meta{font-size:11px}.needs-panel .count{font-size:12px;padding:6px}.needs-panel h2{font-size:30px}}
.needs-panel .time-group{margin-bottom:18px}.needs-panel .time-group h3{display:flex;gap:12px;align-items:center;background:var(--group-header-bg);color:var(--group-header-fg);margin:0;padding:9px 16px;font-size:16px;font-weight:650;border-radius:6px;letter-spacing:normal;text-transform:none}.needs-panel .group-count{font-size:13px;font-weight:500}.needs-panel .bucket-empty{padding:12px 16px;color:var(--text-secondary);font-size:14px;margin:0}
.needs-panel .action-word{color:var(--badge-ink);background:var(--badge-fill);border:1px solid var(--badge-border)}
.needs-panel .badge-answer{--badge-ink:var(--action-answer-fg);--badge-fill:var(--action-answer-bg);--badge-border:var(--action-answer-border)}
.needs-panel .badge-try{--badge-ink:var(--action-try-fg);--badge-fill:var(--action-try-bg);--badge-border:var(--action-try-border)}
.needs-panel .badge-approve{--badge-ink:var(--action-approve-fg);--badge-fill:var(--action-approve-bg);--badge-border:var(--action-approve-border)}
.needs-panel .badge-read{--badge-ink:var(--action-read-fg);--badge-fill:var(--action-read-bg);--badge-border:var(--action-read-border)}
.needs-panel .badge-open{--badge-ink:var(--action-open-fg);--badge-fill:var(--action-open-bg);--badge-border:var(--action-open-border)}
.needs-panel .row-copy .gc-meta{display:flex;align-items:center;gap:6px;min-height:25px;white-space:normal;overflow:visible}.needs-panel .topic-id{color:var(--topic-id-fg);flex-shrink:0}.needs-panel .owner-chip{display:inline-block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--owner-chip-fg);background:var(--owner-chip-bg);border:1px solid var(--owner-chip-border);border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600}
`;

// Text nodes only. Storage holds viewing position, never derived request rows.
export function createNeedsYou(document, window, { now = () => Date.now(), open } = {}) {
  const list = document.getElementById('needs-list');
  const key = 'jig-review-needs-view';
  let saved = {};
  try { saved = JSON.parse(window.sessionStorage.getItem(key) || '{}') ?? {}; } catch { /* storage unavailable */ }
  let first = true;
  const save = () => {
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    try { window.sessionStorage.setItem(key, JSON.stringify({ list: list.scrollTop, page: window.scrollY, focused: !!focused, href: focused?.getAttribute('href'), line: focused?.querySelector('.row-title')?.textContent })); } catch { /* storage unavailable */ }
  };
  list.addEventListener('scroll', save);
  list.addEventListener('focusin', save);
  window.addEventListener('scroll', save);
  window.addEventListener('pagehide', save);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag); node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  return (rows, ownershipMap) => {
    const top = first ? saved.list || 0 : list.scrollTop;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const index = focused ? [...list.querySelectorAll('.action-row')].indexOf(focused) : -1;
    const href = focused?.getAttribute('href') || (first && saved.href), line = focused?.querySelector('.row-title')?.textContent || (first && saved.line);
    list.textContent = '';
    document.getElementById('needs-count').textContent = '(' + rows.length + ' actions · ' + new Set(rows.map(r => r.topic)).size + ' topics)';
    const glyph = { answer: '◯', try: '⚗', approve: '✓', read: '▤' };
    const time = now(), midnight = new Date(time);
    midnight.setHours(0, 0, 0, 0);
    const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
    const known = row => Number.isFinite(row.since);
    const groups = [[], [], []];
    for (const row of rows) groups[!known(row) ? 2 : row.since >= +midnight ? 0 : row.since >= +yesterday ? 1 : 2].push(row);
    for (const [i, name] of ['Now', 'Yesterday', 'Earlier'].entries()) {
      const group = el('section', 'time-group'); group.setAttribute('aria-label', name);
      const heading = el('h3', '', name); heading.append(el('span', 'group-count', String(groups[i].length)));
      group.append(heading); list.append(group);
      groups[i].sort((a, b) => (known(a) ? a.since : Infinity) - (known(b) ? b.since : Infinity) || a.topic.localeCompare(b.topic));
      for (const row of groups[i]) {
        const action = ['answer', 'try', 'approve', 'read'].includes(row.action) ? row.action : null;
        const label = action ? action[0].toUpperCase() + action.slice(1) : 'Open';
        const minutes = !known(row) ? null : Math.floor(Math.max(0, time - row.since) / 60000);
        const wait = minutes === null ? 'Wait unknown' : (minutes < 1 ? 'less than 1 min' : minutes < 60 ? minutes + ' min' : minutes < 1440 ? Math.floor(minutes / 60) + ' hr' : Math.floor(minutes / 1440) + ' days') + ' waited';
        const link = el('a', 'action-row');
        // Rebuild the local route from topic; never trust a stored URL/protocol.
        link.href = '/t/' + encodeURIComponent(row.topic);
        link.setAttribute('aria-label', label + ' ' + row.line + ', ' + row.owner + ', ' + wait);
        const word = el('span', 'action-word badge-' + (action || 'open')), icon = el('span', '', glyph[action] || '↗');
        icon.setAttribute('aria-hidden', 'true'); word.append(icon, label);
        const copy = el('span', 'row-copy');
        const meta = el('span', 'gc-meta');
        const provider = ownershipMap?.rows?.find(record => record.id === row.topic)?.owner?.provider;
        const mark = provider === 'claude' ? '✳ Claude · ' : provider === 'codex' ? '⌘ Codex · ' : '';
        meta.append(el('span', 'topic-id', row.topic), ' · ', el('span', 'owner-chip', mark + row.owner));
        copy.append(el('span', 'row-title', row.line), meta);
        // Only the new home passes `open`: a plain click opens the session panel; modified clicks keep the link.
        if (open) link.addEventListener('click', e => {
          if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          open({ kind: 'needs', topic: row.topic, title: row.line, owner: row.owner, line: row.line, index: [...list.querySelectorAll('.action-row')].indexOf(link) });
        });
        const chevron = el('span', 'chevron', '›'); chevron.setAttribute('aria-hidden', 'true');
        link.append(word, copy, el('span', 'age', wait), chevron); group.append(link);
      }
    }
    if (!rows.length) list.append(el('p', 'gc-meta', 'Nothing needs you.'));
    if (focused || href || (first && saved.focused)) {
      const links = [...list.querySelectorAll('.action-row')];
      const target = focused === list || (!href && first && saved.focused) ? list : links.find(node => node.getAttribute('href') === href && node.querySelector('.row-title')?.textContent === line) || links[Math.max(0, Math.min(index, links.length - 1))] || list;
      (target.tagName === 'A' ? target : list).focus({ preventScroll: true });
    }
    list.scrollTop = top;
    if (first) {
      first = false;
      if (Number.isFinite(saved.page)) window.requestAnimationFrame(() => window.scrollTo(0, saved.page));
    }
  };
}
