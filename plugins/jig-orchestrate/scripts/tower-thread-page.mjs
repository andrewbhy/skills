import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
export { parseMessage } from './tower-message.mjs';
import { parseMessage, messageClient, messageCss } from './tower-message.mjs';
// The focused thread page (/t/<id>): header bar (back, state or done), the artifact beside the conversation, a box to write in.
import { esc, pageCss, formatTowerTime } from './tower-core.mjs';
import { brandCss, brandHtml, faviconLink } from './tower-brand.mjs';
import { attachClient, attachCss } from './tower-attach.mjs';
import { lightboxCss, lightboxHtml, lightboxScriptFor } from './tower-lightbox.mjs';
import { artifactHref, selectThreadArtifact } from './tower-thread-artifacts.mjs';

// Shared with the browser so attribution can be checked without launching it.
export { messageAuthor, bindThreadOwnership } from './tower-thread-chat.mjs';
import { messageAuthor, bindThreadOwnership, renderThreadMessages, postThreadMessage } from './tower-thread-chat.mjs';

export function threadPage(id) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tower: ${esc(id)}</title>${faviconLink}
<style>${pageCss}${brandCss}${lightboxCss}${attachCss}${messageCss}
.fin .attbtn{align-self:flex-end}form.dropping{background:#2563eb14}.thumbs{max-width:48rem;margin:0 auto 8px}
html,body{height:100%}body{display:flex;flex-direction:column;font-size:17px;margin:0}
.hdr{gap:12px}
.hdr h1{margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr .st{font-size:.85em;padding:3px 10px;border-radius:99px;background:#8882;border:1px solid #8884}
[hidden]{display:none!important}
#main{flex:1;display:flex;min-height:0}
#art{flex:0 0 var(--aw,58%);min-width:0;display:flex;flex-direction:column}
#artnote{font-size:.8em;padding:3px 12px;border-bottom:1px solid #8884;background:#8881;color:#888}#artnote[hidden]{display:none}#artnote a{color:inherit;text-decoration:underline}
.hdr .st small{font-size:.8em;opacity:.75}
#art iframe{flex:1;border:0;background:#fff;width:100%}
#artview{flex:1;min-height:0;display:flex;overflow:auto;align-items:center;justify-content:center;flex-wrap:nowrap;margin:0}
#artview iframe{height:100%;min-height:0;align-self:stretch}
#artimage{max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in}
#artcontrols{display:flex;gap:12px;align-items:center;padding:6px 12px;border-bottom:1px solid #8884;font-size:.85em}
#artstatus{flex:1;min-width:0;overflow-wrap:anywhere}
#artcontrols label{white-space:nowrap;cursor:pointer}
#artstrip{display:flex;flex:none;gap:8px;overflow-x:auto;padding:8px;border-bottom:1px solid #8884}
#artstrip:empty{display:none}
#artstrip button{flex:0 0 92px;min-height:64px;padding:4px;background:transparent;color:inherit;border:1px solid #8888;border-radius:6px;font-size:.75em;overflow-wrap:anywhere}
#artstrip button[aria-pressed="true"]{outline:2px solid #2563eb;outline-offset:-2px}
#artstrip img{display:block;width:80px;height:48px;object-fit:contain;margin:auto}
#div{flex:0 0 7px;cursor:col-resize;background:#8883;border-left:1px solid #8884;border-right:1px solid #8884;touch-action:none}
#div:hover,#div.drag{background:#2563eb88}
#main.drag iframe{pointer-events:none}
#main.noart #art,#main.noart #div{display:none}
#pane{flex:1;min-width:0;display:flex;flex-direction:column}
#scroll{flex:1;overflow-y:auto;padding:16px 24px}
#msgs{max-width:48rem;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.m{max-width:92%;padding:9px 13px;border-radius:12px;overflow-wrap:anywhere;line-height:1.5}
.m .p+.p,.m .p+ol,.m .p+ul,.m ol+.p,.m ul+.p{margin-top:.5em}.m ol,.m ul{margin:0;padding-left:1.5em}
.m a,.m a:visited{color:inherit;text-decoration:underline}
.m.coordinator a,.m.coordinator a:visited{color:#1d4ed8}
.m.system{align-self:center;max-width:95%;background:none;color:#888;font-size:.85em;padding:2px 8px;border-radius:0;border-left:2px solid #8886;font-style:italic}
.m.system .by{display:inline;margin-right:6px}
#note{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:6px 20px;border-bottom:1px solid #8884;font-size:.88em;background:#8881}
#note[hidden]{display:none}
#note .hint{color:#a16207;margin:0;max-width:none;font-size:1em}#note button{padding:2px 10px;font-size:.9em}
#cform{display:flex;gap:8px;align-items:center}#cform input{font:inherit;padding:4px 8px;border:1px solid #8888;border-radius:6px;background:transparent;color:inherit;min-width:18rem}
.hdr .st.waiting-you{background:#2563eb22;border-color:#2563eb88}.hdr .st.waiting-coordinator{background:#c2410c22;border-color:#c2410c88}.hdr .st.blocked{background:#7c3aed22;border-color:#7c3aed88}
.m .by{display:block;font-size:.72em;color:#888;margin-bottom:2px}
.m .reply-action{float:right;margin-left:12px;padding:2px 8px;min-height:32px;background:transparent;color:inherit;border:1px solid currentColor;font-size:.75em;opacity:0}
.m:hover .reply-action,.m:focus-within .reply-action{opacity:1}
.m:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
#replychip{max-width:48rem;margin:0 auto 8px;display:flex;align-items:center;gap:8px;padding:6px 8px;border-left:3px solid #2563eb;background:#8882;box-sizing:border-box}
#replylabel{flex:1;min-width:0;overflow-wrap:anywhere;font-size:.85em}
#cancelreply{padding:2px 8px;min-width:32px;min-height:32px;background:transparent;color:inherit;border:1px solid #8888}
@media(hover:none){.m .reply-action{opacity:1}}
.m.person{align-self:flex-end;background:#2563eb;color:#fff}.m.person .by{color:#dbe6ff}
.m.coordinator{align-self:flex-start;background:#8882;border:1px solid #8884}
.m.agent{align-self:center;max-width:95%;background:none;color:#888;font-size:.85em;padding:2px 8px;border-radius:0;border-left:2px solid #8886}
.m.agent .by{display:inline;margin-right:6px}
.tw{border:1px solid #8885;border-radius:8px;padding:6px 10px;margin:0 0 10px;font-size:.88em}.tw h4{margin:0 0 4px;font-size:.9em}.tw .twr{display:grid;grid-template-columns:minmax(0,1.2fr) 5.5em 7em minmax(0,2fr) 3em;gap:8px;padding:2px 0;border-top:1px solid #8883}.tw .twr span{overflow-wrap:anywhere}.tw .twr .dim{color:#767676}
.earlier{align-self:stretch;font-size:.8em;color:#767676;text-align:center}.m.earliernote{align-self:stretch;max-width:100%;opacity:.75;background:none;border:1px dashed #8886;font-size:.9em}
.newline{align-self:stretch;text-align:center;font-size:.8em;color:#2563eb;margin:10px 0 6px}
.state{max-width:48rem;margin:6px auto 0;font-size:.85em;color:#c2410c;min-height:1.2em}
.empty{color:#888;text-align:center;margin:40px 0}
form{border-top:1px solid #8884;padding:12px 24px 16px;background:inherit}
.fin{max-width:48rem;margin:0 auto;display:flex;gap:10px;align-items:flex-end}
textarea{flex:1;font:inherit;padding:9px 12px;border:1px solid #8888;border-radius:10px;resize:none;min-height:2.9em;max-height:12em;background:transparent;color:inherit}
textarea:focus{outline:2px solid #2563eb;border-color:transparent}
button{font:inherit;padding:9px 18px;border:0;border-radius:10px;background:#2563eb;color:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}
button.sec{background:transparent;color:inherit;border:1px solid #8888;padding:7px 14px}
button.ok{background:#15803d}
.hint{max-width:48rem;margin:4px auto 0;font-size:.78em;color:#888}
@media (min-width:1600px){body{font-size:20px}}
@media (min-width:2400px){body{font-size:24px}}
@media (max-width:1199px){#main{flex-direction:column}#art{flex:0 0 42%}#div{display:none}}
@media (prefers-color-scheme:dark){.m.coordinator a,.m.coordinator a:visited{color:#8bb8ff}#note .hint{color:#facc15}.m.person{background:#3b6fd4}.state{color:#fb923c}button.ok{background:#16a34a}}.hdr{flex-wrap:wrap}.hdr h1{white-space:normal}.owner-tools,.demo-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 24px;border-bottom:1px solid #8884}.owner-tools p{margin:0;flex:1;min-width:160px}.demo-tools{font-size:.85em}.demo-tools label{display:flex;gap:8px;align-items:center}select,input{font:inherit;max-width:100%}button:focus-visible,summary:focus-visible{outline:3px solid #2563eb;outline-offset:3px}button:hover{filter:brightness(.92)}#art{overflow:auto}#artifact{padding:24px;line-height:1.5}#owner-cue{overflow-wrap:anywhere}#map{padding:12px 24px}#map li{padding:4px 0}dialog{box-sizing:border-box;width:min(92vw,44rem);max-height:85vh;overflow:auto;border:1px solid #8888;border-radius:10px;background:Canvas;color:CanvasText;padding:24px}dialog::backdrop{background:#000a}dialog form{padding:0;border:0}dialog textarea{display:block;box-sizing:border-box;width:100%;margin:4px 0 12px}dialog label{display:block}dialog .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}#dismiss{margin-top:64px}#command{box-sizing:border-box;width:100%;min-height:9em}#feedback{min-height:1.5em}#lofi-banner{padding:8px 24px;border-bottom:1px solid #8884}#return-error{color:#b91c1c}#main{min-height:300px}#art{flex-basis:50%}#map ul{padding-left:24px}*{animation:none!important;transition:none!important}@media(max-width:600px){.hdr,.owner-tools,.demo-tools{padding:10px;gap:8px}#scroll{padding:12px}#f{padding:12px}.fin{flex-wrap:wrap}#box{width:100%;min-width:0}#main{flex:1;overflow:auto}#art{flex:none}#artifact{padding:12px}#pane{min-height:350px}dialog{padding:16px}.owner-tools button{min-height:44px}#map{padding:10px}}

.owner-tools button{min-height:44px}.owner-tools p{min-width:0;flex-basis:20rem}#feedback{margin:0;padding:0 24px}#box{min-width:0}#recipient,#owner-details{overflow-wrap:anywhere}#panel{color-scheme:light dark}#panel textarea{max-height:none}#return-error:empty{display:none}@media(prefers-color-scheme:dark){#return-error{color:#fca5a5}}
</style>
<div class="hdr tower-hdr">${brandHtml({ ground: 'dark' })}<button class="sec" id="back" type="button" title="Back to the dashboard (Esc)">&larr; Back</button><h1 id="title">${esc(id)}</h1><span class="st" id="st" hidden></span><a id="link" target="_blank" rel="noopener noreferrer" hidden></a><button class="sec" id="tog" type="button" hidden>Hide artifact</button><button class="sec" id="close" type="button" hidden>Close&hellip;</button><button class="sec" id="park" type="button" hidden>Park</button><button class="sec" id="reopen" type="button" hidden>Reopen</button><button class="ok" id="done" type="button" hidden>Mark done</button></div>
<section class="owner-tools" aria-label="Thread owner"><p id="owner-cue" tabindex="0" role="status" aria-live="polite">Reading ownership…</p><button id="owner-detail" class="sec" type="button">Owner details</button><button id="give" type="button" disabled>Give to session</button><button id="return" class="sec" type="button" disabled>Return…</button><button id="owner-retry" class="sec" type="button" hidden>Retry reading</button></section><p id="feedback" role="status" aria-live="polite"></p><div id="note" hidden></div>
<div id="main" class="noart"><div id="art"><div id="artnote" hidden></div><div id="artcontrols"><span id="artstatus" role="status"></span><label><input id="followlatest" type="checkbox" checked> Follow latest</label></div><div id="artstrip" role="group" aria-label="Thread artifacts"></div><div id="artview" class="att"></div></div><div id="div" role="separator" aria-orientation="vertical" title="Drag to resize"></div>
<div id="pane"><div id="scroll"><div id="topicwork" hidden></div><div id="msgs"></div><div class="state" id="state"></div></div>
<form id="f"><div id="replychip" hidden><span id="replylabel" role="status"></span><button id="cancelreply" type="button" aria-label="Cancel reply" title="Cancel reply (Esc)">X</button></div><div id="thumbhost"></div><div class="fin"><span id="attbtnhost"></span><textarea id="box" rows="2" placeholder="Write to the coordinator, or paste an image" maxlength="4000" autofocus></textarea><button id="send">Send</button></div>
<p class="hint" id="recipient">To: reading ownership…</p><div class="hint">Enter sends, Shift+Enter adds a line. Paste or drop an image to attach it. Focus a message and press R to reply. Esc cancels a reply, otherwise goes back.</div></form></div></div>
<dialog id="panel" aria-labelledby="panel-title"><h2 id="panel-title"></h2><div id="give-content" hidden><p>Open Claude or Codex yourself, then paste the matching first prompt below. Ownership changes when that session claims the thread.</p><label for="command">Session start instructions</label><textarea id="command" readonly></textarea><button id="copy">Copy start instructions</button></div><div id="owner-details" hidden></div><form id="return-form" novalidate hidden><p>Take this thread back and return it to the coordinator? Add a note if you want. Generation <span id="return-generation"></span>.</p><div id="return-fields"></div><p id="return-error" role="alert"></p><div class="actions"><button id="confirm-return" type="submit">Return to coordinator</button></div></form><button id="dismiss" class="sec">Cancel</button></dialog>

${lightboxHtml}<script>${lightboxScriptFor('.att img')}</script>
<script>
${bindThreadOwnership.toString()}
${renderThreadMessages.toString()}
${postThreadMessage.toString()}
${formatTowerTime.toString()}
${messageAuthor.toString()}
${attachClient}
${parseMessage.toString()}
${messageClient}
${artifactHref.toString()}
${selectThreadArtifact.toString()}
const id=${JSON.stringify(id)},seenKey='jig-review-tseen',splitKey='jig-thread-split',hideKey='jig-thread-hide';
const $=x=>document.getElementById(x);
let last='',busy=false,info=null,artSrc=null,paneSrc=null;
let replyTo=null;
function setReply(message){
  if(message&&busy)return;
  replyTo=message?replyReference(message):null;
  $('replychip').hidden=!replyTo;
  $('replylabel').textContent=replyTo?replyTo.from+' · '+clock(replyTo.at)+' · '+replyTo.excerpt:'';
  $('box').focus();
}
$('cancelreply').addEventListener('click',()=>setReply(null));
let artCatalog={items:[],latest:null},artSelection={follow:true,href:null};
// Last-seen lives in the personal store on the server. The first response tells what was seen before this visit; that stays fixed
// for this page so the "new since you last looked" line does not move while the page is open.
let prevSeen=null,firstLoad=true,fileEdited=false,postedAt='';
function postSeen(msgs){
  const newest=msgs.length?msgs[msgs.length-1].at:'';
  if(!firstLoad&&newest===postedAt)return;
  firstLoad=false;postedAt=newest;
  fetch('/api/seen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'thread',id})}).catch(()=>{});
}
const clip=formatTowerTime;
const clock=formatTowerTime;
function setArt(link){
  const src=artifactHref(link);
  if(src!==artSrc){
    artSrc=src;paneSrc=src;const a=$('artview');a.textContent='';
    if(src){
      const item=artCatalog.items.find(item=>item.href===src);
      if(item&&item.image){const image=document.createElement('img');image.id='artimage';image.src=src+(src.startsWith('/f/')?'?raw=1':'');image.alt=item.label;a.append(image)}
      else{const f=document.createElement('iframe');f.src=src+'?embed=1';f.title='Artifact';a.append(f)}
    }
  }
  $('link').hidden=!src;if(src)$('link').href=safeHref(src);
  $('link').textContent='Open alone \u2197';$('link').title='Open the artifact alone in a new tab';
  $('tog').hidden=!src;
  const hide=!src||localStorage.getItem(hideKey)==='1';
  $('main').classList.toggle('noart',hide);
  $('tog').textContent=hide?'Show artifact':'Hide artifact';
}
(function(){const v=parseFloat(localStorage.getItem(splitKey));if(v>=20&&v<=80)$('main').style.setProperty('--aw',v+'%')})();
$('tog').addEventListener('click',()=>{localStorage.setItem(hideKey,localStorage.getItem(hideKey)==='1'?'0':'1');setArt(artSrc)});
$('div').addEventListener('pointerdown',e=>{
  const m=$('main'),d=$('div');d.setPointerCapture(e.pointerId);m.classList.add('drag');d.classList.add('drag');
  const mv=ev=>{const r=m.getBoundingClientRect();const p=Math.min(80,Math.max(20,(ev.clientX-r.left)/r.width*100));m.style.setProperty('--aw',p+'%');d.dataset.p=p};
  const up=()=>{d.removeEventListener('pointermove',mv);d.removeEventListener('pointerup',up);m.classList.remove('drag');d.classList.remove('drag');if(d.dataset.p)localStorage.setItem(splitKey,d.dataset.p)};
  d.addEventListener('pointermove',mv);d.addEventListener('pointerup',up);
});
function showInPane(path){
  const href=artifactHref(path);if(!href||!artCatalog.items.some(item=>item.href===href))return;
  localStorage.setItem(hideKey,'0');updateArtifacts({type:'pick',href});
}
function updateArtifacts(action){
  artSelection=selectThreadArtifact(artCatalog,artSelection,action);
  $('followlatest').checked=artSelection.follow;
  setArt(artSelection.href);
  const selected=artCatalog.items.find(item=>item.href===artSelection.href);
  $('artstatus').textContent=selected?[(selected.original?'original':''),(selected.href===artCatalog.latest&&selected.image?'latest':''),selected.label].filter(Boolean).join(' · '):'No artifact';
  for(const b of $('artstrip').children)b.setAttribute('aria-pressed',String(b.dataset.href===artSelection.href));
}
function renderArtifacts(catalog){
  artCatalog=catalog||{items:[],latest:null};
  const strip=$('artstrip');
  // Leave controls intact during polling so keyboard focus and horizontal scroll survive.
  const key=JSON.stringify(artCatalog.items);
  if(strip.dataset.key!==key){
    strip.dataset.key=key;strip.textContent='';
    for(const item of artCatalog.items){
      const b=document.createElement('button');b.type='button';b.dataset.href=item.href;
      b.title=item.label;b.setAttribute('aria-label',(item.original?'original: ':'')+item.label);
      if(item.image){const image=document.createElement('img');image.src=item.href+(item.href.startsWith('/f/')?'?raw=1':'');image.alt='';image.loading='lazy';b.append(image)}
      b.append(item.original?'original':item.label);b.addEventListener('click',()=>showInPane(item.href));strip.append(b);
    }
  }
  updateArtifacts();
}
$('followlatest').addEventListener('change',()=>updateArtifacts({type:'follow',on:$('followlatest').checked}));
function goBack(){
  let fromDash=false;
  try{const u=new URL(document.referrer);fromDash=u.origin===location.origin&&u.pathname==='/'}catch(e){}
  if(fromDash&&history.length>1)history.back();else location.href='/';
}
$('back').addEventListener('click',goBack);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.isComposing||e.defaultPrevented)return;
  if(ownershipUI.modalOpen())return;
  if(ownershipUI.closedRecently())return;
  if(replyTo){e.preventDefault();setReply(null);return}
  if(document.activeElement!==$('box'))goBack();
});
$('done').addEventListener('click',async()=>{
  if(ownershipUI.closedRecently()||!info||info.itemId==null)return;$('done').disabled=true;
  try{const r=await fetch('/api/items/'+info.itemId+'/done',{method:'POST'});if(r.ok){goBack();return}$('state').textContent='Not marked done: '+r.status}
  catch(e){$('state').textContent='Not marked done: server unreachable'}
  $('done').disabled=false;
});
function renderNote(d,open){
  const n=$('note');n.textContent='';
  const add=(t,cls)=>{const s=document.createElement('span');if(cls)s.className=cls;s.textContent=t;n.append(s);return s};
  const link=(t,href)=>{const a=document.createElement('a');a.textContent=t;a.href=safeHref(href);n.append(a)};
  if(d.kind==='review'&&d.closed){add('Closed by '+d.closed.by+': '+d.closed.reason);if(d.supersededBy){add('Continue in ');link('#'+d.supersededBy,'/t/item-'+d.supersededBy)}}
  if(d.supersedes&&d.supersedes.length){add('Replaces');d.supersedes.forEach(x=>link('#'+x,'/t/item-'+x))}
  if(d.blockedBy&&d.blockedBy.length){add('Blocked by');d.blockedBy.forEach(b=>{if(b.thread)link(b.label,'/t/'+b.thread);else add(b.label)})}
  if(d.blocks&&d.blocks.length){add('Blocks');d.blocks.forEach(b=>link('#'+b.id+' '+b.title,'/t/'+b.thread))}
  add(prevSeen?'Seen at '+clock(prevSeen)+(fileEdited?' · document edited since':''):'First time you open this');
  for(const x of d.decisionNotes||[])if(x.active)add((x.kind==='confirms'?'\u2713 ':'')+x.text,'hint dn-'+x.kind);
  if(d.stale&&open){
    const h=add('stale? Untouched for more than 3 days.','hint');
    const c=document.createElement('button');c.className='sec';c.textContent='Close';c.addEventListener('click',()=>post('close',{reason:'stale: untouched for more than 3 days'}));
    const k=document.createElement('button');k.className='sec';k.textContent='Keep';k.addEventListener('click',()=>post('keep'));
    n.append(c,k);
  }
  n.hidden=!n.childNodes.length&&$('cform')==null;
  if(showForm)addForm(n);
}
let showForm=false;
function addForm(n){
  n.hidden=false;
  const work=info&&info.kind==='work',parking=showForm==='park';
  const f=document.createElement('form');f.id='cform';
  const i=document.createElement('input');i.id='creason';i.placeholder=parking?'Why is it parked? (optional)':work?'Why is it closed? (optional)':'Why is this closed?';i.maxLength=300;i.setAttribute('aria-label','Reason');
  const ok=document.createElement('button');ok.textContent=parking?'Park':work?'Close':'Close item';
  const no=document.createElement('button');no.type='button';no.className='sec';no.textContent='Cancel';no.addEventListener('click',()=>{showForm=false;load(true)});
  f.append(i,ok,no);
  f.addEventListener('submit',e=>{e.preventDefault();const r=i.value.trim();if(!r&&!work){i.focus();return}post(parking?'park':'close',{reason:r})});
  n.append(f);
}
async function post(action,body){
  try{
    const url=info.kind==='work'?'/api/work/'+encodeURIComponent(id)+'/'+action:'/api/items/'+info.itemId+'/'+action;
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    if(r.ok){showForm=false;await load(true)}else $('state').textContent='Not saved: '+((await r.json().catch(()=>({}))).error||r.status);
  }catch(e){$('state').textContent='Not saved: server unreachable'}
}
$('park').addEventListener('click',()=>{if(info&&info.actions&&info.actions.includes('unpark')){post('unpark');return}showForm=showForm==='park'?false:'park';load(true);setTimeout(()=>{const i=$('creason');if(i)i.focus()},50)});
$('reopen').addEventListener('click',()=>post('reopen'));
$('close').addEventListener('click',()=>{showForm=showForm==='close'?false:'close';load(true);setTimeout(()=>{const i=$('creason');if(i)i.focus()},50)});
function render(d){
  if(firstLoad){prevSeen=d.seenAt||null;fileEdited=!!d.fileChanged}
  if(d.linkedThread){location.replace('/t/'+encodeURIComponent(d.linkedThread));return}
  info=d;
  ownershipUI.render(d.ownership);
  const addressee=d.addressee||'the coordinator';
  $('box').placeholder='Write to '+addressee+', or paste an image';
  $('box').setAttribute('aria-label','Write to '+addressee);
  $('title').textContent=d.title||id;document.title='tower: '+(d.title||id);
  const l=$('link');
  if(d.link&&d.link.startsWith('/f/')){l.href=safeHref(paneSrc||d.link);l.textContent='Open alone \u2197';l.title='Open the artifact alone in a new tab';l.hidden=false}else l.hidden=true;
  const st=$('st');
  st.hidden=false;st.className='st '+(d.status||'');
  st.textContent='';
  if(d.kind==='work'){
    st.className='st';
    const job=d.chip||d.state||'Work';
    if(d.unanswered){st.append('Your message is waiting for '+addressee);const s=document.createElement('small');s.textContent=' · Job: '+job.charAt(0).toLowerCase()+job.slice(1);st.append(s)}
    else st.textContent=job;
  }else st.textContent=d.statusLabel||'';
  const open=d.kind==='review'&&!d.done;
  const acts=d.actions||[];
  $('done').hidden=!acts.includes('done');$('close').hidden=!acts.includes('close');
  $('park').hidden=!(acts.includes('park')||acts.includes('unpark'));$('park').textContent=acts.includes('unpark')?'Unpark':'Park';
  $('reopen').hidden=!acts.includes('reopen');
  if(!acts.includes('close')&&!acts.includes('park'))showForm=false;
  renderNote(d,open);
  renderArtifacts(d.artifacts);
  const an=$('artnote');an.textContent='';
  const alink=(t,href)=>{const a=document.createElement('a');a.textContent=t;a.href=safeHref(href);an.append(a)};
  if(d.kind==='question'&&d.questionLines&&d.questionLines.length){an.style.whiteSpace='pre-line';an.append(d.questionLines.join('\\n'))}
  else if(d.kind==='work'&&d.docNote){an.append(d.docNote.name+': this document was reviewed and closed (');alink('#'+d.docNote.id,'/t/'+d.docNote.thread);an.append(')')}
  else if(d.kind==='work'&&d.openReview){an.append('Open review: ');alink('#'+d.openReview.id,'/t/'+d.openReview.thread)}
  an.hidden=!an.childNodes.length;
  const tw=$('topicwork');tw.textContent='';tw.className='tw';
  if(d.topicWork&&d.topicWork.length){
    const h=document.createElement('h4');h.textContent='Work on this topic';tw.append(h);
    for(const w of d.topicWork){
      const r=document.createElement('div');r.className='twr';
      const t0=Date.parse(w.progressAt||w.addedAt),mins=Number.isFinite(t0)?Math.max(0,Math.floor((Date.now()-t0)/60000)):null;
      const age=mins===null?'':mins>=1440?Math.floor(mins/1440)+'d':mins>=60?Math.floor(mins/60)+'h':mins+'m';
      for(const [txt,cls] of [[w.id,''],[w.kind||'work','dim'],[w.state,''],[w.progress||w.item,'dim'],[age,'dim']]){const c=document.createElement('span');c.textContent=txt;if(cls)c.className=cls;r.append(c)}
      tw.append(r);
    }
    tw.hidden=false;
  }else tw.hidden=true;
  renderThreadMessages({document, $, d, prevSeen, clock, clip, setReply, showInPane, fillMessage, attNodes});
  if(!$('state').textContent.startsWith('Not '))$('state').textContent='';
  postSeen(d.messages);
}
async function load(force){
  try{
    const response=await fetch('/api/threads/'+encodeURIComponent(id),{cache:'no-store'});
    if(!response.ok)throw new Error('Ownership unavailable');
    const t=await response.text();
    if(t===last&&!force)return;const first=last==='';last=t;render(JSON.parse(t));
    if(first)$('scroll').scrollTop=$('scroll').scrollHeight;
  }catch(e){ownershipUI.error()}
}
async function send(){
  const text=$('box').value.trim();if((!text&&!pics.length)||busy)return;busy=true;$('send').disabled=true;$('state').textContent='';
  try{
    const r=await postThreadMessage(fetch,id,{text,images:kit.payload(),replyTo});
    if(r.ok){$('box').value='';setReply(null);kit.clear();grow();await load(true);$('scroll').scrollTop=$('scroll').scrollHeight}
    else $('state').textContent='Not sent: '+((await r.json().catch(()=>({}))).error||r.status);
  }catch(e){$('state').textContent='Not sent: server unreachable'}
  busy=false;$('send').disabled=false;$('box').focus();
}
const pics=[];
const kit=attKit({host:$('f'),pasteOn:document,list:pics,onNote:t=>{$('state').textContent='Not attached: '+t}});
$('thumbhost').append(kit.strip);$('attbtnhost').append(kit.button,kit.input);
function grow(){const b=$('box');b.style.height='auto';b.style.height=Math.min(b.scrollHeight+2,200)+'px'}
$('box').addEventListener('input',grow);
$('box').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
$('f').addEventListener('submit',e=>{e.preventDefault();send()});
const ownershipUI=bindThreadOwnership({document,fetch,navigator,performance,id,reload:()=>load(true)});
load();setInterval(load,3000);
</script>`;
}
