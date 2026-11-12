import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { check, checkPatterns, checkRegistry } from '../scripts/interaction-check.mjs';

const clean = () => JSON.parse(readFileSync(new URL('./fixtures/interaction/clean.json', import.meta.url), 'utf8'));
const script = fileURLToPath(new URL('../scripts/interaction-check.mjs', import.meta.url));
const errors = (spec) => check(spec).findings.filter((f) => f.severity === 'error');
const has = (spec, rule, pattern) => errors(spec).some((f) => f.rule === rule && pattern.test(f.message));

test('clean control: no findings, an estimate and a note per task', () => {
  const result = check(clean());
  assert.deepEqual(result.findings, []);
  assert.ok(result.notes.some((n) => /task play-turn \(mouse\): 5\.1 s, 2 inputs, 2 mental/.test(n)));
});

test('rule 1: one input bound twice in one state', () => {
  const spec = clean();
  spec.inputs.push({ input: 'left-click unit', state: 'idle', layer: 'board', verb: 'end-turn' });
  assert.ok(has(spec, '1', /"left-click unit" is bound twice in board\/idle/));
  const any = clean();
  any.inputs.push({ input: 'tab', state: 'any', layer: 'board', verb: 'end-turn' });
  assert.ok(has(any, '1', /"tab" is bound twice/), 'any overlaps every state');
  const other = clean();
  other.inputs.push({ input: 'tab', state: 'selected', layer: 'board', verb: 'select' });
  assert.ok(!has(other, '1', /./), 'same input in different states is fine');
});

test('rule 2: verb without a flow, flow gaps and unreachable states', () => {
  const spec = clean();
  spec.verbs.push({ id: 'inspect', name: 'Inspect', layer: 'board' });
  spec.inputs.push({ input: 'i', state: 'idle', layer: 'board', verb: 'inspect' });
  assert.ok(has(spec, '2', /verb inspect has no flow/));
  const invalid = clean();
  delete invalid.flows[2].invalid;
  assert.ok(has(invalid, '2', /select-flow has no invalid-input row/));
  const back = clean();
  delete back.flows[2].back;
  assert.ok(has(back, '2', /select-flow has no back row/));
  const dead = clean();
  dead.flows[2].states.push({ id: 'orphan', back: 'idle' });
  assert.ok(has(dead, '2', /state orphan is unreachable/));
  const noBack = clean();
  noBack.flows[2].states[1].terminal = false;
  delete noBack.flows[2].states[1].back;
  assert.ok(has(noBack, '2', /state selected has no back path/));
  const keyboard = clean();
  keyboard.flows[2].transitions = keyboard.flows[2].transitions.filter((t) => t.device === 'mouse');
  assert.ok(has(keyboard, '2', /verb select has no keyboard path/));
  keyboard.verbs[2].noPath = { keyboard: 'pointer-only by design' };
  assert.ok(!has(keyboard, '2', /keyboard path/), 'a recorded reason clears it');
  const unmapped = clean();
  unmapped.flows[2].transitions[0].input = 'middle-click';
  assert.ok(has(unmapped, '2', /"middle-click" that is not in the input map/));
});

test('rule 3: silent override of a global input names layer, input and both meanings', () => {
  const spec = clean();
  spec.inputs.push({ input: 'esc', state: 'idle', layer: 'board', verb: 'select' });
  const finding = errors(spec).find((f) => f.rule === '3');
  assert.match(finding.message, /layer board maps global input "esc" to select but global means back/);
  assert.equal(finding.layer, 'board');
  assert.equal(finding.input, 'esc');
  spec.inputs.at(-1).exception = 'ex-1';
  spec.exceptions.push({ id: 'ex-1', layer: 'board', input: 'esc', reason: 'esc cancels a drag', approvedBy: 'person' });
  assert.ok(!has(spec, '3', /maps global input/), 'a listed exception clears it');
  spec.exceptions[0].reason = '';
  assert.ok(has(spec, '3', /needs a reason/));
});

