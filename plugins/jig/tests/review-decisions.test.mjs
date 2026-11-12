import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { addItem, appendThread, closeItem, decisionsView, enrichItems, statusOf, readQueue, readThread, recordDecision } from '../scripts/review-core.mjs';
import { closeWork, doctor, moveWork, reopenWork, setParked } from '../scripts/review-work.mjs';
import { checkTransition, transitions } from '../scripts/review-states.mjs';
import { addDecision, parseImpact, readDecisions } from '../scripts/review-decisions.mjs';
import { createReviewServer } from '../scripts/review-server.mjs';
import { projectName, readJson, registerProject, stateDir, statePath, storeRoot, writeJson } from '../scripts/jig-store.mjs';
import { applyMigration, planMigration, removalCommands, report, run as migrate } from '../scripts/jig-migrate-state.mjs';

const script = (name) => resolve(import.meta.dirname, '..', 'scripts', name);
function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-decisions-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'root', 'docs', 'design'); const dir = join(tmp, 'state'); const home = join(tmp, 'home');
  mkdirSync(root, { recursive: true }); mkdirSync(dir); mkdirSync(home);
  writeFileSync(join(root, 'FLOWS.md'), '# flows\n'); writeFileSync(join(root, 'MAP.md'), '# map\n'); writeFileSync(join(root, 'OTHER.md'), '# other\n');
  const past = new Date('2026-11-01T10:00:00Z'); for (const n of ['FLOWS.md', 'MAP.md', 'OTHER.md']) utimesSync(join(root, n), past, past);
  const queue = join(dir, 'queue.json');
  writeFileSync(queue, JSON.stringify({ items: [{ id: 'lab-job', item: 'Lab job', state: 'pending', area: 'creation' }] }));
  const roots = [{ prefix: 'g', path: join(tmp, 'root') }];
  const add = (name, when = '2026-11-02T10:00:00Z') => addItem(roots, { path: join(root, name), title: name }, dir, new Date(when)).item;
  return { tmp, root, dir, home, queue, roots, add, ctx: (extra = {}) => ({ queue, home, now: new Date('2026-11-11T12:00:00Z'), decisions: readDecisions({ home }), ...extra }) };
}
const decide = (f, over = {}) => recordDecision({ decision: 'Fire on second click', quote: 'right click to lock on, left click to confirm', source: 'app-one-turn-prototype', project: 'app-one', impacts: [], at: '2026-11-10T12:00:00Z', ...over }, { dir: f.dir, home: f.home, now: new Date('2026-11-10T12:00:00Z') });
const note = (f, id, kind) => enrichItems(f.roots, f.dir, f.ctx()).find((x) => x.id === id).decisionNotes.find((n) => n.kind === kind);

test('a decision keeps its id, words, source, date, home project and impacts; ids count per project', (t) => {
  const f = fixture(t);
  const a = addDecision({ decision: 'D1', quote: 'exact words', source: 'q12', project: 'app-one', impacts: ['item-1:outdates', { ref: 'lab:recipe-schema', kind: 'informs' }] }, { home: f.home });
  const b = addDecision({ decision: 'D2', quote: 'more words', source: 'playtest 11 Nov', project: 'app-one' }, { home: f.home });
  const c = addDecision({ decision: 'L1', quote: 'lab words', source: 'item-9', project: 'lab' }, { home: f.home });
  assert.deepEqual([a.id, b.id, c.id], [1, 2, 1]);
  assert.deepEqual(a.impacts, [{ ref: 'item-1', kind: 'outdates' }, { ref: 'lab:recipe-schema', kind: 'informs' }]);
  const all = readDecisions({ home: f.home });
  assert.equal(all.length, 3);
  assert.deepEqual(readDecisions({ home: f.home, project: 'lab' }).map((d) => d.decision), ['L1']);
  assert.equal(all[0].quote, 'exact words'); assert.equal(all[0].source, 'q12');
  assert.throws(() => addDecision({ decision: 'x', quote: '', source: 's', project: 'app-one' }, { home: f.home }), /exact words/);
  assert.throws(() => addDecision({ decision: 'x', quote: 'q', source: '', project: 'app-one' }, { home: f.home }), /source/);
  assert.throws(() => parseImpact('item-1:smashes'), /Invalid impact/);
  assert.deepEqual(parseImpact('app-one:docs/a.md:blocks'), { ref: 'app-one:docs/a.md', kind: 'blocks' });
});

