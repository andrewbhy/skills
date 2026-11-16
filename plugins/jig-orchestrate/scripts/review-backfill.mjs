if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-backfill.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// queue-backfill-times: give old queue items an honest updatedAt where none was ever recorded.
// Evidence, newest wins (ties: decision, thread, progress): decisions naming the item or its thread, the item's own thread messages
// (all of them when no other open item shares the thread, else only those naming the id), its progress file.
// With no evidence at all, the store's first snapshot of queue.json: its earliest git commit when the store is a git repo, else the file mtime.
// Every value written carries timeSource "backfill:<decision|thread|progress|snapshot>"; the next real change replaces both fields.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { linkedThreadOf, isSharedThread, newsMessages, readProgress, readThread, reviewDir, threadSharers } from './review-core.mjs';
import { describeRef, readDecisions } from './review-decisions.mjs';
import { mutateQueueItem } from './review-work.mjs';

const ok = (t) => Number.isFinite(Date.parse(t));
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

export function refNames(ref, id, thread) {
  const d = describeRef(ref);
  if (d.kind === 'item') return thread === `item-${d.id}`;
  if (d.kind === 'queue') return same(d.id, id);
  if (d.kind === 'id') return same(d.id, id) || same(d.id, thread);
  return false;
}
export function snapshotTime(queuePath) {
  const dir = dirname(queuePath);
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' });
    const lines = execFileSync('git', ['-C', dir, 'log', '--format=%cI', '--', basename(queuePath)], { stdio: 'pipe', encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    if (lines.length && ok(lines.at(-1))) return { at: new Date(lines.at(-1)).toISOString(), how: 'git' };
  } catch { /* not a git store: use the file time */ }
  return { at: statSync(queuePath).mtime.toISOString(), how: 'mtime' };
}
export function backfillTimes(queuePath, { dir = reviewDir(), decisions = readDecisions({}), dryRun = false } = {}) {
  const items = JSON.parse(readFileSync(queuePath, 'utf8')).items ?? [];
  const sharers = threadSharers(items);
  let snapshot = null;
  const rows = [];
  for (const x of items) {
    if (!x || typeof x !== 'object' || x.addedAt || x.updatedAt) continue;
    const id = String(x.id ?? ''); const thread = linkedThreadOf(x) ?? id;
    const cands = [];
    for (const d of decisions) if (ok(d.at) && (same(d.source, id) || same(d.source, thread) || (d.impacts ?? []).some((i) => refNames(i.ref, id, thread)))) cands.push({ at: d.at, kind: 'decision', rank: 0 });
    for (const m of newsMessages(id, readThread(thread, dir), isSharedThread(x, sharers))) if (ok(m.at)) cands.push({ at: m.at, kind: 'thread', rank: 1 });
    const pr = readProgress(id, dir); if (pr && ok(pr.at)) cands.push({ at: pr.at, kind: 'progress', rank: 2 });
    cands.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.rank - b.rank);
    let pick = cands[0];
    if (!pick) { snapshot ??= snapshotTime(queuePath); pick = { at: snapshot.at, kind: 'snapshot' }; }
    rows.push({ id, at: new Date(pick.at).toISOString(), source: 'backfill:' + pick.kind });
  }
  if (!dryRun) for (const r of rows) mutateQueueItem(queuePath, r.id, (x) => { if (x.addedAt || x.updatedAt) return; x.updatedAt = r.at; x.timeSource = r.source; }, { stamp: false });
  return rows;
}
