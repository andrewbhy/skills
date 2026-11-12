import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { syncSkills } from '../scripts/sync-skills.mjs';

test('[risk: adapted attribution ships broken skill links or silently drifts] generated contract rebases local references and guards licence text', t => {
  const root = mkdtempSync(join(tmpdir(), 'jig-impeccable-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  put('VERSION', read('VERSION'));
  put('.agents/skills/jig-mockup/SKILL.md', '---\nname: "jig-mockup"\ndescription: "Build interface mockups."\n---\n\nUse the toolbox.\n');
  for (const path of ['scripts/telemetry-marker.mjs', 'scripts/jig-store.mjs', 'scripts/mockup-check.mjs', 'docs/design-toolbox/README.md',
    'docs/design-toolbox/IMPECCABLE-LICENSE.txt', 'docs/design-toolbox/design-brief.md',
    'docs/design-toolbox/feedback-vocabulary.md', 'docs/design-toolbox/design-inspector.md']) put(path, read(path));
  syncSkills(root);
  const target = join(root, '.agents/skills/jig-mockup/toolbox.md');
  const contract = readFileSync(target, 'utf8');
  for (const file of ['design-brief.md', 'feedback-vocabulary.md', 'design-inspector.md']) {
    const link = '../../../docs/design-toolbox/' + file;
    assert(contract.includes('](' + link + ')'), file);
    assert.equal(readFileSync(resolve(dirname(target), link), 'utf8'), read('docs/design-toolbox/' + file));
  }
  assert(contract.includes('Copyright 2025 Paul Bakaus'));
  assert(contract.includes('924bbd194d02e5e15a227e75b5901fb0d7a4ecad'));
  assert(contract.includes('](IMPECCABLE-LICENSE.txt)'));
  const licence = join(dirname(target), 'IMPECCABLE-LICENSE.txt');
  assert.equal(readFileSync(licence, 'utf8'), read('docs/design-toolbox/IMPECCABLE-LICENSE.txt').replaceAll('\r\n', '\n'));
  writeFileSync(licence, 'removed licence');
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
  syncSkills(root);
  writeFileSync(target, contract.replace('Copyright 2025 Paul Bakaus', 'removed copyright'));
  assert.throws(() => syncSkills(root, true), /Supporting file drift/);
  syncSkills(root);
  assert.equal(syncSkills(root, true), 1);
});
