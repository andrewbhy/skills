if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/ui-tokens-check.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Static token evidence. Unsupported CSS is a gap, never an invented colour.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contrast, analyseCrisp, analyseConsistency } from './visual-crisp.mjs';
import { lintCSS, readLocalStylesheets, checkStyles, gridContext, styleDebt } from './style-lint.mjs';
import { configuration } from './test-budget.mjs';

const read = file => readFileSync(file, 'utf8');
export function validateStateTable(table) {
  if (table?.version !== 1 || !Array.isArray(table.states) || !table.states.length || !Array.isArray(table.tokenFiles) || !table.tokenFiles.length || table.tokenFiles.some(f => typeof f !== 'string' || !f)) throw new Error('State table requires version 1, tokenFiles and states');
  const names = new Set();
  if(table.checks!==undefined&&!Array.isArray(table.checks))throw new Error('checks must be token-only rows');
  for (const s of [...table.states,...table.checks || []]) {
    if (!s || ['name','component','state','scope','role','textToken','fillToken','sizeToken','weightToken'].some(k => typeof s[k] !== 'string' || !s[k].trim()) || names.has(s.name) || !Object.hasOwn(s, 'borderToken') || s.borderToken !== null && typeof s.borderToken !== 'string' || s.static !== undefined && typeof s.static !== 'boolean' || s.files !== undefined && (!Array.isArray(s.files) || s.files.some(f => typeof f !== 'string' || !f))) throw new Error(`Invalid state table row: ${s?.name}`);
    names.add(s.name);
    const role=table.roles?.[s.role];
    if(!role||typeof role.sizeToken!=='string'||typeof role.weightToken!=='string')throw new Error(`Missing role binding: ${s.role}`);
  }
  if (table.presets !== undefined && (!Array.isArray(table.presets) || table.presets.some(p => typeof p.name !== 'string' || !p.name || typeof p.selector !== 'string' || !p.selector || p.selectors !== undefined && (!Array.isArray(p.selectors)||p.selectors.some(s=>typeof s!=='string'||!s))))) throw new Error('Invalid token presets');
  return table;
}

