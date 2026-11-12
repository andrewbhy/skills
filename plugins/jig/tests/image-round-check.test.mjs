import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkImageRound } from '../.agents/skills/jig-mockup/scripts/image-round-check.mjs';

const checker = fileURLToPath(new URL('../.agents/skills/jig-mockup/scripts/image-round-check.mjs', import.meta.url));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-image-round-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  const config = { schemaVersion: 1, gallery: 'gallery-fragment.json', imageDirectory: 'images', allowedInputImages: ['bases/picked.png'], bannedNames: ['Example Brand', 'Example Series', 'A+B'], processWords: ['mockup', 'reviewer', 'stage 0'] };
  const entry = { id: '01-launch', image: 'images/01-launch.png', prompt: 'prompts/01-launch.txt', provenance: 'provenance/01-launch.json', note: 'Picked base; recessed feed only; header scale differs.' };
  const provenance = { input_images: [{ path: 'bases/picked.png' }], attempts: [{ prompt: entry.prompt, input_images: ['bases/picked.png'] }] };
  put('bases/picked.png', png);
  put(entry.image, png);
  put(entry.prompt, 'One quiet invitation. Preserve the selected composition.');
  put(entry.provenance, provenance);
  put('image-round.json', config);
  put('gallery-fragment.json', { entries: [entry] });
  return { root, put, config, entry, provenance, check: () => checkImageRound(root) };
}
const kinds = report => report.findings.map(item => item.kind);

test('[risk: complete rounds rejected or read-only checks modify records] good edit and explore records pass', t => {
  const f = fixture(t);
  const before = readFileSync(join(f.root, 'gallery-fragment.json'), 'utf8');
  assert.deepEqual(f.check(), { status: 'passed', images: 1, findings: [] });
  assert.equal(readFileSync(join(f.root, 'gallery-fragment.json'), 'utf8'), before);
  f.put(f.entry.provenance, { input_images: [] });
  f.put('image-round.json', { ...f.config, allowedInputImages: [] });
  assert.equal(f.check().status, 'passed');
  f.put('gallery-fragment.json', { images: [{ ...f.entry, note: undefined, notes: 'Original exploration; no base; no known defects.' }] });
  assert.equal(f.check().status, 'passed');
});

test('[risk: a missing provenance record silently passes] removal fails and restoration passes', t => {
  const f = fixture(t);
  rmSync(join(f.root, f.entry.provenance));
  assert.ok(kinds(f.check()).includes('provenance'));
  f.put(f.entry.provenance, f.provenance);
  assert.equal(f.check().status, 'passed');
});

test('[risk: unapproved references enter selected or discarded attempts] all input lists are checked', t => {
  const f = fixture(t);
  f.put('bases/other.png', png);
  for (const provenance of [
    { input_images: ['bases/other.png'] },
    { ...f.provenance, attempts: [{ prompt: f.entry.prompt, input_images: [{ path: 'bases/other.png' }] }] }
  ]) {
    f.put(f.entry.provenance, provenance);
    assert.ok(kinds(f.check()).includes('disallowed-input'));
  }
  f.put(f.entry.provenance, { input_images: [join(f.root, 'bases/picked.png')] });
  assert.equal(f.check().status, 'passed');
});

test('[risk: brand, series or process names leak through prompts] configured whole terms checked in every attempt', t => {
  const f = fixture(t);
  for (const [word, kind] of [['EXAMPLE BRAND', 'banned-name'], ['Example Series', 'banned-name'], ['A+B', 'banned-name'], ['reviewer', 'process-word'], ['stage 0', 'process-word']]) {
    f.put(f.entry.prompt, `Do not use ${word}.`);
    assert.ok(kinds(f.check()).includes(kind), word);
  }
  f.put(f.entry.prompt, 'A quiet invitation; previewers are outside the composition.');
  assert.equal(f.check().status, 'passed');
  f.put('prompts/redo.txt', 'A mockup.');
  f.put(f.entry.provenance, { ...f.provenance, attempts: [{ prompt: 'prompts/redo.txt', input_images: [] }] });
  assert.ok(kinds(f.check()).includes('process-word'));
});

test('[risk: gallery hides generated outputs including nested redos] inventory and gallery must agree', t => {
  const f = fixture(t);
  f.put('images/attempts/redo.PNG', png);
  assert.ok(kinds(f.check()).includes('gallery-missing'));
  f.put('gallery-fragment.json', { entries: [f.entry, { ...f.entry, id: 'redo', image: 'images/attempts/redo.PNG', note: 'Failed redo, withheld.' }] });
  assert.equal(f.check().status, 'passed');
  f.put('gallery-fragment.json', { entries: [f.entry, f.entry] });
  assert.ok(kinds(f.check()).includes('gallery-duplicate'));
  assert.ok(kinds(f.check()).includes('gallery-id'));
});

