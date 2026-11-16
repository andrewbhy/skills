if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/themes/gallery/gallery.test.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import test from 'node:test';

test('[risk: unattributed or unusable palette groups] standalone gallery contract', async () => {
  await import('./check-gallery.mjs');
});
