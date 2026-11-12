import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { addItem, appendThread, readThread } from '../scripts/review-core.mjs';
import { readDecisions } from '../scripts/review-decisions.mjs';
import { decisionProject, parseQuestions, questionsView } from '../scripts/review-questions.mjs';
import { buildDigest } from '../scripts/review-digest.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { homePage } from '../scripts/review-home-page.mjs';
import { threadPage } from '../scripts/review-thread-page.mjs';

const script = (name) => resolve(import.meta.dirname, '..', 'scripts', name);
const oqText = `# Open questions for you

## Open

7. **Explore walkthrough.** (press T to open the composer) http://127.0.0.1:7788/f/r/a.md

17. **Draft four: 3 questions** (section 13). Reply "accept recommendations".
   - 17.1 Click selects. *Recommended: selects.*
   - 17.2 Pop-ups at the bottom. *Recommended: yes.*
   - 17.3 No default here.

## Answered

- 11 Nov: scaling (8). "fluid".
`;
function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-actions-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const dir = join(tmp, 'state'); const home = join(tmp, 'home');
  mkdirSync(root); mkdirSync(dir); mkdirSync(home);
  writeFileSync(join(root, 'a.md'), '# A\n'); writeFileSync(join(root, 'b.md'), '# B\n');
  const roots = [{ prefix: 'r', path: root }];
  const queue = join(dir, 'queue.json'); const oq = join(root, 'open-questions.md');
  writeFileSync(oq, oqText);
  const setQueue = (items) => writeFileSync(queue, JSON.stringify({ version: 1, items }));
  const readQ = () => JSON.parse(readFileSync(queue, 'utf8')).items;
  setQueue([
    { id: 'job-a', item: 'Build the thing', state: 'running', plan: join(root, 'a.md') },
    { id: 'job-b', item: 'Next thing', state: 'pending' },
    { id: 'job-c', item: 'Finished thing', state: 'done' }
  ]);
  const server = createReviewServer({ roots, dir, queue, openQuestions: oq, home, project: 'jig' });
  return { tmp, root, dir, home, roots, queue, oq, setQueue, readQ, server };
}
function http(server, method, path, body, headers = {}) {
  return new Promise((resolveReq, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let text = ''; res.on('data', (c) => (text += c)); res.on('end', () => resolveReq({ status: res.statusCode, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
async function up(t, f) { await new Promise((r) => f.server.listen(0, '127.0.0.1', r)); t.after(() => f.server.close()); }

test('work rows say what Close and Park can do and why not; revisit is stored with the park', async (t) => {
  const f = fixture(t); await up(t, f);
  const rows = (await http(f.server, 'GET', '/api/state')).json().work;
  assert.deepEqual(rows.running[0].actions, { close: { ok: true, reason: '' }, park: { ok: true, reason: '' } });
  assert.equal((await http(f.server, 'POST', '/api/work/job-a/park', { reason: 'later', revisit: '2026-12-01' })).status, 200);
  let w = (await http(f.server, 'GET', '/api/state')).json().work;
  assert.deepEqual([w.parked[0].revisit, w.parked[0].revisitOn, w.parked[0].actions.park.reason], ['2026-12-01', '2026-12-01', 'already parked']);
  assert.ok(w.parked[0].parkedAt, 'date parked is recorded');
  assert.equal((await http(f.server, 'POST', '/api/work/job-a/revisit', { text: 'when item-31 closes' })).status, 200);
  assert.equal(f.readQ()[0].revisit, 'when item-31 closes'); assert.equal(f.readQ()[0].revisitOn, undefined);
  assert.equal((await http(f.server, 'POST', '/api/work/job-b/revisit', { text: 'x' })).status, 409, 'only parked items take a revisit');
  assert.equal((await http(f.server, 'POST', '/api/work/job-c/close', {})).status, 409);
  w = (await http(f.server, 'GET', '/api/state')).json().work;
  assert.deepEqual(w.done[0].actions.close, { ok: false, reason: 'already done' });
  assert.equal(w.done[0].actions.park.reason, 'done: reopen first');
});

test('undo takes back the last change, only while the item is unchanged, from the page and from review.mjs', async (t) => {
  const f = fixture(t); await up(t, f);
  const before = JSON.stringify(f.readQ()[1]);
  const r = await http(f.server, 'POST', '/api/work/job-b/close', {});
  assert.equal(r.status, 200); assert.match(r.json().undo.label, /Closed "Next thing"/);
  assert.equal(f.readQ()[1].state, 'done');
  assert.equal((await http(f.server, 'GET', '/api/state')).json().undo.id, 'job-b');
  assert.equal((await http(f.server, 'POST', '/api/undo', {})).status, 200);
  assert.equal(JSON.stringify(f.readQ()[1]), before, 'the item is exactly as it was');
  assert.ok(readThread('job-b', f.dir).some((m) => /Undone: Closed/.test(m.text)));
  assert.equal((await http(f.server, 'POST', '/api/undo', {})).status, 409, 'nothing left to undo');
  // a later change by someone else blocks the undo
  await http(f.server, 'POST', '/api/work/job-b/park', { reason: 'x' });
  const q = f.readQ(); q[1].parkedReason = 'edited by the coordinator'; f.setQueue(q);
  const blocked = await http(f.server, 'POST', '/api/undo', {});
  assert.equal(blocked.status, 409); assert.match(blocked.json().error, /changed again/);
  // review.mjs undo, with the store in JIG_HOME
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home };
  const cli = (...a) => spawnSync(process.execPath, [script('review.mjs'), '--project', 'jig', ...a], { env, encoding: 'utf8' });
  assert.equal(cli('queue-set', 'job-c', '--state', 'waiting-person', '--waits', 'look').status, 0);
  assert.equal(f.readQ()[2].waitsFor, 'person: look');
  const u = cli('undo'); assert.equal(u.status, 0, u.stderr); assert.match(u.stdout, /Undone/);
  assert.equal(f.readQ()[2].state, 'done');
  assert.notEqual(cli('undo').status, 0);
});

test('seen: the thread records when you looked, one cue per row, the file edit is judged against that time', async (t) => {
  const f = fixture(t); await up(t, f);
  const item = addItem(f.roots, { path: join(f.root, 'b.md'), title: 'B doc' }, f.dir, new Date('2026-11-01T10:00:00Z')).item;
  const thread = `item-${item.id}`;
  appendThread(thread, 'coordinator', 'first reply', f.dir, new Date('2026-11-01T11:00:00Z'));
  let s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.unread[thread], true, 'never opened: unread');
  assert.equal(s.items[0].unread, true);
  assert.equal((await http(f.server, 'GET', `/api/threads/${thread}`)).json().seenAt, null);
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'thread', id: thread })).status, 200);
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.unread[thread], undefined); assert.equal(s.items[0].unread, false);
  const seenAt = (await http(f.server, 'GET', `/api/threads/${thread}`)).json().seenAt;
  assert.ok(Date.parse(seenAt) > Date.parse('2026-11-01T11:00:00Z'));
  assert.deepEqual(JSON.parse(readFileSync(join(f.home, 'jig', 'seen.json'), 'utf8')).items[thread], seenAt);
  assert.throws(() => readFileSync(join(f.dir, 'seen.json')), /ENOENT/, 'never next to the repo state');
  appendThread(thread, 'coordinator', 'second reply', f.dir, new Date(Date.parse(seenAt) + 1));
  await new Promise((r) => setTimeout(r, 10));
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.unread[thread], true, 'a reply after you looked is unread again');
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'all' })).status, 200);
  assert.equal(Object.keys((await http(f.server, 'GET', '/api/state')).json().unread).length, 0);
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'thread', id: 'nope' })).status, 404);
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'bogus' })).status, 400);
});

