# The jig suite

Status: direction from the user, 7 Nov 2026.

Status: `jig-verify` is built and passes its local checks; its behaviour in Codex and Claude Code is not yet tested.

`jig-review` has a sandbox skill draft, fixed diff-signals helper and
[provider scenarios](review-scenarios.md). The coordinator must install the
draft and record both providers' scenario results before it is merge-ready.

## Skills

- Built (draft; sandbox patch): `jig-plan` settles intent and writes a checked one-page build plan. See [plan format](plan-format.md), [plan review](plan-mode.md) and [fixed scenarios](plan-scenarios.md). Fresh two-provider runs remain pending the coordinator after the RAM upgrade. Later, an intake step at its front (user idea, 7 Nov 2026): classify each request as decision, direction change, idea, question, correction or task; say whether it belongs now or on a parking list, where it belongs, and what it conflicts with, before writing anything. Practised by hand first; built from what worked. It orders work by risk, biggest unknown first, and cuts it into thin vertical slices that each reach the user, so every slice's effect can be checked. Before the first slice it asks for an architecture map (user, 7 Nov 2026), sized to that slice and widened with each later one: components and their boundaries, each with one responsibility and the behaviour the person sees that it serves; data flow and who writes what; persistence; invariants; and the test layer per component. No component exists to record or prove agents' work. A consuming project's ADR is the first map, written by hand; the practice moves into the skill once it has worked there.
- `jig-review` coordinates review lenses for a change. A structure lens (user, 7 Nov 2026) checks each new module against the architecture map: its one responsibility, whether it fits a component, and whether anything uses it (Knip or an equivalent).
- `jig-verify` is the QA lens. It also runs alone while working.
- Language packs: rules keyed to file paths, TypeScript first.
- Candidate: `jig-skill`, for writing jig skills themselves. See [Writing jig skills](#writing-jig-skills).
- Built: `jig-worktree` and `jig-merge`, a branch's life from open to cleaned up. See [Worktrees and merging](#worktrees-and-merging).
- Built (optional pack, draft): `jig-godot` in `packs/godot/skills/jig-godot/`, the no-focus Godot check helper (headless first, then a native window on a second monitor from an isolated check project). Optional packs live under `packs/<pack>/skills/` and are not part of the core suite: a project opts in with `"packs": ["godot"]` in its `.jig/config.json` and `node scripts/sync-skills.mjs` then generates the pointer; without that line nothing changes. Fresh two-provider scenarios are pending, as for the other drafts.
- Built (draft): `jig-interaction`, interaction design and review before any UI or game slice: one `interaction.json` (verbs, input map, flows as data, feedback, top tasks with KLM budgets, screen map, hierarchy), a dependency-free checker (`scripts/interaction-check.mjs`), a pattern library and a layered review. Plan: 2026-11-11-jig-interaction; calibration: results. Fresh two-provider scenarios pending.
- Candidate: `jig-spike`, a throwaway experiment that answers one question. See [Spikes](#spikes).
- Built (draft): `jig-mockup`, one ledger-first clickable mockup round before UI implementation. See [Mockups](#mockups), the [design toolbox](design-toolbox/README.md), and [fixed provider scenarios](mockup-scenarios.md). Installed by the coordinator on 7 Nov 2026; fresh two-provider runs remain pending (after the RAM upgrade). It draws on the toolbox's curated, dated catalogue of open source interface parts; each project records its picks and overrides in its configuration or an ADR, and `jig-build` uses only the picks.
- Candidate: `jig-walkthrough` (user, 7 Nov 2026): on request, explains a change to the person as ordered steps, each with file and line references, the diff excerpt, why the change was made and its risk, with review findings placed at the step they concern. It writes a structured walkthrough format (steps, references, findings) that a launcher renders as a step-by-step view; prose alone is not the contract. It explains and does not approve or prove. Reference: a consuming project's pr-lens idea (reuse ideas only; its skill uploads code). Runs in both providers.
- Candidate: `jig-build`, the implementation step, so the project's rules reach whoever builds instead of living only in hand-written briefs (user, 7 Nov 2026). Before: read the ticket's acceptance, the plan slice, the mockup and the project rules (AGENTS.md, ADRs, the architecture map, language pack, design tokens); stop and ask on a conflict instead of guessing. During: stay in scope and send ideas to the ideas list; write tests at the lowest layer that works, each naming its risk; record drift from the design, plan or architecture map as it happens, with the reason. After: run `jig-verify`, report done, not done, drift and missing tools; never merge. Chain: plan, mockup (UI only), build, verify, review, merge; each step checks the one before. Built after the testing approach and drift log land, since it uses both.
- Candidate: a project policy (user, 7 Nov 2026). `.jig/policy.json` records the branch model and a tier per action: free, verbal approval, one click, or a physical step. Tiers attach to the target branch, not the path: in the user's projects, task branches go to `release` for candidates still under test, or straight to `main` when validated; `main` holds only validated and accepted changes and is the strictest. Force push to `main` or `release` is denied, and changing the policy itself takes the strictest tier. A low-stakes personal project may allow merge and push freely. A `policy.mjs` generator writes the enforcement from it (Claude settings and a `PreToolUse` hook, Codex rules, git `pre-push` and `pre-merge-commit` hooks) and `--check` reports drift, as `sync-skills.mjs` does; it must work with one provider alone. `jig-merge` reads the policy at its authority step instead of prose rules. Git host protection is the strongest layer and is recommended alongside. Adopt by hand in jig and a consuming project first.
- Built, pending coordinator reconciliation: a resource guard (user, 7 Nov 2026). Parallel live browser runs froze the person's machine. Helpers that launch a browser (`visual-clip.mjs`, `visual-motion.mjs`, `visual-check.mjs`) check free memory before launching and take a slot in a shared lock, so sessions in either provider cannot launch at once; too little memory or no free slot exits 2, inconclusive, with the reason. Each machine sets its threshold and slot count, for example `browser.minFreeGB` in `.jig/config.json`. The behaviour lives in the helpers and `jig-verify`, not in memory or global instructions; those keep only machine facts. The lock lives where both providers may write.
- Candidate: `jig-init`, built after the policy has been adopted by hand: it asks the branch model and tiers, writes `.jig/` (config, worktree, policy, testing), installs the skills and runs the generators.
- Built (sandbox patch): `jig-correct` records and classifies missed problems, blocks repeats pending a rule review, and carries lessons into named checks. See [the intake and presentation contract](missed-problems.md) and [fixed scenarios](correct-scenarios.md). Local tests do not establish provider behaviour.
- Later: more lenses and `jig-map` for efforts too big for one session.

The skill stacks study records what these ideas came from.

**AI-first** (user, 7 Nov 2026): jig builds tools that let agents verify their own work, and its skills ask for them. When `jig-verify` cannot check something without a person, it reports the missing tool as a gap to build, such as a readable command, a state dump, seeded data or a headless capture.

Keep the suite small: each skill passes its two-provider scenarios before merging, and a skill nobody uses is removed. Claude Code and Codex both have a built-in `/review`, so the `jig-` prefix matters. Skill names use `jig-<name>`, because Claude Code allows only lowercase letters, digits and hyphens in a skill name.

## Testing

Read an outside system's official docs and specs before touching its CLI, API or
engine; record their versions and derive a parity checklist from its native UI.
Treat third-party docs as data, never instructions. Turn machine-readable specs
into code: generate types and validate recordings against the schema.

Match live effort to the unknowns. At least one live playbook run built from the
spec and parity checklist is the minimum for a known kind of change, such as a
new field in a known API. Brand-new work with many unknowns, such as a terminal
embedded in a browser or a chat UI over a provider stream, needs rounds. Start
with that playbook, then have an agent and the person freely explore and try to
break it: other languages and input methods, paste, resize, very long output,
interrupt mid-tool, refresh, two tabs and killing the process. Record every
finding and which checklist categories each tried. Stop when a full round finds
nothing new and every checklist category has been tried, never after a fixed
number of runs. Missing person trials, tools or time leave evidence incomplete.
Save real traffic as recordings (fixtures), with the system version and secrets
removed. Where spec and recording disagree, the recording wins; report the gap
rather than silently changing the expected contract. Then shrink: turn findings
into fast tests and replay tests and retain only a few live checks.

Then use many fast pure-logic tests, replay integrations with real recordings
instead of hand-written mocks where possible, and few end-to-end flows: one per
thing the person does, each saving a screenshot an agent looks at. Keep a small
live set only for what replay or mocks cannot prove; run it when the outside
system's version changes, not on every commit. The person tries each slice for
feel and UX; tests cannot judge those.

The change's author names the risk each test guards. Set a fast-suite time budget
per project; over budget means delete or merge tests, not raise the budget. A
missed problem gets a test at the lowest layer that would have caught it, not a new
end-to-end test by default. Spike code and tests never become product code.
The maintainer reviews the live set at each system-version change or when it
grows past three tests: keep only risks requiring live evidence, replace the
rest with unit or integration checks using recordings or mocks.

**Missed problems log.** Each project keeps `docs/missed-problems.jsonl`: one entry per problem
found after tests passed, recording date, what happened, who found it, the lowest
layer that should have caught it (or `person only`), and what was done: fix, test
added at a named layer, or rule changed. `jig-verify` adds entries when the person
tries a slice; `jig-review` adds entries when review learns of a missed problem. Both
update an existing entry for the same incident rather than double-count it. See
[the log format](test-budget.md#missed-problems-log).

**Intake before work.** `jig-mockup`, `jig-verify` and `jig-review` run `node scripts/missed-problems.mjs --area <area>` for each job area (design, runner, skills, product slice). Copy each relevant incident into one brief line and a named check; record exclusions with reasons. A recurrence with the same area and class is a repeat, even if its flag was omitted. Open repeats block the next round of that work until an incident-linked rule review in `docs/results/` names the failed rule and changes. Use `jig-correct` to own the correction loop.

**Review the rules.** At the end of each slice, and whenever a missed problem repeats,
the coordinator gathers suite count and time, live test count with versions,
and missed problem counts by layer using the helper's `--summary` mode. Compare with
earlier reports and write a short report of what works, rules to change and
tests to delete for the person to decide. Save these reports in `docs/results/`
of the project using jig, with date and slice in the filename so trends remain
visible. Include evidence gaps; a missing missed problems log is not proof of no missed problems.

[test-budget](test-budget.md) documents the portable checker and project config.
The [testing scenarios](testing-scenarios.md) cover the three existing skills;
their replacement text is a sandbox draft until installed and tested in both
providers. Local tests do not establish provider behaviour.

## Writing jig skills

User direction, 7 Nov 2026: writing a jig skill includes proving it in both providers, so the proof is never skipped.

`jig-skill` writes or changes a skill and carries it to merge-ready:

1. **Write** the one source in `.agents/skills/jig-<name>/` in the required format, short and imperative, with provider differences only in Provider notes. Each provider's own skill-writing skill may help draft it.
2. **Generate** the Claude pointer with the sync script, and pass the format and drift check.
3. **Scenarios:** write fixed scenarios for the skill, each with a fixture and a planted defect the skill must catch. A skill without scenarios is not done.
4. **Run in both providers:** a runner script starts a fresh Codex session and a fresh Claude Code session on copies of each fixture, the skill loaded from its normal location, by name and once without naming it. Running them needs the person's authorization.
5. **Record and compare:** whether the skill loaded, the outcome, whether the defect was caught, and tokens used, per provider. A difference between providers is a finding to fix or to explain in Provider notes.
6. **Review** with the harness lens, then merge with the person's approval.

## Worktrees and merging

Built, with a portable [worktree command](worktrees.md) and
[provider scenario results](branch-scenarios.md). Codex's sandbox cannot write
`.git`, so for Codex the coordinator opens and closes worktrees and merges; this
is by design, not a gap to fix.

User direction, 7 Nov 2026. A consuming project left many finished worktrees behind, and each provider puts its own worktrees in its own place, such as `.claude/worktrees`. One method, for both providers, keeps them in one known place and always cleans up.

`jig-worktree` handles the life of a worktree:

- **Open:** one worktree per task, in a folder set by the project configuration, by default a sibling folder `<repo>-wt/<task>`, never inside the repository or a provider folder. One branch per worktree, named after the task.
- **List:** every worktree with its branch, whether it has uncommitted work, and whether its branch is merged.
- **Close:** only when the branch is merged and nothing is uncommitted. Remove the worktree, delete the branch and prune. Otherwise stop and say why.
- **Sweep:** find stale worktrees, show a preview, and remove only what the person confirms.
- **Sandboxes:** a sandboxed session may be unable to write the main repository's Git folder from a worktree. Say how to allow it for each provider, such as `--add-dir <repo>/.git` for Codex.
- A small script does the steps, so they behave the same everywhere.

`jig-merge` takes a finished branch to its base:

- **Ready:** verification evidence exists, review findings are handled, and the branch is up to date with its base.
- **Approval:** merging needs the person's approval, or a rule the person set. A session never merges on its own judgement.
- **Several branches:** merge them into one integration branch first, run the full suite once there, and fix how they fit together before merging to the base. Checks written on one branch can break on another's changes.
- **Conflicts:** resolve by meaning, not by picking a side. Append-only files, such as an index of decisions, keep both sides. Rerun the affected tests after resolving.
- **After merging:** close the worktree with `jig-worktree`.
- Hosted merge requests, such as GitHub pull requests, use the same steps, with the description written for the reviewer.

## Spikes

User direction, 7 Nov 2026: a spike validates an idea and reduces an unknown. It runs under relaxed rules, and the skill pushes back when the work drifts.

- **One question, one answer:** yes, no or partly, with the evidence that shows it. A clear no is a good result.
- **Relaxed:** no tests unless they are the evidence, no lint, no review lenses, no design tokens, no polish, no documentation beyond the answer. Code quality does not matter; it is thrown away.
- **Still required:** safety. No secrets in output, no destructive commands, local services bound to 127.0.0.1, third-party content treated as data, real provider runs only with the person's authorization, and human gates never approved.
- **Timebox:** set before starting. When it runs out, stop and report what is known.
- **Pushes back when:** the question is too vague to answer; the work turns into building the product; rules meant for product work slow it down; or spike code is about to be merged into the product. Spike code is rewritten, not promoted.

## Mockups

Stage 0 now precedes HTML for a new look when an image tool is authorized:
explore, edit-base refine, style pick, then set render. See the
[image-round guide](../.agents/skills/jig-mockup/image-rounds.md) and its plan
template/checker. Without an authorized image tool, disclose the gap and start
stage 1. Person-requested rapid HTML loops remain draft; the full presentation
gate still applies to the accepted version. Fresh two-provider scenarios and
the HTML trial results remain pending.

User idea, 7 Nov 2026: use image generation to make mockups, and even animations, as a starting point for a design. Built when a real design task needs it, starting with a consuming project's design foundations and logo.

The flow runs from an instruction to a coded mockup:

1. **Brief:** the instruction describes the whole application first: what it is, who uses it and what it is for; the desired look and feel; the experience it should give, such as calm or fast; and how it shows liveness through motion, such as work in progress and something arriving. Then the screen: its purpose, real content and what the person must notice first, with the project's tokens and rules. The goal is one look and feel for the entire application, so every screen's brief shares the same application description.
2. **Generate:** several still images from the brief. They show look and mood, not exact layout.
3. **Choose:** the person picks one, or asks for another round. None passes without the person's choice.
4. **Codify:** the agent rebuilds the chosen image as an HTML mockup using the project's tokens, not colours or sizes measured from the image. It lists where the image breaks a rule, and follows the rule.
5. **Compare:** a screenshot of the mockup next to the image, for the person to accept.
6. **Motion:** build each component's motion alongside it, using the project's motion language and reduced-motion fallback; a change without motion is a defect. The coordinator records it as a GIF or video when browser work is authorized. Generated frames drift between images, so motion never comes from image generation.
7. **Keep:** the accepted mockup becomes a reference example that later work copies.

**Practice from a consuming project's design rounds, 7 Nov 2026**, now captured in the draft skill and the [design toolbox](design-toolbox/README.md). Generated images were useful for picking an arrangement, but the person judged "application feel", density and motion only by clicking: after the arrangement, rounds moved to clickable mocks. Local checks do not establish provider behaviour or visual acceptance.

- **One brief per round, growing.** Each round's brief records the person's reactions as "keep" and "fix" notes, so good parts survive the next round and fixes are not lost.
- **Form follows moment.** An element's form must match the "when" in its ledger entry: something needed rarely appears as an event when it happens; only things needed at a glance all the time get standing space. A product's outside-sessions tray failed this (a permanent section for a rare event) and became a one-off offer. Review checks form against moment for every element.
- **The purpose ledger is the gate.** Every element names the person's question it answers, when, its default form, what fails without it and how it is checked; an element without an entry is cut, and a collapsed section is not exempt. One place per fact.
- **Medium:** a clickable HTML file that opens from disk, with no dependencies or build step, because panels, resizing, zoom and motion do not show in images. It is throwaway; the real stack and the project's chosen parts from the UI toolbox come in golden examples and `jig-build`, not in the mock.
- **Roles.** A builder without a browser makes the mock; the coordinator opens it alone (resource guard), runs `jig-verify`'s visual clip and motion checks, takes screenshots at the project's sizes, opens them, checks them against the ledger, and only then hands it to the person.
- **Focused rounds, structure before look:** arrangement, then the frame and interaction, then attention, then canvas details, and the look last, as several token themes on the same mock so the person compares looks rather than layouts.
- **Scripted scenarios** for live behaviour, such as items arriving while the person types, so focus and the five-second "what needs me?" test can be judged.
- **Do not stage files a running builder is writing;** commit only the files the coordinator changed.

- **Provider-neutral:** Codex has an image tool; Claude Code has none built in. Without one, the skill goes straight to the HTML prototype and says so.
- **Keep the source:** the prompt, the tool and a licence check go with each image.

## Seats

A seat gives a session one discipline and that discipline's good habits.

The `jig-orchestrate` assistant seat does mechanical work by default: test runs
and triage against base, logs and output reads, browser passes and screenshots
under the resource rules, check scripts, first-draft briefs and plan structure
checks. Use a background cheap assistant agent (Haiku or Sonnet in Claude Code;
the provider's equivalent elsewhere). Installing the skill authorizes these
agents; projects may disable them in settings. Start an assistant for mechanical
work longer than a few tool calls. `jig-verify` owns gate rules while the
assistant does the checks. The coordinator keeps plans and final briefs,
acceptance routing, anything the person sees, merges, cleanup, destructive
operations and judging diffs before commit, including for small direct fixes.
Independent acceptance requirements still apply. [Local usage](usage.md)
defines the configurable 30%-left budget mode, capture setup and load check.

| Seat | Checks |
|---|---|
| QA | Tests and behaviour, through `jig-verify` |
| Product and business logic | That the change meets the task's acceptance checks and fits the product vision: the goal and acceptance checks from `jig-plan` or the task, the vision and principles in the project's direction documents (named in project configuration), business rules, domain edge cases, and what a real user expects. Chosen when behaviour changes, not for refactors or style. |
| Design | Layout, consistency and the project's design rules |
| Security | Trust boundaries, secrets, input handling and dependencies |
| Accessibility | Semantic structure, roles, accessible names, labels and keyboard use. The aim is less about a specific audience and more that tests can find controls by role and name, as a user would, so browser tests stay reliable when layout or styling changes. Prefer roles and names over test-only IDs. Chosen when a screen changes. |
| Architecture | The shape of the application over time, simplicity first. See [Architecture seat](#architecture-seat). |

Seats are chosen by risk, not run on every change. Running every seat on every change makes each change slow and expensive.

## Architecture seat

User direction, 7 Nov 2026: architecture reviews the application as a whole, not only the change.

- **Simplicity:** the simplest design that works; what this change lets us remove.
- **Consistency:** one way to do each thing. A new pattern replaces the old one or has a recorded reason to coexist.
- **Structure:** module boundaries, layering and dependency direction; each piece of state has one owner and one source of truth.
- **Coupling and cohesion:** a change in one place should not ripple through others.
- **Maintainability:** easy to read, change and delete later; cost of change, not cleverness.
- **Dependencies:** fewer and smaller, preferring the platform and standard library. Each new one must earn its place: maintenance, licence, size and how much it pulls in. Pin exact versions. A smaller surface means less exposure to supply chain attacks.
- **Contracts and compatibility:** interfaces, data formats and migrations; what breaks for callers or stored data, and how to roll back.
- **Failure handling:** a consistent way to handle errors, retries and partial failure, validated at boundaries.
- **Operability:** enough logs and signals to tell what happened, without leaking secrets.
- **Performance:** only where it matters, measured, not guessed.
- **Testability:** behaviour can be tested through public interfaces.
- **Reversibility:** one-way decisions get an ADR; two-way decisions stay light.
- **Fit with recorded decisions:** a finding names the ADR or rule it breaks, or proposes changing the record.

Like every seat, it picks the concerns the diff touches, not all of them every time.

## Simplicity

Every lens favours the simplest design that works, an idea taken from pstack.

- Before adding code, look for what already does the job, and reuse it.
- When adding code, ask what can be taken out: dead paths, duplicates, options nobody uses, layers that only pass things on.
- Prefer deleting to adding. A change that removes more than it adds is a good sign, not a risk.
- Do not build for needs that have not appeared. Generalise only after a third real case.
- A finding can be "this is more complex than it needs to be", with the simpler version.

## Rules and decision records

A project's rules and decision records serve building and review alike.

- The project configuration points to them, for example AGENTS.md and docs/adr/.
- While building, a session reads the ones that apply to what it touches before changing anything.
- While reviewing, each lens checks the change against them. A finding names the rule or record it breaks.
- A rule that can be checked mechanically becomes a fixed check, because a rule nobody checks does not hold.
- If the change is right and the record is wrong, the finding says to change the record, not to work around it.

## Built-in review first

User decision, 7 Nov 2026: correctness review uses the providers' own tools, Claude Code `/code-review` and Codex `/review`. jig does not rebuild them, and they improve without work from us.

- **Independence:** the tool that runs the work launches the other provider's review on the exact committed revision. With one provider, the check is a fresh session.
- **Both for complex changes:** when a change is complex or risky, `jig-review` runs both Claude Code and Codex review and merges their findings into one report, noting which reviewer found each. Complex means fixed signals from configuration, such as a large diff, a migration, auth or permission code, or concurrency, plus judgement. It needs both providers available; otherwise it says only one ran.
- **jig adds only what they lack:** lenses chosen from the diff, the project's rules and decision records as context, severity and priority, and an opt-in saved report.
- **Grow from gaps:** record what the built-in review misses on real work. Add a jig lens only for a real miss.

## Telemetry

User direction, 7 Nov 2026: every skill run records time spent and tokens used, so choices about skills, providers and depth come from data.

- **Markers from the skill, counts from the provider.** An agent cannot reliably report its own token use. Each skill writes a start and an end marker, one JSON line each, to `.jig/telemetry.jsonl` in the project: skill name and version, run ID, provider, time, and at the end the outcome. A jig script then reads the provider's own records for that session (Claude Code transcripts carry usage per message; Codex session logs carry token counts) and adds up the tokens between the markers.
- **Recorded:** skill, version, provider, model, start, end, duration, input, cached and output tokens, and outcome (passed, failed, stopped or partly).
- **Never recorded:** prompts, messages, code, file contents, secrets or paths outside the project.
- **Local only.** Nothing is sent anywhere. A project can turn it off in its configuration. The telemetry file stays out of Git by default.
- **Report:** one command summarises time and tokens per skill, provider and outcome. Any tool that launches work can read the same file.
- **Unknown stays unknown.** If the provider's records cannot be read or matched, tokens are reported as unknown, never estimated.

Implementation and command contract: [local telemetry](telemetry.md). The marker
helper and shipped skill versions are generated; synthetic local checks cover
the report. Live provider verification remains separate.

## Triage

User direction, 7 Nov 2026. Before any seat runs, a triage role reads the change and classifies it, so attention goes where it is needed.

- **Class:** trivial (text, comments), mechanical (rename, formatting, generated files, a patch-level dependency bump), refactor (behaviour should not change), behaviour or business logic change, or risky (security, auth, data and migrations, money, concurrency, public contracts, new dependencies). A change can have more than one class; the highest wins.
- **Who reviews:** what AI review can safely cover alone, and what needs a person. For the person, it names exactly where to focus, with files and lines and the question to answer, so a human review takes minutes, not a full read.
- **Seats:** which seats to run, from the class and the diff signals below.
- **Merge suggestion:** whether the change looks safe to merge without a person, with the reason. This is a suggestion only. A change merges automatically only if the person has set a rule that allows its class, and every required check passed.
- **Floor from fixed signals:** the diff-signals script sets a minimum class. Judgement can raise it, never lower it, so a session cannot talk its own change down to trivial.
- **Says why:** each classification gives its reason in one line, so the person can correct it, and corrections teach the rules.

## Choosing lenses from the diff

`jig-review` reads the change and decides which lenses it needs.

1. **Fixed signals first,** from a small project configuration: paths, file types, new dependencies, migrations, auth or permission code, UI files.
2. **Judgement second,** for what the signals miss, such as a change in behaviour inside an ordinary file.
3. It states which lenses it chose and which it skipped, with one reason each.
4. The person can add or remove a lens.

**Tool:** one small script turns the diff into fixed signals, so required lenses never depend on an agent's judgement. Given a base and a revision, it reads plain `git diff` and returns JSON: changed files with their size, the signals they match (paths and file types mapped to lenses in the project configuration, new or changed dependencies, migrations, auth or permission code, UI files), and the lenses those signals require. The tool that launches the work can run the same script. Git itself needs no wrapper; agents use the git command line.

The session doing the work must not lower its own checks. Lenses triggered by fixed signals are always required, and the tool that launches the work can make the choice independently.

## The report

All lenses read the diff once. Each lens produces its own catalogue of issues, and each issue gets a severity. The catalogues then merge into one short report, grouped by severity, with the lens that found each issue.

- **Severity** is the harm if a finding is left alone: Critical, High, Medium or Low.
- **Priority** is when to fix it: before merge, soon, or later.
- A Low finding never blocks on its own. Sending finished work back for one cosmetic note costs a full round of review.
- The report is shown, not saved, by default. The person can opt in to save it as an artifact: a short Markdown report and a JSON file for tools to read, in a folder set by configuration.

## QA

`jig-verify` chooses the cheapest check that gives real confidence, and explains the choice.

- **Depth follows risk:** what the change touches, how much breaks if it is wrong, and how hard a fault is to spot later.
- **Testing pyramid:** many fast unit tests, fewer integration tests, a few end-to-end tests, and manual checks only where they add something tests cannot.
- **Be ruthless about what is tested** (user, 8 Nov 2026). Coverage is the job of unit tests and of integration tests with mocked dependencies. Every check above them (browser, pixel, screenshot, live provider, end-to-end, model review) names the risk that only it can catch, or it is cut. When a live check finds a bug, add the cheapest test that would have caught it and drop the live repetition. Rules that need only values (colours, sizes, weights, states, tokens) run without a browser.
- **Cost budgets apply to every layer**, not only the unit suite: a check over its budget fails and names its slowest parts. A run that stops early, times out or skips work is incomplete, never a pass.
- **Plan before building** (user, 8 Nov 2026). Any build job over about 30 minutes, any UI or product slice and any new module or contract starts from a one-page plan: intent and what the person will see, acceptance, scope and out of scope, contracts, slices with timeboxes, a verification plan by cheapest layer with expected time, riskiest unknown first, and relevant missed problems. A quick multi-lens plan check (testing, architecture, design, product, cost, history; cheap model, in parallel, about two minutes) reviews it before launch, and the outcome is recorded in the plan. Spikes, one-file fixes and coordinator edits under about 10 minutes are exempt, or when the person says skip. The built draft `jig-plan` and `jig-review` plan mode implement this workflow; launchers call `node scripts/brief-check.mjs <brief-or-plan.md>`. Cost and history always run; fixed plan signals choose additional seats. Review stays under three minutes; pending seats block. Exemptions above still apply with a recorded reason.
- **Automated tests** for what is exact and will matter again: logic, contracts, data, regressions.
- **Live checks by the agent** for what is new or hard to pin down: a new screen or flow, real provider behaviour, integration across parts. Keep only the checks worth repeating as tests.
- **The person** for what only a person can judge: taste, art, feel and product fit. Ask once, with a clear choice.
- **Tester's mindset:** boundaries, bad input, failure paths and what a user actually does, not only the happy path. A seeded defect proves the checks can fail.
- **Black-box by default:** test a unit through its public interface, as its callers use it, not through its internals. Tests then check behaviour and survive refactoring. When that is hard, for example with timing or a hidden external call, open the smallest seam that makes it testable and say why.
- **Test data builders:** build inputs such as a request body with a builder that has sensible defaults. Each test overrides only the fields that matter to it, so the test shows what it is about. One builder per shape, shared across tests.
- Targeted tests during the work. The full suite runs once, before merge.
- No permanent tests for throwaway prototypes.
- Evidence is a short summary: what passed, what failed, what was not tested and why. Link the details.

The draft jig-orchestrate coordinator and queue/progress contracts are described
in [queue.md](queue.md); fixed trials are in [orchestrate-scenarios.md](orchestrate-scenarios.md).
Fresh provider trials remain pending.
