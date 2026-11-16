if (process.argv[2] === '--help') { console.log('Usage: node scripts/resource-guard.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { freemem, hostname, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { statePath, storeRoot } from './jig-store.mjs';
const slotsDir = () => join(storeRoot() ?? join(homedir(), '.jig'), 'browser-slots');

export class ResourceGuardError extends Error { exitCode = 2; }

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const slotCount = value => Number.isSafeInteger(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Only absence uses defaults. Bad JSON, unreadable files and bad values refuse.
export function readBrowserConfig(root = process.cwd(), env = process.env) {
  let config = {};
  try { config = JSON.parse(readFileSync(statePath(root, 'config.json'), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new ResourceGuardError('config: cannot read .jig/config.json');
  }
  const browser = config?.browser ?? {};
  if (!object(config) || !object(browser) || config.browser === null
      || Object.keys(browser).some(key => !['minFreeGB', 'slots', 'lockDir'].includes(key))
      || (browser.minFreeGB !== undefined && !positive(browser.minFreeGB))
      || (browser.slots !== undefined && !slotCount(browser.slots))
      || (browser.lockDir !== undefined && (typeof browser.lockDir !== 'string' || !browser.lockDir.trim() || /[\0\r\n]/.test(browser.lockDir)))) {
    throw new ResourceGuardError('config: invalid browser settings in .jig/config.json');
  }
  const result = { minFreeGB: browser.minFreeGB ?? 4, slots: browser.slots ?? 1,
    dir: browser.lockDir === undefined ? slotsDir() : resolve(root, browser.lockDir) };
  for (const [name, key, valid] of [['JIG_BROWSER_MIN_FREE_GB', 'minFreeGB', positive], ['JIG_BROWSER_SLOTS', 'slots', slotCount]]) {
    if (env[name] !== undefined) {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(env[name]) || !valid(Number(env[name]))) {
        throw new ResourceGuardError(`config: invalid ${name}`);
      }
      result[key] = Number(env[name]);
    }
  }
  return result;
}

// The freeBytes seam tests boundaries without allocating memory.
export function checkMemory({ minFreeGB = 4, freeBytes = freemem() } = {}) {
  if (!positive(minFreeGB) || !Number.isFinite(freeBytes) || freeBytes < 0) throw new ResourceGuardError('memory: invalid memory threshold or reading');
  const freeGB = freeBytes / 2 ** 30;
  if (freeGB < minFreeGB) throw new ResourceGuardError(`memory: ${freeGB.toFixed(1)} GB free, need ${minFreeGB}`);
  return freeGB;
}

function deadOwner(path) {
  let owner;
  try { owner = JSON.parse(readFileSync(path, 'utf8')); }
  catch { return false; }
  // Unknown ownership, another host and EPERM all fail closed. Age never proves death.
  if (!object(owner) || owner.host !== hostname() || !slotCount(owner.pid) || typeof owner.start !== 'string') return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}

export function browserSlotsBusy({ slots = 1, dir = slotsDir() } = {}) {
  if (!slotCount(slots) || typeof dir !== 'string' || !dir.trim()) throw new ResourceGuardError('slots: invalid slot settings');
  for (let i = 0; i < slots; i++) {
    const path = join(dir, `slot-${i}.json`);
    if (!existsSync(path + '.reclaim') && (!existsSync(path) || deadOwner(path))) return false;
  }
  return true;
}

function createSlot(path) {
  let fd;
  try { fd = openSync(path, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid, start: new Date().toISOString(), host: hostname() }) + '\n'); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(fd); }
  return true;
}

function trySlot(path) {
  const reclaim = `${path}.reclaim`;
  let fd;
  try { fd = openSync(reclaim, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try {
    // All acquisitions honor this transient barrier. Serializing only stale
    // deletions would race a new exclusive create and could steal its live PID.
    if (createSlot(path)) return true;
    if (!deadOwner(path)) return false;
    unlinkSync(path);
    return createSlot(path);
  } finally { closeSync(fd); unlinkSync(reclaim); }
}

function releaseOnExit(path) {
  let held = true;
  const release = () => {
    if (!held) return;
    // Keep the exit fallback registered if removing the file fails.
    unlinkSync(path);
    held = false;
    process.removeListener('exit', release);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  };
  const interrupt = () => { release(); process.exit(130); };
  const terminate = () => { release(); process.exit(143); };
  process.once('exit', release);
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  return release;
}

export async function acquireBrowserSlot({ slots = 1, dir = slotsDir(), waitMs = 0 } = {}) {
  if (!slotCount(slots) || typeof dir !== 'string' || !dir.trim() || !Number.isFinite(waitMs) || waitMs < 0) {
    throw new ResourceGuardError('slots: invalid slot settings');
  }
  const deadline = performance.now() + waitMs;
  try {
    mkdirSync(dir, { recursive: true });
    do {
      for (let i = 0; i < slots; i++) {
        const path = join(dir, `slot-${i}.json`);
        if (trySlot(path)) return releaseOnExit(path);
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      await delay(Math.min(50, remaining));
    } while (performance.now() <= deadline);
  } catch {
    throw new ResourceGuardError('slots: cannot write lock directory');
  }
  throw new ResourceGuardError(`slots: no free browser slot (${slots} configured)`);
}
