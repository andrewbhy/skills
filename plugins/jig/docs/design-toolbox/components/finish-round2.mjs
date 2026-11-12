import { readFileSync, writeFileSync } from 'node:fs';
const url = new URL('./index.html', import.meta.url);
let html = readFileSync(url,'utf8');
html = html.replaceAll('Slow 2×','Slow 2 times').replaceAll('Slow 5×','Slow 5 times');
if(!html.includes('id="row-menu"'))html=html.replace('<dialog class="gc-dialog app-command',`<div class="gc-menu app-overlay" role="menu" aria-label="Row actions" id="row-menu" data-overlay data-ledger="menus" hidden><button type="button" class="gc-button gc-button--quiet" role="menuitem" id="row-menu-open">Open details</button><button type="button" class="gc-button gc-button--quiet" role="menuitem" id="row-menu-delete">Delete this row</button></div>\n<div class="gc-menu app-overlay" role="menu" aria-label="Folder actions" id="folder-menu" data-overlay data-ledger="menus" hidden><button type="button" class="gc-button gc-button--quiet" role="menuitem" id="folder-menu-toggle">Toggle folder</button><button type="button" class="gc-button gc-button--quiet" role="menuitem" data-view="workspace">Open workspace</button></div>\n<dialog class="gc-dialog app-command`);
html = html.replace('data-local-action="Folder created"','data-create-folder');
html = html.replace('class="app-breadcrumbs" aria-label="File path"','class="app-breadcrumbs gc-scroll" tabindex="0" aria-description="Arrow keys scroll long paths" aria-label="File path"');
html = html.replaceAll("all('[data-density]')", "all('button[data-density]')");
html = html.replace("dialog.dataset.state='closing';};", "dialog.dataset.state='closing';if(dialog.dataset.keyboard==='true')finishDialog();};");
html = html.replace("if(restore)menuTrigger.focus();};", "if(restore)menuTrigger.focus();if(menu.dataset.keyboard==='true'){menu.hidden=true;menu.dataset.state='closed';}};");
html = html.replace(/<header class="app-titlebar"(?![^>]*data-component)/,'<header class="app-titlebar" data-component="window-title-bar" data-state="default"');
html = html.replaceAll('<tr>','<tr data-ledger="app-table">');
for (const [component,ledger] of [['combobox','combobox'],['number-input','number-input'],['slider','slider'],['tag-input','tag-input']]) {
 html = html.replace(new RegExp(`data-component="${component}" data-state="default"(?! data-ledger)`, 'g'),`data-component="${component}" data-state="default" data-ledger="${ledger}"`);
}
html = html.replace(/<(?:div|header|footer|aside|table|tr|tbody)\b[^>]*>/g,tag => {
 const cls = tag.match(/class="([^"]*)"/)?.[1]?.split(/\s+/) || [];
 const id = tag.match(/id="([^"]*)"/)?.[1];
 const exceptions = {};
 if(cls.some(c=>['app-titlebar','app-toolbar','app-settings','app-statusbar','app-banner'].includes(c)))exceptions['uneven-gaps']='Flexible spacer separates leading context from trailing actions; gaps inside each group are 8 px.';
 if(id==='app-explorer'){
  exceptions['zero-gaps']='Explorer heading joins its file tree; both belong to one navigation group.';
  exceptions['uneven-gaps']='File tree and component catalogue are separate groups, with a 24 px section gap.';
 }
 if(id==='app-inspector')exceptions['zero-gaps']='Pane heading is attached to the inspector body; its body supplies the inset.';
 if(id==='file-tree'||id==='tree-files')exceptions['zero-gaps']='Contiguous desktop tree hit targets have no gutter.';
 if(cls.includes('app-editor-tab'))exceptions['zero-gaps']='The close action belongs to the same tab surface.';
 if(id==='app-grid'||cls.some(c=>['app-grid-row','app-grid-head'].includes(c)))exceptions['zero-gaps']='Contiguous grid cells and rows support range selection; gutters would split the selection surface.';
 if(tag.startsWith('<table')||tag.startsWith('<tr')||tag.startsWith('<tbody'))exceptions['zero-gaps']='Table cells share their row and divider, with no external gutter.';
 if(cls.includes('app-code'))exceptions['zero-gaps']='The code header is attached to its reading surface.';
 if(cls.includes('gc-panel'))exceptions['zero-gaps']='The panel header is attached to its body.';
 for(const [kind,reason]of Object.entries(exceptions))if(!tag.includes('data-spacing-'+kind+'='))tag=tag.replace(/>$/,` data-spacing-${kind}="${reason}">`);
 return tag;
});
html=html.replace(/<span>\s*(<span class="gc-row-title")/g,'<span data-spacing-zero-gaps="Title and optional metadata share one text column.">$1');
writeFileSync(url,html);
