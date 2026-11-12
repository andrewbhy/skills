import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactHref, threadArtifacts, selectThreadArtifact } from '../scripts/review-thread-artifacts.mjs';
import { addItem, appendThread } from '../scripts/review-core.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { threadPage } from '../scripts/review-thread-page.mjs';
import { writeAttachment } from '../scripts/jig-store.mjs';
import { runInNewContext } from 'node:vm';

const options = { origin: 'http://localhost:7788', validateFile: href => href.startsWith('/f/r/'), attachmentUrl: a => a.href };
const catalog = messages => threadArtifacts({ link: '/f/r/original.md', messages }, options);

test('[risk: stale original] extracts links and attachments, pins original, deduplicates newest first', () => {
  const result = catalog([
    { text: 'http://127.0.0.1:7788/f/r/old.png /f/r/original.md' },
    { text: '/f/r/new.png /f/r/old.png /f/r/details.html' },
    { text: '', attachments: [{ href: '/att/item-1/1730000000000-1.png' }] }
  ]);
  assert.deepEqual(result.items.map(a => a.href), ['/f/r/original.md', '/att/item-1/1730000000000-1.png', '/f/r/details.html', '/f/r/old.png', '/f/r/new.png']);
  assert.equal(result.items[0].original, true);
  assert.equal(selectThreadArtifact(result).href, '/att/item-1/1730000000000-1.png');
});

test('[risk: refresh steals selection] pick pauses following; toggle resumes immediately', () => {
  const first = catalog([{ text: '/f/r/old.png' }]);
  let state = selectThreadArtifact(first);
  assert.deepEqual(state, { follow: true, href: '/f/r/old.png' });
  state = selectThreadArtifact(first, state, { type: 'pick', href: '/f/r/original.md' });
  const newer = catalog([{ text: '/f/r/old.png' }, { text: '/f/r/new.png /f/r/notes.md' }]);
  assert.deepEqual(selectThreadArtifact(newer, state), { follow: false, href: '/f/r/original.md' });
  state = selectThreadArtifact(newer, state, { type: 'follow', on: true });
  assert.deepEqual(state, { follow: true, href: '/f/r/new.png' });
  state = selectThreadArtifact(newer, state, { type: 'follow', on: false });
  assert.deepEqual(selectThreadArtifact(catalog([{ text: '/f/r/third.png' }, { text: '/f/r/new.png' }]), state), state);
});

test('[risk: empty/nonimage threads] original fallback, absent original, HTML pick and removed selection', () => {
  assert.equal(selectThreadArtifact(catalog([])).href, '/f/r/original.md');
  const empty = threadArtifacts({ messages: [] }, options);
  assert.deepEqual(selectThreadArtifact(empty), { follow: true, href: null });
  assert.equal(threadArtifacts({ messages: [{ text: '/f/r/only.md' }] }, options).latest, '/f/r/only.md');
  const result = threadArtifacts({ messages: [{ text: '/f/r/image.webp /f/r/page.html' }] }, options);
  assert.equal(result.latest, '/f/r/image.webp');
  const picked = selectThreadArtifact(result, undefined, { type: 'pick', href: '/f/r/page.html' });
  assert.deepEqual(picked, { follow: false, href: '/f/r/page.html' });
  assert.deepEqual(selectThreadArtifact(empty, picked), { follow: false, href: null });
});

test('[risk: forbidden navigation] rejects external, private, traversal and malformed candidates', () => {
  for (const value of ['https://example.com/f/r/x.png', '//host/f/r/x.png', '/f/r/private/a.png', '/f/r/%50rivate/a.png', '/f/r/../a.png', '/f/r/%2e%2e/a.png', '/f/r/a%2fb.png', '/f/r/a%5cb.png', '/f/r/%00.png', '/f/r/%xx.png', '/att/private/1730000000000-1.png']) assert.equal(artifactHref(value), null, value);
  assert.deepEqual(catalog([{ text: '/f/unknown/a.png /f/r/private/a.png https://example.com/a.png' }]).items.map(a => a.href), ['/f/r/original.md']);
  assert.equal(artifactHref('/f/r/a%20b.png?raw=1#x'), '/f/r/a%20b.png');
});

