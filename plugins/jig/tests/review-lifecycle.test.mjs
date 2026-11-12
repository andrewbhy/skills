import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addItem, appendThread, closeItem, keepItem, listDiscussions, listItems, markDone, readThread, supersedeItem, threadStatus } from '../scripts/review-core.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { parseMessage, threadPage } from '../scripts/review-thread-page.mjs';

function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-lifecycle-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const dir = join(tmp, 'state');
  mkdirSync(root); mkdirSync(dir);
  for (const n of ['a.md', 'b.md', 'c.md']) writeFileSync(join(root, n), `# ${n}\n`);
  const queue = join(dir, 'queue.json');
  const setQueue = (state) => writeFileSync(queue, JSON.stringify({ items: [{ id: 'job-1', item: 'Build it', state }] }));
  setQueue('running');
  const oq = join(dir, 'open-questions.md');
  writeFileSync(oq, '# Q\n\n## Open\n\n1. First?\n2. Second?\n\n## Answered\n\n3. Old\n');
  writeFileSync(join(dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: root }], queue, openQuestions: oq }));
  return { tmp, root, dir, queue, oq, setQueue, roots: [{ prefix: 'r', path: root }], ctx: { queue, openQuestions: oq } };
}
const T = (s) => new Date(`2026-11-11T${s}Z`);
const get = (f, id, extra = {}) => listItems(f.roots, f.dir, { all: true, ...f.ctx, ...extra }).find((x) => x.id === id);

test('adding a path an open item already points to supersedes it and links both threads', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Draft 3' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'Other' }, f.dir, T('10:01:00'));
  const r = addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Draft 4' }, f.dir, T('10:02:00'));
  assert.deepEqual(r.superseded, [1]);
  const old = get(f, 1);
  assert.equal(old.done, true);
  assert.equal(old.status, 'closed');
  assert.equal(old.closed.kind, 'superseded');
  assert.equal(old.closed.by, 'coordinator');
  assert.equal(old.closed.reason, 'superseded by #3');
  assert.equal(old.supersededBy, 3);
  assert.deepEqual(get(f, 3).supersedes, [1]);
  assert.equal(get(f, 2).done, false);
  assert.match(readThread('item-1', f.dir).at(-1).text, /superseded by #3/);
  assert.equal(readThread('item-1', f.dir).at(-1).from, 'system');
  assert.match(readThread('item-3', f.dir)[0].text, /Replaces #1/);
  // a closed item is not superseded again
  const r2 = addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Draft 5' }, f.dir, T('10:03:00'));
  assert.deepEqual(r2.superseded, [3]);
});

test('explicit supersede on add and the supersede command close the old item with a system line', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'B' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'c.md'), title: 'C', supersedes: '1' }, f.dir, T('10:01:00'));
  assert.equal(get(f, 1).closed.reason, 'superseded by #3');
  assert.throws(() => addItem(f.roots, { path: join(f.root, 'c.md'), supersedes: '99' }, f.dir), /No review item 99/);
  supersedeItem(2, 3, f.dir, T('10:02:00'));
  assert.equal(get(f, 2).supersededBy, 3);
  assert.deepEqual(get(f, 3).supersedes, [1, 2]);
  assert.match(readThread('item-2', f.dir).at(-1).text, /Closed by coordinator: superseded by #3/);
  assert.throws(() => supersedeItem(3, 3, f.dir), /itself/);
  assert.throws(() => supersedeItem(1, 9, f.dir), /No review item 9/);
});

test('dependsOn blocks until the dependency closes, for items, queue ids and open questions', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Base' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'On item', dependsOn: '1' }, f.dir, T('10:00:00'), f.ctx);
  addItem(f.roots, { path: join(f.root, 'c.md'), title: 'On job and question', dependsOn: ['job-1', 'q2'] }, f.dir, T('10:00:00'), f.ctx);
  assert.equal(get(f, 2).status, 'blocked');
  assert.match(get(f, 2).blockedBy[0].label, /#1 Base/);
  assert.equal(get(f, 3).blockedBy.length, 2);
  markDone(1, f.dir, 'person', T('10:05:00'));
  assert.equal(get(f, 2).status, 'waiting-you', 'returns when the dependency closes');
  assert.equal(get(f, 3).status, 'blocked');
  f.setQueue('done');
  assert.deepEqual(get(f, 3).blockedBy.map((b) => b.ref), ['q2']);
  writeFileSync(f.oq, '# Q\n\n## Open\n\n1. First?\n2. (answered) Second?\n');
  assert.equal(get(f, 3).status, 'waiting-you');
  assert.throws(() => addItem(f.roots, { path: join(f.root, 'a.md'), dependsOn: 'nope' }, f.dir, T('11:00:00'), f.ctx), /No queue item nope/);
  assert.throws(() => addItem(f.roots, { path: join(f.root, 'a.md'), dependsOn: '77' }, f.dir, T('11:00:00'), f.ctx), /No review item 77/);
  assert.throws(() => addItem(f.roots, { path: join(f.root, 'a.md'), dependsOn: 'q3' }, f.dir, T('11:00:00'), f.ctx), /Question 3 is not open/);
});

