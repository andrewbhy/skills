import assert from 'node:assert/strict';
import test from 'node:test';
import { visualDOM } from './helpers/visual-dom.mjs';
import { crispTargets, analyseCrisp, analyseConsistency } from '../scripts/visual-crisp.mjs';
import { inkCandidates } from '../scripts/visual-ink.mjs';
import { measureInk } from '../scripts/visual-visibility.mjs';

test('[risk: loading inherits disabled contrast exemption] loading remains visible and distinct from disabled',t=>{
  const {node,mount}=visualDOM(t);
  const loading=node('button',{id:'loading','data-component':'button','data-state':'loading','aria-disabled':'true','aria-busy':'true'}, {},'Loading');
  mount(node('body',{}, {backgroundColor:'rgb(255, 255, 255)'},'',[loading]));
  const capture=crispTargets({selector:'#loading'});
  assert.equal(capture.measurements[0].disabled,false);
  const m={...capture.measurements[0],foreground:[240,240,240,1]};
  assert(analyseCrisp([m]).findings.some(f=>f.kind==='text-contrast'));
  assert(!analyseConsistency([{...m,state:'default'},m]).findings.some(f=>f.expected==='enabled and disabled paint must be distinguishable'));
});

test('[risk: split halves require individual focus rings] group ring passes and missing group ring fails once',t=>{
  const {node,mount}=visualDOM(t);
  const buttons=['left','right'].map(id=>node('button',{id,'data-state':'focus-visible'},{backgroundColor:'rgb(0, 60, 140)',color:'rgb(255, 255, 255)'},'Open'));
  const group=node('div',{id:'split','data-component':'split-button'},{outlineWidth:'2px',outlineStyle:'solid',outlineColor:'rgb(0, 0, 0)'},'',buttons);
  mount(node('body',{}, {backgroundColor:'rgb(255, 255, 255)'},'',[group]));
  const check=()=>analyseCrisp(crispTargets({selector:'#split'}).measurements).findings.filter(f=>f.edge==='focus');
  assert.deepEqual(check(),[]);
  group.css.outlineWidth='0px';
  assert.equal(check().length,1);assert.equal(check()[0].element,'#split');
  group.css.outlineWidth='2px';assert.deepEqual(check(),[]);
});

test('[risk: computed color-mix grounds hand off filled icons] hover active icon-only and split use actual fill and invisible ink fails',t=>{
  const {node,mount}=visualDOM(t);
  const previous=Object.fromEntries(['innerWidth','innerHeight','scrollX','scrollY'].map(k=>[k,globalThis[k]]));
  Object.assign(globalThis,{innerWidth:1280,innerHeight:800,scrollX:0,scrollY:0});
  t.after(()=>{for(const [k,v] of Object.entries(previous))v===undefined?delete globalThis[k]:globalThis[k]=v;});
  for(const state of ['hover','active','icon-only','split','loading']){
    const icon=node('svg',{id:'icon','data-ink-check':''},{fill:'none',stroke:'rgb(255, 255, 255)'});
    const button=node('button',{'data-state':state,...(state==='loading'?{'aria-disabled':'true','aria-busy':'true'}:{})},{backgroundColor:'color(srgb 0 0.235294 0.54902)'},'',[icon]);
    mount(node('body',{}, {backgroundColor:'rgb(255, 255, 255)'},'',[button]));document.elementFromPoint=()=>icon;
    const r=inkCandidates({selector:'button'});assert.deepEqual(r.gaps,[]);assert.equal(r.targets.length,1);
    assert.deepEqual(r.targets[0].ground,[0,60,140]);assert.equal(r.targets[0].disabled,false);
    const raster=rgb=>({width:1,height:1,pixels:Buffer.from([...rgb,255])}),ground=raster(r.targets[0].ground);
    assert.equal(measureInk(raster([255,255,255]),ground,3).kind,null);
    assert.equal(measureInk(ground,ground,3).kind,'empty-content');
  }
});
