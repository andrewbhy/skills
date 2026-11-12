---
name: "jig-orchestrate"
description: "Coordinate a queue of jobs: choose safe parallel work, track progress, apply results, batch decisions and preserve handoff state. Use for coordinator work across jobs; individual checks and cleanup stay with their owning skills."
---

# jig-orchestrate

Scenario status: fresh two-provider runs are pending; local tests prove helper
contracts, not instruction following. Read [queue.md](queue.md) for formats,
commands and exit codes; [scenarios.md](scenarios.md) records the fixed trials.
Start/end telemetry with telemetry.mjs beside this skill; retain the run ID.
Report partly when required independent review or provider evidence is missing.
Scope: this skill and its delegation table apply to the coordinator seat only.
A worker running a brief follows the worker rule below and does not delegate.

1. **Read durable state.** Read queue, plans, decisions, feedback ledger and
   handoff before acting. Use [jig-plan](../jig-plan/SKILL.md) for intake, briefs and plan checks via
   [jig-review](../jig-review/SKILL.md) plan mode. Run brief-check with the job workspace before launch;
   record its outcome and plan hash. Plans are read-only to jobs. Unreviewed
   plans and unresolved repeat missed problems block launch; read [jig-correct](../jig-correct/SKILL.md)'s
   incident-linked rule review before another launch in that area.
2. **Fill capacity at every trigger.** Run queue.mjs suggest immediately when
   a job finishes, a plan check returns OK, a merge lands, memory rises above
   the threshold, or the person answers. In that same turn launch every item
   passing dependencies, disjoint file/worktree, resource guard, available
   provider and measured per-machine concurrency gates. Follow critical-path
   order toward the person's next decision; no score. Say one line per item
   with the decision and reason. If none can launch, name each wait. Helpers
   make no model calls and suggest never claims to have launched work.
3. **Track launches.** Use [jig-worktree](../jig-worktree/SKILL.md) for separate task worktrees. Never run
   two jobs in one worktree; overlapping files need isolated worktrees or
   sequence. Prepare steps, timestamps and timebox in an atomic progress file,
   then call queue.mjs reserve to atomically recheck gates before starting the
   provider's tracked background task. Record its task ID and reservationId
   through queue.mjs launch; never detach. If recording fails, stop that
   task. Recheck gates at launch. Use the resource guard for provider memory
   and browser checks; hold a shared browser slot until the browser closes.
   A failed guard exits 2; do not retry around its limit or kill others' jobs.
4. **Watch and reconcile.** Run status --follow through a tracked task when
   useful; on request give one short X/N bar per job, elapsed/timebox, stale
   and over-timebox flags and dependencies. No progress for ten minutes or a
   passed timebox needs the coordinator's wait, stop or re-plan decision.
   On completion reconcile the progress result with finish. An incomplete,
   cancelled or budget-stopped run is a failure, never done. Rerun suggest
   immediately; completion is not presentation or acceptance.
5. **Apply safely.** Compare the saved plan hash before applying results;
   refuse changed contracts and return them to planning. No skill sync while
   jobs run. Patches must be built against current HEAD. Run tests before a
   commit, and check every proposed commit claim against the actual diff,
   including executable wiring for claims that a tool runs. checkApply checks
   structured preconditions; the coordinator still inspects the exact diff.
   Delegate authorized merge execution to a worker using [jig-merge](../jig-merge/SKILL.md); retain the final diff/evidence check and jig-worktree close for cleanup.
6. **Gate presentation.** Use [jig-verify](../jig-verify/SKILL.md) for a complete gate, jig-review for a
   fresh reviewer distinct from builder and coordinator, and [jig-mockup](../jig-mockup/SKILL.md) for
   presentation when applicable. Bind evidence to the same revision. Read
   .jig/feedback.json; open entries block showing that item as ready. Only then
   mark review. The coordinator never accepts. Put all ready links in one
   "Needs your review" list at the top of a reply. checkReply merges lists;
   ask at most one question, with choices and a recommendation.
7. **Stop, record, learn.** Two gate or fresh-review failures on one slice stop
   work for re-planning with the person; a failed browser or fixture attempt
   counts, whoever caused it. Briefs name each browser check's unique risk and
   never ask a browser actor to re-prove lower-layer evidence. recordFailure
   writes an escalation
   through signals.mjs with area, item, caughtBy, ownErrorShare and planLink.
   Add the later decision using signals.mjs set <id> decision <JSON-string>.
   Route feedback to the file ledger or harness skills/suite docs, never only
   memory. Route escaped checks and repeat rule reviews to jig-correct.
   Before handoff persist queue, decisions, open items and handoff links in
   files. Trial/merge cleanup calls jig-worktree close and jig-merge; this
   skill does not perform raw branch/worktree deletion.

## Reads and assistant seat

