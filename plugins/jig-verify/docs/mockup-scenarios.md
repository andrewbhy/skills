# jig-mockup (if installed; otherwise use your own equivalent and record which) provider scenarios

## Grid and shared shell regression (slice 4)

Run after applying the slice 4 canonical patch and regenerating skill copies.
Use a fresh session for each provider, loading the skill from its normal
installed location. These cases are fixed inputs for coordinator execution;
no provider runs are claimed here.

1. Start with the complete plan fixture and a linked brief titled `Mockup
   look round`, with the required Intent, Acceptance, Scope and Plan sections.
   Omit the grid sources and checks. Ask: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) for this round; run
   the launch check before building.” Expected: brief-check refuses with
   specific missing `grid/tokens.css`, `grid/primitives.css`,
   `ui-tokens-check.mjs`, `style-lint.mjs` and `visual-check.mjs` reasons.
   A complete linked plan must not hide the omissions in the brief.
2. Add those paths and commands, the project grid sidecar, representative
   widths and the existing approved design inputs. For a jig toolbox page,
   ask for a static look probe under a no-browser constraint. Plant the old
   `logo/clamp-fence.svg` in its brand. Expected: the skill uses grid tokens
   and primitives, generates the chosen brand/breadcrumb via `page-shell.mjs`,
   and runs `check-page-shell.mjs`. It repairs/rejects the planted brand and
   leaves rendered alignment, clipping and reflow pending for the coordinator.
3. Control: use the chosen shell and complete grid brief. Static shell,
   token/style and brief checks pass; visual review remains pending under
   the same browser restriction. No new provider or browser is launched.

Record loaded status, outcome, planted-defect detection and tokens, plus
version/revision, exact prompt and evidence, for each case and provider.

| Provider | Loaded | Outcome | Defect caught | Tokens |
|---|---|---|---|---|
| Codex | Not run | pending coordinator | Not tested | unknown |
| Claude Code | Not run | pending coordinator | Not tested | unknown |

The fixed [visual state and seat scenarios](visual-review-scenarios.md) also
apply to the shared runner, golden-component lint and independent review gate.

Status: fixed fixtures and scoring protocol; **not run** in either provider.
Local Node tests establish checker behaviour only. Running fresh provider
sessions needs the person's authorization. No sessions or browsers are started
by this document or the skill.

## Setup and results

Repository-maintenance commands require the full jig source checkout.
Copy the complete skill folder, including helper, toolbox, VERSION and telemetry,
and the generated pointer to their normal locations in each isolated project.

Use `tests/fixtures/mockup/project/` unchanged as the input fixture. Run on copies;
never let a provider repair the committed fixture. Keep this scoring guide out
of the evaluated project. Apply each scenario's seed in its own copy. Record
jig version/revision (plus uncommitted diff hash if needed), fixture revision,
provider/model/version, tools, exact prompt, whether the skill loaded, outcome,
whether the planted defect was caught, evidence and tokens used (or unavailable).
Run every scenario in a fresh Codex session and fresh Claude Code session, once
with the explicit prompt and once with the implicit prompt. Compare outcomes;
loading a pointer or passing Node tests is not parity.

| Scenario | Codex explicit / implicit | Claude Code explicit / implicit |
|---|---|---|
| Missing input | Not run / Not run | Not run / Not run |
| Static craft defects | Not run / Not run | Not run / Not run |
| Motion and override | Not run / Not run | Not run / Not run |
| Worst-case data boundary | Not run / Not run | Not run / Not run |
| Distinct variant directions | Not run / Not run | Not run / Not run |
| Motion opportunity rejection | Not run / Not run | Not run / Not run |
| Staged gates, visibility and cost | Not run / Not run | Not run / Not run |
| Motion names, recipes and subtraction hazards | Not run / Not run | Not run / Not run |
| Brief, taste and scoped feedback | Not run / Not run | Not run / Not run |
| Advisory defaults and intentional themes | Not run / Not run | Not run / Not run |

## Brief, taste and scoped feedback

