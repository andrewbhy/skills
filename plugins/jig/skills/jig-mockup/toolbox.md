# Mockup quality contract

<!-- Generated from docs/design-toolbox/README.md by <skill-folder>/../../scripts/sync-skills.mjs. Do not edit. -->

## Look foundations

Before stage 2, the stage-1 round brief has a decision or an explicit recorded
deferral (reason, owner and revisit point) for every row below. Missing rows
block stage 2. A deferral carries a limitation into later briefs; it never counts
as evidence that the deferred foundation works.

| Foundation | Required decision or deferral |
|---|---|
| Font and type scale | Font family, roles, size/weight/line-height scale and font customization; name offered fonts and unavailable choices. |
| Colour and accent range | Semantic colour roles, approved presets, accent styles and usable customization range. |
| Surfaces and contrast | Distinguishable canvas, frames, nodes/rows and overlays; text/control contrast and rendered reference checks. |
| Selection and focus | One selection rule and one focus rule across component types, themes and states; record intentional exceptions. |
| Motion vocabulary | A named motion or explicit stillness decision per interaction type, with frequency and reduced-motion behavior. Stage 1 records the vocabulary while staying static. |
| Customization axes | Supported font, theme, accent, surface, radius, density and header choices; stable export IDs and disabled options with reasons. |

A fresh seat compares the look sheet with the actual reference. The coordinator
may triage findings but never accepts its own gate. Carry the foundations table,
reference IDs and person feedback into the next stage.

## Components and their quality bar

Golden examples and components are built **on** open source parts, not compared alongside them. Where a mature library solves something (menus, dialogs, tabs, inputs, command palette, docking, canvas), the project uses its pick and must not break the library's keyboard, focus and accessibility behaviour. The project's own work is composition and its specific components, which are benchmarked against the closest mature analogues (for example canvas library examples, VS Code panels and tabs, an issue tracker's inbox, a code host's review view).

Every component the project writes meets this checklist before agents copy it, drawn from what mature design systems (Fluent, Radix Themes, shadcn/ui) treat as finished. `jig-verify` and `jig-review` check it for interface work.

