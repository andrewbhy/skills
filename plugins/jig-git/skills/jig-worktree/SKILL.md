---
name: "jig-worktree"
description: "Open, list, register scratch folders, close and diagnose task worktrees. Use for any parallel or delegated task and for cleanup after a merge or a batch of branch work."
---

# jig-worktree

Keep one branch and one worktree per task. Use the shared script so finished branches and scratch runs do not rely on remembered cleanup.

Before writing run `claim <name>`, refresh with `heartbeat <name>` every minute
using the same holder identity, and run `release <name>` at handoff. Worktree claims in the jig store
record the identified session and agent ancestor. Another live holder blocks
claim, open and close, naming the holder. A stale heartbeat or mismatched
process start time is reclaimable. Claims require jig's canonical
review-capabilities helper; standalone copies without it report the dependency.
Run `brokers` to discover and record live app-server-broker.mjs serve processes
whose --cwd exactly matches a registered worktree. After the job result is read,
with no resume planned, run `stop-broker <name>`; it also discovers brokers and
rechecks cwd, PID, start time and command before stopping. Close stops matching
registered brokers too; an absent registry does not block close. Discovery
fails clearly when command-line inspection is denied; fixture checks do not
establish live broker operation in that environment.

Use the main checkout as `<project-root>` for telemetry. Before removing a task worktree, resolve the helper and marker paths in that surviving checkout so the end marker can still be written.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-worktree/telemetry.mjs" start "<project-root>" <provider>`; retain the run ID (`off` means disabled). Record the jig version from [VERSION](VERSION).

1. **Open before parallel work.** Read the project's rules and [worktrees.md](worktrees.md). Run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-worktree/worktree.mjs" list` from a checkout. Use `open <name>` for every task worktree before work starts, including parallel or delegated tasks. Open and close worktrees only through this helper; never use raw Git worktree creation/removal, forced branch deletion or recursive filesystem deletion. If a worktree already exists from raw Git, register its actual branch with `adopt <name> <path>` before closing it. Pick a short task name, lowercase words separated by hyphens, optionally with a category such as `fix/empty-state`; it names both the new branch and folder. Read `.jig/worktree.json` in the main checkout for the root, main branch and default base. Use `--base <local-branch>` when the task requires another base. Never reuse another task's branch or bypass a refusal by moving files manually.
2. **Register scratch immediately.** Create each disposable run folder outside all checkouts, then run `register <name> <folder>` before filling it. Registration explicitly marks the whole folder as disposable on close. Register only this task's scratch, never shared data or a repository. Use dedicated folders so unrelated artifacts survive. Report a registration failure before continuing; no automatic cleanup claim is valid for unregistered folders.
3. **Close right after merge.** Let jig-merge establish authority, merge and verify the merged result. Run `close <name>` from a surviving checkout immediately afterwards. Use `--into <local-branch>` for the branch actually merged into, or set `integrationBranch` in `.jig/worktree.json`. It removes the Git worktree, task branch and registered scratch. A dirty or unmerged refusal means preserve the work and report why. Do not use `--force` just to finish the batch: only discard work with the person's explicit authorization and pass their stated reason via `--force --reason <text>`. A failed cleanup stays pending; inspect `doctor` and report surviving paths. Close refuses unconsumed private files under `.jig/` and other ignored files outside disposable directories, even with force. Use `--import <surviving-dir>` to copy and verify them before removal, or `consume <name> <file>` only after preserving or using that file. Consumption records its hash; changed files refuse again. Import never overwrites different bytes. On failure preserve the worktree and reported copies; never bypass a refusal with raw commands.
4. **End each batch with doctor.** Run `doctor` and show stale worktrees, scratch folders and provider backstop status. Follow the optional installation instructions in [worktrees.md](worktrees.md); report missing coverage without installing personal settings automatically. It previews only. Close safe, registered live worktrees individually within existing cleanup authority. Ask for confirmation of the specific resources before sweeping other stale entries; inspect missing, changed-branch or prunable registrations for manual recovery. Never recursively delete an unregistered folder or remove worktree metadata to get around a refusal. Report remaining resources and reasons.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-worktree/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>` before reporting. Disclose marker failures; token counts come from provider records, never estimates.

## Provider notes

- **Codex:** use `codex` for telemetry. Optional command prefix rules are documented in worktrees.md; they apply outside the sandbox and provide partial coverage only. Doctor reports project rule-file presence, not runtime trust or enforcement. Read the source in `skills/jig-worktree/`. A sandbox that cannot write the common `.git` directory cannot open or close worktrees: the coordinator opens before delegation and closes after merge. Report the exact pending command. An authorized future session can allow the common Git directory, for example `--add-dir <main-checkout>/.git`; never assume this changes the current sandbox. The main checkout's `.jig` directory and sibling worktree root also need write access for mutations.
- **Claude Code:** use `claude` for telemetry. The optional PreToolUse command hook and settings snippet are documented in worktrees.md; doctor reports project configuration, not runtime enablement. Follow the generated `.claude/skills/jig-worktree/SKILL.md` pointer to this source and resolve helpers here. Do not use the provider's own `.claude/worktrees` for jig work or an automatic worktree option that creates them; open with this script before delegating. If permissions prevent that, have the coordinator do it.
