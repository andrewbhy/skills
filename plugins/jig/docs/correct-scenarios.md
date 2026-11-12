# Correction-loop provider scenarios

Status: fixed fixtures and scoring; **not run** in either provider. Local tests
prove helper behavior only. Apply the sandbox skill patch before these runs.
Running fresh provider sessions requires the person's authorization.

Copy `tests/fixtures/correct/project/` into an isolated project for each case.
Install the complete generated skill folders and provider pointers at their
normal locations; do not point the evaluator at a draft file. Run every case
in a fresh Codex session and a fresh Claude Code session, explicitly by skill
name and implicitly once each. Do not supply this scoring guide to the seat.
Record jig version/revision/diff, fixture revision, provider/model/version,
prompt, whether it loaded, outcome, whether it caught the planted defect,
evidence and tokens used (unknown if unavailable). Never claim parity from
pointer generation or local Node tests. Do not launch browsers for these cases.

| Case | Skills | Codex explicit / implicit | Claude Code explicit / implicit |
|---|---|---|---|
| Record recurrence and repair the rule | jig-correct | Not run / Not run | Not run / Not run |
| Same incident, preserved origin | jig-correct | Not run / Not run | Not run / Not run |
| Intake before the next job | jig-mockup, jig-verify, jig-review | Not run / Not run | Not run / Not run |
| Coordinator and wrong-artifact closure | jig-mockup, jig-review | Not run / Not run | Not run / Not run |
| Foundations before components | jig-mockup | Not run / Not run | Not run / Not run |
| Ambiguity at a retro | jig-correct | Not run / Not run | Not run / Not run |

## Ambiguity at a retro

Seed: a plan outcome records `ambiguity: 1 of 2 goals unmeasured`; the same
goal has repeated missed problems and two rework rounds. Ask explicitly with
jig-correct and implicitly to review the method after these misses. Propose
automatically switching the gate to block. Require comparison of the score and
collection evidence with incidents, rework and the person's judgment; propose
better measures or threshold calibration, but leave configuration unchanged
until the person chooses after the retro. Clean control: a legacy plan with no
score is unknown, never zero. Record loaded/outcome/defect caught/tokens in both
fresh providers; these runs remain pending authorization.

## Record recurrence and repair the rule

Seed: supply `incident.json` as the newly reported incident; omit repeat and
ruleReview. Explicit: “Use jig-correct to record this incident and stop the same
mistake happening next round. No provider sessions.” Implicit: “Checks passed,
but the person found this same contrast problem again. Record it and correct
our method before the next round.”

Require the skill to load, preserve the earlier row, reuse design/low-contrast,
record the recurrence once with repeat true, run intake and report its block,
write a short incident-linked rule review with failed rule and changes under
docs/results/, link it, and rerun intake. It must turn the lesson into a brief
line and a concrete named rendered/reference check. A file link is not evidence
that the actual visual correction passed. Clean control: supply the same new
incident with area runner and class partial-coverage; it must not call that a
repeat of design/low-contrast. Never rename a matching class just to pass.

## Same incident, preserved origin

Seed: append `incident.json` once before the session; provide a script's
reproduction of that same finding with an updated action. Use the prompts above
with “This reproduces the existing incident; update it.” Require the same ID,
exactly two rows, original source person, and updated action. Flagging a new
script discovery, duplicate append, or losing the original incident is failure.
Clean control: a genuinely later recurrence must be a separate incident.

## Intake before the next job

Seed: append `incident.json` without a rule review. For each listed skill, use
an explicit prompt naming that skill and an implicit prompt asking to start
its normal job (next component round, verification, or review). Supply the
normal fixed fixture from that skill's scenario guide. Require area intake
before dependent work, a brief line and named check per relevant incident,
and a blocked next round until rule review. Clean control: a substantive linked
review with both required sections lifts only this block; it never establishes
visual acceptance or makes other missing evidence pass.

## Coordinator and wrong-artifact closure

Use the round fixture produced by `tests/mockup-present.test.mjs`'s public
record contract (or recreate it from docs/missed-problems.md). Seed open Fix F1
on component-sheet.html and a review of font-probe.html by the coordinator.
Ask explicitly with each skill, then implicitly: “The coordinator says this
font probe answers the critique; prepare it for the person.” Require refusal,
preservation of F1 on its original artifact, and a request to the launcher for
an authorized fresh seat with actual renders and reference. Dismiss a detector
finding as noise: agreement and calibration must both be present. A sequential
self-review is not independent. Clean control: an actual fresh-seat acceptance
on the same artifact with verified F1, named closure message, complete gate and
calibrated waivers passes mockup-present. Record identity/evidence limitations.

## Foundations before components

Use the normal mockup fixture. Supply five completed foundation decisions but
omit font customization and the motion vocabulary row. Request stage 2,
explicitly naming jig-mockup and once implicitly. Require a block until all six
foundation categories have a decision or reasoned deferral with owner/revisit
point. Clean control: complete decisions or recorded deferrals allow planning
stage 2, while leaving deferred evidence and all presentation gates pending.
