#!/usr/bin/env node
// The jig-interaction learning loop: file the person's Fix items as missed problems, keep the
// slice log, fire the trip-wire, count false alarms and close a miss only on a planted-defect fixture.
// Dependency-free. Usage:
//   node interaction-feedback.mjs file <project>      validate docs/design/feedback.json, file Fix items, log the slice
//   node interaction-feedback.mjs status <project>    trip-wire and false-alarm counts; exit 1 when UI work must stop
//   node interaction-feedback.mjs review <project> <docs/results/review.md>   record the skill review that clears a trip
//   node interaction-feedback.mjs close <project> <mp-id> --fixture <defect.json> --control <clean.json> [--rule <n>]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check } from './interaction-check.mjs';
import { docsPath } from './jig-store.mjs';

export const TRIP_CLASSES = ['friction', 'inconsistency', 'cramped'];
const VERDICTS = ['Keep', 'Fix', 'Strong objection'];
const LAYERS = ['a', 'b', 'c', 'd', 'none'];
const feedbackPath = (root) => docsPath(root, 'docs/design/feedback.json');
const logPath = (root) => docsPath(root, 'docs/design/feedback-log.jsonl');
const missPath = (root) => docsPath(root, 'docs/missed-problems.jsonl');
const nonempty = (v) => typeof v === 'string' && v.trim() !== '';

export function readFeedback(root) {
  let data;
  try { data = JSON.parse(readFileSync(feedbackPath(root), 'utf8')); } catch { throw new Error('docs/design/feedback.json is missing or not valid JSON'); }
  if (!nonempty(data?.slice) || !/^\d{4}-\d{2}-\d{2}$/.test(data?.date ?? '')) throw new Error('feedback.json needs slice and date (YYYY-MM-DD)');
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('feedback.json has no items');
  const seen = new Set();
  for (const item of data.items) {
    if (!nonempty(item?.id) || seen.has(item.id)) throw new Error('every item needs a unique id');
    seen.add(item.id);
    if (!VERDICTS.includes(item.verdict)) throw new Error(`item ${item.id}: verdict must be Keep, Fix or Strong objection`);
    if (item.verdict !== 'Keep') {
      if (!nonempty(item.class) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.class)) throw new Error(`item ${item.id}: needs a kebab-case class`);
      if (!LAYERS.includes(item.caughtBy?.layer)) throw new Error(`item ${item.id}: caughtBy.layer must be one of ${LAYERS.join(', ')} (which layer should have caught it; none if only the person can)`);
      if (!nonempty(item.note)) throw new Error(`item ${item.id}: needs the person's words in note`);
    }
  }
  return data;
}

