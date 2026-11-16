# Motion recipes

Use these for ordinary components instead of inventing motion per job. Adapted
in our own words from [animate](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animate/SKILL.md)
and its [RECIPES.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animate/RECIPES.md).
The [MIT notice](README.md#borrowed-practices-and-attribution) covers these adaptations.

Load [tokens.css](motion-lab/tokens.css), then [recipes.css](motion-lab/recipes.css).
Optional [recipes.mjs](motion-lab/recipes.mjs) supplies surface lifecycle, tab
clipping and FLIP adapters without dependencies. These are motion wrappers for
the project's chosen accessible primitives, not a new component library.

General UI stays **under 300 ms**; explanatory cause-and-effect has a separate
**250–1250 ms** budget. None of these eight recipes uses that longer budget.
Keep explanatory sequences in a separately named motion-ledger entry. Apply the
frequency gate first: 100+ uses/day and frequent shortcut/palette navigation
settle immediately (`instant: true`); tens/day usually use stillness or a fade.
The person's documented exceptions override source blanket bans.

## Surface integration

Put `data-motion="menu|popover|tooltip|dialog|toast|backdrop"` and
`data-state="closed" hidden inert` on an inner motion wrapper. The primitive's
positioner stays outside. For anchored surfaces set `--motion-origin` from the
primitive's collision-aware transform origin, including when it flips sides.
An unset origin is an integration defect for menu, popover and tooltip.

```js
import { surfaceMotion } from './motion-lab/recipes.mjs';
const motion = surfaceMotion(wrapper);
// Called by the primitive after it updates its logical open state.
await motion.setOpen(true, { reduced: media.matches, instant: frequent });
// Rapid reversal is allowed; never await a prior open before accepting close.
await motion.setOpen(false, { reduced: media.matches, instant: frequent });
```

Keep the wrapper mounted until close settles, then let the primitive unmount.
Do not add a second exit-presence owner. Focus moves immediately when the
logical state changes, never in an animation completion callback. A closing
surface is inert immediately; stale completions cannot hide a reopened surface.
For a dialog, the primitive retains modal containment/scrim until exit finishes
and restores trigger focus safely on dismissal. If the primitive cannot support
that lifecycle, dismiss immediately. The motion adapter does not implement focus.
Apply the same open target to dialog and backdrop together, without stagger.
On hidden tabs, disposal or preference changes call `settle(logicalOpen)`;
reapply reduced settings before the next transition. No unseen motion replays.

| Recipe | Entrance and exit | Reduced motion | Interruption and specific check |
|---|---|---|---|
| Dropdown / menu | `.95` to `1` scale and fade, `--duration-menu` (200 ms), trigger origin; exit `--duration-feedback` (120 ms), same path, `--ease-enter` / `--ease-exit`. | `--duration-reduced` (160 ms) opacity only; frequent keyboard menus instant. | Retarget CSS state during open/close/open; final menu stays visible with focus retained. |
| Popover | Same trigger-anchored wrapper, `--duration-popover` (160 ms); exit feedback (120 ms). | Opacity only. | Reverse while half open; test collision-flipped origin and outside dismissal. |
| Tooltip | `.97` scale and fade, popover (160 ms), exit feedback (120 ms). | Opacity only; no travel. | The primitive owns first-hover delay and warm-up group; neighbours use `instant: true` with no repeated delay. Focus tooltips remain available on keyboard; Escape dismisses. |
| Dialog | Centred `.96` scale and fade, panel (270 ms); exit `--duration-exit` (180 ms). Backdrop fades on exactly the same timing. | Both surfaces fade only. | Escape while opening, then reopen; no orphan scrim, hidden focused control or old exit hiding the new dialog. |
| Toast | From `translateY(100%)` to rest plus fade, menu (200 ms); exit feedback (120 ms), returning downwards. | Fade only; final message and announcement stay available. | Retarget transitions; use FLIP on existing stack siblings, not restarted entry keyframes. Reading timeout belongs to the toast primitive: pause while hovered, focused or tab-hidden. Preserve announcements and action lifetime. |
| Accordion / disclosure | Commit expanded layout once, then `flipLayout` siblings with menu (200 ms) and `--ease-move`; optional content fade uses popover (160 ms). Never tween height. | Commit final layout immediately; optional gentle opacity feedback. | Measure current displayed boxes before reversing; cancel old transforms, commit once, invert to the new layout. Trigger keeps focus and updates `aria-expanded` immediately. |
| Tabs indicator | `.motion-tab-copy` clips an inert active-styled duplicate to the selected tab, menu (200 ms), `--ease-move`. | Clip changes immediately. | `tabIndicator` retargets the clip; real tabs update selection/content without waiting. Re-measure after resize, font load or label changes. Frequent/keyboard switching is instant. |
| Button press | `.motion-press:active` scales to `.97`, feedback (120 ms), `--ease-out`; release retargets to rest. | Keep native static active/focus styling; omit scale. | Pointer-down acknowledges immediately, click commits on release; dragging away cancels normally. Disabled buttons never press. Hover motion, if added, needs fine-pointer/hover gating. |

## Accordion / disclosure

Pass stable sibling wrappers to `flipLayout(items, changeLayout, options)`;
resolve `duration` and `easing` from the CSS tokens with `getComputedStyle`.
Inside `changeLayout`, update `aria-expanded` and `hidden` together. Return focus
to the trigger before hiding a focused descendant. For removal, position the
leaving object absolutely at its measured location first, then fade it while
siblings close the gap concurrently. Remove that exit object on completion or
cancellation; never preserve a duplicate in the accessibility tree. The
[FLIP collapse stage](motion-lab/index.html#flip-collapse) demonstrates removal.

## Tabs indicator

The visual duplicate must have `aria-hidden="true"`, `inert`, no duplicate IDs,
and no focusable descendants. Keep its dimensions aligned with the real list.
Pass tab bounds relative to the list into `tabIndicator(copy, bounds, options)`.
Clipping can paint; profile it under navigation load before using it broadly.

## Button press

Add `motion-press` to the actual button. Keep explicit hover, focus-visible,
disabled and active surface styles from the selected theme/primitive. This
recipe supplies only the movement; it does not replace those accessible cues.

## Evidence and limits

Run `node --test tests/motion-recipes.test.mjs` for lifecycle races, immediate
settling, clipped tab bounds, FLIP reversal and CSS/token contracts for all eight
recipes. Run `node docs/design-toolbox/motion-lab/check.cjs` for stage replay.
These are browser-free tests; they do not prove rendered CSS interpolation,
native focus/announcement behaviour, paint performance or perceived motion.
Before calling a component golden, replay each at normal speed and 2–5× duration,
reverse mid-flight, change reduced motion, hide the tab, and inspect it next day.
