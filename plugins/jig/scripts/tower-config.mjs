// Tower preferences live in the personal project store, never legacy repo state.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, writeText } from './jig-store.mjs';
import { createGpuMonitor, gpuStatus } from './gpu-status.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = ['gpu.enabled', 'gpu.comfyUrl', 'gpu.smi'];
export function towerConfigPath({ project, home } = {}) {
  const dir = projectDir(project, { home });
  return dir ? join(dir, 'tower.json') : null;
}
export function readTowerConfig(options) {
  const file = towerConfigPath(options);
  if (!file) return {};
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!object(data)) throw new Error('expected an object');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Cannot read tower.json: ${error.message}`);
  }
}
function validate(key, value) {
  if (!keys.includes(key)) throw new Error(`Unknown setting: ${key}`);
  if (key === 'gpu.enabled') {
    if (typeof value !== 'boolean') throw new Error('gpu.enabled must be true or false');
  } else {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a nonempty string`);
    if (key === 'gpu.comfyUrl') {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('gpu.comfyUrl must be an HTTP(S) URL without credentials');
    }
  }
}
export function gpuPreferences(options, env = process.env) {
  // Bad preferences fail closed: malformed JSON must never turn on probes.
  let gpu;
  try { gpu = readTowerConfig(options).gpu; } catch { return { enabled: false }; }
  if (!object(gpu) || gpu.enabled !== true) return { enabled: false };
  try { for (const key of keys) if (gpu[key.slice(4)] !== undefined) validate(key, gpu[key.slice(4)]); }
  catch { return { enabled: false }; }
  return { enabled: true, comfyUrl: env.GPU_SHARE_COMFY_URL || gpu.comfyUrl, smiPath: env.GPU_SHARE_SMI || gpu.smi };
}
export function towerConfigCommand(argv, options, out = console.log) {
  const [verb, key, raw, ...extra] = argv;
  if (!['get', 'set', 'list'].includes(verb) || extra.length || (verb === 'list' ? key !== undefined : !key || (verb === 'get' ? raw !== undefined : raw === undefined))) {
    throw new Error('Usage: tower.mjs config list | get <key> | set <key> <value>');
  }
  const data = readTowerConfig(options);
  if (verb === 'list') { out(JSON.stringify(data, null, 2)); return; }
  if (!keys.includes(key)) throw new Error(`Unknown setting: ${key}`);
  if (verb === 'get') { out(JSON.stringify(data.gpu?.[key.slice(4)] ?? (key === 'gpu.enabled' ? false : null))); return; }
  const value = key === 'gpu.enabled' ? (raw === 'true' ? true : raw === 'false' ? false : raw) : raw;
  validate(key, value);
  if (data.gpu !== undefined && !object(data.gpu)) throw new Error('gpu must be an object');
  data.gpu = { ...data.gpu, [key.slice(4)]: value };
  const file = towerConfigPath(options);
  if (!file) throw new Error('No store root: set JIG_HOME.');
  writeText(file, JSON.stringify(data, null, 2) + '\n');
  out(JSON.stringify(value));
}
export function createTowerGpuMonitor(options, { env = process.env, load = gpuStatus } = {}) {
  let monitor, signature;
  return { snapshot() {
    const prefs = gpuPreferences(options, env);
    if (!prefs.enabled) { monitor = null; signature = null; return null; }
    const next = JSON.stringify(prefs);
    if (!monitor || signature !== next) {
      signature = next;
      monitor = createGpuMonitor({ load: () => load({ comfyUrl: prefs.comfyUrl, smiPath: prefs.smiPath }) });
    }
    return monitor.snapshot();
  } };
}
