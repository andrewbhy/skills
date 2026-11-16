---
name: "jig-plan"
description: "Write a one-page build plan and coordinate its plan check before a sizeable build, any UI/product slice or new module/contract. Supports existing OpenSpec projects; records exemptions for small fixes and spikes."
---

# jig-plan

Work mode: in a project that is not one of the person's own registered projects, write plans, results, reviews and design notes under the personal jig store (`~.jig<project>plans`, `results`, `design`), never into the repository, unless the person says otherwise; the helpers already keep their own state there.

Scenario status: fresh two-provider runs are pending; local checks do not
prove instruction following. See the project's plan scenarios.

Start/end telemetry with the helper beside this skill; retain the run ID and
report partly for missing review evidence. Unknown provider tokens stay unknown.

1. Settle intent from the request, rules and ADRs: what changes for the person?
   Read [plan-format.md](plan-format.md) and its JSON section list. Require a
   plan for builds over about 30 minutes, any UI/product slice and new modules
   or contracts. Timeboxed spikes, one-file fixes, coordinator edits under about
   10 minutes and explicit person skips may use a recorded exemption reason.
   Do not turn exemptions into fabricated review passes.
2. Run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/missed-problems.mjs" --area <area>' for every
   affected area (design, runner, skills, "product slice"). Read relevant
   incidents; carry IDs, lessons and printed named checks into executable
   assertions with evidence. Explain exclusions. Missing history is unknown;
   open repeats block until an incident-linked rule review exists. Use
   jig-correct (if installed; otherwise use your own equivalent and record which) for recording corrections; preserve the helper's CLI unchanged.
3. Write a one-page plan with exactly the headings in the format: visible
   intent; observable acceptance; short named WHEN/THEN requirements; scope;
   out of scope; contracts; thin visible slices with minutes and checks,
   riskiest unknown first; verification by cheapest sufficient layer, expected
   time and independent acceptor; missed problems; plan-check outcome.
   Declare Kind on Intent's first line (build, ui, product, module or
   mechanical); size is the Slices minute total. For plans needing review, add
   Success measures: Goal, Outcome, Metric, Tier, Baseline, Target, When, Source;
   at most four complete one-line rows. Mechanical plans and totals under
   30 minutes may omit it; no Kind is legacy. Prefer tier 1 direct metrics,
   then tier 2 research-backed proxies with a source, then tier 3 structured
   judgment by the person. Pick from [measures.md](measures.md); use the same
   Goal ID (G1, etc.) for a judgment and its measurable proxy, never match
   by outcome text.
   For Kind ui or product, Intent must include `Top task:` in the person's
   words and `First walk: slice <number>` naming the earliest working task walk.
   Walk that slice before polish; missing either line blocks brief-check.
   For a ui plan, list the workflows first (task, steps, decisions, entry/exit)
   and the person's monitors and scaling; each slice names the workflow step it
   serves and is accepted by task walkthrough, with proxy metrics only as
   support. If the person has no stated vision, derive it from use evidence
   and mark decisions provisional (see jig-mockup (if installed; otherwise use your own equivalent and record which), Workflow gate).
   A game or interactive UI also needs the agreed interaction language and a
   core-loop storyboard before scene code; the person's walkthrough accepts it
   (see jig-mockup (if installed; otherwise use your own equivalent and record which), Game and interactive UI).
   A ui, product or game plan cites the jig-interaction (if installed; otherwise use your own equivalent and record which) spec path and its
   top-task budgets in Acceptance and Verification plan; a failing layer (a) blocks OK.
   Keep commands, widths and project facts in project configuration. Never
   substitute a different artifact to close feedback on the intended result.
   For each tier 3 goal, read [glossary.md](glossary.md) and use explicit
   personal and optional project glossary paths. Project entries override.
   Run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/goal-translate.mjs" --plan <plan.md> --glossary
   <words.md> [--project-glossary <project-words.md>]'. Known confirmed words
   yield linked rows and a cited entry/date; show one line per goal:
   "By '<word>' I will measure: <measures>. Your verdict stays final."
   Cite the entry/date for confirmed meanings; do not ask for confirmation of
   an already confirmed meaning. New words use catalogue templates first,
   at most three measures per word, marked draft. If no template fits, make
   at most one cheap-model call per new word outside the helper, or report
   the gap; ask once to confirm the named measures. Only the person confirms
   a glossary meaning. After confirmation update its status/date in the
   explicit glossary and regenerate rows; drafts never lower ambiguity.
   Settle generated baseline/target placeholders before launch. Keep Source
   markers and Goal IDs intact. Existing and translated rows together must
   fit four rows; on refusal merge goals rather than silently dropping rows.
