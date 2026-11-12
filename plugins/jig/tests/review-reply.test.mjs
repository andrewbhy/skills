import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { runInNewContext } from 'node:vm';
import { appendThread, messageLine, parseThreadText, readThread, threadFile, unreadThreads } from '../scripts/review-core.mjs';
import { messageClient, parseMessage, replyReference } from '../scripts/review-message.mjs';
import { threadPage } from '../scripts/review-thread-page.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { run } from '../scripts/review.mjs';

const at = '2026-11-12T10:00:00.000Z';
const original = { at, from: 'person', text: 'Which\nmessage? ' + 'x'.repeat(150) };
const reference = replyReference(original);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-reply-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'state'); mkdirSync(dir);
  writeFileSync(join(dir, 'review-roots.json'), JSON.stringify({ roots: [{ prefix: 'r', path: root }] }));
  return { root, dir };
}

test('[risk: reply metadata lost in JSONL] round trip, old records, unknown and malformed fields', t => {
  const { dir } = fixture(t);
  appendThread('job-1', 'person', 'reply', dir, new Date(at), [], reference);
  appendThread('job-1', 'coordinator', 'old-style', dir);
  assert.deepEqual(readThread('job-1', dir)[0].replyTo, reference);
  assert.equal('replyTo' in readThread('job-1', dir)[1], false);
  const unknown = { ...original, futureField: 'ignored', replyTo: { ...reference, future: 1 } };
  assert.deepEqual(parseThreadText(JSON.stringify(unknown) + '\n')[0].replyTo, reference);
  for (const replyTo of [null, [], 'bad', { ...reference, at: 3 }, { ...reference, from: 'robot' }]) {
    assert.equal(parseThreadText(JSON.stringify({ ...original, replyTo }) + '\n')[0].replyTo, undefined);
    assert.throws(() => appendThread('job-1', 'person', 'bad', dir, new Date(), [], replyTo), /Invalid reply/);
  }
  appendFileSync(threadFile('job-1', dir), '{"half":');
  assert.equal(readThread('job-1', dir).length, 2);
});

test('[risk: attachment-only quotes blank or leak paths] excerpt is bounded, plain text or image', () => {
  assert.equal(reference.excerpt.length, 120);
  assert.equal(reference.excerpt.includes('\n'), false);
  assert.equal(replyReference({ ...original, text: '  ', attachments: [{ path: '/synthetic/image.png' }] }).excerpt, 'image');
  assert.equal(replyReference({ ...original, text: '<script>text</script>', attachments: [{}] }).excerpt, '<script>text</script>');
});

test('[risk: coordinator misses context] watch CLI and all CLI read paths include references', async t => {
  const { root, dir } = fixture(t);
  const previous = { JIG_REVIEW_DIR: process.env.JIG_REVIEW_DIR, JIG_HOME: process.env.JIG_HOME, JIG_PROJECT_ROOT: process.env.JIG_PROJECT_ROOT };
  Object.assign(process.env, { JIG_REVIEW_DIR: dir, JIG_HOME: join(root, 'home'), JIG_PROJECT_ROOT: root });
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  appendThread('job-1', 'person', original.text, dir, new Date(at));
  const lines = [], out = line => lines.push(line);
  const reply = run(['reply', 'job-1', 'answer', '--to', at], { out });
  assert.deepEqual(reply.replyTo, reference);
  assert.equal(reply.text, 'answer');
  assert.throws(() => run(['reply', 'job-1', 'answer', '--to', 'missing'], { out }), /No person message/);
  assert.throws(() => run(['reply', 'job-1', 'answer', '--to', reply.at], { out }), /No person message/);
  assert.throws(() => run(['reply', 'job-1', 'answer', '--to'], { out }), /needs a value/);
  const image = appendThread('job-1', 'person', '', dir, new Date('2026-11-12T10:01:00Z'), [{ path: join(root, 'image.png'), type: 'image/png' }]);
  assert.equal(run(['reply', 'job-1', 'image answer', '--to', image.at], { out }).replyTo.excerpt, 'image');
  lines.length = 0;
  run(['thread', 'job-1'], { out });
  assert.ok(lines.some(line => line.endsWith('re: ' + JSON.stringify(reference.excerpt) + ' | answer')));
  lines.length = 0;
  const stop = run(['watch'], { out }); t.after(stop);
  appendThread('job-1', 'person', 'follow\nup', dir, new Date('2026-11-12T10:02:00Z'), [], reference);
  const expected = `job-1 | re: ${JSON.stringify(reference.excerpt)} | follow up`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('watch timed out')); }, 3000);
    const timer = setInterval(() => { if (lines.length) { clearTimeout(timeout); clearInterval(timer); resolve(); } }, 20);
  });
  stop(); assert.deepEqual(lines, [expected]);
  assert.equal(unreadThreads(dir)[0].text, expected.slice('job-1 | '.length));
  lines.length = 0; run(['threads'], { out }); assert.ok(lines[0].endsWith(unreadThreads(dir)[0].text));
  assert.equal(messageLine({ text: 'old\nmessage' }), 'old message');
});

