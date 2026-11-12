import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../scripts/visual-clip.mjs';
import setup from './visual-setup.mjs';

const out=new URL('./evidence/interaction/',import.meta.url);mkdirSync(out,{recursive:true});
const report={tool:'application-interactions',runs:[],gaps:[]};let browser;
try {
 const memory=freemem()/2**30;console.log(memory.toFixed(1)+' GB free');
 if(memory<4)throw new Error('Browser skipped: less than 4 GB free memory');
 browser=await launchChrome();report.browser=browser.version();
 for(const width of [1400,560])for(const theme of ['white-board','electric'])for(const density of ['compact','comfortable']) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const run={width,theme,density,passed:[],failures:[]};report.runs.push(run);
  const check=async(name,fn)=>{try{await fn();run.passed.push(name);}catch(e){run.failures.push({name,message:e.stack});}};
  try {
   const url=new URL('./index.html',import.meta.url);for(const [k,v]of Object.entries({theme,density}))url.searchParams.set(k,v);
   await page.goto(url.href);await setup(page);
   await check('window has no page scroll; compact/comfortable geometry and untouched initial focus',async()=>{
    const state=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).fontSize,body:getComputedStyle(document.body).fontSize,scroll:document.scrollingElement.scrollHeight,height:innerHeight,active:document.activeElement.tagName,control:document.querySelector('#new-file').getBoundingClientRect().height,icon:document.querySelector('#new-file svg').getBoundingClientRect().width,dialog:document.querySelector('#details-dialog').open}));
    assert.equal(state.root,'16px');assert.equal(state.body,'13px');assert(state.scroll<=state.height);assert.equal(state.active,'BODY');assert.equal(state.dialog,false);assert.equal(state.icon,16);assert.equal(state.control,density==='compact'?28:32);
   });
   await check('single, additive and Shift range grid selection; roving cells',async()=>{
    const cells=page.locator('#app-grid .app-grid-row [role=gridcell]:first-child');
    await cells.nth(0).click();await cells.nth(2).click({modifiers:['Shift']});
    assert.equal(await page.locator('#app-grid .app-grid-row[aria-selected=true]').count(),3);
    await cells.nth(1).click({modifiers:['Control']});assert.equal(await page.locator('#app-grid .app-grid-row[aria-selected=true]').count(),2);
    await cells.nth(0).focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.closest('[role=row]').dataset.file),'1');
    assert.equal(await page.locator('#app-grid [role=gridcell][tabindex="0"]').count(),1);
   });
   await check('keyboard context menu, Delete and Undo restore records and focus',async()=>{
    await page.locator('#app-grid .app-grid-row:not([hidden]) [role=gridcell]').first().focus();
    await page.keyboard.press('Shift+F10');assert.equal(await page.locator('#file-menu').isVisible(),true);
    await page.keyboard.press('End');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Delete/);
    await page.keyboard.press('Enter');assert.equal(await page.locator('#file-menu').isVisible(),false);
    assert((await page.evaluate(()=>GoldenApp.records.length))<3);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>GoldenApp.records.length),3);
    assert(await page.evaluate(()=>document.activeElement.isConnected&&!document.activeElement.closest('[hidden]')));
   });
   await check('sort and keyboard column resize; keyboard reorder and undo',async()=>{
    await page.getByRole('button',{name:'Name',exact:true}).click();assert.equal(await page.locator('[role=columnheader][aria-sort]').getAttribute('aria-sort'),'descending');
    const resize=page.getByRole('separator',{name:'Resize name column'});await resize.focus();await page.keyboard.press('ArrowRight');assert.equal(await resize.getAttribute('aria-valuenow'),'196');await page.keyboard.press('Home');assert.equal(await resize.getAttribute('aria-valuenow'),'160');
    const before=await page.evaluate(()=>GoldenApp.records.map(r=>r.id));
    await page.locator('#app-grid .app-grid-row:not([hidden]) [role=gridcell]').first().focus();await page.keyboard.press('Alt+ArrowDown');
    assert.notDeepEqual(await page.evaluate(()=>GoldenApp.records.map(r=>r.id)),before);await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>GoldenApp.records.map(r=>r.id)),before);
   });
   await check('toolbar has one tab stop and arrows skip disabled actions',async()=>{
    const toolbar=page.getByRole('toolbar',{name:'Workspace actions'});await toolbar.getByRole('button',{name:'Explorer',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.id),'new-file');assert.equal(await toolbar.locator('button[tabindex="0"]').count(),1);
   });
   await check('pointer resizing and native drag/drop agree with the drop position, with Undo',async()=>{
    await page.evaluate(()=>GoldenApp.showView('workspace'));
    const resize=page.getByRole('separator',{name:'Resize name column'}),box=await resize.boundingBox(),beforeWidth=Number(await resize.getAttribute('aria-valuenow'));
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+16,box.y+box.height/2);await page.mouse.up();assert.equal(Number(await resize.getAttribute('aria-valuenow')),beforeWidth+16);
    const before=await page.evaluate(()=>GoldenApp.records.map(r=>r.id)),target=page.locator('#app-grid .app-grid-row:not([hidden])').nth(1),targetBox=await target.boundingBox();
    await page.locator('#app-grid .app-drag').first().dragTo(target,{targetPosition:{x:40,y:targetBox.height-4}});
    assert.deepEqual(await page.evaluate(()=>GoldenApp.records.map(r=>r.id)),[before[1],before[0],...before.slice(2)]);await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>GoldenApp.records.map(r=>r.id)),before);
   });
   await check('combobox filtering, no result, IME boundary and retained typing focus',async()=>{
    await page.evaluate(()=>GoldenApp.showView('app-editing'));
    const input=page.getByRole('combobox',{name:'Owner',exact:true});await input.fill('Jules');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'Jules Martin');assert.equal(await input.getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.id),'owner-combo');
    await input.fill('No matching owner');assert.equal(await page.locator('#owner-empty').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#owner-options').isVisible(),false);
    await input.fill('김');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'김민서');
   });
   await check('number input validation and slider keyboard semantics',async()=>{
    const input=page.getByRole('spinbutton',{name:'Copies'});await input.fill('101');assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#copies-error').isVisible(),true);await input.fill('2');await input.press('ArrowUp');assert.equal(await input.inputValue(),'3');assert.equal(await input.getAttribute('aria-valuenow'),'3');
    const slider=page.getByRole('slider',{name:'Preview scale'});await slider.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#preview-scale-value').textContent(),'125%');
   });
   await check('tag add/remove and Undo, including markup-like text as plain content',async()=>{
    const field=page.getByRole('textbox',{name:'Tags',exact:true});await field.fill('<review>');await field.press('Enter');assert.equal(await page.getByRole('button',{name:'Remove <review> tag',exact:true}).count(),1);await field.press('Backspace');assert.equal(await page.getByRole('button',{name:'Remove <review> tag',exact:true}).count(),0);await field.press('Control+z');assert.equal(await page.getByRole('button',{name:'Remove <review> tag',exact:true}).count(),1);
    assert.equal(await page.getByRole('toolbar',{name:'Workspace actions'}).locator('button[tabindex="0"]').count(),1);
   });
   await check('command palette filter, keyboard action, Escape and focus return',async()=>{
    await page.getByRole('button',{name:'Commands Ctrl K',exact:true}).focus();await page.keyboard.press('Control+k');assert.equal(await page.getByRole('dialog',{name:'Commands',exact:true}).isVisible(),true);await page.getByRole('combobox',{name:'Find a command'}).fill('Show components');await page.keyboard.press('Enter');assert.equal(await page.locator('#buttons').isVisible(),true);assert.equal(await page.locator('#command-dialog').isVisible(),false);
    await page.getByRole('button',{name:'Commands Ctrl K',exact:true}).focus();await page.keyboard.press('Control+k');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'palette-trigger');
   });
   await check('legacy dialog and menu keyboard dismissal finish without animation events',async()=>{
    await page.evaluate(()=>GoldenApp.showView('dialogs'));await page.locator('#dialog-trigger').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#details-dialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#details-dialog').evaluate(e=>e.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'dialog-trigger');
    await page.keyboard.press('Enter');await page.locator('#dialog-close').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#details-dialog').evaluate(e=>e.open),false);
    await page.evaluate(()=>GoldenApp.showView('menus'));await page.locator('#menu-trigger').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('#live-menu').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-trigger');
   });
   await check('theme/density/fixture changes retain drafts; five fixtures use one renderer',async()=>{
    if(width<880)await page.getByRole('button',{name:'Inspector',exact:true}).click();
    await page.getByRole('textbox',{name:'Review note'}).fill('Keep this draft — 검토');
    for(const mode of ['Worst case','Empty','One','Many','Demo']){await page.selectOption('#data-mode',mode);const count=await page.evaluate(()=>GoldenApp.records.length);assert.equal(count,{'Worst case':8,Empty:0,One:1,Many:32,Demo:3}[mode]);}
    await page.selectOption('#app-density',density==='compact'?'comfortable':'compact');assert.equal(await page.getByRole('textbox',{name:'Review note'}).inputValue(),'Keep this draft — 검토');
    await page.selectOption('#app-density',density);
    if(width<880)await page.getByRole('button',{name:'Close inspector',exact:true}).click();
   });
   await check('tree navigation and pane resize have visible, retained focus',async()=>{
    if(width<640)await page.getByRole('button',{name:'Explorer',exact:true}).click();
    const folder=page.getByRole('treeitem',{name:'release',exact:true});await folder.focus();await page.keyboard.press('ArrowLeft');assert.equal(await folder.getAttribute('aria-expanded'),'false');await page.keyboard.press('ArrowRight');assert.equal(await folder.getAttribute('aria-expanded'),'true');await page.keyboard.press('ArrowDown');assert.match(await page.evaluate(()=>document.activeElement.className),/app-tree-file/);
    if(width>=640){const separator=page.getByRole('separator',{name:'Resize explorer',exact:true});await separator.focus();await page.keyboard.press('ArrowRight');assert.equal(await separator.getAttribute('aria-valuenow'),'212');}
    else await page.keyboard.press('Escape');
   });
   await check('no runtime errors',async()=>assert.deepEqual(errors,[]));
   await check('editor close/overflow keeps focus and reopens only the requested tab',async()=>{
    await page.evaluate(()=>GoldenApp.showView('workspace'));await page.getByRole('button',{name:'Close workspace tab',exact:true}).click();assert.equal(await page.locator('#workspace-tab').isVisible(),false);assert.equal(await page.locator('#reference-tab').getAttribute('aria-selected'),'true');
    await page.getByRole('button',{name:'Open tabs',exact:true}).click();await page.getByRole('menu',{name:'Open tabs',exact:true}).getByRole('menuitem',{name:'Workspace',exact:true}).click();assert.equal(await page.locator('#workspace-tab').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-tab');
   });
   await check('arrival while typing preserves draft, focus, view, selection and the grid tab stop',async()=>{
    await page.selectOption('#data-mode','Demo');await page.evaluate(()=>GoldenApp.showView('app-editing'));
    const before=await page.evaluate(()=>({count:GoldenApp.records.length,selected:GoldenApp.selected,scroll:document.querySelector('#app-main').scrollTop}));
    await page.getByRole('button',{name:'Play',exact:true}).click();const field=page.getByRole('textbox',{name:'Tags',exact:true});await field.fill('Still typing');await field.press('End');
    await page.waitForFunction(n=>GoldenApp.records.length===n+1,before.count);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'tag-entry');assert.equal(await field.inputValue(),'Still typing');assert.deepEqual(await page.evaluate(()=>GoldenApp.selected),before.selected);assert.equal(await page.locator('#app-editing').isVisible(),true);assert.equal(await page.locator('#app-main').evaluate(el=>el.scrollTop),before.scroll);assert.equal(await page.locator('#app-grid [role=gridcell][tabindex="0"]').count(),1);
    await page.getByRole('button',{name:'Pause',exact:true}).click();
   });
   await page.evaluate(()=>GoldenApp.showView('workspace'));
   await page.screenshot({path:fileURLToPath(new URL(`${width}-${theme}-${density}.png`,out))});
  } finally {await page.close();}
  console.log(`${width} ${theme} ${density}: ${run.passed.length} passed, ${run.failures.length} failed`);
 }
} catch(error){report.gaps.push(error.stack);}
finally {if(browser)await browser.close();}
writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
process.exitCode=report.gaps.length?2:report.runs.some(r=>r.failures.length)?1:0;
