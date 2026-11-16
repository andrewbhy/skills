if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/themes/gallery/check-gallery.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Static + Node VM checks only. This file never launches a browser or writes files.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { neutralScale } from './wada.mjs';
import { generate, root, appContext } from './build.mjs';
import { palettes, oklch } from './palettes.mjs';
import { stripNonMarkup } from '../../check-page-shell.mjs';

function verifyCoverage(html, docs, sources) {
  const markup=stripNonMarkup(html, { comments: false });
  const tiles=[...markup.matchAll(/<article class="tile" id="([^"]+)"[^>]*data-source="([^"]+)"/g)];
  assert.equal(tiles.length,72,'Expected 72 static tiles');
  assert.equal(new Set(tiles.map(t=>t[1])).size,72,'Duplicate tile IDs');
  for (const [,id,sourceId] of tiles) {
    assert(sources.some(s=>s.id===sourceId),`Missing source: ${id}`);
    const marker=`<a id="${id}"></a>`;
    assert(docs.includes(marker),`Missing source entry for tile: ${id}`);
    const record=docs.slice(docs.indexOf(marker)).split('\n<a id=')[0];
    assert(record.includes(`Source: [${sourceId}]`),`Wrong attribution: ${id}`);
    const p=palettes.find(p=>p.id===id);
    for (const c of [...p.bg,p.text,p.muted,...p.accents,...p.states])
      assert(record.includes(c),`Undocumented colour: ${id} ${c}`);
  }
}
const expected=await generate();
const [html,docs]=await Promise.all(['index.html','SOURCES.md'].map(f=>readFile(join(root,f),'utf8')));
assert.equal(html,expected.html,'index.html drift: run node build.mjs');
assert.equal(docs,expected.sourceDocs,'SOURCES.md drift: run node build.mjs');
verifyCoverage(html,docs,expected.sources);
const anchors=[...docs.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m=>m[1]);
assert.equal(new Set(anchors).size,anchors.length,'Duplicate source/tile anchors');

