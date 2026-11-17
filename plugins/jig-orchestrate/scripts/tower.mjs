import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// jig control tower ("tower"): the same commands as review.mjs, plus
//   up [--port N]                       start the tower server if nothing answers on that port (detached, log in the store), else reuse it; prints the URL
//   resume [--stale-minutes N]          after a crash or restart: handoff note, interrupted running work, unanswered person messages, board summary
// Everything else (add, list, reply, watch, queue-set, park, undo, doctor ...) is passed to tower-commands.mjs unchanged.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectName, storeRoot, writeJson } from './jig-store.mjs';
import { defaultPort, listItems, loadConfig, projectRoot, readQueue, repoRoot, reviewDir, rootsFile } from './tower-core.mjs';
import { readDecisions } from './tower-decisions.mjs';
import { doctor } from './tower-work.mjs';
import { run as reviewRun } from './tower-commands.mjs';
import { defaultStaleMinutes, findInterrupted, handoffNote, resumeLines, unansweredMessages } from './tower-resume.mjs';
import { readFileSync } from 'node:fs';
import { towerConfigCommand } from './tower-config.mjs';
import { capabilityEnv, mintTowerCoordinator } from './capabilities.mjs';
import { pluginVersions, requireCompatiblePlugins } from './plugin-versions.mjs';

async function answers(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export async function up({ port, out = console.log, start = true } = {}) {
  const compatibility = pluginVersions();
  for (const note of compatibility.notes) out(`note: ${note}`);
  for (const issue of compatibility.issues) out(`warning: ${issue}`);
  const config = loadConfig();
  const p = Number(port ?? process.env.JIG_REVIEW_PORT ?? config.port ?? defaultPort);
  const url = `http://127.0.0.1:${p}/`;
  // Commands use this config too: keep their links on the confirmed server port.
  const rememberPort = () => {
    if (compatibility.issues.length) return;
    const path = rootsFile(), current = JSON.parse(readFileSync(path, 'utf8'));
    if (current.port !== p) writeJson(path, { ...current, port: p });
  };
  if (await answers(p)) { rememberPort(); out(`tower already running: ${url}`); return { url, started: false }; }
  if (!start) return { url, started: false };
  const root = storeRoot() ?? tmpdir();
  mkdirSync(root, { recursive: true });
  const log = openSync(join(root, 'tower.log'), 'a');
  const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'tower-server.mjs'), '--port', String(p)], { detached: true, stdio: ['ignore', log, log], cwd: projectRoot(), windowsHide: true });
  child.unref();
  for (let i = 0; i < 30; i++) { if (await answers(p)) { rememberPort(); out(`tower started: ${url} (log ${join(root, 'tower.log')})`); return { url, started: true }; } await new Promise((r) => setTimeout(r, 200)); }
  throw new Error(`tower did not answer on port ${p}; see ${join(root, 'tower.log')}`);
}

export function boardSummary(config, dir = reviewDir()) {
  const items = listItems(config.roots, dir, { queue: config.queue, openQuestions: config.openQuestions, decisions: readDecisions({}) }).filter((i) => i.status !== 'blocked');
  const work = config.queue ? readQueue(config.queue, config.roots, { progressDir: dir }) : null;
  const issues = config.queue ? doctor(config.queue, { dir }).length : 0;
  return `Board: for you ${items.length + (work?.needsYou.length ?? 0)} (${items.length} to read, ${work?.needsYou.length ?? 0} your move), running ${work?.running.length ?? 0}, board issues ${issues}`;
}

export function resume({ staleMinutes = defaultStaleMinutes, project = projectName(projectRoot()), out = console.log, dir = reviewDir(), config = loadConfig(), home } = {}) {
  let queueItems = [];
  try { queueItems = JSON.parse(readFileSync(config.queue, 'utf8')).items ?? []; } catch { /* no queue */ }
  const lines = resumeLines({ handoff: handoffNote(project, { home }), interrupted: findInterrupted(queueItems, { dir, staleMinutes }), unanswered: unansweredMessages(dir), summary: boardSummary(config, dir), staleMinutes });
  for (const l of lines) out(l);
  return lines;
}

async function dispatch(argv) {
  const command = argv[0];
  if (command === 'config') {
    if (argv[1] === 'set') requireCompatiblePlugins();
    return towerConfigCommand(argv.slice(1), { project: projectName(projectRoot()) });
  }
  const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  if (command === 'start') {
    requireCompatiblePlugins();
    // Credential-only supports an already managed server and deterministic tests.
    // Bind to the person-launched session's PID; nested processes are children.
    const file = mintTowerCoordinator({ holderPid: flag('holder-pid') ? Number(flag('holder-pid')) : process.ppid, replaceStale: argv.includes('--replace-stale') });
    console.log(`${capabilityEnv}=${file}`);
    if (!argv.includes('--credential-only')) return up({ port: flag('port') });
    return;
  }
  if (command === 'up') return up({ port: flag('port') });
  if (command === 'resume') return resume({ staleMinutes: flag('stale-minutes') ? Number(flag('stale-minutes')) : defaultStaleMinutes, project: flag('project') });
  if (command === 'summary') { console.log(boardSummary(loadConfig())); return; }
  return reviewRun(argv, { out: (l) => process.stdout.write(l + '\n') });
}

export async function main(argv) {
  try { await dispatch(argv); } catch (e) { console.error(String(e.message).replace(/\s+/g, ' ')); process.exit(e.exitCode ?? (argv[0] === 'watch' && argv.includes('--once') ? 2 : 1)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
