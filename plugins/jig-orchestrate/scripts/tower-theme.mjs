if (process.argv[2] === '--help') { console.log('Usage: node scripts/tower-theme.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Toolbox files are immutable inputs. Tower roles and admission policy live here.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const themePacks = Object.freeze(['white-board', 'white-board-soft', 'paper', 'studio', 'clarity', 'dracula', 'electric']);
export const defaultThemePack = 'paper';
const darkPacks = new Set(['dracula', 'electric']);
export function pairedPack(pack, dark = false) {
  if (!themePacks.includes(pack)) throw new Error(`Unknown themePack: ${pack}`);
  return dark && !darkPacks.has(pack) ? 'dracula' : pack;
}
const toolbox = fileURLToPath(new URL('../docs/design-toolbox/', import.meta.url));
export function themeFile(pack) {
  if (!themePacks.includes(pack)) return null;
  const root = realpathSync(resolve(toolbox, 'themes'));
  const file = resolve(root, pack, 'theme.css');
  // Reject symlinks as well as traversal, even for an allowlisted pack name.
  if (realpathSync(file) !== file) throw new Error('Theme path escapes its allowlisted file');
  return readFileSync(file);
}
export function themeTypography() {
  const file = resolve(realpathSync(toolbox), 'typography', 'type.css');
  if (realpathSync(file) !== file) throw new Error('Typography path escapes its allowlisted file');
  return readFileSync(file);
}

export const towerTokenMap = Object.freeze({
  '--needs-page-bg': '--surface-canvas',
  '--text-primary': '--scale-neutral-12',
  '--text-secondary': '--scale-neutral-11',
  '--border-divider': '--scale-neutral-7',
  '--surface-frame-body': '--scale-neutral-2',
  '--surface-hover': '--scale-neutral-3',
  '--needs-scrollbar-track': '--surface-canvas',
  '--needs-focus-ring': '--focus-ring',
  '--topic-id-fg': '--scale-neutral-11',
  '--group-header-bg': '--scale-neutral-2',
  '--group-header-fg': '--scale-neutral-11',
  '--owner-chip-bg': '--scale-neutral-2',
  '--owner-chip-fg': '--scale-neutral-11',
  '--owner-chip-border': '--border-control',
  '--action-answer-bg': '--scale-light-blue-9',
  '--action-answer-fg': '--scale-light-neutral-1',
  '--action-answer-border': '--scale-light-blue-9',
  '--action-try-bg': '--scale-light-violet-9',
  '--action-try-fg': '--scale-light-neutral-1',
  '--action-try-border': '--scale-light-violet-9',
  '--action-approve-bg': '--scale-light-green-9',
  '--action-approve-fg': '--scale-light-neutral-1',
  '--action-approve-border': '--scale-light-green-9',
  '--action-read-bg': '--scale-light-amber-8',
  '--action-read-fg': '--scale-light-neutral-1',
  '--action-read-border': '--scale-light-amber-8',
  '--action-open-bg': '--scale-light-neutral-1',
  '--action-open-fg': '--scale-light-neutral-12',
  '--action-open-border': '--border-control',
  '--running-card-bg': '--scale-neutral-2',
  '--running-fg': '--scale-neutral-12',
  '--running-meta-fg': '--scale-neutral-11',
  '--running-divider': '--scale-neutral-7',
  '--running-working-bg': '--scale-light-blue-9',
  '--running-working-fg': '--scale-light-neutral-1',
  '--running-stalled-bg': '--scale-light-amber-8',
  '--running-stalled-fg': '--scale-light-neutral-1',
  '--running-resume-bg': '--scale-light-violet-9',
  '--running-resume-fg': '--scale-light-neutral-1',
  '--running-focus-ring': '--focus-ring',
  '--running-scrollbar-track': '--surface-canvas',
  '--gpu-busy-bg': '--scale-light-blue-9',
  '--gpu-busy-fg': '--scale-light-neutral-1',
  '--gpu-amber-bg': '--scale-light-amber-8',
  '--gpu-amber-fg': '--scale-light-neutral-1',
  '--gpu-panel-bg': '--scale-neutral-2',
  '--gpu-panel-fg': '--scale-neutral-12',
  '--gpu-panel-muted': '--scale-neutral-11',
  '--gpu-panel-border': '--scale-neutral-7',
  '--gpu-focus-ring': '--focus-ring',
  '--set-panel-bg': '--scale-neutral-2',
  '--set-panel-fg': '--scale-neutral-12',
  '--set-panel-muted': '--scale-neutral-11',
  '--set-panel-border': '--scale-neutral-7',
  '--set-field-bg': '--surface-canvas',
  '--set-field-border': '--border-control',
  '--set-error-fg': '--scale-red-11',
  '--set-focus-ring': '--focus-ring',
  '--work-meta-fg': '--scale-neutral-11',
  '--work-strong-fg': '--scale-neutral-12',
});
export const towerTokenCss = '.needs-panel{' + Object.entries(towerTokenMap).map(([key, base]) => `${key}:var(${base})`).join(';') + '}';

// Resolve the actual source declarations, not a second palette of copied values.
// Pack CSS has a single :root colour block; the later reduced-motion block has no colours.
export function resolveTowerTokens(css, mapping = towerTokenMap) {
  const base = Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(([, key, value]) => [key, value.trim()]));
  function colour(key, seen = new Set()) {
    if (seen.has(key)) throw new Error(`Cyclic pack token: ${key}`);
    seen.add(key);
    const value = base[key];
    if (!value) throw new Error(`Missing pack token: ${key}`);
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (reference) return colour(reference[1], seen);
    if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Unsupported pack colour: ${key}: ${value}`);
    return value;
  }
  return Object.fromEntries(Object.entries(mapping).map(([key, baseKey]) => [key, colour(baseKey)]));
}
export function contrastRatio(a, b) {
  const lum = hex => {
    const rgb = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function towerContrastFailures(tokens) {
  const failures = [];
  const check = (ink, fill, floor) => {
    const ratio = contrastRatio(tokens[ink], tokens[fill]);
    if (ratio < floor) failures.push({ token: ink, against: fill, floor, ratio });
  };
  for (const action of ['answer', 'try', 'approve', 'read', 'open']) check(`--action-${action}-fg`, `--action-${action}-bg`, 4.5);
  check('--owner-chip-fg', '--owner-chip-bg', 4.5);
  for (const state of ['working', 'stalled', 'resume']) check(`--running-${state}-fg`, `--running-${state}-bg`, 4.5);
  for (const ink of ['--running-fg', '--running-meta-fg']) check(ink, '--running-card-bg', 4.5);
  for (const ground of ['--running-card-bg', '--needs-page-bg']) check('--running-focus-ring', ground, 3);
  check('--running-meta-fg', '--needs-page-bg', 4.5);
  for (const ground of ['--needs-page-bg', '--surface-hover']) {
    check('--action-open-border', ground, 3);
    check('--owner-chip-border', ground, 3);
    check('--topic-id-fg', ground, 4.5);
  }
  // Session panel shell (R4a): text on the panel canvas and header, focus ring and the Close control border.
  for (const ground of ['--needs-page-bg', '--surface-frame-body']) {
    check('--text-primary', ground, 4.5);
    check('--text-secondary', ground, 4.5);
    check('--needs-focus-ring', ground, 3);
  }
  check('--action-open-border', '--surface-frame-body', 3);
  // GPU chip and panel (R5b): state fills carry light text; the panel reads on its own ground and the page.
  for (const state of ['busy', 'amber']) check(`--gpu-${state}-fg`, `--gpu-${state}-bg`, 4.5);
  for (const ink of ['--gpu-panel-fg', '--gpu-panel-muted']) check(ink, '--gpu-panel-bg', 4.5);
  check('--gpu-focus-ring', '--gpu-panel-bg', 3);
  check('--gpu-panel-border', '--needs-page-bg', 1.2);
  // Settings panel (R5c): text, muted text and field errors on the panel; fields read and show their edge.
  for (const ink of ['--set-panel-fg', '--set-panel-muted', '--set-error-fg']) check(ink, '--set-panel-bg', 4.5);
  check('--set-panel-fg', '--set-field-bg', 4.5);
  check('--set-error-fg', '--set-field-bg', 4.5);
  for (const ground of ['--set-panel-bg', '--set-field-bg']) check('--set-focus-ring', ground, 3);
  check('--set-field-border', '--set-panel-bg', 3);
  check('--set-panel-border', '--needs-page-bg', 1.2);
  // Work rows and Quiet (R6a): secondary and strong text on the page and on hover.
  for (const ink of ['--work-meta-fg', '--work-strong-fg']) for (const ground of ['--needs-page-bg', '--surface-hover']) check(ink, ground, 4.5);
  return failures;
}
export function themePackFailures(pack) {
  return [false, true].flatMap(dark => {
    const effective = pairedPack(pack, dark);
    return towerContrastFailures(resolveTowerTokens(themeFile(effective).toString())).map(failure => ({ ...failure, mode: dark ? 'dark' : 'light', pack: effective }));
  });
}
export function validateThemePack(pack) {
  pairedPack(pack);
  const failures = themePackFailures(pack);
  if (failures.length) throw new Error(`Refused themePack ${pack}: ${failures.map(f => `${f.mode} ${f.token} against ${f.against}`).join(', ')}`);
}
export function themeLinks(pack = defaultThemePack) {
  validateThemePack(pack);
  const dark = pairedPack(pack, true);
  const link = (name, media = '') => `<link rel="stylesheet" href="/toolbox/themes/${name}/theme.css"${media ? ` media="${media}"` : ''}>`;
  return dark === pack ? link(pack) : link(pack, '(prefers-color-scheme: light)') + link(dark, '(prefers-color-scheme: dark)');
}

// Light/dark/system switch for the new home. Both packs are linked with ids; the script
// below runs before first paint, reads the remembered choice and re-targets the link media.
export const themeStorageKey = 'tower-theme';
export function themeSwitchLinks(pack = defaultThemePack) {
  validateThemePack(pack);
  const link = (id, name, media) => `<link rel="stylesheet" id="${id}" href="/toolbox/themes/${name}/theme.css" media="${media}">`;
  return link('theme-light', pack, '(prefers-color-scheme: light)') + link('theme-dark', pairedPack(pack, true), '(prefers-color-scheme: dark)');
}
function themeSwitchClient(key) {
  const choices = ['system', 'light', 'dark'], names = { system: 'System', light: 'Light', dark: 'Dark' };
  const read = () => { try { const v = localStorage.getItem(key); return choices.includes(v) ? v : 'system'; } catch { return 'system'; } };
  const apply = choice => {
    const l = document.getElementById('theme-light'), d = document.getElementById('theme-dark');
    if (l) l.media = choice === 'dark' ? 'not all' : choice === 'light' ? 'all' : '(prefers-color-scheme: light)';
    if (d) d.media = choice === 'light' ? 'not all' : choice === 'dark' ? 'all' : '(prefers-color-scheme: dark)';
    document.documentElement.style.colorScheme = choice === 'system' ? '' : choice;
    document.documentElement.dataset.themeChoice = choice;
  };
  apply(read());
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-btn'), menu = document.getElementById('theme-menu'), live = document.getElementById('theme-live');
    if (!button || !menu) return;
    const items = [...menu.querySelectorAll('[data-theme-choice]')];
    const isOpen = () => !menu.hidden;
    const show = () => {
      const c = document.documentElement.dataset.themeChoice;
      for (const b of items) { b.setAttribute('aria-checked', String(b.dataset.themeChoice === c)); b.tabIndex = -1; }
      button.setAttribute('aria-label', 'Colour theme: ' + names[c]);
    };
    const close = restore => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); if (restore) button.focus(); };
    const open = at => {
      menu.hidden = false; button.setAttribute('aria-expanded', 'true');
      const current = items.findIndex(b => b.getAttribute('aria-checked') === 'true');
      const target = at === 'last' ? items.length - 1 : current < 0 ? 0 : current;
      items[target].tabIndex = 0; items[target].focus();
    };
    const pick = b => {
      const c = b.dataset.themeChoice;
      try { localStorage.setItem(key, c); } catch {}
      apply(c); show(); close(true);
      if (live) live.textContent = 'Theme: ' + names[c] + (c === 'system' ? ', follows your device' : '');
    };
    show();
    button.addEventListener('click', () => { if (isOpen()) close(false); else open('current'); });
    button.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!isOpen()) open('current'); else items[0].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen()) open('last'); }
    });
    for (const b of items) b.addEventListener('click', () => pick(b));
    menu.addEventListener('keydown', e => {
      const at = items.indexOf(document.activeElement);
      const move = i => { e.preventDefault(); const n = items[(i + items.length) % items.length]; for (const b of items) b.tabIndex = -1; n.tabIndex = 0; n.focus(); };
      if (e.key === 'ArrowDown') move(at + 1);
      else if (e.key === 'ArrowUp') move(at - 1);
      else if (e.key === 'Home') move(0);
      else if (e.key === 'End') move(items.length - 1);
      else if (e.key === 'Tab') close(false);
    });
    // Escape closes the menu first and is consumed, so the session panel behind it stays open.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen()) return;
      e.preventDefault(); e.stopPropagation(); close(true);
    }, true);
    document.addEventListener('click', e => { if (isOpen() && !menu.contains(e.target) && !button.contains(e.target)) close(false); });
  });
}
export const themeSwitchScript = () => `<script id="theme-boot">(${themeSwitchClient.toString()})(${JSON.stringify(themeStorageKey)});</script>`;
const icon = (d, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const themeIcons = {
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  dark: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>'
};
const themeNames = { system: 'System', light: 'Light', dark: 'Dark' };
// One menu button (the current choice's icon and short label) that opens System / Light / Dark.
// The button shows only the current choice through CSS on html[data-theme-choice], set before first paint.
// A native select cannot show an icon beside its label or a check mark in both themes, so this is a menu button.
export const themeSwitchMarkup = '<div id="theme-switch" class="theme-switch">'
  + '<button type="button" id="theme-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu" aria-label="Colour theme: System">'
  + Object.keys(themeNames).map(c => `<span class="tc tc-${c}">${icon(themeIcons[c])}<span class="tl">${themeNames[c]}</span></span>`).join('')
  + icon('<path d="M6 9l6 6 6-6"/>', 'chev') + '</button>'
  + '<div id="theme-menu" role="menu" aria-label="Colour theme" hidden>'
  + Object.keys(themeNames).map(c => `<button type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-theme-choice="${c}">${icon(themeIcons[c])}<span class="mn">${themeNames[c]}</span>${icon('<path d="M5 12l5 5 9-10"/>', 'mark')}</button>`).join('')
  + '</div></div>';
export const themeLiveMarkup = `<p id="theme-live" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></p>`;
// The check mark (not colour) shows the current choice. The menu uses tower tokens; the button takes the header's own ink.
export const themeSwitchCss = towerTokenCss.replace('.needs-panel{', '#theme-menu{') + `
.theme-switch{position:relative;display:inline-flex;margin-left:auto}.gpuchip:not([hidden])~.theme-switch{margin-left:0}
#theme-btn{display:inline-flex;gap:6px;align-items:center;font:inherit;font-size:14px;min-height:32px;padding:2px 10px;border:1px solid currentColor;border-radius:99px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap}
#theme-btn .tc{display:none;align-items:center;gap:6px}
html:not([data-theme-choice]) #theme-btn .tc-system,html[data-theme-choice=system] #theme-btn .tc-system,html[data-theme-choice=light] #theme-btn .tc-light,html[data-theme-choice=dark] #theme-btn .tc-dark{display:inline-flex}
#theme-btn:hover .tl{text-decoration:underline;text-underline-offset:3px}#theme-btn[aria-expanded=true]{box-shadow:inset 0 0 0 2px currentColor}#theme-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#theme-btn .chev{width:12px;height:12px}
#theme-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:100%;box-sizing:border-box;padding:4px;display:flex;flex-direction:column;background:var(--surface-frame-body);color:var(--text-primary);border:1px solid var(--action-open-border);border-radius:8px;box-shadow:0 6px 20px rgb(0 0 0/.25)}
#theme-menu[hidden]{display:none}
#theme-menu button{display:flex;gap:8px;align-items:center;font:inherit;font-size:14px;min-height:32px;padding:4px 10px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;text-align:left;white-space:nowrap}
#theme-menu button .mn{flex:1;padding-right:12px}#theme-menu button .mark{visibility:hidden}
#theme-menu button[aria-checked=true]{font-weight:700}#theme-menu button[aria-checked=true] .mark{visibility:visible}
#theme-menu button:hover,#theme-menu button:focus{background:var(--surface-hover)}#theme-menu button:focus-visible{outline:2px solid var(--needs-focus-ring);outline-offset:-2px}`;
