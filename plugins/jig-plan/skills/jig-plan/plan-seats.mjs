if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-plan/plan-seats.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { basename, dirname, resolve } from 'node:path';
import { atomicWriteFile } from './jig-store.mjs';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { statePath } from './jig-store.mjs';
import { pathToFileURL } from 'node:url';
import { recordToolSignal } from './signals.mjs';

export function checkedSectionsHash(text) {
  const checked = new Set(['intent', 'acceptance', 'requirements', 'scope', 'out of scope', 'contracts', 'slices', 'verification plan', 'missed problems', 'success measures']);
  const clean = text.replaceAll('\r\n', '\n');
  const headings = [];
  let offset = 0, fence;
  for (const line of clean.split(/(?<=\n)/)) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) { if (new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`).test(line.trimEnd())) fence = null; }
    else if (delimiter) fence = delimiter[1];
    else {
      const heading = line.match(/^## ([^\n]+)\n/);
      if (heading) { heading.index = offset; headings.push(heading); }
    }
    offset += line.length;
  }
  const parts = headings.filter(match => checked.has(match[1].trim().toLowerCase())).map(match => {
    const index = headings.indexOf(match);
    return [match[1].trim().toLowerCase(), clean.slice(match.index + match[0].length, headings[index + 1]?.index).trim()];
  });
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function recordPlanOutcome(result, record = recordToolSignal, root = process.cwd()) {
  if (!result || !['OK', 'BLOCK'].includes(result.outcome) || typeof result.item !== 'string' || !result.item.trim() || !Array.isArray(result.reasons) || result.reasons.some(reason => typeof reason !== 'string' || !reason.trim()) || result.outcome === 'BLOCK' && !result.reasons.length) throw Error('Plan outcome needs outcome OK/BLOCK, item and reasons');
  if (result.outcome === 'BLOCK') record('plan-block', result.item, { area: 'plan-check', what: result.reasons.join('\n') });
  if (result.outcome === 'OK') {
    const plan = resolve(root, result.plan ?? result.item);
    const receipt = { plan, sectionsHash: checkedSectionsHash(readFileSync(plan, 'utf8')), outcome: 'OK', seats: result.seats ?? [], at: new Date().toISOString() };
    const slug = basename(plan).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    // Include path identity so same-named plans cannot overwrite each other's receipt.
    const suffix = createHash('sha256').update(plan).digest('hex').slice(0, 12);
    const path = statePath(root, `plan-receipts/${slug}-${suffix}.json`);
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteFile(path, JSON.stringify(receipt, null, 2) + '\n');
  }
  return result;
}

export const checklists = {
  testing: ['Does each acceptance have the cheapest sufficient check?', 'Are failure paths, expected times and independent acceptors named?', 'Does each browser, end-to-end or live check name a risk no lower layer catches, reuse lower-layer evidence and set an attempt limit?'],
  architecture: ['Are boundaries, ownership and public contracts explicit? Does this fit the accepted ADRs, and does it amend one without saying so?', 'Is this the smallest design and can it be rolled back?', 'Are the riskiest unknown and module checks first?'],
  product: ['Does intent describe what the person will see?', 'Do acceptance and WHEN/THEN scenarios match the request?', 'Are scope and exclusions consistent with that outcome?'],
  design: ['Is a reference or mockup gate named before UI implementation?', 'Are states, content extremes and motion covered?', 'Does the person have a specific judgement to make?'],
  accessibility: ['Are keyboard, focus, semantics and accessible names covered?', 'Are zoom and reduced motion checks proportionate?', 'Is a capable accepting seat named?'],
  security: ['Are trust boundaries and sensitive data identified?', 'Are permission and invalid-input failures checked?', 'Are dependency/licence and rollback costs bounded?'],
  cost: ['Are slices timeboxed and ordered by risk?', 'Are expensive checks justified and budgeted?', 'Can review finish under three minutes, leaving unfinished seats BLOCK?'],
  history: ['Was missed-problems.mjs run for every relevant area?', 'Do relevant incidents have named executable checks or review assertions?', 'Are exclusions, unknown history and open repeats explicitly handled?']
};
// Keep three questions per seat; the proposal is part of the last answer.
for (const [seat, questions] of Object.entries(checklists)) {
  questions[2] += ' Propose a tier 1 or 2 success measure for this discipline from measures.md, with collection evidence and a source.';
  if (seat === 'product') questions[2] += ' For every tier 3 goal propose a tier 1 or 2 proxy using the same Goal ID.';
}
const signals = { ui: ['design', 'accessibility', 'product'], module: ['architecture'], contract: ['architecture'], behaviour: ['product'], security: ['security'], data: ['architecture', 'security'], dependency: ['architecture', 'security'] };
export function planSeats(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Signals must be an object');
  for (const [key, value] of Object.entries(input)) if (!(key in signals) || typeof value !== 'boolean') throw Error(`Invalid signal: ${key}`);
  const required = new Set(['testing', 'cost', 'history']);
  for (const [key, seats] of Object.entries(signals)) if (input[key]) for (const seat of seats) required.add(seat);
  return { selected: [...required].map(seat => ({ seat, checklist: checklists[seat], reason: ['testing', 'cost', 'history'].includes(seat) ? 'always required' : Object.keys(signals).filter(key => input[key] && signals[key].includes(seat)).join(', ') })),
    skipped: Object.keys(checklists).filter(seat => !required.has(seat)).map(seat => ({ seat, reason: 'no matching plan signal' })) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv[2] === '--outcome' && process.argv.length === 4) console.log(JSON.stringify(recordPlanOutcome(JSON.parse(process.argv[3]))));
    else {
      if (process.argv.length !== 3) throw Error('Usage: node plan-seats.mjs <JSON signal object> | --outcome <JSON outcome>');
      console.log(JSON.stringify(planSeats(JSON.parse(process.argv[2])), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
