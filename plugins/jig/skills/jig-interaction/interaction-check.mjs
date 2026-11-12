#!/usr/bin/env node
// Layer (a) of jig-interaction: reads one interaction.json and checks it with no model.
// Exit 0 clean (warnings allowed), 1 findings, 2 invalid or incomplete spec. Dependency-free.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const KLM_DEFAULT = { K: 0.2, B: 0.1, P: 1.1, H: 0.4, M: 1.35 };
const DEVICES = new Set(['mouse', 'keyboard', 'both']);
const EFFECTS = new Set(['interrupts', 'pauses', 'overlays']);
const norm = (value) => String(value ?? '').trim().toLowerCase();
const list = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const text = (value) => typeof value === 'string' && value.trim() !== '';

// Letters are project-specific: legacy specs retain the one-owner digit rule.
function reservedFindings(spec, bindings) {
  const findings = [];
  const configured = spec.config?.reservedKeys;
  const reserved = new Set(list(configured ?? ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']).map(norm));
  const digitOwners = new Set();
  for (const row of bindings) {
    const input = norm(row.input);
    if (/^[0-9]$/.test(input)) digitOwners.add(row.verb);
    if (configured === undefined || !reserved.has(input)) continue;
    const verb = spec.verbs.find(v => v.id === row.verb);
    const exception = list(spec.config?.reservedKeyExceptions).find(e =>
      norm(e.input) === input && e.verb === row.verb && text(e.reason) && text(e.approvedBy));
    if (verb?.ability !== true && !exception) findings.push({ rule: '6', severity: 'error', nielsen: 3,
      message: `reserved key "${input}" belongs to an ability; ${row.verb} needs ability: true or an exception with reason and approvedBy`, input, verb: row.verb });
  }
  if (configured === undefined && digitOwners.size > 1) findings.push({ rule: '6', severity: 'error', nielsen: 3,
    message: `digits belong to one verb; found ${[...digitOwners].join(', ')}` });
  return findings;
}

// Explicit targets are authoritative. Legacy prose only supplies concrete object
// classes we can recognise, rather than treating an arbitrary sentence as a class.
function targetsOf(verb) {
  if (verb.targets !== undefined) return list(verb.targets).filter(text).map(norm);
  return [...norm(verb.targetRule).matchAll(/\b(downed ally|enemy|ally|unit|tile|object)\b/g)].map(m => m[0]);
}
const namesTarget = (value, target) => norm(value).includes(target);

export class SpecError extends Error {}

function validate(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new SpecError('spec must be a JSON object');
  if (spec.version !== 1) throw new SpecError('spec.version must be 1');
  for (const key of ['layers', 'verbs', 'inputs']) {
    if (!Array.isArray(spec[key]) || spec[key].length === 0) throw new SpecError(`spec.${key} must be a non-empty array`);
  }
  for (const key of ['flows', 'screens', 'tasks', 'exceptions', 'layout', 'persistent', 'feedback', 'storyboard', 'references']) {
    if (spec[key] !== undefined && !Array.isArray(spec[key])) throw new SpecError(`spec.${key} must be an array`);
  }
  for (const verb of spec.verbs) if (!text(verb?.id)) throw new SpecError('every verb needs an id');
  for (const layer of spec.layers) if (!text(layer?.id)) throw new SpecError('every layer needs an id');
  spec.inputs.forEach((row, index) => {
    if (!row || list(row.input).length === 0 || !text(row.state ?? 'any') || !text(row.layer ?? 'global')) {
      throw new SpecError(`inputs[${index}] needs input, state and layer`);
    }
  });
  for (const flow of spec.flows ?? []) {
    if (!text(flow?.id) || !text(flow.verb) || !text(flow.start) || !Array.isArray(flow.states) || !Array.isArray(flow.transitions)) {
      throw new SpecError(`flow ${flow?.id ?? '?'} needs id, verb, start, states[] and transitions[]`);
    }
    for (const t of flow.transitions) {
      if (!text(t?.from) || !text(t.to) || !text(t.input) || !DEVICES.has(t.device) || !/^[KBPHM]+$/.test(t.ops ?? '')) {
        throw new SpecError(`flow ${flow.id}: each transition needs from, to, input, device (mouse|keyboard|both) and ops of K B P H M`);
      }
    }
  }
  return spec;
}

export function check(rawSpec) {
  const spec = validate(rawSpec);
  const findings = [];
  const notes = [];
  const add = (rule, severity, message, extra = {}) => findings.push({ rule, severity, nielsen: extra.nielsen ?? (severity === 'error' ? 3 : 2), message, ...extra });
  const config = spec.config ?? {};
  const klm = { ...KLM_DEFAULT, ...(config.klm ?? {}) };
  const minTarget = config.minTarget ?? 32;
  const maxFitts = config.maxFittsIndex ?? 5;
  const warnBand = config.warnWithin ?? 0.1;

  const layerIds = new Set(['global', ...spec.layers.map((layer) => layer.id)]);
  const verbs = new Map();
  for (const verb of spec.verbs) {
    const layer = verb.layer ?? 'global';
    if (!layerIds.has(layer)) add('2', 'error', `verb ${verb.id} names unknown layer ${layer}`, { layer, verb: verb.id });
    const globalVerb = verbs.get(verb.id);
    if (globalVerb && globalVerb.layer === 'global' && layer !== 'global') {
      add('3', 'error', `layer ${layer} redefines global verb ${verb.id} ("${globalVerb.name}" vs "${verb.name}")`, { layer, verb: verb.id });
    } else if (globalVerb && globalVerb.layer === layer) {
      add('2', 'error', `verb ${verb.id} declared twice in ${layer}`, { layer, verb: verb.id });
    } else if (!globalVerb || layer === 'global') {
      verbs.set(verb.id, { ...verb, layer });
    }
  }

  // Flatten the input map to one entry per input.
  const rows = [];
  for (const row of spec.inputs) {
    for (const input of list(row.input)) {
      rows.push({ input: norm(input), state: norm(row.state ?? 'any'), layer: row.layer ?? 'global', verb: row.verb, never: list(row.never), exception: row.exception, visibleAs: row.visibleAs });
    }
  }
  for (const row of rows) {
    if (!layerIds.has(row.layer)) add('1', 'error', `input ${row.input} names unknown layer ${row.layer}`, { layer: row.layer, input: row.input });
    if (row.verb && !verbs.has(row.verb)) add('2', 'error', `input ${row.input} maps to unknown verb ${row.verb}`, { layer: row.layer, state: row.state, input: row.input, verb: row.verb });
  }

  // Rule 1: collisions, per layer and state; "any" overlaps every state.
  findings.push(...reservedFindings(spec, rows));
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.layer}\u0000${row.input}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (a.state === b.state || a.state === 'any' || b.state === 'any') {
          add('1', 'error', `input "${a.input}" is bound twice in ${a.layer}/${a.state === b.state ? a.state : `${a.state} and ${b.state}`}: ${a.verb ?? '?'} and ${b.verb ?? '?'}`, { layer: a.layer, state: a.state === 'any' ? b.state : a.state, input: a.input, verb: `${a.verb}|${b.verb}` });
        }
      }
    }
  }

  // Rule 3: cross-layer consistency.
  const exceptions = spec.exceptions ?? [];
  const globalRows = rows.filter((row) => row.layer === 'global');
  const globalKeys = new Map();
  for (const row of globalRows) if (row.verb) globalKeys.set(row.verb, new Set([...(globalKeys.get(row.verb) ?? []), row.input]));
  for (const row of rows.filter((r) => r.layer !== 'global')) {
    const meets = globalRows.filter((g) => g.input === row.input && (g.state === 'any' || g.state === row.state));
    for (const g of meets) {
      if (g.verb === row.verb) continue;
      const exception = exceptions.find((e) => e.id && e.id === row.exception && e.layer === row.layer && norm(e.input) === row.input);
      if (!exception) {
        add('3', 'error', `layer ${row.layer} maps global input "${row.input}" to ${row.verb} but global means ${g.verb}, with no listed exception`, { layer: row.layer, state: row.state, input: row.input, verb: row.verb });
      } else if (!text(exception.reason) || !text(exception.approvedBy)) {
        add('3', 'error', `exception ${exception.id} needs a reason and approvedBy`, { layer: row.layer, input: row.input });
      }
      if (g.never.includes(row.verb)) add('3', 'error', `layer ${row.layer} binds "${row.input}" to ${row.verb}, which the global map says it never means`, { layer: row.layer, input: row.input, verb: row.verb });
    }
    const keys = globalKeys.get(row.verb);
    if (keys && !keys.has(row.input)) {
      add('3', 'error', `layer ${row.layer} binds global verb ${row.verb} to "${row.input}"; global keys are ${[...keys].join(', ')}`, { layer: row.layer, state: row.state, input: row.input, verb: row.verb });
    }
  }
  const byId = new Map(spec.layers.map((layer) => [layer.id, layer]));
  for (const layer of spec.layers) {
    if (layer.parent) {
      if (!byId.has(layer.parent)) add('3', 'error', `layer ${layer.id} has unknown parent ${layer.parent}`, { layer: layer.id });
      if (!text(layer.back)) add('3', 'error', `layer ${layer.id} has no back path to its parent ${layer.parent}`, { layer: layer.id });
      else if (!rows.some((r) => norm(r.input) === norm(layer.back) && (r.layer === layer.id || r.layer === 'global'))) {
        add('3', 'error', `layer ${layer.id} back input "${layer.back}" is not in the input map`, { layer: layer.id, input: norm(layer.back) });
      }
    } else if (!layer.entry) {
      add('3', 'error', `layer ${layer.id} has no parent and is not an entry layer`, { layer: layer.id });
    }
  }
  for (const layer of spec.layers) {
    const seen = new Set();
    let at = layer;
    while (at && !at.entry && at.parent && !seen.has(at.id)) { seen.add(at.id); at = byId.get(at.parent); }
    if (!at || !at.entry) add('3', 'error', `layer ${layer.id} is unreachable from an entry layer`, { layer: layer.id });
  }
  const screens = spec.screens ?? [];
  for (const item of spec.persistent ?? []) {
    for (const layer of spec.layers) {
      const shown = screens.some((s) => s.layer === layer.id && list(s.persistent).includes(item.id));
      const exempt = list(item.exempt).some((e) => e.layer === layer.id && text(e.reason));
      if (!shown && !exempt) add('3', 'error', `persistent element ${item.id} is missing in layer ${layer.id} and has no exemption`, { layer: layer.id });
    }
  }

  // Rule 2: coverage, plus flow structure (reachability and back paths).
  const flows = spec.flows ?? [];
  const inputExists = (flow, input) => rows.some((r) => r.input === norm(input) && (r.layer === flow.layer || r.layer === 'global'));
  for (const row of rows) {
    if (!row.verb) continue;
    const covered = flows.some((f) => f.verb === row.verb && (f.layer ?? 'global') === row.layer || f.verb === row.verb && (f.layer ?? 'global') === 'global');
    if (!covered) add('2', 'error', `input "${row.input}" (${row.verb}) has no flow`, { layer: row.layer, state: row.state, input: row.input, verb: row.verb });
  }
  for (const verb of verbs.values()) {
    const own = flows.filter((f) => f.verb === verb.id);
    if (own.length === 0) { add('2', 'error', `verb ${verb.id} has no flow`, { layer: verb.layer, verb: verb.id }); continue; }
    for (const device of ['mouse', 'keyboard']) {
      const has = own.some((f) => f.transitions.some((t) => t.device === device || t.device === 'both'));
      const reasons = verb.noPath ?? {};
      if (!has && !text(reasons[device])) add('2', 'error', `verb ${verb.id} has no ${device} path and no recorded reason`, { layer: verb.layer, verb: verb.id });
    }
  }
  for (const flow of flows) {
    const meta = { layer: flow.layer ?? 'global', verb: flow.verb };
    if (!verbs.has(flow.verb)) add('2', 'error', `flow ${flow.id} names unknown verb ${flow.verb}`, meta);
    if (!list(flow.invalid).length) add('2', 'error', `flow ${flow.id} has no invalid-input row`, meta);
    if (!flow.back || !text(flow.back.input) || !text(flow.back.to)) add('2', 'error', `flow ${flow.id} has no back row`, meta);
    else if (!inputExists(flow, flow.back.input)) add('2', 'error', `flow ${flow.id} back input "${flow.back.input}" is not in the input map`, { ...meta, input: norm(flow.back.input) });
    const states = new Map(flow.states.map((s) => [s.id, s]));
    if (!states.has(flow.start)) add('2', 'error', `flow ${flow.id} start state ${flow.start} is not declared`, meta);
    for (const t of flow.transitions) {
      for (const end of [t.from, t.to]) if (!states.has(end)) add('2', 'error', `flow ${flow.id} transition uses undeclared state ${end}`, { ...meta, state: end });
      if (!inputExists(flow, t.input)) {
        add('2', 'error', `flow ${flow.id} uses input "${t.input}" that is not in the input map`, { ...meta, state: t.from, input: norm(t.input) });
      } else if (!rows.some((r) => r.input === norm(t.input) && (r.layer === flow.layer || r.layer === 'global') && (r.state === 'any' || r.state === t.from))) {
        add('2', 'error', `flow ${flow.id}: input "${t.input}" is not mapped in state ${t.from}`, { ...meta, state: t.from, input: norm(t.input) });
      }
    }
    const reach = new Set([flow.start]);
    for (let grew = true; grew;) {
      grew = false;
      for (const t of flow.transitions) if (reach.has(t.from) && !reach.has(t.to)) { reach.add(t.to); grew = true; }
    }
    for (const state of flow.states) {
      if (!reach.has(state.id)) add('2', 'error', `flow ${flow.id}: state ${state.id} is unreachable`, { ...meta, state: state.id });
      if (state.id !== flow.start && !state.terminal && !states.has(state.back)) {
        add('2', 'error', `flow ${flow.id}: state ${state.id} has no back path`, { ...meta, state: state.id });
      }
    }
  }

  // Rule 3b: screen map and hierarchy.
  const screenIds = new Set(screens.map((s) => s.id));
  const reachScreens = new Set(screens.filter((s) => list(s.entry).length > 0).map((s) => s.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const s of screens) {
      if (!reachScreens.has(s.id)) continue;
      for (const edge of list(s.edges)) if (screenIds.has(edge.to) && !reachScreens.has(edge.to)) { reachScreens.add(edge.to); grew = true; }
    }
  }
  const surfaces = new Map();
  for (const s of screens) {
    const meta = { layer: s.layer };
    const nodes = list(s.hierarchy);
    if (nodes.length === 0) add('3b', 'error', `screen ${s.id} has no hierarchy`, { ...meta, state: s.id });
    if (!reachScreens.has(s.id)) add('3b', 'error', `screen ${s.id} is not reachable from an entry point`, { ...meta, state: s.id });
    const root = list(s.entry).length > 0 && s.returnsTo === 'none';
    if (!root && (!text(s.closedBy) || !screenIds.has(s.returnsTo))) add('3b', 'error', `screen ${s.id} has no way back (needs closedBy and a returnsTo screen)`, { ...meta, state: s.id });
    if (s.auto && norm(s.auto.trigger) !== 'none') {
      const a = s.auto;
      if (!EFFECTS.has(a.effect)) add('3b', 'error', `automatic popup ${s.id} must say whether it interrupts, pauses or overlays`, { ...meta, state: s.id });
      if (!text(s.closedBy) || !screenIds.has(s.returnsTo)) add('3b', 'error', `automatic popup ${s.id} must name what closes it and where it returns`, { ...meta, state: s.id });
      if (!text(a.focus)) add('3b', 'error', `automatic popup ${s.id} must name where input focus goes and returns`, { ...meta, state: s.id });
      if (a.effect === 'interrupts' && !['queued', 'refused'].includes(a.pendingInput)) add('3b', 'error', `interrupting popup ${s.id} must queue or refuse a pending input`, { ...meta, state: s.id });
      if (a.pendingInput === 'refused' && !text(a.refusalReason)) add('3b', 'error', `popup ${s.id} refuses pending input without a reason`, { ...meta, state: s.id });
    }
    const ids = new Set(nodes.map((n) => n.id));
    const regionOf = (node) => { let at = node; for (let i = 0; i < 50 && at; i += 1) { if (at.level === 'region') return at.id; at = nodes.find((n) => n.id === at.parent); } return 'root'; };
    const primaryPerRegion = new Map();
    for (const node of nodes) {
      if (node.parent !== 'root' && !ids.has(node.parent)) add('3b', 'error', `screen ${s.id}: node ${node.id} has unknown parent ${node.parent}`, { ...meta, state: s.id });
      for (const verb of list(node.owns)) {
        if (!verbs.has(verb)) continue;
        surfaces.set(verb, new Set([...(surfaces.get(verb) ?? []), `${s.id}/${node.id}`]));
      }
      if (node.level === 'component' && node.priority === 'primary') {
        const region = regionOf(node);
        primaryPerRegion.set(region, [...(primaryPerRegion.get(region) ?? []), node.id]);
      }
      if (node.priority === 'tertiary' && node.shown === 'always' && !text(node.ledger)) add('3b', 'error', `screen ${s.id}: tertiary node ${node.id} is always shown and names no moment`, { ...meta, state: s.id });
    }
    for (const [region, ids2] of primaryPerRegion) if (ids2.length > 1) add('3b', 'error', `screen ${s.id}: region ${region} has ${ids2.length} primary components (${ids2.join(', ')})`, { ...meta, state: s.id });
  }
  for (const [verb, places] of surfaces) {
    if (places.size > 3) add('3b', 'error', `verb ${verb} appears on ${places.size} surfaces (${[...places].join(', ')}); at most 3`, { verb });
  }
  if (screens.length > 0) {
    for (const verb of verbs.values()) {
      if (!surfaces.has(verb.id) && !verb.noSurface) add('3b', 'warn', `verb ${verb.id} has no home in any hierarchy (set noSurface for keyboard-only verbs)`, { layer: verb.layer, verb: verb.id });
    }
  }

  // Rule 4: KLM per top task; rule 3b: primary task controls.
  const tasks = spec.tasks ?? [];
  const layouts = spec.layout ?? [];
  const shortest = (flow, device) => {
    const best = new Map([[flow.start, { cost: 0, ops: '', inputs: 0 }]]);
    const queue = [flow.start];
    while (queue.length) {
      const at = queue.shift();
      for (const t of flow.transitions) {
        if (t.from !== at || !(device === 'any' || t.device === device || t.device === 'both')) continue;
        const cost = best.get(at).cost + [...t.ops].reduce((sum, op) => sum + klm[op], 0);
        if (!best.has(t.to) || cost < best.get(t.to).cost - 1e-9) { best.set(t.to, { cost, ops: best.get(at).ops + t.ops, inputs: best.get(at).inputs + 1 }); queue.push(t.to); }
      }
    }
    const done = flow.states.filter((s) => s.terminal && best.has(s.id)).map((s) => best.get(s.id));
    return done.sort((a, b) => a.cost - b.cost)[0];
  };
  const locate = (task, step) => {
    const [layerPart, verbPart] = String(step).includes('/') ? String(step).split('/') : [task.layer ?? 'global', step];
    return flows.find((f) => f.verb === verbPart && (f.layer ?? 'global') === layerPart) ?? flows.find((f) => f.verb === verbPart);
  };
  for (const task of tasks) {
    const meta = { layer: task.layer ?? 'global' };
    const device = task.device ?? 'mouse';
    let seconds = 0;
    let inputs = 0;
    let mental = 0;
    let missing = false;
    for (const step of list(task.steps)) {
      const flow = locate(task, step);
      const path = flow && shortest(flow, device);
      if (!flow || !path) { add('4', 'error', `task ${task.id}: step ${step} has no complete ${device} path`, { ...meta, verb: String(step) }); missing = true; continue; }
      seconds += path.cost;
      inputs += path.inputs;
      mental += [...path.ops].filter((op) => op === 'M').length;
    }
    const repeat = task.repeat ?? 1;
    seconds *= repeat; inputs *= repeat; mental *= repeat;
    if (missing) continue;
    notes.push(`task ${task.id} (${device}): ${seconds.toFixed(1)} s, ${inputs} inputs, ${mental} mental steps${task.maxTime ? `; budget ${task.maxTime} s` : ''}`);
    task.estimate = { seconds: Number(seconds.toFixed(2)), inputs, mental };
    const checks = [['time', seconds, task.maxTime, 's'], ['inputs', inputs, task.maxInputs, ''], ['mental steps', mental, task.maxMental, '']];
    for (const [name, value, budget, unit] of checks) {
      if (budget === undefined) continue;
      if (value > budget) add('4', 'error', `task ${task.id}: ${name} estimate ${value.toFixed(1)}${unit} is over budget ${budget}${unit}`, { ...meta });
      else if (value > budget * (1 - warnBand)) add('4', 'warn', `task ${task.id}: ${name} estimate ${value.toFixed(1)}${unit} is within 10 percent of budget ${budget}${unit}`, { ...meta });
    }
    if (task.primary) {
      for (const step of list(task.steps)) {
        const verb = String(step).split('/').pop();
        const homes = screens.flatMap((s) => list(s.hierarchy).filter((n) => list(n.owns).includes(verb)).map((n) => ({ s, n })));
        if (screens.length > 0 && homes.length > 0 && !homes.some(({ s, n }) => n.priority === 'primary' && (list(s.hierarchy).find((r) => r.id === n.parent)?.priority ?? 'primary') === 'primary')) {
          add('3b', 'error', `primary task ${task.id}: verb ${verb} has no primary-priority control in a primary region`, { ...meta, verb });
        }
        for (const { s, n } of homes) {
          if (n.priority === 'primary' && n.size && Math.min(n.size.w, n.size.h) < minTarget) add('5', 'error', `primary task ${task.id}: ${s.id}/${n.id} is ${n.size.w}x${n.size.h}, under the ${minTarget} px minimum`, { ...meta, verb });
        }
      }
    }
  }

  // Rule 5: target size and distance, only where a layout block exists.
  if (layouts.length === 0) notes.push('rule 5 not checked: no layout block');
  for (const block of layouts) {
    const meta = { layer: block.layer, state: block.state };
    for (const target of list(block.targets)) {
      if (Math.min(target.w, target.h) < minTarget) add('5', 'error', `target ${target.id} is ${target.w}x${target.h} at ${block.monitor ?? 'unknown monitor'}; minimum ${minTarget} px (WCAG 2.5.8 floor is 24)`, { ...meta, verb: target.verb });
    }
    for (const task of tasks.filter((t) => (t.layer ?? 'global') === block.layer)) {
      const steps = list(task.steps).map((step) => block.targets.find((t) => t.verb === String(step).split('/').pop())).filter(Boolean);
      for (let i = 1; i < steps.length; i += 1) {
        const a = steps[i - 1]; const b = steps[i];
        const distance = Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
        const index = Math.log2(distance / Math.min(b.w, b.h) + 1);
        if (index > maxFitts) add('5', 'warn', `task ${task.id}: moving ${a.id} to ${b.id} has Fitts index ${index.toFixed(1)} over ${maxFitts}`, { ...meta, verb: b.verb });
      }
    }
  }

  // Rule 7: labels. A fresh reader must be able to say what each label does.
  const labelOwners = new Map();
  for (const verb of verbs.values()) {
    const meta = { layer: verb.layer, verb: verb.id };
    if (!text(verb.label)) add('7', 'error', `verb ${verb.id} has no on-screen label`, meta);
    else labelOwners.set(norm(verb.label), [...(labelOwners.get(norm(verb.label)) ?? []), verb.id]);
    if (!text(verb.gloss)) add('7', 'error', `verb ${verb.id} has no plain-words gloss`, meta);
    else if (text(verb.label) && norm(verb.gloss) === norm(verb.label)) add('7', 'error', `verb ${verb.id} gloss only repeats its label`, meta);
  }
  for (const [label, ids] of labelOwners) if (ids.length > 1) add('7', 'error', `verbs ${ids.join(' and ')} share the label "${label}"`, { verb: ids.join('|') });

  // Rule 8: modes. One input meaning many things across states, and states the person cannot see.
  const maxModeVerbs = config.maxModeVerbs ?? 2;
  const meanings = new Map();
  for (const row of rows) {
    if (!row.verb) continue;
    const key = `${row.layer}\u0000${row.input}`;
    const entry = meanings.get(key) ?? { layer: row.layer, input: row.input, verbs: new Set() };
    entry.verbs.add(row.verb);
    meanings.set(key, entry);
  }
  for (const entry of meanings.values()) {
    if (entry.verbs.size > maxModeVerbs) add('8', 'error', `input "${entry.input}" means ${entry.verbs.size} different verbs across states of ${entry.layer} (${[...entry.verbs].join(', ')}); more than ${maxModeVerbs} is a hidden mode`, { layer: entry.layer, input: entry.input });
  }
  const visibleStates = new Set();
  for (const flow of spec.flows ?? []) for (const state of flow.states) if (text(state.visibleAs)) visibleStates.add(`${flow.layer ?? 'global'}\u0000${state.id}`);
  const seenStates = new Set();
  for (const row of rows) {
    if (row.state === 'any') continue;
    const key = `${row.layer}\u0000${row.state}`;
    if (seenStates.has(key)) continue;
    seenStates.add(key);
    if (!visibleStates.has(key) && !visibleStates.has(`global\u0000${row.state}`)) add('8', 'error', `state ${row.state} of ${row.layer} has no visibleAs: the person cannot tell they are in it`, { layer: row.layer, state: row.state });
  }

  // Rule 9: feedback catalogue and storyboard inside the data.
  const feedback = spec.feedback ?? [];
  const storyboard = spec.storyboard ?? [];
  if (tasks.length > 0 && feedback.length === 0) add('9', 'error', 'no feedback catalogue (spec.feedback is empty)');
  for (const event of feedback) {
    const meta = { layer: event.layer ?? 'global', verb: event.verb };
    for (const place of ['object', 'space', 'text']) {
      if (!text(event[place])) add('9', 'error', `feedback ${event.id ?? event.event} lacks the ${place} place (needs object, space and one text line)`, meta);
    }
    if (event.logOnly || event.hiddenPanel) add('9', 'error', `feedback ${event.id ?? event.event}: outcome readable only in a log or hidden panel`, { ...meta, nielsen: 3 });
    if (!text(event.reducedMotion)) add('9', 'warn', `feedback ${event.id ?? event.event} has no reduced-motion form`, meta);
  }
  const fbVerbs = new Set(feedback.map((e) => e.verb));
  for (const task of tasks) {
    const tmeta = { layer: task.layer ?? 'global' };
    for (const step of list(task.steps)) {
      const verb = String(step).split('/').pop();
      if (feedback.length > 0 && !fbVerbs.has(verb)) add('9', 'warn', `task ${task.id}: verb ${verb} has no feedback event`, { ...tmeta, verb });
    }
    const frames = storyboard.filter((f) => f.task === task.id);
    for (const kind of ['dead-click', 'error']) {
      if (!frames.some((f) => f.kind === kind)) add('9', 'error', `task ${task.id} has no ${kind} frame in the storyboard`, tmeta);
    }
    for (const frame of frames) {
      if (!text(frame.sees) || !text(frame.question)) add('9', 'error', `storyboard frame ${frame.id ?? frame.frame} of ${task.id} needs sees and question`, tmeta);
    }
    if (!frames.some((f) => text(f.firstClick))) add('9', 'warn', `task ${task.id} has no first-click frame (the person points at the expected target on a static frame)`, tmeta);
    if (task.observed?.seconds !== undefined && task.estimate && task.observed.seconds > task.estimate.seconds * 1.5) {
      add('9', 'warn', `task ${task.id}: observed ${task.observed.seconds} s is over 1.5x the KLM estimate ${task.estimate.seconds} s; the model or the design is wrong`, tmeta);
    }
  }

  // Rule 10: layout required for primary tasks, and density per region.
  const maxControls = config.maxControlsPerRegion ?? 8;
  for (const task of tasks.filter((t) => t.primary)) {
    if (!layouts.some((b) => b.layer === (task.layer ?? 'global'))) add('10', 'error', `primary task ${task.id} has no layout block for layer ${task.layer ?? 'global'}; not ready for the person's walkthrough`, { layer: task.layer ?? 'global' });
  }
  for (const s of screens) {
    const nodes = list(s.hierarchy);
    const counts = new Map();
    for (const node of nodes.filter((n) => n.level === 'component' && list(n.owns).length > 0)) {
      let at = node; let region = 'root';
      for (let i = 0; i < 50 && at; i += 1) { if (at.level === 'region') { region = at.id; break; } at = nodes.find((n) => n.id === at.parent); }
      counts.set(region, (counts.get(region) ?? 0) + 1);
    }
    for (const [region, n] of counts) if (n > maxControls) add('10', 'error', `screen ${s.id}: region ${region} holds ${n} controls; at most ${maxControls}`, { layer: s.layer, state: s.id });
  }
  for (const block of layouts) {
    const counts = new Map();
    for (const target of list(block.targets)) counts.set(target.region ?? 'unassigned', (counts.get(target.region ?? 'unassigned') ?? 0) + 1);
    for (const [region, n] of counts) if (n > maxControls) add('10', 'error', `layout ${block.layer}/${block.state}: region ${region} holds ${n} targets; at most ${maxControls}`, { layer: block.layer, state: block.state });
  }

  // Rule 11: every budget has a source and a comparison figure from a named reference product.
  const slack = config.budgetSlack ?? 2;
  const refs = new Map();
  for (const ref of spec.references ?? []) {
    const ops = String(ref.ops ?? '').replace(/\s+/g, '');
    if (!text(ref.id) || !text(ref.product) || !text(ref.task) || !text(ref.source) || !/^[KBPHM]+$/.test(ops)) {
      add('11', 'error', `reference ${ref.id ?? '?'} needs id, product, task, source and ops of K B P H M`);
      continue;
    }
    refs.set(ref.id, { ...ref, seconds: [...ops].reduce((sum, op) => sum + klm[op], 0) * (ref.repeat ?? 1) });
  }
  for (const task of tasks) {
    const meta = { layer: task.layer ?? 'global' };
    const budgeted = task.maxTime !== undefined || task.maxInputs !== undefined || task.maxMental !== undefined;
    if (!budgeted) continue;
    if (!text(task.budgetSource)) add('11', 'error', `task ${task.id}: budget has no recorded source (person, reference teardown or agent-proposed)`, meta);
    const ref = refs.get(task.reference);
    if (!ref) { add('11', 'error', `task ${task.id}: budget has no comparison figure from a named reference product (reference ${task.reference ?? 'missing'})`, meta); continue; }
    if (task.maxTime !== undefined && task.maxTime > ref.seconds * slack) add('11', 'error', `task ${task.id}: maxTime ${task.maxTime} s is more than ${slack}x the ${ref.product} figure ${ref.seconds.toFixed(1)} s; a loose budget passes anything`, meta);
    if (task.estimate && task.estimate.seconds > ref.seconds * slack) add('11', 'warn', `task ${task.id}: estimate ${task.estimate.seconds} s is slower than ${slack}x ${ref.product} (${ref.seconds.toFixed(1)} s)`, meta);
  }
  // Rule 9 extension: declared gating states must explain the block on the object.
  const gating = flows.flatMap(flow => flow.states.filter(s => list(s.gates).length).map(state => ({ ...state, layer: flow.layer ?? 'global' })));
  for (const state of gating) {
    const meta = { state: state.id, layer: state.layer };
    if (!text(state.visibleAs) || !/\b(mark|marker|badge|pips?|icon|outline|portrait|object|unit|body)\b/i.test(state.visibleAs)) add('9', 'error', `gating state ${state.id} needs an object-level visibleAs mark`, meta);
    if (!text(state.reason)) add('9', 'error', `gating state ${state.id} needs reason text`, meta);
    if (state.permanent !== true) for (const field of ['turnsLeft', 'clear']) if (!text(state[field])) add('9', 'error', `gating state ${state.id} needs ${field} text or permanent: true`, meta);
  }
  for (const verb of verbs.values()) {
    const relevant = gating.filter(s => s.layer === verb.layer || s.layer === 'global');
    if (text(verb.disabledReason) && relevant.length && verb.geometric !== true && !relevant.some(s => list(s.gates).includes(verb.id))) add('9', 'error', `verb ${verb.id} disabledReason needs a gating state or geometric: true`, { verb: verb.id, layer: verb.layer });
  }

  // Rule 12: a primary click cannot merely teach a different input.
  const redirects = /\b(right-click|middle-click|press|use|try|hold)\b[^;.]*\b(to|instead)\b/i;
  const verbRedirect = [...verbs.values()].map(v => v.name ?? v.id).filter(text);
  const redirected = result => redirects.test(result ?? '') || /\binstead\b/i.test(result ?? '') && verbRedirect.some(v => namesTarget(result, norm(v)));
  for (const row of [...flows.flatMap(f => list(f.invalid)), ...storyboard.filter(f => ['dead-click', 'error'].includes(f.kind))]) {
    if (/^left-click\b/i.test(row.input ?? '') && redirected(row.result)) add('12', 'error', `primary click "${row.input}" redirects to another input`, { input: row.input });
  }
  for (const verb of verbs.values()) for (const target of targetsOf(verb)) {
    if (!text(verb.primaryClick) && !rows.some(r => (r.layer === verb.layer || r.layer === 'global') && r.verb && /^left-click\b/.test(r.input) && namesTarget(r.input, target))) add('12', 'error', `target ${target} of ${verb.id} needs a left-click binding or primaryClick inspect-only reason`, { verb: verb.id, layer: verb.layer });
  }

  // Rule 13: frequent and rescue affordances remain visible when disabled.
  for (const verb of verbs.values()) {
    const shown = verb.disabledShown ?? 'greyed-with-reason';
    if (text(verb.disabledReason) && !['greyed-with-reason', 'reason-line', 'absent'].includes(shown)) add('13', 'error', `verb ${verb.id} has invalid disabledShown`, { verb: verb.id });
    const primaryOrRescue = tasks.some(t => (t.primary || t.rescue) && list(t.steps).some(s => String(s).split('/').pop() === verb.id));
    if (text(verb.disabledReason) && shown === 'absent' && (['every turn', 'frequent'].includes(verb.frequency) || verb.frequency === 'rare' && primaryOrRescue)) add('13', 'error', `verb ${verb.id} is absent when disabled; keep it visible with its reason`, { verb: verb.id });
  }
  for (const flow of flows) for (const row of list(flow.invalid)) {
    if (!/\b(no menu|nothing opens)\b/i.test(row.result ?? '')) continue;
    const targets = targetsOf(verbs.get(flow.verb) ?? {}).filter(t => namesTarget(row.input, t));
    const taught = list(spec.nothingToTeach).map(norm);
    if (targets.some(t => !taught.includes(t))) add('13', 'error', `flow ${flow.id}: "${row.input}" opens no menu without a nothingToTeach target exception`, { verb: flow.verb });
  }

  // Rule 14: each target class has both first-click and failure coverage.
  for (const verb of verbs.values()) for (const target of targetsOf(verb)) {
    const taskIds = new Set(tasks.filter(t => list(t.steps).some(s => String(s).split('/').pop() === verb.id)).map(t => t.id));
    const frames = storyboard.filter(f => taskIds.has(f.task));
    if (!frames.some(f => namesTarget(f.firstClick, target))) add('14', 'error', `target ${target} of ${verb.id} has no first-click frame`, { verb: verb.id });
    if (!frames.some(f => f.kind === 'error' && namesTarget(f.input, target))) add('14', 'error', `target ${target} of ${verb.id} has no error frame`, { verb: verb.id });
  }
  return { findings, notes };
}

