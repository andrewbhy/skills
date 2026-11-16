if (process.argv[2] === '--help') { console.log('Usage: node hooks-optional/launch-reservation.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Optional Claude Code PreToolUse hook. Build/test only; installation is explicit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { queuePath } from '../scripts/queue.mjs';
import { layers } from '../scripts/layers.mjs';

export function needsReservation(input) {
  if (input.tool_name === 'Agent') return !['Explore', 'Plan'].includes(input.tool_input?.subagent_type);
  if (!['Bash', 'PowerShell'].includes(input.tool_name)) return false;
  const raw = input.tool_input?.command;
  const command = typeof raw === 'string' ? raw.replace(/(?:\\|`)\r?\n/g, ' ') : raw;
  if (typeof command !== 'string') throw Error('Malformed shell tool input');
  // Match quoted executables, full paths, multiline commands and =true forms too.
  return /\bcodex-companion(?:\.[^\s"'\\/]+)?["']?\s+["']?task\b/i.test(command) && /(?:^|[\s"'])--write(?:\b|=)/i.test(command);
}

export function loadReservations(root, read = path => readFileSync(path, 'utf8')) {
  // Board and legacy job queues share only item IDs and states. Never validate
  // unrelated fields or acquire a writer's lock for this read-only gate.
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = JSON.parse(read(queuePath(root)).replace(/^\uFEFF/, ''));
      return { items: Array.isArray(parsed?.items) ? parsed.items.filter(item => item && typeof item.id === 'string' && typeof item.state === 'string') : [] };
    } catch (error) { last = error; }
  }
  throw Error(`Reservation queue unreadable: ${last.message}`);
}

export function checkLaunch(input, load = loadReservations, resolveLayers = layers) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.tool_name !== 'string' || !input.tool_input || typeof input.tool_input !== 'object' || Array.isArray(input.tool_input)) throw Error('Malformed PreToolUse input');
  if (!resolveLayers(resolve(input.cwd ?? process.cwd())).orchestration) return;
  if (!needsReservation(input)) return;
  const text = input.tool_name === 'Agent' ? input.tool_input.prompt : input.tool_input.command;
  if (typeof text !== 'string') throw Error('Malformed launch text');
  const ids = [...text.matchAll(/^[ \t]*(?:#[ \t]*)?jig-reservation:[ \t]*(\S+)[ \t]*\r?$/gm)].map(match => match[1]);
  if (ids.length !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(ids[0])) throw Error('Write launch needs one valid jig-reservation: <id> line');
  const queue = load(resolve(input.cwd ?? process.cwd()));
  const item = queue.items.find(item => item.id === ids[0]);
  if (!item) throw Error(`Unknown jig-reservation: ${ids[0]}`);
  if (!['new', 'pending', 'starting', 'running'].includes(item.state)) throw Error(`Inactive jig-reservation: ${ids[0]} (state ${item.state})`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { checkLaunch(JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))); }
  catch (error) { console.error(`Launch blocked: ${error.message}`); process.exitCode = 2; }
}
