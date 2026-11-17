import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import test from 'node:test';

test('[risk: unattributed or unusable palette groups] standalone gallery contract', async () => {
  await import('./check-gallery.mjs');
});
