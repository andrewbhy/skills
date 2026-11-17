import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';

// Layout 02's rail and card hierarchy, without the later job actions.
export const runningMarkup = `<section class="running-rail" aria-labelledby="running-heading"><div class="section-heading"><h2 id="running-heading" tabindex="-1">Running now <span id="running-count" class="count"></span></h2><span class="gc-meta">Live work</span></div><p id="running-live" class="sr-only" role="status" aria-live="polite"></p><div id="running-undo"></div><div id="running-list" tabindex="0" role="region" aria-label="Running jobs, scroll for more"></div></section>`;

export const runningCss = `
${towerTokenCss.replace('.needs-panel{', '.running-rail{')}
.dashboard-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:28px;align-items:start}
.dashboard-layout>.needs-panel{margin:0;min-width:0}.running-rail{min-width:0;color:var(--running-fg)}
.running-rail *{box-sizing:border-box}.running-rail .section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:22px}.running-rail h2{margin:0;font-size:24px;line-height:1.25;letter-spacing:-.5px}.running-rail .count{font-size:15px;font-weight:500;color:var(--running-meta-fg);background:var(--running-card-bg);border-radius:6px;padding:3px 7px}
.running-rail .gc-meta{font-size:12px;color:var(--running-meta-fg)}
#running-list{max-height:calc(100vh - 240px);overflow-y:auto;overflow-anchor:none;scrollbar-gutter:stable;scrollbar-color:var(--running-divider) var(--running-scrollbar-track);padding:3px 12px 3px 3px}
.running-rail .job{border:1px solid var(--running-divider);border-radius:10px;background:var(--running-card-bg);padding:22px;margin-bottom:18px;overflow-wrap:anywhere}.running-rail .job:last-child{margin-bottom:0}
.running-rail .job-top{display:flex;align-items:start;gap:8px;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap}.running-rail .provider{display:flex;align-items:center;gap:8px;font-size:19px;flex-wrap:wrap}.running-rail .model{font-size:12px;color:var(--running-meta-fg)}
.running-rail .job-state{font-size:12px;font-weight:650;border-radius:5px;padding:5px 9px;white-space:nowrap;color:var(--running-working-fg);background:var(--running-working-bg)}.running-rail .stalled{color:var(--running-stalled-fg);background:var(--running-stalled-bg)}
.running-rail .job-title{display:block;font-size:20px;font-weight:650;line-height:1.4;color:var(--running-fg);text-decoration:none}.running-rail .job-title:hover{text-decoration:underline}.running-rail .job-topic{margin:8px 0 18px}
.running-rail .owner-line{font-size:14px;margin:0 0 20px}.running-rail .owner-label{display:block;margin-top:4px;color:var(--running-meta-fg);font-size:12px}
.running-rail .timing{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;font-size:12px;color:var(--running-meta-fg);border-top:1px solid var(--running-divider);padding-top:15px}.running-rail .timing strong{color:var(--running-fg);font-weight:500}.running-rail .elapsed{margin:10px 0 16px;font-size:12px;color:var(--running-meta-fg)}
.running-rail .life{border-top:1px solid var(--running-divider);padding-top:12px;color:var(--running-meta-fg);font-size:12px}.running-rail .life strong{display:block;color:var(--running-fg);font-size:16px;font-weight:650}
.running-rail .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.running-rail .job-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.running-rail .job-action,.running-rail .undo-bar button{font:inherit;font-size:14px;min-height:32px;min-width:32px;padding:5px 14px;border-radius:6px;cursor:pointer;color:var(--running-fg);background:var(--running-card-bg);border:1px solid var(--running-divider)}.running-rail .job-action:disabled,.running-rail .undo-bar button:disabled{cursor:default;color:var(--running-meta-fg)}
.running-rail .undo-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;border:1px solid var(--running-divider);border-radius:10px;background:var(--running-card-bg);padding:10px 14px;margin-bottom:14px;font-size:14px}.running-rail .undo-bar:empty{display:none}.running-rail .undo-bar .gc-meta{font-size:12px;color:var(--running-meta-fg)}
.running-rail :focus-visible{outline:3px solid var(--running-focus-ring);outline-offset:-3px}
.work-below{margin-top:28px}.work-below>#work{display:block}
#board>#digest{position:static;margin:28px 0 12px;max-width:none}
.running-rail .state-reason{font-size:12px;color:var(--running-meta-fg);margin:12px 0 0}
.running-rail .resume-requested{color:var(--running-resume-fg);background:var(--running-resume-bg)}
@media(min-width:951px){.dashboard-layout{grid-template-columns:minmax(0,28fr) minmax(0,72fr);gap:36px}.running-rail{grid-column:1;grid-row:1;padding-right:24px;border-right:1px solid var(--running-divider)}.dashboard-layout>.needs-panel{grid-column:2;grid-row:1}}
@media(max-width:1450px) and (min-width:951px){.dashboard-layout{grid-template-columns:minmax(0,36fr) minmax(0,64fr);gap:24px}.running-rail .job{padding:18px}.running-rail .job-title{font-size:18px}.needs-panel .action-row{grid-template-columns:95px minmax(0,1fr) 75px 14px;gap:12px}.needs-panel .row-copy{padding-left:12px}}
@media(max-width:950px){#running-list{max-height:600px}}
`;