// Rule 6, generic form: diff a registry export against the spec.
export function checkRegistry(spec, registry) {
  const findings = [];
  const add = (message, extra = {}) => findings.push({ rule: '6', severity: 'error', message, ...extra });
  const verbIds = new Set(spec.verbs.map((v) => v.id));
  const inputs = new Set(spec.inputs.flatMap((r) => list(r.input).map(norm)));
  for (const verb of list(registry.verbs)) if (!verbIds.has(verb)) add(`registry verb ${verb} is not in the spec`, { verb });
  for (const binding of list(registry.bindings)) {
    if (!inputs.has(norm(binding.input))) add(`binding "${binding.input}" (${binding.verb}) sits outside the spec input map`, { input: norm(binding.input), verb: binding.verb });
  }
  findings.push(...reservedFindings(spec, list(registry.bindings)));
  if ((registry.handlers ?? 1) !== 1) add(`expected one key handler, found ${registry.handlers}`);
  for (const [verb, count] of Object.entries(registry.surfaces ?? {})) if (count > 3) add(`verb ${verb} appears on ${count} surfaces; at most 3`, { verb });
  return { findings, notes: [] };
}

// Light path: what a change adds relative to the previous spec. Anything listed needs the full path.
export function diffSpecs(before, after) {
  const changes = [];
  const ids = (spec, key) => new Set((spec[key] ?? []).map((x) => x.id));
  for (const key of ['layers', 'verbs', 'screens']) {
    const a = ids(before, key); const b = ids(after, key);
    for (const id of b) if (!a.has(id)) changes.push(`new ${key.slice(0, -1)} ${id}`);
    for (const id of a) if (!b.has(id)) changes.push(`removed ${key.slice(0, -1)} ${id}`);
  }
  const inputKeys = (spec) => new Set(spec.inputs.flatMap((r) => list(r.input).map((i) => `${r.layer ?? 'global'}/${norm(r.state ?? 'any')}/${norm(i)}`)));
  const a = inputKeys(before); const b = inputKeys(after);
  for (const k of b) if (!a.has(k)) changes.push(`new input ${k}`);
  for (const k of a) if (!b.has(k)) changes.push(`removed input ${k}`);
  const globalPart = (spec) => JSON.stringify([spec.verbs.filter((v) => (v.layer ?? 'global') === 'global'), spec.inputs.filter((r) => (r.layer ?? 'global') === 'global')]);
  if (globalPart(before) !== globalPart(after)) changes.push('global verbs or input rows changed');
  for (const s of after.screens ?? []) {
    const old = (before.screens ?? []).find((x) => x.id === s.id);
    if (old && JSON.stringify(old.auto ?? null) !== JSON.stringify(s.auto ?? null)) changes.push(`popup behaviour changed on ${s.id}`);
  }
  return changes;
}

