if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-similar.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Topic similarity for queue-add suggestions and doctor duplicate hints. Hints only; nothing here blocks or writes.
// Rule (simple, deterministic): lowercase; drop parenthesised asides, numbers, version words (draft, round, rN, vN, 2e,
// revised, batch, part), stopwords and 1-char words. Two topics are similar when one word set (>= 2 words) is a subset of
// the other, or when they share >= 3 words with Jaccard >= 0.5. Two shared words alone never match unless one title is
// contained in the other, so a shared project prefix ("lab favicon" vs "lab world") stays quiet; no pool statistics needed.
import { readFileSync } from 'node:fs';
import { readItems } from './review-core.mjs';

const stop = new Set('a an and are as at be by for from in into is it its of on or that the this to with via vs not no new add use using make get set after before per than then also item items draft round revised revision batch part'.split(' '));
export const words = (text) => new Set(String(text ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/)
  .filter((w) => w.length > 1 && !stop.has(w) && !/^\d+[a-z]?$/.test(w) && !/^[rv]\d+[a-z]?$/.test(w)));
export function similar(a, b) {
  const wa = words(a), wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  if (shared >= 2 && (shared === wa.size || shared === wb.size)) return true;
  return shared >= 3 && shared / (wa.size + wb.size - shared) >= 0.5;
}

// Open topics: unfinished queue entries (by their text) and unclosed review items (by title).
export function openTopics(queuePath, dir, { all = false } = {}) {
  const out = [];
  try {
    for (const x of JSON.parse(readFileSync(queuePath, 'utf8')).items ?? []) {
      if (x && (all || (x.state !== 'done' && !x.superseded)) && x.item) out.push({ id: String(x.id), title: String(x.item) });
    }
  } catch { /* no queue yet */ }
  try {
    for (const x of readItems(dir).items) {
      if (x && x.title && (all || (!x.done && !x.closed && !x.superseded && !x.supersededBy))) out.push({ id: `item-${x.id}`, title: String(x.title) });
    }
  } catch { /* no review items */ }
  return out;
}

export const similarOpen = (text, queuePath, dir, skipId) => openTopics(queuePath, dir).filter((t) => t.id !== skipId && similar(text, t.title));

// Groups of open topics that look like duplicates (connected components of the similarity relation, size >= 2).
export function duplicateGroups(queuePath, dir, opts) {
  const t = openTopics(queuePath, dir, opts);
  const parent = t.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (similar(t[i].title, t[j].title)) parent[find(i)] = find(j);
  const by = new Map();
  t.forEach((x, i) => { const r = find(i); by.set(r, [...(by.get(r) ?? []), x]); });
  return [...by.values()].filter((g) => g.length > 1);
}
