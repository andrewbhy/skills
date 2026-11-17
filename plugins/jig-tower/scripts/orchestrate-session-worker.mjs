import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { readFileSync } from 'node:fs';
import { readSession, sessionHook } from './orchestrate-sessions.mjs';
import { requireTower } from './layers.mjs';
import { projectRoot } from './tower-core.mjs';

try {
  requireTower(projectRoot());
  const [command, id] = process.argv.slice(2);
  if (command === 'hook') {
    const input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
    // Locks are deliberately short. A concurrent watch beat is retried; a
    // full child limit still refuses immediately with exit 2.
    for (let attempt = 0; ; attempt++) {
      try { sessionHook(id, input); break; }
      catch (error) {
        if (attempt >= 20 || !/locked/.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    if (input.hook_event_name === 'SessionStart') {
      const deadline = Date.now() + 12000;
      while (!['awaiting-monitor', 'ready'].includes(readSession(id).state)) {
        if (Date.now() >= deadline) throw new Error('Session launcher did not become ready; restart through review.mjs.');
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    // In-process Claude subagents share the provider PID. Mark their shell
    // descendants at the tool boundary, rather than mistaking PID equality for
    // topic authority. Only fixed syntax is prepended; tool input stays data.
    if (input.hook_event_name === 'PreToolUse' && input.agent_id && ['Bash', 'PowerShell'].includes(input.tool_name)) {
      if (typeof input.tool_input?.command !== 'string') throw new Error('Child shell tool needs command input.');
      const prefix = input.tool_name === 'Bash' ? 'export JIG_LOGICAL_CHILD=1; ' : "$env:JIG_LOGICAL_CHILD='1'; ";
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, command: prefix + input.tool_input.command } } }));
    }
  }
  else throw new Error('Use the session launcher to start its watch or hooks.');
} catch (error) { console.error(error.message); process.exitCode = 2; }
