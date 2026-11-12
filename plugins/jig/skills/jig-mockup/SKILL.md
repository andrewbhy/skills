---
name: "jig-mockup"
description: "Run staged interface mockup jobs: image exploration and picked-base refines before HTML, then reference-anchored look, key components and coverage batches. Use before UI implementation or to refine a design direction; not for production implementation or a palette-only edit."
---

# jig-mockup

Build one focused, throwaway stage per job. For HTML stages, read [toolbox.md](toolbox.md) in full:
its component checklist, Craft basics and Motion basics are the review contract. The
builder works without a browser; the coordinator routes visual review to a fresh accepting seat. A static
pass never substitutes for that review. Respect a no-browser request and hand
off an unverified draft to the coordinator, not to the person as a finished mock.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-mockup/telemetry.mjs" start "<project-root>" <provider>`;
retain the run ID (`off` means disabled). Read jig's [VERSION](VERSION).

Before work, read [missed-problems.md](missed-problems.md) and run
`node "${CLAUDE_PLUGIN_ROOT}/skills/jig-mockup/missed-problems.mjs" --area <area>` from the project root
for every affected area: design, runner, skills or "product slice". Read each
relevant incident; carry one brief line and the printed named check into this
job, then give the check an executable command or a review assertion and evidence.
Explain exclusions. Open repeats block the next round of that work until an
incident-linked rule review under docs/results/ explains what rule failed and
what changes. Missing history or unclassified legacy rows are evidence gaps,
never a clean history. Use jig-correct to record and classify new incidents;
update the same incident rather than duplicating it and preserve its source.

## Workflow gate (before any HTML)

No HTML mock starts until the person has agreed a workflow list: for each
task, its steps, decisions, entry and exit. Storyboard or low-fi wireframe one
workflow at a time. Every control in a mock names the workflow step it serves,
or it is cut or deferred. Future features appear only as labelled placeholders
until the core loop is accepted. Ask the person's environment up front
(monitors, resolution, OS scaling, window habits) and check those sizes,
including large, ultrawide and 4K, for target size and comfort, not only
overflow. Follow the stages below: divergent directions before HTML. Accept by
task walkthrough: the person, or a fresh reviewer acting as the person,
completes each workflow's steps on the mock. Proxy metrics (tokens, coverage,
overflow, fold, density) are supporting evidence only and never accept a mock.
Stop and re-plan with the person after two mock rounds that do not converge.

**Game and interactive UI.** The gate covers games too. Before any scene or UI
code, agree an interaction language: verbs, selection model, consistent
before/confirm/during/after feedback per action, what the board shows versus
the UI, and the feedback events. Derive it from proven genre conventions
studied as principles; do not invent it from scratch or copy any game's art
or content. Then storyboard one core loop (e.g. one turn) for the person to
react to. Accept by the person's walkthrough of that loop without reading
logs. Tests, balance and metrics never accept a player-facing prototype.
The artifacts for this gate (verbs, input map, flows, screen map, hierarchy,
top-task budgets) are defined and checked by jig-interaction; the gate requires them and the person's walkthrough.

