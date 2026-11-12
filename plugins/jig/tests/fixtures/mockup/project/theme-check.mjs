import { readFileSync } from 'node:fs';

// Fixture-only pack contract; real projects use their configured pack checker.
const css = readFileSync(new URL('themes/studio/theme.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('themes/studio/theme.json', import.meta.url), 'utf8'));
const names = [...css.matchAll(/(--[\w-]+):/g)].map(m => m[1]).sort();
const expected = ['--boundary', '--focus', '--hover', '--surface', '--text'];
if (JSON.stringify(names) !== JSON.stringify(expected) || manifest.mode !== 'light' || !manifest.author || !manifest.licence || !manifest.version) throw new Error('Incomplete or unknown fixture pack tokens/manifest');
const values = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
const luminance = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
for (const [foreground, background, minimum] of [['--text', '--surface', 4.5], ['--text', '--hover', 4.5], ['--boundary', '--surface', 3], ['--focus', '--surface', 3]]) {
  const light = [luminance(values[foreground]), luminance(values[background])].sort((a, b) => b - a);
  if ((light[0] + 0.05) / (light[1] + 0.05) < minimum) throw new Error(`Low contrast: ${foreground}/${background}`);
}
console.log('Fixture pack contract passed');
