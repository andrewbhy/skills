import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { contrast, saturation, chroma, perceptualDistance, selectionDistanceMinimum, inspectPack, inspectTheme } from '../docs/design-toolbox/themes/check-themes.mjs';
import { typeHues, packNames, paletteTokens, harmonyFor, presentationFor, sourceFor, retiredNames } from '../docs/design-toolbox/themes/palette.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const themes = path.join(root, 'docs/design-toolbox/themes');
const checker = path.join(themes, 'check-themes.mjs');
const setToken = (css, key, value) => css.replace(new RegExp(`--${key}: [^;]+;`), `--${key}: ${value};`);
const run = (...args) => spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8', cwd: root });

async function fixture(t) {
  const evidence = path.join(root, '.jig/evidence');
  await mkdir(evidence, { recursive: true });
  const scratch = await mkdtemp(path.join(evidence, 'theme-pack-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const folder = path.join(scratch, 'custom-pack');
  await mkdir(folder);
  const css = await readFile(path.join(themes, 'retired/night/theme.css'), 'utf8');
  const manifest = { ...JSON.parse(await readFile(path.join(themes, 'retired/night/theme.json'), 'utf8')), name: 'custom-pack' };
  const put = async (source = css, metadata = manifest) => {
    await writeFile(path.join(folder, 'theme.css'), source);
    await writeFile(path.join(folder, 'theme.json'), JSON.stringify(metadata));
  };
  await put();
  return { folder, css, manifest, put };
}

test('[risk: shipped packs or preview list drift] all bundled packs and reports pass', async () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /7 themes; 521 exact token roles each; \d+ pairs pass/);
  const generated = spawnSync(process.execPath, [path.join(themes, 'build-palettes.mjs'), '--check'], { encoding: 'utf8', cwd: root });
  assert.equal(generated.status, 0, generated.stderr);
  const preview = await readFile(path.join(themes, 'preview.html'), 'utf8');
  const packs = [];
  for (const entry of await readdir(themes, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const files = await readdir(path.join(themes, entry.name));
      if (files.includes('theme.json') || files.includes('theme.css')) packs.push(entry.name);
    }
  }
  packs.sort();
  assert.deepEqual([...preview.matchAll(/<option value="([\w-]+)">/g)].map(match => match[1]).sort(), packs);
  assert.match(preview, /href="white-board\/theme\.css"/);
  assert.match(preview, /stylesheet\.href = `\$\{name\}\/theme\.css`/);
  assert.doesNotMatch(preview, /signal-pop/);
  assert.match(preview, /for \(const option of picker.options\)/);
  assert.match(preview, /frame.srcdoc =/);
  assert.match(preview, /frame.title =/);
  const harmonies = JSON.parse(preview.match(/<script id="harmony-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  for (const name of packs) assert.deepEqual(harmonies[name], (await inspectPack(path.join(themes, name))).manifest.harmony);
  const sample = preview.match(/<template id="comparison-sample">([\s\S]*?)<\/template>/)[1];
  for (const component of ['accent-tabs', 'category', 'section-mark', 'is-selected', 'screen-sample', 'queue-sample', 'badge working']) assert.ok(sample.includes(component), component);
  for (const type of Object.keys(typeHues)) {
    assert.equal([...sample.matchAll(new RegExp(`data-type="${type}"`, 'g'))].length, 2, `${type} appears on map and queue`);
    for (const part of ['surface', 'header']) assert.ok(preview.includes(`var(--type-${type}-${part})`));
    assert.ok(sample.includes(`id="icon-${type}"`), `${type} has a shape icon`);
  }
  for (const role of ['canvas', 'frame-body', 'frame-header', 'node-body', 'node-header', 'panel']) assert.ok(preview.includes(`var(--surface-${role})`));
  for (const role of ['accent-1', 'accent-2', 'accent-3', 'stroke-accent']) assert.ok(preview.includes(`var(--${role})`), role);
  assert.ok(sample.includes('data-ledger="preview-harmony"'));
  assert.match(preview, /sample\.querySelector\('\[data-harmony-name\]'\)\.textContent/);
  for (const selector of ['.node-content', '.queue-item']) {
    const declarations = preview.slice(preview.indexOf(`${selector} {`)).split('}')[0];
    assert.match(declarations, /background: var\(--surface-node-body\)/);
    assert.doesNotMatch(declarations, /background: var\(--type-/);
  }
  const solidChips = [...preview.matchAll(/\.badge\.(\w+)\s*\{[^}]*background: var\(--state-(\w+)\);/g)].map(match => match[1]);
  // Pass 7: no chip uses a solid state fill; Needs you uses its checked orange reading fill with dark ink.
  assert.deepEqual(solidChips, []);
  assert.match(preview, /\.badge\.attention \{ color: var\(--state-attention\); background: var\(--state-attention-surface\); \}/);
  assert.match(preview, /\.queue-item > \.type-icon \{[^}]*border-radius: 50%/);
  // Compile the disk preview's script without launching a browser.
  new Function(preview.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test('[risk: selection reads as a state] identical, aliased and near state colours fail while distinct selection recovers', async t => {
  const { folder, css, put } = await fixture(t);
  assert.equal(perceptualDistance('#123456', '#123456'), 0);
  assert.ok(Math.abs(perceptualDistance('#000000', '#ffffff') - 1) < 1e-7);
  // Published Oklab reference: linear sRGB red -> (0.627955, 0.224863, 0.125846).
  assert.ok(Math.abs(perceptualDistance('#ff0000', '#000000') - Math.hypot(0.627955, 0.224863, 0.125846)) < 1e-6);
  assert.equal(selectionDistanceMinimum, 0.08);
  const tokens = (await inspectPack(path.join(themes, 'retired/night'))).values;
  for (const state of ['attention', 'working', 'success', 'error', 'unknown']) {
    for (const role of ['border-selected', 'connector-selected']) {
      await put(setToken(css, role, `var(--state-${state})`));
      const result = run(folder);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`selection distance: --${role} / --state-${state}`), result.stderr);
    }
  }
  const state = tokens['state-working'];
  // Change one channel without carrying into another channel at ff.
  const close = state.slice(0, 5) + (parseInt(state.slice(5), 16) === 255 ? 254 : parseInt(state.slice(5), 16) + 1).toString(16).padStart(2, '0');
  assert.ok(perceptualDistance(close, state) < selectionDistanceMinimum);
  await put(setToken(css, 'border-selected', close));
  assert.match(run(folder).stderr, /selection distance: --border-selected \/ --state-working/);
  // Reproduce the pass-2 Neon collision: lime selection was also Working.
  const neon = await readFile(path.join(themes, 'retired/neon-synth/theme.css'), 'utf8');
  await put(setToken(setToken(neon, 'border-selected', '#b0f45c'), 'state-working', '#b0f45c'));
  assert.match(run(folder).stderr, /selection distance: --border-selected \/ --state-working: 0.000000/);
  await put();
  assert.equal(run(folder).status, 0, 'restored pack passes');
});

test('[risk: accent data bypasses the pack contract] missing, malformed and unresolvable decorative roles are refused', async t => {
  const { folder, css, put } = await fixture(t);
  for (const [source, reason] of [
    [css.replace(/  --accent-1:[^;]+;\n/, ''), /missing token --accent-1/],
    [setToken(css, 'accent-2', 'hotpink'), /Expected opaque sRGB hex/],
    [setToken(css, 'accent-3', 'var(--absent)'), /unknown token absent/],
    [setToken(css, 'stroke-accent', '100px'), /stroke-accent must be 1px through 6px/],
  ]) {
    await put(source);
    const result = run(folder);
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
  }
  await put();
  assert.equal(run(folder).status, 0);
});

test('[risk: variants confound the comparison] Night dim changes surfaces only and Neon vivid changes accent coverage only', async () => {
  const load = async name => (await inspectPack(path.join(themes, 'retired', name))).tokens;
  const [night, dim, warm, neon, vivid] = await Promise.all(['night', 'night-dim', 'night-warm', 'neon-synth', 'neon-synth-vivid'].map(load));
  const changed = (a, b) => Object.keys(a).filter(key => a[key] !== b[key]).sort();
  assert.deepEqual(changed(night, dim), Array.from({ length: 6 }, (_, index) => `scale-dark-neutral-${index + 1}`).sort());
  assert.deepEqual(changed(neon, vivid), ['stroke-accent']);
  assert.ok(changed(night, warm).every(key => /^scale-(dark|light)-neutral-/.test(key)));
  for (const tokens of [night, dim, warm]) {
    assert.equal(tokens['text-link'], tokens['text-primary']);
  }
  for (const name of ['night', 'night-dim', 'night-warm', 'neon-synth', 'neon-synth-vivid']) {
    const pack = await inspectPack(path.join(themes, 'retired', name));
    assert.ok(pack.rows.filter(row => row.foreground === 'text-secondary').every(row => row.ratio >= 4.5), `${name} secondary text passes on the expanded surface contract`);
    assert.equal(pack.tokens['text-body'], '0.875rem');
    assert.equal(pack.tokens['text-meta'], '0.8125rem');
  }
  const values = (await inspectPack(path.join(themes, 'retired/night'))).values;
  const originalNight = contrast(values['text-primary'], values['surface-canvas']);
  assert.ok(originalNight >= 11 && originalNight <= 13);
});

test('[risk: hardcoded pack names reject user themes] standalone external folder validates without report files', async t => {
  const { folder, css, put } = await fixture(t);
  assert.equal(run(folder).status, 0);
  await put(setToken(css, 'text-secondary', 'var(--text-primary)'));
  assert.equal(run(folder).status, 0, 'valid token aliases pass');
});

test('[risk: layers collapse or type colour competes with state] surface, tint, chroma and scale defects are detected and recover', async () => {
  const css = await readFile(path.join(themes, 'retired/night/theme.css'), 'utf8');
  const original = inspectTheme('seed', css, 'dark');
  assert.ok(chroma('#777777') < 1e-7);
  assert.ok(chroma('#ff0000') > 0.25);
  assert.equal(original.surfaceDistances.length, 15, 'every pair of six layers');
  assert.equal(original.tintDistances.length, 120, 'every pair of sixteen type washes, including header/body neighbours');
  const cases = [
    ['surface-frame-body', 'var(--scale-neutral-1)', /surface step: canvas \/ frame-body/],
    ['surface-node-header', 'var(--scale-neutral-4)', /surface step: frame-header \/ node-header/],
    ['surface-panel', 'var(--scale-neutral-5)', /surface step: node-header \/ panel/],
    ['type-ticket-surface', 'var(--scale-blue-9)', /type tint chroma/],
    ['type-ticket-surface', 'var(--scale-neutral-1)', /type tint \/ canvas distance/],
    ['type-ticket-surface', 'var(--scale-cyan-2)', /type tint must use one harmony hue/],
    ['scale-dark-blue-3', 'var(--scale-dark-cyan-3)', /type header combinations must differ/],
    ['type-ticket-header', 'var(--scale-blue-2)', /type tint header step/],
    ['state-working', 'var(--scale-neutral-11)', /state chroma/],
    ['state-success', 'var(--scale-green-3)', /saturated state .* must alias step 9/],
    ['scale-light-red-7', 'transparent', /Expected opaque sRGB hex/],
    ['scale-blue-3', 'var(--scale-light-blue-3)', /must select manifest mode dark/],
    ['text-on-state', 'var(--scale-dark-neutral-12)', /text-on-state \/ state-working/],
  ];
  for (const [key, value, reason] of cases) {
    assert.throws(() => inspectTheme('seed', setToken(css, key, value), 'dark'), reason, key);
  }
  assert.throws(() => inspectTheme('seed', css.replace(/  --scale-light-red-12:[^;]+;\n/, ''), 'dark'), /missing token --scale-light-red-12/);
  assert.doesNotThrow(() => inspectTheme('restored', css, 'dark'), 'restored source passes');
});

test('[risk: an unused appearance contains unusable scales] every generated light and dark profile meets the same contract', async () => {
  for (const name of packNames) {
    const original = await readFile(path.join(themes, name, 'theme.css'), 'utf8');
    for (const mode of ['light', 'dark']) {
      let css = original.replace(/color-scheme: (light|dark)/, `color-scheme: ${mode}`);
      for (const [key, value] of Object.entries(paletteTokens(name, mode))) css = setToken(css, key, value);
      assert.doesNotThrow(() => inspectTheme(`${name}-${mode}`, css, mode, harmonyFor(name), presentationFor(name)));
    }
  }
});

test('[risk: a rainbow or unrecognisable states pass as harmony] declared geometry, scale hues and tint limits fail independently and recover', async t => {
  const { folder, css, manifest, put } = await fixture(t);
  const harmony = manifest.harmony;
  const inspect = (source, scheme = harmony) => inspectTheme('custom-pack', source, 'dark', scheme);
  const seeds = [
    [{ ...harmony, offsets: { ...harmony.offsets, cyan: -90 } }, /analogous angles/],
    [{ ...harmony, offsets: { ...harmony.offsets, orange: 90 } }, /analogous angles/],
    [{ ...harmony, keyHue: 360 }, /keyHue and neutralHue/],
    [{ ...harmony, keyColour: '#777777' }, /keyColour/],
    [{ ...harmony, stateHues: { ...harmony.stateHues, red: 260 } }, /red must stay recognisable/],
    [{ ...harmony, scheme: 'rainbow' }, /scheme is unsupported/],
    [null, /harmony must be an object/],
  ];
  for (const [scheme, reason] of seeds) {
    await put(css, { ...manifest, harmony: scheme });
    const result = run(folder);
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
  }
  const neon = harmonyFor('neon-synth');
  assert.throws(() => inspect(css, { ...neon, offsets: { ...neon.offsets, cyan: 180 } }), /split-complementary angles/);
  assert.throws(() => inspect(css, { ...neon, offsets: { ...neon.offsets, violet: 60 } }), /split-complementary angles/);
  for (const [key, value, reason] of [
    ['scale-dark-blue-9', 'var(--scale-dark-red-9)', /harmony hue: scale-dark-blue-9/],
    ['scale-light-cyan-9', 'var(--scale-light-red-9)', /harmony hue: scale-light-cyan-9/],
    ['accent-3', 'var(--scale-red-9)', /harmony role hue: accent-3/],
    ['state-error', 'var(--scale-blue-9)', /recognisable state hue: error/],
    ['type-ticket-surface', 'var(--scale-green-2)', /type tint must use one harmony hue/],
    ['scale-light-blue-3', 'var(--scale-light-blue-9)', /type tint chroma: scale-light-blue-3/],
  ]) assert.throws(() => inspect(setToken(css, key, value)), reason, key);
  const result = inspect(css);
  const headers = Object.keys(typeHues).map(type => result.tokens[`type-${type}-header`]);
  assert.equal(new Set(headers).size, 8, 'eight hue/lightness combinations');
  assert.equal(new Set(headers.map(value => value.match(/scale-([a-z]+)-/)[1])).size, 4);
  // A user pack can move its key and all scales together, without a bundled name.
  let rotated = css;
  for (const [key, value] of Object.entries(paletteTokens('calm-workbench', 'dark'))) rotated = setToken(rotated, key, value);
  await put(rotated, { ...manifest, harmony: harmonyFor('calm-workbench') });
  assert.equal(run(folder).status, 0, 'custom harmony is not tied to the folder name');
  await put();
  assert.equal(run(folder).status, 0, 'restored pack passes');
});

test('[risk: invalid packs get a successful exit] malformed metadata, tokens and contrast are refused with reasons', async t => {
  const { folder, css, manifest, put } = await fixture(t);
  const cases = [
    [css.replace(/  --text-primary:[^;]+;\n/, ''), manifest, /missing token --text-primary/],
    [css.replace('--text-primary:', '--text-typo:'), manifest, /unknown token --text-typo/],
    [css.replace('--text-primary:', '--text-primary: #ffffff; --text-primary:'), manifest, /duplicate token/],
    [setToken(css, 'text-secondary', '#222222'), manifest, /text-secondary \/ surface-panel:.*< 4.5/],
    [setToken(css, 'focus-ring', '#222222'), manifest, /focus-ring \/ surface-panel:.*< 3/],
    [setToken(css, 'text-primary', 'var(--text-primary)'), manifest, /cyclic token/],
    [setToken(css, 'text-primary', 'var(--typo)'), manifest, /unknown token typo/],
    [css.replace('--space-inline: 0.5rem;', '--space-inline: var(--typo);'), manifest, /unknown token typo/],
    [css + '\nh1 { color: blue; }', manifest, /unchecked CSS rules refused/],
    [css.replace('--motion-feedback: 0ms;', '--text-primary: #abcdef;'), manifest, /unchecked CSS rules refused/],
    [css, { ...manifest, mode: 'light' }, /color-scheme dark must match manifest mode light/],
    [css, { ...manifest, mode: 'dim' }, /mode must be light or dark/],
    [css, { ...manifest, author: '' }, /author must be a nonempty string/],
    [css, { ...manifest, description: null }, /description must be a nonempty string/],
    [css, { ...manifest, licence: '' }, /licence must be a nonempty string/],
    [css, { ...manifest, version: 'next' }, /version must have/],
    [css, { ...manifest, name: 'wrong' }, /name must match/],
  ];
  for (const [source, metadata, reason] of cases) {
    await put(source, metadata);
    const result = run(folder);
    assert.equal(result.status, 1, `must fail: ${reason}`);
    assert.match(result.stderr, reason);
  }
  await writeFile(path.join(folder, 'theme.json'), '{');
  assert.equal(run(folder).status, 1, 'broken JSON fails');
  await put();
  await rm(path.join(folder, 'theme.css'));
  assert.match(run(folder).stderr, /ENOENT/);
  await put();
  const batch = run(folder, path.join(folder, 'missing-pack'));
  assert.equal(batch.status, 1);
  assert.match(batch.stdout, /PASS custom-pack/);
  assert.match(batch.stderr, /FAIL missing-pack/);
  assert.equal(run(folder).status, 0, 'restored pack passes');
});

test('[risk: blue body text passes arithmetic but has poor felt contrast] neutral rule rejects saturated text and follows aliases', async t => {
  const { folder, css, put } = await fixture(t);
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(saturation('#eeeeee'), 0);
  assert.ok(Math.abs(saturation('#999999') - 0) < 1e-10);
  // Former night primary passes every ratio, yet fails the added felt rule.
  await put(setToken(css, 'text-primary', '#e6edf5'));
  let result = run(folder);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /felt contrast: --text-primary/);
  assert.doesNotMatch(result.stderr, /< 4.5/);
  await put(setToken(css, 'text-primary', '#ddddcc'));
  result = run(folder);
  assert.equal(result.status, 1, 'exact 20% saturation is excluded despite floating point rounding');
  assert.match(result.stderr, /saturation 20.00% must be below 20%/);
  await put(setToken(css, 'text-secondary', 'var(--accent-1)'));
  result = run(folder);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /felt contrast: --text-secondary/);
  await put();
  assert.equal(run(folder).status, 0);
});

test('[risk: favourites silently become unrelated palettes or archived choices return] source anchors, default and archive stay intact', async () => {
  const preview = await readFile(path.join(themes, 'preview.html'), 'utf8');
  assert.deepEqual([...preview.matchAll(/<option value="([\w-]+)">/g)].map(match => match[1]), packNames);
  assert.match(preview, /let appliedTheme = 'white-board'/);
  assert.match(preview, /color: var\(--type-text\)/);
  assert.match(preview, /--type-body-mix/);
  assert.match(preview, /\.board-chat a \{ color: var\(--text-chrome\)/);
  for (const name of packNames) {
    const pack = await inspectPack(path.join(themes,name));
    const source = sourceFor(name);
    assert.equal(pack.manifest.source.id, source.id);
    assert.equal(pack.manifest.source.group, source.name);
    for (const [index,slot] of ['blue','cyan','violet','orange'].entries()) assert.equal(pack.values[`scale-${pack.manifest.mode}-${slot}-9`], source.accents[index]);
    if (name.startsWith('white-board')) {
      assert.equal(pack.values['surface-canvas'], '#ffffff');
      assert.equal(pack.values['surface-panel'], '#ffffff');
      assert.notEqual(pack.values['surface-chrome'], pack.values['surface-panel'], 'pass 7: chrome is a visible step from the panel');
    }
  }
  for (const name of retiredNames) {
    assert.doesNotMatch(preview, new RegExp(`<option value="${name}">`));
    assert.equal((await inspectPack(path.join(themes,'retired',name))).name,name);
  }
  const licence = await readFile(path.join(themes,'dracula/LICENSE-Dracula.txt'),'utf8');
  assert.equal(licence, await readFile(path.join(themes,'gallery/licences/dracula.txt'),'utf8'));
  assert.match(licence, /Copyright \(c\) 2023 Dracula Theme/);
});

test('[risk: solid header or dark chrome text escapes the old tint checks] unreadable new roles fail and recover', async () => {
  for (const [name,role,replacement,reason] of [
    ['white-board','type-ticket-text','var(--type-ticket-header)',/type-ticket-text \/ type-ticket-header: 1.0000/],
    ['studio','text-chrome','#202532',/text-chrome \/ surface-chrome: 1.0000/],
    ['studio','text-chrome-secondary','#202532',/text-chrome-secondary \/ surface-chrome: 1.0000/],
    ['white-board-soft','type-ticket-edge','var(--scale-red-9)',/type edge must use its type harmony hue/],
    ['white-board-soft','type-body-mix','0%',/type-body-mix must match typeStyle/],
    ['clarity','text-secondary','#666666',/text-secondary \/ .*< 7/],
  ]) {
    const pack = await inspectPack(path.join(themes,name));
    const css = await readFile(path.join(themes,name,'theme.css'),'utf8');
    const inspect = source => inspectTheme(name,source,pack.manifest.mode,pack.manifest.harmony,pack.manifest.presentation);
    assert.throws(() => inspect(setToken(css,role,replacement)),reason);
    assert.doesNotThrow(() => inspect(css));
  }
});

test('[risk: source palettes bypass metadata or enhanced contrast] source geometry and Clarity target are enforced', async t => {
  const { put, folder } = await fixture(t);
  const css = await readFile(path.join(themes,'clarity/theme.css'),'utf8');
  const original = (await inspectPack(path.join(themes,'clarity'))).manifest;
  const manifest = {...original,name:'custom-pack'};
  await put(css,manifest);
  assert.equal(run(folder).status,0);
  for (const [metadata,reason] of [
    [{...manifest,source:null}, /requires source group\/id/],
    [{...manifest,presentation:null}, /requires source group\/id/],
    [{...manifest,presentation:{...manifest.presentation,contrastTarget:3}}, /invalid presentation/],
    [{...manifest,harmony:{...manifest.harmony,sourceColours:['#ff0000',...manifest.harmony.sourceColours.slice(1)]}}, /sourceColours \/ blue angle mismatch/],
  ]) {
    await put(css,metadata);
    assert.match(run(folder).stderr,reason);
  }
  await put(css,manifest);
  assert.equal(run(folder).status,0);
  const pack = await inspectPack(path.join(themes,'clarity'));
  assert.ok(pack.rows.filter(row=>row.threshold>=4.5).every(row=>row.threshold===7 && row.ratio>=7));
});
