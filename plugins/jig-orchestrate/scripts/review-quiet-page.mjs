if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-quiet-page.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';

// R6a: Quiet section of the new home. A view only: nothing here writes state.
// Serialized into the page like the other panel modules; keep the functions self-contained.
export const quietLabel = hours => 'Quiet for ' + hours + '+ hours';

export const quietMarkup = hours => `<details id="quiet" data-key="quiet" class="o6"><summary><span id="quietlabel">${quietLabel(hours)}</span><span class="cnt" id="quietcnt"></span></summary><div id="quietbody"></div></details>\n`;

export const quietCss = `
${towerTokenCss.replace('.needs-panel{', '.work-below{')}
.work-below .tag,.work-below .meta,.work-below .cnt,.work-below h3,.work-below .pg,.work-below .rw .w,.work-below .prog,.work-below .off,.work-below .pill.closed,.work-below .qrow .qwhen{color:var(--work-meta-fg)}
.work-below .rw .w b{color:var(--work-strong-fg)}
.work-below .rw{border-bottom-color:var(--border-divider)}
.work-below .qrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 14px;align-items:baseline;padding:8px 6px;border-bottom:1px solid var(--border-divider);color:var(--text-primary)}
.work-below .qrow:hover,.work-below .qrow:focus-visible{background:var(--surface-hover)}
.work-below .qrow .qt{font-weight:600;overflow-wrap:anywhere}.work-below .qrow .qwhen{font-size:.82em;white-space:nowrap}
.work-below #quiet summary:focus-visible,.work-below #done summary:focus-visible,.work-below .qrow:focus-visible{outline:3px solid var(--needs-focus-ring);outline-offset:-3px}
`;

// Topics that are not running and not in Needs you, whose last news is at least `hours` old.
// Last news of a work row is its newsAt (newest of updatedAt, addedAt, progress, and thread messages that are its own),
// and of a discussion its lastAt. A topic with no known news time is never quiet.
export function quietTopics(state, hours, now) {
  const w = state && state.work;
  if (!w || w.notice) return [];
  const topicOf = r => r.thread || r.id;
  const skip = new Set([].concat(w.running || [], w.needsYou || [], w.parked || [], w.done || []).map(topicOf));
  for (const n of state.needsYou || []) skip.add(n.topic);
  const rows = new Map();
  const note = (topic, title, label, at, kind, source) => {
    if (skip.has(topic)) return;
    const t = Date.parse(at); const cur = rows.get(topic);
    if (!cur) { rows.set(topic, { topic, title, label, at: Number.isFinite(t) ? t : null, kind, source: source || null }); return; }
    if (Number.isFinite(t) && (cur.at === null || t > cur.at)) { cur.at = t; cur.source = source || null; }
  };
  for (const r of [].concat(w.next || [], w.waiting || [])) {
    const times = ('newsAt' in r ? [r.newsAt] : [r.lastSeen, r.touchedAt]).map(Date.parse).filter(Number.isFinite);
    note(topicOf(r), r.item, r.status && r.status.display ? r.status.display.label : '', times.length ? new Date(Math.max(...times)).toISOString() : null, 'work', r.newsSource);
  }
  for (const d of state.discussions || []) if (d.status !== 'closed' && d.jobState !== 'running') note(d.id, d.title, d.statusLabel || '', d.lastAt, 'discussion');
  const limit = hours * 3600000;
  return [...rows.values()].filter(x => x.at !== null && now - x.at >= limit).sort((a, b) => a.at - b.at);
}

// Renders the section body and count; the label is server-rendered from the same setting.
export function createQuiet(document, window, { el, getState, quietHours, find, ago, now = () => Date.now() }) {
  const topics = () => find(getState(), quietHours, now());
  const render = () => {
    const rows = topics(), body = document.getElementById('quietbody');
    document.getElementById('quietcnt').textContent = '(' + rows.length + ')';
    body.textContent = '';
    if (!rows.length) { body.append(el('p', 'meta', 'Nothing has gone quiet.')); return; }
    for (const r of rows) {
      const a = el('a', 'qrow'); a.href = '/t/' + encodeURIComponent(r.topic);
      const mid = el('span'); mid.append(el('span', 'qt', r.title || r.topic));
      if (r.label) mid.append(' ', el('span', 'tag', r.label));
      a.append(mid, el('span', 'qwhen', r.source === 'backfill:snapshot' ? 'last news before ' + new Date(r.at).toISOString().slice(0, 10) : 'last news ' + ago(now() - r.at)));
      body.append(a);
    }
  };
  return { topics, render, ids: () => new Set(topics().map(x => x.topic)) };
}
