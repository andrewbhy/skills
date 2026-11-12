---
name: "jig-merge"
description: "Take a verified and reviewed task branch through an authorized merge, checks on the merged result, and immediate worktree and scratch cleanup. Use when a branch is ready to merge, including hosted merge requests."
---

# jig-merge

Carry the branch through cleanup, with evidence for each gate. A review's merge suggestion grants no authority.

When delegated, the coordinator retains merge authority and the final diff/evidence
check. The worker runs suites on branch and base, review triage, the authorized
merge, the suite on the merged result and doctor. Stop before deleting any
resource (worktree, branch, folders or data); report the exact worktree close
command for the coordinator to execute. This boundary overrides immediate cleanup
in step 5 for a delegated worker; report the lifecycle as pending until closed.

Use the main checkout as `<project-root>` for telemetry. Before removing a task worktree, resolve the helper and marker paths in that surviving checkout so the end marker can still be written.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-merge/telemetry.mjs" start "<project-root>" <provider>`; retain the run ID (`off` means disabled). Record the jig version from [VERSION](VERSION).

1. **Establish readiness.** Read project rules, relevant decision records, base and branch, and their current revisions and dirty status. Require jig-verify evidence for the exact candidate and jig-review's triage, required seats, resolved findings and merge suggestion. Missing checks, unresolved blocking findings or stale evidence stop the merge; obtain or refresh them first. Skill changes also require the project's recorded two-provider scenario results. Check that the branch contains the current base; update it and rerun affected checks and review when the candidate changes. Do not overwrite unrelated working changes.
2. **Establish authority.** Identify the person's approval for this exact merge or the project standing rule whose conditions this change satisfies. State which applies and where it is recorded. A positive merge suggestion, passing tests, the skill invocation or an automated tool response is not permission. If neither authority exists, stop before merging and ask the person to approve the concrete candidate, presenting its revisions, evidence and remaining gaps. Existing session authorization persists; do not ask again when it already covers this action.
3. **Integrate by meaning.** For several branches, merge them into an integration branch first and run the full suite on their combined result before merging to the base. Resolve append-only docs by retaining both sides without duplicating entries. Regenerate generated files from their canonical sources. Never resolve product code by blindly picking a side; understand both intents, preserve the contract, and ask if intent cannot be established. Rerun affected tests and refresh evidence and review after resolutions. Abort or leave an explicit pending state on failure; do not force a merge through a failed gate.
4. **Merge and verify the result.** From the clean target checkout, reconfirm the exact approved candidate and base, then merge using the project's method. Commit messages and merge request descriptions carry no AI attribution (no Co-Authored-By agent trailers, "Generated with" lines or session links) unless the project asks for it. Hosted merge requests follow the same evidence and authority gates; write their descriptions for a reviewer who has not seen the conversation. Identify the resulting revision and run the project's full suite there, including generated-file drift checks. Do not substitute the pre-merge branch's test result. If it fails, report that the merge happened but verification failed, preserve the branch, worktree and scratch for diagnosis, and fix within the granted scope; do not claim completion or automatically undo shared history.
5. **Clean up immediately and report.** After the merged result passes, use jig-worktree and the shared `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-merge/worktree.mjs" close <name>` from the surviving checkout; [worktrees.md](worktrees.md) defines the command and configuration. Never hand-delete folders or force a dirty/unmerged refusal. Run `doctor` at the end of the batch. Tell the person afterwards: authority applied, merged revision, full-suite result, what worktree/branch/scratch was removed, and anything pending. If cleanup is blocked, report the command and surviving resources; the lifecycle is incomplete until closed.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-merge/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>` before reporting. Disclose marker failures. Tokens come from provider records; unknown stays unknown.

## Provider notes

- **Codex:** use `codex` for telemetry and the canonical `.agents/skills/jig-merge/`. If the sandbox cannot write the common `.git` directory, leave merge execution pending for an authorized worker and deletion pending for the coordinator. An authorized future session may allow it with `--add-dir <main-checkout>/.git` plus write access to the main checkout and sibling root; do not try to bypass the current sandbox. Preparation and reporting can continue while those operations remain pending.
- **Claude Code:** use `claude` for telemetry. Read this source through the generated `.claude/skills/jig-merge/SKILL.md` pointer and resolve helpers here. Use the shared worktree script, never `.claude/worktrees`, and report permission-blocked execution for the coordinator to assign to an authorized worker; only the coordinator deletes resources.
