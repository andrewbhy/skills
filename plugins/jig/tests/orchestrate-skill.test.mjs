import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { skillCandidate } from './skill-candidate.mjs';
function draftSource() {
  const path = '.agents/skills/jig-orchestrate/SKILL.md';
  if (existsSync(path)) return skillCandidate(path);
  // The sandbox deliverable is a new-file patch; inspect that artifact until
  // the coordinator applies it. Installed-candidate tests use the source above.
  const patch = readFileSync('docs/results/orchestrate-skills.patch', 'utf8');
  const section = patch.split(`diff --git a/${path} b/${path}\n`)[1]?.split('\ndiff --git ')[0];
  assert.ok(section, 'new canonical skill must be present in the HEAD patch');
  return section.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
}
test('[risk: coordinator duties or feedback routes missing] every inventory duty has an owner or explicit gap; feedback and cleanup stay durable', () => {
  const text = draftSource(), table = text.split('## Duties index')[1].split('## Retro signals')[0];
  const rows = table.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Duty'));
  assert.equal(rows.length, 14); assert.equal(rows.filter(l => l.includes('GAP:')).length, 1);
  assert.ok(rows.every(l => l.match(/jig-|GAP:/))); assert.match(text, /reportDuty.*duty, skill and proposedFix/s);
  assert.match(text, /feedback to the file ledger or harness skills\/suite docs/);
  assert.match(text, /jig-worktree close/); assert.match(text, /cleanup calls.*jig-worktree close/);
  assert.doesNotMatch(text, /git (?:worktree remove|branch -[dD])/);
  for (const owner of ['jig-plan','jig-verify','jig-review','jig-correct','jig-worktree','jig-merge']) assert.ok(text.includes(`../${owner}/SKILL.md`));
});
test('[risk: assistant replaces exact judgement] bounded brief excludes personal artifacts and commit diffs; deterministic chore reader comes first', () => {
  const text = draftSource(), section = text.split('## Reads and assistant seat')[1].split('## Duties index')[0];
  assert.match(section, /first use[\s\S]*jobcheck.mjs/); assert.match(section, /conclusion under 100 words/); assert.match(section, /judging diffs before commit/); assert.match(section, /scripted\|delegated\|manual/);
  assert.doesNotMatch(text, /Do not start another session just to reduce cost/);
  for (const kind of ['Test runs and triage against base', 'Log and output reads', 'Browser passes and screenshots', 'Check scripts', 'First-draft briefs', 'Plan checks of structure']) {
    assert.ok(section.split('\n').some(line => line.startsWith(`| ${kind} | background cheap assistant agent |`)), kind);
  }
  for (const duty of ['plans', 'acceptance decisions', 'anything the person will see', 'merges', 'cleanup', 'destructive operations', 'judging diffs before commit']) assert.ok(section.includes(duty));
  assert.match(section, /at or below 30% left/); assert.match(section, /one implementation job at a time/);
  assert.match(section, /before each implementation job/);
  assert.match(text, /assistant seat as doer; jig-verify as rules owner/);
  assert.match(section, /person authorizes these assistant agents by installing this skill/);
  assert.match(section, /orchestrate\.assistantAgents: false/);
  assert.match(section, /orchestrate\.weeklyLeftThreshold/);
  assert.match(text.split('## Provider notes')[1], /Haiku or Sonnet/);
  assert.match(text, /apply to the coordinator seat only/);
  assert.match(text, /### Worker rule[\s\S]*start no assistant agents or provider sessions/);
  assert.match(text.split('## Provider notes')[1], /As a worker, follow the worker\s+rule/);
  const neutral = text.split('## Provider notes')[0];
  assert.doesNotMatch(neutral, /\b(?:codex|claude|mcp|subagents?|spawn_agent)\b/i);
});
test('[risk: false parity or omitted stop rule] skill states scenario status with pending provider evidence and persistent escalation decisions', () => {
  const text = draftSource(); assert.match(text, /Scenario status: fresh two-provider runs are pending/);
  assert.match(text, /Two gate or fresh-review failures/); assert.match(text, /signals.mjs set <id> decision/); assert.match(text, /Own escalation, skill-gap and skill-misguided/);
  assert.match(text, /coordinator never accepts/); assert.match(text, /No skill sync while\n   jobs run/);
});

test('merge execution is delegated while authority, final evidence and resource deletion stay with coordinator', () => {
  const skill = draftSource();
  assert.match(skill, /\| Merge authority and final diff\/evidence check \| coordinator \|/);
  assert.match(skill, /\| Merge execution \| worker running jig-merge \| suites on branch and base, review triage, merge, suite on merged result and doctor; stop before deleting and report the exact close command \|/);
  assert.match(skill, /\| Deletion of resources \(worktree close, branch delete, folders, data\) \| coordinator \|/);
  const merge = skillCandidate('.agents/skills/jig-merge/SKILL.md');
  assert.match(merge, /coordinator retains merge authority and the final diff\/evidence/);
  assert.match(merge, /Stop before deleting any\nresource/);
  assert.match(merge, /exact worktree close\ncommand/);
});
