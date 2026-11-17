import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectPack, inspectTheme, perceptualDistance, hueAngle, chroma, contrast } from './check-themes.mjs';
import { packNames, paletteTokens, retiredNames, sourceFor } from './palette.mjs';

const folder = fileURLToPath(new URL('.', import.meta.url));
const cssFor = name => readFile(new URL(`${name}/theme.css`, import.meta.url), 'utf8');
const setToken = (css, key, value) => css.replace(new RegExp(`--${key}: [^;]+;`), `--${key}: ${value};`);
const inspect = (pack, css, harmony = pack.manifest.harmony) => inspectTheme(pack.name, css, pack.manifest.mode, harmony, pack.manifest.presentation);
const packFor = name => inspectPack(fileURLToPath(new URL(`${name}/`, import.meta.url)));

test('[risk: shipped palettes or reports drift] all seven packs and generated reports pass', () => {
  for (const args of [['build-palettes.mjs','--check'],['check-themes.mjs']]) {
    const result = spawnSync(process.execPath,args,{ cwd:folder,encoding:'utf8' });
    assert.equal(result.status,0,result.stderr);
  }
});

test('[risk: hues collapse or states impersonate types] every pack has eight distinct headers and both profiles pass', async () => {
  for (const name of packNames) {
    const pack = await packFor(name);
    const css = await cssFor(name);
    const headers = Object.keys(pack.manifest.harmony.typeAngles).map(type => pack.values[`type-${type}-header`]);
    for (let i=0; i<headers.length; i++) for (const other of headers.slice(i+1)) {
      assert.ok(perceptualDistance(headers[i],other) >= .045,name);
      const gap = Math.abs(hueAngle(headers[i])-hueAngle(other));
      assert.ok(Math.min(gap,360-gap) >= 30,name);
    }
    assert.throws(() => inspect(pack,setToken(css,'type-check-header','var(--type-ticket-header)')),/type header combinations must differ/);
    assert.throws(() => inspect(pack,setToken(css,'type-check-header','var(--state-success)')),/type\/state distance/);
    assert.throws(() => inspect(pack,css,{...pack.manifest.harmony,typeAngles:{...pack.manifest.harmony.typeAngles,check:pack.manifest.harmony.typeAngles.ticket}}),/typeAngles must be at least 30/);
    for (const mode of ['light','dark']) {
      let profile = css.replace(/color-scheme: (light|dark)/,`color-scheme: ${mode}`);
      for (const [key,value] of Object.entries(paletteTokens(name,mode))) profile = setToken(profile,key,value);
      assert.doesNotThrow(() => inspectTheme(name,profile,mode,pack.manifest.harmony,pack.manifest.presentation));
    }
    // Rechecking unchanged source proves recovery; seeds exist only in memory.
    assert.doesNotThrow(() => inspect(pack,css));
  }
});

test('[risk: zero surface steps are reported as a pass] every adjacent layer including chrome rejects collapse', async () => {
  for (const name of packNames) {
    const pack = await packFor(name);
    const css = await cssFor(name);
    for (const {first,second,distance} of pack.surfaceDistances) {
      assert.ok(distance >= .025,`${name}: ${first}/${second}`);
      assert.throws(() => inspect(pack,setToken(css,`surface-${second}`,`var(--surface-${first})`)),/surface step/);
    }
    const reversed = setToken(css,'scale-light-neutral-3','var(--scale-light-neutral-1)');
    assert.throws(() => inspect(pack,reversed),/light neutral grounds must decrease monotonically/);
  }
});

test('[risk: dark cards flatten and navy chrome turns grey] dark headers and Electric chrome reject regressions', async () => {
  for (const name of ['dracula','electric']) {
    const pack = await packFor(name);
    const css = await cssFor(name);
    for (const type of Object.keys(pack.manifest.harmony.typeAngles)) {
      assert.ok(perceptualDistance(pack.values[`type-${type}-header`],pack.values['surface-node-body']) >= .10);
      assert.throws(() => inspect(pack,setToken(css,`type-${type}-header`,'var(--surface-node-body)')),/dark header\/body step/);
    }
    if (name === 'electric') assert.throws(() => inspect(pack,setToken(css,'surface-chrome','#222222')),/navy chrome must retain/);
  }
});

test('[risk: whiteboard attention stays muddy or unreadable] light chips use chromatic orange with checked text', async () => {
  for (const name of packNames.filter(name => !['electric','dracula'].includes(name))) {
    const pack = await packFor(name);
    const fill = pack.values['state-attention-surface'];
    assert.ok(chroma(fill) >= .10);
    assert.ok(hueAngle(fill) >= 50 && hueAngle(fill) <= 65);
    assert.ok(contrast(pack.values['state-attention'],fill) >= pack.manifest.presentation.contrastTarget);
    const css = await cssFor(name);
    assert.throws(() => inspect(pack,setToken(css,'state-attention-surface','#eeeeee')),/attention chip fill must be chromatic/);
  }
});

test('[risk: source identity or archived packs change] anchors, warm paper and archived contracts remain valid', async () => {
  for (const name of packNames) {
    const pack = await packFor(name);
    for (const [i,slot] of ['blue','cyan','violet','orange'].entries()) assert.equal(pack.values[`scale-${pack.manifest.mode}-${slot}-9`],sourceFor(name).accents[i]);
  }
  assert.equal((await packFor('white-board')).values['surface-canvas'],'#ffffff');
  assert.equal((await packFor('paper')).values['surface-canvas'],sourceFor('paper').bg[0]);
  assert.notEqual((await packFor('paper')).values['surface-canvas'],'#ffffff');
  for (const name of retiredNames) await packFor(`retired/${name}`);
});

test('[risk: card fill stops below content or chrome is overwritten] preview paints the full card and uses checked chip/chrome roles', async () => {
  const html = await readFile(new URL('preview.html',import.meta.url),'utf8');
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body]) => ({selectors:selector.trim().split(',').map(value=>value.trim()),body}));
  const backgrounds = selector => rules.filter(rule => rule.selectors.includes(selector) && rule.body.includes('background:')).map(rule => rule.body.match(/background:\s*([^;]+);/)[1]);
  assert.equal(backgrounds('.map-node').at(-1),'color-mix(in srgb, var(--type-surface) var(--type-body-mix), var(--surface-node-body))');
  assert.equal(backgrounds('.node-content').at(-1),backgrounds('.map-node').at(-1));
  for (const selector of ['.board-queue','.board-chat']) assert.equal(backgrounds(selector).at(-1),'var(--surface-chrome)');
  assert.equal(backgrounds('.badge.attention').at(-1),'var(--state-attention-surface)');
  assert.match(style,/\.badge\.attention \{ color: var\(--state-attention\);/);
  const script = html.match(/<script\s*>([\s\S]*?)<\/script\s*>/i)[1];
  const geometry = new Function(`${script}; return boardGeometryTest;`)();
  geometry.checkBoardGeometry(style);
});
