import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// jig's entry to the shared GPU module. The logic and its written contract live in gpu-share/gpu-share.mjs
// (standalone, no jig imports, also vendored by other projects). CLI unchanged:
// node scripts/gpu-status.mjs [--json] | lease <who> <task> <minutes> [--private] | release <who> | wait [--max-minutes N]
import { pathToFileURL } from 'node:url';
import { runCli } from './gpu-share/gpu-share.mjs';

export * from './gpu-share/gpu-share.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
