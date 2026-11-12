import assert from 'node:assert/strict';
import { freemem } from 'node:os';
import test from 'node:test';
import { visualDOM } from './helpers/visual-dom.mjs';
import { crispTargets, analyseCrisp } from '../scripts/visual-crisp.mjs';
import { visibilityTargets, inspectVisibilityBatched } from '../scripts/visual-visibility.mjs';
import { analyseOptical } from '../scripts/visual-alignment.mjs';
import { declaredFonts, invokeFont, motionDeclarations, runInspectors } from '../scripts/visual-check.mjs';
import { readLocalStylesheets, styleSources, inspectStyles } from '../scripts/style-lint.mjs';
import { launchChrome, inspectClip } from '../scripts/visual-clip.mjs';

test('[risk: compact roles silence body defects or still flag labels] role capture and body-only size calibration', t => {
  const {node,mount}=visualDOM(t);
  const labels=['metadata','label','caption'].map(role=>node('span',{id:role,'data-role':role},{fontSize:'11px'},role));
  const header=node('th',{}, {},'', [node('span',{id:'header'},{fontSize:'12px'},'Name')]);
  const contexts=[node('kbd',{id:'key'},{fontSize:'11px'},'Enter'), node('span',{id:'chip',class:'chip'},{fontSize:'12px'},'Ready'),node('div',{id:'status',role:'status'},{fontSize:'11px'},'Saved')];
  mount(node('body',{}, {},'', [...labels,header,...contexts,node('p',{id:'body'},{fontSize:'12px'},'Body'),node('p',{id:'good'},{fontSize:'13px'},'Body')]));
  const snapshot=crispTargets(); const result=analyseCrisp(snapshot.measurements);
  assert.deepEqual(result.findings.filter(f=>f.kind==='small-body-text').map(f=>[f.element,f.role]),[['#body','body']]);
  for(const [id,role] of [['metadata','metadata'],['label','label'],['caption','caption'],['header','table-header'],['key','kbd'],['chip','chip'],['status','status-bar']]) assert.equal(snapshot.measurements.find(m=>m.element===`#${id}`).role,role);
});

test('[risk: coloured controls inherit 12:1 and disabled text becomes a defect] contrast policy captured from actual roles and paint', t => {
  const {node,mount}=visualDOM(t);
  mount(node('body',{}, {},'',[
    node('p',{id:'primary'},{color:'rgb(100, 100, 100)'},'Primary'),
    node('p',{id:'secondary','data-text-role':'secondary'},{color:'rgb(100, 100, 100)'},'Secondary'),
    node('p',{id:'accent','data-role':'accent'},{color:'rgb(0, 100, 180)'},'Accent'),
    node('a',{id:'link',href:'#'},{color:'rgb(0, 100, 180)'},'Link'),
    node('button',{id:'filled'},{color:'rgb(255, 255, 255)',backgroundColor:'rgb(0, 100, 180)'},'Action'),
    node('button',{id:'disabled',disabled:''},{opacity:'.2',color:'rgb(160, 160, 160)'},'Disabled'),
    node('p',{id:'bad-accent','data-role':'status'},{color:'rgb(160, 190, 230)'},'Too faint'),
  ]));
  const result=analyseCrisp(crispTargets().measurements);
  assert.deepEqual(result.findings.filter(f=>f.kind==='text-contrast').map(f=>f.element).sort(),['#bad-accent','#primary']);
  for(const id of ['accent','link','filled']) assert.equal(result.measurements.find(m=>m.element===`#${id}`).contrastThreshold,4.5);
  assert.equal(result.measurements.find(m=>m.element==='#secondary').contrastThreshold,5.5);
  assert.equal(result.measurements.find(m=>m.element==='#disabled').contrastStatus,'disabled, exempt');
  assert(!result.findings.some(f=>f.element==='#disabled'));
});

