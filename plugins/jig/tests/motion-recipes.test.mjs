import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { surfaceMotion, tabIndicator, flipLayout } from '../docs/design-toolbox/motion-lab/recipes.mjs';

const base = new URL('../docs/design-toolbox/motion-lab/', import.meta.url);
const css = readFileSync(new URL('recipes.css', base), 'utf8');
const tokens = readFileSync(new URL('tokens.css', base), 'utf8');
function animation() {
  let done, reject;
  const a = { finished: new Promise((yes, no) => { done = yes; reject = no; }),
    finish: () => done(), cancel() { a.cancelled = true; reject(new Error('cancelled')); } };
  // Test FLIP cancellations may intentionally have no completion observer.
  a.finished.catch(() => {});
  return a;
}
function element() {
  const el = { hidden: true, inert: true, dataset: { state: 'closed' }, style: {}, animations: [],
    getAnimations() { return this.animations; },
    getBoundingClientRect() { return this.box ?? { top: 0, left: 0 }; },
    animate(frames, options) { const a = animation(); Object.assign(a, { frames, options }); this.animations.push(a); return a; } };
  return el;
}

test('[risk: stale exit hides a reopened surface] menu, popover, tooltip, dialog and toast reverse safely', async () => {
  for (const kind of ['menu', 'popover', 'tooltip', 'dialog', 'toast']) {
    const el = element(); el.dataset.motion = kind;
    const motion = surfaceMotion(el);
    await motion.setOpen(true);
    assert.equal(el.hidden, false); assert.equal(el.inert, false);
    const oldExit = animation(); el.animations = [oldExit];
    const closing = motion.setOpen(false);
    assert.equal(el.inert, true); assert.equal(el.hidden, false, 'exit stays mounted');
    const newEnter = animation(); el.animations = [newEnter];
    const reopening = motion.setOpen(true);
    oldExit.cancel(); await closing;
    assert.equal(el.hidden, false, kind + ': stale completion must not hide');
    newEnter.finish(); await reopening;
    assert.equal(el.inert, false); assert.equal(el.dataset.state, 'open');
    el.animations = [];
    await motion.setOpen(false, { instant: true });
    assert.equal(el.hidden, true); assert.equal(el.dataset.instant, 'true');
  }
});

test('[risk: hiding a tab or changing preferences leaves unseen work] settle cancels and preserves logical state', async () => {
  const el = element(), motion = surfaceMotion(el), pending = animation();
  el.animations = [pending]; const closing = motion.setOpen(false);
  motion.settle(true); await closing;
  assert.equal(pending.cancelled, true); assert.equal(el.hidden, false); assert.equal(el.inert, false);
  assert.equal(el.dataset.instant, 'true', 'settling must not launch a replacement transition');
  el.animations = [];
  await motion.setOpen(false, { reduced: true });
  assert.equal(el.dataset.reduced, 'true'); assert.equal(el.hidden, true);
  motion.settle(false); assert.equal(el.inert, true);
});

test('[risk: disclosure jumps on reversal or repeatedly lays out] FLIP starts at presentation position and commits once', () => {
  const item = element(); item.hidden = false; item.box = { left: 10, top: 80 };
  const options = { duration: 200, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' };
  let commits = 0;
  const first = flipLayout([item], () => { commits++; item.box = { left: 10, top: 20 }; }, options);
  assert.equal(commits, 1); assert.equal(first[0].frames[0].transform, 'translate(0px, 60px)');
  assert.equal(first[0].frames[1].transform, 'none'); assert.equal(first[0].options.fill, 'none');
  // Mid-flight presentation position, neither the old nor new layout target.
  item.box = { left: 10, top: 45 };
  const reversed = flipLayout([item], () => { commits++; item.box = { left: 10, top: 80 }; }, options);
  assert.equal(first[0].cancelled, true); assert.equal(commits, 2);
  assert.equal(reversed[0].frames[0].transform, 'translate(0px, -35px)');
  const reduced = flipLayout([item], () => { commits++; item.box = { left: 10, top: 20 }; }, { ...options, reduced: true });
  assert.equal(commits, 3); assert.deepEqual(reduced, []); assert.equal(reversed[0].cancelled, true);
  assert.throws(() => flipLayout([], () => {}, { ...options, duration: 800 }), /general-UI/);
});

test('[risk: tab indicator reveals wrong label or moves under reduced motion] clip uses current bounds', () => {
  const copy = element();
  tabIndicator(copy, { left: 40, right: 120, width: 200 });
  assert.equal(copy.style.clipPath, 'inset(0 40% 0 20%)');
  tabIndicator(copy, { left: 120, right: 200, width: 200 }, { reduced: true });
  assert.equal(copy.style.clipPath, 'inset(0 0% 0 60%)'); assert.equal(copy.dataset.reduced, 'true');
  tabIndicator(copy, { left: 0, right: 40, width: 200 }, { instant: true });
  assert.equal(copy.dataset.reduced, 'true');
  assert.throws(() => tabIndicator(copy, { left: 0, right: 20, width: 0 }), /Tab bounds/);
  assert.throws(() => tabIndicator(copy, { left: 20, right: 10, width: 200 }), /Tab bounds/);
});

test('[risk: recipes drift outside timing budget or lose reduced-motion and press guards] CSS uses the shared tokens', () => {
  const values = Object.fromEntries([...tokens.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  for (const [, name] of css.matchAll(/var\((--(?:duration|ease)-[\w-]+)\)/g)) {
    assert.ok(values[name], 'missing token: ' + name);
    if (name.startsWith('--duration')) assert.ok(parseFloat(values[name]) < 300, name + ': general UI budget');
  }
  for (const [enter, exit] of [['menu', 'feedback'], ['popover', 'feedback'], ['panel', 'exit']]) {
    assert.ok(parseFloat(values['--duration-' + exit]) < parseFloat(values['--duration-' + enter]));
  }
  assert.match(css, /\.motion-press:active:not\(:disabled\)\s*\{ transform: scale\(\.97\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[data-motion\]\[data-reduced="true"\]\[data-state="closed"\]/, 'explicit reduced mode wins closed transform specificity');
  assert.match(css, /\.motion-tab-copy\[data-reduced="true"\]\s*\{ transition: none/);
  assert.match(css, /transition-property: opacity;/);
  assert.match(css, /transform-origin: var\(--motion-origin, center\)/);
  assert.match(css, /\[data-motion="dialog"\][\s\S]*?transform-origin: center/);
  assert.doesNotMatch(css, /transition:\s*all|@keyframes|transition[^;{}]*\b(?:height|width|margin|padding|top|left)\b/);
});

test('[risk: naming an effect sends the person to a missing lab stage] vocabulary links resolve to shipped scenes', () => {
  const vocabulary = readFileSync(new URL('../docs/design-toolbox/motion-vocabulary.md', import.meta.url), 'utf8');
  const stages = readFileSync(new URL('stages.js', base), 'utf8');
  const ids = new Set([...stages.matchAll(/sample\('([^']+)'/g)].map(([, id]) => id));
  for (const [, id] of stages.matchAll(/\['([^']+)','(?:Edge flow|Single dot|Comet trail|Message bursts)'\]/g)) ids.add(id);
  for (const [, id] of vocabulary.matchAll(/motion-lab\/index\.html#([\w-]+)/g)) assert.ok(ids.has(id), 'Missing scene: ' + id);
  for (const term of ['Perimeter draw', 'Halo', 'Breathing', 'Attention loop', 'Comet trail', 'FLIP collapse']) {
    assert.ok(vocabulary.includes('**' + term + '**'), 'Missing exact term: ' + term);
  }
});
