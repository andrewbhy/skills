import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Local-only usage snapshot. Output matches the coordinator prototype.
import { existsSync, readdirSync, statSync, createReadStream, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';

export const defaultStatusFile = () => process.env.USAGE_STATUS_FILE || join(homedir(), '.claude', 'usage-latest.json');
const date = value => {
  if (value == null) return null;
  const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(+d) ? d : null;
};
const used = obj => obj?.used_percentage ?? obj?.used_percent ?? obj?.utilization;
const reset = obj => date(obj?.resets_at ?? obj?.reset_at);
const percentage = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;

// Whitelist the capture fields: never retain prompts, project paths or metadata.
export function normalizeLimits(input) {
  const result = {};
  for (const [key, alias] of [['five_hour', 'fiveHour'], ['seven_day', 'sevenDay']]) {
    const obj = input?.[key] ?? input?.[alias], pct = used(obj), at = reset(obj);
    if (percentage(pct)) result[key] = { used_percentage: pct, ...(at ? { resets_at: at.toISOString() } : {}) };
  }
  return result;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : []);
}
async function* records(file) {
  if (!existsSync(file)) return;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes("rate_limits") && !line.includes("usage") && !line.includes("saved_at")) continue;
    try { yield JSON.parse(line); } catch { /* partial or malformed local record */ }
  }
}
function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

