# The personal store

All personal jig state lives outside project repos, in `~/.jig` (override with `JIG_HOME`), one folder per project:
decisions (`decisions.jsonl`), threads, review items, progress, queue, telemetry, signals, retros, worktree registry and the
dashboard config (`review-roots.json`, `config.json`). `projects.json` maps project names to repo paths; a linked worktree
uses its main checkout's project. Everything goes through `scripts/jig-store.mjs`, so a dedicated store can replace the files later.

Until a project has state in the store, its repo's own `.jig/` is used unchanged (backward compatible). Tests run with no
store root unless `JIG_HOME` is set, so a suite never touches a real store.

## What stays in a repo, and why
- `.jig/testing.json`: configures that repo's own test budget (tracked).
- `.jig/review.json`: review policy, read from the git base revision by diff-signals (tracked).
- `.jig/consumed.json`: receipt inside a worktree for its own close checks.

## Moving state
`node scripts/jig-migrate-state.mjs --project <name>=<repo> [...] [--home <dir>]` is a dry run. `--apply` copies, verifies every
file by hash, writes `projects.json` and prints removal commands; it never deletes. Run it with writers stopped, restart the
dashboard and agents on this code, then remove the old copies. Repeat runs refresh append-only jsonl files and report any other
difference as a conflict.

## Board rules
Status comes from one function (`statusOf` in review-core). Moves go through the state machine in `review-states.mjs`; change a
queue item with `review.mjs queue-set`, `park`, `unpark`, never by editing queue.json. `review.mjs doctor` lists impossible or stale
combinations; the dashboard shows their count.

## The jig control tower ("tower")
The dashboard is the jig control tower. `node scripts/tower.mjs <command>` takes every `review.mjs` command unchanged and adds
`up` (start or reuse the server), `resume` (after a crash or restart) and `summary`; `review.mjs` and its URLs keep working.
`/jig-tower` (skill `jig-tower`) runs the start and resume steps. Small personal files the tower keeps per project in the store:
`seen.json` (when you last looked at each thread and at Home, plus board snapshots for the digest), `undo.json` (the last state
change, 10 minutes), `oq-answers.json` (open questions answered on the dashboard; `open-questions.md` itself is never rewritten),
and `orchestrator-handoff.md` (written by the coordinator after each batch: what runs where, next steps).