// Deliberately flat custom-property rules; nested/conditional rules need an
// explicit preset or rendered evidence. Token files must not contain component CSS.
export function tokenRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@(?:media|supports|layer|container)\b/.test(css)) throw new Error('Conditional token CSS requires explicit flattened preset files');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), values: Object.fromEntries([...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)].map(d => [d[1], d[2].trim()])) }));
}
export function resolveToken(name, tokens, stack = []) {
  if (stack.includes(name)) throw new Error(`Cyclic token: ${[...stack, name].join(' -> ')}`);
  if (!Object.hasOwn(tokens, name)) throw new Error(`Missing token: ${name}`);
  return tokens[name].replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, key) => resolveToken(key, tokens, [...stack, name]));
}
export function parseColor(value) {
  value = value.trim().toLowerCase();
  const named = { white:'#ffffff', black:'#000000', transparent:'#00000000' };
  value = named[value] || value;
  if (/^#[\da-f]{3,4}$/.test(value)) value = '#' + [...value.slice(1)].map(c => c + c).join('');
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/.test(value)) return [1,3,5].map(i => parseInt(value.slice(i,i+2),16)).concat(value.length === 9 ? parseInt(value.slice(7),16)/255 : 1);
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/);
  if (rgb) {
    const c = rgb.slice(1,4).map(Number), a = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    if (c.some(n => n > 255) || a > 1) throw new Error(`Invalid colour: ${value}`);
    return [...c,a];
  }
  const mix = value.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/);
  if (mix) { const a = parseColor(mix[1]), b = parseColor(mix[3]), p = Number(mix[2])/100; if (p > 1) throw new Error('Invalid mix percentage'); return a.map((v,i) => v*p+b[i]*(1-p)); }
  throw new Error(`Unsupported colour: ${value}`);
}
const opaque = (ink, ground) => {
  if (ground[3] !== 1) throw new Error('Fill requires an opaque ground token');
  return [...ink.slice(0,3).map((v,i) => v*ink[3]+ground[i]*(1-ink[3])),1];
};
export function analyseTokens(table, rules, { thresholds = {}, typeScale } = {}) {
  validateStateTable(table);
  const findings = [], gaps = [], measurements = [];
  const base = Object.assign({}, ...rules.filter(r => r.selector === ':root' || r.selector === 'html').map(r => r.values));
  const presets = table.presets?.length ? table.presets : [{name:'default', selector:':root'}];
  for (const preset of presets) {
    const tokens = {...base};
    for(const selector of [preset.selector,...preset.selectors || []]) Object.assign(tokens,...rules.filter(r=>r.selector===selector).map(r=>r.values));
    Object.assign(tokens,preset.tokens);
    const snapshot = [];
    for (const row of [...table.states,...table.checks || []]) try {
      const color = key => parseColor(resolveToken(key,tokens));
      const ground = row.surfaceToken ? color(row.surfaceToken) : [255,255,255,1];
      const background = opaque(color(row.fillToken),ground), raw = color(row.textToken), foreground = opaque(raw,background);
      const size = resolveToken(row.sizeToken,tokens), weight = resolveToken(row.weightToken,tokens);
      if (!/^\d+(?:\.\d+)?px$/.test(size) || parseFloat(size)<=0 || !/^\d+(?:\.\d+)?$/.test(weight) || Number(weight) < 1 || Number(weight) > 1000) throw new Error(`Size/weight must resolve to positive px/number: ${row.name}`);
      const m = {element:row.scope, component:`${row.component}:${row.variant || ''}`, componentRoot:true, slot:row.slot || row.role, state:row.state, role:row.role,
        text:row.text || 'token specimen', tone:row.tone || (row.role === 'secondary' ? 'secondary' : ['coloured','accent'].includes(row.role) ? 'coloured' : 'primary'),
        disabled:row.state === 'disabled', filledControl:row.filledControl === true, fontSize:parseFloat(size), fontWeight:weight,
        opacity:raw[3], foreground, background, color:raw, selected:row.selected === true || row.state.includes('selected'),
        radius:Array(4).fill(row.radiusToken || table.selectionRadiusToken ? resolveToken(row.radiusToken || table.selectionRadiusToken,tokens) : '0px'),
        borders:row.borderToken ? [{edge:'all',color:opaque(color(row.borderToken),background)}] : [], preset:preset.name };
      snapshot.push(m); measurements.push(m);
      if (m.fontSize < 12) findings.push({kind:'font-too-small',element:row.scope,state:row.name,measured:m.fontSize,expected:'at least 12 CSS px',preset:preset.name});
      if (typeScale && !typeScale.includes(m.fontSize)) findings.push({kind:'off-type-scale',element:row.scope,state:row.name,measured:m.fontSize,expected:typeScale,preset:preset.name});
      const role = table.roles?.[row.role];
      for (const [property, token] of [['fontSize',role?.sizeToken],['fontWeight',role?.weightToken]]) if (token) {
        const expected = property === 'fontSize' ? parseFloat(resolveToken(token,tokens)) : resolveToken(token,tokens);
        if (m[property] !== expected) findings.push({kind:'state-typography',element:row.scope,state:row.name,property,measured:m[property],expected,preset:preset.name});
      }
    } catch (e) { gaps.push(`${preset.name}/${row.name}: ${e.message}`); }
    const crisp = analyseCrisp(snapshot,{thresholds});
    const consistent = analyseConsistency(snapshot);
    findings.push(...[...crisp.findings,...consistent.findings].map(f => ({...f,state:[...table.states,...table.checks || []].find(r=>r.scope===f.element)?.name,preset:preset.name})));
    // Every preset proves on-accent ink even when no filled control is in this slice.
    for (const pair of table.accentPairs || []) try {
      const a = parseColor(resolveToken(pair.textToken,tokens)), b = parseColor(resolveToken(pair.fillToken,tokens));
      const measured = contrast(opaque(a,b),b);
      if (measured < 4.5) findings.push({kind:'text-contrast',element:pair.fillToken,measured,expected:'contrast >= 4.5',preset:preset.name});
    } catch (e) { gaps.push(`${preset.name}: ${e.message}`); }
  }
  return {findings:findings.map(f => ({...f,source:'script',inspector:'crisp',layer:'tokens'})),gaps,measurements};
}

