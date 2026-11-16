if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/themes/gallery/palettes.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Original gallery role mappings. Upstream colour attribution is in SOURCES.md.
import { wadaPalettes } from './wada.mjs';
import { mixedPalettes, neonPalettes } from './contrast-palettes.mjs';
export const schemes = {
  analogous: { name: 'Analogous', offsets: [0, -30, 30, 60] },
  complementary: { name: 'Complementary', offsets: [0, 180, 0, 180] },
  'split-complementary': { name: 'Split-complementary', offsets: [0, 150, 210, 0] },
  triadic: { name: 'Triadic', offsets: [0, 120, 240, 0] },
  'monochrome-accent': { name: 'Monochrome + accent', offsets: [0, 0, 0, 180] },
};

// OKLCH -> linear sRGB, then reduce chroma at fixed L/h until in gamut.
// Equations: https://www.w3.org/TR/css-color-4/#color-conversion-code
function linearRGB(l, c, h) {
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
  const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
  const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621*x-3.3077115913*y+.2309699292*z,
    -1.2684380046*x+2.6097574011*y-.3413193965*z,
    -.0041960863*x-.7034186147*y+1.707614701*z];
}
export function oklch(l, c, h) {
  let rgb = linearRGB(l, c, h);
  if (rgb.some(v => v < 0 || v > 1)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (linearRGB(l, mid, h).every(v => v >= 0 && v <= 1)) lo = mid;
      else hi = mid;
    }
    rgb = linearRGB(l, lo, h);
  }
  return '#' + rgb.map(v => Math.round(255 * Math.max(0, Math.min(1,
    v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055))).toString(16).padStart(2, '0')).join('');
}

const imported = (id, name, mode, source, bg, text, muted, accents, states) => ({
  id, name, mode, source, scheme: 'editor', schemeName: 'Editor / terminal',
  bg, text, muted, accents, states,
});
// bg = canvas / task frame / node. States = success / warning / error / info.
export const editorPalettes = [
  imported('nord-dark', 'Nord', 'dark', 'nord',
    ['#2e3440','#3b4252','#434c5e'], '#eceff4', '#d8dee9',
    ['#88c0d0','#81a1c1','#b48ead','#8fbcbb'], ['#a3be8c','#ebcb8b','#bf616a','#88c0d0']),
  imported('solarized-dark', 'Solarized dark', 'dark', 'solarized',
    ['#002b36','#073642','#073642'], '#839496', '#586e75',
    ['#268bd2','#2aa198','#6c71c4','#cb4b16'], ['#859900','#b58900','#dc322f','#268bd2']),
  imported('solarized-light', 'Solarized light', 'light', 'solarized',
    ['#fdf6e3','#eee8d5','#fdf6e3'], '#657b83', '#93a1a1',
    ['#268bd2','#2aa198','#6c71c4','#cb4b16'], ['#859900','#b58900','#dc322f','#268bd2']),
  imported('catppuccin-mocha', 'Catppuccin · Mocha', 'dark', 'catppuccin',
    ['#1e1e2e','#181825','#313244'], '#cdd6f4', '#a6adc8',
    ['#89b4fa','#94e2d5','#cba6f7','#fab387'], ['#a6e3a1','#f9e2af','#f38ba8','#89dceb']),
  imported('catppuccin-latte', 'Catppuccin · Latte', 'light', 'catppuccin',
    ['#eff1f5','#e6e9ef','#ccd0da'], '#4c4f69', '#6c6f85',
    ['#1e66f5','#179299','#8839ef','#fe640b'], ['#40a02b','#df8e1d','#d20f39','#04a5e5']),
  imported('dracula-dark', 'Dracula', 'dark', 'dracula',
    ['#282a36','#44475a','#282a36'], '#f8f8f2', '#6272a4',
    ['#bd93f9','#8be9fd','#ff79c6','#ffb86c'], ['#50fa7b','#f1fa8c','#ff5555','#8be9fd']),
  imported('tokyo-night-dark', 'Tokyo Night', 'dark', 'tokyo-night',
    ['#1a1b26','#16161e','#202330'], '#a9b1d6', '#545c7e',
    ['#7aa2f7','#7dcfff','#bb9af7','#ff9e64'], ['#9ece6a','#e0af68','#f7768e','#7dcfff']),
  imported('gruvbox-dark', 'Gruvbox dark', 'dark', 'gruvbox',
    ['#282828','#3c3836','#504945'], '#ebdbb2', '#a89984',
    ['#83a598','#8ec07c','#d3869b','#fe8019'], ['#b8bb26','#fabd2f','#fb4934','#83a598']),
  imported('gruvbox-light', 'Gruvbox light', 'light', 'gruvbox',
    ['#fbf1c7','#ebdbb2','#d5c4a1'], '#3c3836', '#7c6f64',
    ['#076678','#427b58','#8f3f71','#af3a03'], ['#79740e','#b57614','#9d0006','#076678']),
];
// Original inputs; the mode changes L/C, while the key hue stays fixed.
export const keys = [{ id: 'blue', name: 'Blue', h: 255 },
  { id: 'teal', name: 'Teal', h: 185 }, { id: 'orange', name: 'Warm orange', h: 55 }];
export const harmonyPalettes = keys.flatMap(key => Object.entries(schemes).flatMap(([scheme, spec]) =>
  ['dark', 'light'].map(mode => {
    const dark = mode === 'dark';
    const lightness = dark ? [.73,.79,.66,.83] : [.49,.55,.42,.61];
    return {
      id: `${key.id}-${scheme}-${mode}`, name: `${key.name} · ${spec.name}`,
      mode, source: 'jig-harmonies', scheme, schemeName: spec.name,
      recipe: { keyHue: key.h, offsets: spec.offsets, lightness, chroma: .13 },
      bg: (dark ? [.18,.23,.28] : [.97,.93,.99]).map(l => oklch(l,.012,key.h)),
      text: oklch(dark ? .94 : .25,.015,key.h),
      muted: oklch(dark ? .75 : .46,.02,key.h),
      accents: spec.offsets.map((offset,i) => oklch(lightness[i],.13,(key.h+offset+360)%360)),
      // Fixed semantic hues so scheme accents do not change the meaning of states.
      states: [145,85,25,245].map(h => oklch(dark ? .75 : .49,.14,h)),
    };
  })));
export const palettes = [...editorPalettes, ...harmonyPalettes, ...wadaPalettes, ...mixedPalettes, ...neonPalettes];
