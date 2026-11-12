import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseGlossary, loadGlossaries, translateGoals, recordVerdict, failedTranslations, catalogueTemplates } from '../scripts/goal-translate.mjs';

const header = readFileSync(new URL('../docs/glossary.example.md', import.meta.url), 'utf8');
const measures = [{ metric: 'surface value range', tier: 1, source: 'selected reference' }];
const entry = ({ word = 'flat', status = 'confirmed', metrics = measures } = {}) => `| ${word} | deliberate depth | ${JSON.stringify(metrics)} | ${status} | ${status === 'confirmed' ? '2026-11-08' : '-'} | - | - |\n`;
const glossary = options => header + entry(options);
const row = (id = 'G1', word = 'flat', tier = 3) => `| ${id} | Make it ${word} | selected rubric | ${tier} | unknown | agreed reference | retro | verdict.md |`;
const plan = (rows = [row()]) => `## Success measures\n| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Missed problems\nUnknown.\n`;
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'jig-translation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const run = args => spawnSync(process.execPath, ['scripts/goal-translate.mjs', ...args], { encoding: 'utf8' });

test('[risk: confirmed words not linked] confirmed flat emits same-ID rows, cited date and final verdict line through the CLI', t => {
  const root = temp(t), vocabulary = join(root, 'words.md'), path = join(root, 'plan.md');
  writeFileSync(vocabulary, glossary()); writeFileSync(path, plan());
  const result = run(['--plan', path, '--glossary', vocabulary]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| G1 \| Make it flat \| surface value range \| 1 \|/);
  assert.match(result.stdout, /glossary:flat/);
  assert.match(result.stdout, /glossary 'flat', 2026-11-08/);
  assert.match(result.stdout, /Your verdict stays final\./);
  const repeated = translateGoals(plan([row(), ...translateGoals(plan(), parseGlossary(glossary())).rows]), parseGlossary(glossary()));
  assert.equal(repeated.rows.length, 0);
});

test('[risk: verbose or malformed glossary] one physical line and one to three sourced tier 1/2 measures per word', () => {
  assert.equal(parseGlossary(header).size, 0);
  assert.equal(parseGlossary(glossary({ metrics: Array(3).fill(measures[0]) })).get('flat').measures.length, 3);
  for (const text of [
    glossary({ metrics: [] }), glossary({ metrics: Array(4).fill(measures[0]) }),
    glossary({ metrics: [{ ...measures[0], tier: 3 }] }), glossary({ metrics: [{ metric: 'depth', tier: 2 }] }),
    glossary().replace('surface value range', 'surface\nvalue range'),
    glossary().replace('2026-11-08', '2026-02-30'), glossary().replace('confirmed |', 'assumed |'),
    glossary() + entry(), glossary().replace('| deliberate depth |', '| deliberate | depth |')
  ]) assert.throws(() => parseGlossary(text));
});

test('[risk: row cap broken] combined original and generated rows refuse at five; four succeeds', () => {
  const words = parseGlossary(glossary());
  assert.equal(translateGoals(plan([row(), row('G2', 'other', 1), row('G3', 'other', 1)]), words).rows.length, 1);
  assert.throws(() => translateGoals(plan([row(), row('G2', 'other', 1), row('G3', 'other', 1), row('G4', 'other', 1)]), words), /four rows; merge goals/);
  const double = parseGlossary(glossary() + entry({ word: 'other' }));
  assert.throws(() => translateGoals(plan([row(), row('G2', 'other'), row('G3', 'other')]), double), /four rows/);
});

test('[risk: failed translation invisible] passing measures with not-met verdict persists both results and appears at retro', t => {
  const root = temp(t), path = join(root, 'words.md');
  writeFileSync(path, glossary());
  let result = run(['verdict', '--glossary', path, '--word', 'flat', '--measures', 'met', '--verdict', 'not-met', '--date', '2026-11-08', '--evidence', 'trial.md']);
  assert.equal(result.status, 0, result.stderr);
  const entries = parseGlossary(readFileSync(path, 'utf8'));
  assert.equal(entries.get('flat').lastVerdict, 'not met on 2026-11-08; measures met');
  assert.equal(entries.get('flat').status, 'confirmed');
  assert.equal(failedTranslations(entries).length, 1);
  result = run(['retro', '--glossary', path]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /flat: not met.*measures met.*trial.md.*reconfirm/);
  const recovered = recordVerdict(readFileSync(path, 'utf8'), { word: 'flat', measures: 'met', verdict: 'met', on: '2026-11-09', evidence: 'retry.md' });
  assert.equal(failedTranslations(parseGlossary(recovered)).length, 0);
  for (const evidence of ['https://example.org/report', 'inline (result)']) assert.throws(() => recordVerdict(glossary(), { word: 'flat', measures: 'met', verdict: 'not met', on: '2026-11-08', evidence }));
});

test('[risk: drafting invents confirmation or ignores project override] templates stay draft, unknown words expose gaps and supplied paths fail clearly', t => {
  const root = temp(t), personal = join(root, 'personal.md'), project = join(root, 'project.md');
  writeFileSync(personal, glossary()); writeFileSync(project, glossary({ status: 'draft' }));
  const output = translateGoals(plan(), loadGlossaries([personal, project]));
  assert.match(output.rows[0], /draft:flat/);
  assert.equal(output.drafts[0].status, 'draft');
  const template = '| deliberate depth | T2 surface value range | research.md; limited proxy | proposed | not yet validated |';
  assert.match(translateGoals(plan([row('G1', 'deliberate depth')]), new Map(), template).rows[0], /draft:deliberate depth/);
  assert.equal(translateGoals(plan([row('G1', 'novel')]), new Map(), template).rows.length, 0);
  assert.match(translateGoals(plan([row('G1', 'novel')])).confirmations[0], /no fitting catalogue measure yet/);
  assert.equal(translateGoals(plan([row('G1', 'flatter')]), parseGlossary(glossary())).rows.length, 0);
  assert.throws(() => loadGlossaries([join(root, 'absent.md')]), /ENOENT/);
  assert.equal(run(['--glossary', personal, '--plan', join(root, 'missing.md')]).status, 1);
  assert.equal(run(['--plan', personal]).status, 1);
  assert.equal(run(['--glossary', personal, '--typo', project]).status, 1);
});

test('[risk: catalogue is present but not wired] shipped catalogue has five cells per row and usable proposed templates; retired rows never draft', () => {
  const catalogue = readFileSync(new URL('../docs/measures.md', import.meta.url), 'utf8');
  const rows = catalogue.split('\n').filter(line => line.startsWith('|'));
  assert(rows.length > 40);
  for (const line of rows) assert.equal(line.split('|').length, 7, line);
  assert(catalogueTemplates(catalogue).length > 40);
  const output = translateGoals(plan([row('G1', 'Legible contrast')]), new Map(), catalogue);
  assert.equal(output.rows.length, 1);
  assert.match(output.rows[0], /draft:legible contrast/);
  assert.match(output.confirmations[0], /draft/);
  assert.equal(catalogueTemplates(catalogue.replaceAll('| proposed |', '| retired |')).length, 0);
});
