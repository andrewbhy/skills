import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { freemem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { argumentsFor, inspectClip, launchChrome, runClip, runVisual, statusFor } from '../scripts/visual-clip.mjs';
import { analyseMotion, recordMotion, recordMotionStrip } from '../scripts/visual-motion.mjs';

const fixture = name => new URL(`fixtures/visual/${name}.html`, import.meta.url).href;
const options = (url, extra = []) => argumentsFor(['--url', url, '--root', '#screen', '--sizes', '800x600', '--duration', '500', ...extra], true);
const browserOnly = { skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser forbidden: JIG_NO_BROWSER=1' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false };

test('[risk: clipped glyphs, cropped labels and required actions escape box-only checks] browser fixtures and clean controls', browserOnly, async t => {
  const browser = await launchChrome(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(fixture('clip'));
  const broken = await page.evaluate(inspectClip, '#screen');
  assert.equal(broken.gaps.length, 0);
  assert.ok(!broken.findings.some(f => ['Clean inline link', 'History scrolled out', 'Visible history'].includes(f.text)), 'inline links and scrolled history remain valid');
  for (const [element, kind, edges] of [['#list-item', 'text-clipped', ['right', 'bottom']], ['#nowrap', 'text-clipped', ['right']]]) {
    const finding = broken.findings.find(f => f.element === element && f.kind === kind);
    assert.ok(finding, `${element}: glyph clipping detected`);
    for (const edge of edges) assert.ok(finding.clipping.some(c => c.edges.includes(edge)), `${element}: ${edge}`);
  }
  for (const element of ['#label', '#input']) assert.ok(broken.findings.some(f => f.kind === 'control-label' && f.element === element));
  assert.ok(broken.findings.some(f => f.kind === 'must-visible' && f.element === '#pay'));
  const sized = await page.locator('#nowrap').evaluate(e => [e.clientWidth, e.getBoundingClientRect().width]);
  assert.deepEqual(sized, [180, 180]);
  await page.goto(fixture('clip') + '?clean');
  assert.deepEqual((await page.evaluate(inspectClip, '#screen')).findings, []);
  await browser.close(); // The public runner owns its own browser; never overlap.
  // Exercise the public runner's evidence and multiple-size contract too.
  const out = mkdtempSync(join(tmpdir(), 'jig-clip-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const report = await runClip(options(fixture('clip'), ['--sizes', '800x600,1000x700', '--out', out, '--settle-ms', '100']));
  assert.equal(report.status, 'findings'); assert.equal(report.runs.length, 2);
  for (const run of report.runs) { assert.equal(run.screenshot, undefined); assert(run.layout.length); }
  assert(!readdirSync(out).some(file => file.endsWith('.png')));
  assert.equal(JSON.parse(readFileSync(join(out, 'clip.json'))).status, 'findings');
  const captured = await runClip(options(fixture('clip'), ['--out', out, '--png']));
  assert.equal(readFileSync(captured.runs[0].screenshot).subarray(1, 4).toString(), 'PNG');
  const missing = await runClip(options(fixture('clip'), ['--root', '#missing', '--out', out, '--timeout-ms', '300']));
  assert.equal(missing.status, 'inconclusive');
  assert.equal(missing.runs[0].screenshot, undefined);
});

test('[risk: screenshot defaults and state filters spend a full matrix] named-state runner captures only on request and reports unknown states', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-visual-budget-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const setup = join(out, 'setup.mjs');
  writeFileSync(setup, 'export default async function(){}; export async function* states(){yield {name:"open",root:"#open"};yield {name:"closed",root:"#closed"};}');
  let captures = 0, pagesClosed = 0, browsersClosed = 0;
  // Browser boundary fake: exercise orchestration and filesystem effects, not
  // pretend to establish layout or visual acceptance without Chrome.
  const launch = async () => ({ version: () => 'boundary-fake', close: async () => { browsersClosed++; }, newPage: async () => ({
    setDefaultTimeout() {}, on() {}, goto: async () => {}, locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
    waitForFunction: async () => {}, waitForTimeout: async () => {}, close: async () => { pagesClosed++; },
    evaluate: async fn => fn.name === 'inspectLayout' ? [{ box: { width: 10 } }] : { ready: true, signature: 'quiet' },
    screenshot: async ({ path }) => { captures++; if (path) writeFileSync(path, 'PNG-boundary-fake'); }
  }) });
  const args = ['--out', out, '--setup', setup, '--states', 'open', '--settle-ms', '1'];
  const inspect = async (_page, scoped) => ({ findings: [{ root: scoped.root }], gaps: [] });
  const measured = await runVisual(options(fixture('clip'), args), 'budget', inspect, { launch });
  assert.equal(captures, 0); assert.equal(measured.runs.length, 1); assert.equal(measured.runs[0].state, 'open');
  assert.equal(measured.runs[0].findings[0].root, '#open');
  await runVisual(options(fixture('clip'), [...args, '--png']), 'budget', inspect, { launch });
  assert.equal(captures, 1);
  await runVisual(options(fixture('clip'), [...args, '--png']), 'budget', async () => ({ findings: [], gaps: [] }), { launch });
  assert.equal(captures, 1, 'explicit PNG still saves only failed states');
  const unknown = await runVisual(options(fixture('clip'), [...args, '--states', 'absent']), 'budget', inspect, { launch });
  assert.equal(unknown.status, 'inconclusive'); assert.match(unknown.gaps.join(), /Unknown states/);
  assert.equal(pagesClosed, 4); assert.equal(browsersClosed, 4);
});

test('[risk: evidence is written into the repository by default] temp output and explicit flags', () => {
  const parsed = options(fixture('clip'));
  assert(parsed.out.startsWith(tmpdir())); assert.equal(parsed.png, false); assert.equal(parsed.sizes.length, 1);
  assert.equal(options(fixture('clip'), ['--png', '--sheet']).sheet, true);
  assert.throws(() => options(fixture('clip'), ['--states', 'open']), /requires/);
  assert.throws(() => options(fixture('clip'), ['--setup', 'setup.mjs', '--states', 'open,']), /nonempty/);
});

test('[risk: one-frame jumps and caret hops disappear between stills] rAF fixture and stationary controls', browserOnly, async t => {
  const browser = await launchChrome(); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(fixture('motion'));
  const opts = options(fixture('motion'));
  const recording = await recordMotion(page, opts);
  const broken = analyseMotion(recording.frames, opts);
  assert.ok(broken.findings.some(f => f.element === '#dot' && f.kind === 'one-frame-snap'));
  assert.ok(broken.findings.some(f => f.element === '#caret'));
  await page.goto(fixture('motion') + '?clean');
  const clean = await recordMotion(page, opts);
  assert.deepEqual(analyseMotion(clean.frames, opts).findings, []);
});

const frame = (time, x, marker = false) => ({ time, boxes: [{ id: 1, name: 'dot', marker, rect: [x, 0, 8, 8] }] });
test('[risk: missed frames or slow sampling claim a clean motion pass] timing coverage and gap exclusion', () => {
  const full = [frame(0, 0), frame(16, 100), frame(32, 0), frame(48, 0)];
  assert.equal(analyseMotion(full, { duration: 48 }).findings.length, 1);
  assert.equal(analyseMotion(full, { duration: 48 }).gaps.length, 0);
  const missing = analyseMotion([frame(0, 0), frame(16, 100), frame(64, 0)], { duration: 64 });
  assert.equal(missing.findings.length, 0); assert.equal(missing.coverage.estimatedMissed, 2);
  assert.equal(statusFor([], missing.gaps), 'inconclusive');
  assert.ok(analyseMotion([frame(0, 0), frame(33, 0), frame(66, 0)], { duration: 66 }).gaps.length);
  assert.ok(analyseMotion([frame(0, 0)], { duration: 100 }).gaps.length);
  assert.equal(statusFor([{}], ['gap']), 'inconclusive');
  assert.equal(analyseMotion([frame(0, 0), frame(16, 3), frame(32, 6)], { duration: 32 }).findings.length, 0);
});

test('[risk: motion recording starts after the effect or saves an unrequested strip] trigger ordering and joined failure paths', async () => {
  const events = []; let finish;
  const page = { evaluate: async () => { events.push('armed'); return new Promise(resolve => { finish = resolve; }); },
    screenshot: async () => { events.push('capture'); return Buffer.from('in-memory'); }, waitForTimeout: async () => {} };
  const trigger = async () => { events.push('trigger'); finish({ frames: [], gaps: [] }); };
  const quiet = await recordMotionStrip(page, { root: 'body', duration: 1 }, trigger);
  assert.deepEqual(events, ['armed', 'trigger']); assert.deepEqual(quiet.images, []);
  events.length = 0;
  const strip = await recordMotionStrip(page, { root: 'body', duration: 1 }, trigger, { capture: true });
  assert.deepEqual(events.slice(0, 3), ['capture', 'armed', 'trigger']);
  assert.equal(strip.images.length, 6); assert.equal(strip.images[0].label, 'before trigger');
  await assert.rejects(recordMotionStrip(page, { root: 'body', duration: 1 }, async () => { finish({ frames: [], gaps: [] }); throw new Error('seeded setup failure'); }), /seeded/);
});

test('[risk: invalid inputs and unavailable Chrome emit a false pass] CLI exits 2 with JSON', () => {
  for (const script of ['visual-clip', 'visual-motion']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url)), '--url', fixture('clip')], {
      encoding: 'utf8', env: { ...process.env, CHROME_PATH: join(tmpdir(), 'jig-missing-chrome') }
    });
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).status, 'inconclusive');
  }
  for (const args of [[], ['--sizes', 'narrow'], ['--threshold', '-1'], ['--duration', 'NaN']]) {
    assert.throws(() => argumentsFor(['--url', fixture('clip'), ...args, ...(args.length ? [] : ['--oops', 'x'])], true));
  }
});
