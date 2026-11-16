if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-correct/signals.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { atomicWriteFile } from './jig-store.mjs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { docsPath, projectRootOf, statePath, storeRoot, usingStore, prepareStoreWrite, assertStoreFormat } from './jig-store.mjs';

export const kinds = ['escape', 'escalation', 'rejection', 'coordinator-error', 'skill-gap', 'skill-misguided', 'plan-block', 'broken-brief', 'false-alarm', 'missed-check', 'over-budget', 'lost-work', 'confusion', 'measure-mismatch', 'dependency'];
const required = ['id', 'date', 'project', 'level', 'kind', 'area', 'item', 'caughtBy'];
const optional = ['what', 'cost', 'planLink', 'detailLink', 'mpId', 'repeatOf', 'consumedBy', 'ownErrorShare', 'decision', 'skill', 'proposedFix'];
const levels = ['jig', 'environment', 'project'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function validateSignal(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Signal must be an object');
  for (const key of required) if (!nonempty(row[key])) throw Error(`Missing or invalid field: ${key}`);
  if (!kinds.includes(row.kind)) throw Error(`Unknown kind; kinds: ${kinds.join(', ')}`);
  if (!levels.includes(row.level)) throw Error(`level must be ${levels.join(', ')}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date) throw Error('Invalid date');
  for (const key of Object.keys(row)) {
    if (![...required, ...optional].includes(key)) throw Error(`Unknown field: ${key}`);
    if (optional.includes(key) && key !== 'cost' && !nonempty(row[key])) throw Error(`Invalid field: ${key}`);
  }
  if (row.ownErrorShare && !['none', 'part', 'all'].includes(row.ownErrorShare)) throw Error('Invalid ownErrorShare');
  if (row.cost !== undefined && (!row.cost || typeof row.cost !== 'object' || Array.isArray(row.cost) || Object.keys(row.cost).length !== 1 || !['minutes', 'rounds'].includes(Object.keys(row.cost)[0]) || !Object.values(row.cost).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0))) throw Error('cost must be {minutes} or {rounds}, nonnegative');
  return row;
}
export function signalPaths({ root = process.env.JIG_SIGNALS_PROJECT || projectRootOf(), home = process.env.JIG_SIGNALS_HOME || storeRoot() || join(homedir(), '.jig') } = {}) {
  if (process.env.NODE_TEST_CONTEXT && (!process.env.JIG_SIGNALS_PROJECT && root === projectRootOf() || !process.env.JIG_SIGNALS_HOME && home === join(homedir(), '.jig'))) throw Error('Tests require temporary signal paths; run scripts/run-tests.mjs');
  return { root: resolve(root), home: resolve(home), project: statePath(resolve(root), 'signals.jsonl'), jig: join(resolve(home), 'signals.jsonl') };
}
export function recordToolSignal(kind, item, { area, what, ...options } = {}) {
  const paths = signalPaths(options);
  return addSignal({ project: basename(paths.root), level: 'project', kind, area, item, caughtBy: 'tool', ...(what ? { what } : {}) }, options);
}
export function readSignals(path) {
  try { return readFileSync(path, 'utf8').split(/\r?\n/).filter(line => line.trim()).map(line => validateSignal(JSON.parse(line))); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export function withSignalLock(path, action, now = Date.now()) {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Serialize stale takeover so two reapers cannot delete a replacement lock.
    const reaper = `${lock}.reaper`;
    let reapFD;
    try { reapFD = openSync(reaper, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (now - statSync(reaper).mtimeMs <= 30000) throw Object.assign(Error('Signal lock busy'), { exitCode: 2 });
      unlinkSync(reaper);
      try { reapFD = openSync(reaper, 'wx', 0o600); }
      catch (error) { if (error.code !== 'EEXIST') throw error; throw Object.assign(Error('Signal lock busy'), { exitCode: 2 }); }
    }
    try {
      if (existsSync(lock) && now - statSync(lock).mtimeMs <= 30000) throw Object.assign(Error('Signal lock busy'), { exitCode: 2 });
      if (existsSync(lock)) unlinkSync(lock);
      fd = openSync(lock, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST') throw Object.assign(Error('Signal lock busy'), { exitCode: 2 });
      throw error;
    } finally { closeSync(reapFD); unlinkSync(reaper); }
  }
  try { return action(); } finally { closeSync(fd); unlinkSync(lock); }
}
function config(paths) {
  const path = statePath(paths.root, 'config.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}
function minimal(row, paths) {
  if (config(paths).signals?.detail === 'minimal') { delete row.what; delete row.proposedFix; }
  return row;
}
function ensurePrivateIgnores(root) {
  const path = join(root, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const missing = ['/.jig/signals.jsonl', '/.jig/retros/'].filter(line => !lines.includes(line));
  if (missing.length) appendFileSync(path, (text && !text.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
}
export function addSignal(input, options = {}) {
  const paths = signalPaths(options);
  const row = validateSignal({ id: randomUUID(), date: new Date().toISOString().slice(0, 10), ...input });
  const path = row.level === 'jig' ? paths.jig : paths.project;
  if (row.level !== 'jig') assertStoreFormat(path);
  prepareStoreWrite(path, { home: paths.home });
  return withSignalLock(path, () => {
    const rows = readSignals(path);
    if (path === paths.project && !usingStore(paths.root)) ensurePrivateIgnores(paths.root); // the store keeps the repo untouched
    if (rows.some(r => r.id === row.id)) throw Error(`Duplicate id: ${row.id}`);
    const previous = rows.findLast(r => r.level === row.level && r.area === row.area && r.kind === row.kind && (row.caughtBy !== 'tool' || r.caughtBy === 'tool' && r.item === row.item));
    let classMatch;
    const missedPath = docsPath(paths.root, 'docs/missed-problems.jsonl');
    if (row.mpId && existsSync(missedPath)) {
      const incidents = readFileSync(missedPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      const current = incidents.find(r => r.id === row.mpId);
      const index = incidents.indexOf(current);
      const earlier = incidents.slice(0, index).filter(r => current?.class && r.class === current.class && r.area === current.area);
      classMatch = rows.findLast(r => r.level === row.level && earlier.some(mp => mp.id === r.mpId));
      if (!classMatch && earlier.length) classMatch = { id: earlier.at(-1).id };
    }
    if (previous || classMatch) row.repeatOf = (previous || classMatch).id;
    minimal(row, paths);
    appendFileSync(path, JSON.stringify(row) + '\n', { mode: 0o600 });
    return row;
  });
}
export function listSignals({ level, since, ...options } = {}) {
  if (level !== undefined && !levels.includes(level)) throw Error('Invalid level');
  const paths = signalPaths(options);
  const rows = level === 'jig' ? readSignals(paths.jig) : level ? readSignals(paths.project) : [...readSignals(paths.jig), ...readSignals(paths.project)];
  return rows.filter(row => (!level || row.level === level) && (!since || row.date >= since));
}
function updateLog(level, options, update) {
  if (!levels.includes(level)) throw Error('Invalid level');
  const paths = signalPaths(options), path = level === 'jig' ? paths.jig : paths.project;
  if (level !== 'jig') assertStoreFormat(path);
  prepareStoreWrite(path, { home: paths.home });
  return withSignalLock(path, () => {
    const rows = update(readSignals(path), paths).map(validateSignal);
    if (path === paths.project) ensurePrivateIgnores(paths.root);
    atomicWriteFile(path, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), { mode: 0o600 });
    return rows;
  });
}
export function setSignal(id, field, value, { level = 'project', ...options } = {}) {
  if (!optional.includes(field)) throw Error('set requires one optional field');
  return updateLog(level, options, (rows, paths) => {
    const row = rows.find(r => r.id === id && r.level === level);
    if (!row) throw Error(`Unknown id: ${id}`);
    row[field] = value; validateSignal(row); minimal(row, paths);
    return rows;
  });
}
export function consumeSignals(ids, consumedBy, { level = 'project', ...options } = {}) {
  if (!nonempty(consumedBy) || !ids.length) throw Error('consume requires ids and consumedBy');
  return updateLog(level, options, rows => {
    for (const id of ids) {
      const row = rows.find(r => r.id === id && r.level === level);
      if (!row) throw Error(`Unknown id: ${id}`);
      row.consumedBy = consumedBy;
    }
    return rows;
  });
}
export function pruneSignals({ level = 'project', now = Date.now(), ...options } = {}) {
  return updateLog(level, options, rows => rows.filter(row => {
    if (row.level !== level) return true;
    if (!row.consumedBy && ['skill-gap', 'skill-misguided'].includes(row.kind)) return true;
    return (now - Date.parse(row.date)) / 86400000 <= (row.consumedBy ? 30 : 180);
  }));
}
export function renderReport(rows, level) {
  const repeats = rows.filter(row => row.repeatOf);
  const costs = rows.reduce((sum, row) => { for (const [unit, amount] of Object.entries(row.cost ?? {})) sum[unit] += amount; return sum; }, { minutes: 0, rounds: 0 });
  const lines = [`# Retro: ${level}`, '', `Signals: ${rows.length}`, `Cost: ${costs.minutes} minutes; ${costs.rounds} rounds`, `Cost not recorded: ${rows.filter(row => !row.cost).length}`, `Unrecorded: ${rows.filter(row => row.caughtBy === 'retro-sweep').length}`, '', `## Repeats (${repeats.length})`, ...repeats.map(row => `- ${row.id}: ${row.kind} / ${row.area}; repeatOf ${row.repeatOf}`), '', '## Counts by kind', ...kinds.map(kind => `- ${kind}: ${rows.filter(row => row.kind === kind).length}`), '', '## Open skill questions', ...rows.filter(row => ['skill-gap', 'skill-misguided'].includes(row.kind) && !row.consumedBy).map(row => `- ${row.id}: ${row.kind}; skill ${row.skill ?? 'unspecified'}`), ''];
  return lines.join('\n');
}
export function reportSignals({ level = 'project', since, out, date = new Date().toISOString().slice(0, 10), ...options } = {}) {
  const text = renderReport(listSignals({ ...options, level, since }), level);
  const path = out ? resolve(out) : level === 'environment' ? undefined : join(statePath(signalPaths(options).root, 'retros'), `${date}-${level}.md`);
  if (path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, { mode: 0o600 }); }
  return { text, path };
}
export function signalsCLI(argv) {
  const [command, ...args] = argv;
  if (command === 'add' && args.length === 1) return JSON.stringify(addSignal(JSON.parse(args[0])));
  if (['list', 'report', 'set', 'consume', 'prune'].includes(command)) {
    const options = {};
    const positional = [];
    for (let i = 0; i < args.length; i++) {
      if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
      if (!['--level', '--since', '--out'].includes(args[i]) || !args[i + 1]) throw Error('Options: --level, --since, --out');
      options[args[i].slice(2)] = args[i + 1];
      i++;
    }
    if (command === 'list' && !positional.length) return listSignals(options).map(row => JSON.stringify(row)).join('\n');
    if (command === 'report' && !positional.length) return reportSignals(options).text;
    if (command === 'set' && positional.length === 3) return JSON.stringify(setSignal(positional[0], positional[1], JSON.parse(positional[2]), options));
    if (command === 'consume' && positional.length >= 2) return JSON.stringify(consumeSignals(positional.slice(1), positional[0], options));
    if (command === 'prune' && !positional.length) return JSON.stringify(pruneSignals(options));
  }
  throw Error('Usage: signals.mjs add <JSON> | set <id> <optional-field> <JSON-value> | list | report | consume <plan> <ids...> | prune [--level <level>] [--since <date>] [--out <path>]');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(signalsCLI(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
