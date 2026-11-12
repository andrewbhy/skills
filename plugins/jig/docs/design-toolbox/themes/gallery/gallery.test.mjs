import test from 'node:test';

test('[risk: unattributed or unusable palette groups] standalone gallery contract', async () => {
  await import('./check-gallery.mjs');
});
