import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkMockup, ledgerIds } from '../scripts/mockup-check.mjs';
import { syncSkills } from '../scripts/sync-skills.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const checker = join(root, 'scripts/mockup-check.mjs');
const fixture = join(root, 'tests/fixtures/mockup/project');
const tokens = [{ name: 'tokens.css', text: ':root { --text: #292e36; --surface: #f4f1eb; --hover: #e9edf7; --focus: #2854c5; }' }];
const baseCSS = 'button:hover { background: var(--hover); } button:focus-visible { outline: 2px solid var(--focus); }';
function sample(overrides = {}) {
  return { html: '<!doctype html><html><head><title>Sample</title></head><body><main data-ledger="queue-screen"><div class="card" data-ledger="work-card"><span>Name</span><button>Open</button></div></main></body></html>', ledger: new Set(['queue-screen', 'work-card']), tokens, styles: [{ name: 'mock.css', text: baseCSS }], ...overrides };
}
const kinds = report => new Set(report.findings.map(f => f.kind));
function scratch(t) {
  const evidence = join(root, '.jig/evidence');
  mkdirSync(evidence, { recursive: true });
  const dir = mkdtempSync(join(evidence, 'mockup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = args => spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8', cwd: root });

test('[risk: wrappers demand spurious purposes while independent regions inherit one] component ledger boundaries and unknown IDs', () => {
  assert.equal(checkMockup(sample()).status, 'passed');
  const report = checkMockup(sample({ html: sample().html.replace('class="card" data-ledger="work-card"', 'class="card"') }));
  assert.ok(kinds(report).has('ledger-missing'));
  assert.equal(report.findings.filter(f => f.kind === 'ledger-missing').length, 1);
  for (const markup of ['<section>Independent</section>', '<div data-component>Independent</div>', '<div role="toolbar">Independent</div>', '<div role="row">Independent</div>', '<ul data-ledger="work-card"><li>Independent</li></ul>']) {
    assert.ok(kinds(checkMockup(sample({ html: `<main data-ledger="queue-screen">${markup}</main>` }))).has('ledger-missing'));
  }
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="not-a-purpose">Wrong ID</main>' }))).has('ledger-unknown'));
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="">Empty</main>' }))).has('ledger-unknown'));
  assert.ok(kinds(checkMockup(sample({ html: '<span>Unowned text</span>' }))).has('ledger-missing'));
  assert.deepEqual([...ledgerIds('| ID | Purpose |\n| work-card | Inspect work |')], ['work-card']);
  assert.deepEqual([...ledgerIds('| ID | Purpose |\n| queue | Work order |')], ['queue']);
  assert.deepEqual([...ledgerIds('["queue-screen"]')], ['queue-screen']);
  assert.throws(() => ledgerIds('No entries'), /Ledger needs/);
  assert.throws(() => ledgerIds('[1]'), /array of IDs/);
});

test('[risk: glyph substitutions vary by font or escape through entities and pseudo-elements] icon text vs intentional prose', () => {
  for (const glyph of ['⌄', '▸', '◇', 'II', '›', '⋯', '✓', '&#x2304;', '&#8964;', '&rsaquo;']) {
    const report = checkMockup(sample({ html: `<main data-ledger="queue-screen"><button><span>${glyph}</span> Open</button></main>` }));
    assert.ok(kinds(report).has('text-icon'), glyph);
  }
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="queue-screen"><span>▸ Working</span></main>' }))).has('text-icon'));
  assert.equal(checkMockup(sample({ html: '<main data-ledger="queue-screen"><p data-reading-content="true">Volume II › Introduction ◇ is quoted content.</p></main>' })).status, 'passed');
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="queue-screen" data-reading-content="true"><button>II</button></main>' }))).has('text-icon'));
  for (const value of ['"⋯"', '"\\2304"', '"&#x2304;"']) {
    assert.ok(kinds(checkMockup(sample({ styles: [{ name: 'mock.css', text: `${baseCSS} .icon::before { content: ${value}; }` }] }))).has('text-icon'));
  }
});

test('[risk: raw colours and invented variables bypass the approved themes] CSS, inline and SVG token enforcement', () => {
  for (const value of ['#fff', '#12345678', 'red', 'rebeccapurple', 'rgb(1 2 3)', 'oklch(0.5 0.2 30)', 'var(--text, #fff)']) {
    const report = checkMockup(sample({ styles: [{ name: 'mock.css', text: `${baseCSS} .card { color: ${value}; }` }] }));
    assert.ok(kinds(report).has('raw-colour'), value);
  }
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="queue-screen" style="background: blue">Test</main>' }))).has('raw-colour'));
  assert.ok(kinds(checkMockup(sample({ html: '<body style="background: blue"><main data-ledger="queue-screen">Test</main></body>' }))).has('raw-colour'));
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="queue-screen"><svg fill="#fff"><path stroke="red" d="M0 0"/></svg></main>' }))).has('raw-colour'));
  assert.ok(kinds(checkMockup(sample({ html: '<main data-ledger="queue-screen"><svg><stop stop-color="#fff"/></svg></main>' }))).has('raw-colour'));
  assert.ok(kinds(checkMockup(sample({ styles: [{ name: 'mock.css', text: `${baseCSS} .card { color: var(--invented); --new-role: var(--text); }` }] }))).has('token-unknown'));
  assert.ok(kinds(checkMockup(sample({ styles: [{ name: 'mock.css', text: `${baseCSS} .card { --new-role: var(--text); }` }] }))).has('token-definition'));
  assert.equal(checkMockup(sample({ styles: [{ name: 'mock.css', text: `${baseCSS} .card { color: var(--text); fill: currentColor; background: transparent; } /* color: red; */ .card::before { content: "red #fff"; }` }] })).status, 'passed');
});

test('[risk: one styled button hides missing states on other controls] per-button hover and keyboard focus', () => {
  const html = '<main data-ledger="queue-screen"><button class="good">Good</button><button id="other">Other</button></main>';
  const report = checkMockup(sample({ html, styles: [{ name: 'mock.css', text: '.good:hover { opacity: 0.8; } .good:focus-visible { outline: 2px solid var(--focus); }' }] }));
  assert.deepEqual(report.findings.map(f => f.kind).sort(), ['button-focus', 'button-hover']);
  assert.ok(report.findings.every(f => f.message.includes('#other')));
  assert.equal(checkMockup(sample({ styles: [{ name: 'mock.css', text: '@media (hover: hover) { button:hover { opacity: 0.8; } } button:focus { outline: 2px solid var(--focus); }' }] })).status, 'passed');
  const misleading = checkMockup(sample({ styles: [{ name: 'mock.css', text: '.parent:hover button { opacity: 0.8; } button:focus-visible::before { content: ""; }' }] }));
  assert.ok(kinds(misleading).has('button-hover'));
  assert.ok(kinds(misleading).has('button-focus'));
  const coupled = checkMockup(sample({ styles: [{ name: 'mock.css', text: 'button:hover:focus-visible { outline: 2px solid var(--focus); }' }] }));
  assert.ok(kinds(coupled).has('button-hover'));
  assert.ok(kinds(coupled).has('button-focus'));
  assert.ok(kinds(checkMockup(sample({ styles: [{ name: 'mock.css', text: 'button:hover {} button:focus {}' }] }))).has('button-focus'));
});

test('[risk: strings masquerade as markup or unanalysed dynamic content earns a pass] parser boundaries and explicit gaps', () => {
  const report = checkMockup(sample({ html: sample().html.replace('<span>Name</span>', '<span title="a > b">Name</span><!-- <button>⌄</button> --><script>const example = "<button>◇</button>";</script>') }));
  assert.equal(report.status, 'passed');
  for (const script of ['document.body.innerHTML = "<div></div>";', 'const el = document.createElement("section");', 'element.style.color = "red";']) {
    const dynamic = checkMockup(sample({ html: sample().html + `<script>${script}</script>` }));
    assert.equal(dynamic.status, 'inconclusive');
    assert.ok(dynamic.gaps.some(f => f.kind.startsWith('dynamic-')));
  }
  const imported = checkMockup(sample({ styles: [{ name: 'mock.css', text: '@import "other.css";' + baseCSS }] }));
  assert.equal(imported.status, 'inconclusive');
  assert.equal(checkMockup(sample({ html: '<main data-ledger="queue-screen"></main></aside>' })).status, 'inconclusive');
  for (const html of ['', '<main data-ledger="queue-screen">', '<main data-ledger="queue-screen"></main><']) assert.equal(checkMockup(sample({ html })).status, 'inconclusive');
  assert.equal(checkMockup(sample({ styles: [{ name: 'mock.css', text: baseCSS + ' .card {' }] })).status, 'inconclusive');
  assert.throws(() => checkMockup(sample({ ledger: new Set() })), /nonempty ledger/);
});

test('[risk: CLI reports clean despite seeded defects or missing inputs] fixed scenario detection, restoration and exits', t => {
  const args = [join(fixture, 'mock.html'), '--ledger', join(fixture, 'purpose.md'), '--tokens', join(fixture, 'tokens.css'), '--tokens', join(fixture, 'themes/studio/theme.css'), '--json'];
  const broken = run(args);
  assert.equal(broken.status, 1, broken.stdout + broken.stderr);
  const report = JSON.parse(broken.stdout);
  for (const kind of ['ledger-missing', 'text-icon', 'raw-colour', 'button-hover', 'button-focus']) assert.ok(kinds(report).has(kind), kind);
  const dir = scratch(t);
  const clean = readFileSync(args[0], 'utf8').replace('class="card"><strong>', 'class="card" data-ledger="work-card"><strong>').replace('color: #ff0000', 'color: var(--text)').replace('id="fold"', 'class="play" id="fold"').replace('>⌄</button>', '>Fold</button>').replace('href="tokens.css"', `href="${pathToRelative(dir, join(fixture, 'tokens.css'))}"`).replace('href="themes/studio/theme.css"', `href="${pathToRelative(dir, join(fixture, 'themes/studio/theme.css'))}"`);
  writeFileSync(join(dir, 'clean.html'), clean);
  const restored = run([join(dir, 'clean.html'), ...args.slice(1)]);
  assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  assert.equal(JSON.parse(restored.stdout).status, 'passed');
  for (const bad of [[], [args[0]], [args[0], '--unknown'], [args[0], '--tokens'], ['missing.html', ...args.slice(1)]]) {
    const result = run(bad);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, 'inconclusive');
  }
  const theme = spawnSync(process.execPath, [join(fixture, 'theme-check.mjs')], { encoding: 'utf8' });
  assert.equal(theme.status, 0, theme.stderr);
});