function http(server, method, payload) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: '/api/threads/job-1', method, headers: { 'Content-Type': 'application/json' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
}

test('[risk: forged or cross-thread references] POST derives quote before writing and GET retains it', async t => {
  const { root, dir } = fixture(t);
  appendThread('job-1', 'coordinator', original.text, dir, new Date(at));
  appendThread('job-2', 'person', 'elsewhere', dir, new Date('2026-11-12T09:00:00Z'));
  const server = createReviewServer({ roots: [], dir, home: join(root, 'home') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const sent = await http(server, 'POST', { from: 'person', text: 'reply', replyTo: { at, from: 'person', excerpt: 'forged' } });
  assert.equal(sent.status, 200);
  const got = await http(server, 'GET');
  assert.deepEqual(got.body.messages[1].replyTo, { ...reference, from: 'coordinator' });
  for (const replyTo of [null, {}, { at: 7 }, { at: 'missing' }, { at: '2026-11-12T09:00:00.000Z' }]) {
    assert.equal((await http(server, 'POST', { from: 'person', text: 'bad', replyTo })).status, 400);
  }
  assert.equal(readThread('job-1', dir).length, 2);
  writeFileSync(threadFile('job-1', dir), JSON.stringify(readThread('job-1', dir)[1]) + '\n');
  assert.deepEqual((await http(server, 'GET')).body.messages[0].replyTo, { ...reference, from: 'coordinator' });
  const image = appendThread('job-1', 'person', '', dir, new Date('2026-11-12T10:01:00Z'), [{ path: join(root, 'image.png'), type: 'image/png' }]);
  assert.equal((await http(server, 'POST', { from: 'person', text: 'about the image', replyTo: { at: image.at } })).status, 200);
  assert.deepEqual(readThread('job-1', dir).at(-1).replyTo, { at: image.at, from: 'person', excerpt: 'image' });
});

class Node {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.events = {}; }
  append(...nodes) { this.childNodes.push(...nodes); }
  addEventListener(name, fn) { this.events[name] = fn; }
}

test('[risk: missing target breaks render or quote becomes HTML] shared renderer uses text and optional navigation', () => {
  const timers = [];
  const context = { document: { createElement: tag => new Node(tag), createTextNode: text => text }, location: { origin: 'http://localhost' }, URL, parseMessage, setTimeout: fn => timers.push(fn) };
  const render = runInNewContext(messageClient + '\nfillMessage', context);
  const parent = new Node('div');
  const replyTo = { ...reference, excerpt: '<img onerror=bad>' };
  render(parent, { text: 'answer', replyTo }, false, null, () => null);
  assert.equal(parent.childNodes[0].tag, 'div');
  assert.equal(parent.childNodes[0].textContent, replyTo.excerpt);
  assert.deepEqual(parent.childNodes[0].events, {});
  const events = [];
  const target = { scrollIntoView: opts => events.push(opts.block), focus: () => events.push('focus'), classList: { add: name => events.push(name), remove: name => events.push('remove ' + name) } };
  const linked = new Node('div');
  render(linked, { text: 'answer', replyTo }, false, null, () => target);
  assert.equal(linked.childNodes[0].tag, 'button');
  assert.equal(linked.childNodes[0].textContent, 'person: <img onerror=bad>');
  linked.childNodes[0].events.click();
  assert.deepEqual(events, ['center', 'focus', 'reply-highlight']);
  timers[0](); assert.equal(events.at(-1), 'remove reply-highlight');
});

test('[risk: embedded script syntax breaks page] every generated script compiles', () => {
  for (const match of threadPage('job-1').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(match[1]));
  }
});

