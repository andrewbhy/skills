if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/components/check-components.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { contrast, hueAngle } from '../themes/check-themes.mjs';
import { checkMockup, ledgerIds } from '../../../scripts/mockup-check.mjs';

const here = new URL('./', import.meta.url);
const read = name => readFileSync(new URL(name, here), 'utf8');
const packs = ['white-board','white-board-soft','paper','studio','clarity','dracula','electric'];
const interactive = ['default','hover','active','focus-visible','disabled'];
const expected = Object.fromEntries([
 ...['primary','secondary','quiet','destructive','icon','label-icon'].map(n=>['button-'+n,[...interactive,'loading']]),
 ...['text','textarea','select','search'].map(n=>['input-'+n,[...interactive,'error']]),
 ...['checkbox','radio','switch'].map(n=>['input-'+n,[...interactive,'selected']]),
 ...['tab','segment'].map(n=>[n,[...interactive,'selected']]),
 ...['list-row','queue-row'].map(n=>[n,[...interactive,'selected','loading']]),
 ['badge',['default']],['panel',['expanded','collapsed']],['menu-item',interactive],
 ['tooltip',['hidden','visible']],['dialog',['closed','open','closing']],
 ['toast',['visible','hidden','closing']],['empty',['default']],
 ['scrollbar',['default','hover']],['divider',['default']],['progress',['default','complete','loading','error','empty']]
]);
const applicationComponents=['popover','dropdown','split-button','combobox','slider','number-input','accordion','disclosure','tree-view','table','data-grid','breadcrumbs','avatar','count-badge','kbd','command-palette','toolbar','splitter','editor-tabs','status-bar','inline-alert','banner','skeleton','toggle-group','tag-input','link','code-block','drag-handle','window-title-bar'];