test('[risk: scroll-clipped rows look empty and shift optical centres] partial and nested scrolling excludes each ink element once', async t => {
  const {node,mount}=visualDOM(t);
  const below=node('span',{id:'below'}, {},'Below',[],{y:60});
  const partial=node('span',{id:'partial'}, {},'Partial',[],{y:35});
  const shown=node('span',{id:'shown'}, {},'Visible',[],{y:10});
  mount(node('body',{}, {},'',[node('div',{id:'scroll'},{overflowY:'auto'},'',[node('div',{}, {},'',[below,partial]),shown],{height:50})]));
  const snapshot=visibilityTargets('body');
  assert.deepEqual(snapshot.scrolledOut,['#below','#partial']);
  assert.deepEqual(snapshot.targets.map(m=>m.element),['#shown']);
  assert.deepEqual(analyseOptical(snapshot.targets).findings,[]);
  // No raster capture occurs when every target is scroll clipped.
  shown.css.display='none';
  const result=await inspectVisibilityBatched({evaluate:async(fn,arg)=>fn(arg),viewportSize:()=>({width:800,height:600}),screenshot:()=>{throw new Error('must not capture');}});
  assert.deepEqual(result.findings,[]); assert.deepEqual(result.gaps,[]);
  assert.deepEqual(result.notes,['scrolled out of view: 2 elements']); assert.equal(result.captures,0);
  below.parentElement.parentElement.css.overflowY='hidden';
  assert(visibilityTargets('body').targets.some(m=>m.element==='#below'),'Hidden clipping still needs measurement');
});

test('[risk: absent scope repeats offscreen gaps and optical doubles visibility gaps] inspector coverage disclosure is bounded', async t => {
  const {node,mount}=visualDOM(t); mount(node('body'));
  const page={evaluate:async(fn,arg)=>fn.name==='visibilityTargets' ? {targets:[{element:'#outside',rect:{x:0,y:900,width:10,height:10}}],gaps:[],scrolledOut:[]} : fn(arg),viewportSize:()=>({width:800,height:600})};
  const unscoped=await runInspectors(page,{root:'body',inspectors:['visibility']},{scoped:false});
  assert.deepEqual(unscoped.visibility.gaps,[]);
  const scoped=await runInspectors(page,{root:'body',inspectors:['visibility']},{scoped:true});
  assert.equal(scoped.visibility.gaps.length,1);
});

test('[risk: file stylesheets become CSSOM gaps and missing imports flood states] disk fallback discovers imports once and scopes parsed rules', async t => {
  const {node,mount}=visualDOM(t); mount(node('body',{}, {},'',[node('div',{id:'component'})]));
  const url=new URL('./fixtures/visual/calibration-styles.css',import.meta.url).href;
  const disk=readLocalStylesheets([url,url]);
  assert.equal(disk.findings.length,1); assert.equal(disk.findings[0].kind,'missing-stylesheet');
  assert.equal(disk.gaps.length,0); assert(Object.keys(disk.localSheets).length===3);
  // Recorded parsed CSSOM boundary: the real-browser fixture exercises the
  // native parser; this test executes the disk read and scoped lint integration.
  globalThis.CSSStyleSheet=class { replaceSync(css) { assert(css.includes('#component')); this.cssRules=[{selectorText:'#component',style:{cssText:'padding:3px;'},cssRules:[]}]; } };
  document.styleSheets=[{href:url,get cssRules(){throw new Error('SecurityError');}}];
  const result=await inspectStyles({evaluate:async(fn,arg)=>fn(arg)},'#component');
  assert.deepEqual(result.gaps,[]); assert.equal(result.findings.filter(f=>f.kind==='missing-stylesheet').length,1);
  assert(result.findings.some(f=>f.kind==='off-spacing-scale'));
  const sources=styleSources({selector:'#component',localSheets:disk.localSheets});
  assert.deepEqual(sources.inaccessible,[]);
});

test('[risk: fonts silently fall back or hang] font ids and asynchronous setter contract', async t => {
  visualDOM(t); assert.deepEqual(declaredFonts(),['default']); await invokeFont({id:'default'});
  for(const fonts of [{ids:[],set(){}},{ids:['A','A'],set(){}},{ids:['A']},{ids:[' '],set(){}}]) {window.jigFonts=fonts;assert.throws(declaredFonts,/Invalid window.jigFonts/);}
  let selected; window.jigFonts={ids:['Geist','System'],set:async id=>{selected=id;}};
  assert.deepEqual(declaredFonts(),['Geist','System']); await invokeFont({id:'System'}); assert.equal(selected,'System');
  await assert.rejects(invokeFont({id:'unknown'}),/disappeared/);
  window.jigFonts.set=()=>new Promise(()=>{}); await assert.rejects(invokeFont({id:'Geist',timeout:5}),/timed out/);
  const page={evaluate:async fn=>{
    if(fn.name==='inspectClip') return {findings:[{kind:'text-clipped'}],gaps:[]};
    if(fn.name==='alignmentTargets') return [{element:'#overflow',parent:'#parent',flow:false,fractionalTarget:true,drawnAxes:['x'],rect:{x:.5,y:0,width:20,height:20},bounds:{left:0,top:0,right:10,bottom:10}}];
    if(fn.name==='crispTargets') return {measurements:[{element:'#label',text:'Text',fontSize:10,opacity:.5,foreground:[150,150,150,1],background:[255,255,255,1],hiddenWidth:20,canGrow:true}],gaps:[],exceptions:[]};
    throw new Error(`Extra-font pass called ${fn.name}`);
  }};
  const extra=await runInspectors(page,{root:'body',inspectors:['clip','alignment','crisp']},{fontChecksOnly:true});
  assert.deepEqual(extra.crisp.findings.map(f=>f.kind),['unintended-truncation']);
  assert.deepEqual(extra.alignment.findings.map(f=>f.kind),['containment']);
  assert.equal(extra.clip.findings.length,1); assert(!extra.optical && !extra.motionDeclarations);
});

