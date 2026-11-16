# Design toolbox (draft)

## Shared page shell

Every toolbox HTML document, including generator templates and the historical
logo candidates page, uses [page-shell.mjs](page-shell.mjs): the chosen 23 px
red 지 tile, outlined Stardos Stencil wordmark, breadcrumb, `jig-pages.css`,
`grid/tokens.css` and `data-grid` on the body. See the
[asset decision and licence](logo/final/README.md). The header has a light
ground so its red tile and charcoal wordmark stay visible in theme demos.

Generators call `pageShell(html, toolboxRelativePath, title)` before writing.
For a hand-written page, run `node docs/design-toolbox/page-shell.mjs --write`
then regenerate guides and gallery. `node docs/design-toolbox/check-page-shell.mjs`
checks every HTML page recursively; `tests/page-shell.test.mjs` proves rejection
of missing imports, drifted branding and the provisional mark. This is a source
contract, not visual acceptance. Keep `logo/logo.html` as historical candidates.

Mockups use the [grid guide](grid/index.html), [tokens](grid/tokens.css),
[primitives](grid/primitives.css), a project `grid.config.json`, and the shared
token/style and rendered alignment/clip/reflow checks. The
[worked example](grid/example.html) has exact container-width controls for
420, 760, 1100, 1440 and 1920 px. Browser verification remains separate.

Status: draft from the person's direction, 7 Nov 2026. The toolbox is what a project builds its interface with; `jig-mockup` is how a design round runs. Both are refined from a consuming project's design rounds before the skill is built.

Open [the toolbox home](index.html) to look and choose: palettes, themes,
typography, logo, motion timing and [Golden components](components/).
Agent tooling is showcased below those choices. Its eight readable HTML guides
explain the benefit, when each tool runs, the skills that use it and a finding
or worked example. Markdown here remains the source of rules; regenerate those views with
`node the guide builder (available in the full source checkout)` and check drift with `--check`.

Name an effect with the [motion vocabulary](motion-vocabulary.md), then build
ordinary controls from the shared [motion recipes](motion-recipes.md).
Use the [feedback vocabulary](feedback-vocabulary.md) for scoped steering words,
the [structured brief](design-brief.md) for product, desktop and taste context,
and the [advisory inspector](design-inspector.md) for selected composition warnings.

Use the offline [grid system guide](grid/index.html) for the spacing scale,
layout primitives, responsive regions and proximity examples.

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

## Decisions (person, 7 Nov 2026)

