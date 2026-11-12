# Interaction spec templates

One file, `docs/design/interaction.json`, schema version 1. IDs are kebab-case
and stable. `global` is the default layer. The Markdown view for the person is
generated from it by the author; the JSON is checked. Run
`node "<skill-folder>/interaction-check.mjs" <spec>`; see
[example.interaction.json](example.interaction.json) for a spec that passes.

## Top-level fields

| field | meaning |
|---|---|
| `version` | always 1 |
| `config` | optional: `klm` operator seconds (defaults K 0.2, B 0.1, P 1.1, H 0.4, M 1.35), `minTarget` px (default 32; WCAG 2.2 AA floor is 24), `maxFittsIndex` (default 5), `warnWithin` (default 0.1), `maxModeVerbs` (default 2), `maxControlsPerRegion` (default 8), `budgetSlack` (default 2) |
| `layers` | `{id, parent, back, entry}`; a layer without a parent is `entry`; others name the `back` input to the parent |
| `verbs` | A1 |
| `inputs` | A2 |
| `exceptions` | A8 table |
| `persistent` | `{id, exempt:[{layer, reason}]}`; shown on a screen of every layer or exempt |
| `flows` | A3, flows as data |
| `screens` | A8 and A9 |
| `tasks` | A6 |
| `layout` | A7, required for the layer of every primary task |
| `feedback` | A4 |
| `storyboard` | A5 |
| `references` | A10 reference teardowns |

## A1 Verbs
`{id, name, label, gloss, layer, purpose, step, targetRule, cost, reversible, frequency, disabledReason, noPath:{mouse?, keyboard?}, noSurface}`.
`label` is the exact text the person sees on the control or in the menu; `gloss` says what it does in plain words a new person would use and must differ from the label. Two verbs may not share a label (rule 7). The label-test seat sees only the labels and must say the same as the gloss; a mismatch is severity 3. `noPath` records the reason a verb has no mouse or no keyboard path; `noSurface`
marks a keyboard-only verb. A layer may not redeclare a global verb id.

Optional annotations (rules 6, 9, 12-14): `targets` lists target classes;
`primaryClick` records an inspect-only reason; `ability: true` permits reserved
keys. `disabledShown` defaults to `greyed-with-reason` (also `reason-line` or
`absent`); `geometric: true` explains a geometric disabled reason. With no
`targets`, recognised `targetRule` object words supply the classes; with no
recognised words, target coverage is not checked. See SKILL.md for the rules.

## A2 Input map
`{input | [inputs], state, layer, verb, never:[verb ids], visibleAs, exception}`.
An input appears once per state per layer; state `any` overlaps every state. The
global table wins: a layer row with the same input as a global row and another
verb needs `exception` naming an A8 exception id. Global verbs keep the same
keys in every layer.

With no `config.reservedKeys`, digits have one owner as before; letters are
unreserved. A project may supply the complete reserved set, including letters.
`config.reservedKeyExceptions` rows are `{input, verb, reason, approvedBy}`.

## A3 Flows as data
```
{ "id": "attack-flow", "layer": "tactical", "verb": "attack", "start": "ready",
  "states": [ {"id": "ready"}, {"id": "armed", "back": "ready"},
              {"id": "spent", "terminal": true, "back": "armed"} ],
  "transitions": [
    {"from": "ready", "input": "left-click enemy", "to": "armed", "device": "mouse", "ops": "MPB"},
    {"from": "armed", "input": "left-click enemy", "to": "spent", "device": "mouse", "ops": "PB"},
    {"from": "ready", "input": "n", "to": "armed", "device": "keyboard", "ops": "K"},
    {"from": "armed", "input": "enter", "to": "spent", "device": "keyboard", "ops": "K"} ],
  "invalid": [ {"from": "ready", "input": "left-click enemy out of sight", "result": "text reason, nothing armed"} ],
  "back": {"input": "esc", "to": "ready"} }
```
- Every state that appears in the input map needs `visibleAs` on its flow state: how the person sees which state they are in (rule 8). An input that means more than `maxModeVerbs` verbs across states of one layer is a hidden mode.
- A state id is also the `state` of its input-map rows. Every transition input
  must be in the map for that state or `any`.
- `device` is mouse, keyboard or both. `ops` is a string of KLM operators:
  K keystroke 0.2 s, B button press or release 0.1, P point 1.1, H home hands 0.4,
  M mental preparation 1.35. A click is usually `PB` (add `M` when the user must
  decide). Each transition is one input.
- Every non-start, non-terminal state names a declared `back` state. Every
  state must be reachable from `start`.
- Each verb flow has `invalid` (at least one) and a `back` row. Write the
  precondition, feedback ids (A4) and end state in the Markdown view.

