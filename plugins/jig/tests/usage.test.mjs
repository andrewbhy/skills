import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { utcOffset, parseOffset } from '../scripts/usage.mjs';

const now = '2026-11-09T12:00:00Z', reset = '2026-11-11T15:00:00Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-usage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const codex = join(root, 'sessions'), claude = join(root, 'projects'), status = join(root, 'capture', 'usage-latest.json');
  const write = (file, data) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, data); };
  const jsonl = (file, data) => write(file, data.map(r => JSON.stringify(r)).join('\n') + '\n');
  const cli = (script, args = [], input) => spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], {
    encoding: 'utf8', input, env: { ...process.env, USAGE_CODEX_DIR: codex, USAGE_CLAUDE_PROJECTS_DIR: claude, USAGE_CLAUDE_PROJECT: '', USAGE_STATUS_FILE: status, USAGE_UTC_OFFSET: '0' },
  });
  const usage = (args = []) => {
    const result = cli('usage', ['--now', now, ...args]);
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  return { root, codex, claude, status, write, jsonl, cli, usage };
}
function seed(f) {
  f.jsonl(join(f.codex, 'rollout.jsonl'), [
    { timestamp: '2026-11-07T12:00:00Z', payload: { rate_limits: { primary: { used_percent: 30, window_minutes: 10080, resets_at: Date.parse(reset) / 1000 } } } },
    // Real sessions can put the weekly allowance in secondary, in any key order.
    { timestamp: now, payload: { rate_limits: { primary: { used_percent: 99, window_minutes: 300 }, secondary: { resets_at: Date.parse(reset) / 1000, window_minutes: 10080, used_percent: 70 } } } },
  ]);
  f.write(f.status, JSON.stringify({ saved_at: now, rate_limits: {
    five_hour: { utilization: 25, resets_at: '2026-11-09T14:30:00Z' }, seven_day: { used_percentage: 80, resets_at: reset },
  } }));
  f.jsonl(join(f.status, '..', 'usage-history.jsonl'), [
    { saved_at: '2026-11-01T12:00:00Z', rate_limits: { seven_day: { used_percent: 99, resets_at: '2026-11-04T12:00:00Z' } } },
    { saved_at: '2026-11-07T12:00:00Z', rate_limits: { seven_day: { used_percent: 40, resets_at: reset } } },
  ]);
  f.jsonl(join(f.claude, 'one', 'session.jsonl'), [{ timestamp: now, message: { usage: { output_tokens: 1000000 } } }]);
  f.jsonl(join(f.claude, 'two', 'session.jsonl'), [{ timestamp: now, message: { usage: { output_tokens: 2000000 } } }]);
}

test('[risk: wrong allowance or output format] fixture snapshot preserves prototype rows, countdowns and pace with weekly secondary records', t => {
  const f = fixture(t); seed(f);
  assert.equal(f.usage(), [
    '**Usage** · Mon 9 Nov, 12:00 (UTC+0)',
    `Codex weekly ${'🟨'.repeat(14)}${'⬜'.repeat(6)} **30% left** (70% used) · resets Wed 11 Nov, 15:00 (in 2d 3h)`,
    'Codex pace 20.0 points a day · 🟥 runs out Wed 11 Nov, 00:00, before reset',
    `Claude 5-hour ${'🟩'.repeat(5)}${'⬜'.repeat(15)} **75% left** (25% used) · resets Mon 9 Nov, 14:30 (in 2h 30m)`,
    `Claude weekly ${'🟨'.repeat(16)}${'⬜'.repeat(4)} **20% left** (80% used) · resets Wed 11 Nov, 15:00 (in 2d 3h)`,
    'Claude limits captured Mon 9 Nov, 12:00',
    'Claude weekly pace 20.0 points a day · 🟥 runs out Tue 10 Nov, 12:00, before reset',
    `Claude today ${'🟦'.repeat(20)} **3.0M output** (100% of the busiest of the last 7 days)`,
    'Claude last 7 days 11-09 3.0M',
  ].join('  \n') + '\n');
});

