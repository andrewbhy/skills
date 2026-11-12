// Original role studies and licensed palette adaptations; see SOURCES.md.
const states = ['#21804b', '#9c6500', '#c52d4b', '#245cba'];
const mixed = (id, name, bg, accents, extra = {}) => ({
  id, name, bg, accents, states, mode: 'light', source: 'jig-harmonies',
  scheme: 'mixed-contrast', schemeName: 'Mixed contrast', adaptiveText: true,
  text: '#171923', muted: '#4a4f59',
  ...extra,
});
export const mixedPalettes = [
  mixed('mixed-dark-components', 'Porcelain / dark components',
    ['#f4f5f7', '#e5e8ee', '#242b3b'], ['#2870d5', '#137d83', '#9354c7', '#b14a75'], {
      surfaceOverrides: { chrome: '#171c28', sidebar: '#171c28', dock: '#171c28' },
      adaptation: 'Light canvas and frame; dark nodes, toolbar, sidebar and dock. Neutral text changes with each surface.',
    }),
  mixed('mixed-solid-headers', 'Paper / saturated headers',
    ['#faf8f3', '#eeeae2', '#ffffff'], ['#1958c2', '#00766e', '#7936ab', '#b22d68'], {
      solidHeaders: true,
      adaptation: 'Light canvas and node bodies with saturated, solid blue, teal and purple headers; light header text.',
    }),
  mixed('mixed-desktop-chrome', 'Studio / dark chrome',
    ['#f1f3f6', '#e3e7ee', '#ffffff'], ['#2865c2', '#247b70', '#864ca8', '#a6406b'], {
      surfaceOverrides: { chrome: '#202532', sidebar: '#202532', dock: '#202532' },
      adaptation: 'Desktop study: light working canvas and nodes, with a dark toolbar, sidebar and bottom dock.',
    }),
  mixed('mixed-enhanced-light', 'Clarity / enhanced light',
    ['#ffffff', '#f1f3f5', '#ffffff'], ['#003b80', '#005340', '#56247c', '#782044'], {
      contrastTarget: 7, solidHeaders: true,
      surfaceOverrides: { chrome: '#101722', sidebar: '#101722', dock: '#101722' },
      adaptation: 'WCAG 2.2 Contrast (Enhanced): target 7:1 for every measured normal-text pair, including secondary text and chrome. A text-pair study, not full AAA certification.',
    }),
];
const neon = (id, name, source, bg, accents, states) => ({
  id, name, source, bg, accents, states, mode: 'dark',
  scheme: 'neon-synthwave', schemeName: 'Neon and synthwave', adaptiveText: true,
  neon: true, text: '#f3f4f8', muted: '#b9becb',
  adaptation: `${source === 'jig-harmonies' ? 'Original neon study' : 'Licensed editor palette adaptation'}: neon accents, edges and chip; neutral body and secondary text. No glow on text.`,
});
export const neonPalettes = [
  neon('neon-navy', 'Electric / deep navy', 'jig-harmonies',
    ['#090f26', '#111a35', '#18233f'], ['#00e5ff', '#ff39c7', '#c3ff38', '#ae83ff'],
    ['#c3ff38', '#ffe25c', '#ff557f', '#00e5ff']),
  neon('neon-black', 'Laser / near black', 'jig-harmonies',
    ['#08090d', '#12151c', '#1b202a'], ['#22f5ed', '#ff42ce', '#c6ff00', '#b68aff'],
    ['#c6ff00', '#ffe467', '#ff547a', '#22f5ed']),
  neon('neon-purple-pink', 'Afterglow / purple pink', 'jig-harmonies',
    ['#170d29', '#251338', '#321c47'], ['#c18bff', '#ff58c8', '#5df6ed', '#ffb45e'],
    ['#a4f87d', '#ffe480', '#ff668d', '#5df6ed']),
  neon('synthwave-84-dark', "SynthWave ’84", 'synthwave-84',
    ['#262335', '#241b2f', '#2a2139'], ['#03edf9', '#ff7edb', '#72f1b8', '#fede5d'],
    ['#72f1b8', '#fede5d', '#fe4450', '#03edf9']),
  neon('shades-of-purple-dark', 'Shades of Purple', 'shades-of-purple',
    ['#2d2b55', '#1e1e3f', '#222244'], ['#b362ff', '#ff628c', '#3ad900', '#fad000'],
    ['#3ad900', '#fad000', '#ff628c', '#9effff']),
];
