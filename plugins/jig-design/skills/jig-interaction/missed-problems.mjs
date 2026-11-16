if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-interaction/missed-problems.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Canonical, dependency-free intake helper; generated copies ship beside callers.
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { docsPath, appendLine, prepareStoreWrite } from './jig-store.mjs';

export const areas = ['design', 'runner', 'skills', 'product slice'];
export const problemLayers = ['unit', 'integration', 'end-to-end', 'live', 'person only', 'visual runner', 'visual runner and gate'];
export const logPath = 'docs/missed-problems.jsonl';
// One-release read fallback. All new writes use logPath; remove after 0.1.x.
export const legacyLogPath = 'docs/test-escapes.jsonl';
export function appendMissedProblem(root, entry) {
  const path = docsPath(root, logPath);
  prepareStoreWrite(path);
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) throw Error('append requires a stable incident id');
  if (!['script', 'model', 'person'].includes(entry.source)) throw Error('append requires source: script, model or person');
  if (readOptional(path) === undefined && readOptional(docsPath(root, legacyLogPath)) !== undefined) throw Error('legacy incident log exists: migrate explicitly before append');
  const line = JSON.stringify(entry);
  parseMissedProblems((readOptional(path) ?? '') + '\n' + line);
  appendLine(path, line);
  return entry;
}
const nonempty = value => typeof value === 'string' && Boolean(value.trim());

export function parseMissedProblems(text, { legacy = false } = {}) {
  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const fields = ['date', 'what', 'who', 'layer', 'action'];
      const optional = ['source', 'id', 'area', 'class', 'repeat', 'ruleReview'];
      if (!entry || Array.isArray(entry) || typeof entry !== 'object'
          || Object.keys(entry).some(key => ![...fields, ...optional].includes(key))
          || fields.some(key => !nonempty(entry[key]))) throw Error('expected date, what, who, layer and action strings');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date))
          || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw Error('date must be a valid YYYY-MM-DD');
      if (!problemLayers.includes(entry.layer)) throw Error(`layer must be one of: ${problemLayers.join(', ')}`);
      if (entry.source !== undefined && !['script', 'model', 'person'].includes(entry.source)) throw Error('source must be script, model or person');
      if ((!legacy || entry.area !== undefined) && !areas.includes(entry.area)) throw Error(`area must be one of: ${areas.join(', ')}`);
      if ((!legacy || entry.class !== undefined) && (!nonempty(entry.class) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.class))) throw Error('class must be a kebab-case name');
      for (const key of ['id', 'ruleReview']) if (entry[key] !== undefined && !nonempty(entry[key])) throw Error(`${key} must be a nonempty string`);
      if (entry.repeat !== undefined && typeof entry.repeat !== 'boolean') throw Error('repeat must be boolean');
      const id = entry.id ?? `mp-${entry.date}-${index + 1}`;
      if (entries.some(row => row.id === id)) throw Error(`duplicate id: ${id}`);
      entries.push({ ...entry, id });
    } catch (error) { throw Error(`Missed problems line ${index + 1}: ${error.message}`); }
  }
  const seen = new Map();
  return entries.map(entry => {
    const key = JSON.stringify([entry.area, entry.class]);
    const previous = entry.area && entry.class ? seen.get(key) : undefined;
    if (entry.area && entry.class) seen.set(key, entry.id);
    return { ...entry, repeat: Boolean(previous) || entry.repeat === true, ...(previous ? { repeats: previous } : {}) };
  });
}

function readOptional(path) {
  try { return readFileSync(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function reviewProblem(root, entry) {
  if (!entry.ruleReview) return 'rule review missing';
  const path = docsPath(root, entry.ruleReview), rel = relative(docsPath(root, 'docs/results'), path);
  if (isAbsolute(entry.ruleReview) || rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.md')) return 'rule review must be a Markdown file in docs/results/';
  const text = readOptional(path);
  if (!text) return 'rule review missing or empty';
  // A reference to an unrelated report does not close a repeat.
  const substantive = heading => Boolean(text.match(new RegExp(`^## ${heading}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim());
  if (!text.includes(entry.id) || !substantive('Rule failed') || !substantive('Changes')) return 'rule review must name the incident and explain Rule failed and Changes';
  return undefined;
}

export function missedProblems(root, area) {
  if (area !== undefined && !areas.includes(area)) throw Error(`Unknown area: ${area}`);
  let path = logPath, contents = readOptional(docsPath(root, path));
  const warnings = [];
  if (contents === undefined) {
    contents = readOptional(docsPath(root, legacyLogPath));
    if (contents !== undefined) {
      path = legacyLogPath;
      warnings.push(`Missed problems moved to ${logPath}; migrate ${legacyLogPath} this release.`);
    }
  }
  const all = parseMissedProblems(contents ?? '', { legacy: path === legacyLogPath });
  const unclassified = all.filter(entry => !entry.area || !entry.class);
  const entries = all.filter(entry => area === undefined || entry.area === area);
  const openRepeats = entries.filter(entry => entry.repeat).flatMap(entry => {
    const reason = reviewProblem(root, entry);
    return reason ? [{ id: entry.id, area: entry.area, class: entry.class, reason }] : [];
  });
  if (contents === undefined) warnings.push(`Missing ${logPath}; history is unknown.`);
  if (unclassified.length) warnings.push('Legacy incidents need area/class backfill before area intake is complete.');
  return { path, present: contents !== undefined, warnings, entries, openRepeats, unclassified: unclassified.map(entry => entry.id),
    blocked: openRepeats.length > 0 || unclassified.length > 0,
    checks: entries.filter(entry => entry.area && entry.class).map(entry => ({ id: entry.id, brief: entry.what, check: `missed-${entry.area.replaceAll(' ', '-')}-${entry.class}-${entry.id}` })) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === 'append') {
      if (args.length !== 3) throw Error('Usage: missed-problems.mjs append <project> <JSON>');
      try { console.log(JSON.stringify(appendMissedProblem(resolve(args[1]), JSON.parse(args[2])))); } catch (error) { console.error(error.message); process.exitCode = 1; }
    } else {
    if (args.length !== 2 || args[0] !== '--area') throw Error('Usage: node missed-problems.mjs --area <design|runner|skills|"product slice">');
    const report = missedProblems(process.cwd(), args[1]);
    for (const warning of report.warnings) console.error(warning);
    for (const entry of report.checks) console.log(`${entry.id}: ${entry.brief}\n  Check: ${entry.check}`);
    for (const repeat of report.openRepeats) console.error(`BLOCKED repeat ${repeat.id} [${repeat.area}/${repeat.class}]: ${repeat.reason}`);
    console.log(`${report.entries.length} missed problem(s); ${report.openRepeats.length} open repeat(s).`);
    process.exitCode = report.blocked ? 1 : report.present ? 0 : 2;
    }
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
