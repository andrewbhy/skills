import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { inspectImpeccable, impeccablePin, selectDetectorFindings } from '../scripts/impeccable-inspector.mjs';
import { inspectGateDesign } from '../scripts/design-inspector.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'jig-detector-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const binary=join(dir,'detector'),html=join(dir,'index.html');writeFileSync(binary,'test detector');
  mkdirSync(join(dir,'css'));writeFileSync(join(dir,'css/main.css'),'@import "other.css";');writeFileSync(join(dir,'css/other.css'),'body{color:black}');
  writeFileSync(html,'<link rel="stylesheet" href="css/main.css"><link rel="stylesheet" href="https://example.invalid/remote.css"><p>Local</p>');
  const target=`${process.platform==='win32'?'windows':process.platform}-${process.arch}`;
  return {binary,url:pathToFileURL(html).href,pin:{...impeccablePin,checksums:{[target]:createHash('sha256').update('test detector').digest('hex')}}};
}
const finding=(antipattern='nested-cards')=>({antipattern,file:'index.html',line:1,snippet:'<div class="card">',description:'nested frame'});

test('[risk: detector phones home or invokes installation] gate uses isolated local inputs, pinned bytes and telemetry-off detect only',async t=>{
  const f=fixture(t);let executions=0,inputRoot;
  t.mock.method(globalThis,'fetch',()=>{assert.fail('outbound fetch');});
  const http=await import('node:http');t.mock.method(http.default,'request',()=>{assert.fail('outbound HTTP');});
  const result=await inspectImpeccable(f,{...f,execute:async(binary,args,options)=>{
    executions++;assert.equal(binary,f.binary);assert.deepEqual(args.slice(0,3),['detect','--no-config','--json']);
    assert.equal(options.shell,undefined);assert(options.timeout>0&&options.timeout<=5000);
    assert.equal(options.env.DO_NOT_TRACK,'1');assert.equal(options.env.IMPECCABLE_NO_TELEMETRY,'1');
    assert.equal(options.env.HOME,options.cwd);inputRoot=options.cwd;
    assert(existsSync(join(options.cwd,'input/css/other.css')));
    assert(readFileSync(args[3],'utf8').includes('example.invalid'));
    return {code:2,stdout:JSON.stringify([{...finding(),file:args[3]},finding('low-contrast')]),stderr:''};
  }});
  assert.equal(executions,1);assert.equal(result.executed,true);assert.deepEqual(result.gaps,[]);
  assert.equal(result.findings.length,1);assert.equal(result.findings[0].ruleId,'nested-cards');assert(result.findings[0].target.startsWith('index.html:'));
  assert.equal(result.ignored,1);assert.equal(result.coverageGaps.length,1);assert(!existsSync(inputRoot));
});

test('[risk: broken detector produces a clean gate] checksum, scan failure, timeout and malformed output leave explicit gaps',async t=>{
  const f=fixture(t);let called=false;
  const wrong=await inspectImpeccable(f,{...f,pin:impeccablePin,execute:()=>{called=true;}});
  assert(!called);assert.match(wrong.gaps.join(),/checksum/);assert(!wrong.executed);
  for(const execute of [async()=>({code:1,stdout:'[]',stderr:'partial scan'}),async()=>{throw new Error('ETIMEDOUT');},async()=>({code:0,stdout:'{}'})]){
    const r=await inspectImpeccable(f,{...f,execute});assert(!r.executed);assert(r.gaps.length);
  }
});

test('[risk: one waiver hides unrelated Impeccable findings] allowlist and exact rule/target waivers remain visible',()=>{
  const raw=[finding(),finding('dark-glow'),finding('ai-color-palette')];
  const target=selectDetectorFindings(raw).findings[0].target;
  const r=selectDetectorFindings(raw,{...impeccablePin,waivers:[{ruleId:'nested-cards',target,reason:'Intentional frame',evidence:'review.json'}]});
  assert.equal(r.waived.length,1);assert.equal(r.findings.length,1);assert.equal(r.findings[0].ruleId,'dark-glow');assert.equal(r.ignored,1);
  assert.throws(()=>selectDetectorFindings(raw,{...impeccablePin,waivers:[{ruleId:'nested-cards',target:'*',reason:'all',evidence:'x'}]}),/waiver/);
});

test('[risk: measured design inspector is advertised but never runs] adapter executes capture and keeps warnings advisory',async()=>{
  const snapshot=JSON.parse(readFileSync(new URL('./fixtures/design/containers-and-light.json',import.meta.url),'utf8'));
  const result=await inspectGateDesign({evaluate:async(fn,root)=>{assert.equal(fn.name,'designTargets');assert.equal(root,'#scope');return snapshot;}},{root:'#scope'});
  assert(result.warnings.some(f=>f.ruleId==='nested-cards'));assert.deepEqual(result.findings,[]);assert.deepEqual(result.gaps,[]);
});
