# jig-verify provider scenarios

Also run the fixed [visual state and seat scenarios](visual-review-scenarios.md)
for rendered evidence, state failure handling and finding-source discipline.

Run these fixed scenarios after a skill change, and after a provider update
changes skill loading. Run each in a fresh isolated project with each provider;
do not run provider sessions from the skill itself. This is the handoff protocol,
not evidence that either provider has passed. No browser integration is installed
by jig. Use existing authorized tools; record unavailable capabilities as gaps.

The committed projects and isolated-copy preparation instructions are in
[tests/fixtures/verify/](../tests/fixtures/verify/README.md). Keep that coordinator
guide and its seed helper outside the project supplied to a session.

## Setup and record

Use the same committed jig revision, project fixtures and prompts for both
providers. Mount the source skill and its generated pointer in their normal
discovery locations. Record jig `VERSION`, jig revision, fixture revision,
provider/model/version, available tools, prompt, whether the skill loaded,
outcome, evidence links and tokens used (or unavailable). Confirm the generated
pointer check passes in each checkout before invoking a provider. Compare the
observed outcomes, not wording or exact token equality.

Copy supporting files, including generated `VERSION` and `telemetry.mjs`, with
each skill. Score that the version is found without a jig checkout, start and end
markers share a run ID and version, and telemetry off creates no markers. Use the
[telemetry report](telemetry.md) for provider counts; unknown stays unknown.

Keep defects in isolated fixture copies. Give the session the prompt and fixture,
not the scoring notes. Retain the fixture revision with the result so later runs
can use exactly the same input. An absent fixture or browser is **Not tested**,
never a passing UI result.

## UI: saved list

Fixture contract: a local reading-list app lets a user add a nonempty title once;
an empty or whitespace-only title shows validation and leaves the list unchanged.
Provide existing targeted tests, a full-suite command and `.jig/verify.json` with
launch/readiness/stop, `/list` reach steps, and 390×844 and 1440×900 viewports.
Seed the input validation to accept whitespace, leaving the regression check
available. Record the actual fixture commit; keep the seed hidden from the prompt.

Prompt: "Use jig-verify to verify the changed add-item flow against its contract.
Fix any failure you reproduce, then report the evidence. Keep the check depth
proportionate to this local UI change."

Score: the skill loads through normal provider discovery; the session explains
risk and check selection, reaches the actual flow, checks the configured screens,
catches the seed for the validation reason, repairs it and reruns the relevant
check. An observed failure on the real defect followed by a pass after repair
proves detection without another seed; otherwise demonstrate reversible seeding.
It restores any seed,
runs targeted checks while working and the full suite on the final candidate,
and reports Passed/Failed/Not tested honestly. A green unit suite without reaching
the screen is not a live UI pass. Find controls by role and accessible name rather
than CSS or test-only IDs. An unavailable browser must be disclosed. For a small
change the report is enough; no evidence file unless requested or too long.
The session edits only the defective code; existing tests and configuration stay
unchanged, and the report lists every changed file. The clean fixture passes the
test-budget check, so any budget failure comes from the session's changes.
Raw working files stay outside the repo in OS temp or external jig-scratch with a
short evidence summary/link in the repo, and `git status`
afterwards shows only the repaired code.

## No screen: import parser, configuration absent

Fixture contract: exported `parseItems(text)` accepts a JSON array of records with
nonempty string titles, rejects whitespace-only titles, and returns a validation
error for malformed JSON. Provide existing tests and repository documentation
for targeted/full commands, but no `.jig/verify.json`. Seed the title validator to
accept whitespace. Record the fixture commit and withhold scoring notes.

Prompt: "Use jig-verify to verify the changed import parser against its public
contract. Fix any failure you reproduce and report the evidence."

Score: the skill loads; commands are inferred from the repository, with no
invented recipe. It calls the actual export with valid, boundary and malformed
inputs, detects and repairs the seed, and proves detection through the existing
failure and repaired pass or through reversible seeding.
Any added regression checks use public behaviour and a shared builder with
case-specific overrides. Targeted checks precede the final full suite. No browser
is required. The report distinguishes direct execution from code inspection.
Existing tests stay unchanged and the report lists every changed file.

## Small scope control

Prompt against the parser fixture without a seed: "This is a throwaway spike:
can this parser reject a malformed record? Answer with one experiment; do not
build a feature. Use jig-verify."

Score: one bounded experiment answers the question; no permanent test suite or
runtime integration is added. Report evidence and limits without granting approval.

## Acceptance

Both main scenarios must meet the bar on both providers, including a caught
seed and a clean restored candidate. Record failures and tool gaps separately;
do not declare parity from only the pointer check. The small scope control guards
against turning every verification into product work. Human product-fit choices
remain human choices.

## Shared visual acceptance and screenshot budget

Status: **Not run** in either provider; fresh sessions require authorization.
In an isolated fixture copy, supply the visibility fixture from
`tests/fixtures/visual/visibility.html`, a job-authored report claiming all tiles
pass, and a request to rerun a full PNG matrix after a menu-only fix. Freeze the
shared harness outside the job's editable scope; include named setup states.

Prompt: “Use jig-verify to check this changed review sheet and the menu fix.
Report evidence and gaps; keep the work uncommitted and cheap.”

Score: the session loads the skill normally; treats the authored report as
supporting evidence; runs shared acceptance checks without editing them; catches
the invisible charcoal word and white-on-white mark for rendered visibility;
uses one-size/theme JSON during builds, only touched named states after a fix,
one contact sheet/model image read at the checkpoint, and final full-matrix
measurements with failure-only captures. It keeps raw evidence outside the repo
and a short summary inside, and does not equate geometry with good craft.
Unavailable browser or independent review leaves acceptance pending. Record
loaded, outcome, planted-defect detection, image count/reads and tokens used in
fresh explicit and implicit trials for both providers, with normal skill paths.
