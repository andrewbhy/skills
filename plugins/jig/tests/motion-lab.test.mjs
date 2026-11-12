import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const lab=fileURLToPath(new URL('../docs/design-toolbox/motion-lab/',import.meta.url));
const run=folder=>spawnSync(process.execPath,[join(folder,'check.cjs')],{encoding:'utf8'});

test('[risk: motion tokens drift from runtime or reduced motion keeps travel] scene replay uses CSS timing and easing',()=>{
  const result=run(lab);
  assert.equal(result.status,0,result.stdout+result.stderr);
});

test('[risk: a sluggish UI token silently passes replay] seeded duration and easing regressions are rejected',t=>{
  const scratch=mkdtempSync(fileURLToPath(new URL('../.jig-motion-',import.meta.url)));
  t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  cpSync(lab,scratch,{recursive:true});
  const target=join(scratch,'tokens.css'),original=readFileSync(target,'utf8');
  for(const [before,after,reason]of [
    ['--duration-popover: 160ms','--duration-popover: 500ms',/general UI budget/],
    ['--ease-out: cubic-bezier(0.23, 1, 0.32, 1)','--ease-out: ease-in',/enter\/exit curve/],
  ]) {
    assert.ok(original.includes(before));writeFileSync(target,original.replace(before,after));
    const broken=run(scratch);assert.notEqual(broken.status,0);assert.match(broken.stderr,reason);
  }
  writeFileSync(target,original);const restored=run(scratch);
  assert.equal(restored.status,0,restored.stdout+restored.stderr);
});
