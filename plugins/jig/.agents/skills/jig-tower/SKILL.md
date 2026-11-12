---
name: "jig-tower"
description: "Start or resume the jig control tower (the review dashboard): reuse or start its server, print the URL, arm the thread watch, print a one-line board summary and, after a crash or restart, the handoff note, interrupted work and unanswered person messages. Use at the start of a coordinating session and to resume one."
---

# jig-tower

Scenario status: fresh two-provider runs are pending; local tests prove the
helper contracts (`tests/tower.test.mjs`), not instruction following.
Start/end telemetry with telemetry.mjs beside this skill; retain the run ID.

The tower is jig's dashboard for the person: what needs them, what runs, what was
decided. The commands below run from the jig checkout (`<jig-root>`); `tower.mjs` takes
every `review.mjs` command unchanged and adds `up`, `resume` and `summary`. Everything is
idempotent: run it again at any time.

1. **Start or reuse the server.** `node scripts/tower.mjs up` starts the server detached
   (log: `tower.log` in the personal store) when nothing answers on 127.0.0.1:7788, and reuses the
   running one otherwise. Print the URL it reports for the person. Never restart a server that
   answers; the person may be using it.
2. **Resume (every start of a session, and always after a crash or restart).**
   `node scripts/tower.mjs resume [--stale-minutes N]` prints, without changing anything:
   - the handoff note, `orchestrator-handoff.md` in the project's personal store, and where it points;
   - interrupted work: queue items still `running` whose progress and thread have shown no sign of
     life for N minutes (default 20), or never did, with worktree, branch, changed files and last
     commit, and the suggested `queue-set <id> --state waiting-other --waits "interrupted: resume or
     relaunch"`. Check each worker before applying it: relaunch, or record that it is gone. The
     command only prints suggestions;
   - person messages newer than the coordinator's last reply in each thread. Answer these first,
     oldest first, before launching new work;
   - one line: for you, running, board issues (`summary` prints just this line).
3. **Arm the watch.** Start `node scripts/tower.mjs watch` as a persistent background monitor: it
   prints one line `<thread> | <text>` per new person message and nothing else; each attached image follows the text as `[image: <absolute path>]`, so open the file to see it. Re-arm it when it
   expires or the session restarts. Answer with `node scripts/tower.mjs reply <thread> "<text>"`.
4. **Check the board.** `node scripts/tower.mjs doctor` lists impossible or stale combinations
   (`--stale-minutes N` sets the running-item limit, default 120). Repair with `queue-set`, never by
   editing queue.json. `node scripts/tower.mjs undo` takes back the last state change (10 minutes).
5. **Keep the handoff current.** After each batch (a job finished, a merge landed, a launch), rewrite
   `orchestrator-handoff.md` in the personal store: what is running and where (worktree, branch,
   job id), what waits on the person, and the next steps. A new session can only resume what this file
   and the board say. No automatic start on login exists; the person starts the tower with this skill.

Report: the URL, whether the server was started or reused, the resume findings, the watch state,
and anything that could not be checked.

## Provider notes

- Codex: load the canonical .agents/skills/jig-tower source; telemetry provider is codex. Run the
  watch as a tracked background job if the session offers one; otherwise tell the person that new
  messages are only seen when `tower.mjs resume` is run.
- Claude Code: use the generated .claude/skills/jig-tower pointer and resolve helpers at its
  canonical target; telemetry provider is claude. Arm the watch with the Monitor tool and re-arm it
  when it ends.
- Both: run 'node "<skill-folder>/telemetry.mjs" start "<project-root>" <provider>' and
  'node "<skill-folder>/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>'.
  Scenario provider sessions need the person's authorization; none were run for this skill yet.
