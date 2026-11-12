---
name: "jig-interaction"
description: "Design and review interaction before any UI or game slice is built: verbs, one input map, input-level flows, feedback, storyboard, top tasks with budgets, screen map and UI hierarchy, checked by a script and a walkthrough. Use for ui, product or game plans and for review of such a slice; not for look and motion."
---

# jig-interaction

Work mode: in a project that is not one of the person's own registered projects, write plans, results, reviews and design notes under the personal jig store (`~.jig<project>plans`, `results`, `design`), never into the repository, unless the person says otherwise; the helpers already keep their own state there.

Scenario status is in Provider notes; local checks do not prove instruction
following.

Start/end telemetry with the helper beside this skill; retain the run ID and
report partly for missing review evidence. Unknown provider tokens stay unknown.

Agents ship interfaces that pass proxy checks and are rejected for friction,
inconsistency and cramped layouts. Before any scene or screen code, produce the
artifacts below, run the cheap script layer, then spend model review only on
what a script cannot judge. Look and motion stay with jig-mockup.

## When

Any plan of Kind ui or product, any game or interactive slice, and review of
one. A change to the global language re-triggers every layer's checks; a layer
addendum re-triggers only itself. Read history first:
`node "${CLAUDE_PLUGIN_ROOT}/skills/jig-interaction/missed-problems.mjs" --area design` and `--area "product slice"`;
carry relevant incidents as named checks.

## Two levels

One **global language** for the whole product: verbs, input conventions for
back, confirm, select, inspect and menu, the feedback grammar, navigation
between layers, persistent elements. Per-layer **addenda** (a game: shell,
strategic, tactical, research; an app: its main workspaces) inherit it and may
only add. Overriding a global row needs a listed exception with reason and
approver. Design the global language once, review it fully (layers a to d),
and again on any change; review each addendum when its layer is designed.

## Artifacts

All live in one `docs/design/interaction.json` (the source of truth, schema
version 1); a Markdown view is for the person. Read [templates.md](templates.md)
for the fields and [example.interaction.json](example.interaction.json) for a
clean spec. Ask the person's environment first (monitors, scaling, input
devices). Derive the language from proven conventions studied as principles;
consult [patterns.md](patterns.md) and cite the pattern by name in each design
decision it shapes.

1. Verbs: id, name, label, gloss, purpose, workflow step, target rule, cost, reversibility,
   frequency, disabled-reason text. The label is the exact on-screen text; the
   gloss says in plain words what it does.
2. One input map: every input once per state per layer, what it never means,
   how it is visible. Global table first.
3. Flows as data, per verb, at input level: states, transitions (input, device,
   KLM operators), invalid inputs, back row, mouse and keyboard paths.
4. Feedback catalogue (in the JSON): before, confirm, during, after, in three
   places (object, space, one text line), with a reduced-motion form.
5. Storyboard (in the JSON) of each top task with a dead-click frame and an
   error frame, a first-click frame, plus empty, loading, error and
   maximum-content states.
6. Top tasks with budgets: max time, inputs, mental steps; the script writes the
   KLM estimates. Each budget records its source and a comparison figure from a
   named reference product (reference teardown, template A10). The person sets
   budgets, or corrects the ones proposed.
7. Layout (monitor, scaling, target rectangles, regions): required for every
   primary-task screen before layer (d).
8. Screen map: every screen, layer, menu and popup with entry, automatic
   triggers, interrupt or pause or overlay, closer, return, focus, persistent
   elements; plus the exceptions table.
9. UI hierarchy per screen: regions, panels, components with priority, when
   shown, what each owns, eye order, size. One home per verb and state, at most
   one repeat.

## Build from the toolbox

Before implementing web/app UI, start from the design toolbox (in jig,
`docs/design-toolbox`): page shell, grid tokens, primitives and components.
Use the shared jig logo on jig's own pages. Record project customisations or
deviations in project config or an ADR. Run the toolbox page-shell check
(`node docs/design-toolbox/check-page-shell.mjs` in jig) and the project's
runtime page-shell/brand regression tests. Games have separate art direction.
Keep project-specific toolbox locations and check commands in project config.

## Optional rule annotations (schema version 1)