**Vision unclear.** When the person cannot state a vision, do not ask for one.
Derive workflows from evidence of actual use (logs, data, history) or a
narrated session; draft, then let them correct; show two or three contrasting
low-fi directions to react to; ask pain-based questions ("what slows you
down?"); try small real changes in the live product as probes. Label every
decision provisional. The two-round stop rule applies.

## 1. Establish this round

Every round identifies itself as a mockup in its title or Intent. Require the
toolbox [grid tokens](../../docs/design-toolbox/grid/tokens.css) and
[layout primitives](../../docs/design-toolbox/grid/primitives.css), adapted
through the project's small grid configuration with a declared type scale.
Name those files and the token/style and rendered check commands in the round
brief itself; a linked plan alone is insufficient. Run brief-check before
building: missing grid inputs or check names refuse launch. Use the fixed
spacing scale, one panel inset, inner/outer proximity gaps, nested container
queries and the responsive region table for every stage, including look probes.
Do not invent a parallel spacing scale or shrink type to fit a narrow region.
For jig toolbox pages, generate the chosen brand and breadcrumb with its shared
page-shell helper; load jig-pages.css and grid tokens and run its shell check.
Paths, commands, widths and brand assets belong to project configuration and the
toolbox, never a copied project-specific shell in this skill.

Run ui-tokens-check.mjs and style-lint.mjs before rendering. For static mocks
the full `--gate` is opt-in: run `visual-check.mjs --blocking-only` (overlap,
clipping, unreadable or invisible content only) and leave alignment noise
unread unless the brief asks for it. For product builds the declared
visual-check.mjs gate includes alignment, clipping and 320 CSS px reflow at the
project's states and widths; source checks cannot prove those rendered results.
When browsers are forbidden, name these checks as pending and hand the draft
to the coordinator. Do not lower or claim the visual gate. See the toolbox
[grid guide](../../docs/design-toolbox/grid/index.html) and worked example.

Use the [structured brief](../../docs/design-toolbox/design-brief.md) with
confirmed product facts separate from open decisions, and normative token links
separate from explanatory design prose. Reuse PRODUCT.md / DESIGN.md or their
existing equivalents; do not copy tokens or repeat an answered interview. Record
desktop, input, density and shell constraints in the project brief/configuration.
Use the project's taste library: actual curated reference images with the
person's Love / Like / Not for me reactions, provenance and dated reasons.
Carry reference IDs, anti-references and scoped banned defaults into each job;
preserve approved palette, selection/focus semantics and documented exceptions.

Use the [feedback vocabulary](../../docs/design-toolbox/feedback-vocabulary.md)
for steering words. Before a job starts, the coordinator restates the target,
scoped change and what must stay intact. Critique is review; audit is evidence.
Neither authorizes unscoped edits or turns a clean detector into good design.

Read the project's rules and design inputs from its existing configuration or
brief. For HTML, require the design brief, purpose ledger, principles, semantic tokens,
available theme packs and their manifests, shape language and motion language.
For HTML, require the project's layout rules, glossary, output location, representative
screen sizes, zoom levels and theme-validation command. Keep project facts in
a small project configuration or round brief, never in this skill. Discover
existing paths first; if an input is missing or conflicts with another, stop the
dependent work and ask the person. Do not invent a design language, tokens or an
unapproved theme. A new motion moment needs a language decision before building.

Use the toolbox [motion vocabulary](../../docs/design-toolbox/motion-vocabulary.md)
in briefs and motion ledgers. When the person describes an effect loosely, the
coordinator replies with its exact term and lab link before building; if no
stage exists, name that gap and agree a lab comparison. Components use the
shared [motion recipes](../../docs/design-toolbox/motion-recipes.md), adapted
to project tokens and frequency decisions, rather than inventing motion per job.

State the goal and the person's moment for this round, the application context,
what must be noticed first, the sample scenario, and the previous dated Fix,
Keep and Strong objection entries. Preserve Keeps and carry all three categories into each stage brief. Establish
look before expanding fidelity or coverage. Compare theme looks on
the same layout and data. A pack preview's approval is provisional until tried
on the real mock with its semantic accent, selection and state roles applied.

For a new look or direction, run **stage 0 before any HTML** when an image tool
is authorized. Read [image-rounds.md](image-rounds.md) and use the
[image-round plan template](templates/image-round-plan.md). Explore at least
twelve structurally different directions from goal-only briefs quoting the
person; refine by editing liked bases one change at a time; compare styles on
one screen/content; then render the whole set in the picked style. The person's
style pick and set verdict precede HTML. Keep layout/touch picks separately.
Stage 0 explores an undecided language; HTML requirements do not require
approved tokens or frozen layouts before image exploration. Keep prompts,
provenance, notes and galleries outside the repo in the run's scratch folder;
retain it until the pick. Images prove neither interaction nor motion. Without
an authorized image tool, disclose the gap and go straight to stage 1.
See Provider notes for current availability.

Choose the stage and record its deadline before building. Each stage is a
separate job with a hard timebox; stop at the deadline and hand back one contact
sheet, gate results and at most three questions for the person. If evidence is
missing, mark the draft unverified and keep the gate pending. The person chooses
and vetoes; gates catch defects without asking the person to act as QA.

| Stage | Hard timebox and scope | Gate before advancing |
|---|---|---|
| 0. Images | Separate jobs: explore about 60 minutes; refine about 45; style pick about 45; set render about 60-95. Images only, no HTML. | Explore: originality, structural comparison and the person's picks. Convergence: base comparison and fresh review; the person's style pick and set verdict before HTML. Requires an authorized image tool; otherwise disclose and start stage 1. |
| 1. Look | Choose 30–45 minutes in the brief. One screen, five key components, two or three reference-anchored directions. Static; no motion or full state coverage. | Fresh-seat rubric review against the actual references, complete foundations checklist, then the person picks a direction. |
| 2. Key components | About 45 minutes, fixed as a deadline in the brief. Chosen direction, the same five components, all their states and one motion. | Shared look-rule scripts including rendered visibility; independent rubric review against the reference (see Provider notes). Coordinator sends defects directly back as a fix job; only after these pass does the person give yes/no plus notes. |
| 3. Coverage | About 30 minutes per job, batches of about five components. | Shared scripts plus a diff against the approved baseline for every batch. A fresh seat checks intended changes and unexplained drift; the person sees only choices requiring a decision or the end. |

Stage 1 closes the Look foundations checklist in toolbox.md: font and type scale
with font customization; colour and accent range with presets and styles;
surfaces and contrast; one selection and focus rule; motion vocabulary per
interaction type; customization axes. Each needs a decision or a recorded
deferral with reason, owner and revisit point. Stage 2 cannot start with a
missing row. Carry deferred limits forward; stage 1 stays static.

Keep a per-round feedback.json beside the mockup, using the shipped
[record contract](missed-problems.md). Record every person item as Keep, Fix or
Strong objection, with their words, the artifact it was raised on, status
(open, fixed, verified), and evidence link. Preserve Keeps, never close one
artifact's feedback using another artifact. Only a fresh seat verifies closures;
its review message names the artifact and the exact item IDs it closes.

Fidelity, coverage and cost rise only after the preceding gate passes. Record
attempts against the same gate, including fix jobs: failing a gate twice, or two
mock rounds without convergence, stops
the ladder for a re-plan with the person. Never reset the count by renaming a
job. Keep / Fix / Strong objection feedback, reference links, chosen baseline,
remaining defects and the attempt count travel into the next job's brief.

## 2. Form follows moment: ledger before markup

Sections 2-5 govern HTML stages. Stage 0 follows the image-round guide instead;
it does not build markup, specimens or browser evidence.

For each element, write a stable ID, the question it answers, when the person
meets it, its quietest default form, what fails if removed, and its check. Build
only after the entry exists. Hidden, signal, summary, full is the order of
preference; a collapsed section still has to earn its place. Rare needs appear
on an event or on request, rather than occupying standing chrome. Judge the
person's task at that moment, not a screen showing every object at once.

Give every independently meaningful component region its own
`data-ledger="<id>"`, including generated markup, headers, rows, nodes, menus and
mock playback controls. IDs must resolve to entries. Inner text spans and
decorative wrappers inherit their component's purpose; they need no separate
entry. Use `data-component` on custom div-based regions so the static checker
recognises their boundary. Review the region inventory for unmarked divs.

A fact has one home; navigation references point to it. Show conclusions and
what needs the person. Logs and agent self-checks stay in files, reachable by
one named evidence link when useful. Plain text is deliberate reading content
(conversation, document, requested original output), not improvised metadata or
actions. Record exceptions in the ledger; mark reading regions with
`data-reading-content="true"` for the glyph lint. Never use that exemption on
icon spans or controls. Reconcile an explicit personal override with earlier
ledger rules instead of mechanically preserving a rule the person rejected.

## 3. Make decisions with evidence

For every design choice, record affected ledger IDs, decision, source link,
relevant guidance or familiar-pattern reference, date consulted, rationale and
limits. Read the published source; distinguish what it supports from your local
interpretation. Mark an unsupported choice **Unsourced — comparison needed**,
rather than dressing a preference as research. Review documents against sources
yourself; never ask the person to review design documents.

Follow familiar patterns for ordinary controls; spend identity on the project's
signature moments. Libraries supply behaviour, not identity. Use the project's
type, shape, spacing, surfaces, focus and motion language as well as its colours.
A strong objection from the person overrides the evidence: record the objection,
date, reason in their words (or reason not supplied), prior source and resulting
decision, and carry it forward. Do not silently erase the source or the override.

## 4. Build the playable sample

When comparing variants, name each by its direction (for example, Compact
queue), never "Option A". In stage 1, compare coherent reference-anchored looks
on the same layout and data; name the type, shape and surface choices each tests.
In later stages, isolate one comparison axis: layout, density, motion or
interaction model. Replace near duplicates before building. Use a labelled switcher to show one variant at full
size in its real surrounding context, with instant switching. Reserve
side-by-side comparisons for small pieces that remain at their real scale.
Keep the same data across variants. Every mockup, including the look stage,
includes the brief's standard tweak bar: theme, accent, radius, density, font,
surface contrast and header, plus Copy JSON. Use approved options only, disable
unavailable choices with reasons, and export versioned choice IDs for replay;
preserve draft, focus, selection and scroll. Keep this tooling outside the
product surface with its own ledger entry. See the brief for clipboard fallback
and the choice-record contract. Adapted from
[prototype](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/prototype/SKILL.md)
and its [PICKER.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/prototype/PICKER.md);
use project tokens for switcher chrome, not the source's fixed picker styling.

Use the project's existing reviewed starter when available. The toolbox starter
may still be pending extraction; disclose that rather than claiming one exists.
From stage 2, build a clickable HTML file that opens from disk with plain HTML/CSS/JavaScript,
no dependencies, build step, server, fetch or network. Local sibling token/theme
files are allowed; package them with it. Use only project tokens for colours,
sizes, spacing, typography and timing. Validate every offered pack with the
project's pack checker (complete tokens, no unknown tokens, contrast); refuse
a failing pack with its reasons. Never silently add a starter theme as a default.

From stage 2, provide a labelled, opt-in scripted sample, paused initially, with play, pause,
replay and reset. Use realistic volume and messy cases: long names, non-Latin
text, missing/unknown data, empty/error/loading/disabled states, bursts, arrivals
while typing, and content larger than its container. Do not invent unavailable
values, real progress or completed actions. Preserve draft, focus, scroll,
selection and the person's placement through arrivals, theme and view changes.
Mock actions state their local/sample consequence and start no real work.

From stage 2, every mockup includes a dev-only **Demo / Worst case / Empty / One / Many**
data switch. Swap fixtures at the same data boundary; never hand-edit markup,
styles or component structure per mode. The same renderer handles every mode,
including data-driven empty states. Map each rendered field to its schema/API
limit and optionality; mark missing limits as unbounded rather than inventing
them. Use schema-backed long titles, unbreakable paths, realistic huge numbers,
counts of 0 and exactly 1 (catch "1 decisions"), and missing optional fields.
One contains one item and singular counts; Many uses the supported upper volume.
During builds measure the selected one size and theme. At final coverage, check
every mode at the real container width, a narrow width and 200% zoom;
record the project-specific widths in the round brief. Zoom and width are review
conditions, not changes to the fixture or markup. Adapted from
[break-ui](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/break-ui/SKILL.md).

Before adding motion, record the four-question gate for every candidate:
frequency, purpose (including whether it helps the task), easing and speed.
Apply Motion basics and the project's language; frequent UI is not an excuse
for a slow sequence. List 2–5 rejected candidates with the gate question that
rejected each, using real elements rather than invented filler. This adapts
[find-animation-opportunities](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/find-animation-opportunities/SKILL.md)
(its function check is folded into purpose) and
[emil-design-eng](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md)
(explicit easing question). The person's recorded choices override source rules.

Stage 1 stays static. Stage 2 proves one eligible motion; stage 3 applies the
approved motion language as each batch is built, never in a later polish pass. Map every
autonomous appear, move, state change and departure to a named moment in the
project's motion language: trigger, source, destination, timing/easing token,
resting state and reduced-motion equivalent. A change with no motion is a
defect unless the gate rejects it or the reduced-motion path calls for stillness;
record that disposition rather than silently omitting it. Tie liveness to actual
scripted events; no ambient claims of activity. Never move the reading/typing
anchor or camera on its own. Movement explains cause and replaces labels that
merely narrate it; preserve the lasting fact in links, position, state and
receipts for reduced motion or someone who looked away. Include every moment within this stage in
the sample; a motion lab tunes it, not introduces it.

## 5. Self-check and independent acceptance

Every round ships a side-by-side compare page with the previous round and the accepted reference, scrolling together (person, 8 Nov 2026). Every fresh reviewer brief includes the person's own words from earlier rounds, the rejected and accepted references, and the open feedback ledger; a reviewer without them judges in the dark. The reviewer's verdict blocks only on what stops the person deciding: options that cannot be compared side by side, clipped or broken content, a broken Keep, and options meant to differ that look alike (look-alike options are a failed round, not a taste question). Polish is listed as notes and never blocks. Which option is better is taste and stays with the person (person, 8 Nov 2026).

The builder never grades its own output. The coordinator may triage findings but never accepts; acceptance needs a fresh seat distinct from builder and coordinator, seeing the rendered evidence and actual reference. Explaining a finding away as noise requires that fresh seat's agreement and a linked checker calibration item. Every UI seat sees the shared scripts' renders and measurements, not only code; a self-check is evidence, never independent acceptance. Keep Visual craft, Fidelity, Content stress, Motion and Accessibility catalogues separate. If independent context or rendered evidence is unavailable, leave that seat pending and name the gap.

Generate component specimens from shared templates and ship data/states.json
with each scope's component, state, text role and token bindings. Generate
markup and state declarations from that table; require stable data-component
markers. Prefer one component family per short slice, with its gate before the
next family. Keep notes to decisions and commands.

Check in cost order: browser-free tokens; one-pass scoped geometry for static
specimens; cropped ink only for visibility/clipping candidates; then accepted
component baseline diffs. Actual focus, hover and open-menu changes retain
independent setup/reset. The default font gets all rules; other fonts reflow
settled state snapshots for overflow, clipping and state typography in parallel
pages of the same browser. Read budgets from project configuration, report
time per layer and slow states, and retain streamed partial evidence on timeout.
Use changed-file/component mappings for build reruns; a filtered gate never
claims complete acceptance. See the shared visual-checks guide for the table,
baseline and replay limits.

Compose reviewed golden component markup, token styles and behaviour. The shared style lint rejects ad-hoc component CSS; do not hide raw overrides in new tokens. Declare independent `window.jigStates` setup/reset entries as specified in toolbox.md. Run the shared `visual-check.mjs` on selected states; use its grouped report and one annotated checkpoint sheet for review. The shared visual-state scenarios extend this skill's fixed scenarios.

The shared `--gate` runs checksum-pinned Impeccable detection with telemetry off
and measured design rules; retain their advisory findings and execution gaps
in the same report. See [visual checks](../jig-verify/visual-checks.md).

Use the [advisory design inspector](../../docs/design-toolbox/design-inspector.md)
on measured selected states, or replay saved snapshots without a browser. Review
nested containers, stacked icon tiles and decorative glows against references;
carry each rule's target, evidence, explanation and disposition. Exact-rule
waivers and intentional theme glow keep their decision evidence. Warnings never
replace token, geometry, contrast or reference-review gates; report coverage gaps.

Job-authored checks are evidence, not acceptance. Before the round starts, the
coordinator records the shared harness revision and commands. Acceptance runs
those shared scripts; the job cannot edit them in that round. A harness defect
is a separate fix and review, not permission to weaken a gate around the sample.
This applies to look rules, visibility, ledger and geometry checks alike.

Run the shipped checker before handoff (paths are project facts):

```text
node "${CLAUDE_PLUGIN_ROOT}/skills/jig-mockup/scripts/mockup-check.mjs" mock.html --ledger purpose.md --tokens tokens.css --tokens themes/chosen/theme.css --json
```

Repeat for each available theme, passing that theme's authoritative token files.
Linked local CSS and inline styles/SVG colours are inspected; pass additional
unlinked CSS with repeated `--css` arguments. Ledger input is a Markdown table
with kebab-case IDs in the first column, or a JSON array exported from the real
ledger's IDs. Never invent entries merely to satisfy the check. Exit 0 means no
static findings; 1 means findings; 2 means invalid input or incomplete analysis.
Both findings and gaps need disposition before visual handoff.

The checker flags uncovered elements, regions without their own ledger ID,
unknown ledger IDs, text glyph icons (including numeric entities and CSS
content), raw colours/unknown token uses, and buttons without explicit hover and
focus styles. Write simple target selectors such as `.action:hover` and
`.action:focus-visible` for automatic coverage. Complex selectors need manual
review; a different button's style is not coverage. Custom div components must
be marked. It does not execute scripts, resolve the cascade or prove contrast,
layout, accessibility or motion. Generated DOM needs replay/exported markup
checked too; scripts creating markup are reported as a gap. Check scripted
states and token-based sizes/timing separately. Keep the limits in the report.

Before anything is shown to the person, write build.json, the complete shared
visual-check --gate report, fresh-seat-review.json, waivers.json and feedback.json
as defined in [missed-problems.md](missed-problems.md). Run
`node "${CLAUDE_PLUGIN_ROOT}/skills/jig-mockup/scripts/mockup-present.mjs" <round-folder>` and require
exit 0. Missing or stale review, incomplete visual coverage, findings without
fresh-seat waivers/calibration, or feedback awaiting verification block
presentation. A pending gate stays internal; never present a different artifact
as answering the original critique. This record check does not replace looking.

Give the coordinator the mock, ledger/decision and feedback records, static
results, scenario steps and the review matrix. Before anything reaches the
person, a fresh seat applies these checks within that stage's scope; full
coverage belongs to the final stage, not the look probe:

- Check every component against the toolbox checklist: default, hover, focus,
  active, disabled, loading, empty, error and overflow; all actions by keyboard
  with visible, retained focus; roles and accessible names; every theme with
  4.5:1 text and 3:1 controls/focus; realistic density; each motion moment and
  reduced motion; no accidental plain text; one consistent SVG icon set; attached
  controls sharing their host's shape, surface and rhythm; ledger purpose.
- Follow the screenshot budget: build loops measure element boxes and computed
  styles to JSON at one size and one theme; no PNGs. Rerun only named states
  touched by a fix (--states). At the look probe's end and each batch
  checkpoint, make one contact sheet; this is the only image the reviewer/model
  reads (one sheet per batch). Compare it with the reference and ledger using
  every applicable Craft basics row; record rule, state and pass/fail. A
  geometry pass cannot establish visual craft or fidelity.
- Final verification runs the declared matrix once, as measurements only.
  Each dimension (size, theme, density, scale, font, data mode) stays only while
  it names a risk the others miss: device scale 2 only for raster, hairline or
  icon-ink risk, and then only for the components carrying it (a separate
  `--scales 2` run scoped to them); data modes multiply only states that read
  data. A dimension asked for without a named risk is narrowed, with one line
  saying why, rather than run everywhere. Screenshot
  only failed states and consolidate them into
  the checkpoint sheet. Pixel/visibility probes may capture in memory, but
  persist only failures or the sheet. Keep raw evidence in the OS temp directory
  or an external jig-scratch directory, with only a short summary and links in the
  repo. Do not rerun the full matrix after each fix: rerun affected states, then
  the final matrix once stable. Explicit --png is for scoped captures only.
- Exercise Demo, Worst case, Empty, One and Many at the review widths and a 200%
  CSS text-scaling fixture (not native browser zoom). Themes are checked on the
  token layer, without a browser; the browser runs one theme, plus any theme
  whose tokens change geometry (size, spacing, font or border width).
  Report each break with field/value, state/width,
  severity and a concrete fix/location: **Broken** means unreadable content,
  unreachable action or incorrect data; **Ugly** means readable but visibly
  wrong; **Fragile** means a realistic next value will break it. List what held
  up as well. Fix findings within this round's scope and rerun affected modes,
  including Demo. Leave visual findings pending when a browser is forbidden.
  Source: [break-ui](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/break-ui/SKILL.md).
- Check **Motion basics** on recordings at normal speed, 2–5× duration and frame
  by frame, including interruption, replay, hidden tabs and reduced motion.
  Review again the next day; until then record that gap. Report motion findings
  as **Before | After | Why**, with exact tokens and the reason for each change.
  Sources: [review-animations](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/SKILL.md)
  and [choreograph](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/choreograph/SKILL.md).
- Measure computed insets on every header, row and node against project layout
  rules (one inset per container, explicit exceptions). Measure control and icon
  vertical centres against their text line, including header folds and menus;
  do not infer centring from flex declarations. Compare chrome geometry across
  zoom and state. Inspect text-hidden type/actor identity samples.
- Run shared look-rule, visibility, clip and applicable motion helpers through
  `jig-verify`; review the single sheet and motion replay at the checkpoint.
  Missing shared scripts leave their gate pending. On a pannable canvas, scope clip checks to
  individual nodes/frames and their content, not the whole world: intentional
  off-screen nodes are not clipping defects. Separately check viewport-edge
  markers, chrome and overlays for clipping. The current clip helper's `--root`
  selects content but still examines ancestors outside that root. Bring each
  inspected node fully into view; distinguish an intentional outer-viewport
  crop from clipping inside the node. If a helper cannot limit its clipping
  boundary, disclose that gap rather than declaring the canvas clean. Keep
  proposed helper improvements in the project's ideas list (jig uses
  `docs/ideas.md`); never claim an unbuilt automated check passed.