test('outdates: marks an open item until its file changes after the decision, or it closes', (t) => {
  const f = fixture(t);
  const item = f.add('FLOWS.md');
  decide(f, { impacts: [{ ref: 'app-one:docs/design/FLOWS.md', kind: 'outdates' }] });
  let n = note(f, item.id, 'outdates');
  assert.equal(n.active, true); assert.equal(n.text, 'outdated by decision #1 (app-one)'); assert.equal(n.state, 'outdated');
  const later = new Date('2026-11-10T13:00:00Z'); utimesSync(join(f.root, 'FLOWS.md'), later, later);
  n = note(f, item.id, 'outdates');
  assert.equal(n.active, false); assert.equal(n.state, 'updated');
  utimesSync(join(f.root, 'FLOWS.md'), new Date('2026-11-01T10:00:00Z'), new Date('2026-11-01T10:00:00Z'));
  assert.equal(note(f, item.id, 'outdates').active, true);
  closeItem(item.id, { reason: 'old' }, f.dir);
  assert.equal(note(f, item.id, 'outdates').active, false);
  const view = decisionsView(f.roots, f.dir, f.ctx());
  assert.equal(view[0].affects[0].state, 'closed');
});

test('an item added after the decision is the updated version, not outdated', (t) => {
  const f = fixture(t);
  decide(f, { impacts: ['item-1:outdates', 'app-one:docs/design/FLOWS.md:outdates'] });
  const item = f.add('FLOWS.md', '2026-11-10T15:00:00Z');
  assert.equal(note(f, item.id, 'outdates').active, false);
});

