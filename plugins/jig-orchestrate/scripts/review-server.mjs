if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-server.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Local review server: serves allowlisted files read-only on 127.0.0.1 and lists review items.
// Usage: node scripts/review-server.mjs [--port 7788] | --check
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addItem, appendThread, closeItem, decisionsView, reopenItem, defaultPort, esc, imagePage, isThreadId, keepItem, kindOf, knownThreadIds, listDiscussions, listItems, loadConfig, locate, locateUrl, markDone,
  markdownPage, readProgress, linkedThreadOf, maxThreadText, openQuestionNumbers, readQueue, readThread, renderMarkdown, projectRoot, reviewDir, serverPath, summarizeThread, threadIds, threadStatus, statusLabels, threadSummaries, withReviewReadScope
} from './review-core.mjs';
import { parseMessage, threadPage } from './review-thread-page.mjs';
import { messageArtifacts, replyReference } from './review-message.mjs';
import { threadArtifacts } from './review-thread-artifacts.mjs';
import { homePage } from './review-home-page.mjs';
import { deriveNeedsYou } from './review-needs-you.mjs';
import { readDecisions } from './review-decisions.mjs';
import { closeWork, moveWork, doctor, workForThread, reopenWork, setParked, setWorkRevisit } from './review-work.mjs';
import { projectDir, projectName } from './jig-store.mjs';
import { attachmentMime, decodeImages, maxAttachBody, servedAttachment, storeImages } from './review-attach.mjs';
import { projectGroups } from './project-groups.mjs';
import { brandFile } from './review-brand.mjs';
import { themeFile, themeTypography, themeLinks, towerTokenCss } from './tower-theme.mjs';
import { markdownPreviewCss } from './review-panel-artifacts.mjs';
import { dismissDigest, markSeen, readSeen, visitHome } from './review-seen.mjs';
import { readUndo, undoLast, withUndo } from './review-undo.mjs';
import { answerQuestion, parseQuestions, questionId, questionsView, readAnswers, reopenQuestion } from './review-questions.mjs';
import { boardSnapshot, buildDigest } from './review-digest.mjs';
import { createTowerGpuMonitor, towerPreferences, towerSettings, saveTowerSettings, SettingsError } from './tower-config.mjs';
import { findInterrupted } from './tower-resume.mjs';
import { sessionsDir } from './review-capabilities.mjs';
import { buildSessionBrief, handoffBlock, pidAlive } from './review-sessions.mjs';
import { canonicalThread, ownerLiveness, readOwnership } from './review-ownership.mjs';
import { requireTower } from './layers.mjs';

