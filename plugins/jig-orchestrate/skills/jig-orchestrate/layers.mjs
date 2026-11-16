if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-orchestrate/layers.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// One resolver for optional enforcement and dashboard capabilities.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectName, projectsMap, statePath, storeRoot } from './jig-store.mjs';

export const towerOff = 'tower is off for this project: set layers.tower';
const privatePath = path => path.split(/[\\/]/).some(part => part.toLowerCase() === 'private');
function physical(path) {
  const absolute = resolve(path);
  if (privatePath(absolute)) throw new Error('path is private');
  let real;
  try { real = realpathSync(absolute); } catch (error) { if (error.code === 'ENOENT') throw new Error('Project context missing: checkout does not exist'); throw error; }
  if (privatePath(real)) throw new Error('path is private');
  return real;
}
function flags(path) {
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('invalid layer config'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid layer config');
  if (data.layers === undefined) return {};
  if (!data.layers || typeof data.layers !== 'object' || Array.isArray(data.layers)) throw new Error('invalid layer config');
  for (const key of ['orchestration', 'tower']) if (data.layers[key] !== undefined && typeof data.layers[key] !== 'boolean') throw new Error(`invalid layer config: layers.${key} must be boolean`);
  return data.layers;
}
export function layers(root = process.env.JIG_PROJECT_ROOT || process.cwd(), { home = storeRoot() } = {}) {
  if (!home) return { orchestration: false, tower: false };
  home = resolve(home);
  if (privatePath(home)) throw new Error('path is private');
  const registered = new Map();
  for (const [name, entry] of Object.entries(projectsMap(home))) {
    const value = typeof entry === 'string' ? entry : entry?.path;
    if (typeof value !== 'string' || privatePath(value) || !existsSync(value)) continue;
    const canonical = physical(value);
    if (!registered.has(canonical)) registered.set(canonical, name);
  }
  const candidates = new Set(), pending = [physical(root)];
  while (pending.length) {
    for (let dir = pending.pop(); ; dir = dirname(dir)) {
      if (existsSync(join(dir, '.git')) || registered.has(dir)) {
        if (!candidates.has(dir)) {
          candidates.add(dir);
          if (existsSync(join(dir, '.git')) && statSync(join(dir, '.git')).isFile()) {
            let common;
            try { common = execFileSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { /* a non-Git registered project or synthetic fixture */ }
            if (common) { const main = physical(dirname(resolve(dir, common))); if (!candidates.has(main)) pending.push(main); }
          }
        }
      }
      if (dir === dirname(dir)) break;
    }
  }
  let orchestration = false, tower = false;
  for (const project of candidates) {
    const resolved = statePath(project, 'config.json', { home });
    const rel = relative(home, resolved);
    // Own-project legacy state must never make a repo-local config an opt-in.
    const expected = join(home, registered.get(project) ?? projectName(project, { home }), 'config.json');
    const path = registered.has(project) || rel.startsWith('..') || isAbsolute(rel) ? expected : resolved;
    const value = flags(path);
    orchestration ||= value.orchestration === true;
    tower ||= value.tower === true;
  }
  return { orchestration, tower: orchestration && tower };
}
export function requireTower(root, options) {
  if (!layers(root, options).tower) throw new Error(towerOff);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: layers.mjs [project]');
    console.log(JSON.stringify(layers(process.argv[2])));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
