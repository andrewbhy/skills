# jig-review provider scenarios

Also run the fixed [visual state and seat scenarios](visual-review-scenarios.md)
for split UI seats, independent fidelity and finding-source discipline.

Status: revised scoring needs fresh provider runs; local checks alone do not suffice.
Do not claim provider parity or merge readiness from `npm test`.

Run each scenario in a fresh isolated project, once per provider with the skill
named, and once without naming it to check discovery. The person must authorize
provider sessions; the skill never launches them on its own. Keep this guide
and `prepare.mjs` outside the project supplied to the session.

## Preparation

1. The coordinator moves `skill-drafts/jig-review/` to `.agents/skills/jig-review/`
   and runs `node scripts/sync-skills.mjs`, then `npm test`. The draft location
   is a sandbox handoff, not a second canonical source. Do not keep both.
   The sync script generates the pointer, VERSION, telemetry and diff-signals
   helpers. No manual provider-specific copy is maintained.
2. Create a new destination under a scratch parent outside the fixture sources:
   `node tests/fixtures/review/prepare.mjs <mechanical|business|dependency> <new-directory> --seed`.
   It creates an isolated Git repository with baseline and candidate commits,
   printing JSON with `base` and `revision`. Existing destinations are refused.
   Omit `--seed` for the clean control. No install or network is needed.
3. Mount the generated skill and its supporting files in normal discovery
   locations, along with `jig-verify` for the QA seat. Confirm pointer drift
   checks pass in the jig checkout. Keep the fixture base and revision unchanged
   while reviewing. Give the session those hashes, its task README and the prompt,
   never the seed instructions or scoring notes.
4. Authorize the required independent built-in review sessions separately. For
   the risky dependency scenario both providers are required; if unavailable,
   record that gap and a partly outcome. No substitution of a different diff.

Use the same jig revision, fixture recipe, model choices, tools, prompts and
budget for the two providers. Also run clean controls and, when changing this
skill later, compare with the unchanged skill on the same inputs. Record cost
as well as detection; matching wording is unnecessary.

## Mechanical rename

Prompt: "Use jig-review to review base `<base>` to revision `<revision>` against
the task in README.md. This should be a mechanical rename. Do not fix the change
or save a report."

Seed: the export was renamed, but the command's import and call were left stale.
The command fails with a missing-export error. The clean control renames both.

Score: triage calls this trivial or mechanical with a one-line reason; AI review
is sufficient for the technical judgement, without unnecessary product/design
seats. Fixed floor is trivial: judgement can raise it to mechanical. Built-in
correctness review catches the stale import at `cli.mjs:1`; classify its actual
impact, before merge. A low floor does not dismiss a broken command. An AI-only
merge suggestion remains conditional on checks and an existing standing rule.
Clean control has no invented business-rule fault. `node --test` fails on the
seed and passes clean. Do not supply this oracle to the reviewing session.

## Business-rule acceptance

Prompt: "Use jig-review to review base `<base>` to revision `<revision>` against
the campaign task and acceptance checks in README.md. Do not fix the change or
save a report."

Seed: the threshold changes to `> 100` instead of `>= 100`. A customer at exactly
100 loses the promised discount. The clean candidate includes the boundary.

Score: the script floor is risky for pricing; judgement cannot lower it. Product
and QA seats are required by the fixture configuration.
Product reads VISION.md from the configured vision and compares acceptance,
reports `pricing.mjs:2` and the broken boundary as a finding before merge.
QA can prove it with the existing failing boundary assertion. Do not count a
built-in-only finding as proof that the product seat checked acceptance.
The report retains each finding's discovering seats, deduplicates the same
boundary fault, and separates severity from priority. `node --test` fails on
the seed and passes clean; no human product pass is invented.

## New dependency

Prompt: "Use jig-review to review base `<base>` to revision `<revision>` against
the dependency task and policy in README.md. Do not install anything, fix the
change or save a report."

Seed: the added dependency uses `^1.3.3`, breaking the exact-pin rule. Clean
control uses `1.3.3`, which still raises the dependency concern and risky floor.

Score: fixed dependency signal raises triage to risky and requires security and
architecture. Request both built-in reviews on the same committed revision.
Architecture or security identifies the range in `package.json` and names
README.md's exact-pin rule, with a before-merge priority. Review maintenance,
licence, size and transitive cost or explicitly report missing evidence; never
invent package facts. Pinning alone does not make a new dependency trivial.
No runtime installation is needed. Clean control must not report a range fault.

## Record and acceptance

Record one row per provider/scenario/control/invocation mode, plus evidence links:

| Jig/fixture revisions | Provider/model/version/tools | Named or implicit | Loaded? | Class floor / triage / seats | Severity / priority | Outcome | Defect caught / clean control | Tokens | Evidence/gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not run | Not run | Not run | Not tested | Not tested | Not tested | Not tested | Not tested | unknown | Provider sessions intentionally not launched |

Record start/end timestamps, duration, run ID and jig version from matching
telemetry markers; confirm helpers work without a jig checkout. Check telemetry
off creates no markers. Token counts come from provider records via the telemetry
report, never the agent's estimate. Unknown stays unknown.

For matching provider runs, require agreement on the script class floor and on
priority for each matching finding, including planted defects. Require severity
within one level on the ordered rubric Low, Medium, High, Critical.
Both must retain at least the fixed floor and all
required seats. Record the one-line harm and rubric example for borderline
severity; a difference of two or more levels fails scoring.

Count evidence-backed extra findings as valid, even when not planted (e.g. a
removed acceptance assertion); only unsupported or incorrect findings are noise.

Every seat produces its own catalogue, including an empty one; each established
issue has Critical/High/Medium/Low severity, before merge/soon/later priority,
and a file/line or rule/ADR. The merged report groups severity and names the
discovering seats/reviewers. A Low finding never blocks alone. Reports stay in
the response unless opted in; on a separate opt-in run check both Markdown and
JSON are saved only under the configured project-relative report directory.
No run approves, merges or deploys. Provider differences or missing required
reviews are findings/gaps to fix or explain, not parity. Only the coordinator's
recorded fresh-session results establish the two-provider acceptance gate.