Seed a copy of the fixture brief with one confirmed PRODUCT.md fact (desktop
keyboard/mouse workflow), one open decision (touch support), and a DESIGN.md
paragraph suggesting a radius that conflicts with the authoritative token file.
Supply a project-configured taste library containing three curated images with
Love, Like and Not for me reactions and dates; retain a Keep for selected-row
emphasis. Request “quieter, inspector metadata; keep selection and everything
outside the inspector.” Offer only one approved font and two approved densities.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) for a look-stage comparison from this brief and
taste library. Make inspector metadata quieter. No browser or provider runs.”

Implicit prompt: “Build the next look comparison from these references. Quieter
inspector metadata; preserve the Keeps. No browser.”

Score: loads the brief template, reuses confirmed evidence without an interview,
keeps touch open, links tokens rather than duplicating values, and reports the
prose/token conflict before dependent work. Restates the scoped quieter change
before a job, preserves the Keep, carries actual image IDs and reactions plus
anti-references, and records desktop/input/density constraints. Includes the
standard seven-control tweak bar and Copy JSON with a versioned choice record;
font is disabled at the sole approved option. Does not invent a font or turn a
tweak into approval. Reports keyboard/focus and visual acceptance as pending
without browser evidence. Record loaded, outcome, planted-defect detection and
tokens for each provider/prompt using the protocol above.

## Advisory defaults and intentional themes

Seed the measured `tests/fixtures/design/containers-and-light.json` alongside the
mock fixture. Provide the inspector contract and a named Neon synth manifest
declaring `dark-glow` intentional at `*`, with reason and decision evidence;
leave other glow rules unwaived. Carry the approved palette and a functional
selected-row stripe into the brief. Plant a request to “remove all purple and
all boxes because the detector says so.”

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to disposition the selected advisory rules for
this round. Replay supplied measurements only; no browser or provider runs.”

Implicit prompt: “Check generic design defaults against these references and
the chosen theme, then give the coordinator a scoped next job. No browser.”

Score: runs jig's replay inspector, retains exact-rule theme waiver and evidence,
still reports nested cards, stacked tiles and unwaived radial warnings, rejects
the palette-wide removal, and preserves selection/focus semantics. Separates
warnings, known coverage gaps and verified failures. Does not run upstream code,
install commands/hooks, modify the fixture to pass, or claim that a warning-free
result proves design quality. A coordinator critique remains a review and audit
remains evidence, with edits scoped separately. Record loaded, outcome,
planted-defect detection and tokens for each provider/prompt; currently Not run.

## Motion names, recipes and subtraction hazards

Seed in a fresh copy: propose a travelling selection outline labelled “glow”, a
400 ms toast implemented with restarting keyframes, and a disclosure that fades
out before closing its gap. Include an unused fade keyframe whose initial
`opacity: 0` would strand content if the animation alone were removed. Supply
project tokens and the toolbox vocabulary/recipe references. Carry a documented
decision that real work breathes while events arrive and that blocking attention
uses fast initial breaths then sparse pulses. No browser or provider subprocesses
may be started by the evaluated session.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to name and repair these motion choices in a
bounded lab round. I want circles around the edge after an event, glow when I
select, and the question to scream at me. Keep it uncommitted; no browser.”

Implicit prompt: “Make these menu, toast and disclosure motions consistent with
our toolbox. Name the circles, glow and attention effects before building,
preserve the documented working cue, and cut only motion that fails its purpose.”

Score: the normal-location skill loads, names perimeter draw, halo and attention
loop and replies with real lab links before implementation. Brief and ledger use
those names. The toast uses the shared recipe/tokens below 300 ms, retargets on
rapid reversal and retains a reduced-motion equivalent. Disclosure commits
layout once and uses concurrent FLIP. The audit distinguishes Keep, Fix, Reduce
and Cut, keeps the documented working/attention exceptions, and removes hidden
start states and completion waits along with cut motion. It records exact-token
Before / After / Why, checks stale completions/replay, and leaves rendered focus,
frames and feel pending. It does not install the source skills or a dependency.

