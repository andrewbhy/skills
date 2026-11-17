import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Open questions as cards. open-questions.md stays the coordinator's source of truth and keeps its format:
//   ## Open
//   7. **Title.** text, a link, an optional *Why: one line.*
//   17. **Title** (section 13). Reply ...
//      - 17.1 Sub-question text. *Recommended: the default.*
//   ## Answered
//   - 11 Nov: ...
// Ids are the numbers the file already uses: q7 for 7, q17.1 for 17.1 (the numbers are never reused, so they are stable).
// What the person answers on the dashboard is kept in the personal store (oq-answers.json); the file is never rewritten here.
// Accept default goes to the coordinator as a person message and is logged as a decision. A free-text Reply is only a message:
// the sub-question shows "replied, awaiting coordinator" until the coordinator records the decision (review.mjs decide --answers qN.M).
import { listProjects, readProjectJson, updateProjectJson } from './jig-store.mjs';
import { guessProjectFromText, storeNamesOf } from './project-groups.mjs';
import { appendThread, maxThreadText, recordDecision } from './tower-core.mjs';

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export const questionId = /^q\d+(?:\.\d+)?$/;
const recRe = /\*Recommended:\s*(.+?)\*\s*$/i;
const whyRe = /\*Why:\s*(.+?)\*/i;

export function guessProject(text, options) {
  return guessProjectFromText(text, options);
}

