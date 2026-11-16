if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-lock.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const staleAfter = 24 * 60 * 60 * 1000;

// The recovery mutex serializes reclaimers so a second reclaimer cannot unlink
// the new live holder's lock. A live PID always wins over the age limit.
export function withFileLock(file, fn, { report = console.error, retryMs = 0 } = {}) {
  const deadline = Date.now() + retryMs;
  for (;;) {
    let entered = false;
    try { return lockOnce(file, () => { entered = true; return fn(); }, { report }); }
    catch (error) {
      // Windows can report a sharing/deletion race as EPERM instead of EEXIST.
      const sharingRace = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code);
      if (entered || !sharingRace && !/Store locked/.test(error.message) || Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(deadline - Date.now(), 15 + Math.floor(Math.random() * 35)));
    }
  }
}
function lockOnce(file, fn, { report }) {
  let fd;
  const acquire = () => {
    try { fd = openSync(file, 'wx', 0o600); }
    catch (error) { if (error.code !== 'EEXIST') throw error; return false; }
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token: randomUUID() }) + '\n'); }
    catch (error) { closeSync(fd); unlinkSync(file); throw error; }
    return true;
  };
  const stale = () => {
    if (!existsSync(file)) return true;
    let owner;
    try { owner = JSON.parse(readFileSync(file, 'utf8')); } catch { /* legacy empty lock */ }
    const validPid = Number.isSafeInteger(owner?.pid) && owner.pid > 0;
    if (validPid) return !alive(owner.pid);
    try { return Date.now() - statSync(file).mtimeMs >= staleAfter; }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  };
  if (!acquire()) {
    if (!stale()) throw new Error('Store locked by a live or recent unknown owner; retry after the active command finishes.');
    withFileLock(file + '.recovery', () => {
      if (existsSync(file)) {
        if (!stale()) {
          throw new Error('Store locked by a live or recent unknown owner; retry after the active command finishes.');
        }
        unlinkSync(file);
        report('Recovered stale store lock (dead owner or expired legacy lock).');
      }
      if (!acquire()) throw new Error('Store locked; retry after the active command finishes.');
    }, { report });
  }
  try { return fn(); }
  finally { closeSync(fd); unlinkSync(file); }
}