- **States:** default, hover, focus, active, disabled, loading, empty, error, overflow (long titles, long non-Latin text such as Korean).
- **Keyboard:** every action reachable; focus visible and never lost or stolen.
- **Accessibility:** correct roles and accessible names; tests find it by role and name.
- **Themes:** works in every theme the project offers; contrast holds (4.5:1 text, 3:1 controls and focus).
- **Density:** readable at realistic data volume, not only sample data.
- **Motion:** only to explain a real change, and required wherever something changes on its own (appears, moves, changes state, leaves): without it people miss the change or feel something is off (change blindness; Rensink, O'Regan and Clark 1997), so missing motion needs a disposition: animate eligible changes, but record frequency-gate rejections and reduced-motion stillness (Motion basics below). Reduced motion keeps every fact through labels and receipts. (Person, 7 Nov 2026: "without it a human would notice something.") Motion also replaces words: where a movement shows what happened (slid out of its source, moved into Done, sprouted from its parent), no label narrates it, and the lasting fact lives in structure (links, position, state chips) so it survives reduced motion and a person who looked away (Heer and Robertson 2007).
- **No accidental plain text:** interface information uses designed components (state chips with glyphs, type glyphs, structured meta lines, right-aligned muted times), not sentences joined with dots; every action looks and behaves like a control. Plain text is for content the person reads, or is a deliberate choice recorded in the ledger.
- **Icons:** drawn from one icon set (SVG, consistent stroke and size), never text characters standing in for icons (a "v" or "⌄" for a chevron renders as a letter in some fonts).
- **Belongs to its host:** controls attached to a component (hover or selection actions on a node, card or row) share the host's shape, surface and rhythm: borderless icon buttons in the host's header or a familiar floating toolbar, not a separate boxed widget pasted on a corner. (Person, 7 Nov 2026: node controls that looked like a pasted-on white box with a letter "v" read as "ugly and out of place".)
- **Purpose:** carries its ledger ID and passes the ledger check.

## Craft basics

| Check | Rule | Source |
|---|---|---|
| **Grouping** | Space inside an item is clearly smaller than space between items (at most half); groups have stronger headers and a section gap. | Gestalt law of proximity; common list patterns (VS Code, Linear, GitHub) |
| **Alignment and insets** | Everything inside a container keeps one inset; controls centre on the text line; sizes on a 4 px grid from tokens. | Material Design and Atlassian spacing systems |
| **Icons** | One icon set, one size and stroke per context; never text characters as icons. | Common design system practice (Fluent, Carbon, Material) |
| **Controls belong to their host** | Attached controls are borderless in the host's header, shown on hover or selection; no pasted-on boxes. | Figma, Miro, VS Code row actions |
| **Every overlay can be left** | Every menu, dialog and palette closes with Escape and a click outside, and says so where it is not obvious. | WAI-ARIA Authoring Practices (dialog, menu) |
| **Identity of special actors** | Anything the person talks to or that acts on their behalf (an assistant, a coordinator) is named and visually distinct everywhere it appears; test with text hidden. | Familiar assistant patterns (VS Code Chat, Slack apps) |
| **Same type, same look** | Every instance of a type carries its signature (for example every session shows its provider mark) at every zoom where it is visible. | Consistency heuristic (Nielsen, heuristic 4) |
| **Predictable placement** | A control for the same job sits in the same place with the same icon everywhere (every panel collapses from the same corner, every node menu at the header end), and is visible without hunting; the person should know where to look before they look. | Nielsen heuristic 4, consistency and standards; Jakob's law (people expect your app to work like the others they use) |
| **Text never sizes the shape** | Distinctive shapes (diamonds, bubbles, tabs) are fixed-size badges on a normal card; text clamps to a set number of lines at a fixed width and opens in full elsewhere. | Person, from Mermaid flowcharts whose diamonds grow with every word; text inside a diamond uses about half its area |
| **Stable chrome** | Headers, tab bars and frames keep one layout and height across zoom levels and states; only content changes. A reflowing header reads as a glitch. | Consistency heuristic (Nielsen 4); the person, 7 Nov 2026 |
| **Scannable lists** | Rows have a visual anchor (a leading icon column), weight contrast between name and detail, and grouping (time, project); identical rows of equal weight read as bland and slow to scan. | Activity feeds (GitHub, Linear); the person, 7 Nov 2026 |
| **Styled scrollbars** | Scrollbars are thin, use theme tokens, have an invisible track and strengthen on hover; never the platform default thick grey bar. | VS Code and macOS overlay scrollbars; the person, 7 Nov 2026 |
| **No redundancy** | A row does not repeat what its context already says (parent name, a glyph that duplicates its chip, placeholders such as "—" for missing data). | Nielsen heuristic 8, aesthetic and minimalist design |
| **Labels say what they do** | Settings and toggles use plain words with a one-line description; no internal jargon ("Motion: drift"). | Nielsen heuristic 2, match with the real world |
| **Motion on every change** | Eligible changes explain themselves with motion instead of narrating labels; record frequency-gate rejections and reduced-motion stillness explicitly (Motion basics below). | Change blindness research; Heer and Robertson 2007; person, 8 Nov 2026, two budgets and frequency gate |
| **Depth without shadows** | Chrome, panels and content sit on distinct tonal layers; the active tab matches the surface it opens; one row of chrome where one will do. | Material Design dark theme elevation; Chrome and VS Code tabs |
| **No accidental plain text** | Interface information uses designed components; plain text only for reading content. | Person's rule; see the component checklist |
| **Visible on its ground** | Compare rendered ink with its actual ground using the shared visibility probe: flag empty text/marks and low contrast (4.5:1 ordinary text, 3:1 large text and graphics). Also compare the contact sheet against the reference: geometry does not prove craft. Logos are checked as a local quality rule, although WCAG exempts logotypes. | Person, 8 Nov 2026; thresholds informed by [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html); pixel results are probes, not WCAG conformance |

## Motion basics

Use this beside Craft basics, before building and during review. These are
adaptations, not installed third-party skills. The person's decisions take
precedence: explanatory sequences have their own budget, attention starts fast,
and reduced motion retains gentle feedback. The coordinator's draft supplied
the repeated-failure cases; its delayed gap closure is superseded by concurrent
removal below. The source opportunity gate checks frequency, purpose, speed and
function; here function is part of purpose and easing is an explicit question.

Briefs and motion ledgers use the [motion vocabulary](../../docs/design-toolbox/motion-vocabulary.md).
When the person describes an effect loosely, the coordinator replies with its
exact term and lab link before building. If no stage exists, disclose that gap
and agree a lab comparison. Ordinary components use the [motion recipes](../../docs/design-toolbox/motion-recipes.md)
with project tokens and frequency decisions rather than new per-job motion.

| Check | Rule | Source |
|---|---|---|
| **Four-question gate** | Before proposing motion, answer in order: how often is it seen; what purpose does it serve and does it help the task; which easing fits; how fast can it finish? Reject candidates that delay reading or action. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md); [find-animation-opportunities](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/find-animation-opportunities/SKILL.md), gate adapted |
| **Frequency** | 100+ uses/day: no animation; tens/day: remove or sharply reduce; occasional: standard; rare/first use: room for delight. Frequent shortcuts and palette toggles stay immediate. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md) |
| **Two budgets** | General UI finishes under 300 ms: press 100–160 ms, tooltip/popover 125–200 ms, menu/select 150–250 ms, panel/drawer 200–299 ms. Explanatory cause-and-effect sequences may use 250–1250 ms, according to the person's chosen timings; do not stretch frequent UI to that budget. | [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md); person, 8 Nov 2026 (overrides the source's 500 ms drawer upper bound) |
| **Exit** | Make exits shorter and simpler than entrances; grouped exits happen together, without reverse staggering. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md) |
| **Easing tokens** | Enter and exit: `cubic-bezier(0.23, 1, 0.32, 1)`; on-screen move: `cubic-bezier(0.77, 0, 0.175, 1)`; drawer: `cubic-bezier(0.32, 0.72, 0, 1)`; hover: `cubic-bezier(0.25, 0.1, 0.25, 1)` (the exact CSS `ease` curve); constant: `linear`. Never use `ease-in` for UI. | [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md), hover keyword expanded to its curve |
| **Scale and origin** | Never enter from `scale(0)`; start near full size (0.9–0.97) with opacity. Anchor `transform-origin` to the trigger; centred modals keep their centre. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md) |
| **Properties** | Animate only transform, opacity and drawing properties such as `stroke-dashoffset` or `clip-path`. Change layout once, then animate transforms; never tween width, height, margins, padding, top or left. Drawing can still paint: inspect its frame cost. | [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md); [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md), drawing exception; coordinator draft |
| **Explicit transitions** | Name each transitioned property; never use `transition: all`. | [review-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/SKILL.md) |
| **Collapse and removal** | At removal, take the leaving object out of layout immediately (for example, absolute at its measured position). Its exit and its siblings closing the gap run together. Measure before/after layout and use inverted transforms for siblings; do not wait for a fade before closing the gap. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); coordinator draft, revised |
| **One object, one timing** | Parts read as one object: an arrow's head and line, or a chip and label, share a start, duration and easing family. Move a parent when it should carry its parts. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); coordinator draft |
| **Cause then effect** | Order only where it explains meaning. Start with second delay equal to first duration; then bring the handoff slightly early so it reads as one gesture, with the cause still legible. Independent motion runs together. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md) |
| **Roles** | Assign one lead, smaller/shorter support, decoration that only fades (or stays still), and static elements. Two competing leads need a hierarchy decision. If a panel enters, its children are already present. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md) |
| **Stagger** | Use 30–80 ms steps only for eligible occasional groups, finishing general UI under 300 ms. Never stagger frequent UI, and never block input while it plays. Long lists bring the rest in with the last staggered item. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md) |
| **Interruption** | Use retargetable transitions or springs for rapid triggers. Stop in-flight work before starting another run; resume a chained sequence only after all reset animations complete. Test rapid repeat, reversal and replay for stale objects and timers. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md); [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md) |
| **Attention loops** | For a blocking item, start with a fast breath (about 0.9 s period) for the first few seconds, then one pulse about every 6 s. Pause during interaction, resume after reset, stop when seen (hovered, focused or opened). Keep an off switch; reduced motion uses a steady cue. | [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md), attention loops; person's choice, 8 Nov 2026, replaces the source's initial 2.5 s wait |
| **Light and dark** | Judge equal noticeability in both modes. Tune light first; compensate through theme tokens for outline and halo strength rather than assuming identical values look equal. | Person, 8 Nov 2026; coordinator draft (local addition, not a claim from a borrowed skill) |
| **Reduced motion** | Make feedback gentler, not universally zero: remove travel, scale, stagger and loops; keep brief opacity feedback and permanent facts/receipts. Explanations can show successive still states. | [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md); [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); person, 8 Nov 2026 |
| **Hover** | Gate hover effects with `@media (hover: hover) and (pointer: fine)` so a touch tap cannot trigger a false hover. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md) |
| **Hidden tabs** | Pause timers while the tab is hidden; do not consume a toast's reading time or accumulate unseen attention pulses. A lab may cancel and require explicit replay. | [emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md), Sonner principles |
| **Review by frames** | Inspect at 2–5× duration and frame by frame, then again with fresh eyes the next day. Check first beat, timing, origin, leftovers, replay and interruption; code or virtual-time checks do not establish feel. Ask: “would you still want it on the 50th use today?” | [review-animations / STANDARDS](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md); [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md); coordinator draft |
| **Frame budget** | Diagnose with a performance recording under realistic content and concurrent loading: about 16.7 ms/frame at 60 Hz and 8.3 ms at 120 Hz. Name layout, paint, main-thread work or compositing as the cause before fixing. A fast desktop or CPU throttling cannot prove a weaker GPU/device result. | [animation-performance](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-performance/SKILL.md) |
| **Driver under load** | Prefer CSS or WAAPI for predetermined motion during navigation/loading; acceleration is conditional, not guaranteed by an API. Record the installed motion-library version and verify its accelerated path; layout/gesture callbacks may still use the main thread. Do not upgrade a dependency just to borrow a recipe. | [animation-performance](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-performance/SKILL.md) |
| **Per-frame work** | Avoid framework state updates per frame and inherited custom properties updated on large parents. Write transforms directly on the moving element; batch geometry reads before writes. Profile again as child counts grow. Static timing tokens are fine. | [animation-performance](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-performance/SKILL.md) |
| **Paint and layers** | Profile drawing, clipping, shadows and filters across target browsers; none is a guaranteed compositor-only path. Prefer fading a pre-rendered halo to animating a shadow. Keep animated blur below 20 px if used; add scoped, temporary `will-change` only for a measured problem and remove it when idle. Extra layers consume memory. | [animation-performance](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-performance/SKILL.md), conservative local adaptation |

