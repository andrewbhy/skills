# Changes

## 0.3.0

- Add jig-tower as the tenth independently installable plugin: the board, threads and Give work without jig-orchestrate, and any orchestration skill can report to the board through `tower.mjs` commands. jig-orchestrate uses the tower when jig-tower is installed. Upgrading: the `jig-tower` skill and `/tower` command move out of jig-orchestrate, so install jig-tower to keep using the tower.
- Give prints start lines with the installed plugin's absolute path, so a session started from any project can claim, reply to and return a thread.
- The tower refuses board writes while jig-tower and jig-orchestrate are installed at different active versions; reads still work.
- The tower always serves the new home page; the classic page and the `newHome` setting are removed. Existing `tower.json` files that hold the key still load.
- Rename the `review-*` scripts to `tower-*` and `orchestrate-*`; `review.mjs` still forwards to `tower.mjs`.
- Agents may push task branches. Pushes to protected branches (`main`, `master`, the remote's default, or the project's `protectedBranches`) stay refused with a reason; branch protection on the Git host is the real enforcement.
- `queue.mjs status` reads boards written by the tower, including board items, multi-line text and text waits. Every queue writer now validates a record with the reader's own schema before writing it.
- jig-pr's `pr-body.mjs publish` opens the pull request or merge request itself, with a title, on GitHub and GitLab.

## 0.2.0

- Split jig into nine independently installable plugins for Claude Code and Codex.
- Keep orchestration and tower layers off by default; enable them per project with `layers-enable.mjs`.
- Record verification receipts for the checked revision and suite command.
- Add jig-pr for evidence-backed branch and pull request hand-offs.
- Fall back to untracked worktree state when a sandbox denies store writes; import it later with `jig-store import`.
- Exclude private plugins and their registry from the public release.
