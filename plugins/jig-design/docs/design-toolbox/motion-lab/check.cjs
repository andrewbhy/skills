// No browser, dependencies, network or writes. This tiny DOM checks scene wiring
// and final facts; it cannot establish layout, paint, accessibility or motion feel.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
// Resolve the real stylesheet's aliases rather than hard-coding mock curves or
// falling back to a second set of timings. The VM still does not paint CSS.
const tokenCSS=fs.readFileSync(path.join(__dirname,'tokens.css'),'utf8');
const cssTokens=Object.fromEntries([...tokenCSS.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,name,value])=>[name,value.trim()]));
function cssValue(name,seen=new Set()) {
  assert.ok(!seen.has(name),`Cyclic CSS token: ${name}`);seen.add(name);
  const value=doc.documentElement.style[name]??cssTokens[name]??'';
  return value.replace(/var\((--[\w-]+)\)/g,(_,ref)=>cssValue(ref,new Set(seen)));
}
assert.ok(html.includes('<meta charset="utf-8">'), 'HTML declares UTF-8');

const script = ['framework.js','stages.js'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n');
new vm.Script(script);


class Text {
  constructor(text) { this.textContent = text; this.parentNode = null; }
  get outerHTML() { return this.textContent; }
}
class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentNode = null;
    this.checked=false; this.attrs = {}; this.dataset = {}; this.style = {setProperty(k,v){this[k]=v;}};
    this.classList = {
      contains: c => (this.attrs.class || '').split(/\s+/).includes(c),
      add: (...cs) => { this.attrs.class = [...new Set([...this.classes(), ...cs])].join(' '); },
      remove: (...cs) => { this.attrs.class = this.classes().filter(c=>!cs.includes(c)).join(' '); },
      toggle: (c,force) => { const yes = force ?? !this.classList.contains(c); this.classList[yes?'add':'remove'](c); return yes; }
    };
  }
  classes() { return (this.attrs.class||'').split(/\s+/).filter(Boolean); }
  setAttribute(k,v) { this.attrs[k]=String(v); if(k==='value')this.value=String(v); if(k==='checked')this.checked=true;if(k==='data-ledger')this.dataset.ledger=v; if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set className(v) { this.attrs.class=v; } get className() { return this.attrs.class||''; }
  set id(v) { this.attrs.id=v; } get id() { return this.attrs.id; }
  append(...nodes) { for(const n of nodes){if(n.parentNode){const a=n.parentNode.children;a.splice(a.indexOf(n),1);} this.children.push(n);n.parentNode=this;} }
  remove() { if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;} }
  get firstChild() { return this.children[0]; }
  set innerHTML(value) { this.children.forEach(n=>n.parentNode=null);this.children=[];parse(String(value),this); }
  get innerHTML() { return this.children.map(n=>n.outerHTML).join(''); }
  get outerHTML() { return `<${this.tagName}${Object.entries(this.attrs).map(([k,v])=>` ${k}="${v}"`).join('')}>${this.innerHTML}</${this.tagName}>`; }
  set textContent(v) { this.children=[];this.append(new Text(String(v))); }
  get textContent() { return this.children.map(n=>n.textContent).join(''); }
  querySelectorAll(sel) {
    const out=[];const visit=n=>{for(const c of n.children||[]){if(c instanceof El){if(matches(c,sel))out.push(c);visit(c);}}};visit(this);return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for(let n=this;n;n=n.parentNode)if(n instanceof El&&matches(n,sel))return n;return null; }
  animate(frames,opts) { assert.ok(frames.length>=2);assert.ok(Number.isFinite(opts.duration)); const a={target:this,outputOwner:this.closest('[data-live-output]'),frames,opts,at:now,rate:1,cancelled:false,cancel(){this.cancelled=true;},updatePlaybackRate(v){this.rate=v;}};animations.push(a);return a; }
  beginElementAt(offset) { this.smilStart={offset,duration:this.getAttribute('dur'),at:now}; }
  endElement() { this.smilEnded=true; }
  addEventListener() {}
  getBoundingClientRect() { return {width:560,top:0,left:0,right:560,bottom:240}; }
  cloneNode(deep) {const n=new El(this.tagName);for(const [k,v] of Object.entries(this.attrs))n.setAttribute(k,v);n.style={...this.style};if(deep)n.innerHTML=this.innerHTML;return n;}
  getTotalLength() {
    const d=this.getAttribute('d'),n=d.match(/-?[\d.]+/g).map(Number);
    if(d.includes('H'))return Math.abs(n[2]-n[0]);
    if(d.includes('V'))return Math.abs(n[2]-n[1]);
    return Math.hypot(n.at(-2)-n[0],n.at(-1)-n[1]);
  }
  get ownerSVGElement() { return this.closest('svg'); }
}
function simple(n,sel){
  const checked=sel.endsWith(':checked');sel=sel.replace(/:checked$/,'');if(checked&&!n.checked)return false;
  const attrs=[...sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];sel=sel.replace(/\[[^\]]+\]/g,'');
  for(const [,k,v] of attrs)if(n.getAttribute(k)===null || (v!==undefined&&n.getAttribute(k)!==v))return false;
  const id=sel.match(/#([\w-]+)/);if(id&&n.id!==id[1])return false;
  for(const [,c] of sel.matchAll(/\.([\w-]+)/g))if(!n.classList.contains(c))return false;
  const tag=sel.match(/^[\w-]+/);if(tag&&n.tagName!==tag[0])return false;return true;
}
function matches(n,sel){
  if(sel.includes(' + ')){const [a,b]=sel.split(' + ');if(!simple(n,b))return false;const siblings=n.parentNode.children.filter(c=>c instanceof El),prev=siblings[siblings.indexOf(n)-1];return !!prev&&simple(prev,a);}
  const parts=sel.split(/\s+/);if(!simple(n,parts.pop()))return false;
  while(parts.length){const p=parts.pop();let found=false;while(n.parentNode){n=n.parentNode;if(n instanceof El&&simple(n,p)){found=true;break;}}if(!found)return false;}return true;
}
function parse(source,root){
  const stack=[root], voids=new Set(['meta','link','input','br','hr','img']);
  for(const token of source.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('<!--')||token.startsWith('<!'))continue;
    if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
    if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)[1],n=new El(tag);const attrs=token.slice(tag.length+1).replace(/\/?\s*>$/,'');for(const m of attrs.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g))n.setAttribute(m[1],m[2]??m[3]??'');stack.at(-1).append(n);if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(n);}
    else stack.at(-1).append(new Text(token));
  }
  for(const select of root.querySelectorAll('select')){const options=select.querySelectorAll('option');select.value=(options.find(o=>o.getAttribute('selected')!==null)||options[0])?.value;}
}
let animations=[],timerId=0,timers=new Map(),now=10000;
const doc=new El('document');parse(html.split('<script>')[0],doc);
doc.createElement=t=>new El(t);doc.createElementNS=(_,t)=>new El(t);doc.body=doc.querySelector('body');doc.documentElement=doc.querySelector('html');
const documentEvents={};doc.addEventListener=(name,fn)=>{documentEvents[name]=fn;};
let mediaHandler;const media={matches:false,addEventListener:(_,fn)=>mediaHandler=fn};
const context={document:doc,window:{innerHeight:1000,innerWidth:1200},matchMedia:()=>media,performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:cssValue}),setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),IntersectionObserver:class {constructor(fn){this.fn=fn;}observe(target){this.fn([{target,isIntersecting:true}]);}disconnect(){this.disconnected=true;}}};
vm.createContext(context);vm.runInContext(script,context);
const lab=context.window.motionLab;
assert.equal(cssValue('--ease-enter'),'cubic-bezier(0.23, 1, 0.32, 1)','enter/exit curve');
assert.equal(cssValue('--ease-exit'),cssValue('--ease-enter'),'exit also uses strong ease-out');
assert.equal(cssValue('--ease-move'),'cubic-bezier(0.77, 0, 0.175, 1)','on-screen movement curve');
assert.equal(cssValue('--ease-drawer'),'cubic-bezier(0.32, 0.72, 0, 1)','drawer curve');
assert.equal(cssValue('--ease-hover'),'cubic-bezier(0.25, 0.1, 0.25, 1)','hover curve');
assert.equal(cssValue('--ease-constant'),'linear','constant curve');
const originalArrival=lab.timings.arrival;
for(const [key,value]of Object.entries(lab.timings))assert.equal(value,parseFloat(cssValue('--motion-'+key)),`CSS is the timing source: ${key}`);
assert.ok(lab.timings.leaving<lab.timings.arrival,'Exit is faster than entrance');
for(const key of ['feedback','disclosure','placement','arrival','settle','stream','leaving','state','fold','dock'])assert.ok(lab.timings[key]<300,`${key}: general UI budget`);
assert.ok(lab.timings.flow>=250&&lab.timings.flow<=1250,'Explanatory transfer budget');
const get=id=>lab.stages.find(s=>s.id===id);
let observeStep=null;
function flush(ms=5000){const end=now+ms;while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();observeStep?.();}now=end;}
function click(id){const e=doc.querySelector('#'+id);assert.ok(e, id);e.onclick();}
assert.equal(lab.stages.length,15);
// Compare all observable sample state at start and after every scheduled callback,
// plus every requested animation. Normalize only generated SVG reference IDs.
const normalize=value=>JSON.stringify(value).replace(/(?:arrow|message-edge)-\d+/g,'generated-id');
function nodeState(n){
  if(n instanceof Text)return n.textContent;
  const attrs=Object.fromEntries(Object.entries(n.attrs).sort().map(([k,v])=>[k,k==='class'?v.split(/\s+/).sort().join(' '):v]));
  return {tag:n.tagName,attrs,style:Object.fromEntries(Object.entries(n.style).filter(([,v])=>typeof v!=='function').sort()),
    hidden:!!n.hidden,inert:!!n.inert,value:n.value,children:n.children.map(nodeState)};
}
function sameSequence(actual,expected,label){
  assert.equal(actual.length,expected.length,label+': number of states');
  function diff(a,b,p){if(typeof a!=='object'||a===null||b===null||typeof b!=='object')return a===b?null:{path:p,actual:a,expected:b};
    for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=diff(a[k],b[k],p+'.'+k);if(d)return d;}return null;}
  for(let i=0;i<actual.length;i++){const d=diff(JSON.parse(actual[i]),JSON.parse(expected[i]),'state['+i+']');assert.equal(d,null,label+': '+JSON.stringify(d));}
}
function targetPath(n,root){const parts=[];while(n&&n!==root){parts.unshift(n.parentNode?.children.indexOf(n));n=n.parentNode;}return parts;}
function recordRun(s,button,action=()=>{}){
  if(s.id==='blocking-question')flush(1000); // separate replay equality from flash cooldown
  const sequence=[],started=now;animations=[];
  const oldNodes=new Set(s.all('.stage-body *'));
  s.all('.scene').forEach(n=>{n.style.transform='translateX(999px)';n.style.opacity='0';n.classList.add('stale-run');});
  const snapshot=()=>sequence.push(normalize({at:now-started,active:s.active,
    body:nodeState(s.q('.stage-body')),result:nodeState(s.q('.result')),
    animations:animations.map(a=>({target:targetPath(a.target,s.el),frames:a.frames,options:a.opts,at:a.at-started,rate:a.rate}))}));
  s.q(button).onclick();
  assert.ok(s.all('.stage-body *').every(n=>!oldNodes.has(n)),`${s.id}: every scene node is a new object`);
  assert.ok([...oldNodes].filter(n=>n.classList.contains('scene')).every(n=>n.closest('.stage-body')===null),`${s.id}: old scenes detached`);
  assert.equal(s.q('.stale-run'),null,`${s.id}: stale scene styles/classes discarded`);
  action();snapshot();observeStep=snapshot;flush(45000);observeStep=null;
  snapshot();return sequence;
}
for(const s of lab.stages){
  // Flash cooldown deliberately suppresses immediate replay: test that separately.
  
  lab.stages.forEach(other=>other.cancel());
  assert.ok(s.q('.play'));assert.ok(s.q('.replay'));assert.ok(s.q('.speed'));
  const first=recordRun(s,'.play'),second=recordRun(s,'.replay');
  sameSequence(second,first,`${s.id}: second complete state/animation sequence matches first`);
  s.start();flush(100);const interrupted=[...s.anims],pending=s.timers.map(t=>t.id);
  const third=recordRun(s,'.replay');
  sameSequence(third,first,`${s.id}: replay during a run starts the identical sequence`);
  assert.ok(interrupted.every(a=>a.cancelled||a.smilEnded||a.target===undefined),`${s.id}: running animations cancelled`);
  assert.ok(pending.every(id=>!timers.has(id)),`${s.id}: old timers cancelled`);
}
console.log('PASS: every stage has identical first, second and interrupted-replay state and animation-request sequences (45 s per run, virtual time).');
const expectedEasing={'arrival':'--ease-enter','fold':'--ease-move','panel-open':'--ease-drawer','edge-flow':'--ease-constant'};
for(const [id,name]of Object.entries(expectedEasing)){
  lab.stages.forEach(s=>s.cancel());animations=[];get(id).start();
  assert.equal(animations[0].opts.easing,cssValue(name),`${id}: uses ${name}`);
  assert.equal(animations[0].opts.duration,lab.timings[{'arrival':'arrival','fold':'fold','panel-open':'dock','edge-flow':'flow'}[id]]);
}