let scripts=0;
for (const [,attributes,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
  if (attributes.includes('application/json')) JSON.parse(body);
  else { new vm.Script(body,{filename:'index.html:inline'}); scripts++; }
}
assert.equal(scripts,1,'Expected one inline application script');
// The shared page shell is a local dependency; the gallery application and
// palette data remain inline. Reject any other external application assets.
const galleryOnly=html.replace(/<nav class="breadcrumb"[^>]*>[\s\S]*?<\/nav>/, '')
  .replace(/<link rel="stylesheet" href="\.\.\/\.\.\/(?:jig-pages\.css|grid\/tokens\.css)">/g, '');
assert(!/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/i.test(galleryOnly),'Only shared shell assets may be external to the gallery');
assert(html.includes('Pick the groups you like. We build themes from your picks.'));
const markup=stripNonMarkup(html, { comments: false });
assert.equal((markup.match(/data-node=/g)||[]).length,72*3,'Each tile needs three nodes');
assert.equal((markup.match(/data-edge=/g)||[]).length,72*2,'Each tile needs two edges');
assert.equal((markup.match(/<details class="contrast /g)||[]).length,72);
for (const p of palettes) {
  assert(['dark','light'].includes(p.mode));
  assert.equal(p.bg.length,3); assert.equal(p.accents.length,4); assert.equal(p.states.length,4);
  for (const c of [...p.bg,p.text,p.muted,...p.accents,...p.states]) assert.match(c,/^#[a-f\d]{6}$/);
  const source=expected.sources.find(s=>s.id===p.source);
  if (source.availableHex) for (const c of [...p.bg,...(p.neon?[]:[p.text,p.muted]),...p.accents,...p.states])
    assert(source.availableHex.includes(c),`Colour not found in pinned upstream: ${p.id} ${c}`);
}
// The reduced dataset is pinned independently of the role mappings.
const wadaSource=expected.sources.find(s=>s.id==='wada');
const wadaRaw=await readFile(join(root,wadaSource.dataLocal),'utf8');
assert.equal(createHash('sha256').update(wadaRaw).digest('hex'),wadaSource.dataSHA256,'Wada dataset drift');
assert.equal(wadaSource.dataSHA256,'6393278ad802a810d23333f80396e711e085bbb2d0d14c779fbdc41148a47202','Unexpected Wada data revision');
assert.equal(wadaSource.revision,'c142bd0bc8049ea48db4da5eb397981f047e8ef4');
const wadaData=JSON.parse(wadaRaw);
assert.equal(wadaData.length,159);
const combinationSizes=Array.from({length:348},(_,i)=>wadaData.filter(c=>c.combinations.includes(i+1)).length);
assert(combinationSizes.every(n=>n>=2&&n<=4),'All 348 upstream combinations must be present');
function verifyWada(groups) {
  assert.equal(groups.length,24);
  assert.deepEqual(groups.map(p=>p.combination).sort((a,b)=>a-b),
    [126,134,135,139,141,154,166,167,178,184,190,202,243,247,263,265,276,281,295,296,320,321,330,342]);
  assert.equal(groups.filter(p=>p.original.length===3).length,12);
  assert.equal(groups.filter(p=>p.original.length===4).length,12);
  assert.equal(groups.filter(p=>p.mode==='dark').length,12);
  for(const mood of ['calm','warm','vivid']) assert.equal(groups.filter(p=>p.mood===mood).length,8);
  for(const p of groups) {
    assert.deepEqual(p.original,wadaData.filter(c=>c.combinations.includes(p.combination)).map(c=>c.hex),
      'Wada combination membership: '+p.id);
    assert(p.original.includes(p.bg[0]),'Wada source canvas: '+p.id);
    for(const c of [...p.accents,...Object.values(p.roles)]) assert(p.original.includes(c),'Wada role provenance: '+p.id);
    for(const c of p.original) assert([p.bg[0],...p.accents].includes(c),'Unused Wada source colour: '+p.id);
    for(const c of [p.text,p.muted,...p.states]) assert(neutralScale.includes(c),'Wada neutral role: '+p.id);
    const report=vm.runInContext('contrastReport('+JSON.stringify(p)+')',expected.context);
    assert(report.every(r=>r.ratio>=4.5),'Wada readable text: '+p.id);
    const l=vm.runInContext('luminance('+JSON.stringify(p.bg[0])+')',expected.context);
    assert(p.mode==='dark'?l<.08:l>.65,'Wada source background suitability: '+p.id);
    const tile=markup.split('id="'+p.id+'"')[1]?.split('</article>')[0];
    assert(tile?.includes('Wada combination '+p.combination+' source colours'),'Wada original strip: '+p.id);
    assert(tile.includes('class="adaptation"')&&tile.includes('derived background layers')&&tile.includes('neutral text'),'Wada derivation note: '+p.id);
    assert(tile.includes('contrast pass'),'Wada contrast mark: '+p.id);
    assert(docs.includes('Combination number: **'+p.combination+'**'),'Wada number record: '+p.id);
    for(const c of p.original) assert(tile.includes(c),'Wada source swatch: '+p.id);
  }
}
const wadaGroups=palettes.filter(p=>p.scheme==='wada');
verifyWada(wadaGroups);
assert(markup.includes('<option value="wada">Wada</option>'));
for(const text of ['31 December 2017','1 January 2018','not a worldwide public-domain claim','Matt DesLauriers','Dain M. Blodorn Kim','No reprint text']) assert(docs.includes(text),'Wada provenance record: '+text);
// Prove the Wada check catches a real membership error and unreadable text.
const wrongCombination=structuredClone(wadaGroups);
wrongCombination[0].original[0]='#123456';
assert.throws(()=>verifyWada(wrongCombination),/Wada combination membership/);
const unreadable=structuredClone(wadaGroups);
unreadable[0].text='#ffffff';
assert.throws(()=>verifyWada(unreadable),/Wada readable text/);
verifyWada(wadaGroups);

for (const source of expected.sources) {
  const licence=await readFile(join(root,source.licenceLocal),'utf8');
  assert(licence.includes('Permission is hereby granted'),`Missing reuse permission: ${source.id}`);
  if (source.revision) assert.match(source.revision,/^[a-f\d]{40}$/);
}
const context=expected.context;
const run=expression=>vm.runInContext(expression,context);
const tileFor=p=>markup.split(`id="${p.id}"`)[1]?.split('</article>')[0];
// Compare the emitted SVG colours and surface marks with the emitted reports,
// not just the data used to generate them. No browser/DOM rendering is claimed.
function verifySurfaces(tile,p) {
  const surfaces=run(`surfaces(${JSON.stringify(p)})`);
  const report=run(`contrastReport(${JSON.stringify(p)})`);
  const record=docs.slice(docs.indexOf(`<a id="${p.id}"></a>`)).split('\n<a id=')[0];
  const rows=[...tile.matchAll(/<div data-contrast-surface="([^"]+)" data-contrast-role="([^"]+)"><dt>[^<]+<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)];
  assert.equal(rows.length,report.length,`Contrast report coverage: ${p.id}`);
  for (const row of report) {
    const matches=rows.filter(([,surface,role])=>surface===row.surface&&role===row.role);
    assert.equal(matches.length,1,`Contrast report coverage: ${p.id} ${row.label}`);
    assert(matches[0][3].includes(`${row.ratio.toFixed(2)}:1`),`Contrast ratio mark: ${p.id} ${row.label}`);
    assert(matches[0][3].includes(row.ratio<(p.contrastTarget||4.5)?'⚠':'✓'),`Contrast verdict: ${p.id}`);
    assert(record.includes(`| ${row.label} | ${row.text} | ${row.background} | ${row.ratio.toFixed(2)}:1 |`),`Missing documented pair: ${p.id} ${row.label}`);
  }
  const shapes=[...tile.matchAll(/<(?:rect|path) data-surface="([^"]+)"[^>]* fill="([^"]+)"/g)];
  assert(tile.includes(`data-surface="canvas"`) && tile.includes(`background:${surfaces.canvas};`),'Canvas surface: '+p.id);
  const drawn=new Set(['canvas']);
  for (const [,label,colour] of shapes) {
    assert.equal(colour,surfaces[label],`Rendered surface colour: ${p.id} ${label}`);
    drawn.add(label);
  }
  assert.deepEqual([...drawn].sort(),Object.keys(surfaces).sort(),`Rendered surface coverage: ${p.id}`);
  const texts=[...tile.matchAll(/<text\b([^>]*)>/g)];
  for (const [,attributes] of texts) {
    const pair=attributes.match(/data-text-surface="([^"]+)" data-text-role="([^"]+)" fill="([^"]+)"/);
    assert(pair,`Unreported rendered text: ${p.id}`);
    const [,surface,role,colour]=pair;
    const row=report.find(r=>r.surface===surface&&r.role===role);
    assert(row,`Unreported rendered text surface: ${p.id} ${surface}`);
    assert.equal(colour,row.text,`Rendered text colour: ${p.id} ${surface}`);
    assert(drawn.has(surface),`Missing text background: ${p.id} ${surface}`);
  }
  return report;
}
for (const p of palettes) verifySurfaces(tileFor(p),p);
const mixed=palettes.filter(p=>p.scheme==='mixed-contrast');
const neon=palettes.filter(p=>p.scheme==='neon-synthwave');
assert.equal(mixed.length,4); assert.equal(neon.length,5);
assert.equal(neon.filter(p=>p.source==='jig-harmonies').length,3);
for (const p of [...mixed,...neon]) {
  const report=verifySurfaces(tileFor(p),p);
  assert(report.every(r=>r.ratio>=(p.contrastTarget||4.5)),`New tile text target: ${p.id}`);
  for (const name of ['chrome','sidebar','dock']) assert(report.some(r=>r.surface===name),'Missing chrome contrast: '+p.id);
}
const darkNodes=mixed.find(p=>p.id==='mixed-dark-components');
assert(run(`luminance('${darkNodes.bg[0]}')`)>run(`luminance('${darkNodes.bg[2]}')`));
assert.notEqual(run(`textOn(${JSON.stringify(darkNodes)},'canvas')`),run(`textOn(${JSON.stringify(darkNodes)},'node')`));
const solid=mixed.find(p=>p.id==='mixed-solid-headers');
assert.equal(run(`surfaces(${JSON.stringify(solid)})['action header']`),solid.accents[1]);
const enhanced=mixed.find(p=>p.id==='mixed-enhanced-light');
assert.equal(enhanced.contrastTarget,7);
assert(tileFor(enhanced).includes('text ≥ 7:1 on all surfaces'));
assert(docs.includes('WCAG 2.2 SC 1.4.6')&&docs.includes('Panda was checked and skipped'));
assert(expected.sources.find(s=>s.id==='shades-of-purple').reuseNotes.includes('also be MIT licensed'));
assert(docs.includes('retain the complete upstream notice'));
assert.equal(run('contrast("#595959","#ffffff")')>=7,true);
assert.equal(run('contrast("#5a5a5a","#ffffff")')<7,true);
for (const p of neon) {
  assert.equal(p.mode,'dark'); assert.equal(p.text,'#f3f4f8'); assert.equal(p.muted,'#b9becb');
  assert.equal(run(`surfaces(${JSON.stringify(p)}).chip`),p.states[0]);
  const texts=[...tileFor(p).matchAll(/<text\b[^>]* fill="([^"]+)"/g)].map(m=>m[1]);
  assert(texts.every(c=>!p.accents.includes(c)&&!p.states.includes(c)),`Neon body text: ${p.id}`);
}
// Detection proof: remove one used surface's report and give dark nodes dark
// text. Both must fail the same checker, with the originals passing afterwards.
const originalTile=tileFor(darkNodes);
assert.throws(()=>verifySurfaces(originalTile.replace(/<div data-contrast-surface="chip"[^>]*>[\s\S]*?<\/div>/,''),darkNodes),/Contrast report coverage/);
assert.throws(()=>verifySurfaces(originalTile.replace(/(data-text-surface="node" data-text-role="primary" fill=")[^"]+/, '$1#171923'),darkNodes),/Rendered text colour/);
assert.throws(()=>verifySurfaces(originalTile.replace('data-surface="dock"','data-surface="missing-dock"'),darkNodes),/Rendered surface colour/);
verifySurfaces(originalTile,darkNodes);
for (const [scheme,count] of [['mixed-contrast',4],['neon-synthwave',5]]) {
  assert(markup.includes(`<option value="${scheme}">`));
  assert.equal(run(`filterPalettes(PALETTES,"all","${scheme}").length`),count);
}
assert.equal(run('filterPalettes(PALETTES,"dark","mixed-contrast").length'),0);
assert.equal(run('filterPalettes(PALETTES,"light","neon-synthwave").length'),0);
assert.equal(run('contrast("#000000","#ffffff")'),21);
assert.equal(run('contrast("#839496","#839496")'),1);
assert(run('contrast("#767676","#ffffff")')>=4.5);
assert(run('contrast("#777777","#ffffff")')<4.5);
assert.equal(run('mix("#000000","#ffffff",.5)'), '#808080');
assert.equal(oklch(0,0,0),'#000000');
assert.equal(oklch(1,0,0),'#ffffff');
assert.equal(oklch(.62795536,.25768331,29.233885),'#ff0000');
assert.equal(run('filterPalettes(PALETTES,"dark","all").length'),38);
assert.equal(run('filterPalettes(PALETTES,"light","all").length'),34);
assert.equal(run('filterPalettes(PALETTES,"all","editor").length'),9);
assert.equal(run('filterPalettes(PALETTES,"all","wada").length'),24);
assert.equal(run('filterPalettes(PALETTES,"dark","wada").length'),12);
assert.equal(run('filterPalettes(PALETTES,"light","wada").length'),12);
assert.equal(run('filterPalettes(PALETTES,"dark","triadic").length'),3);
assert.equal(run('filterPalettes(PALETTES,"light","monochrome-accent").length'),3);
assert.equal(run('filterPalettes(PALETTES,"dark","unknown").length'),0);
assert.equal(run('contrastReport({...PALETTES[0],text:PALETTES[0].bg[0]}).filter(r=>r.ratio<4.5).length>0'),true);

// Exercise the real event handlers using a deliberately small DOM substitute.
// This checks control/state wiring, not browser layout or native DOM behaviour.
class Element {
  constructor(id='') { this.id=id; this.children=[]; this.listeners={}; this.dataset={}; this.hidden=false; this.value='all'; this.attributes={}; this.textContent=''; }
  addEventListener(name,fn) { this.listeners[name]=fn; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children=[]; }
  setAttribute(name,value) { this.attributes[name]=value; }
  querySelectorAll() { return this.buttons||[]; }
}
const ids=['gallery','mode','scheme','status','shortlist','shortlist-empty','pick-count','storage-status','no-results','reset-filters'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
elements.gallery.children=palettes.map(p=>new Element(p.id));
elements.gallery.buttons=palettes.map(p=>{const e=new Element();e.dataset.favourite=p.id;return e;});
const store=new Map();
const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
const windowEvents={};
const document={getElementById:id=>elements[id]||({textContent:JSON.stringify(id==='palette-data'?palettes:expected.sources)}),
  createElement:()=>new Element(),addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')document.start=fn;}};
const ui=appContext(expected.app,palettes,expected.sources,{document,window:{localStorage:storage,addEventListener:(key,fn)=>windowEvents[key]=fn}});
document.start();
assert.equal(elements.status.textContent,'72 of 72 groups');
for (const [scheme,count] of [['mixed-contrast',4],['neon-synthwave',5]]) {
  elements.scheme.value=scheme; elements.scheme.listeners.change();
  assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,count);
  elements.mode.value='light'; elements.mode.listeners.change();
  assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,scheme==='mixed-contrast'?4:0);
  elements['reset-filters'].listeners.click();
}
elements.scheme.value='wada'; elements.scheme.listeners.change();
assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,24);
assert.equal(elements.status.textContent,'24 of 72 groups');
elements.mode.value='dark'; elements.mode.listeners.change();
assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,12);
elements['reset-filters'].listeners.click();
const button=elements.gallery.buttons[0];
const click=()=>elements.gallery.listeners.click({target:{closest:()=>button}});
click(); assert.equal(button.attributes['aria-pressed'],'true');
assert.equal(elements.shortlist.children.length,1);
assert.equal(elements['pick-count'].textContent,'1 picked');
assert.deepEqual(JSON.parse([...store.values()][0]),['nord-dark']);
vm.runInContext('init()',ui); // A page reload restores the saved shortlist.
assert.equal(elements['pick-count'].textContent,'1 picked');
elements.mode.value='light'; elements.scheme.value='triadic'; elements.mode.listeners.change();
assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,3);
assert.equal(elements.status.textContent,'3 of 72 groups');
elements.shortlist.children[0].children[0].listeners.click(); // Reveal a hidden pick.
assert.equal(elements.mode.value,'all');
assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,72);
click(); assert.equal(button.attributes['aria-pressed'],'false');
assert.equal(elements.shortlist.children.length,0);
assert.equal(elements['shortlist-empty'].hidden,false);
elements.mode.value='dark'; elements.mode.listeners.change();
elements['reset-filters'].listeners.click();
assert.equal(elements.gallery.children.filter(e=>!e.hidden).length,72);
vm.runInContext('globalThis.badStorage={getItem(){throw Error("denied")},setItem(){throw Error("quota")}}',context);
assert.equal(run('readFavourites(badStorage,new Set(PALETTES.map(p=>p.id))).size'),0);
assert.equal(run('writeFavourites(badStorage,new Set(["nord-dark"]))'),false);
for (const value of ['{bad json','null','{}','["gone",4,"nord-dark","nord-dark"]']) {
  context.savedValue=value;
  assert.equal(run('readFavourites({getItem:()=>savedValue},new Set(["nord-dark"])).size'),value.startsWith('[')?1:0);
}
// Other tabs update the shortlist, and clearing storage removes picks.
store.set('jig.palette-gallery.favourites.v1','["solarized-light"]');
windowEvents.storage({key:'jig.palette-gallery.favourites.v1'});
assert.equal(elements['pick-count'].textContent,'1 picked');
assert.equal(elements.shortlist.children[0].children[0].textContent,'Solarized light · light');
store.clear(); windowEvents.storage({key:null});
assert.equal(elements['pick-count'].textContent,'0 picked');
const wadaButton=elements.gallery.buttons.find(b=>b.dataset.favourite==='wada-135');
elements.gallery.listeners.click({target:{closest:()=>wadaButton}});
assert.deepEqual(JSON.parse([...store.values()][0]),['wada-135']);
vm.runInContext('init()',ui);
assert.equal(wadaButton.attributes['aria-pressed'],'true');
assert.equal(elements.shortlist.children[0].children[0].textContent,'Wada 135 · calm · light');

// Seed a missing tile attribution in memory: the same coverage check must reject it.
assert.throws(()=>verifyCoverage(html,docs.replace('<a id="nord-dark"></a>',''),expected.sources),/Missing source entry for tile: nord-dark/);
verifyCoverage(html,docs,expected.sources);
console.log('PASS: inline script parses; all 72 tiles have attributed colour/source records and local reuse notices.');
console.log('PASS: pinned source colour membership, generated-file drift, board anatomy, contrast thresholds, OKLCH reference values.');
console.log('PASS: filters, favourites toggle/reload, shortlist reveal, two-tab sync, reset, corrupt/denied storage (Node VM).');
console.log('PASS: planted missing source entry rejected; original coverage passes. No browser launched.');

console.log('PASS: 24 numbered Wada sets, pinned data, source/neutral role separation, readable text, filters and planted Wada membership/contrast defects.');
console.log('PASS: four mixed and five neon tiles; 7:1 enhanced target; neutral neon text; every SVG surface/text pair matches its contrast report; planted report, text and chrome defects rejected.');