test('informs and confirms give soft notes; reopens reopens a closed item with a system line', (t) => {
  const f = fixture(t);
  const a = f.add('MAP.md'); const b = f.add('OTHER.md'); const c = f.add('FLOWS.md');
  closeItem(c.id, { reason: 'reviewed' }, f.dir);
  const r = decide(f, { impacts: [`item-${a.id}:informs`, `item-${b.id}:confirms`, `item-${c.id}:reopens`] });
  assert.deepEqual(r.reopened, [c.id]);
  assert.equal(note(f, a.id, 'informs').text, 'new light from #1 (app-one)');
  assert.equal(note(f, b.id, 'confirms').text, 'confirmed by #1 (app-one)');
  const items = enrichItems(f.roots, f.dir, f.ctx());
  const reopened = items.find((x) => x.id === c.id);
  assert.equal(reopened.done, false); assert.equal(reopened.closed, null);
  assert.equal(note(f, c.id, 'reopens').active, true);
  assert.ok(readThread(`item-${c.id}`, f.dir).some((m) => m.from === 'system' && /Reopened by decision #1 \(app-one\)/.test(m.text)));
  assert.ok(readThread(`item-${a.id}`, f.dir).some((m) => m.from === 'system' && /informs this item/.test(m.text)));
  assert.equal(enrichItems(f.roots, f.dir, f.ctx()).find((x) => x.id === a.id).done, false);
});

test('blocks and unblocks feed the dependency logic; an answering decision closes an open question dependency', (t) => {
  const f = fixture(t);
  const a = f.add('MAP.md');
  decide(f, { decision: 'Wait for the lab', impacts: [`item-${a.id}:blocks`] });
  let it = enrichItems(f.roots, f.dir, f.ctx()).find((x) => x.id === a.id);
  assert.equal(it.status, 'blocked');
  assert.match(it.blockedBy[0].label, /^decision #1 \(app-one\): Wait for the lab/);
  decide(f, { decision: 'Lab is ready', impacts: [`item-${a.id}:unblocks`], at: '2026-11-10T13:00:00Z' });
  it = enrichItems(f.roots, f.dir, f.ctx()).find((x) => x.id === a.id);
  assert.equal(it.blockedBy.length, 0); assert.notEqual(it.status, 'blocked');
  const oq = join(f.dir, 'oq.md'); writeFileSync(oq, '# Q\n\n## Open\n\n7. Seven?\n');
  const dep = addItem(f.roots, { path: join(f.root, 'OTHER.md'), title: 'waits', dependsOn: 'q7' }, f.dir, new Date('2026-11-03T10:00:00Z'), { queue: f.queue, openQuestions: oq }).item;
  assert.equal(enrichItems(f.roots, f.dir, { openQuestions: oq, queue: f.queue }).find((x) => x.id === dep.id).status, 'blocked');
  addDecision({ decision: 'Seven is yes', quote: 'yes', source: 'q7', project: 'app-one' }, { home: f.home });
  assert.equal(enrichItems(f.roots, f.dir, { openQuestions: oq, queue: f.queue, decisions: readDecisions({ home: f.home }) }).find((x) => x.id === dep.id).status, 'waiting-you');
});

test('refs cross projects: a lab decision hits a app-one file, a jig queue item and an item id; unknown refs stay unlinked', (t) => {
  const f = fixture(t);
  const item = f.add('FLOWS.md');
  registerProject('app-one', join(f.tmp, 'root'), { home: f.home });
  addDecision({ decision: 'Image size 1024', quote: 'ok 1024', source: 'q4', project: 'lab', impacts: ['app-one:docs/design/FLOWS.md:informs', 'jig:queue/lab-job:outdates', 'lab:recipe-schema:informs', `jig:item-${item.id}:confirms`] }, { home: f.home, at: '2026-11-10T00:00:00Z' });
  const view = decisionsView(f.roots, f.dir, f.ctx());
  assert.equal(view[0].project, 'lab');
  assert.deepEqual(view[0].affects.map((a) => [a.type, a.kind]), [['item', 'informs'], ['queue', 'outdates'], ['none', 'informs'], ['item', 'confirms']]);
  assert.equal(view[0].affects[1].active, true);
  const row = readQueue(f.queue, f.roots, { progressDir: f.dir, decisions: f.ctx().decisions, home: f.home }).next[0];
  assert.equal(row.decisionNotes[0].text, 'outdated by decision #1 (lab)');
});

test('CLI: decide records and reopens, decisions lists, project filter works', (t) => {
  const f = fixture(t);
  const c = f.add('FLOWS.md'); closeItem(c.id, { reason: 'done' }, f.dir);
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir, JIG_HOME: f.home };
  const cli = (...args) => spawnSync(process.execPath, [script('review.mjs'), ...args], { env, encoding: 'utf8' });
  const r = cli('decide', 'Rotate on Home/End', '--quote', 'q and r are high value', '--source', 'item-31', '--project', 'app-one', '--affects', `item-${c.id}:reopens`, 'jig:queue/lab-job:informs');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Decision #1 \(app-one\) recorded\./); assert.match(r.stdout, /Reopened item 1\./);
  cli('decide', 'Lab thing', '--quote', 'w', '--source', 'q2', '--project', 'lab');
  assert.equal(cli('decisions').stdout.trim().split('\n').length, 2);
  const only = cli('decisions', '--project', 'app-one').stdout;
  assert.match(only, /^app-one#1\t.*Rotate on Home\/End\titem-1:reopens jig:queue\/lab-job:informs$/m); assert.doesNotMatch(only, /lab#1/);
  assert.notEqual(cli('decide', 'no quote', '--source', 's', '--project', 'app-one').status, 0);
});

test('server: /api/state carries decisions and item notes; the page has a Decisions view', async (t) => {
  const f = fixture(t);
  const item = f.add('FLOWS.md');
  decide(f, { impacts: ['app-one:docs/design/FLOWS.md:outdates'] });
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, home: f.home });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const state = JSON.parse((await http(server, 'GET', '/api/state')).text);
  assert.equal(state.decisions[0].key, 'app-one#1'); assert.equal(state.decisions[0].affects[0].state, 'outdated');
  assert.equal(state.items.find((x) => x.id === item.id).decisionNotes[0].kind, 'outdates');
  const th = JSON.parse((await http(server, 'GET', `/api/threads/item-${item.id}`)).text);
  assert.equal(th.decisionNotes[0].active, true);
  const page = (await http(server, 'GET', '/')).text;
  assert.match(page, /data-tab="dec"/); assert.match(page, /id="declist"/);
});

// ---------- store ----------
test('store root: JIG_HOME wins, default is ~/.jig, tests never reach the real home', () => {
  assert.equal(storeRoot({ JIG_HOME: 'x' }), resolve('x'));
  assert.match(storeRoot({}).replace(/\\/g, '/'), /\/\.jig$/);
  assert.equal(storeRoot({ NODE_TEST_CONTEXT: '1' }), null);
});

test('store: projects.json maps names to repos; linked worktrees share the main checkout project', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-store-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = join(tmp, 'home'); const repo = join(tmp, 'some-folder'); const wt = join(tmp, 'wt');
  mkdirSync(join(repo, '.git', 'worktrees', 'wt'), { recursive: true }); mkdirSync(wt);
  writeFileSync(join(wt, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt').replace(/\\/g, '/')}\n`);
  assert.equal(projectName(repo, { home }), 'some-folder');
  registerProject('nice-name', repo, { home });
  assert.equal(projectName(repo, { home }), 'nice-name');
  assert.equal(projectName(wt, { home }), 'nice-name');
  assert.deepEqual(readJson(join(home, 'projects.json')), { 'nice-name': resolve(repo) });
});

test('store: falls back to the repo .jig/ until the store has state, then the store wins; nothing is written into a clean repo', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-store-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = join(tmp, 'home'); const repo = join(tmp, 'proj');
  registerProject('proj', repo, { home }); // an own project: detached (work) mode is the default for unregistered repos
  mkdirSync(join(repo, '.jig'), { recursive: true }); writeFileSync(join(repo, '.jig', 'queue.json'), '{}');
  assert.equal(stateDir(repo, { home }), join(repo, '.jig'));
  assert.equal(statePath(repo, 'queue.json', { home }), join(repo, '.jig', 'queue.json'));
  writeJson(join(home, 'proj', 'decisions.jsonl.keep'), {}); // a lone decisions file does not count, a state file does
  rmSync(join(home, 'proj', 'decisions.jsonl.keep'));
  addDecision({ decision: 'd', quote: 'q', source: 's', project: 'proj' }, { home });
  assert.equal(stateDir(repo, { home }), join(repo, '.jig'), 'decisions alone must not flip a project to the store');
  writeJson(join(home, 'proj', 'queue.json'), { items: [] });
  assert.equal(stateDir(repo, { home }), join(home, 'proj'));
  const clean = join(tmp, 'clean'); mkdirSync(clean);
  assert.equal(stateDir(clean, { home }), join(home, 'clean'));
  assert.equal(existsSync(join(clean, '.jig')), false);
  const tracked = join(tmp, 'tracked'); mkdirSync(join(tracked, '.jig'), { recursive: true }); writeFileSync(join(tracked, '.jig', 'testing.json'), '{}');
  assert.equal(stateDir(tracked, { home }), join(home, 'tracked'), 'a repo that only has its own tooling files uses the store');
  assert.equal(stateDir(repo, { home: null }), join(repo, '.jig'));
});

test('telemetry helper and signals resolve through JIG_HOME for a project with no legacy state', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-store-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = join(tmp, 'home'); const repo = join(tmp, 'proj'); mkdirSync(repo);
  const r = spawnSync(process.execPath, ['-e', `import('${new URL('../scripts/jig-store.mjs', import.meta.url).href}').then(m=>console.log(m.statePath(process.argv[1],'telemetry.jsonl')))`, repo], { env: { ...process.env, JIG_HOME: home }, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), join(home, 'proj', 'telemetry.jsonl'));
});