const readLines = (path) => (existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

export function fileFeedback(root) {
  const data = readFeedback(root);
  const existing = new Set(readLines(missPath(root)).map((r) => r.id));
  const records = [];
  for (const item of data.items.filter((i) => i.verdict !== 'Keep')) {
    const id = item.filed ?? `mp-${data.date}-fb-${data.slice}-${item.id}`;
    item.filed = id;
    if (existing.has(id)) continue;
    const layer = item.caughtBy.layer;
    records.push({
      id, date: data.date, area: data.area ?? 'product slice', class: item.class,
      what: `${item.verdict} in the person's walkthrough of ${data.slice}: ${item.note}`,
      who: 'person', source: 'person', layer: layer === 'a' ? 'unit' : 'person only',
      action: `Filed from feedback.json. Should have been caught by layer (${layer})${item.caughtBy.rule ? ` rule ${item.caughtBy.rule}` : ''}. Open until a planted-defect fixture reproduces it and the checker or a seat catches it (interaction-feedback.mjs close).`
    });
  }
  if (records.length) {
    mkdirSync(dirname(missPath(root)), { recursive: true });
    appendFileSync(missPath(root), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  writeFileSync(feedbackPath(root), JSON.stringify(data, null, 2) + '\n');
  const falseAlarms = data.items.filter((i) => i.verdict === 'Keep' && nonempty(i.flaggedBy)).map((i) => i.flaggedBy);
  const log = readLines(logPath(root));
  if (!log.some((e) => e.type === 'slice' && e.slice === data.slice)) {
    const trip = data.items.filter((i) => i.verdict !== 'Keep' && TRIP_CLASSES.includes(i.class)).length;
    mkdirSync(dirname(logPath(root)), { recursive: true });
    appendFileSync(logPath(root), JSON.stringify({ type: 'slice', slice: data.slice, date: data.date, tripFixes: trip, fixes: data.items.filter((i) => i.verdict !== 'Keep').length, falseAlarms }) + '\n');
  }
  return { filed: records.map((r) => r.id), ...status(root) };
}

// Two consecutive slices each with a friction, inconsistency or cramped Fix stop UI work, until a skill review is recorded.
export function status(root) {
  const log = readLines(logPath(root));
  let streak = 0;
  for (const entry of log) {
    if (entry.type === 'review') streak = 0;
    else if (entry.tripFixes > 0) streak += 1;
    else streak = 0;
  }
  const alarms = {};
  for (const entry of log) for (const source of entry.falseAlarms ?? []) alarms[source] = (alarms[source] ?? 0) + 1;
  const noisy = Object.entries(alarms).filter(([, n]) => n >= 3).map(([source]) => source);
  return { tripped: streak >= 2, streak, slices: log.filter((e) => e.type === 'slice').length, falseAlarms: alarms, deleteCandidates: noisy };
}

export function recordReview(root, file) {
  const path = docsPath(root, file);
  const text = existsSync(path) && file.startsWith('docs/results/') ? readFileSync(path, 'utf8') : '';
  const section = (h) => Boolean(text.match(new RegExp(`^## ${h}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim());
  if (!section('Rule failed') || !section('Changes')) throw new Error('a skill review must be a docs/results/ Markdown file with substantive Rule failed and Changes sections');
  appendFileSync(logPath(root), JSON.stringify({ type: 'review', file, date: new Date().toISOString().slice(0, 10) }) + '\n');
}

// A miss closes only when the planted-defect fixture fails the checker and its clean control passes.
export function closeMiss(root, id, fixture, control, rule) {
  const rows = readLines(missPath(root));
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`no missed problem ${id}`);
  const run = (file) => check(JSON.parse(readFileSync(resolve(file), 'utf8'))).findings.filter((f) => f.severity === 'error');
  const caught = run(fixture).filter((f) => !rule || f.rule === String(rule));
  if (caught.length === 0) throw new Error(`fixture ${fixture} is not caught by the checker${rule ? ` rule ${rule}` : ''}; the miss stays open (a seat catch needs its own recorded run)`);
  const controlFindings = run(control);
  if (controlFindings.length > 0) throw new Error(`clean control ${control} has ${controlFindings.length} finding(s); a rule that fires on the control is noise`);
  row.action = `${row.action} Closed ${new Date().toISOString().slice(0, 10)}: fixture ${fixture} caught by rule ${caught[0].rule}; control ${control} clean.`;
  writeFileSync(missPath(root), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return caught[0];
}

function main(argv) {
  const [command, project, ...rest] = argv.slice(2);
  try {
    if (!command || !project) throw new Error('Usage: interaction-feedback.mjs file|status|review|close <project> ...');
    const root = resolve(project);
    if (command === 'file') {
      const result = fileFeedback(root);
      console.log(`filed ${result.filed.length} missed problem(s)${result.filed.length ? ': ' + result.filed.join(', ') : ''}`);
      report(result);
    } else if (command === 'status') {
      report(status(root));
    } else if (command === 'review') {
      recordReview(root, rest[0] ?? '');
      console.log('skill review recorded; trip-wire cleared');
    } else if (command === 'close') {
      const take = (flag) => { const i = rest.indexOf(flag); return i < 0 ? undefined : rest[i + 1]; };
      const hit = closeMiss(root, rest[0], take('--fixture'), take('--control'), take('--rule'));
      console.log(`closed ${rest[0]}: caught by rule ${hit.rule}: ${hit.message}`);
    } else throw new Error(`unknown command ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  function report(result) {
    console.log(`slices logged: ${result.slices}; false alarms: ${JSON.stringify(result.falseAlarms)}`);
    if (result.deleteCandidates.length) console.log(`noisy rules or seats (3 or more false alarms), consider deleting: ${result.deleteCandidates.join(', ')}`);
    if (result.tripped) {
      console.log('TRIP-WIRE: two consecutive slices with a friction, inconsistency or cramped Fix. Stop UI work and review the skill (rule failed, changes) in docs/results/, then run the review command.');
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv);
