// Dashboard grouping of work and open questions by project: a personal setting in the store, never in the repo.
// <store>/project-groups.json:
//   { "groups": [ { "name": "label", "plan": "regex", "area": "regex", "text": "regex", "store": ["project folder", ...] } ],
//     "order": ["label", ...] }
// plan matches a queue item's plan path (forward slashes), area its area, text an open question's text; first group that matches wins.
// Without the file only the jig group exists and everything else is "other".
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { storeRoot } from './jig-store.mjs';

const defaults = { groups: [{ name: 'jig', plan: '/jig(-wt)?/', area: '^(skills|tooling)$', text: '(^|[^A-Za-z0-9_])jig([^A-Za-z0-9_]|$)|dashboard|skill|harness', store: ['jig'] }], order: ['jig'] };
const cache = new Map();

function compile(source) {
  if (typeof source !== 'string' || !source) return null;
  try { return new RegExp(source, 'i'); } catch { return null; }
}
export function projectGroups({ home } = {}) {
  const root = home === undefined ? storeRoot() : home;
  if (!root) return normalize(defaults);
  const file = join(root, 'project-groups.json');
  let stamp;
  try { stamp = statSync(file).mtimeMs; } catch { return normalize(defaults); }
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.value;
  let value;
  try { value = normalize(JSON.parse(readFileSync(file, 'utf8'))); } catch { value = normalize(defaults); }
  cache.set(file, { stamp, value });
  return value;
}
function normalize(data) {
  const groups = (Array.isArray(data?.groups) ? data.groups : []).filter((g) => g && typeof g.name === 'string' && g.name).map((g) => ({
    name: g.name, plan: compile(g.plan), area: compile(g.area), text: compile(g.text), store: Array.isArray(g.store) && g.store.length ? g.store.map(String) : [g.name.replace(/\s+/g, '-')],
  }));
  const order = Array.isArray(data?.order) ? data.order.map(String) : groups.map((g) => g.name);
  return { groups, order: [...order.filter((n) => n !== 'other'), 'other'] };
}

export function projectOfItem(x, options) {
  const plan = String(x.plan ?? '').replace(/\\/g, '/'), area = String(x.area ?? '');
  for (const g of projectGroups(options).groups) if ((g.plan && g.plan.test(plan)) || (g.area && g.area.test(area))) return g.name;
  return 'other';
}
export function guessProjectFromText(text, options) {
  for (const g of projectGroups(options).groups) if (g.text && g.text.test(text)) return g.name;
  return 'other';
}
export function storeNamesOf(project, options) {
  const group = projectGroups(options).groups.find((g) => g.name === project);
  return group ? group.store : project === 'other' ? ['other'] : [project.replace(/\s+/g, '-')];
}