// ---------- migration ----------
function legacyRepo(tmp) {
  const repo = join(tmp, 'oldrepo');
  mkdirSync(join(repo, '.jig', 'threads'), { recursive: true }); mkdirSync(join(repo, '.jig', 'progress'), { recursive: true }); mkdirSync(join(repo, '.jig', 'worktrees.lockdir'), { recursive: true });
  writeFileSync(join(repo, '.jig', 'queue.json'), '{"version":1,"items":[]}'); writeFileSync(join(repo, '.jig', 'testing.json'), '{}');
  writeFileSync(join(repo, '.jig', 'threads', 'item-1.jsonl'), '{"from":"person","text":"hi","at":"2026-11-11T00:00:00Z"}\n');
  writeFileSync(join(repo, '.jig', 'progress', 'a.json'), '{}'); writeFileSync(join(repo, '.jig', 'telemetry.jsonl'), 'a\n'); writeFileSync(join(repo, '.jig', 'q.lock'), '');
  writeFileSync(join(repo, '.jig', 'review-roots.json'), JSON.stringify({ port: 1, queue: join(repo, '.jig', 'queue.json'), roots: [] }));
  return repo;
}
test('migration dry run reports, writes nothing and keeps repo-owned files', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-migrate-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = legacyRepo(tmp); const home = join(tmp, 'home'); const lines = [];
  const before = readFileSync(join(repo, '.jig', 'queue.json'), 'utf8');
  const { plans, failures } = migrate(['--home', home, '--project', `jig=${repo}`], { out: (l) => lines.push(l) });
  const text = lines.join('\n');
  assert.match(text, /^DRY RUN/); assert.match(text, /copy: 5 files/); assert.match(text, /stays in the repo.*testing\.json/);
  assert.match(text, /rewrite: review-roots\.json: queue path rewritten/);
  assert.deepEqual(failures, []);
  assert.equal(existsSync(home), false, 'dry run creates nothing');
  assert.equal(readFileSync(join(repo, '.jig', 'queue.json'), 'utf8'), before);
  assert.doesNotMatch(text, /node -e/, 'no removal commands before a verified apply');
  assert.equal(plans[0].copy.some((i) => i.rel === 'q.lock' || i.rel.includes('lockdir')), false);
});

