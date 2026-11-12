// Static checks only: no browser, server, dependencies or network.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { build, guides, renderMarkdown, section } from './build-guides.mjs';
import { checkPageShells } from './check-page-shell.mjs';
import { breadcrumb } from './page-shell.mjs';
assert.deepEqual(checkPageShells().findings, [], 'Every toolbox page uses the shared shell');
const root=path.dirname(fileURLToPath(import.meta.url));
const read=file=>readFileSync(path.join(root,file),'utf8');
const pages=new Map([
 ['index.html',''],['themes/gallery/index.html','Colour palettes'],
 ['themes/gallery/template.html','Colour palettes'],['themes/preview.html','Themes'],
 ['motion-lab/index.html','Motion lab'],['typography/index.html','Typography'],['logo/logo.html','Logo candidates'],
 ['components/index.html','Golden components'],
 ...guides.map(g=>[`guides/${g.id}.html`,g.title]),
]);
build(true); // Generated documentation must remain an exact view of its sources.
function checkBreadcrumb(file,html,name){
 const nav=html.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert(nav,`${file}: breadcrumb missing`);
 assert(!/<nav\b/.test(nav),`${file}: unexpected nested nav`);
 const links=[...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
 assert.equal(links.length,2,`${file}: jig and toolbox links`);
 assert.equal(links[1][2],'Design toolbox');
 for(const [,href] of links){
  const resolved=path.resolve(root,path.dirname(file),href);
  assert(existsSync(resolved),`${file}: missing breadcrumb target ${href}`);
 }
 assert.equal(path.resolve(root,path.dirname(file),links[1][1]),path.join(root,'index.html'));
 assert(html.includes(breadcrumb(file,name||'Design toolbox')),`${file}: canonical brand shell`);
 if(name)assert(nav.includes(`<span aria-current="page">${name}</span>`),`${file}: current tool name`);
}
let parsed=0;
for(const [file,name] of pages){
 const html=read(file);checkBreadcrumb(file,html,name);
 for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(attrs.includes('application/json')){if(!body.includes('/* PALETTE_DATA */')&&!body.includes('/* SOURCE_DATA */'))JSON.parse(body);continue;}
  if(body.includes('/* GALLERY_APP */'))continue; // build input placeholder
  const src=attrs.match(/src="([^"]+)"/)?.[1];
  new vm.Script(src?readFileSync(path.join(root,path.dirname(file),src),'utf8'):body,{filename:src||file});parsed++;
 }
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
 if(file.endsWith('.css'))for(const [,href]of readFileSync(file,'utf8').matchAll(/@import url\("([^"]+)"\);/g))assert(existsSync(path.resolve(path.dirname(file),href)),`${file}: missing stylesheet ${href}`);
}
// Every home entry links to a local tool or documentation that exists.
for(const [,href]of read('index.html').matchAll(/href="([^"]+)"/g))assert(existsSync(path.resolve(root,href.split('#')[0])),`Home target: ${href}`);
function checkHome(html) {
 const look=html.match(/<section aria-labelledby="look-title">([\s\S]*?)<\/section>/)?.[1];
 const agents=html.match(/<section class="agent-tools"[\s\S]*?<\/section>/)?.[0];
 assert(look&&agents,'Home must separate visual choices from agent tooling');
 assert(html.indexOf(look)<html.indexOf(agents),'Visual choices must come first');
 const choices=[...look.matchAll(/<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>/g)].map(m=>[m[1],m[2]]);
 assert.deepEqual(choices,[['themes/gallery/','Colour palettes'],['themes/preview.html','Themes and board'],['typography/','Typography'],['logo/logo.html','Logo'],['motion-lab/','Motion lab'],['components/','Golden components'],['grid/index.html','Grid system']],'Seven human-facing choices, including Golden components');
 assert(look.includes('Watch and tune motion timing.'));
 assert(agents.includes('Agent tooling')&&agents.includes('Rules and checks agents run'));
 const items=[...agents.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>m[1]);
 assert.equal(items.length,8,'Eight compact tool entries');
 for(const guide of guides) {
  const item=items.find(s=>s.includes(`href="guides/${guide.id}.html"`));
  assert(item,`Missing rendered agent guide: ${guide.id}`);
  assert(item.includes(guide.title)&&item.includes('Runs '),`${guide.id}: benefit and when it runs`);
  for(const skill of guide.skills.split(', '))assert(item.includes(skill),`${guide.id}: skill ${skill}`);
 }
 for(const [,href]of (look+agents).matchAll(/href="([^"]+)"/g))assert(!/\.(?:md|mjs|cjs)(?:#|$)/.test(href),'Home tools must link to readable pages');
}
checkHome(read('index.html'));
for(const guide of guides) {
 const file=`guides/${guide.id}.html`, html=read(file);
 assert(html.includes('id="example"')&&html.includes('id="documentation"'),`${file}: finding and rendered rules`);
 for(const word of ['Before:','After / recorded fix:','Why:','Source:'])assert(html.includes(word),`${file}: ${word}`);
 assert(!/href="(?!https?:)[^"]+\.md(?:#[^"]*)?"/.test(html.replace(/<nav class="breadcrumb"[\s\S]*?<\/nav>/,'')),`${file}: raw Markdown link`);
 // Resolve every local document/asset and fragment, not just breadcrumb links.
 for(const [,href]of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if(/^https?:\/\//.test(href))continue;
  const [target,fragment]=href.split('#');
  let resolved=path.resolve(root,'guides',target||`${guide.id}.html`);
  assert(existsSync(resolved),`${file}: missing local target ${href}`);
  if(fragment) {
   if(!path.extname(resolved))resolved=path.join(resolved,'index.html');
   // The motion lab builds its section ids at runtime from sample ids in stages.js.
   const labIds=resolved===path.join(root,'motion-lab','index.html')?[...readFileSync(path.join(root,'motion-lab','stages.js'),'utf8').matchAll(/(?:sample\(|\[)'([a-z][a-z-]*)'/g)].map(m=>m[1]):[];
   assert(readFileSync(resolved,'utf8').includes(`id="${fragment}"`)||labIds.includes(fragment),`${file}: missing fragment ${href}`);
  }
 }
}
// Renderer contract: readable structure and escaped literal code without scripts.
const rendered=renderMarkdown('# Rules\n\n<!-- internal -->\n\n| Check | Rule |\n|---|---|\n| **Focus** | `x < y` |\n\n- Keep labels\n  with controls\n\n1. First\n2. Second\n\n```html\n<button autofocus>Close</button>\n```\n\n<script>alert(1)</script> [unsafe](javascript:alert) [home](index.html)','README.md');
for(const expected of ['<h2 id="rules">Rules</h2>','<table>','<th scope="col">Check</th>','<strong>Focus</strong>','<code>x &lt; y</code>','<ul><li>Keep labels with controls</li></ul>','<ol>','&lt;button autofocus&gt;','&lt;script&gt;','href="../index.html"'])assert(rendered.includes(expected),`Guide renderer: ${expected}`);
assert(!rendered.includes('<script>')&&!rendered.includes('href="javascript:')&&!rendered.includes('internal'));
const related=renderMarkdown('[motion](README.md#motion-basics) [type](README.md#toolbox-pages-and-typography-8-november-2026) [missing](README.md#missing-section)','README.md');
assert(related.includes('href="motion-basics.html#motion-basics"')&&related.includes('href="../typography/"')&&!related.includes('href="craft-basics.html'),'Documentation links must preserve their subject');
assert.throws(()=>section('## Changed heading\nText','Expected heading'),/Missing documentation section/);
assert.throws(()=>checkHome(read('index.html').replace('href="components/"','href="components/README.md"')),/Seven human-facing choices/);
assert.throws(()=>checkHome(read('index.html').replace('href="guides/theme-checker.html"','href="themes/check-themes.mjs"')),/Missing rendered agent guide/);
function checkPreview(html) {
 const sample=html.match(/<template id="comparison-sample">([\s\S]*?)<\/template>/)?.[1];
 assert(sample?.includes('class="gc gc-stack"'),'Preview must compose golden primitives');
 for(const name of ['gc-button--primary','gc-button--secondary','data-state="focus-visible"'])assert(sample.includes(name),`Preview missing golden ${name}`);
 assert(!sample.includes('class="primary"'),'Preview action specimens must use golden classes');
 assert(sample.includes('href="../components/"'),'Preview must link to the golden reference');
 for(const file of ['../motion-lab/tokens.css','../components/components.css']) {
  assert(html.includes(`'${file}'`),`Comparison frames must load shared ${file}`);
  assert(existsSync(path.resolve(root,'themes',file)));
 }
 // Copies keep the reference's class and icon geometry, rather than another style.
 const golden=read('components/index.html');
 assert(golden.includes('class="gc-button gc-button--primary"')&&golden.includes('M4 12l5 5L20 6'));
}
checkPreview(read('themes/preview.html'));
assert.throws(()=>checkPreview(read('themes/preview.html').replace("'../components/components.css'","'../missing.css'")),/must load shared/);
assert.equal((read('logo/logo.html').match(/class="logo-row"/g)||[]).length,24,'Four marks, three sizes, two appearances');
for(const name of ['drill-guide','clamp-fence','letter-toolbox','square-guide'])assert(existsSync(path.join(root,'logo',name+'.svg')));
const types=read('typography/type.css');
assert(types.includes('BlinkMacSystemFont'));assert.equal((types.match(/--type-[a-z]+:/g)||[]).length,6);
assert(!/--type-[a-z]+:\s*(?:[0-9]|10)px\b/.test(types));
for(const file of ['themes/gallery/gallery.css','jig-pages.css'])assert(!/font-size:\s*10px\b/.test(read(file)));
const result=spawnSync(process.execPath,[path.join(root,'motion-lab/check.cjs')],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr);process.stdout.write(result.stdout);
const components=spawnSync(process.execPath,[path.join(root,'components/check-components.mjs')],{encoding:'utf8'});
assert.equal(components.status,0,components.stderr);process.stdout.write(components.stdout);
// Detection proof: check an isolated string with the toolbox target deliberately broken.
assert.throws(()=>checkBreadcrumb('typography/index.html',read('typography/index.html').replace('href="../index.html"','href="../missing-home.html"'),'Typography'),/missing breadcrumb target/);
// The theme checker must reject arbitrary CSS imports and unresolved type aliases.
const {inspectPack,inspectTheme}=await import('./themes/check-themes.mjs');
const pack=await inspectPack(path.join(root,'themes/white-board'));
const css=read('themes/white-board/theme.css');
assert.throws(()=>inspectTheme(pack.name,css.replace('../../typography/type.css','../../untrusted.css'),pack.manifest.mode,pack.manifest.harmony,pack.manifest.presentation),/expected one :root/);
assert.throws(()=>inspectTheme(pack.name,css.replace('var(--jig-font-sans)','var(--missing-font)'),pack.manifest.mode,pack.manifest.harmony,pack.manifest.presentation),/unknown token/);
console.log(`PASS: ${pages.size} breadcrumb headers resolve; ${parsed} scripts parse; home/CSS targets resolve; type and logo specimens complete.`);
console.log('PASS: planted broken home link, arbitrary CSS import and missing font alias are rejected. No browser launched.');
console.log('PASS: seven visual choices above eight agent tools; generated guides, examples, source drift, local links/fragments and escaped Markdown; planted raw/missing guide links rejected.');
