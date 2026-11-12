import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { analyzeDesign, designRules, inspectDesign } from '../scripts/design-inspector.mjs';

const fixture = new URL('./fixtures/design/containers-and-light.json', import.meta.url);
const load = () => JSON.parse(readFileSync(fixture, 'utf8'));
const node = (s, target) => s.nodes.find(n => n.target === target);
const rules = s => analyzeDesign(s).findings.map(f => f.ruleId);

test('[risk: token-compliant generic defaults escape review] measured fixtures warn with actionable evidence for every selected rule', () => {
  const snapshot = load(), before = structuredClone(snapshot);
  const report = analyzeDesign(snapshot);
  assert.deepEqual(new Set(report.findings.map(f => f.ruleId)), new Set(designRules));
  assert.deepEqual(report.gaps, []);
  assert.deepEqual(snapshot, before, 'analysis must not edit evidence');
  for (const f of report.findings) {
    assert.equal(f.severity, 'warn'); assert(f.target); assert(Object.keys(f.evidence).length); assert(f.explanation.length > 30);
  }
  assert.deepEqual(report.findings.find(f => f.ruleId === 'nested-cards').evidence.children, ['#card']);
  // Detection proof: remove each planted treatment while retaining its content.
  const repaired = load();
  node(repaired, '#card').border = 0;
  node(repaired, '#tile').background = [0, 0, 0, 0];
  node(repaired, '#light').shadows = [];
  node(repaired, '#light').gradients = [];
  node(repaired, '#halo').gradients = [];
  assert.deepEqual(analyzeDesign(repaired).findings, []);
});

test('[risk: simplification erases meaningful desktop boundaries] controls, dialog shells, frames and hidden trees are excluded narrowly', () => {
  for (const change of [
    s => { node(s, '#card').tag = 'button'; },
    s => { node(s, '#card').role = 'textbox'; },
    s => { node(s, '#card').position = 'absolute'; },
    s => { node(s, '#panel').tag = 'dialog'; },
    s => { node(s, '#panel').frame = true; },
    s => { node(s, '#card').frame = true; },
    s => { node(s, '#card').hidden = true; },
  ]) {
    const s = load(); change(s); assert(!rules(s).includes('nested-cards'));
  }
  const s = load(); node(s, '#panel').hidden = true;
  assert.deepEqual(analyzeDesign(s).findings, []);
  const deeper = load();
  const inner = structuredClone(node(deeper, '#card'));
  inner.target = '#deep'; inner.parent = '#card'; inner.previous = null;
  deeper.nodes.push(inner); node(deeper, '#panel').frame = true;
  assert(rules(deeper).includes('nested-cards'), 'frame must not hide deeper nesting');
  node(deeper, '#panel').frame = false; node(deeper, '#panel').tag = 'dialog';
  assert(!rules(deeper).includes('nested-cards'), 'first dialog panel is the expected frame');
  const deepest = { ...structuredClone(inner), target: '#deepest', parent: '#deep' };
  deeper.nodes.push(deepest);
  assert(rules(deeper).includes('nested-cards'), 'dialog must not hide cards deeper than its first panel');
});

test('[risk: ordinary inline icons or avatars are mistaken for stacked tiles] size, shape, paint and geometry boundaries', () => {
  for (const change of [
    s => { node(s, '#tile').rect.width = 31.99; },
    s => { node(s, '#tile').rect.height = 128.01; },
    s => { node(s, '#tile').rect.width = 100; },
    s => { node(s, '#tile').radius = 24; },
    s => { node(s, '#tile').iconWidth = 48; },
    s => { node(s, '#tile').icon = false; },
    s => { node(s, '#tile').background[3] = .049; },
    s => { node(s, '#title').rect.y = 40; },
  ]) {
    const s = load(); change(s); assert(!rules(s).includes('icon-tile-stack'));
  }
  const s = load(); node(s, '#tile').background[3] = .05;
  node(s, '#title').rect.y = 76; // tile bottom at heading +4
  assert(rules(s).includes('icon-tile-stack'));
  node(s, '#title').tag = 'div'; node(s, '#title').cardTitle = true;
  assert(rules(s).includes('icon-tile-stack'));
});

test('[risk: glow advice removes elevation or state semantics] neutral, faint, contained and indicator light are excluded', () => {
  for (const change of [
    n => { n.shadows[0].color = [100, 100, 100, 1]; },
    n => { n.shadows[0].blur = 4; },
    n => { n.shadows[0].color[3] = .1; },
    n => { n.opacity = .1; },
    n => { n.shadows[0].spread = -10; },
    n => { n.shadows[0].inset = true; },
    n => { n.rect.width = 6; n.rect.height = 6; },
    n => { n.shadows[0].x = 4; n.surface = [255, 255, 255, 1]; n.background = [255, 255, 255, 1]; },
  ]) {
    const s = load(); change(node(s, '#light')); assert(!rules(s).includes('dark-glow'));
  }
  for (const semantics of ['focus', 'selection']) {
    const s = load(); node(s, '#light')[semantics] = true;
    assert(!rules(s).includes('dark-glow')); assert(!rules(s).includes('radial-spotlight-glow'));
    node(s, '#panel')[semantics] = true;
    assert(rules(s).includes('nested-cards'), 'functional state never suppresses structure');
  }
  const s = load(); node(s, '#light').shadows[0].color = [180, 20, 240, .8];
  assert(rules(s).includes('dark-glow'), 'hue alone must not be banned or exempted');
});

