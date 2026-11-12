import assert from 'node:assert/strict';
import test from 'node:test';
import { captureStateSnapshot, restoreStateSnapshot } from '../scripts/visual-state-snapshot.mjs';

test('[risk: font replay loses live form values, focus, scroll or ancestor state] settled snapshot preserves DOM properties and restores the scoped state',t=>{
  const globals=Object.fromEntries(['document','CSS','getComputedStyle','scrollX','scrollY','scrollTo'].map(k=>[k,globalThis[k]]));
  t.after(()=>{for(const [k,v]of Object.entries(globals))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  function element(tag,attrs={},children=[]){
    const e={localName:tag,id:attrs.id || '',attrs:{...attrs},children,parentElement:null,scrollTop:0,scrollLeft:0,value:'',checked:false,selected:false,
      matches:s=>s.split(',').includes(tag),getAnimations:()=>[],getAttribute:k=>e.attrs[k],setAttribute:(k,v)=>{e.attrs[k]=v;},removeAttribute:k=>{delete e.attrs[k];},
      contains:other=>{for(let p=other;p;p=p.parentElement)if(p===e)return true;return false;},
      querySelectorAll:s=>s==='*'?children.flatMap(c=>[c,...c.querySelectorAll('*')]):[],
      cloneNode:()=>{const copy=element(tag,e.attrs,children.map(c=>c.cloneNode(true)));return copy;},
      blur(){e.blurred=true;},focus(){e.focused=true;},style:{setProperty(){}}};
    children.forEach(c=>{c.parentElement=e;});
    Object.defineProperty(e,'attributes',{get:()=>Object.entries(e.attrs).map(([name,value])=>({name,value}))});
    Object.defineProperty(e,'outerHTML',{get:()=>`<${tag} ${Object.entries(e.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${e.textContent || ''}${children.map(c=>c.outerHTML).join('')}</${tag}>`,set:html=>{e.restoredHTML=html;}});
    return e;
  }
  const input=element('input',{id:'input'}),text=element('textarea',{id:'text'}),option=element('option',{id:'option'}),scope=element('section',{id:'scope'},[input,text,option]);
  const body=element('body',{id:'body'},[scope]),html=element('html',{id:'html','data-accent':'violet'},[body]);
  input.value='long edited filename';input.checked=true;text.value='edited multiline';option.selected=true;scope.scrollTop=42;
  const nodes=new Map([html,body,scope,input,text,option].map(e=>['#'+e.id,e]));let scroll;
  globalThis.document={querySelector:s=>nodes.get(s),activeElement:input};globalThis.CSS={escape:s=>s};globalThis.scrollX=3;globalThis.scrollY=90;globalThis.scrollTo=(x,y)=>{scroll={x,y};};
  const snapshot=captureStateSnapshot('#scope');
  assert(snapshot.html.includes('value="long edited filename"'));assert(snapshot.html.includes('checked=""'));assert(snapshot.html.includes('edited multiline'));assert(snapshot.html.includes('selected=""'));
  assert.equal(snapshot.focus,'#input');assert.deepEqual(snapshot.viewportScroll,{x:3,y:90});
  html.setAttribute('data-accent','orange');html.setAttribute('data-transient','true');scope.scrollTop=0;
  restoreStateSnapshot({selector:'#scope',snapshot});
  assert.equal(html.getAttribute('data-accent'),'violet');assert.equal(html.getAttribute('data-transient'),undefined);
  assert.equal(scope.restoredHTML,snapshot.html);assert.equal(scope.scrollTop,42);assert(input.blurred&&input.focused);assert.deepEqual(scroll,{x:3,y:90});
  input.shadowRoot={};assert.throws(()=>captureStateSnapshot('#scope'),/cannot replay/);
});
