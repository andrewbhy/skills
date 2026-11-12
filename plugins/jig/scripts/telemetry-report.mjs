import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, normalize, resolve, win32 } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { selectFields } from './telemetry-fields.mjs';
import { statePath } from './jig-store.mjs';

const counts = { input_tokens: true, cached_input_tokens: true, output_tokens: true,
  cache_read_input_tokens: true, cache_creation_input_tokens: true };
const fields = {
  type: true, timestamp: true, sessionId: true, cwd: true, isSidechain: true,
  message: { id: true, model: true, usage: counts },
  payload: { type: true, id: true, cwd: true, model: true,
    info: { total_token_usage: counts } },
};
const identity = (path) => typeof path !== 'string' ? null
  : /^(?:[a-z]:[\\/]|\\\\)/i.test(path)
    ? win32.normalize(path).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
    : normalize(path).replace(/\/$/, '') || '/';
const time = (value) => typeof value === 'string' ? Date.parse(value) : NaN;
const number = (value) => Number.isSafeInteger(value) && value >= 0;
const validCounts = (value) => value && ['input', 'cached', 'output'].every((key) => number(value[key]))
  && value.cached <= value.input;
const add = (a, b) => Object.fromEntries(['input', 'cached', 'output'].map((key) => [key, a[key] + b[key]]));
const zero = () => ({ input: 0, cached: 0, output: 0 });

async function lines(file, consume) {
  const input = createReadStream(file, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) if (line.trim() && consume(line) === false) break;
  } finally {
    reader.close();
    input.destroy();
  }
}

// Do not follow symlinks or descend into Claude subagent transcripts.
async function files(directory, recursive) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(join(directory, entry.name));
    else if (recursive && entry.isDirectory()) result.push(...await files(join(directory, entry.name), true));
  }
  return result;
}

async function session(file, provider, project) {
  const result = { ids: new Set(), paths: new Set(), events: [], first: Infinity, last: -Infinity, bad: false };
  let model = null;
  let firstRow = true;
  try {
    await lines(file, (line) => {
      const row = selectFields(line, fields);
      if (!row) throw new Error();
      // Codex identifies the session in its first record. Once that header
      // establishes another project, its body cannot supply a competing session.
      // Do not scan unrelated history or let damage there poison this report.
      if (firstRow && provider === 'codex' && row.type === 'session_meta'
          && typeof row.payload?.id === 'string' && identity(row.payload?.cwd)
          && identity(row.payload.cwd) !== project) return false;
      firstRow = false;
      const stamp = time(row.timestamp);
      if (Number.isFinite(stamp)) {
        result.first = Math.min(result.first, stamp);
        result.last = Math.max(result.last, stamp);
      }
      if (provider === 'codex') {
        if (row.type === 'session_meta') {
          if (typeof row.payload?.id === 'string') result.ids.add(row.payload.id);
          if (identity(row.payload?.cwd)) result.paths.add(identity(row.payload.cwd));
        }
        if (row.type === 'turn_context') model = row.payload?.model ?? null;
        if (row.type !== 'event_msg' || row.payload?.type !== 'token_count' || row.payload.info == null) return;
        const usage = row.payload.info.total_token_usage;
        result.events.push({ time: stamp, model, usage: usage && {
          input: usage.input_tokens, cached: usage.cached_input_tokens, output: usage.output_tokens,
        } });
      } else {
        if (row.isSidechain === true) return;
        if (typeof row.sessionId === 'string') result.ids.add(row.sessionId);
        if (identity(row.cwd)) result.paths.add(identity(row.cwd));
        if (row.type !== 'assistant' || row.message?.usage == null) return;
        const usage = row.message.usage;
        const valid = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']
          .every((key) => number(usage[key]));
        result.events.push({ time: stamp, id: row.message.id, model: row.message.model,
          usage: valid ? { input: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
            cached: usage.cache_read_input_tokens, output: usage.output_tokens } : null });
      }
    });
  } catch {
    result.bad = true;
  }
  return result;
}

function usageBetween(record, provider, start, end) {
  let total = zero();
  let previous = zero();
  let seen = 0;
  let lastTime = -Infinity;
  const models = new Set();
  let missingModel = false;
  const messages = new Map();
  for (const event of record.events) {
    if (!Number.isFinite(event.time) || !validCounts(event.usage)) return null;
    if (provider === 'codex') {
      if (event.time < lastTime) return null;
      lastTime = event.time;
      if (event.time > end) continue;
      if (Object.keys(previous).some((key) => event.usage[key] < previous[key])) return null;
      if (event.time > start) {
        total = add(total, Object.fromEntries(Object.keys(total).map((key) => [key, event.usage[key] - previous[key]])));
        seen++;
        if (typeof event.model === 'string') models.add(event.model);
        else missingModel = true;
      }
      previous = event.usage;
    } else {
      if (typeof event.id !== 'string') return null;
      const old = messages.get(event.id);
      if (!old) messages.set(event.id, { ...event, first: event.time, last: event.time });
      else {
        old.first = Math.min(old.first, event.time);
        old.last = Math.max(old.last, event.time);
        // Use an actual recorded snapshot, never synthesize a combination.
        const increases = Object.keys(total).every((key) => event.usage[key] >= old.usage[key]);
        const decreases = Object.keys(total).every((key) => event.usage[key] <= old.usage[key]);
        if (increases) old.usage = event.usage;
        else if (!decreases) return null;
        if (old.model !== event.model) return null;
      }
    }
  }
  if (provider === 'claude') {
    for (const event of messages.values()) {
      if (event.last <= start || event.first > end) continue;
      // A message spanning a marker cannot be divided using recorded usage.
      if (event.first <= start || event.last > end) return null;
      total = add(total, event.usage);
      seen++;
      if (typeof event.model === 'string') models.add(event.model);
      else missingModel = true;
    }
  }
  return seen && validCounts(total) ? { ...total, model: missingModel ? null : [...models].sort().join(', ') || null } : null;
}

