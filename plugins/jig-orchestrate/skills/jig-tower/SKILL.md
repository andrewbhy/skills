---
name: "jig-tower"
description: "Start or resume the jig control tower (the review dashboard): reuse or start its server, print the URL, arm the thread watch, print a one-line board summary and, after a crash or restart, the handoff note, interrupted work and unanswered person messages. Use at the start of a coordinating session and to resume one."
---

# jig-tower

Before any start, resume, watch or server probe, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/layers.mjs" <project>`. If tower is false, report "tower is off for this project: set layers.tower" and give the exact opt-in command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/layers-enable.mjs" --project "<project>"` (from the jig checkout or installed jig-orchestrate plugin folder). Replace `<project>` with the project path. Explain that this enables orchestration and the tower for that project, preserves an existing `layers` key unless the person chooses `--force`, and installs no hooks. Stop this workflow until the person enables it. Do not start or probe a server, read dashboard state, or create session and ownership files.

Scenario status: fresh two-provider runs are pending; local tests prove the
helper contracts (`tests/tower.test.mjs`), not instruction following.
Start/end telemetry with telemetry.mjs beside this skill; retain the run ID.

The tower is jig's dashboard for the person: what needs them, what runs, what was
decided. The commands below run from the jig checkout (`<jig-root>`); `tower.mjs` takes
every `review.mjs` command unchanged and adds `up`, `resume` and `summary`. Everything is
idempotent: run it again at any time.

1. **Start or reuse the server.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" up` starts the server detached
   (log: `tower.log` in the personal store) when nothing answers on 127.0.0.1:7788, and reuses the
   running one otherwise. Print the URL it reports for the person. Never restart a server that
   answers; the person may be using it.
2. **Resume (every start of a session, and always after a crash or restart).**
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" resume [--stale-minutes N]` prints, without changing anything:
   - the handoff note, `orchestrator-handoff.md` in the project's personal store, and where it points;
   - interrupted work: queue items still `running` whose progress and thread have shown no sign of
     life for N minutes (default 20), or never did, with worktree, branch, changed files and last
     commit, and the suggested `queue-set <id> --state waiting-other --waits "interrupted: resume or
     relaunch"`. Check each worker before applying it: relaunch, or record that it is gone. The
     command only prints suggestions;
   - person messages newer than the coordinator's last reply in each thread. Answer these first,
     oldest first, before launching new work;
   - one line: for you, running, board issues (`summary` prints just this line).
3. **Arm the watch.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" watch --once [--thread <id> ...] [--since <cursor>]`
   as a tracked background task with completion notification and a visible exit code. It waits
   without a deadline, prints the first batch as `<thread> | <text>` lines, then `cursor <value>`,
   and exits 0. Each attached image follows the text as `[image: <absolute path>]`; open it to see it.
   Answer with `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" reply <thread> "<text>"`, then re-arm with the last cursor.
   Repeated `--thread` flags select threads; without them it watches all threads. Without `--owner`,
   it skips owned threads. Owners add `--item <id> --owner <session> --generation <n>` from their claim.
   An explicit `--since` wins over the saved per-caller cursor; a first plain arm starts from now.
   A stale/unknown cursor warns once and starts from now. Exit 2 means invalid arguments or an
   unreadable store; report the error before retrying. Exit 3 names a changed owner; refresh
   ownership before acting or re-arming. Stop the background task when the session ends.
4. **Check the board.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" doctor` lists impossible or stale combinations
   (`--stale-minutes N` sets the running-item limit, default 120). Repair with `queue-set`, never by
   editing queue.json. `node "${CLAUDE_PLUGIN_ROOT}/scripts/tower.mjs" undo` takes back the last state change (10 minutes).
5. **Keep the handoff current.** After each batch (a job finished, a merge landed, a launch), rewrite
   `orchestrator-handoff.md` in the personal store: what is running and where (worktree, branch,
   job id), what waits on the person, and the next steps. A new session can only resume what this file
   and the board say. No automatic start on login exists; the person starts the tower with this skill.

Report: the URL, whether the server was started or reused, the resume findings, the watch state,
and anything that could not be checked.

## Provider notes

- Codex: load the canonical skills/jig-tower source; telemetry provider is codex. Run
  `watch --once` with the last cursor as a tracked background job with completion notification.
  If no such job is available, tell the person that messages are only seen on `tower.mjs resume`.
- Claude Code: use the generated .claude/skills/jig-tower pointer and resolve helpers at its
  canonical target; telemetry provider is claude. Run `watch --once` as a background command,
  retain its task ID and visible exit code, handle the batch, then re-arm with the last cursor.
  Use Monitor only for a short supervised wait.
- Both: run 'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-tower/telemetry.mjs" start "<project-root>" <provider>' and
  'node "${CLAUDE_PLUGIN_ROOT}/skills/jig-tower/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>'.
  Scenario provider sessions need the person's authorization; none were run for this skill yet.
