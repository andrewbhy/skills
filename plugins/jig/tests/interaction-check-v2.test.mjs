import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { check, diffSpecs } from '../scripts/interaction-check.mjs';

const clean = () => JSON.parse(readFileSync(new URL('./fixtures/interaction/clean.json', import.meta.url), 'utf8'));
const script = fileURLToPath(new URL('../scripts/interaction-check.mjs', import.meta.url));
const errors = (spec) => check(spec).findings.filter((f) => f.severity === 'error');
const has = (spec, rule, pattern) => errors(spec).some((f) => f.rule === rule && pattern.test(f.message));

test('clean control passes every v2 rule', () => {
  assert.deepEqual(check(clean()).findings, []);
});

test('every error carries severity 3 or more; a failed rule is never below 3', () => {
  const spec = clean();
  spec.verbs[2].label = spec.verbs[3].label;
  const found = errors(spec);
  assert.ok(found.length > 0 && found.every((f) => f.nielsen >= 3));
});

test('rule 7: missing label, missing gloss, gloss that repeats the label, two verbs sharing a label', () => {
  const none = clean(); delete none.verbs[2].label;
  assert.ok(has(none, '7', /verb select has no on-screen label/));
  const gloss = clean(); delete gloss.verbs[2].gloss;
  assert.ok(has(gloss, '7', /no plain-words gloss/));
  const echo = clean(); echo.verbs[2].gloss = echo.verbs[2].label;
  assert.ok(has(echo, '7', /gloss only repeats its label/));
  const clash = clean(); clash.verbs[3].label = 'select';
  assert.ok(has(clash, '7', /verbs select and end-turn share the label "select"/));
});

test('rule 8: an input meaning three verbs across states is a hidden mode; a state needs visibleAs', () => {
  const mode = clean();
  for (const [state, verb] of [['a', 'start'], ['b', 'end-turn']]) mode.inputs.push({ input: 'tab', state, layer: 'board', verb });
  assert.ok(has(mode, '8', /input "tab" means 3 different verbs/));
  const two = clean();
  two.inputs.push({ input: 'tab', state: 'selected', layer: 'board', verb: 'end-turn' });
  assert.ok(!has(two, '8', /means \d+ different verbs/), 'two meanings is within the limit');
  const hidden = clean();
  delete hidden.flows[2].states[0].visibleAs;
  assert.ok(has(hidden, '8', /state idle of board has no visibleAs/));
});

test('rule 9: feedback needs three places, log-only is severity 3, tasks need dead-click and error frames', () => {
  const place = clean(); delete place.feedback[0].space;
  assert.ok(has(place, '9', /lacks the space place/));
  const log = clean(); log.feedback[1].logOnly = true;
  assert.ok(has(log, '9', /readable only in a log or hidden panel/));
  assert.equal(errors(log).find((f) => /log or hidden/.test(f.message)).nielsen, 3);
  const panel = clean(); panel.feedback[1].hiddenPanel = true;
  assert.ok(has(panel, '9', /log or hidden panel/));
  const dead = clean(); dead.storyboard = dead.storyboard.filter((f) => f.kind !== 'dead-click');
  assert.ok(has(dead, '9', /no dead-click frame/));
  const err = clean(); err.storyboard = err.storyboard.filter((f) => f.kind !== 'error');
  assert.ok(has(err, '9', /no error frame/));
  const none = clean(); delete none.feedback;
  assert.ok(has(none, '9', /no feedback catalogue/));
  const click = clean(); delete click.storyboard[0].firstClick;
  assert.ok(check(click).findings.some((f) => f.rule === '9' && f.severity === 'warn' && /first-click/.test(f.message)));
  const slow = clean(); slow.tasks[0].observed = { seconds: 9 };
  assert.ok(check(slow).findings.some((f) => f.severity === 'warn' && /observed 9 s is over 1.5x/.test(f.message)));
  const fine = clean(); fine.tasks[0].observed = { seconds: 6 };
  assert.deepEqual(check(fine).findings, []);
});

