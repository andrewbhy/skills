import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Original scale construction and licensed gallery palette adaptations, 2026-11-07.
// Oklab inverse: https://bottosson.github.io/posts/oklab/
// Family names are stable token slots, not fixed positions on a colour wheel.
export const hues = Object.fromEntries('neutral blue cyan teal green lime amber orange red rose violet'.split(' ').map(name => [name, true]));
// Legacy family mappings for archived recipes. Active packs use harmony.typeAngles.
export const typeHues = { ticket: 'blue', task: 'cyan', session: 'violet', artifact: 'orange',
  check: 'blue', question: 'cyan', decision: 'violet', note: 'orange' };
export const typeSteps = { ticket: [2, 3], task: [2, 3], session: [2, 3], artifact: [2, 3],
  check: [3, 4], question: [3, 4], decision: [3, 4], note: [3, 4] };
export const retiredNames = ['calm-workbench', 'warm-studio', 'night', 'night-dim', 'night-warm', 'neon-synth', 'neon-synth-vivid'];
export const packNames = ['white-board', 'white-board-soft', 'paper', 'studio', 'clarity', 'dracula', 'electric'];

// Gallery is read-only source data. Packs ship complete CSS and need no imports.
import { mixedPalettes, neonPalettes } from './gallery/contrast-palettes.mjs';
import { editorPalettes } from './gallery/palettes.mjs';
const gallerySources = [...mixedPalettes, ...neonPalettes, ...editorPalettes];
export const sourceIds = { 'white-board': 'mixed-solid-headers', 'white-board-soft': 'mixed-solid-headers',
  paper: 'mixed-solid-headers', studio: 'mixed-desktop-chrome', clarity: 'mixed-enhanced-light',
  dracula: 'dracula-dark', electric: 'neon-navy' };