test('the thread page shows Seen at, the new-since line, and no stale "updated since you opened it"', () => {
  const page = threadPage('item-1');
  assert.doesNotMatch(page, /Updated since you opened it/);
  assert.match(page, /Seen at/); assert.match(page, /new since you last looked/); assert.match(page, /kind:'thread'/);
  const home = homePage();
  assert.doesNotMatch(home, /updated since you opened it/); assert.match(home, /jig control tower/);
});

test('open questions parse into stable ids, grouped data, defaults, link and sub-questions', () => {
  const p = parseQuestions(oqText, { resolveLink: (u) => ({ href: u, label: 'a.md' }) });
  assert.deepEqual(p.open.map((c) => c.id), ['q7', 'q17']);
  assert.equal(p.open[0].title, 'Explore walkthrough'); assert.equal(p.open[0].why, 'press T to open the composer');
  assert.equal(p.open[0].link.label, 'a.md'); assert.equal(p.open[0].recommended, null);
  assert.deepEqual(p.open[1].subs.map((s) => [s.id, s.recommended]), [['q17.1', 'selects.'], ['q17.2', 'yes.'], ['q17.3', null]]);
  assert.equal(p.open[1].why, ''); assert.equal(p.answered.length, 1);
  const v = questionsView(p, { 'q17.1': { status: 'accepted', text: 'selects.', at: '2026-11-11T10:00:00Z' } });
  assert.equal(v.open.length, 2); assert.equal(v.open[1].subs[0].state, 'accepted'); assert.equal(v.given[0].id, 'q17.1');
});

