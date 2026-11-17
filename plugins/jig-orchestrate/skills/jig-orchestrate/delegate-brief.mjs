import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { isAbsolute, win32 } from 'node:path';
// Canonical delegate brief template. Import and render; no model calls.
export function renderDelegateBrief({ goal, files, readOnly = true, browser = false, workspace, dataPath, plan, reservation, checks, writeLocations, serverOwnership,
  reportShape = 'conclusion under 100 words, evidence links, file:line findings, shortest decisive error line and gaps', wordCap = 300, reportFile }) {
  if (typeof browser !== 'boolean' || typeof readOnly !== 'boolean') throw new Error('browser and readOnly must be boolean');
  if (!Number.isInteger(wordCap) || wordCap < 1 || wordCap > 300) throw new Error('wordCap must be 1 to 300');
  const clean = value => {
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) throw new Error('Brief fields must be nonempty single lines');
    if (/browser|JIG_NO_BROWSER/i.test(value)) throw new Error('Use the browser flag for browser instructions');
    return value;
  };
  if (!Array.isArray(files) || !files.length) throw new Error('files must be a nonempty list');
  const absolute = value => { value = clean(value); if (!isAbsolute(value) && !win32.isAbsolute(value)) throw Error('Workspace, data, plan and report paths must be absolute'); return value; };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(reservation ?? '')) throw Error('A valid reservation is required');
  if (!Array.isArray(checks) || !checks.length) throw Error('checks must name each requirement and check');
  for (const row of checks) { clean(row.requirement); clean(row.check); if (/[|]/.test(row.requirement + row.check)) throw Error('Table fields cannot contain pipes'); }
  return [
    '# Delegated job', '## Intent', clean(goal),
    'jig-reservation: ' + reservation, 'Workspace path: ' + absolute(workspace), 'Data path: ' + absolute(dataPath), 'Report path: ' + absolute(reportFile),
    'Write locations: ' + (readOnly ? 'none (read-only)' : clean(writeLocations)), 'Server ownership: ' + clean(serverOwnership),
    '## Acceptance', checks.map(row => row.requirement).join('; '),
    '## Requirement-to-check', '| Requirement | Check |', '|---|---|', ...checks.map(row => '| ' + row.requirement + ' | ' + row.check + ' |'),
    '## Scope', files.map(clean).join(', '), '## Plan', '[Plan](' + absolute(plan) + ')', '## Delegation',
    `Goal: ${clean(goal)}`,
    `Files: ${files.map(clean).join(', ')}`,
    `Access: ${readOnly ? 'read-only' : 'edits allowed only in the listed files'}`,
    browser ? 'Check free memory first (stop under 4 GB); one browser at a time' : 'Do not launch a browser; run tests with JIG_NO_BROWSER=1',
    "Worker rule: do this brief's own work; start no assistant agents or provider sessions; keep reads small with scripts (jobcheck, targeted searches); report in the brief's shape; commit messages carry no AI attribution trailers",
    `Telemetry: required. Before work run the telemetry.mjs start command from the jig skill you follow (provider codex or claude) and keep the run ID; before reporting run its end command with passed, failed, stopped or partly; name any failure in the report`,
    `Report: ${clean(reportShape)}`,
    `Report file: write the full report to ${reportFile === undefined ? 'a file in the job scratch folder' : clean(reportFile)} and reply with only its path and one status line; any claim that drives a change, a fixed or inside verdict, or a revert quotes path:line with the exact text, or the measured numbers`,
    `Word cap: ${wordCap}`,
  ].join('\n') + '\n';
}