test('a dependency superseded by a newer item keeps blocking until the newer one closes', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'v1' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'Waiter', dependsOn: '1' }, f.dir, T('10:00:00'), f.ctx);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'v2' }, f.dir, T('10:01:00'));
  assert.equal(get(f, 2).status, 'blocked');
  assert.match(get(f, 2).blockedBy[0].label, /#3 v2/);
  markDone(3, f.dir);
  assert.equal(get(f, 2).status, 'waiting-you');
});

test('derived status: new item and coordinator last wait for you, person last waits for the coordinator', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, T('10:00:00'));
  assert.equal(get(f, 1).status, 'waiting-you');
  assert.equal(get(f, 1).statusLabel, 'waiting for you');
  appendThread('item-1', 'person', 'question?', f.dir, T('10:01:00'));
  assert.equal(get(f, 1).status, 'waiting-coordinator');
  appendThread('item-1', 'agent', 'progress', f.dir, T('10:02:00'));
  appendThread('item-1', 'system', 'note', f.dir, T('10:02:30'));
  assert.equal(get(f, 1).status, 'waiting-coordinator', 'agent and system lines do not answer');
  appendThread('item-1', 'coordinator', 'answer', f.dir, T('10:03:00'));
  assert.equal(get(f, 1).status, 'waiting-you');
  assert.equal(threadStatus({ closed: true, blocked: true }), 'closed');
  assert.equal(threadStatus({ blocked: true, messages: [{ from: 'person' }] }), 'waiting-coordinator', 'an unanswered person message is never hidden by blocked');
  assert.equal(threadStatus({ blocked: true, messages: [{ from: 'person' }, { from: 'coordinator' }] }), 'blocked');
});

test('close records who and why in the item and the thread', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'B' }, f.dir, T('10:00:00'));
  assert.throws(() => closeItem(1, { by: 'coordinator', reason: '  ' }, f.dir), /reason is required/);
  assert.throws(() => closeItem(1, { by: 'robot', reason: 'x' }, f.dir), /person or coordinator/);
  closeItem(1, { by: 'coordinator', reason: 'depends on a decision made elsewhere' }, f.dir, T('12:00:00'));
  const a = get(f, 1);
  assert.deepEqual([a.done, a.status, a.closed.by, a.closed.reason, a.closed.at], [true, 'closed', 'coordinator', 'depends on a decision made elsewhere', '2026-11-11T12:00:00.000Z']);
  assert.match(readThread('item-1', f.dir).at(-1).text, /Closed by coordinator: depends on a decision/);
  assert.throws(() => closeItem(1, { by: 'person', reason: 'again' }, f.dir), /already closed/);
  markDone(2, f.dir, 'person');
  assert.equal(get(f, 2).closed.by, 'person');
  assert.equal(get(f, 2).closed.kind, 'done');
  assert.equal(listItems(f.roots, f.dir).length, 0);
});

test('staleness: file changed after adding, and untouched for more than 3 days with Keep', (t) => {
  const f = fixture(t);
  const added = new Date('2026-11-01T10:00:00Z');
  utimesSync(join(f.root, 'a.md'), new Date('2026-10-30T00:00:00Z'), new Date('2026-10-30T00:00:00Z'));
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, added);
  assert.equal(get(f, 1, { now: new Date('2026-11-03T09:00:00Z') }).stale, false);
  const later = new Date('2026-11-04T11:00:00Z');
  assert.equal(get(f, 1, { now: later }).stale, true);
  assert.equal(get(f, 1, { now: later }).fileChanged, false);
  const m = new Date('2026-11-05T00:00:00Z');
  utimesSync(join(f.root, 'a.md'), m, m);
  assert.equal(get(f, 1, { now: later }).fileChanged, true);
  keepItem(1, f.dir, new Date('2026-11-04T11:00:00Z'));
  assert.equal(get(f, 1, { now: new Date('2026-11-06T00:00:00Z') }).stale, false);
  assert.equal(get(f, 1, { now: new Date('2026-11-08T00:00:00Z') }).stale, true);
  appendThread('item-1', 'person', 'still looking', f.dir, new Date('2026-11-08T00:00:00Z'));
  assert.equal(get(f, 1, { now: new Date('2026-11-09T00:00:00Z') }).stale, false);
});