- Rule 6: absent `config.reservedKeys` retains the one-owner digits-only
  policy. To reserve letters too, supply the complete set, for example
  `["1","2","3","4","5","6","7","8","9","q","w","e","r"]`.
  Configured reserved keys bind only verbs with `ability: true`, or a
  `config.reservedKeyExceptions` row `{input, verb, reason, approvedBy}`.
  Both the spec map and registry export are checked. Letters are project
  conventions, never generic web/app defaults.
- Rule 9: flow states may declare `gates: [verb ids]` (default empty).
  These states require an object-level `visibleAs` mark, `reason`, and
  `turnsLeft` and `clear` text, unless `permanent: true` waives the last two.
  In a layer declaring gates, a verb's `disabledReason` needs a state gating
  that verb, or `geometric: true`. Legacy layers without gates keep their
  existing defaults; this does not certify their status feedback.
- Rule 12: primary-button invalid inputs and dead-click/error frames may not
  redirect to another input. Verbs may declare `targets: ["enemy", "downed ally"]`;
  each class needs a left-click binding in its layer or the global map, or a
  `primaryClick` inspect-only reason. If targets is absent, recognised object
  words in `targetRule` supply classes (downed ally, enemy, ally, unit, tile,
  object); otherwise target checks have no classes to inspect.
- Rule 13: `disabledShown` defaults to `greyed-with-reason`; alternatives are
  `reason-line` or `absent`. Frequent/every-turn verbs and rare verbs in a
  primary or `rescue: true` task must remain visible with their reason.
  Invalid rows saying no menu/nothing opens for a declared target class need
  that class in the top-level `nothingToTeach` list (default empty).
- Rule 14: each target class needs a storyboard first-click frame naming it
  and an error frame whose `input` names it, on a task using the verb.

Every finding from rules 12-14 has severity 3. New fields are optional; existing
specs without annotations retain their compatibility defaults. Add paired
planted-defect and clean-control calibration fixtures when extending a rule.

## Review layers, cheapest first

Plan gate: a ui, product or game plan without the artifacts, or with a failing
layer (a), cannot reach OK. The plan cites the spec path and budgets in
Acceptance and Verification plan. Spend nothing on a later layer while an
earlier one fails.

**(a) Script, no model.** `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-interaction/interaction-check.mjs" docs/design/interaction.json`
(add `--patterns` for the library, `--registry export.json` for the code
registry gate). Exit 0 clean, 1 findings, 2 missing or invalid spec (never a
pass). Rules: input collisions per state; coverage between map and flows
(every verb has a flow, a mouse and keyboard path or a recorded reason, an
invalid row, a back row); unreachable states and missing back paths;
cross-layer consistency (silent redefinition, global keys, layer back paths,
persistent elements); screen map and hierarchy (reachable, way back, popups
name trigger, effect, closer, return, focus and pending input; at most three
surfaces per verb; primary controls primary; one primary component per
region); KLM per top task against its budget (over fails, within 10 percent
warns); target size and Fitts distance where a layout exists (unknown layout is
"not checked"). Fix every finding, then rerun. Rule 6 is the project's registry
gate: every registry verb is in the spec, no key, button or menu item sits
outside it, one key handler, digits belong to one verb by default; configured reserved keys belong to abilities.
Rule 7 labels: every verb has a label and a gloss, and no two share a label.
Rule 8 modes: an input meaning more than two verbs across states of one layer,
and any state without `visibleAs`. Rule 9 feedback and storyboard: three places
per event, no outcome only in a log or hidden panel, a dead-click and an error
frame per top task. Rule 10 layout: a layout block for each primary task, and a
density cap of controls per region. Rule 11 budgets: a source and a reference
product figure for each budget; a budget looser than the reference fails.
Every error is Nielsen severity 3 or more: a rule the script failed is never
below 3. Flags: `--slice` (slice review) and `--light` (light path) both
require `--registry`; `--light` also requires `--against <previous spec>`.

**Slice review (spec to build).** At review of a built slice run layer (a) with
`--slice --registry export.json`: the registry export is mandatory, because a
clean spec can still be built badly. Then do the **build walk**: a fresh
context walks the built UI against the spec flows, step by step, and reports
every step where the build differs from the flow (headless browser for web; for
Godot, the jig-godot headless selftest with real input events). Layer (d) runs on
the build, not only on the spec. Walk the failure path first: per top task,
record `defaultFailure: {state, fixture}` (a seed or fixture reference), then
replay the state the person reaches first by default with real input events.
Do not cover only a prepared happy path.

