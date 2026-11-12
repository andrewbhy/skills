import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { addItem, appendThread, closeItem, readThread } from '../scripts/review-core.mjs';
import { closeWork, doctor, moveWork, reopenWork } from '../scripts/review-work.mjs';
import { checkTransition, transitions } from '../scripts/review-states.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';

const script = (name) => resolve(import.meta.dirname, '..', 'scripts', name);
function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-states-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const dir = join(tmp, 'state');
  mkdirSync(root); mkdirSync(dir);
  for (const n of ['FLOWS.md', 'MAP.md', 'OTHER.md']) writeFileSync(join(root, n), `# ${n}\n`);
  const roots = [{ prefix: 'g', path: root }];
  const queue = join(dir, 'queue.json');
  const add = (name, when = '2026-11-02T10:00:00Z') => addItem(roots, { path: join(root, name), title: name }, dir, new Date(when)).item;
  return { tmp, root, dir, queue, roots, add };
}
function http(server, method, path, body) {
  return new Promise((resolveReq, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let text = ''; res.on('data', (c) => (text += c)); res.on('end', () => resolveReq({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end(data ?? undefined);
  });
}
const queueFile = (f, items) => writeFileSync(f.queue, JSON.stringify({ version: 1, items }));
const readQ = (f) => JSON.parse(readFileSync(f.queue, 'utf8')).items;

test('transition table: legal moves pass, illegal ones are refused with a reason', () => {
  const ok = (a, b, by, o) => assert.equal(checkTransition(a, b, by, o).ok, true, `${a}->${b} by ${by}`);
  const no = (a, b, by, re, o) => { const r = checkTransition(a, b, by, o); assert.equal(r.ok, false, `${a}->${b} by ${by}`); assert.match(r.error, re); };
  ok('new', 'running', 'coordinator'); ok('running', 'done', 'person'); ok('waiting-person', 'parked', 'person', { reason: 'later' });
  ok('done', 'waiting-person', 'person'); ok('done', 'running', 'coordinator'); ok('parked', 'new', 'person'); ok('blocked', 'done', 'person');
  no('done', 'new', 'coordinator', /reopen it/); no('done', 'parked', 'person', /reopen it/); no('done', 'superseded', 'coordinator', /reopen/);
  for (const to of ['new', 'running', 'done', 'waiting-person', 'parked']) no('superseded', to, 'coordinator', /final/, { reason: 'x' });
  no('running', 'parked', 'coordinator', /needs a reason/, { reason: '  ' });
  no('running', 'blocked', 'coordinator', /dependencies/);
  no('running', 'superseded', 'person', /may not move/);
  no('new', 'running', 'person', /may not move/);
  no('running', 'flying', 'system', /Unknown state/);
  no('new', 'new', 'system', /Already/);
  assert.equal(transitions().some((t) => t.to === 'blocked'), false);
  assert.equal(transitions().some((t) => t.from === 'superseded'), false);
});

test('work moves go through one function: fields and thread line change together; illegal moves change nothing', (t) => {
  const f = fixture(t);
  queueFile(f, [{ id: 'j', item: 'Job', state: 'running' }, { id: 'k', item: 'K', state: 'pending' }]);
  assert.throws(() => moveWork(f.queue, 'j', 'parked', { by: 'coordinator', dir: f.dir }), /needs a reason/);
  assert.throws(() => moveWork(f.queue, 'j', 'blocked', { by: 'coordinator', dir: f.dir }), /dependencies/);
  assert.equal(readQ(f)[0].state, 'running', 'a refused move leaves the queue alone');
  moveWork(f.queue, 'j', 'waiting-person', { by: 'coordinator', waits: 'play it', dir: f.dir });
  assert.equal(readQ(f)[0].waitsFor, 'person: play it');
  assert.throws(() => moveWork(f.queue, 'j', 'waiting-other', { by: 'coordinator', waits: 'parked: x', dir: f.dir }), /must not start/);
  assert.throws(() => moveWork(f.queue, 'j', 'waiting-other', { by: 'coordinator', dir: f.dir }), /needs --waits/);
  closeWork(f.queue, 'j', { reason: 'enough', dir: f.dir });
  const j = readQ(f)[0];
  assert.deepEqual([j.state, j.doneBy, j.doneReason, j.waitsFor], ['done', 'person', 'enough', undefined]);
  assert.throws(() => moveWork(f.queue, 'j', 'new', { by: 'coordinator', dir: f.dir }), /reopen it/);
  assert.throws(() => closeWork(f.queue, 'j', { dir: f.dir }), /Already|done/);
  reopenWork(f.queue, 'j', { dir: f.dir });
  assert.equal(readQ(f)[0].state, 'pending'); assert.match(readQ(f)[0].waitsFor, /^person: reopened/);
  moveWork(f.queue, 'k', 'superseded', { by: 'coordinator', reason: 'replaced', dir: f.dir });
  assert.throws(() => moveWork(f.queue, 'k', 'new', { by: 'coordinator', dir: f.dir }), /final/);
  const lines = readThread('j', f.dir).map((m) => m.text);
  assert.ok(lines.includes('running -> waiting-person by coordinator'));
  assert.ok(lines.includes('waiting-person -> done by person: enough'));
  assert.ok(lines.includes('done -> waiting-person by person: reopened'));
});

test('queue-set CLI validates states and waits; doctor reports board problems on a fixture', (t) => {
  const f = fixture(t);
  queueFile(f, [
    { id: 'a', item: 'Finished', state: 'running' },
    { id: 'b', item: 'Closed with wait', state: 'done', waitsFor: 'person: old' },
    { id: 'c', item: 'Weird', state: 'sleeping' },
    { id: 'd', item: 'Old run', state: 'running' },
    { id: 'e', item: 'Parked', state: 'parked', parkedReason: 'resume when the person asks' },
    { id: 'h', item: 'Parked but asking', state: 'parked', waitsFor: ['person: pick one'] },
    { id: 'g', item: 'Fine', state: 'pending' }
  ]);
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  mkdirSync(join(f.dir, 'progress'));
  writeFileSync(join(f.dir, 'progress', 'd.json'), JSON.stringify({ text: 'x', at: '2026-11-11T08:00:00.000Z', startedAt: '2026-11-11T07:00:00.000Z' }));
  const found = doctor(f.queue, { dir: f.dir, now: Date.parse('2026-11-11T12:00:00Z') });
  const by = Object.fromEntries(found.map((x) => [x.id, x.problem]));
  assert.match(by.b, /done but still has waitsFor/); assert.match(by.c, /unknown state "sleeping"/);
  assert.match(by.d, /running but its last progress is 4h old/); assert.equal(by.e, undefined, 'a reason that only mentions the person is a trigger, not a request'); assert.match(by.h, /still waits on the person/);
  assert.equal(by.a, undefined); assert.equal(by.g, undefined);
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir };
  const cli = (...args) => spawnSync(process.execPath, [script('review.mjs'), ...args], { env, encoding: 'utf8' });
  let r = cli('queue-set', 'a', '--state', 'done', '--reason', 'finished');
  assert.equal(r.status, 0, r.stderr); assert.equal(readQ(f)[0].state, 'done');
  r = cli('queue-set', 'a', '--state', 'new'); assert.notEqual(r.status, 0); assert.match(r.stderr, /reopen it/);
  r = cli('queue-set', 'g', '--state', 'waiting-person'); assert.notEqual(r.status, 0); assert.match(r.stderr, /--waits/);
  r = cli('queue-set', 'g', '--state', 'waiting-person', '--waits', 'pick one', '--item', 'Fine, renamed'); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([readQ(f)[6].item, readQ(f)[6].waitsFor], ['Fine, renamed', 'person: pick one']);
  r = cli('queue-set', 'g', '--state', 'bogus'); assert.notEqual(r.status, 0); assert.match(r.stderr, /Unknown state/);
  r = cli('queue-set', 'zzz', '--state', 'new'); assert.match(r.stderr, /No queue item/);
  r = cli('doctor'); assert.equal(r.status, 1); assert.match(r.stdout, /board issue/);
  assert.match(cli('queue-set', 'b', '--state', 'new').stderr, /reopen it/);
});

test('server: close, park, unpark, reopen a work item; actions follow the state; JSON only; the doc note names the file', async (t) => {
  const f = fixture(t);
  queueFile(f, [{ id: 'w', item: 'Work', state: 'pending', plan: join(f.root, 'FLOWS.md'), waitsFor: 'person: look' }]);
  const rv = f.add('FLOWS.md'); closeItem(rv.id, { reason: 'reviewed' }, f.dir);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, home: join(f.tmp, 'home') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const info = async () => JSON.parse((await http(server, 'GET', '/api/threads/w')).text);
  let th = await info();
  assert.deepEqual(th.actions, ['park', 'close']); assert.deepEqual(th.docNote, { name: 'FLOWS.md', id: rv.id, thread: `item-${rv.id}` });
  assert.equal(th.closed, null); assert.equal(th.chip, 'Your move: look');
  const page = (await http(server, 'GET', '/t/w')).text;
  assert.match(page, /this document was reviewed and closed/); assert.match(page, /id="park"/); assert.match(page, /id="reopen"/);
  assert.equal((await http(server, 'POST', '/api/work/w/park', { reason: 'later' })).status, 200);
  th = await info(); assert.deepEqual(th.actions, ['unpark', 'close']); assert.equal(th.chip, 'Parked: later');
  assert.equal((await http(server, 'POST', '/api/work/w/park', {})).status, 409);
  assert.equal((await http(server, 'POST', '/api/work/w/unpark', {})).status, 200);
  th = await info(); assert.equal(th.chip, 'Your move: look', 'unpark restores what it waited for');
  assert.equal((await http(server, 'POST', '/api/work/w/close', { reason: 'not needed' })).status, 200);
  th = await info(); assert.deepEqual(th.actions, ['reopen']); assert.equal(th.chip, 'Done: not needed'); assert.deepEqual([th.closed.by, th.closed.reason], ['person', 'not needed']);
  assert.equal((await http(server, 'POST', '/api/work/w/close', {})).status, 409);
  assert.equal((await http(server, 'POST', '/api/work/w/reopen', {})).status, 200);
  th = await info(); assert.deepEqual(th.actions, ['park', 'close']); assert.equal(th.closed, null);
  assert.equal((await http(server, 'POST', '/api/work/nope/close', {})).status, 404);
  const post = (headers, body) => new Promise((res) => { const q = request({ host: '127.0.0.1', port: server.address().port, path: '/api/work/w/close', method: 'POST', headers }, (m) => { m.resume(); res(m.statusCode); }); q.end(body); });
  assert.equal(await post({ 'Content-Type': 'text/plain' }, 'x'), 415);
  assert.equal(await post({ 'Content-Type': 'application/json', Origin: 'http://evil.example' }, '{}'), 403);
  assert.equal(readQ(f)[0].state, 'pending');
  assert.ok(Array.isArray(JSON.parse((await http(server, 'GET', '/api/state')).text).boardIssues));
  // review items: Reopen once closed; a superseded item is final
  const a = f.add('MAP.md');
  closeItem(a.id, { reason: 'x' }, f.dir);
  const acts = async () => JSON.parse((await http(server, 'GET', `/api/threads/item-${a.id}`)).text).actions;
  assert.deepEqual(await acts(), ['reopen']);
  assert.equal((await http(server, 'POST', `/api/items/${a.id}/reopen`, {})).status, 200);
  assert.deepEqual(await acts(), ['done', 'close']);
  f.add('MAP.md', '2026-11-05T10:00:00Z');
  assert.deepEqual(await acts(), []);
  assert.equal((await http(server, 'POST', `/api/items/${a.id}/reopen`, {})).status, 409);
});

test('status contract: one status function, every surface agrees for every fixture item', async (t) => {
  const f = fixture(t);
  const work = [
    { id: 'run-plain', item: 'Running', state: 'running' },
    { id: 'run-wait', item: 'Running but waits for the person', state: 'running', waitsFor: ['person: walkthrough r5 composer (feedback via Discuss)'] },
    { id: 'next', item: 'Next', state: 'pending' },
    { id: 'pw', item: 'Person waits', state: 'pending', waitsFor: 'person: decide' },
    { id: 'pw-unans', item: 'Person waits, message unanswered', state: 'pending', waitsFor: 'person: decide' },
    { id: 'wo', item: 'Other waits', state: 'pending', waitsFor: 'coordinator: brief' },
    { id: 'park', item: 'Parked', state: 'parked', parkedReason: 'later' },
    { id: 'dn', item: 'Done', state: 'done', doneReason: 'finished' }
  ];
  queueFile(f, work);
  appendThread('run-wait', 'person', 'is this right?', f.dir);
  appendThread('pw', 'person', 'question', f.dir); appendThread('pw', 'coordinator', 'answer', f.dir);
  appendThread('pw-unans', 'person', 'question', f.dir);
  appendThread('dn', 'person', 'one last thing', f.dir);
  for (const id of ['run-plain', 'next', 'wo', 'park']) appendThread(id, 'coordinator', 'noted', f.dir);
  const a = f.add('MAP.md'); const b = f.add('OTHER.md'); const c = f.add('FLOWS.md');
  appendThread(`item-${a.id}`, 'person', 'hello', f.dir);
  closeItem(c.id, { reason: 'ok' }, f.dir);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, home: join(f.tmp, 'home') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const state = JSON.parse((await http(server, 'GET', '/api/state')).text);
  const lists = { running: state.work.running, new: state.work.next, 'waiting-person': state.work.needsYou, 'waiting-other': state.work.waiting, parked: state.work.parked, done: state.work.done };
  for (const w of work) {
    const th = JSON.parse((await http(server, 'GET', `/api/threads/${w.id}`)).text);
    const disc = state.discussions.find((d) => d.id === w.id);
    const rows = Object.entries(lists).filter(([, l]) => l.some((r) => r.id === w.id));
    assert.equal(rows.length, 1, `${w.id} sits in exactly one section`);
    const row = lists[rows[0][0]].find((r) => r.id === w.id);
    assert.equal(rows[0][0], row.status.jobState, `${w.id}: section = job state`);
    assert.equal(th.statusLabel, row.status.display.label, `${w.id}: thread header = row chip`);
    assert.equal(disc.statusLabel, row.status.display.label, `${w.id}: Discussions = row chip`);
    assert.equal(th.status, row.status.display.discussion); assert.equal(disc.status, row.status.display.discussion);
    assert.equal(th.jobState, row.status.jobState); assert.equal(disc.jobState, row.status.jobState);
    assert.equal(th.chip, row.status.display.jobLabel);
  }
  const label = (id) => lists[Object.keys(lists).find((k) => lists[k].some((r) => r.id === id))].find((r) => r.id === id).status.display.label;
  assert.equal(label('run-wait'), 'Your message is waiting for the coordinator');
  assert.equal(state.work.running.some((r) => r.id === 'run-wait'), false, 'a running job that waits for the person is not also listed as running');
  assert.equal(label('pw'), 'Your move: decide'); assert.equal(label('wo'), 'Waiting on coordinator: brief');
  assert.equal(label('dn'), 'Done: finished', 'a message after done does not reopen the status');
  assert.equal(JSON.parse((await http(server, 'GET', '/api/threads/run-wait')).text).chip, 'Your move: walkthrough r5 composer');
  for (const it of [a, b, c]) {
    const row = state.items.find((x) => x.id === it.id) ?? { statusLabel: 'closed', status: 'closed' };
    const th = JSON.parse((await http(server, 'GET', `/api/threads/item-${it.id}`)).text);
    const disc = state.discussions.find((d) => d.id === `item-${it.id}`);
    assert.equal(th.statusLabel, row.statusLabel); assert.equal(disc.statusLabel, row.statusLabel);
    assert.equal(th.status, row.status); assert.equal(disc.status, row.status);
  }
  assert.equal(state.items.find((x) => x.id === a.id).statusLabel, 'waiting for coordinator');
  assert.equal(state.items.find((x) => x.id === b.id).statusLabel, 'waiting for you');
  const page = (await http(server, 'GET', '/')).text;
  assert.match(page, /r\.status\.display\.label/, 'rows draw their chip from the shared status');
  assert.doesNotMatch(page, /th\.unanswered\)d\.append\(pill/, 'no second, conversation-only chip on rows');
});

test('the dashboard and thread page scripts are valid JavaScript', async (t) => {
  const f = fixture(t);
  queueFile(f, [{ id: 'w', item: 'W', state: 'pending' }]);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, home: join(f.tmp, 'home') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  for (const path of ['/', '/t/w']) {
    const html = (await http(server, 'GET', path)).text;
    const script = html.split('<script>')[1].split('</script>')[0];
    assert.doesNotThrow(() => new Function(script), `${path} script parses`);
  }
});

test('queue-set allows same-state edits of --waits and --item, logs them and refuses edits that would move the item', (t) => {
  const f = fixture(t);
  queueFile(f, [
    { id: 'w', item: 'Waits', state: 'pending', waitsFor: 'person: old question' },
    { id: 'o', item: 'Other wait', state: 'pending', waitsFor: 'agent: builder' },
    { id: 'r', item: 'Running', state: 'running', waitsFor: 'stale thing' },
    { id: 'p', item: 'Parked', state: 'parked', parkedReason: 'later' }
  ]);
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir };
  const cli = (...args) => spawnSync(process.execPath, [script('review.mjs'), ...args], { env, encoding: 'utf8' });
  let r = cli('queue-set', 'w', '--state', 'waiting-person', '--waits', 'new question', '--item', 'Waits, reworded');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([readQ(f)[0].waitsFor, readQ(f)[0].item, readQ(f)[0].state], ['person: new question', 'Waits, reworded', 'pending']);
  r = cli('queue-set', 'r', '--state', 'running', '--waits', ''); assert.equal(r.status, 0, r.stderr);
  assert.equal(readQ(f)[2].waitsFor, undefined, 'a stale wait on a running item is cleared without a state change');
  r = cli('queue-set', 'o', '--state', 'waiting-other', '--waits', 'a different builder'); assert.equal(r.status, 0, r.stderr);
  assert.equal(readQ(f)[1].waitsFor, 'a different builder');
  r = cli('queue-set', 'o', '--state', 'waiting-other', '--waits', ''); assert.notEqual(r.status, 0); assert.match(r.stderr, /would change it from waiting-other to new/);
  assert.equal(readQ(f)[1].waitsFor, 'a different builder', 'a refused edit changes nothing');
  r = cli('queue-set', 'r', '--state', 'running', '--waits', 'person: look'); assert.notEqual(r.status, 0); assert.match(r.stderr, /would change it from running to waiting-person/);
  r = cli('queue-set', 'p', '--state', 'parked', '--revisit', '2026-12-01'); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([readQ(f)[3].revisit, readQ(f)[3].revisitOn], ['2026-12-01', '2026-12-01']);
  r = cli('queue-set', 'w', '--state', 'waiting-person'); assert.notEqual(r.status, 0); assert.match(r.stderr, /Already waiting-person/);
  const lines = readThread('w', f.dir).map((m) => m.text);
  assert.ok(lines.some((l) => /edited by coordinator: wait changed, text changed/.test(l)), lines.join('|'));
});