// Pattern library check: every ### entry needs use when, avoid when and evidence.
export function checkPatterns(markdown) {
  const findings = [];
  const entries = markdown.replace(/\r\n/g, '\n').split(/^### /m).slice(1);
  if (entries.length === 0) findings.push({ rule: 'patterns', severity: 'error', message: 'no pattern entries (### heading) found' });
  for (const entry of entries) {
    const name = entry.split('\n')[0].trim();
    for (const field of ['Use when', 'Avoid when', 'Evidence']) {
      const match = entry.match(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm'));
      if (!match || match[1].trim() === '') findings.push({ rule: 'patterns', severity: 'error', message: `pattern "${name}" lacks ${field}`, state: name });
    }
  }
  return { findings, notes: [`${entries.length} pattern entries`] };
}

function format(finding) {
  const parts = ['layer', 'state', 'input', 'verb'].filter((k) => finding[k]).map((k) => `${k}=${finding[k]}`);
  return `[rule ${finding.rule}] ${finding.severity} severity ${finding.nielsen ?? 3}${parts.length ? ` (${parts.join(' ')})` : ''}: ${finding.message}`;
}

function main(argv) {
  const args = argv.slice(2);
  const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; const [, value] = args.splice(i, 2); return value; };
  const patternsPath = take('--patterns');
  const registryPath = take('--registry');
  const againstPath = take('--against');
  const slice = args.includes('--slice');
  const light = args.includes('--light');
  const json = args.includes('--json');
  const files = args.filter((a) => !['--json', '--slice', '--light'].includes(a));
  try {
    if (files.length !== 1 && !(files.length === 0 && patternsPath)) throw new SpecError('Usage: node interaction-check.mjs <interaction.json> [--patterns patterns.md] [--registry registry.json] [--json]');
    if ((slice || light) && !registryPath) throw new SpecError('slice review and the light path need --registry <export.json>; the built UI is part of the check');
    if (light && !againstPath) throw new SpecError('--light needs --against <previous-spec.json> to prove the change adds no verb, input, screen or popup');
    let findings = [];
    let notes = [];
    if (files.length === 1) {
      const path = resolve(files[0]);
      if (!existsSync(path)) throw new SpecError(`no spec at ${files[0]}; a missing spec never passes`);
      let spec;
      try { spec = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new SpecError(`invalid JSON: ${error.message}`); }
      const result = check(spec);
      findings = result.findings; notes = result.notes;
      if (light) {
        let before;
        try { before = JSON.parse(readFileSync(resolve(againstPath), 'utf8')); } catch (error) { throw new SpecError(`cannot read previous spec: ${error.message}`); }
        for (const change of diffSpecs(before, spec)) findings.push({ rule: 'light', severity: 'error', nielsen: 3, message: `${change}: this needs the full path, not the light path` });
      }
      if (registryPath) {
        const extra = checkRegistry(spec, JSON.parse(readFileSync(resolve(registryPath), 'utf8')));
        findings.push(...extra.findings);
      }
    }
    if (patternsPath) {
      const extra = checkPatterns(readFileSync(resolve(patternsPath), 'utf8'));
      findings.push(...extra.findings); notes.push(...extra.notes);
    }
    const errors = findings.filter((f) => f.severity === 'error');
    if (json) console.log(JSON.stringify({ findings, notes }, null, 2));
    else {
      for (const finding of findings) console.log(format(finding));
      for (const note of notes) console.log(`note: ${note}`);
      console.log(errors.length ? `${errors.length} finding(s)` : `clean (${findings.length} warning(s))`);
    }
    process.exitCode = errors.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv);