test('migration apply copies, verifies, rewrites the queue path, is repeatable, never deletes', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-migrate-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = legacyRepo(tmp); const home = join(tmp, 'home');
  const plans = [planMigration({ project: 'jig', repo }, home)];
  assert.deepEqual(applyMigration(plans, home), []);
  assert.equal(readFileSync(join(home, 'jig', 'threads', 'item-1.jsonl'), 'utf8'), readFileSync(join(repo, '.jig', 'threads', 'item-1.jsonl'), 'utf8'));
  assert.equal(JSON.parse(readFileSync(join(home, 'jig', 'review-roots.json'), 'utf8')).queue, join(home, 'jig', 'queue.json').replace(/\\/g, '/'));
  assert.deepEqual(readJson(join(home, 'projects.json')), { jig: resolve(repo) });
  assert.equal(existsSync(join(repo, '.jig', 'queue.json')), true, 'source untouched');
  assert.equal(stateDir(repo, { home }), join(home, 'jig'));
  appendThread('x', 'agent', 'y', join(repo, '.jig')); writeFileSync(join(repo, '.jig', 'telemetry.jsonl'), 'a\nb\n');
  const again = [planMigration({ project: 'jig', repo }, home)];
  assert.deepEqual(again[0].refresh.map((i) => i.rel), ['telemetry.jsonl']);
  assert.equal(again[0].same.length, 4);
  writeFileSync(join(home, 'jig', 'queue.json'), '{"changed":true}');
  const third = [planMigration({ project: 'jig', repo }, home)];
  assert.deepEqual(third[0].conflicts.map((i) => i.rel), ['queue.json']);
  assert.deepEqual(removalCommands(third), [], 'a conflict blocks removal advice');
  assert.match(report(third, { apply: false, home }), /CONFLICT/);
  assert.deepEqual(removalCommands(again).length > 0, true);
});

