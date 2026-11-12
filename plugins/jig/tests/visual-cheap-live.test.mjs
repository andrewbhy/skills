import assert from 'node:assert/strict';
import test from 'node:test';
import { freemem, tmpdir } from 'node:os';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkArguments, runCheck } from '../scripts/visual-check.mjs';
import { build } from './fixtures/visual/cheap/build.mjs';

test('[risk: browser layout disagrees with batched replay or font snapshots] [live:playwright-core@1.65.0] scoped clip, focus typography and font reflow fixture',{
  skip:process.env.JIG_NO_BROWSER==='1'?'Browser disabled':freemem()<4*2**30?'Less than 4 GB free memory':false,
},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'jig-cheap-live-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  cpSync(new URL('./fixtures/visual/cheap/',import.meta.url),dir,{recursive:true});
  const tableFile=join(dir,'data/states.json'),table=JSON.parse(readFileSync(tableFile));
  table.states.push({...table.states[0],name:'focus',state:'focused',scope:'#live-focus',static:false});writeFileSync(tableFile,JSON.stringify(table));
  const index=join(dir,'index.html');writeFileSync(index,readFileSync(index,'utf8')+`<button id="live-focus" data-component="row" data-state="focused">Focus me</button><aside id="outside">Unrelated clipped text</aside><script>
  window.jigStates.push({name:'focus',scope:'#live-focus',component:'row',setup:()=>document.querySelector('#live-focus').focus(),reset:()=>document.activeElement.blur()});
  document.querySelector('#live-focus').style.fontWeight='700';
  document.querySelector('#outside').style.cssText='width:2px;overflow:hidden;white-space:nowrap';
  </script>`);
  writeFileSync(join(dir,'tokens.css'),readFileSync(join(dir,'tokens.css'),'utf8')+'\n:root{--fixture-width:120px;--tracking-wide:2px;}');
  writeFileSync(join(dir,'sheet.css'),readFileSync(join(dir,'sheet.css'),'utf8')+'\n#row-default{width:var(--fixture-width);overflow:hidden;white-space:nowrap}[data-font=wide] [data-component=row]{letter-spacing:var(--tracking-wide)}');
  const options=checkArguments(['--url',pathToFileURL(index).href,'--gate','--fonts','all','--out',join(dir,'out'),'--inspectors','clip,alignment,crisp']);
  const report=await runCheck(options);
  assert.equal(report.coverage.completed,8,JSON.stringify(report.gaps));
  assert(report.findings.some(f=>f.kind==='state-typography'&&f.element==='#live-focus'));
  assert(report.findings.some(f=>f.kind==='text-clipped'&&f.element==='#row-default'&&f.contexts.some(c=>c.font==='wide')));
  assert(!report.findings.some(f=>f.element==='#outside'));
  assert(report.runs.some(r=>r.font==='wide'&&r.state==='focus'&&r.replayed));
});

test('[risk: fast timing skips states or loses a planted defect] [live:playwright-core@1.65.0] 100-state full gate asserts results under 20 seconds',{
  skip:process.env.JIG_NO_BROWSER==='1'?'Browser disabled':freemem()<4*2**30?'Less than 4 GB free memory':false,
},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'jig-checker3-live-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  cpSync(new URL('./fixtures/visual/cheap/',import.meta.url),dir,{recursive:true});
  const tableFile=join(dir,'data/states.json'),table=JSON.parse(readFileSync(tableFile));
  table.states=Array.from({length:100},(_,i)=>({...table.states[0],name:`row-${i}`,scope:`#row-${i}`,component:`row-${i}`,state:'default',borderToken:null}));
  writeFileSync(tableFile,JSON.stringify(table));build(dir);
  // Styling goes through the token file to keep this fixture's token lint clean.
  writeFileSync(join(dir,'tokens.css'),readFileSync(join(dir,'tokens.css'),'utf8')+'\n:root{--seed-ink:rgb(135,135,135)}');
  writeFileSync(join(dir,'sheet.css'),readFileSync(join(dir,'sheet.css'),'utf8')+'\n#row-42{color:var(--seed-ink)}');
  const options=checkArguments(['--url',pathToFileURL(join(dir,'index.html')).href,'--gate','--out',join(dir,'seed')]);
  const seed=await runCheck(options);
  assert.equal(seed.coverage.expected,100);assert.equal(seed.coverage.completed,100,JSON.stringify(seed.gaps));
  assert.equal(seed.coverage.complete,true);assert.equal(seed.overBudget,false);assert(seed.elapsedMs<20000);
  assert.equal(seed.status,'findings');assert(seed.findings.some(f=>f.kind==='text-contrast'&&f.element==='#row-42'));
  assert(seed.runs.filter(r=>r.state!=='row-42').every(r=>r.findingIds.length===0));
  writeFileSync(join(dir,'sheet.css'),readFileSync(join(dir,'sheet.css'),'utf8').replace('#row-42{color:var(--seed-ink)}',''));
  const clean=await runCheck({...options,out:join(dir,'clean')});
  assert.equal(clean.coverage.completed,100);assert.equal(clean.coverage.complete,true);assert.equal(clean.status,'passed',JSON.stringify(clean.findings));
  assert.equal(clean.overBudget,false);assert(clean.elapsedMs<20000);
  t.diagnostic(JSON.stringify({seedMs:seed.elapsedMs,cleanMs:clean.elapsedMs,states:100}));
});
