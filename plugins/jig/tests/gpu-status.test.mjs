import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { chipOf, comfyStatus, createGpuMonitor, gpuStatus, parseSmi, readLease, releaseLease, takeLease, waitIdle } from '../scripts/gpu-status.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { homePage } from '../scripts/review-home-page.mjs';

const graph = (client, prefix, model) => ({ 3: { class_type: 'UNETLoader', inputs: { unet_name: model } }, 9: { class_type: 'SaveImage', inputs: { filename_prefix: prefix } } });
const entry = (n, id, client, prefix, model) => [n, id, graph(client, prefix, model), { client_id: client }, ['9']];
const hist = (id, client, prefix, start, end, status = 'success') => ({
  prompt: entry(1, id, client, prefix, 'qwen.safetensors'), outputs: {},
  status: { status_str: status, completed: true, messages: [['execution_start', { prompt_id: id, timestamp: start }], [status === 'success' ? 'execution_success' : 'execution_error', { prompt_id: id, timestamp: end }]] }
});

async function mockComfy(t, { running = [], pending = [], history = {} } = {}) {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    const body = path === '/queue' ? { queue_running: running, queue_pending: pending } : path === '/history' ? history : path === '/system_stats' ? { devices: [{ vram_free: 4 * 1073741824 }] } : null;
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}
function home(t) {
  const h = mkdtempSync(join(tmpdir(), 'jig-gpu-test-'));
  t.after(() => rmSync(h, { recursive: true, force: true }));
  return h;
}

test('parseSmi reads the csv line and rejects junk', () => {
  assert.deepEqual(parseSmi('11424, 16303, 37, 52\n'), { usedMB: 11424, totalMB: 16303, util: 37, temp: 52 });
  assert.equal(parseSmi(''), null);
  assert.equal(parseSmi('No devices were found'), null);
});

test('comfyStatus reads queue, history durations and attributes by client id and prefix', async (t) => {
  const url = await mockComfy(t, {
    running: [entry(5, 'aaaaaaaa-1', 'art-spike', 'spike/hero', 'qwen_image.safetensors')],
    pending: [entry(6, 'b', 'proj-a', 'g4/a', 'x'), entry(7, 'c', 'proj-a', 'g4/b', 'x')],
    history: { h1: hist('h1', 'lab', 'lab/one', 1000000, 1065000), h2: hist('h2', 'lab', 'lab/two', 1100000, 1110000, 'error') }
  });
  const c = await comfyStatus({ url });
  assert.equal(c.up, true);
  assert.equal(c.pending, 2);
  assert.equal(c.running[0].client, 'art-spike');
  assert.equal(c.running[0].model, 'qwen_image.safetensors');
  assert.equal(c.running[0].prefix, 'spike/hero');
  assert.equal(c.lastDone[0].promptId, 'h2');
  assert.equal(c.lastDone[0].status, 'error');
  assert.equal(c.lastDone[1].seconds, 65);
  assert.equal(c.vramFreeMB, 4096);
});

test('comfyStatus reports down without throwing', async () => {
  const c = await comfyStatus({ url: 'http://127.0.0.1:9' });
  assert.equal(c.up, false);
  assert.deepEqual(c.running, []);
});

test('lease: taken, refused for others, released, and a stale lease no longer blocks', (t) => {
  const h = home(t);
  const l = takeLease('art-spike', 'qwen batch', 20, { dir: h });
  assert.equal(l.who, 'art-spike');
  assert.equal(readLease({ dir: h }).task, 'qwen batch');
  assert.throws(() => takeLease('proj-a', 'x', 5, { dir: h }), /held by art-spike/);
  assert.throws(() => releaseLease('proj-a', { dir: h }), /not proj-a/);
  assert.equal(releaseLease('art-spike', { dir: h }).released, true);
  assert.equal(readLease({ dir: h }), null);
  assert.throws(() => takeLease('x', 'y', 'abc', { dir: h }), /Usage/);
  writeFileSync(join(h, 'lease.json'), JSON.stringify({ who: 'old', task: 't', since: new Date(Date.now() - 3600e3).toISOString(), expectMinutes: 10 }));
  assert.equal(readLease({ dir: h }).stale, true);
  assert.equal(takeLease('proj-a', 'x', 5, { dir: h }).who, 'proj-a');
});

test('gpuStatus combines smi, comfy and the lease; owner is the lease first, then the client id', async (t) => {
  const h = home(t);
  const url = await mockComfy(t, { running: [entry(5, 'p1', 'art-spike', 'spike/hero', 'm')] });
  let s = await gpuStatus({ smi: '15000,16303,98,70', comfyUrl: url, dir: h });
  assert.deepEqual(s.gpu, { usedMB: 15000, totalMB: 16303, util: 98, temp: 70 });
  assert.deepEqual([s.owner.who, s.owner.source], ['art-spike', 'client_id']);
  assert.deepEqual(chipOf(s), { text: 'GPU: busy (art-spike, 14.6/16 GB)', level: 'amber' });
  takeLease('lab', 'bake', 10, { dir: h });
  s = await gpuStatus({ smi: '8000,16303,50,60', comfyUrl: url, dir: h });
  assert.deepEqual([s.owner.who, s.owner.source], ['lab', 'lease']);
  assert.equal(chipOf(s).level, 'busy');
});