// ---------- parked and header ----------
function http(server, method, path, body) {
  return new Promise((resolveReq, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let text = ''; res.on('data', (c) => (text += c)); res.on('end', () => resolveReq({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end(data ?? undefined);
  });
}

test('parked work: waitsFor "parked..." and state parked leave For you / Your move and show in Parked with the reason', (t) => {
  const f = fixture(t);
  writeFileSync(f.queue, JSON.stringify({ items: [
    { id: 'a', item: 'Public export', state: 'pending', waitsFor: 'parked: person decides later' },
    { id: 'b', item: 'Offline install', state: 'pending', waitsFor: ['parked since 9 Nov, no hardware'] },
    { id: 'c', item: 'Explicit', state: 'parked', parkedReason: 'waiting for a new GPU' },
    { id: 'd', item: 'Real ask', state: 'pending', waitsFor: 'person: pick a colour' },
    { id: 'e', item: 'Plain next', state: 'pending' }
  ] }));
  const w = readQueue(f.queue, f.roots, { progressDir: f.dir });
  assert.deepEqual(w.needsYou.map((x) => x.id), ['d']); assert.deepEqual(w.next.map((x) => x.id), ['e']); assert.deepEqual(w.waiting, []);
  assert.deepEqual(w.parked.map((x) => [x.id, x.parkedReason]), [['a', 'person decides later'], ['b', 'since 9 Nov, no hardware'], ['c', 'waiting for a new GPU']]);
});

test('park and unpark commands change the queue and restore the earlier state', (t) => {
  const f = fixture(t);
  writeFileSync(f.queue, JSON.stringify({ version: 1, items: [{ id: 'a', item: 'A', state: 'pending', waitsFor: 'person: look' }, { id: 'b', item: 'B', state: 'pending', waitsFor: 'parked: x' }] }));
  writeFileSync(join(f.dir, 'review-roots.json'), JSON.stringify({ roots: f.roots, queue: f.queue }));
  const env = { ...process.env, JIG_REVIEW_DIR: f.dir };
  const cli = (...args) => spawnSync(process.execPath, [script('review.mjs'), ...args], { env, encoding: 'utf8' });
  assert.equal(cli('park', 'a', '--reason', 'later').status, 0);
  let w = readQueue(f.queue, f.roots, { progressDir: f.dir });
  assert.deepEqual(w.needsYou, []); assert.equal(w.parked.find((x) => x.id === 'a').parkedReason, 'later');
  assert.equal(cli('unpark', 'a').status, 0);
  w = readQueue(f.queue, f.roots, { progressDir: f.dir });
  assert.deepEqual(w.needsYou.map((x) => x.id), ['a']);
  assert.equal(cli('unpark', 'b').status, 0);
  assert.deepEqual(readQueue(f.queue, f.roots, { progressDir: f.dir }).next.map((x) => x.id), ['b']);
  assert.notEqual(cli('park', 'a').status, 0);
  assert.throws(() => setParked(f.queue, 'zzz', 'r'), /No queue item/);
});

test('work item header: one status line; an unanswered message comes first, the job second, no bracket text, no doc-closed note', async (t) => {
  const f = fixture(t);
  writeFileSync(f.queue, JSON.stringify({ items: [{ id: 'app-two-explore-lofi-a', item: 'Explore lofi', state: 'pending', area: 'creation', plan: join(f.root, 'FLOWS.md'), waitsFor: 'person: walkthrough r5 composer (feedback via Discuss)' }] }));
  const server = createReviewServer({ roots: f.roots, dir: f.dir, queue: f.queue, home: f.home });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const get = async () => JSON.parse((await http(server, 'GET', '/api/threads/app-two-explore-lofi-a')).text);
  appendThread('app-two-explore-lofi-a', 'person', 'is this right?', f.dir);
  let th = await get();
  assert.equal(th.unanswered, true);
  assert.equal(th.chip, 'Your move: walkthrough r5 composer');
  assert.doesNotMatch(JSON.stringify(th), /feedback via Discuss|docClosed|linked doc/);
  const page = (await http(server, 'GET', '/t/app-two-explore-lofi-a')).text;
  assert.match(page, /Your message is waiting for the coordinator/);
  assert.match(page, /Job: /);
  assert.doesNotMatch(page, /linked doc was reviewed/); assert.doesNotMatch(page, /Waiting for reply/);
  appendThread('app-two-explore-lofi-a', 'coordinator', 'yes', f.dir);
  th = await get();
  assert.equal(th.unanswered, false); assert.equal(th.chip, 'Your move: walkthrough r5 composer');
});

test('store: a linked worktree keeps using the main checkout repo state until the store has state', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'jig-store-test-')); t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = join(tmp, 'home'); const repo = join(tmp, 'main'); const wt = join(tmp, 'wt');
  mkdirSync(join(repo, '.git', 'worktrees', 'wt'), { recursive: true }); mkdirSync(join(repo, '.jig'), { recursive: true }); mkdirSync(wt);
  registerProject('main', repo, { home });
  writeFileSync(join(repo, '.jig', 'queue.json'), '{}');
  writeFileSync(join(wt, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt').split(String.fromCharCode(92)).join('/')}\n`);
  assert.equal(stateDir(wt, { home }), join(repo, '.jig'));
  assert.equal(stateDir(repo, { home }), join(repo, '.jig'));
});

test('migration: printed removal commands pass the path as one quoted argument', () => {
  const [cmd] = removalCommands([{ missing: false, conflicts: [], copy: [{ rel: 'queue.json' }], refresh: [], same: [], oldDir: join(tmpdir(), 'a b', '.jig') }]);
  assert.match(cmd, /^node -e "require\('fs'\)\.rmSync\(process\.argv\[1\],\{recursive:true,force:true\}\)" ".+queue\.json"$/);
});

test('a review item whose linked work is running or waiting on others shows that, and returns to waiting for you', (t) => {
  const f = fixture(t); const it = f.add('FLOWS.md');
  const set = (extra) => writeFileSync(f.queue, JSON.stringify({ items: [{ id: 'spk', item: 'Spike: can it run?', thread: `item-${it.id}`, ...extra }] }));
  const row = () => enrichItems(f.roots, f.dir, f.ctx()).find((x) => x.id === it.id);
  set({ state: 'running' });
  assert.equal(row().statusLabel, 'spike running'); assert.equal(row().status, 'working');
  set({ state: 'pending', waitsFor: 'coordinator: spike result' });
  assert.match(row().statusLabel, /^spike waiting on /);
  set({ state: 'running', waitsFor: 'person: pick one' });
  assert.equal(row().statusLabel, 'waiting for you'); assert.equal(row().status, 'waiting-you');
  set({ state: 'done' });
  assert.equal(row().statusLabel, 'waiting for you');
  set({ state: 'running', item: 'Build thing' });
  assert.equal(row().statusLabel, 'work running');
  // an unrelated link does not change it; a person message awaiting the coordinator still wins
  assert.equal(statusOf('review', { done: false }, { linkedWork: null }).display.label, 'waiting for you');
  appendThread(`item-${it.id}`, "person", "hi", f.dir);
  assert.equal(row().statusLabel, 'waiting for coordinator');
});
