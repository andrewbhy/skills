if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-session-panel.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';

// Session shell: open, Close, Escape, inert dashboard and exact restore.
export const panelCss = `
${towerTokenCss.replace('.needs-panel{', '#session-panel{')}
#session-panel{position:fixed;left:0;right:0;bottom:0;top:var(--panel-top,0);z-index:20;display:flex;flex-direction:column;min-width:0;overflow:auto;overscroll-behavior:contain;background:var(--needs-page-bg);color:var(--text-primary);border-top:1px solid var(--border-divider)}
#session-panel[hidden]{display:none}
#session-panel .session-header{padding:8px 24px 8px;background:var(--surface-frame-body);border-bottom:1px solid var(--border-divider)}
#session-panel .session-top{display:flex;align-items:center;gap:12px;min-width:0}
#session-panel .session-sub{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 16px;margin-top:2px;min-width:0}
#session-panel .session-sub a{font-size:12px;white-space:nowrap}
#session-panel .session-owner-tools{display:contents}
#session-panel .session-top .chat-tools{margin:0;gap:6px;flex-wrap:nowrap;flex-shrink:0}
#session-panel .session-top .chat-tools button{min-height:28px;padding:2px 8px;font-size:12px;white-space:nowrap}
#session-panel .session-close{display:inline-flex;align-items:center;flex-shrink:0;gap:6px;min-height:28px;padding:2px 10px;font-size:13px;color:var(--text-primary);background:transparent;border:1px solid var(--action-open-border);border-radius:6px;cursor:pointer}
#session-panel .session-close:hover{background:var(--surface-hover)}
#session-panel kbd{font:inherit;font-size:11px;color:var(--text-secondary)}
#session-panel h1{flex:1;min-width:0;margin:0;font-size:18px;line-height:1.3;letter-spacing:-.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#session-panel .session-owner,#session-panel .session-note{margin:0;font-size:12px;color:var(--text-secondary);overflow-wrap:anywhere}
#session-panel .session-note{color:var(--text-primary)}
#session-panel .session-note:empty{display:none}
#session-panel .session-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);color:var(--text-primary);font-size:15px}
#session-panel .session-files{padding:24px;color:var(--text-secondary);border-right:1px solid var(--border-divider)}
#session-panel .session-chat{display:flex;flex-direction:column;min-height:0;min-width:0}
#session-panel .chat-root{display:flex;flex-direction:column;flex:1;min-height:0}
#session-panel [hidden]{display:none!important}
#session-panel .chat-scroll{flex:1;min-height:0;overflow:auto;padding:20px}
#session-panel .chat-msgs{display:flex;flex-direction:column;gap:16px}
#session-panel .m{max-width:92%;padding:9px 13px;border-radius:12px;overflow-wrap:anywhere;line-height:1.5}
#session-panel .m .p+.p,#session-panel .m .p+ol,#session-panel .m .p+ul,#session-panel .m ol+.p,#session-panel .m ul+.p{margin-top:.5em}
#session-panel .m ol,#session-panel .m ul{margin:0;padding-left:1.5em}
#session-panel .m.person{align-self:flex-end;background:var(--action-answer-bg);color:var(--action-answer-fg)}
#session-panel .m.person .by{color:var(--action-answer-fg)}
#session-panel .m.coordinator{align-self:flex-start;background:var(--surface-hover);border:1px solid var(--border-divider)}
#session-panel .m.agent,#session-panel .m.system{align-self:stretch;max-width:100%;background:none;border-radius:0;border-left:2px solid var(--action-open-border);padding:2px 0 2px 12px}
#session-panel .m.system{font-style:italic;color:var(--text-secondary)}
#session-panel .m.earliernote{align-self:stretch;max-width:100%;background:none;border:1px dashed var(--border-divider)}
#session-panel .m:focus-visible{outline:2px solid var(--needs-focus-ring);outline-offset:3px}
#session-panel .by{display:block;font-size:.72em;color:var(--text-secondary);margin-bottom:2px}
#session-panel .m .reply-action{float:right;margin-left:12px;padding:2px 8px;min-height:32px;font-size:.75em;opacity:0}
#session-panel .m:hover .reply-action,#session-panel .m:focus-within .reply-action{opacity:1}
@media(hover:none){#session-panel .m .reply-action{opacity:1}}
#session-panel .m.person .reply-action{background:transparent;color:var(--action-answer-fg);border-color:var(--action-answer-fg)}
#session-panel .chat-f{padding:16px 20px;border-top:1px solid var(--border-divider);background:var(--surface-frame-body)}
#session-panel .chat-recipient{display:block;font-size:13px;font-weight:600;margin-bottom:8px}
#session-panel textarea{box-sizing:border-box;width:100%;font:inherit;resize:vertical;min-height:64px;background:var(--needs-page-bg);color:var(--text-primary);border:1px solid var(--action-open-border);border-radius:6px;padding:10px}
#session-panel button{font:inherit;min-height:32px;padding:4px 10px;border:1px solid var(--action-open-border);border-radius:6px;color:var(--text-primary);background:var(--needs-page-bg);cursor:pointer}
#session-panel button:hover{background:var(--surface-hover)}
#session-panel button:disabled{cursor:default;opacity:.6}
#session-panel .chat-tools,#session-panel .chat-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#session-panel .chat-tools{margin-top:12px}
#session-panel .chat-actions{margin-top:8px}
#session-panel .chat-send{background:var(--action-answer-bg);color:var(--action-answer-fg);border-color:var(--action-answer-border)}
#session-panel .chat-hint,#session-panel .chat-feedback,#session-panel .chat-state{font-size:12px;color:var(--text-secondary)}
#session-panel .chat-feedback,#session-panel .chat-state{margin:0;padding:4px 20px;overflow-wrap:anywhere}
#session-panel .chat-feedback:empty,#session-panel .chat-state:empty{display:none}
#session-panel .reply-quote{background:var(--surface-hover);border-color:var(--action-open-border);color:var(--text-primary)}
#session-panel .reply-highlight{box-shadow:0 0 0 3px var(--needs-focus-ring)}
#session-panel .artifact-link,#session-panel .thumb,#session-panel .att img{border-color:var(--action-open-border);background:var(--needs-page-bg)}
#session-panel .thumb img{background:var(--needs-page-bg)}
#session-panel .thumbx{background:var(--needs-page-bg);color:var(--text-primary)}
#session-panel .dropping{outline-color:var(--needs-focus-ring)}
#session-panel dialog{width:min(92vw,44rem);max-height:85vh;box-sizing:border-box;overflow:auto;background:var(--needs-page-bg);color:var(--text-primary);border:1px solid var(--action-open-border);border-radius:8px;padding:24px}
#session-panel .chat-dismiss{margin-top:32px}
#session-panel .chat-replychip{padding:8px;border-left:3px solid var(--action-open-border);display:flex;gap:8px;align-items:center;overflow-wrap:anywhere}
#session-panel .session-body a{color:var(--text-primary)}
#session-panel .session-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#session-panel :focus-visible{outline:3px solid var(--needs-focus-ring);outline-offset:3px}
@media(max-width:700px){#session-panel .session-header{padding:8px 12px}#session-panel .session-top{flex-wrap:wrap}#session-panel h1{flex-basis:100%}#session-panel .session-body{grid-template-columns:minmax(0,1fr)}#session-panel .session-files{display:none}}
`;

