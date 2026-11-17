import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Shared by the existing --setup CLI and the full open-state matrix runner.
export { inspectGeometry as geometry } from './application-geometry.mjs';
export default async function setup(page) {
 const params = new URL(page.url()).searchParams;
 const theme = params.get('theme') || 'white-board';
 await page.selectOption('#theme',theme);
 await page.waitForFunction(theme => document.querySelector('#theme-pack').sheet?.href.includes('/'+theme+'/theme.css'),theme);
 await page.selectOption('#app-density',params.get('density') || 'compact');
 await page.selectOption('#data-mode',params.get('mode') || 'Demo');
 await page.selectOption('#motion-speed',params.get('speed') || '1');
 if (params.get('view')) await page.evaluate(id => GoldenApp.showView(id),params.get('view'));
 if (params.get('overlay')) {
  const id = params.get('overlay');
  for await (const state of states(page)) if (state.name === id) return;
  throw new Error('Unknown overlay state: '+id);
 }
}

export async function* states(page, { sections = true } = {}) {
 await page.evaluate(() => GoldenApp.showView('workspace'));
 const chrome = ['.app-titlebar','.app-toolbar','.app-settings','#app-explorer','.app-editor-tabs','.app-breadcrumbs','#app-inspector','.app-statusbar'];
 for(const root of chrome) if(await page.locator(root).isVisible()) yield {name:'chrome-'+root.replace(/^[.#]/,''),root};
 const ids = sections ? await page.locator('#app-main > section').evaluateAll(els => els.filter(e=>e.id).map(e=>e.id)) : [];
 for(const id of ids) {
  await page.evaluate(id=>GoldenApp.showView(id),id);
  yield {name:id,root:'#'+id,replay:id};
 }
 await page.evaluate(()=>GoldenApp.showView('menus'));
 await page.getByRole('button',{name:'Item actions',exact:true}).count().then(async count=>{
  if(count)await page.getByRole('button',{name:'Item actions',exact:true}).click();
  else await page.locator('#menu-trigger').click();
 });
 yield {name:'context-menu-open',root:'#live-menu'};
 await page.keyboard.press('Escape');await page.waitForTimeout(200);
 await page.evaluate(()=>GoldenApp.showView('tooltips'));
 await page.locator('#tooltip-trigger').focus();
 yield {name:'tooltip-open',root:'#export-tip'};
 await page.keyboard.press('Escape');
 await page.evaluate(()=>GoldenApp.showView('dialogs'));
 await page.locator('#dialog-trigger').click();
 yield {name:'dialog-open',root:'#details-dialog'};
 await page.keyboard.press('Escape');await page.waitForTimeout(200);
 await page.evaluate(()=>GoldenApp.showView('toasts'));
 await page.locator('#toast-trigger').click();
 yield {name:'toast-open',root:'#live-toast'};
 await page.locator('#toast-dismiss').click();await page.waitForTimeout(200);
 await page.evaluate(()=>GoldenApp.showView('app-overlays'));
 await page.locator('[data-open="view-popover"]').click();
 yield {name:'popover-open',root:'#view-popover'};
 await page.keyboard.press('Escape');
 await page.locator('[data-open="new-menu"]').click();
 yield {name:'dropdown-open',root:'#new-menu'};
 await page.keyboard.press('Escape');
 await page.locator('#tab-overflow-trigger').click();
 yield {name:'tab-overflow-open',root:'#tab-overflow'};
 await page.keyboard.press('Escape');
 await page.evaluate(()=>GoldenApp.showView('app-editing'));
 await page.locator('#owner-combo').click();
 yield {name:'combobox-open',root:'#owner-options'};
 await page.locator('#owner-combo').fill('Nobody matches this');
 yield {name:'combobox-empty',root:'#owner-options'};
 await page.keyboard.press('Escape');
 await page.locator('#copies').fill('101');
 yield {name:'number-error',root:'#app-editing'};
 await page.locator('#copies').fill('2');
 await page.getByRole('button',{name:'Commands Ctrl K',exact:true}).click();
 yield {name:'command-palette-open',root:'#command-dialog'};
 await page.keyboard.press('Escape');
 await page.evaluate(()=>GoldenApp.showView('workspace'));
 const row = page.locator('#app-grid .app-grid-row:not([hidden])').first();
 if (await row.count()) {
  await row.click({button:'right'});
  yield {name:'file-context-menu-open',root:'#file-menu'};
  await page.keyboard.press('Escape');
 }
 await page.evaluate(()=>GoldenApp.showView('rows'));
 await page.locator('.gc-row:not(:disabled):not([hidden])').first().click({button:'right'});
 yield {name:'row-context-menu-open',root:'#row-menu'};
 await page.keyboard.press('Escape');
 if(!await page.locator('#app-explorer').isVisible())await page.getByRole('button',{name:'Explorer',exact:true}).click();
 await page.locator('#tree-folder').click({button:'right'});
 yield {name:'folder-context-menu-open',root:'#folder-menu'};
 await page.keyboard.press('Escape');
 await page.locator('#tree-folder').focus();await page.keyboard.press('ArrowLeft');
 yield {name:'tree-collapsed',root:'#file-tree'};
 await page.keyboard.press('ArrowRight');
 yield {name:'tree-expanded',root:'#file-tree'};
 if(page.viewportSize().width<640)await page.keyboard.press('Escape');
 if(!await page.locator('#app-inspector').isVisible())await page.getByRole('button',{name:'Inspector',exact:true}).click();
 await page.locator('#properties-trigger').click();await page.waitForTimeout(180);
 yield {name:'accordion-collapsed',root:'.app-accordion'};
 await page.locator('#properties-trigger').click();await page.waitForTimeout(180);
 yield {name:'accordion-expanded',root:'.app-accordion'};
 if(page.viewportSize().width<880)await page.keyboard.press('Escape');
}
