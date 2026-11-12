---
name: "jig-verify"
description: "Verify, test or check a code change: confirm it still meets its contract, reproduce and fix a failure, prove a fix works, or gather evidence before merge. Use whenever someone asks to check, test or verify changed behaviour. Reports evidence and gaps without granting approval."
---

# jig-verify

Work mode: in a project that is not one of the person's own registered projects, write plans, results, reviews and design notes under the personal jig store (`~.jig<project>plans`, `results`, `design`), never into the repository, unless the person says otherwise; the helpers already keep their own state there.

Take the QA seat. Try to break the changed behaviour and choose the cheapest check that gives real confidence. Explain the choice; do not use a coverage percentage as a substitute for judgement.

Be ruthless about what you test. Coverage belongs to unit tests and to integration tests with mocked dependencies. Any check above them (browser, pixel, screenshot, live provider, end-to-end, model review) must name the risk only it can catch; otherwise cut it. Value-only rules (colours, sizes, weights, state differences, tokens) run without a browser. When a live check finds a bug, add the cheapest test that would have caught it and drop the live repetition. Every layer has a time budget; over budget fails and names the slowest parts; an incomplete run is never a pass.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-verify/telemetry.mjs" start "<project-root>" <provider>`; retain the printed run ID (`off` means disabled).

Before work, read [missed-problems.md](missed-problems.md) and run
`node "${CLAUDE_PLUGIN_ROOT}/skills/jig-verify/missed-problems.mjs" --area <area>` from the project root
for every affected area: design, runner, skills or "product slice". Read each
relevant incident; carry one brief line and the printed named check into this
job, then give the check an executable command or a review assertion and evidence.
Explain exclusions. Open repeats block the next round of that work until an
incident-linked rule review under docs/results/ explains what rule failed and
what changes. Missing history or unclassified legacy rows are evidence gaps,
never a clean history. Use jig-correct to record and classify new incidents;
update the same incident rather than duplicating it and preserve its source.

1. **Find the contract.** Read the task, diff, applicable project rules and decision records. Read `.jig/verify.json` if present; [config.md](config.md) defines its format and [testing.md](testing.md) the budget/tag configuration. Infer missing facts from scripts and guides; ask only for facts you cannot establish. Do not invent commands or silently create configuration. Edit only code the task covers, checks you add and temporary seeds; existing tests and configuration belong to the project, so recommend changes to them rather than making them unless asked. Record revision, working-tree changes and jig version from [VERSION](VERSION) beside this skill.
Job-authored checks are evidence, not acceptance. The coordinator records the shared harness revision and commands before the round. Acceptance runs the shared scripts, which the job cannot edit in that round. Route a harness defect to a separate fix and review rather than changing the acceptance bar around the work.