test('chip: idle, busy with queue, amber on queue over 2, unknown', () => {
  const base = (over) => ({ gpu: { usedMB: 11674, totalMB: 16384, util: 5, temp: 40 }, comfy: { up: true, running: [], pending: 0, lastDone: [] }, lease: null, owner: null, ...over });
  assert.deepEqual(chipOf(base()), { text: 'GPU: idle (11.4/16 GB)', level: 'idle' });
  const busy = base({ comfy: { up: true, running: [{}], pending: 1, lastDone: [] }, owner: { who: 'lab' } });
  assert.deepEqual(chipOf(busy), { text: 'GPU: busy (lab, 1 queued, 11.4/16 GB)', level: 'busy' });
  assert.equal(chipOf({ ...busy, comfy: { ...busy.comfy, pending: 3 } }).level, 'amber');
  assert.equal(chipOf({ gpu: null, comfy: { up: false, running: [], pending: 0 } }).level, 'unknown');
});

test('waitIdle prints one line per poll and returns when free, or gives up', async () => {
  const busy = { comfy: { running: [{}], pending: 1 }, lease: null };
  const free = { comfy: { running: [], pending: 0 }, lease: null };
  const seq = [busy, busy, free]; const lines = [];
  assert.equal(await waitIdle({ pollMs: 1, status: async () => seq.shift(), log: (l) => lines.push(l) }), true);
  assert.deepEqual(lines.map((l) => l.split(':')[0].replace(/ \d+ min/, '')), ['waiting', 'waiting', 'GPU free after']);
  const lease = { comfy: { running: [], pending: 0 }, lease: { who: 'other', stale: false } };
  const out = [];
  assert.equal(await waitIdle({ pollMs: 1, maxMinutes: 0, status: async () => lease, log: (l) => out.push(l) }), false);
  assert.equal(await waitIdle({ who: 'other', pollMs: 1, status: async () => lease, log: () => {} }), true);
});

test('monitor caches: at most one load per ttl and never blocks', async () => {
  let calls = 0;
  const m = createGpuMonitor({ ttlMs: 60000, load: async () => { calls += 1; return { gpu: null, comfy: { up: true, running: [], pending: 0, lastDone: [] }, lease: null, owner: null }; } });
  assert.equal(m.snapshot(), null);
  m.snapshot(); m.snapshot();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.snapshot().chip.level, 'idle');
  assert.equal(calls, 1);
});

test('tower: /api/state carries the gpu field and the page has the chip and panel', async (t) => {
  const tmp = home(t); const root = join(tmp, 'root'); const dir = join(tmp, 'state'); mkdirSync(root); mkdirSync(dir);
  const snap = { gpu: { usedMB: 1, totalMB: 2, util: 0, temp: 1 }, comfy: { up: true, running: [], pending: 0, lastDone: [] }, lease: null, owner: null, chip: { text: 'GPU: idle', level: 'idle' } };
  const srv = createReviewServer({ roots: [{ prefix: 'r', path: root }], dir, home: join(tmp, 'h'), project: 'gp', gpu: { snapshot: () => snap } });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.gpu.chip.text, 'GPU: idle');
  const html = homePage(JSON.stringify(state));
  assert.match(html, /id="gpu"/);
  assert.match(html, /id="gpupanel"/);
});

test('CLI lease, status --json and release work against a temp store', async (t) => {
  const h = home(t); const url = await mockComfy(t);
  const env = { ...process.env, GPU_SHARE_DIR: h, GPU_SHARE_COMFY_URL: url, GPU_SHARE_SMI: 'no-such-smi' };
  const run = (...a) => new Promise((ok) => execFile(process.execPath, [resolve(import.meta.dirname, '..', 'scripts', 'gpu-status.mjs'), ...a], { env, encoding: 'utf8' }, (err, stdout, stderr) => ok({ status: err ? err.code : 0, stdout, stderr })));
  assert.equal((await run('lease', 'worker-a', 'bake', '10')).status, 0);
  const other = await run('lease', 'worker-b', 'x', '5');
  assert.equal(other.status, 1); assert.match(other.stderr, /held by worker-a/);
  const j = JSON.parse((await run('--json')).stdout);
  assert.equal(j.lease.who, 'worker-a'); assert.equal(j.comfy.up, true);
  assert.equal((await run('wait', '--max-minutes', '0')).status, 3);
  assert.equal((await run('wait', '--who', 'worker-a', '--max-minutes', '0')).status, 0);
  assert.match((await run('release', 'worker-a')).stdout, /released worker-a/);
});
