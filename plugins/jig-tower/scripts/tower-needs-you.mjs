import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Derived view, ported from the accepted lo-fi 2 DATA MAPPING. No store writes.
// R1 supplies explicit work actions: absent/invalid actions remain Open.
const actions = new Set(['answer', 'try', 'approve', 'read']);
const stamp = value => { const n = Date.parse(value); return Number.isFinite(n) ? n : null; };
const jobState = row => row.jobState ?? row.status?.jobState ?? row.state;
const topicOf = row => row.thread || row.id;
const plain = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function deriveNeedsYou(board) {
  const work = [...new Map(Object.values(board.work ?? {}).filter(Array.isArray).flat().map(w => [w.id, w])).values()];
  const items = board.items ?? [], discussions = board.discussions ?? [];
  const closed = new Set(discussions.filter(d => d.closed || ['closed', 'done'].includes(d.status)).map(d => d.id));
  for (const item of items) if (item.closed || item.done || ['closed', 'done'].includes(item.status)) closed.add(item.thread || 'item-' + item.id);
  // A completed job cannot contribute a row; a completed sibling does not close
  // an otherwise active topic. Review closure does not complete linked work.
  // Quiet topics have no pending person action.
  const done = row => ['done', 'closed', 'parked'].includes(jobState(row)) || row.closed || row.done;
  const threads = board.threads ?? {};
  const messages = id => Array.isArray(threads[id]) ? threads[id] : threads[id]?.last ?? [];
  const latestActivity = id => {
    const times = [...work.filter(w => topicOf(w) === id).map(w => w.touchedAt), ...messages(id).map(m => m.at || m.timestamp || m.createdAt || m.ts)].map(stamp).filter(t => t !== null);
    return times.length ? Math.max(...times) : null;
  };
  const owners = new Map((board.ownershipMap?.rows ?? []).map(row => [row.id, row.owner?.label || 'coordinator']));
  const rows = [], sources = new Set();
  const add = (source, topic, action, line, since, allowClosedTopic = false) => {
    if (!topic || (!allowClosedTopic && closed.has(topic)) || sources.has(source)) return;
    sources.add(source);
    rows.push({ topic, action: actions.has(action) ? action : null, line: plain(line), owner: owners.get(topic) || 'coordinator', since: typeof since === 'number' ? since : stamp(since), href: '/t/' + encodeURIComponent(topic) });
  };
  const waiting = work.filter(w => jobState(w) === 'waiting-person' && !done(w));
  for (const w of waiting) add('work:' + w.id, topicOf(w), w.action, (w.wait || w.waitNote || w.item || 'Waiting on you; no reason supplied.').replace(/^person:\s*/i, ''), w.waitingSince || w.touchedAt, true);
  for (const item of items) {
    if (done(item)) continue;
    const topic = item.thread || 'item-' + item.id;
    const unread = !!(board.unread?.[topic] || item.unread);
    const ownTrial = item.status === 'waiting-you' && item.kind === 'html' && !!item.url;
    const covered = waiting.some(w => topicOf(w) === topic);
    if (!unread && !(item.status === 'waiting-you' && (!covered || ownTrial))) continue;
    const action = unread ? 'read' : ownTrial ? 'try' : /\bplan\b/i.test(item.title) ? 'approve' : null;
    add('review:' + item.id, topic, action, item.title || 'Review update', latestActivity(topic));
  }
  const questions = Array.isArray(board.questions) ? board.questions : board.questions?.open ?? [];
  for (const q of questions) {
    if (!q || typeof q !== 'object' || (q.status ?? q.state) !== 'open') continue;
    const topic = typeof q.thread === 'string' ? q.thread : q.thread?.id || 'oq-' + (q.n ?? q.id);
    add('question:' + q.id, topic, 'answer', q.question || q.title, q.createdAt);
  }
  for (const id of Object.keys(threads)) {
    const m = messages(id).at(-1);
    // Historical question strings and "unanswered" (which means waiting on the
    // coordinator in today's summary) are deliberately not person requests.
    if (!m || !(m.awaiting === 'person' || m.waitWho === 'person') || m.answered) continue;
    add('message:' + id, id, 'answer', m.text || 'Message awaiting your reply.', m.at || m.timestamp || m.createdAt || m.ts);
  }
  return rows.sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity) || a.topic.localeCompare(b.topic));
}