Motion reviews use one row per finding, with concrete values and its reason
([review-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/SKILL.md)):

| Before | After | Why |
|---|---|---|
| Exit holds a list gap until fading ends | Remove from flow at exit start; siblings translate into place concurrently | Keeps removal one gesture |

### Lab round: fix, reduce or cut

1. Inventory the round's motion by component, file/line, driver, properties,
   token, frequency and purpose. Check purpose/frequency, easing/timing,
   physicality/origin, interruption, performance, accessibility, cohesion and
   missing explanatory changes. Re-read evidence and exclude documented choices
   before ranking by impact and effort. Sources: [improve-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/improve-animations/SKILL.md)
   and [AUDIT.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/improve-animations/AUDIT.md).
2. Give each candidate **Keep**, **Fix**, **Reduce** or **Cut**, with the deciding
   gate. Cut purposeless decoration, repeated data entrances and high-frequency
   delays; reduce frequent effects. Keep motion that explains a real change and
   the person's documented breathing/attention exceptions. A useful effect with
   bad easing or interruption gets a fix, not automatic deletion. Record useful
   effects deliberately kept as well as removals. Source: [remove-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/remove-animations/SKILL.md).
3. For each selected fix, write a bounded task with revision, ledger IDs,
   current evidence, exact target tokens and resolved values, affected files,
   scope limits, dependencies and mechanical/feel checks. Stay within the
   authorized round; do not turn a lab pass into a codebase audit. Source:
   [improve-animations / PLAN-TEMPLATE.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/improve-animations/PLAN-TEMPLATE.md).
