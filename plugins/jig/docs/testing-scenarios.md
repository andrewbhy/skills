# Testing approach: provider scenarios

Status: drafts and local fixture checks only. No provider sessions have run for
these changes. Passing `npm test` does not establish skill behaviour or parity.

## Coordinator preparation

1. Move the three replacement `SKILL.md` files from `testing-draft/<skill>/`
   into the existing `.agents/skills/<skill>/` folders, preserving their existing
   supporting files. Remove the emptied drafts; they are a sandbox handoff,
   not a second source or new skills. Run `node scripts/sync-skills.mjs`, then
   `npm test`. Generation ships VERSION and telemetry beside each skill,
   diff-signals beside review, and test-budget plus its configuration guide
   beside verify and review.
2. Create an existing scratch parent outside the fixture sources. For each run:
   `node tests/fixtures/testing/prepare.mjs <budget|ui|outside> <new-directory> --seed`.
   It refuses existing destinations and prints baseline/candidate commit hashes.
   Omit `--seed` for the clean control. No install, credentials or network needed.
3. Give each fresh session only the prepared project, task README, prompt and
   hashes where applicable. Keep this guide and prepare script outside it.
   Load skills by normal discovery, including all generated supporting files;
   use generated pointers for the provider that needs them, never paste a draft
   into a prompt. Ensure standalone helpers work without access to this checkout.
4. With the person's authorization, run each fixture in fresh Codex and Claude
   Code sessions, once with the skill named and once with the name omitted.
   Also run clean controls and the existing spike/verify/review scenarios for
   changed skills. Use the same jig revision, fixture recipe, tools, model
   choices, time and token budgets. For UI, provide an existing browser capture
   tool and image viewer; missing either is a gap, not a passed visual check.
   Authorize review's independent built-in review sessions separately; an
   unavailable required review leaves the outcome partly. Never launch one
   merely because the fixture mentions it.

## A: test growth (jig-review)

Prompt: “Use jig-review to review base `<base>` to revision `<revision>` against
README.md. Include architecture/testability and execute the fast-suite budget
check. Do not fix the change, change the budget, or save a review report.”
For discovery, omit “Use jig-review to”.

Seed: the candidate adds `test/repeated.test.mjs` without a risk tag and waits
3500ms, exceeding the existing 3000ms budget. Assertions still pass. The base
review configuration requires Architecture and QA for test changes. The clean
candidate has a named risk and no wait; a slow host invalidating the control is
an environment gap, not permission to raise the budget.

Score: Architecture flags **both** the untagged test and suite budget violation,
with locations/evidence, harm, severity and before-merge priority. The helper's
exit is 1, `missingRiskTags` names the added test, `overBudget` is true, runner
exit is 0. Clean control exits 0. The reviewer proposes deleting/merging the
redundant check, never raising the budget. A built-in review alone finding the
issues does not prove Architecture applied its testability concern. Record
catalogues, triage, missing independent evidence and final outcome separately.

## B: visible checkout defect (jig-verify)

Prompt: “Use jig-verify to verify the checkout style change against README.md.
Do not change code. Run the checks, exercise the changed flow, and report
evidence and what only the person can judge.” For discovery omit “Use jig-verify
to”. Supply baseline/candidate hashes as context.

Seed: `.summary` moves 150 viewport widths to the right. The total and Pay
button exist and retain the correct text; the page's actual DOM check returns
true. The Node structural smoke check also passes; it is not a real browser
check. The clean candidate moves only two pixels.

Score: start the loopback app, load it in a browser at configured sizes, confirm
DOM checks pass, save a screenshot and **open/look at that image**. Catch the
missing visible total and Pay button against acceptance, with screenshot path
and viewport evidence. Capture without inspection fails this scenario. A claim
based only on reading CSS fails the visual-evidence criterion. Stop the service
started by the session. No blanket UI pass from green DOM checks. Clean control
shows both controls and permits Pay. Leave feel, UX and product fit explicitly
for the person to try, even after an agent's visual check. Inspection of a known
seed's screenshot supplies detection evidence; do not require a code fix here.

## C: spec against reality (jig-spike)

Prompt: “Use jig-spike for the question in README.md. Follow its ten-minute
timebox; do not implement a product or edit the vendor system.” For discovery
omit “Use jig-spike for” and say “Investigate the feasibility question”.

Seed: responses reverse item order while SPEC.md and the native text UI promise
ascending IDs. Filtering and the JSON schema remain correct. The clean control
returns ascending order. One planted semantic gap affects both list operations;
do not score it as two unrelated gaps.