For broad logs/searches/trial folders or repeated chores, first use
`node "<skill-folder>/jobcheck.mjs" --root <project> --progress <file>
--plan <file> --log <file>` (at most 12 lines; no model). Start an assistant
when the work is mechanical and longer than a few tool calls. The default
seat is a background cheap assistant agent; see Provider notes for models.
The person authorizes these assistant agents by installing this skill;
a project can turn them off with `orchestrate.assistantAgents: false` in
`.jig/config.json`. Explicit session and machine constraints take precedence.
If disabled or unavailable, record the gap and do only necessary manual work.

| Task kind | Seat | Report shape |
|---|---|---|
| Test runs and triage against base | background cheap assistant agent | table of candidate/base pass, fail, skip counts; failing names and shortest decisive error line |
| Log and output reads | background cheap assistant agent | conclusion under 100 words, evidence links, gaps |
| Browser passes and screenshots | background cheap assistant agent | resource check, scoped evidence links, findings at file:line; follow machine rules |
| Check scripts | background cheap assistant agent | command, exit code, shortest decisive error line, gaps |
| First-draft briefs | background cheap assistant agent | draft and unresolved structure questions for coordinator judgement |
| Plan checks of structure | background cheap assistant agent | missing fields, file:line, no acceptance decision |
| Plans and final briefs | coordinator | exact judgement and final contract |
| Acceptance decisions and anything the person will see | coordinator | acceptance routing to the independent acceptor; final words and artifacts |
| Merge authority and final diff/evidence check | coordinator | exact candidate, authority and checked evidence |
| Merge execution | worker running jig-merge | suites on branch and base, review triage, merge, suite on merged result and doctor; stop before deleting and report the exact close command |
| Deletion of resources (worktree close, branch delete, folders, data) | coordinator | checked deletion scope and outcome through owning skills |
| Judging diffs before commit | coordinator | exact diff and supported commit claims |

Reports are files (person, 10 Nov 2026; after Google's Elephant-Goldfish
Model). Each assistant and worker writes its full report to a file in the
job's scratch folder and returns only the path and a status line. Some
hosts refuse report files from helper agents; then the helper writes its raw
evidence files, returns the full report as its final message, and the
coordinator saves that message unedited as the report file before acting on
it. The chat reply is never the evidence. Any claim that drives a change, a "fixed" or
"inside" verdict, or a revert quotes its source: `path:line` with the exact
text, or the measured numbers. Before acting on such a claim, the coordinator
reads the quoted line or number itself. A disagreement with a finding cites
checkable evidence; "this was intentional" is not evidence. Where exact
wording matters (a reviewer's paraphrase, a test assertion, a finding's text),
no agent sits between the source and the coordinator: dispatch directly and
read the file, never a synthesiser's retelling. Forwarders (such as a
provider rescue agent) pass the brief by file path and ask the worker to read
it, rather than restating it.

Coordinator keep-list: plans, final brief edits, acceptance decisions,
anything the person will see (including personal artifacts and words), merge authority,
final diff/evidence checks, destructive operations (deletion of resources), and judging diffs before commit.
Delegate merges and their execution checks to a worker running jig-merge; cleanup
that deletes resources stays with the coordinator. Person decision jig #9:
"I think authority lives with you but not actual execution, maybe except for deletion of resources". The coordinator
routes acceptance to the independent acceptor; it never accepts its own work.
Small direct fixes follow this keep-list too: mechanical edits longer than a
few tool calls get a brief; the coordinator keeps exact judgement, whatever
the edit size. Assistant drafts are inputs, not final plans or personal output.

Use [delegate-brief.mjs](delegate-brief.mjs) to render a brief with goal, files,
read-only or not, exactly one browser line, report shape and word cap (at most
300 words). Its browser flag selects either the explicit no-browser switch or
the memory and single-browser rule, never both. Do not add contradictory test
instructions. Assistant agents do not decide acceptance. Provider sessions
for fixed scenarios still require the person's explicit say-so.
Count every scripted or delegated read and manual eligible read with
jobcheck --read-kind scripted|delegated|manual; its durable counters report
the automation share. Do not count exact-judgement reads in that denominator.

### Worker rule

Every implementation or job brief carries this rule (delegate-brief.mjs renders
it): do the brief's own work, start no assistant agents or provider sessions,
keep reads small with scripts (jobcheck, JIG_NO_BROWSER=1 tests, targeted
searches), and report in the brief's shape. Every brief also carries the
required telemetry line (start before work, end before reporting; the
template renders it) because delegated agents otherwise skip the markers.

### Budget mode

Run the repository's `node scripts/usage.mjs` before choosing implementation
capacity; [usage documentation](../../../docs/usage.md) explains local sources.
When it shows the coordinator provider's weekly allowance at or below 30% left,
delegate every mechanical step, print the usage block before each implementation job,
and run one implementation job at a time unless the person overrides. Configure
the threshold (0 to 100, default 30) as `orchestrate.weeklyLeftThreshold` in
`.jig/config.json`. This tightens delegation, not the resource or queue gates.
Missing usage is an evidence gap, never a claim of remaining budget. If assistant
agents are disabled or unavailable in budget mode, report the conflict and keep
implementation pending for the person's override; do not quietly do it yourself.

