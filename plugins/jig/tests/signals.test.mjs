import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { addSignal, listSignals, withSignalLock, setSignal, consumeSignals, pruneSignals, reportSignals } from '../scripts/signals.mjs';

const cli = resolve('scripts/signals.mjs');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-signals-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const options = { root, home };
  const env = { ...process.env, JIG_SIGNALS_HOME: home, JIG_SIGNALS_PROJECT: root };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  const row = (overrides = {}) => ({ project: 'fixture', level: 'project', kind: 'escape', area: 'runner', item: 'fixture incident', caughtBy: 'test', ...overrides });
  return { root, home, options, env, run, row, log: join(root, '.jig/signals.jsonl') };
}
test('[risk: kinds and fields drift] CLI refuses unknown kind and missing field', t => {
  const f = fixture(t);
  for (const row of [f.row({ kind: 'repeat' }), f.row({ area: undefined }), f.row({ cost: { minutes: -1 } })]) {
    const result = f.run('add', JSON.stringify(row));
    assert.equal(result.status, 1); assert.match(result.stderr, /kinds:|area|cost/);
  }
});
test('[risk: home detail leaks] routing and minimal detail preserve structured fields', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '.jig')); writeFileSync(join(f.root, '.jig/config.json'), JSON.stringify({ signals: { detail: 'minimal' } }));
  addSignal(f.row({ level: 'jig', what: 'private', proposedFix: 'private', cost: { rounds: 2 }, detailLink: 'local' }), f.options);
  addSignal(f.row(), f.options);
  const [row] = listSignals({ ...f.options, level: 'jig' });
  assert.equal(row.what, undefined); assert.equal(row.proposedFix, undefined);
  assert.deepEqual(row.cost, { rounds: 2 }); assert.equal(row.detailLink, 'local');
  assert.equal(listSignals({ ...f.options, level: 'project' }).length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.home, 'signals.jsonl'), 'utf8')).level, 'jig');
});
test('[risk: concurrent writes lose records] two processes write intact lines; busy and stale locks', async t => {
  const f = fixture(t);
  const write = id => new Promise(resolveDone => {
    const child = spawn(process.execPath, [cli, 'add', JSON.stringify(f.row({ id }))], { env: f.env, stdio: 'ignore' });
    child.on('exit', code => resolveDone(code));
  });
  // Busy writers may retry after the lock holder completes; no lost append.
  const results = await Promise.all([write('one'), write('two')]);
  for (let i = 0; i < results.length; i++) if (results[i] === 2) assert.equal(await write(i === 0 ? 'one' : 'two'), 0); else assert.equal(results[i], 0);
  assert.equal(listSignals(f.options).length, 2);
  withSignalLock(f.log, () => assert.equal(f.run('add', JSON.stringify(f.row())).status, 2));
  writeFileSync(`${f.log}.lock`, ''); utimesSync(`${f.log}.lock`, new Date(0), new Date(0));
  assert.equal(f.run('add', JSON.stringify(f.row())).status, 0);
});
test('[risk: decision cannot be added] set updates optional fields and refuses required fields or unknown ids', t => {
  const f = fixture(t), row = addSignal(f.row(), f.options);
  assert.equal(f.run('set', row.id, 'decision', JSON.stringify('continue')).status, 0);
  assert.equal(listSignals(f.options)[0].decision, 'continue');
  assert.equal(f.run('set', row.id, 'kind', JSON.stringify('escape')).status, 1);
  assert.equal(f.run('set', 'absent', 'decision', JSON.stringify('stop')).status, 1);
  setSignal(row.id, 'cost', { minutes: 1 }, f.options);
});