States may add `gates: [verb ids]` (default empty), object-level `visibleAs`,
`reason`, `turnsLeft` and `clear` text, or `permanent: true` to waive the
last two fields. Top-level `nothingToTeach` (default empty) lists target classes
whose invalid inputs may leave the menu closed.

## A4 Feedback catalogue (`feedback`, rule 9)
`{id, event, verb, layer, object, space, text, reducedMotion, logOnly, hiddenPanel}`. Each event names its three places: `object` (on the unit or item), `space` (on the board or screen) and `text` (one text line). A missing place is an error. `logOnly` or `hiddenPanel` marks an outcome readable only in a log or a hidden panel: severity 3. Sound, duration and skippable go in the Markdown view. A global before, confirm, during, after grammar is inherited by every layer; each verb of a top task should have an event.

## A5 Storyboard (`storyboard`, rule 9)
Frames: `{id, task, kind (normal, dead-click, error, empty, loading, maximum), state, input, sees, question, next, firstClick}`. Each top task needs a dead-click frame and an error frame, and every frame says what the person sees and the question they have there. `firstClick` names the target the person is expected to point at on that static frame: show the frame without hints and ask where they would click first (the first-click test; a warning if absent). A new person must be able to continue from each frame using only what is on screen.

## A6 Top tasks and budgets
`{id, layer, primary, device (mouse|keyboard|any; any picks the cheapest path of either, so write the hand-homing H into the operators), steps:[verb or layer/verb], repeat, maxTime, maxInputs, maxMental}`.
Steps expand through each verb's flow, shortest complete path for the device.
`budgetSource` (person, reference teardown or agent-proposed) and `reference` (an A10 id) are required whenever a budget is set (rule 11); a maxTime over `budgetSlack` times the reference figure fails, since a loose budget passes anything. `observed` (`{seconds}`) is filled at layer (d) and warns past 1.5 times the KLM estimate. `repeat` multiplies (for example 48 images). Primary tasks must have primary
controls in a primary region at or above the minimum target size. The checker
prints the estimate; nobody hand-writes it. Cross-layer flows are tasks too.

Before building, record per-task `firstClick: {observed: [{object, left, right,
hover}]}` from the person or an authorized fresh static-frame seat. Record
`defaultFailure: {state, fixture}` (seed or fixture reference) for the build
walk; replay that default failure first using real input. Tasks may mark
`rescue: true` (default false) to preserve rare rescue actions when disabled.
Plan line: "for each visible object: left-click, right-click, hover do what?
none may only redirect".

## A7 Layout (required for primary tasks before layer (d); enables rules 5 and 10)
`{layer, state, monitor, targets:[{id, x, y, w, h, verb, region}]}`. A primary task without a layout block for its layer fails rule 10, and more than `maxControlsPerRegion` controls in one region (layout targets, or hierarchy components that own a verb) fails the density rule. Record the person's
monitors and scaling. Without a layout block rule 5 reports "not checked", never a pass.

## A8 Screen map
`{id, layer, kind (full-screen, modal, overlay, notice), entry:[start|load|resume],
enterBy, auto:{trigger, effect (interrupts|pauses|overlays), pendingInput (queued|refused),
refusalReason, focus}, closedBy, returnsTo (screen id, or "none" for a root entry),
edges:[{input, to}], persistent:[ids], stateIn, stateOut, hierarchy:[nodes]}`.
Reachability runs over `edges` from entry screens. Exceptions table:
`{id, layer, input, reason, approvedBy}`; an override without a row fails rule 3.

## A9 UI hierarchy (inside a screen)
Node: `{id, parent ("root" or a node), level (region|panel|component),
priority (primary|secondary|tertiary), shown (always|on hover|on select|on demand),
owns:[verb ids], placement (diegetic|spatial|meta|non-diegetic), eye (1-3),
size:{w,h}, ledger}`. Rules: the primary task's controls sit in a primary
region at a comfortable size; every verb and state has one home and at most
one repeat (three surfaces maximum); a tertiary node is never always shown
unless `ledger` names its moment; at most one primary component per region;
state that exists only as a HUD number is a layer (b) finding.

## Registry export (rule 6, generic form)
`{verbs:[ids], bindings:[{input, verb}], handlers: n, surfaces:{verb: count}}`,
exported by the project's code registry and diffed with `--registry`.

## A10 Reference teardown (`references`, rule 11)
Transcribe one proven product's flow for the same task into the spec format, in KLM operators, and use its time as the budget baseline.
```
{ "id": "ref-turn", "product": "Into the Breach", "task": "pick a unit then end the turn",
  "ops": "MPB MPB", "repeat": 1, "source": "own teardown of the published game, date" }
```
The checker turns `ops` into seconds. Name a real, shipped product and record where the figure came from. A task whose budget is more than `budgetSlack` times it fails; one whose estimate is slower than that warns.
