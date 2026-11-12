import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectPlan, inspectFile } from '../scripts/brief-check.mjs';
import { parseGlossary, translateGoals } from '../scripts/goal-translate.mjs';

const complete = readFileSync(new URL('./fixtures/plans/complete.md', import.meta.url), 'utf8');
const empty = readFileSync(new URL('../docs/glossary.example.md', import.meta.url), 'utf8');
const vocabulary = (status = 'confirmed') => empty + `| flat | deliberate depth | [{"metric":"surface value range","tier":1,"source":"reference.md"}] | ${status} | ${status === 'confirmed' ? '2026-11-08' : '-'} | - | - |\n`;
const goal = (id = 'G1') => `| ${id} | Make it flat | reference rubric | 3 | unknown | agreed reference | retro | verdict.md |`;
const plan = rows => complete.replace('## Intent\n', '## Intent\nKind: module\n').replace('10 minutes', '45 minutes').replace('## Missed problems', `## Success measures\n| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Missed problems`);
const translated = (status = 'confirmed') => translateGoals(plan([goal()]), parseGlossary(vocabulary(status))).rows[0];

test('[risk: drafts lower ambiguity without the person] draft rows and unconfirmed markers never lower the score', () => {
  for (const [row, text] of [[translated('draft'), vocabulary('draft')], [translated(), vocabulary('draft')], [translated(), empty], [translated('draft'), vocabulary()]]) {
    const result = inspectPlan(plan([goal(), row]), {}, { glossary: parseGlossary(text) });
    assert.deepEqual(result.ambiguity, { unmeasured: 1, total: 1, share: 1 });
    assert.match(result.warnings.join('\n'), /unconfirmed or invalid glossary link/);
  }
  assert.deepEqual(inspectPlan(plan([goal(), translated()]), {}, { glossary: parseGlossary(vocabulary()) }).ambiguity, { unmeasured: 0, total: 1, share: 0 });
});

test('[risk: goal link crosses plans] glossary proxies only link to matching same-ID subjective goals in the current plan', () => {
  const glossary = parseGlossary(vocabulary());
  const external = inspectPlan(plan([goal('G2'), translated()]), {}, { glossary });
  assert.deepEqual(external.ambiguity, { unmeasured: 1, total: 1, share: 1 });
  assert.match(external.warnings.join('\n'), /invalid glossary link/);
  for (const proxy of [translated().replace('surface value range', 'made up metric'), translated().replace('| 1 |', '| 2 |'), translated().replace('reference.md', 'forged.md')]) {
    assert.equal(inspectPlan(plan([goal(), proxy]), {}, { glossary }).ambiguity.unmeasured, 1);
  }
  const other = plan([goal().replace('flat', 'unrelated'), translated()]);
  assert.equal(inspectPlan(other, {}, { glossary }).ambiguity.unmeasured, 1);
  assert.equal(inspectPlan(plan([translated()]), {}, { glossary }).ambiguity, null);
});

test('[risk: CLI or linked briefs bypass confirmation] explicit temporary glossary paths, overrides and block gate work through the public CLI', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-goal-score-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'plan.md'), words = join(root, 'words.md'), override = join(root, 'override.md'), brief = join(root, 'brief.md');
  writeFileSync(path, plan([goal(), translated()])); writeFileSync(words, vocabulary()); writeFileSync(override, vocabulary('draft'));
  writeFileSync(brief, '## Intent\nDo it\n## Acceptance\nChecks pass\n## Scope\nModule\n## Plan\n[Plan](plan.md)\n');
  const run = args => spawnSync(process.execPath, ['scripts/brief-check.mjs', ...args], { encoding: 'utf8' });
  let result = run(['--glossary', words, brief]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 of 1 goals unmeasured/);
  result = run(['--glossary', words, '--project-glossary', override, brief]);
  assert.match(result.stdout, /1 of 1 goals unmeasured/);
  const blocked = inspectFile(brief, undefined, { glossaryPaths: [words, override], config: { plan: { ambiguityGate: 'block' } } });
  assert(blocked.reasons.some(reason => reason.includes('unconfirmed')));
  assert.equal(run(['--glossary', join(root, 'absent.md'), brief]).status, 1);
  assert.equal(run(['--glossary']).status, 1);
});