test('[risk: missing or empty prompts and notes masquerade as complete delivery] per-image records required', t => {
  const f = fixture(t);
  for (const note of ['', 'notes.md', null, 42]) {
    f.put('gallery-fragment.json', { entries: [{ ...f.entry, note }] });
    assert.ok(kinds(f.check()).includes('note'));
  }
  f.put('gallery-fragment.json', { entries: [f.entry] });
  f.put(f.entry.prompt, '  ');
  assert.ok(kinds(f.check()).includes('prompt'));
  rmSync(join(f.root, f.entry.prompt));
  assert.ok(kinds(f.check()).includes('prompt'));
});

test('[risk: malformed evidence crashes checker or earns a pass] explicit schema failures', t => {
  const f = fixture(t);
  for (const bad of [null, [], '{invalid']) {
    f.put(f.entry.provenance, bad);
    assert.ok(kinds(f.check()).includes('provenance'));
  }
  for (const bad of [{}, { input_images: 'bases/picked.png' }, { input_images: [null] }, { input_images: [], attempts: [null] }, { input_images: [], attempts: [] }]) {
    f.put(f.entry.provenance, bad);
    assert.equal(f.check().status, 'failed');
  }
  f.put(f.entry.provenance, f.provenance);
  for (const config of [{ ...f.config, bannedNames: undefined }, { ...f.config, processWords: 'mockup' }, { ...f.config, allowedInputImages: [null] }, { ...f.config, schemaVersion: 2 }]) {
    f.put('image-round.json', config);
    assert.ok(kinds(f.check()).includes('config'));
  }
  f.put('image-round.json', f.config);
  f.put('gallery-fragment.json', { entries: [null] });
  assert.ok(kinds(f.check()).includes('gallery-entry'));
  f.put('gallery-fragment.json', []);
  assert.ok(kinds(f.check()).includes('gallery'));
});

test('[risk: escaped records, absent round or empty inventory accepted] containment and missing inputs fail safely', t => {
  const f = fixture(t);
  f.put('gallery-fragment.json', { entries: [{ ...f.entry, prompt: '../outside.txt' }] });
  assert.ok(kinds(f.check()).includes('prompt'));
  f.put('gallery-fragment.json', { entries: [{ ...f.entry, image: 'bases/picked.png' }] });
  assert.ok(kinds(f.check()).includes('gallery-image'));
  assert.equal(checkImageRound(join(f.root, 'absent')).status, 'failed');
  rmSync(join(f.root, f.entry.image));
  assert.ok(kinds(f.check()).includes('inventory'));
  rmSync(join(f.root, 'image-round.json'));
  assert.ok(kinds(f.check()).includes('config'));
});

test('[risk: CLI consumers cannot distinguish success, findings and usage] actual command exit contract', t => {
  const f = fixture(t);
  const run = args => spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8' });
  let result = run([f.root]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
  rmSync(join(f.root, f.entry.provenance));
  result = run([f.root]);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(kinds(JSON.parse(result.stdout)).includes('provenance'));
  assert.equal(run([]).status, 2);
  assert.equal(run([f.root, 'extra']).status, 2);
});

test('[risk: symlinks escape record containment or loop the image inventory] canonical paths stay bounded', t => {
  const f = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'jig-image-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'prompt.txt'), 'Original quiet composition.');
  try {
    symlinkSync(outside, join(f.root, 'external'), 'junction');
    symlinkSync(join(f.root, 'images'), join(f.root, 'images/loop'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip(`Symlink creation unavailable (${error.code})`); return; }
    throw error;
  }
  f.put('gallery-fragment.json', { entries: [{ ...f.entry, prompt: 'external/prompt.txt' }] });
  const report = f.check();
  assert.ok(report.findings.some(item => item.kind === 'prompt' && item.message.includes('escapes')));
  assert.ok(kinds(report).includes('inventory'));
});

test('[risk: allowlist entries escape the round folder] absolute and parent paths are rejected', t => {
  const f = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'jig-image-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'x.png'), png);
  f.put('image-round.json', { ...f.config, allowedInputImages: ['bases/picked.png', '../' + basename(outside) + '/x.png'] });
  assert.ok(f.check().findings.some(item => item.kind === 'allowed-input' && item.message.includes('escapes')));
  f.put('image-round.json', { ...f.config, allowedInputImages: ['bases/picked.png', join(outside, 'x.png')] });
  assert.ok(f.check().findings.some(item => item.kind === 'allowed-input' && item.message.includes('relative')));
});

test('[risk: CLI run through a linked path exits 0 silently] entry guard resolves real paths', t => {
  const f = fixture(t);
  const holder = mkdtempSync(join(tmpdir(), 'jig-image-link-'));
  t.after(() => rmSync(holder, { recursive: true, force: true }));
  const link = join(holder, 'scripts-link');
  try { symlinkSync(dirname(checker), link, 'junction'); }
  catch (error) { t.skip(`Link creation unavailable (${error.code})`); return; }
  rmSync(join(f.root, f.entry.provenance));
  const result = spawnSync(process.execPath, [join(link, 'image-round-check.mjs'), f.root], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(kinds(JSON.parse(result.stdout)).includes('provenance'));
});
