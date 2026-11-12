import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addItem, appendThread, knownThreadIds, maxThreadText, readThread, threadFile, threadSummaries, unreadThreads, watchThreads, writeProgress } from '../scripts/review-core.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';

function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-threads-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const dir = join(tmp, 'state');
  mkdirSync(root); mkdirSync(dir);
  writeFileSync(join(root, 'a.md'), '# A\n');
  const queue = join(dir, 'queue.json');
  writeFileSync(queue, JSON.stringify({ items: [{ id: 'job-1', item: 'Build it', state: 'running', area: 'x', provider: 'codex' }] }));
  writeFileSync(join(dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: root }] }));
  return { tmp, root, dir, queue, roots: [{ prefix: 'r', path: root }] };
}

function http(server, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => (text += c)); res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end(body);
  });
}
const post = (server, id, payload, headers = { 'Content-Type': 'application/json' }) => http(server, 'POST', `/api/threads/${id}`, { body: typeof payload === 'string' ? payload : JSON.stringify(payload), headers });

test('thread storage appends, reads back, summarizes and ignores bad lines', (t) => {
  const f = fixture(t);
  appendThread('job-1', 'person', 'first\nsecond', f.dir, new Date('2026-11-11T10:00:00Z'));
  appendThread('job-1', 'agent', 'step done', f.dir, new Date('2026-11-11T10:01:00Z'));
  appendFileSync(threadFile('job-1', f.dir), 'not json\n{"from":"x","text":"y","at":"2026-11-11T10:02:00Z"}\n{"from":"person","text":"half');
  const msgs = readThread('job-1', f.dir);
  assert.deepEqual(msgs.map((m) => m.from), ['person', 'agent']);
  assert.equal(msgs[0].text, 'first\nsecond');
  assert.equal(threadSummaries(f.dir)['job-1'].unanswered, true);
  assert.deepEqual(unreadThreads(f.dir).map((x) => x.id), ['job-1']);
  appendFileSync(threadFile('job-1', f.dir), '"}\n');
  appendThread('job-1', 'coordinator', 'ok', f.dir);
  assert.equal(threadSummaries(f.dir)['job-1'].unanswered, false);
  assert.deepEqual(unreadThreads(f.dir), []);
  assert.throws(() => appendThread('../x', 'person', 'hi', f.dir), /Invalid thread id/);
  assert.throws(() => appendThread('job-1', 'robot', 'hi', f.dir), /Invalid sender/);
  assert.throws(() => appendThread('job-1', 'person', '   ', f.dir), /empty/);
  assert.throws(() => appendThread('job-1', 'person', 'x'.repeat(maxThreadText + 1), f.dir), /longer than/);
});

test('progress notes land in the thread as agent lines', (t) => {
  const f = fixture(t);
  writeProgress('job-1', 'halfway', f.dir);
  assert.deepEqual(readThread('job-1', f.dir).map((m) => [m.from, m.text]), [['agent', 'halfway']]);
});