// Keep sequential focus order aligned with the visual columns/stack on resize.
export function orderRunningRail(document, window) {
  if (!window.matchMedia) return;
  const wide = window.matchMedia('(min-width:951px)');
  const rail = document.querySelector('.running-rail'), needs = document.querySelector('.needs-panel');
  const order = () => {
    const first = wide.matches ? rail : needs, second = wide.matches ? needs : rail;
    if (first.nextElementSibling === second) return;
    const focused = document.activeElement;
    first.parentNode.insertBefore(first, second);
    if (first.contains(focused)) focused.focus({ preventScroll: true });
  };
  order(); wide.addEventListener('change', order);
}

// Text-only rendering; the board's R1 stalled flag is the sole state authority.
export function createRunningRail(document, window, { now = () => Date.now(), post, refresh, open } = {}) {
  const send = post || (async () => ({ ok: false, body: { error: 'Actions are unavailable here.' } }));
  const reload = refresh || (() => typeof poll === 'function' ? poll(true) : undefined);
  const ttl = 10 * 60 * 1000;
  let receipts = [], pending = null, busy = false, lastKeys = [];
  const list = document.getElementById('running-list'), key = 'jig-review-running-view';
  let saved = {}, first = true;
  try { saved = JSON.parse(window.sessionStorage.getItem(key) || '{}') ?? {}; } catch { /* storage unavailable */ }
  const save = () => {
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    try { window.sessionStorage.setItem(key, JSON.stringify({ top: list.scrollTop, job: focused?.getAttribute('data-running-key'), href: focused?.getAttribute('href'), focused: !!focused })); } catch { /* storage unavailable */ }
  };
  list.addEventListener('scroll', save); list.addEventListener('focusin', save);
  window.addEventListener('pagehide', save);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag); node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const live = document.getElementById('running-live'), undoBox = document.getElementById('running-undo');
  const say = text => { if (!live) return; live.textContent = ''; if (window.setTimeout) window.setTimeout(() => { live.textContent = text; }, 20); else live.textContent = text; };
  const focusKey = key => {
    if (key === null) { document.getElementById('running-heading')?.focus({ preventScroll: true }); return; }
    const node = [...list.querySelectorAll('.job-title')].find(n => n.getAttribute('data-running-key') === key);
    (node || document.getElementById('running-heading') || list).focus({ preventScroll: true });
  };
  const drawUndo = () => {
    if (!undoBox) return;
    undoBox.textContent = '';
    for (const item of receipts) {
      const expired = now() >= item.expires;
      const bar = el('div', 'undo-bar'), undo = el('button', '', 'Undo'), meta = el('span', 'gc-meta', expired ? 'Undo expired.' : 'Undo available for 10 minutes.');
      undo.setAttribute('type', 'button'); undo.setAttribute('aria-label', 'Undo ' + item.text); if (expired) undo.disabled = true;
      undo.addEventListener('click', async () => {
        if (!receipts.includes(item)) return;
        if (now() >= item.expires) { say('Undo expired. Nothing changed.'); drawUndo(); return; }
        const r = await send('/api/undo', { id: item.key });
        if (r.ok) { receipts = receipts.filter(x => x !== item); pending = String(r.body.id ?? item.key); say('Undone. ' + item.text + ' Restored.'); drawUndo(); await reload(); focusKey(pending); pending = null; }
        else { say(r.body.error || 'Undo is not available. Nothing changed.'); if (now() >= item.expires) drawUndo(); }
      });
      bar.append(el('span', '', item.text), undo, meta); undoBox.append(bar);
    }
  };
  if (window.setInterval) window.setInterval(() => { for (const item of receipts) if (!item.told && now() >= item.expires) { item.told = true; say('Undo expired for ' + item.text); drawUndo(); } }, 1000);
  const act = async (row, kind, topic) => {
    if (busy) return; busy = true;
    const key = String(row.id), at = lastKeys.indexOf(key), next = lastKeys[at + 1] ?? lastKeys[at - 1] ?? null;
    const r = await send('/api/work/' + encodeURIComponent(key) + (kind === 'close' ? '/close-stalled' : '/resume'));
    busy = false;
    if (!r.ok) { say((r.body.error || 'Action unavailable.') + ' Nothing changed.'); await reload(); focusKey(key); return; }
    const text = kind === 'close' ? topic + ': closed as stalled.' : topic + ': resume requested by the person.';
    receipts = receipts.filter(x => x.key !== key && now() < x.expires); receipts.push({ text, key, expires: now() + ttl }); drawUndo();
    say(text + ' Undo available for 10 minutes.');
    await reload(); focusKey(kind === 'close' ? next : key);
  };
  const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  const date = value => stamp(value) === null ? 'unknown' : new Date(value).toISOString().replace('T', ' ').replace(/:\d\d\.\d{3}Z$/, ' UTC');
  const age = value => {
    const minutes = Math.floor(Math.max(0, now() - value) / 60000);
    return minutes < 1 ? 'less than 1 min' : minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' hr ' + minutes % 60 + ' min';
  };
  return (rows, ownershipMap) => {
    const top = first ? saved.top || 0 : list.scrollTop;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const href = focused?.getAttribute('href') || (first && saved.href);
    const job = focused?.getAttribute('data-running-key') || (first && saved.job);
    const index = focused ? [...list.querySelectorAll('.job-title')].indexOf(focused) : -1;
    const restore = !!focused || (first && saved.focused);
    list.textContent = ''; lastKeys = rows.map(row => String(row.id)); drawUndo();
    document.getElementById('running-count').textContent = '(' + rows.length + ')';
    for (const row of rows) {
      const a = row.assignee || {}, recordedProvider = a.provider || row.provider;
      const provider = recordedProvider === 'codex' ? 'Codex' : recordedProvider === 'claude' ? 'Claude' : 'unknown';
      const resume = row.resumeRequested === true;
      const topic = row.thread || row.id, record = ownershipMap?.rows?.find(r => r.id === topic);
      const owner = ownershipMap?.error ? 'unknown' : record?.owner ? record.owner.label || 'unknown' : 'coordinator';
      const card = el('article', 'job'), header = el('div', 'job-top'), agent = el('span', 'provider');
      const mark = el('span', '', provider === 'Codex' ? '⌘' : provider === 'Claude' ? '✳' : '?'); mark.setAttribute('aria-hidden', 'true');
      agent.append(mark, el('strong', '', provider), el('span', 'model', 'Model: ' + (a.model || 'unknown')));
      const status = el('span', 'job-state' + (resume ? ' resume-requested' : row.stalled ? ' stalled' : ''));
      const icon = el('span', '', resume ? '◷' : row.stalled ? '⚠' : '●'); icon.setAttribute('aria-hidden', 'true');
      status.append(icon, resume ? ' Resume requested' : row.stalled ? ' Stalled?' : ' Working'); header.append(agent, status);
      const title = el('a', 'job-title', row.item || 'unknown'); title.href = '/t/' + encodeURIComponent(topic); title.setAttribute('data-running-key', String(row.id));
      if (open) title.addEventListener('click', e => {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        open({ kind: 'running', topic: String(topic), title: row.item || 'unknown', owner, key: String(row.id), index: [...list.querySelectorAll('.job-title')].indexOf(title) });
      });
      const ownership = el('p', 'owner-line', owner);
      ownership.append(el('span', 'owner-label', 'Owner session · ' + (ownershipMap?.error ? 'unknown' : record?.owner?.sessionId || (record?.owner ? 'unknown' : 'coordinator'))));
      const started = a.startedAt || row.runningAt, minutes = Number.isInteger(a.timeboxMinutes) && a.timeboxMinutes > 0 ? a.timeboxMinutes : null;
      const timing = el('div', 'timing'), start = el('span', '', '◷ Started '), box = el('span', '', '◴ Timebox ');
      start.append(el('strong', '', date(started))); box.append(el('strong', '', minutes === null ? 'unknown' : minutes + ' min')); timing.append(start, box);
      const life = el('div', 'life', 'Last sign of life'); life.append(el('strong', '', stamp(row.lastSeen) === null ? 'unknown' : date(row.lastSeen) + ' · ' + age(stamp(row.lastSeen)) + ' ago'));
      card.append(header, title, el('p', 'job-topic gc-meta', 'Job: ' + (a.job || 'unknown')), ownership, timing,
        el('p', 'elapsed', 'Elapsed: ' + (stamp(started) === null ? 'unknown' : age(stamp(started))) + ' / ' + (minutes === null ? 'unknown' : minutes + ' min')), life);
      if (resume) card.append(el('p', 'state-reason', 'Requested ' + date(row.resumeRequestedAt) + (stamp(row.resumeRequestedAt) === null ? '' : ' · ' + age(stamp(row.resumeRequestedAt)) + ' ago')));
      else if (row.stalled) {
        card.append(el('p', 'state-reason', row.stalledReason || 'No recorded sign of life; time unknown'));
        const actions = el('div', 'job-actions');
        for (const kind of ['resume', 'close']) {
          const button = el('button', 'job-action', kind === 'resume' ? 'Resume' : 'Close'), name = row.item || topic;
          button.setAttribute('type', 'button'); button.setAttribute('aria-label', (kind === 'resume' ? 'Resume ' : 'Close ') + name);
          button.addEventListener('click', () => act(row, kind, name)); actions.append(button);
        }
        card.append(actions);
      }
      list.append(card);
    }
    if (!rows.length) list.append(el('p', 'gc-meta', 'Nothing running.'));
    if (restore) {
      const links = [...list.querySelectorAll('.job-title')];
      const target = focused === list || (!href && first) ? list : links.find(node => job ? node.getAttribute('data-running-key') === job : node.getAttribute('href') === href) || links[Math.max(0, Math.min(index, links.length - 1))] || list;
      target.focus({ preventScroll: true });
    }
    list.scrollTop = top; first = false;
  };
}