export const sourceFor = name => gallerySources.find(source => source.id === sourceIds[name]);
export function presentationFor(name) {
  if (!sourceIds[name]) return undefined;
  return { typeStyle: ['white-board', 'paper', 'clarity'].includes(name) ? 'solid-headers' : name === 'white-board-soft' ? 'soft-cards' : 'tinted-headers',
    layers: 'stepped', darkChrome: ['studio', 'clarity'].includes(name), chromeTone: name === 'electric' ? 'navy' : 'neutral', contrastTarget: name === 'clarity' ? 7 : 4.5 };
}
export function colourParts(value) {
  const [r, g, b] = value.slice(1).match(/../g).map(v => {
    const c = parseInt(v, 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
  const b2 = .0259040371*l + .7827717662*m - .808675766*s;
  return { l: .2104542553*l + .793617785*m - .0040720468*s, c: Math.hypot(a,b2), h: wrapHue(Math.atan2(b2,a)*180/Math.PI) };
}

export const wrapHue = hue => (hue % 360 + 360) % 360;
export function harmonyFor(name) {
  const source = sourceFor(name);
  if (source) {
    const [blue, cyan, violet, orange] = source.accents.map(colour => colourParts(colour).h);
    const typeAngles = Object.fromEntries(Object.keys(typeHues).map((type, i) => [type, wrapHue(blue + [0,-45,45,90,135,180,225,270][i])]));
    // Put Working between type hues, choosing the blue midpoint nearest 235°.
    const workingHue = Object.values(typeAngles).map(angle => wrapHue(angle+22.5)).sort((a,b) => Math.abs(a-235)-Math.abs(b-235))[0];
    return { name: source.name, scheme: 'source-palette', space: 'oklch', keyHue: blue,
      keyColour: source.accents[0], offsets: { blue: 0, cyan: wrapHue(cyan-blue), violet: wrapHue(violet-blue), orange: wrapHue(orange-blue) },
      neutralHue: name === 'dracula' ? colourParts(source.bg[0]).h : name === 'electric' ? 265 : name === 'paper' ? 85 : 255,
      stateHues: { green: 145, amber: 55, red: 15 }, workingHue, sourceColours: source.accents,
      // An eight-part extension of the source key; anchors remain in the scales.
      typeAngles };
  }
  const neon = name.startsWith('neon-synth');
  const warm = name === 'warm-studio';
  const keyHue = neon ? 340 : warm ? 55 : name === 'calm-workbench' ? 235 : 260;
  return {
    name: neon ? 'Magenta split complements' : warm ? 'Earth and slate' : name === 'calm-workbench' ? 'Lagoon and sand' : 'Dusk and brass',
    scheme: neon ? 'split-complementary' : 'accented-analogous',
    space: 'oklch', keyHue,
    keyColour: hex(neon || name.startsWith('night') ? 0.84 : 0.43, name.startsWith('night') ? 0.105 : neon ? 0.17 : 0.13, keyHue),
    // Neon: magenta key, cyan/lime split arms; navy is the neutral base.
    offsets: neon ? { blue: 0, cyan: 220, violet: 15, orange: 140 } : { blue: 0, cyan: -30, violet: 30, orange: 180 },
    neutralHue: neon ? 265 : warm ? 70 : name === 'night-warm' ? 70 : keyHue,
    stateHues: { green: neon ? 145 : 140, amber: neon ? 95 : 85, red: neon ? 15 : 25 },
  };
}

export function familyHues(harmony) {
  const member = slot => wrapHue(harmony.keyHue + harmony.offsets[slot]);
  return { neutral: harmony.neutralHue, blue: member('blue'), cyan: member('cyan'),
    violet: member('violet'), orange: member('orange'), teal: harmony.workingHue ?? member('cyan'),
    lime: member('orange'), rose: member('blue'), ...harmony.stateHues };
}

function rgb(lightness, chroma, hue) {
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}

// Reduce chroma at fixed lightness/hue until in sRGB; never clip channels.
function hex(lightness, chroma, hue) {
  let channels = rgb(lightness, chroma, hue);
  while (channels.some(value => value < -1e-7 || value > 1 + 1e-7)) {
    chroma *= 0.98;
    channels = rgb(lightness, chroma, hue);
  }
  return '#' + channels.map(value => {
    const channel = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

export function paletteTokens(name, mode) {
  if (sourceFor(name)) return chosenTokens(name, mode);
  const neon = name.startsWith('neon-synth');
  const warm = name === 'warm-studio' || name === 'night-warm';
  const dim = name === 'night-dim';
  const tokens = {};
  const harmony = harmonyFor(name);
  for (const appearance of ['light', 'dark']) {
    const dark = appearance === 'dark';
    for (const [hueName, angle] of Object.entries(familyHues(harmony))) {
      const neutral = hueName === 'neutral';
      const levels = neutral
        ? (dark ? (neon ? [0.15, 0.19, 0.23, 0.27, 0.31, 0.35, 0.49, 0.72, 0.75, 0.77, 0.78, 0.88] : [0.20, 0.235, 0.27, 0.305, 0.34, 0.375, 0.49, 0.72, 0.75, 0.77, 0.78, 0.88])
          : [0.835, 0.867, 0.899, 0.931, 0.963, 0.995, 0.65, 0.48, 0.43, 0.40, 0.40, 0.22])
        : (dark ? [0.17, 0.27, 0.31, 0.35, 0.39, 0.43, 0.50, 0.62, 0.84, 0.80, 0.86, 0.93]
          : [0.98, 0.945, 0.905, 0.855, 0.81, 0.75, 0.65, 0.55, 0.43, 0.39, 0.40, 0.25]);
      const muted = name.startsWith('night') && !['green', 'amber', 'red', 'teal'].includes(hueName);
      const chromas = dark ? [0.008, 0.012, 0.020, 0.024, 0.04, 0.06, 0.08, 0.10, muted ? 0.105 : 0.17, muted ? 0.105 : 0.17, 0.12, 0.05]
        : [0.008, 0.012, 0.020, 0.024, 0.04, 0.06, 0.08, 0.10, 0.13, 0.13, 0.12, 0.05];
      levels.forEach((level, index) => {
        const step = index + 1;
        // Cyan needs a lighter solid to retain enough chroma inside sRGB.
        const lightness = !dark && hueName === 'cyan' && step === 9 ? 0.50
          : level + (neutral && dark && dim && step <= 6 ? 0.035 - index * 0.002 : 0);
        // Navy is a low-chroma neutral axis, separate from coloured type tints.
        const chroma = neutral ? (step <= 8 ? (neon ? 0.035 : warm || name === 'calm-workbench' ? 0.008 : 0) : warm ? 0.006 : 0) : chromas[index];
        const hue = angle;
        tokens[`scale-${appearance}-${hueName}-${step}`] = hex(lightness, chroma, hue);
      });
    }
  }
  for (const hue of Object.keys(hues)) {
    for (let step = 1; step <= 12; step++) tokens[`scale-${hue}-${step}`] = `var(--scale-${mode}-${hue}-${step})`;
  }
  const alias = (role, hue, step) => { tokens[role] = `var(--scale-${hue}-${step})`; };
  for (const [role, step] of Object.entries({ canvas: 1, 'frame-body': 2, 'node-body': 3,
    'frame-header': 4, 'node-header': 5, panel: 6, navigation: 2, selected: 4, hover: 3, disabled: 2 })) alias(`surface-${role}`, 'neutral', step);
  for (const [role, step] of Object.entries({ 'text-primary': 12, 'text-secondary': 11,
    'text-disabled': 11, 'border-divider': 7, 'border-control': 8, 'connector-relation': 8,
    'state-unknown': 11, 'state-unknown-surface': 3 })) alias(role, 'neutral', step);
  tokens['text-on-action'] = `var(--scale-${mode === 'dark' ? 'light' : 'dark'}-neutral-12)`;
  tokens['text-on-state'] = mode === 'dark' ? tokens['text-on-action'] : 'var(--scale-light-neutral-6)';
  const action = neon ? 'lime' : 'blue';
  alias('action-primary', action, 9);
  alias('text-link', mode === 'dark' ? 'neutral' : action, mode === 'dark' ? 12 : 11);
  const selection = neon ? 'blue' : name === 'warm-studio' ? 'orange' : 'violet';
  for (const role of ['border-selected', 'connector-selected']) alias(role, selection, mode === 'dark' || neon ? 10 : 9);
  alias('focus-ring', selection, 9);
  alias('accent-1', 'cyan', 9);
  alias('accent-2', 'violet', 9);
  alias('accent-3', 'orange', 9);
  for (const [state, hue] of Object.entries({ working: neon ? 'cyan' : name === 'warm-studio' ? 'blue' : 'teal', success: 'green', attention: 'amber', error: 'red' })) {
    alias(`state-${state}`, hue, 9);
    alias(`state-${state}-surface`, hue, 2);
  }
  for (const [type, hue] of Object.entries(typeHues)) {
    alias(`type-${type}-surface`, hue, typeSteps[type][0]);
    alias(`type-${type}-header`, hue, typeSteps[type][1]);
  }
  return tokens;
}

function chosenTokens(name, mode) {
  const source = sourceFor(name);
  const presentation = presentationFor(name);
  const harmony = harmonyFor(name);
  const tokens = {};
  const anchorSlots = ['blue', 'cyan', 'violet', 'orange'];
  for (const appearance of ['light', 'dark']) {
    const dark = appearance === 'dark';
    for (const [family, angle] of Object.entries(familyHues(harmony))) {
      const neutral = family === 'neutral';
      const levels = neutral ? (dark ? [.14,.22,.26,.30,.34,.38,.49,.70,.76,.80,.82,.94] : [1,.965,.93,.895,.86,.825,.65,.45,.40,.36,.34,.18])
        : (dark ? [.17,.20,.24,.34,.39,.43,.50,.62,.80,.74,.86,.93] : [.99,.95,.91,.86,.81,.75,.65,.55,name === 'clarity' ? .40 : .43,.38,.36,.25]);
      levels.forEach((level, index) => {
        const step = index + 1;
        const c = neutral ? (step >= 9 ? 0 : dark ? .015 : name === 'paper' ? .008 : 0) : [ .008,.012,.020,.024,.04,.06,.08,.10,dark ? .17 : .13,dark ? .17 : .13,.12,.05 ][index];
        if (!dark && name === 'studio' && !neutral && step >= 2 && step <= 4) level = [.92,.88,.84][step-2];
        if (dark && name === 'clarity' && neutral && step <= 6) level = [.14,.18,.22,.26,.30,.26][step-1];
        tokens[`scale-${appearance}-${family}-${step}`] = hex(level,c,angle);
      });
    }
    // Retain the picked source anchors and a darker companion for actions/accents.
    anchorSlots.forEach((slot,i) => {
      const original = source.accents[i];
      const parts = colourParts(original);
      const solid = dark === (source.mode === 'dark') ? original : hex(dark ? .80 : .43, parts.c, parts.h);
      tokens[`scale-${appearance}-${slot}-9`] = solid;
      tokens[`scale-${appearance}-${slot}-10`] = hex(colourParts(solid).l - .045, parts.c, parts.h);
    });
    // These slots repeat their declared harmony hue, not a fixed legacy hue.
    for (const [slot, original] of [['lime','orange'],['rose','blue']]) {
      for (const step of [9,10]) tokens[`scale-${appearance}-${slot}-${step}`] = tokens[`scale-${appearance}-${original}-${step}`];
    }
    if (dark && ['dracula','electric'].includes(name)) {
      const canvas = colourParts(source.bg[0]);
      // Preserve the source canvas, with distinct frame/card/header/panel grounds.
      const base = Math.max(.26, canvas.l);
      [canvas.l,base-.04,base+.04,base-.08,base+.08,base-.12].forEach((level,i) => {
        tokens[`scale-dark-neutral-${i+1}`] = i === 0 ? source.bg[0] : hex(level,name === 'electric' ? .035 : .015,harmony.neutralHue);
      });
    }
    if (!dark && name === 'paper') tokens['scale-light-neutral-1'] = source.bg[0];
    if (!dark && name === 'studio') tokens['scale-light-neutral-1'] = source.bg[0];
    if (!dark) {
      const canvas = colourParts(tokens['scale-light-neutral-1']);
      for (let step=2; step<=6; step++) tokens[`scale-light-neutral-${step}`] = hex(canvas.l-(step-1)*.035,name === 'paper' ? .008 : 0,harmony.neutralHue);
      for (const family of ['green','amber','red','teal']) {
        const angle = familyHues(harmony)[family];
        for (const step of [9,10,11]) tokens[`scale-light-${family}-${step}`] = hex(name === 'clarity' ? .32 : .36,.16,angle);
      }
      tokens['scale-light-amber-2'] = hex(.84,.16,harmony.stateHues.amber);
      if (name === 'clarity') tokens['scale-light-blue-11'] = hex(.33,.12,familyHues(harmony).blue);
    }
  }
  const alias = (role, family, step) => { tokens[role] = `var(--scale-${family}-${step})`; };
  for (const family of Object.keys(hues)) for (let step=1; step<=12; step++) alias(`scale-${family}-${step}`,mode+'-'+family,step);
  for (const [role,step] of Object.entries({canvas:1,'frame-body':2,'node-body':3,'frame-header':4,'node-header':5,panel:6,navigation:2,selected:4,hover:3,disabled:2})) alias('surface-'+role,'neutral',step);
  if (mode === 'light') alias('surface-panel','neutral',1);
  for (const [role,step] of Object.entries({'text-primary':12,'text-secondary':11,'text-disabled':11,'border-divider':7,'border-control':8,'connector-relation':8,'state-unknown':11,'state-unknown-surface':3})) alias(role,'neutral',step);
  tokens['text-on-action'] = mode === 'dark' ? 'var(--scale-light-neutral-12)' : '#ffffff';
  tokens['text-on-state'] = mode === 'dark' ? 'var(--scale-light-neutral-12)' : '#ffffff';
  alias('action-primary','blue',9);
  alias('text-link',mode === 'dark' ? 'neutral' : 'blue',mode === 'dark' ? 12 : 11);
  // Purple/pink selection stays distinct from conventional state colours.
  const selection = name === 'dracula' ? 'blue' : name === 'electric' ? 'cyan' : 'violet';
  for (const role of ['border-selected','connector-selected','focus-ring']) alias(role,selection,9);
  for (const [index,family] of ['cyan','violet','orange'].entries()) alias('accent-'+(index+1),family,9);
  for (const [state,family] of Object.entries({working:'teal',success:'green',attention:'amber',error:'red'})) {
    alias('state-'+state,family,state === 'working' ? 11 : 9);
    alias('state-'+state+'-surface',family,2);
  }
  for (const [type,angle] of Object.entries(harmony.typeAngles)) {
    tokens[`type-${type}-surface`] = hex(mode === 'dark' ? presentation.typeStyle === 'soft-cards' ? .28 : .24 : name === 'studio' ? .91 : .94,.020,angle);
    const solid = presentation.typeStyle === 'solid-headers';
    const headerLevel = mode === 'dark' ? solid ? name === 'clarity' ? .72 : .64 : .44 : solid ? name === 'clarity' ? .43 : .48 : .84;
    tokens[`type-${type}-header`] = hex(headerLevel,mode === 'dark' ? .12 : .14,angle);
    tokens[`type-${type}-edge`] = hex(mode === 'dark' ? .72 : .48,.14,angle);
    tokens[`type-${type}-text`] = presentation.typeStyle === 'solid-headers' ? tokens['text-on-action'] : 'var(--text-primary)';
  }
  const darkChrome = presentation.darkChrome || mode === 'dark';
  tokens['surface-chrome'] = darkChrome ? (name === 'clarity' ? '#101722' : name === 'studio' ? '#202532' : hex(.25,name === 'electric' ? .045 : .015,harmony.neutralHue)) : 'var(--scale-neutral-2)';
  tokens['text-chrome'] = darkChrome ? '#f5f5f5' : 'var(--text-primary)';
  tokens['text-chrome-secondary'] = darkChrome ? '#d0d0d0' : 'var(--text-secondary)';
  tokens['border-chrome'] = darkChrome ? '#959595' : 'var(--border-control)';
  tokens['type-body-mix'] = presentation.typeStyle === 'soft-cards' ? '100%' : '0%';
  return tokens;
}