test('[risk: a partially annotated page silently omits motion opportunities] inventory checks every interactive selector and respects explicit none', t => {
  const {node,mount}=visualDOM(t);
  const elements=[node('button',{id:'declared','data-motion':'none: instant keyboard action'}),node('button',{id:'button'}),node('div',{id:'role',role:'button'}),node('a',{id:'link',href:'#'}),node('input',{id:'input'}),node('select',{id:'select'}),node('div',{id:'tab',tabindex:'0'}),node('span',{id:'plain'})];
  mount(node('body',{}, {},'',elements));
  assert.deepEqual(motionDeclarations('body').findings.map(f=>f.element),['#button','#role','#link','#input','#select','#tab']);
  assert(motionDeclarations('#role').findings.some(f=>f.kind==='missing motion declaration'));
  mount(node('body',{}, {},'',[node('button',{id:'legacy'})])); assert.deepEqual(motionDeclarations('body').findings,[]);
});

test('[risk: DOM replay differs from native layout, CSSOM or font loading] seven calibration fixtures in one sequential browser', {
  skip: process.env.JIG_NO_BROWSER === '1' ? 'Browser disabled' : freemem() < 4 * 2 ** 30 ? 'Less than 4 GB free memory' : false,
}, async t => {
  const browser=await launchChrome(); t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:800,height:600}});
  const visit=async name=>{ await page.goto(new URL(`./fixtures/visual/calibration-${name}.html`,import.meta.url).href); await page.evaluate(()=>document.fonts.ready); };
  await visit('roles');
  const roles=analyseCrisp((await page.evaluate(crispTargets,{})).measurements);
  assert.deepEqual(roles.findings.filter(f=>f.kind==='small-body-text').map(f=>f.element),['#body']);
  await visit('contrast');
  const tones=analyseCrisp((await page.evaluate(crispTargets,{})).measurements);
  assert.deepEqual(tones.findings.filter(f=>f.kind==='text-contrast').map(f=>f.element).sort(),['#bad-accent','#primary']);
  assert.equal(tones.measurements.find(m=>m.element==='#disabled').contrastStatus,'disabled, exempt');
  await visit('scope');
  const scoped=await runInspectors(page,{root:'#region',inspectors:['crisp','visibility']},{state:'scoped',scoped:true});
  assert(Object.values(scoped).every(r=>r.gaps.length===0)); assert(!scoped.crisp.measurements.some(m=>m.element==='#elsewhere'));
  const unscoped=await runInspectors(page,{root:'body',inspectors:['visibility']},{state:'unscoped',scoped:false});
  assert.deepEqual(unscoped.visibility.gaps,[]);
  await visit('scroll');
  const scrolling=await inspectVisibilityBatched(page);
  assert(scrolling.scrolledOut.includes('#below')); assert(!scrolling.findings.some(f=>f.element==='#below'));
  assert.deepEqual(scrolling.notes,['scrolled out of view: 1 elements']);
  await visit('styles');
  const styles=await inspectStyles(page,'#component');
  assert.deepEqual(styles.gaps,[]); assert.equal(styles.findings.filter(f=>f.kind==='missing-stylesheet').length,1);
  assert(styles.findings.some(f=>f.kind==='off-spacing-scale')); assert(!styles.findings.some(f=>f.element.includes('#elsewhere')));
  await visit('fonts');
  assert.deepEqual(await page.evaluate(declaredFonts),['default','wide']);
  await page.evaluate(invokeFont,{id:'wide'}); await page.evaluate(()=>document.fonts.ready);
  assert((await page.evaluate(inspectClip,'#control')).findings.some(f=>f.kind==='text-clipped'));
  await visit('motion');
  assert.equal((await page.evaluate(motionDeclarations,'body')).findings.length,6);
});