test('[risk: offset applied in the wrong direction] explicit -420 and +540 offsets change rows and token day boundaries', t => {
  const f = fixture(t); seed(f);
  f.jsonl(join(f.claude, 'three', 'early.jsonl'), [{ timestamp: '2026-11-09T03:00:00Z', usage: { output_tokens: 4000000 } }]);
  const west = f.usage(['--utc-offset=-420']), east = f.usage(['--utc-offset=540']);
  assert.match(west, /Mon 9 Nov, 05:00 \(UTC-7\)/);
  assert.match(west, /resets Wed 11 Nov, 08:00 \(in 2d 3h\)/);
  assert.match(west, /\*\*3.0M output\*\* \(75%/);
  assert.match(east, /Mon 9 Nov, 21:00 \(UTC\+9\)/);
  assert.match(east, /resets Thu 12 Nov, 00:00 \(in 2d 3h\)/);
  assert.match(east, /\*\*7.0M output\*\*/);
});

test('[risk: flags ignored or projects lost] flags override environment and one project can be selected', t => {
  const f = fixture(t); seed(f);
  assert.match(f.usage(['--claude-project', 'one']), /\*\*1.0M output\*\*/);
  const output = f.usage(['--codex-dir', join(f.root, 'missing'), '--claude-projects-dir', join(f.root, 'empty'), '--status-file', join(f.root, 'none')]);
  assert.match(output, /Codex: no rate-limit records found/);
  assert.doesNotMatch(output, /% left|output\*\*/);
  assert.notEqual(f.cli('usage', ['--utc-offset=nope']).status, 0);
  assert.notEqual(f.cli('usage', ['--claude-project', '..']).status, 0);
});

test('[risk: missing sources crash or invent allowance] missing sources each print one plain line', t => {
  const f = fixture(t);
  assert.equal(f.usage(), ['**Usage** · Mon 9 Nov, 12:00 (UTC+0)', 'Codex: no rate-limit records found', 'Claude: no status-line rate-limit records found', 'Claude: no transcript usage records for today'].join('  \n') + '\n');
});

test('[risk: pace extrapolates a reset or ignores a slow allowance] pace stays within one window and reports lasts to reset', t => {
  const f = fixture(t); seed(f);
  f.jsonl(join(f.codex, 'rollout.jsonl'), [
    { timestamp: '2026-11-07T12:00:00Z', rate_limits: { primary: { used_percent: 10, window_minutes: 10080, resets_at: Date.parse(reset) / 1000 } } },
    { timestamp: now, rate_limits: { primary: { used_percent: 12, window_minutes: 10080, resets_at: Date.parse(reset) / 1000 } } },
  ]);
  assert.match(f.usage(), /Codex pace 1.0 points a day · 🟩 lasts to reset/);
  f.write(join(f.status, '..', 'usage-history.jsonl'), 'partial record\n');
  assert.doesNotMatch(f.usage(), /Claude weekly pace/);
  f.write(join(f.codex, 'rollout.jsonl'), 'partial record\n');
  assert.match(f.usage(), /Codex: no rate-limit records found/);
});

test('[risk: transcript or prompt data stored by capture] status-line capture writes latest and appends only whitelisted allowance fields', t => {
  const f = fixture(t);
  const payload = JSON.stringify({ prompt: 'private text', cwd: 'private location', rate_limits: {
    fiveHour: { used_percent: 10, resets_at: Date.parse('2026-11-09T14:30:00Z') / 1000, prompt: 'nested text' },
    sevenDay: { utilization: 70, reset_at: reset, path: 'private location' }, other: { path: 'secret' },
  } });
  for (const at of ['2026-11-08T12:00:00Z', now]) {
    const result = f.cli('statusline-usage', ['--now', at], payload);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '');
  }
  const latest = readFileSync(f.status, 'utf8'), history = readFileSync(join(f.status, '..', 'usage-history.jsonl'), 'utf8');
  assert.doesNotMatch(latest + history, /prompt|path|cwd|private|secret/);
  const expected = { saved_at: '2026-11-09T12:00:00.000Z', rate_limits: {
    five_hour: { used_percentage: 10, resets_at: '2026-11-09T14:30:00.000Z' },
    seven_day: { used_percentage: 70, resets_at: '2026-11-11T15:00:00.000Z' },
  } };
  assert.deepEqual(JSON.parse(latest), expected);
  assert.equal(history.trim().split('\n').length, 2);
  assert.deepEqual(JSON.parse(history.trim().split('\n')[1]), expected);
  assert.equal(f.cli('statusline-usage', ['--now', now], '{"prompt":"only"}').status, 0);
  assert.equal(readFileSync(join(f.status, '..', 'usage-history.jsonl'), 'utf8'), history);
});

test('[risk: Intl fallback changes time silently] offset resolution handles both resolved zone and missing Intl mapping', () => {
  const original = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = function (...args) { return new original(...(args.length ? args : ['en-US', { timeZone: 'Asia/Tokyo' }])); };
    assert.equal(utcOffset(new Date(now)), 540);
    Intl.DateTimeFormat = () => { throw new Error('no zone'); };
    assert.equal(utcOffset(new Date(now), { os: () => null }), -new Date(now).getTimezoneOffset());
  } finally { Intl.DateTimeFormat = original; }
});

test('[risk: OS zone ignored] offset order is Intl zone, then OS zone, then native offset', () => {
  const original = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = () => { throw new Error('no zone'); };
    assert.equal(utcOffset(new Date(now), { os: () => -420 }), -420);
    assert.equal(utcOffset(new Date(now), { os: () => null }), -new Date(now).getTimezoneOffset());
    Intl.DateTimeFormat = function (...args) { return new original(...(args.length ? args : ['en-US', { timeZone: 'Asia/Tokyo' }])); };
    assert.equal(utcOffset(new Date(now), { os: () => -420 }), 540);
  } finally { Intl.DateTimeFormat = original; }
  assert.equal(parseOffset('-07:00\r\n'), -420);
  assert.equal(parseOffset('+05:30'), 330);
  assert.equal(parseOffset('garbage'), null);
});

test('[risk: pace restarts on stale-session jitter] one-second reset jitter and one-point dips keep the window baseline; a big drop restarts it', t => {
  const f = fixture(t), at = h => new Date(Date.parse('2026-11-06T12:00:00Z') + h * 36e5).toISOString();
  const rec = (h, pct, jitter) => ({ timestamp: at(h), payload: { rate_limits: { primary: { used_percent: pct, window_minutes: 10080, resets_at: Date.parse(reset) / 1000 + jitter } } } });
  // 0 -> 24 over 48 hours with stale dips: 12 points a day.
  f.jsonl(join(f.codex, 'rollout.jsonl'), [rec(0, 0, 0), rec(12, 6, 1), rec(11.9, 5, 0), rec(24, 12, 0), rec(36, 18, 1), rec(35.9, 17, 0), rec(48, 24, 1)]);
  assert.match(f.usage(), /Codex pace 12\.0 points a day/);
  // A real reset (drop over 10 points) restarts from the lower point.
  f.jsonl(join(f.codex, 'rollout.jsonl'), [rec(0, 80, 0), rec(24, 5, 0), rec(48, 11, 0)]);
  assert.match(f.usage(), /Codex pace 6.0 points a day/);
});
