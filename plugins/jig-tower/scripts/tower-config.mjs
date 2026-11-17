import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from './command-line.mjs';
// Tower preferences live in the personal project store, never legacy repo state.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, writeText } from './jig-store.mjs';
import { createGpuMonitor, gpuStatus } from './gpu-status.mjs';
import { defaultThemePack, pairedPack, themePacks, validateThemePack } from './tower-theme.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const defaults = { quietHours: 72, stalledHours: 24, themePack: defaultThemePack };
const keys = ['gpu.enabled', 'gpu.comfyUrl', 'gpu.smi', ...Object.keys(defaults)];
export function towerPreferences(options) {
  const data = readTowerConfig(options);
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) if (data[key] !== undefined) { validate(key, data[key]); result[key] = data[key]; }
  return result;
}
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
export function validate(key, value) {
  if (key === 'newHome') throw new Error('newHome was removed: the new home is always on');
  if (!keys.includes(key)) throw new Error(`Unknown setting: ${key}`);
  if (key === 'themePack') {
    validateThemePack(value);
  } else if (key === 'quietHours' || key === 'stalledHours') {
    const max = key === 'quietHours' ? 720 : 168;
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${key} must be an integer from 1 to ${max}`);
  } else if (key === 'gpu.enabled') {
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
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
  try { for (const key of keys.filter(k => k.startsWith('gpu.'))) if (gpu[key.slice(4)] !== undefined) validate(key, gpu[key.slice(4)]); }
  catch { return { enabled: false }; }
  return { enabled: true, comfyUrl: env.GPU_SHARE_COMFY_URL || gpu.comfyUrl, smiPath: env.GPU_SHARE_SMI || gpu.smi };
}
export function towerConfigCommand(argv, options, out = console.log) {
  const [verb, key, raw, ...extra] = argv;
  if (!['get', 'set', 'list'].includes(verb) || extra.length || (verb === 'list' ? key !== undefined : !key || (verb === 'get' ? raw !== undefined : raw === undefined))) {
    throw new Error(`Usage: ${commandFor(import.meta.url)} config list | get <key> | set <key> <value>`);
  }
  const data = readTowerConfig(options);
  if (verb === 'list') { out(JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'newHome')), null, 2)); return; }
  if (key === 'newHome') throw new Error('newHome was removed: the new home is always on');
  if (!keys.includes(key)) throw new Error(`Unknown setting: ${key}`);
  if (verb === 'get') { out(JSON.stringify(key.startsWith('gpu.') ? data.gpu?.[key.slice(4)] ?? (key === 'gpu.enabled' ? false : null) : data[key] ?? defaults[key])); return; }
  const value = key === 'gpu.enabled' ? (raw === 'true' ? true : raw === 'false' ? false : raw) : key === 'quietHours' || key === 'stalledHours' ? (raw.length && !/\D/.test(raw) ? Number(raw) : raw) : raw;
  validate(key, value);
  if (key.startsWith('gpu.')) {
    if (data.gpu !== undefined && !object(data.gpu)) throw new Error('gpu must be an object');
    data.gpu = { ...data.gpu, [key.slice(4)]: value };
  } else data[key] = value;
  const file = towerConfigPath(options);
  if (!file) throw new Error('No store root: set JIG_HOME.');
  writeText(file, JSON.stringify(data, null, 2) + '\n');
  out(JSON.stringify(value));
}
export function createTowerGpuMonitor(options, { env = process.env, load = gpuStatus } = {}) {
  let monitor, signature;
  return { enabled() { return gpuPreferences(options, env).enabled; }, snapshot() {
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

// Settings the person may change from the web panel. gpu.comfyUrl and gpu.smi stay CLI-only (they name a URL and a program to run).
export const settingKeys = Object.freeze(['quietHours', 'stalledHours', 'themePack', 'gpu.enabled']);
export class SettingsError extends Error {
  constructor(fields) { super('Settings refused'); this.fields = fields; }
}
export function towerSettings(options) {
  const data = readTowerConfig(options), prefs = towerPreferences(options);
  const packs = themePacks.flatMap((id) => { try { validateThemePack(id); return [{ id, dark: pairedPack(id, true) }]; } catch { return []; } });
  return { values: { quietHours: prefs.quietHours, stalledHours: prefs.stalledHours, themePack: prefs.themePack, 'gpu.enabled': data.gpu?.enabled === true }, packs };
}
// One validation path: the same validate() as `tower.mjs config set`. Nothing is written unless every field passes.
export function saveTowerSettings(body, options) {
  const fields = Object.create(null);
  if (!object(body) || !Object.keys(body).length) throw new SettingsError({ '': 'Send at least one setting.' });
  for (const [key, value] of Object.entries(body)) {
    if (!settingKeys.includes(key)) { fields[key] = `Unknown setting: ${key}`; continue; }
    try { validate(key, value); } catch (error) { fields[key] = String(error.message); }
  }
  if (Object.keys(fields).length) throw new SettingsError(fields);
  const data = readTowerConfig(options);
  if (data.gpu !== undefined && !object(data.gpu) && 'gpu.enabled' in body) throw new SettingsError({ 'gpu.enabled': 'gpu in tower.json must be an object' });
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('gpu.')) data.gpu = { ...data.gpu, [key.slice(4)]: value }; else data[key] = value;
  }
  const file = towerConfigPath(options);
  if (!file) throw new Error('No store root: set JIG_HOME.');
  writeText(file, JSON.stringify(data, null, 2) + '\n');
  return towerSettings(options);
}