test('questions: Reply is only a message (no decision), Accept default logs one under the question\'s own project, the coordinator\'s decide answers it', async (t) => {
  const f = fixture(t); await up(t, f);
  const fileBefore = readFileSync(f.oq, 'utf8');
  let s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.openQuestionCount, 2); assert.equal(s.questions.open[1].subs.length, 3);
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.3/accept', {})).status, 409, 'no default to accept');
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.1/reply', { text: '   ' })).status, 400);
  assert.equal((await http(f.server, 'POST', '/api/questions/q17/reply', { text: 'all' })).status, 400, 'reply on a sub-question');
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.1/answer', { text: 'x' })).status, 404, 'the old route is gone');
  assert.equal((await http(f.server, 'POST', '/api/questions/q99/accept', {})).status, 404);
  // a reply (even a question) is a message, not a decision, and not an answer
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.1/reply', { text: 'does this support discussion thread?' })).status, 200);
  assert.match(readThread('oq-17', f.dir).at(-1).text, /Reply on question 17\.1 .*: does this support discussion thread\?/);
  assert.equal(readThread('oq-17', f.dir).at(-1).from, 'person');
  assert.equal(readDecisions({ home: f.home }).length, 0, 'free text never becomes a decision');
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.questions.open[1].subs[0].state, 'replied'); assert.equal(s.questions.given[0].status, 'replied');
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.1/reply', { text: 'again' })).status, 409);
  // Accept default is the one-click path that logs a decision, under the question's own project, never the dashboard's
  assert.equal((await http(f.server, 'POST', '/api/questions/q17/accept', {})).status, 200, 'accepts the remaining defaults');
  assert.match(readThread('oq-17', f.dir).at(-1).text, /Accepted the recommended default for question 17\.2/);
  const d1 = readDecisions({ home: f.home });
  assert.deepEqual(d1.map((x) => x.project), ['other']); assert.equal(d1[0].answers, undefined, 'one sub-question was only replied to, so 17 is not answered');
  writeFileSync(join(f.home, 'project-groups.json'), JSON.stringify({ groups: [{ name: 'app two', store: ['two', 'app-two'] }] }));
  assert.equal(decisionProject({ project: 'app two' }, { home: f.home }), 'two');
  assert.equal(decisionProject({ project: 'app-one' }, { home: f.home }), 'app-one');
  assert.equal((await http(f.server, 'POST', '/api/questions/q17.3/defer', {})).status, 200);
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.deepEqual(s.questions.open.map((c) => c.id), ['q7'], 'a fully handled card leaves the open list');
  assert.deepEqual(s.questions.given.map((g) => g.status).sort(), ['accepted', 'deferred', 'replied']);
  assert.equal(readFileSync(f.oq, 'utf8'), fileBefore, 'open-questions.md is not rewritten');
  // the coordinator decides: decide --answers q17.1 marks it answered; oq-reset takes it back
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue, openQuestions: f.oq }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home };
  const cli = (...a) => spawnSync(process.execPath, [script('review.mjs'), '--dash-project', 'jig', ...a], { env, encoding: 'utf8' });
  const dec = cli('decide', '17.1: yes, with a thread', '--quote', 'does this support discussion thread?', '--source', 'oq-17', '--project', 'other', '--answers', 'q17.1');
  assert.equal(dec.status, 0, dec.stderr); assert.match(dec.stdout, /Question 17\.1 marked answered/);
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.questions.given.find((g) => g.id === 'q17.1').status, 'answered');
  assert.equal(cli('oq-reset', 'q17.1').status, 0);
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.questions.open.find((c) => c.id === 'q17').subs[0].state, 'open');
  assert.notEqual(cli('oq-reset', 'q17.1').status, 0, 'nothing left to reset');
  // decision-void: append-only, stays listed with the reason and no impacts
  const logBefore = readFileSync(join(f.home, 'other', 'decisions.jsonl'), 'utf8');
  assert.notEqual(cli('decision-void', 'other#1').status, 0, 'a reason is required');
  assert.equal(cli('decision-void', 'other#9', '--reason', 'x').status === 0, false, 'unknown decision');
  const v = cli('decision-void', 'other#2', '--reason', 'it was a question, not a decision');
  assert.equal(v.status, 0, v.stderr);
  assert.ok(readFileSync(join(f.home, 'other', 'decisions.jsonl'), 'utf8').startsWith(logBefore), 'the log only grew');
  const after = readDecisions({ home: f.home }).find((x) => x.project === 'other' && x.id === 2);
  assert.equal(after.voided.reason, 'it was a question, not a decision'); assert.deepEqual(after.impacts, []);
  assert.notEqual(cli('decision-void', 'other#2', '--reason', 'again').status, 0, 'already void');
  assert.equal((await http(f.server, 'GET', '/api/state')).json().decisions.find((x) => x.key === 'other#2').voided.reason, 'it was a question, not a decision');
  // every open question is its own Discuss thread: listed before any message, writable, with the card lines and the source
  const ds = (await http(f.server, 'GET', '/api/state')).json().discussions.filter((x) => x.kind === 'question');
  assert.ok(ds.some((x) => x.id === 'oq-7'));
  const info = (await http(f.server, 'GET', '/api/threads/oq-7')).json();
  assert.equal(info.kind, 'question'); assert.equal(info.status, 'waiting-you');
  assert.equal((await http(f.server, 'POST', '/api/threads/oq-7', { from: 'person', text: 'what does T do?' })).status, 200);
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'thread', id: 'oq-7' })).status, 200);
  assert.equal((await http(f.server, 'POST', '/api/questions/q7/accept', {})).status, 409, 'q7 has no default');
  assert.equal((await http(f.server, 'POST', '/api/questions/q7/reply', { text: 'looks fine' })).status, 200);
  assert.equal((await http(f.server, 'GET', '/api/threads/oq-17')).json().title, 'Question 17: Draft four: 3 questions');
});

