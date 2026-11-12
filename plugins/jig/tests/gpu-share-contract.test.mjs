// Contract test for gpu-share.mjs. It uses only Node built-ins, so a vendored copy can run it too.
// To vendor: copy scripts/gpu-share/gpu-share.mjs into your project unchanged (keep CONTRACT_VERSION), copy this file,
// and run it with GPU_SHARE_MODULE=<path to your copy of gpu-share.mjs> node --test <this file>.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = resolve(process.env.GPU_SHARE_MODULE || join(import.meta.dirname, '..', 'scripts', 'gpu-share', 'gpu-share.mjs'));
const gs = await import(pathToFileURL(modulePath).href);
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'gpu-share-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const cli = (dir, ...args) => new Promise((ok) => execFile(process.execPath, [modulePath, ...args], { env: { ...process.env, GPU_SHARE_DIR: dir, GPU_SHARE_COMFY_URL: 'http://127.0.0.1:9', GPU_SHARE_SMI: 'no-such-smi' }, encoding: 'utf8' }, (err, stdout, stderr) => ok({ code: err ? err.code : 0, stdout, stderr })));

test('contract version and lease file location per platform', () => {
  assert.equal(gs.CONTRACT_VERSION, 1);
  const home = join('x', 'home');
  assert.equal(gs.leaseDir({ GPU_SHARE_DIR: 'D' }, 'win32', home), 'D');
  assert.equal(gs.leaseDir({ LOCALAPPDATA: join('L') }, 'win32', home), join('L', 'gpu-share'));
  assert.equal(gs.leaseDir({}, 'darwin', home), join(home, 'Library', 'Application Support', 'gpu-share'));
  assert.equal(gs.leaseDir({ XDG_STATE_HOME: 'S' }, 'linux', home), join('S', 'gpu-share'));
  assert.equal(gs.leaseDir({}, 'linux', home), join(home, '.local', 'state', 'gpu-share'));
  assert.equal(gs.leasePath('D'), join('D', 'lease.json'));
});

test('lease file has exactly the contract fields', (t) => {
  const dir = tmp(t);
  gs.takeLease('agent-a', 'bake', 15, { dir });
  const raw = JSON.parse(readFileSync(join(dir, 'lease.json'), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['expectMinutes', 'since', 'task', 'version', 'who']);
  assert.equal(raw.version, 1); assert.equal(raw.expectMinutes, 15); assert.ok(!Number.isNaN(Date.parse(raw.since)));
});

test('staleness: overdue past expectMinutes, stale past 2x + 5 minutes, stale no longer blocks', (t) => {
  const dir = tmp(t); const lease = join(dir, 'lease.json');
  const at = (minAgo) => writeFileSync(lease, JSON.stringify({ who: 'a', task: 't', since: new Date(Date.now() - minAgo * 60000).toISOString(), expectMinutes: 10, version: 1 }));
  at(5); assert.deepEqual([gs.readLease({ dir }).overdue, gs.readLease({ dir }).stale], [false, false]);
  at(12); assert.deepEqual([gs.readLease({ dir }).overdue, gs.readLease({ dir }).stale], [true, false]);
  assert.throws(() => gs.takeLease('b', 'x', 5, { dir }), /held by a/);
  at(26); assert.equal(gs.readLease({ dir }).stale, true);
  assert.equal(gs.takeLease('b', 'x', 5, { dir }).who, 'b');
});

test('private lease hides who and task', (t) => {
  const dir = tmp(t);
  const l = gs.takeLease('anything', 'secret work', 20, { dir, private: true });
  assert.deepEqual([l.who, l.task], ['private-owner (private)', '']);
  assert.ok(!readFileSync(join(dir, 'lease.json'), 'utf8').includes('secret'));
});

test('CLI exit codes: 0 ok, 1 held or not holder, 2 usage, 3 wait gave up', async (t) => {
  const dir = tmp(t);
  assert.equal((await cli(dir, 'lease', 'a', 'job', '10')).code, 0);
  assert.equal((await cli(dir, 'lease', 'b', 'job', '10')).code, 1);
  assert.equal((await cli(dir, 'release', 'b')).code, 1);
  assert.equal((await cli(dir, 'lease', 'a')).code, 2);
  assert.equal((await cli(dir, 'bogus')).code, 2);
  assert.equal((await cli(dir, 'wait', '--max-minutes', '0')).code, 3);
  assert.equal((await cli(dir, 'wait', '--who', 'a', '--max-minutes', '0')).code, 0);
  assert.equal((await cli(dir, 'release', 'a')).code, 0);
  assert.equal((await cli(dir, 'lease', '--private', '5')).code, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'lease.json'), 'utf8')).who, 'private-owner (private)');
  const st = JSON.parse((await cli(dir, '--json')).stdout);
  assert.equal(st.lease.who, 'private-owner (private)'); assert.equal(st.comfy.up, false);
});

test('the module imports nothing but Node built-ins', () => {
  const src = readFileSync(modulePath, 'utf8');
  for (const m of src.matchAll(/^import .* from '([^']+)'/gm)) assert.match(m[1], /^node:/);
});
