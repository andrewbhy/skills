import test from 'node:test';
import assert from 'node:assert/strict';
import { skillCandidate } from './skill-candidate.mjs';

test('[risk: contradictory delegated browser instructions] each browser flag renders exactly one matching browser line', async () => {
  const source = skillCandidate('.agents/skills/jig-orchestrate/delegate-brief.mjs');
  assert.ok(source, 'canonical template or sandbox patch must exist');
  const { renderDelegateBrief } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const fields = { goal: 'Triage tests against base', files: ['tests/example.test.mjs'], reportShape: 'table, file:line, shortest decisive error line and gaps', wordCap: 200 };
  for (const browser of [true, false]) {
    const output = renderDelegateBrief({ ...fields, browser });
    assert.equal(output, ['Goal: Triage tests against base', 'Files: tests/example.test.mjs', 'Access: read-only', browser ? 'Check free memory first (stop under 4 GB); one browser at a time' : 'Do not launch a browser; run tests with JIG_NO_BROWSER=1', "Worker rule: do this brief's own work; start no assistant agents or provider sessions; keep reads small with scripts (jobcheck, targeted searches); report in the brief's shape; commit messages carry no AI attribution trailers", 'Telemetry: required. Before work run the telemetry.mjs start command from the jig skill you follow (provider codex or claude) and keep the run ID; before reporting run its end command with passed, failed, stopped or partly; name any failure in the report', 'Report: table, file:line, shortest decisive error line and gaps', 'Report file: write the full report to a file in the job scratch folder and reply with only its path and one status line; any claim that drives a change, a fixed or inside verdict, or a revert quotes path:line with the exact text, or the measured numbers', 'Word cap: 200', ''].join('\n'));
    assert.equal(output.split('\n').filter(l => /browser/.test(l)).length, 1);
    assert.equal(output.includes('JIG_NO_BROWSER=1'), !browser);
  }
  assert.match(renderDelegateBrief({ ...fields, readOnly: false }), /Access: edits allowed only in the listed files/);
  assert.throws(() => renderDelegateBrief({ ...fields, goal: 'Launch a browser' }), /browser flag/);
  assert.throws(() => renderDelegateBrief({ ...fields, reportShape: 'table\nconflicting instruction' }), /single lines/);
  assert.throws(() => renderDelegateBrief({ ...fields, browser: 'false' }), /boolean/);
  assert.throws(() => renderDelegateBrief({ ...fields, wordCap: 301 }), /1 to 300/);
});