test('digest: new items, replies, finished jobs, decisions and question changes since the previous visit, each with a link', async (t) => {
  const f = fixture(t); await up(t, f);
  assert.equal(buildDigest({ since: null }), null);
  await http(f.server, 'POST', '/api/seen', { kind: 'home' });
  assert.equal((await http(f.server, 'GET', '/api/state')).json().digest, null, 'first visit: nothing to compare with');
  // pretend the last visit ended two hours ago, with the board as it was then
  const file = join(f.home, 'jig', 'seen.json'); const seen = JSON.parse(readFileSync(file, 'utf8'));
  const old = new Date(Date.now() - 2 * 3600000).toISOString();
  seen.home.at = old; seen.home.snap = { jobs: { 'job-a': 'running', 'job-b': 'pending' }, questions: ['q7'] };
  writeFileSync(file, JSON.stringify(seen));
  const item = addItem(f.roots, { path: join(f.root, 'b.md'), title: 'Fresh doc' }, f.dir, new Date()).item;
  appendThread('job-a', 'coordinator', 'reply while away', f.dir, new Date());
  const q = f.readQ(); q[0].state = 'done'; f.setQueue(q);
  await http(f.server, 'POST', '/api/questions/q7/accept', {}).catch(() => {});
  await http(f.server, 'POST', '/api/questions/q17.1/accept', {});
  await http(f.server, 'POST', '/api/seen', { kind: 'home' }); // a new visit: the old one becomes the baseline
  const d = (await http(f.server, 'GET', '/api/state')).json().digest;
  assert.equal(d.since, old); assert.equal(d.empty, false);
  const by = Object.fromEntries(d.events.map((e) => [e.kind, e]));
  assert.equal(by.item.href, `/t/item-${item.id}`); assert.match(by.item.text, /Fresh doc/);
  assert.equal(by.reply.href, '/t/job-a'); assert.equal(by['job-done'].href, '/t/job-a'); assert.match(by['job-done'].text, /Build the thing/);
  assert.equal(by.decision.href, '/#decisions'); assert.equal(by['question-answered'].href, '/#questions');
  assert.match(d.summary, /1 new item.*1 reply.*1 job finished.*decision.*question/);
  assert.equal((await http(f.server, 'POST', '/api/seen', { kind: 'digest-dismiss' })).status, 200);
  assert.equal((await http(f.server, 'GET', '/api/state')).json().digest.empty, true, 'dismissed: nothing since');
  assert.ok(buildDigest({ since: old, parked: [{ item: 'p', revisitOn: '2026-01-01' }], today: '2026-11-11' }).events.some((e) => e.kind === 'revisit-due'));
});

