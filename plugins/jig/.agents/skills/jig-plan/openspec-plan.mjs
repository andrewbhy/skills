import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sections } from './brief-check.mjs';

export function writeOpenSpecPlan(root, id, capability, plan) {
  for (const value of [id, capability]) if (typeof value !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) || value === 'archive') throw Error('Change and capability must be kebab-case names, not archive');
  const base = join(resolve(root), 'openspec');
  if (!existsSync(base)) throw Error('openspec/ must already exist; never run init');
  for (const path of [base, join(base, 'changes')]) {
    if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) throw Error('OpenSpec directories must be real directories');
  }
  const target = join(base, 'changes', id);
  if (existsSync(target)) throw Error('Change already exists; refusing overwrite');
  const parts = sections(plan.replaceAll('\r\n', '\n'));
  for (const name of ['intent', 'scope', 'out of scope', 'requirements', 'slices']) if (!parts.get(name)) throw Error(`Plan missing ${name}`);
  if (!/^### Requirement:/m.test(parts.get('requirements')) || !/^#### Scenario:/m.test(parts.get('requirements'))) throw Error('Requirements need named requirements and scenarios');
  // A draft is allowed: review happens after writing. No init or outside CLI runs.
  mkdirSync(join(target, 'specs', capability), { recursive: true });
  const files = {
    'proposal.md': `# ${id}\n\n## Why\n${parts.get('intent')}\n\n## What Changes\n${parts.get('scope')}\n\n## Capabilities\n\n### New Capabilities\n- ${capability}: ${parts.get('intent')}\n\n### Modified Capabilities\nNone.\n\n## Impact\nSee design.md for contracts, verification and exclusions.\n`,
    'design.md': plan.replaceAll('\r\n', '\n'),
    'tasks.md': `# Tasks\n\n${parts.get('slices').split('\n').filter(line => line.trim()).map(line => `- [ ] ${line.replace(/^\d+\.\s*/, '')}`).join('\n')}\n`,
    [join('specs', capability, 'spec.md')]: `## ADDED Requirements\n\n${parts.get('requirements')}\n`
  };
  for (const [path, contents] of Object.entries(files)) writeFileSync(join(target, path), contents.endsWith('\n') ? contents : contents + '\n', { flag: 'wx' });
  return target;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 6) throw Error('Usage: node openspec-plan.mjs <project-root> <change-id> <capability> <plan.md>');
    console.log(writeOpenSpecPlan(process.argv[2], process.argv[3], process.argv[4], readFileSync(process.argv[5], 'utf8')));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
