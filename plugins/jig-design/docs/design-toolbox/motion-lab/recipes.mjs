if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/motion-lab/recipes.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Small lifecycle adapters, not replacements for accessible component primitives.
// Adapted ideas: animate/RECIPES.md; full attribution in ../README.md.

export function surfaceMotion(element) {
  let generation = 0;
  return {
    async setOpen(open, { reduced = false, instant = false } = {}) {
      const run = ++generation;
      element.dataset.reduced = String(reduced);
      element.dataset.instant = String(instant);
      if (open && element.hidden) {
        element.dataset.state = 'closed';
        element.hidden = false;
        // Establish the mounted start state before changing the target.
        element.getBoundingClientRect();
      }
      element.inert = !open;
      element.dataset.state = open ? 'open' : 'closed';
      element.getBoundingClientRect(); // Materialize this transition's handles.
      // CSS transitions retarget without cancellation; cancelled old promises
      // cannot hide a reopened surface because their generation is obsolete.
      await Promise.allSettled(element.getAnimations().map(a => a.finished));
      if (run === generation && !open) element.hidden = true;
    },
    settle(open) {
      ++generation;
      element.dataset.instant = 'true';
      element.getAnimations().forEach(a => a.cancel());
      element.dataset.state = open ? 'open' : 'closed';
      element.hidden = !open;
      element.inert = !open;
      element.getBoundingClientRect();
    },
  };
}

// Use on an aria-hidden, inert visual duplicate of the real tab list. The real
// tabs own keyboard handling, focus and aria-selected; this copy owns no IDs.
export function tabIndicator(copy, { left, right, width }, { reduced = false, instant = false } = {}) {
  if (![left, right, width].every(Number.isFinite) || width <= 0 || left < 0 || right < left || right > width) {
    throw new RangeError('Tab bounds must lie inside a non-empty tab list');
  }
  copy.dataset.reduced = String(reduced || instant);
  copy.style.clipPath = `inset(0 ${100 * (width - right) / width}% 0 ${100 * left / width}%)`;
}

// For disclosure siblings or removal. Items must be untransformed wrappers in
// the same layout coordinate system. Keep inner styling on a child wrapper.
// The caller commits hidden/expanded state and focus in changeLayout(), once.
export function flipLayout(items, changeLayout, { duration, easing, reduced = false } = {}) {
  if (!Number.isFinite(duration) || duration < 0 || duration >= 300 || !easing) {
    throw new RangeError('FLIP requires general-UI duration and resolved easing tokens');
  }
  // Read the current displayed positions before cancelling a previous run.
  const first = items.map(item => item.getBoundingClientRect());
  items.forEach(item => item.getAnimations().forEach(a => a.cancel()));
  changeLayout();
  const last = items.map(item => item.getBoundingClientRect());
  if (reduced || duration === 0) return [];
  return items.flatMap((item, i) => {
    const x = first[i].left - last[i].left, y = first[i].top - last[i].top;
    if (item.hidden || (!x && !y)) return [];
    return [item.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }],
      { duration, easing, fill: 'none' })];
  });
}