**(b) Agent review.** In an already authorized fresh cheap context given only
the spec and storyboard, follow [review-seats.md](review-seats.md): a cognitive
walkthrough per top task, then a heuristic evaluation. Findings are ranked by
severity 0 to 4; 3 and up blocks; each cites step, input and heuristic. An
outcome readable only in a log or a hidden panel is severity 3. Add the
**label test**, a fresh context that sees only the verb labels and says what
each does (the five-second label test); a mismatch with the gloss is severity 3.

**(c) Strong reviewer.** Opt-in per plan only, ten-minute timebox, cost logged;
never by default.

**(d) The person's walkthrough.** A script of three to five top tasks, run on the
built slice; think-aloud notes recorded verbatim; feedback as Keep, Fix or Strong
objection in `docs/design/feedback.json`. Before the build, first-click practice
is a plan gate: the person (or, if absent, an already authorized fresh seat given
only a static frame) names the first click per device button (left, right, hover)
for every visible object type. Record `firstClick.observed` per top task; a
primary click that only redirects fails. Add to the plan: "for each visible
object: left-click, right-click, hover do what? none may only redirect".
During the walkthrough time each task and record `observed.seconds`
against the KLM estimate. Nothing is accepted without it; scripts and agents
never accept.

**(e) Misses, the learning loop.** The loop fires by script, not by intention:

- `telemetry.mjs end ... passed` for this skill is refused unless
  `docs/design/feedback.json` exists with Keep/Fix entries and every Fix is
  filed. A spec-only run ends `partly`. `JIG_INTERACTION_GATE=off` records
  `partly` and never `passed`.
- `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-interaction/interaction-feedback.mjs" file <project>` files each Fix
  (and Strong objection) to `docs/missed-problems.jsonl` for jig-correct, with a
  class and which layer should have caught it (layer a is recorded as unit,
  otherwise person only; the layer and rule go in the action text). A repeat
  blocks the next round, as jig-correct defines.
- A miss closes only when a planted-defect fixture reproduces it and the checker
  catches it while its clean control stays clean:
  `interaction-feedback.mjs close <project> <mp-id> --fixture f.json --control c.json`.
  A seat catch needs its own recorded run.
- Re-run calibration on every checker or seat edit:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/interaction-calibrate.mjs"` (the suite also runs it).
- Trip-wire: two consecutive slices with a friction, inconsistency or cramped Fix
  stop UI work (`interaction-feedback.mjs status` exits 1) until a skill review in
  `docs/results/` with Rule failed and Changes sections is recorded with
  `interaction-feedback.mjs review`.
- False alarms: a Keep item with `flaggedBy` counts as a false alarm for that
  rule or seat; three or more mark it a candidate for deletion.

## Light path

Once a global spec exists, a change that adds no verb, input, screen or popup
edits the JSON, runs `interaction-check.mjs <spec> --light --against <previous>
--registry <export>` (layer (a) plus the registry diff and the add-nothing diff),
and the person takes a two-minute look. The full path (everything above) is for a
new layer, verb, screen, popup or any global change; `--light` exits 1 and names
it when the change needs the full path.

Cross-layer flows (for example mission end, then strategic, then research) are
top tasks with their own storyboard, budget and walkthrough, since single-layer
reviews do not see them.

## Provider notes

- Scenario status: the Claude half passed 6/6 (11 Nov); the Codex half is pending
  (after 13 Nov). The v2 changes have a Claude scenario record of their own.
- Codex: load the canonical .agents/skills/jig-interaction source; telemetry
  provider is codex. Authorized subagents may isolate the layer (b) context;
  missing authorization leaves it pending.
- Claude Code: load the generated .claude/skills/jig-interaction pointer and
  resolve helpers at its canonical target; telemetry provider is claude.
  Authorized Task contexts may isolate the layer (b) seat.
- Both: run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-interaction/telemetry.mjs" start "<project-root>" <provider>'
  and 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-interaction/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>'.
  Do not start provider sessions on your own.

Methods adapted as ideas only: keystroke-level model (Card, Moran and Newell
1980), cognitive walkthrough (Wharton et al.), Nielsen's ten heuristics and
severity scale, WCAG 2.2 target size 2.5.8, Fitts's law. No third-party skill is
installed or executed.
