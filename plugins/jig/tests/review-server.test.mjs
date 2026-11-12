import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import { addItem, listItems, locate, locateUrl, markDone, projectOf, readProgress, readQueue, renderMarkdown, waitInfo, writeProgress } from '../scripts/review-core.mjs';
import { countOpenQuestions, createReviewServer } from '../scripts/review-server.mjs';

function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-review-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const other = join(tmp, 'other'); const dir = join(tmp, 'state');
  mkdirSync(join(root, 'sub'), { recursive: true }); mkdirSync(join(root, 'Private'), { recursive: true }); mkdirSync(other); mkdirSync(dir);
  writeFileSync(join(root, 'a.md'), '# A\n'); writeFileSync(join(root, 'sub', 'b.md'), '# B\n'); writeFileSync(join(root, 'Private', 's.txt'), 'secret');
  writeFileSync(join(other, 'o.txt'), 'outside'); writeFileSync(join(root, 'img.png'), 'x');
  let linked = true;
  try { symlinkSync(other, join(root, 'link'), 'junction'); } catch { linked = false; }
  return { tmp, root, other, dir, linked, roots: [{ prefix: 'r', path: root }] };
}

test('path safety', (t) => {
  const f = fixture(t);
  assert.equal(locate(f.roots, join(f.root, 'a.md')).ok, true);
  assert.equal(locate(f.roots, join(f.root, 'Private', 's.txt')).reason, 'private');
  assert.equal(locate(f.roots, join(f.root, 'sub', '..', 'PRIVATE', 's.txt')).reason, 'private');
  assert.equal(locate(f.roots, join(f.other, 'o.txt')).reason, 'outside allowed roots');
  assert.equal(locate(f.roots, join(f.root, 'sub', '..', '..', 'other', 'o.txt')).ok, false);
  assert.equal(locate(f.roots, join(f.root, 'missing.md')).reason, 'not found');
  assert.equal(locateUrl(f.roots, 'r', ['..', 'other', 'o.txt']).ok, false);
  assert.equal(locateUrl(f.roots, 'r', ['C:', 'x']).ok, false);
  assert.equal(locateUrl(f.roots, 'nope', ['a.md']).reason, 'unknown root');
  assert.equal(locateUrl(f.roots, 'r', ['sub', 'b.md']).ok, true);
  if (f.linked) assert.equal(locate(f.roots, join(f.root, 'link', 'o.txt')).ok, false, 'link escaping the root');
});

test('private through a link target is refused', (t) => {
  const f = fixture(t);
  try { symlinkSync(join(f.root, 'Private'), join(f.root, 'alias'), 'junction'); } catch { return t.skip('no link rights'); }
  assert.equal(locate(f.roots, join(f.root, 'alias', 's.txt')).reason, 'private');
});

function get(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, headers }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
}

