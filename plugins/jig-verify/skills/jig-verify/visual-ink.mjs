if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/visual-ink.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { createHash } from 'node:crypto';
import { decodePNG } from './visual-pixels.mjs';
import { cropRaster, measureInk, inkBounds } from './visual-visibility.mjs';

// Geometry and computed paint nominate candidates; no broad pixel pass. A
// single crop is compared with a known flat ground. Complex paint stays a gap.
export function inkCandidates({selector, findings = []}) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const nominated = new Set(findings.filter(f=>['text-clipped','control-label','near-invisible','text-contrast','text-opacity','unintended-truncation'].includes(f.kind)).map(f=>f.element));
  const path=e=>e.id?`#${CSS.escape(e.id)}`:e.parentElement?`${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e)+1})`:e.localName;
  let colorContext;
  const rgba=value=>{
    if(value==='transparent')return [0,0,0,0];
    const m=value?.match(/^rgba?\(([^)]+)\)$/);
    if(m){const c=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);return c.length===3?[...c,1]:c;}
    // Computed color-mix paints retain color(srgb ...), lab() or oklab().
    // Let the browser convert these exactly as it paints the control fill.
    if(!/^(?:color|oklab|oklch|lab|lch)\(/.test(value || ''))return null;
    colorContext ??= document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    colorContext.clearRect(0,0,1,1);colorContext.fillStyle=value;colorContext.fillRect(0,0,1,1);
    const c=[...colorContext.getImageData(0,0,1,1).data];c[3]/=255;return c;
  };
  const targets=[],gaps=[],scrolledOut=[];
  for(const e of [root,...root.querySelectorAll('*')]) {
    const s=getComputedStyle(e),box=e.getBoundingClientRect(),element=path(e);
    if(!box.width||!box.height||s.visibility!=='visible'||s.display==='none'||e.closest('[hidden]'))continue;
    const graphic=e.matches('svg,img,canvas')||s.backgroundImage!=='none';
    if(e.closest('svg')&&!e.matches('svg'))continue;
    const direct=[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    if(!graphic&&!direct.length)continue;
    const top=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,box.x+box.width/2)),Math.max(0,Math.min(innerHeight-1,box.y+box.height/2)));
    const inViewport=box.x>=0&&box.y>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;
    const occluded=inViewport&&top&&!e.contains(top)&&!top.contains(e);
    let scrollport;
    for(let a=e.parentElement;a;a=a.parentElement){
      const cs=getComputedStyle(a),b=a.getBoundingClientRect();
      if(/^(auto|scroll)$/.test(cs.overflowY)||/^(auto|scroll)$/.test(cs.overflowX)){
        scrollport??=a;
        if(/^(auto|scroll)$/.test(cs.overflowY)&&(box.top<b.top+a.clientTop-1||box.bottom>b.top+a.clientTop+a.clientHeight+1)||
           /^(auto|scroll)$/.test(cs.overflowX)&&(box.left<b.left+a.clientLeft-1||box.right>b.left+a.clientLeft+a.clientWidth+1)){
          scrolledOut.push(element);break;
        }
      }
    }
    if(scrolledOut.at(-1)===element)continue;
    // A sticky table header consumes the top of its own scrollport. Rows
    // underneath are reachable by scrolling, unlike unrelated overlay paint.
    const header=occluded&&top.closest('th,[role=columnheader],thead');
    if(header&&e.closest('tr,[role=row]')&&e.closest('table,[role=table],[role=grid]')===header.closest('table,[role=table],[role=grid]')&&!header.contains(e)&&scrollport?.contains(header)){
      let sticky=false;for(let a=top;a&&a!==scrollport;a=a.parentElement)sticky ||= getComputedStyle(a).position==='sticky';
      if(sticky&&scrollport.scrollTop>0){scrolledOut.push(element);continue;}
    }
    const opacity=Number(s.opacity),ink=rgba(s.color),fill=rgba(s.backgroundColor);
    const suspicious=opacity<1 || ink?.[3]<1 || graphic && (s.fill==='none'&&s.stroke==='none' || s.fill==='transparent' || s.stroke==='transparent');
    if(!nominated.has(element)&&!occluded&&!suspicious&&!graphic&&!e.hasAttribute('data-ink-check'))continue;
    let background=[0,0,0,0],complex=false;
    // Background images are graphic ink; CSS box fill is still its ground.
    // Include that fill before walking into the filled control behind an icon.
    for(let a=e;a;a=a.parentElement){const cs=getComputedStyle(a),c=rgba(cs.backgroundColor);if((cs.backgroundImage!=='none'&&!(graphic&&a===e))||cs.filter!=='none'||cs.mixBlendMode!=='normal'||!c){complex=true;break;}const alpha=background[3]+c[3]*(1-background[3]);background=alpha?[...background.slice(0,3).map((v,i)=>(v*background[3]+c[i]*c[3]*(1-background[3]))/alpha),alpha]:background;if(alpha===1)break;}
    if(complex){gaps.push(`${element}: candidate ink has complex ground; rendered review required`);continue;}
    const ground=background.slice(0,3).map(v=>Math.round(v*background[3]+255*(1-background[3])));
    if(graphic&&!nominated.has(element)&&!occluded&&!suspicious&&!e.hasAttribute('data-ink-check')){
      const light=c=>c.reduce((sum,v,i)=>{const n=v/255;return sum+(n<=.04045?n/12.92:((n+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0),bg=light(ground);
      const paints=e.matches('svg')?[e,...e.querySelectorAll('*')].flatMap(el=>{const cs=getComputedStyle(el);return [cs.fill,cs.stroke].filter(c=>c!=='none').map(rgba).filter(Boolean);}):[];
      const low=paints.length && paints.every(c=>{const color=c.slice(0,3).map((v,i)=>v*c[3]+ground[i]*(1-c[3])),a=light(color);return (Math.max(a,bg)+.05)/(Math.min(a,bg)+.05)<3;});
      if(!low)continue;
    }
    let r=box;
    if(!graphic&&direct.length){const range=document.createRange();range.setStartBefore(direct[0]);range.setEndAfter(direct.at(-1));r=range.getBoundingClientRect();}
    if(!r.width||!r.height)continue;
    const control=e.closest('button,[role=button],[data-optical-center]'),cb=control?.getBoundingClientRect(),cs=control&&getComputedStyle(control);
    targets.push({element,threshold:graphic?3:4.5,disabled:Boolean(e.closest(':disabled,[aria-disabled=true],[data-state=disabled]'))&&!e.closest('[aria-busy=true],[data-state=loading]'),ground,occluded,
      control:cb?{element:path(control),centerY:cb.y+scrollY+cb.height/2,centerX:cb.x+scrollX+cb.width/2,centered:cs.alignItems==='center'||control.hasAttribute('data-optical-center'),centeredX:cs.justifyContent==='center'||cs.textAlign==='center'||control.hasAttribute('data-optical-center')}:null,
      rect:{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}});
  }
  return {targets,gaps,scrolledOut};
}
export async function inspectCandidateInk(page,selector,{findings=[],scale=1,cache=new Map()}={}) {
  const started=performance.now(),{targets,gaps,scrolledOut=[]}=await page.evaluate(inkCandidates,{selector,findings});
  if(!targets.length)return {findings:[],gaps,scrolledOut,measurements:[],captures:0,elapsedMs:performance.now()-started};
  const x=Math.max(0,Math.floor(Math.min(...targets.map(t=>t.rect.x)))),y=Math.max(0,Math.floor(Math.min(...targets.map(t=>t.rect.y))));
  const clip={x,y,width:Math.ceil(Math.max(...targets.map(t=>t.rect.x+t.rect.width)))-x,height:Math.ceil(Math.max(...targets.map(t=>t.rect.y+t.rect.height)))-y};
  if(clip.width*clip.height*scale*scale>16000000)return {findings:[],measurements:[],gaps:[...gaps,'Candidate crop exceeds 16 megapixels; narrow state scope'],captures:0,elapsedMs:performance.now()-started};
  // fullPage selects document-coordinate clipping, not a full-page bitmap:
  // only `clip` is rasterized. The runner has already frozen scoped motion
  // and carets; avoid Playwright's own document-wide masking/animation walk.
  const bytes=await page.screenshot({clip,fullPage:true,animations:'allow',caret:'initial'});
  const key=createHash('sha256').update(bytes).update(JSON.stringify({targets,clip,scale})).digest('hex');
  if(cache.has(key))return {...cache.get(key),cacheHit:true,captures:1,elapsedMs:performance.now()-started};
  const image=decodePNG(bytes),measurements=[],detected=[];
  for(const target of targets)try {
    const crop=cropRaster(image,{...target.rect,x:target.rect.x-x,y:target.rect.y-y},scale),pixels=Buffer.alloc(crop.pixels.length);
    for(let i=0;i<pixels.length;i+=4){pixels[i]=target.ground[0];pixels[i+1]=target.ground[1];pixels[i+2]=target.ground[2];pixels[i+3]=255;}
    const ground={...crop,pixels},m={...target,...measureInk(crop,ground,target.threshold),inkBox:inkBounds(crop,ground,scale)};
    if(target.occluded)gaps.push(`${target.element}: occluded candidate requires rendered review`);
    measurements.push(m);
    if(m.kind&&!target.disabled)detected.push({...m,measured:m.contrastRatio,expected:`contrast >= ${m.threshold}`,layer:'ink'});
  }catch(e){gaps.push(`${target.element}: ${e.message}`);}
  const result={findings:detected,gaps,scrolledOut,measurements,captures:1,hash:key,elapsedMs:performance.now()-started};cache.set(key,result);return result;
}
