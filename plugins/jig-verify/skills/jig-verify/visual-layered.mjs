if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/visual-layered.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { existsSync, mkdirSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, settled, saveContactSheet, statusFor } from './visual-clip.mjs';
import { measureStatic, settledScopes, componentMarker, freezeScopeAnimations } from './visual-static.mjs';
import { inspectCandidateInk } from './visual-ink.mjs';
import { analyseConsistency } from './visual-crisp.mjs';
import { analyseOptical } from './visual-alignment.mjs';
import { recordMotionStrip, analyseMotion } from './visual-motion.mjs';
import { readBaseline } from './visual-pixels.mjs';
import { changedFiles, selectChanged } from './visual-changes.mjs';
import { captureStateSnapshot, restoreStateSnapshot } from './visual-state-snapshot.mjs';
import { declaredStates, declaredFonts, declaredDataModes, invokeState, invokeDataMode, invokeFont, stateScope, runInspectors,
  withTimeout, inspectBaseline, ruleContract, uniqueFindings, groupFindings, sourceCounts, coverageStatus, captureRegion,
  annotateFindings, numberedFindings } from './visual-check.mjs';

export function pageStateMetadata() {
  return (window.jigStates || [{name:'default'}]).map(s=>({name:s.name,scope:s.scope,component:s.component,static:s.static===true || s.setup===undefined,dataModes:s.dataModes}));
}
// Validate all declarations in one turn, before fonts, modes or state hooks run.
export function contractExpression() {
  return `(() => {const declaredStates=${declaredStates};const declaredDataModes=${declaredDataModes};const declaredFonts=${declaredFonts};return {names:declaredStates(),modes:declaredDataModes(),available:declaredFonts(),metadata:(${pageStateMetadata})()};})()`;
}
export function planStates(names,metadata,table,options,files,directory,modes) {
  if(table && (names.some(n=>!table.states.some(s=>s.name===n)) || table.states.some(s=>!names.includes(s.name)))) throw new Error('State table and window.jigStates must have identical names');
  const requested=options.states || names;
  if(requested.some(n=>!names.includes(n)))throw new Error('Unknown states');
  const rows=names.map(name=>({...metadata.find(s=>s.name===name),...table?.states.find(s=>s.name===name),name}));
  for(const row of rows) {
    row.scope=options.scope || row.scope || options.root;
    row.dataModes ??= modes;
    if(!Array.isArray(row.dataModes)||!row.dataModes.length||new Set(row.dataModes).size!==row.dataModes.length||row.dataModes.some(m=>!modes.includes(m)))throw new Error(`Invalid dataModes for ${row.name}`);
  }
  const changed=selectChanged(rows,files,directory,table?.tokenFiles || []);
  return {...changed,states:changed.states.filter(s=>requested.includes(s.name)),all:rows};
}

