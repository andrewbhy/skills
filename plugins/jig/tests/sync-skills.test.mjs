import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { syncSkills } from '../scripts/sync-skills.mjs';

const skill = '---\nname: "jig-verify"\ndescription: "Verify observable changes."\n---\n\n# Verify\n\nTest public behaviour.\n\n## Provider notes\n\nCodex and Claude use available tools.\n\n## Later\n\nKeep it small.\n';
function fixture(t) {
  const root = mkdtempSync(join(fileURLToPath(new URL('../', import.meta.url)), '.jig-sync-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  for (const path of ['scripts/signals.mjs', 'docs/signal-kinds.md', 'scripts/missed-problems.mjs', 'scripts/mockup-present.mjs', 'docs/missed-problems.md', 'scripts/plan-seats.mjs', 'docs/plan-mode.md', 'docs/measures.md', 'scripts/goal-translate.mjs', 'docs/glossary.md', 'docs/glossary.example.md']) {
    put(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
  }
  put('VERSION', '0.1.0\n');
  put('scripts/telemetry-marker.mjs', readFileSync(new URL('../scripts/telemetry-marker.mjs', import.meta.url), 'utf8'));
  put('scripts/jig-store.mjs', readFileSync(new URL('../scripts/jig-store.mjs', import.meta.url), 'utf8'));
  put('.agents/skills/jig-verify/SKILL.md', skill);
  return { root, put, pointer: join(root, '.claude/skills/jig-verify/SKILL.md') };
}

test('generates a resolvable pointer, shares metadata, and is idempotent', (t) => {
  const { root, pointer } = fixture(t);
  assert.equal(syncSkills(root), 1);
  const first = readFileSync(pointer, 'utf8');
  const target = first.match(/\[the canonical skill\]\(([^)]+)\)/)[1];
  assert.equal(readFileSync(resolve(dirname(pointer), target), 'utf8'), skill);
  assert.ok(first.startsWith(skill.slice(0, skill.indexOf('\n\n'))));
  syncSkills(root);
  assert.equal(readFileSync(pointer, 'utf8'), first);
  assert.equal(syncSkills(root, true), 1);
});

test('detects missing, edited and stale-version pointers and regenerates them', (t) => {
  const { root, put, pointer } = fixture(t);
  assert.throws(() => syncSkills(root, true), /Pointer drift/);
  syncSkills(root);
  put('.claude/skills/jig-verify/SKILL.md', 'seeded defect');
  assert.throws(() => syncSkills(root, true), /Pointer drift/);
  assert.equal(readFileSync(pointer, 'utf8'), 'seeded defect'); // Check never repairs.
  syncSkills(root);
  put('VERSION', '0.2.0\n');
  assert.throws(() => syncSkills(root, true), /Pointer drift/);
  syncSkills(root);
  assert.equal(syncSkills(root, true), 1);
});

test('detects metadata drift and orphan pointers', (t) => {
  const { root, put } = fixture(t);
  syncSkills(root);
  put('.agents/skills/jig-verify/SKILL.md', skill.replace('Verify observable changes.', 'Verify another contract.'));
  assert.throws(() => syncSkills(root, true), /Pointer drift/);
  syncSkills(root);
  put('.claude/skills/jig-old/SKILL.md', 'old');
  assert.throws(() => syncSkills(root, true), /Orphan pointer/);
});

test('ships version and standalone helper and detects missing, edited and source drift', (t) => {
  const { root, put } = fixture(t);
  syncSkills(root);
  const version = '.agents/skills/jig-verify/VERSION';
  const helper = '.agents/skills/jig-verify/telemetry.mjs';
  assert.equal(readFileSync(join(root, version), 'utf8'), '0.1.0\n');
  assert.equal(readFileSync(join(root, helper), 'utf8'), readFileSync(join(root, 'scripts/telemetry-marker.mjs'), 'utf8'));
  for (const path of [version, helper]) {
    rmSync(join(root, path));
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    syncSkills(root);
    put(path, 'seeded drift');
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    assert.equal(readFileSync(join(root, path), 'utf8'), 'seeded drift');
    syncSkills(root);
  }
  put('scripts/telemetry-marker.mjs', '// changed canonical helper\n');
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
  syncSkills(root);
  assert.equal(readFileSync(join(root, helper), 'utf8'), '// changed canonical helper\n');
});

test('rejects invalid frontmatter, names, versions and escaped provider wording', (t) => {
  const { root, put } = fixture(t);
  for (const invalid of [
    skill.replace('description:', 'unknown:'),
    skill.replace('"jig-verify"', '"jig-other"'),
    skill.replace('"jig-verify"', '"verify"'),
    skill.replace('"Verify observable changes."', '""'),
    skill.replace('Test public behaviour.', 'Use Codex.'),
    skill.replace('Test public behaviour.', 'Run /review now.'),
    skill.replace('Test public behaviour.', 'Run /code-review now.'),
    skill.replace('Keep it small.', 'Use the Task tool.'),
  ]) {
    put('.agents/skills/jig-verify/SKILL.md', invalid);
    assert.throws(() => syncSkills(root));
  }
  put('.agents/skills/jig-verify/SKILL.md', skill);
  put('VERSION', 'tomorrow');
  assert.throws(() => syncSkills(root), /VERSION/);
});

test('[risk: research citations are rejected as provider commands] neutral source links pass the wording guard', t => {
  const { root, put }=fixture(t);
  put('.agents/skills/jig-verify/SKILL.md',skill.replace('Test public behaviour.',
    'Source: [review-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/SKILL.md).'));
  assert.equal(syncSkills(root),1);
  assert.equal(syncSkills(root,true),1);
});

test('CLI rejects unknown arguments with exit 1', () => {
  const result = spawnSync(process.execPath, ['scripts/sync-skills.mjs', '--unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test('[risk: planning helpers or schema drift after installation] new plan skill ships portable checks and fixed contract', t => {
  const { root, put } = fixture(t);
  put('.agents/skills/jig-plan/SKILL.md', '---\nname: "jig-plan"\ndescription: "Plan sizeable builds."\n---\n\n# Plan\n\nUse the fixed contract.\n');
  for (const path of ['scripts/brief-check.mjs', 'scripts/openspec-plan.mjs', 'docs/plan-format.md', 'docs/plan-sections.json', 'docs/measures.md', 'docs/licenses/OPENSPEC-MIT.txt']) put(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
  syncSkills(root);
  assert.equal(syncSkills(root, true), 2);
  for (const file of ['brief-check.mjs', 'goal-translate.mjs', 'glossary.md', 'glossary.example.md', 'openspec-plan.mjs', 'plan-seats.mjs', 'plan-mode.md', 'plan-format.md', 'plan-sections.json', 'measures.md', 'NOTICE']) {
    const path = `.agents/skills/jig-plan/${file}`;
    put(path, 'seeded drift');
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    syncSkills(root);
  }
  put('plan.md', readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url), 'utf8'));
  const run = spawnSync(process.execPath, [join(root, '.agents/skills/jig-plan/brief-check.mjs'), join(root, 'plan.md')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('[risk: skill helpers drift from their source] ships test-budget and diff-signals beside skills and detects drift', t => {
  const { root, put } = fixture(t);
  for (const name of ['jig-spike', 'jig-verify', 'jig-review']) {
    put(`.agents/skills/${name}/SKILL.md`, readFileSync(new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8'));
  }
  for (const script of ['test-budget', 'diff-signals']) {
    put(`scripts/${script}.mjs`, readFileSync(new URL(`../scripts/${script}.mjs`, import.meta.url), 'utf8'));
  }
  put('docs/test-budget.md', readFileSync(new URL('../docs/test-budget.md', import.meta.url), 'utf8'));
  for (const name of ['resource-guard', 'visual-clip', 'visual-reflow', 'visual-motion', 'visual-spacing', 'visual-components', 'visual-pixels', 'visual-visibility', 'visual-check', 'visual-alignment', 'visual-overlap', 'visual-crisp', 'style-lint', 'ui-tokens-check', 'visual-static', 'visual-ink', 'visual-layered', 'visual-changes', 'visual-state-snapshot', 'impeccable-inspector', 'design-inspector']) {
    put(`scripts/${name}.mjs`, readFileSync(new URL(`../scripts/${name}.mjs`, import.meta.url), 'utf8'));
  }
  put('scripts/impeccable-pin.json', readFileSync(new URL('../scripts/impeccable-pin.json', import.meta.url), 'utf8'));
  put('docs/design-toolbox/IMPECCABLE-LICENSE.txt', readFileSync(new URL('../docs/design-toolbox/IMPECCABLE-LICENSE.txt', import.meta.url), 'utf8'));
  put('docs/visual-checks.md', readFileSync(new URL('../docs/visual-checks.md', import.meta.url), 'utf8'));
  put('package.json', readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(syncSkills(root), 3);
  assert.equal(syncSkills(root, true), 3);
  for (const name of ['jig-verify', 'jig-review']) {
    assert.equal(readFileSync(join(root, `.agents/skills/${name}/testing.md`), 'utf8'), readFileSync(join(root, 'docs/test-budget.md'), 'utf8').replace(/\r\n/g, '\n'));
    const target = `.agents/skills/${name}/test-budget.mjs`;
    assert.equal(readFileSync(join(root, target), 'utf8'), readFileSync(join(root, 'scripts/test-budget.mjs'), 'utf8').replace(/\r\n/g, '\n'));
    rmSync(join(root, target));
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    syncSkills(root);
    put(target, '// planted drift\n');
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    syncSkills(root);
  }
  put('scripts/test-budget.mjs', '// changed source\n');
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
});

test('[risk: visual helpers ship without their peer, dependency pin or drift guard] installed jig-verify ships standalone support', t => {
  const { root, put } = fixture(t);
  put('.agents/skills/jig-verify/SKILL.md', readFileSync(new URL('../.agents/skills/jig-verify/SKILL.md', import.meta.url), 'utf8'));
  put('scripts/test-budget.mjs', readFileSync(new URL('../scripts/test-budget.mjs', import.meta.url), 'utf8'));
  put('docs/test-budget.md', readFileSync(new URL('../docs/test-budget.md', import.meta.url), 'utf8'));
  for (const name of ['resource-guard', 'visual-clip', 'visual-reflow', 'visual-motion', 'visual-spacing', 'visual-components', 'visual-pixels', 'visual-visibility', 'visual-check', 'visual-alignment', 'visual-overlap', 'visual-crisp', 'style-lint', 'ui-tokens-check', 'visual-static', 'visual-ink', 'visual-layered', 'visual-changes', 'visual-state-snapshot', 'impeccable-inspector', 'design-inspector']) {
    put(`scripts/${name}.mjs`, readFileSync(new URL(`../scripts/${name}.mjs`, import.meta.url), 'utf8'));
  }
  put('scripts/impeccable-pin.json', readFileSync(new URL('../scripts/impeccable-pin.json', import.meta.url), 'utf8'));
  put('docs/design-toolbox/IMPECCABLE-LICENSE.txt', readFileSync(new URL('../docs/design-toolbox/IMPECCABLE-LICENSE.txt', import.meta.url), 'utf8'));
  put('docs/visual-checks.md', readFileSync(new URL('../docs/visual-checks.md', import.meta.url), 'utf8'));
  put('package.json', readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  syncSkills(root);
  assert.equal(syncSkills(root, true), 1);
  const folder = '.agents/skills/jig-verify';
  assert.equal(JSON.parse(readFileSync(join(root, folder, 'package.json'))).dependencies['playwright-core'], '1.65.0');
  for (const name of ['resource-guard.mjs', 'visual-clip.mjs', 'visual-reflow.mjs', 'visual-motion.mjs', 'visual-spacing.mjs', 'visual-components.mjs', 'visual-pixels.mjs', 'visual-visibility.mjs', 'visual-check.mjs', 'visual-alignment.mjs', 'visual-overlap.mjs', 'visual-crisp.mjs', 'style-lint.mjs', 'ui-tokens-check.mjs', 'visual-static.mjs', 'visual-ink.mjs', 'visual-layered.mjs', 'visual-changes.mjs', 'visual-state-snapshot.mjs', 'impeccable-inspector.mjs', 'design-inspector.mjs', 'impeccable-pin.json', 'IMPECCABLE-LICENSE.txt', 'visual-checks.md', 'package.json']) {
    const target = `${folder}/${name}`;
    const original = readFileSync(join(root, target), 'utf8');
    put(target, 'planted drift');
    assert.throws(() => syncSkills(root, true), /Supporting file drift/);
    syncSkills(root);
    assert.equal(readFileSync(join(root, target), 'utf8'), original);
  }
  put('scripts/visual-motion.mjs', '// source changed\n');
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
  // Restore the source and exercise the installed import graph without Chrome.
  put('scripts/visual-motion.mjs',readFileSync(new URL('../scripts/visual-motion.mjs',import.meta.url),'utf8'));syncSkills(root);
  const result=spawnSync(process.execPath,[join(root,folder,'visual-check.mjs'),'--url',new URL('./fixtures/visual/cheap/index.html',import.meta.url).href,'--gate','--out',join(root,'evidence')],{encoding:'utf8',env:{...process.env,JIG_NO_BROWSER:'1'}});
  assert.equal(result.status,2,result.stderr);assert(JSON.parse(result.stdout).gaps.includes('Browser disabled: JIG_NO_BROWSER=1'),result.stdout);
});

test('[risk: branch skills ship stale cleanup logic] installs both drafts with shared worktree helpers and detects drift', t => {
  const { root, put } = fixture(t);
  for (const name of ['jig-worktree', 'jig-merge']) {
    const canonical = new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url);
    const draft = new URL(`../branch-draft/${name}/SKILL.md`, import.meta.url);
    assert.notEqual(existsSync(canonical), existsSync(draft), `${name} must have one source, draft or installed`);
    put(`.agents/skills/${name}/SKILL.md`, readFileSync(existsSync(canonical) ? canonical : draft, 'utf8'));
  }
  for (const path of ['scripts/worktree.mjs', 'docs/worktrees.md']) put(path, readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  assert.equal(syncSkills(root), 3);
  assert.equal(syncSkills(root, true), 3);
  for (const name of ['jig-worktree', 'jig-merge']) {
    for (const [file, source] of [['worktree.mjs', 'scripts/worktree.mjs'], ['worktrees.md', 'docs/worktrees.md']]) {
      const target = `.agents/skills/${name}/${file}`;
      assert.equal(readFileSync(join(root, target), 'utf8'), readFileSync(join(root, source), 'utf8').replace(/\r\n/g, '\n'));
      rmSync(join(root, target)); assert.throws(() => syncSkills(root, true), /Supporting file drift/); syncSkills(root);
      put(target, 'planted stale helper\n'); assert.throws(() => syncSkills(root, true), /Supporting file drift/); syncSkills(root);
    }
  }
  put('scripts/worktree.mjs', '// changed canonical source\n');
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
});
test('[risk: coordinator helper packaging drifts] installed queue and chore helper import their peers and detect changed support', t => {
  const { root, put } = fixture(t), canonical = '.agents/skills/jig-orchestrate/SKILL.md';
  let text;
  try { text = readFileSync(canonical, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const patch = readFileSync('docs/results/orchestrate-skills.patch', 'utf8');
    text = patch.split(`diff --git a/${canonical} b/${canonical}\n`)[1].split('\ndiff --git ')[0].split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
  }
  put(canonical, text);
  for (const name of ['queue','jobcheck','resource-guard']) put(`scripts/${name}.mjs`, readFileSync(`scripts/${name}.mjs`, 'utf8'));
  put('docs/queue.md', readFileSync('docs/queue.md', 'utf8')); put('docs/orchestrate-scenarios.md', readFileSync('docs/orchestrate-scenarios.md', 'utf8'));
  syncSkills(root); assert.equal(syncSkills(root, true), 2);
  const installed = join(root, '.agents/skills/jig-orchestrate');
  const result = spawnSync(process.execPath, [join(installed,'queue.mjs'),'--root',root,'status'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const chores = spawnSync(process.execPath, [join(installed,'jobcheck.mjs'),'--root',root], { encoding: 'utf8' });
  assert.equal(chores.status, 0, chores.stderr); assert.ok(chores.stdout.trim().split('\n').length <= 12);
  put('scripts/resource-guard.mjs', '// planted source drift\n'); assert.throws(() => syncSkills(root, true), /Supporting file drift/);
});
