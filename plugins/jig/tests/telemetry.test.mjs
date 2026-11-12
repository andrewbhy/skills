import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { report, table } from '../scripts/telemetry-report.mjs';
import { selectFields } from '../scripts/telemetry-fields.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = join(root, 'tests/fixtures/telemetry');
const stamp = (minute) => `2026-01-01T10:${minute}:00Z`;
const id = (digit = '1') => `${digit.repeat(8)}-1111-4111-8111-111111111111`;
const marker = (overrides = {}) => ({ event: 'start', skill: 'jig-verify', version: '0.1.0',
  runId: id(), provider: 'codex', time: stamp('01'), ...overrides });
const runCLI = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });

function setup(t, provider = 'codex') {
  // All files, including fake provider homes, stay in this worktree.
  const scratch = mkdtempSync(join(root, '.telemetry-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const project = join(scratch, 'project with spaces');
  const options = { codexHome: join(scratch, 'codex'), claudeHome: join(scratch, 'claude') };
  const put = (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  };
  const markers = (rows) => put(join(project, '.jig/telemetry.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const records = readFileSync(join(fixtureRoot, `${provider}.jsonl`), 'utf8').split('\n').filter(Boolean).map((line) => {
    const row = JSON.parse(line);
    if (row.cwd) row.cwd = project;
    if (row.payload?.cwd) row.payload.cwd = project;
    return row;
  });
  const transcript = provider === 'codex' ? join(options.codexHome, 'sessions/2026/01/01/session.jsonl')
    : join(options.claudeHome, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'), 'session.jsonl');
  const writeRecords = (rows = records, file = transcript) => put(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  markers([marker({ provider }), marker({ provider, event: 'end', time: stamp('04'), outcome: 'passed' })]);
  writeRecords();
  return { scratch, project, options, put, markers, records, transcript, writeRecords };
}

for (const [provider, expected] of [['codex', [130, 50, 15]], ['claude', [65, 30, 10]]]) {
  test(`${provider}: sums only recorded usage inside markers, without duplicate counts or contents`, async (t) => {
    const { project, options } = setup(t, provider);
    const result = await report(project, options);
    const [run] = result.runs;
    assert.equal(run.status, 'matched');
    assert.deepEqual([run.input, run.cached, run.output], expected);
    assert.equal(run.durationMs, 180000);
    assert.equal(run.model, `test-${provider}`);
    assert.equal(result.summary[0].runs, 1);
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC-PRIVATE-CONTENT'));
    assert.ok(!JSON.stringify(result).includes(project));
    const cli = runCLI('scripts/telemetry-report.mjs', [project, '--json', '--codex-home', options.codexHome, '--claude-home', options.claudeHome]);
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), result);
    assert.equal(cli.stderr, '');
    assert.match(table(result), /jig-verify \|/);
    const textCLI = runCLI('scripts/telemetry-report.mjs', [project, '--codex-home', options.codexHome, '--claude-home', options.claudeHome]);
    assert.equal(textCLI.status, 0, textCLI.stderr);
    assert.match(textCLI.stdout, /Skill \| Provider \| Outcome/);
    assert.ok(!textCLI.stdout.includes('SYNTHETIC-PRIVATE-CONTENT'));
    assert.ok(!textCLI.stdout.includes(project));
  });

  test(`${provider}: project mismatch and nonoverlapping windows stay unknown`, async (t) => {
    const { project, options, records, writeRecords, markers } = setup(t, provider);
    for (const row of records) {
      if (row.cwd) row.cwd += '-other';
      if (row.payload?.cwd) row.payload.cwd += '-other';
    }
    writeRecords();
    assert.equal((await report(project, options)).runs[0].status, 'unmatched');
    for (const row of records) {
      if (row.cwd) row.cwd = project;
      if (row.payload?.cwd) row.payload.cwd = project;
    }
    writeRecords();
    markers([marker({ provider, time: stamp('10') }), marker({ provider, event: 'end', time: stamp('15'), outcome: 'passed' })]);
    const result = await report(project, options);
    assert.equal(result.runs[0].input, null);
    assert.equal(result.summary[0].input, null);
    assert.match(table(result), /unknown/);
  });

  test(`${provider}: concurrent sessions, malformed records and missing usage do not become estimates`, async (t) => {
    const { project, options, records, writeRecords, transcript, put } = setup(t, provider);
    const second = join(dirname(transcript), 'other.jsonl');
    const copy = structuredClone(records);
    for (const row of copy) {
      if (row.sessionId) row.sessionId = 'second-session';
      if (row.type === 'session_meta') row.payload.id = 'second-session';
    }
    writeRecords(copy, second);
    assert.equal((await report(project, options)).runs[0].status, 'ambiguous');
    rmSync(second);
    put(transcript, readFileSync(transcript, 'utf8') + '{"secret":"SYNTHETIC-PRIVATE-CONTENT"');
    assert.equal((await report(project, options)).runs[0].status, 'records-unreadable');
    const noUsage = records.filter((row) => provider === 'codex' ? row.payload?.type !== 'token_count' : row.type !== 'assistant');
    noUsage.push({ timestamp: stamp('05'), type: 'user', cwd: project, sessionId: 'claude-fixture' });
    writeRecords(noUsage);
    assert.equal((await report(project, options)).runs[0].input, null);
  });
}

test('Codex millisecond token snapshots match despite a damaged unrelated session', async (t) => {
  const { project, options, markers, writeRecords, transcript, put } = setup(t);
  markers([
    marker({ time: '2026-01-01T10:01:03.715Z' }),
    marker({ event: 'end', time: '2026-01-01T10:01:43.237Z', outcome: 'passed' }),
  ]);
  const snapshots = [
    ['10:00:57.528', 100, 60, 10], ['10:01:04.068', 220, 160, 30],
    ['10:01:10.174', 360, 280, 60], ['10:01:29.727', 520, 420, 100],
    ['10:01:40.110', 700, 580, 150], ['10:01:43.277', 900, 760, 210],
    ['10:01:48.262', 1120, 960, 280],
  ];
  let previous = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
  const rows = [
    { type: 'session_meta', timestamp: stamp('00'), payload: { id: 'synthetic-session',
      cwd: process.platform === 'win32' ? project.replaceAll('\\', '/').toUpperCase() : project } },
    { type: 'turn_context', timestamp: stamp('00'), payload: { model: 'test-codex' } },
    ...snapshots.map(([clock, input_tokens, cached_input_tokens, output_tokens]) => {
      const total_token_usage = { input_tokens, cached_input_tokens, output_tokens };
      const last_token_usage = Object.fromEntries(Object.keys(previous)
        .map((key) => [key, total_token_usage[key] - previous[key]]));
      previous = total_token_usage;
      return { type: 'event_msg', timestamp: `2026-01-01T${clock}Z`, payload: {
        type: 'token_count', info: {
          total_token_usage: { ...total_token_usage, reasoning_output_tokens: 2, total_tokens: input_tokens + output_tokens },
          last_token_usage: { ...last_token_usage, reasoning_output_tokens: 0,
            total_tokens: last_token_usage.input_tokens + last_token_usage.output_tokens },
        },
      } };
    }),
  ];
  writeRecords(rows);
  const unrelated = join(dirname(transcript), 'unrelated.jsonl');
  put(unrelated, JSON.stringify({ type: 'session_meta', timestamp: stamp('00'),
    payload: { id: 'other-session', cwd: `${project}-other` } }) + '\n{"unfinished":');
  const [run] = (await report(project, options)).runs;
  assert.equal(run.status, 'matched');
  assert.deepEqual([run.input, run.cached, run.output], [600, 520, 140]);
  assert.equal(run.model, 'test-codex');

  // An unreadable header cannot establish that the session is unrelated.
  put(unrelated, '{"unfinished":');
  assert.equal((await report(project, options)).runs[0].status, 'records-unreadable');
});

test('Codex cumulative resets, missing counters and unsafe numeric values stay unknown', async (t) => {
  const { project, options, records, writeRecords } = setup(t);
  const usage = records.find((row) => row.timestamp === '2026-01-01T10:03:30Z').payload.info.total_token_usage;
  for (const value of [-1, 1, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    usage.input_tokens = value;
    writeRecords();
    assert.equal((await report(project, options)).runs[0].status, 'usage-unavailable');
  }
});

test('Claude message crossing marker boundary stays unknown', async (t) => {
  const { project, options, records, writeRecords } = setup(t, 'claude');
  records.find((row) => row.message?.id === 'a').timestamp = stamp('00');
  writeRecords();
  assert.equal((await report(project, options)).runs[0].status, 'usage-unavailable');
});

test('Claude invalid raw counts and inconsistent duplicate snapshots stay unknown', async (t) => {
  const { project, options, records, writeRecords } = setup(t, 'claude');
  const message = records.find((row) => row.message?.id === 'b').message;
  message.usage.input_tokens = -1;
  writeRecords();
  assert.equal((await report(project, options)).runs[0].status, 'usage-unavailable');
  message.usage.input_tokens = 20;
  const duplicate = records.filter((row) => row.message?.id === 'a')[1];
  duplicate.message.usage.input_tokens = 11;
  duplicate.message.usage.output_tokens = 3;
  writeRecords();
  assert.equal((await report(project, options)).runs[0].status, 'usage-unavailable');
});

test('Codex out-of-order counters stay unknown', async (t) => {
  const { project, options, records, writeRecords } = setup(t);
  records.find((row) => row.timestamp === '2026-01-01T10:03:30Z').timestamp = stamp('02');
  writeRecords();
  assert.equal((await report(project, options)).runs[0].status, 'usage-unavailable');
});

test('project matching respects the host path rules', async (t) => {
  const { project, options, records, writeRecords } = setup(t);
  const metadata = records.find((row) => row.type === 'session_meta').payload;
  metadata.cwd = project.replaceAll('\\', '/').toUpperCase();
  writeRecords();
  assert.equal((await report(project, options)).runs[0].status, process.platform === 'win32' ? 'matched' : 'unmatched');
});

test('incomplete runs and mixed known/unknown summary preserve unknowns', async (t) => {
  const { project, options, markers } = setup(t);
  markers([
    marker(), marker({ event: 'end', time: stamp('04'), outcome: 'passed' }),
    marker({ runId: id('2'), time: stamp('10') }),
    marker({ runId: id('2'), event: 'end', time: stamp('15'), outcome: 'passed' }),
    marker({ runId: id('3') }),
  ]);
  const result = await report(project, options);
  assert.equal(result.summary[0].runs, 2);
  assert.equal(result.summary[0].input, null);
  assert.equal(result.summary[0].unknownRuns, 1);
  assert.equal(result.runs[2].status, 'incomplete');
  assert.equal(result.runs[2].durationMs, null);
});

test('missing provider directory and malformed markers are explicit; disabled reads no records', async (t) => {
  const { project, options, put, markers } = setup(t);
  rmSync(options.codexHome, { recursive: true });
  assert.equal((await report(project, options)).runs[0].status, 'records-unreadable');
  markers([marker({ time: 'invalid' })]);
  await assert.rejects(report(project, options), /Invalid telemetry markers/);
  put(join(project, '.jig/config.json'), '{"telemetry":false}');
  assert.deepEqual(await report(project, options), { disabled: true, runs: [], summary: [] });
  put(join(project, '.jig/config.json'), '{"telemetry":"false"}');
  await assert.rejects(report(project, options), /configuration/);
});

test('standalone installed helper records its shipped version and respects off configuration', (t) => {
  const { scratch, project, put } = setup(t);
  const folder = join(scratch, 'installed/jig-verify');
  mkdirSync(folder, { recursive: true });
  cpSync(join(root, 'scripts/telemetry-marker.mjs'), join(folder, 'telemetry.mjs'));
  cpSync(join(root, 'scripts/jig-store.mjs'), join(folder, 'jig-store.mjs'));
  put(join(folder, 'VERSION'), '9.8.7\n');
  const helper = join(folder, 'telemetry.mjs');
  rmSync(join(project, '.jig/telemetry.jsonl'));
  const start = runCLI(helper, ['start', project, 'codex']);
  assert.equal(start.status, 0, start.stderr);
  const runId = start.stdout.trim();
  assert.match(runId, /^[a-f0-9-]{36}$/);
  const end = runCLI(helper, ['end', project, 'codex', runId, 'passed']);
  assert.equal(end.status, 0, end.stderr);
  const rows = readFileSync(join(project, '.jig/telemetry.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].runId, rows[1].runId);
  assert.equal(rows[0].version, '9.8.7');
  assert.equal(rows[0].skill, 'jig-verify');
  assert.equal(rows[1].outcome, 'passed');
  assert.deepEqual(Object.keys(rows[0]), ['event', 'skill', 'version', 'runId', 'provider', 'time']);
  put(join(project, '.jig/config.json'), '{"telemetry":false}');
  rmSync(join(project, '.jig/telemetry.jsonl'));
  assert.equal(runCLI(helper, ['start', project, 'claude']).stdout.trim(), 'off');
  assert.equal(runCLI(helper, ['end', project, 'claude', 'off', 'stopped']).status, 0);
  assert.equal(existsSync(join(project, '.jig/telemetry.jsonl')), false);
  put(join(project, '.jig/config.json'), '{bad config');
  const failed = runCLI(helper, ['start', project, 'claude']);
  assert.equal(failed.status, 1);
  assert.ok(!failed.stderr.includes(project));
  assert.equal(existsSync(join(project, '.jig/telemetry.jsonl')), false);
});

test('field projection skips nested content and rejects broken framing', () => {
  const projected = selectFields('{"message":{"content":[{"text":"private\\\"[]{}"}],"usage":{"input_tokens":3}},"extra":null}', { message: { usage: { input_tokens: true } } });
  assert.equal(projected.message.usage.input_tokens, 3);
  assert.ok(!JSON.stringify(projected).includes('private'));
  for (const invalid of ['{', '{} trailing', '{"a":', '[1,]', '{"ignored":"\\q"}', '{"ignored":"\\u123z"}', '{"ignored":"\n"}']) {
    assert.throws(() => selectFields(invalid, {}));
  }
});
