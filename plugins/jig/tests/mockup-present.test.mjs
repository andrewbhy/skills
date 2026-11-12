import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkPresentation } from '../scripts/mockup-present.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-present-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const time = seconds => new Date(Date.UTC(2026, 10, 8, 0, 0, seconds));
  const put = (path, value, seconds = 2) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'object' ? JSON.stringify(value) : value);
    utimesSync(join(root, path), time(seconds), time(seconds));
  };
  const get = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const edit = (path, change, seconds = path === 'fresh-seat-review.json' ? 3 : 2) => {
    const value = get(path); change(value); put(path, value, seconds);
  };
  put('mock.html', '<main>Sample</main>', 1);
  put('tokens.css', ':root{}', 1);
  put('build.json', { artifact: 'mock.html', inputs: ['tokens.css'], builder: 'builder-session', coordinator: 'coord-session' }, 1);
  for (const path of ['contact-sheet.png', 'reference.png', 'selection-check.md', 'calibration.json']) put(path, 'fixture evidence');
  put('visual-check/report.json', { tool: 'visual-check', version: 2, options: { gate: true, url: pathToFileURL(join(root, 'mock.html')).href },
    coverage: { expected: 1, completed: 1, attempted: 1, complete: true }, runs: [{ completed: true, gaps: [] }], gaps: [],
    budget: { stopped: false }, status: 'passed', findings: [] });
  put('feedback.json', { items: [{ id: 'F1', kind: 'Fix', item: 'Consistent selection', artifact: 'mock.html', status: 'verified', evidence: 'selection-check.md' }] });
  put('waivers.json', { items: [] });
  put('fresh-seat-review.json', { artifact: 'mock.html', reviewer: 'fresh-session', fresh: true, decision: 'accepted',
    renderedEvidence: 'contact-sheet.png', reference: 'reference.png', closes: ['F1'], waivers: [], message: 'mock.html closes F1 with consistent selection.' }, 3);
  return { root, put, get, edit };
}
const run = root => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/mockup-present.mjs', import.meta.url)), root], { encoding: 'utf8' });
const fails = (f, expected) => {
  const report = checkPresentation(f.root);
  assert.equal(report.passed, false, JSON.stringify(report));
  assert.match(report.reasons.join('\n'), expected);
};

test('[risk: evidence gates block a valid round or do not enforce refusals] complete artifact passes public CLI and missing records fail', t => {
  const f = fixture(t);
  assert.deepEqual(checkPresentation(f.root), { passed: true, artifact: 'mock.html', reasons: [] });
  assert.equal(run(f.root).status, 0);
  for (const path of ['build.json', 'visual-check/report.json', 'fresh-seat-review.json', 'waivers.json', 'feedback.json']) {
    const original = f.get(path);
    rmSync(join(f.root, path));
    fails(f, new RegExp(path.replaceAll('.', '\\.')));
    assert.equal(run(f.root).status, 1);
    f.put(path, original, path === 'build.json' ? 1 : path === 'fresh-seat-review.json' ? 3 : 2);
  }
  f.put('feedback.json', '{'); fails(f, /feedback.json/);
});

test('[risk: partial runner evidence is presented as complete] every coverage, gap, budget and provenance refusal is enforced', t => {
  const changes = [
    [r => { r.options.gate = false; }, /--gate/],
    [r => { r.options.url += '-other'; }, /different artifact/],
    [r => { r.coverage.complete = false; }, /incomplete/],
    [r => { r.coverage.expected = 0; }, /incomplete/],
    [r => { r.coverage.completed = 0; }, /incomplete/],
    [r => { r.coverage.attempted = 0; }, /incomplete/],
    [r => { r.runs = []; }, /incomplete/],
    [r => { r.runs[0].completed = false; }, /incomplete/],
    [r => { r.runs[0].gaps = ['Ink not measured']; }, /incomplete/],
    [r => { r.gaps = ['Browser failed']; }, /incomplete/],
    [r => { r.budget.stopped = true; }, /incomplete/],
    [r => { r.status = 'inconclusive'; }, /invalid status/],
    [r => { r.findings = {}; }, /invalid status/],
  ];
  for (const [change, expected] of changes) { const f = fixture(t); f.edit('visual-check/report.json', change); fails(f, expected); }
});

