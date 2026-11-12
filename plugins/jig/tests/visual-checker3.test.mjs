import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseCrisp, analyseConsistency } from '../scripts/visual-crisp.mjs';

// Reduced CSS snapshots of the stage-2 feedback cases. No live page is changed.
const white=[255,255,255,1],black=[0,0,0,1],grey=[230,230,230,1];
const sample=(extra={})=>({element:'#control',component:'control',componentRoot:true,slot:'label',state:'default',
  text:'Open',tone:'primary',role:'label',fontSize:14,fontWeight:'400',letterSpacing:'normal',textWidth:28,
  opacity:1,foreground:black,background:white,color:black,radius:Array(4).fill('0px'),...extra});

test('[risk: stage-2 washed-out text returns] ledger must-flag contrast fixture',()=>{
  assert(analyseCrisp([sample({foreground:[135,135,135,1]})]).findings.some(f=>f.kind==='text-contrast'));
  assert.deepEqual(analyseCrisp([sample()]).findings,[]);
});
test('[risk: stage-2 square-table selection becomes a grey pill] ledger must-flag selection fixture',()=>{
  const pill=sample({selected:true,state:'selected',background:grey,squareTable:true,table:'#table',radius:Array(4).fill('8px')});
  assert(analyseConsistency([pill]).findings.some(f=>f.kind==='selection-style'));
  assert.deepEqual(analyseConsistency([{...pill,radius:Array(4).fill('0px')}]).findings,[]);
});
test('[risk: stage-2 selected rows become bold] ledger must-flag typography fixture',()=>{
  const base=sample(),selected=sample({element:'#selected',state:'selected',selected:true,background:[0,60,140,1],fontWeight:'700'});
  assert(analyseConsistency([base,selected]).findings.some(f=>f.kind==='state-typography'));
  assert.deepEqual(analyseConsistency([base,{...selected,fontWeight:'400'}]).findings,[]);
});
test('[risk: stage-2 hover equals selection] ledger must-flag state-fill fixture',()=>{
  const hover=sample({state:'hover',background:grey}),selected=sample({element:'#selected',state:'selected',selected:true,background:grey});
  assert(analyseConsistency([hover,selected]).findings.some(f=>f.kind==='state-fill'));
  assert.deepEqual(analyseConsistency([hover,{...selected,background:[0,60,140,1]}]).findings,[]);
});

test('[risk: quiet default lacks any affordance] ledger must-flag fixture',()=>{
  const quiet=sample({control:true,quiet:true,borders:[],fill:null,surface:white});
  assert(analyseCrisp([quiet]).findings.some(f=>f.kind==='faint-border'));
  assert.deepEqual(analyseCrisp([{...quiet,borders:[{edge:'all',color:black}]}]).findings,[]);
});
test('[risk: field hover reads as disabled] ledger must-flag fixture',()=>{
  const hover=sample({state:'hover',background:grey}),disabled=sample({element:'#disabled',state:'disabled',disabled:true,background:grey});
  assert(analyseConsistency([hover,disabled]).findings.some(f=>f.kind==='state-fill'));
  assert.deepEqual(analyseConsistency([hover,{...disabled,color:[120,120,120,1]}]).findings,[]);
});
test('[risk: filled control has no visible focus ring] ledger must-flag fixture',()=>{
  const focused=sample({state:'focus-visible',control:true,focusVisible:true,filledControl:true,controlSurface:white,background:[0,60,140,1],foreground:white});
  assert(analyseCrisp([focused]).findings.some(f=>f.kind==='faint-border'&&f.edge==='focus'));
  assert.deepEqual(analyseCrisp([{...focused,outline:{width:2,style:'solid',color:black}}]).findings,[]);
});
test('[risk: disabled control looks enabled] ledger must-flag fixture',()=>{
  const disabled=sample({element:'#disabled',state:'disabled',disabled:true});
  assert(analyseConsistency([sample(),disabled]).findings.some(f=>f.kind==='state-fill'));
  assert.deepEqual(analyseConsistency([sample(),{...disabled,color:[120,120,120,1]}]).findings,[]);
});
