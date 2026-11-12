import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkTokens, analyseTokens, tokenRules, parseColor, resolveToken, validateStateTable } from '../scripts/ui-tokens-check.mjs';
import { configuration } from '../scripts/test-budget.mjs';
import { build } from './fixtures/visual/cheap/build.mjs';

const fixture=new URL('./fixtures/visual/cheap/',import.meta.url);
const table=()=>JSON.parse(readFileSync(new URL('data/states.json',fixture),'utf8'));
const css=()=>readFileSync(new URL('tokens.css',fixture),'utf8');
test('[risk: token semantics require a browser or miss accent presets] local files prove contrast and typography below two seconds',()=>{
  build(undefined,true);
  const report=checkTokens({url:new URL('index.html',fixture).href});
  assert.deepEqual(report.gaps,[]);assert.deepEqual(report.findings,[]);assert.equal(report.measurements.length,6);
  assert(report.elapsedMs<2000,`token layer ${report.elapsedMs} ms > 2000 ms`);
});
test('[risk: washed out ink and bold selections pass static checks] planted contrast, size, weight, fill and selection defects are caught',()=>{
  const t=table();t.states[2].weightToken='--bold';t.states[2].sizeToken='--small';t.states[2].fillToken='--hover';
  t.states.push({...t.states[2],name:'other-selected',scope:'#other',component:'other',radiusToken:'--pill'});
  const broken=css()+'\n:root{--bold:700;--small:12px;--pill:8px;--on-accent:#888888;}';
  const result=analyseTokens(t,tokenRules(broken));
  for(const kind of ['text-contrast','small-body-text','state-typography','state-fill','selection-style'])assert(result.findings.some(f=>f.kind===kind),kind);
  assert(result.findings.every(f=>f.layer==='tokens'));
  assert.deepEqual(analyseTokens(table(),tokenRules(css())).findings,[],'restored control');
});
test('[risk: unsupported colours or broken token references silently pass] aliases, cycles, malformed tables and conditional CSS remain evidence gaps',()=>{
  assert.deepEqual(parseColor('color-mix(in srgb, #000 50%, #fff)'),[127.5,127.5,127.5,1]);
  assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'),[10,20,30,.5]);
  assert.throws(()=>parseColor('oklch(50% .2 20)'),/Unsupported/);
  assert.equal(resolveToken('--a',{'--a':'var(--b)','--b':'14px'}),'14px');
  assert.throws(()=>resolveToken('--a',{'--a':'var(--a)'}),/Cyclic/);
  assert.throws(()=>validateStateTable({...table(),states:[{}]}),/Invalid/);
  assert.throws(()=>tokenRules('@media(x){:root{--ink:#000}}'),/Conditional/);
  const t=table();t.states[0].textToken='--missing';assert(analyseTokens(t,tokenRules(css())).gaps.some(g=>g.includes('Missing token')));
});
test('[risk: raw component CSS hides outside a browser scope] static lint includes linked imports, inline declarations and missing sheets',t=>{
  const dir=mkdtempSync(join(tmpdir(),'jig-token-fixture-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  cpSync(fixture,dir,{recursive:true});
  writeFileSync(join(dir,'sheet.css'),'@import "missing.css";[data-component=row]{color:#777;font-size:12px}');
  const r=checkTokens({url:pathToFileURL(join(dir,'index.html')).href});
  for(const kind of ['missing-stylesheet','raw-colour','raw-dimension'])assert(r.findings.some(f=>f.kind===kind),kind);
  assert(r.findings.every(f=>f.layer==='tokens'));
});
test('[risk: visual checks bypass or raise the fast suite budget] one configuration validates independent budgets',t=>{
  const dir=mkdtempSync(join(tmpdir(),'jig-budget-fixture-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'testing.json');writeFileSync(file,JSON.stringify({tokenBudgetMs:2000,gateBudgetMs:60000,fontPassBudgetMs:20000}));
  const c=configuration(dir,file);assert.equal(c.timeBudgetMs,10000);assert.equal(c.gateBudgetMs,60000);
  writeFileSync(file,JSON.stringify({tokenBudgetMs:0}));assert.throws(()=>configuration(dir,file),/tokenBudgetMs/);
});