test('rule 3: global verb on another key, back path and persistent element', () => {
  const key = clean();
  key.inputs.push({ input: 'b', state: 'idle', layer: 'board', verb: 'back' });
  assert.ok(has(key, '3', /binds global verb back to "b"/));
  const noBack = clean();
  delete noBack.layers[1].back;
  assert.ok(has(noBack, '3', /layer board has no back path/));
  const lost = clean();
  lost.layers.push({ id: 'island', parent: 'ghost', back: 'esc' });
  assert.ok(has(lost, '3', /unknown parent ghost/) && has(lost, '3', /island is unreachable/));
  const persistent = clean();
  persistent.screens[1].persistent = [];
  assert.ok(has(persistent, '3', /persistent element menu-button is missing in layer board/));
  const never = clean();
  never.inputs.push({ input: 'right-click', state: 'idle', layer: 'board', verb: 'end-turn' });
  assert.ok(errors(never).some((f) => /never means/.test(f.message)));
  const redefine = clean();
  redefine.verbs.push({ id: 'back', name: 'Return', layer: 'board' });
  assert.ok(has(redefine, '3', /redefines global verb back/));
});

test('rule 3b: screen map and hierarchy', () => {
  const orphan = clean();
  orphan.screens.push({ id: 'island', layer: 'board', kind: 'full-screen', returnsTo: 'shell-main', closedBy: 'esc', hierarchy: [{ id: 'x', parent: 'root', level: 'region', priority: 'primary', shown: 'always', owns: [] }] });
  assert.ok(has(orphan, '3b', /screen island is not reachable/));
  const noHierarchy = clean();
  noHierarchy.screens[0].hierarchy = [];
  assert.ok(has(noHierarchy, '3b', /screen shell-main has no hierarchy/));
  const noClose = clean();
  delete noClose.screens[2].closedBy;
  assert.ok(has(noClose, '3b', /popup turn-result must name what closes it/));
  const swallow = clean();
  delete swallow.screens[2].auto.pendingInput;
  assert.ok(has(swallow, '3b', /must queue or refuse a pending input/));
  const silent = clean();
  silent.screens[2].auto.pendingInput = 'refused';
  assert.ok(has(silent, '3b', /refuses pending input without a reason/));
  const effect = clean();
  delete effect.screens[2].auto.effect;
  assert.ok(has(effect, '3b', /interrupts, pauses or overlays/));
  const focus = clean();
  delete focus.screens[2].auto.focus;
  assert.ok(has(focus, '3b', /input focus/));
  const many = clean();
  for (const id of ['a', 'b', 'c']) many.screens[0].hierarchy.push({ id, parent: 'menu', level: 'component', priority: 'secondary', shown: 'on demand', owns: ['select'] });
  assert.ok(has(many, '3b', /verb select appears on 4 surfaces/));
  const two = clean();
  two.screens[1].hierarchy.push({ id: 'second', parent: 'board', level: 'component', priority: 'primary', shown: 'always', owns: [] });
  assert.ok(has(two, '3b', /region board has 2 primary components/));
  const tertiary = clean();
  tertiary.screens[1].hierarchy.push({ id: 'log', parent: 'hud', level: 'component', priority: 'tertiary', shown: 'always', owns: [] });
  assert.ok(has(tertiary, '3b', /tertiary node log is always shown/));
  const demoted = clean();
  demoted.screens[1].hierarchy[3].priority = 'secondary';
  assert.ok(has(demoted, '3b', /verb end-turn has no primary-priority control/));
});

test('rule 4: KLM over budget fails, within 10 percent warns', () => {
  const over = clean();
  over.tasks[0].maxTime = 4;
  assert.ok(has(over, '4', /time estimate 5\.1s is over budget 4s/));
  const near = clean();
  near.tasks[0].maxTime = 5.5;
  const result = check(near);
  assert.ok(!result.findings.some((f) => f.severity === 'error'));
  assert.ok(result.findings.some((f) => f.rule === '4' && f.severity === 'warn'));
  const inputs = clean();
  inputs.tasks[0].maxInputs = 1;
  assert.ok(has(inputs, '4', /inputs estimate 2\.0 is over budget 1/));
  const repeated = clean();
  repeated.tasks[0].repeat = 48;
  assert.ok(has(repeated, '4', /over budget/));
  const key = clean();
  key.tasks[0].device = 'keyboard';
  assert.equal(check(key).findings.length, 0);
  const broken = clean();
  broken.tasks[0].steps.push('missing-verb');
  assert.ok(has(broken, '4', /no complete mouse path/));
});

