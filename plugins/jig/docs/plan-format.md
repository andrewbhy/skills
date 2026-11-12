# Build plan contract, version 1

The JSON-checkable section list is [plan-sections.json](plan-sections.json).
Use its required level-two headings, each once, with nonempty content, plus
the conditional Success measures heading described below; the
[complete fixture](../tests/fixtures/plans/complete.md) is a format example,
not a real review. Keep the plan about one page. No runtime dependency is needed.

Intent states what the person will see. Acceptance is observable. Requirements
use named requirements and short WHEN/THEN scenarios (OpenSpec 1.16.1's format;
see [attribution](borrowed.md)). Scope and Out of scope state the boundary.
Contracts name inputs, outputs, failures and compatibility. Slices give minutes,
visible results and checks, riskiest unknown first. Verification plan is a table
with Risk, Check, Layer, Expected time and Acceptor columns; every row is filled.
For checks above unit/replay, say why a lower layer cannot catch that risk.
Missed problems cites relevant incident IDs, named checks and exclusions, or
records unknown history. Plan-check outcome records selected/skipped seats,
reasons, exact reviewed plan revision/hash, results, time and known token use.
Its final line is `OK: <resolved review summary>` or `BLOCK: <gaps or pending seats>`.
A BLOCK line that says seats, recheck or person input are `pending` is a valid
draft: brief-check prints `draft: pending`, exits 2 and logs no signal. Any other
BLOCK, or a missing or malformed outcome, exits 1 and logs `broken-brief`.
After material edits rerun affected seats and update the recorded revision.
Do not put a literal outcome line inside the bytes whose hash it records;
hash the plan up to, but excluding, the Plan-check outcome section.

