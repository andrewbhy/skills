import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureStatic, freezeScopeAnimations } from '../scripts/visual-static.mjs';
import { runLayeredCheck, planStates, contractExpression } from '../scripts/visual-layered.mjs';
import { checkArguments, declaredFonts, invokeFont, declaredStates } from '../scripts/visual-check.mjs';
import { inspectCandidateInk, inkCandidates } from '../scripts/visual-ink.mjs';
import { selectChanged } from '../scripts/visual-changes.mjs';
import { encodePNG } from '../scripts/visual-pixels.mjs';
import { measureInk } from '../scripts/visual-visibility.mjs';
import { analyseMotion } from '../scripts/visual-motion.mjs';
import { visualDOM } from './helpers/visual-dom.mjs';
import { runInThisContext } from 'node:vm';

const budgets={tokenBudgetMs:2000,gateBudgetMs:60000,fontPassBudgetMs:20000};
function workspace(t){const dir=mkdtempSync(join(tmpdir(),'jig-cheap-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('[risk: static specimens repeat setup and whole-page walks] 100 states in one browser turn under a 500 ms replay budget',async t=>{
  const {node,mount}=visualDOM(t);
  const states=Array.from({length:100},(_,i)=>({name:`row-${i}`,scope:`#row-${i}`,component:'row',static:true}));
  const children=states.map((s,i)=>node('div',{id:s.name,'data-component':'row'},{},'',[],{x:0,y:i*24}));
  mount(node('main',{id:'sheet'},{},'',[...children,node('div',{id:'unrelated'},{},'',[],{x:9999})]));
  const original=document.querySelectorAll;let outsideWalks=0;
  document.querySelectorAll=s=>{if(s==='body'||s==='*')outsideWalks++;return original(s);};
  let calls=0;const page={evaluate:async expression=>{calls++;return runInThisContext(expression);}};
  children[42].getBoundingClientRect=()=>({x:.5,y:1008,width:100,height:24,left:.5,right:100.5,top:1008,bottom:1032});
  children[42].css.borderLeftWidth='1px';children[42].css.borderLeftStyle='solid';children[42].css.borderLeftColor='rgb(0, 0, 0)';
  const start=performance.now(),groups=await measureStatic(page,states,{inspectors:['alignment'],crispThresholds:{}},{scale:1});
  const elapsed=performance.now()-start;
  assert.equal(calls,1);assert.equal(groups.flatMap(g=>g.runs).length,100);assert.equal(outsideWalks,0);
  assert(groups.flatMap(g=>g.runs).every(r=>r.layout.every(m=>m.element!== '#unrelated')));
  assert(groups.flatMap(g=>g.runs).find(r=>r.name==='row-42').inspectors.alignment.findings.some(f=>f.kind==='fractional-position'));
  assert(groups.flatMap(g=>g.runs).filter(r=>r.name!=='row-42').every(r=>r.inspectors.alignment.findings.length===0));
  assert(elapsed<500,`100-state replay ${elapsed.toFixed(1)} ms > 500 ms`);
});

test('[risk: geometry freezing hides a moving overlap] motion frames keep overlap detection with a clean control',()=>{
  const frames=Array.from({length:4},(_,i)=>({time:i*16,boxes:[],overlaps:i===1?[
    {element:'#moving',parent:'#scope',rect:{x:0,y:0,width:20,height:20}},
    {element:'#peer',parent:'#scope',rect:{x:10,y:0,width:20,height:20}}
  ]:[]}));
  assert(analyseMotion(frames,{duration:48}).findings.some(f=>f.kind==='overlap'&&f.frame===1));
  assert.deepEqual(analyseMotion(frames.map(f=>({...f,overlaps:[]})),{duration:48}).findings,[]);
});
test('[risk: nested static scopes duplicate all measurements or spill into siblings] maximal scope is collected once and attributed by containment',async t=>{
  const {node,mount}=visualDOM(t);mount(node('main',{id:'sheet','data-component':'sheet'},{},'',[node('div',{id:'row','data-component':'row'})]));
  const states=[{name:'sheet',scope:'#sheet',component:'sheet'},{name:'alias',scope:'#sheet',component:'sheet'},{name:'row',scope:'#row',component:'row'}];
  const groups=await measureStatic({evaluate:async source=>runInThisContext(source)},states,{inspectors:[]});
  assert.equal(groups.length,1);assert.equal(groups[0].runs.length,3);assert.deepEqual(groups[0].runs[2].layout.map(m=>m.element),['#row']);
});
test('[risk: array font discovery succeeds but switching throws] both font contracts switch and invalid static state hooks are rejected',async t=>{
  visualDOM(t);let chosen;window.jigFonts=['A','B'];window.jigFonts.set=async id=>{chosen=id;};
  assert.deepEqual(declaredFonts(),['A','B']);await invokeFont({id:'B'});assert.equal(chosen,'B');
  window.jigFonts={ids:['A','B'],set:async id=>{chosen=id;}};await invokeFont({id:'A'});assert.equal(chosen,'A');
  window.jigStates=[{name:'static',scope:'#sheet'}];assert.deepEqual(declaredStates(),['static']);
  window.jigStates=[{name:'broken',setup(){}}];assert.throws(declaredStates,/Invalid/);
});
test('[risk: change filtering loses shared or unmapped changes] component mapping retains unknown dependencies and full acceptance denominator',()=>{
  const rows=[{name:'a',files:['a.css']},{name:'b',files:['b.css']}],directory=process.cwd();
  assert.deepEqual(selectChanged(rows,['a.css'],directory).states.map(s=>s.name),['a']);
  assert.equal(selectChanged(rows,['tokens.css'],directory,['tokens.css']).states.length,2);
  assert.equal(selectChanged(rows,['unknown.js'],directory).states.length,2);assert(selectChanged(rows,['unknown.js'],directory).gaps.length);
  assert.equal(selectChanged(rows,[],directory).states.length,0);
  const table={states:rows.map(s=>({...s,scope:`#${s.name}`,component:s.name,static:true}))};
  const plan=planStates(['a','b'],[],table,{root:'body'},['a.css'],directory,['Demo']);
  assert.equal(plan.states.length,1);assert.equal(plan.all.length,2);
});
test('[risk: visibility decodes broad screenshots or repeats ink work] one cropped capture per candidate region and content hash cache',async()=>{
  const target={element:'#label',threshold:4.5,ground:[255,255,255],rect:{x:10,y:20,width:2,height:2}},clips=[];
  const image={width:2,height:2,pixels:Buffer.alloc(16,255)};image.pixels.fill(0,0,3);
  const page={evaluate:async()=>({targets:[target],gaps:[]}),screenshot:async options=>{assert.equal(options.fullPage,true);assert.equal(options.caret,'initial');assert.equal(options.animations,'allow');assert.equal(options.path,undefined);clips.push(options.clip);return encodePNG(image);}};
  const cache=new Map(),first=await inspectCandidateInk(page,'#scope',{cache}),second=await inspectCandidateInk(page,'#scope',{cache});
  assert.equal(first.captures,1);assert.deepEqual(first.findings,[]);assert.equal(second.cacheHit,true);assert.equal(cache.size,1);
  assert.deepEqual(clips,[{x:10,y:20,width:2,height:2},{x:10,y:20,width:2,height:2}]);
  page.evaluate=async()=>({targets:[],gaps:[]});assert.equal((await inspectCandidateInk(page,'#scope')).captures,0);assert.equal(clips.length,2);
  page.evaluate=async()=>({targets:[target],gaps:[]});image.pixels.fill(255);assert.equal((await inspectCandidateInk(page,'#scope',{cache})).findings[0].kind,'empty-content');
});
test('[risk: candidate nomination and animation freezing walk unrelated content] geometry nomination and motion preparation stay inside scopes',t=>{
  const {node,mount}=visualDOM(t),candidate=node('span',{id:'candidate'},{opacity:'0'},'Hidden ink'),scope=node('section',{id:'scope'},{backgroundColor:'rgb(255, 255, 255)'},'',[candidate]);
  const outside=node('span',{id:'outside'},{opacity:'0'},'Unrelated');mount(node('body',{}, {},'',[scope,outside]));
  const saved=Object.fromEntries(['innerWidth','innerHeight','scrollX','scrollY'].map(k=>[k,globalThis[k]]));t.after(()=>{for(const [k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  globalThis.innerWidth=1280;globalThis.innerHeight=800;globalThis.scrollX=0;globalThis.scrollY=0;
  candidate.childNodes[0].parentElement=candidate;
  document.elementFromPoint=()=>candidate;
  document.createRange=()=>({setStartBefore(){},setEndAfter(){},getBoundingClientRect:()=>candidate.getBoundingClientRect()});
  assert.deepEqual(inkCandidates({selector:'#scope'}).targets.map(t=>t.element),['#candidate']);
  let finished=0,paused=0;
  const finite={effect:{getComputedTiming:()=>({endTime:100})},finish(){finished++;}},infinite={effect:{getComputedTiming:()=>({endTime:Infinity})},pause(){paused++;}};
  scope.getAnimations=()=>[finite,infinite];candidate.getAnimations=()=>[finite];outside.getAnimations=()=>{throw new Error('outside animation walked');};
  freezeScopeAnimations(['#scope','#candidate']);assert.equal(finished,1);assert.equal(paused,1);
});

function boundary(out,{hang=false,delay=0}={}){
  const calls={launches:0,closes:0,navigations:0,active:0,maxActive:0,measure:0,inspect:[],setups:[],resets:[],fonts:[],progress:[]};
  const states=[{name:'static',scope:'#static',component:'row',state:'default',static:true},{name:'focus',scope:'#focus',component:'row',state:'focus',static:false}];
  const launch=async()=>{calls.launches++;return {version:()=> 'fake',close:async()=>{calls.closes++;},newContext:async()=>{
    let font,closed=false,rejectPending;
    const page={mouse:{move:async()=>{}},close:async()=>{},setDefaultTimeout(){},on(){},goto:async()=>{},addStyleTag:async()=>({evaluate:async()=>{}}),waitForTimeout:async()=>{},locator:()=>({count:async()=>1,screenshot:async()=>encodePNG({width:1,height:1,pixels:Buffer.from([0,0,0,255])})}),evaluate:async(fn,arg)=>{
      if(typeof fn==='string')return {names:states.map(s=>s.name),modes:['Demo'],available:['default','wide','narrow'],metadata:states};
      if(fn.name==='declaredStates')return states.map(s=>s.name);if(fn.name==='declaredDataModes')return ['Demo'];if(fn.name==='declaredFonts')return ['default','wide','narrow'];if(fn.name==='pageStateMetadata')return states;
      if(fn.name==='invokeFont'){font=arg.id;calls.fonts.push(font);return;}
      if(fn.name==='invokeState'){calls[arg.action==='setup'?'setups':'resets'].push(`${font}:${arg.name}`);return;}
      if(fn.name==='motionDeclarations')return {findings:[],gaps:[]};
      if(fn.name==='invokeDataMode'||fn.name==='stateScope')return;
      return {ready:true,signature:'steady'};
    }};
    const newPage=async()=>{let dirty=false;return {...page,goto:async()=>{dirty=false;calls.navigations++;},evaluate:async(fn,arg)=>{
      if(fn.name==='invokeState'&&arg.action==='setup'){assert.equal(dirty,false,'state leaked from an earlier setup');dirty=true;}
      // Deliberately leaky fake reset: navigation, rather than a cooperative
      // reset mock, must restore the next state's baseline.
      return page.evaluate(fn,arg);
    }};};
    return {newPage,close:async()=>{if(closed)return;closed=true;rejectPending?.(new Error('page closed'));},page,
      setReject:fn=>{rejectPending=fn;}};
  }};};
  const measure=async(_page,rows,options,run)=>{
    calls.measure++;calls.active++;calls.maxActive=Math.max(calls.maxActive,calls.active);
    if(delay)await new Promise(r=>setTimeout(r,delay));calls.active--;
    assert(!run.fontChecksOnly||options.inspectors.join(',')==='clip,alignment,crisp');
    return rows.map(row=>({scope:row.scope,elapsedMs:1,runs:[{name:row.name,scope:row.scope,layout:[],inspectors:{clip:{findings:[],gaps:[]},crisp:{findings:[],gaps:[],measurements:[]}}}]}));
  };
  const inspect=async(_page,options,run)=>{calls.inspect.push(run.font);if(hang)return new Promise(()=>{});return {clip:{findings:[],gaps:[]}};};
  return {calls,states,launch,measure,inspect,ink:async()=>({findings:[],gaps:[],measurements:[],captures:0}),progress:s=>calls.progress.push(s)};
}
const options=(out,extra=[])=>checkArguments(['--url','file:///fixture.html','--out',out,'--settle-ms','1','--gate','--fonts','all',...extra]);

function inkViewport(t){
  const keys=['innerWidth','innerHeight','scrollX','scrollY'],previous=keys.map(k=>globalThis[k]);
  [1280,800,0,0].forEach((v,i)=>globalThis[keys[i]]=v);
  t.after(()=>keys.forEach((k,i)=>previous[i]===undefined?delete globalThis[k]:globalThis[k]=previous[i]));
}
test('[risk: filled-control icons use the page as ground] actual ancestor fill is retained and invisible icon seed still fails',t=>{
  const {node,mount}=visualDOM(t);inkViewport(t);
  const icon=node('svg',{id:'icon','data-ink-check':''},{fill:'none',stroke:'rgb(255, 255, 255)'});
  mount(node('body',{}, {backgroundColor:'rgb(255, 255, 255)'},'',[
    node('button',{id:'button'},{backgroundColor:'rgb(0, 60, 140)'},'',[node('span',{}, {},'',[icon])])
  ]));
  document.elementFromPoint=()=>icon;
  const result=inkCandidates({selector:'#button'});assert.deepEqual(result.gaps,[]);assert.equal(result.targets.length,1);
  assert.deepEqual(result.targets[0].ground,[0,60,140]);
  const raster=rgb=>({width:1,height:1,pixels:Buffer.from([...rgb,255])}),ground=raster(result.targets[0].ground);
  assert.equal(measureInk(raster([255,255,255]),ground,3).kind,null);
  assert.equal(measureInk(ground,ground,3).kind,'empty-content');
});

test('[risk: state workers leak overlays or closure state] fresh navigation isolates even an incomplete reset',async t=>{
  const out=workspace(t),fake=boundary(out);
  fake.states.splice(0,2,...Array.from({length:4},(_,i)=>({name:`interactive-${i}`,scope:'#row',static:false})));
  const report=await runLayeredCheck(options(out,['--fonts','default']),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1},budgets,fake);
  assert.equal(report.status,'passed',JSON.stringify(report.gaps));assert.equal(report.coverage.completed,4);
  assert.equal(fake.calls.navigations,6);assert.equal(fake.calls.setups.length,4);assert.equal(fake.calls.resets.length,4);
});

test('[risk: all-font wall budget is ignored when every font is individually fast] total overrun fails with full result counts',async t=>{
  const out=workspace(t),fake=boundary(out,{delay:8});
  const report=await runLayeredCheck(options(out),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1},{...budgets,allFontsBudgetMs:1},fake);
  assert.equal(report.coverage.completed,6);assert.equal(report.overBudget,true);assert.equal(report.status,'findings');
  assert(report.budgetFailures.some(f=>f.includes('all fonts including browser close')));
});

test('[risk: font budget interrupts coverage] overrun finishes every state in every font before failing',async t=>{
  const out=workspace(t),fake=boundary(out,{delay:8});
  const report=await runLayeredCheck(options(out),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1},{...budgets,gateBudgetMs:1,fontPassBudgetMs:1},fake);
  assert.equal(report.coverage.completed,6);assert.equal(report.coverage.complete,true);
  assert.equal(report.overBudget,true);assert.equal(report.status,'findings');
  assert.equal(report.fontPasses.length,3);
  assert(report.fontPasses.every(p=>p.overBudget&&p.slowestStates.length===2));
});

test('[risk: sticky headers become occlusion gaps or real overlays are ignored] scroll boundary replay distinguishes header, overlay and unscrolled header',t=>{
  const {node,mount}=visualDOM(t);inkViewport(t);
  const label=node('span',{id:'label','data-ink-check':''},{},'Row'),header=node('th',{id:'header'},{position:'sticky'},'Header');
  document.createRange=()=>({setStartBefore(){},setEndAfter(){},getBoundingClientRect:()=>label.getBoundingClientRect()});
  const table=node('table',{}, {},'',[node('thead',{}, {},'',[header]),node('tr',{}, {},'',[node('td',{}, {},'',[label])])]);
  const scroll=node('div',{id:'scroll'},{overflowY:'auto'},'',[table],{height:300});scroll.scrollTop=40;
  const overlay=node('div',{id:'overlay'},{},'Overlay');mount(node('body',{}, {},'',[scroll,overlay]));
  document.elementFromPoint=()=>header;
  let result=inkCandidates({selector:'#label'});assert.deepEqual(result.scrolledOut,['#label']);assert.equal(result.targets.length,0);assert.deepEqual(result.gaps,[]);
  document.elementFromPoint=()=>overlay;assert.equal(inkCandidates({selector:'#label'}).targets[0].occluded,true);
  document.elementFromPoint=()=>header;scroll.scrollTop=0;assert.equal(inkCandidates({selector:'#label'}).targets[0].occluded,true);
});

test('[risk: invalid contracts waste the state matrix] declarations fail before hooks',t=>{
  visualDOM(t);
  window.jigStates=[{name:'row',setup(){throw new Error('must not run');},reset(){}}];
  window.jigDataModes=[{name:'Demo',setup(){throw new Error('must not run');}}];
  for(const fonts of [Object.assign(['default','wide'],{set(){}}),{ids:['default','wide'],set(){}}]){
    window.jigFonts=fonts;assert.deepEqual(runInThisContext(contractExpression()).available,['default','wide']);
  }
  for(const [key,value] of [['jigStates',[]],['jigDataModes',[{name:'Demo'}]],['jigFonts',{ids:['default']} ]]){
    const previous=window[key];window[key]=value;assert.throws(()=>runInThisContext(contractExpression()),/Invalid/);window[key]=previous;
  }
});

test('[risk: recurring inspection errors multiply across fonts] five identical failures stop with incomplete coverage',async t=>{
  const out=workspace(t),fake=boundary(out);
  fake.states.splice(0,2,...Array.from({length:12},(_,i)=>({name:`state-${i}`,scope:'#row',static:false})));
  fake.inspect=async()=>{throw new Error('seeded inspection failure');};
  const report=await runLayeredCheck(options(out),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1},budgets,fake);
  assert.equal(report.coverage.expected,36);assert.equal(report.runs.length,5);assert.equal(report.coverage.complete,false);
  assert.equal(report.fontPasses.length,1);assert.equal(report.gaps.filter(g=>g.includes('5 identical')).length,1);
});
test('[risk: font checks race in one page or reports appear only after completion] one browser, parallel isolated pages and streamed progress',async t=>{
  const out=workspace(t),fake=boundary(out,{delay:8});
  const token={table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1};
  const report=await runLayeredCheck(options(out),token,budgets,fake);
  assert.equal(report.status,'passed',JSON.stringify(report.gaps));assert.equal(report.coverage.expected,6);assert.equal(report.coverage.completed,6);
  assert.equal(fake.calls.launches,1);assert.equal(fake.calls.closes,1);assert.equal(fake.calls.maxActive,2);
  assert.equal(fake.calls.setups.length,1);assert.equal(fake.calls.resets.length,1);assert.equal(fake.calls.measure,3);
  assert.equal(report.runs.filter(r=>r.replayed).length,2);
  assert(fake.calls.progress.some(s=>s.includes('static')));assert.equal(JSON.parse(readFileSync(join(out,'report.json'))).runs.length,6);
  assert.equal(report.fontPasses.length,3);assert(report.layers.geometry.elapsedMs>0);
});
test('[risk: timeout loses prior evidence or over-budget pass exits zero] partial report survives a hanging inspector and names slow states',async t=>{
  const out=workspace(t),fake=boundary(out,{hang:true});
  const report=await runLayeredCheck(options(out,['--fonts','default','--timeout-ms','10']),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:2001},budgets,fake);
  assert.equal(report.status,'findings');assert.equal(report.overBudget,true);assert.equal(report.coverage.complete,false);
  assert(report.runs.some(r=>r.state==='static'&&r.completed));assert.equal(fake.calls.closes,1);
  const saved=JSON.parse(readFileSync(join(out,'report.json')));assert(saved.fontPasses[0].slowestStates.length);assert(saved.runs.length);
});
test('[risk: accepted baseline cannot be captured or overwrites earlier evidence] explicit acceptance stores state crops and refuses existing store',async t=>{
  const out=workspace(t),store=join(out,'accepted'),fake=boundary(out);
  const opts=options(out,['--fonts','default','--baseline',store,'--accept-baseline','--approved-by','fixture reviewer','--approved-at','2026-11-08']);
  const token={table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1};
  const first=await runLayeredCheck(opts,token,budgets,fake);assert.equal(first.status,'passed',JSON.stringify(first.gaps));
  const manifest=JSON.parse(readFileSync(join(store,'manifest.json')));assert.equal(manifest.entries.length,2);assert(existsSync(join(store,manifest.entries[0].file)));
  const bytes=readFileSync(join(store,'manifest.json'));const second=await runLayeredCheck(opts,token,budgets,fake);
  assert(second.gaps.some(g=>g.includes('already exists')));assert.deepEqual(readFileSync(join(store,'manifest.json')),bytes);
});
test('[risk: report compaction erases cached ink defects] shared cached findings remain intact across states',async t=>{
  const out=workspace(t),fake=boundary(out),shared={findings:[{kind:'empty-content',element:'#icon',measured:0,expected:'ink pixels > 0'}],gaps:[],measurements:[],captures:1};
  fake.ink=async()=>shared;
  const report=await runLayeredCheck(options(out,['--fonts','default']),{table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1},budgets,fake);
  assert.equal(shared.findings.length,1);assert.equal(report.findings.length,1);assert.deepEqual(report.findings[0].states,['static','focus']);assert.deepEqual(report.runs.map(r=>r.findingIds),[[1],[1]]);
});
test('[risk: baseline output repeats unchanged states or ignores changed crops] accepted comparisons report changed states while retaining full coverage',async t=>{
  const out=workspace(t),fake=boundary(out),black=encodePNG({width:1,height:1,pixels:Buffer.from([0,0,0,255])});
  writeFileSync(join(out,'static.png'),black);writeFileSync(join(out,'focus.png'),black);
  const manifest={version:1,approvedBy:'fixture reviewer',approvedAt:'2026-11-08',browser:'fake',platform:process.platform,entries:fake.states.map(s=>({state:s.name,dataMode:'Demo',component:'row',selector:s.scope,viewport:{width:1280,height:800},scale:1,file:s.name+'.png'}))};
  writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest));
  fake.inspect=async()=>({clip:{findings:[{kind:'control-label',element:'#focus',measured:'known raster',expected:'accepted crop'}],gaps:[]}});
  const opts=options(out,['--fonts','default','--baseline',out]),token={table:{states:fake.states},directory:out,findings:[],gaps:[],elapsedMs:1};
  const unchanged=await runLayeredCheck(opts,token,budgets,fake);assert.equal(unchanged.status,'passed',JSON.stringify(unchanged.gaps));assert.deepEqual(unchanged.changedStates,[]);assert(unchanged.coverage.complete);assert.equal(unchanged.findings.length,0);
  writeFileSync(join(out,'static.png'),encodePNG({width:1,height:1,pixels:Buffer.from([255,255,255,255])}));
  const changed=await runLayeredCheck(opts,token,budgets,fake);assert.deepEqual(changed.changedStates,['static']);assert.equal(changed.findings[0].kind,'baseline-pixels');assert(changed.coverage.complete);
});
