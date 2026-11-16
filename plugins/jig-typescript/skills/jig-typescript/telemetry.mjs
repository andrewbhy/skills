if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-typescript/telemetry.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Canonical source. sync-skills.mjs copies this beside each skill's VERSION.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsPath, statePath, appendLine, waitingRecords } from './jig-store.mjs';

function feedbackProblem(root) {
  let data;
  try { data = JSON.parse(readFileSync(docsPath(root, 'docs/design/feedback.json'), 'utf8')); } catch { return 'docs/design/feedback.json is missing or not valid JSON'; }
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return 'feedback.json has no items';
  let log = '';
  try { log = readFileSync(docsPath(root, 'docs/missed-problems.jsonl'), 'utf8'); } catch { /* checked per Fix below */ }
  for (const item of items) {
    if (!['Keep', 'Fix', 'Strong objection'].includes(item?.verdict)) return 'every item needs verdict Keep, Fix or Strong objection';
    if (item.verdict !== 'Keep') {
      if (!item.class || !item.caughtBy?.layer) return 'Fix item ' + item.id + ' needs class and caughtBy.layer';
      if (typeof item.filed !== 'string' || !log.includes('"id":"' + item.filed + '"')) return 'Fix item ' + item.id + ' is not filed in docs/missed-problems.jsonl';
    }
  }
  return '';
}

try {
  const [event, project, provider, run, outcome, ...extra] = process.argv.slice(2);
  if (!['start', 'end'].includes(event) || !project || !['codex', 'claude'].includes(provider)
      || extra.length || (event === 'start' && (run || outcome))
      || (event === 'end' && (!/^[0-9a-f-]{36}$/.test(run ?? '')
        && run !== 'off' || !['passed', 'failed', 'stopped', 'partly'].includes(outcome)))) {
    throw new Error('Usage: node <skill>/telemetry.mjs start <project> <codex|claude> OR end <project> <provider> <run-id> <passed|failed|stopped|partly>');
  }
  const root = resolve(project);
  if (event === 'start' && waitingRecords(root)) console.error(waitingRecords(root));
  let enabled = true;
  try {
    const config = JSON.parse(readFileSync(statePath(root, 'config.json'), 'utf8'));
    if (config.telemetry !== undefined && typeof config.telemetry !== 'boolean') throw new Error();
    enabled = config.telemetry !== false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read .jig/config.json; no marker written');
  }
  if (!enabled || run === 'off') {
    if (event === 'start') console.log('off');
  } else {
    const folder = dirname(fileURLToPath(import.meta.url));
    const skill = basename(folder);
    const version = readFileSync(join(folder, 'VERSION'), 'utf8').trim();
    if (!/^jig-[a-z0-9-]+$/.test(skill) || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('Run the generated helper inside a skill folder');
    }
    let outcomeToWrite = outcome;
    if (event === 'end' && outcome === 'passed' && skill === 'jig-interaction') {
      // A UI slice passes only after the person's Keep/Fix feedback exists and every Fix is filed.
      if (process.env.JIG_INTERACTION_GATE === 'off') {
        outcomeToWrite = 'partly';
        console.error('jig-interaction feedback gate is off; recorded partly, not passed');
      } else {
        const problem = feedbackProblem(root);
        if (problem) throw new Error('Refusing passed for jig-interaction: ' + problem + '. Record docs/design/feedback.json and run interaction-feedback.mjs file, or end partly for a spec-only run.');
      }
    }
    const runId = event === 'start' ? randomUUID() : run;
    const marker = { event, skill, version, runId, provider, time: new Date().toISOString() };
    if (event === 'end') marker.outcome = outcomeToWrite;
    const telemetry = statePath(root, 'telemetry.jsonl');
    appendLine(telemetry, JSON.stringify(marker));
    if (event === 'start') console.log(runId);
  }
} catch (error) {
  // Never echo filesystem errors (which can contain private paths) or input data.
  console.error(error.code ? 'Cannot write telemetry marker' : error.message);
  process.exitCode = 1;
}
