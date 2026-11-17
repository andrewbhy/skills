# Queue and progress (draft)

`jig-orchestrate` coordinates the work; these Node helpers make no model calls,
start no detached jobs and grant no acceptance or merge authority. Use Node 22+.
The skill remains draft until its fresh provider scenarios pass.

Run from any shell, optionally with `--root DIR` (or JIG_QUEUE_ROOT). Paths in
queue/progress/ledger references resolve from that root, never the brief folder.

```
node "<skill-folder>/../../scripts/queue.mjs" add --file item.json
node "<skill-folder>/../../scripts/queue.mjs" ready
node "<skill-folder>/../../scripts/queue.mjs" suggest
node "<skill-folder>/../../scripts/queue.mjs" status
node "<skill-folder>/../../scripts/queue.mjs" status --follow --interval-ms 1000
node "<skill-folder>/../../scripts/jobcheck.mjs" --progress progress.json --plan plan.md --log job.log
```

`add JSON` also accepts one JSON argument; `add --file FILE` avoids shell quoting.
`ready` lists pending IDs whose dependencies are done or in review; it does not apply launch
gates. `suggest` applies all hard gates, prints one ready/wait line per pending
item, reserves capacity within that suggestion, and never says it launched work.
Exit codes: 0 success (including an empty ready/status); 1 invalid or refused;
2 queue lock busy or resource guard blocked; 3 suggest has nothing ready for
non-resource reasons. Invalid configuration fails closed. Empty queues exit 3
from suggest. Ctrl-C or termination ends follow cleanly. Watch prints only
changed snapshots, including elapsed-time and stale-boundary changes.

`<skill-folder>/../../scripts/queue-schema.mjs` is the single source of persisted record rules for queue readers and tower writers. Writers validate each changed record before storing it. Item text may contain line breaks but must be non-empty and contain no NUL; job fields remain single-line. The schema also owns waits and queue dependency validation; `wait-list.mjs` re-exports its normaliser.

`.jig/queue.json` is version 1, `{ "version": 1, "items": [...] }`. Add items:

```json
{
  "id": "unit-a", "item": "Build the unit", "plan": "plan.md",
  "worktree": "tasks/unit-a", "dependsOn": [], "touches": ["src/unit.mjs"],
  "provider": "claude", "area": "logic", "state": "pending",
  "progressFile": "progress.json", "browser": false, "nextDecision": false
}
```

IDs are unique. Dependencies must exist and be acyclic. States: pending,
starting, running, done, failed, stopped, review. `done` means a complete passed result;
`review` means presentation prerequisites passed, never accepted. Worktree and
touches paths are canonicalised; touches resolve within their item's worktree.
Absolute/shared paths also conflict. Directory/glob prefixes reserve their
whole subtree conservatively; list files precisely when practical. A shared
worktree always conflicts. Relative worktrees resolve from the queue root.

Queue mutations take an exclusive `.jig/queue.json.lock`, write a unique temp
file and rename atomically. Readers see the old or new complete queue. A busy
writer exits 2; retry after its owner finishes. Locks are not stolen by age.
After a crashed writer, the coordinator verifies the owner has stopped before
removing its abandoned queue lock. A project uses one shared queue root for
all its worktrees; separate copies do not coordinate each other.

Progress is version 1; writers replace the file atomically on each update:

```json
{
  "version": 1, "startedAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:01:00Z", "timeboxMinutes": 20,
  "steps": [{ "label": "build", "done": false }, { "label": "check", "done": false }]
}
```

On completion append `result: {outcome: "passed", complete: true}`; other
outcomes are failed, stopped and incomplete. A pass requires every step done.
Missing steps/timestamps/timebox refuse launch. Missing/malformed progress is
a status gap. A running job with a finished result is flagged for reconciliation.
At ten minutes without progress status offers wait, stop or re-plan; elapsed
above timebox has the same choices. Incomplete and budget-stopped results fail.

