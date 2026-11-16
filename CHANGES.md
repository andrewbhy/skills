# Changes

## 0.2.0

- Split jig into nine independently installable plugins for Claude Code and Codex.
- Keep orchestration and tower layers off by default; enable them per project with `layers-enable.mjs`.
- Record verification receipts for the checked revision and suite command.
- Add jig-pr for evidence-backed branch and pull request hand-offs.
- Fall back to untracked worktree state when a sandbox denies store writes; import it later with `jig-store import`.
- Exclude private plugins and their registry from the public release.