test('rule 5: small targets fail, unknown layout is not checked, Fitts warns', () => {
  const small = clean();
  small.layout[0].targets[1].h = 18;
  assert.ok(has(small, '5', /target end-turn is 96x18.*minimum 32/));
  const node = clean();
  node.screens[1].hierarchy[3].size = { w: 96, h: 18 };
  assert.ok(has(node, '5', /board-main\/end-turn is 96x18/));
  const none = clean();
  delete none.layout;
  assert.ok(check(none).notes.includes('rule 5 not checked: no layout block'));
  const far = clean();
  far.config.maxFittsIndex = 2;
  far.layout[0].targets[1].x = 3000;
  assert.ok(check(far).findings.some((f) => f.rule === '5' && f.severity === 'warn' && /Fitts index/.test(f.message)));
});

test('rule 6: registry diff', () => {
  const spec = clean();
  const registry = { verbs: ['select', 'ghost'], bindings: [{ input: 'tab', verb: 'select' }, { input: 'z', verb: 'select' }, { input: '1', verb: 'select' }, { input: '2', verb: 'end-turn' }], handlers: 2, surfaces: { select: 4 } };
  const messages = checkRegistry({ ...spec, inputs: [...spec.inputs, { input: ['1', '2'], state: 'any', layer: 'board', verb: 'select' }] }, registry).findings.map((f) => f.message).join('\n');
  for (const part of [/registry verb ghost/, /"z" \(select\) sits outside/, /digits belong to one verb/, /one key handler/, /verb select appears on 4 surfaces/]) assert.match(messages, part);
});

test('patterns need use when, avoid when and evidence', () => {
  const good = '# P\n### Arm then confirm\nUse when: a\nAvoid when: b\nEvidence: c\n';
  assert.deepEqual(checkPatterns(good).findings, []);
  const bad = checkPatterns('# P\n### One\nUse when: a\nAvoid when:\n');
  assert.equal(bad.findings.length, 2);
  assert.match(bad.findings[0].message, /pattern "One" lacks Avoid when/);
  assert.equal(checkPatterns('# P').findings.length, 1);
});

test('CLI exit codes: 0 clean, 1 findings, 2 missing or malformed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'interaction-'));
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const cleanPath = join(dir, 'clean.json');
    writeFileSync(cleanPath, JSON.stringify(clean()));
    assert.equal(run(cleanPath).status, 0);
    const broken = clean();
    broken.inputs.push({ input: 'tab', state: 'idle', layer: 'board', verb: 'end-turn' });
    const brokenPath = join(dir, 'broken.json');
    writeFileSync(brokenPath, JSON.stringify(broken));
    const found = run(brokenPath);
    assert.equal(found.status, 1);
    assert.match(found.stdout, /\[rule 1\] error severity 3 \(layer=board state=idle input=tab/);
    assert.equal(run(join(dir, 'missing.json')).status, 2);
    writeFileSync(join(dir, 'bad.json'), '{ nope');
    assert.equal(run(join(dir, 'bad.json')).status, 2);
    writeFileSync(join(dir, 'empty.json'), '{"version":1,"layers":[],"verbs":[],"inputs":[]}');
    assert.equal(run(join(dir, 'empty.json')).status, 2);
    assert.equal(run().status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shipped pattern library is well formed and the example spec is the clean fixture', () => {
  const dir = new URL('../.agents/skills/jig-interaction/', import.meta.url);
  const result = checkPatterns(readFileSync(new URL('patterns.md', dir), 'utf8'));
  assert.deepEqual(result.findings, []);
  assert.ok(Number(result.notes[0].split(' ')[0]) >= 10, 'seeded with at least ten entries');
  assert.equal(readFileSync(new URL('example.interaction.json', dir), 'utf8'), readFileSync(new URL('./fixtures/interaction/clean.json', import.meta.url), 'utf8'));
});

test('task device any picks the cheapest path of either device', () => {
  const spec = clean();
  spec.tasks[0].device = 'any';
  const result = check(spec);
  assert.ok(result.notes.some((n) => /task play-turn \(any\): 1.8 s, 2 inputs/.test(n)));
});
