// Adapted from the local motion study: provenance in README.md.

'use strict';
const timingNames=['feedback','disclosure','placement','arrival','settle','stream','receipt','leaving','state','fold','dock','flow'];
function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function milliseconds(name) {
  const value=token(name);
  if(!/^\d+(?:\.\d+)?ms$/.test(value))throw new Error(`Missing or invalid motion token: ${name}`);
  return parseFloat(value);
}
const reducedDuration=milliseconds('--duration-reduced');
// Lucide 0.468.0, ISC. Geometry copied from the local mock's icon source.
const icons = {"play":"<polygon points=\"6 3 20 12 6 21 6 3\" />","pause":"<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" /> <rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" />","check":"<path d=\"M20 6 9 17l-5-5\" />","rotate-cw":"<path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\" /> <path d=\"M21 3v5h-5\" />"};
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"/></svg>`;
$('#icon-symbols').innerHTML = Object.entries(icons).map(([name, paths]) => `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</symbol>`).join('');
const reducedInput = $('#reduced');
const media = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = media.matches;
const stages = [];
// Defaults come from the shared motion token sheet; the timing panel writes the same tokens.
const timings = Object.fromEntries(timingNames.map(key=>[key,milliseconds(`--motion-${key}`)]));
const storedTimings = {...timings};
const arrivalK = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spring-arrival-stiffness')) || 260;
const arrivalD = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spring-arrival-damping')) || 26;
// Unit mass spring, clamped at arrival: the tiny mathematical overshoot is never shown.
function springAt(t, stiffness = arrivalK, damping = arrivalD) {
  const a = damping / 2, w = Math.sqrt(stiffness - a*a);
  return Math.min(1, Math.max(0, 1-Math.exp(-a*t)*(Math.cos(w*t)+a/w*Math.sin(w*t))));
}
function springFrames(from, to) {
  return Array.from({length:61}, (_, i) => {
    const p = i === 60 ? 1 : springAt(i/60 * .44);
    return {transform:`translate(${from.x+(to.x-from.x)*p}px, ${from.y+(to.y-from.y)*p}px) scale(${.95+.05*p})`, opacity:p, offset:i/60};
  });
}
function springTranslation(from,to){return springFrames(from,to).map(f=>({...f,transform:f.transform.replace(/ scale\([^)]*\)/,''),opacity:1}));}
function duration(name) { return reduced ? reducedDuration : timings[name]; }
function receipt(text, name='check') { return `<span class="receipt">${icon(name)}<span>${text}</span></span>`; }
function chapter(title, caption) {
  const c=document.createElement('div'); c.className='chapter'; c.innerHTML=`<h2>${title}</h2><p>${caption}</p>`; $('#lab').append(c);
  const g=document.createElement('div'); g.className='grid'; $('#lab').append(g); return g;
}
function stage(parent, id, title, caption, content, fallback, wide=false, choices='') {
  const el=document.createElement('section'); el.className=`stage${wide?' wide':''}`; el.id=id; el.dataset.ledger=`lab-${id}`; el.setAttribute('aria-labelledby', `${id}-title`);
  el.innerHTML=`<header class="stage-head"><h3 id="${id}-title">${title}</h3><p>${caption}</p></header><div class="controls"><button class="play">${icon('play')}Play</button><button class="replay">${icon('rotate-cw')}Replay</button><label>Speed <input class="speed" type="range" min="0.2" max="2" step="0.1" value="1" aria-label="${title} speed"><output>1x</output></label></div>${choices?`<div class="choices">${choices}</div>`:''}<div class="stage-body">${content}</div><footer class="stage-foot"><span class="result" aria-live="polite">${receipt('Ready','pause')}</span><span class="fallback">${fallback}</span></footer>`;
  parent.append(el);
  const s={id,el,anims:[],timers:[],run:()=>{},reset:()=>{},active:false,visible:false,runId:0}; stages.push(s);
  s.q=sel=>$(sel,el); s.all=sel=>$$(sel,el); s.speed=()=>Number(s.q('.speed').value);
  s.report=(text,name='check')=>{s.q('.result').innerHTML=receipt(text,name);};
  s.cancel=()=>{s.onCancel?.();s.runId++; s.anims.forEach(a=>a.cancel()); s.anims=[]; s.timers.forEach(t=>clearTimeout(t.id)); s.timers=[]; s.all('[data-transfer]').forEach(n=>n.remove()); s.all('[data-transfer-highlight]').forEach(n=>n.remove()); s.active=false;};
  s.animate=(target, frames, ms=duration('placement'), easing='var(--ease-enter)', extra={})=>{
    if(!target || !s.visible) return null;
    if(reduced){
      // Preserve gentle feedback while dropping movement, drawing and stagger.
      const fades=frames.filter(f=>f.opacity!==undefined).map(f=>({opacity:f.opacity,...(f.offset===undefined?{}:{offset:f.offset})}));
      frames=fades.length>=2?fades:[{opacity:.7},{opacity:1}];
      ms=reducedDuration;easing='var(--ease-hover)';
    }
    const bounds=target.getBoundingClientRect();
    if(bounds.bottom<=0 || bounds.top>=window.innerHeight || bounds.right<=0 || bounds.left>=window.innerWidth)return null;
    const resolved=easing.startsWith('var(')?getComputedStyle(document.documentElement).getPropertyValue(easing.slice(4,-1)).trim():easing;
    if(!resolved)throw new Error(`Missing easing token: ${easing}`);
    const a=target.animate(frames,{duration:ms,easing:resolved,fill:'none',...extra}); a.updatePlaybackRate(s.speed()); s.anims.push(a); a.onfinish=()=>{s.anims=s.anims.filter(other=>other!==a);}; return a;
  };
  s.schedule=t=>{
    t.at=performance.now();t.speed=t.wall?1:s.speed();
    t.id=setTimeout(()=>{s.timers=s.timers.filter(other=>other!==t);if(t.run===s.runId)t.fn();},Math.max(0,t.remaining)/t.speed);
  };
  s.after=(ms, fn, hold=false)=>{if(reduced&&!hold){fn();return;}const t={remaining:ms,fn,run:s.runId};s.timers.push(t);s.schedule(t);};
  s.afterWall=(ms,fn)=>{const t={remaining:ms,fn,run:s.runId,wall:true};s.timers.push(t);s.schedule(t);return t;};
  s.start=()=>{
    s.cancel();
    // Include native/CSS animations, even if a finished animation left our list.
    el.getAnimations?.({subtree:true}).forEach(a=>a.cancel());
    // Discard every scene object, not just its children. No CSS/SMIL/WA timeline,
    // inline style, transform, or element-owned handle can cross a replay.
    s.q('.stage-body').innerHTML=content;
    s.bind?.();
    s.reset();s.report('Ready','pause');
    // Flush the rebuilt scene before starting: replay gets the same base state.
    s.q('.stage-body').getBoundingClientRect();
    s.active=true;s.run();
  };
  s.q('.play').onclick=s.start; s.q('.replay').onclick=s.start;
  s.all('[data-duration]').forEach(input=>input.onchange=s.start);
  s.all('[data-travel]').forEach(input=>input.onchange=s.start);
  s.q('.speed').oninput=()=>{
    s.q('.controls output').value=`${s.speed()}x`;s.anims.forEach(a=>a.updatePlaybackRate(s.speed()));
    s.timers.forEach(t=>{clearTimeout(t.id);t.remaining-=(performance.now()-t.at)*t.speed;s.schedule(t);});
  };
  return s;
}