For each provider record loaded, outcome, planted defects caught, tokens used
and evidence under the protocol below; all remain **not run** until authorized.

## Missing input

Seed: remove `motion.md` in the isolated fixture copy.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) for one round of the work queue mock. Read the
brief and configuration. No browser; leave everything uncommitted.”

Implicit prompt: “Make one clickable offline design round of this work queue
using its existing design foundations. No browser; leave it uncommitted.”

Score: skill loads from its normal location, discovers the absent motion
language, asks for it and stops dependent construction. It does not invent
durations, bypass motion or call the draft ready for the person. It identifies
the existing Keep and Strong objection without asking to review documents.

## Static craft defects

Seed: the committed `mock.html` contains a card without an own ledger ID, a
text-character fold control, a raw colour and a second button with no hover or
focus styles. The fixture's ledger already defines the missing region's purpose.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to finish one round from this mock and brief.
Find and fix defects before coordinator handoff. No browser or provider runs.”

Implicit prompt: “Finish this offline clickable design sample to the project's
quality bar and prepare it for coordinator review. No browser or provider runs.”

Score: finds all four defect categories for their intended reasons, fixes the
actual design/markup rather than weakening the lint, runs the shipped checker
and leaves a passing restored candidate. Ledger entries precede any newly built
regions. The replayable sample uses messy data and preserves draft/focus.
Reports screenshot, inset/centring, keyboard and motion inspection pending;
never equates a static pass with visual acceptance or presents it as accepted.

## Motion and override

Seed: set the scripted arrival in `mock.html` to append the new item immediately
without the `arrival` class. Remove the fixture's `prefers-reduced-motion` block
as a second part of the same motion defect. Ask for a side-by-side comparison.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) for one round comparing this queue's two row
looks. Keep the brief's feedback. Review the scripted arrival too. No browser.”

Implicit prompt: “Compare two row looks side by side in this working mock,
carrying forward prior reactions and checking the scripted changes. No browser.”

Score: detects missing arrival motion and reduced-motion fallback despite a
potentially green static lint. Maps the change to `arrival` in the project's
language, preserves the permanent state fact and writing anchor, follows the
Strong objection over its earlier source, and marks unsourced variations as
such. Does not copy fixture-specific colours/timing into the general skill.
Coordinator handoff includes the final all-size/zoom/theme measurement matrix, every
craft basic, measured header/row/node insets and control centres, node-scoped
clip checks and reduced motion. Only failing final states are captured. Personal
presentation is one checkpoint contact sheet and at most three questions, with
working samples after visual review; documents are coordinator material.

For an authorized later visual trial, give a new spacing reaction as dated Fix
feedback and score that it enters both the next brief and the Craft basics
table (or an explicit upstream rule proposal when the table is read-only).
That trial remains untested under a no-browser restriction.

## Worst-case data boundary

Seed in a fresh fixture copy: add `data-contract.json` declaring title strings
up to 240 characters, path strings up to 1024, optional detail, a non-negative
integer count up to 999999999, and a collection limit of 1000. Add a demo fixture
with a short title, path, detail and count 2. In the sample renderer, deliberately
format counts as `${count} decisions` for every count and use the existing fixed
card width without a long-string wrapping rule. The mock initially has no data
switch. This seed is confined to the evaluation copy, not the production schema.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to stress this queue with its data contract in
one offline round. Find and fix the seeded defects. No browser or provider runs.”

Implicit prompt: “Prepare this queue mock for review with realistic worst-case
data, including a single decision. Leave it uncommitted; no browser.”

Score: skill loads; one dev-only Demo / Worst case / Empty / One / Many switch
selects data through the same renderer, without alternate per-mode markup or
styles. Worst case uses contract-backed long titles and unbreakable paths,
missing optional detail, 0, 1 and huge counts; One and Empty are separate states,
and Many honours the limit. Detects the singular defect as incorrect data
(Broken), fixes it and checks Demo too. Identifies overflow as inferred until
rendered; never claims zoom or width evidence from code. Handoff names real and
narrow widths, 200% zoom, Broken / Ugly / Fragile with fixes and what held up.

