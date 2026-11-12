import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { appendThread, messageLine, readThread, unreadThreads, watchThreads } from '../scripts/review-core.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { decodeImages, maxImageBytes, sniffImage } from '../scripts/review-attach.mjs';
import { attachmentPath, attachmentsDir } from '../scripts/jig-store.mjs';
import { threadPage } from '../scripts/review-thread-page.mjs';
import { homePage } from '../scripts/review-home-page.mjs';

// Smallest headers that pass the magic-byte checks; the server never decodes pixels.
const png = (w = 3, h = 2, pad = 0) => {
  const b = Buffer.alloc(33 + pad);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
const webp = () => { const b = Buffer.alloc(30); b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1'); b.writeUIntLE(99, 24, 3); b.writeUIntLE(49, 27, 3); return b; };
const img = (buf, type = 'image/png') => ({ type, data: buf.toString('base64') });

function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-attach-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'); const dir = join(tmp, 'state'); const home = join(tmp, 'store');
  mkdirSync(root); mkdirSync(dir); mkdirSync(home);
  writeFileSync(join(dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: root }] }));
  const queue = join(dir, 'queue.json');
  writeFileSync(queue, JSON.stringify({ items: [{ id: 'job-1', item: 'Build it', state: 'running', area: 'x', provider: 'codex' }] }));
  return { tmp, root, dir, home, queue };
}
async function serve(t, f) {
  const server = createReviewServer({ roots: [{ prefix: 'r', path: f.root }], queue: f.queue, dir: f.dir, home: f.home, project: 'proj' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return server;
}
function http(server, method, path, { body, headers = {} } = {}) {
  return new Promise((res, rej) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, buf: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', rej); req.end(body);
  });
}
const J = { 'Content-Type': 'application/json' };
const send = (server, id, payload, headers = J) => http(server, 'POST', `/api/threads/${id}`, { body: JSON.stringify(payload), headers });

test('an image message is stored in the personal store and recorded on the message', async (t) => {
  const f = fixture(t); const server = await serve(t, f);
  const r = await send(server, 'job-1', { from: 'person', text: 'see this', images: [img(png(640, 480)), img(jpeg(), 'image/jpeg'), img(webp(), 'webp')] });
  assert.equal(r.status, 200, r.text);
  const m = readThread('job-1', f.dir)[0];
  assert.equal(m.text, 'see this');
  assert.equal(m.attachments.length, 3);
  assert.deepEqual(m.attachments.map((a) => [a.w, a.h, a.type]), [[640, 480, 'image/png'], [128, 64, 'image/jpeg'], [100, 50, 'image/webp']]);
  const base = resolve(f.home, 'proj', 'attachments', 'job-1');
  for (const a of m.attachments) {
    assert.ok(a.path.startsWith(base.replace(/\\/g, '/') + '/'), `${a.path} is inside the store folder`);
    assert.match(a.path, /\/\d{10,}-\d\.(png|jpg|webp)$/);
    assert.ok(existsSync(a.path));
  }
  assert.ok(!existsSync(join(f.dir, 'attachments')), 'nothing written into the state folder');
  assert.equal(readFileSync(m.attachments[0].path).equals(png(640, 480)), true);
  // the thread API returns them
  const api = JSON.parse((await http(server, 'GET', '/api/threads/job-1')).text);
  assert.equal(api.messages[0].attachments.length, 3);
});

test('images alone are a message; no text and no images is not', async (t) => {
  const f = fixture(t); const server = await serve(t, f);
  assert.equal((await send(server, 'job-1', { from: 'person', text: '', images: [img(png())] })).status, 200);
  assert.equal((await send(server, 'job-1', { from: 'person', images: [img(png())] })).status, 200);
  assert.equal((await send(server, 'job-1', { from: 'person', text: '  ', images: [] })).status, 400);
  assert.equal((await send(server, 'job-1', { from: 'person', text: '   ' })).status, 400);
  assert.equal(readThread('job-1', f.dir).length, 2);
  // two messages in the same millisecond still get different files
  const [a, b] = readThread('job-1', f.dir).map((m) => m.attachments[0].path);
  assert.notEqual(a, b);
});

test('image validation: type, magic bytes, size, count, shape', async (t) => {
  const f = fixture(t); const server = await serve(t, f);
  const bad = async (images, status, why) => {
    const r = await send(server, 'job-1', { from: 'person', text: 'x', images });
    assert.equal(r.status, status, `${why}: ${r.text}`);
  };
  await bad([img(Buffer.from('GIF89a......'), 'image/gif')], 415, 'gif type');
  await bad([img(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')], 415, 'svg type');
  await bad([img(Buffer.from('not an image at all, just text'), 'image/png')], 415, 'text labelled png');
  await bad([img(png(), 'image/jpeg')], 415, 'png bytes labelled jpeg');
  await bad([img(jpeg(), 'image/webp')], 415, 'jpeg bytes labelled webp');
  await bad([{ type: 'image/png', data: '!!!not base64!!!' }], 400, 'bad base64');
  await bad([{ type: 'image/png' }], 400, 'no data');
  await bad('nope', 400, 'images not a list');
  await bad([img(png(1, 1, maxImageBytes - 33 + 1))], 413, 'one byte over 10 MB');
  await bad(Array.from({ length: 7 }, () => img(png())), 413, 'seven images');
  assert.equal(readThread('job-1', f.dir).length, 0, 'a refused message leaves nothing behind');
  assert.ok(!existsSync(join(f.home, 'proj', 'attachments')), 'and no file');
  // exactly at the limits is fine
  const r = await send(server, 'job-1', { from: 'person', text: 'x', images: [img(png(1, 1, maxImageBytes - 33)), ...Array.from({ length: 5 }, () => img(png()))] });
  assert.equal(r.status, 200, r.text);
  assert.equal(readThread('job-1', f.dir)[0].attachments.length, 6);
});

test('the POST keeps its JSON-only, host and origin checks', async (t) => {
  const f = fixture(t); const server = await serve(t, f);
  const body = JSON.stringify({ from: 'person', text: 'x', images: [img(png())] });
  assert.equal((await http(server, 'POST', '/api/threads/job-1', { body, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await http(server, 'POST', '/api/threads/job-1', { body, headers: { ...J, Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await http(server, 'POST', '/api/threads/job-1', { body, headers: { ...J, Host: 'evil.example' } })).status, 403);
  assert.equal((await http(server, 'POST', '/api/threads/nope-1', { body, headers: J })).status, 404);
  assert.equal((await send(server, 'job-1', { from: 'coordinator', text: 'x', images: [img(png())] })).status, 403);
  assert.equal(readThread('job-1', f.dir).length, 0);
});

test('/att serves stored images only, and nothing outside the attachments folder', async (t) => {
  const f = fixture(t); const server = await serve(t, f);
  await send(server, 'job-1', { from: 'person', text: 'x', images: [img(png(5, 5)), img(jpeg(), 'jpeg')] });
  const [pa, ja] = readThread('job-1', f.dir)[0].attachments.map((a) => a.path.split('/').pop());
  const ok = await http(server, 'GET', `/att/job-1/${pa}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'image/png');
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
  assert.ok(ok.buf.equals(png(5, 5)));
  assert.equal((await http(server, 'GET', `/att/job-1/${ja}`)).headers['content-type'], 'image/jpeg');
  writeFileSync(join(f.home, 'proj', 'secret.txt'), 'secret');
  writeFileSync(join(f.home, 'proj', 'attachments', 'job-1', 'notes.txt'), 'x');
  for (const p of [
    '/att/job-1/..%2F..%2Fsecret.txt', '/att/..%2F/secret.txt', '/att/job-1/../../secret.txt', '/att/job-1/notes.txt', '/att/job-1/%2e%2e%2fsecret.txt',
    '/att/job-1/..%5Csecret.txt', '/att/..%5C..%5C/x.png', '/att/job-2/' + pa, '/att/job-1/1234567890-1.png', '/att/job-1/' + pa + '%00.png', '/att/job-1/', '/att//' + pa, '/att/job-1/a/b.png', '/att/%2e%2e/' + pa
  ]) {
    const r = await http(server, 'GET', p);
    assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.text.includes('secret'), p);
  }
  assert.equal((await http(server, 'POST', `/att/job-1/${pa}`, { body: '{}', headers: J })).status, 404);
});

test('store helpers refuse unsafe names and have no store without a root', () => {
  const home = mkdtempSync(join(tmpdir(), 'jig-attach-store-'));
  try {
    assert.equal(attachmentsDir('proj', '../x', { home }), null);
    assert.equal(attachmentsDir('proj', 'a/b', { home }), null);
    assert.equal(attachmentsDir('proj', 'a\\b', { home }), null);
    assert.equal(attachmentPath('proj', 'job-1', '../a.png', { home }), null);
    assert.equal(attachmentPath('proj', 'job-1', '1234567890-1.exe', { home }), null);
    assert.ok(attachmentsDir('proj', 'item-43', { home }).startsWith(join(home, 'proj', 'attachments')));
  } finally { rmSync(home, { recursive: true, force: true }); }
  assert.deepEqual(decodeImages(undefined), []);
});

test('sniffing reads kind and size from the header', () => {
  assert.deepEqual(sniffImage(png(7, 9)), { kind: 'png', w: 7, h: 9 });
  assert.deepEqual(sniffImage(jpeg()), { kind: 'jpeg', w: 128, h: 64 });
  assert.deepEqual(sniffImage(webp()), { kind: 'webp', w: 100, h: 50 });
  assert.equal(sniffImage(Buffer.from('hello world, not an image')), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

test('watch and threads print each image path after the text', async (t) => {
  const f = fixture(t);
  const path = 'store/proj/attachments/item-43/1700000000000-1.png';
  const got = [];
  const stop = watchThreads(f.dir, (id, m) => got.push(`${id} | ${messageLine(m)}`), { interval: 30 });
  t.after(stop);
  appendThread('item-43', 'person', 'look at\nthis', f.dir, new Date(), [{ path, w: 1, h: 1, type: 'image/png' }]);
  appendThread('item-43', 'person', '', f.dir, new Date(), [{ path, w: 1, h: 1, type: 'image/png' }, { path: path.replace('-1.', '-2.'), w: 1, h: 1, type: 'image/png' }]);
  appendThread('item-43', 'person', 'text only', f.dir);
  for (let i = 0; i < 100 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(got, [
    `item-43 | look at this [image: ${path}]`,
    `item-43 | [image: ${path}] [image: ${path.replace('-1.', '-2.')}]`,
    'item-43 | text only'
  ]);
  const cli = spawnSync(process.execPath, ['scripts/review.mjs', 'threads'], { encoding: 'utf8', env: { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home } });
  assert.match(cli.stdout + cli.stderr, new RegExp(`item-43\\t\\S+\\ttext only`));
  appendThread('item-44', 'person', 'with pic', f.dir, new Date(), [{ path, w: 1, h: 1, type: 'image/png' }]);
  assert.match(unreadThreads(f.dir).find((x) => x.id === 'item-44').text, /with pic \[image: store\/proj\/attachments\/item-43\/1700000000000-1\.png\]/);
});

test('an attachment record on a message needs a real image type and path', (t) => {
  const f = fixture(t);
  appendThread('job-1', 'person', 'x', f.dir, new Date(), [{ path: '', type: 'image/png' }, { path: '/a.png', type: 'text/html' }, { path: '/ok.png', w: 2, h: 3, type: 'image/png' }]);
  assert.deepEqual(readThread('job-1', f.dir)[0].attachments, [{ path: '/ok.png', w: 2, h: 3, type: 'image/png' }]);
  assert.throws(() => appendThread('job-1', 'person', '', f.dir), /empty/);
});

test('page markup: thread page and dashboard question cards have paste, drop, attach, thumbnails and the viewer', () => {
  for (const html of [threadPage('item-1'), homePage()]) {
    assert.match(html, /function attKit\(/);
    assert.match(html, /addEventListener\('paste'/);
    assert.match(html, /addEventListener\('drop'/);
    assert.match(html, /image\/png,image\/jpeg,image\/webp|ATT_TYPES = \['image\/png', 'image\/jpeg', 'image\/webp'\]/);
    assert.match(html, /\.thumbx\{/);
    assert.match(html, /remove-attachment|Remove this image/);
    assert.match(html, /id="lb"/, 'the image viewer is on the page');
    assert.match(html, /querySelectorAll\('\.att img'\)/, 'the viewer opens chat images');
    assert.match(html, /attNodes\(/);
    assert.match(html, /images: kit\.payload\(\)|images:kit\.payload\(\)/);
  }
  assert.match(threadPage('item-1'), /id="thumbhost"/);
});
