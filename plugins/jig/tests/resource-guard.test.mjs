import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, hostname, homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { acquireBrowserSlot, checkMemory, readBrowserConfig, ResourceGuardError } from '../scripts/resource-guard.mjs';

const guardURL = new URL('../scripts/resource-guard.mjs', import.meta.url).href;
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jig-resource-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function putConfig(root, config) {
  mkdirSync(join(root, '.jig'), { recursive: true });
  writeFileSync(join(root, '.jig/config.json'), typeof config === 'string' ? config : JSON.stringify(config));
}
function deadPID() {
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  return Number(child.stdout.trim());
}
function seedOwner(dir, owner = {}) {
  writeFileSync(join(dir, 'slot-0.json'), JSON.stringify({ pid: process.pid, start: new Date().toISOString(), host: hostname(), ...owner }));
}

// Real independent Node processes, held until the parent asks them to release.
// No browser dependency is imported or launched by these workers.
async function worker(t, dir, waitMs = 0) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { acquireBrowserSlot } from ${JSON.stringify(guardURL)};
    let release;
    process.on('message', async message => {
      if (message === 'acquire') {
        try { release = await acquireBrowserSlot({ dir: process.argv[1], waitMs: Number(process.argv[2]) }); process.send('acquired'); }
        catch { process.send('refused'); }
      } else if (message === 'release') { release?.(); process.send('released'); }
      else if (message === 'exit') process.exit(0);
      else if (message === 'error') throw new Error('planted failure');
      else if (message === 'SIGINT' || message === 'SIGTERM') process.emit(message);
    });
    process.send('ready');
  `, dir, String(waitMs)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  });
  await once(child, 'message');
  return { child, ask: async message => { const reply = once(child, 'message'); child.send(message); return (await reply)[0]; } };
}

test('[risk: memory exhaustion] rejects below threshold using an injected reading', () => {
  assert.throws(() => checkMemory({ freeBytes: 3.1 * 2 ** 30 }), /memory: 3.1 GB free, need 4/);
  assert.throws(() => checkMemory({ minFreeGB: NaN, freeBytes: 8 * 2 ** 30 }), ResourceGuardError);
});

test('[risk: healthy machines cannot check visuals] accepts at and above configured memory threshold', () => {
  assert.equal(checkMemory({ freeBytes: 4 * 2 ** 30 }), 4);
  assert.equal(checkMemory({ minFreeGB: 5, freeBytes: 6 * 2 ** 30 }), 6);
});

test('[risk: parallel browsers exceed capacity] refuses a live process owner regardless of age', async t => {
  const dir = fixture(t);
  seedOwner(dir, { start: '2000-01-01T00:00:00.000Z' });
  await assert.rejects(acquireBrowserSlot({ dir }), /no free browser slot/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'slot-0.json'))).pid, process.pid);
});

test('[risk: crashed sessions block all checks] reclaims a dead PID slot', async t => {
  const dir = fixture(t);
  seedOwner(dir, { pid: deadPID() });
  const release = await acquireBrowserSlot({ dir });
  try {
    const owner = JSON.parse(readFileSync(join(dir, 'slot-0.json')));
    assert.equal(owner.pid, process.pid);
    assert.equal(owner.host, hostname());
    assert.ok(Number.isFinite(Date.parse(owner.start)));
  } finally { release(); }
});

test('[risk: competing processes both launch] exactly one concurrent acquirer succeeds for empty and stale slots', { timeout: 10000 }, async t => {
  const dir = fixture(t);
  const a = await worker(t, dir), b = await worker(t, dir);
  for (const stale of [false, true, true, true, true, true]) {
    if (stale) seedOwner(dir, { pid: deadPID() });
    const outcomes = await Promise.all([a.ask('acquire'), b.ask('acquire')]);
    assert.deepEqual([...outcomes].sort(), ['acquired', 'refused']);
    assert.equal(await (outcomes[0] === 'acquired' ? a : b).ask('release'), 'released');
    assert.deepEqual(readdirSync(dir), []);
  }
});

test('[risk: capacity leaks after close] release is idempotent and frees the slot', async t => {
  const dir = fixture(t);
  const release = await acquireBrowserSlot({ dir });
  release(); release();
  const next = await acquireBrowserSlot({ dir });
  next();
  assert.deepEqual(readdirSync(dir), []);
});

test('[risk: requested capacity or wait ignored] honors N slots, bounded wait and delayed release', { timeout: 10000 }, async t => {
  const dir = fixture(t);
  const first = await acquireBrowserSlot({ dir, slots: 2 });
  const second = await acquireBrowserSlot({ dir, slots: 2 });
  try {
    const start = performance.now();
    await assert.rejects(acquireBrowserSlot({ dir, slots: 2, waitMs: 60 }), /no free browser slot/);
    assert.ok(performance.now() - start >= 45);
    const waiting = await worker(t, dir, 2000);
    const pending = waiting.ask('acquire');
    const timer = setTimeout(first, 100);
    t.after(() => clearTimeout(timer));
    assert.equal(await pending, 'acquired');
    assert.equal(await waiting.ask('release'), 'released');
  } finally { first(); second(); }
});

test('[risk: process exit leaks capacity] normal exit, uncaught error and signal handlers release ownership', { timeout: 10000 }, async t => {
  const dir = fixture(t);
  for (const message of ['exit', 'error', 'SIGINT', 'SIGTERM']) {
    const owner = await worker(t, dir);
    assert.equal(await owner.ask('acquire'), 'acquired');
    const exited = once(owner.child, 'exit'); owner.child.send(message); await exited;
    if (message === 'SIGINT' || message === 'SIGTERM') assert.equal(owner.child.exitCode, message === 'SIGINT' ? 130 : 143);
    assert.deepEqual(readdirSync(dir), []);
  }
});

test('[risk: forced termination leaks capacity] dead worker ownership is recoverable', { timeout: 10000 }, async t => {
  const dir = fixture(t);
  const owner = await worker(t, dir);
  assert.equal(await owner.ask('acquire'), 'acquired');
  const exited = once(owner.child, 'exit'); owner.child.kill('SIGKILL'); await exited;
  const release = await acquireBrowserSlot({ dir }); release();
  assert.deepEqual(readdirSync(dir), []);
});

test('[risk: uncertain ownership is stolen] malformed, foreign-host and abandoned reclaim barriers refuse', async t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'slot-0.json'), '{');
  await assert.rejects(acquireBrowserSlot({ dir }), /no free browser slot/);
  seedOwner(dir, { pid: deadPID(), host: `${hostname()}-other` });
  await assert.rejects(acquireBrowserSlot({ dir }), /no free browser slot/);
  rmSync(join(dir, 'slot-0.json'));
  writeFileSync(join(dir, 'slot-0.json.reclaim'), '');
  await assert.rejects(acquireBrowserSlot({ dir }), /no free browser slot/);
});

test('[risk: settings silently weaken the guard] reads defaults, project-relative paths and one-run overrides', t => {
  const root = fixture(t);
  assert.deepEqual(readBrowserConfig(root, {}), { minFreeGB: 4, slots: 1, dir: join(homedir(), '.jig', 'browser-slots') });
  putConfig(root, { telemetry: false, browser: { minFreeGB: 5, slots: 2, lockDir: 'shared-locks' } });
  assert.deepEqual(readBrowserConfig(root, {}), { minFreeGB: 5, slots: 2, dir: join(root, 'shared-locks') });
  assert.deepEqual(readBrowserConfig(root, { JIG_NO_BROWSER: '0', JIG_BROWSER_MIN_FREE_GB: '6.5', JIG_BROWSER_SLOTS: '3' }),
    { minFreeGB: 6.5, slots: 3, dir: join(root, 'shared-locks') });
});

test('[risk: invalid config bypasses protection] malformed or unreadable configuration and invalid overrides fail closed', t => {
  const root = fixture(t);
  for (const config of ['{', 'null', '[]', 'false', { browser: null }, { browser: [] }, { browser: false },
    { browser: { minFreeGB: '4' } }, { browser: { minFreeGB: 0 } }, { browser: { minFreeGB: -1 } },
    { browser: { slots: 0 } }, { browser: { slots: 1.5 } }, { browser: { lockDir: '' } },
    { browser: { lockDir: 1 } }, { browser: { lockDir: 'a\nb' } }, { browser: { slot: 1 } }]) {
    putConfig(root, config);
    assert.throws(() => readBrowserConfig(root, {}), ResourceGuardError);
  }
  // A valid override must not mask bad project configuration.
  assert.throws(() => readBrowserConfig(root, { JIG_BROWSER_SLOTS: '1' }), ResourceGuardError);
  putConfig(root, {});
  for (const name of ['JIG_BROWSER_MIN_FREE_GB', 'JIG_BROWSER_SLOTS']) {
    for (const value of ['', ' ', '0', '-1', 'Infinity', 'NaN', '0x10', 'bad']) {
      assert.throws(() => readBrowserConfig(root, { [name]: value }), ResourceGuardError);
    }
  }
  rmSync(join(root, '.jig/config.json'));
  mkdirSync(join(root, '.jig/config.json'));
  assert.throws(() => readBrowserConfig(root, {}), /config: cannot read/);
});

test('[risk: sandbox write denial proceeds unguarded] unwritable lock directory refuses', t => {
  const dir = fixture(t);
  const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  const result = spawnSync(process.execPath, [permissionFlag, '--allow-fs-read=*', '--input-type=module', '-e', `
    import { acquireBrowserSlot } from ${JSON.stringify(guardURL)};
    try { await acquireBrowserSlot({ dir: process.argv[1] }); process.exitCode = 1; }
    catch (error) { console.log(error.message); }
  `, dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /slots: cannot write lock directory/);
  assert.deepEqual(readdirSync(dir), []);
});

test('[risk: helpers launch despite guard refusal] both CLI helpers emit JSON skip and exit 2 before Chrome', t => {
  const root = fixture(t);
  for (const name of ['visual-clip', 'visual-motion']) {
    const helper = fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url));
    const result = spawnSync(process.execPath, [helper, '--url', 'http://127.0.0.1:1', '--out', join(root, name)], {
      cwd: root, encoding: 'utf8', env: { ...process.env, CHROME_PATH: join(root, 'no-chrome'), JIG_NO_BROWSER: '0', JIG_BROWSER_MIN_FREE_GB: '9007199254740991', JIG_BROWSER_SLOTS: '1' },
    });
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'inconclusive');
    assert.match(report.skipped, /^memory: .* GB free, need /);
    assert.deepEqual(report.runs, []);
    assert.deepEqual(JSON.parse(readFileSync(join(root, name, name === 'visual-clip' ? 'clip.json' : 'motion.json'))), report);
  }
});

test('[risk: non-memory refusals lose exit contract] both helpers report busy slots, invalid config and unusable lock directories', t => {
  const root = fixture(t);
  const locks = join(root, 'locks'); mkdirSync(locks);
  const notDirectory = join(root, 'file'); writeFileSync(notDirectory, '');
  seedOwner(locks);
  for (const [config, reason] of [
    [{ browser: { lockDir: locks } }, /^slots: no free browser slot/],
    [{ browser: { slots: 'bad' } }, /^config: invalid browser settings/],
    [{ browser: { lockDir: notDirectory } }, /^slots: cannot write lock directory/],
  ]) {
    putConfig(root, config);
    for (const name of ['visual-clip', 'visual-motion']) {
      const helper = fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url));
      const result = spawnSync(process.execPath, [helper, '--url', 'http://127.0.0.1:1', '--out', join(root, name)], {
        cwd: root, encoding: 'utf8', env: { ...process.env, CHROME_PATH: join(root, 'no-chrome'), JIG_NO_BROWSER: '0', JIG_BROWSER_MIN_FREE_GB: '0.000001', JIG_BROWSER_SLOTS: '1' },
      });
      assert.equal(result.status, 2, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.status, 'inconclusive');
      assert.match(report.skipped, reason);
      assert.deepEqual(report.runs, []);
    }
  }
});
import { EventEmitter } from 'node:events';
import { launchChrome, runClip, argumentsFor } from '../scripts/visual-clip.mjs';
import { runMotion } from '../scripts/visual-motion.mjs';
import { checkArguments, runSequentialCheck } from '../scripts/visual-check.mjs';
test('[risk: shared guard bypassed] clip, motion and check invoke guard before launch via a spy', async t => {
  const root = fixture(t), previous = process.env.JIG_NO_BROWSER; process.env.JIG_NO_BROWSER = '0';
  t.after(() => { if (previous === undefined) delete process.env.JIG_NO_BROWSER; else process.env.JIG_NO_BROWSER = previous; });
  for (const name of ['clip', 'motion', 'check']) {
    const calls = [], guard = { readBrowserConfig: () => { calls.push('config'); return {}; }, checkMemory: () => calls.push('memory'), acquireBrowserSlot: async () => { calls.push('slot'); throw new ResourceGuardError('slots: planted busy'); } };
    const launch = () => launchChrome({ root, guard, launch: async () => { calls.push('BROWSER'); throw Error('unexpected'); } });
    const options = name === 'check' ? checkArguments(['--url','http://127.0.0.1:1','--out',join(root,name)]) : argumentsFor(['--url','http://127.0.0.1:1','--out',join(root,name)], name === 'motion');
    const report = await (name === 'clip' ? runClip : name === 'motion' ? runMotion : runSequentialCheck)(options, { launch });
    assert.deepEqual(calls, ['config','memory','slot']); assert.equal(report.status, 'inconclusive'); assert.match(report.skipped, /planted busy/);
  }
});
test('[risk: guard slot leaks on launch failure or close] release happens on failure and browser disconnect', async t => {
  const root = fixture(t), previous = process.env.JIG_NO_BROWSER; process.env.JIG_NO_BROWSER = '0';
  t.after(() => { if (previous === undefined) delete process.env.JIG_NO_BROWSER; else process.env.JIG_NO_BROWSER = previous; });
  let held = 0, reads = 0;
  const guard = { readBrowserConfig: () => ({}), checkMemory: () => reads++, acquireBrowserSlot: async () => { held++; return () => held--; } };
  await assert.rejects(launchChrome({ root, guard, launch: async () => { throw Error('planted launch failure'); } }), /planted launch failure/);
  assert.equal(held, 0); assert.equal(reads, 2);
  const browser = new EventEmitter(); await launchChrome({ root, guard, launch: async () => browser }); assert.equal(held, 1); browser.emit('disconnected'); assert.equal(held, 0);
});