4. If openspec/ exists, write an OpenSpec change: proposal, tasks, delta specs
   and the complete jig plan in design.md. Use
   'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/openspec-plan.mjs" <root> <change-id> <capability> <plan.md>'
   for a new capability; existing changes or modified/removed requirements need
   deliberate manual deltas. Never run init or touch OpenSpec/provider tool
   files, config or standing specs. With no openspec/, keep one Markdown plan.
5. Run jig-review (if installed; otherwise use your own equivalent and record which) [plan mode](plan-mode.md): fixed signals select seats;
   testing, cost and history always run. Use independent already authorized
   fresh cheap contexts in parallel, fixed three-question checklists, about
   100 words per seat and under three minutes total. No context or timeout
   means BLOCK. Coordinator records results, edits and outcome; builder and
   coordinator never accept. Recheck affected seats after material edits.
6. Run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/brief-check.mjs" --workspace <job-root> <brief-or-plan.md>' before
   handing work to a launcher. Exit 1 names refusal reasons; exit 0 checks
   structure only, never grants launch, acceptance or merge authority. A
   launcher must call it separately because skills can be skipped. Pass the
   same --glossary and --project-glossary paths to brief-check. Relative plan
   links resolve from --workspace; local absolute paths work; missing targets
   refuse. Record the printed ambiguity line in Plan-check outcome (distinct
   tier 3 goals lacking a tier 1/2 row with the same ID / all distinct goals),
   or explain why no score is available. Missing/invalid measures and a share
   >= 0.5 warn by default; existing structure errors still refuse. Only after
   a retro may the person choose plan.ambiguityGate=block or change
   plan.ambiguityThreshold (0 to 1) in project configuration. Defaults work
   without configuration. Do not invent collection evidence or review passes.

After all seats return OK, record the outcome with `plan-seats.mjs --outcome`
and JSON fields outcome, item, plan (absolute path), reasons and seats. The
receipt in the jig store records plan, sectionsHash, outcome, seats and at.
Checked sections are Intent, Acceptance, Requirements, Scope, Out of scope,
Contracts, Slices, Verification plan, Missed problems and Success measures;
editing these invalidates the receipt hash. Outside prose and outcome notes
do not affect the hash.

## Retro signals

Own plan-block. Record skill-gap and skill-misguided for the coordinator in
the same reply turn, including skill and proposedFix. Read signal-kinds.md
for the single owner of each kind; project work stays in private stores.
Before planning a skill change, list --level jig and list --level project,
then filter unconsumed skill-gap and skill-misguided by the skill being
planned. Include environment-level records from the project store when
applicable; unavailable stores are gaps. Carry their IDs into the plan and
consume <plan-link> <ids...> only when that plan addresses them.

After aggregating plan seats, call plan-seats.mjs --outcome with JSON
{"outcome":"BLOCK","item":"plan reference","reasons":["blocking reason"]}
or outcome OK with an empty reasons array. The outcome step writes exactly
one plan-block for BLOCK; do not add a second agent record. A missing seat is
BLOCK. brief-check records broken-brief itself. These records grant no
acceptance authority. Keep work detail in private project/environment logs;
jig-level records describe harness behaviour only.

Hand-off: use jig-pr, if installed; otherwise give Why, What changes (before/after table), How, Verify (receipt first), Open in that order.

## Provider notes

- Codex: load the canonical skills/jig-plan source; telemetry provider
  is codex. Authorized subagents may isolate plan seats; missing authorization
  leaves seats pending. Do not start provider sessions on your own.
- Claude Code: load the generated .claude/skills/jig-plan pointer and resolve
  helpers at its canonical target; telemetry provider is claude. Authorized
  Task contexts may isolate seats; unavailable contexts leave seats pending.
- Both: run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/telemetry.mjs" start "<project-root>" <provider>'
  and 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-plan/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>'.

Requirement/scenario layout adapted from OpenSpec 1.16.1 (MIT); full notice in
[NOTICE](NOTICE). No third-party skill is installed or executed.
