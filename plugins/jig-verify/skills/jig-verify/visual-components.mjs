import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { mkdirSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { argumentsFor, inspectClip, inspectLayout, launchChrome, openPage, saveContactSheet, statusFor } from './visual-clip.mjs';
import { inspectVisibility } from './visual-visibility.mjs';
import { inspectSpacing } from './visual-spacing.mjs';
import { analyseMotion, recordMotion } from './visual-motion.mjs';
import { decodePNG, diffPixels, encodePNG } from './visual-pixels.mjs';

async function componentPixels(page,state,stem,out,png=false) {
 await page.mouse.move(0,0);
 const components=await page.locator(state.root).evaluate(root=>{
  const els=[...(root.matches('[data-component]')?[root]:[]),...root.querySelectorAll('[data-component]')];
  return els.filter(el=>el.checkVisibility({visibilityProperty:true,opacityProperty:true})&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).map((el,i)=>{el.dataset.pixelTarget=String(i);const b=el.getBoundingClientRect();return {i,type:el.dataset.component,state:el.dataset.state||'live',width:b.width,height:b.height};});
 });
 const results=[];
 await page.mouse.move(0,0);
 for(const component of components) {
  const result={...component};results.push(result);
  if(component.height>page.viewportSize().height-80||component.width>page.viewportSize().width){result.gap='Container exceeds the viewport; review its viewport capture and child component crops.';continue;}
  const target=page.locator(`${state.root}[data-pixel-target="${component.i}"],${state.root} [data-pixel-target="${component.i}"]`);
  const name=`${stem}-${encodeURIComponent(component.type)}-${encodeURIComponent(component.state)}-${component.i}`;

  try {
   await target.scrollIntoViewIfNeeded({timeout:5000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const clip=await target.boundingBox();
   let first=await page.screenshot({clip,animations:'disabled',caret:'hide',timeout:5000}),repeat,diff;
   result.repeatAttempts=[];
   for(let attempt=0;attempt<3;attempt++) {
    repeat=await page.screenshot({clip,animations:'disabled',caret:'hide',timeout:5000});
    const {pixels,...summary}=diffPixels(decodePNG(first),decodePNG(repeat));diff=summary;result.repeatAttempts.push(summary);
    if(!diff.changedPixels)break;if(attempt<2)first=repeat;
   }
   Object.defineProperty(result,'image',{value:first});
   if(png&&diff.changedPixels){result.screenshot=join(out,name+'.png');writeFileSync(result.screenshot,first);}
   result.repeat=diff;
   if(png&&diff.changedPixels)writeFileSync(join(out,name+'-repeat-diff.png'),encodePNG(diffPixels(decodePNG(first),decodePNG(repeat))));
  }catch(error){result.gap=error.message;}
 }
 return results;
}

async function motionFrames(page,root,trigger,stem,out,png=false) {
 await trigger();
 // A two-beat disclosure may create its fade after the first beat.
 let animations=0;
 for(let attempt=0;attempt<60;attempt++) {
  animations=await page.locator(root).first().evaluate(el=>{const list=el.getAnimations({subtree:true}).filter(a=>a.playState==='running');if(list.length){window.__jigFrameAnimations=list;for(const a of list)a.pause();}return list.length;});
  if(animations)break;await page.waitForTimeout(10);
 }
 if(!animations)return {animations:0,frames:[],gap:'No running animation on this target; frequency gate or responsive absence requires review.'};
 const frames=[];
 for(const fraction of [0,.25,.5,.75,1]) {
  const properties=await page.evaluate(fraction=>{for(const a of window.__jigFrameAnimations){const t=a.effect.getTiming();a.currentTime=Number(t.delay)+Number(t.duration)*fraction;}return window.__jigFrameAnimations.map(a=>{const target=a.effect.target,s=getComputedStyle(target);return {target:target.id||target.dataset.component||target.className,opacity:s.opacity,transform:s.transform,timing:a.effect.getTiming()};});},fraction);
  const file=join(out,`${stem}-frame-${fraction*100}.png`);
  if(png)await page.screenshot({path:file,caret:'hide',animations:'allow'});frames.push({fraction,properties,...(png?{screenshot:file}:{})});
 }
 await page.evaluate(()=>{for(const a of window.__jigFrameAnimations)a.finish();delete window.__jigFrameAnimations;});
 return {animations,frames};
}

function crossScaleDiff(first,second) {
 const expectedWidth=first.width*2,expectedHeight=first.height*2;
 if(Math.abs(expectedWidth-second.width)>1||Math.abs(expectedHeight-second.height)>1)return diffPixels(first,second,{scale:2});
 const pixels=Buffer.alloc(expectedWidth*expectedHeight*4);
 for(let y=0;y<expectedHeight;y++)for(let x=0;x<expectedWidth;x++){
  const source=(Math.min(y,second.height-1)*second.width+Math.min(x,second.width-1))*4;
  second.pixels.copy(pixels,(y*expectedWidth+x)*4,source,source+4);
 }
 const diff=diffPixels(first,{width:expectedWidth,height:expectedHeight,pixels},{scale:2});
 diff.cropRounding={width:second.width-expectedWidth,height:second.height-expectedHeight};
 return diff;
}

// Run the same measurements as the standalone tools, with every overlay really
// opened in turn. One Chrome and one page at a time. No finding is dropped.
// Usage: normal visual-clip arguments, plus --themes, --densities, --modes,
// --scales, --motion yes|no, --pixels yes|no, --limit STATE (optional).
export async function runComponents(options, extra = {}, { launch = launchChrome } = {}) {
 if(extra.limit&&!options.states)options={...options,states:[extra.limit]};
 const report = {tool:'visual-components',version:1,node:process.version,runs:[],gaps:[],dispositions:[]};
 let browser;
 const pixelBaselines=new Map();
 const tiles=[];
 const out=options.out;mkdirSync(out,{recursive:true});
 const save=()=>writeFileSync(join(out,'components.json'),JSON.stringify(report,null,2)+'\n');
 try {
  const memory=freemem()/2**30;report.freeMemoryGB=memory;
  if(!options.setup)throw new Error('--setup must export default setup(page) and async generator states(page)');
  const setup=await import(pathToFileURL(resolve(options.setup)).href);
  if(typeof setup.states!=='function')throw new Error('--setup has no states export');
  browser=await launch();report.browser=browser.version();
  for(const viewport of options.sizes)for(const theme of (extra.themes||'white-board').split(','))for(const density of (extra.densities||'compact').split(','))for(const mode of (extra.modes||'Demo').split(','))for(const scale of (extra.scales||'1').split(',').map(Number)) {
   const zoom=Number(extra.zoom||1),cssViewport={width:Math.round(viewport.width/zoom),height:Math.round(viewport.height/zoom)};
   const run={viewport,cssViewport,zoom,theme,density,mode,scale,states:[],findings:[],gaps:[]};report.runs.push(run);
   let page;
   try {
    const url=new URL(options.url);for(const [k,v]of Object.entries({theme,density,mode}))url.searchParams.set(k,v);
    const context=await browser.newContext({viewport:cssViewport,deviceScaleFactor:scale*zoom,reducedMotion:extra.reduced==='yes'?'reduce':'no-preference'});
    try {
     const opened=await openPage(context,{...options,url:url.href},cssViewport);page=opened.page;run.gaps.push(...opened.gaps);
     if(opened.gaps.length)throw new Error('Setup incomplete; no states measured');
     const pending=new Set(options.states||[]),motionTypes=new Set();
     for await(const state of setup.states(page,{states:options.states})) {
      if(extra.limit&&state.name!==extra.limit||options.states&&!options.states.includes(state.name))continue;
      pending.delete(state.name);
      if(options.states&&extra.motion==='yes') {
       const types=await page.locator(state.root).evaluate(root=>[root,...root.querySelectorAll('[data-component]')].map(el=>el.dataset.component).filter(Boolean));
       for(const type of types)motionTypes.add(type);
      }
      await page.waitForTimeout(240);
      const measured={name:state.name,root:state.root,clip:null,spacing:null,motion:null};run.states.push(measured);
      measured.clip=await page.evaluate(inspectClip,state.root);
      measured.spacing=await page.evaluate(inspectSpacing,state.root);
      measured.layout=await page.evaluate(inspectLayout,state.root);
      if(setup.geometry)measured.geometry=await page.evaluate(setup.geometry,state.root);
      const stem=[viewport.width,viewport.height,theme,density,mode.replaceAll(' ','-'),scale,state.name].map(encodeURIComponent).join('-');
      if(options.png&&['clip','spacing','geometry'].some(tool=>measured[tool]&&(measured[tool].findings.length||measured[tool].gaps.length))) {
       measured.screenshot=join(out,stem+'.png');
       // A viewport image records the app context; component crops keep real scale.
       await page.screenshot({path:measured.screenshot,caret:'hide'});
      }
      if(options.sheet) {
       if(tiles.length>=60)throw new Error('Contact sheet exceeds 60 states; narrow --states to this batch');
       tiles.push({label:stem,bytes:await page.locator(state.root).first().screenshot({caret:'hide',animations:'disabled'})});
      }
      if(extra.pixels==='yes') {
       measured.pixels=await componentPixels(page,state,stem,out,options.png);
       for(const component of measured.pixels) {
        if(component.repeat?.changedPixels)run.findings.push({state:state.name,tool:'pixels',kind:'unstable-repeat',type:component.type,pixels:component.repeat.changedPixels});
        if(component.gap)run.gaps.push(`${state.name}/pixels/${component.type}: ${component.gap}`);
        const key=[viewport.width,viewport.height,theme,density,mode,state.name,component.type,component.state,component.i].join('/');
        if(scale===1&&component.image&&!component.gap)pixelBaselines.set(key,{image:component.image,width:component.width,height:component.height});
        if(scale===2&&pixelBaselines.has(key)&&component.image&&!component.gap) {
         const baseline=pixelBaselines.get(key);
         if(Math.abs(baseline.width-component.width)>.02||Math.abs(baseline.height-component.height)>.02)run.findings.push({state:state.name,tool:'pixels',kind:'scale-geometry',type:component.type,before:[baseline.width,baseline.height],after:[component.width,component.height]});
         try {const diff=crossScaleDiff(decodePNG(baseline.image),decodePNG(component.image));const {pixels,...summary}=diff;component.crossScale=summary;if(options.png&&summary.changedPixels){component.crossScale.diff=join(out,stem+'-'+component.i+'-scale-diff.png');writeFileSync(component.crossScale.diff,encodePNG(diff));}}
         catch(error){component.crossScale={gap:error.message};run.gaps.push(`${state.name}/pixels/${component.type}: ${error.message}`);}
        }
       }
      }
      if(extra.visibility==='yes')measured.visibility=await inspectVisibility(page,state.root,{out,prefix:stem,png:false});
      for(const tool of ['clip','spacing','motion','geometry','visibility'])if(measured[tool]) {
       run.findings.push(...measured[tool].findings.map(f=>({state:state.name,tool,...f})));
       run.gaps.push(...measured[tool].gaps.map(g=>`${state.name}/${tool}: ${g}`));
      }
      save();
      if(options.states&&!pending.size)break;
     }
     if(pending.size)run.gaps.push('Unknown states: '+[...pending].join(', '));
     if(!run.states.length)run.gaps.push('No states measured');
     if(extra.motion==='yes') {
      run.motion=[];
      const types=await page.evaluate(()=>[...new Set([...document.querySelectorAll('[data-component]')].map(el=>el.dataset.component))].filter(type=>!['window','reference-settings','panes','editor','data-grid-container','sample-playback','replay-controls'].includes(type)));
      for(const type of types) {
       if(options.states&&!motionTypes.has(type))continue;
       const roots={'split-button':'#new-menu','combobox':'#owner-options','tooltip':'#export-tip-sample','menu-item':'#live-menu','dialog':'#details-dialog','toast':'#live-toast','tab':'#tabs [role=tablist]','editor-tabs':'.app-editor-tabs','accordion':'#properties-body','tree-view':'#tree-files'};
       const selector=roots[type]||`[data-component="${type}"]`;
       const stem=[viewport.width,viewport.height,theme,density,mode.replaceAll(' ','-'),scale,'motion',type].map(encodeURIComponent).join('-');
       const result={type,root:selector};run.motion.push(result);
       try {
       const trigger=()=>page.evaluate(type=>GoldenApp.replayComponent(type),type);
       await page.evaluate(()=>{GoldenApp.closeOverlay(false);document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#live-menu').hidden=true;});
       const motionOptions={...options,root:selector,duration:options.duration,threshold:options.threshold||2};
       let recording;result.attempts=[];
       for(let attempt=0;attempt<3;attempt++){
        const recordingPromise=recordMotion(page,motionOptions);await page.waitForTimeout(60);await trigger();recording=await recordingPromise;
        result.analysis=analyseMotion(recording.frames,motionOptions);result.analysis.gaps.push(...recording.gaps);result.attempts.push(result.analysis);
        writeFileSync(join(out,stem+'-attempt-'+attempt+'.json'),JSON.stringify(recording)+'\n');
        if(!result.analysis.gaps.length)break;
       }
       run.findings.push(...result.analysis.findings.map(f=>({state:type,tool:'motion',...f})));
       run.gaps.push(...result.analysis.gaps.map(g=>`${type}/motion: ${g}`));
       writeFileSync(join(out,stem+'.json'),JSON.stringify(recording)+'\n');
       result.frames=await motionFrames(page,selector,trigger,stem,out,options.png&&Boolean(result.analysis.findings.length||result.analysis.gaps.length));
       if(result.frames.gap)run.gaps.push(`${type}/frames: ${result.frames.gap}`);
       } catch(error){result.gap=error.stack;run.gaps.push(`${type}/motion: ${error.message}`);}
       save();
      }
     }
    } finally {await context.close();}
   } catch(error){run.gaps.push(error.stack||error.message);}
   run.rawStatus=statusFor(run.findings,run.gaps);
   run.explainedGaps=[];
   run.unexplainedGaps=run.gaps;
   run.status=statusFor(run.findings,run.unexplainedGaps);save();
   console.error(`${viewport.width} ${theme} ${density} ${mode} @${scale}: ${run.states.length} states; ${run.findings.length} findings; ${run.gaps.length} gaps`);
  }
  if(options.sheet)report.sheet=await saveContactSheet(browser,options,tiles);
 } catch(error){report.gaps.push(error.message);}
 finally {if(browser)await browser.close();}
 report.rawStatus=statusFor(report.runs.flatMap(r=>r.findings),[...report.gaps,...report.runs.flatMap(r=>r.gaps)]);
 report.status=statusFor(report.runs.flatMap(r=>r.findings),[...report.gaps,...report.runs.flatMap(r=>r.unexplainedGaps||r.gaps)]);save();return report;
}

export function componentArguments(args) {
  const base=[],extra={};
  for(let i=0;i<args.length;i++) {
   if(args[i]==='--png'||args[i]==='--sheet'){base.push(args[i]);continue;}
   const name=args[i].slice(2);
   if(['themes','densities','modes','scales','motion','pixels','limit','reduced','zoom','visibility'].includes(name)){
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing '+name);extra[name]=args[++i];
   }else {base.push(args[i]);if(args[i+1]&&!args[i+1].startsWith('--'))base.push(args[++i]);}
  }
  for(const key of ['motion','pixels','reduced','visibility'])if(extra[key]&&!['yes','no'].includes(extra[key]))throw new Error(key+' must be yes or no');
  if(extra.zoom!==undefined&&(!Number.isFinite(Number(extra.zoom))||Number(extra.zoom)<=0))throw new Error('zoom must be positive');
  if(extra.scales&&extra.scales.split(',').some(s=>!['1','2'].includes(s)))throw new Error('scales must be 1 or 2');
  return {options:argumentsFor(base,true),extra};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
 try {
  const {options,extra}=componentArguments(process.argv.slice(2));
  const report=await runComponents(options,extra);
  console.log(JSON.stringify({status:report.status,runs:report.runs.length,findings:report.runs.reduce((n,r)=>n+r.findings.length,0),gaps:report.gaps.length+report.runs.reduce((n,r)=>n+r.gaps.length,0),report:join(resolve(options.out),'components.json')}));
  process.exitCode=report.status==='passed'?0:report.status==='findings'?1:2;
 } catch(error){console.log(JSON.stringify({status:'inconclusive',gaps:[error.message]}));process.exitCode=2;}
}