// A source tree for lint/replay, not a browser or accessibility-tree emulator.
function parse(html) {
 const nodes=[], stack=[];
 const voids=new Set('meta link input hr br img source area wbr'.split(' '));
 const re=/<script\b([^>]*)>([\s\S]*?)<\/script>|<!--[\s\S]*?-->|<![^>]*>|<\/?[\w-]+\b[^>]*>|[^<]+/g;
 for(const m of html.matchAll(re)) {
  const text=m[0];
  if(text.startsWith('<!'))continue;
  if(text.startsWith('</')){stack.pop();continue;}
  if(!text.startsWith('<')){if(stack.length)stack.at(-1).own+=text;continue;}
  const tag=text.match(/^<([\w-]+)/)[1];
  const raw=m[1]??text.slice(tag.length+1,-1), attrs={};
  for(const a of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=a[2]??a[3]??a[4]??'';
  const node={tag,attrs,own:m[2]??'',children:[],parent:stack.at(-1)};
  node.parent?.children.push(node);nodes.push(node);
  if(tag!=='script'&&!voids.has(tag)&&!text.endsWith('/>'))stack.push(node);
 }
 return nodes;
}
const textOf=n=>n.own+n.children.map(textOf).join('');
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
const script=(html,id)=>{const n=parse(html).find(n=>n.tag==='script'&&n.attrs.id===id);assert(n,`Missing script ${id}`);return n.own;};

function cssRules(css) {
 const result=[]; const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
 function walk(source,parents=[]) {
  let start=0;
  for(let i=0;i<source.length;i++)if(source[i]==='{') {
   const head=source.slice(start,i).trim();let depth=1,end=i+1;
   for(;end<source.length&&depth;end++)depth+=source[end]==='{'?1:source[end]==='}'?-1:0;
   assert.equal(depth,0,'Unbalanced CSS');
   const body=source.slice(i+1,end-1);
   if(head.startsWith('@'))walk(body,[...parents,head]);else result.push({selector:head,body,parents});
   start=end;i=end-1;
  }
 }
 walk(clean);return result;
}
const declarations=body=>body.split(';').filter(s=>s.includes(':')).map(s=>{const at=s.indexOf(':');return [s.slice(0,at).trim(),s.slice(at+1).trim()];});

export function validate({html=read('index.html'),css=read('components.css')+read('application.css')}={}) {
 const nodes=parse(html), rules=cssRules(css);
 for(const component of applicationComponents)assert(nodes.some(n=>n.attrs['data-component']===component),`Application coverage missing ${component}`);
 assert(!nodes.some(n=>'autofocus' in n.attrs),'No autofocus on load: initial focus belongs to an explicit action');
 assert.deepEqual(JSON.parse(script(html,'state-contract')),expected,'State contract changed or incomplete');
 const selectors=rules.map(r=>r.selector).join(',');
 for(const base of ['.gc-button','.gc-field','.gc-choice','.gc-tab','.gc-row','.gc-menu-item']) {
  for(const state of ['hover','active','focus-visible']) {
   assert(selectors.includes(base+':'+state),`${base} missing native ${state} style`);
   assert(selectors.includes(base+'[data-state='+state+']'),`${base} missing pinned ${state} style`);
  }
  assert(selectors.includes(base+':disabled'),`${base} missing disabled style`);
 }
 for(const selector of ['.gc-button[aria-busy=true]','.gc-row[aria-busy=true]','.gc-row[aria-pressed=true]','.gc-tab[aria-selected=true]','.gc-choice:checked','.gc-field[aria-invalid=true]','.gc-scroll[data-state=hover]'])assert(selectors.includes(selector),`Missing semantic state style ${selector}`);
 for(const [component,states] of Object.entries(expected))for(const state of states) {
  const node=nodes.find(n=>n.attrs['data-component']===component&&n.attrs['data-state']===state);
  assert(node,`${component} missing ${state}`);
  if(state==='disabled')assert('disabled' in node.attrs,`${component} disabled specimen must use native disabled`);
  if(state==='loading'&&/button|row/.test(component))assert.equal(node.attrs['aria-busy'],'true',`${component} loading must expose busy`);
  if(state==='selected'&&/tab|segment|row/.test(component))assert.equal(node.attrs['aria-pressed'],'true',`${component} selected must expose selection`);
 }
 for(const node of nodes.filter(n=>n.tag==='button')) {
  const content=textOf(node).trim();
  assert(content||node.attrs['aria-label']?.trim()||node.attrs['aria-labelledby'],`Unnamed icon-only button: ${node.attrs.id??node.attrs.class}`);
  assert.equal(node.attrs.type,'button','Buttons must have explicit type');
 }
 const ids=nodes.map(n=>n.attrs.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length,'Duplicate HTML IDs');
 for(const node of nodes)for(const attr of ['aria-describedby','aria-labelledby','aria-controls'])if(node.attrs[attr])for(const id of node.attrs[attr].split(' '))assert(ids.includes(id),`Unresolved ${attr}: ${id}`);
 for(const node of nodes.filter(n=>['input','textarea','select'].includes(n.tag)))assert(node.attrs['aria-label']||nodes.some(n=>n.tag==='label'&&n.attrs.for===node.attrs.id),`Unlabelled input ${node.attrs.id}`);
 for(const status of ['neutral','working','attention','success','error','outdated'])assert(nodes.some(n=>(n.attrs.class??'').split(' ').includes('gc-chip--'+status)),`Missing ${status} badge`);
 for(const section of nodes.filter(n=>n.tag==='section'&&n.attrs.id!=='controls-title'&&n.attrs.id)) {
  const content=descendants(section);
  assert(content.some(n=>(n.attrs.class??'').split(' ').includes('gc-rule')),`${section.attrs.id}: missing Craft rule`);
  assert(content.some(n=>(n.attrs.class??'').split(' ').includes('gc-tokens')&&/--[\w-]+/.test(textOf(n))),`${section.attrs.id}: missing token list`);
 }
 assert(!/innerHTML|outerHTML|insertAdjacentHTML|createElement|document\.write|\.style\b|setAttribute\(\s*['"]style/.test(script(html,'component-behaviour')),'Data and interactions must not rebuild markup or CSS');
 for(const r of rules) {
  if(r.selector.includes(':hover'))assert(r.parents.some(p=>p.includes('(hover: hover)')&&p.includes('(pointer: fine)')),`Ungated hover: ${r.selector}`);
  for(const [property,value] of declarations(r.body)) {
   assert(!property.startsWith('--'),'Token definitions belong in authoritative token files');
   const plain=value.replace(/var\(--[\w-]+\)/g,'TOKEN');
   assert(!/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/i.test(plain),`Raw colour: ${value}`);
   assert(!/\b\d*\.?\d+(?:px|rem|em|vh|vw|vmin|vmax|ms|s|pt)\b/i.test(plain),`Raw dimension or duration: ${value}`);
   assert(!/\b(?:white|black|red|blue|green|grey|gray|orange|purple|yellow)\b/i.test(plain),`Named colour: ${value}`);
   if(/^(?:color|background(?:-color)?|border(?:-(?:inline|block)(?:-(?:start|end))?)?-color|outline-color|fill|stroke)$/.test(property))assert(/^(?:TOKEN|transparent|currentColor|none)$/.test(plain),`Untokenized paint ${property}: ${value}`);
   if(/^(?:box-shadow|text-shadow|border-radius|font-size|font-weight|line-height|letter-spacing)$/.test(property))assert(/TOKEN|^(?:none|normal|0)$/.test(plain),`Untokenized ${property}: ${value}`);
   if(property==='transition') {
    if(value==='none !important'||value==='none')continue; // Explicit frequency-gate stillness.
    const properties=value.split(',').map(v=>v.trim().split(/\s+/)[0]);
    for(const p of properties)assert(/^(?:opacity|transform|color|background-color|border-color|outline-color|fill|stroke|stroke-dashoffset|clip-path)$/.test(p),`Forbidden transition: ${p}`);
   }
   if(r.parents.some(p=>p.startsWith('@keyframes')))assert(/^(opacity|transform|fill|stroke|stroke-dashoffset|clip-path|color|background-color)$/.test(property),`Forbidden keyframe property ${property}`);
  }
 }
 const used=[...css.matchAll(/var\((--[\w-]+)\)/g)].map(m=>m[1]);
 const themeOptions=nodes.filter(n=>n.tag==='option'&&n.parent?.attrs.id==='theme').map(n=>n.attrs.value);
 assert.deepEqual(themeOptions,packs,'Theme picker must include the seven packs');
 for(const pack of packs) {
  const tokens=new Map();
  for(const source of [read('../typography/type.css'),read(`../themes/${pack}/theme.css`).split('@media (prefers-reduced-motion: reduce)')[0],read('../motion-lab/tokens.css'),read('application-tokens.css')])for(const m of source.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g))tokens.set(m[1],m[2].trim());
  function resolveToken(name,seen=[]) {assert(tokens.has(name),`${pack}: unknown token ${name}`);assert(!seen.includes(name),`${pack}: token cycle ${name}`);return tokens.get(name).replace(/var\((--[\w-]+)\)/g,(_,n)=>resolveToken(n,[...seen,name]));}
  used.forEach(name=>resolveToken(name));
  // Evaluate the actual ordered declarations for the button subset of CSS.
  // This covers role/state specificity and later generic overrides, not layout.
  function buttonPaint(role,state,native=false,disabled=false) {
   const values={}, priority={};
   for(const rule of rules) {
    if(rule.parents.some(p=>/keyframes|prefers-reduced-motion|pointer:coarse/.test(p)))continue;
    for(const selector of rule.selector.split(',').map(s=>s.trim())) {
     if(!/^\.gc-button(?:--[\w-]+)?(?::[\w-]+|\[[\w-]+=[\w-]+\])?$/.test(selector))continue;
     const roleName=selector.match(/^\.gc-button--([\w-]+)/)?.[1];
     if(roleName&&roleName!==role)continue;
     const pinned=selector.match(/\[data-state=([^\]]+)\]/)?.[1];
     if(pinned&&(native||pinned!==state))continue;
     const pseudo=selector.match(/:([\w-]+)$/)?.[1];
     if(pseudo&&!(pseudo==='disabled'?disabled:native&&pseudo===state))continue;
     if(/\[/.test(selector)&&!pinned)continue;
     const specificity=1+(pinned||pseudo?1:0);
     for(const [property,value] of declarations(rule.body))if(specificity>=(priority[property]??0)) {
      priority[property]=specificity;values[property]=value.replace(/var\((--[\w-]+)\)/g,(_,n)=>resolveToken(n));
     }
    }
   }
   return values;
  }
  for(const [role,family] of [['primary','blue'],['destructive','red']]) {
   const base=buttonPaint(role,'default');
   for(const state of ['hover','active'])for(const native of [false,true]) {
    const paint=buttonPaint(role,state,native);
    assert.notEqual(paint.background,base.background,`${pack}: ${role} ${state} needs a stronger colour step`);
    const reference=resolveToken(role==='primary'?'--action-primary':'--state-error');
    const distance=Math.abs(hueAngle(paint.background)-hueAngle(reference));
    assert(Math.min(distance,360-distance)<15,`${pack}: ${role} ${state} lost role colour`);
    assert(contrast(paint.color,paint.background)>=(pack==='clarity'?7:4.5),`${pack}: ${role} ${state} label contrast`);
    assert.equal(paint.background,resolveToken(`--scale-${family}-${role==='primary'?10:state==='hover'?3:4}`),`${pack}: ${role} ${state} must use own scale`);
    assert.equal(buttonPaint(role,state,native,true).background,resolveToken('--surface-disabled'),'Disabled overrides role feedback');
   }
  }
  for(const r of rules)for(const [p,v] of declarations(r.body))if(/^(animation|transition)$/.test(p)) {
   const resolved=v.replace(/var\((--[\w-]+)\)/g,(_,n)=>resolveToken(n));
   for(const m of resolved.matchAll(/([\d.]+)ms/g))assert(Number(m[1])<300,`${pack}: general UI duration exceeds budget`);
  }
 }
 const context=vm.createContext({});vm.runInContext(script(html,'component-data'),context);const data=context.GoldenData;
 assert.deepEqual(Object.keys(data.modes),['Demo','Worst case','Empty','One','Many']);
 for(const mode of Object.keys(data.modes)) {
  const d=data.view(mode);assert.equal(d.countLabel,`${d.count.toLocaleString('en-US')} ${d.count===1?'item':'items'}`,`${mode}: count plural`);
  assert.equal(d.single,'1 item');assert.equal(d.zero,'0 items');assert.equal(d.progress,`${d.completed} of ${d.count}`);
  assert(d.completed>=0&&d.completed<=d.count&&d.visible>=0&&d.visible<=32,`${mode}: invalid count`);
 }
 const worst=data.view('Worst case');assert(worst.title.length>100&&/한국어/.test(worst.title));assert(worst.path.length>300&&!/\s/.test(worst.path));assert.equal(worst.meta,'');assert(worst.count>=1000000000);
 assert.throws(()=>data.view('Missing'),/Unknown data mode/);
 replay(html,nodes,context);
 return {components:Object.keys(expected).length,applicationComponents:applicationComponents.length,stateRequirements:Object.values(expected).flat().length,packs:packs.length,dataModes:5};
}

function replay(html,nodes,context) {
 // Enough DOM to run the actual inline controller. No layout, rendering or native
 // keyboard behaviour is simulated; these remain explicitly pending.
 function simple(node,selector) {
  let s=selector;
  const not=s.match(/:not\(([^)]+)\)/);if(not){if(simple(node,not[1]))return false;s=s.replace(not[0],'');}
  if(s.includes(':disabled')){if(!('disabled'in node.attrs))return false;s=s.replace(':disabled','');}
  const tag=s.match(/^[\w-]+/);if(tag&&node.tag!==tag[0])return false;
  for(const m of s.matchAll(/([.#])([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
   if(m[1]==='#'&&node.attrs.id!==m[2])return false;
   if(m[1]==='.'&&!(node.attrs.class??'').split(' ').includes(m[2]))return false;
   if(m[3]&&(!(m[3]in node.attrs)||(m[4]!==undefined&&node.attrs[m[3]]!==m[4])))return false;
  }return true;
 }
 function matches(node,selector) {const parts=selector.trim().split(/\s+(?=[^\]]*(?:\[|$))/);if(parts.length===1)return simple(node,selector);const last=parts.pop();if(!simple(node,last))return false;for(let p=node.parent;p;p=p.parent)if(matches(p,parts.join(' ')))return true;return false;}
 const select=(selector,within=nodes)=>within.filter(n=>selector.split(',').some(s=>matches(n,s.trim())));
 const document={querySelector:s=>select(s)[0]??null,querySelectorAll:s=>select(s),getElementById:id=>nodes.find(n=>n.attrs.id===id),activeElement:null,listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}};
 for(const node of nodes) {
  node.listeners={};node.hidden='hidden'in node.attrs;
  Object.defineProperty(node,'textContent',{get(){return textOf(node);},set(value){node.own=String(value);node.children=[];}});
  node.dataset=new Proxy({}, {get:(_,key)=>node.attrs['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())],set:(_,key,v)=>{node.attrs['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v);return true;},deleteProperty:(_,key)=>{delete node.attrs['data-'+key];return true;}});
  node.value=node.attrs.value??(node.tag==='select'?node.children.find(n=>n.tag==='option')?.attrs.value??node.children.find(n=>n.tag==='option')?.own:'');
  node.addEventListener=(type,fn)=>{(node.listeners[type]??=[]).push(fn);};node.removeEventListener=(type,fn)=>{node.listeners[type]=(node.listeners[type]??[]).filter(f=>f!==fn);};
  node.setAttribute=(key,v)=>{node.attrs[key]=String(v);};node.getAttribute=key=>node.attrs[key]??null;
  node.querySelector=s=>select(s,descendants(node))[0]??null;node.querySelectorAll=s=>select(s,descendants(node));
  node.closest=s=>{for(let p=node;p;p=p.parent)if(matches(p,s))return p;return null;};
  node.contains=target=>target===node||descendants(node).includes(target);
  node.focus=()=>{document.activeElement=node;};node.showModal=()=>{node.open=true;node.querySelector('[autofocus]')?.focus();};node.close=()=>{node.open=false;};
  node.getBoundingClientRect=()=>({left:10,right:100,top:10,bottom:100});
 }
 context.document=document;vm.runInContext(script(html,'component-behaviour'),context);
 assert(document.activeElement===null,'Controller must not move focus on load');
 assert(!nodes.find(n=>n.attrs.id==='details-dialog').open,'Dialog must stay closed on load');
 function fire(node,type,extra={}) {const event={target:node,currentTarget:node,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of node.listeners[type]??[]){fn(event);if(event.stopped)break;}return event;}
 const q=document.querySelector;
 const identities=nodes.filter(n=>n.attrs['data-bind']||n.attrs['data-slot']);
 for(const mode of ['Worst case','Empty','One','Many','Demo']) {
  q('#data-mode').value=mode;fire(q('#data-mode'),'change');const d=context.GoldenData.view(mode);
  assert.equal(select('[data-slot]').filter(n=>!n.hidden).length,d.visible,`${mode}: visible row count`);
  assert.equal(q('#data-empty').hidden,d.visible!==0,`${mode}: empty state`);
  assert.equal(q('#data-progress').attrs['aria-valuetext'],d.progress);
  for(const n of select('[data-bind="count"]'))assert.equal(n.textContent,d.countLabel);
  assert.equal(identities.length,nodes.filter(n=>n.attrs['data-bind']||n.attrs['data-slot']).length,'Data changed node inventory');
 }
 fire(q('[data-clear]'),'click');assert.equal(q('#input-search-default').value,'');assert.equal(document.activeElement,q('#input-search-default'));
 const collapse=q('[data-collapse]');fire(collapse,'click');assert.equal(collapse.attrs['aria-expanded'],'false');const panelBody=document.getElementById(collapse.attrs['aria-controls']);fire(panelBody,'animationend');assert.equal(panelBody.hidden,true);fire(collapse,'click');assert.equal(collapse.attrs['aria-expanded'],'true');
 fire(q('#view-list'),'keydown',{key:'ArrowRight'});assert.equal(q('#view-activity').attrs['aria-selected'],'true');assert.equal(q('#tab-list').hidden,true);
 fire(q('button[data-density="compact"]'),'click');assert.equal(q('#density-receipt').textContent,'Compact rows');
 fire(q('#dialog-trigger'),'click');assert.equal(q('#details-dialog').open,true);assert(document.activeElement===q('#dialog-close'),'Opening dialog must focus Close');fire(q('#details-dialog'),'cancel');assert.equal(q('#details-dialog').dataset.state,'closing');fire(q('#details-dialog'),'animationend');assert.equal(q('#details-dialog').open,false);assert.equal(document.activeElement,q('#dialog-trigger'));
 fire(q('#dialog-trigger'),'click');fire(q('#details-dialog'),'click',{clientX:0,clientY:0});fire(q('#details-dialog'),'animationend');assert.equal(q('#details-dialog').open,false,'Backdrop close');
 fire(q('#dialog-trigger'),'click');fire(q('#dialog-close'),'click');fire(q('#details-dialog'),'animationend');assert.equal(q('#details-dialog').open,false,'Close button');assert.equal(document.activeElement,q('#dialog-trigger'));
 fire(q('#menu-trigger'),'click');assert.equal(q('#live-menu').hidden,false);fire(q('#live-menu'),'keydown',{key:'End'});assert(document.activeElement.textContent.includes('Delete'));fire(q('#live-menu'),'keydown',{key:'Escape'});assert.equal(q('#live-menu').inert,true);fire(q('#live-menu'),'animationend');assert.equal(q('#live-menu').hidden,true);assert.equal(document.activeElement,q('#menu-trigger'));
 fire(q('#menu-trigger'),'contextmenu');fire(document,'pointerdown',{target:q('#theme')});fire(q('#live-menu'),'animationend');assert.equal(q('#live-menu').hidden,true,'Outside click closes menu');
 const tooltipHost=q('#tooltip-trigger').closest('.gc-tooltip-host');fire(tooltipHost,'keydown',{key:'Escape'});assert.equal(q('#export-tip').dataset.dismissed,'true');fire(tooltipHost,'focusin');assert.equal(q('#export-tip').dataset.dismissed,undefined);
 fire(q('#toast-trigger'),'click');assert.equal(q('#live-toast').hidden,false);q('#toast-undo').focus();fire(q('#toast-undo'),'click');fire(q('#live-toast'),'animationend');assert.equal(q('#live-toast').hidden,true);assert.equal(q('#action-receipt').textContent,'Archive undone');assert.equal(document.activeElement,q('#toast-trigger'));
 for(const pack of packs){q('#theme').value=pack;fire(q('#theme'),'change');assert.equal(q('#theme-pack').href,`../themes/${pack}/theme.css`);fire(q('#theme-pack'),'load');assert(q('#mode-receipt').textContent.includes(pack));}
}

function mockupReport() {
 const tokens=['../jig-pages.css','../typography/type.css','../themes/white-board/theme.css','../motion-lab/tokens.css','application-tokens.css'].map(name=>({name:fileURLToPath(new URL(name,here)),text:read(name)}));
 const report=checkMockup({html:read('index.html'),file:fileURLToPath(new URL('index.html',here)),ledger:ledgerIds(read('README.md')),tokens,styles:[{name:'components.css',text:read('components.css')},{name:'application.css',text:read('application.css')}]});
 assert.equal(report.status,'passed',JSON.stringify(report,null,2));return report;
}

export function run() {
 const result=validate();mockupReport();
 // In-memory mutations leave the shared working tree untouched.
 const css=read('components.css'), html=read('index.html');
 const seeds=[
  ['raw colour',()=>validate({css:css+'\n.gc-button { color:#ff0000; }'})],
  ['raw size',()=>validate({css:css+'\n.gc-button { padding:13px; }'})],
  ['unknown token',()=>validate({css:css+'\n.gc-button { color:var(--missing-component-token); }'})],
  ['missing hover style',()=>validate({css:css.replace('.gc-button:hover','.gc-button:removed')})],
  ['layout transition',()=>validate({css:css+'\n.gc-button { transition:height var(--duration-feedback); }'})],
  ['transition all',()=>validate({css:css+'\n.gc-button { transition:all var(--duration-feedback); }'})],
  ['missing state',()=>validate({html:html.replace('data-state="focus-visible"','data-state="removed"')})],
  ['unnamed icon button',()=>validate({html:html.replace('aria-label="More options"','')})],
  ['wrong singular',()=>validate({html:html.replace("n === 1 ? '' : 's'","n === 0 ? '' : 's'")})],
  ['data mode rebuild',()=>validate({html:html.replace("const d=GoldenData.view(mode);","const d=GoldenData.view(mode); document.body.innerHTML='';")})],
  ['broken clear action',()=>validate({html:html.replace("field.value='';","field.value='not cleared';")})],
  ['load autofocus',()=>validate({html:html.replace('id="dialog-close"','id="dialog-close" autofocus')})],
  ['load focus call',()=>validate({html:html.replace("applyData('Demo');","applyData('Demo'); q('#theme').focus();")})],
  ['missing modal focus',()=>validate({html:html.replace("q('#dialog-close').focus({preventScroll:true});",'')})],
  ['grey primary feedback',()=>validate({css:css+'\n.gc-button--primary[data-state=hover] { background:var(--surface-hover); color:var(--text-primary); }'})],
  ['grey destructive feedback',()=>validate({css:css+'\n.gc-button--destructive[data-state=hover] { background:var(--surface-hover); color:var(--text-primary); }'})]
 ];
 const reasons={"raw colour":"Raw colour","raw size":"Raw dimension","unknown token":"unknown token","missing hover style":"missing native hover","layout transition":"Forbidden transition: height","transition all":"Forbidden transition: all","missing state":"button-primary missing focus-visible","unnamed icon button":"Unnamed icon-only button","wrong singular":"1 items","data mode rebuild":"must not rebuild","broken clear action":"not cleared"};
 Object.assign(reasons,{'load autofocus':'No autofocus on load','load focus call':'must not move focus on load','missing modal focus':'Opening dialog must focus Close','grey primary feedback':'primary hover lost role colour','grey destructive feedback':'destructive hover lost role colour'});
 for(const [name,seed]of seeds)assert.throws(seed,new RegExp(reasons[name]),`Seed was not detected for its intended reason: ${name}`);
 validate();
 console.log(`Components passed: ${result.components} legacy contracts + ${result.applicationComponents} application components, ${result.stateRequirements} legacy state requirements, ${result.packs} packs, ${result.dataModes} data modes. Controller replay and mockup-check passed. ${seeds.length} defect seeds rejected; clean sources passed again. Application interactions require verify-application.mjs.`);
 console.log('Static source and lightweight DOM replay only. No browser, layout, contrast, paint, native keyboard/focus, screen reader, motion feel or macOS proof.');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{run();}catch(error){console.error(error.stack);process.exitCode=1;}