export function tokenInputs(url, stateTable, source) {
  const u = source ? pathToFileURL(resolve(source)) : new URL(url);
  if (u.protocol !== 'file:') return {gaps:['Token layer requires a local --state-table and --source page for remote URLs'],findings:[]};
  const page = fileURLToPath(u), directory = dirname(page), html = read(page);
  const filename = stateTable ? resolve(stateTable) : resolve(directory,'data/states.json');
  if (!existsSync(filename)) return {findings:[],gaps:['Missing data/states.json; token semantics and static coverage are unverified'],directory,page,html};
  const table = validateStateTable(JSON.parse(read(filename)));
  // Paths always resolve beside the page, including an external sidecar table.
  const urls = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => new URL(m[1],u).href).filter(h => /\.css(?:[?#]|$)/.test(h));
  const tokenURLs = table.tokenFiles.map(f => pathToFileURL(resolve(directory,f)).href);
  const disk = readLocalStylesheets([...urls,...tokenURLs]);
  return {table,directory,page,html,filename,disk,tokenURLs};
}
export function checkTokens({url, path, 'state-table':stateTable, source, crispThresholds = {}} = {}) {
  const started = performance.now();
  let report;
  try {
    const input = url || source ? tokenInputs(url,stateTable,source) : { staticOnly: true };
    if (input.staticOnly) report = checkStyles(path);
    else if (!input.table) {
      report = { findings: input.findings, gaps: input.gaps };
      if (input.page) {
        const grid = gridContext(input.page, '', input.html);
        const staticReport = checkStyles(input.page);
        // A declared grid-only project can use this checker without inventing
        // a colour/state table. Other pages keep the existing semantics gap.
        report.findings.push(...staticReport.findings.map(f => ({ ...f, inspector: 'style', layer: 'tokens' })));
        report.gaps = grid.typeScale ? staticReport.gaps : [...report.gaps, ...staticReport.gaps];
      }
    }
    else {
      const rules = input.tokenURLs.flatMap(href => tokenRules(input.disk.localSheets[href] || ''));
      const grid = gridContext(input.page, '', input.html);
      report = {...analyseTokens(input.table,rules,{thresholds:crispThresholds,typeScale:grid.typeScale}),table:input.table,directory:input.directory};
      report.findings.push(...input.disk.findings.map(f => ({...f,inspector:'style',layer:'tokens'}))); report.gaps.push(...input.disk.gaps);
      const sources = Object.entries(input.disk.localSheets).filter(([href,css]) => css !== null && !input.tokenURLs.includes(href)).map(([file,css]) => ({file,css}));
      for (const m of input.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) sources.push({file:input.page,css:m[1]});
      for (const m of input.html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) sources.push({file:input.page,css:`*{${m[1] ?? m[2]}}`});
      for (const source of sources) { const result = lintCSS(source.css,{file:source.file,allowTokenDefinitions:false,...grid}); report.findings.push(...result.findings.map(f => ({...f,inspector:'style',layer:'tokens'}))); report.gaps.push(...result.gaps); }
    }
    const localPage = input.table && input.page && resolve(input.page);
    const toolbox = fileURLToPath(new URL('../../docs/design-toolbox/', import.meta.url));
    if (localPage?.startsWith(toolbox)) {
      report.findings = styleDebt(report.findings.map(f => {
        if (!f.file) return f;
        const file = f.file.startsWith('file:') ? fileURLToPath(f.file) : isAbsolute(f.file) ? f.file : resolve(dirname(localPage), f.file);
        return { ...f, file: relative(toolbox, file).replaceAll('\\', '/') };
      }), JSON.parse(read(resolve(toolbox, 'style-debt.json'))).entries);
    }
  } catch (e) { report = {findings:[],gaps:[e.message],invalid:true}; }
  report.elapsedMs = performance.now()-started; report.layer = 'tokens';
  report.tool = 'ui-tokens-check'; report.version = 2;
  report.layers = {tokens:{elapsedMs:report.elapsedMs}};
  report.counts = {findings:report.findings.length};
  report.status = report.gaps.length ? 'inconclusive' : report.findings.length ? 'findings' : 'passed';
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  try {
    if (args.length === 1 && !args[0].startsWith('--')) options.path = args[0];
    else for (let i=0;i<args.length;i+=2) { if (!['--url','--state-table','--source','--testing-config'].includes(args[i]) || !args[i+1]) throw new Error('Usage: [PATH] or --url URL [--state-table FILE] [--source LOCAL_HTML] [--testing-config FILE]'); options[args[i].slice(2)] = args[i+1]; }
    const report = checkTokens(options),{tokenBudgetMs}=configuration(process.cwd(),options['testing-config']);
    report.layers.tokens.budgetMs=tokenBudgetMs;report.overBudget=report.elapsedMs>tokenBudgetMs;if(report.overBudget)report.status='findings';
    console.log(JSON.stringify(report)); process.exitCode = report.status === 'inconclusive' ? 2 : report.status === 'findings' ? 1 : 0;
  } catch(e) { console.error(e.message); process.exitCode = 2; }
}