First use `reserve ID JSON` with its `progressFile` to atomically check gates
and reserve capacity. Only then call the provider's tracked background tool,
and `launch ID JSON` with its `taskId` and the returned `reservationId`.
A recording failure requires stopping that task. A starting reservation
remains visible and blocks conflicts until its task is reconciled; it is never
stolen by age. Missing progress/timebox refuse before invoking the tool.
`finish ID` reconciles the result. The exported `dispatchReady` is the adapter
for the five skill triggers, requiring a tracked launcher callback and optional prepare callback returning
the progress path before reservation; it records
receipts and prints launched lines only after tracking succeeds. `suggest`
is advisory: the actual visual launch holds its browser lock until disconnect.
A task launcher must not treat a suggestion as an acquired browser slot.

Machine configuration in `.jig/config.json`:

```json
{
  "orchestration": { "concurrency": 1, "providers": ["claude"] },
  "browser": { "minFreeGB": 4, "slots": 1 }
}
```

Set concurrency from measurement. Without configuration it is 1 and providers
are discovered as executable names on PATH. Missing providers block their jobs.
Guard memory uses os.freemem() on all platforms. The default shared browser
lock directory is under the user's home, `.jig/browser-slots`; override
browser.lockDir only with a directory shared by every cooperating session.
The guard supports JIG_BROWSER_MIN_FREE_GB and JIG_BROWSER_SLOTS overrides.
It refuses uncertain ownership, reclaims confirmed dead local PIDs and exits 2
on low memory or busy slots. Sequential and layered visual-check, visual-clip
and visual-motion all use the guarded launchChrome function. No browser is
started with JIG_NO_BROWSER=1.

Ordering is lexicographic, not a score: earliest queued reachable nextDecision,
then longest dependency chain to unblock it, then insertion order. Every
eligible disjoint item is selected until capacity is full. `status` names
unmet dependencies, providers, memory, cap, overlap and repeat-rule-review waits.
Repeat incidents are read from docs/missed-problems.jsonl by area/class; an
incident-linked existing ruleReview is required for each repeated incident.

The feedback ledger is `.jig/feedback.json`, version 1 with `items` containing
`{item: "unit-a", state: "open"}` (or closed). `markReview` reads it from disk,
and requires complete passed progress, builder/coordinator identity and gate,
reviewer and presentation evidence each `{passed: true, by: "seat", revision:
"revision-id"}`. Reviewer identity must differ from builder and coordinator;
all evidence must match the candidate revision. These records are evidence,
not cryptographic proof of independence; fresh review is still required.
`checkReply` merges linked review lists at the top and rejects multiple questions.

`recordFailure` stops a slice after two gate/review failures and calls signals.mjs
for an escalation; use its set command to add the later decision. `reportDuty`
records gaps/misguided instructions and returns the required reply line.
`checkApply` refuses sync during jobs, non-HEAD patches and untested commits,
and checks claimed files against changed files. The coordinator must still
inspect actual claims, executable wiring and plan hashes. These helpers are
public JS adapters for the skill, rather than an autonomous provider launcher.

`jobcheck` prints progress, plan SHA256, bounded last log lines/test counts,
Git change counts and free memory in at most 12 lines. Missing inputs give
explicit gaps. It reads at most 64 KiB of log tail and truncates each shown
line to 240 characters. UTF-8 and BOM-marked UTF-16LE shell logs are supported. It counts eligible scripted/delegated/manual reads in
`.jig/orchestration-reads.json` under an exclusive lock; use `--read-kind` for
the latter two. Its automation share is (scripted + delegated) / all eligible
reads, for the coordinator to include in telemetry; exact-judgement reads are
excluded. Update updatedAt on completion; elapsed time freezes at that timestamp.
Optional waitsFor (a string or a list of strings; an empty list means no waits) names plan/merge/person
holds and blocks scheduling until the coordinator records the decision and clears them.
The queue holds two kinds of record. A job has a plan and a worktree, and needs provider, area,
dependsOn and touches; only jobs with at least one declared touch are scheduled. Board items
added by the tower need only id, item and state, may carry a plan link, and are never scheduled;
status counts them on one line.
Provider tokens remain unknown until provider records are available.
Keep queue, progress, decisions, feedback and handoff files durable and private.
Cleanup belongs to jig-worktree close and jig-merge.