test('discussions list every thread with status, preview and closed reason', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, T('10:00:00'));
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'B', dependsOn: '1' }, f.dir, T('10:00:00'), f.ctx);
  addItem(f.roots, { path: join(f.root, 'c.md'), title: 'C' }, f.dir, T('10:00:00'));
  appendThread('item-1', 'person', 'a long question about the draft', f.dir, T('10:05:00'));
  appendThread('job-1', 'person', 'hello job', f.dir, T('10:06:00'));
  closeItem(3, { by: 'person', reason: 'not needed' }, f.dir, T('10:07:00'));
  const d = Object.fromEntries(listDiscussions(f.roots, f.dir, f.ctx).map((x) => [x.id, x]));
  assert.equal(d['item-1'].status, 'waiting-coordinator');
  assert.match(d['item-1'].preview, /long question/);
  assert.equal(d['item-2'].status, 'blocked');
  assert.equal(d['item-3'].status, 'closed');
  assert.equal(d['item-3'].closed.reason, 'not needed');
  assert.equal(d['job-1'].status, 'waiting-coordinator');
  assert.equal(d['job-1'].title, 'Build it');
});

test('review.mjs add, close and supersede commands', (t) => {
  const f = fixture(t);
  const cli = (...args) => spawnSync(process.execPath, ['scripts/review.mjs', ...args], { encoding: 'utf8', env: { ...process.env, JIG_REVIEW_DIR: f.dir } });
  assert.equal(cli('add', join(f.root, 'a.md'), '--title', 'Draft 3').status, 0);
  const second = cli('add', join(f.root, 'a.md'), '--title', 'Draft 4');
  assert.match(second.stdout, /Closed #1 as superseded by #2/);
  assert.equal(get(f, 1).closed.reason, 'superseded by #2');
  assert.equal(cli('add', join(f.root, 'b.md'), '--title', 'Wait', '--depends-on', 'job-1', '--depends-on', 'q1').status, 0);
  assert.deepEqual(get(f, 3).dependsOn, ['job-1', 'q1']);
  assert.equal(get(f, 3).status, 'blocked');
  assert.notEqual(cli('close', '3').status, 0, 'reason is required');
  assert.equal(cli('close', '3', '--reason', 'decided elsewhere').status, 0);
  assert.equal(get(f, 3).closed.reason, 'decided elsewhere');
  assert.equal(cli('add', join(f.root, 'c.md'), '--title', 'C').status, 0);
  assert.equal(cli('supersede', '2', '4').status, 0);
  assert.equal(get(f, 2).supersededBy, 4);
  assert.notEqual(cli('supersede', '2', '2').status, 0);
});

function http(server, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => (text += c)); res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end(body);
  });
}

test('server: person close, keep, status in state and thread api', async (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir, new Date());
  addItem(f.roots, { path: join(f.root, 'b.md'), title: 'B' }, f.dir, new Date());
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, openQuestions: f.oq });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const json = { 'Content-Type': 'application/json' };
  let state = JSON.parse((await http(server, 'GET', '/api/state')).text);
  assert.equal(state.items[0].status, 'waiting-you');
  assert.equal(state.discussions.filter((d) => d.kind !== 'question').length, 2);
  assert.equal((await http(server, 'POST', '/api/items/1/close', { body: '{}', headers: json })).status, 400);
  assert.equal((await http(server, 'POST', '/api/items/1/close', { body: '{"reason":"x"}' })).status, 415);
  assert.equal((await http(server, 'POST', '/api/items/9/close', { body: '{"reason":"x"}', headers: json })).status, 404);
  assert.equal((await http(server, 'POST', '/api/items/1/close', { body: '{"reason":"outdated"}', headers: json })).status, 200);
  assert.equal((await http(server, 'POST', '/api/items/1/close', { body: '{"reason":"again"}', headers: json })).status, 409);
  const th = JSON.parse((await http(server, 'GET', '/api/threads/item-1')).text);
  assert.equal(th.status, 'closed');
  assert.deepEqual([th.closed.by, th.closed.reason], ['person', 'outdated']);
  assert.equal((await http(server, 'POST', '/api/items/2/keep')).status, 200);
  assert.equal((await http(server, 'POST', '/api/items/2/done')).status, 200);
  assert.equal(JSON.parse((await http(server, 'GET', '/api/threads/item-2')).text).closed.by, 'person');
  state = JSON.parse((await http(server, 'GET', '/api/state')).text);
  assert.equal(state.items.length, 0);
});