test('POST validation: person only, known ids, size cap, JSON, origin', async (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const host = `127.0.0.1:${server.address().port}`;
  assert.equal((await post(server, 'item-1', { from: 'person', text: 'hello' })).status, 200);
  assert.equal((await post(server, 'job-1', { from: 'person', text: 'queue ok' })).status, 200);
  assert.equal((await post(server, 'item-9', { from: 'person', text: 'x' })).status, 404, 'unknown id');
  assert.equal((await post(server, '..%2Fx', { from: 'person', text: 'x' })).status, 400, 'bad id');
  assert.equal((await post(server, 'item-1', { from: 'coordinator', text: 'x' })).status, 403);
  assert.equal((await post(server, 'item-1', { text: 'x' })).status, 403, 'from required');
  assert.equal((await post(server, 'item-1', { from: 'person', text: 'x'.repeat(maxThreadText + 1) })).status, 413);
  assert.equal((await post(server, 'item-1', `{"from":"person","text":"${'y'.repeat(100000)}"}`)).status, 413, 'huge body');
  assert.equal((await post(server, 'item-1', { from: 'person', text: '  ' })).status, 400);
  assert.equal((await post(server, 'item-1', 'nope')).status, 400);
  assert.equal((await post(server, 'item-1', { from: 'person', text: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(server, 'item-1', { from: 'person', text: 'x' }, { 'Content-Type': 'application/json', Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post(server, 'item-1', { from: 'person', text: 'x' }, { 'Content-Type': 'application/json', Host: 'evil.example' })).status, 403);
  assert.deepEqual(readThread('item-1', f.dir).map((m) => m.text), ['hello'], 'only the valid post was written');
  const got = JSON.parse((await http(server, 'GET', '/api/threads/item-1')).text);
  assert.equal(got.title, 'A'); assert.equal(got.link, '/f/r/a.md'); assert.equal(got.unanswered, true);
  assert.equal((await http(server, 'GET', '/api/threads/item-9')).status, 404);
  const page = await http(server, 'GET', '/t/item-1');
  assert.equal(page.status, 200); assert.match(page.text, /Shift\+Enter/);
  const state = JSON.parse((await http(server, 'GET', '/api/state')).text);
  assert.equal(state.threads['item-1'].unanswered, true);
  assert.equal(state.items[0].thread, 'item-1');
  assert.ok(knownThreadIds(f.queue, f.dir).has('job-1'));
});

test('reply and threads commands', (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir);
  const cli = (...args) => spawnSync(process.execPath, ['scripts/review.mjs', ...args], { encoding: 'utf8', env: { ...process.env, JIG_REVIEW_DIR: f.dir } });
  assert.equal(cli('threads').stdout, '');
  appendThread('item-1', 'person', 'a question\nover two lines', f.dir);
  assert.match(cli('threads').stdout, /^item-1\t\S+\ta question over two lines\n$/);
  const r = cli('reply', 'item-1', 'here', 'is', 'an answer');
  assert.equal(r.status, 0);
  assert.deepEqual(readThread('item-1', f.dir).map((m) => [m.from, m.text]), [['person', 'a question\nover two lines'], ['coordinator', 'here is an answer']]);
  assert.equal(cli('threads').stdout, '');
  assert.notEqual(cli('reply', 'nope', 'x').status, 0, 'unknown id refused');
  assert.notEqual(cli('reply', 'item-1').status, 0, 'text required');
});

test('watchThreads reports each new person message once and survives churn', async (t) => {
  const f = fixture(t);
  appendThread('job-1', 'person', 'old message', f.dir);
  const got = [];
  const stop = watchThreads(f.dir, (id, m) => got.push(`${id} | ${m.text}`), { interval: 20 });
  t.after(stop);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(80);
  assert.deepEqual(got, [], 'existing messages are not replayed');
  appendThread('job-1', 'person', 'new one', f.dir);
  appendThread('job-1', 'coordinator', 'reply', f.dir);
  appendThread('item-2', 'person', 'other thread', f.dir);
  appendFileSync(threadFile('job-1', f.dir), '{"from":"person","text":"par');
  await wait(100);
  assert.deepEqual([...got].sort(), ['item-2 | other thread', 'job-1 | new one']);
  appendFileSync(threadFile('job-1', f.dir), 'tial","at":"2026-11-11T10:00:00Z"}\n');
  writeFileSync(join(f.dir, 'threads', 'junk.txt'), 'x');
  rmSync(threadFile('item-2', f.dir));
  await wait(100);
  assert.deepEqual([...got].sort(), ['item-2 | other thread', 'job-1 | new one', 'job-1 | partial']);
});

test('watch command prints only message lines on stdout', async (t) => {
  const f = fixture(t);
  const child = spawn(process.execPath, ['scripts/review.mjs', 'watch'], { env: { ...process.env, JIG_REVIEW_DIR: f.dir } });
  t.after(() => child.kill());
  let out = ''; child.stdout.on('data', (c) => (out += c));
  await new Promise((r) => setTimeout(r, 600));
  appendThread('job-1', 'person', 'live line\nwith break', f.dir);
  for (let i = 0; i < 40 && !out.includes('\n'); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(out, 'job-1 | live line with break\n');
});

test('thread page: back and done controls, artifact iframe, self-only framing', async (t) => {
  const f = fixture(t);
  addItem(f.roots, { path: join(f.root, 'a.md'), title: 'A' }, f.dir);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const page = await http(server, 'GET', '/t/item-1');
  assert.match(page.text, /id="back"/); assert.match(page.text, /id="done"/); assert.match(page.text, /Mark done/);
  assert.match(page.text, /createElement\('iframe'\)[^;]*;f\.src=src/, 'iframe src comes from the item link');
  const info = JSON.parse((await http(server, 'GET', '/api/threads/item-1')).text);
  assert.equal(info.link, '/f/r/a.md'); assert.equal(info.kind, 'review'); assert.equal(info.itemId, 1);
  const work = JSON.parse((await http(server, 'GET', '/api/threads/job-1')).text);
  assert.equal(work.kind, 'work'); assert.ok(work.state);
  const csp = (await request_headers(server, '/t/item-1'))['content-security-policy'];
  assert.match(csp, /frame-src 'self'/); assert.match(csp, /frame-ancestors 'self'/);
  assert.doesNotMatch(csp, /frame-ancestors[^;]*(\*|http)/);
  assert.match((await request_headers(server, '/f/r/a.md'))['content-security-policy'], /frame-ancestors 'self'(;|$)/, 'markdown page');
  assert.match((await request_headers(server, '/f/r/a.md?raw'))['content-security-policy'], /frame-ancestors 'self'(;|$)/, 'raw file');
  assert.equal((await request_headers(server, '/'))['referrer-policy'], 'same-origin');
  assert.match((await http(server, 'GET', '/f/r/a.md')).text, /class="bar"/, 'standalone page keeps its bar');
  assert.doesNotMatch((await http(server, 'GET', '/f/r/a.md?embed=1')).text, /class="bar"/, 'embedded page has no second bar');
  assert.equal(JSON.parse((await http(server, 'POST', `/api/items/1/done`)).text).ok ?? true, true);
  assert.equal(JSON.parse((await http(server, 'GET', '/api/threads/item-1')).text).done, true);
});

function request_headers(server, path) {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: server.address().port, path, method: 'GET' }, (res) => { res.resume(); res.on('end', () => resolve(res.headers)); }).on('error', reject).end();
  });
}

test('links keep one colour when visited and underline only on hover', async (t) => {
  const f = fixture(t);
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  for (const path of ['/', '/t/job-1', '/f/r/a.md']) {
    const css = (await http(server, 'GET', path)).text;
    assert.match(css, /a,a:visited\{color:#1d4ed8;text-decoration:none\}/, path);
    assert.match(css, /a:hover,a:focus-visible\{text-decoration:underline\}/, path);
    assert.match(css, /prefers-color-scheme:dark\)\{[^]*a,a:visited\{color:#8bb8ff\}/, path);
  }
  assert.match((await http(server, 'GET', '/')).text, /class="sbtn|'sbtn disc|'sbtn'/);
});