test('http layer refuses unsafe requests and serves allowed files', async (t) => {
  const f = fixture(t);
  const server = createReviewServer({ roots: f.roots, dir: f.dir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  assert.equal((await get(server, '/f/r/a.md')).status, 200);
  assert.equal((await get(server, '/f/r/img.png')).headers['content-type'], 'image/png');
  assert.equal((await get(server, '/f/r/private/s.txt')).status, 403);
  assert.equal((await get(server, '/f/r/Private/s.txt')).status, 403);
  assert.ok([400, 403, 404].includes((await get(server, '/f/r/%2e%2e/other/o.txt')).status));
  assert.equal((await get(server, '/f/r/..%5cother%5co.txt')).status, 400);
  assert.equal((await get(server, '/f/r/sub/')).status, 200);
  assert.equal((await get(server, '/f/r/sub')).status, 200, 'allowlisted folder viewer');
  const listing = await get(server, '/f/r/');
  assert.equal(listing.status, 200);
  assert.match(listing.body, /href="\/f\/r\/a.md"/);
  assert.doesNotMatch(listing.body, /href="[^\"]*\/(?:private|Private)(?:\/|")/);
  assert.equal((await get(server, '/f/nope/a.md')).status, 403);
  if (f.linked) assert.equal((await get(server, '/f/r/link/o.txt')).status, 403);
  assert.equal((await get(server, '/', { Host: 'evil.example' })).status, 403);
  assert.equal((await get(server, '/', { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await get(server, '/api/state')).headers['access-control-allow-origin'], undefined);
  const post = await new Promise((resolve) => { const q = request({ host: '127.0.0.1', port: server.address().port, path: '/f/r/a.md', method: 'POST' }, (res) => { res.resume(); resolve(res.statusCode); }); q.end(); });
  assert.equal(post, 404);
});

test('markdown escapes html and renders blocks', () => {
  const ctx = { roots: [], baseDir: '/', src: 'r/x.md' };
  const html = renderMarkdown('# T <img src=x onerror=alert(1)>\n\n<script>alert(1)</script> **b**\n\n- one\n- two\n\n| a | b |\n|---|:-:|\n| 1 | 2 |\n\n```\n<b>code</b>\n```\n', ctx);
  assert.ok(!html.includes('<script>') && !html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<h1 data-src="r\/x\.md#L1-1">/);
  assert.match(html, /<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<table[^>]*>.*<th[^>]*>a<\/th>.*<td style="text-align:center">2<\/td>/s);
  assert.match(html, /<pre[^>]*><code>&lt;b&gt;code&lt;\/b&gt;\n?<\/code><\/pre>/);
  assert.ok(!renderMarkdown('[x](javascript:alert(1))', ctx).includes('href'));
  assert.ok(!renderMarkdown('[x](data:text/html,hi)', ctx).includes('href'));
  assert.match(renderMarkdown('[x](https://example.com/?a=1&b=2)', ctx), /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
});

test('markdown link rewriting stays inside roots', (t) => {
  const f = fixture(t);
  const ctx = { roots: f.roots, baseDir: join(f.root, 'sub') };
  assert.match(renderMarkdown('[b](b.md#top)', ctx), /href="\/f\/r\/sub\/b\.md#top"/);
  const url = new URL('file:///' + join(f.root, 'a.md').split(sep).join('/')).href;
  assert.match(renderMarkdown(`[a](${url})`, ctx), /href="\/f\/r\/a\.md"/);
  assert.match(renderMarkdown(`[a](<${join(f.root, 'a.md')}>)`, ctx), /href="\/f\/r\/a\.md"/);
  assert.match(renderMarkdown('![i](../img.png)', ctx), /<img src="\/f\/r\/img\.png"/);
  for (const bad of ['../../other/o.txt', '../Private/s.txt', `file:///${join(f.other, 'o.txt').split(sep).join('/')}`]) {
    assert.ok(!renderMarkdown(`[x](${bad})`, ctx).includes('href'), bad);
  }
});

test('items add, list and done', (t) => {
  const f = fixture(t);
  const one = addItem(f.roots, { path: join(f.root, 'a.md'), title: 'Plan', note: 'check this' }, f.dir, new Date('2026-11-10T10:00:00Z'));
  const two = addItem(f.roots, { path: join(f.root, 'img.png'), title: 'Mock' }, f.dir, new Date('2026-11-10T11:00:00Z'));
  assert.equal(one.item.kind, 'markdown'); assert.equal(two.item.kind, 'image');
  assert.throws(() => addItem(f.roots, { path: join(f.other, 'o.txt'), title: 'x' }, f.dir), /outside allowed roots/);
  assert.throws(() => addItem(f.roots, { path: join(f.root, 'Private', 's.txt'), title: 'x' }, f.dir), /private/);
  const listed = listItems(f.roots, f.dir);
  assert.deepEqual(listed.map((x) => x.title), ['Mock', 'Plan']);
  assert.equal(listed[1].url, '/f/r/a.md'); assert.equal(listed[1].note, 'check this');
  markDone(one.item.id, f.dir);
  assert.deepEqual(listItems(f.roots, f.dir).map((x) => x.title), ['Mock']);
  assert.equal(listItems(f.roots, f.dir, { all: true }).length, 2);
  assert.throws(() => markDone(99, f.dir), /No review item/);
});

test('review.mjs add, list and done end to end', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const f = fixture(t);
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: f.root }] }));
  const cli = (...args) => spawnSync(process.execPath, ['scripts/review.mjs', ...args], { encoding: 'utf8', env: { ...process.env, JIG_REVIEW_DIR: f.dir } });
  const added = cli('add', join(f.root, 'a.md'), '--title', 'Plan', '--note', 'n');
  assert.equal(added.stdout.trim(), 'http://127.0.0.1:7788/f/r/a.md');
  assert.match(cli('list').stdout, /^1\tmarkdown\tPlan\thttp:\/\/127\.0\.0\.1:7788\/f\/r\/a\.md/);
  assert.notEqual(cli('add', join(f.other, 'o.txt')).status, 0);
  assert.equal(cli('done', '1').status, 0);
  assert.equal(cli('list').stdout.trim(), '');
});

