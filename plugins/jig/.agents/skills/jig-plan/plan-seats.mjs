import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordToolSignal } from './signals.mjs';

export function recordPlanOutcome(result, record = recordToolSignal) {
  if (!result || !['OK', 'BLOCK'].includes(result.outcome) || typeof result.item !== 'string' || !result.item.trim() || !Array.isArray(result.reasons) || result.reasons.some(reason => typeof reason !== 'string' || !reason.trim()) || result.outcome === 'BLOCK' && !result.reasons.length) throw Error('Plan outcome needs outcome OK/BLOCK, item and reasons');
  if (result.outcome === 'BLOCK') record('plan-block', result.item, { area: 'plan-check', what: result.reasons.join('\n') });
  return result;
}

export const checklists = {
  testing: ['Does each acceptance have the cheapest sufficient check?', 'Are failure paths, expected times and independent acceptors named?', 'Does each browser, end-to-end or live check name a risk no lower layer catches, reuse lower-layer evidence and set an attempt limit?'],
  architecture: ['Are boundaries, ownership and public contracts explicit?', 'Is this the smallest design and can it be rolled back?', 'Are the riskiest unknown and module checks first?'],
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
