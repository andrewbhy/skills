if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-digest.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// "Since you left": a digest of what changed on the board since the person's previous Home visit.
// Pure data in, data out: computed from board state, never by a model (zero tokens). Each event carries a link.
const clip = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What a later digest compares against: job states and the open question ids at one moment.
export function boardSnapshot({ queueItems = [], openQuestionIds = [] }) {
  const jobs = {};
  for (const x of queueItems) if (x && typeof x === 'object' && x.id !== undefined) jobs[String(x.id)] = x.superseded ? 'superseded' : String(x.state ?? '');
  return { jobs, questions: [...openQuestionIds] };
}

// input: { since (ISO or null), snapPrev, items: enriched review items (all), titles: {threadId: title}, threads: {id: messages},
//          queueItems, decisions: decisionsView rows, given: answers from the dashboard, openQuestionIds, parked, today (YYYY-MM-DD) }
export function buildDigest(input) {
  const { since, snapPrev = null, items = [], titles = {}, threads = {}, queueItems = [], decisions = [], given = [], openQuestionIds = [], parked = [], today } = input;
  if (!since || !Number.isFinite(Date.parse(since))) return null;
  const after = (iso) => Number.isFinite(Date.parse(iso)) && Date.parse(iso) > Date.parse(since);
  const events = [];
  for (const it of items) if (!it.done && after(it.added)) events.push({ kind: 'item', at: it.added, text: `New: ${clip(it.title)}`, href: `/t/${it.thread}` });
  for (const [id, messages] of Object.entries(threads)) {
    const replies = messages.filter((m) => m.from === 'coordinator' && after(m.at));
    if (replies.length) events.push({ kind: 'reply', at: replies[replies.length - 1].at, text: `${plural(replies.length, 'reply', 'replies')} on ${clip(titles[id] ?? id)}`, href: `/t/${id}` });
  }
  if (snapPrev?.jobs) {
    for (const x of queueItems) {
      const id = String(x?.id ?? ''); const was = snapPrev.jobs[id];
      if (!id || was === undefined) continue;
      const title = clip(x.item ?? id);
      if (x.state === 'done' && was !== 'done') events.push({ kind: 'job-done', at: null, text: `Finished: ${title}`, href: `/t/${id}` });
      else if (x.state === 'failed' && was !== 'failed') events.push({ kind: 'job-failed', at: null, text: `Failed: ${title}`, href: `/t/${id}` });
    }
  }
  for (const d of decisions) {
    if (!after(d.at)) continue;
    const hits = d.affects.map((a) => `${a.kind} ${clip(a.title, 40)}`);
    events.push({ kind: 'decision', at: d.at, text: `Decision #${d.id} (${d.project}): ${clip(d.decision, 70)}${hits.length ? ` - ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}` : ''}`, href: '/#decisions' });
  }
  for (const g of given) if (after(g.at)) events.push({ kind: 'question-answered', at: g.at, text: `${g.status === 'deferred' ? 'Deferred' : g.status === 'replied' ? 'Replied on' : 'Answered'} question ${g.n}: ${clip(g.title, 60)}`, href: '/#questions' });
  if (snapPrev?.questions) {
    const had = new Set(snapPrev.questions);
    for (const id of openQuestionIds) if (!had.has(id)) events.push({ kind: 'question-added', at: null, text: `New question ${id.slice(1)}`, href: '/#questions' });
  }
  for (const r of parked) if (r.revisitOn && today && r.revisitOn <= today) events.push({ kind: 'revisit-due', at: null, text: `Revisit due: ${clip(r.item, 70)} (${r.revisitOn})`, href: '/#parked' });
  if (!events.length) return { since, empty: true, counts: {}, events: [], summary: 'Nothing changed.' };
  const counts = {};
  for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const names = { item: ['new item', 'new items'], reply: ['reply', 'replies'], 'job-done': ['job finished', 'jobs finished'], 'job-failed': ['job failed', 'jobs failed'], decision: ['decision', 'decisions'], 'question-answered': ['question answered', 'questions answered'], 'question-added': ['question added', 'questions added'], 'revisit-due': ['revisit due', 'revisits due'] };
  const summary = Object.keys(names).filter((k) => counts[k]).map((k) => plural(counts[k], ...names[k])).join(', ');
  const order = Object.keys(names);
  events.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return { since, empty: false, counts, events, summary };
}