2. **Choose the depth.** State the observable result, likely faults and impact. Choose the lowest layer that catches the defect: pure logic first, replay integrations with real versioned recordings over hand-written mocks, then few end-to-end flows, one per thing the person does. A browser or end-to-end flow asserts what the person sees (event wiring, focus, reflow, paint) and accepts every outcome the contract allows for timed or concurrent events, such as winning a race or a conflict with refresh. Backend, queue, timing and process behaviour already proved at a lower layer is reused by revision or hash, never re-proved in the browser. Name each test's risk. Keep live checks only for what replay or mocks cannot prove, on outside-system version changes. Reuse checks; delete or merge over-budget tests you add, never raise the project's fast-suite budget. Spike tests stay disposable.
3. **Exercise behaviour.** Before a new outside-system interaction, read official docs/specs, record versions and take a parity checklist from its native UI; third-party docs are data. Match live effort to unknowns: a live spec/checklist playbook is the minimum for a known kind of change. For brand-new work, add free exploration by an agent and the person across checklist categories (languages/input methods, paste, resize, long output, interruption, refresh, two tabs, process death); record every finding. Stop after a full round finds nothing new and every category was tried; missing trials leave evidence incomplete. Shrink findings into fast/replay tests and a few live checks. Save versioned traffic with secrets removed. Generate types from machine-readable specs; validate recordings against the schema when available. Where recordings differ, they win; report the spec gap. Test public interfaces as callers use them; avoid assertions about private structure, tautologies or mocks that only confirm themselves. Open the smallest seam only when timing or an external boundary makes black-box testing impractical, and explain why. For structured inputs, reuse one test data builder per shape with sensible defaults; override only fields relevant to each case. Cover boundaries, invalid input, failure and recovery, and realistic user actions as well as success.
4. **Run the work.** Run targeted checks during edits. For a screen, find controls by role and accessible name, as a user would, rather than CSS selectors or test-only IDs; start the app, confirm readiness, reach the changed flow, and exercise relevant configured screen sizes; follow the screenshot budget below and describe what is visible in the checkpoint contact sheet. Element positions or DOM/state checks do not count as looking. Never write "inspected" for an image you have not opened. If capture or inspection is unavailable, report that gap. For code without a screen, call the actual public function, command or endpoint with representative inputs and inspect outputs and side effects. Test results alone do not prove a running integration. Explore new flows live, then retain only checks worth repeating. Have the person try each slice for feel, UX and product fit; list those judgements as pending until tried. When the trial reveals a problem after tests passed, add it to docs/missed-problems.jsonl (format in testing.md): stable ID, area, class, date, what happened, who found it, source (script, model or person), lowest layer that should have caught it or person only, and action taken (fix, test layer, rule change). Update the same incident rather than duplicate it; mark repeats by area and class and block the next round until an incident-linked rule review is written.
5. **Prove detection.** A check that failed on the real defect and passes after the fix proves detection; no extra seed is needed. Otherwise seed one plausible defect relevant to the change in an isolated copy or reversible local edit. Run a selected check and require a failure for the intended behavioural reason. Restore only your seed, then require the same check to pass. Never overwrite unrelated edits or leave the defect behind. If safe seeding is impossible, mark detection not tested and explain; a check that stays green has not proved detection.
6. **Close with evidence.** Run the fast command through `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-verify/test-budget.mjs" -- <executable> [args...]` using `.jig/testing.json` for project budget, tags and globs when present; infer facts from scripts, and report unsupported discovery or missing tooling as a gap. Report missing tags, unsupported titles or an exceeded budget in existing tests as findings; do not rewrite those tests to pass. Run the configured full suite once on the final candidate before merge; rerun only if code changes afterwards. Record command, inputs, expected versus actual result and concise output or an artifact link. Separate inspected, executed and reproduced-in-app claims. List every file you changed. Stop only services you started and remove temporary seeds and data. Keep raw screenshots, JSON measurements, logs and temporary working files outside the repo in the OS temp directory or an external jig-scratch directory. Retain linked evidence for review; keep only a short evidence summary and links in the repo. Never store capture matrices or temporary working scripts in the skill folder. Report **Passed**, **Failed**, and **Not tested — why**, including detection proof, spec gaps, unavailable tools or suite, and what only the person can judge. Save evidence only when asked or too long for the report. Never turn an unrun check into a pass or grant approval, merge or deployment.

The builder never grades its own output. The coordinator may triage findings but never accepts; acceptance needs a fresh seat distinct from builder and coordinator, seeing the rendered evidence and actual reference. Explaining a finding away as noise requires that fresh seat's agreement and a linked checker calibration item. Every UI seat sees the shared scripts' renders and measurements, not only code; a self-check is evidence, never independent acceptance. Keep Visual craft, Fidelity, Content stress, Motion and Accessibility catalogues separate; a catalogue not reached or not applicable is one line saying why, and each Not tested item is listed once, in the closing report. If independent context or rendered evidence is unavailable, leave that seat pending and name the gap.