const types = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonl': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.woff2': 'font/woff2'
};
// Admission table: no handler below may receive an unclassified method/path.
// Samples cover every action, and are exercised by the route inventory test.
export const towerRoutes = [
  { methods: ['GET', 'HEAD'], pattern: /^\/$/, paths: ['/'], changesState: false },
  { methods: ['GET', 'HEAD'], pattern: /^\/t\/[^/]+$/, paths: ['/t/item-1'], changesState: false },
  { methods: ['GET', 'HEAD'], pattern: /^\/api\/state$/, paths: ['/api/state'], changesState: false },
  { methods: ['GET', 'HEAD', 'POST'], pattern: /^\/api\/threads\/[^/]+$/, paths: ['/api/threads/item-1'], changesState: false },
  { methods: ['POST'], pattern: /^\/api\/threads\/[^/]+\/(give|return)$/, paths: ['give', 'return'].map(a => `/api/threads/item-1/${a}`), changesState: true },
  { methods: ['GET', 'HEAD'], pattern: /^\/api\/settings$/, paths: ['/api/settings'], changesState: false },
  { methods: ['POST'], pattern: /^\/api\/settings$/, paths: ['/api/settings'], changesState: true },
  { methods: ['POST'], pattern: /^\/api\/(seen|undo)$/, paths: ['/api/seen', '/api/undo'], changesState: true },
  { methods: ['POST'], pattern: /^\/api\/questions\/[^/]+\/[^/]+$/, paths: ['accept', 'reply', 'defer', 'reopen'].map(a => `/api/questions/q1/${a}`), changesState: true },
  { methods: ['POST'], pattern: /^\/api\/work\/[^/]+\/(close|park|unpark|reopen|revisit|resume|close-stalled)$/, paths: ['close', 'park', 'unpark', 'reopen', 'revisit', 'resume', 'close-stalled'].map(a => `/api/work/job-1/${a}`), changesState: true },
  { methods: ['POST'], pattern: /^\/api\/items\/\d+\/(done|close|keep|reopen)$/, paths: ['done', 'close', 'keep', 'reopen'].map(a => `/api/items/1/${a}`), changesState: true },
  { methods: ['GET', 'HEAD'], pattern: /^\/brand\/[a-z0-9-]+\.svg$/, paths: ['/brand/jig.svg'], changesState: false },
  { methods: ['GET'], pattern: /^\/toolbox\/themes\/[a-z0-9-]+\/theme\.css$/, paths: ['/toolbox/themes/paper/theme.css'], changesState: false },
  { methods: ['GET'], pattern: /^\/toolbox\/typography\/type\.css$/, paths: ['/toolbox/typography/type.css'], changesState: false },
  { methods: ['GET', 'HEAD'], pattern: /^\/f\//, paths: ['/f/r/a.md'], changesState: false },
  { methods: ['GET', 'HEAD'], pattern: /^\/att\/[^/]+\/[^/]+$/, paths: ['/att/item-1/1000000000-1.png'], changesState: false }
];

// One guard, before dispatch. Explicit hostile headers always override fallback.
function guardTowerRequest(req, pathname) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return 'Invalid Host';
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${req.headers.host}`) return 'Invalid Origin';
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return 'Cross-site request';
  const route = towerRoutes.find(r => r.methods.includes(req.method) && r.pattern.test(pathname));
  if ((!['GET', 'HEAD', 'OPTIONS'].includes(req.method) || route?.changesState)
      && origin === undefined && site !== 'same-origin') return 'Same-origin required';
  return route ? null : 'Not found';
}
const baseHeaders = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const pageCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'";
const threadCsp = pageCsp.replace('; frame-ancestors', "; frame-src 'self'; frame-ancestors");
// Script-free previews, including when their URL is opened directly. Same-origin
// access lets the parent remember scroll; scripts remain forbidden at both layers.
const previewCsp = "default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; sandbox allow-same-origin";

// Numbered entries under the "Open" heading that are not marked answered.
export const countOpenQuestions = (text) => openQuestionNumbers(text).length;

// Route table: a later write route such as POST /api/pointer is one more entry here.
export function createReviewServer({ roots, openQuestions = null, queue = null, dir = reviewDir(), home, project = projectName(projectRoot(), { home }), gpu, root = projectRoot() }) {
  requireTower(root, { home });
  if (gpu === undefined) gpu = createTowerGpuMonitor({ home, project });
  // Validate once before accepting requests, rather than spawning Git while
  // projecting each thread. Keep the existing read-error response for bad stores.
  try { sessionsDir(dir); } catch { /* Ownership routes report unavailable. */ }
  const send = (res, status, body, headers = {}) => {
    const navigation = headers['Content-Type'] === 'text/html; charset=utf-8';
    res.writeHead(status, { ...baseHeaders, ...(navigation ? { 'Cache-Control': 'private, no-cache' } : {}), ...headers });
    res.end(body);
  };
  const deny = (res, found) => send(res, found.reason === 'not found' ? 404 : found.reason === 'bad path' ? 400 : 403, found.reason === 'not found' ? 'Not found' : found.reason === 'bad path' ? 'Bad request' : 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });

  function messageView(m, origin = 'http://127.0.0.1:7788') {
    const blocks = parseMessage(m.text, origin, path => {
      const found = locate(roots, path);
      return found.ok ? serverPath(found) : null;
    });
    return { ...m, blocks };
  }

  // open-questions.md as cards. The file is only read here; answers live in the personal store.
  function questionData() {
    if (!openQuestions) return null;
    const found = locate([{ prefix: 'oq', path: dirname(openQuestions) }, ...roots], openQuestions);
    if (!found.ok) return null;
    let text; try { text = readFileSync(found.real, 'utf8'); } catch { return null; }
    const resolveLink = (u) => {
      if (/^https?:/.test(u)) {
        try { const x = new URL(u); return ['127.0.0.1', 'localhost'].includes(x.hostname) ? { href: x.pathname + x.search, label: decodeURIComponent(basename(x.pathname)) } : { href: u, label: x.hostname }; } catch { return null; }
      }
      const f = locate(roots, u);
      return f.ok ? { href: serverPath(f), label: basename(f.real) } : { href: null, label: basename(u) };
    };
    return parseQuestions(text, { resolveLink });
  }
  const rawQueue = () => { try { return JSON.parse(readFileSync(queue, 'utf8')).items ?? []; } catch { return []; } };
  const snapshotNow = (parsed) => boardSnapshot({ queueItems: queue ? rawQueue() : [], openQuestionIds: parsed ? questionsView(parsed, readAnswers(project, { home })).open.map((c) => c.id) : [] });
  const titleOf = (kind, id) => {
    if (kind === 'work') return String(rawQueue().find((x) => x && String(x.id) === String(id))?.item ?? id).slice(0, 80);
    return String(listItems(roots, dir, { all: true }).find((x) => x.id === Number(id))?.title ?? id).slice(0, 80);
  };
  const undoable = (kind, id, verb, fn) => withUndo({ kind, id, label: `${verb} "${titleOf(kind, id)}"`, queue, dir, project, home }, fn);
  const undoInfo = () => readUndo(project, { home });

  // The last few messages of a question's own thread, shown on its card.
  function questionThreadView(c, origin) {
    const id = `oq-${c.n}`;
    const msgs = readThread(id, dir).filter((m) => m.from === 'person' || m.from === 'coordinator' || m.reply);
    return { id, count: msgs.length, messages: msgs.slice(-3).map(m => messageView(m, origin)) };
  }

  // Project only public relationship fields: never serialize capabilities or artifact paths.
  function ownershipView(id) {
    const row = readOwnership(id, dir), owner = row.owner;
    if (!owner) return { ...row, state: 'empty', cue: 'coordinator · unowned', details: 'Generation ' + row.ownershipGeneration };
    let session = null;
    if (/^[a-f0-9-]{36}$/.test(owner.sessionId)) {
      try { session = JSON.parse(readFileSync(join(sessionsDir(dir), owner.sessionId + '.session.json'), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw new Error('Session record unavailable; ownership is unchanged.'); }
      if (session && (session.schema !== 1 || session.id !== owner.sessionId || session.item !== canonicalThread(id, dir) || !Array.isArray(session.children))) throw new Error('Session record unavailable; ownership is unchanged.');
    }
    const live = session && pidAlive(session.pid), watchLive = session && pidAlive(session.watchPid);
    const liveness = ownerLiveness(owner, session);
    const state = liveness.basis === 'heartbeat'
      ? session?.state === 'ended' ? 'dead' : !liveness.live ? 'stale' : !session?.heartbeat ? 'pending' : 'ready'
      : !session || session.state === 'ended' || !live ? 'dead' : session.state === 'pending' ? 'pending' : !watchLive || Date.now() - (session.heartbeat ?? 0) > 120000 ? 'stale' : session.state === 'ready' ? 'ready' : 'error';
    const heartbeat = session?.heartbeat ? new Date(session.heartbeat).toISOString() : 'unavailable';
    const since = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(owner.claimedAt)).replace(',', '');
    return { ownershipGeneration: row.ownershipGeneration, owner, state, heartbeat, liveness,
      children: (session?.children ?? []).map(c => ({ id: String(c.agentId ?? c.call), state: c.pid && !pidAlive(c.pid) ? 'dead' : c.state ?? 'registered' })),
      cue: 'Owner session ' + owner.label + ': ' + (state === 'dead' ? 'not watching' : state) + ' · claimed ' + since,
      details: 'Session ' + owner.sessionId + ' · provider ' + owner.provider + ' · since ' + owner.claimedAt + ' · generation ' + row.ownershipGeneration + ' · heartbeat ' + heartbeat + ' · liveness: ' + (liveness.basis === 'heartbeat' ? 'heartbeat age ' + Math.floor(liveness.ageMs / 1000) + ' seconds; stale in ' + Math.ceil(liveness.staleInMs / 1000) + ' seconds' + (!session?.heartbeat ? ' (initial claim grace period)' : '') : 'process; PID ' + (live ? 'live' : 'unavailable')) };
  }
  function relationships(ids) {
    try {
      const rows = [...new Set(ids.map(id => canonicalThread(id, dir)))].map(id => ({ id, ...ownershipView(id) }));
      const file = join(sessionsDir(dir), 'coordination.json');
      let requests = [];
      try { const data = JSON.parse(readFileSync(file, 'utf8')); if (data.schema !== 1 || !data.requests) throw new Error(); requests = Object.values(data.requests); }
      catch (e) { if (e.code !== 'ENOENT') throw new Error('Relationships unavailable; retry reading.'); }
      return { rows: rows.map(row => ({ ...row, work: rawQueue().filter(w => linkedThreadOf(w) === row.id).map(w => ({ id: String(w.id), state: w.state, branch: w.branch ?? null })),
        requests: requests.filter(r => r.item === row.id && r.state === 'open').map(r => ({ id: r.id, needs: r.needs, branch: r.branch ?? null, state: r.state })) })) };
    } catch { return { rows: [], error: 'Ownership / relationships unavailable. Retry reading; ownership is unchanged.' }; }
  }

  const stalledRows = () => new Map(findInterrupted(rawQueue(), { dir, now: Date.now(), stalledHours: towerPreferences({ home, project }).stalledHours, git: () => ({}) }).map(x => [String(x.id), x]));
  function state(origin) {
    const now = new Date();
    const parsed = questionData();
    const answers = readAnswers(project, { home });
    const qv = parsed ? questionsView(parsed, answers) : null;
    const seen = readSeen(project, { home });
    const decisions = readDecisions({ home });
    const titles = {}; const questionThreads = [];
    if (parsed) for (const c of parsed.open) { titles[`oq-${c.n}`] = `Question ${c.n}: ${c.title}`; if (qv.open.some((o) => o.id === c.id)) questionThreads.push({ id: `oq-${c.n}`, title: titles[`oq-${c.n}`] }); }
    const openThreads = new Set(questionThreads.map((q) => q.id));
    const resolvedThreads = new Set(threadIds(dir).filter((id) => /^oq-\d+$/.test(id) && !openThreads.has(id)));
    const ctx = { queue, openQuestions, now, decisions, home, seen, titles, questionThreads, resolvedThreads };
    const items = listItems(roots, dir, ctx); const discussions = listDiscussions(roots, dir, ctx);
    for (const d of discussions) {
      const m = readThread(d.id, dir).findLast(m => m.text.startsWith(d.preview.replace(/…$/, '')));
      if (!m) continue;
      const { blocks } = messageView(m, origin);
      d.artifactCount = messageArtifacts(blocks).length + (m.attachments || []).length;
      d.preview = blocks.flatMap(b => b.items.map(line => line.map(t => t.label || t.v).join(''))).join(' ').slice(0, 140);
    }
    const work = queue ? readQueue(queue, roots, { progressDir: dir, decisions, home, seen }) : null;
    if (work) {
      const stalled = new Map(findInterrupted(rawQueue(), { dir, now: now.getTime(), stalledHours: towerPreferences({ home, project }).stalledHours, git: () => ({}) }).map(x => [x.id, x]));
      for (const row of work.running) row.stalled = stalled.has(row.id);
      if (towerPreferences({ home, project }).newHome) {
        const raw = new Map(rawQueue().map(x => [String(x.id), x]));
        for (const row of work.running) {
          row.runningAt = raw.get(row.id)?.runningAt ?? null;
          row.stalledReason = stalled.get(row.id)?.why ?? null;
        }
        // A recorded board wait is the authority. No process is resumed here.
        for (const row of work.waiting) if (row.waitNote === 'resume requested by the person') {
          const requestedAt = raw.get(row.id)?.waitingSince ?? readThread(row.id, dir).findLast(m => m.from === 'system' && (/ -> waiting-other by /.test(m.text) || /^edited by [^:]+: .*wait changed/.test(m.text)))?.at ?? null;
          work.running.push({ ...row, runningAt: raw.get(row.id)?.runningAt ?? null,
            resumeRequested: true, resumeRequestedAt: requestedAt, stalled: false });
        }
        // A resumed job keeps its place in the rail: order by queue position, not by arrival.
        const place = new Map(rawQueue().map((x, i) => [String(x.id), i]));
        work.running.sort((a, b) => (place.get(String(a.id)) ?? 1e9) - (place.get(String(b.id)) ?? 1e9));
      }
    }
    const unread = {};
    for (const d of discussions) if (d.unread) unread[d.id] = true;
    for (const it of items) if (it.unread) unread[it.thread] = true;
    if (work) for (const list of [work.running, work.next, work.waiting, work.needsYou, work.parked]) for (const r of list) if (r.unread) unread[r.thread] = true;
    const decisionRows = decisionsView(roots, dir, ctx).reverse();
    const threads = {}; const titleMap = {};
    for (const id of threadIds(dir)) threads[id] = readThread(id, dir);
    for (const d of discussions) titleMap[d.id] = d.title;
    const digest = buildDigest({
      since: seen.home.prev ?? null, snapPrev: seen.home.snapPrev ?? null, items: listItems(roots, dir, { all: true, ...ctx }), titles: titleMap, threads, queueItems: queue ? rawQueue() : [],
      decisions: decisionRows, given: qv ? qv.given : [], openQuestionIds: qv ? qv.open.map((c) => c.id) : [], parked: work ? work.parked : [], today: now.toISOString().slice(0, 10)
    });
    const board = {
      items, discussions, unread, digest, ownershipMap: relationships([...items.map(x => x.thread), ...discussions.map(x => x.id), ...knownThreadIds(queue, dir)]), undo: undoInfo(), project, groupOrder: projectGroups({ home }).order, gpu: gpu ? gpu.snapshot() : null, gpuOn: !!gpu && (gpu.enabled ? gpu.enabled() : true),
      questions: qv ? { open: qv.open.map((c) => ({ ...c, thread: questionThreadView(c, origin) })), given: qv.given, fileAnswered: qv.fileAnswered } : null, openQuestionCount: qv ? qv.open.length : 0,
      work, threads: threadSummaries(dir), decisions: decisionRows, boardIssues: queue ? doctor(queue, { dir }) : []
    };
    if (towerPreferences({ home, project }).newHome) {
      // Preserve the legacy API shape while off. Full threads are used only on
      // the server; summaries do not establish a request awaiting the person.
      const raw = new Map(rawQueue().map(w => [String(w.id), w]));
      const derivedWork = Object.fromEntries(Object.entries(work ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.map(w => ({ ...w, waitingSince: raw.get(w.id)?.waitingSince })) : value]));
      board.needsYou = deriveNeedsYou({ ...board, work: derivedWork, threads });
    }
    return board;
  }

  // Notes of work items linked to this review item that were written in their own thread before the link: read-only.
  function earlierNotes(threadId) {
    return rawQueue().filter((x) => x && linkedThreadOf(x) === threadId).map((x) => ({ id: String(x.id), title: String(x.item ?? x.id).slice(0, 100), messages: readThread(String(x.id), dir).map(m => messageView(m)) })).filter((n) => n.messages.length);
  }
  // Title and link for a thread id; null when the id is unknown.
  function threadInfo(id) {
    const m = id.match(/^item-(\d+)$/);
    if (m) {
      const it = listItems(roots, dir, { all: true, queue, openQuestions, now: new Date(), decisions: readDecisions({ home }), home, seen: readSeen(project, { home }) }).find((x) => x.id === Number(m[1]));
      if (it) {
        return {
          title: it.title, link: it.url, linkLabel: 'Open alone', kind: 'review', itemId: it.id, done: !!it.done,
          status: it.status, statusLabel: it.statusLabel, closed: it.closed, blockedBy: it.blockedBy, supersededBy: it.supersededBy ?? null,
          earlierNotes: earlierNotes(id), topicWork: workForThread(rawQueue(), id, { progressOf: (w) => readProgress(w, dir) }), supersedes: it.supersedes ?? [], blocks: it.blocks ?? [], fileChanged: it.fileChanged, stale: it.stale, decisionNotes: it.decisionNotes,
          actions: it.done ? (it.closed?.kind === 'superseded' ? [] : ['reopen']) : ['done', 'close']
        };
      }
    }
    if (queue) {
      const w = readQueue(queue, roots, { progressDir: dir, decisions: readDecisions({ home }), home });
      for (const [state, list] of [['Running', w.running], ['Next', w.next], ['Waiting', w.waiting], ['Needs you', w.needsYou], ['Parked', w.parked], ['Done', w.done]]) {
        const r = list.find((x) => x.id === id);
        if (r) {
          // A work item's status comes from the queue state only. An open review item for the same file is only linked.
          const rv = r.planUrl ? listItems(roots, dir, { all: false }).find((x) => x.url === r.planUrl) : null;
          const openReview = rv ? { id: rv.id, thread: rv.thread } : null;
          // A closed review of the same file is named, never used as this item's status.
          const cl = r.planUrl && !rv ? listItems(roots, dir, { all: true }).filter((x) => x.done && x.url === r.planUrl).sort((a, b) => b.id - a.id)[0] : null;
          const docNote = cl ? { name: basename(cl.path), id: cl.id, thread: cl.thread } : null;
          return { title: r.item, link: r.planUrl, linkLabel: 'Open alone', kind: 'work', linkedThread: r.linked ? r.thread : null, state, chip: r.status.display.jobLabel, status: r.status.display.discussion, statusLabel: r.status.display.label, jobState: r.status.jobState, conversationState: r.status.conversationState, openReview, docNote, decisionNotes: r.decisionNotes,
            actions: state === 'Done' ? ['reopen'] : state === 'Parked' ? ['unpark', 'close'] : ['park', 'close'],
            closed: state === 'Done' ? { by: r.doneBy ?? 'coordinator', kind: 'done', reason: r.doneReason ?? 'work done' } : null };
        }
      }
    }
    const oq = id.match(/^oq-(\d+)$/);
    if (oq) {
      const parsed = questionData();
      const card = parsed?.open.find((c) => c.n === Number(oq[1]));
      const stillOpen = card && questionsView(parsed, readAnswers(project, { home })).open.some((c) => c.id === card.id);
      if (card) {
        const lines = [card.why, card.recommended ? `Recommended: ${card.recommended}` : '', ...card.subs.map((s) => `${s.n} ${s.text}${s.recommended ? ` (recommended: ${s.recommended})` : ''}`)].filter(Boolean);
        return { title: `Question ${card.n}: ${card.title}`, link: card.link?.href && card.link.href.startsWith('/f/') ? card.link.href : null, linkLabel: 'Open alone', kind: 'question', questionLines: lines, actions: [], ...(stillOpen ? {} : { closed: { by: 'coordinator', kind: 'done', reason: 'question answered' } }) };
      }
      if (threadIds(dir).includes(id)) return { title: `Question ${oq[1]}`, link: null, kind: 'question', questionLines: [], actions: [], closed: { by: 'coordinator', kind: 'done', reason: 'question answered' } };
    }
    return knownThreadIds(queue, dir).has(id) ? { title: id, link: null } : null;
  }
  // Body of a JSON POST, or null after answering the error itself.
  async function jsonBody(req, res, limit = 8192) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) { json(res, 415, { error: 'JSON only' }); return null; }
    let raw; try { raw = await readBody(req, limit); } catch { json(res, 413, { error: 'too large' }); return null; }
    try { const b = JSON.parse(raw || '{}'); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; } catch { json(res, 400, { error: 'bad JSON' }); return null; }
  }
  // Settings: small JSON body on this origin (the guard has already checked Host and Origin); validation is tower-config's, shared with the CLI.
  async function postSettings(req, res) {
    const body = await jsonBody(req, res, 4096);
    if (!body) return;
    try { return json(res, 200, { ok: true, ...saveTowerSettings(body, { home, project }) }); }
    catch (e) { return e instanceof SettingsError ? json(res, 400, { error: 'Settings refused', fields: e.fields }) : json(res, 500, { error: 'server error' }); }
  }
  // Seen, undo and question answers: small personal-state writes, all JSON-only POSTs on this origin.
  async function postPersonal(req, res, path) {
    const body = await jsonBody(req, res);
    if (!body) return;
    if (path === '/api/seen') {
      if (body.kind === 'thread') {
        if (typeof body.id !== 'string' || !isThreadId(body.id) || !threadInfo(body.id)) return json(res, 404, { error: 'no such thread' });
        markSeen(project, [body.id], { home }); return json(res, 200, { ok: true });
      }
      if (body.kind === 'all') {
        const s = state(); markSeen(project, [...Object.keys(s.unread), ...s.items.map((i) => i.thread)], { home }); return json(res, 200, { ok: true });
      }
      if (body.kind === 'home') { visitHome(project, snapshotNow(questionData()), { home }); return json(res, 200, { ok: true }); }
      if (body.kind === 'digest-dismiss') { dismissDigest(project, { home }); return json(res, 200, { ok: true }); }
      return json(res, 400, { error: 'bad kind' });
    }
    if (path === '/api/undo') {
      try { return json(res, 200, { ok: true, ...undoLast({ queue, dir, project, home, id: typeof body.id === 'string' ? body.id : undefined }) }); } catch (e) { return json(res, 409, { error: e.message }); }
    }
    const q = path.match(/^\/api\/questions\/(q\d+(?:\.\d+)?)\/(accept|reply|defer|reopen)$/);
    if (q) {
      try {
        if (q[2] === 'reopen') { reopenQuestion(q[1], { project, home }); return json(res, 200, { ok: true }); }
        const parsed = questionData();
        if (!parsed) return json(res, 404, { error: 'no open questions file' });
        const r = answerQuestion({ id: q[1], action: q[2], text: body.text }, { parsed, project, home, dir });
        return json(res, 200, { ok: true, thread: r.thread, ids: r.ids });
      } catch (e) { return json(res, e.status ?? 409, { error: e.message }); }
    }
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > limit) { if (n - c.length <= limit) { reject(new Error('too large')); req.resume(); } } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  async function postThread(req, res, id) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return json(res, 415, { error: 'JSON only' });
    if (!threadInfo(id)) return json(res, 404, { error: 'no such item' });
    let body;
    try { body = JSON.parse(await readBody(req, maxAttachBody + maxThreadText * 4)); } catch (e) { return json(res, e.message === 'too large' ? 413 : 400, { error: e.message === 'too large' ? 'message too large' : 'bad JSON' }); }
    if (!body || typeof body !== 'object' || body.from !== 'person') return json(res, 403, { error: 'only the person may post here' });
    if (body.text !== undefined && typeof body.text !== 'string') return json(res, 400, { error: 'text must be a string' });
    const text = body.text ?? '';
    let images;
    try { images = decodeImages(body.images); } catch (e) { return json(res, e.status ?? 400, { error: e.message }); }
    if (!text.trim() && !images.length) return json(res, 400, { error: 'empty message' });
    if (text.length > maxThreadText) return json(res, 413, { error: `message longer than ${maxThreadText} characters` });
    let replyTo;
    if (body.replyTo !== undefined) {
      if (!body.replyTo || typeof body.replyTo.at !== 'string') return json(res, 400, { error: 'invalid reply reference' });
      const target = readThread(id, dir).find(m => m.at === body.replyTo.at && (['person', 'coordinator'].includes(m.from) || m.reply));
      if (!target) return json(res, 400, { error: 'quoted message no longer exists' });
      replyTo = replyReference(target);
    }
    let attachments = [];
    if (images.length) {
      if (!projectDir(project, { home })) return json(res, 503, { error: 'no personal store to keep images in' });
      try { attachments = storeImages(project, id, images, { home }); } catch { return json(res, 500, { error: 'could not store the images' }); }
    }
    appendThread(id, 'person', text, dir, new Date(), attachments, replyTo);
    return json(res, 200, { ok: true });
  }

  function serveFile(req, res, url) {
    const preview = url.searchParams.get('preview') === '1';
    const parts = url.pathname.split('/').slice(2); // after /f/
    let segs;
    try { segs = parts.map(decodeURIComponent); } catch { return send(res, 400, 'Bad request'); }
    if (preview && (req.url.split('?')[0] !== url.pathname || segs.some(s => /[\\/]/.test(s)))) return send(res, 400, 'Bad request');
    if (segs.at(-1) === '') segs.pop();
    const [prefix, ...rest] = segs;
    const found = locateUrl(roots, prefix, rest);
    if (!found.ok) return deny(res, found);
    let st;
    try { st = statSync(found.real); } catch { return send(res, 404, 'Not found'); }
    if (st.isDirectory()) {
      // Only allowlisted children, with private entries rejected before inspecting them.
      const links = readdirSync(found.real).filter(name => name.toLowerCase() !== 'private').flatMap(name => {
        const child = locate(roots, join(found.real, name));
        return child.ok ? [`<li><a href="${esc(serverPath(child))}">${esc(name)}</a></li>`] : [];
      });
      if (preview) return send(res, 415, 'No preview for folders');
      return send(res, 200, markdownPage(found.rel, `<h1>${esc(basename(found.real))}</h1><ul>${links.join('')}</ul>`, url.searchParams.has('embed')), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp });
    }
    if (!st.isFile()) return send(res, 404, 'Not found');
    const kind = kindOf(found.real);
    const ref = `${prefix}/${found.rel.split(/[\\/]/).join('/')}`;
    const raw = url.searchParams.has('raw');
    if (kind === 'markdown' && (!raw || preview)) {
      const html = renderMarkdown(readFileSync(found.real, 'utf8'), { roots, baseDir: dirname(found.real), src: ref });
      if (preview) return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(found.rel)}</title>${themeLinks(towerPreferences({ home, project }).themePack)}<style>${towerTokenCss.replace('.needs-panel{', 'body{')}${markdownPreviewCss}</style><main>${html}</main>`, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': previewCsp });
      return send(res, 200, markdownPage(found.rel, `<div data-page="${esc(ref)}">${html}</div>`, url.searchParams.has('embed')), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp });
    }
    if (kind === 'image' && !raw && !preview && req.headers['sec-fetch-dest'] === 'document') {
      return send(res, 200, imagePage(found.rel, serverPath(found), url.searchParams.has('embed')), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp });
    }
    const type = types[extname(found.real).toLowerCase()] ?? 'application/octet-stream';
    if (preview && !['.html', '.htm'].includes(extname(found.real).toLowerCase())) return send(res, 415, 'No preview for this file type');
    res.writeHead(200, { ...baseHeaders, 'Content-Type': type, 'Content-Length': st.size, 'X-Review-Page': ref, 'Content-Security-Policy': preview ? previewCsp : "frame-ancestors 'self'" });
    if (req.method === 'HEAD') return res.end();
    createReadStream(found.real).on('error', () => res.destroy()).pipe(res);
  }

  return createServer((req, res) => withReviewReadScope(() => {
    if (process.env.JIG_TOWER_TIMING === '1') {
      const started = performance.now();
      res.once('finish', () => console.error(JSON.stringify({ towerTiming: true, method: req.method, path: new URL(req.url, 'http://localhost').pathname, status: res.statusCode, ms: Number((performance.now() - started).toFixed(2)) })));
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      const refusal = guardTowerRequest(req, url.pathname);
      if (refusal) return json(res, refusal === 'Not found' ? 404 : 403, { error: refusal });
      if ((url.pathname.startsWith('/toolbox/') || req.url.startsWith('/toolbox/')) && req.url.split('?')[0] !== url.pathname) return send(res, 404, 'Not found');
      const get = req.method === 'GET' || req.method === 'HEAD';
      // a same-origin referrer lets a thread page know it was opened from the dashboard
      // The page's existing POST /api/seen (kind: home) records the visit.
      if (get && url.pathname === '/') {
        const preferences = towerPreferences({ home, project });
        return send(res, 200, homePage(JSON.stringify(state(`http://${req.headers.host}`)), preferences), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': preferences.newHome ? threadCsp : pageCsp, 'Referrer-Policy': 'same-origin' });
      }
      const theme = req.method === 'GET' && url.pathname.match(/^\/toolbox\/themes\/([a-z0-9-]+)\/theme\.css$/);
      if (theme) {
        const css = themeFile(theme[1]);
        return send(res, css ? 200 : 404, css ?? 'Not found', { 'Content-Type': css ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8' });
      }
      if (req.method === 'GET' && url.pathname === '/toolbox/typography/type.css') return send(res, 200, themeTypography(), { 'Content-Type': 'text/css; charset=utf-8' });
      const bf = get && url.pathname.match(/^\/brand\/([a-z0-9-]+\.svg)$/);
      if (bf) { const b = brandFile(bf[1]); return b ? send(res, 200, b, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }) : send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' }); }
      if (get && url.pathname === '/api/state') return json(res, 200, state(`http://${req.headers.host}`));
      if (get && url.pathname.startsWith('/f/')) return serveFile(req, res, url);
      const att = get && url.pathname.match(/^\/att\/([^/]+)\/([^/]+)$/);
      if (att) {
        let thread; let file; try { thread = decodeURIComponent(att[1]); file = decodeURIComponent(att[2]); } catch { return send(res, 400, 'Bad request'); }
        const real = isThreadId(thread) ? servedAttachment(project, thread, file, { home }) : null;
        if (!real) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        const st = statSync(real);
        res.writeHead(200, { ...baseHeaders, 'Content-Type': attachmentMime[extname(real).slice(1).toLowerCase()], 'Content-Length': st.size, 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'", 'Cache-Control': 'private, max-age=3600' });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(real).on('error', () => res.destroy()).pipe(res);
      }
      const ownerAction = url.pathname.match(/^\/api\/threads\/([^/]+)\/(give|return)$/);
      if (req.method === 'POST' && ownerAction) {
        return (async () => {
          const id = decodeURIComponent(ownerAction[1]);
          if (!isThreadId(id) || !threadInfo(id)) return json(res, 404, { error: 'no such thread' });
          if (canonicalThread(id, dir) !== id) return json(res, 409, { error: 'Use canonical thread ' + canonicalThread(id, dir) });
          const body = await jsonBody(req, res); if (!body) return;
          const row = readOwnership(id, dir);
          if (!Number.isSafeInteger(body.generation) || body.generation !== row.ownershipGeneration) return json(res, 409, { error: 'Ownership generation conflict; refresh before retrying.' });
          if (ownerAction[2] === 'give') {
            if (!/^item-\d+$/.test(id)) return json(res, 400, { error: 'Give needs a canonical review item.' });
            if (row.owner) return json(res, 409, { error: 'Thread already owned; Return before assigning another session.' });
            const folder = sessionsDir(dir); mkdirSync(folder, { recursive: true, mode: 0o700 });
            const note = join(folder, id + '.handoff.md');
            writeFileSync(note, buildSessionBrief(id, 'Topic discussion'), { mode: 0o600 });
            return json(res, 200, { command: handoffBlock(id, note, { dir }) });
          }
          if (body.note !== undefined && typeof body.note !== 'string') return json(res, 400, { error: 'Note must be text.' });
          // The existing person Return command owns fencing, handback and session cleanup.
          const args = [fileURLToPath(new URL('./review.mjs', import.meta.url)), 'return', id, '--as-person', '--generation', String(body.generation), ...(body.note ? ['--note', body.note] : [])];
          execFile(process.execPath, args, { windowsHide: true, timeout: 10000, env: { ...process.env, JIG_REVIEW_DIR: dir, JIG_CAPABILITY_FILE: '' } }, (error, stdout, stderr) => {
            if (error) return json(res, 409, { error: stderr.trim() || 'Return failed; refresh ownership before retrying.' });
            json(res, 200, { ok: true });
          });
        })().catch(e => { if (!res.headersSent) json(res, 409, { error: e.message }); });
      }
      const tid = url.pathname.match(/^\/(?:t|api\/threads)\/([^/]+)$/);
      if (tid) {
        let id; try { id = decodeURIComponent(tid[1]); } catch { return send(res, 400, 'Bad request'); }
        if (!isThreadId(id)) return json(res, 400, { error: 'bad id' });
        if (get && url.pathname.startsWith('/t/')) return send(res, 200, threadPage(id), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': threadCsp });
        if (url.pathname.startsWith('/api/threads/')) {
          if (get) {
            const info = threadInfo(id);
            if (!info) return json(res, 404, { error: 'no such item' });
            const messages = readThread(id, dir);
            const status = info.status ?? threadStatus({ closed: Boolean(info.closed), messages });
            const viewed = messages.map(m => messageView(m, `http://${req.headers.host}`));
            const artifacts = threadArtifacts({ link: info.link, messages: viewed }, {
              origin: `http://${req.headers.host}`,
              validateFile: href => {
                const [prefix, ...parts] = href.slice(3).split('/').map(decodeURIComponent);
                const found = locateUrl(roots, prefix, parts);
                return found.ok ? found : null;
              },
              attachmentUrl: a => {
                if (typeof a.path !== 'string' || a.path.split(/[\\/]/).some(p => p.toLowerCase() === 'private')) return null;
                const match = a.path.match(/attachments[\\/]([^\\/]+)[\\/](\d{10,}-\d{1,3}\.(?:png|jpg|webp))$/);
                if (!match || match[1] !== id || !servedAttachment(project, id, match[2], { home })) return null;
                return '/att/' + encodeURIComponent(id) + '/' + match[2];
              }
            });
            const ownership = ownershipView(id);
            return json(res, 200, { id, ...info, ownership, addressee: ownership.owner?.label ?? 'the coordinator', artifacts, status, statusLabel: info.statusLabel ?? statusLabels[status], messages: viewed, unanswered: summarizeThread(messages).unanswered, seenAt: readSeen(project, { home }).items[id] ?? null });
          }
          if (req.method === 'POST') return postThread(req, res, id).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
        }
      }
      if (url.pathname === '/api/settings') {
        if (get) return req.method === 'HEAD' ? res.end() : json(res, 200, towerSettings({ home, project }));
        return postSettings(req, res).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
      }
      const personal = url.pathname.match(/^\/api\/(seen|undo|questions\/[^/]+\/[^/]+)$/);
      if (req.method === 'POST' && personal) return postPersonal(req, res, url.pathname).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
      const wk = url.pathname.match(/^\/api\/work\/([^/]+)\/(close|park|unpark|reopen|revisit|resume|close-stalled)$/);
      if (req.method === 'POST' && wk) {
        let id; try { id = decodeURIComponent(wk[1]); } catch { return send(res, 400, 'Bad request'); }
        return jsonBody(req, res, 4096).then((body) => {
          if (!body) return undefined;
          if (!isThreadId(id) || !queue) return json(res, 404, { error: 'no such item' });
          const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
          const revisit = typeof body.revisit === 'string' ? body.revisit : undefined;
          try {
            if (wk[2] === 'resume' || wk[2] === 'close-stalled') {
              // Person actions on the Running rail: only a job the rail shows as Stalled?. Ownership is not touched.
              const x = rawQueue().find(w => w && String(w.id) === id);
              if (!x) return json(res, 404, { error: 'no such item' });
              if (x.state !== 'running' || !stalledRows().has(id)) return json(res, 409, { error: 'The job is no longer shown as stalled.' });
              if (wk[2] === 'resume') undoable('work', id, 'Resume requested for', () => moveWork(queue, id, 'waiting-other', { by: 'person', waits: 'resume requested by the person', dir }));
              else undoable('work', id, 'Closed as stalled:', () => closeWork(queue, id, { reason: 'closed as stalled', by: 'person', dir }));
            } else if (wk[2] === 'revisit') setWorkRevisit(queue, id, typeof body.text === 'string' ? body.text : '');
            else if (wk[2] === 'close') undoable('work', id, 'Closed', () => closeWork(queue, id, { reason, by: 'person', dir }));
            else if (wk[2] === 'park') undoable('work', id, 'Parked', () => setParked(queue, id, reason, { by: 'person', dir, revisit }));
            else if (wk[2] === 'unpark') undoable('work', id, 'Unparked', () => setParked(queue, id, null, { by: 'person', dir }));
            else undoable('work', id, 'Reopened', () => reopenWork(queue, id, { by: 'person', dir }));
          } catch (e) { return json(res, /^No queue item/.test(e.message) ? 404 : 409, { error: e.message }); }
          return json(res, 200, { ok: true, undo: undoInfo() });
        }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
      }
      const act = url.pathname.match(/^\/api\/items\/(\d+)\/(done|close|keep|reopen)$/);
      if (req.method === 'POST' && act) {
        const fail = (e) => json(res, /^No review item/.test(e.message) ? 404 : 409, { error: e.message });
        const okJson = () => json(res, 200, { ok: true, undo: undoInfo() });
        if (act[2] === 'done') { try { undoable('item', act[1], 'Marked done', () => markDone(act[1], dir, 'person')); } catch (e) { return fail(e); } return okJson(); }
        if (act[2] === 'reopen') { try { undoable('item', act[1], 'Reopened', () => reopenItem(act[1], null, dir, new Date(), 'person')); } catch (e) { return fail(e); } return okJson(); }
        if (act[2] === 'keep') { try { keepItem(act[1], dir); } catch (e) { return fail(e); } return json(res, 200, { ok: true }); }
        return jsonBody(req, res, 4096).then((body) => {
          if (!body) return undefined;
          const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
          if (!reason) return json(res, 400, { error: 'a reason is required' });
          try { undoable('item', act[1], 'Closed', () => closeItem(act[1], { by: 'person', reason }, dir)); } catch (e) { return fail(e); }
          return okJson();
        }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'server error' }); });
      }
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    } catch {
      if (!res.headersSent) send(res, 500, 'Server error');
    }
  }));
}

// ---------- self-test ----------
async function check() {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-review-check-'));
  const out = [];
  const ok = (name, cond) => { out.push(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) process.exitCode = 1; };
  try {
    const root = join(tmp, 'root'); const outside = join(tmp, 'outside'); const dir = join(tmp, 'state');
    mkdirSync(join(root, 'private'), { recursive: true }); mkdirSync(outside); mkdirSync(dir);
    writeFileSync(join(root, 'a.md'), '# Hello\n\n<script>x</script>\n'); writeFileSync(join(root, 'private', 's.txt'), 'secret');
    writeFileSync(join(outside, 'o.txt'), 'outside');
    let linked = false;
    try { symlinkSync(outside, join(root, 'link'), 'junction'); linked = true; } catch { /* no link rights */ }
    const roots = [{ prefix: 't', path: root }];
    const server = createReviewServer({ roots, dir });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (p, init) => { const r = await fetch(base + p, init); return [r.status, await r.text()]; };
    try {
      ok('home page', (await get('/'))[0] === 200);
      const [s1, md] = await get('/f/t/a.md');
      ok('markdown rendered and escaped', s1 === 200 && md.includes('<h1') && !md.includes('<script>x'));
      ok('private refused', (await get('/f/t/private/s.txt'))[0] === 403);
      ok('traversal refused', [400, 403, 404].includes((await get('/f/t/%2e%2e/outside/o.txt'))[0]));
      ok('encoded traversal refused', [400, 403, 404].includes((await get('/f/t/..%2foutside%2fo.txt'))[0]));
      if (linked) ok('link escape refused', (await get('/f/t/link/o.txt'))[0] === 403);
      ok('allowlisted directory viewer', (await get('/f/t/'))[0] === 200);
      ok('bad host refused', await new Promise((r) => { const q = httpRequest({ host: '127.0.0.1', port: server.address().port, path: '/', headers: { Host: 'evil.example' } }, (m) => { m.resume(); r(m.statusCode === 403); }); q.on('error', () => r(false)); q.end(); }));
      ok('no cors header', !(await fetch(base + '/api/state')).headers.has('access-control-allow-origin'));
      addItem(roots, { path: join(root, 'a.md'), title: 'A' }, dir);
      ok('item listed', JSON.parse((await get('/api/state'))[1]).items.length === 1);
    } finally { server.close(); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(out.join('\n'));
}

async function main() {
  requireTower(projectRoot());
  const args = process.argv.slice(2);
  if (args.includes('--check')) return check();
  const config = loadConfig();
  const i = args.indexOf('--port');
  const port = Number(i >= 0 ? args[i + 1] : process.env.JIG_REVIEW_PORT ?? config.port ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port.');
  const live = config.roots.filter((r) => { try { return statSync(r.path).isDirectory(); } catch { console.error(`Skipping missing root ${r.prefix}: ${r.path}`); return false; } });
  const server = createReviewServer({ roots: config.roots, openQuestions: config.openQuestions, queue: config.queue });
  server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : e.message); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`Review server on http://127.0.0.1:${port}/ (${live.length} roots)`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