4. Before reducing/cutting, inspect hidden initial styles, completion callbacks,
   exit/unmount timing, focus transfers and layout shifts masked by FLIP. Remove
   obsolete waits with the motion; preserve final facts and immediate focus.
   Clean unused keyframes/imports only within scope; propose dependency removals
   separately. Replay rapid reversal, reduced motion, hidden-tab return and
   repeated runs. Report Before / After / Why and remaining visual/device gaps.
   Source: [remove-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/remove-animations/SKILL.md).

## Visual state contract

Ship `data/states.json` with the token files and component/state/role token
bindings defined in visual checks.
Render components from templates and generate their specimens and `jigStates`
from that table. Give every component scope a stable `data-component` marker.
Do not hand-write a separate copy of every state. Static side-by-side specimens
declare `static: true` (or omit setup); menus, actual hover and focus changes
keep independent setup/reset hooks and explicit scopes.

Check in cost order: browser-free tokens, one-pass scoped geometry, candidate
ink crops for visibility/clipping, then accepted component baseline diffs.
Use the shared visual time budgets from `.jig/testing.json`, retain partial
reports and fix slow states before expanding coverage. The default font runs
the full rules; other fonts reflow recorded settled states in parallel pages
of the same browser for overflow, clipping and state typography only.

Every mockup and component fixture declares independent states in the page:

```js
window.jigStates = [
  {
    name: 'menu-open',
    setup: async () => { document.querySelector('#menu-button').click(); },
    reset: async () => { document.querySelector('#menu-close').click(); }
  }
];
```

Names are unique and nonempty. Setup and reset are required async-compatible
functions. Each setup starts from the same resting page; reset restores data,
focus, scroll, selection and overlays, including after a failed inspection.
Await timers, data and font changes within setup. Do not depend on visiting an
earlier state. No declaration means one `default` state. An invalid declaration
or unknown `--states` name is inconclusive, never a silent default pass.
Use URL parameters for project-specific theme/data selection; the runner owns
viewport and device scale. Keep a component/state fixture on one page and mark
components with stable `data-component` names and IDs for baseline selectors.

Run `node "<skill-folder>/../../scripts/visual-check.mjs" --url <URL> --sizes 1280x800 --scales 1`.
Add scale 2 only for a named raster, hairline or icon-ink risk.
It opens Chrome once, loads once per viewport/scale, then applies each selected
state to every selected inspector. Defaults are clip, spacing, visibility,
alignment and style; request motion with `--inspectors` when needed. Rerun only
affected states with `--states menu-open`. `--png` makes one annotated contact
sheet with numbered boxes and measured/expected legends. Without it, captures
for ink and pixel measurement stay in memory. Reports and sheets default to OS
temp. See visual checks for baseline and exit contracts.

Mockups compose golden component markup, token styles and behaviour. The style
lint rejects ad-hoc component CSS: raw colours, dimensions, radii, shadows and
durations, off-scale gaps, changed-root rem sizing and `transition: all`.
Tokens belong in token declarations; do not rename an ad-hoc component override
as a token to evade review. Existing toolbox style debt is inventoried separately
and ratcheted by value and count; it is not a clean style pass.

The builder never grades its own output. Review seats see the shared scripts'
renders and measurements, not only code. Visual craft owns deterministic
findings; Fidelity compares reference/baseline pairs independently using the
fixed rubric; Content stress exercises all data modes; Motion reviews frame
strips and cause/effect; Accessibility retains its keyboard and semantics remit.

## Borrowed practices and attribution