// HTML links use URL separators even on Windows; no shell or browser involved.
import { relative } from 'node:path';
const pathToRelative = (from, to) => relative(from, to).replaceAll('\\', '/');

test('[risk: the installed helper or staged pointer drifts from its single source] sync ships the checker and quality contract', t => {
  const dir = scratch(t);
  const put = (path, content) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), content); };
  const read = path => readFileSync(join(root, path), 'utf8');
  for (const path of ['scripts/missed-problems.mjs', 'scripts/mockup-present.mjs', 'docs/missed-problems.md', 'docs/test-budget.md']) {
    put(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
  }
  put('VERSION', read('VERSION'));
  put('scripts/telemetry-marker.mjs', read('scripts/telemetry-marker.mjs'));
  put('scripts/jig-store.mjs', read('scripts/jig-store.mjs'));
  put('scripts/mockup-check.mjs', read('scripts/mockup-check.mjs'));
  put('docs/design-toolbox/README.md', read('docs/design-toolbox/README.md'));
  put('docs/design-toolbox/IMPECCABLE-LICENSE.txt', read('docs/design-toolbox/IMPECCABLE-LICENSE.txt'));
  const source = '.agents/skills/jig-mockup';
  put(`${source}/SKILL.md`, read(`${source}/SKILL.md`) + '\nUse missed-problems.mjs and scripts/mockup-present.mjs.\n');
  mkdirSync(join(dir, '.claude/skills'), { recursive: true });
  assert.equal(syncSkills(dir), 1);
  assert.equal(syncSkills(dir, true), 1);
  const pointer = readFileSync(join(dir, '.claude/skills/jig-mockup/SKILL.md'), 'utf8');
  assert.ok(pointer.includes('../../../.agents/skills/jig-mockup/SKILL.md'));
  assert.equal(readFileSync(join(dir, source, 'scripts/mockup-check.mjs'), 'utf8'), read('scripts/mockup-check.mjs'));
  for (const [target, canonical] of [['scripts/mockup-present.mjs', 'scripts/mockup-present.mjs'], ['missed-problems.mjs', 'scripts/missed-problems.mjs']]) {
    assert.equal(readFileSync(join(dir, source, target), 'utf8'), read(canonical));
    put(`${source}/${target}`, '// planted support drift\n');
    assert.throws(() => syncSkills(dir, true), /Supporting file drift/);
    syncSkills(dir);
  }
  const refused = spawnSync(process.execPath, [join(dir, source, 'scripts/mockup-present.mjs'), dir], { encoding: 'utf8' });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /fresh-seat-review.json/);
  put(`${source}/scripts/mockup-check.mjs`, '// planted drift\n');
  assert.throws(() => syncSkills(dir, true), /Supporting file drift/);
  syncSkills(dir);
  assert.equal(syncSkills(dir, true), 1);
  const toolboxPath = 'docs/design-toolbox/README.md';
  const toolboxSource = read(toolboxPath);
  put(toolboxPath, toolboxSource.replace('Space inside an item', 'Keep space inside an item'));
  assert.throws(() => syncSkills(dir, true), /Supporting file drift/);
  syncSkills(dir);
  assert.ok(readFileSync(join(dir, source, 'toolbox.md'), 'utf8').includes('Keep space inside an item'));
  // Both tables use the same header: selecting the first table must not drop
  // the motion contract or its licence from an installed skill.
  const generated=readFileSync(join(dir, source, 'toolbox.md'), 'utf8');
  // Documentation links must resolve from the installed skill folder. Restore
  // only that path prefix for the full-content comparison; all prose still ships.
  const rebasedFiles=['motion-vocabulary.md','motion-recipes.md','design-brief.md','feedback-vocabulary.md','design-inspector.md'];
  let sourceLinks=generated;
  for(const file of rebasedFiles) {
    sourceLinks=sourceLinks.replaceAll(`](../../../docs/design-toolbox/${file})`, `](${file})`);
    assert.ok(generated.includes(`](../../../docs/design-toolbox/${file})`), `${file}: installed link is rebased`);
  }
  for(const heading of ['Look foundations','Motion basics','Visual state contract','Borrowed practices and attribution']) {
    const section=toolboxSource.match(new RegExp(`^## ${heading}\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`,'m'))[0];
    assert.ok(sourceLinks.includes(section.trim()),`${heading}: entire source section ships`);
  }
  for(const [before,after]of [['100+ uses/day','101+ uses/day'],['Copyright (c) 2026 Emil Kowalski','Copyright (c) 2026 Source author']]) {
    assert.ok(toolboxSource.includes(before));
    put(toolboxPath,toolboxSource.replace(before,after));
    assert.throws(()=>syncSkills(dir,true),/Supporting file drift/);
    syncSkills(dir);
    assert.ok(readFileSync(join(dir,source,'toolbox.md'),'utf8').includes(after));
  }
  put(toolboxPath,toolboxSource.replace('## Motion basics','## Missing motion contract'));
  assert.throws(()=>syncSkills(dir),/Toolbox must define/);
  put(toolboxPath,toolboxSource);syncSkills(dir);
  const result = spawnSync(process.execPath, [join(dir, source, 'scripts/mockup-check.mjs'), join(fixture, 'mock.html'), '--ledger', join(fixture, 'purpose.md'), '--tokens', join(fixture, 'tokens.css'), '--tokens', join(fixture, 'themes/studio/theme.css'), '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(kinds(JSON.parse(result.stdout)).has('text-icon'));
  const installed = join(dir, '.agents/skills/jig-mockup/scripts/mockup-check.mjs');
  assert.equal(readFileSync(installed, 'utf8'), read('scripts/mockup-check.mjs'));
  const installedRun = spawnSync(process.execPath, [installed, join(fixture, 'mock.html'), '--ledger', join(fixture, 'purpose.md'), '--tokens', join(fixture, 'tokens.css'), '--tokens', join(fixture, 'themes/studio/theme.css'), '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(installedRun.status, 1, installedRun.stdout + installedRun.stderr);
  assert.ok(kinds(JSON.parse(installedRun.stdout)).has('ledger-missing'));
});
