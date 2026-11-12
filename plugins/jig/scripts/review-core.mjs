// Shared pieces of the local review server: path safety, markdown rendering and the item store.
// Dependency-free. Roots come from a config file; nothing outside them is ever served.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRootOf, stateDir } from './jig-store.mjs';
import { projectOfItem } from './project-groups.mjs';
import { lightboxCss, lightboxHtml, lightboxScript } from './review-lightbox.mjs';
import { assertTransition, checkTransition, reviewState, workState } from './review-states.mjs';
import { addDecision, answeredQuestions, blockers, decisionKey, decisionLabel, decisionNotes, readDecisions, refMatches } from './review-decisions.mjs';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
export const defaultPort = 7788;
const caseInsensitive = process.platform !== 'linux';
const norm = (p) => (caseInsensitive ? p.toLowerCase() : p);

// Personal state lives in the store (~/.jig/<project>); until a project has any there, the repo's own .jig/ is used.
// The project is the checkout these scripts live in when that is a git checkout (the person's own jig); an installed plugin has no .git,
// so there it is the project around the current folder. Never the plugin folder, whose name changes on every update.
export const projectRoot = () => (!process.env.JIG_PROJECT_ROOT && existsSync(join(repoRoot, '.git')) ? repoRoot : projectRootOf());
export const reviewDir = () => process.env.JIG_REVIEW_DIR || stateDir(projectRoot());
export const rootsFile = (dir = reviewDir()) => join(dir, 'review-roots.json');
export const itemsFile = (dir = reviewDir()) => join(dir, 'review-items.json');

// ---------- config ----------
export function loadConfig(dir = reviewDir()) {
  const file = rootsFile(dir);
  if (!existsSync(file)) throw new Error(`No review config at ${file}. Create it as {"roots":[{"prefix":"runs","path":"/some/folder"}]}.`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const roots = (data.roots ?? []).map((r) => {
    if (!r || typeof r.path !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.prefix ?? '')) throw new Error('Each root needs a lowercase prefix (a-z, 0-9, -) and a path.');
    return { prefix: r.prefix, path: resolve(r.path) };
  });
  if (new Set(roots.map((r) => r.prefix)).size !== roots.length) throw new Error('Root prefixes must be unique.');
  return { roots, openQuestions: data.openQuestions ? resolve(data.openQuestions) : null, port: data.port, queue: data.queue ? resolve(data.queue) : join(dir, 'queue.json') };
}

// ---------- path safety ----------
export const hasPrivateSegment = (p) => p.split(/[\\/]+/).some((s) => s.toLowerCase() === 'private');

function within(parent, child) {
  const r = relative(norm(parent), norm(child));
  return r === '' || (r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r));
}

// Resolve an absolute path against the allowlist after following links.
// Returns {ok:true, root, real, rel} or {ok:false, reason}.
export function locate(roots, input) {
  if (typeof input !== 'string' || !input || input.includes('\0')) return { ok: false, reason: 'bad path' };
  const abs = resolve(input);
  if (hasPrivateSegment(abs)) return { ok: false, reason: 'private' };
  let real;
  try { real = realpathSync(abs); } catch { return { ok: false, reason: 'not found' }; }
  if (hasPrivateSegment(real)) return { ok: false, reason: 'private' };
  for (const root of roots) {
    if (hasPrivateSegment(root.path)) continue;
    let rr;
    try { rr = realpathSync(root.path); } catch { continue; }
    if (within(rr, real)) return { ok: true, root, real, rel: relative(rr, real) };
  }
  return { ok: false, reason: 'outside allowed roots' };
}

// Map a URL path (after the /f/ prefix) to an allowlisted file or folder.
export function locateUrl(roots, prefix, segments) {
  const root = roots.find((r) => r.prefix === prefix);
  if (!root) return { ok: false, reason: 'unknown root' };
  for (const s of segments) {
    if (!s || s === '.' || s === '..' || /[\0\\:]/.test(s)) return { ok: false, reason: 'bad path' };
  }
  const found = locate(roots, join(root.path, ...segments));
  if (!found.ok) return found;
  if (found.root !== root) return { ok: false, reason: 'outside allowed roots' };
  return found;
}

export const serverPath = (found) => `/f/${found.root.prefix}/${found.rel.split(sep).map(encodeURIComponent).join('/')}`;

// ---------- kinds ----------
const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);
export function kindOf(path) {
  const e = extname(path).toLowerCase();
  if (e === '.html' || e === '.htm') return 'html';
  if (e === '.md' || e === '.markdown') return 'markdown';
  if (imageExt.has(e)) return 'image';
  return 'file';
}