Run `node scripts/brief-check.mjs <plan.md> [more.md ...]` before launching.
Exit 0 means structurally complete with an OK outcome; exit 2 means a valid draft
with pending seats (not launchable); exit 1 means refusal
with reasons, including unreadable files or invalid invocation. This read-only
check launches nothing and validates neither review truth nor authority.
A launch brief has Intent, Acceptance, Scope and Plan headings. The latter
contains exactly `[Plan](local-plan.md)` on its own line; the checker reads
that plan, including an OpenSpec change's design.md. Inline full plans also work.
A launch brief handed to a builder or reviewer ends with a required telemetry
line: run the followed skill's `telemetry.mjs` start before work and end before
reporting (jig-orchestrate's `delegate-brief.mjs` renders it).
Launchers must invoke the checker; optional skill text cannot enforce launch.
Use `node scripts/brief-check.mjs --workspace <job-folder> <brief.md>` when the
job runs elsewhere. Relative plan links resolve from that folder; without the
option they resolve from the brief's folder. Absolute local paths are accepted,
including drive paths on Windows; URL schemes are refused. Input brief paths
remain relative to the command's working directory. Missing targets fail.

## Success measures

On Intent's first line declare `Kind: build`, `Kind: ui`, `Kind: product`,
`Kind: module` or `Kind: mechanical`. No Kind means legacy: no measures check
and no ambiguity score. Size is the sum of minute timeboxes in Slices, never a
second size declaration. Mechanical plans and totals under 30 minutes may omit
Success measures; other declared plans require it (30 minutes is not under 30).
Do not add it to small mechanical changes just to satisfy a template.

Use these eight columns in order, one to four data rows, each complete row on
one physical line. Use numeric tiers, IDs `G1`, `G2`, etc., and nonempty cells;
write `unknown` for an unavailable baseline and explain how it will be gathered.
Avoid literal pipes in cells. A tier 3 row and its proxy share a Goal ID, even
if their outcome wording differs; identical outcome text never links goals.

| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |
|---|---|---|---|---|---|---|---|
| G1 | Reliable plan links | broken-link incidents | 1 | 3 | 0 | next retro | incident log |

Tier 1 is a direct metric of the stated outcome. Tier 2 is a research-backed
proxy: cite its source and explain the connection to the goal. Tier 3 is the
person's structured judgment: name a rubric, checkpoint and recorded decision.
Prefer tier 1, then tier 2; use tier 3 where needed and seek a measurable proxy.
Choose from [the measures library](measures.md), collecting only what is useful.
Source identifies the evidence location; for tier 2 include the research link.
Each plan-check seat proposes tier 1 or 2 measures for its own discipline;
product proposes a proxy for every tier 3 goal, retaining judgment where useful.
Fit chosen measures into four rows rather than copying every proposal.

For a valid table, brief-check prints `ambiguity: N of M goals unmeasured`.
M is the number of distinct Goal IDs; N counts those with tier 3 but no tier 1
or 2 row. Missing or malformed tables have warnings and no fabricated score.
Plan-check outcome records this line, or why no score is available. At retros,
compare it with missed problems and rework before proposing threshold changes.

The default gate is soft: missing/invalid measures and a share at or above 0.5
warn with exit 0; existing structural refusals still exit 1. The person may
tighten the gate after a retro with `.jig/config.json`:

```json
{"plan":{"ambiguityGate":"block","ambiguityThreshold":0.5}}
```

`ambiguityGate` is `warn` (default) or `block`; `ambiguityThreshold` is a number
from 0 to 1, compared with `>=`. Block mode refuses measure defects and shares
at or above the threshold. Missing config uses defaults; invalid values fail.
Config is read from `--workspace`, or the command's working directory otherwise.
Legacy plans remain exempt even in block mode. Passing is never acceptance.

## Goal translations

Use [the glossary format](glossary.md) with explicit personal and optional
project paths. Run `node scripts/goal-translate.mjs --plan plan.md --glossary
words.md [--project-glossary project-words.md]` before choosing proxies for
tier 3 goals. Project entries override personal entries, including drafts.
The helper prints rows with the same Goal ID and one confirmation line per
goal. It refuses if existing and generated rows together exceed four; merge
goals instead. Each word supplies at most three measures. A missing template
leaves a draft gap; there are no model calls inside the helper.

Keep the helper's `glossary:word; source` or `draft:word; source` Source marker.
Pass the same paths to brief-check with `--glossary` and `--project-glossary`.
A glossary proxy counts only when the entry is confirmed, the exact metric,
tier and source match, and its Goal ID links to a tier 3 goal using that word
in this plan. A copied link from another plan cannot supply that goal.
Draft markers, missing entries and unconfirmed entries never lower ambiguity;
they warn by default and refuse in block mode. After the person confirms a
draft, update its status/date in the explicit glossary and regenerate rows.
Ordinary direct metrics retain their existing same-ID contract.

Targets and baselines in generated rows are placeholders to settle before
launch. A confirmed meaning and a low ambiguity score do not establish that
the target was met. Record the person's verdict separately from the measured
result; a not-met verdict always prevents acceptance even if measures pass.

Plans are required for builds over about 30 minutes, any UI/product slice and
new modules/contracts. Timeboxed spikes, one-file fixes, coordinator edits under
about 10 minutes and explicit person skips are exempt under suite QA. Record
the exemption reason in the launch record; do not forge an OK plan. Exemptions
are handled by the launcher, not by bypass flags in brief-check.

Plan signals are explicit boolean fields: ui, module, contract, behaviour,
security, data, dependency. Run `node scripts/plan-seats.mjs '{}'` with the
triaged signal object to get fixed required seats and their checklists. Judgement
can add seats, never remove a fixed seat. Testing, cost and history always run.
Each authorized fresh cheap seat answers its three questions with evidence,
BLOCK or OK, gaps and edits in about 100 words, in parallel. The coordinator
records the result; builder and coordinator cannot accept. Under three minutes
total: timeout or unavailable context means BLOCK, with pending seats named.

When openspec/ exists, use proposal.md, tasks.md and specs/<capability>/spec.md
inside openspec/changes/<change-id>/; design.md carries the entire jig plan.
Use ADDED/MODIFIED/REMOVED Requirements delta sections with named requirements
and level-four scenarios. Never run init or modify config.yaml, tool files,
existing specifications or existing changes. The writer refuses collisions.
Review/update an existing change deliberately by hand instead of overwriting it.
