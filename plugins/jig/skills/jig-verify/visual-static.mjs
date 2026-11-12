// A single synchronous browser turn for all resting specimens. Inspectors see
// only maximal declared scopes; results are attributed back to contained states.
import { inspectClip, scanClip, inspectLayout } from './visual-clip.mjs';
import { inspectSpacing } from './visual-spacing.mjs';
import { overlapTargets, analyseOverlap } from './visual-overlap.mjs';
import { alignmentTargets, analyseAlignment } from './visual-alignment.mjs';
import { crispTargets, analyseCrisp, analyseConsistency } from './visual-crisp.mjs';
import { designTargets, analyzeDesign } from './design-inspector.mjs';

export function componentMarker({selector,component}) {
  const root=document.querySelector(selector);if(!root)throw new Error('Scope missing');
  const actual=root.getAttribute('data-component')||root.closest('[data-component]')?.getAttribute('data-component');
  return {findings:component&&actual!==component?[{kind:'component-marker',element:selector,measured:actual || 'missing',expected:component}]:[],gaps:[]};
}
export function freezeScopeAnimations(selectors) {
  const seen=new Set();
  for(const selector of selectors){
    const root=document.querySelector(selector);if(!root)throw new Error(`Freeze scope missing: ${selector}`);
    for(const animation of root.getAnimations({subtree:true})){
      if(seen.has(animation)||!animation.effect)continue;seen.add(animation);
      if(Number.isFinite(animation.effect.getComputedTiming().endTime))animation.finish();else animation.pause();
    }
  }
}