const reducedBox=doc.querySelector('#reduced');reducedBox.checked=true;reducedBox.onchange();
for(const s of lab.stages){lab.stages.forEach(other=>other.cancel());sameSequence(recordRun(s,'.play'),recordRun(s,'.replay'),s.id+': reduced replay');
  if(s.id==='state-change')assert.ok(animations.length>0,'Reduced state changes retain gentle feedback');
  for(const a of animations){assert.ok(a.opts.duration>0,'Reduced motion retains feedback');assert.ok(a.frames.every(f=>Object.keys(f).every(k=>['opacity','offset'].includes(k))),'Reduced motion drops movement and drawing');}
}
assert.ok(lab.stages.some(s=>s.id==='state-change'),'State change provides opacity feedback');
assert.equal(lab.reduced,true);
console.log('PASS: reduced-motion scene and replay sequences agree. Browser paint and motion feel remain untested.');

// Speed changes affect both live animations and the remaining scheduler delay.
reducedBox.checked=false;reducedBox.onchange();lab.stages.forEach(s=>s.cancel());
const arrival=get('arrival');arrival.start();flush(100);
const running=[...arrival.anims];const speed=arrival.q('.speed');speed.value='2';speed.oninput();
assert.ok(running.every(a=>a.rate===2),'Live animations switch to 2x');
assert.equal(arrival.q('.controls output').value,'2x');
const remaining=(originalArrival+lab.timings.receipt-100)/2;
flush(remaining-1);assert.match(arrival.q('.result').textContent,/Ready/,'Receipt hold is not cut short');
flush(1);assert.match(arrival.q('.result').textContent,/Item removed/,'Remaining delay scales to 2x');
arrival.cancel();speed.value='1';
const timing=doc.querySelector('[data-timing="arrival"]');timing.value='640';timing.onchange();
assert.equal(lab.timings.arrival,640);assert.equal(doc.documentElement.style['--motion-arrival'],'640ms');
click('reset-timing');assert.equal(lab.timings.arrival,originalArrival);
console.log('PASS: live speed changes reschedule remaining time and update animation rate; timing inputs update CSS motion tokens and reset.');
lab.stages.forEach(s=>s.cancel());arrival.start();
const hiddenAnims=[...arrival.anims];assert.ok(arrival.timers.length>0);
doc.hidden=true;documentEvents.visibilitychange();
assert.equal(timers.size,0,'Hidden tab cancels every scheduled callback');
assert.ok(hiddenAnims.every(a=>a.cancelled),'Hidden tab cancels in-flight motion');
assert.ok(lab.stages.every(s=>!s.active),'Hidden tab leaves stages stopped');
doc.hidden=false;flush(45000);assert.match(arrival.q('.result').textContent,/Stopped/);
console.log('PASS: hidden tabs cancel in-flight motion and timers, with no unseen follow-up.');