test('[risk: server integration] thread API validates roots and combines coordinator images with stored attachments', async t => {
  const base = mkdtempSync(join(tmpdir(), 'jig-artifacts-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'root'), dir = join(base, 'state'), home = join(base, 'home');
  for (const path of [root, dir, home]) mkdirSync(path);
  for (const name of ['original.md', 'new.png', 'page.html']) writeFileSync(join(root, name), 'fixture');
  const roots = [{ prefix: 'r', path: root }];
  addItem(roots, { path: join(root, 'original.md'), title: 'Fixture' }, dir);
  appendThread('item-1', 'coordinator', '/f/r/new.png /f/r/page.html /f/unknown/outside.png /f/r/private/no.png', dir);
  const path = writeAttachment('fixture', 'item-1', '1730000000000-1.png', Buffer.from('fixture'), { home });
  appendThread('item-1', 'person', 'newer attachment', dir, new Date(), [{ path, type: 'image/png', w: 1, h: 1 }]);
  const server = createReviewServer({ roots, dir, home, project: 'fixture' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/threads/item-1`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.artifacts.items.map(a => a.href), ['/f/r/original.md', '/att/item-1/1730000000000-1.png', '/f/r/page.html', '/f/r/new.png']);
  assert.equal(data.artifacts.latest, '/att/item-1/1730000000000-1.png');
});

test('[risk: embedded JavaScript breaks] emitted page scripts compile', () => {
  for (const match of threadPage('item-1').matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(match[1]));
});

test('[risk: panel controls are unwired] replay actual controller through pick, poll, resume and HTML', () => {
  class Element {
    children = []; dataset = {}; attributes = {}; listeners = {}; hidden = false;
    classList = { toggle() {} };
    constructor(tag) { this.tagName = tag; }
    set textContent(value) { this.children = []; this.text = value; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(event, handler) { this.listeners[event] = handler; }
  }
  const ids = Object.fromEntries(['artview', 'link', 'tog', 'main', 'followlatest', 'artstatus', 'artstrip'].map(id => [id, new Element('div')]));
  const page = threadPage('item-1');
  const setArt = page.slice(page.indexOf('function setArt('), page.indexOf('(function(){const v=parseFloat'));
  const controls = page.slice(page.indexOf('function showInPane('), page.indexOf('function goBack('));
  const context = {
    document: { createElement: tag => new Element(tag) },
    localStorage: { getItem: () => null, setItem() {} },
    $: id => ids[id], catalog: catalog([{ text: '/f/r/old.png /f/r/details.html' }]),
    newer: catalog([{ text: '/f/r/old.png /f/r/details.html' }, { text: '/f/r/new.png' }]),
    assert
  };
  runInNewContext(`
    ${artifactHref.toString()}
    ${selectThreadArtifact.toString()}
    const hideKey='hide';let artSrc=null,paneSrc=null;
    let artCatalog={items:[],latest:null},artSelection={follow:true,href:null};
    ${setArt}
    ${controls}
    renderArtifacts(catalog);
    assert.equal($('artview').children[0].src,'/f/r/old.png?raw=1');
    $('artstrip').children[0].listeners.click();
    assert.equal($('followlatest').checked,false);
    assert.equal($('artview').children[0].src,'/f/r/original.md?embed=1');
    renderArtifacts(newer);
    assert.equal($('artview').children[0].src,'/f/r/original.md?embed=1');
    $('followlatest').checked=true;$('followlatest').listeners.change();
    assert.equal($('artview').children[0].src,'/f/r/new.png?raw=1');
    assert.equal($('link').href,'/f/r/new.png');
    showInPane('/f/r/details.html');
    assert.equal($('artview').children[0].src,'/f/r/details.html?embed=1');
    assert.equal($('followlatest').checked,false);
  `, context);
});
