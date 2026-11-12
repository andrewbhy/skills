import { readFileSync } from 'node:fs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { hues, typeHues, harmonyFor, familyHues, wrapHue, presentationFor } from './palette.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Only the fixed local typography dependency is trusted. Other CSS imports stay refused.
const sharedTypeCSS = readFileSync(new URL('../typography/type.css', import.meta.url), 'utf8');
const sharedType = Object.fromEntries([...sharedTypeCSS.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)].map(([,key,value])=>[key,value.trim()]));

// Semantic contract, pass 5, 2026-11-07. Decorative accents never encode state.
const contract = `surface-canvas surface-panel surface-navigation surface-selected surface-hover surface-disabled
text-primary text-secondary text-disabled text-on-action border-divider border-control border-selected action-primary text-link focus-ring
state-working state-working-surface state-success state-success-surface state-attention state-attention-surface
state-error state-error-surface state-unknown state-unknown-surface connector-relation connector-selected overlay-scrim
accent-1 accent-2 accent-3 stroke-accent
font-interface font-code text-meta text-body text-label text-section text-pane-title text-app-title leading-meta leading-body leading-heading leading-code
weight-body weight-emphasis tracking-interface space-inline-tight space-inline space-stack-tight space-stack space-section space-pane
inset-control-block inset-control-inline inset-node inset-pane gap-nodes gap-branches target-control target-compact target-coarse
stroke-divider stroke-focus focus-offset radius-control radius-panel radius-marker elevation-panel elevation-floating
layer-canvas layer-pane layer-menu layer-dialog layer-feedback motion-feedback motion-disclosure motion-placement motion-settle motion-arrival-distance ease-response ease-placement`
  .split(/\s+/).sort();
contract.push(...['frame-body', 'frame-header', 'node-body', 'node-header'].map(role => `surface-${role}`));
contract.push('text-on-state');
for (const type of Object.keys(typeHues)) contract.push(`type-${type}-surface`, `type-${type}-header`);
for (const mode of ['light', 'dark', '']) {
  for (const hue of Object.keys(hues)) {
    for (let step = 1; step <= 12; step++) contract.push(`scale-${mode ? mode + '-' : ''}${hue}-${step}`);
  }
}
contract.sort();
const componentContract = ['surface-chrome', 'text-chrome', 'text-chrome-secondary', 'border-chrome', 'type-body-mix',
  ...Object.keys(typeHues).flatMap(type => [`type-${type}-text`, `type-${type}-edge`])];

// Local design guardrails, not accessibility thresholds; see README.
export const tintChromaMaximum = 0.030;
export const surfaceDistanceMinimum = 0.025;
export const stateChromaMargin = 0.035;
export const typeHeaderDistanceMinimum = 0.045;
export const typeHueAngleMinimum = 30;
export const darkHeaderBodyDistanceMinimum = 0.10;
const surfaceLayers = ['canvas', 'frame-body', 'node-body', 'frame-header', 'node-header', 'panel'];
export const surfacePairs = surfaceLayers.flatMap((first, index) => surfaceLayers.slice(index + 1).map(second => [first, second]));