test('new endpoints keep the security checks: JSON only, same host and origin, valid ids', async (t) => {
  const f = fixture(t); await up(t, f);
  for (const p of ['/api/seen', '/api/undo', '/api/questions/q17.1/accept', '/api/work/job-a/revisit', '/api/work/job-a/park']) {
    const r = await new Promise((res, rej) => { const q = request({ host: '127.0.0.1', port: f.server.address().port, path: p, method: 'POST', headers: { 'Content-Type': 'text/plain' } }, (m) => { m.resume(); res(m.statusCode); }); q.on('error', rej); q.end('x'); });
    assert.equal(r, 415, p);
    assert.equal((await http(f.server, 'POST', p, {}, { Origin: 'http://evil.example' })).status, 403, p);
    assert.equal((await http(f.server, 'POST', p, {}, { Host: 'evil.example' })).status, 403, p);
  }
  assert.equal((await http(f.server, 'POST', '/api/questions/q1%2F..%2Fx/accept', {})).status, 404);
  assert.equal((await http(f.server, 'POST', '/api/work/bad%20id/park', {})).status, 404);
});

test('markdown and image pages carry the click-to-enlarge viewer with zoom, pan, fit, arrows and an original link', async (t) => {
  const f = fixture(t); await up(t, f);
  writeFileSync(join(f.root, 'pics.md'), '# Pics\n\n![one](one.png)\n\n![two](two.png)\n');
  const page = (await http(f.server, 'GET', '/f/r/pics.md')).text;
  for (const part of ['id="lb"', 'Open original', 'id="lbfit"', 'ArrowRight', "'wheel'", 'main img.wide']) assert.ok(page.includes(part), part);
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script), 'the viewer script is valid JavaScript');
});

