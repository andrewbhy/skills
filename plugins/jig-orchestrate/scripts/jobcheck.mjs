if (process.argv[2] === '--help') { console.log('Usage: node scripts/jobcheck.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, fstatSync, unlinkSync, writeFileSync } from 'node:fs';
import { atomicWriteFile } from './jig-store.mjs';
import { freemem } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { statePath } from './jig-store.mjs';
import { progressSummary, readProgress, withQueueLock } from './queue.mjs';
const clean = s => String(s).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 240);
function tail(path) {
  if (!path) return '';
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size, prefix = Buffer.alloc(Math.min(size, 2));
    readSync(fd, prefix, 0, prefix.length, 0);
    const utf16 = prefix[0] === 0xff && prefix[1] === 0xfe;
    const n = Math.min(size, 65536), buffer = Buffer.alloc(n);
    const bytes = readSync(fd, buffer, 0, n, size - n);
    return buffer.subarray(0, utf16 ? bytes - bytes % 2 : bytes).toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  }
  finally { closeSync(fd); }
}
export function countRead(root, kind = 'scripted') {
  if (!['scripted', 'delegated', 'manual'].includes(kind)) throw Error('read-kind must be scripted, delegated or manual');
  const path = statePath(root, 'orchestration-reads.json');
  return withQueueLock(path, () => {
    const counts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { scripted: 0, delegated: 0, manual: 0 };
    if (!['scripted', 'delegated', 'manual'].every(k => Number.isSafeInteger(counts[k]) && counts[k] >= 0)) throw Error('Invalid read counts');
    counts[kind]++;
    atomicWriteFile(path, JSON.stringify(counts) + '\n');
    return counts;
  });
}
export function jobcheck({ root = process.cwd(), progress, plan, log, readKind = 'scripted', now = Date.now(), freeBytes = freemem(), git = spawnSync } = {}) {
  root = resolve(root);
  const lines = [];
  try {
    if (!progress) throw Error('not supplied');
    const p = progressSummary(readProgress(root, { progressFile: progress }), now);
    lines.push(`Progress: ${p.done}/${p.total}; ${p.elapsed.toFixed(1)}/${p.timeboxMinutes}m; ${p.failed ? 'failed' : p.success ? 'passed' : 'unfinished'}`);
    lines.push(`Attention: ${[p.stale ? 'stale' : '', p.overTimebox ? 'over-timebox' : ''].filter(Boolean).join(', ') || 'none'}`);
  } catch { lines.push('Progress: gap (missing or invalid progress)'); }
  try {
    if (!plan) throw Error('not supplied');
    lines.push(`Plan SHA256: ${createHash('sha256').update(readFileSync(resolve(root, plan))).digest('hex')}`);
  } catch { lines.push('Plan SHA256: gap (missing or unreadable)'); }
  try {
    const text = tail(log && resolve(root, log));
    const counts = [...text.matchAll(/(?:^|\n)(?:#|ℹ)\s*(tests|pass|fail|skipped|cancelled)\s+(\d+)/g)];
    const totals = Object.fromEntries(counts.map(m => [m[1], Number(m[2])]));
    lines.push(`Tests: ${Object.keys(totals).length ? Object.entries(totals).map(([k,v]) => `${k}=${v}`).join(' ') : 'gap (no summary in bounded tail)'}`);
    const last = text.trim().split(/\r?\n/).slice(-2);
    for (let i = 0; i < last.length; i++) lines.push(`Tail ${i + 1}: ${clean(last[i]) || '(empty)'}`);
  } catch { lines.push('Tests/tail: gap (unreadable log)'); }
  try {
    const result = git('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 65536, timeout: 2000 });
    if (result.error || result.status !== 0) throw Error('unavailable');
    const fields = result.stdout.split('\0').filter(Boolean), entries = [];
    for (let i = 0; i < fields.length; i++) { entries.push(fields[i]); if (/^[RC]|^.[RC]/.test(fields[i])) i++; }
    lines.push(`Git: ${entries.filter(e => !e.startsWith('??')).length} tracked changes; ${entries.filter(e => e.startsWith('??')).length} untracked`);
  } catch { lines.push('Git: gap (unavailable or output exceeds limit)'); }
  lines.push(`Memory: ${(freeBytes / 2 ** 30).toFixed(1)} GB free`);
  const counts = countRead(root, readKind), total = counts.scripted + counts.delegated + counts.manual;
  lines.push(`Reads: ${counts.scripted} scripted, ${counts.delegated} delegated, ${counts.manual} manual; automated ${((counts.scripted + counts.delegated) / total * 100).toFixed(0)}%`);
  if (lines.length > 12) throw Error('jobcheck output exceeds 12 lines');
  return lines.join('\n');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--root', '--progress', '--plan', '--log', '--read-kind'].includes(args[i]) || !args[i + 1]) throw Error('Usage: jobcheck.mjs [--root DIR] [--progress FILE] [--plan FILE] [--log FILE] [--read-kind scripted|delegated|manual]');
      options[args[i] === '--read-kind' ? 'readKind' : args[i].slice(2)] = args[i + 1];
    }
    console.log(jobcheck(options));
  } catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