Selected practices and rule logic adapted from Paul Bakaus's
[Impeccable](https://github.com/pbakaus/impeccable), **Apache-2.0**, pinned to
`924bbd194d02e5e15a227e75b5901fb0d7a4ecad` (read 8 November 2026).
Copyright 2025 Paul Bakaus. The complete upstream licence is retained in
[IMPECCABLE-LICENSE.txt](IMPECCABLE-LICENSE.txt).

Files adapted: `PRODUCT.md`, `DESIGN.md`, `skill/reference/init.md` and
`document.md` inform the [brief](../../docs/design-toolbox/design-brief.md); `bolder.md`, `quieter.md`,
`polish.md`, `typeset.md`, `layout.md`, `colorize.md`, `delight.md`, `distill.md`,
`clarify.md`, `harden.md`, `critique.md` and `audit.md` inform the
[feedback vocabulary](../../docs/design-toolbox/feedback-vocabulary.md). These are rewritten in jig's
words with confirmed/open distinctions, linked authoritative tokens, explicit
desktop/input/density context, curated taste reactions, scoped guardrails and
the person's tweak-bar requirement. No commands or interviews are installed.

`crates/core/src/checks/rules.rs` (`is_card_like_from_props`, `check_icon_tile`,
glow gates), `css_scan.rs` (radial halo), `measures.rs` (radial spotlight),
`crates/html/src/page.rs` (nested-card traversal) and `adapters.rs` (icon-tile
measurements) inform `<skill-folder>/../../scripts/design-inspector.mjs` and its replay fixtures.
Changes: JavaScript reimplementation over jig's measured snapshots, all findings
advisory, exact-rule waivers and intentional-theme records, functional
selection/focus exclusions, no palette bans. The
[inspector contract](../../docs/design-toolbox/design-inspector.md) records thresholds and narrower
coverage; no full-engine parity is claimed. Third-party source was research
data; no upstream code, installer, hooks, CLI or dependencies were executed.

There is no repository NOTICE file. Upstream `NOTICE.md` was inspected: it
credits platform-design-skills for `ios.md` and `android.md`; neither is adapted
here, so that unrelated notice is not redistributed. The original copyright
and Apache licence are retained above and with the adapted inspector.

Adapted in our own words from Emil Kowalski's MIT-licensed
[skills](https://github.com/emilkowalski/skills): emil-design-eng,
review-animations (including STANDARDS.md), choreograph,
find-animation-opportunities, break-ui, and prototype (including PICKER.md).
Second round: [animate](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animate/SKILL.md)
(including [RECIPES.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animate/RECIPES.md)),
[animation-vocabulary](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-vocabulary/SKILL.md),
[apple-design](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md),
[pick-ui-library](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/pick-ui-library/SKILL.md),
[improve-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/improve-animations/SKILL.md)
(including AUDIT.md and PLAN-TEMPLATE.md),
[remove-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/remove-animations/SKILL.md),
and [animation-performance](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-performance/SKILL.md).
All seven were read at revision `c8a79627b59d72d764d6ab6f2c87c09a48169833`,
including every supporting file listed by that revision's repository tree.
Raw files read 8 November 2026; nothing installed. Source-specific rules are
linked above and in the mockup skill. The prototype picker informs full-size,
instant switching; its fixed styling, copied wiring and width animation are
not adopted. Local motion decisions and the coordinator's read-only draft were
consulted; project names and private paths stay out of the reusable contract.

Not borrowed: ui-ux-pro-max-skill (large generic catalogues, unsourced rules); motion-canvas and the video skills (video, not interface motion); Infrasity animation-principles (unsourced, ease-in exits).

Second-round omissions: none of the seven skills omitted; skipped animate's marketing/hold/drag recipes and height/400 ms toast exceptions (scope and local budgets), vocabulary's verbatim-copy rule (own words), Apple's assets/glass mandate/bounce/physics constants/audio-haptics (project identity, restraint and no device work), picker's fixed dependency roster (project picks win), improve's agent/model dispatch and plan-approval workflow (bounded existing round), remove's blanket keyboard/loop cuts (local decisions win), and performance's guaranteed-acceleration/shadow-swap claims (must profile).

MIT notice, retained from the source [LICENSE](https://raw.githubusercontent.com/emilkowalski/skills/main/LICENSE):

```text
MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
