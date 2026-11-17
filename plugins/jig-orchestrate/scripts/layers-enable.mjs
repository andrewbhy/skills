#!/usr/bin/env node
import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from './command-line.mjs';
// Enable optional layers for exactly one project's personal store.
// Exit 0 set/unchanged, 1 store or project failure, 2 invalid invocation.
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareStoreWrite, projectName, storeRoot, writeJson } from './jig-store.mjs';

const usage = `Usage: ${commandFor(import.meta.url)} --project <repo> [--orchestration-only|--tower-only] [--force]`;
const assertPublicPath = path => {
  if (resolve(path).split(/[\\/]/).some(part => part.toLowerCase() === 'private')) throw new Error('path is private');
};
export function main(argv, { home = storeRoot(), log = console.log } = {}) {
  let project, only = false, towerOnly = false, force = false;
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' && argv.length === 1) { log(usage); return 0; }
    if (seen.has(arg)) throw Object.assign(new Error(usage), { exitCode: 2 });
    seen.add(arg);
    if (arg === '--project' && argv[i + 1] && !argv[i + 1].startsWith('--')) project = argv[++i];
    else if (arg === '--orchestration-only') only = true;
    else if (arg === '--tower-only') towerOnly = true;
    else if (arg === '--force') force = true;
    else throw Object.assign(new Error(usage), { exitCode: 2 });
  }
  if (!project || only && towerOnly) throw Object.assign(new Error(usage), { exitCode: 2 });
  if (!home) throw new Error('No store root: set JIG_HOME.');
  assertPublicPath(project); assertPublicPath(home);
  project = realpathSync(resolve(project));
  assertPublicPath(project);
  if (!statSync(project).isDirectory()) throw new Error('Project must be a directory');
  const name = projectName(project, { home });
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Invalid project store name');
  const path = join(home, name, 'config.json');
  assertPublicPath(path);
  let config;
  try { config = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; config = {}; }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid project config');
  if (Object.hasOwn(config, 'layers') && !force) {
    log(`Unchanged ${path}: layers=${JSON.stringify(config.layers)} (use --force to replace)`);
  } else {
    config.layers = { orchestration: !towerOnly, tower: !only };
    writeJson(path, config, { home });
    log(`Set ${path}: layers=${JSON.stringify(config.layers)}`);
  }
  if (config.layers?.tower === true) {
    const rootsPath = join(home, name, 'review-roots.json');
    const prefix = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    const roots = { roots: [{ prefix, path: project }] };
    prepareStoreWrite(rootsPath, { home });
    try {
      writeFileSync(rootsPath, JSON.stringify(roots, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      log(`Created ${rootsPath}: ${JSON.stringify(roots)}`);
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return 0;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