test('work queue grouping, superseded hidden, malformed tolerated', (t) => {
  const f = fixture(t);
  const mk = (id, state, extra = {}) => ({ id, item: 'x'.repeat(id === 'long' ? 300 : 5), state, area: 'a', provider: 'codex', ...extra });
  const items = [
    mk('d0', 'done'), mk('s', 'done', { superseded: true }), ...Array.from({ length: 9 }, (_, i) => mk('d' + (i + 1), 'done')),
    mk('r', 'running', { plan: join(f.root, 'a.md') }), mk('n', 'pending'), mk('long', 'pending'),
    mk('w', 'pending', { waitsFor: ['thing one'] }), mk('ws', 'pending', { waitsFor: ['z'], superseded: true })
  ];
  const q = join(f.tmp, 'queue.json');
  writeFileSync(q, JSON.stringify({ items }));
  const w = readQueue(q, f.roots);
  assert.deepEqual(w.running.map((x) => x.id), ['r']);
  assert.match(w.running[0].planUrl, /^\/f\/r\/a\.md$/);
  assert.deepEqual(w.next.map((x) => x.id), ['n', 'long']);
  assert.ok(w.next[1].item.length <= 140);
  assert.deepEqual(w.waiting.map((x) => [x.id, x.wait]), [['w', 'thing one']]);
  assert.deepEqual(w.done.map((x) => x.id), ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']);
  writeFileSync(q, '{bad');
  assert.ok(readQueue(q, f.roots).notice);
  assert.ok(readQueue(join(f.tmp, 'nope.json'), f.roots).notice);
  writeFileSync(q, '{"items":5}');
  assert.ok(readQueue(q, f.roots).notice);
});
test('progress command writes file, keeps startedAt, rejects bad input', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: f.root }] }));
  const cli = (...args) => spawnSync(process.execPath, ['scripts/review.mjs', ...args], { encoding: 'utf8', env: { ...process.env, JIG_REVIEW_DIR: f.dir } });
  const first = cli('progress', 'job-1', 'step one done');
  assert.equal(first.status, 0);
  const a = readProgress('job-1', f.dir);
  assert.equal(a.text, 'step one done');
  assert.equal(a.at, a.startedAt);
  const before = Date.parse(a.at);
  while (Date.now() <= before) { /* ensure a later timestamp */ }
  assert.equal(cli('progress', 'job-1', 'step', 'two').status, 0);
  const b = readProgress('job-1', f.dir);
  assert.equal(b.text, 'step two');
  assert.equal(b.startedAt, a.startedAt);
  assert.ok(Date.parse(b.at) > before);
  assert.notEqual(cli('progress', '../evil', 'x').status, 0);
  assert.notEqual(cli('progress', 'job-1').status, 0);
  assert.notEqual(cli('progress', 'job-1', '   ').status, 0);
  assert.throws(() => writeProgress('a/b', 'x', f.dir));
});

