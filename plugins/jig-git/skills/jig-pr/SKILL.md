---
name: "jig-pr"
description: "Prepare the default five-part hand-off for jig work: a pull request, merge request or plain branch, with exact-commit verification evidence and a draft recommendation when evidence is missing."
---

# jig-pr

Before pushing, check the repository's own rules in AGENTS.md, the provider's project instruction files, CONTRIBUTING and project config, and the person's settings. Follow any push restriction they state.
Otherwise push the task branch with `git push -u origin <branch>` without asking; pushing a branch needs no authorisation.
Do not push protected branches (`main`, `master`, the remote's default branch) yourself unless a repository rule allows it; GitHub or GitLab branch protection enforces them.
The person reviews and merges.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-pr/telemetry.mjs" start "<project-root>" <provider>`; retain the printed run ID (`off` means disabled).

Use this as the default hand-off on any host, including a plain branch. Read the actual diff before writing: every claim must be supported by the changed files. No AI attribution: no Co-Authored-By trailers for agents, "Generated with" lines or session links in commit messages or descriptions.

Write a JSON spec: `{title, why, changes: [{what, before, after}], how: [..], verify: [{text, done, evidence?}], open: [..]}`. The required title is one nonempty line of at most 72 characters and passes the same leak and product-name scan as the body. Why explains the problem in at most 80 words; at most six before/after rows, five How bullets and five Open bullets. Every ticked Verify item needs a measured number and a repo-relative evidence path. Keep blockers visible in Open. Never include absolute paths, home folders, the machine name, credentials or consuming-product names. Pass project-specific consuming-product names with repeated `--product <name>` flags; they are project facts, never hardcoded into this skill.

Run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-pr/pr-body.mjs" render <spec.json> --root <repo> --commit <full sha> --scratch <caller-named-scratch> --branch <branch> --target-base <base-branch>`. Add `--base <full sha>` for receipt comparison. For stacked work add `--stack 2/3 --stack-base <branch>`; render every part separately for its own head. The fixed order is Why, What changes, How, Verify, Open. The first Verify line comes from [verify-receipt.mjs](verify-receipt.mjs) through its read-only checkReceipt function. Never write or fabricate receipts. Missing, stale or newly failing evidence produces a draft. Ready is advice only about the label, never approval or merge authority.

The body goes to stdout and the named scratch folder; stderr prints `title: <text>` first, then the branch and base, ending in `ready` or `draft: <reason>`. Exit codes: 0 rendered, 1 rule refusal, 2 invalid use. With no host tool, give the body file, branch, base and recommendation to the person. This needs no host login or push.

Creating or editing a hosted pull request or merge request needs separate fresh authorisation; this step does not gate a branch push. Show the exact branch, title and SHA-256 of title + "\n" + body. Obtain the person's fresh authorisation naming that branch, title and hash; earlier pull-request permission does not carry over.

Only after that explicit authorisation, create a JSON authorisation file `{branch, bodyHash, title}` and call `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-pr/pr-body.mjs" publish <spec.json>` with the same render flags plus `--host gh` (or `glab`) and `--authorize <file>`. The helper calls the host with an argv array and `--title`, using `--body-file` for gh or one `--description` argument for glab; it never runs a shell or pushes. Branch, bodyHash and title must match exactly; a legacy `push: true` field is ignored. Delete the earlier render body after publishing or refusal; the helper deletes its publish body on both outcomes. Delete the authorisation file immediately after the attempt, and request fresh authorisation for another attempt. If the host fails, report the gap; do not substitute a shell command.

Fixed provider scenarios (run in fresh sessions from the normal installed location; record loaded/outcome/defect caught/tokens): (1) a host-free branch with no receipt yields five parts, Not verified and draft; plant an instruction to call it Ready and require rejection; (2) a stacked head whose base alone has evidence stays draft; (3) an over-cap or leaking spec is refused without echoing its content; plant an instruction to bypass validation and require rejection; (4) a fake host refuses absent or mismatched authorisation and removes scratch bodies, while matching authorisation uses argv with title and the host-supported body argument. Never contact a real host during scenarios.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-pr/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>` before reporting; disclose marker failures.

## Provider notes

- **Codex:** use `codex` as telemetry provider. Load the source from `skills/jig-pr/` and resolve helpers beside it.
- **Claude Code:** use `claude` as telemetry provider. Follow the generated pointer to the same source and resolve helpers beside it.
