/* Embedded in index.html by build.mjs. No network or external dependencies. */
'use strict';
const STORAGE_KEY = 'jig.palette-gallery.favourites.v1';
const PALETTES = JSON.parse(document.getElementById('palette-data').textContent);
const SOURCES = JSON.parse(document.getElementById('source-data').textContent);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[c]);
function luminance(hex) {
  const values = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255)
    .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*values[0]+.7152*values[1]+.0722*values[2];
}
function contrast(a,b) {
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function mix(a,b,weight) {
  const x=a.slice(1).match(/../g), y=b.slice(1).match(/../g);
  return '#'+x.map((v,i) => Math.round(parseInt(v,16)*(1-weight)+parseInt(y[i],16)*weight)
    .toString(16).padStart(2,'0')).join('');
}
function swatches(p) {
  return [['Canvas',p.bg[0]],['Frame',p.bg[1]],['Node',p.bg[2]],['Text',p.text],['Secondary',p.muted],
    ...p.accents.map((c,i) => [`Accent ${i+1}`,c]),
    ...p.states.map((c,i) => [['Success','Warning','Error','Info'][i],c]),
    ...Object.entries(p.surfaceOverrides||{}).map(([label,c])=>[label,c])];
}
function surfaces(p) {
  return { canvas:p.bg[0], frame:p.bg[1], node:p.bg[2],
    'note header':p.solidHeaders?p.accents[0]:mix(p.bg[2],p.accents[0],.18),
    'action header':p.solidHeaders?p.accents[1]:mix(p.bg[2],p.accents[1],.18),
    'decision header':p.solidHeaders?p.accents[2]:mix(p.bg[2],p.accents[2],.18),
    question:mix(p.bg[1],p.accents[3],.13),
    chip:p.neon?p.states[0]:mix(p.bg[2],p.states[0],.18),
    ...(p.adaptiveText?{chrome:p.bg[1],sidebar:p.bg[1],dock:p.bg[1]}:{}),
    ...p.surfaceOverrides };
}
function textOn(p, label, secondary=false) {
  const preferred=secondary?p.muted:p.text;
  const background=surfaces(p)[label];
  if (!p.adaptiveText || contrast(preferred,background)>=(p.contrastTarget||4.5)) return preferred;
  const candidates=secondary?['#404653','#d5d9e2']:['#171923','#f4f5f8'];
  return candidates.reduce((best,c)=>contrast(c,background)>contrast(best,background)?c:best,preferred);
}
function contrastReport(p) {
  const bg=surfaces(p);
  return [...Object.entries(bg).map(([surface,c]) => ({label:`Text / ${surface}`,surface,role:'primary',text:textOn(p,surface),background:c,ratio:contrast(textOn(p,surface),c)})),
    ...['canvas','frame','node'].map(surface => ({label:`Secondary / ${surface}`,surface,role:'secondary',text:textOn(p,surface,true),background:bg[surface],ratio:contrast(textOn(p,surface,true),bg[surface])}))];
}
function filterPalettes(palettes, mode, scheme) {
  return palettes.filter(p => (mode==='all'||p.mode===mode) && (scheme==='all'||p.scheme===scheme));
}
function readFavourites(storage, validIds) {
  try {
    const data=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');
    return new Set(Array.isArray(data) ? data.filter(id => typeof id==='string' && validIds.has(id)) : []);
  } catch { return new Set(); }
}
function writeFavourites(storage, favourites) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify([...favourites])); return true; }
  catch { return false; }
}
function toggleFavourite(favourites,id) {
  if (favourites.has(id)) favourites.delete(id); else favourites.add(id);
}
function board(p) {
  const s=surfaces(p), border=mix(p.bg[2],textOn(p,'node'),.24), edge=p.neon?p.accents[0]:mix(p.bg[1],textOn(p,'frame'),.55);
  const ink=(surface,secondary=false)=>`data-text-surface="${surface}" data-text-role="${secondary?'secondary':'primary'}" fill="${textOn(p,surface,secondary)}"`;
  const node=(x,y,w,type,label,accent,header,selected=false) => `
    <g data-node="${type}">
      <rect data-surface="node" x="${x}" y="${y}" width="${w}" height="79" rx="7" fill="${s.node}" stroke="${selected?p.accents[0]:border}" stroke-width="${selected?2.5:1}"/>
      <path data-surface="${type.toLowerCase()} header" d="M${x+7} ${y}h${w-14}q7 0 7 7v20H${x}V${y+7}q0-7 7-7" fill="${header}"/>
      <rect x="${x+10}" y="${y+10}" width="6" height="6" rx="${type==='Note'?3:0}" fill="${p.solidHeaders?textOn(p,type.toLowerCase()+' header'):accent}"/>
      <text ${ink(type.toLowerCase()+' header')} x="${x+23}" y="${y+18}" style="font-size:var(--type-xs)" font-weight="650">${type}${selected?' · selected':''}</text>
      <text ${ink('node')} x="${x+11}" y="${y+47}" style="font-size:var(--type-sm)">${label}</text>
      <text ${ink('node',true)} x="${x+11}" y="${y+65}" style="font-size:var(--type-xs)">${type==='Note'?'2 references':type==='Action'?'Owner · Design':'Ready for review'}</text>
    </g>`;
  return `<svg class="board" data-surface="canvas" viewBox="0 0 ${p.adaptiveText?'492 354':'440 300'}" role="img" aria-label="Board preview: ${p.adaptiveText?'toolbar, sidebar and dock, ':''}a task frame, a note, a selected action and a decision, two connecting edges, a done chip and a question callout" xmlns="http://www.w3.org/2000/svg" style="background:${s.canvas};color:${textOn(p,'canvas')}">
    <g fill="currentColor" font-family="var(--jig-font-sans)">
      ${p.adaptiveText?`<rect data-surface="chrome" width="492" height="22" fill="${s.chrome}"/>
      <text ${ink('chrome')} x="13" y="15" style="font-size:var(--type-xs)">BOARD / RELEASE</text>
      <rect data-surface="sidebar" y="22" width="44" height="300" fill="${s.sidebar}"/>
      <text ${ink('sidebar')} x="8" y="46" style="font-size:var(--type-xs)">NAV</text>
      <rect x="15" y="65" width="14" height="14" rx="3" fill="${p.accents[0]}"/>
      <circle cx="22" cy="103" r="7" fill="${p.accents[1]}"/>
      <rect data-surface="dock" y="322" width="492" height="32" fill="${s.dock}"/>
      <text ${ink('dock')} x="63" y="342" style="font-size:var(--type-xs)">Select · Connect · Comment</text>
      <g transform="translate(48 22)">`:''}
      <rect data-surface="frame" x="14" y="14" width="412" height="272" rx="11" fill="${s.frame}" stroke="${border}"/>
      <text ${ink('frame')} x="29" y="39" style="font-size:var(--type-xs)" letter-spacing="1.5">TASK / PLAN THE RELEASE</text>
      <rect data-surface="chip" x="350" y="24" width="60" height="23" rx="11" fill="${s.chip}"/>
      <circle cx="362" cy="35" r="3" fill="${p.neon?textOn(p,'chip'):p.states[0]}"/>
      <text ${ink('chip')} x="371" y="39" style="font-size:var(--type-xs)">Done</text>
      <path data-edge="1" d="M164 109H188" fill="none" stroke="${edge}" stroke-width="2"/>
      <path d="m182 105 6 4-6 4" fill="none" stroke="${edge}" stroke-width="2"/>
      <path data-edge="2" d="M288 148V165Q288 174 279 174H157Q146 174 146 184V194" fill="none" stroke="${p.accents[1]}" stroke-width="2"/>
      <path d="m142 188 4 6 4-6" fill="none" stroke="${p.accents[1]}" stroke-width="2"/>
      ${node(30,69,134,'Note','Gather ideas',p.accents[0],s['note header'])}
      ${node(188,69,220,'Action','Choose a direction',p.accents[1],s['action header'],true)}
      ${node(30,194,196,'Decision','Ship this week?',p.accents[2],s['decision header'])}
      <rect data-surface="question" x="246" y="204" width="162" height="64" rx="7" fill="${s.question}" stroke="${p.accents[3]}" stroke-dasharray="4 3"/>
      <text ${ink('question')} x="258" y="225" style="font-size:var(--type-xs)" font-weight="650">? Open question</text>
      <text ${ink('question')} x="258" y="245" style="font-size:var(--type-xs)">What needs a second look?</text>
      ${p.adaptiveText?'</g>':''}
    </g>
  </svg>`;
}
function renderTile(p) {
  const source=SOURCES.find(s => s.id===p.source);
  const target=p.contrastTarget||4.5;
  const report=contrastReport(p), failures=report.filter(row => row.ratio<target);
  const min=Math.min(...report.map(row=>row.ratio));
  return `<article class="tile" id="${p.id}" data-mode="${p.mode}" data-scheme="${p.scheme}" data-source="${p.source}">
    <div class="tile-heading"><div><p class="eyebrow">${p.mode} · ${p.schemeName}</p><h3>${escapeHTML(p.name)}</h3></div>
      <button class="favourite" type="button" data-favourite="${p.id}" aria-pressed="false" aria-label="Favourite ${escapeHTML(p.name)} (${p.mode})">☆</button></div>
    ${p.original?`<div class="swatches source-swatches" aria-label="Wada combination ${p.combination} source colours">${p.original.map((c,i)=>`<span class="swatch" tabindex="0" style="--swatch:${c}" aria-label="Source colour ${i+1} ${c}"><span class="swatch-tip">Source colour ${i+1}<br>${c}</span></span>`).join('')}</div>`:''}
    <div class="swatches" aria-label="Palette colours">${swatches(p).map(([name,c])=>`<span class="swatch" tabindex="0" style="--swatch:${c}" aria-label="${name} ${c}"><span class="swatch-tip">${name}<br>${c}</span></span>`).join('')}</div>
    ${p.adaptation?`<p class="adaptation">${escapeHTML(p.adaptation)}</p>`:''}
    ${board(p)}
    <div class="tile-footer"><span>${p.recipe?`OKLCH · key ${p.recipe.keyHue}°`:`${escapeHTML(source.attribution)}`}</span>
      <a href="SOURCES.md#${p.id}">Source &amp; values ↗</a></div>
    <details class="contrast ${failures.length?'warning':'pass'}"><summary>${failures.length?`⚠ Warning · ${failures.length} text pairs below ${target}:1`:`✓ Pass · text ≥ ${target}:1 on all surfaces`} <span class="ratio">min ${min.toFixed(2)}:1</span></summary>
      <p>Normal-size text on every surface shown, including headers, chip, callout and any chrome. Secondary text is also checked on all three base layers. ${target===7?'<a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html">WCAG enhanced 7:1 text target</a>. ':''}Accent strokes and swatches are not text checks.</p>
      <dl>${report.map(row=>`<div data-contrast-surface="${row.surface}" data-contrast-role="${row.role}"><dt>${row.label}</dt><dd>${row.ratio<target?'⚠':'✓'} ${row.ratio.toFixed(2)}:1</dd></div>`).join('')}</dl>
    </details>
  </article>`.replace(/[ \t]+$/gm,'');
}
function init() {
  const grid=document.getElementById('gallery');
  // Tiles are already present in the HTML, so the initial view works without JS.
  let storage;
  try { storage=window.localStorage; } catch { /* Some file:// contexts deny storage. */ }
  const validIds=new Set(PALETTES.map(p=>p.id));
  let favourites=readFavourites(storage,validIds);
  const mode=document.getElementById('mode'), scheme=document.getElementById('scheme');
  const status=document.getElementById('status'), list=document.getElementById('shortlist');
  const storageStatus=document.getElementById('storage-status');
  function refreshFavourites() {
    list.replaceChildren();
    for (const p of PALETTES.filter(p=>favourites.has(p.id))) {
      const li=document.createElement('li'), a=document.createElement('a');
      a.href='#'+encodeURIComponent(p.id); a.textContent=`${p.name} · ${p.mode}`;
      a.addEventListener('click', () => {
        mode.value='all'; scheme.value='all'; refreshFilter();
      });
      li.append(a); list.append(li);
    }
    document.getElementById('shortlist-empty').hidden=favourites.size>0;
    document.getElementById('pick-count').textContent=`${favourites.size} picked`;
    for (const button of grid.querySelectorAll('[data-favourite]')) {
      const active=favourites.has(button.dataset.favourite);
      button.setAttribute('aria-pressed',String(active));
      button.textContent=active?'★':'☆';
      button.title=active?'Remove from favourites':'Add to favourites';
    }
  }
  function refreshFilter() {
    const visible=new Set(filterPalettes(PALETTES,mode.value,scheme.value).map(p=>p.id));
    for (const tile of grid.children) tile.hidden=!visible.has(tile.id);
    status.textContent=`${visible.size} of ${PALETTES.length} groups`;
    document.getElementById('no-results').hidden=visible.size!==0;
  }
  grid.addEventListener('click',event => {
    const button=event.target.closest('[data-favourite]');
    if (!button) return;
    toggleFavourite(favourites,button.dataset.favourite);
    const saved=writeFavourites(storage,favourites);
    storageStatus.textContent=saved?'Picks saved in this browser.':'Storage unavailable. Picks will last for this page visit only.';
    refreshFavourites();
  });
  mode.addEventListener('change',refreshFilter);
  scheme.addEventListener('change',refreshFilter);
  document.getElementById('reset-filters').addEventListener('click',()=>{
    mode.value='all'; scheme.value='all'; refreshFilter();
  });
  window.addEventListener('storage',event=>{
    if (event.key===STORAGE_KEY || event.key===null) {
      favourites=readFavourites(storage,validIds); refreshFavourites();
    }
  });
  // Establish persistence availability without dropping existing picks.
  storageStatus.textContent=writeFavourites(storage,favourites)?'Picks saved in this browser.':'Storage unavailable. Picks will last for this page visit only.';
  refreshFavourites(); refreshFilter();
}
document.addEventListener('DOMContentLoaded',init);