test('[risk: abandoned reaper blocks writes forever] fake clock keeps fresh reapers and takes over after 30 seconds', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '.jig'));
  const lock = `${f.log}.lock`, reaper = `${lock}.reaper`;
  for (const path of [lock, reaper]) { writeFileSync(path, ''); utimesSync(path, new Date(0), new Date(0)); }
  let calls = 0;
  assert.throws(() => withSignalLock(f.log, () => calls++, 30000), /Signal lock busy/);
  assert.ok(existsSync(reaper));
  withSignalLock(f.log, () => calls++, 30001);
  assert.equal(calls, 1);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(reaper), false);
});
test('[risk: repeats hidden] same kind/area and earlier missed-problem class produce repeatOf', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'docs'));
  writeFileSync(join(f.root, 'docs/missed-problems.jsonl'), [
    { id: 'mp-first', class: 'capture', area: 'design' }, { id: 'mp-next', class: 'capture', area: 'design' }
  ].map(JSON.stringify).join('\n'));
  const first = addSignal(f.row({ mpId: 'mp-first' }), f.options);
  assert.equal(addSignal(f.row(), f.options).repeatOf, first.id);
  assert.equal(addSignal(f.row({ kind: 'coordinator-error', mpId: 'mp-next' }), f.options).repeatOf, first.id);
});
test('[risk: reports leak levels or detail and count wrong] isolated levels, totals, repeats and stdout environment', t => {
  const f = fixture(t);
  addSignal(f.row({ what: 'RAW PRIVATE DETAIL', cost: { minutes: 3 } }), f.options);
  addSignal(f.row({ caughtBy: 'retro-sweep', cost: { rounds: 2 } }), f.options);
  addSignal(f.row({ kind: 'skill-gap', skill: 'fixture' }), f.options);
  addSignal(f.row({ level: 'jig', kind: 'dependency' }), f.options);
  addSignal(f.row({ level: 'environment', kind: 'confusion' }), f.options);
  const project = reportSignals({ ...f.options, level: 'project' });
  assert.match(project.text, /Signals: 3/); assert.match(project.text, /3 minutes; 2 rounds/);
  assert.match(project.text, /Unrecorded: 1/); assert.match(project.text, /Repeats \(1\)/);
  assert.match(project.text, /escape: 2/); assert.match(project.text, /skill fixture/);
  assert.match(project.text, /confusion: 0/); assert.match(project.text, /dependency: 0/);
  assert.doesNotMatch(project.text, /RAW PRIVATE DETAIL/); assert.ok(existsSync(project.path));
  const home = reportSignals({ ...f.options, level: 'jig' });
  assert.match(home.text, /Signals: 1/); assert.match(home.text, /dependency: 1/);
  assert.match(home.text, /escape: 0/); assert.match(home.text, /confusion: 0/);
  const environment = reportSignals({ ...f.options, level: 'environment' });
  assert.equal(environment.path, undefined); assert.match(environment.text, /Signals: 1/);
  assert.match(environment.text, /confusion: 1/); assert.equal(existsSync(join(f.root, '.jig/retros', `${new Date().toISOString().slice(0,10)}-environment.md`)), false);
  assert.match(environment.text, /escape: 0/); assert.match(environment.text, /dependency: 0/);
  assert.equal(f.run('report', '--level', 'environment').status, 0);
  const out = join(f.root, 'chosen.md'); reportSignals({ ...f.options, level: 'environment', out }); assert.ok(existsSync(out));
  assert.equal(listSignals({ ...f.options, since: '9999-01-01' }).length, 0);
});
test('[risk: prune deletes open work] consumed 29/31 days and unconsumed 60/181 days with protected skill records', t => {
  const f = fixture(t), now = Date.parse('2026-11-08');
  const date = days => new Date(now - days * 86400000).toISOString().slice(0, 10);
  for (const [id, days, consumed, kind] of [['c29',29,true,'escape'], ['c31',31,true,'escape'], ['u60',60,false,'escape'], ['u181',181,false,'escape'], ['gap',200,false,'skill-gap'], ['misguided',200,false,'skill-misguided']]) {
    addSignal(f.row({ id, date: date(days), kind, ...(consumed ? { consumedBy: 'retro' } : {}) }), f.options);
  }
  const rows = pruneSignals({ ...f.options, now });
  assert.deepEqual(rows.map(r => r.id), ['c29', 'u60', 'gap', 'misguided']);
  consumeSignals(['gap', 'misguided'], 'skill-plan', f.options);
  assert.deepEqual(pruneSignals({ ...f.options, now }).map(r => r.id), ['c29', 'u60']);
});
test('[risk: retro records pushed] bare project writers append ignore rules without changing existing bytes; no tracked private logs', t => {
  const f = fixture(t);
  execFileSync('git', ['init', '-q', f.root]);
  addSignal(f.row(), f.options);
  const ignore = join(f.root, '.gitignore');
  assert.equal(readFileSync(ignore, 'utf8'), '/.jig/signals.jsonl\n/.jig/retros/\n');
  const original = '# keep these bytes\r\n/dist\r\n/.jig/signals.jsonl';
  writeFileSync(ignore, original);
  addSignal(f.row(), f.options);
  const expected = original + '\n/.jig/retros/\n';
  assert.equal(readFileSync(ignore, 'utf8'), expected);
  addSignal(f.row({ level: 'environment' }), f.options);
  pruneSignals(f.options);
  assert.equal(readFileSync(ignore, 'utf8'), expected);
  for (const path of ['.jig/signals.jsonl', '.jig/retros/sample.md']) assert.equal(spawnSync('git', ['check-ignore', path], { cwd: f.root }).status, 0, path);
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  assert.deepEqual(tracked.filter(path => /(?:^|\/)\.jig\/retros\/|(?:^|\/)signals\.jsonl$/.test(path)), []);
});