function runsFrom(markers) {
  const grouped = new Map();
  for (const marker of markers) {
    if (!marker || !['start', 'end'].includes(marker.event) || !/^jig-[a-z0-9-]+$/.test(marker.skill)
        || !/^\d+\.\d+\.\d+$/.test(marker.version) || !['codex', 'claude'].includes(marker.provider)
        || !/^[0-9a-f-]{36}$/.test(marker.runId) || !Number.isFinite(time(marker.time))
        || (marker.event === 'end' && !['passed', 'failed', 'stopped', 'partly'].includes(marker.outcome))) {
      throw new Error('Invalid telemetry markers');
    }
    const group = grouped.get(marker.runId) ?? [];
    group.push(marker);
    grouped.set(marker.runId, group);
  }
  return [...grouped.values()].map((group) => {
    const start = group.find((row) => row.event === 'start');
    const end = group.find((row) => row.event === 'end');
    const first = start ?? end;
    const complete = start && end && group.length === 2 && time(end.time) >= time(start.time)
      && start.skill === end.skill && start.version === end.version && start.provider === end.provider;
    return { skill: first.skill, version: first.version, runId: first.runId, provider: first.provider,
      start: start?.time ?? null, end: end?.time ?? null,
      durationMs: complete ? time(end.time) - time(start.time) : null,
      outcome: end?.outcome ?? 'stopped', model: null, input: null, cached: null, output: null,
      status: complete ? 'unmatched' : 'incomplete' };
  });
}

export async function report(project, { codexHome = join(homedir(), '.codex'), claudeHome = join(homedir(), '.claude') } = {}) {
  const root = resolve(project);
  try {
    const config = JSON.parse(await readFile(statePath(root, 'config.json'), 'utf8'));
    if (config.telemetry !== undefined && typeof config.telemetry !== 'boolean') throw new Error();
    if (config.telemetry === false) return { disabled: true, runs: [], summary: [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read project telemetry configuration');
  }
  const markers = [];
  try {
    await lines(statePath(root, 'telemetry.jsonl'), (line) => markers.push(JSON.parse(line)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read telemetry markers');
  }
  const runs = runsFrom(markers);
  for (const provider of new Set(runs.filter((run) => run.status !== 'incomplete').map((run) => run.provider))) {
    let records;
    try {
      const directory = provider === 'codex' ? join(codexHome, 'sessions')
        : join(claudeHome, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'));
      records = await Promise.all((await files(directory, provider === 'codex'))
        .map((file) => session(file, provider, identity(root))));
    } catch {
      records = [{ bad: true }];
    }
    for (const run of runs.filter((item) => item.provider === provider && item.status !== 'incomplete')) {
      // A damaged record could hide another matching session; do not guess.
      if (records.some((record) => record.bad)) { run.status = 'records-unreadable'; continue; }
      const start = time(run.start), end = time(run.end);
      const matches = records.filter((record) => record.paths.size === 1 && record.paths.has(identity(root))
        && record.ids.size === 1 && record.first <= end && record.last > start);
      if (matches.length !== 1) { run.status = matches.length ? 'ambiguous' : 'unmatched'; continue; }
      const usage = usageBetween(matches[0], provider, start, end);
      if (!usage) { run.status = 'usage-unavailable'; continue; }
      Object.assign(run, usage, { status: 'matched' });
    }
  }
  const groups = new Map();
  for (const run of runs) {
    const key = JSON.stringify([run.skill, run.provider, run.outcome]);
    const group = groups.get(key) ?? { skill: run.skill, provider: run.provider, outcome: run.outcome,
      runs: 0, durationMs: 0, input: 0, cached: 0, output: 0, unknownRuns: 0 };
    group.runs++;
    group.unknownRuns += run.input === null ? 1 : 0;
    for (const field of ['durationMs', 'input', 'cached', 'output']) {
      group[field] = group[field] === null || run[field] === null ? null : group[field] + run[field];
    }
    groups.set(key, group);
  }
  return { disabled: false, runs, summary: [...groups.values()] };
}

export function table(result) {
  if (result.disabled) return 'Telemetry is off.';
  const show = (value) => value === null ? 'unknown' : String(value);
  return ['Skill | Provider | Outcome | Runs | ms | Input | Cached | Output | Unknown runs',
    ...result.summary.map((row) => [row.skill, row.provider, row.outcome, row.runs, row.durationMs,
      row.input, row.cached, row.output, row.unknownRuns].map(show).join(' | '))].join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [project, ...args] = process.argv.slice(2);
    const options = {};
    let json = false;
    if (!project || project.startsWith('--')) throw new Error();
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') json = true;
      else if (['--codex-home', '--claude-home'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
        options[args[i] === '--codex-home' ? 'codexHome' : 'claudeHome'] = resolve(args[++i]);
      } else throw new Error();
    }
    const result = await report(project, options);
    if (!json) console.log(table(result));
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Cannot report telemetry. Check markers/configuration and arguments: node scripts/telemetry-report.mjs <project> [--json] [--codex-home <dir>] [--claude-home <dir>]');
    process.exitCode = 1;
  }
}