// Offset sources, in order: explicit flag or environment (handled by the caller),
// the Intl zone when it resolves, the Windows OS zone (Node's native offset can
// be wrong there when Intl has no zone), then Date's native offset.
export function parseOffset(text) {
  const m = String(text ?? '').trim().match(/^([+-])(\d{2}):(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}
export function osOffset() {
  if (process.platform !== 'win32') return null;
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Date).ToString('zzz')"], { encoding: 'utf8', timeout: 10000 });
    return parseOffset(r.stdout);
  } catch { return null; }
}
export function utcOffset(now, { os = osOffset } = {}) {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone) {
      const label = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
      if (label === 'GMT' || label === 'UTC') return 0;
      const m = label?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
      if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
    }
  } catch { /* Intl has no usable zone mapping */ }
  const fromOs = os();
  return Number.isInteger(fromOs) ? fromOs : -now.getTimezoneOffset();
}
const span = ms => {
  const m = Math.max(0, Math.round(ms / 6e4)), h = Math.floor(m / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m % 60}m`;
};
const squares = pct => {
  const n = Math.round(pct / 5), color = pct >= 90 ? '🟥' : pct >= 70 ? '🟨' : '🟩';
  return color.repeat(n) + '⬜'.repeat(20 - n);
};
// Pace compares the latest point with the earliest in the same reset window.
// Providers repeat the reset time with second-level jitter and concurrent
// sessions report slightly stale values, so windows group by minute and only a
// drop of more than DROP points below the window's peak counts as a real reset.
const DROP = 10;
const minute = d => Math.round(+d / 6e4);
function paceOf(points) {
  if (!points.length) return null;
  points.sort((a, b) => a.at - b.at);
  const cur = points.at(-1);
  const same = points.filter(p => minute(p.reset) === minute(cur.reset));
  let first = same[0], peak = first.pct;
  for (const p of same) {
    if (p.pct < peak - DROP) { first = p; peak = p.pct; } else peak = Math.max(peak, p.pct);
  }
  const days = (cur.at - first.at) / 864e5;
  const pace = days > 0.25 ? (cur.pct - first.pct) / days : null;
  const hitAt = pace > 0 ? new Date(+cur.at + (100 - cur.pct) / pace * 864e5) : null;
  return { cur, pace, hitAt, over: hitAt && hitAt < cur.reset };
}

export async function usageSnapshot({ codexDir, claudeDir, statusFile, now, offset }) {
  const local = d => new Date(+d + offset * 6e4);
  const fmt = d => local(d).toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const zone = `UTC${offset >= 0 ? '+' : '-'}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? ':' + String(Math.abs(offset) % 60).padStart(2, '0') : ''}`;
  const out = [`**Usage** · ${fmt(now)} (${zone})`];
  const points = [];
  const files = walk(codexDir).filter(f => f.endsWith('.jsonl')).filter(f => statSync(f).mtimeMs >= +now - 8 * 864e5);
  for (const f of files) for await (const rec of records(f)) {
    const limits = rec?.payload?.rate_limits ?? rec?.rate_limits;
    const weekly = [limits?.primary, limits?.secondary].find(o => o?.window_minutes === 10080);
    const at = date(rec?.timestamp), resets = reset(weekly), pct = used(weekly);
    if (at && at <= now && resets && percentage(pct)) points.push({ at, reset: resets, pct });
  }
  const c = paceOf(points);
  const paceRow = (label, p) => {
    if (p?.pace != null) out.push(`${label} ${p.pace.toFixed(1)} points a day · ${p.over ? `🟥 runs out ${fmt(p.hitAt)}, before reset` : '🟩 lasts to reset'}`);
  };
  if (c) {
    out.push(`Codex weekly ${squares(c.cur.pct)} **${Math.round(100 - c.cur.pct)}% left** (${c.cur.pct}% used) · resets ${fmt(c.cur.reset)} (in ${span(c.cur.reset - now)})`);
    paceRow('Codex pace', c);
  } else out.push('Codex: no rate-limit records found');

  const cap = readJson(statusFile), limits = normalizeLimits(cap?.rate_limits);
  for (const [label, key] of [['Claude 5-hour', 'five_hour'], ['Claude weekly', 'seven_day']]) {
    const obj = limits[key];
    if (!obj) continue;
    const pct = used(obj), at = reset(obj);
    out.push(`${label} ${squares(pct)} **${Math.round(100 - pct)}% left** (${Math.round(pct)}% used)${at ? ` · resets ${fmt(at)} (in ${span(at - now)})` : ''}`);
  }
  if (Object.keys(limits).length) {
    const saved = date(cap.saved_at);
    if (saved) out.push(`Claude limits captured ${fmt(saved)}`);
    const history = [];
    for await (const rec of records(join(dirname(statusFile), 'usage-history.jsonl'))) {
      const weekly = normalizeLimits(rec?.rate_limits).seven_day, at = date(rec?.saved_at), resets = reset(weekly);
      if (at && at <= now && resets && weekly) history.push({ at, reset: resets, pct: used(weekly) });
    }
    const weekly = limits.seven_day;
    if (saved && saved <= now && reset(weekly)) history.push({ at: saved, reset: reset(weekly), pct: used(weekly) });
    // The latest capture is authoritative even if history contains another window.
    paceRow('Claude weekly pace', paceOf(history.filter(p => weekly && minute(p.reset) === minute(reset(weekly)) && (!saved || p.at <= saved))));
  } else out.push('Claude: no status-line rate-limit records found');

  const byDay = {}, today = local(now).toISOString().slice(0, 10);
  for (const f of walk(claudeDir).filter(f => f.endsWith('.jsonl'))) for await (const rec of records(f)) {
    const at = date(rec?.timestamp), usage = rec?.message?.usage ?? rec?.usage;
    if (!at || at > now || !usage || typeof usage.output_tokens !== 'number' || !Number.isFinite(usage.output_tokens) || usage.output_tokens < 0) continue;
    const key = local(at).toISOString().slice(0, 10);
    byDay[key] = (byDay[key] ?? 0) + usage.output_tokens;
  }
  if (byDay[today] != null) {
    const days = Object.keys(byDay).sort().filter(k => k <= today).slice(-7), peak = Math.max(...days.map(k => byDay[k]), 1);
    const rel = byDay[today] / peak * 100, n = Math.round(rel / 5), M = n => (n / 1e6).toFixed(1) + 'M';
    out.push(`Claude today ${'🟦'.repeat(n)}${'⬜'.repeat(20 - n)} **${M(byDay[today])} output** (${Math.round(rel)}% of the busiest of the last 7 days)${Object.keys(limits).length ? '' : ' · limit % not recorded locally'}`);
    out.push(`Claude last 7 days ${days.map(k => k.slice(5) + ' ' + M(byDay[k])).join(' · ')}`);
  } else out.push('Claude: no transcript usage records for today');
  return out.join('  \n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values: v } = parseArgs({ options: Object.fromEntries(['claude-projects-dir', 'claude-project', 'codex-dir', 'status-file', 'utc-offset', 'now'].map(k => [k, { type: 'string' }])) });
    const now = v.now ? date(v.now) : new Date();
    if (!now) throw new Error('--now must be a date');
    const rawOffset = v['utc-offset'] ?? process.env.USAGE_UTC_OFFSET;
    const offset = rawOffset == null ? utcOffset(now) : Number(rawOffset);
    if (!Number.isInteger(offset) || Math.abs(offset) > 840 || rawOffset === '') throw new Error('UTC offset must be integer minutes from -840 to 840');
    const projects = v['claude-projects-dir'] ?? process.env.USAGE_CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');
    const project = v['claude-project'] ?? process.env.USAGE_CLAUDE_PROJECT;
    if (project && (project === '.' || project === '..' || /[\\/]/.test(project))) throw new Error('--claude-project must name one project folder');
    console.log(await usageSnapshot({ now, offset,
      codexDir: v['codex-dir'] ?? process.env.USAGE_CODEX_DIR ?? join(homedir(), '.codex', 'sessions'),
      claudeDir: project ? join(projects, project) : projects,
      statusFile: v['status-file'] ?? defaultStatusFile(),
    }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
