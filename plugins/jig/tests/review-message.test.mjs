import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { parseMessage, messageArtifacts, fillMessage } from '../scripts/review-message.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { appendThread } from '../scripts/review-core.mjs';
import { lightboxScriptFor } from '../scripts/review-lightbox.mjs';

const origin = 'http://127.0.0.1:7788';
const tokens = text => parseMessage(text, origin).flatMap(b => b.items.flat());
const links = text => tokens(text).filter(t => t.t === 'link');

test('[risk: lost or duplicated artifacts] prose, formats, balanced parentheses, punctuation and duplicates', () => {
  const text = 'See http://127.0.0.1:7788/f/r/walk.gif, then /f/r/front.png.\n/f/r/photo.jpg /f/r/notes.md /f/r/view.html /f/r/data.json /f/r/folder/\n(/f/r/a(2).png). /f/r/front.png';
  const blocks = parseMessage(text, origin), artifacts = messageArtifacts(blocks);
  assert.equal(artifacts.length, 8);
  assert.deepEqual(artifacts.filter(t => t.image).map(t => t.label), ['walk.gif', 'front.png', 'photo.jpg', 'a(2).png']);
  assert.equal(blocks.flatMap(b => b.items.flat()).map(t => t.v).join('\n').includes('walk.gif'), true);
  assert.equal(links('/f/r/a.png).')[0].href, '/f/r/a.png');
  assert.equal(links('/f/r/a.png?version=2#view')[0].image, true);
  assert.equal(links('https://example.org/f/r/a.png')[0].image, false);
});

test('[risk: private or unsafe paths linked] private segments, encoding and traversal remain text', () => {
  for (const text of ['/f/r/private/a.png', '/f/r/PrIvAtE/a.md', '/f/r/%70rivate/a.png', '/f/r/..%2fsecret.png', '/f/r/%zz.png', 'D:' + '/runs/private/a.png']) {
    assert.equal(links(text).length, 0, text);
    assert.equal(tokens(text).map(t => t.v).join(''), text);
  }
  assert.equal(links('/f/r/privateer/a.png').length, 1);
});

test('[risk: Windows paths never resolve] allowlisted drive paths use the resolver, outside paths stay text', () => {
  const known = 'D:' + '/runs/front.png', outside = ['D:', 'other', 'back.png'].join(String.fromCharCode(92));
  const blocks = parseMessage(`${known}, ${outside}`, origin, path => path === known ? '/f/r/front.png' : null);
  assert.equal(messageArtifacts(blocks).length, 1);
  assert.equal(messageArtifacts(blocks)[0].href, '/f/r/front.png');
  assert.equal(blocks[0].items[0].at(-1).v, `, ${outside}`);
});

// A DOM seam exercises the shipped renderer without starting a browser.
class Node {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.events = {}; }
  append(...nodes) { this.childNodes.push(...nodes); }
  addEventListener(name, f) { this.events[name] = f; }
}
const descendants = node => [node, ...node.childNodes.flatMap(n => typeof n === 'string' ? [] : descendants(n))];
test('[risk: renderer only links text] thumbnails are lazy raw images; compact previews have no images', () => {
  const render = runInNewContext(`(${fillMessage.toString()})`, {
    document: { createElement: tag => new Node(tag), createTextNode: text => text },
    location: { origin }, URL, parseMessage, messageArtifacts
  });
  const message = { text: '/f/r/a.gif /f/r/b.png /f/r/a.gif /f/r/notes.md' };
  const full = new Node('div'); render(full, message);
  const images = descendants(full).filter(n => n.tag === 'img');
  assert.equal(images.length, 2);
  assert.equal(images[0].src, '/f/r/a.gif?raw=1');
  assert.equal(images[0].loading, 'lazy');
  assert.equal(images[0].alt, 'a.gif');
  assert.equal(descendants(full).find(n => n.tag === 'a').title, '/f/r/a.gif');
  const compact = new Node('div'); render(compact, message, true);
  assert.equal(descendants(compact).some(n => n.tag === 'img'), false);
  assert.equal(descendants(compact).find(n => n.tag === 'small').textContent, ' · 3 artifacts');
});