function linearRgb(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected opaque sRGB hex, got ${hex}`);
  return hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}

function luminance(hex) {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Original Oklab transform, D65 linear sRGB; Euclidean ΔEOK (0–1 scale).
// Formula: https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
function oklab(hex) {
  const [r, g, b] = linearRgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}

export const selectionDistanceMinimum = 0.08;
export function perceptualDistance(a, b) {
  const first = oklab(a);
  const second = oklab(b);
  return Math.hypot(...first.map((channel, index) => channel - second[index]));
}
export function chroma(hex) {
  const [, a, b] = oklab(hex);
  return Math.hypot(a, b);
}

export function hueAngle(hex) {
  const [, a, b] = oklab(hex);
  return wrapHue(Math.atan2(b, a) * 180 / Math.PI);
}
const angleDistance = (a, b) => Math.min(wrapHue(a - b), wrapHue(b - a));

// Scheme geometry is independent of the generator. Degrees are OKLCH, not RYB.
export function validateHarmony(harmony) {
  const fail = message => { throw new Error(`theme.json: harmony ${message}`); };
  if (!harmony || typeof harmony !== 'object' || Array.isArray(harmony)) fail('must be an object');
  if (typeof harmony.name !== 'string' || !harmony.name.trim()) fail('name must be nonempty');
  if (harmony.space !== 'oklch') fail('space must be oklch');
  if (!['accented-analogous', 'split-complementary', 'source-palette'].includes(harmony.scheme)) fail('scheme is unsupported');
  const validAngle = value => Number.isFinite(value) && value >= 0 && value < 360;
  if (!validAngle(harmony.keyHue) || !validAngle(harmony.neutralHue)) fail('keyHue and neutralHue must be angles in [0, 360)');
  if (typeof harmony.keyColour !== 'string' || !/^#[\da-f]{6}$/i.test(harmony.keyColour) || chroma(harmony.keyColour) < 0.018 || angleDistance(hueAngle(harmony.keyColour), harmony.keyHue) > 6) fail('keyColour must be a chromatic hex colour at keyHue');
  const offsets = harmony.offsets;
  if (!offsets || Object.keys(offsets).sort().join() !== 'blue,cyan,orange,violet' || Object.values(offsets).some(value => !Number.isFinite(value))) fail('offsets must define four finite hue slots');
  const within = (value, low, high) => value >= low && value <= high;
  if (offsets.blue !== 0) fail('blue must carry the key colour (offset 0)');
  if (harmony.scheme === 'accented-analogous') {
    if (!within(offsets.cyan, -35, -15) || !within(offsets.violet, 15, 35) || !within(offsets.orange, 170, 190)) fail('analogous angles require neighbours at -35..-15 / 15..35 and one complement at 170..190');
  } else if (harmony.scheme === 'split-complementary') {
    if (!within(offsets.violet, -15, 15) || !within(offsets.orange, 130, 160) || !within(offsets.cyan, 200, 230)) fail('split-complementary angles require key variant within 15 and arms at 130..160 / 200..230');
  } else {
    if (!Array.isArray(harmony.sourceColours) || harmony.sourceColours.length !== 4) fail('sourceColours must contain four anchors');
    for (const [index, slot] of ['blue','cyan','violet','orange'].entries()) {
      const value = harmony.sourceColours[index];
      if (chroma(value) < .018 || angleDistance(hueAngle(value), wrapHue(harmony.keyHue + offsets[slot])) > 6) fail(`sourceColours / ${slot} angle mismatch`);
    }
    if (harmony.keyColour !== harmony.sourceColours[0]) fail('keyColour must equal the first source anchor');
  }
  if (!harmony.stateHues || Object.keys(harmony.stateHues).sort().join() !== 'amber,green,red') fail('stateHues must define red, amber and green');
  for (const [family, low, high] of [['red', 10, 35], ['amber', harmony.typeAngles ? 50 : 75, 100], ['green', 125, 155]]) {
    if (!Number.isFinite(harmony.stateHues[family]) || !within(harmony.stateHues[family], low, high)) fail(`${family} must stay recognisable within ${low}..${high}`);
  }
  if (harmony.scheme === 'source-palette') {
    if (!validAngle(harmony.workingHue) || harmony.workingHue < 180 || harmony.workingHue > 260) fail('workingHue must be a blue/cyan angle in 180..260');
    if (!harmony.typeAngles || Object.keys(harmony.typeAngles).sort().join() !== Object.keys(typeHues).sort().join() || Object.values(harmony.typeAngles).some(value => !validAngle(value))) fail('typeAngles must define eight valid type hues');
    const angles = Object.values(harmony.typeAngles);
    for (let i=0; i<angles.length; i++) for (const other of angles.slice(i+1)) {
      if (angleDistance(angles[i],other) < typeHueAngleMinimum) fail('typeAngles must be at least 30 degrees apart');
    }
    if (angleDistance(harmony.typeAngles.ticket,harmony.keyHue) > 6) fail('typeAngles must extend the source key');
  }
  return harmony;
}

export function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// Packs are token data, not arbitrary stylesheets. Keep unvalidated cascade rules,
// imports and media-dependent colour overrides out of the checked contract.
const reducedMotion = `@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-feedback: 0ms;
    --motion-disclosure: 0ms;
    --motion-placement: 0ms;
    --motion-settle: 0ms;
    --motion-arrival-distance: 0px;
  }
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}`;
const compact = value => value.replace(/\s+/g, '');

export function saturation(hex) {
  luminance(hex); // Use the same opaque colour grammar as contrast.
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1)) * 100;
}

export function inspectTheme(name, css, mode, harmony = harmonyFor(name), presentation = presentationFor(name)) {
  validateHarmony(harmony);
  if (presentation && (!['solid-headers', 'soft-cards', 'tinted-headers'].includes(presentation.typeStyle) || presentation.layers !== 'stepped' || typeof presentation.darkChrome !== 'boolean' || !['navy','neutral'].includes(presentation.chromeTone) || ![4.5,7].includes(presentation.contrastTarget))) throw new Error(`${name}: invalid presentation`);
  const solidHeaders = presentation?.typeStyle === 'solid-headers';
  const required = presentation ? [...contract, ...componentContract] : contract;
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const typeImport = '@import url("../../typography/type.css");';
  const hasSharedType = stripped.startsWith(typeImport);
  const source = hasSharedType ? stripped.slice(typeImport.length).trim() : stripped;
  const match = source.match(/^:root\s*\{([^{}]+)\}/);
  if (!match) throw new Error(`${name}: expected one :root token block`);
  const remainder = source.slice(match[0].length).trim();
  if (remainder && compact(remainder) !== compact(reducedMotion)) {
    throw new Error(`${name}: only the documented reduced-motion block may follow :root; unchecked CSS rules refused`);
  }
  const declarations = [];
  let scheme;
  for (const declaration of match[1].split(';').map(value => value.trim()).filter(Boolean)) {
    const token = declaration.match(/^--([\w-]+)\s*:\s*(.+)$/);
    const colorScheme = declaration.match(/^color-scheme\s*:\s*(light|dark)$/);
    if (token && !token[2].includes('!')) declarations.push(token);
    else if (colorScheme && !scheme) scheme = colorScheme[1];
    else throw new Error(`${name}: invalid or unsupported declaration: ${declaration}`);
  }
  if (scheme !== mode) throw new Error(`${name}: color-scheme ${scheme ?? '(missing)'} must match manifest mode ${mode}`);
  const tokens = Object.fromEntries(declarations.map(([, key, value]) => [key, value.trim()]));
  const keys = Object.keys(tokens).sort();
  const errors = [];
  for (const key of required.filter(key => !keys.includes(key))) errors.push(`${name}: missing token --${key}`);
  for (const key of keys.filter(key => !required.includes(key))) errors.push(`${name}: unknown token --${key}`);
  for (const key of keys.filter(key => declarations.filter(([, token]) => token === key).length > 1)) errors.push(`${name}: duplicate token --${key}`);
  if (errors.length) throw new Error(errors.join('\n'));
  const resolve = (key, seen = new Set()) => {
    if (seen.has(key)) throw new Error(`${name}: cyclic token ${key}`);
    seen.add(key);
    const value = tokens[key] ?? (hasSharedType ? sharedType[key] : undefined);
    if (!value) throw new Error(`${name}: unknown token ${key}`);
    const alias = value.match(/^var\(--([\w-]+)\)$/);
    return alias ? resolve(alias[1], seen) : value;
  };
  // Check references in every role, including geometry and typography, rather
  // than allowing a present-but-unresolvable token to satisfy the contract.
  const visit = (key, seen = new Set()) => {
    if (seen.has(key)) throw new Error(`${name}: cyclic token ${key}`);
    const value = tokens[key] ?? (hasSharedType ? sharedType[key] : undefined);
    if (value === undefined) throw new Error(`${name}: unknown token ${key}`);
    for (const [, reference] of value.matchAll(/var\(\s*--([\w-]+)/g)) {
      visit(reference, new Set([...seen, key]));
    }
  };
  for (const key of keys) visit(key);
  // Validate both stored appearances, and active aliases. A malformed unused
  // colour must not survive until somebody switches modes.
  for (const key of keys.filter(key => key.startsWith('scale-'))) luminance(resolve(key));
  // Quantised low-chroma colours have unstable hue; judge only C >= .018.
  // Six degrees allows 8-bit rounding, not an extra harmony arm.
  for (const appearance of ['light', 'dark']) {
    for (const [family, expected] of Object.entries(familyHues(harmony))) {
      for (let step = 1; step <= 12; step++) {
        const key = `scale-${appearance}-${family}-${step}`;
        const value = resolve(key);
        if (chroma(value) >= 0.018 && angleDistance(hueAngle(value), expected) > 6) errors.push(`${name}: harmony hue: ${key} outside its declared angle range`);
      }
    }
  }
  for (const hue of Object.keys(hues)) {
    for (let step = 1; step <= 12; step++) {
      const key = `scale-${hue}-${step}`;
      if (tokens[key] !== `var(--scale-${mode}-${hue}-${step})`) errors.push(`${name}: ${key} must select manifest mode ${mode}`);
    }
  }
  const measuredSurfacePairs = presentation ? [['canvas','frame-body'],['frame-body','node-body'],['node-body','node-header'],['node-header','panel'],['panel','chrome'],['frame-body','frame-header'],['frame-header','node-body']] : surfacePairs;
  const surfaceDistances = measuredSurfacePairs.map(([first, second]) => {
    const distance = perceptualDistance(resolve(`surface-${first}`), resolve(`surface-${second}`));
    if (distance < surfaceDistanceMinimum) errors.push(`${name}: surface step: ${first} / ${second}: ${distance.toFixed(6)} < ${surfaceDistanceMinimum}`);
    return { first, second, distance };
  });
  if (presentation) for (const appearance of ['light']) {
    for (let step=1; step<6; step++) {
      if (oklab(resolve(`scale-${appearance}-neutral-${step}`))[0] <= oklab(resolve(`scale-${appearance}-neutral-${step+1}`))[0]) errors.push(`${name}: light neutral grounds must decrease monotonically: ${step} / ${step+1}`);
    }
  }
  for (const role of ['canvas', 'frame-body', 'frame-header', 'node-body', 'node-header', 'panel']) {
    if (!/^var\(--scale-neutral-[1-6]\)$/.test(tokens[`surface-${role}`])) errors.push(`${name}: surface-${role} must alias neutral step 1–6`);
  }
  const tintDistances = [];
  const tintRoles = Object.keys(typeHues).flatMap(type => [`type-${type}-surface`, `type-${type}-header`]);
  const usedTypeHues = new Set();
  for (const type of Object.keys(typeHues)) {
    if (presentation) {
      for (const part of ['surface','header','edge']) {
        if (angleDistance(hueAngle(resolve(`type-${type}-${part}`)),harmony.typeAngles[type]) > 6) errors.push(`${name}: type ${part} must use its type harmony hue: ${type}`);
      }
      continue;
    }
    const surfaceHue = tokens[`type-${type}-surface`].match(/^var\(--scale-([a-z]+)-[234]\)$/)?.[1];
    const headerHue = tokens[`type-${type}-header`].match(solidHeaders ? /^var\(--scale-([a-z]+)-(9|10)\)$/ : /^var\(--scale-([a-z]+)-[234]\)$/)?.[1];
    if (!surfaceHue || surfaceHue !== headerHue || !Object.hasOwn(harmony.offsets, surfaceHue)) errors.push(`${name}: type tint must use one harmony hue for surface/header: ${type}`);
    usedTypeHues.add(surfaceHue);
  }
  if (usedTypeHues.size > 4) errors.push(`${name}: type tints must use at most four harmony hues`);
  const quietRoles = presentation || solidHeaders ? tintRoles.filter(key => key.endsWith('-surface')) : tintRoles;
  const maxTintChroma = Math.max(...quietRoles.map(key => chroma(resolve(key))));
  for (const key of tintRoles) {
    if (presentation && key.endsWith('-header')) continue;
    if (solidHeaders && key.endsWith('-header')) continue;
    if (!presentation && !/^var\(--scale-(?!neutral-)[a-z]+-[234]\)$/.test(tokens[key])) errors.push(`${name}: type tint ${key} must alias hue step 2–4`);
    if (chroma(resolve(key)) > tintChromaMaximum) errors.push(`${name}: type tint chroma: ${key} exceeds ${tintChromaMaximum}`);
    const scale = tokens[key].match(/^var\(--scale-([a-z]+-[234])\)$/)?.[1];
    if (scale) for (const appearance of ['light', 'dark']) {
      if (chroma(resolve(`scale-${appearance}-${scale}`)) > tintChromaMaximum) errors.push(`${name}: type tint chroma: scale-${appearance}-${scale} exceeds ${tintChromaMaximum}`);
    }
    const distance = perceptualDistance(resolve(key), resolve('surface-canvas'));
    if (distance < surfaceDistanceMinimum) errors.push(`${name}: type tint / canvas distance: ${key} < ${surfaceDistanceMinimum}`);
  }
  for (let i = 0; i < tintRoles.length; i++) {
    for (let j = i + 1; j < tintRoles.length; j++) {
      const first = tintRoles[i];
      const second = tintRoles[j];
      const distance = perceptualDistance(resolve(first), resolve(second));
      tintDistances.push({ first, second, distance });
      // Surface/header tokens may be reused. Only the eight visible header
      // marks need distinct hue + lightness combinations; shape carries type.
      if (first.endsWith('-header') && second.endsWith('-header')) {
        if (distance < (presentation ? typeHeaderDistanceMinimum : Number.EPSILON)) errors.push(`${name}: type header combinations must differ: ${first} / ${second}: ${distance.toFixed(6)}`);
        if (presentation && angleDistance(hueAngle(resolve(first)),hueAngle(resolve(second))) < typeHueAngleMinimum) errors.push(`${name}: type header hue angle: ${first} / ${second} < ${typeHueAngleMinimum}`);
      }
    }
  }
  for (const type of Object.keys(typeHues)) {
    if (perceptualDistance(resolve(`type-${type}-surface`), resolve(`type-${type}-header`)) < surfaceDistanceMinimum) errors.push(`${name}: type tint header step: ${type}`);
    if (presentation) {
      const body = presentation.typeStyle === 'soft-cards' ? `type-${type}-surface` : 'surface-node-body';
      if (perceptualDistance(resolve(body),resolve('surface-frame-body')) < surfaceDistanceMinimum) errors.push(`${name}: visible card/frame step: ${type}`);
      if (perceptualDistance(resolve(body),resolve(`type-${type}-header`)) < surfaceDistanceMinimum) errors.push(`${name}: visible header/body step: ${type}`);
    }
    if (presentation && mode === 'dark' && perceptualDistance(resolve(`type-${type}-header`),resolve('surface-node-body')) < darkHeaderBodyDistanceMinimum) errors.push(`${name}: dark header/body step: ${type} < ${darkHeaderBodyDistanceMinimum}`);
  }
  for (const state of ['working', 'success', 'attention', 'error']) {
    const key = `state-${state}`;
    if (!/^var\(--scale-[a-z]+-(9|10|11)\)$/.test(tokens[key])) errors.push(`${name}: saturated state ${key} must alias step 9–11`);
    if (chroma(resolve(key)) < maxTintChroma + stateChromaMargin) errors.push(`${name}: state chroma: ${key} must exceed all type tints by ${stateChromaMargin}`);
  }
  for (const [state, low, high] of [['error', 10, 35], ['attention', presentation ? 50 : 75, 100], ['success', 125, 155]]) {
    const angle = hueAngle(resolve(`state-${state}`));
    if (angle < low - 2 || angle > high + 2) errors.push(`${name}: recognisable state hue: ${state} outside ${low}..${high}`);
  }
  const schemeAngles = Object.values(harmony.offsets).map(offset => wrapHue(harmony.keyHue + offset));
  for (const key of ['action-primary', 'accent-1', 'accent-2', 'accent-3', 'focus-ring', 'border-selected', 'connector-selected', ...(presentation ? [] : ['state-working'])]) {
    if (!schemeAngles.some(angle => angleDistance(hueAngle(resolve(key)), angle) <= 6)) errors.push(`${name}: harmony role hue: ${key} outside its scheme`);
  }
  const neutral = ['canvas', 'panel', 'navigation', 'selected', 'hover', 'disabled', 'frame-body', 'frame-header', 'node-body', 'node-header'].map(role => `surface-${role}`);
  const states = ['attention', 'working', 'success', 'error', 'unknown'];
  for (const key of ['accent-1', 'accent-2', 'accent-3']) luminance(resolve(key));
  if (!/^[1-6]px$/.test(resolve('stroke-accent'))) errors.push(`${name}: --stroke-accent must be 1px through 6px`);
  const selectionDistances = [];
  for (const selection of ['border-selected', 'connector-selected']) {
    for (const state of states) {
      const distance = perceptualDistance(resolve(selection), resolve(`state-${state}`));
      selectionDistances.push({ selection, state, distance });
      if (distance < selectionDistanceMinimum) errors.push(`${name}: selection distance: --${selection} / --state-${state}: ${distance.toFixed(6)} < ${selectionDistanceMinimum} ΔEOK`);
    }
  }
  const surfaces = [...neutral, ...states.map(state => `state-${state}-surface`), ...quietRoles];
  const rows = [];
  const add = (group, foreground, backgrounds, threshold) => {
    for (const background of backgrounds) {
      rows.push({ theme: name, group, foreground, background, foregroundHex: resolve(foreground), backgroundHex: resolve(background), ratio: contrast(resolve(foreground), resolve(background)), threshold });
    }
  };
  const textTarget = presentation?.contrastTarget ?? 4.5;
  add('Primary text / all surfaces', 'text-primary', surfaces, textTarget);
  add('Secondary text / all surfaces', 'text-secondary', surfaces, textTarget);
  add('Link text / all surfaces', 'text-link', surfaces, textTarget);
  add('Disabled text / disabled', 'text-disabled', ['surface-disabled'], textTarget);
  add('Action text / action', 'text-on-action', ['action-primary'], textTarget);
  for (const state of states.filter(state => state !== 'unknown')) {
    add('Chip text / saturated states', 'text-on-state', [`state-${state}`], textTarget);
    add(`${state} chip / all surfaces`, `state-${state}`, surfaces, 3);
  }
  for (const state of states) add(`${state} text / matching fill + panel`, `state-${state}`, [`state-${state}-surface`, 'surface-panel'], textTarget);
  add('Control boundary / all surfaces', 'border-control', surfaces, 3);
  add('Selected boundary / all surfaces', 'border-selected', surfaces, 3);
  add('Action fill / all surfaces', 'action-primary', surfaces, 3);
  add('Focus ring / all surfaces', 'focus-ring', surfaces, 3);
  add('Relation line / canvas', 'connector-relation', ['surface-canvas'], 3);
  add('Selected line / canvas', 'connector-selected', ['surface-canvas'], 3);
  for (const state of states) add(`${state} marker / matching fill + panel`, `state-${state}`, [`state-${state}-surface`, 'surface-panel'], 3);
  if (presentation) {
    if (mode === 'light' && (chroma(resolve('state-attention-surface')) < .10 || angleDistance(hueAngle(resolve('state-attention-surface')),harmony.stateHues.amber) > 6)) errors.push(`${name}: attention chip fill must be chromatic amber/orange`);
    if (presentation.chromeTone === 'navy' && mode === 'dark' && (chroma(resolve('surface-chrome')) < .025 || angleDistance(hueAngle(resolve('surface-chrome')),harmony.neutralHue) > 6)) errors.push(`${name}: navy chrome must retain its declared hue and chroma`);
    if (tokens['type-body-mix'] !== (presentation.typeStyle === 'soft-cards' ? '100%' : '0%')) errors.push(`${name}: type-body-mix must match typeStyle`);
    for (const type of Object.keys(typeHues)) {
      add('Type header text / header', `type-${type}-text`, [`type-${type}-header`], textTarget);
      add('Type edge / body', `type-${type}-edge`, [presentation.typeStyle === 'soft-cards' ? `type-${type}-surface` : 'surface-node-body'], 3);
      for (const state of states.filter(state => state !== 'unknown')) {
        for (const part of ['edge','header']) if (perceptualDistance(resolve(`type-${type}-${part}`), resolve(`state-${state}`)) < .08) errors.push(`${name}: type/state distance: ${type} ${part} / ${state} < 0.08`);
        if (angleDistance(hueAngle(resolve(`type-${type}-header`)),hueAngle(resolve(`state-${state}`))) < 12) errors.push(`${name}: type/state hue angle: ${type} / ${state} < 12`);
      }
    }
    add('Chrome text / chrome', 'text-chrome', ['surface-chrome'], textTarget);
    add('Chrome secondary / chrome', 'text-chrome-secondary', ['surface-chrome'], textTarget);
    add('Chrome boundary / chrome', 'border-chrome', ['surface-chrome'], 3);
  }
  const failures = rows.filter(row => row.ratio < row.threshold);
  errors.push(...failures.map(row => `${name}: ${row.foreground} / ${row.background}: ${row.ratio.toFixed(4)} < ${row.threshold}`));
  if (mode === 'dark') {
    for (const key of ['text-primary', 'text-secondary', 'text-disabled', 'text-on-action', 'text-on-state']) {
      const value = saturation(resolve(key));
      if (value >= 20 - 1e-9) errors.push(`${name}: felt contrast: --${key} HSL saturation ${value.toFixed(2)}% must be below 20% in dark themes`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { tokens, values: Object.fromEntries(keys.map(key => [key, resolve(key)])), rows, selectionDistances, surfaceDistances, tintDistances, maxTintChroma };
}

export async function inspectPack(folder) {
  const name = path.basename(path.resolve(folder));
  const manifest = JSON.parse(await readFile(path.join(folder, 'theme.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('theme.json must be an object');
  const errors = [];
  for (const field of ['name', 'mode', 'author', 'licence', 'version', 'description']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) errors.push(`theme.json: ${field} must be a nonempty string`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name) || manifest.name !== name) errors.push('theme.json: name must match the lowercase kebab-case folder name');
  if (!['light', 'dark'].includes(manifest.mode)) errors.push('theme.json: mode must be light or dark');
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(manifest.version)) errors.push('theme.json: version must have major.minor.patch form');
  if (errors.length) throw new Error(errors.join('\n'));
  validateHarmony(manifest.harmony);
  if (manifest.harmony.scheme === 'source-palette') {
    if (!manifest.presentation || !manifest.source || typeof manifest.source.group !== 'string' || !manifest.source.group.trim() || typeof manifest.source.id !== 'string' || !manifest.source.id.trim()) throw new Error('theme.json: source-palette requires source group/id and presentation');
  }
  return { name, manifest, ...inspectTheme(name, await readFile(path.join(folder, 'theme.css'), 'utf8'), manifest.mode, manifest.harmony, manifest.presentation) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg.startsWith('-') && arg !== '--write')) throw new Error('Usage: node check-themes.mjs [--write | <pack-folder> ...]');
  const folders = args.filter(arg => arg !== '--write');
  if (folders.length && args.includes('--write')) throw new Error('--write updates bundled reports only; omit pack paths');
  const bundled = folders.length === 0;
  if (bundled) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        const contents = await readdir(path.join(directory, entry.name));
        if (contents.includes('theme.json') || contents.includes('theme.css')) folders.push(path.join(directory, entry.name));
      }
    }
  }
  if (!folders.length) throw new Error('No theme packs found');
  const results = [];
  let failed = false;
  const display = ratio => (Math.floor(ratio * 100) / 100).toFixed(2);
  const displayDistance = distance => (Math.floor(distance * 10000) / 10000).toFixed(4);
  for (const folder of folders) {
    try {
      const result = await inspectPack(folder);
      results.push(result);
      const minimum = threshold => display(Math.min(...result.rows.filter(row => threshold === 3 ? row.threshold === 3 : row.threshold >= 4.5).map(row => row.ratio)));
      const distance = Math.min(...result.selectionDistances.map(pair => pair.distance));
      console.log(`PASS ${result.name}: ${Object.keys(result.tokens).length} tokens; ${result.rows.length} pairs; text >= ${minimum(4.5)}:1; controls/focus >= ${minimum(3)}:1; selection ΔEOK >= ${displayDistance(distance)}; surface ΔEOK >= ${displayDistance(Math.min(...result.surfaceDistances.map(pair => pair.distance)))}; harmony ${result.manifest.harmony.name}; tint chroma <= ${(Math.ceil(result.maxTintChroma * 10000) / 10000).toFixed(4)}; felt contrast ${result.manifest.mode === 'dark' ? 'passes' : 'not applicable (light)'}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${path.basename(path.resolve(folder))}:\n${error.message}`);
    }
  }
  if (failed) { process.exitCode = 1; return; }
  if (!bundled) return;
  const themes = results.map(result => result.name);
  const rows = results.flatMap(result => result.rows);
  const csv = 'theme,group,foreground,background,foreground_hex,background_hex,ratio,minimum\n' + rows.map(row => [row.theme, row.group, row.foreground, row.background, row.foregroundHex, row.backgroundHex, row.ratio.toFixed(6), row.threshold].join(',')).join('\n') + '\n';
  // Marker pairs have the same ratios as their state text; retain them in the CSV.
  const groups = [...new Set(rows.map(row => row.group))].filter(group => !group.includes(' marker /'));
  // Floor for display: never round a near miss into a pass. Decisions use full precision.
  const table = `| Minimum ratio in group | ${themes.join(' | ')} |\n|---|${themes.map(() => '---:|').join('')}\n` + groups.map(group => `| ${group} | ${themes.map(theme => display(Math.min(...rows.filter(row => row.group === group && row.theme === theme).map(row => row.ratio)))).join(' | ')} |`).join('\n');
  const readmePath = path.join(directory, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  const readingTable = '| Pack | Primary / canvas | Secondary / canvas | Minimum selection ΔEOK |\n|---|---:|---:|---:|\n' + results.map(result => {
    const canvasRatio = foreground => display(result.rows.find(row => row.foreground === foreground && row.background === 'surface-canvas').ratio);
    const distance = displayDistance(Math.min(...result.selectionDistances.map(pair => pair.distance)));
    return `| ${result.name} | ${canvasRatio('text-primary')} | ${canvasRatio('text-secondary')} | ${distance} |`;
  }).join('\n');
  const paletteTable = '| Pack | Minimum adjacent surface ΔEOK | Minimum header ΔEOK | Minimum header hue gap | Maximum body tint chroma | Minimum state chroma |\n|---|---:|---:|---:|---:|---:|\n' + results.map(result => {
    const minSurface = Math.min(...result.surfaceDistances.map(pair => pair.distance));
    const minTint = Math.min(...result.tintDistances.filter(pair => pair.first.endsWith('-header') && pair.second.endsWith('-header')).map(pair => pair.distance));
    const minState = Math.min(...['working', 'success', 'attention', 'error'].map(state => chroma(result.values[`state-${state}`])));
    // Round maxima up so the table never understates the tint chroma.
    const maximum = (Math.ceil(result.maxTintChroma * 10000) / 10000).toFixed(4);
    const headers = Object.keys(typeHues).map(type => hueAngle(result.values[`type-${type}-header`]));
    const hueGap = Math.min(...headers.flatMap((first,i) => headers.slice(i+1).map(second => angleDistance(first,second))));
    return `| ${result.name} | ${displayDistance(minSurface)} | ${displayDistance(minTint)} | ${display(hueGap)}° | ${maximum} | ${displayDistance(minState)} |`;
  }).join('\n');
  const updatedReadme = readme
    .replace(/<!-- contrast:start -->[\s\S]*?<!-- contrast:end -->/, `<!-- contrast:start -->\n${table}\n<!-- contrast:end -->`)
    .replace(/<!-- reading:start -->[\s\S]*?<!-- reading:end -->/, `<!-- reading:start -->\n${readingTable}\n<!-- reading:end -->`)
    .replace(/<!-- palette:start -->[\s\S]*?<!-- palette:end -->/, `<!-- palette:start -->\n${paletteTable}\n<!-- palette:end -->`);
  if (process.argv.includes('--write')) {
    await writeFile(path.join(directory, 'contrast.csv'), csv);
    await writeFile(readmePath, updatedReadme);
  } else {
    if (await readFile(path.join(directory, 'contrast.csv'), 'utf8') !== csv || updatedReadme !== readme) throw new Error('Contrast report drift; run with --write');
  }
  console.log(`${themes.length} themes; ${Object.keys(results[0].tokens).length} exact token roles each; ${rows.length} pairs pass. Reports ${process.argv.includes('--write') ? 'written' : 'match'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