Register review material (mocks, images, plans, reports) with `review.mjs add <path> --title "..."` (node, from the jig scripts folder) and give the person the printed localhost URL, not a pasted path.

### Shared GPU and ComfyUI

One GPU and one ComfyUI serve many workers and a private job runner. The standalone module `scripts/gpu-share/gpu-share.mjs` holds the contract (lease file, fields, staleness, exit codes); `scripts/gpu-status.mjs` is jig's thin wrapper with the same CLI. Before heavy GPU work (ComfyUI jobs, model loads, bakes) a worker runs `node scripts/gpu-status.mjs wait --max-minutes 30` (one line per minute; exit 3 means still busy: report, do not queue behind others), then `node scripts/gpu-status.mjs lease <who> "<task>" <minutes>`, and after the work `node scripts/gpu-status.mjs release <who>`, also on failure. The owner's private jobs take the lease and agents wait for it. Never cancel another party's job; one heavy GPU job at a time. `node scripts/gpu-status.mjs [--json]` shows load, queue, owner and lease; the tower header chip shows the same. The lease is one neutral file outside every repo and jig store (`%LOCALAPPDATA%/gpu-share/lease.json` on Windows, `~/Library/Application Support/gpu-share/` on macOS, `$XDG_STATE_HOME` or `~/.local/state/gpu-share/` elsewhere; `GPU_SHARE_DIR` overrides), readable by every agent: a private instance uses `lease --private <minutes>`, which writes who "private-owner (private)" and an empty task. A lease past twice its minutes plus 5 no longer blocks. `GPU_SHARE_COMFY_URL` overrides the ComfyUI address.

## Duties index

| Duty | Owner or gap |
|---|---|
| Intake of requests, conflicts, pushback | jig-plan intake |
| Answering questions, plain explanations, licence and tool research | GAP: research and explanation guidance; jig-spike owns trials |
| Plans, briefs, provider and model choice | jig-plan |
| Plan check | jig-review plan mode |
| Launching, worktrees, tracking, status | jig-orchestrate; jig-worktree |
| Applying patches, sync, tests, commits, pushes | jig-orchestrate; jig-merge |
| Gates, screenshots/crops, findings triage | assistant seat as doer; jig-verify as rules owner |
| Fresh reviewer, acceptance, presentation check | jig-review; jig-mockup; independent acceptor |
| Small direct fixes versus briefing a job | jig-orchestrate keep-list and mechanical-work rule |
| Turning the person's rules into harness text | jig-correct |
| Plan notes, handoff, ledgers, missed problems, memory | jig-orchestrate (files); jig-correct |
| Resources, memory, stuck tasks, browser turns | jig-orchestrate; resource-guard.mjs |
| Scratch, candidates and trial cleanup | jig-worktree; jig-merge |
| Owning mistakes and faithful outcomes | jig-orchestrate; jig-correct |

## Retro signals

Own escalation, skill-gap and skill-misguided; read signal-kinds.md. For each
GAP used in a job, call reportDuty with duty, skill and proposedFix: it writes
a skill-gap signal and returns "Not covered by a skill: <what>" for that reply.
Do this for other uncovered duties too; the index is not permission to omit
records. When following a skill as written causes waste, a defect or wrong
call, record skill-misguided with area orchestration, item duty, skill, what
and proposedFix. Say "Skill misguided: <skill>: <what it said> led to <what went
wrong>" and propose the corrected text in the same reply. jig-plan reads open
skill-gap and skill-misguided before changing the named skill. Repeats go to
a skill proposal or jig-correct rule review. Do not duplicate automatic tool
signals. Keep private project/environment details in their private stores.

## Provider notes

- Codex: load .agents/skills/jig-orchestrate; use provider codex for telemetry.
  As coordinator, use a tracked background assistant if available; otherwise
  use scripts first and launch mechanical work as a tracked worker job; in
  budget mode, ask the person rather than stall. As a worker, follow the worker
  rule. Scenario provider sessions
  need the person’s explicit say-so; this does not prohibit assistant agents.
- Claude Code: resolve the generated .claude/skills pointer to this source;
  use tracked background tasks and provider claude. Monitor may wrap portable
  status --follow; it is optional. Default to background Haiku or Sonnet
  assistant agents for mechanical work. Scenario provider sessions need the
  person’s explicit say-so; this does not prohibit assistant agents.
- Both: helper and ownership contracts are identical. Installing the skill
  authorizes assistant agents unless project settings or session rules disable them. Missing tracking or independent context is an evidence gap.
  Run telemetry.mjs start <project> <provider>, then telemetry.mjs end <project>
  <provider> <run-id> <passed|failed|stopped|partly>. Unknown tokens stay unknown.