test('messages: URLs become links, local links are marked, lists and breaks parse', () => {
  const origin = 'http://127.0.0.1:7799';
  const [p] = parseMessage('see http://127.0.0.1:7788/f/r/a.md#x. and https://example.com/a?b=1, ok', origin);
  const links = p.items[0].filter((x) => x.t === 'link');
  assert.deepEqual(links.map((l) => [l.href, l.local]), [['/f/r/a.md#x', true], ['https://example.com/a?b=1', false]]);
  assert.equal(p.items[0].at(-1).v, ', ok'.slice(0, 0) + ', ok');
  assert.equal(parseMessage('open /t/item-4 now', origin)[0].items[0][1].href, '/t/item-4');
  assert.equal(parseMessage('http://127.0.0.1:7799/f/r/b.md', origin)[0].items[0][0].local, true);
  const blocks = parseMessage('intro\nsecond line\n\n1. one\n2. two\n- a\n- b', origin);
  assert.deepEqual(blocks.map((b) => [b.type, b.items.length]), [['p', 2], ['ol', 2], ['ul', 2]]);
});

test('messages: html and script payloads and unsafe schemes stay inert text', () => {
  const origin = 'http://127.0.0.1:7799';
  const payload = '<img src=x onerror=alert(1)><script>alert(1)</script> javascript:alert(1) [x](javascript:alert(2)) data:text/html,<b>';
  const tokens = parseMessage(payload, origin).flatMap((b) => b.items.flat());
  assert.equal(tokens.some((x) => x.t === 'link'), false);
  assert.equal(tokens.map((x) => x.v).join(''), payload);
  // a link keeps its scheme check: only http and https become anchors
  assert.equal(parseMessage('ftp://x.example/a', origin)[0].items[0].some((x) => x.t === 'link'), false);
  // the page builds message nodes from text only
  const page = threadPage('item-1');
  assert.doesNotMatch(page.split('function fillMessage')[1].split('function goBack')[0], /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(page, /rel='noopener noreferrer'|a\.rel='noopener noreferrer'/);
  assert.match(page, /Open alone/);
});

test('a work item keeps its queue status; an open review of the same file is linked, a closed one is not mentioned', async (t) => {
  const f = fixture(t);
  writeFileSync(f.queue, JSON.stringify({ items: [{ id: 'app-one-turn-prototype', item: 'Turn prototype', state: 'pending', area: 'x', plan: join(f.root, 'a.md'), waitsFor: 'person: playtest' }] }));
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Plan doc' }, f.dir, new Date());
  markDone(1, f.dir, 'person');
  appendThread('app-one-turn-prototype', 'coordinator', 'ready to play', f.dir);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, openQuestions: f.oq });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const th = JSON.parse((await http(server, 'GET', '/api/threads/app-one-turn-prototype')).text);
  assert.equal(th.kind, 'work');
  assert.equal(th.chip, 'Your move: playtest');
  assert.equal(th.closed, null);
  assert.notEqual(th.status, 'closed');
  assert.equal(th.openReview, null);
  assert.equal('docClosed' in th, false);
  const rv = addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Plan doc v2' }, f.dir, new Date()).item;
  assert.deepEqual(JSON.parse((await http(server, 'GET', '/api/threads/app-one-turn-prototype')).text).openReview, { id: rv.id, thread: `item-${rv.id}` });
  const d = JSON.parse((await http(server, 'GET', '/api/state')).text).discussions.find((x) => x.id === 'app-one-turn-prototype');
  assert.notEqual(d.status, 'closed');
  f.setQueue('done');
  writeFileSync(f.queue, JSON.stringify({ items: [{ id: 'app-one-turn-prototype', item: 'Turn prototype', state: 'running', area: 'x' }] }));
  assert.equal(JSON.parse((await http(server, 'GET', '/api/threads/app-one-turn-prototype')).text).chip, 'Running');
});