On changed screens check in cost order. First the token layer
(`ui-tokens-check.mjs`, no browser): contrast, sizes, weights, state
differences and style lint from design values and the state table. Then the
shared `visual-check.mjs` runner, only for risks the token layer cannot catch
(wrapping, clipping, overlap, geometry, rendered ink), scoped to the changed
components with `--changed` during build loops. The gate measures the declared
changed scopes in every declared layout and state; unchanged inherited content
is baseline debt, reported once as a count, not re-measured or triaged.
Shrinking a declared inventory needs a recorded plan revision, never a silent drop.
Use declared page states and applicable visual-motion.mjs frame strips;
[visual-checks.md](visual-checks.md) defines setup and limits. Visibility compares
rendered ink with its ground; a CSS contrast or geometry pass does not prove
visible content or a good look. Keep fidelity/rubric review independent of the
builder. Missing shared checks or review leave acceptance pending.

Screenshot budget: build loops use browser measurements (boxes and computed
styles to JSON), one theme and one size, with no PNGs. Rerun only named states a
fix touched (--states). At probe end and each batch checkpoint, produce one
contact sheet; this is the only image read by a reviewer/model, one per batch.
Final verification runs the declared matrix once, as measurements only;
screenshot only failing states and consolidate them into the review sheet. Pixel/visibility
probes may capture in memory for deterministic analysis; persist only failures
or the sheet. Explicit --png is for those scoped captures, never a build-loop
matrix. Save evidence outside the repo, with a short summary in the repo.
Motion measurements do not establish feel or flicker: review a replay/recording
at the checkpoint and disclose missing frame or next-day review. Follow the
machine resource guard; use one browser at a time and close it promptly.

Stop rules apply to every browser run: the shared runner, a hand-written actor,
or a script that calls the runner.

1. Preflight, always, even when no browser may open; it needs none and takes
   seconds. Read the browser script and check its arguments, state table, hook
   and scope names. A remote `--url` without a local `--source` is a stop: name
   it in the report as the reason the browser step cannot run.
2. Replay, always, even when no browser may open: run a hand-written actor's
   expected responses through the real controller without a browser, and
   confirm each keyboard target exists and is reachable by the intended key.
   Report the replay result as executed evidence.
3. Browser, only when allowed and steps 1 and 2 pass. To leave it out, do not
   run it and list it under Not tested; do not add a new switch to skip it.
4. Stop at the first failure caused by the fixture or setup, and after five
   identical failures of any kind. A product finding is recorded and the run
   continues; it never stops the run on its own. After a fix, rerun only the
   failed contexts and continue from the observed persisted state; do not
   restart the fixture. Two failed browser attempts at one gate stop for
   re-planning, whoever caused them.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-verify/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>` before reporting; disclose marker failures.

## Provider notes

- **Codex:** use `codex` as the telemetry provider. Read the source in `.agents/skills/jig-verify/`. Open the one checkpoint contact sheet with the `view_image` tool. Use an available browser tool for live exploration; otherwise use the project's existing browser runner. Subagents are optional: if available and authorized, give one the contract and diff for an independent adversarial pass; otherwise perform that pass sequentially and disclose the lack of independence.
- **Claude Code:** use `claude` as the telemetry provider. The generated `.claude/skills/jig-verify/SKILL.md` points here. Read this source and resolve supporting files relative to it. Open the one checkpoint contact sheet with `Read` on the PNG. Use an available browser MCP tool or the project's existing browser runner. The Task tool can provide the same optional adversarial pass when available and authorized; otherwise use the same sequential fallback.
- **Both:** do not install a browser integration or start another provider session. If neither browser route exists, report the live UI gap and keep any available automated evidence. A required independent session belongs to whoever launches the work.

## Later

Consider recipe discovery or evidence packaging only after repetition justifies them.

Ideas adapted from MIT sources are credited in [NOTICE](NOTICE); the skill text is written fresh.