// ---------- markdown ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// Returns a server path, an external/anchor url, or null when the target must not become a link.
export function rewriteLink(href, ctx) {
  const h = href.trim();
  if (!h) return null;
  if (h.startsWith('#')) return h;
  if (/^https?:\/\//i.test(h)) return h;
  let path;
  if (/^file:/i.test(h)) {
    try { path = fileURLToPath(new URL(h)); } catch { return null; }
  } else if (/^[a-z][a-z0-9+.-]*:(?!\\|\/)/i.test(h) && !/^[a-z]:[\\/]/i.test(h)) {
    return null; // javascript:, data:, mailto: and friends
  } else {
    const [bare, hash = ''] = splitHash(h);
    let decoded = bare;
    try { decoded = decodeURI(bare); } catch { /* keep raw */ }
    path = isAbsolute(decoded) || /^[a-z]:[\\/]/i.test(decoded) ? decoded : join(ctx.baseDir, decoded);
    return finishLocal(path, hash, ctx);
  }
  const [p, hash = ''] = [path, new URL(h).hash.replace(/^#/, '')];
  return finishLocal(p, hash, ctx);
}
const splitHash = (h) => { const i = h.indexOf('#'); return i < 0 ? [h] : [h.slice(0, i), h.slice(i + 1)]; };
function finishLocal(path, hash, ctx) {
  const found = locate(ctx.roots, path);
  if (!found.ok) return null;
  return serverPath(found) + (hash ? '#' + hash : '');
}

function inline(text, ctx) {
  return text.split(/(`[^`\n]+`)/).map((seg, i) => {
    if (i % 2 === 1) return `<code>${esc(seg.slice(1, -1))}</code>`;
    let s = esc(seg);
    const target = '(<[^>]*>|[^)\\s]*)(?:\\s+&quot;[^&]*&quot;)?';
    s = s.replace(new RegExp(`!\\[([^\\]]*)\\]\\(${target}\\)`, 'g'), (m, alt, url) => {
      const u = rewriteLink(unesc(url.replace(/^&lt;|&gt;$/g, '')), ctx);
      return u && !/^https?:/i.test(u) && !u.startsWith('#') ? `<img src="${esc(u)}" alt="${alt}">` : alt ? `[image: ${alt}]` : '[image]';
    });
    s = s.replace(new RegExp(`\\[([^\\]]+)\\]\\(${target}\\)`, 'g'), (m, label, url) => {
      const u = rewriteLink(unesc(url.replace(/^&lt;|&gt;$/g, '')), ctx);
      if (!u) return `<span class="deadlink" title="not available">${label}</span>`;
      const ext = /^https?:/i.test(u) ? ' rel="noopener noreferrer" target="_blank"' : '';
      return `<a href="${esc(u)}"${ext}>${label}</a>`;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    return s;
  }).join('');
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const isSep = (line) => line.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function renderMarkdown(text, ctx) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let start = 0;
  // Seam for pointing at a place on the page: each block carries its source line range.
  const base = ctx.lineBase || 0;
  const emit = (html) => out.push(ctx.src ? html.replace(/^<([a-z0-9]+)/, `<$1 data-src="${esc(ctx.src)}#L${base + start + 1}-${base + i}"`) : html);
  const startsBlock = (l) => /^\s*(```|#{1,6}\s|>|(-{3,}|\*{3,})\s*$)/.test(l) || listRe.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    start = i;
    const fence = line.match(/^\s*```+\s*([\w-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      emit(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) { i++; emit(`<h${heading[1].length}>${inline(heading[2], ctx)}</h${heading[1].length}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { i++; emit('<hr>'); continue; }
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && isSep(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      const cell = (tag, c, n) => `<${tag}${aligns[n] ? ` style="text-align:${aligns[n]}"` : ''}>${inline(c ?? '', ctx)}</${tag}>`;
      emit(`<table><thead><tr>${head.map((c, n) => cell('th', c, n)).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, n) => cell('td', r[n], n)).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      emit(`<blockquote>${renderMarkdown(body.join('\n'), { ...ctx, lineBase: base + start })}</blockquote>`);
      continue;
    }
    if (listRe.test(line)) {
      const stack = []; // {indent, tag}
      let html = '';
      while (i < lines.length && (listRe.test(lines[i]) || (lines[i].trim() && /^\s+\S/.test(lines[i]) && stack.length))) {
        const m = lines[i].match(listRe);
        if (!m) { html = html.replace(/<\/li>$/, '') + ' ' + inline(lines[i].trim(), ctx) + '</li>'; i++; continue; }
        const indent = m[1].replace(/\t/g, '    ').length;
        const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && indent < stack[stack.length - 1].indent) { html += `</li></${stack.pop().tag}>`; }
        if (stack.length && indent === stack[stack.length - 1].indent) html += '</li>';
        else if (!stack.length || indent > stack[stack.length - 1].indent) { stack.push({ indent, tag }); html += `<${tag}>`; }
        const num = tag === 'ol' ? m[2].match(/\d+/)[0] : null; // keep the numbers written in the source
        html += `<li${num ? ` value="${num}"` : ''}>${inline(m[3], ctx)}`;
        i++;
      }
      while (stack.length) html += `</li></${stack.pop().tag}>`;
      emit(html);
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isSep(lines[i + 1] ?? ''))) para.push(lines[i++].trim());
    emit(`<p>${inline(para.join(' '), ctx)}</p>`);
  }
  return out.join('\n');
}

const pageCss = `body{font:16px/1.55 system-ui,sans-serif;margin:0;color:#1d1d1f;background:#fff}
.bar{position:sticky;top:0;background:#1d1d1f;color:#fff;padding:8px 16px;font-size:14px}.bar a,.bar a:visited{color:#9cf}
a,a:visited{color:#1d4ed8;text-decoration:none}a:hover,a:focus-visible{text-decoration:underline}
a.t,a.t:visited{color:inherit}a.t:hover,a.t:focus-visible{color:#1d4ed8}
.sbtn,.sbtn:visited{font:inherit;font-size:.78em;color:inherit;background:transparent;border:1px solid #8888;border-radius:6px;padding:2px 10px;cursor:pointer;white-space:nowrap;line-height:1.4;text-decoration:none}.sbtn:hover,.sbtn:focus-visible{background:#8882;text-decoration:none}
main{max-width:60rem;margin:0 auto;padding:16px 24px 64px}
pre{background:#f4f4f6;padding:12px;overflow:auto;border-radius:6px}code{background:#f4f4f6;padding:1px 4px;border-radius:3px}pre code{padding:0}
table{border-collapse:collapse;margin:12px 0}th,td{border:1px solid #d0d0d6;padding:4px 10px;text-align:left;vertical-align:top}th{background:#f4f4f6}
blockquote{border-left:4px solid #d0d0d6;margin:12px 0;padding:0 16px;color:#555}img{max-width:100%}.deadlink{color:#888;text-decoration:line-through}
@media (prefers-color-scheme:dark){body{background:#17171a;color:#e8e8ea}pre,code,th{background:#26262b}th,td{border-color:#44444a}blockquote{border-color:#44444a;color:#aaa}a,a:visited{color:#8bb8ff}a.t:hover,a.t:focus-visible{color:#8bb8ff}}`;

export const markdownPage = (title, html, embed = false) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${pageCss}${lightboxCss}</style>${embed ? '' : '<div class="bar"><a href="/">&larr; tower</a></div>'}<main>${html}</main>${lightboxHtml}<script>${lightboxScript}</script>`;
export const imagePage = (title, src, embed = false) => `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>${pageCss}${lightboxCss}main{text-align:center}</style>${embed ? '' : '<div class="bar"><a href="/">&larr; tower</a></div>'}<main><img src="${esc(src)}?raw=1" alt="${esc(title)}"></main>${lightboxHtml}<script>${lightboxScript}</script>`;
export { esc, pageCss };

// ---------- items ----------
export function readItems(dir = reviewDir()) {
  const file = itemsFile(dir);
  if (!existsSync(file)) return { next: 1, items: [] };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return { next: data.next ?? 1, items: Array.isArray(data.items) ? data.items : [] };
}
export function writeItems(data, dir) {
  mkdirSync(dir, { recursive: true });
  const file = itemsFile(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, file);
}

export const staleDays = 3;
const fileKey = (p) => norm(resolve(p));

// Thread lines written by the system (closing, superseding) carry from:'system'.
function systemLine(id, text, dir, now) { try { appendThread(id, 'system', text, dir, now); } catch { /* a missing line never blocks the change */ } }

function closeRecord(item, { by, reason, kind, supersededBy }, now) {
  item.done = true;
  item.closed = { by, kind, reason, at: now.toISOString(), ...(supersededBy ? { supersededBy } : {}) };
  if (supersededBy) item.supersededBy = supersededBy;
}

// "12" is review item 12, "q3" is open question 3, anything else is a queue id.
export function normalizeRef(ref) {
  const r = String(ref ?? '').trim();
  if (/^\d+$/.test(r)) return String(Number(r));
  const q = r.match(/^(?:q|question[-:# ]?)(\d+)$/i);
  if (q) return `q${Number(q[1])}`;
  if (!safeId(r)) throw new Error(`Invalid dependency ${JSON.stringify(r)}.`);
  return r;
}
const queueEntries = (queuePath) => {
  const map = new Map();
  if (!queuePath) return map;
  try { for (const x of JSON.parse(readFileSync(queuePath, 'utf8')).items ?? []) if (x && safeId(x.id)) map.set(String(x.id), x); } catch { /* none */ }
  return map;
};
// Numbers of the entries under "## Open" that are not marked answered.
export function openQuestionNumbers(text) {
  const out = []; let inOpen = false;
  for (const l of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^##\s/.test(l)) inOpen = /^##\s+Open\b/i.test(l);
    else if (inOpen && /^\d+\.\s/.test(l) && !/^\d+\.\s+[*_]*\(?answered/i.test(l)) out.push(Number(l.match(/^\d+/)[0]));
  }
  return out;
}
function openQuestionSet(file) {
  if (!file) return null;
  try { return new Set(openQuestionNumbers(readFileSync(file, 'utf8'))); } catch { return null; }
}
function checkRefs(refs, data, ctx) {
  const queue = queueEntries(ctx.queue); const qs = openQuestionSet(ctx.openQuestions);
  for (const r of refs) {
    if (/^\d+$/.test(r)) { if (!data.items.some((x) => x.id === Number(r))) throw new Error(`No review item ${r}.`); }
    else if (/^q\d+$/.test(r)) { if (qs && !qs.has(Number(r.slice(1)))) throw new Error(`Question ${r.slice(1)} is not open.`); }
    else if (!queue.has(r)) throw new Error(`No queue item ${r}.`);
  }
}

export function addItem(roots, { path, title, note = '', supersedes = [], dependsOn = [] }, dir = reviewDir(), now = new Date(), ctx = {}) {
  const found = locate(roots, path);
  if (!found.ok) throw new Error(`Refusing ${path}: ${found.reason}.`);
  const data = readItems(dir);
  const explicit = [].concat(supersedes).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean).map(Number);
  for (const n of explicit) if (!Number.isInteger(n) || !data.items.some((x) => x.id === n)) throw new Error(`No review item ${n} to supersede.`);
  const deps = [...new Set([].concat(dependsOn).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean).map(normalizeRef))];
  checkRefs(deps, data, ctx);
  const same = data.items.filter((x) => !x.done && fileKey(x.path) === fileKey(found.real)).map((x) => x.id);
  const replaced = [...new Set([...explicit, ...same])].sort((a, b) => a - b);
  const item = { id: data.next, title: title || basename(found.real), kind: kindOf(found.real), note, path: found.real, added: now.toISOString(), done: false };
  if (replaced.length) item.supersedes = replaced;
  if (deps.length) item.dependsOn = deps;
  data.items.push(item);
  data.next += 1;
  const lines = [];
  for (const n of replaced) {
    const old = data.items.find((x) => x.id === n);
    if (!old.done) {
      closeRecord(old, { by: 'coordinator', kind: 'superseded', reason: `superseded by #${item.id}`, supersededBy: item.id }, now);
      lines.push([itemThreadId(n), `Closed by coordinator: superseded by #${item.id} "${item.title}". Continue in the new thread: /t/${itemThreadId(item.id)}`]);
    } else if (!old.supersededBy) old.supersededBy = item.id;
    lines.push([itemThreadId(item.id), `Replaces #${n} "${old.title}" (thread /t/${itemThreadId(n)}).`]);
  }
  writeItems(data, dir);
  for (const [id, text] of lines) systemLine(id, text, dir, now);
  return { item, found, superseded: replaced };
}

// Close an item with a recorded reason and closer ('person' or 'coordinator').
export function closeItem(id, { by = 'coordinator', reason = '', kind = 'closed' } = {}, dir = reviewDir(), now = new Date()) {
  if (by !== 'person' && by !== 'coordinator') throw new Error('Closer must be person or coordinator.');
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw new Error('A close reason is required.');
  const data = readItems(dir);
  const item = data.items.find((x) => x.id === Number(id));
  if (!item) throw new Error(`No review item ${id}.`);
  if (item.done) throw new Error(`Item ${id} is already closed.`);
  assertTransition(reviewState(item), 'done', by);
  closeRecord(item, { by, reason: text, kind }, now);
  writeItems(data, dir);
  systemLine(itemThreadId(item.id), kind === 'done' ? `Marked done by ${by}.` : `Closed by ${by}: ${text}`, dir, now);
  return item;
}
export const markDone = (id, dir = reviewDir(), by = 'coordinator', now = new Date()) => closeItem(id, { by, reason: 'marked done', kind: 'done' }, dir, now);

// Close <oldId> as superseded by <newId> and link the two.
export function supersedeItem(oldId, newId, dir = reviewDir(), now = new Date(), by = 'coordinator') {
  const data = readItems(dir);
  const a = data.items.find((x) => x.id === Number(oldId)); const b = data.items.find((x) => x.id === Number(newId));
  if (!a) throw new Error(`No review item ${oldId}.`);
  if (!b) throw new Error(`No review item ${newId}.`);
  if (a === b) throw new Error('An item cannot supersede itself.');
  if (!b.supersedes?.includes(a.id)) b.supersedes = [...(b.supersedes ?? []), a.id].sort((x, y) => x - y);
  if (!a.done) closeRecord(a, { by, kind: 'superseded', reason: `superseded by #${b.id}`, supersededBy: b.id }, now);
  else a.supersededBy = b.id;
  writeItems(data, dir);
  systemLine(itemThreadId(a.id), `Closed by ${by}: superseded by #${b.id} "${b.title}". Continue in the new thread: /t/${itemThreadId(b.id)}`, dir, now);
  systemLine(itemThreadId(b.id), `Replaces #${a.id} "${a.title}" (thread /t/${itemThreadId(a.id)}).`, dir, now);
  return { old: a, replacement: b };
}

// "Still needed" answer: restarts the stale clock.
export function keepItem(id, dir = reviewDir(), now = new Date()) {
  const data = readItems(dir);
  const item = data.items.find((x) => x.id === Number(id));
  if (!item) throw new Error(`No review item ${id}.`);
  if (item.done) throw new Error(`Item ${id} is already closed.`);
  item.keptAt = now.toISOString();
  writeItems(data, dir);
  systemLine(itemThreadId(item.id), 'Kept open by person.', dir, now);
  return item;
}

// ---------- derived status ----------
export const statusLabels = { 'waiting-you': 'waiting for you', 'waiting-coordinator': 'waiting for coordinator', blocked: 'blocked', closed: 'closed' };
// Closed beats an unanswered person message beats blocked beats "waiting for you" (the default, also for a new item).
// A person's message never hides behind "blocked": they must see it landed and is owed a reply.
export function threadStatus({ closed = false, blocked = false, messages = [] }) {
  if (closed) return 'closed';
  const last = messages.filter((m) => m.from === 'person' || m.from === 'coordinator').pop();
  if (last?.from === 'person') return 'waiting-coordinator';
  return blocked ? 'blocked' : 'waiting-you';
}
const lastTalk = (messages) => messages.filter((m) => m.from === 'person' || m.from === 'coordinator').pop();
// The last message the person did not write: a reply or progress they may not have seen.
const lastFromOthers = (messages) => messages.filter((m) => m.from === 'coordinator' || m.from === 'agent').pop();
// Unread = something new since the person last looked (their per-thread last-seen time, kept in the personal store).
export const isUnread = (activityAt, seenAt) => Boolean(activityAt) && (!seenAt || Date.parse(activityAt) > Date.parse(seenAt));

// Every item (open and closed) with url, thread, status, blockers, staleness. ctx: {queue, openQuestions, now}.
export function enrichItems(roots, dir = reviewDir(), ctx = {}) {
  const now = ctx.now ?? new Date();
  const items = readItems(dir).items;
  const queue = queueEntries(ctx.queue); const qs = openQuestionSet(ctx.openQuestions);
  const byId = new Map(items.map((x) => [x.id, x]));
  const decisions = ctx.decisions ?? []; const answered = answeredQuestions(decisions);
  const dep = (ref) => {
    if (/^\d+$/.test(ref)) {
      let it = byId.get(Number(ref)); const seen = new Set();
      if (!it) return { ref, open: false, label: `#${ref} (missing)` };
      while (it.done && it.supersededBy && byId.has(it.supersededBy) && !seen.has(it.id)) { seen.add(it.id); it = byId.get(it.supersededBy); }
      return { ref: String(it.id), open: !it.done, label: `#${it.id} ${clip(it.title, 50)}`, thread: itemThreadId(it.id) };
    }
    if (/^q\d+$/.test(ref)) return { ref, open: Boolean(qs?.has(Number(ref.slice(1)))) && !answered.has(Number(ref.slice(1))), label: `question ${ref.slice(1)}` };
    const q = queue.get(ref);
    return { ref, open: Boolean(q) && q.state !== 'done' && !q.superseded, label: q ? clip(q.item, 60) : ref, thread: q ? ref : undefined };
  };
  return items.map((x) => {
    const found = locate(roots, x.path);
    const messages = readThread(itemThreadId(x.id), dir);
    const target = { type: 'item', id: x.id, path: x.path, thread: itemThreadId(x.id) };
    const blockedBy = x.done ? [] : [...(x.dependsOn ?? []).map(dep).filter((d) => d.open), ...blockers(decisions, target, { home: ctx.home })];
    // Work linked to this item (queue `thread: item-<n>`) that is running or waiting on someone other than the person.
    const linkedWork = x.done ? null : [...queue.values()].find((q) => linkedThreadOf(q) === itemThreadId(x.id) && ['running', 'waiting-other'].includes(workState(q))) ?? null;
    const sx = statusOf('review', x, { messages, blocked: blockedBy.length > 0, linkedWork });
    const status = sx.display.discussion;
    const talk = lastTalk(messages);
    const seenAt = ctx.seen?.items?.[itemThreadId(x.id)] ?? null;
    let fileChanged = false; let fileAt = null;
    // The file counts as edited when it changed after the person last looked (or after it was added, if never looked).
    if (found.ok && !x.done) { try { const m = statSync(found.real).mtimeMs; fileChanged = m > Date.parse(seenAt ?? x.added) + 1000; if (m > Date.parse(x.added) + 1000) fileAt = new Date(m).toISOString(); } catch { /* gone */ } }
    const touched = Math.max(Date.parse(x.added), Date.parse(x.keptAt ?? x.added), talk ? Date.parse(talk.at) : 0);
    const stale = !x.done && blockedBy.length === 0 && now.getTime() - touched > staleDays * 86400000;
    const closed = x.done ? (x.closed ?? { by: 'person', kind: 'done', reason: 'marked done', at: null }) : null;
    let mtime; if (found.ok) { try { mtime = statSync(found.real).mtimeMs; } catch { /* gone */ } }
    const notes = decisionNotes(decisions, target, { open: !x.done, added: x.added, mtime, reopenedBy: x.reopenedBy }, { home: ctx.home });
    const other = lastFromOthers(messages);
    const activityAt = x.done ? null : [x.added, other?.at, fileAt].filter(Boolean).sort().pop();
    const blocks = x.done ? [] : items.filter((y) => !y.done && (y.dependsOn ?? []).includes(String(x.id))).map((y) => ({ id: y.id, title: clip(y.title, 50), thread: itemThreadId(y.id) }));
    return { ...x, blocks, seenAt, activityAt, unread: isUnread(activityAt, seenAt), jobState: sx.jobState, conversationState: sx.conversationState, decisionNotes: notes, thread: itemThreadId(x.id), url: found.ok ? serverPath(found) : null, status, statusLabel: sx.display.label, blockedBy, closed, fileChanged, stale, lastAt: talk?.at ?? null, preview: clip(talk?.text ?? '', 140), lastTalkFrom: talk?.from ?? null };
  });
}

// Newest first, with the server path (or null when the file is no longer inside a root).
export function listItems(roots, dir = reviewDir(), { all = false, ...ctx } = {}) {
  return enrichItems(roots, dir, ctx).filter((x) => all || !x.done).sort((a, b) => b.id - a.id);
}

// Every thread with a status: review items, queue items that have a thread, and stray thread files.
export function listDiscussions(roots, dir = reviewDir(), ctx = {}) {
  const out = [];
  const seen = new Set();
  for (const it of enrichItems(roots, dir, ctx)) {
    seen.add(it.thread);
    out.push({ id: it.thread, kind: 'review', title: it.title, status: it.status, statusLabel: it.statusLabel, jobState: it.jobState, conversationState: it.conversationState, preview: it.preview, lastFrom: it.lastTalkFrom, lastAt: it.lastAt ?? it.added, closed: it.closed, blockedBy: it.blockedBy.map((b) => b.label), unread: it.unread });
  }
  const queue = queueEntries(ctx.queue);
  for (const id of threadIds(dir)) {
    if (seen.has(id)) continue;
    const q = queue.get(id);
    if (q && linkedThreadOf(q)) continue; // listed once, under the review item it is linked to
    const messages = readThread(id, dir); const talk = lastTalk(messages);
    const closed = q && (q.state === 'done' || q.superseded) ? { by: q.doneBy ?? 'coordinator', kind: 'done', reason: q.superseded ? 'superseded' : q.doneReason ?? 'work done', at: null } : ctx.resolvedThreads?.has(id) ? { by: 'coordinator', kind: 'done', reason: 'question answered', at: null } : null;
    const sx = q && workState(q) ? statusOf('work', q, { messages }) : null;
    const status = sx ? sx.display.discussion : threadStatus({ closed: Boolean(closed), messages });
    out.push({ id, kind: 'work', title: q ? clip(q.item, 120) : ctx.titles?.[id] ?? id, unread: isUnread(lastFromOthers(messages)?.at, ctx.seen?.items?.[id]), status, statusLabel: sx ? sx.display.label : statusLabels[status], jobState: sx?.jobState ?? null, conversationState: sx?.conversationState ?? null, preview: clip(talk?.text ?? messages.filter((m) => m.from !== 'system').pop()?.text ?? '', 140), lastFrom: talk?.from ?? null, lastAt: messages.length ? messages[messages.length - 1].at : null, closed, blockedBy: [] });
  }
  // Every open question has a Discuss thread even before the first message.
  const listed = new Set(out.map((d) => d.id));
  for (const qt of ctx.questionThreads ?? []) {
    if (listed.has(qt.id)) continue;
    out.push({ id: qt.id, kind: 'question', title: qt.title, status: 'waiting-you', statusLabel: statusLabels['waiting-you'], jobState: null, conversationState: 'quiet', preview: '', lastFrom: null, lastAt: null, closed: null, blockedBy: [], unread: false });
  }
  return out;
}

// ---------- work progress (written by agents, merged into running rows) ----------
const safeId = (id) => /^[A-Za-z0-9][\w.-]{0,120}$/.test(String(id ?? ''));
export const progressFile = (id, dir = reviewDir()) => join(dir, 'progress', `${id}.json`);
export function writeProgress(id, text, dir = reviewDir(), now = new Date()) {
  if (!safeId(id)) throw new Error('Invalid queue id.');
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Progress text is empty.');
  const file = progressFile(id, dir);
  let startedAt = now.toISOString();
  try { const prev = JSON.parse(readFileSync(file, 'utf8')); if (typeof prev.startedAt === 'string') startedAt = prev.startedAt; } catch { /* first write */ }
  mkdirSync(dirname(file), { recursive: true });
  const rec = { text: t.slice(0, 300), at: now.toISOString(), startedAt };
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  appendThread(id, 'agent', rec.text, dir, now); // progress notes also show in the item's thread
  return rec;
}
export function readProgress(id, dir = reviewDir()) {
  if (!safeId(id)) return null;
  try {
    const d = JSON.parse(readFileSync(progressFile(id, dir), 'utf8'));
    if (typeof d.text !== 'string' || !Number.isFinite(Date.parse(d.at)) || !Number.isFinite(Date.parse(d.startedAt))) return null;
    return { text: d.text, at: d.at, startedAt: d.startedAt };
  } catch { return null; }
}

// ---------- work queue (read-only) ----------
const clip = (s, n = 140) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export const projectOf = projectOfItem; // grouping comes from the store setting (project-groups.mjs)
// Who an item waits on, from its waitsFor text: person, coordinator, agent, a date, or a plain prerequisite.
export function waitInfo(w) {
  const parts = (Array.isArray(w) ? w : typeof w === 'string' && w ? [w] : []).map(String).filter(Boolean);
  if (!parts.length) return { who: '', note: '' };
  const first = parts.find((p) => /^person\b/i.test(p)) ?? parts[0];
  const m = first.match(/^(person|coordinator|agent|worker)\b[^:]*:?\s*(.*)$/i);
  if (m) {
    const k = m[1].toLowerCase();
    return { who: k === 'person' ? 'person' : k === 'coordinator' ? 'coordinator' : 'agent', note: clip(m[2], 110) };
  }
  if (/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(first)) return { who: 'date', note: clip(first, 110) };
  return { who: 'prerequisite', note: clip(first, 110) };
}
// Parked work waits on nothing anyone can do now: state 'parked', or a waitsFor that starts with "parked".
// What the person may do with a work row, with the reason when not: the button stays visible and says why it is off.
function actionState(x, to) {
  const from = workState(x);
  if (from === to) return { ok: false, reason: to === 'done' ? 'already done' : 'already parked' };
  if (from === 'done') return { ok: false, reason: to === 'parked' ? 'done: reopen first' : 'already done' };
  return checkTransition(from, to, 'person', { reason: 'x' }).ok ? { ok: true, reason: '' } : { ok: false, reason: 'not allowed now' };
}
const waitText = (x) => (Array.isArray(x.waitsFor) ? x.waitsFor.map(String).join('; ') : typeof x.waitsFor === 'string' ? x.waitsFor : '');
export const isParked = (x) => x.state === 'parked' || (x.state !== 'done' && /^\s*parked\b/i.test(waitText(x)));
export const parkReason = (x) => clip(String(x.parkedReason ?? '').trim() || waitText(x).replace(/^\s*parked\b[\s:,-]*/i, '').trim() || 'no reason recorded', 160);
// A work item linked to a review item (thread: "item-34") has no conversation of its own: it uses that item's thread.
export const linkedThreadOf = (x) => (typeof x?.thread === 'string' && /^item-\d+$/.test(x.thread) ? x.thread : null);
export function readQueue(queuePath, roots, { progressDir = reviewDir(), decisions = [], home, seen = null } = {}) {
  const empty = { running: [], next: [], waiting: [], done: [], needsYou: [], parked: [], notice: null };
  if (!queuePath) return { ...empty, notice: 'No queue file configured.' };
  let data;
  try { data = JSON.parse(readFileSync(queuePath, 'utf8')); } catch (e) {
    return { ...empty, notice: e.code === 'ENOENT' ? 'Queue file not found.' : 'Queue file could not be read.' };
  }
  if (!data || !Array.isArray(data.items)) return { ...empty, notice: 'Queue file has no items list.' };
  const row = (x) => {
    let planUrl = null;
    if (typeof x.plan === 'string' && x.plan) { const f = locate(roots, x.plan); if (f.ok) planUrl = serverPath(f); }
    const w = x.waitsFor;
    const wait = Array.isArray(w) ? w.map(String).join('; ') : typeof w === 'string' ? w : '';
    const wi = waitInfo(w);
    const notes = decisionNotes(decisions, { type: 'queue', id: String(x.id ?? '') }, { open: x.state !== 'done' }, { home });
    const parkedReason = isParked(x) ? parkReason(x) : '';
    const threadId = linkedThreadOf(x) ?? String(x.id ?? '');
    const messages = readThread(threadId, progressDir);
    const sx = statusOf('work', x, { messages });
    const parkedAt = x.parkedAt ?? messages.filter((m) => m.from === 'system' && /-> parked by/.test(m.text)).pop()?.at ?? null;
    const touchedAt = messages.length ? messages[messages.length - 1].at : null;
    const verdict = { close: actionState(x, 'done'), park: actionState(x, 'parked') };
    return { id: String(x.id ?? ''), status: sx, thread: threadId, linked: threadId !== String(x.id ?? ''), unread: isUnread(lastFromOthers(messages)?.at, seen?.items?.[threadId]), actions: verdict, parkedAt, touchedAt, revisit: x.revisit ?? null, revisitOn: x.revisitOn ?? null, parkedReason, doneBy: x.doneBy ?? null, doneReason: x.doneReason ?? null, decisionNotes: notes, item: clip(x.item), area: String(x.area ?? ''), provider: String(x.provider ?? ''), project: projectOf(x), planUrl, wait, waitWho: wi.who, waitNote: wi.note };
  };
  const all = data.items.filter((x) => x && typeof x === 'object' && !x.superseded && ['pending', 'running', 'done', 'parked'].includes(x.state));
  const inState = (s) => all.filter((x) => workState(x) === s); // the one state function decides every placement
  return {
    // Progress files only count for items that are running now; files for other items are ignored.
    running: inState('running').map((x) => ({ ...row(x), progress: readProgress(String(x.id ?? ''), progressDir) })),
    next: inState('new').map(row),
    waiting: inState('waiting-other').map(row),
    needsYou: inState('waiting-person').map(row),
    done: inState('done').slice(-8).map(row),
    parked: inState('parked').map(row),
    notice: null
  };
}

// ---------- threads (.jig/threads/<id>.jsonl: {from, text, at}) ----------
export const maxThreadText = 4000;
const threadFroms = new Set(['person', 'coordinator', 'agent', 'system']);
export const itemThreadId = (n) => `item-${n}`;
export const threadsDir = (dir = reviewDir()) => join(dir, 'threads');
export const threadFile = (id, dir = reviewDir()) => join(threadsDir(dir), `${id}.jsonl`);
export const isThreadId = safeId;

// Attachments on a message: [{path, w, h, type}] with an absolute path inside the personal store.
const attachmentMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && typeof a.path === 'string' && a.path && attachmentMimes.has(a.type))
    .map((a) => ({ path: a.path, w: Number.isFinite(a.w) ? a.w : 0, h: Number.isFinite(a.h) ? a.h : 0, type: a.type })).slice(0, 6);
}
export function cleanReplyTo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))
      || !['person', 'coordinator'].includes(value.from) || typeof value.excerpt !== 'string') return null;
  return { at: value.at, from: value.from, excerpt: value.excerpt.replace(/\s+/g, ' ').trim().slice(0, 120) };
}

export function appendThread(id, from, text, dir = reviewDir(), now = new Date(), attachments = [], replyTo = undefined) {
  if (!safeId(id)) throw new Error('Invalid thread id.');
  if (!threadFroms.has(from)) throw new Error('Invalid sender.');
  const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  const att = cleanAttachments(attachments);
  if (!t && !att.length) throw new Error('Message is empty.');
  if (t.length > maxThreadText) throw new Error(`Message is longer than ${maxThreadText} characters.`);
  const reference = cleanReplyTo(replyTo);
  if (replyTo !== undefined && !reference) throw new Error('Invalid reply reference.');
  mkdirSync(threadsDir(dir), { recursive: true });
  const rec = { from, text: t, at: now.toISOString(), ...(att.length ? { attachments: att } : {}), ...(reference ? { replyTo: reference } : {}) };
  appendFileSync(threadFile(id, dir), JSON.stringify(rec) + '\n'); // one whole line per write
  return rec;
}

// Complete lines only (a half-written last line is ignored until its newline arrives); bad lines are skipped.
export function parseThreadText(raw) {
  const out = [];
  const lines = raw.split('\n'); lines.pop();
  for (const l of lines) {
    try {
      const m = JSON.parse(l);
      if (m && threadFroms.has(m.from) && typeof m.text === 'string' && Number.isFinite(Date.parse(m.at))) {
        const att = cleanAttachments(m.attachments), replyTo = cleanReplyTo(m.replyTo);
        out.push({ from: m.from, text: m.text, at: m.at, ...(att.length ? { attachments: att } : {}), ...(replyTo ? { replyTo } : {}) });
      }
    } catch { /* skip */ }
  }
  return out;
}
export function readThread(id, dir = reviewDir()) {
  if (!safeId(id)) return [];
  try { return parseThreadText(readFileSync(threadFile(id, dir), 'utf8')); } catch { return []; }
}

// One line for a message: its text, then each attached image's absolute path as "[image: <path>]" so the coordinator can open it.
export function messageLine(m) {
  const text = [String(m.text ?? '').replace(/\s+/g, ' ').trim(), ...(m.attachments ?? []).map((a) => `[image: ${a.path}]`)].filter(Boolean).join(' ');
  const reference = cleanReplyTo(m.replyTo);
  return reference ? `re: ${JSON.stringify(reference.excerpt)} | ${text}` : text;
}
export function summarizeThread(messages) {
  const people = messages.filter((m) => m.from === 'person' || m.from === 'coordinator');
  const coord = messages.filter((m) => m.from === 'coordinator').pop();
  const person = messages.filter((m) => m.from === 'person').pop();
  const last = people[people.length - 1];
  return { count: messages.length, coord: coord?.at ?? null, person: person?.at ?? null, unanswered: last?.from === 'person', lastPerson: person ? messageLine(person) : '' };
}

export function threadIds(dir = reviewDir()) {
  try { return readdirSync(threadsDir(dir)).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)).filter(safeId); } catch { return []; }
}
export function threadSummaries(dir = reviewDir()) {
  const out = {};
  for (const id of threadIds(dir)) out[id] = summarizeThread(readThread(id, dir));
  return out;
}
export function unreadThreads(dir = reviewDir()) {
  return Object.entries(threadSummaries(dir)).filter(([, s]) => s.unanswered).map(([id, s]) => ({ id, at: s.person, text: s.lastPerson }));
}

// An id is valid when it names a review item, a queue item or an existing thread file.
export function knownThreadIds(queuePath, dir = reviewDir()) {
  const ids = new Set(threadIds(dir));
  try { for (const x of readItems(dir).items) ids.add(itemThreadId(x.id)); } catch { /* none */ }
  if (queuePath) { try { for (const x of JSON.parse(readFileSync(queuePath, 'utf8')).items ?? []) if (x && safeId(x.id)) ids.add(String(x.id)); } catch { /* none */ } }
  return ids;
}

// Reports each new person message once. Polls (fs.watch drops events on some platforms); starts from now.
export function watchThreads(dir, onMessage, { interval = 700 } = {}) {
  const seenLines = new Map();
  const scan = (first) => {
    for (const id of threadIds(dir)) {
      let raw;
      try { raw = readFileSync(threadFile(id, dir), 'utf8'); } catch { continue; }
      const lines = raw.split('\n'); lines.pop();
      let n = seenLines.get(id);
      if (n === undefined) n = first ? lines.length : 0;
      if (n > lines.length) n = lines.length; // file was rewritten shorter
      if (!first && lines.length > n) {
        for (const m of parseThreadText(lines.slice(n).join('\n') + '\n')) if (m.from === 'person') onMessage(id, m);
      }
      seenLines.set(id, lines.length);
    }
  };
  scan(true);
  const timer = setInterval(() => { try { scan(false); } catch { /* survive churn */ } }, interval);
  return () => clearInterval(timer);
}

// ---------- decisions ----------
// Re-open a closed item because a decision asks for another look; writes a system line in its thread.
export function reopenItem(id, decision, dir = reviewDir(), now = new Date(), by = decision ? 'system' : 'person') {
  const data = readItems(dir);
  const item = data.items.find((x) => x.id === Number(id));
  if (!item) throw new Error(`No review item ${id}.`);
  if (!item.done) return null;
  assertTransition(reviewState(item), 'waiting-person', by); // a superseded item is final
  item.done = false; delete item.closed;
  if (decision) item.reopenedBy = [...new Set([...(item.reopenedBy ?? []), decisionKey(decision)])];
  writeItems(data, dir);
  systemLine(itemThreadId(item.id), decision ? `Reopened by decision ${decisionLabel(decision)}: ${clip(decision.decision, 200)}` : `done -> waiting-person by ${by}: reopened`, dir, now);
  return item;
}

// Record a decision, then apply what applies at once: reopen closed items, leave a system line on each affected item's thread.
export function recordDecision(input, { dir = reviewDir(), home, now = new Date() } = {}) {
  const rec = addDecision(input, { home, now });
  const items = readItems(dir).items; const reopened = [];
  for (const impact of rec.impacts) {
    for (const x of items) {
      if (!refMatches(impact.ref, { type: 'item', id: x.id, path: x.path, thread: itemThreadId(x.id) }, { home })) continue;
      if (impact.kind === 'reopens') { if (x.done) { reopenItem(x.id, rec, dir, now); reopened.push(x.id); } }
      else systemLine(itemThreadId(x.id), `Decision ${decisionLabel(rec)} ${impact.kind} this item: ${clip(rec.decision, 200)}`, dir, now);
    }
  }
  return { decision: rec, reopened };
}

// The Decisions view: each decision with its impacts and the live status of what they hit.
export function decisionsView(roots, dir = reviewDir(), ctx = {}) {
  const decisions = ctx.decisions ?? readDecisions({ home: ctx.home });
  const items = enrichItems(roots, dir, { ...ctx, decisions });
  const queue = queueEntries(ctx.queue);
  const label = { outdated: 'outdated', updated: 'updated since', closed: 'closed', informed: 'new light', later: 'added later', confirmed: 'confirmed', reopened: 'reopened', 'not applied': 'not applied' };
  return decisions.map((d) => ({
    key: decisionKey(d), id: d.id, project: d.project, decision: d.decision, quote: d.quote, source: d.source, at: d.at, answers: d.answers ?? null, voided: d.voided ?? null,
    affects: d.impacts.map((impact) => {
      const hit = items.find((it) => refMatches(impact.ref, { type: 'item', id: it.id, path: it.path, thread: it.thread }, { home: ctx.home }));
      if (hit) {
        const n = hit.decisionNotes.find((x) => x.key === decisionKey(d) && x.kind === impact.kind);
        const blocked = hit.blockedBy.some((b) => b.ref === `decision:${decisionKey(d)}`);
        const state = impact.kind === 'blocks' ? (hit.done ? 'closed' : blocked ? 'blocking' : 'released') : impact.kind === 'unblocks' ? (hit.done ? 'closed' : 'released') : n?.state ?? 'open';
        return { ref: impact.ref, kind: impact.kind, type: 'item', title: hit.title, thread: hit.thread, state, stateLabel: label[state] ?? state, active: Boolean(n?.active) || state === 'blocking' };
      }
      let q = null;
      for (const [id, entry] of queue) if (refMatches(impact.ref, { type: 'queue', id }, { home: ctx.home })) { q = { id, entry }; break; }
      if (q) { const done = q.entry.state === 'done' || q.entry.superseded; return { ref: impact.ref, kind: impact.kind, type: 'queue', title: clip(q.entry.item, 80), thread: q.id, state: done ? 'closed' : 'open', stateLabel: done ? 'done' : q.entry.state ?? 'open', active: !done && impact.kind === 'outdates' }; }
      return { ref: impact.ref, kind: impact.kind, type: 'none', title: impact.ref, thread: null, state: 'unlinked', stateLabel: 'not in the dashboard', active: false };
    })
  }));
}

// ---------- one status function ----------
// The only place that decides what an item is: {jobState, conversationState, display}. Every surface (dashboard placement,
// row chips, thread header, Discussions, /api/state) reads this and nothing else.
export function statusOf(kind, x, { messages = [], blocked = false, linkedWork = null } = {}) {
  const talk = lastTalk(messages);
  const conversationState = talk ? (talk.from === 'person' ? 'awaiting-coordinator' : 'answered') : 'quiet';
  const jobState = kind === 'work' ? workState(x) : reviewState(x, { blocked });
  const final = jobState === 'done' || jobState === 'superseded';
  const awaiting = conversationState === 'awaiting-coordinator' && !final;
  let jobLabel; let placement; let linkedActive = false;
  if (kind === 'work') {
    const wi = waitInfo(x.waitsFor); const note = wi.note.split(' (')[0]; // bracketed internal hints stay out of labels
    jobLabel = ({
      new: 'Next up', running: 'Running', 'waiting-person': 'Your move' + (note ? ': ' + note : ''),
      'waiting-other': 'Waiting' + (wi.who ? ' on ' + (wi.who === 'prerequisite' ? 'a prerequisite' : wi.who) : '') + (note ? ': ' + note : ''),
      parked: 'Parked: ' + parkReason(x), done: 'Done' + (x.doneReason ? ': ' + x.doneReason : ''), superseded: 'Superseded'
    })[jobState] ?? 'Unknown state';
    placement = jobState;
  } else {
    jobLabel = ({ 'waiting-person': 'waiting for you', blocked: 'blocked', done: 'closed', superseded: 'closed' })[jobState] ?? 'waiting for you';
    // The person is waiting on linked work, not the other way round: show that until the work waits on them or is done.
    const lw = jobState === 'waiting-person' && linkedWork ? workState(linkedWork) : null;
    if (lw === 'running' || lw === 'waiting-other') {
      const noun = /^\s*spike\b/i.test(String(linkedWork.item ?? '')) ? 'spike' : 'work';
      const who = lw === 'waiting-other' ? waitInfo(linkedWork.waitsFor).who : '';
      jobLabel = lw === 'running' ? noun + ' running' : noun + ' waiting' + (who ? ' on ' + (who === 'prerequisite' ? 'a prerequisite' : who) : '');
      linkedActive = true;
    }
    placement = jobState === 'blocked' ? 'blocked' : final ? 'closed' : 'list';
  }
  const discussion = final ? 'closed' : awaiting ? 'waiting-coordinator' : jobState === 'blocked' ? 'blocked' : linkedActive ? 'working' : jobState === 'waiting-person' ? 'waiting-you' : kind === 'review' ? 'waiting-you' : 'working';
  const label = awaiting ? (kind === 'work' ? 'Your message is waiting for the coordinator' : 'waiting for coordinator') : jobLabel;
  return { jobState, conversationState, display: { label, jobLabel, discussion, placement } };
}
