# Missed problems and mockup presentation

Before a job, run `node "<skill-folder>/../../scripts/missed-problems.mjs" --area design` from the
project root. Repeat for every affected area: design, runner, skills, or
`"product slice"`. Installed skills ship the same helper beside the skill.
The [log format](testing.md#missed-problems-log) defines the JSONL fields.
Read each relevant incident, put its lesson in one brief line, and turn the
printed check name into an executable check or an explicit review assertion
with evidence. A generated name alone is not a check. Explain exclusions.

The helper exits 0 for complete intake without open repeats, 1 for open repeats
or unclassified legacy incidents, and 2 for missing history or invalid input.
An absent log means unknown history. Do not silently treat it as no problems.
It does not write records. `jig-correct` owns appending/updating incidents and
writing rule reviews; never append the same incident twice. Recurrences are
separate incidents. Repeats are derived from log order and the area/class pair.
An explicit repeat flag is also honored. A rule review must name each incident
ID it closes, explain `## Rule failed` and `## Changes`, and live in
`docs/results/`. Record the link in `ruleReview`; a missing or unrelated file
leaves the repeat open. Writing a review does not prove the resulting change.

## One round, one presented artifact

Keep these records next to the round's HTML. Use round-relative paths for the
artifact and its local build inputs. Evidence links may also be absolute file
paths outside the repository. Never put private absolute paths in committed
records. The examples below are a schema illustration, not fabricated approval.

`build.json` identifies the artifact, every local dependency (CSS, scripts,
tokens, fonts and fixtures), and the builder/coordinator **session IDs**:

```json
{"artifact":"mock.html","inputs":["tokens.css"],"builder":"build-session","coordinator":"coord-session"}
```

Run the shared runner with `--gate --url <file URL of artifact> --out
<round>/visual-check`; keep its complete `report.json`, not its CLI summary.
Use the stage's agreed measurement scope and one checkpoint contact sheet.
The report records its artifact URL and gate flag. A budget stop, missing state,
run gap or stale report refuses presentation, even if a summary says passed.

`feedback.json` is the per-round ledger. Preserve each person's words, its
original artifact, category (Keep, Fix, Strong objection), status (open, fixed,
verified), and evidence link. Never move an item to a different artifact to
close it. A Keep is verified by evidence that the same behavior remains.
Fixed means ready for verification; only verified items are closed. Empty
`items` is explicit evidence that no feedback has yet been received.

```json
{"items":[{"id":"F1","kind":"Fix","item":"Make selected rows consistent","artifact":"mock.html","status":"verified","evidence":"selection-check.md"}]}
```

`fresh-seat-review.json` is written by a fresh accepting seat after inspecting
the renders and the actual reference. Its session ID must differ from builder
and coordinator. The review message names the artifact and each feedback item
it closes; a font probe cannot close component-sheet feedback. Record both
rendered evidence and reference links. The coordinator can triage, never accept.

```json
{"artifact":"mock.html","reviewer":"fresh-review-session","fresh":true,"decision":"accepted","renderedEvidence":"contact-sheet.png","reference":"reference.png","closes":["F1"],"waivers":[],"message":"mock.html closes F1; selected row evidence matches the reference."}
```

`waivers.json` is an explicit list, empty by default (`{"items":[]}`). Every
remaining runner finding blocks unless its exact ID is waived. Each waiver
needs a reason, evidence, agreement recorded by the fresh seat, and a checker
calibration item. This includes findings explained away as noise. For example:

```json
{"items":[{"finding":1,"reason":"Intentional reference glow","reviewer":"fresh-review-session","evidence":"glow-comparison.md","calibration":"glow-clean-control.json"}]}
```

The fresh review's `waivers` must then include `1`. Calibration evidence records
the rule, measured false positive, clean control, and expected checker behavior;
an arbitrary empty file is not calibration.

Before anything is shown to the person, run:

```text
node "<skill-folder>/../../scripts/mockup-present.mjs" <round folder>
```

Exit 0 means the records meet the presentation contract; exit 1 prints every
refusal reason. The gate is read-only. It requires the visual report and fresh
review to be newer than all declared build inputs and `build.json`; changed
evidence after review requires another review. Use real filesystem modification
times, never adjust them to force a pass. Rebuilds require new checks and a fresh
review. Missing, malformed or stale records block. No browser is launched.

The script validates records and links, not their truth, visual quality, seat
identity, or dependency completeness. The launcher supplies honest identities
and the complete input inventory; the fresh seat owns visual judgment and
feedback verification. Passing does not grant merge or publication authority.
