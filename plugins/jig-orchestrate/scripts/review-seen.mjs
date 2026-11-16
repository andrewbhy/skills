if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-seen.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Last-seen tracking for the review dashboard, kept in the personal store (seen.json per project), never in a repo.
//   items: { <thread id>: ISO time the person last looked at it }
//   home:  { at: last Home visit heartbeat, prev: the visit before the current one, snap / snapPrev: board snapshots taken at those times }
// A "visit" ends after a gap of more than `visitGapMs` without a heartbeat; the digest compares against the previous visit.
import { readProjectJson, updateProjectJson } from './jig-store.mjs';

export const visitGapMs = 30 * 60 * 1000;
const empty = () => ({ items: {}, home: {} });
const valid = (t) => typeof t === 'string' && Number.isFinite(Date.parse(t));

export function readSeen(project, { home } = {}) {
  const d = readProjectJson(project, 'seen.json', null, { home });
  if (!d || typeof d !== 'object') return empty();
  const items = {};
  for (const [k, v] of Object.entries(d.items && typeof d.items === 'object' ? d.items : {})) if (valid(v)) items[k] = v;
  return { items, home: d.home && typeof d.home === 'object' ? d.home : {} };
}
export function markSeen(project, ids, { home, now = new Date() } = {}) {
  const at = now.toISOString();
  return updateProjectJson(project, 'seen.json', empty(), (d) => {
    d.items = d.items && typeof d.items === 'object' ? d.items : {};
    for (const id of [].concat(ids)) d.items[String(id)] = at;
    return d;
  }, { home });
}
// Heartbeat from an open Home page. Returns the stored home block. `snap` is the board now (see review-digest.mjs).
export function visitHome(project, snap, { home, now = new Date() } = {}) {
  let out;
  updateProjectJson(project, 'seen.json', empty(), (d) => {
    const h = d.home && typeof d.home === 'object' ? d.home : {};
    const at = valid(h.at) ? Date.parse(h.at) : null;
    if (at !== null && now.getTime() - at > visitGapMs) { h.prev = h.at; h.snapPrev = h.snap ?? null; }
    h.at = now.toISOString(); h.snap = snap ?? null;
    d.home = h; out = h; return d;
  }, { home });
  return out ?? {};
}
// "Dismiss" on the digest: the current visit becomes the baseline.
export function dismissDigest(project, { home, now = new Date() } = {}) {
  let out;
  updateProjectJson(project, 'seen.json', empty(), (d) => {
    const h = d.home && typeof d.home === 'object' ? d.home : {};
    h.prev = now.toISOString(); h.snapPrev = h.snap ?? null; d.home = h; out = h; return d;
  }, { home });
  return out ?? {};
}