test('[risk: reply controls lose draft or send wrong reference] replay selection, R, Escape, cancel, retry and success', async () => {
  const page = threadPage('job-1');
  class Element extends Node {
    dataset = {}; value = ''; hidden = false; style = {}; textContent = ''; disabled = false;
    classList = { contains: () => false, add() {}, remove() {} };
    setAttribute() {}
    focus() { document.activeElement = this; }
  }
  const ids = Object.fromEntries(['replychip', 'replylabel', 'cancelreply', 'box', 'state', 'send', 'scroll'].map(id => [id, new Element('div')]));
  ids.box.value = 'draft';
  const document = { activeElement: ids.box, events: {}, createElement: tag => new Element(tag), addEventListener(name, fn) { this.events[name] = fn; } };
  const requests = [], kit = { payload: () => ['image-data'], clear() { kit.cleared = true; } };
  let succeed = false, wentBack = false;
  const context = { document, $: id => ids[id], replyReference, clock: value => value, kit, pics: [], id: 'job-1', grow() {}, load: async () => {}, goBack: () => wentBack = true,
    fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: succeed, json: async () => ({ error: 'offline' }) }; } };
  const selection = page.slice(page.indexOf('let replyTo=null;'), page.indexOf('let artCatalog='));
  const escape = page.slice(page.indexOf("document.addEventListener('keydown',e=>{"), page.indexOf("$('done').addEventListener"));
  const sending = page.slice(page.indexOf('async function send(){'), page.indexOf('const pics=[];'));
  const actions = page.slice(page.indexOf("    e.dataset.at=m.at;"), page.indexOf("    const by=document.createElement('span');", page.indexOf("    e.dataset.at=m.at;")));
  const controller = runInNewContext(`let busy=false;${selection}${escape}${sending}
    function bubble(m){const e=document.createElement('div');${actions}return e}
    ({setReply,send,bubble,getReply:()=>replyTo});`, context);
  const bubble = controller.bubble(original);
  assert.equal(bubble.childNodes[0].textContent, 'Reply');
  bubble.childNodes[0].events.click();
  assert.equal(ids.replychip.hidden, false);
  assert.ok(ids.replylabel.textContent.includes(reference.excerpt));
  assert.ok(ids.replylabel.textContent.includes(at));
  assert.equal(document.activeElement, ids.box);
  const escapeKey = { key: 'Escape', preventDefault() { this.defaultPrevented = true; } };
  document.events.keydown(escapeKey);
  assert.equal(controller.getReply(), null); assert.equal(ids.box.value, 'draft'); assert.equal(wentBack, false);
  bubble.events.keydown({ target: bubble, key: 'r', preventDefault() {} });
  assert.equal(controller.getReply().at, at);
  ids.cancelreply.events.click(); assert.equal(ids.replychip.hidden, true);
  bubble.childNodes[0].events.click();
  await controller.send();
  assert.equal(ids.box.value, 'draft'); assert.equal(controller.getReply().at, at);
  assert.equal(ids.state.textContent, 'Not sent: offline');
  assert.equal(requests[0].replyTo.excerpt, reference.excerpt);
  assert.deepEqual(requests[0].images, ['image-data']);
  succeed = true; await controller.send();
  assert.equal(ids.box.value, ''); assert.equal(controller.getReply(), null); assert.equal(kit.cleared, true);
});