- Follow the machine resource guard: check free memory against its configured
  threshold before a browser; if insufficient, skip. One browser at a time,
  close promptly. Coordinate across sessions;
  do not start extra browser or agent processes independently. If browsers are
  forbidden or unavailable, report missing captures/measurements and leave
  visual review pending. Replays with approximate dimensions prove state or
  geometry contracts only, never rendered craft or perceived motion.

Fix failures and repeat affected checks. Leave acceptance pending while required
visual evidence is missing. Report inspected, executed and not-tested claims
separately; the skill grants no approval or merge authority.

## 6. Present and carry feedback

Stage 0 uses [the image presentation rules](image-rounds.md#review-and-presentation):
view every image beside its base before relaying picks, withhold stated-dislike
violations, then link absolute files grouped by screen kind and name known
defects. Image records use image-round-check, not the HTML presentation gate.

For HTML, only after a fresh seat accepts the stage gate and mockup-present passes, give the person one contact
sheet and at most three decision questions, with working mocks with the full-size
variant switcher; side-by-side is for small pieces at real scale. Use the same
content, one concrete question per sample. Keep design
documents and agent evidence out of that presentation. Show each asset only
on grounds where it is meant to be used, or label it **not for this ground**.
Never present an invisible or invalid combination as a supported example. Use a replayable motion
comparison when timing/causality is the question, not still images alone.

Record each reaction as **Fix**, **Keep** or **Strong objection**, with date,
round/sample/state, ledger IDs, the person's words, reason and resulting action.
Carry all entries into the next round's brief. A new craft catch by the person
becomes a general check in the toolbox Craft basics table, with its source; fix
the sample too. In an installed project without write access to the toolbox,
record the proposed rule and upstream handoff explicitly, never claim it landed.

Repeat rounds until the person accepts. Then rebuild golden examples in the real
stack on the project's selected parts, preserving keyboard/focus and
accessibility behaviour; hand accepted references to `jig-build`. Disposable
HTML is not production implementation. Report done, remaining and unverified,
including macOS until actually tested.

### Rapid mode - draft, explicit person-requested exception

The person: "we need early feedback from me in initial round, iterate fast for multiple feedback".
When the person asks for fast iteration on a taste question, use a draft loop:
first draft within about 20 minutes; coordinator quick checks for page errors,
clipping, contrast tokens and a look; then show it clearly labelled **Draft -
not accepted; full gate pending**, with known defects. Follow each round of notes
with a 10-15 minute scoped fix job and the same quick checks. Respect browser
restrictions and resource guards; disclose unrun quick checks on the draft.

This is an explicit, person-requested exception to section 6's rule that only a
fresh-seat-accepted, mockup-present-passing HTML artifact reaches the person.
Drafts are never accepted artifacts. Run the full existing gate once on the
version the person is ready to accept, including fresh-seat review and
mockup-present; changes afterwards require the applicable checks and review again.
Do not add a draft bypass to mockup-present. The stop rule is unchanged: two
failures at the same gate, including fix jobs, stop for a re-plan; renaming a
draft or job never resets the count.

Keep this section draft until the current HTML trial reports: actual loop
length, which quick checks were useful, and when to call the full gate. These
are open questions, not established timings or proven acceptance behaviour.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-mockup/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>`;
disclose marker failures.

## Provider notes

- **Codex:** use `codex` for telemetry. Read the canonical `.agents/skills/jig-mockup/`
  source. Stage 0 uses authorized image_gen today; let Codex invent explore
  directions. Pass picked bases for edits, never text-only refines. Observed
  outputs are about 1672 x 941 regardless of requested large-monitor size;
  dimensions vary, so inspect actual output and judge composition, not pixels.
  View every returned image and its base with view_image before relaying.
  For an authorized fresh-seat HTML review, open the one contact sheet with `view_image`.
  Stage 2 requires a Sonnet rubric review against the reference in a separate
  authorized session; if unavailable, leave that gate pending.
- **Claude Code:** use `claude` for telemetry. The generated
  `.claude/skills/jig-mockup/SKILL.md` points to this source; resolve supporting
  files here. Open the one contact sheet with `Read`. Stage 2 requires an independent Sonnet
  rubric review against the reference in a separate authorized session; if
  unavailable, leave that gate pending. No image tool is available today for
  stage 0: disclose that gap and go straight to stage 1. Do not claim image
  generation or silently substitute text-only refines.
- **Both:** use existing authorized tools. Do not install a browser integration
  or start provider sessions. Fresh-provider scenario runs belong to the
  authorized coordinator; local tests do not prove behaviour parity.