test('[risk: image navigation crosses messages or drops lazy images] existing lightbox cycles within the clicked message', () => {
  const nodes = new Map(), events = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, naturalWidth: 100, naturalHeight: 100, complete: true, style: {},
      addEventListener: (name, f) => { events[id + ':' + name] = f; }, removeAttribute() {} });
    return nodes.get(id);
  };
  const first = { src: '/f/r/one.png?raw=1', tagName: 'IMG', naturalWidth: 100, complete: true, matches: () => true };
  const lazy = { src: '/f/r/two.gif?raw=1', naturalWidth: 0, complete: false };
  first.closest = () => ({ querySelectorAll: () => [first, lazy] });
  node('lb').querySelector = () => node('big');
  runInNewContext(lightboxScriptFor('.att img'), {
    document: { getElementById: node, querySelectorAll: () => [], addEventListener: (name, f) => { events[name] = f; } },
    window: { innerWidth: 1000, innerHeight: 800, addEventListener() {} }
  });
  events.click({ target: first, preventDefault() {} });
  assert.equal(node('lb').hidden, false);
  assert.equal(node('big').src, first.src);
  events['lbnext:click'](); assert.equal(node('big').src, lazy.src);
  events['lbprev:click'](); assert.equal(node('big').src, first.src);
  events.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(node('lb').hidden, true);
  events.click({ target: { tagName: 'A', querySelector: () => first }, preventDefault() {} });
  assert.equal(node('lb').hidden, false);
});

function get(server, path) {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: server.address().port, path }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', s => text += s);
      res.on('end', () => resolve({ status: res.statusCode, text }));
    }).on('error', reject).end();
  });
}
test('[risk: API path resolution disconnected] thread and home use configured roots and viewers', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'message-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root'), dir = join(tmp, 'state'); mkdirSync(root); mkdirSync(dir);
  for (const name of ['front.png', 'notes.md', 'page.html', 'data.json']) writeFileSync(join(root, name), name.endsWith('.md') ? '# Notes' : '{}');
  mkdirSync(join(root, 'folder')); writeFileSync(join(root, 'folder', 'readme.md'), '# Folder');
  writeFileSync(join(tmp, 'outside.png'), 'outside');
  const local = join(root, 'front.png'), outside = join(tmp, 'outside.png');
  appendThread('job-1', 'coordinator', `${local} /f/r/front.png /f/r/notes.md /f/r/page.html /f/r/data.json /f/r/folder/ ${outside}`, dir);
  const server = createReviewServer({ roots: [{ prefix: 'r', path: root }], dir, home: join(tmp, 'home') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const thread = JSON.parse((await get(server, '/api/threads/job-1')).text);
  const artifacts = messageArtifacts(thread.messages[0].blocks);
  assert.equal(artifacts.length, 5);
  assert.equal(artifacts[0].href, '/f/r/front.png');
  assert.equal(thread.messages[0].blocks.flatMap(b => b.items.flat()).some(t => t.v.includes(outside) && t.t === 'text'), true);
  const state = JSON.parse((await get(server, '/api/state')).text);
  assert.equal(state.discussions[0].artifactCount, 5);
  assert.match(state.discussions[0].preview, /^front.png/);
  assert.match((await get(server, '/f/r/notes.md')).text, /<h1[^>]*>Notes/);
  assert.equal((await get(server, '/f/r/page.html')).status, 200);
  assert.equal((await get(server, '/f/r/data.json')).status, 200);
  assert.match((await get(server, '/f/r/folder/')).text, /href="\/f\/r\/folder\/readme.md"/);
  assert.equal((await get(server, '/f/r/PRIVATE/no.png')).status, 403);
  assert.equal((await get(server, '/f/unknown/front.png')).status, 403);
});
