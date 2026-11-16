// Generic scenes on the extracted stage lifecycle. Final facts are committed before animation.
const group=chapter('Everyday motion','Compare a change at normal speed, then replay at a slower speed.');
function sample(id,title,caption,content,run,fallback) {
 const s=stage(group,id,title,caption,'<div class="scene">'+content+'</div>',fallback);s.run=()=>run(s);return s;
}
const block='<div class="block">Item</div>';
sample('easing','Easing comparison','One distance and duration: linear, ease out and a settling spring.',
 ['Linear','Ease out','Spring'].map(t=>'<div class="sample"><h4>'+t+'</h4>'+block+'</div>').join(''),s=>{
 s.all('.block').forEach((n,i)=>s.animate(n,i===2?springTranslation({x:-24,y:0},{x:0,y:0}):[{transform:'translateX(-24px)'},{transform:'translateX(0)'}],duration('arrival'),i===1?'var(--ease-enter)':'var(--ease-constant)'));s.report('All three arrived');
},'All items remain at their destination.');
sample('arrival','Arrival and leave','An item enters from its source, holds, then leaves.',block,s=>{
 const n=s.q('.block');s.animate(n,[{transform:'translateX(-24px)',opacity:0},{transform:'translateX(0)',opacity:1}],duration('arrival'));
 s.after(duration('arrival')+timings.receipt,()=>{n.style.opacity='0';s.animate(n,[{transform:'translateX(0)',opacity:1},{transform:'translateX(24px)',opacity:0}],duration('leaving'),'var(--ease-exit)');s.report('Item removed');},true);
},'The item is removed; the receipt remains.');
sample('state-change','State change','The chip changes in place, without changing its width.','<span class="chip">Working</span>',s=>{
 const n=s.q('.chip');n.textContent='Done';s.animate(n,[{opacity:0},{opacity:1}],duration('state'));s.report('Done');
},'The chip reads Done.');
sample('fold','Fold and unfold','Children gather into their group, then return to their places.','<div><span class="chip">2 items</span><div class="children">'+block+block+'</div></div>',s=>{
 const n=s.q('.children');n.style.opacity='0';s.animate(n,[{transform:'scale(1)',opacity:1},{transform:'scale(.95)',opacity:0}],duration('fold'),'var(--ease-move)');
 s.report('2 items folded');s.after(duration('fold')+timings.receipt,()=>{n.style.opacity='1';s.animate(n,[{transform:'scale(.95)',opacity:0},{transform:'scale(1)',opacity:1}],duration('fold'),'var(--ease-move)');s.report('2 items expanded');},true);
},'The count is retained while folded; children return in place.');
sample('panel-open','Panel open','A panel grows from the edge of its tab.','<div class="block panel">Details panel</div>',s=>{
 const n=s.q('.panel');n.style.transformOrigin='left bottom';s.animate(n,[{transform:'scale(.95)',opacity:0},{transform:'scale(1)',opacity:1}],duration('dock'),'var(--ease-drawer)');s.report('Details open');
},'The details panel is open.');
sample('numbers','Number changes','A growing count rises; a shrinking count settles downward.','<output class="value" aria-label="Item count">24</output>',s=>{
 const n=s.q('.value');n.textContent='25';s.animate(n,[{transform:'translateY(8px)',opacity:0},{transform:'translateY(0)',opacity:1}],duration('placement'));s.report('25 items');
 s.after(duration('placement')+timings.receipt,()=>{n.textContent='24';s.animate(n,[{transform:'translateY(-8px)',opacity:0},{transform:'translateY(0)',opacity:1}],duration('placement'));s.report('24 items');},true);
},'The exact new count replaces the old count in place.');
function flowScene(){return '<svg class="flow-map" viewBox="0 0 360 110" role="img" aria-label="Source connected to destination"><path class="route" d="M56 54 H304" fill="none" stroke="currentColor" stroke-width="2"/><path d="M296 48l8 6-8 6" fill="none" stroke="currentColor" stroke-width="2"/><text x="8" y="92">Source</text><text x="246" y="92">Destination</text><g class="transfer" style="opacity:0"><circle cx="56" cy="54" r="5" fill="currentColor"/></g></svg>';}
for(const [id,title] of [['edge-flow','Edge flow'],['single-dot','Single dot'],['comet','Comet trail'],['message-bursts','Message bursts']])sample(id,title,'A finite transfer follows the connection, then rests.',flowScene(),s=>{
 const map=s.q('.flow-map'),route=s.q('.route');
 if(id==='edge-flow'){s.animate(route,[{strokeDasharray:'8 6',strokeDashoffset:28},{strokeDasharray:'8 6',strokeDashoffset:0}],duration('flow'),'var(--ease-constant)');s.after(duration('flow'),()=>s.report('Destination received 1'));return;}
 const count=id==='message-bursts'?5:1;
 for(let i=0;i<count;i++)s.after(i*timings.feedback,()=>{
 const n=s.q('.transfer').cloneNode(true);n.style.opacity='0';map.append(n);
 if(id==='comet')n.innerHTML='<path d="M16 54H56" stroke="currentColor" stroke-width="4" opacity=".2"/>'+n.innerHTML;
 if(!reduced)s.animate(n,[{transform:'translateX(0)',opacity:0},{transform:'translateX(12px)',opacity:1,offset:.05},{transform:'translateX(236px)',opacity:1,offset:.95},{transform:'translateX(248px)',opacity:0}],duration('flow'),'var(--ease-constant)');
 s.after(duration('flow'),()=>n.remove());
 },false);
 s.after((count-1)*timings.feedback+duration('flow'),()=>s.report('Destination received '+count));
},'The receiver count records the transfer without a travelling dot.');
sample('perimeter-draw','Perimeter draw','One event outline draws once; it does not mean selection.',
 '<svg class="event-map" viewBox="0 0 200 90" role="img" aria-label="Item passed"><rect class="event-outline" x="8" y="8" width="184" height="74" rx="8" pathLength="1" fill="none" stroke="currentColor" stroke-width="2"/><text x="32" y="50">Item passed</text></svg>',s=>{
 const n=s.q('.event-outline');
 s.animate(n,[{strokeDasharray:'1',strokeDashoffset:1},{strokeDasharray:'1',strokeDashoffset:0}],duration('flow'),'var(--ease-constant)');
 s.report('Passed: event outline complete');
},'Passed remains visible with a steady outline.');
sample('halo','Halo','Selection is a steady outline and halo, without a travelling edge.',
 '<div class="selection-wrap"><span class="selection-halo"></span><div class="block">Selected item</div></div>',s=>{
 s.animate(s.q('.selection-halo'),[{opacity:0},{opacity:1}],duration('state'));
 s.report('Selected');
},'A steady outline and Selected label remain.');
sample('breathing','Breathing','Slow liveness feedback; after 30 seconds without real events it rests.',
 '<div class="selection-wrap"><span class="selection-halo"></span><div class="block">Working</div></div>',s=>{
 const n=s.q('.selection-halo');
 function breath(){if(reduced)return;s.animate(n,[{opacity:.25},{opacity:1,offset:.5},{opacity:.25}],3600,'var(--ease-hover)');}
 breath();for(let t=3600;t<28800;t+=3600)s.after(t,breath);
 s.afterWall(30000,()=>{s.anims.forEach(a=>a.cancel());s.q('.block').textContent='Quiet: no new events';s.report('Liveness stopped after 30 seconds without events');});
 s.report('Working: real event received');
},'Working stays labelled; motion off uses a steady outline.');
sample('attention-loop','Attention loop','Blocking question: fast initial breaths, then sparse pulses. Hover, focus or open to acknowledge.',
 '<div class="selection-wrap"><span class="selection-halo"></span><button class="block" type="button">Question needs you</button></div>',s=>{
 const n=s.q('.selection-halo'),button=s.q('.block');
 function pulse(ms){if(!reduced)s.animate(n,[{opacity:.25},{opacity:1,offset:.5},{opacity:.25}],ms,'var(--ease-hover)');}
 const seen=()=>{s.cancel();s.report('Seen; question still needs an answer');};
 button.onpointerenter=seen;button.onfocus=seen;button.onclick=seen;
 if(!reduced){for(let t=0;t<3600;t+=900)s.after(t,()=>pulse(900));
 // Bounded lab preview; the application continues sparse pulses until seen.
 for(let t=9600;t<30000;t+=6000)s.after(t,()=>pulse(900));}
 s.afterWall(30000,()=>s.report('Preview ended; static question remains'));
 s.report('Blocking question; Stop all pauses the preview');
},'The question stays visible and labelled without pulsing.');
sample('flip-collapse','FLIP collapse','The leaving item exits outside layout while its sibling closes the gap.',
 '<div class="collapse-list"><div class="block leaving">Remove me</div><div class="block survivor">Keep me</div></div>',s=>{
 const leaving=s.q('.leaving'),survivor=s.q('.survivor');
 const first=survivor.getBoundingClientRect(),box=leaving.getBoundingClientRect();
 const listBox=s.q('.collapse-list').getBoundingClientRect();
 leaving.style.position='absolute';leaving.style.boxSizing='border-box';leaving.style.width=box.width+'px';leaving.style.top=box.top-listBox.top+'px';leaving.style.left=box.left-listBox.left+'px';
 leaving.setAttribute('aria-hidden','true');leaving.inert=true;
 const last=survivor.getBoundingClientRect();
 s.animate(leaving,[{opacity:1},{opacity:0}],duration('leaving'));
 s.animate(survivor,[{transform:`translate(${first.left-last.left}px, ${first.top-last.top}px)`},{transform:'none'}],duration('placement'),'var(--ease-move)');
 s.after(duration('placement'),()=>{leaving.remove();s.report('Removed; gap closed');});
},'Only Keep me remains, with no reserved gap.');
function applyReduced(){
 document.body.classList.toggle('reduced',reduced);reducedInput.checked=reduced;
 for(const s of stages){const active=s.active;s.cancel();if(active)s.start();}
 for(const k of Object.keys(timings))document.documentElement.style.setProperty('--motion-'+k,(reduced?reducedDuration:timings[k])+'ms');
}
reducedInput.onchange=()=>{reduced=reducedInput.checked;applyReduced();};media.addEventListener('change',e=>{reduced=e.matches;applyReduced();});
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{const s=stages.find(s=>s.q('.stage-body')===entry.target);s.visible=entry.isIntersecting;if(!s.visible)s.cancel();}),{threshold:.08});
stages.forEach(s=>observer.observe(s.q('.stage-body')));
$('#timings').innerHTML=Object.entries(timings).map(([k,v])=>'<label>'+k+' <input type="number" min="40" max="2000" step="10" data-timing="'+k+'" value="'+v+'" aria-label="'+k+' milliseconds"></label>').join('')+'<button id="reset-timing">Reset timing</button>';
function setTiming(k,v){timings[k]=v;document.documentElement.style.setProperty('--motion-'+k,(reduced?reducedDuration:v)+'ms');}
$$('[data-timing]').forEach(input=>input.onchange=()=>{const value=Math.max(40,Math.min(2000,Number(input.value)||storedTimings[input.dataset.timing]));input.value=value;setTiming(input.dataset.timing,value);});
$('#reset-timing').onclick=()=>$$('[data-timing]').forEach(input=>{input.value=storedTimings[input.dataset.timing];setTiming(input.dataset.timing,Number(input.value));});
function stopAll(){stages.forEach(s=>{s.cancel();s.report('Stopped','pause');});}
$('#stop-all').onclick=stopAll;document.addEventListener('keydown',e=>{if(e.key==='Escape')stopAll();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
applyReduced();
window.motionLab={springAt,springFrames,timings,stages,get reduced(){return reduced;}};