export async function runLayeredCheck(options,tokenReport,budgets,{launch=launchChrome,measure=measureStatic,inspect=runInspectors,ink=inspectCandidateInk,motion=recordMotionStrip,progress=s=>process.stderr.write(s+'\n')}={}) {
  const start=performance.now(),report={tool:'visual-check',version:2,node:process.version,platform:process.platform,
    options:{gate:options.gate===true,url:options.url,changed:options.changed,since:options.since},runs:[],findings:uniqueFindings(tokenReport.findings).map((f,i)=>({...f,id:i+1})),gaps:[...tokenReport.gaps],
    coverage:{expected:0,declarations:[],complete:false},layers:{tokens:{elapsedMs:tokenReport.elapsedMs,budgetMs:budgets.tokenBudgetMs},setup:{elapsedMs:0},geometry:{elapsedMs:0},ink:{elapsedMs:0},baseline:{elapsedMs:0}},fontPasses:[],timeBudgets:budgets,overBudget:false,status:'inconclusive'};
  let browser,baseline,occurrences=tokenReport.findings.length,previousFailure='',identicalFailures=0,aborted=false; const tiles=[],accepted=[],cache=new Map(),canonical=new Map();
  mkdirSync(options.out,{recursive:true});writeFileSync(join(options.out,'runs.jsonl'),'');
  report.stream='runs.jsonl';report.changedStates=[];
  const flush=()=>{report.elapsedMs=performance.now()-start+tokenReport.elapsedMs;report.coverage.completed=report.runs.filter(r=>r.completed).length;report.coverage.attempted=report.runs.length;const temporary=join(options.out,'report.json.tmp');writeFileSync(temporary,JSON.stringify(report)+'\n');renameSync(temporary,join(options.out,'report.json'));};
  const addRun=(run)=>{
    run.findings=[];
    for(const [inspector,r] of Object.entries(run.inspectors)){
      run.findings.push(...(r.findings || []).map(f=>({...ruleContract(f),source:'script',inspector,layer:f.layer || (inspector==='visibility'?'ink':inspector==='pixels'?'baseline':'geometry'),state:run.state,viewport:run.viewport,scale:run.scale,font:run.font,dataMode:run.dataMode})));
      run.gaps.push(...(r.gaps || []).map(g=>`${inspector}: ${g}`));
    }
    run.completed=run.gaps.length===0;
    if(run.inspectors.pixels){run.changed=run.inspectors.pixels.findings.length>0;if(run.changed&&!report.changedStates.includes(run.state))report.changedStates.push(run.state);else if(!run.changed)run.findings=run.findings.filter(f=>f.layer==='tokens');}
    run.status=statusFor(run.findings,run.gaps);
    occurrences+=run.findings.length;
    run.findingIds=[];
    for(const f of run.findings){
      const key=JSON.stringify([f.layer,f.inspector,f.kind,f.element,f.other,f.property,f.measured,f.expected]);
      if(!canonical.has(key)){const item={...f,id:report.findings.length+1,states:[],contexts:[]};canonical.set(key,item);report.findings.push(item);}
      const item=canonical.get(key);if(!item.states.includes(run.state))item.states.push(run.state);
      item.contexts.push({state:run.state,font:run.font,dataMode:run.dataMode,viewport:run.viewport,scale:run.scale});run.findingIds.push(item.id);
    }
    delete run.findings;
    // Keep cached/shared inspector values immutable when compacting a run.
    run.inspectors=Object.fromEntries(Object.entries(run.inspectors).map(([name,value])=>{const {findings,...rest}=value;return [name,{...rest,findingCount:findings?.length || 0}];}));
    report.runs.push(run);appendFileSync(join(options.out,'runs.jsonl'),JSON.stringify({...run,findings:run.findingIds.map(id=>report.findings.find(f=>f.id===id))})+'\n');
  };
  const captureBaseline=async(page,row,run)=>{
    const t=performance.now();
    if(options['accept-baseline']){
      const file=`component-${accepted.length+1}.png`,bytes=await page.locator(row.scope).screenshot({animations:'allow',caret:'initial'});
      writeFileSync(join(options.baseline,file),bytes);
      accepted.push({state:run.state,dataMode:run.dataMode,component:row.component || run.state,selector:row.scope,viewport:run.viewport,scale:run.scale,file});
    }else if(baseline)run.inspectors.pixels=await inspectBaseline(page,{...options,candidateInk:true},run,baseline);
    report.layers.baseline.elapsedMs+=performance.now()-t;
  };
  const checkpoint=async(page,row,run)=>{
    if(tiles.length>=60)throw new Error('Contact sheet exceeds 60 states; narrow --states');
    await page.evaluate(stateScope,{name:row.name,scope:row.scope,root:options.root});
    const findings=Object.values(run.inspectors).flatMap(r=>r.findings || []).map(f=>{const copy={...f};delete copy.rect;return copy;});
    try{
      const legend=await page.evaluate(annotateFindings,{root:row.scope,findings:numberedFindings(findings).slice(0,12)});
      tiles.push({label:`${run.font}/${row.name}\n${legend.join('\n')}`,bytes:await captureRegion(page,row.scope,{animations:'allow',caret:'initial'})});
    }finally{await page.evaluate(()=>document.querySelector('#__jig_annotations')?.remove());}
  };
  try {
    if(options['accept-baseline']){
      if(existsSync(options.baseline))throw new Error('Baseline store already exists; choose a new accepted version');
      mkdirSync(options.baseline,{recursive:true});
    }else if(options.baseline)baseline=readBaseline(options.baseline);
    flush();progress(`tokens ${tokenReport.elapsedMs.toFixed(1)} ms; ${tokenReport.findings.length} findings`);
    browser=await launch();report.browser=browser.version();
    if(baseline&&(baseline.browser!==report.browser||baseline.platform!==process.platform))report.gaps.push('Baseline browser/platform differs; validate fonts and rendering before comparing');
    for(const viewport of options.sizes)for(const scale of options.scales){
      const firstMatrix=viewport===options.sizes[0]&&scale===options.scales[0],matrixStart=firstMatrix?start:performance.now();
      let discovery;
      try {
        discovery=await browser.newContext({viewport,deviceScaleFactor:scale});const page=await discovery.newPage();
        page.setDefaultTimeout(options['timeout-ms']);await page.goto(options.url,{waitUntil:'load'});
        const {names,modes,available,metadata}=await withTimeout(()=>page.evaluate(contractExpression()),1000);
        const fonts=options.fonts==='all'?available:available.slice(0,1);
        const files=changedFiles(options,tokenReport.directory || process.cwd());
        const plan=planStates(names,metadata,tokenReport.table,options,files,tokenReport.directory || process.cwd(),modes);
        report.gaps.push(...plan.gaps);
        // Change-aware runs are intentionally partial evidence; gate never
        // treats the reduced inventory as a full acceptance matrix.
        report.coverage.expected+=plan.all.reduce((n,s)=>n+s.dataModes.length,0)*fonts.length;
        report.coverage.declarations.push({viewport,scale,states:names,dataModes:modes,fonts,stateModes:Object.fromEntries(plan.all.map(s=>[s.name,s.dataModes]))});
        await discovery.close();discovery=undefined;
        const snapshots=new Map();
        const pass=async(font,index)=>{
          const fontStart=index===0?matrixStart:performance.now(),limit=index===0?budgets.gateBudgetMs:budgets.fontPassBudgetMs,fontChecksOnly=index>0;
          const elapsed=()=>performance.now()-fontStart+(index===0&&firstMatrix?tokenReport.elapsedMs:0);
          let context,page;
          const fontRuns=[];
          progress(`font ${font}: starting ${fontChecksOnly?'overflow, clip, state typography':'full rules'}`);
          try {
            const loadStart=performance.now();
            context=await browser.newContext({viewport,deviceScaleFactor:scale});page=await context.newPage();
            page.setDefaultTimeout(options['timeout-ms']);
            const errors=new WeakMap();
            const attach=page=>{const gaps=[];errors.set(page,gaps);
              page.on('pageerror',e=>gaps.push(`Page error: ${e.message}`));
              page.on('requestfailed',r=>gaps.push(`Request failed: ${r.url()}`));
              page.on('response',r=>{if(r.status()>=400)gaps.push(`HTTP ${r.status()}: ${r.url()}`);});return gaps;};
            const pageGaps=attach(page);
            await page.goto(options.url,{waitUntil:'load'});
            report.layers.setup.elapsedMs+=performance.now()-loadStart;
            const freeze=async scopes=>{const tag=await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}'});await tag.evaluate(e=>{e.id='__jig_freeze';});await page.evaluate(freezeScopeAnimations,scopes);return tag;};
            const scoped={...options,candidateInk:true,inspectors:fontChecksOnly?['clip','alignment','crisp']:options.inspectors.filter(i=>!['visibility','style','motion'].includes(i))};
            for(const mode of modes){
              let history=[];
              const rows=plan.states.filter(s=>s.dataModes.includes(mode)),statics=rows.filter(s=>s.static),interactive=rows.filter(s=>!s.static);
              if(!rows.length)continue;
              const modeStart=performance.now();
              await page.evaluate(invokeDataMode,{name:mode,timeout:options['timeout-ms']});
              await page.evaluate(invokeFont,{id:font,timeout:options['timeout-ms']});
              await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
              let frozen=statics.length?await freeze(statics.map(s=>s.scope)):undefined;
              if(statics.length&&!await settledScopes(page,statics.map(s=>s.scope),options))throw new Error('Static scopes did not settle before timeout');
              report.layers.setup.elapsedMs+=performance.now()-modeStart;
              if(statics.length){
                const t=performance.now(),groups=await withTimeout(()=>measure(page,statics,scoped,{fontChecksOnly,scale}),options['timeout-ms']);
                report.layers.geometry.elapsedMs+=performance.now()-t;
                history=[...new Map(groups.flatMap(g=>g.runs).flatMap(s=>s.inspectors.crisp?.measurements || []).map(m=>[m.element,m])).values()];
                for(const group of groups){
                  let visibility;
                  if(!fontChecksOnly&&options.inspectors.includes('visibility')){
                    const t=performance.now(),findings=group.runs.flatMap(s=>Object.values(s.inspectors).flatMap(r=>r.findings || []));
                    visibility=await ink(page,group.scope,{findings,scale,cache});report.layers.ink.elapsedMs+=performance.now()-t;
                  }
                  for(const s of group.runs){
                    const row=statics.find(r=>r.name===s.name),run={state:s.name,scope:s.scope,font,fontChecksOnly,viewport,scale,dataMode:mode,static:true,inspectors:s.inspectors,gaps:[],elapsedMs:group.elapsedMs/group.runs.length,groupElapsedMs:group.elapsedMs,layout:s.layout};
                    if(visibility)run.inspectors.visibility=s.name===group.runs[0].name?visibility:{findings:[],gaps:[],sharedScope:group.scope};
                    if(visibility&&options.inspectors.includes('alignment')&&s.name===group.runs[0].name)run.inspectors.optical={...analyseOptical(visibility.measurements || []),notes:['Optical ink limited to nominated visibility/clipping candidates']};
                    if(!fontChecksOnly&&(baseline||options['accept-baseline']))await captureBaseline(page,row,run);
                    if(!fontChecksOnly&&options.png)await checkpoint(page,row,run);
                    addRun(run);fontRuns.push(run);progress(`font ${font}: ${s.name} static`);
                  }
                  flush();
                }
              }
              if(frozen)await frozen.evaluate(e=>e.remove());frozen=undefined;
              const runState=async(row,page)=>{
                const t=performance.now(),run={state:row.name,scope:row.scope,font,fontChecksOnly,viewport,scale,dataMode:mode,static:false,inspectors:{},gaps:[]};
                const pageGaps=errors.get(page);let didSetup=false,frozen;
                try {
                  // Navigation restores JS closures, timers, overlays, values,
                  // focus and scroll, including state outside the declared scope.
                  await page.goto(options.url,{waitUntil:'load'});
                  await page.mouse.move(-1,-1);
                  const snapshotKey=JSON.stringify([mode,row.name]);
                  const activate=async()=>{didSetup=true;await page.evaluate(invokeState,{name:row.name,action:'setup',timeout:options['timeout-ms']});
                    await page.evaluate(invokeDataMode,{name:mode,timeout:options['timeout-ms']});await page.evaluate(invokeFont,{id:font,timeout:options['timeout-ms']});};
                  let motionResult;
                  if(fontChecksOnly){
                    const snapshot=snapshots.get(snapshotKey);if(!snapshot)throw new Error(`Default-font state snapshot missing: ${row.name}/${mode}`);
                    await page.evaluate(restoreStateSnapshot,{selector:row.scope,snapshot});
                    await page.evaluate(invokeFont,{id:font,timeout:options['timeout-ms']});
                    if(snapshot.hover)await page.locator(snapshot.hover).hover();
                    run.replayed=true;
                  }else if(options.inspectors.includes('motion')||row.name.startsWith('motion-')){const recorded=await motion(page,{...options,root:row.scope},activate);motionResult={...analyseMotion(recorded.frames,options),frames:recorded.frames};motionResult.gaps.push(...recorded.gaps);}else await activate();
                  if(!fontChecksOnly)await page.evaluate(stateScope,{name:row.name,scope:row.scope,root:options.root});
                  frozen=await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}'});
                  await page.evaluate(freezeScopeAnimations,[row.scope]);
                  if(fontChecksOnly)await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
                  else if(!await settled(page,{...options,root:row.scope}))throw new Error('Page did not settle before timeout');
                  report.layers.setup.elapsedMs+=performance.now()-t;
                  const geom=performance.now();run.inspectors=await withTimeout(()=>inspect(page,{...scoped,root:row.scope,consistencyRoot:row.scope},run),options['timeout-ms']);
                  if(motionResult)run.inspectors.motion=motionResult;
                  if(!fontChecksOnly)run.inspectors.componentMarker=await page.evaluate(componentMarker,{selector:row.scope,component:row.component});
                  report.layers.geometry.elapsedMs+=performance.now()-geom;
                  if(run.inspectors.crisp){const c=analyseConsistency(run.inspectors.crisp.measurements,history,run.inspectors.crisp.exceptions);history=c.history;delete c.history;if(fontChecksOnly)c.findings=c.findings.filter(f=>f.kind==='state-typography');run.inspectors.consistency=c;}
                  if(!fontChecksOnly&&options.inspectors.includes('visibility')){const t=performance.now();run.inspectors.visibility=await ink(page,row.scope,{findings:Object.values(run.inspectors).flatMap(r=>r.findings || []),scale,cache});report.layers.ink.elapsedMs+=performance.now()-t;if(options.inspectors.includes('alignment'))run.inspectors.optical={...analyseOptical(run.inspectors.visibility.measurements || []),notes:['Optical ink limited to nominated visibility/clipping candidates']};}
                  if(!fontChecksOnly&&(baseline||options['accept-baseline']))await captureBaseline(page,row,run);
                  if(!fontChecksOnly){const snapshotStart=performance.now();snapshots.set(snapshotKey,await page.evaluate(captureStateSnapshot,row.scope));report.layers.setup.elapsedMs+=performance.now()-snapshotStart;}
                  if(options.png&&!fontChecksOnly)await checkpoint(page,row,run);
                }catch(e){run.gaps.push(e.message);}
                finally{
                  if(frozen)try{await frozen.evaluate(e=>e.remove());}catch(e){run.gaps.push(e.message);}frozen=undefined;
                  if(didSetup){const resetStart=performance.now();try{await page.evaluate(invokeState,{name:row.name,action:'reset',timeout:options['timeout-ms']});}catch(e){run.gaps.push(`Reset failed: ${e.message}`);}report.layers.setup.elapsedMs+=performance.now()-resetStart;}
                  run.gaps.push(...pageGaps.splice(0));run.elapsedMs=performance.now()-t;addRun(run);fontRuns.push(run);progress(`font ${font}: ${row.name} ${run.elapsedMs.toFixed(0)} ms`);
                  flush();
                }
                if(run.gaps.some(g=>/Reset failed|timed out|closed/i.test(g))){aborted=true;throw new Error('State cleanup/inspection interrupted; remaining states not measured');}
                const failure=run.gaps.join('\n');
                identicalFailures=failure&&failure===previousFailure?identicalFailures+1:failure?1:0;previousFailure=failure;
                if(identicalFailures>=5){aborted=true;throw new Error(`Stopped after 5 identical state failures: ${failure}`);}
              };
              // Two default-font pages overlap application hook waits. Each
              // state still starts from a navigation and performs real reset.
              // Motion and extra-font passes retain one worker per font.
              const pending=[...interactive];
              const workers=async pages=>{while(pending.length&&!aborted){
                const batch=pending.splice(0,Math.min(pages.length,5-identicalFailures));
                const results=await Promise.allSettled(batch.map((row,i)=>runState(row,pages[i])));
                const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
              }};
              if(!fontChecksOnly&&!options.inspectors.includes('motion')&&interactive.length>1){
                const second=await context.newPage();second.setDefaultTimeout(options['timeout-ms']);
                attach(second);
                try{await workers([page,second]);}finally{await second.close();}
              }else await workers([page]);
            }
            report.gaps.push(...pageGaps);
          }catch(e){report.gaps.push(`${font}: ${e.message}`);}
          finally{
            if(context)try{await context.close();}catch(e){report.gaps.push(`${font}: close: ${e.message}`);}
            const elapsedMs=elapsed(),overBudget=elapsedMs>limit;
            report.fontPasses.push({font,viewport,scale,elapsedMs,budgetMs:limit,overBudget,slowestStates:fontRuns.toSorted((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,5).map(r=>({state:r.state,elapsedMs:r.elapsedMs}))});
            report.overBudget ||= overBudget;progress(`font ${font}: ${elapsedMs.toFixed(0)} ms / ${limit} ms${overBudget?' OVER BUDGET':''}`);flush();
          }
        };
        // One browser. Default craft pass first; additional fonts use isolated
        // pages concurrently so setup, font state and consistency cannot race.
        await pass(fonts[0],0);if(!aborted)await Promise.all(fonts.slice(1).map((font,i)=>pass(font,i+1)));
      }catch(e){report.gaps.push(e.message);}finally{if(discovery)await discovery.close();}
    }
    if(options.png&&tiles.length)report.sheet=await saveContactSheet(browser,options,tiles);
    if(options['accept-baseline']&&accepted.length&&!report.gaps.length&&!report.findings.length&&report.runs.length===report.coverage.expected&&report.runs.every(r=>r.gaps.length===0)&&!report.overBudget)writeFileSync(join(options.baseline,'manifest.json'),JSON.stringify({version:1,approvedBy:options['approved-by'],approvedAt:options['approved-at'],browser:report.browser,platform:process.platform,entries:accepted},null,2)+'\n');
  }catch(e){report.gaps.push(e.message);}finally{if(browser)await browser.close();}
  coverageStatus(report);
  const groups=groupFindings(report.findings);report.groups=groups.slice(0,options.budget);report.sources=sourceCounts(report.findings);
  report.counts={findings:report.findings.length,groups:groups.length,reportedGroups:report.groups.length,occurrences};
  report.elapsedMs=performance.now()-start+tokenReport.elapsedMs;
  report.budgetFailures=report.fontPasses.filter(p=>p.overBudget).map(p=>`${p.font}: ${p.elapsedMs.toFixed(0)} ms > ${p.budgetMs} ms`);
  if(tokenReport.elapsedMs>budgets.tokenBudgetMs)report.budgetFailures.push(`tokens: ${tokenReport.elapsedMs.toFixed(1)} ms > ${budgets.tokenBudgetMs} ms`);
  if(report.fontPasses.length===1&&report.elapsedMs>budgets.gateBudgetMs){report.overBudget=true;report.budgetFailures.push(`default gate including browser close: ${report.elapsedMs.toFixed(0)} ms > ${budgets.gateBudgetMs} ms`);}
  if(options.fonts==='all'&&report.elapsedMs>(budgets.allFontsBudgetMs??40000)){report.overBudget=true;report.budgetFailures.push(`all fonts including browser close: ${report.elapsedMs.toFixed(0)} ms > ${budgets.allFontsBudgetMs??40000} ms`);}
  report.overBudget ||= tokenReport.elapsedMs>budgets.tokenBudgetMs;
  report.status=report.overBudget?'findings':statusFor(report.findings,[...report.gaps,...report.runs.flatMap(r=>r.gaps)]);
  report.budget={limit:options.budget,stopped:false};flush();return report;
}