export function collectStatic({states, inspectors, fontChecksOnly = false}) {
  const roots = states.map(s => {
    const matches = document.querySelectorAll(s.scope);
    if (matches.length !== 1) throw new Error(`Scope must resolve to one region: ${s.scope}`);
    const root = matches[0];
    const component = root.getAttribute('data-component') || root.closest('[data-component]')?.getAttribute('data-component');
    const markerFinding=s.component&&component!==s.component?{kind:'component-marker',element:s.scope,measured:component || 'missing',expected:s.component}:null;
    return {...s,root,markerFinding};
  });
  const groups = [];
  for (const s of roots) {
    if (roots.some(other => other.root !== s.root && other.root.contains(s.root))) continue;
    if (!groups.some(g => g.root === s.root)) groups.push(s);
  }
  const result = [];
  for (const group of groups) {
    const start = performance.now(), raw = {};
    const take = (name, operation) => { if (inspectors.includes(name)) { const t=performance.now(); raw[name]=operation(); raw[name].elapsedMs=performance.now()-t; } };
    take('clip',()=>{
      const text = inspectClip(group.scope);
      if (fontChecksOnly) return text;
      const boxes = scanClip(group.scope);
      return {...text,findings:[...text.findings,...boxes.findings],gaps:[...text.gaps,...boxes.gaps]};
    });
    take('spacing',()=>inspectSpacing(group.scope));
    take('overlap',()=>({measurements:overlapTargets(group.scope),findings:[],gaps:[]}));
    take('alignment',()=>({measurements:alignmentTargets(group.scope),findings:[],gaps:[]}));
    take('crisp',()=>({...crispTargets({selector:group.scope,state:group.state || group.name,fontChecksOnly}),findings:[]}));
    const layout = inspectLayout(group.scope);
    const members = roots.filter(s => group.root.contains(s.root));
    const belongs = (s, item) => { try { const el = document.querySelector(item.element); return el && s.root.contains(el); } catch { return false; } };
    const runs = members.map(s => ({name:s.name,scope:s.scope,component:s.component,layout:layout.filter(m => belongs(s,m)),
      inspectors:Object.fromEntries(Object.entries(raw).map(([name,value]) => [name,{...value,
        findings:(value.findings || []).filter(f => belongs(s,f)),measurements:value.measurements?.filter(m => belongs(s,m))}]))}));
    if(!fontChecksOnly)for(const run of runs){
      const owner=members.find(s=>s.name===run.name),interactive='button,[role=button],a[href],input,select,[tabindex]';
      run.inspectors.componentMarker={findings:owner.markerFinding?[owner.markerFinding]:[],gaps:[]};
      const elements=[...(owner.root.matches(interactive)?[owner.root]:[]),...owner.root.querySelectorAll(interactive)];
      const path=e=>e.id?`#${CSS.escape(e.id)}`:e.parentElement?`${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e)+1})`:e.localName;
      run.inspectors.motionDeclarations={findings:window.jigStates && (group.root.matches('[data-motion]')||group.root.querySelector('[data-motion]'))?elements.filter(e=>!e.hasAttribute('data-motion')&&!e.matches('input[type=hidden]')).map(e=>({kind:'missing motion declaration',element:path(e),measured:'no data-motion',expected:'data-motion recipe or none with a reason'})):[],gaps:[]};
    }
    const design=inspectors.includes('design')?designTargets(group.scope):undefined;
    result.push({scope:group.scope,runs,design,elapsedMs:performance.now()-start});
  }
  return result;
}
// Imports are deliberately bound in this one browser expression. No per-state
// protocol round trips, scrolling, setup, settling or reset for static states.
export function staticExpression(input) {
  return `(() => {const inspectClip=${inspectClip};const scanClip=${scanClip};const inspectLayout=${inspectLayout};const inspectSpacing=${inspectSpacing};const overlapTargets=${overlapTargets};const alignmentTargets=${alignmentTargets};const crispTargets=${crispTargets};const designTargets=${designTargets};return (${collectStatic})(${JSON.stringify(input)});})()`;
}
export async function measureStatic(page, states, options, run = {}) {
  const groups = await page.evaluate(staticExpression({states,inspectors:options.gate&&!run.fontChecksOnly?[...options.inspectors,'design']:options.inspectors,fontChecksOnly:run.fontChecksOnly}));
  if(options.gate && !run.fontChecksOnly)for(const group of groups){
    let design;
    try{const r=analyzeDesign(group.design);design={findings:[],gaps:[],warnings:r.findings,waived:r.waived,coverageGaps:r.gaps};}
    catch(error){design={findings:[],gaps:[error.message]};}
    // One snapshot per maximal scope; sibling states refer to that result.
    group.runs.forEach((state,index)=>{state.inspectors.design=index===0?design:{findings:[],gaps:[],sharedScope:group.scope};});
    delete group.design;
  }
  for (const group of groups) for (const state of group.runs) {
    const r=state.inspectors;
    if(r.overlap) Object.assign(r.overlap,analyseOverlap(r.overlap.measurements));
    if(r.alignment) Object.assign(r.alignment,analyseAlignment(r.alignment.measurements,{scale:run.scale}));
    if(r.crisp) Object.assign(r.crisp,analyseCrisp(r.crisp.measurements,{scale:run.scale,thresholds:options.crispThresholds}));
    if(run.fontChecksOnly) {
      if(r.crisp) r.crisp.findings=r.crisp.findings.filter(f=>f.kind==='unintended-truncation');
      if(r.alignment) r.alignment.findings=r.alignment.findings.filter(f=>f.kind==='containment');
    }
  }
  // Compare all specimens together, once. Cross-component selection survives
  // scope isolation; measurements outside the requested scopes never enter.
  const unique = new Map();
  for(const group of groups) for(const state of group.runs) for(const m of state.inspectors.crisp?.measurements || []) unique.set(m.element,m);
  const consistency=analyseConsistency([...unique.values()]);
  for(const group of groups) for(const state of group.runs) state.inspectors.consistency={findings:consistency.findings.filter(f=>state.inspectors.crisp?.measurements.some(m=>m.element===f.element)).filter(f=>!run.fontChecksOnly || f.kind==='state-typography'),gaps:[]};
  return groups;
}

export async function settledScopes(page,scopes,options) {
  const deadline=Date.now()+options['timeout-ms'];let previous,since=Date.now();
  while(Date.now()<deadline){
    const current=await page.evaluate(selectors=>{
      const roots=[...new Set(selectors.map(s=>document.querySelector(s)))];
      if(roots.some(r=>!r))throw new Error('Static scope missing during settling');
      const maximal=roots.filter(r=>!roots.some(other=>other!==r&&other.contains(r)));
      const all=maximal.flatMap(r=>[r,...r.querySelectorAll('*')]);
      if(all.length>20000)throw new Error('Static scopes exceed 20000 elements');
      return {ready:document.fonts.status==='loaded'&&all.filter(e=>e.localName==='img').every(i=>i.complete),signature:JSON.stringify(all.map(e=>{const b=e.getBoundingClientRect();return[b.x,b.y,b.width,b.height,e.scrollWidth,e.scrollHeight,e.textContent,e.getAttribute('style')];}))};
    },scopes);
    if(!current.ready||current.signature!==previous){previous=current.signature;since=Date.now();}
    else if(Date.now()-since>=options['settle-ms'])return true;
    await page.waitForTimeout(Math.min(100,Math.max(1,options['settle-ms'])));
  }
  return false;
}
