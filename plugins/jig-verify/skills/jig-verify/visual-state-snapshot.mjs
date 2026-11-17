import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Reuse the default pass's settled DOM states for font reflow. This avoids
// replaying the product's timers, data loading and motion for every typeface.
// Layout is measured again in Chrome with the new font; no pixel is reused.
export function captureStateSnapshot(selector) {
  const root=document.querySelector(selector);
  if(!root)throw new Error('Snapshot scope missing');
  const path=e=>e.id?`#${CSS.escape(e.id)}`:e.parentElement?`${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e)+1})`:e.localName;
  if([root,...root.querySelectorAll('*')].some(e=>e.shadowRoot||e.matches('canvas,iframe')))throw new Error('Font state snapshot cannot replay shadow/frame/canvas content');
  const ancestors=[];
  for(let a=root.parentElement;a;a=a.parentElement)ancestors.push({selector:path(a),attributes:[...a.attributes].map(a=>[a.name,a.value])});
  // WAAPI paint is not in outerHTML. Freeze its current computed presentation
  // on the copied scope, without touching the live page or its geometry.
  const clone=root.cloneNode(true),originals=[root,...root.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  for(let i=0;i<originals.length;i++){
    const e=originals[i],copy=copies[i];
    if(e.matches('input')){copy.setAttribute('value',e.value);if(e.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked');}
    if(e.matches('textarea'))copy.textContent=e.value;
    if(e.matches('option')){if(e.selected)copy.setAttribute('selected','');else copy.removeAttribute('selected');}
    if(e.getAnimations().length){const s=getComputedStyle(e);for(const key of ['transform','opacity','height','width'])copy.style.setProperty(key,s[key]);}
  }
  const hovered=[...root.querySelectorAll(':hover')].at(-1) || (root.matches(':hover')?root:null);
  return {html:clone.outerHTML,ancestors,focus:root.contains(document.activeElement)?path(document.activeElement):null,viewportScroll:{x:scrollX,y:scrollY},hover:hovered?path(hovered):null,
    scroll:[root,...root.querySelectorAll('*')].flatMap(e=>e.scrollTop||e.scrollLeft?[{selector:path(e),top:e.scrollTop,left:e.scrollLeft}]:[])};
}
export function restoreStateSnapshot({selector,snapshot}) {
  const root=document.querySelector(selector);
  if(!root)throw new Error('Font replay scope missing');
  document.activeElement?.blur();
  // Outer ancestor selectors must be restored before replacing the component.
  for(const item of [...snapshot.ancestors].reverse()){
    const e=document.querySelector(item.selector);if(!e)throw new Error(`Font replay ancestor missing: ${item.selector}`);
    for(const a of [...e.attributes])e.removeAttribute(a.name);
    for(const [name,value] of item.attributes)e.setAttribute(name,value);
  }
  root.outerHTML=snapshot.html;
  for(const item of snapshot.scroll){const e=document.querySelector(item.selector);if(e){e.scrollTop=item.top;e.scrollLeft=item.left;}}
  if(snapshot.focus){const e=document.querySelector(snapshot.focus);if(!e)throw new Error('Font replay focus target missing');e.focus({preventScroll:true});}
  scrollTo(snapshot.viewportScroll.x,snapshot.viewportScroll.y);
}