// text -> { open: [card], answered: [line] }. `resolveLink(pathOrUrl)` returns {href, label} or null (the server maps files to /f/ paths).
export function parseQuestions(text, { resolveLink = () => null } = {}) {
  const open = []; const answered = [];
  let section = '';
  let card = null;
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^##\s/.test(raw)) { section = /^##\s+Open\b/i.test(raw) ? 'open' : /^##\s+Answered\b/i.test(raw) ? 'answered' : ''; card = null; continue; }
    if (section === 'answered') { const m = raw.match(/^\s*[-*]\s+(.*\S)/); if (m) answered.push(clip(m[1], 400)); continue; }
    if (section !== 'open') continue;
    const top = raw.match(/^(\d+)\.\s+(.*)$/);
    if (top) {
      card = null;
      if (/^[*_]*\(?answered/i.test(top[2])) continue;
      const n = Number(top[1]); let rest = top[2];
      const bold = rest.match(/^\*\*(.+?)\*\*\s*(.*)$/);
      const title = bold ? bold[1].trim() : clip(rest.split(/(?<=[.!?])\s/)[0], 120);
      let body = bold ? bold[2] : rest;
      const rec = body.match(recRe); if (rec) body = body.replace(recRe, '').trim();
      const explicitWhy = body.match(whyRe); if (explicitWhy) body = body.replace(whyRe, '').trim();
      const link = findLink(`${title} ${body}`, resolveLink);
      card = { id: `q${n}`, n, title: title.replace(/[.:]\s*$/, ''), why: explicitWhy ? clip(explicitWhy[1], 160) : whyFrom(body), recommended: rec ? rec[1].trim() : null, link, project: guessProject(`${title} ${body} ${link?.href ?? ''} ${link?.label ?? ''}`), subs: [] };
      open.push(card);
      continue;
    }
    const sub = raw.match(/^\s+[-*]\s+(\d+)\.(\d+)\s+(.*)$/);
    if (sub && card && Number(sub[1]) === card.n) {
      let t = sub[3]; const rec = t.match(recRe); if (rec) t = t.replace(recRe, '').trim();
      card.subs.push({ id: `q${sub[1]}.${sub[2]}`, n: `${sub[1]}.${sub[2]}`, text: t.trim(), recommended: rec ? rec[1].trim() : null });
    }
  }
  return { open, answered };
}
function findLink(text, resolveLink) {
  const url = text.match(/https?:\/\/[^\s)<>"']+/);
  if (url) return resolveLink(url[0].replace(/[.,;]+$/, ''));
  const path = text.match(/\b[A-Za-z]:[\\/][^\s)<>"']+/);
  if (path) return resolveLink(path[0].replace(/[.,;]+$/, ''));
  return null;
}
// One line of context from the text that follows the title: no links, no "Reply ..." instructions.
function whyFrom(body) {
  let t = body.replace(/\(section[^)]*\)/gi, '').replace(/https?:\/\/[^\s)<>"']+/g, '').replace(/\b[A-Za-z]:[\\/][^\s)<>"']+/g, '');
  t = t.replace(/\bReply\b[^.]*\.?/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  const only = t.match(/^\((.*)\)\.?$/); if (only) t = only[1];
  t = t.replace(/^[\s.,;:()-]+/, '').replace(/[\s,;:(-]+$/, '').trim();
  return t ? clip(t, 160) : '';
}

// ---------- what was answered on the dashboard ----------
export const readAnswers = (project, { home } = {}) => {
  const d = readProjectJson(project, 'oq-answers.json', {}, { home });
  return d && typeof d === 'object' && d.answers && typeof d.answers === 'object' ? d.answers : {};
};
const resolvedIn = (answers, id) => Boolean(answers[id]);

// Cards still open (a card with sub-questions is open until each has been answered, accepted or deferred), the answers given here
// (newest first), and the lines the coordinator already moved to the Answered section.
export function questionsView(parsed, answers) {
  const cards = parsed.open.map((c) => {
    const subs = c.subs.map((s) => ({ ...s, state: answers[s.id]?.status ?? 'open', answer: answers[s.id] ?? null }));
    const state = answers[c.id]?.status ?? (subs.length && subs.every((s) => s.state !== 'open') ? 'answered' : 'open');
    return { ...c, subs, state, answer: answers[c.id] ?? null };
  });
  const open = cards.filter((c) => c.state === 'open');
  const given = [];
  for (const c of cards) {
    for (const x of c.subs) if (x.answer) given.push({ id: x.id, n: x.n, title: x.text, parent: c.title, status: x.answer.status, text: x.answer.text, at: x.answer.at });
    if (c.answer) given.push({ id: c.id, n: String(c.n), title: c.title, parent: null, status: c.answer.status, text: c.answer.text, at: c.answer.at });
  }
  given.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { open, given, fileAnswered: parsed.answered };
}
export const openCount = (view) => view.open.length;

// ---------- answering ----------
const lookup = (parsed, id) => {
  const n = id.slice(1).split('.');
  const card = parsed.open.find((c) => c.n === Number(n[0]));
  if (!card) return null;
  if (n.length === 1) return { card, sub: null };
  const sub = card.subs.find((s) => s.id === id);
  return sub ? { card, sub } : null;
};
// Every open question is its own Discuss thread, oq-<n>: quick answers and longer talk live in one place.
export const questionThread = (card) => `oq-${card.n}`;
// The decision belongs to the question's own project (its grouping), never to the dashboard's project by default.
export function decisionProject(card, { home } = {}) {
  const names = storeNamesOf(card.project, { home });
  const have = listProjects({ home });
  return names.find((n) => have.includes(n)) ?? names[0];
}

// action: accept | reply | defer. Returns {thread, ids, decision}. Throws Error with .status for the HTTP layer.
export function answerQuestion({ id, action, text = '' }, { parsed, project, home, dir, now = new Date() }) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (!questionId.test(id)) throw fail(400, 'bad question id');
  if (!['accept', 'reply', 'defer'].includes(action)) throw fail(400, 'bad action');
  const found = lookup(parsed, id);
  if (!found) throw fail(404, 'no such open question');
  const { card, sub } = found;
  const answers = readAnswers(project, { home });
  const targets = sub ? [sub] : card.subs.length ? card.subs.filter((s) => !resolvedIn(answers, s.id)) : [card];
  if (resolvedIn(answers, id) || (!targets.length)) throw fail(409, 'already answered here');
  const typed = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (action === 'reply' && !sub && card.subs.length) throw fail(400, 'reply to one of its sub-questions');
  if (action === 'reply' && !typed) throw fail(400, 'a reply needs text');
  if (action === 'reply' && typed.length > 2000) throw fail(413, 'reply too long');
  let accepted = targets;
  if (action === 'accept') {
    accepted = targets.filter((t) => t.recommended);
    if (!accepted.length) throw fail(409, 'no recommended default to accept');
  }
  const label = (t) => (t === card ? `${card.n} (${clip(card.title, 70)})` : `${t.n} (${clip(t.text, 70)})`);
  const thread = questionThread(card);
  let message; let quote; let decisionText;
  if (action === 'reply') {
    message = `Reply on question ${label(targets[0])}: ${typed}`;
  } else if (action === 'accept') {
    const lines = accepted.map((t) => `${t.n}: ${t.recommended}`);
    message = accepted.length === 1 ? `Accepted the recommended default for question ${label(accepted[0])}: ${accepted[0].recommended}` : `Accepted the recommended defaults for question ${card.n} (${clip(card.title, 70)}):\n${lines.join('\n')}`;
    quote = `Accept default: ${lines.join('; ')}`; decisionText = accepted.length === 1 ? `Question ${accepted[0].n}: accept the default, ${clip(accepted[0].recommended, 160)}` : `Question ${card.n}: accept the defaults for ${accepted.map((t) => t.n).join(', ')}`;
  } else {
    const whole = !sub && card.subs.length > 0;
    message = `Deferred question ${whole ? `${card.n} (${clip(card.title, 70)})` : label(targets[0])}: not now, ask again later.`; quote = 'Defer'; decisionText = `Question ${whole ? card.n : targets[0].n}: deferred`;
  }
  if (message.length > maxThreadText) message = message.slice(0, maxThreadText - 1) + '…';
  const status = action === 'reply' ? 'replied' : action === 'accept' ? 'accepted' : 'deferred';
  const set = action === 'defer' ? targets : action === 'accept' ? accepted : [targets[0]];
  const stamp = now.toISOString();
  updateProjectJson(project, 'oq-answers.json', { answers: {} }, (d) => {
    d.answers = d.answers && typeof d.answers === 'object' ? d.answers : {};
    for (const t of set) d.answers[t.id ?? `q${t.n}`] = { status, text: action === 'reply' ? typed : action === 'accept' ? t.recommended : '', at: stamp, thread };
    return d;
  }, { home });
  appendThread(thread, 'person', message, dir, now);
  // The whole question counts as answered (and unblocks what waits on it) once nothing in it is open any more.
  const after = readAnswers(project, { home });
  // Only a recorded decision answers: Reply logs nothing, so the coordinator decides what the words mean.
  if (action === 'reply') return { thread, ids: set.map((t) => t.id), status, decision: null };
  const complete = card.subs.length ? card.subs.every((s) => ['accepted', 'answered'].includes(after[s.id]?.status)) : true;
  const logged = recordDecision({
    decision: decisionText, quote, source: complete && action === 'accept' ? `q${card.n}` : thread, project: decisionProject(card, { home }), impacts: [],
    ...(complete && action === 'accept' ? { answers: `q${card.n}` } : {}), at: stamp
  }, { dir, home, now });
  return { thread, ids: set.map((t) => t.id ?? `q${t.n}`), status, decision: logged.decision };
}

// The coordinator's decision answers a question: mark it answered here (review.mjs decide --answers q20.1).
export function markQuestionAnswered(id, { project, home, text = '', decision = null, now = new Date() }) {
  if (!questionId.test(id)) throw new Error(`Not a question id: ${id}`);
  updateProjectJson(project, 'oq-answers.json', { answers: {} }, (d) => {
    d.answers = d.answers && typeof d.answers === 'object' ? d.answers : {};
    d.answers[id] = { status: 'answered', text: String(text).slice(0, 2000), at: now.toISOString(), thread: `oq-${id.slice(1).split('.')[0]}`, ...(decision ? { decision } : {}) };
    return d;
  }, { home });
}

// Take a deferred, replied or answered question back to open (the person changed their mind).
export function reopenQuestion(id, { project, home }) {
  let had = false;
  updateProjectJson(project, 'oq-answers.json', { answers: {} }, (d) => { if (d.answers?.[id]) { had = true; delete d.answers[id]; } return d; }, { home });
  if (!had) throw Object.assign(new Error('that question is not answered here'), { status: 404 });
}
