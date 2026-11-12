/* Offline reference behaviour. No network, storage or real file operations. */
'use strict';
(() => {
 const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
 const root = document.documentElement, main = q('#app-main');
 const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
 const rate = () => Number(q('#motion-speed').value);
 const timing = name => parseFloat(getComputedStyle(root).getPropertyValue(name)) * rate();
 const easing = () => getComputedStyle(root).getPropertyValue('--ease-enter').trim();
 let keyboard = false, records = [], totalCount = 0, selected = new Set([0]), anchor = 0, activeView = 'workspace';
 let currentOverlay, overlayTrigger, lastTooltip = 0, paletteTrigger, undoStack = [];
 let pending = new Set(), playback = false, playStep = 0;
 const motions = new Map();
 const later = (fn, ms) => { const id = setTimeout(() => { pending.delete(id); fn(); }, ms); pending.add(id); return id; };
 const cancelPending = () => { for (const id of pending) clearTimeout(id); pending.clear(); for (const a of motions.values()) a.cancel(); motions.clear();q('#properties-body').hidden=q('#properties-trigger').getAttribute('aria-expanded')!=='true';q('#tree-files').hidden=q('#tree-folder').getAttribute('aria-expanded')!=='true'; };
 const status = message => { q('#app-status').textContent = message; };
 function animate(el, frames, duration = '--duration-popover', autonomous = false) {
  motions.get(el)?.cancel();
  if (keyboard && !autonomous || !el || document.hidden) return;
  const safe = reduced() ? frames.map(f => ({ opacity:f.opacity ?? 1 })) : frames;
  const animation = el.animate(safe, { duration:timing(duration), easing:easing() });
  motions.set(el, animation);
  animation.finished.then(() => { if (motions.get(el) === animation) motions.delete(el); }).catch(() => {});
  return animation;
 }
 document.addEventListener('keydown', () => { keyboard = true; root.dataset.input = 'keyboard'; }, true);
 document.addEventListener('pointerdown', () => { keyboard = false; root.dataset.input = 'pointer'; }, true);

 function showView(id, focus = false) {
  const section = document.getElementById(id);
  if (!section?.matches('.gc-section')) return;
  const scrolls = globalThis.GoldenApp?.scrolls ?? {};
  scrolls[activeView] = main.scrollTop;
  all('#app-main > .gc-section').forEach(el => { el.hidden = el !== section; });
  activeView = id; main.scrollTop = scrolls[id] || 0;
  all('[data-view]').forEach(el => { if (el.dataset.view === id) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  all('[data-editor-view]').forEach(el => { const active = (id === 'workspace') === (el.dataset.editorView === 'workspace'); el.setAttribute('aria-selected',String(active)); el.tabIndex = active ? 0 : -1; if(active)el.closest('.app-editor-tab').hidden = false;if(el.dataset.editorView!=='workspace')el.setAttribute('aria-controls',id==='workspace'?'buttons':id); });
  q('#app-explorer').dataset.revealed = 'false'; q('#explorer-toggle').setAttribute('aria-expanded','false');
  if (focus) { section.tabIndex = -1; section.focus({preventScroll:true}); }
  positionTooltips(); updateIndicators();
 }
 all('[data-view], .app-catalog a, #controls-title ~ nav a').forEach(el => el.addEventListener('click',e => { e.preventDefault();const menu=el.closest('[data-overlay]');showView(el.dataset.view || el.hash.slice(1), el.closest('#app-explorer') !== null); closeOverlay(false);if(menu)q('[data-editor-view][aria-selected=true]').focus(); }));
 all('#app-main nav a[href^="#"]').forEach(el => el.addEventListener('click',e => { e.preventDefault(); showView(el.hash.slice(1),true); }));
 all('[data-editor-view]').forEach(el => el.addEventListener('click',() => showView(el.dataset.editorView)));
 function updateIndicators() {
  for(const list of all('#tabs [role=tablist],.app-editor-tabs')) {
   const active=list.querySelector('[role=tab][aria-selected=true]');if(!active||!active.getBoundingClientRect().width)continue;
   let indicator=list.querySelector('.app-tab-indicator');
   if(!indicator){indicator=document.createElement('span');indicator.className='app-tab-indicator';indicator.setAttribute('aria-hidden','true');list.append(indicator);}
   const b=active.getBoundingClientRect(),host=list.getBoundingClientRect();
   indicator.style.width=Math.round(b.width/4)*4+'px';indicator.style.transform=`translateX(${Math.round((b.left-host.left)/4)*4}px)`;
  }
 }
 all('#tabs [role=tab]').forEach(el=>{el.addEventListener('click',updateIndicators);el.addEventListener('keydown',()=>queueMicrotask(updateIndicators));});
 all('[data-close-editor]').forEach(el => el.addEventListener('click',() => {
  const closed = el.dataset.closeEditor;
  showView(closed === 'workspace' ? 'buttons' : 'workspace');
  el.closest('.app-editor-tab').hidden = true;
  q('[data-editor-view][aria-selected=true]').focus();
 }));
 q('.app-editor-tabs').addEventListener('keydown',e => {
  const tabs = all('[data-editor-view]').filter(el => !el.closest('[hidden]'));
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let n;
  if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
  if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
  if (e.key === 'Home') n = 0; if (e.key === 'End') n = tabs.length - 1;
  if (n !== undefined) { e.preventDefault(); showView(tabs[n].dataset.editorView); tabs[n].focus(); }
 });
 function density(value) {
  root.dataset.density = value; q('#app-density').value = value;
  all('button[data-density]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.density === value)));
 }
 q('#app-density').addEventListener('change',e => density(e.target.value));
 all('button[data-density]').forEach(el => el.addEventListener('click',() => density(el.dataset.density)));
 q('#motion-speed').addEventListener('change',e => { root.dataset.speed = e.target.value; });
 function togglePane(id, trigger, force) {
  const pane = document.getElementById(id), open = force ?? pane.dataset.revealed !== 'true';
  pane.dataset.revealed = String(open); trigger.setAttribute('aria-expanded',String(open));
  if (open) { pane.tabIndex = -1; pane.focus({preventScroll:true}); }
  else trigger.focus();
 }
 q('#explorer-toggle').addEventListener('click',() => togglePane('app-explorer',q('#explorer-toggle')));
 q('#inspector-toggle').addEventListener('click',() => togglePane('app-inspector',q('#inspector-toggle')));
 q('#inspector-close').addEventListener('click',() => togglePane('app-inspector',q('#inspector-toggle'),false));

 // Shared, viewport-clamped placement for real open states (not pasted specimens).
 function position(el, trigger, point) {
  if (!trigger && !point) return;
  const rect = trigger?.getBoundingClientRect(), box = el.getBoundingClientRect();
  const inset = 12, gap = 4;
  let left = point?.x ?? rect.left, top = point?.y ?? rect.bottom + gap;
  if (top + box.height > innerHeight - inset) top = Math.max(inset,(point?.y ?? rect.top) - box.height - gap);
  left = Math.round(Math.max(inset,Math.min(left,innerWidth - box.width - inset)) / 4) * 4;
  top = Math.round(Math.max(inset,Math.min(top,innerHeight - box.height - inset)) / 4) * 4;
  el.style.left = left + 'px'; el.style.top = top + 'px';
  el.style.transformOrigin = `16px ${top < (rect?.top ?? top) ? 'bottom' : 'top'}`;
 }
 function closeOverlay(restore = true) {
  if (!currentOverlay) return;
  const el = currentOverlay, trigger = overlayTrigger;
  el.hidden = true; el.removeAttribute('data-visual-must-visible');
  trigger?.setAttribute('aria-expanded','false');
  currentOverlay = null; overlayTrigger = null;
  if (restore && trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({preventScroll:true});
 }
 function openOverlay(id, trigger, point) {
  closeOverlay(false);
  const el = document.getElementById(id);
  currentOverlay = el; overlayTrigger = trigger;
  el.hidden=true;void el.offsetWidth;
  el.hidden = false; el.dataset.keyboard = String(keyboard); el.setAttribute('data-visual-must-visible','');
  trigger?.setAttribute('aria-expanded','true'); position(el,trigger,point);
  const options = [...el.querySelectorAll('[role=menuitem],button,input')].filter(b => !b.disabled);
  if (el.getAttribute('role') === 'menu') options.forEach((b,i) => b.tabIndex = i ? -1 : 0);
  options[0]?.focus({preventScroll:true});
 }
 for (const [trigger,id] of [['#view-trigger','view-popover'],['#new-options','new-menu'],['#tab-overflow-trigger','tab-overflow']]) q(trigger).addEventListener('click',e => currentOverlay?.id === id ? closeOverlay() : openOverlay(id,e.currentTarget));
 all('[data-open]').forEach(el => el.addEventListener('click',() => openOverlay(el.dataset.open,el)));
 all('[data-dismiss-overlay]').forEach(el => el.addEventListener('click',() => closeOverlay()));
 document.addEventListener('pointerdown',e => {
  if (currentOverlay && !currentOverlay.contains(e.target) && !overlayTrigger?.contains(e.target)) closeOverlay(false);
 });
 all('[data-overlay]').forEach(menu => menu.addEventListener('keydown',e => {
  if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return; }
  if (e.key === 'Tab' && menu.getAttribute('role') === 'menu') { closeOverlay(); return; }
  if (menu.getAttribute('role') !== 'menu') return;
  const items = [...menu.querySelectorAll('[role=menuitem]')].filter(b => !b.disabled), i = items.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (i+1)%items.length : e.key === 'ArrowUp' ? (i-1+items.length)%items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : undefined;
  if (next !== undefined) { e.preventDefault(); items.forEach((b,j) => b.tabIndex = j === next ? 0 : -1); items[next].focus(); }
 }));
 // Retain the existing menu's tested behaviour, add anchored geometry.
 q('#live-menu').classList.add('app-overlay');
 q('#menu-trigger').addEventListener('click',e=>{q('#live-menu').dataset.keyboard=String(e.detail===0);},true);
 q('#live-menu').addEventListener('keydown',()=>{q('#live-menu').dataset.keyboard='true';},true);
 q('#dialog-trigger').addEventListener('click',e=>{q('#details-dialog').dataset.keyboard=String(e.detail===0);},true);
 q('#dialog-close').addEventListener('click',e=>{q('#details-dialog').dataset.keyboard=String(e.detail===0);},true);
 all('.gc-row').forEach(row=>row.addEventListener('click',e=>{q('#details-dialog').dataset.keyboard=String(e.detail===0);},true));
 q('#details-dialog').addEventListener('cancel',()=>{q('#details-dialog').dataset.keyboard='true';},true);
 q('#menu-trigger').addEventListener('click',() => { if (!q('#live-menu').hidden) position(q('#live-menu'),q('#menu-trigger')); });
 q('#menu-trigger').addEventListener('contextmenu',e => position(q('#live-menu'),q('#menu-trigger'),{x:e.clientX,y:e.clientY}));
 function positionTooltips() {
  all('.gc-tooltip-host').forEach(host => {
   const tip = host.querySelector('[role=tooltip]'), trigger = host.querySelector('button');
   if (!host.getBoundingClientRect().width) return;
   const r = trigger.getBoundingClientRect(), b = tip.getBoundingClientRect();
   const above = r.top > b.height + 16;
   const left = Math.max(12,Math.min(r.left,innerWidth-b.width-12));
   tip.style.left = Math.round(left/4)*4+'px';
   tip.style.top = Math.round((above ? r.top-b.height-4 : r.bottom+4)/4)*4+'px';
   tip.style.transformOrigin = '16px '+(above ? 'bottom' : 'top');
  });
 }
 all('.gc-tooltip-host').forEach(host => {
  const tip = host.querySelector('[role=tooltip]');
  for (const event of ['pointerenter','focusin']) host.addEventListener(event,() => {
   positionTooltips();
   const adjacent = performance.now()-lastTooltip < 750;
   if (!adjacent) animate(tip,[{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}]);
   lastTooltip = performance.now();
  });
 });
 document.addEventListener('scroll',() => {
  positionTooltips();
  if (currentOverlay && !currentOverlay.contains(document.activeElement)) closeOverlay(false);
 },true);
 window.addEventListener('resize',() => { closeOverlay(); positionTooltips(); });
 q('.app-breadcrumbs').addEventListener('keydown',e=>{if(e.target===e.currentTarget&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();e.currentTarget.scrollLeft+=(e.key==='ArrowRight'?40:-40);}});

 // Shared fixture boundary; DOM slots retain identity, draft, focus and selection.
 function applyFixture(mode) {
  const data = GoldenData.view(mode);
  totalCount=data.count;
  records = Array.from({length:data.visible},(_,i) => ({ id:i, name:data.rows[i].title, path:data.path, owner:mode === 'Worst case' || mode === 'Empty' ? null : 'Maya Chen', status:i%3 === 1 ? 'Review' : 'Ready' }));
  selected = new Set([...selected].filter(id => records.some(r => r.id === id)));
  if (!selected.size && records.length) selected.add(records[0].id);
  anchor = records[0]?.id ?? 0; undoStack = []; updateUndo(); render();
  q('#file-count').textContent = data.count.toLocaleString('en-US');
  q('#file-count').setAttribute('aria-label',data.countLabel);
 }
 function render() {
  const rows = all('#app-grid > .app-grid-row'), tree = all('#tree-files > [role=treeitem]');
  const focusedCell=document.activeElement.closest?.('#app-grid [role=gridcell]');
  rows.forEach((row,i) => {
   const rec = records[i]; row.hidden = !rec; tree[i].hidden = !rec;
   if (!rec) return;
   row.dataset.file = tree[i].dataset.file = String(rec.id);
   row.querySelector('.app-file-name').textContent = rec.name;
   row.querySelector('.app-file-name').title = rec.name;
   row.setAttribute('aria-selected',String(selected.has(rec.id)));
   tree[i].querySelector('span').textContent = rec.name;
   tree[i].setAttribute('aria-selected',String(selected.has(rec.id)));
   const cells = [...row.querySelectorAll('[role=gridcell]')];
   const chip=row.querySelector('.gc-chip');chip.textContent=rec.status;chip.classList.toggle('gc-chip--success',rec.status==='Ready');chip.classList.toggle('gc-chip--attention',rec.status==='Review');chip.classList.toggle('gc-chip--neutral',rec.status==='Draft');
   const avatar = row.querySelector('.app-avatar'); avatar.textContent = rec.owner ? 'MC' : '?'; avatar.setAttribute('aria-label',rec.owner || 'Unknown owner');
   avatar.nextElementSibling.textContent = rec.owner ? 'Maya' : 'Unknown';
   cells.forEach((cell,j) => cell.tabIndex = focusedCell ? (cell===focusedCell?0:-1) : (i === 0 && j === 0 ? 0 : -1));
  });
  q('#app-grid-empty').hidden = records.length > 0;
  q('.app-grid-scroll').hidden = records.length === 0;
  q('#app-grid').setAttribute('aria-rowcount',String(records.length+1));
  q('#file-count').textContent=totalCount.toLocaleString('en-US');q('#file-count').setAttribute('aria-label',totalCount+' '+(totalCount===1?'file':'files'));
  const rec = records.find(r => selected.has(r.id));
  q('#inspector-title').textContent = rec?.name || 'No file selected';
  q('#inspector-path').textContent = rec?.path || '';
  q('#inspector-path').hidden = !rec?.path;
  const inspectorChip=q('#app-inspector .gc-chip');inspectorChip.hidden=!rec;if(rec){inspectorChip.lastChild.textContent=rec.status;inspectorChip.classList.toggle('gc-chip--success',rec.status==='Ready');inspectorChip.classList.toggle('gc-chip--attention',rec.status==='Review');inspectorChip.classList.toggle('gc-chip--neutral',rec.status==='Draft');inspectorChip.querySelector('use').setAttribute('href',rec.status==='Ready'?'#gc-check':rec.status==='Review'?'#gc-attention':'#gc-ready');}
  q('#crumb-file').textContent = rec?.name || 'No selection';
  q('#delete-selected').disabled = !selected.size;
  status(`${selected.size} ${selected.size === 1 ? 'file' : 'files'} selected · ${records.length} in view`);
 }
 function select(id,e = {}) {
  const index = records.findIndex(r => r.id === id), start = Math.max(0,records.findIndex(r => r.id === anchor));
  if (e.shiftKey) { if (!e.ctrlKey && !e.metaKey) selected.clear(); records.slice(Math.min(index,start),Math.max(index,start)+1).forEach(r => selected.add(r.id)); }
  else if (e.ctrlKey || e.metaKey) { selected.has(id) ? selected.delete(id) : selected.add(id); anchor = id; }
  else { selected = new Set([id]); anchor = id; }
  const focused = document.activeElement; render();
  if (focused?.isConnected && !focused.closest('[hidden]')) focused.focus({preventScroll:true});
 }
 q('#data-mode').addEventListener('change',e => applyFixture(e.target.value));
 q('#app-grid').addEventListener('click',e => { const row = e.target.closest('.app-grid-row'); if (row && !e.target.closest('[data-drag]')) select(Number(row.dataset.file),e); });
 q('#app-grid').addEventListener('focusin',e => { if (!e.target.matches('[role=gridcell]')) return; all('#app-grid [role=gridcell]').forEach(c => c.tabIndex = c === e.target ? 0 : -1); });
 q('#app-grid').addEventListener('keydown',e => {
  const cell = e.target.closest('[role=gridcell]'), row = cell?.closest('.app-grid-row'); if (!row) return;
  const rows = all('#app-grid > .app-grid-row').filter(r => !r.hidden), i = rows.indexOf(row), col = [...row.children].indexOf(cell);
  let nextRow = i, nextCol = col;
  if (e.key === 'ArrowDown') nextRow = Math.min(i+1,rows.length-1);
  else if (e.key === 'ArrowUp') nextRow = Math.max(i-1,0);
  else if (e.key === 'ArrowRight') nextCol = Math.min(col+1,2);
  else if (e.key === 'ArrowLeft') nextCol = Math.max(col-1,0);
  else if (e.key === 'Home') { nextCol=0; if(e.ctrlKey)nextRow=0; }
  else if (e.key === 'End') { nextCol=2; if(e.ctrlKey)nextRow=rows.length-1; }
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(Number(row.dataset.file),e); return; }
  else return;
  e.preventDefault();
  if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { reorder(Number(row.dataset.file),nextRow); return; }
  if (e.shiftKey) select(Number(rows[nextRow].dataset.file),e);
  rows[nextRow].children[nextCol].focus();
 });
 q('#file-tree').addEventListener('click',e => {
  const item = e.target.closest('[role=treeitem]'); if(!item)return;
  if(item.id==='tree-folder') toggleTree(); else { select(Number(item.dataset.file),e); showView('workspace'); }
  all('#file-tree [role=treeitem]').forEach(el => el.tabIndex = el===item ? 0 : -1); item.focus();
 });
 function toggleTree() {
  const folder=q('#tree-folder'), group=q('#tree-files'), opening=folder.getAttribute('aria-expanded')!=='true';
  folder.setAttribute('aria-expanded',String(opening));
  twoBeat(group,opening);
 }
 q('#file-tree').addEventListener('keydown',e => {
  const items=all('#file-tree [role=treeitem]').filter(el=>!el.closest('[hidden]')), i=items.indexOf(document.activeElement);
  let n=e.key==='ArrowDown'?Math.min(i+1,items.length-1):e.key==='ArrowUp'?Math.max(i-1,0):e.key==='Home'?0:e.key==='End'?items.length-1:undefined;
  if(e.key==='ArrowLeft') { if(document.activeElement.id==='tree-folder'&&q('#tree-folder').getAttribute('aria-expanded')==='true')toggleTree();n=0; }
  if(e.key==='ArrowRight') { if(q('#tree-folder').getAttribute('aria-expanded')!=='true')toggleTree();n=Math.min(i+1,items.length-1); }
  if(n!==undefined) {e.preventDefault();items.forEach((el,j)=>el.tabIndex=j===n?0:-1);items[n].focus();}
  if(e.key==='Enter'||e.key===' ') {e.preventDefault();document.activeElement.click();}
 });
 function contextFile(target,e,point) {
  const id=Number(target.dataset.file); if(!selected.has(id))select(id);
  e.preventDefault();openOverlay('file-menu',target.matches('[role=treeitem]')?target:target.querySelector('[role=gridcell]'),point);
 }
 for(const area of [q('#app-grid'),q('#file-tree')]) {
  area.addEventListener('contextmenu',e=>{const item=e.target.closest('.app-grid-row,.app-tree-file');if(item)contextFile(item,e,{x:e.clientX,y:e.clientY});});
  area.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){const item=e.target.closest('.app-grid-row,.app-tree-file');if(item)contextFile(item,e);}});
 }
 let contextRow;
 for(const row of all('.gc-row')) {
  const show=e=>{if(row.disabled)return;e.preventDefault();contextRow=row;openOverlay('row-menu',row,e.type==='contextmenu'?{x:e.clientX,y:e.clientY}:undefined);};
  row.addEventListener('contextmenu',show);row.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)show(e);});
 }
 q('#row-menu-open').addEventListener('click',()=>{const row=contextRow;closeOverlay(false);row?.click();});
 q('#row-menu-delete').addEventListener('click',()=>{const row=contextRow;if(!row)return;const section=row.closest('section');undoStack.push(()=>{row.hidden=false;});row.hidden=true;updateUndo();closeOverlay(false);const next=[...section.querySelectorAll('.gc-row')].find(el=>!el.disabled&&!el.closest('[hidden]'));(next||section.querySelector('[data-replay]')).focus();notify('Row deleted locally');});
 q('#tree-folder').addEventListener('contextmenu',e=>{e.preventDefault();openOverlay('folder-menu',q('#tree-folder'),{x:e.clientX,y:e.clientY});});
 q('#tree-folder').addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();openOverlay('folder-menu',q('#tree-folder'));}});
 q('#folder-menu-toggle').addEventListener('click',()=>{toggleTree();closeOverlay();});
 function snapshot(){return {records:records.map(r=>({...r})),totalCount,selected:[...selected],anchor};}
 function remember(){const before=snapshot();undoStack.push(()=>{const ids=new Set(before.records.map(r=>r.id)),arrivals=records.filter(r=>r.origin==='arrival'&&!ids.has(r.id));records=[...before.records,...arrivals];totalCount=before.totalCount+arrivals.length;selected=new Set(before.selected);anchor=before.anchor;render();});updateUndo();}
 function updateUndo(){const button=q('#app-undo');if(!undoStack.length&&document.activeElement===button)q('#new-file').focus();button.disabled=!undoStack.length;button.tabIndex=document.activeElement===button?0:-1;}
 function undo(){const action=undoStack.pop();if(action){action();updateUndo();status('Local action undone');}q('#app-toast').hidden=true;}
 function notify(message){q('#app-toast-text').textContent=message;q('#app-toast').hidden=false;}
 function deleteFiles(){if(!selected.size)return;const index=records.findIndex(r=>selected.has(r.id)),count=selected.size;remember();records=records.filter(r=>!selected.has(r.id));totalCount-=count;selected=new Set(records.length?[records[Math.min(Math.max(0,index),records.length-1)].id]:[]);render();closeOverlay(false);showView('workspace');const next=q('#app-grid .app-grid-row:not([hidden]) [role=gridcell]');(next||q('#new-file')).focus();notify(count===1?'File deleted locally':'Files deleted locally');}
 function createFile(kind='document'){if(records.length>=32){status('This sample has 32 file slots; change the fixture to create another.');closeOverlay();return;}remember();const id=Math.max(-1,...records.map(r=>r.id))+1;records.push({id,name:kind==='folder'?'Untitled folder':'Untitled document',kind,path:'',owner:null,status:'Draft'});totalCount++;selected=new Set([id]);render();showView('workspace');closeOverlay(false);all('#app-grid > .app-grid-row').filter(r=>!r.hidden).at(-1).querySelector('[role=gridcell]').focus();status((kind==='folder'?'Folder':'File')+' created locally');}
 function reorder(id,to){const from=records.findIndex(r=>r.id===id);if(from<0||from===to)return;remember();const [item]=records.splice(from,1);records.splice(to,0,item);render();const row=all('#app-grid > .app-grid-row').find(r=>!r.hidden&&Number(r.dataset.file)===id);row.querySelector('[role=gridcell]').focus();status('File moved locally; Ctrl Z to undo');}
 q('#delete-selected').addEventListener('click',deleteFiles);q('[data-delete-file]').addEventListener('click',deleteFiles);
 q('[data-inspect-file]').addEventListener('click',()=>{closeOverlay(false);togglePane('app-inspector',q('#inspector-toggle'),true);});
 q('#new-file').addEventListener('click',()=>createFile());all('[data-create-file]').forEach(el=>el.addEventListener('click',()=>createFile()));
 all('[data-create-folder]').forEach(el=>el.addEventListener('click',()=>createFile('folder')));
 all('[data-local-action]').forEach(el=>el.addEventListener('click',()=>{status(el.dataset.localAction+' in this sample');closeOverlay();}));
 q('#app-undo').addEventListener('click',undo);q('#toast-app-undo').addEventListener('click',()=>{undo();q('#app-undo').disabled?q('#new-file').focus():q('#app-undo').focus();});
 q('#toast-app-close').addEventListener('click',()=>{q('#app-toast').hidden=true;q('#new-file').focus();});
 q('#banner-close').addEventListener('click',()=>{q('#sample-banner').hidden=true;q('#sort-name').focus();});
 q('#sort-name').addEventListener('click',()=>{const header=q('#sort-name').closest('[role=columnheader]'),ascending=header.getAttribute('aria-sort')!=='ascending';records.sort((a,b)=>a.name.localeCompare(b.name)*(ascending?1:-1));header.setAttribute('aria-sort',ascending?'ascending':'descending');render();});
 let dragged;
 q('#app-grid').addEventListener('dragstart',e=>{const handle=e.target.closest('[data-drag]');if(!handle)return;dragged=Number(handle.closest('.app-grid-row').dataset.file);e.dataTransfer.setData('text/plain',String(dragged));e.dataTransfer.effectAllowed='move';});
 q('#app-grid').addEventListener('dragover',e=>{const row=e.target.closest('.app-grid-row');if(!row||dragged===undefined)return;e.preventDefault();all('[data-drop]').forEach(el=>delete el.dataset.drop);const r=row.getBoundingClientRect();row.dataset.drop=e.clientY<r.top+r.height/2?'before':'after';});
 q('#app-grid').addEventListener('drop',e=>{const row=e.target.closest('.app-grid-row');if(!row||dragged===undefined)return;e.preventDefault();const from=records.findIndex(r=>r.id===dragged),slot=records.findIndex(r=>r.id===Number(row.dataset.file))+(row.dataset.drop==='after'?1:0),to=slot-(from<slot?1:0);reorder(dragged,Math.min(records.length-1,to));all('[data-drop]').forEach(el=>delete el.dataset.drop);dragged=undefined;});
 q('#app-grid').addEventListener('dragend',()=>{all('[data-drop]').forEach(el=>delete el.dataset.drop);dragged=undefined;});

 // Resize once per pointer event; no tween of layout dimensions.
 for(const [selector,property,min,max,initial] of [['.app-splitter','--app-sidebar',160,320,208],['.app-column-resize','--app-column',160,480,192]]) {
  const handle=q(selector);let start,original,value=initial;
  const resize=n=>{value=Math.max(min,Math.min(max,Math.round(n/4)*4));root.style.setProperty(property,value+'px');handle.setAttribute('aria-valuenow',String(value));};
  handle.addEventListener('pointerdown',e=>{start=e.clientX;original=value;handle.setPointerCapture(e.pointerId);e.preventDefault();});
  handle.addEventListener('pointermove',e=>{if(handle.hasPointerCapture(e.pointerId))resize(original+e.clientX-start);});
  handle.addEventListener('pointerup',e=>{if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);});
  handle.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();resize(e.key==='Home'?min:e.key==='End'?max:value+(e.key==='ArrowRight'?4:-4));}});
 }
 // Reusable roving groups (including the application toolbar).
 for(const group of all('[data-roving],.app-toolbar')) {
  const items=()=>[...group.querySelectorAll('button')].filter(b=>!b.disabled&&!b.closest('[hidden]'));
  items().forEach((b,i)=>b.tabIndex=i? -1:0);
  group.addEventListener('keydown',e=>{const list=items(),i=list.indexOf(document.activeElement);if(i<0)return;const n=e.key==='ArrowRight'?(i+1)%list.length:e.key==='ArrowLeft'?(i-1+list.length)%list.length:e.key==='Home'?0:e.key==='End'?list.length-1:undefined;if(n!==undefined){e.preventDefault();list.forEach((b,j)=>b.tabIndex=j===n?0:-1);list[n].focus();}});
  group.addEventListener('focusin',e=>{if(e.target.tagName==='BUTTON')items().forEach(b=>b.tabIndex=b===e.target?0:-1);});
  if(group.hasAttribute('data-roving'))group.addEventListener('click',e=>{const b=e.target.closest('button');if(b)items().forEach(item=>item.setAttribute('aria-pressed',String(item===b)));});
 }

 // Combobox keeps the typing anchor; navigation uses aria-activedescendant.
 const combo=q('#owner-combo'), comboList=q('#owner-options');let comboIndex=-1,composing=false;
 const comboItems=()=>[...comboList.querySelectorAll('[role=option]')].filter(el=>!el.hidden);
 function filterOwners(){const needle=combo.value.toLocaleLowerCase();all('#owner-options [role=option]').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase().includes(needle);el.setAttribute('aria-selected','false');});comboIndex=-1;combo.removeAttribute('aria-activedescendant');q('#owner-empty').hidden=comboItems().length>0;comboList.hidden=false;combo.setAttribute('aria-expanded','true');position(comboList,combo);}
 function closeCombo(){comboList.hidden=true;combo.setAttribute('aria-expanded','false');combo.removeAttribute('aria-activedescendant');}
 function chooseOwner(item){combo.value=item.textContent;closeCombo();combo.focus();status('Owner selected: '+combo.value);}
 combo.addEventListener('compositionstart',()=>composing=true);combo.addEventListener('compositionend',()=>{composing=false;filterOwners();});
 combo.addEventListener('input',()=>{if(!composing)filterOwners();});combo.addEventListener('click',filterOwners);
 combo.addEventListener('keydown',e=>{if(e.isComposing||composing)return;if(e.key==='Escape'){e.preventDefault();closeCombo();return;}if(e.key==='Tab'){closeCombo();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(comboList.hidden)filterOwners();const options=comboItems();if(!options.length)return;comboIndex=(comboIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((el,i)=>el.setAttribute('aria-selected',String(i===comboIndex)));combo.setAttribute('aria-activedescendant',options[comboIndex].id);options[comboIndex].scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&comboIndex>=0){e.preventDefault();chooseOwner(comboItems()[comboIndex]);}});
 comboList.addEventListener('pointerdown',e=>{const option=e.target.closest('[role=option]');if(option){e.preventDefault();chooseOwner(option);}});
 document.addEventListener('pointerdown',e=>{if(!combo.contains(e.target)&&!comboList.contains(e.target))closeCombo();});
 function copies(value,clamp=false){const input=q('#copies'),valid=/^\d+$/.test(String(value))&&Number(value)>=1&&Number(value)<=100;if(clamp)value=Math.max(1,Math.min(100,Number(value)||1));input.setAttribute('aria-invalid',String(!valid&&!clamp));q('#copies-error').hidden=valid||clamp;if(valid||clamp){input.value=String(value);input.setAttribute('aria-valuenow',String(value));}}
 q('#copies').addEventListener('input',e=>copies(e.target.value));
 q('#copies').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();copies(Number(q('#copies').value)+(e.key==='ArrowUp'?1:-1),true);}});
 q('#copies-less').addEventListener('click',()=>copies(Number(q('#copies').value)-1,true));q('#copies-more').addEventListener('click',()=>copies(Number(q('#copies').value)+1,true));
 q('#preview-scale').addEventListener('input',e=>q('#preview-scale-value').textContent=e.target.value+'%');
 const tagInput=q('#tag-entry');
 function removeTag(tag){const copy=tag.cloneNode(true);undoStack.push(()=>{q('#app-tags').insertBefore(copy,tagInput);copy.querySelector('[data-remove-tag]').addEventListener('click',()=>removeTag(copy));});tag.remove();updateUndo();tagInput.focus();status('Tag removed locally; Ctrl Z to undo');}
 all('[data-remove-tag]').forEach(b=>b.addEventListener('click',()=>removeTag(b.closest('.app-tag'))));
 tagInput.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!tagInput.value){e.preventDefault();undo();return;}if(e.key==='Backspace'&&!tagInput.value){const tag=q('#app-tags .app-tag:last-of-type');if(tag){e.preventDefault();removeTag(tag);}}if(e.key==='Enter'&&tagInput.value.trim()){e.preventDefault();const name=tagInput.value.trim();if(all('#app-tags .app-tag').some(t=>t.firstChild.textContent.trim()===name)){status('Tag already exists');return;}const tag=document.createElement('span');tag.className='app-tag';tag.dataset.ledger='tag-input';tag.append(document.createTextNode(name+' '));const b=document.createElement('button');b.type='button';b.className='gc-button gc-button--quiet';b.setAttribute('aria-label','Remove '+name+' tag');b.dataset.removeTag='';b.append(q('[data-remove-tag] svg')?.cloneNode(true)||document.createTextNode('Remove'));b.addEventListener('click',()=>removeTag(tag));tag.append(b);q('#app-tags').insertBefore(tag,tagInput);tagInput.value='';undoStack.push(()=>tag.remove());updateUndo();animate(tag,[{opacity:0},{opacity:1}],'--duration-feedback');}});
 const disclosureRuns=new WeakMap();
 function twoBeat(el,opening){motions.get(el)?.cancel();const run=(disclosureRuns.get(el)||0)+1;disclosureRuns.set(el,run);if(keyboard){el.hidden=!opening;return;}if(opening){el.hidden=true;later(()=>{if(disclosureRuns.get(el)!==run)return;el.hidden=false;animate(el,[{opacity:0},{opacity:1}],'--app-motion-half');},timing('--app-motion-half'));}else{const a=animate(el,[{opacity:1},{opacity:0}],'--app-motion-half');if(a)a.finished.then(()=>{if(disclosureRuns.get(el)===run)el.hidden=true;}).catch(()=>{});else el.hidden=true;}}
 q('#properties-trigger').addEventListener('click',()=>{const b=q('#properties-trigger'),opening=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(opening));twoBeat(q('#properties-body'),opening);});
 q('.app-disclosure').addEventListener('toggle',e=>{if(e.target.open)animate(e.target.querySelector('p'),[{opacity:0},{opacity:1}],'--duration-feedback');});
 q('#show-meta').addEventListener('change',e=>{all('#app-grid .app-grid-row [role=gridcell]:last-child').forEach(el=>el.dataset.muted=String(!e.target.checked));});
 for(const input of all('input.gc-choice[type=checkbox]')) {
  const host=input.closest('label');if(!host)continue;host.classList.add('app-check-host');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('app-choice-tick');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M4 12l5 5L20 6');path.setAttribute('pathLength','1');svg.append(path);host.append(svg);
 }
 q('#copy-code').addEventListener('click',async()=>{const text=q('#sample-code').textContent;try{await navigator.clipboard.writeText(text);q('#copy-receipt').textContent='Copied sample code';}catch{const range=document.createRange();range.selectNodeContents(q('#sample-code'));getSelection().removeAllRanges();getSelection().addRange(range);q('#copy-receipt').textContent='Code selected; press Ctrl C to copy';}});

 // Palette: immediate keyboard opening, filtered commands, native modal focus trap.
 const palette=q('#command-dialog'), search=q('#command-search');let commandIndex=0;
 const commands=()=>all('#command-options [role=option]').filter(el=>!el.hidden);
 function commandSelection(){const options=commands();commandIndex=Math.min(commandIndex,options.length-1);options.forEach((el,i)=>el.setAttribute('aria-selected',String(i===commandIndex)));if(options[commandIndex])search.setAttribute('aria-activedescendant',options[commandIndex].id);else search.removeAttribute('aria-activedescendant');q('#command-empty').hidden=options.length>0;}
 function openCommands(trigger){closeOverlay(false);paletteTrigger=trigger||document.activeElement;palette.dataset.keyboard=String(keyboard);search.value='';all('#command-options [role=option]').forEach(el=>el.hidden=false);commandIndex=0;commandSelection();palette.showModal();search.focus();}
 function closeCommands(){palette.close();paletteTrigger?.focus({preventScroll:true});}
 function executeCommand(item){const command=item?.dataset.command;if(!command)return;closeCommands();if(command==='inspect')togglePane('app-inspector',q('#inspector-toggle'),true);if(command==='delete')deleteFiles();if(command==='undo')undo();if(command==='components')showView('buttons',true);}
 q('#palette-trigger').addEventListener('click',e=>openCommands(e.currentTarget));q('#command-close').addEventListener('click',closeCommands);
 palette.addEventListener('cancel',e=>{e.preventDefault();closeCommands();});
 palette.addEventListener('click',e=>{if(e.target===palette){const r=palette.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeCommands();}});
 search.addEventListener('input',()=>{all('#command-options [role=option]').forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));commandIndex=0;commandSelection();});
 search.addEventListener('keydown',e=>{if(e.isComposing)return;const options=commands();if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();commandIndex=options.length?(commandIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length:0;commandSelection();}if(e.key==='Enter'){e.preventDefault();executeCommand(options[commandIndex]);}});
 all('[data-command]').forEach(el=>el.addEventListener('click',()=>executeCommand(el)));
 document.addEventListener('keydown',e=>{
  const editing=e.target.matches('input,textarea,[contenteditable=true]');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette.open?closeCommands():openCommands();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();undo();}
  if(e.key==='Delete'&&!editing&&!palette.open&&(e.target.closest('#app-grid')||e.target.closest('#file-tree'))){e.preventDefault();deleteFiles();}
  if(e.key==='Escape'){
   closeOverlay();closeCombo();
   for(const [id,trigger]of [['app-explorer','explorer-toggle'],['app-inspector','inspector-toggle']])if(q('#'+id).dataset.revealed==='true')togglePane(id,q('#'+trigger),false);
  }
 });

 // One cancellable replay per component region, explicit sample lifecycle.
 function replay(id){const el=document.getElementById(id);if(!el)return;keyboard=false;
  if(id==='menus'){q('#menu-trigger').click();return;}
  if(id==='dialogs'){q('#dialog-trigger').click();return;}
  if(id==='toasts'){q('#toast-trigger').click();return;}
  if(id==='tooltips'){const tip=q('#export-tip-sample');positionTooltips();animate(tip,[{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}]);return;}
  if(id==='app-overlays'){openOverlay('view-popover',q('[data-open="view-popover"]'));return;}
  const target=el.querySelector('[data-component]')||el;animate(target,[{opacity:.4},{opacity:1}],'--duration-feedback');
 }
 const activate=el=>el?.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 function replayComponent(type) {
  keyboard=false;root.dataset.input='pointer';
  const el=q('[data-component="'+type+'"]');if(!el)return;
  const section=el.closest('#app-main > section');if(section)showView(section.id);
  const pane=el.closest('#app-explorer,#app-inspector');if(pane&&getComputedStyle(pane).display==='none')pane.dataset.revealed='true';
  if(el.checkVisibility({visibilityProperty:true}))el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  if(type==='dialog'){if(q('#details-dialog').open)q('#details-dialog').close();void q('#details-dialog').offsetWidth;activate(q('#dialog-trigger'));return;}
  if(type==='command-palette'){if(palette.open)palette.close();void palette.offsetWidth;openCommands(q('#palette-trigger'));return;}
  if(type==='menu-item'){q('#live-menu').hidden=true;void q('#live-menu').offsetWidth;activate(q('#menu-trigger'));return;}
  if(type==='popover'){openOverlay('view-popover',q('#view-trigger'));return;}
  if(type==='dropdown'||type==='split-button'){openOverlay('new-menu',q('#new-options'));return;}
  if(type==='combobox'){showView('app-editing');combo.value='';filterOwners();animate(comboList,[{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}]);return;}
  if(type==='tooltip'){showView('tooltips');replay('tooltips');return;}
  if(type==='toast'){showView('toasts');q('#live-toast').hidden=true;void q('#live-toast').offsetWidth;activate(q('#toast-trigger'));return;}
  if(type==='accordion'){activate(q('#properties-trigger'));return;}
  if(type==='disclosure'){const d=q('.app-disclosure');d.open=false;void d.offsetWidth;d.open=true;return;}
  if(type==='tree-view'){toggleTree();return;}
  if(type==='tab'){activate(all('#tabs [role=tab]').find(t=>t.getAttribute('aria-selected')!=='true'));return;}
  if(type==='editor-tabs'){activate(all('[data-editor-view]').find(t=>t.getAttribute('aria-selected')!=='true'));return;}
  if(type==='input-radio'){el.checked=true;animate(el,[{opacity:.4},{opacity:1}],'--duration-feedback');return;}
  if(type==='input-checkbox'||type==='input-switch'){activate(el);return;}
  if(type.startsWith('button-')||type==='drag-handle') {animate(el,[{transform:'scale(1)'},{transform:'scale(.97)'},{transform:'scale(1)'}],'--duration-feedback');return;}
  // An explicit specimen replay may fade an informational component. Its normal
  // selection, typing and resize paths stay immediate under the frequency gate.
  animate(el,[{opacity:.4},{opacity:1}],'--duration-feedback');
 }
 // Legacy groups gain the same labelled Replay affordance without changing their specimens.
 all('#app-main > .gc-section').forEach(section=>{
  if(section.querySelector('[data-replay]'))return;
  if(!section.id)section.id='reference-controls';
  const heading=section.querySelector('h2');if(!heading)return;
  const b=document.createElement('button');b.type='button';b.className='gc-button gc-button--quiet';b.textContent='Replay';b.dataset.replay=section.id;b.dataset.ledger='replay';heading.after(b);
 });
 all('[data-replay]').forEach(b=>b.addEventListener('click',()=>replay(b.dataset.replay)));
 for(const section of all('#app-main > section')) {
  const types=[...new Set([...section.querySelectorAll('[data-component]')].map(el=>el.dataset.component))];
  if(section.id==='app-navigation')types.push('window-title-bar','tree-view','splitter','editor-tabs','breadcrumbs','status-bar','count-badge');
  if(!types.length)continue;
  const group=document.createElement('div');group.className='app-component-replays gc-line';group.dataset.component='replay-controls';group.dataset.ledger='replay';group.setAttribute('aria-label','Replay individual components');
  for(const type of types){const b=document.createElement('button');b.type='button';b.className='gc-button gc-button--quiet';b.dataset.ledger='replay';b.dataset.replayComponent=type;b.textContent='Replay '+type.replaceAll('-',' ');b.addEventListener('click',()=>replayComponent(type));group.append(b);}
  section.append(group);
 }
 let incomingId;
 function setPlayback(on){playback=on;q('#sample-play').textContent=on?'Pause':'Play';q('#sample-play').setAttribute('aria-pressed',String(on));if(on)later(nextSample,600*rate());}
 function nextSample(){if(!playback)return;const steps=[()=>{if(records.length>=32){status('All 32 sample slots are occupied; no arrival added.');return;}incomingId=Math.max(-1,...records.map(r=>r.id))+1;records.push({id:incomingId,name:'Incoming review '+(incomingId+1),origin:'arrival',path:'',owner:null,status:'Draft'});totalCount++;render();const row=all('#app-grid .app-grid-row').find(r=>Number(r.dataset.file)===incomingId);if(row?.checkVisibility())animate(row,[{opacity:0,transform:'translateY(var(--space-inline))'},{opacity:1,transform:'translateY(0)'}],'--duration-popover',true);},()=>{const incoming=records.find(r=>r.id===incomingId);if(incoming){incoming.status='Review';render();const chip=all('#app-grid .app-grid-row').find(r=>Number(r.dataset.file)===incomingId)?.querySelector('.gc-chip');if(chip?.checkVisibility())animate(chip,[{opacity:.4},{opacity:1}],'--duration-feedback',true);}},()=>{if(records.some(r=>r.id===incomingId))status('Incoming review added locally; selection and drafts retained.');}];steps[playStep%steps.length]();playStep++;if(playStep%steps.length===0){setPlayback(false);return;}later(nextSample,1600*rate());}
 q('#sample-play').addEventListener('click',()=>{cancelPending();setPlayback(!playback);});
 q('#sample-replay').addEventListener('click',()=>{cancelPending();playStep=0;setPlayback(true);});
 q('#sample-reset').addEventListener('click',()=>{cancelPending();setPlayback(false);playStep=0;closeOverlay(false);if(palette.open)closeCommands();q('#sample-banner').hidden=false;applyFixture(q('#data-mode').value);showView('workspace');status('Sample reset; drafts retained');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelPending();setPlayback(false);}});
 globalThis.GoldenApp={showView,replay,replayComponent,openOverlay,closeOverlay,openCommands,closeCommands,applyFixture,scrolls:{},get records(){return records;},get selected(){return [...selected];}};
 applyFixture(q('#data-mode').value);showView('workspace');positionTooltips();
})();