1. **Generated images stay, as an optional first step** for choosing an arrangement. They are kept as documents in the project's repository with their prompts and provenance (for example, under `docs/design/directions/`), not in jig.
2. **The ledger check is strict, at component level** (coordinator's decision, delegated by the person). Every component region in a mock or golden example carries a `data-ledger="<id>"` attribute; the check fails when a region has no ID or an ID has no entry in the project's purpose ledger. Text spans and decorative wrappers inside a component are exempt. This turns "every element earns its place" from a review habit into a gate.
3. **The mock starter is extracted from a consuming project's mock and reviewed,** after its round 4 and look round settle, not written from scratch.
4. **A few starter themes ship with the toolbox,** as token sets: calm ones and a few funky ones in the spirit of vivid VS Code themes. They are informed by a study of the trend articles the person shared. A project picks and adapts; themes are options, not defaults.

## Parts

| Part | What |
|---|---|
| Parts catalogue | Interface libraries by kind (primitives, kits, single components, docking, canvas), each with licence, version and date checked, fit notes, when to use, what to avoid. Refreshed by research; first pass came from a consuming project's catalogue task. |
| Foundation templates | Starters for the purpose ledger, principles, semantic tokens and glossary. |
| Mock starter | A no-dependency HTML shell: application frame, docking panes, canvas with zoom, theme switcher driven by tokens, scripted-scenario player. |
| Starter themes | Token sets: calm and funky. Each meets contrast requirements and shows state with words and shapes, not colour alone. |
| Checks | `jig-verify` visual clip and motion; a token check (no raw colours or sizes outside token files); the ledger check. |
| References | Inspiration by role, trend notes, anti-patterns (effects libraries, website feel in an application). |
| Per-project picks | Chosen parts, theme and overrides, recorded in the project's config or an ADR; `jig-build` uses only the picks. |

## `jig-mockup`, staged jobs

1. Look: one screen, five key components and two or three reference-anchored static directions, in a 30–45 minute job. Coordinator rubric review precedes the person's choice.
2. Key components: the same five, the chosen direction, all their states and one motion, in about 45 minutes. Shared look and rendered-visibility checks plus independent reference review precede the person's yes/no and notes.
3. Coverage: batches of about five components, about 30 minutes per job. Shared checks and approved-baseline comparisons gate every batch. The person sees choices or the end.

Each job has a fixed deadline and returns one contact sheet plus at most three
questions. Two failures at the same gate stop the ladder for a re-plan. Keep /
Fix / Strong objection notes and gate attempts travel into the next brief.
Ledger entries precede new markup. Fidelity, coverage and cost grow only after
the previous gate passes. The person chooses and vetoes; the gates catch defects.

Job-authored checks are evidence, not acceptance: use a shared harness revision
fixed before the round, which the job cannot edit. Build loops measure one size
and theme to JSON with no saved images. Checkpoints use one contact sheet, the
only image the reviewer reads per batch. Final checks measure the full matrix
and capture only failures. Rerun only states touched by a fix. Raw evidence lives
outside the repo in OS temp or external jig-scratch; keep a short summary here.
Show assets on intended grounds, or label them **not for this ground**.

Stage 0 comes before HTML for a new look with an authorized image tool:
explore at least twelve structural directions, edit picked bases to refine,
compare styles on one screen/content, then render the set in the picked style.
See the image-round guide for
timeboxes, the plan template and provenance/gallery checker. Without an image
tool, disclose the gap and start stage 1. Rapid person-requested HTML feedback
loops are a marked draft exception for labelled drafts; full independent gates
and mockup-present still apply to the accepted version.

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

## Avoiding the cookie-cutter look

Libraries supply behaviour, not identity. Identity comes from the layers a project owns, and each project's design brief must define them before the look round:

- **Signature moments:** the two or three interactions only this product has (for example: a living canvas, related objects appearing, live output, attention callouts). These get the most design care and are never built from a kit's defaults.
- **A visual language beyond colour:** type pairing and scale, icon set, shape language per node or object type, border and corner treatment, focus style, density, and a motion signature (for example, settling springs). Restyling only colours on a kit leaves it looking like the kit.
- **Voice:** the project's own words from its glossary, in labels, empty states and errors.
- **Three adjectives and references** the look must earn, chosen by the person, and anti-references it must not resemble.

Familiar patterns stay familiar: where users already know a pattern from tools they use daily (a composer toolbar with model and context, a command palette, editor tabs), follow it. Identity is spent on signature moments, not on reinventing standard controls. Rules: a kit's default styling is never shipped; every borrowed component is restyled through the project's tokens, including radius, borders, spacing and focus, not only colour. Review asks of each screen: could this be mistaken for a default kit or another product? If yes, it goes back. Starter themes are starting points to adapt, never a finished identity.

## Theme feedback and theme packs (person, 7 Nov 2026)

- **Calm workbench:** liked; the likely default light theme.
- **Night:** a dark theme is needed, but this one is off: light blue text on dark blue has too little felt contrast even where the ratio passes. Text must be neutral (near white or warm grey); blue only for accents and selection.
- **Neon synth:** on the right track but too purple. Try a dark blue base with neon green as the main accent and purple or pink as a secondary accent.
- **Signal pop:** not liked; drop it.
- **Warm studio:** no comment yet.
- **Themes are packs anyone can add.** A theme pack is one folder: a CSS file setting every token, and a small manifest (name, light or dark, author, licence, version). The theme check (contrast, every token present, no unknown tokens) runs on any pack before it can be used, and a failing pack is refused with the reasons. A project lists its available packs; the person can add their own. Importing a VS Code colour theme into a pack is a later idea.

## How design decisions are made (person, 7 Nov 2026)

Design decisions default to published research and established guidelines (platform design guidelines, accessibility standards, visualisation and perception research), cited with each decision. An agent reviews design documents against those sources in place of an expert. The person judges working mocks and side-by-side samples; their reactions inform decisions, and a strong objection overrides the evidence and is recorded with its reason. People are not asked to review design documents.

## Craft basics the reviewer checks before the person sees anything (person, 7 Nov 2026)

Each rule below was caught by the person in a consuming project's mock rounds, after it should have been caught by the agents. `jig-mockup` checks every one before a mock reaches the person, on screenshots, not from the code. When the person catches something new, it becomes a rule here (feedback becomes a check, not a one-off fix).

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

Briefs and motion ledgers use the [motion vocabulary](motion-vocabulary.md).
When the person describes an effect loosely, the coordinator replies with its
exact term and lab link before building. If no stage exists, disclose that gap
and agree a lab comparison. Ordinary components use the [motion recipes](motion-recipes.md)
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

## Application feel

Reference families for desktop application patterns:
[Blueprint](https://blueprintjs.com/),
[React Spectrum](https://react-spectrum.adobe.com/react-spectrum/),
[Fluent 2](https://fluent2.microsoft.design/),
[JetBrains Int UI](https://www.jetbrains.com/help/inside-intellij/), and
[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/).
These are pattern references, not a new project dependency choice.
The rules below adapt [apple-design](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md)
for this toolbox; no Apple assets, fonts or platform-specific control positions
are shipped. Existing project typography, tonal layers and timing win.

| Check | Rule | Source |
|---|---|---|
| **Immediate response** | A press acknowledges pointer-down; activation commits normally on release. Remove artificial waits from the input path and never disable input just because a transition is running. | [apple-design §1, §10](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md) |
| **Direct manipulation** | Dragged content tracks the pointer at its grab offset, with capture and cancellation. A release continues from the displayed position and velocity; snapping respects direction and intent. | [apple-design §2–6](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md) |
| **Continuous control** | Let a moving object be grabbed and redirected; do not jump to its logical target first. Gestures may need velocity-aware springs; ordinary controls use recipes and no visible overshoot. | [apple-design §3–4](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md), house-style limits |
| **Spatial memory** | Anchor a surface to its source and dismiss along its arrival path. Stable chrome and consistent control positions let people predict the next action. | [apple-design §7, §16](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md) |
| **Depth and focus** | Separate chrome, content and overlays by tonal layers. Scrims communicate modality; parallel panels preserve the working context. If transparency is chosen, provide solid/high-contrast alternatives and test legibility over actual content. | [apple-design §12, §14](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md), local tonal-layer adaptation |
| **Type works at reading size** | Choose weight, size and leading together; tune tracking per size, respect text scaling and test tall scripts. Keep the project's chosen face rather than borrowing Apple's fonts. | [apple-design §15](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md) |
| **Agency and wayfinding** | Make current location, next actions and exit clear; keep common actions close to their objects, advanced options one level deeper, labels specific, and mistakes recoverable through undo where possible. | [apple-design §16](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/apple-design/SKILL.md) |

### Picking a component library

Start with the behaviour needed and inspect the project's installed parts and
recorded picks. Reuse a suitable existing choice; do not churn a competitor
without an authorized migration. Prefer a mature accessible primitive for menus,
dialogs, focus, dismissal and keyboard behaviour, and a specialist for a specialist
job (toasts, numbers, virtualized lists). Use CSS for a simple fade; a spring or
layout requirement can justify the existing motion library. Recommend one fit
with a short reason, and say when the source list does not cover the task.
Source: [pick-ui-library](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/pick-ui-library/SKILL.md).

Project selection also records licence, version/date checked, stack fit, theme
and density control, accessibility evidence and maintenance cost (the existing
Parts catalogue contract). Those are jig's criteria, not claims from the source's
curated list. Library behaviour is retained while identity comes from project
tokens; an upstream favourite does not override the project's selection.

## Borrowed practices and attribution

Selected practices and rule logic adapted from Paul Bakaus's
[Impeccable](https://github.com/pbakaus/impeccable), **Apache-2.0**, pinned to
`924bbd194d02e5e15a227e75b5901fb0d7a4ecad` (read 8 November 2026).
Copyright 2025 Paul Bakaus. The complete upstream licence is retained in
[IMPECCABLE-LICENSE.txt](IMPECCABLE-LICENSE.txt).

Files adapted: `PRODUCT.md`, `DESIGN.md`, `skill/reference/init.md` and
`document.md` inform the [brief](design-brief.md); `bolder.md`, `quieter.md`,
`polish.md`, `typeset.md`, `layout.md`, `colorize.md`, `delight.md`, `distill.md`,
`clarify.md`, `harden.md`, `critique.md` and `audit.md` inform the
[feedback vocabulary](feedback-vocabulary.md). These are rewritten in jig's
words with confirmed/open distinctions, linked authoritative tokens, explicit
desktop/input/density context, curated taste reactions, scoped guardrails and
the person's tweak-bar requirement. No commands or interviews are installed.

`crates/core/src/checks/rules.rs` (`is_card_like_from_props`, `check_icon_tile`,
glow gates), `css_scan.rs` (radial halo), `measures.rs` (radial spotlight),
`crates/html/src/page.rs` (nested-card traversal) and `adapters.rs` (icon-tile
measurements) inform `scripts/design-inspector.mjs` and its replay fixtures.
Changes: JavaScript reimplementation over jig's measured snapshots, all findings
advisory, exact-rule waivers and intentional-theme records, functional
selection/focus exclusions, no palette bans. The
[inspector contract](design-inspector.md) records thresholds and narrower
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

## The toolbox is shared, not part of the mockup skill (person, 7 Nov 2026)

"The colour palette seems like a toolbox that exists within the design tools, and can be used for more than mock-ups." The design toolbox is a set of standalone tools that several skills and the person use; `jig-mockup` is one consumer, not the owner.

| Tool | What it does | Used by |
|---|---|---|
| Palette gallery (`themes/gallery/`) | Compare colour groups (harmonies, editor palettes, Wada) on a board fragment; shortlist picks | The person choosing a direction; theme building |
| Theme packs and builder (`themes/`, `palette.mjs`, `build-palettes.mjs`) | Generate a pack from a key colour and harmony: scales, roles, type tints, layers | Any project's real build (`jig-build`), mock-ups, golden examples |
| Theme checker (`check-themes.mjs`) | Contrast, layers, selection versus state, tint limits, harmony | `jig-verify` and `jig-review` on any interface change, CI |
| Theme preview and board (`themes/preview.html`) | See packs on a realistic map and queue | The person approving a theme on a real screen |
| Motion lab (`motion-lab/`, generic stages; projects add their own scenes) | Tune motion by feel against tokens: easing, arrivals, state changes, edge flow, dots, comet | The person; motion tokens for the build |
| Spacing and craft checks (mockup check script, spacing measurement) | Insets, gaps, text-character icons, token-only colours, hover and focus states | `jig-mockup`, `jig-verify` and `jig-review` on any interface |
| Craft basics and component checklist (this README) | The rules every interface is checked against | Every interface skill |

Each project copies or generates its own packs and records its picks; the tools stay generic.

## jig's own page style (person, 7 Nov 2026)

The person likes the palette gallery's style (themes/gallery/index.html) for jig's own pages: warm off-white page, large confident heading with one accent mark, plain-word lead line, small uppercase section labels, white cards with generous padding and quiet borders, swatch strips, a contrast mark per card. Use it as the house style for every toolbox page (home, themes preview, motion lab, results pages): extract its CSS into one shared stylesheet (docs/design-toolbox/jig-pages.css) and have each page use it, so they read as one product.

## Toolbox pages and typography (8 November 2026)

Open [the toolbox home](index.html) from disk. Every tool page uses the same
breadcrumb and provisional clamp-and-fence mark, with Design toolbox linking
back home. [Four logo candidates](logo/logo.html) show 16 px, 32 px and 48 px
marks on light and dark grounds, beside the unchanged gallery wordmark
(system font, 20 px, weight 800, tracking -0.7 px). The clamp-and-fence mark is
provisional; the person chooses the final mark.

House style lives in [jig-pages.css](jig-pages.css), extracted from the gallery.
Gallery-specific cards stay in `themes/gallery/gallery.css`; its build expands
the shared CSS and type tokens into the generated HTML, preserving standalone
viewing. Rebuild with `node docs/design-toolbox/themes/gallery/build.mjs`.
The theme preview applies house style to its header and view controls; the board
and component comparisons keep their semantic theme colours and geometry.

[Typography specimen](typography/index.html) and [type.css](typography/type.css)
are the shared type source. No downloads: Segoe UI on Windows, the system font
on macOS, with the matching local monospace stack. Theme packs import this file
and alias their font, text, weight and line tokens to it; themes select colour,
never a different font. Rebuild packs with
`node docs/design-toolbox/themes/build-palettes.mjs`.

| Shared step | Gallery values it replaces | Leading / tracking | Use |
|---|---|---|---|
| xs, 11 px | 10 and 11 px; tiny 8 px SVG navigation text | 1.6 / 1 px | Spaced labels and small notes |
| sm, 12 px | 12 px | 1.5 / 0.3 px | Metadata, queue rows, counters |
| body, 13 px | 13 px | 1.6 / normal | Body, controls, code |
| section, 15 px | 15 px | 1.4 / normal | Section headings |
| title, 16 px | 16 px | 1.4 / -0.3 px | Node and card titles |
| display, 30–54 px | Existing responsive display size | 1.08 / -2 px | Page titles |

Weights consolidate to 500 (reading), 650 (emphasis) and 800 (heavy).
Counters use tabular figures. The original 20 px wordmark is a deliberate
identity exception, with its exact original weight and tracking. The star
control remains a 25 px symbol, not a text scale step.

Visible changes from the original gallery: 10 px labels and 8/10 px miniature
board text now have an 11 px minimum; 600 weight becomes 650, default reading
weight becomes 500, and ad hoc line heights and tracking take the matched scale
values above. In particular, the lead paragraph is tighter and small labels may
occupy more space. The overall palette, card shapes and display title sizes stay
the same. Active pack section text changes from 14 to 15 px, application title
from 18 to 16 px, body/emphasis weights from 400/600 to 500/650, and line heights
follow the shared scale. This affects specimen text within boards as well as
chrome; the board's layout dimensions and theme colours are preserved.

The [generic motion lab](motion-lab/) copies and adapts the stage lifecycle,
replay, speed scheduler, spring and reduced-motion support from a local project
study. Only generic scenes ship here; projects keep their sessions, tickets and
hand-off scenes. [Extraction notes and attribution](motion-lab/README.md).

Static validation (no browser):

```text
node docs/design-toolbox/check-toolbox.mjs
node docs/design-toolbox/themes/gallery/check-gallery.mjs
node docs/design-toolbox/themes/build-palettes.mjs --check
node docs/design-toolbox/themes/check-themes.mjs
node --test docs/design-toolbox/themes/theme-pass7.test.mjs
```

These check breadcrumb destinations, script syntax, local home/CSS links,
logo/specimen coverage, generated drift, theme contrast and virtual-time motion
replay. The replay check compares final DOM facts and animation requests on
first, second and interrupted runs, including reduced motion. It does not prove
browser paint or visual replay consistency. Browser layout, text fitting,
keyboard behaviour, motion feel and final logo choice remain for visual review
and the person. No browser launched; macOS not tested. These pages and motion
scenes are design tools and prototypes, not application components.

## Visual state contract

Ship `data/states.json` with the token files and component/state/role token
bindings defined in [visual checks](../visual-checks.md#state-table-format).
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

Run `node scripts/visual-check.mjs --url <URL> --sizes 1280x800 --scales 1`.
Add scale 2 only for a named raster, hairline or icon-ink risk.
It opens Chrome once, loads once per viewport/scale, then applies each selected
state to every selected inspector. Defaults are clip, spacing, visibility,
alignment and style; request motion with `--inspectors` when needed. Rerun only
affected states with `--states menu-open`. `--png` makes one annotated contact
sheet with numbered boxes and measured/expected legends. Without it, captures
for ink and pixel measurement stay in memory. Reports and sheets default to OS
temp. See [visual checks](../visual-checks.md) for baseline and exit contracts.

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

## Change notes: motion names and reusable recipes, 8 November 2026

Added names for loosely described effects, eight shared control recipes, desktop
application rules, library-picking guidance and a fix-or-cut lab procedure.
Extended Emil Kowalski's MIT attribution. Recipes have browser-free checks;
rendered feel and fresh-provider scenarios remain pending. Sandbox skill edits
are handed off as a patch in `docs/results/`.

## Change notes: one visual run and separate review seats, 8 November 2026

The new visual runner checks declared page states in one Chrome session and
groups repeated findings by likely cause. A requested contact sheet numbers
the defects and explains each measurement. Layout and ink checks, approved
component baseline comparisons and a token-style lint share the report. UI
review now separates visual craft, fidelity, content stress and motion, with
accessibility retained. Skill installation and validation status are recorded
in the runner's implementation note under `docs/results/`.

## Change notes: staged mockups and cheaper checks, 8 November 2026

Mockups now have a small look probe before component and coverage jobs, with
independent gates and a two-failure stop. This catches a wrong direction before
a large build. Shared visual helpers default to JSON measurements in OS temp,
support named-state reruns, and save images only when requested; the rendered
visibility probe saves flagged crops. Checkpoints use one contact sheet rather
than thousands of screenshots. Invisible words and marks now have planted
fixtures. The sandbox prevents canonical skill writes; the staged skill and
generated-file patch is documented in `docs/results/2026-11-08-staged-mockups.md`.
Live browser checks, fresh-provider scenarios and macOS remain untested.

## Change notes: home and golden components, 8 November 2026

- The home starts with six visual choices, including Golden components. A
  compact agent-tool list follows, with plain benefits, timing, skill names and
  rendered guides. Motion lab explicitly says it is for timing, not a component
  library. Guides are generated from the existing Markdown sections, with
  Before / After / Why examples and source labels. Historical findings are
  credited to the person or coordinator; they are not claimed as automatic catches.
- The coordinator found Golden components loading about 5,700 px down because
  the dialog's Close button had autofocus. Removed that attribute; focus is set
  explicitly only after opening, then restored to the opener after dismissal.
- Primary and destructive hover/press feedback now uses a stronger step of its
  own colour family. Checks cover native and pinned states, disabled precedence
  and label contrast in all seven packs. Both original defects failed the new
  checks before the fixes passed.
- Generic primitives remain in jig. Project-specific cards belong in their
  project's repository and compose these primitives. Mockups copy the golden
  reference markup, token styles and required behaviour. The theme preview's
  action specimens now copy the golden buttons and share their styles rather
  than defining another button treatment.
- The spacing example and motion receipt example transcribe the read-only
  round-5 fix list (person's artifact-margin finding, 8 Nov; coordinator's
  receipt-before-arrival finding, 7 Nov). The examples preserve recorded fixes
  without claiming they have been implemented in another project's lab.

Windows validation, Node 24.22.2:

- `node docs/design-toolbox/check-toolbox.mjs` passes: 14 breadcrumb headers,
  six generated guides with source-drift and local-link/fragment checks, home
  ordering and inventory, escaped Markdown rendering, preview reuse checks,
  motion replay, and the component checker (27 contracts, 129 states, seven
  packs, five data modes and 16 rejected in-memory defect seeds).
- `node docs/design-toolbox/themes/gallery/check-gallery.mjs` passes after
  rebuilding its embedded shared stylesheet. All 72 tiles and generated source
  records remain consistent.
- `node docs/design-toolbox/themes/build-palettes.mjs --check`,
  `node docs/design-toolbox/themes/check-themes.mjs` and
  `node --test docs/design-toolbox/themes/theme-pass7.test.mjs` pass: seven packs,
  2,100 measured pairs and seven theme regression tests.
- `JIG_NO_BROWSER=1 npm test` passes: 108 passed, two live browser fixtures
  explicitly skipped. `git diff --check` passes.
- The `jig-verify/test-budget.mjs` wrapper, run from this folder with
  `-- node check-toolbox.mjs`, passes at about 2.1 seconds against 10 seconds.
  Seeded focus assertions compare identity without formatting the entire cyclic
  source-DOM fixture on failure, keeping the check small enough for that budget.

No browser, screenshots, provider sessions or independent agent processes were
launched. Layout, rendered hover, actual page-load scroll, keyboard/screen-reader
behaviour, motion feel and the person's judgement remain untested. macOS is not
tested. Golden components and the theme board remain reference prototypes.
Verification was sequential without an independent reviewer; telemetry and
evidence writes outside this folder were omitted to respect the task boundary.
Everything remains uncommitted.

Files changed in this pass: `index.html`, `jig-pages.css`, `README.md`,
`check-toolbox.mjs`, `build-guides.mjs`; the six generated HTML files in `guides/`;
`components/index.html`, `components/components.css`,
`components/check-components.mjs`, `components/README.md`;
`themes/preview.html` and regenerated `themes/gallery/index.html`.

## Change notes: borrowed practices, 8 November 2026

- **Motion basics:** added the gate, frequency tiers, two duration budgets,
  exact curves, removal/choreography rules, interruption, attention, theme and
  accessibility checks, and Before / After / Why review format beside Craft
  basics. Each rule names its source or local override. Attribution retains
  Emil Kowalski's complete MIT notice; the excluded sources are recorded above.
- **Motion tokens and lab:** CSS is the duration source, with reusable UI and
  explanatory tiers, strong enter/exit, movement and drawer curves, hover and
  constant tokens. General scenes stay under 300 ms and exits are faster;
  transfers use the explanatory tier. Reduced motion retains gentle fades,
  transfer objects are cleaned up, hover is pointer-gated, and the speed slider
  reaches 0.2× for 5× duration. Virtual-time checks cover real CSS aliases,
  curve selection, replay, interruption, reduced feedback and hidden-tab cleanup.
- **Mockup skill:** the requested five-mode data switch, schema-backed stress
  cases, Broken / Ugly / Fragile reports, named single-axis directions, full-size
  instant switching, and motion gate with 2–5 rejections are prepared in the
  skill and generated-contract patch (never committed). **Not
  installed:** this sandbox marks `.agents` read-only. The direct skill edit was
Repository-maintenance commands require the full jig source checkout.
  skill file. The patch was generated by syncing an isolated writable candidate;
  `git apply --check` passes. Apply it in a writable session, then rerun sync and
  the full suite. Existing metadata is unchanged, so the generated pointer does
  not change. The isolated copy remains in `motion-borrow-scratch/candidate/`:
  execution policy rejected cleanup of the verified scratch directory. It is
  disposable test evidence, not another source; remove `motion-borrow-scratch/`
  after applying/reviewing the patch in a session that permits cleanup.
- **Checks and scenarios:** the sync script now ships Motion basics and its
  attribution with the contract and detects drift. Its provider-wording check
  accepts the research path `review-animations` while still rejecting provider
  slash commands. New fixed scenarios in [mockup scenarios](../mockup-scenarios.md)
  cover all three skill additions. Fresh provider runs (loaded, outcome, planted
  defect caught and tokens) remain Not run and need the person's authorization
  before merge, as ADR 0001 requires. No provider sessions were started.

Windows checks: the isolated candidate's `JIG_NO_BROWSER=1 npm test` passes
108 tests with the two live browser fixtures explicitly skipped. The current
worktree's same command stops at generated-contract drift because the protected
file cannot be regenerated. Focused motion, mockup and generator tests pass;
seeded slow UI, ease-in and contract/licence drift fail for the intended reasons
and pass after restoration. Toolbox static checks, gallery checks, seven theme
tests, patch applicability and whitespace checks pass. Nothing installed or
committed; macOS not tested.

The test-budget wrapper executes the focused motion tests within its 10 s
budget, but its repository-wide inventory reports existing missing risk tags,
unsupported dynamic titles and fixture-string live markers, including duplicate
entries from the retained scratch copy. That policy report is not a clean pass;
unrelated test metadata was left alone.

Visual review remains pending for every item: table rules need evidence from
actual interactions; lab defaults and gentle fades need normal-speed, 2–5× and
frame review, replay/interruption and next-day inspection. Judge equal
noticeability in light and dark. After installing the skill patch, exercise its
switchers and all data modes at real/narrow widths and 200% zoom, checking text
fit, keyboard/focus retention and input during motion. No browser was launched;
the lab is a prototype, and local checks do not establish skill behaviour parity
or visual acceptance.