test('rule 10: primary task needs a layout block; too many controls in a region fail', () => {
  const none = clean(); delete none.layout;
  assert.ok(has(none, '10', /primary task play-turn has no layout block/));
  const crowd = clean();
  for (let i = 0; i < 9; i += 1) crowd.screens[1].hierarchy.push({ id: `c${i}`, parent: 'hud', level: 'component', priority: 'secondary', shown: 'on demand', owns: ['select'] });
  assert.ok(has(crowd, '10', /region hud holds 10 controls; at most 8/));
  const targets = clean();
  for (let i = 0; i < 9; i += 1) targets.layout[0].targets.push({ id: `t${i}`, x: 10 * i, y: 0, w: 40, h: 40, verb: 'select', region: 'bar' });
  assert.ok(has(targets, '10', /region bar holds 9 targets/));
});

test('rule 11: budget needs a source and a reference; a loose budget fails', () => {
  const src = clean(); delete src.tasks[0].budgetSource;
  assert.ok(has(src, '11', /no recorded source/));
  const ref = clean(); delete ref.tasks[0].reference;
  assert.ok(has(ref, '11', /no comparison figure from a named reference product/));
  const bad = clean(); delete bad.references[0].product;
  assert.ok(has(bad, '11', /reference ref-turn needs/));
  const loose = clean(); loose.tasks[0].maxTime = 60;
  assert.ok(has(loose, '11', /a loose budget passes anything/));
});

test('light path: diffSpecs lists new verbs, inputs, screens, layers, popups and global changes', () => {
  const before = clean();
  assert.deepEqual(diffSpecs(before, clean()), []);
  const verb = clean(); verb.verbs.push({ id: 'x', label: 'X', gloss: 'does x', layer: 'board' });
  assert.ok(diffSpecs(before, verb).includes('new verb x'));
  const input = clean(); input.inputs.push({ input: 'z', state: 'idle', layer: 'board', verb: 'select' });
  assert.ok(diffSpecs(before, input).includes('new input board/idle/z'));
  const screen = clean(); screen.screens.push({ id: 'new-screen' });
  assert.ok(diffSpecs(before, screen).includes('new screen new-screen'));
  const layer = clean(); layer.layers.push({ id: 'lab', parent: 'shell', back: 'esc' });
  assert.ok(diffSpecs(before, layer).includes('new layer lab'));
  const popup = clean(); popup.screens[2].auto.effect = 'pauses';
  assert.ok(diffSpecs(before, popup).includes('popup behaviour changed on turn-result'));
  const glob = clean(); glob.verbs[0].gloss = 'something else';
  assert.ok(diffSpecs(before, glob).includes('global verbs or input rows changed'));
  const edit = clean(); edit.tasks[0].maxTime = 9; edit.verbs[2].gloss = 'Picks a unit';
  assert.deepEqual(diffSpecs(before, edit), [], 'a text or budget edit stays on the light path');
});

test('CLI: --slice and --light need --registry, --light needs --against, light flags a new verb', () => {
  const dir = mkdtempSync(join(tmpdir(), 'interaction-v2-'));
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const put = (name, value) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; };
    const spec = put('spec.json', clean());
    const registry = put('registry.json', { verbs: ['select', 'end-turn'], bindings: [{ input: 'tab', verb: 'select' }], handlers: 1 });
    assert.equal(run(spec, '--slice').status, 2, 'slice review without a registry never passes');
    assert.equal(run(spec, '--slice', '--registry', registry).status, 0);
    assert.equal(run(spec, '--light', '--registry', registry).status, 2, 'light needs --against');
    assert.equal(run(spec, '--light', '--registry', registry, '--against', spec).status, 0);
    const extra = clean(); extra.verbs.push({ id: 'x', label: 'X', gloss: 'does x', layer: 'board', noSurface: true, noPath: { mouse: 'key', keyboard: 'mouse' } });
    const found = run(put('extra.json', extra), '--light', '--registry', registry, '--against', spec);
    assert.equal(found.status, 1);
    assert.match(found.stdout, /new verb x: this needs the full path/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