test('home is rendered from state embedded in the page, carries the jig brand, and cards show the last messages of their thread', async (t) => {
  const f = fixture(t); await up(t, f);
  for (const [i, who] of ['person', 'coordinator', 'person', 'coordinator'].entries()) appendThread('oq-17', who, i === 3 ? 'x </script><img src=x onerror=alert(1)>' : `m${i}`, f.dir, new Date(Date.now() - (10 - i) * 1000));
  const page = (await http(f.server, 'GET', '/')).text;
  assert.match(page, /<script id="init" type="application\/json">/);
  assert.ok(!page.includes('</script><img'), 'embedded data cannot close the script element');
  const init = JSON.parse(page.match(/<script id="init" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const card = init.questions.open.find((c) => c.id === 'q17');
  assert.deepEqual(card.thread.messages.map((m) => m.text.slice(0, 2)), ['m1', 'm2', 'x ']); assert.equal(card.thread.count, 4);
  for (const part of ['class="brand dark"', 'rel="icon"', '/brand/ji-white-23.svg', '/brand/jig-wordmark-white.svg', 'control tower', 'id="issues"', 'id="issuepanel"']) assert.ok(page.includes(part), part);
  assert.match(threadPage('item-1'), /class="hdr tower-hdr"/); assert.match(page, /class="bar tower-hdr"/); assert.match(threadPage('item-1'), /class="brand dark"/); assert.match(threadPage('item-1'), /\/brand\/ji-red-23\.svg/);
  // the chosen artwork is served byte for byte from the repo; nothing else is served under /brand
  const white = await http(f.server, 'GET', '/brand/ji-white-23.svg');
  assert.equal(white.status, 200); assert.equal(white.text, readFileSync(new URL('../docs/design-toolbox/logo/final/ji-white-23.svg', import.meta.url), 'utf8'));
  assert.equal((await http(f.server, 'GET', '/brand/Stardos-Stencil-OFL.txt')).status, 404); assert.equal((await http(f.server, 'GET', '/brand/..%2f..%2fREADME.md')).status, 404);
  const script = page.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  assert.equal(init.undo, null);
});

test('items say what they block and what blocks them, with links', async (t) => {
  const f = fixture(t); await up(t, f);
  const a = addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Foundation' }, f.dir).item;
  const b = addItem(f.roots, { path: join(f.root, 'b.md'), title: 'Depends', dependsOn: String(a.id) }, f.dir).item;
  const s = (await http(f.server, 'GET', '/api/state')).json();
  assert.deepEqual(s.items.find((i) => i.id === a.id).blocks.map((x) => [x.id, x.thread]), [[b.id, `item-${b.id}`]]);
  assert.equal((await http(f.server, 'GET', `/api/threads/item-${a.id}`)).json().blocks[0].title, 'Depends');
  assert.equal((await http(f.server, 'GET', `/api/threads/item-${b.id}`)).json().blockedBy[0].thread, `item-${a.id}`);
});

test('a work item linked to a review item shares its one thread; earlier notes stay read-only; doctor hints at unlinked mentions', async (t) => {
  const f = fixture(t); await up(t, f);
  const it = addItem(f.roots, { path: join(f.root, 'b.md'), title: 'Scene spike' }, f.dir, new Date('2026-11-11T08:00:00Z')).item;
  const thread = `item-${it.id}`;
  f.setQueue([{ id: 'scene-work', item: `Scene composition (see item-${it.id})`, state: 'pending', waitsFor: 'person: verdict' }, { id: 'other', item: 'Mentions item-77 only', state: 'running' }]);
  appendThread('scene-work', 'coordinator', 'old note in the work thread', f.dir, new Date('2026-11-11T09:00:00Z'));
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home };
  const cli = (...a) => spawnSync(process.execPath, [script('review.mjs'), '--project', 'jig', ...a], { env, encoding: 'utf8' });
  // doctor: a hint for each unlinked mention, none once linked
  assert.match(cli('doctor').stdout, /scene-work\thint: names review item \d+ but is not linked to it/);
  assert.notEqual(cli('queue-set', 'scene-work', '--state', 'waiting-person', '--thread', 'lab-9').status, 0, 'only item-<n> links');
  assert.match(cli('queue-set', 'scene-work', '--state', 'waiting-person', '--thread', 'item-99').stderr, /No review item 99/);
  const ok = cli('queue-set', 'scene-work', '--state', 'waiting-person', '--thread', thread);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(f.readQ()[0].thread, thread); assert.equal(f.readQ()[0].state, 'pending', 'a same-state edit');
  assert.ok(readThread('scene-work', f.dir).some((m) => new RegExp(`thread linked to ${thread}`).test(m.text)), 'logged');
  assert.doesNotMatch(cli('doctor').stdout, /scene-work/);
  assert.match(cli('doctor').stdout, /other\thint: names review item 77/);
  // the row, the discussion list, unread and the thread pages all use the one thread
  let s = (await http(f.server, 'GET', '/api/state')).json();
  const row = s.work.needsYou.find((r) => r.id === 'scene-work');
  assert.deepEqual([row.thread, row.linked], [thread, true]);
  assert.equal(s.discussions.filter((d) => d.id === thread || d.id === 'scene-work').map((d) => d.id).join(), thread, 'listed once');
  appendThread(thread, 'coordinator', 'reply on the item', f.dir, new Date(Date.now() - 1000));
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.equal(s.unread[thread], true); assert.equal(s.unread['scene-work'], undefined);
  const info = (await http(f.server, 'GET', `/api/threads/${thread}`)).json();
  assert.deepEqual(info.earlierNotes.map((n) => [n.id, n.messages[0].text]), [['scene-work', 'old note in the work thread']]);
  assert.equal((await http(f.server, 'GET', '/api/threads/scene-work')).json().linkedThread, thread, 'its own page points to the shared thread');
  // removing the link restores the separate thread
  assert.equal(cli('queue-set', 'scene-work', '--state', 'waiting-person', '--thread', '').status, 0);
  assert.equal(f.readQ()[0].thread, undefined);
  s = (await http(f.server, 'GET', '/api/state')).json();
  assert.ok(s.discussions.some((d) => d.id === 'scene-work'));
});
