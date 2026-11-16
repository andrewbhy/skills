# Advisory design inspector

`scripts/design-inspector.mjs` adds three selected Impeccable rule families to
jig. It is separate from token lint: a token-compliant glow can still be a taste
warning, while an approved treatment still has to pass token and geometry checks.
Every finding has `ruleId`, `severity: "warn"`, `target`, measured `evidence` and
an `explanation`. It never edits a design or decides visual acceptance.

## Use and evidence

In an existing authorized page check, capture a named state after its setup:

```js
import { captureDesign, analyzeDesign, inspectDesign } from './scripts/design-inspector.mjs';
const snapshot = await captureDesign(page, 'body');
const report = analyzeDesign(snapshot, exceptions);
// Or: await inspectDesign(page, { root: 'body', ...exceptions });
```

The helpers neither launch nor close browsers. Use the machine's memory check
before any separate live launch; share one existing page and close the browser
after the job. Save snapshots outside the repo with state, theme, density,
viewport and harness revision. Inspect generated DOM in each selected state;
source CSS alone cannot establish nesting or whether a tile is above a heading.
Replay a saved snapshot without a browser:

```text
node scripts/design-inspector.mjs snapshot.json exceptions.json
```

The second argument is optional. Exit **0** includes warning-only and fully
waived reports; **2** means invalid input or incomplete analysis. There is no
warning-failure exit code. Consumers must inspect `gaps` and `waived` as well as
`findings`. This inspector is opt-in; it does not change the visual runner or
style-lint's debt accounting and exit contract.

## Selected rules

| Family / IDs | Evidence and prompt | Exclusions |
|---|---|---|
| Nested containers: `nested-cards` | Border or box-shadow plus background or radius, meaningful text, nearest framed ancestor; one finding per outer panel, listing inner targets. Ask whether another frame earns its weight. | Native and ARIA controls, code/media elements, positioned overlays, dialog shell / first dialog panel; documented demo, media or application frames. |
| Stacked icon tiles: `icon-tile-stack` | Previous sibling of heading/card title; 32–128 px, near square (0.7–1.4), tinted or bordered, non-circular, smaller icon, visually above title within 4 px tolerance. | Inline icon/title rows, full-size illustrations, circular avatars, bare unframed icons. |
| Decorative glows: `dark-glow`, `radial-halo`, `radial-spotlight-glow` | Chromatic shadow blur >4 px, strength ≥3 alpha/opacity-weighted px, edge lift ≥20 and halo area ≤2× element area; zero offset or dark ground. Radial halo: dark ground, chromatic opaque start (alpha ≥0.7), transparent end, no small ≤24 px stop. Spotlight: 240×160 px or larger, one or two faint painted stops (alpha <0.45) fading to transparent. | Neutral elevation, faint/contained light, tiny indicators, repeating gradients, functional focus and selection light; documented intentional themes. |

Use `data-design-purpose="focus"` or `"selection"` only on the light that
actually communicates that state. Active `:focus-visible` and `aria-selected`
are recognized too. These exclude only glow findings on that element and its
pseudo-elements; they do not exempt nested containers or tiles. Never apply the
marker to a whole shell merely to silence decoration. Check focus and selection
contrast and persistence separately. No palette, hue or font is banned.

Use `data-card-title` on a non-heading title. `data-design-frame` marks an
intentional application/demo/media frame; explain its purpose in the ledger.
It excludes that boundary from nested-container review, not every descendant.
Prefer a recorded waiver when the exception needs a review trail.

## Exceptions

Project configuration supplies exact-target, per-rule waivers. Targets are the
stable CSS paths emitted by the capture (structural paths deliberately avoid
ambiguous duplicate IDs). Refresh waivers after structural changes. Each needs
a reason and decision-evidence link; it cannot silence another rule.

```json
{
  "waivers": [
    {"ruleId":"nested-cards","target":"html:nth-child(1) > body:nth-child(2) > section:nth-child(1)","reason":"Independent permission groups need separate boundaries","evidence":"decisions.md#permission-groups"}
  ],
  "theme": {
    "name":"neon-synth",
    "intentional":[
      {"ruleId":"dark-glow","target":"*","reason":"Approved neon surface light","evidence":"theme-decisions.md#neon"}
    ]
  }
}
```

The theme's manifest may contain this `intentional` list; pass the selected
manifest as `theme` (its `name`, or an explicit `id`, identifies the theme).
Only its three glow rule IDs permit theme intent and only
there may `target` be `"*"`. Ordinary waivers always need an exact target. The
report keeps the full finding and exception under `waived` for review. A theme
approval does not waive token use, clipping, contrast or independent craft review.

## Snapshot contract and limits

Version 1 is `{schemaVersion:1, nodes:[...], gaps:[]}`. Each node records unique
`target`, nullable `parent` and `previous` target references, lower-case `tag`,
`text`, `rect:{x,y,width,height}`, sRGB `[r,g,b,alpha]` `background` and `surface`,
numeric `border` (four-sided minimum), `radius`, cumulative `opacity`, `shadows`
and `gradients`. `surface` is the composited ancestor ground. Each shadow has
`property`, `x`, `y`, `blur`, `spread`, `color`, `inset`; each radial gradient has
`value`, `repeating`, and `stops:[{color,px}]` (`px:null` for non-pixel stops).
Optional flags: `hidden`, `icon`, `cardTitle`, `frame`, `focus`, `selection`;
optional `role`, `position`, `iconWidth`. See the fixture and capture for a
complete example. Invalid references, cycles, colours, measurements and
exceptions fail as input errors, rather than producing a clean design report.

The local adapter resolves tokens through computed CSS and normalizes colours
using a 1 px canvas, with no screenshots or upstream runtime. It measures real
boxes instead of inferring fixed-height row padding. This is a narrow adaptation,
not parity with the upstream static DOM/cascade engines: no typography, copy,
palette, spacing or other detectors are imported. Border/radius and dialog
handling are intentionally simpler; embedded content exceptions need a documented
frame or waiver. It reports each outer panel rather than upstream's leaf-only
aggregation. Shadow lift is evaluated per layer, without upstream's multi-layer
summation and same-hue cast-shade refinement.

Pseudo-elements use their computed width/height, with unresolved bounds reported
as gaps. Non-radial background images, shadow DOM and iframe content produce
coverage gaps; image pixels, background blending, filters, transforms on pseudo
elements and non-rectangular clipping are not modeled. Canvas colours are sRGB
approximations; translucent ancestor opacity and layered gradients can alter the
actual ground. A clean report proves neither visual craft nor contrast. Review
warnings against the [brief](design-brief.md), actual references and the person's
recorded reactions before changing anything.