test('progress merges into running rows only; stale and corrupt files ignored', (t) => {
  const f = fixture(t);
  const q = join(f.tmp, 'queue.json');
  writeFileSync(q, JSON.stringify({ items: [
    { id: 'run', item: 'R', state: 'running', area: 'a' }, { id: 'run2', item: 'R2', state: 'running', area: 'a' },
    { id: 'fin', item: 'F', state: 'done', area: 'a' }, { id: 'nxt', item: 'N', state: 'pending', area: 'a' }
  ] }));
  writeProgress('run', 'halfway', f.dir); writeProgress('fin', 'old', f.dir); writeProgress('nxt', 'early', f.dir);
  mkdirSync(join(f.dir, 'progress'), { recursive: true });
  writeFileSync(join(f.dir, 'progress', 'run2.json'), '{bad');
  const w = readQueue(q, f.roots, { progressDir: f.dir });
  assert.equal(w.running.find((x) => x.id === 'run').progress.text, 'halfway');
  assert.equal(w.running.find((x) => x.id === 'run2').progress, null);
  assert.equal(w.done[0].progress, undefined);
  assert.equal(w.next[0].progress, undefined);
});

test('needs-you split, wait owner and project derivation', (t) => {
  const f = fixture(t);
  assert.deepEqual(waitInfo(['person (10 Nov): look at it']), { who: 'person', note: 'look at it' });
  assert.equal(waitInfo(['coordinator: brief']).who, 'coordinator');
  assert.equal(waitInfo('Codex usage reset after Fri 13 Nov 15:20').who, 'date');
  assert.equal(waitInfo(['checked plan']).who, 'prerequisite');
  assert.equal(waitInfo([]).who, '');
  const groupsHome = mkdtempSync(join(tmpdir(), 'jig-groups-')); writeFileSync(join(groupsHome, 'project-groups.json'), JSON.stringify({ groups: [{ name: 'app-one', plan: 'app-one' }, { name: 'app two', plan: 'two|sub-app', area: 'intake' }, { name: 'jig', plan: '/jig(-wt)?/', area: '^(skills|tooling)$' }] }));
  assert.equal(projectOf({ plan: '/work/app-one/docs/x.md' }, { home: groupsHome }), 'app-one');
  assert.equal(projectOf({ plan: '/work/two/.worktrees/sub-app/docs/x.md' }, { home: groupsHome }), 'app two');
  assert.equal(projectOf({ plan: '/work/x.md', area: 'intake' }, { home: groupsHome }), 'app two');
  assert.equal(projectOf({ plan: '/work/jig/review/report.md', area: 'skills' }, { home: groupsHome }), 'jig');
  assert.equal(projectOf({ area: 'tooling' }, { home: groupsHome }), 'jig');
  assert.equal(projectOf({ area: 'design' }, { home: groupsHome }), 'other');
  const q = join(f.tmp, 'queue.json');
  writeFileSync(q, JSON.stringify({ items: [
    { id: 'p', item: 'P', state: 'pending', waitsFor: ['person: decide'] }, { id: 'c', item: 'C', state: 'pending', waitsFor: ['coordinator: brief'] },
    { id: 'r', item: 'R', state: 'running', waitsFor: ['person: walkthrough'] }, { id: 'n', item: 'N', state: 'pending' }
  ] }));
  const w = readQueue(q, f.roots, { progressDir: f.dir });
  assert.deepEqual(w.needsYou.map((x) => x.id), ['p', 'r']);
  assert.deepEqual(w.waiting.map((x) => x.id), ['c']);
  assert.deepEqual(w.next.map((x) => x.id), ['n']);
});

test('open question count and state carries progress over HTTP', async (t) => {
  const f = fixture(t);
  assert.equal(countOpenQuestions('# T\n\n## Open\n\n5. **a**\n6. **b**\n3. *(answered, see below)*\n\n## Answered\n\n1. old\n'), 2);
  const q = join(f.tmp, 'queue.json');
  writeFileSync(q, JSON.stringify({ items: [{ id: 'run', item: 'R', state: 'running' }] }));
  writeProgress('run', 'building', f.dir);
  const server = createReviewServer({ roots: f.roots, queue: q, dir: f.dir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
  const s = await res.json();
  assert.equal(s.work.running[0].progress.text, 'building');
  const home = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
  assert.match(home, /For you/);
});

test('ordered list keeps the numbers written in the source', () => {
  const html = renderMarkdown('5. five\n6. six\n2. two\n', { roots: [], baseDir: '/' });
  assert.match(html, /<li value="5">five/);
  assert.match(html, /<li value="2">two/);
});