// Self-contained: serialised into the page with toString(), so it may use only its arguments.
export function createSessionPanel(document, window, createChat = null, createArtifacts = null) {
  const byId = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag); node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const panel = el('section', 'session-panel-root');
  panel.id = 'session-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'session-title');
  const header = el('header', 'session-header'), top = el('div', 'session-top');
    const close = el('button', 'session-close'); close.setAttribute('type', 'button');
  const x = el('span', '', '×'); x.setAttribute('aria-hidden', 'true');
  const esc = el('kbd', '', 'Esc'); esc.setAttribute('aria-hidden', 'true');
  close.append(x, ' Close ', esc);
  const title = el('h1', ''); title.id = 'session-title'; title.setAttribute('tabindex', '-1');
  const owner = el('p', 'session-owner'), note = el('p', 'session-note'), live = el('p', 'session-live');
  note.setAttribute('role', 'status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  const sub = el('div', 'session-sub');
  sub.append(owner, note);
  header.append(top, sub);
  const body = el('div', 'session-body'), files = el('aside', 'session-files'), placeholder = el('p', 'session-placeholder', 'Files for this session appear here next'), full = el('a', 'session-full', 'Open full thread page');
  const chatHost = el('div', 'session-chat'), tools = el('div', 'session-owner-tools');
  files.append(placeholder, full); body.append(files);
  const artifacts = createArtifacts ? createArtifacts({ host: files, body }) : null;
  body.append(chatHost);
  // Line 1: title, ownership actions, Close. Line 2: owner, status note, link to the full page.
  top.append(title, tools, close);
  if (artifacts) sub.append(full);
  panel.append(header, body, live);
  document.body.append(panel);

  let current = null, pushed = false, ignorePops = 0, afterPop = null, chat = null;
  const chats = new Map();
  const say = text => { live.textContent = ''; const running = byId('running-live'); if (running) running.textContent = text; live.textContent = text; };
  const place = () => {
    const bar = byId('tower-hdr'), box = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
    if (panel.style) panel.style.setProperty('--panel-top', Math.max(0, Math.round(box ? box.bottom : 0)) + 'px');
  };
  const isTopic = (r, topic) => String(r.thread ?? r.id) === topic || 'item-' + r.id === topic;
  const find = c => {
    const needs = c.kind === 'needs', list = byId(needs ? 'needs-list' : 'running-list');
    const links = [...list.querySelectorAll(needs ? '.action-row' : '.job-title')];
    const line = n => n.querySelector('.row-title')?.textContent;
    const same = needs
      ? links.find(n => n.getAttribute('href') === c.href && line(n) === c.line) || links.find(n => n.getAttribute('href') === c.href)
      : links.find(n => n.getAttribute('data-running-key') === c.key) || links.find(n => n.getAttribute('href') === c.href);
    return same || links[Math.max(0, Math.min(c.index, links.length - 1))] || byId(needs ? 'needs-heading' : 'running-heading') || list;
  };
  const finish = () => {
    const c = current; current = null;
    chat?.pause(); chat = null;
    artifacts?.pause();
    panel.hidden = true;
    const main = byId('home-main'); if (main) main.inert = false;
    const back = c.restore && c.restore.isConnected !== false ? c.restore : find(c); back.focus({ preventScroll: true });
    // Focus must not scroll; put every scroll position back exactly as it was at open.
    const needs = byId('needs-list'), running = byId('running-list');
    if (needs) needs.scrollTop = c.scroll.needs;
    if (running) running.scrollTop = c.scroll.running;
    window.scrollTo(0, c.scroll.page);
    say('Session panel closed. Dashboard unchanged.');
  };
  const closePanel = () => {
    if (!current) return;
    finish();
    if (pushed) { pushed = false; ignorePops++; window.history.back(); }
  };
  const open = info => {
    if (current) return;
    const needs = byId('needs-list'), running = byId('running-list');
    current = { ...info, href: '/t/' + encodeURIComponent(info.topic), scroll: { needs: needs ? needs.scrollTop : 0, running: running ? running.scrollTop : 0, page: window.scrollY || 0 } };
    title.textContent = info.title || info.topic; title.title = title.textContent;
    owner.textContent = 'Owner: ' + (info.owner || 'unknown');
    note.textContent = '';
    full.href = current.href;
    artifacts?.resume(info.topic);
    if (createChat) {
      if (!chats.has(info.topic)) chats.set(info.topic, createChat({ topic: info.topic, host: chatHost, tools, owner, onArtifacts: catalog => artifacts?.render(catalog), onTitle: t => { if (current?.topic === info.topic && typeof t === 'string' && t.trim()) title.textContent = t; title.title = t; } }));
      chat = chats.get(info.topic); chat.resume();
    }
    place();
    panel.hidden = false;
    const main = byId('home-main'); if (main) main.inert = true;
    try { window.history.pushState({ towerPanel: info.topic }, ''); pushed = true; } catch { pushed = false; }
    title.focus({ preventScroll: true });
    say('Session panel opened for ' + (info.title || info.topic) + '.');
  };
  // Called after every board redraw: the opened topic is tracked by id, never by row position.
  const update = state => {
    if (!current) return;
    const topic = current.topic, w = state?.work || {};
    const there = (state?.needsYou || []).some(r => r.topic === topic)
      || ['running', 'next', 'waiting', 'needsYou', 'parked', 'done'].some(k => (w[k] || []).some(r => isTopic(r, topic)))
      || (state?.items || []).some(r => isTopic(r, topic));
    note.textContent = there ? '' : 'This topic is no longer on the board. Close to return to the dashboard.';
  };
  close.addEventListener('click', closePanel);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented && current && !chat?.modalOpen() && !chat?.closedRecently()) { e.preventDefault(); closePanel(); } });
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; const next = afterPop; afterPop = null; next?.(); return; }
    if (current) { pushed = false; finish(); }
  });
  window.addEventListener('resize', () => { if (current) place(); });
  const leaveForTab = next => {
    if (!current) { next(); return; }
    if (chat?.modalOpen()) return;
    const wait = pushed; afterPop = wait ? next : null; closePanel(); if (!wait) next();
  };
  return { open, update, close: closePanel, leaveForTab, node: panel, get isOpen() { return !!current; } };
}