test('[risk: coordinator accepts its own artifact or stale review] acceptance requires a fresh rendered-reference seat after last build', t => {
  for (const [change, expected] of [
    [r => { r.reviewer = 'coord-session'; }, /fresh seat/],
    [r => { r.reviewer = 'builder-session'; }, /fresh seat/],
    [r => { r.fresh = false; }, /fresh seat/],
    [r => { r.decision = 'pending'; }, /has not accepted/],
    [r => { r.artifact = 'font-probe.html'; }, /different artifact/],
    [r => { delete r.renderedEvidence; }, /rendered evidence/],
    [r => { r.reference = 'missing.png'; }, /reference/],
  ]) { const f = fixture(t); f.edit('fresh-seat-review.json', change); fails(f, expected); }
  for (const path of ['mock.html', 'tokens.css', 'build.json']) {
    const f = fixture(t); const date = new Date(Date.UTC(2026, 10, 8, 0, 0, 5)); utimesSync(join(f.root, path), date, date);
    fails(f, /review is stale/); fails(f, /gate report is stale/);
  }
  for (const path of ['contact-sheet.png', 'reference.png', 'selection-check.md', 'feedback.json', 'waivers.json', 'visual-check/report.json']) {
    const f = fixture(t); const date = new Date(Date.UTC(2026, 10, 8, 0, 0, 5)); utimesSync(join(f.root, path), date, date);
    fails(f, /predates evidence/);
  }
  const f = fixture(t); f.edit('build.json', b => { b.artifact = '../elsewhere.html'; }); fails(f, /leaves round folder/);
});

test('[risk: findings explained away as noise without agreement] exact waivers require fresh-seat agreement and checker calibration', t => {
  const f = fixture(t);
  f.edit('visual-check/report.json', r => { r.status = 'findings'; r.findings = [{ id: 1, kind: 'grey-on-grey' }]; });
  fails(f, /Open visual finding 1/);
  f.put('waivers.json', { items: [{ finding: 1, reason: 'Reference has intentional glow', reviewer: 'fresh-session', evidence: 'selection-check.md' }] });
  fails(f, /fresh-seat agreement/); fails(f, /calibration item/);
  f.edit('fresh-seat-review.json', r => { r.waivers = [1]; });
  fails(f, /calibration item/);
  f.edit('waivers.json', w => { w.items[0].calibration = 'calibration.json'; });
  assert.equal(checkPresentation(f.root).passed, true);
  f.edit('waivers.json', w => { delete w.items[0].evidence; });
  fails(f, /waiver evidence/);
  f.edit('waivers.json', w => { w.items[0].evidence = 'selection-check.md'; });
  f.put('calibration.json', 'Updated calibration after review', 5);
  fails(f, /predates evidence: calibration.json/);
  f.put('calibration.json', 'Reviewed calibration', 2);
  f.edit('waivers.json', w => { w.items[0].reviewer = 'coord-session'; });
  fails(f, /fresh-seat agreement/);
});

test('[risk: a font probe closes feedback on the component sheet] ledger keeps artifact identity and explicit verified closures', t => {
  for (const status of ['open', 'fixed']) { const f = fixture(t); f.edit('feedback.json', l => { l.items[0].status = status; }); fails(f, /F1.*verification pending/); }
  for (const [change, expected] of [
    [l => { l.items[0].evidence = ''; }, /Feedback F1/],
    [l => { l.items[0].kind = 'Ignore'; }, /invalid or duplicate/],
    [l => { l.items[0].status = 'closed'; }, /invalid or duplicate/],
    [l => { l.items.push(l.items[0]); }, /duplicate/],
  ]) { const f = fixture(t); f.edit('feedback.json', change); fails(f, expected); }
  const f = fixture(t);
  f.edit('fresh-seat-review.json', r => { r.closes = []; }); fails(f, /does not close feedback F1/);
  f.edit('fresh-seat-review.json', r => { r.closes = ['F1']; r.message = 'Font probe now looks good'; }); fails(f, /message must name artifact mock.html/);
  f.edit('fresh-seat-review.json', r => { r.message = 'mock.html closes F1'; });
  f.edit('feedback.json', l => { l.items.push({ ...l.items[0], id: 'F2', artifact: 'other.html', status: 'open' }); });
  assert.equal(checkPresentation(f.root).passed, true, 'feedback on another artifact stays open without blocking this artifact');
});

test('[risk: malformed record shapes crash or bypass the presentation gate] schema and missing evidence refusals stay explicit', t => {
  for (const [path, change, expected] of [
    ['build.json', b => { b.inputs = null; }, /inputs must list/],
    ['build.json', b => { b.builder = ''; }, /session IDs required/],
    ['build.json', b => { b.artifact = {}; }, /Build input/],
    ['visual-check/report.json', r => { r.runs = [null]; }, /incomplete/],
    ['visual-check/report.json', r => { r.findings = [null]; }, /invalid finding ID/],
    ['feedback.json', l => { l.items = {}; }, /items array/],
    ['waivers.json', w => { w.items = {}; }, /items array/],
  ]) { const f = fixture(t); f.edit(path, change); fails(f, expected); }
  const f = fixture(t); f.put('contact-sheet.png', ''); fails(f, /nonempty file/);
});