test('[risk: background gradients are all treated as glows] radial size, alpha, stop and dark-ground gates', () => {
  for (const change of [
    n => { n.gradients[0].repeating = true; },
    n => { n.gradients[0].stops[1].color[3] = .051; },
    n => { n.gradients[0].stops[0].px = 24; },
    n => { n.gradients[0].stops[0].color[3] = .69; },
    n => { n.surface = [255, 255, 255, 1]; },
    n => { n.gradients[0].stops[0].color = [100, 100, 100, 1]; },
  ]) {
    const s = load(); change(node(s, '#halo')); assert(!rules(s).includes('radial-halo'));
  }
  for (const change of [
    n => { n.rect.width = 239.9; },
    n => { n.rect.height = 159.9; },
    n => { n.gradients[0].stops[0].color[3] = .45; },
  ]) {
    const s = load(); change(node(s, '#light')); assert(!rules(s).includes('radial-spotlight-glow'));
  }
});

test('[risk: one waiver masks unrelated warnings] exact rules, target and intentional theme decisions remain in the report', () => {
  const waiver = { ruleId: 'dark-glow', target: '#light', reason: 'Chosen neon treatment', evidence: 'decisions.md#neon' };
  const result = analyzeDesign(load(), { waivers: [waiver] });
  assert.equal(result.waived.length, 1); assert.deepEqual(result.waived[0].exception, waiver);
  assert(result.findings.some(f => f.ruleId === 'radial-spotlight-glow' && f.target === '#light'));
  assert(result.findings.some(f => f.ruleId === 'nested-cards'));
  const intentional = ['dark-glow', 'radial-halo', 'radial-spotlight-glow'].map(ruleId => ({ ...waiver, ruleId, target: '*' }));
  const themeResult = analyzeDesign(load(), { theme: { id: 'neon-synth', intentional } });
  assert.equal(themeResult.waived.length, 3);
  assert.deepEqual(new Set(themeResult.findings.map(f => f.ruleId)), new Set(['nested-cards', 'icon-tile-stack']));
  const manifest = JSON.parse(readFileSync(new URL('../docs/design-toolbox/themes/electric/theme.json', import.meta.url), 'utf8'));
  assert.equal(analyzeDesign(load(), { theme: { ...manifest, intentional } }).waived.length, 3, 'existing name-based theme manifests work without a second ID');
  for (const options of [
    { waivers: [{ ...waiver, target: '*' }] }, { waivers: [{ ...waiver, ruleId: 'all' }] },
    { waivers: [{ ...waiver, reason: ' ' }] }, { waivers: [{ ...waiver, evidence: '' }] },
    { theme: { id: 'neon', intentional: [{ ...waiver, ruleId: 'nested-cards' }] } },
    { theme: { intentional } },
  ]) assert.throws(() => analyzeDesign(load(), options));
});

test('[risk: incomplete or corrupt measurements yield false clean results] gaps survive and invalid snapshots fail', async () => {
  const s = load(); s.gaps.push('iframe not traversed');
  assert.deepEqual(analyzeDesign(s).gaps, s.gaps);
  for (const corrupt of [
    s => { s.schemaVersion = 2; }, s => { s.nodes[0].rect.width = -1; },
    s => { s.nodes[0].background[3] = 2; }, s => { s.nodes[0].parent = '#missing'; },
    s => { s.nodes[0].parent = '#card'; }, s => { s.nodes.push(s.nodes[0]); },
    s => { s.nodes[0].previous = '#tile'; }, s => { s.nodes[0].shadows = [{}]; },
    s => { s.nodes[0].gradients = [{}]; }, s => { s.nodes[0].opacity = NaN; },
  ]) { const broken = load(); corrupt(broken); assert.throws(() => analyzeDesign(broken)); }
  let captures = 0;
  const page = { evaluate: async (_fn, root) => { captures++; assert.equal(root, '#sample'); return s; } };
  assert.deepEqual(await inspectDesign(page, { root: '#sample' }), analyzeDesign(s));
  assert.equal(captures, 1, 'inspect wrapper captures exactly once and forwards scope');
});

test('[risk: advisory warnings become a failure gate] replay CLI warns with exit zero and invalid input exits two', () => {
  const script = fileURLToPath(new URL('../scripts/design-inspector.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, fileURLToPath(fixture)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).findings.length, 5);
  const bad = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(bad.status, 2); assert(JSON.parse(bad.stdout).gaps.length);
});
