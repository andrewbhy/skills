# Golden components (draft)

Open [index.html](index.html) directly from disk. This is the shared reference for
generic interface primitives: copy its markup instead of redrawing controls.
The page uses the jig header and breadcrumb; component colours, geometry,
typography and motion come from the toolbox tokens. White board is the initial
pack; the picker loads each of the seven active packs' `theme.css` files.

Find this reference under **Look and choose** on the [toolbox home](../index.html).
For the person-facing explanation and a real focus finding, read the rendered
[component checklist](../guides/component-checklist.html).

The examples are dependency-free reference compositions. A project should use its
chosen mature accessibility library for production menus, tabs and dialogs, then
apply these classes and token roles without losing that library's behaviour.
This reference is a draft until visual and assistive-technology checks pass.

## What to copy

| Component | Use and contract |
|---|---|
| Buttons | Primary for the main action, secondary for alternatives, quiet for attached controls, destructive for deletion. Icon buttons require an accessible name. Compact, standard and coarse sizes use target tokens. Icon plus label is the normal action treatment. Loading keeps a clock and word; busy actions suppress repeat activation. |
| Chips and badges | Informational status, hugging icon plus word: Ready, Working, Needs you, Complete, Error, Outdated. Outdated has a history icon and dashed edge. These are passive, so have no interactive states; use a button if a person can act. |
| Inputs | Native text, textarea, select, checkbox, radio, switch and search. Keep labels, help and associated error text. Selected choices use native checked state. Search has a named clear control that returns focus to the field. |
| Tabs | Switch related panels; roving focus, arrows, Home and End. The selected tab uses the panel surface. The separately labelled state specimens are buttons, not extra tabs in the live tablist. |
| Segmented control | Mutually exclusive view options, exposed as pressed buttons. The live example records the density choice in an output; it does not restyle the state gallery. |
| Panel | Title, count and one quiet collapse button in the fixed end column. A collapsed strip keeps the identical header. The full title remains available in row details. |
| List and queue rows | Leading type icon, clamped title, optional meta, status chip. List titles use one line; queue titles use two. Selected rows use a background and edge, with `aria-pressed`; there is no floating Selected label. Activate to read the full title/path. |
| Context menu | Icon, label, shortcut hint, separator and destructive action. Open the live example by button or context-click. Arrows, Home/End, Escape, Tab and outside pointer dismissal are implemented. The hints are illustrative; global shortcuts are not bound. |
| Tooltip | Supplementary detail on hover/focus, with Escape dismissal. The trigger has its own name. The pinned visible specimen shows placement without requiring a hover. |
| Dialog | Native modal dialog with a title, description, initial focus and close button. Escape and a backdrop click fade out and return focus to the opener. Closed and closing states are described alongside the open composition; use the live example to exercise them. |
| Toast | Persistent feedback with Undo and a named dismiss button. A durable output records Undo; no timed dismissal. Closing returns focus to Show toast if the person was inside it. |
| Empty state | Explain the absence and give one useful next action. The standalone creation action is a local receipt, not a data editor. |
| Scrollbar and divider | Thin token-coloured thumb, invisible track, stronger on capable-pointer hover; divider uses the same boundary rhythm. |
| Progress | Four visual segments plus exact N of M, including complete, loading, error and empty. Loading omits `aria-valuenow`. Data-mode zero work reads 0 of 0, with an ARIA range of 0–1 and a value of 0 to keep the range ordered. |

Each component section states its Craft basics rule and lists its tokens in an
expandable disclosure, including shared layout and typography roles.
The labelled state specimens use `data-state` to pin comparison appearances.
Do not copy that attribute for hover, active or focus into an application: use
native pseudoclasses and real checked/selected/disabled/busy state. Focus
specimens remain focusable; disabled examples use the native attribute. An
application copying loading markup must also copy the repeated-action guard.
Passive components intentionally have no invented hover/disabled/loading states.

## Using the reference in a mockup

Copy the appropriate markup, its SVG symbols and the behaviour the mock needs
from [index.html](index.html). Keep the single consistent outline icon set
defined there; the simple symbol geometry was authored for this reference.
Replace every `data-ledger` with the mockup's own purpose IDs. Keep labels, ARIA
references and unique IDs when copying several instances.