// Check the meaning of named effects, beyond equality of repeated runs.
lab.stages.forEach(s=>s.cancel());animations=[];
const breathing=get('breathing');breathing.start();flush(29999);
assert.match(breathing.q('.block').textContent,/Working/);
flush(1);assert.match(breathing.q('.block').textContent,/Quiet/);
assert.ok(breathing.anims.every(a=>a.cancelled),'Silent work must stop looking alive');
const attention=get('attention-loop');attention.start();flush(100);
attention.q('.block').onfocus();
assert.equal(attention.timers.length,0,'Seen attention cancels future pulses');
assert.ok(attention.anims.every(a=>a.cancelled),'Seen attention stops current pulse');
assert.match(attention.q('.result').textContent,/still needs an answer/);
const collapse=get('flip-collapse');collapse.start();
assert.equal(collapse.q('.leaving').style.position,'absolute','Leaving item exits layout immediately');
assert.equal(collapse.q('.leaving').inert,true,'Exit object is not interactive');
assert.equal(collapse.q('.leaving').getAttribute('aria-hidden'),'true','Exit object is decorative');
flush(lab.timings.placement);assert.equal(collapse.q('.leaving'),null);
console.log('PASS: silence ends working breath; seeing attention stops pulses; removal exits layout before fading ends.');
