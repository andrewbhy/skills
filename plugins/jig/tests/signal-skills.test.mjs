import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { kinds, validateSignal } from '../scripts/signals.mjs';

test('[risk: kinds have two owners or none] ownership table is complete and pending owner text names every kind', () => {
  const doc = readFileSync('docs/signal-kinds.md', 'utf8');
  const rows = [...doc.matchAll(/^\| ([a-z-]+) \| ([a-z-]+) \|/gm)].filter(match => kinds.includes(match[1]));
  assert.deepEqual(rows.map(row => row[1]).sort(), [...kinds].sort());
  for (const [, kind, owner] of rows) {
    if (owner.startsWith('jig-')) {
      const section = readFileSync(`.agents/skills/${owner}/SKILL.md`, 'utf8');
      assert.ok(section, `${owner} skill text exists`);
      assert.match(section, new RegExp(`\\b${kind}\\b`));
    } else {
      assert.match(readFileSync(`scripts/${owner === 'brief-check' ? 'brief-check' : 'visual-check'}.mjs`, 'utf8'), new RegExp(kind));
    }
  }
});

test('[risk: backfill misses incidents or topics] private backfill (skip when absent) contains all five mp links and fifteen hand-kept topics', t => {
  const path = '.jig/backfill-2026-11-08.jsonl';
  if (!existsSync(path)) { t.skip('Private handoff backfill is available only in its originating worktree'); return; }
  const rows = readFileSync(path,'utf8').trim().split('\n').map(line=>validateSignal(JSON.parse(line)));
  assert.equal(new Set(rows.map(row=>row.id)).size, rows.length);
  for (const suffix of ['04','12','14','15','17']) assert.equal(rows.filter(row=>row.mpId===`mp-2026-11-08-${suffix}`).length,1);
  for (let i=1;i<=15;i++) assert.equal(rows.filter(row=>row.id===`backfill-topic-${String(i).padStart(2,'0')}`).length,1);
  assert.equal(rows.filter(row=>row.id==='backfill-topic-skill-misguided').length,1);
  assert.equal(rows.filter(row=>row.id==='backfill-topic-missed-check').length,1);
});