Link stylesheets in this order (adjust paths to the mock's location):

```html
<link rel="stylesheet" href="themes/white-board/theme.css">
<link rel="stylesheet" href="motion-lab/tokens.css">
<link rel="stylesheet" href="components/components.css">
<main class="gc">
  <button type="button" class="gc-button gc-button--primary">Save</button>
</main>
```

Copy `typography/type.css` along with a theme pack: its import is a shared
dependency. Use `jig-pages.css` for a toolbox document's page chrome, as this
reference does. Components use a `.gc` root; standalone classes such as
`.gc-button` can be composed inside it. Keep component insets smaller than
section gaps, use theme semantic roles, and add project-specific components on
top. No project-specific cards belong in this folder.

`components.css` introduces no custom-property definitions or literal colours,
lengths, radii, shadows or durations. Zero resets, full extents (`100%`), grid
counts, line clamps and token multipliers express layout rather than new scale
values. `transparent` and `currentColor` express inherited/absent paint. Motion
uses the shared lab duration/easing tokens, all below 300 ms. Only opacity and
colour change here; no perpetual loading animation. Hover is gated by both hover
and fine-pointer capability. Reduced motion explicitly restores gentle opacity
and colour transitions after the theme's blanket reset, with no travel.

Demo / Worst case / Empty / One / Many updates existing text slots, visibility,
progress and accessible values. It never inserts markup or writes CSS. Many
shows 32 pre-existing rows. Worst case includes a Korean/long title, a long
unbreakable path, a billion-item count, exactly 1 item and 0 items, and missing
optional metadata. No placeholder dash is inserted for missing fields. Empty
and One omit optional metadata too. Inputs and static state specimens keep their
own demonstration values; the switch controls the shared item data only.

## Static checks

From the repository root:

```text
node docs/design-toolbox/components/check-components.mjs
node scripts/mockup-check.mjs docs/design-toolbox/components/index.html --ledger docs/design-toolbox/components/README.md --tokens docs/design-toolbox/jig-pages.css --tokens docs/design-toolbox/typography/type.css --tokens docs/design-toolbox/themes/white-board/theme.css --tokens docs/design-toolbox/motion-lab/tokens.css
```

The component checker has no dependencies and launches no browser. It checks the
fixed state inventory independently of the page's embedded manifest, token
existence and transitive resolution in all seven packs, literal colours and
dimensions, token-based radius/shadow/type, accessible names and label references,
hover gating, explicit animation properties, general UI durations and every
data-mode plural. It executes the actual inline controller in a small source-DOM
replay for data modes, clear, collapse, tabs, density, dialog exits/focus return,
menu keyboard/outside dismissal, toast Undo/focus return and theme links. It also
runs `mockup-check` programmatically. Exit 0 means passed; exit 1 reports an
assertion/error. The standalone mockup checker keeps its own 0/1/2 contract.

The page chrome stylesheet is supplied as an authoritative token/chrome source
to the generic checker. Its established literal page colours are outside the
component token contract; `components.css` is always checked as component CSS.
Imported typography is supplied explicitly so it is covered as a token source.
Checks are source checks, not CSS cascade or accessibility certification.

## Purpose ledger

| ID | Purpose |
|---|---|
| chrome | Document identity, breadcrumb, navigation context, symbol definitions and verification limits. |
| controls | Choose theme/data and navigate the reference without changing component structure. |
| buttons | Compare action hierarchy, target sizes and every interactive button state. |
| badges | Recognise status through both icon and word. |
| inputs | Label and operate native fields, choices and validation feedback. |
| tabs | Switch panels and mutually exclusive options with predictable focus. |
| panels | Keep a stable header and one predictable collapse control. |
| rows | Scan, select and open items with overflow and optional metadata. |
| menus | Choose contextual actions and leave the overlay. |
| tooltips | Read supplementary descriptions without losing trigger identity. |
| dialogs | Read full details in a modal and leave by three routes. |
| toasts | Notice an action, undo it and retain a receipt. |
| utilities | Handle absence, long scrollable lists and separation consistently. |
| progress | See exact and visual completion, including zero work. |
| site-shell | Show where this page sits in jig and lead back to the design toolbox. |
| window | Keep the working document inside a fixed application window. |
| app-toolbar | Reach local commands with roving keyboard focus. |
| explorer | Navigate the file hierarchy and component catalogue. |
| editor-tabs | Select, close and recover open views. |
| app-breadcrumbs | Locate the selected file in its hierarchy. |
| app-grid | Sort, select, resize and reorder local file records. |
| app-table | Compare recent changes with associated column headers. |
| app-splitter | Resize the explorer and grid column with pointer or arrows. |
| inspector | Edit properties while retaining the current draft. |
| app-status | Keep selection counts and local action receipts visible. |
| popover | Reveal view settings only on request. |
| dropdown | Choose alternatives to the primary create action. |
| split-button | Keep primary and alternative actions attached. |
| combobox | Filter owners without moving the typing anchor. |
| slider | Adjust a continuous preview value with an exact output. |
| number-input | Enter and validate an exact number of copies. |
| accordion | Reveal grouped properties without animating height. |
| disclosure | Read optional keyboard help. |
| avatar | Recognise the owner, including unknown ownership. |
| count-badge | Read an exact count including zero and huge totals. |
| kbd | Learn a bound keyboard command. |
| command-palette | Find and run local commands by keyboard. |
| inline-alert | Notice a local condition beside its context. |
| banner | Understand the scope of the local sample. |
| skeleton | Recognise loading structure without invented progress. |
| toggle-group | Choose exactly one view mode. |
| tag-input | Add, remove and undo local labels. |
| app-link | Reach the component checklist. |
| code-block | Read and copy preformatted sample content. |
| drag-handle | Reorder files with a visible drop target or Alt arrows. |
| replay | Replay the current component's state change explicitly. |
| sample-playback | Play, pause, replay and reset the opt-in scenario. |

## Verification and remaining visual work

This is a static reference prototype, with local demonstration interactions.
No production library integration, backend, storage or execution is implied.

Pending visual checks: all seven packs at narrow/wide sizes and realistic
density; text/control/focus contrast in actual component combinations; hover,
press and disabled distinction; title clamping and Korean fonts; huge counts
beside panel controls; fixed collapse placement; tooltip collision/zoom;
scrollbar appearance on both platforms; modal backdrop and focus ring clipping;
toast announcements; motion on enter/exit and reduced motion after theme swaps.
Check keyboard, screen-reader names/announcements, native radio/select behaviour,
modal focus containment and focus restoration in a real browser. The lightweight
replay cannot prove any of these. macOS is not tested. No browser or provider
session is launched by these commands. No independent agent review is claimed.

All work is uncommitted. Changes are confined to this folder. Skill telemetry
and external evidence writes are omitted to respect that boundary.

Windows verification at base revision `3bde51f`, Node 24.22.2, using
`jig-verify` 0.1.0: the component checker passes 27 component contracts / 129 state
requirements, all seven packs and five modes, controller replay and 11 in-memory
defect seeds rejected for their intended reasons; clean sources pass again.
The standalone `scripts/mockup-check.mjs` command above also passes.

The skill's budget wrapper was tried from this folder with
`node ../../../skills/jig-verify/test-budget.mjs -- node check-components.mjs`.
It ran the checker successfully in about 1.2 seconds against a 10-second budget,
but the wrapper reports failure because its `*.test.*` inventory discovers zero
tests: this deliverable is a standalone check command. No discovery configuration
was changed to work around that limitation. No full repository suite was run;
the task is folder-scoped and other work is in progress.

## Follow-up: focus and role feedback, 8 November 2026

The coordinator found that the page loaded about 5,700 px down at the dialog's
Close button. There is now no autofocus attribute anywhere on this page. The
controller moves focus to Close only after `showModal()` in response to opening;
all three dismissal routes restore focus to the opener. Initial source/controller
checks pass; real browser scroll position and native modal behaviour remain
untested under the person's no-browser instruction.

Primary hover and press use the pack's blue-family step 10 (the family slot
holds each pack's action hue, including purple or cyan). Destructive hover and
press use red-family steps 3 and 4 with error ink and border. Generic neutral
feedback cannot override those roles; disabled still takes precedence. All paint
comes from existing pack tokens. The ordered source-rule check covers native
and pinned states and verifies role hue and label contrast in all seven packs,
including Clarity's 7:1 label target. It is deliberately a small selector subset,
not a browser CSS cascade implementation.

`check-toolbox.mjs` now includes the component checker. It passes 27 contracts,
129 state requirements, seven packs, five data modes, controller replay and
16 in-memory defect seeds, including load focus and both grey-role regressions.
The new checks failed on the original autofocus and grey-primary defects before
the fixes passed. The theme preview copies these button specimens and loads
the shared component and motion styles in each comparison frame. Existing board
and domain compositions are still a theme prototype; they are not new golden
components. Visual, assistive-technology and macOS checks remain pending.
