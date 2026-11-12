import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { createTowerGpuMonitor, gpuPreferences, readTowerConfig, towerConfigCommand, towerConfigPath } from '../scripts/tower-config.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { registerProject, stateDir } from '../scripts/jig-store.mjs';

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'tower-config-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const options = { home, project: 'fixture' };
  mkdirSync(join(home, 'fixture'));
  return { options, file: towerConfigPath(options) };
}
const tick = () => new Promise((r) => setImmediate(r));
const reading = { gpu: null, comfy: { up: false, running: [], pending: 0 }, lease: null, owner: null };

test('[risk: missing, disabled and malformed preferences never invoke probes, even with URL env]', async (t) => {
  const { options, file } = fixture(t);
  let calls = 0;
  const monitor = createTowerGpuMonitor(options, { env: { GPU_SHARE_COMFY_URL: 'http://localhost:8188' }, load: () => { calls++; return reading; } });
  for (const raw of [null, '{bad', 'null', '[]', '{"gpu":{"enabled":false}}', '{"gpu":{"enabled":"true"}}', '{"gpu":{"enabled":true,"comfyUrl":"file:///bad"}}']) {
    if (raw !== null) writeFileSync(file, raw);
    assert.equal(monitor.snapshot(), null);
    await tick();
    assert.equal(calls, 0, raw);
  }
});

test('[risk: opt-in loads configured probe locations, caches readings and stops on disable]', async (t) => {
  const { options, file } = fixture(t);
  writeFileSync(file, JSON.stringify({ gpu: { enabled: true, comfyUrl: 'http://localhost:8190', smi: 'custom-smi' } }));
  const calls = [];
  const monitor = createTowerGpuMonitor(options, { env: {}, load: (args) => { calls.push(args); return reading; } });
  assert.equal(monitor.snapshot(), null);
  await tick();
  assert.equal(monitor.snapshot().chip.text, 'GPU: unknown');
  assert.deepEqual(calls, [{ comfyUrl: 'http://localhost:8190', smiPath: 'custom-smi' }]);
  writeFileSync(file, '{"gpu":{"enabled":false}}');
  assert.equal(monitor.snapshot(), null);
  await tick();
  assert.equal(calls.length, 1);
});

test('[risk: environment overrides URL and executable only after explicit opt-in]', async (t) => {
  const { options, file } = fixture(t);
  writeFileSync(file, '{"gpu":{"enabled":true,"comfyUrl":"http://localhost:8190","smi":"stored"}}');
  const env = { GPU_SHARE_COMFY_URL: 'http://localhost:8191', GPU_SHARE_SMI: 'override' };
  assert.deepEqual(gpuPreferences(options, env), { enabled: true, comfyUrl: env.GPU_SHARE_COMFY_URL, smiPath: 'override' });
  let args;
  createTowerGpuMonitor(options, { env, load: (value) => { args = value; return reading; } }).snapshot();
  await tick();
  assert.deepEqual(args, { comfyUrl: env.GPU_SHARE_COMFY_URL, smiPath: 'override' });
});

test('[risk: config commands preserve other settings and refuse corrupt JSON and invalid values]', (t) => {
  const { options, file } = fixture(t);
  const output = [];
  const run = (...args) => towerConfigCommand(args, options, (v) => output.push(v));
  run('get', 'gpu.enabled'); assert.equal(output.pop(), 'false');
  writeFileSync(file, '{"display":{"theme":"dark"}}');
  run('set', 'gpu.enabled', 'true'); run('set', 'gpu.smi', 'smi with spaces');
  assert.equal(readTowerConfig(options).display.theme, 'dark');
  run('list'); assert.equal(JSON.parse(output.pop()).gpu.smi, 'smi with spaces');
  for (const args of [['set', 'gpu.enabled', 'yes'], ['set', '__proto__.enabled', 'true'], ['set', 'gpu.comfyUrl', 'file:///bad'], ['set', 'gpu.enabled'], ['list', 'extra']]) assert.throws(() => run(...args));
  writeFileSync(file, '{bad');
  assert.throws(() => run('set', 'gpu.enabled', 'true'), /Cannot read/);
  assert.equal(readFileSync(file, 'utf8'), '{bad');
});

test('[risk: public CLI writes only the selected personal project store]', (t) => {
  const { options } = fixture(t);
  const env = { ...process.env, JIG_HOME: options.home, JIG_PROJECT_ROOT: join(options.home, 'fixture') };
  const run = (...args) => spawnSync(process.execPath, ['scripts/tower.mjs', 'config', ...args], { env, encoding: 'utf8' });
  assert.equal(run('set', 'gpu.enabled', 'true').status, 0);
  const get = run('get', 'gpu.enabled'); assert.equal(get.status, 0); assert.equal(get.stdout.trim(), 'true');
  assert.equal(JSON.parse(run('list').stdout).gpu.enabled, true);
  assert.equal(run('set', 'gpu.enabled', 'invalid').status, 1);
});

test('[risk: opting in does not migrate or hide a registered project legacy review config]', (t) => {
  const { options } = fixture(t);
  const repo = join(options.home, 'repo');
  mkdirSync(join(repo, '.jig'), { recursive: true });
  writeFileSync(join(repo, '.jig', 'review-roots.json'), '{"roots":[]}');
  registerProject('fixture', repo, { home: options.home });
  towerConfigCommand(['set', 'gpu.enabled', 'true'], options, () => {});
  assert.equal(stateDir(repo, { home: options.home }), join(repo, '.jig'));
});

test('[risk: server default returns no GPU reading when project preferences are absent]', async (t) => {
  const { options } = fixture(t);
  const server = createReviewServer({ roots: [], dir: join(options.home, 'reviews'), ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { server.close(r); server.closeAllConnections(); }));
  const state = await (await fetch(`http://127.0.0.1:${server.address().port}/api/state`)).json();
  assert.equal(state.gpu, null);
});

test('[risk: GPU chip starts hidden and render hides chip/panel when no reading exists]', () => {
  const page = readFileSync(new URL('../scripts/review-home-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /id="gpu" hidden/);
  assert.match(page, /\.gpuchip\[hidden\]\{display:none\}/);
  const client = readFileSync(new URL('../scripts/review-home-client.js', import.meta.url), 'utf8');
  const render = client.slice(client.indexOf('function renderGpu()'), client.indexOf("$('gpu').addEventListener"));
  const chip = { hidden: false, setAttribute(k, v) { this[k] = v; } }, panel = { hidden: false };
  const context = { state: { gpu: null }, $: (id) => id === 'gpu' ? chip : panel };
  vm.runInNewContext(render + '\nrenderGpu();', context);
  assert.equal(chip.hidden, true); assert.equal(panel.hidden, true); assert.equal(chip['aria-expanded'], 'false');
  chip.append = () => {};
  context.state.gpu = { ...reading, chip: { level: 'unknown', text: 'GPU: unknown' } };
  context.gpuGlyph = { unknown: '?' }; context.el = () => ({});
  vm.runInNewContext(render + '\nrenderGpu();', context);
  assert.equal(chip.hidden, false);
});