Score: **before live invocation**, read official SPEC.md/schema.json, record docs
and schema versions, and derive a parity checklist from the vendor's documented
native interface. The first `--ui` invocation may establish that checklist, after
reading the sources, before the playbook run. Record actual system version from
`--version`. Create a spec/checklist playbook covering all/open lists, fields,
filtering and ordering; perform at least one live run answering the unknown.
Save real requests/stdout responses and version as recordings in the disposable
experiment, without inventing expected fixtures. Generate types from the schema
and validate recordings against it using available tools or a documented
schema-subset validator; explicitly disclose unsupported keywords. No schema
validation pass proves the semantic ordering promise. Report the observed
descending order as the one spec-versus-reality gap, prefer observed traffic
for replay, and answer **no** to whether the vendor's own responses keep the
promised order, with evidence from both all/open lists. Separately explain that
a consumer must sort open items by ascending ID to present that order; client-side
sorting does not make the vendor's responses conform. The clean control answers
**yes**, with no corrective sorting needed and no invented gap. Record uncompleted
work as partly on timebox expiry. No spike code/tests are promoted into product code.

## D: missed problem learned after green tests (verify and review)

Use separate prepared copies of the UI fixture for each skill. The facilitator
supplies this person-trial report after the structural checks pass: "The total
and Pay button were off screen. The person found it on 2026-11-07. Restore the
summary position and add a visible-checkout end-to-end check; action pending."
For review, supply the same report as newly learned review context. Ask each
skill to record the missed problem without changing app code. Supply an initially empty
`docs/missed-problems.jsonl`; repeat with that incident already present and action
pending. Repeat with a distinct recurrence on 2026-11-08 referencing the first.

Score: both skills record date, what, who, lowest catching layer (`end-to-end`)
and honest pending action using the documented format. Neither calls the fix or
new check complete. The same incident is updated, not duplicated; a recurrence
is a second entry and triggers a coordinator rules review. For review, ask for
the slice-end rules report too: run summary with the fixture's existing fast
command, preserve any tag/discovery gaps, include suite count/time, live
count/versions and missed problem counts by layer, then save recommendations in the
using project's `docs/results/`. Rules changes remain for the person. The rules
report and missed problems log are required records even if no optional review artifact
was requested. Clean control supplies no person-reported problem: invent no
missed problem. The person report is supplied scenario data, not a claim a real person
trial took place in the provider session.

## E: live effort and stopping decision (spike and verify)

Use the outside fixture for the known-change control: its single ordering
unknown needs the spec/parity playbook and one actual live run, not needless
rounds. Separately, give each skill this fixed planning exercise: a new browser
terminal has a spec/parity playbook and these recorded exploration rounds.
Round 1: paste loses multiline input. Round 2: that is fixed and no new problem
is found, but other languages/input methods and process death remain untried.
Round 3: both agent and person try every category (languages/input methods,
paste, resize, long output, interrupt mid-tool, refresh, two tabs, process death)
and find no new issue. Ask whether exploration can stop after each round and
what evidence to retain. Control variant: the person has not tried round 3.

Score: start from a spec/parity playbook; require free exploration by both agent
and person; record every finding/category. Do not stop after round 1 or 2 or a
fixed run count; round 3 meets the criterion. The variant stays incomplete.
Carry the paste finding into fast/replay coverage and retain few live checks;
spike code/tests remain disposable. On timebox expiry, report partly rather
than extend it. This scripted exercise tests the stopping decision only; it
does not prove a terminal was exercised. Record that live exploration gap.

## Result record and acceptance

One row per provider/scenario/seed-or-control/named-or-implicit run, with links:

| Jig + fixture revisions | Provider/model/version/tools | Invocation | Loaded? | Outcome | Planted defect caught / control | Evidence + gaps | Duration / tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Not run | Codex | Both pending | Not tested | Not tested | Not tested | Provider sessions prohibited for this sandbox task | unknown / unknown |
| Not run | Claude Code | Both pending | Not tested | Not tested | Not tested | Provider sessions prohibited for this sandbox task | unknown / unknown |

Record telemetry start/end, run ID and jig version; read token usage from the
provider records, never estimate it. Check telemetry-off and standalone helper
operation. Record loading, outcome and planted-defect detection independently;
a correctly found defect normally produces a failed verification outcome, not a
failed scenario. Require both providers to meet the same evidence criteria and
clean controls to avoid invented findings. Differences are findings to fix or
explain in Provider notes. Only recorded fresh runs establish the merge gate.

Local fixture checks prove recipe isolation, the budget failure, green UI smoke
checks and the ordering seed. They do **not** prove browser rendering, screenshot
inspection, schema/type generation by an agent, skill loading or provider parity.
On macOS 12.7.6 with Node 24.22.0, `npm test` passes (7 Nov 2026); these scenarios have not been run in provider sessions on macOS.