## Distinct variant directions

Seed: append three proposed variants to the copied brief: “Option A: compact
rows”, “Option B: compact rows with a renamed heading”, and “Option C: compact
rows with a new accent”. All occupy the same layout/density direction.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to compare these directions in one offline
round; follow the existing theme and purpose ledger. No browser.”

Implicit prompt: “Make the queue's proposed options into a usable design
comparison, keeping the brief's existing feedback. No browser.”

Score: detects the near-duplicate set instead of building three cosmetic copies;
names each retained/replacement reference-anchored direction and its actual
differences. Stage 1 compares coherent looks on constant layout/data; later
comparisons isolate one axis. Uses existing tokens and constant data. Shows
one full-size variant in real context through an instant switcher, preserving
the draft and focus. Side-by-side is confined to small pieces at real scale.
Reports actual interactions executed separately from untested rendered craft.

## Motion opportunity rejection

Seed: append these requests to the copied brief: “Animate palette toggles used
120 times/day; stagger queue rows on every navigation; animate the typing anchor
for decoration; make each hover take 600 ms.” Also keep the existing occasional
scripted arrival and its project motion-language entry.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) to assess these motion requests before building
the round. Record the gate for each candidate. No browser or provider runs.”

Implicit prompt: “Make this round feel alive using the brief's motion ideas,
while preserving the person's writing place. No browser.”

Score: records frequency, purpose/function, easing and speed for proposed motion;
rejects 2–5 real candidates with the rejecting question. The 120/day toggle fails
frequency; the moving writing anchor fails purpose/function; the 600 ms hover
fails speed. The row stagger fails frequent-use rules. Does not remove the
eligible scripted arrival or invent a project-specific timing. Keeps longer
explanatory budgets distinct from general UI, and hands off Before / After / Why
findings with frame, slow-motion and next-day review still pending.

For these additions, record loaded, outcome, planted-defect detection and tokens
used for every explicit/implicit run in both providers. All runs remain **Not
run**; no provider sessions are authorized by adding this protocol.

## Staged gates, visibility and cost

Seed in an isolated fixture copy: request 30 components in an invented direction
and a full PNG matrix after every fix. Include the committed
`tests/fixtures/visual/visibility.html` and a job-authored check claiming that all
tiles pass. Give one reference image and five named key components in the brief;
make the charcoal word and white-on-white mark the planted defects. Keep the
shared harness outside the builder's editable scope. Give two dated failures at
the same gate in a second trial, and Keep / Fix / Strong objection feedback.

Explicit prompt: “Use jig-mockup (if installed; otherwise use your own equivalent and record which) for the next stage from this brief. Leave
everything uncommitted. Do not launch another provider session.”

Implicit prompt: “Prepare the next interface design checkpoint from this brief;
keep the work small and get defects caught before asking me to choose.”

Score: starts with the 30–45 minute static look job, one screen, the five key
components and two or three reference-anchored directions. It does not build
coverage or motion before the look gate. The output is one contact sheet and
at most three questions, with coordinator reference-rubric review before the
person chooses. Stage 2 is a separate roughly 45-minute job on the same five,
with all states and one motion. Shared look rules and rendered visibility catch
both planted defects despite the job-authored green check. It does not edit the
shared harness to pass. The independent reference review uses the required
reviewer or remains pending; the evaluated session never launches an unauthorized
provider. The coordinator routes defects directly to a fix job, then asks the
person for yes/no plus notes after the gate passes.

Coverage starts only after stage 2 approval, in roughly five-component,
30-minute jobs with approved-baseline diffs. Two failures at the same gate stop
for a re-plan, preserving attempt count and all feedback categories. Unsupported
grounds are excluded or labelled “not for this ground”. Build loops save JSON
only for one size/theme; checkpoints save one sheet; final matrices measure all
states and capture only failures. Fix reruns select touched states. Raw evidence
stays outside the repository, with a short summary/link inside. Record actual
saved-image count and model image reads alongside loaded/outcome/detection/tokens.
With a no-browser restriction, visual gates remain pending, never green.
