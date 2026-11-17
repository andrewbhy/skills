# jig skills

Ten independent plugins for Claude Code and Codex. Requires Node.js 22 or later on PATH; Git is needed for repository commands. See [CHANGES.md](CHANGES.md) for 0.3.0.

| Plugin | Installed skills (Claude Code) | Purpose |
|---|---|---|
| [jig-plan](plugins/jig-plan/README.md) | `/jig-plan:jig-plan` | Plan builds and check contracts. |
| [jig-verify](plugins/jig-verify/README.md) | `/jig-verify:jig-verify` | Verify behaviour and record verification receipts. |
| [jig-review](plugins/jig-review/README.md) | `/jig-review:jig-review` | Review changes with proportionate checks. |
| [jig-design](plugins/jig-design/README.md) | `/jig-design:jig-interaction`, `/jig-design:jig-mockup` | Design interactions and explore mockups. |
| [jig-git](plugins/jig-git/README.md) | `/jig-git:jig-worktree`, `/jig-git:jig-merge`, `/jig-git:jig-pr` | Manage worktrees, authorized merges and hand-offs. |
| [jig-learn](plugins/jig-learn/README.md) | `/jig-learn:jig-correct` | Record missed problems and improve checks. |
| [jig-spike](plugins/jig-spike/README.md) | `/jig-spike:jig-spike` | Run timeboxed feasibility experiments. |
| [jig-typescript](plugins/jig-typescript/README.md) | `/jig-typescript:jig-typescript` | Check strict types and module boundaries. |
| [jig-orchestrate](plugins/jig-orchestrate/README.md) | `/jig-orchestrate:jig-orchestrate` | Coordinate jobs; uses the tower if jig-tower is installed. |
| [jig-tower](plugins/jig-tower/README.md) | `/jig-tower:jig-tower` | Board, threads and Give with any orchestrator. |

In Codex, ask for the full skill name, for example `use jig-plan` or `use jig-tower`. Restart your host after installing or updating.

## Claude Code

Add the marketplace once:

```text
claude plugin marketplace add andrewbhy/skills
```

From the chosen repository, install all ten for that repository only:

```text
claude plugin install jig-plan@andrewbhy --scope local
claude plugin install jig-verify@andrewbhy --scope local
claude plugin install jig-review@andrewbhy --scope local
claude plugin install jig-design@andrewbhy --scope local
claude plugin install jig-git@andrewbhy --scope local
claude plugin install jig-learn@andrewbhy --scope local
claude plugin install jig-spike@andrewbhy --scope local
claude plugin install jig-typescript@andrewbhy --scope local
claude plugin install jig-orchestrate@andrewbhy --scope local
claude plugin install jig-tower@andrewbhy --scope local
```

For a chosen few, run only their lines, for example:

```text
claude plugin install jig-plan@andrewbhy --scope local
claude plugin install jig-verify@andrewbhy --scope local
```

## Codex

```text
codex plugin marketplace add andrewbhy/skills
```

Install all ten:

```text
codex plugin add jig-plan@andrewbhy
codex plugin add jig-verify@andrewbhy
codex plugin add jig-review@andrewbhy
codex plugin add jig-design@andrewbhy
codex plugin add jig-git@andrewbhy
codex plugin add jig-learn@andrewbhy
codex plugin add jig-spike@andrewbhy
codex plugin add jig-typescript@andrewbhy
codex plugin add jig-orchestrate@andrewbhy
codex plugin add jig-tower@andrewbhy
```

For a chosen few, run only their lines:

```text
codex plugin add jig-plan@andrewbhy
codex plugin add jig-verify@andrewbhy
```

### Choose plugins per repository

1. Open `<repo>/.codex/config.toml` and choose which plugins to enable for that repository.
2. Open `.git/info/exclude` and add the line `/.codex/config.toml`. A linked worktree uses the common Git directory's `info/exclude`.
3. Keep this config untracked. Exclusions do not hide an already tracked file; that needs a separate repository decision.

## Tower

Install only `jig-tower` for the board, threads and Give. In Claude Code:

```text
claude plugin install jig-tower@andrewbhy --scope local
```

In Codex, run `codex plugin add jig-tower@andrewbhy`. Restart the host after installing.

Find the installed plugin folder (`<jig-tower-plugin>` below):

- Claude Code: look up `jig-tower@andrewbhy` in `~/.claude/plugins/installed_plugins.json` and use its `installPath`.
- Codex: use `~/.codex/plugins/cache/andrewbhy/jig-tower/<version>/` (`local` for a local plugin). If the host does not expose its install location, ask the agent to use jig-tower. The skill finds its own plugin folder.

Enable the tower for your project, replacing both placeholders with absolute paths:

```text
node "<jig-tower-plugin>/scripts/layers-enable.mjs" --project "<repo>" --tower-only
```

This leaves orchestration off, creates missing review roots, keeps an existing `layers` key unless you choose `--force`, and installs no hooks. Ask the agent to use `jig-tower` (Claude Code: `/jig-tower:jig-tower`), or change to the project directory and run:

```text
node "<jig-tower-plugin>/scripts/tower.mjs" up
```

Open **http://127.0.0.1:7788** by default. For another port, use `tower.mjs up --port <n>`, for example `node "<jig-tower-plugin>/scripts/tower.mjs" up --port 7790`. It listens on loopback only. The tower serves one home page: the running rail, Needs you, Work and the side panel. The old `newHome` setting is gone; a `tower.json` that still holds it loads normally, and `doctor` notes the key as obsolete.

Merge commands need jig-orchestrate; if installed, run them from its plugin folder. Any orchestration skill can report to the board with the tower's `tower.mjs` commands. Only those commands and the tower server enforce the plugin version-mismatch write guard; direct helper calls do not. The client contract will be documented in a later slice.

### Give a thread to a session

Open a thread from the board and choose **Give** in the thread panel. It shows start lines: open Claude or Codex in the project folder, then paste the matching line. The session discusses that thread only; discussion grants no build or merge authority. Use **Return** on the thread, or tell the session to give the thread back, to hand it back to the coordinator.

### With jig-orchestrate

Install `jig-orchestrate` if you want its coordination workflow; it uses the tower if jig-tower is installed. Use `claude plugin install jig-orchestrate@andrewbhy --scope local` or `codex plugin add jig-orchestrate@andrewbhy`. To enable both layers, run:

```text
node "<jig-tower-plugin>/scripts/layers-enable.mjs" --project "<repo>" --force
```

This replaces only the existing layer choice. For queue-only coordination, use `--orchestration-only` instead. Hooks are optional, shipped in `hooks-optional/`, and never installed automatically. Keep both plugins at the same active version; a mismatch refuses writes while reads work. If an active sibling cannot be determined, doctor and up print a note.

## Repository rules

Before pushing, check the repository's own rules in AGENTS.md, CLAUDE.md,
CONTRIBUTING and project config, and the person's settings. Follow any push
restriction they state. Otherwise push the task branch with
`git push -u origin <branch>` without asking; pushing a branch needs no authorisation.
Do not push protected branches (`main`, `master`, the remote's default branch)
yourself unless a repository rule allows it; GitHub or GitLab branch protection
enforces them. The person reviews and merges.
Creating or editing a hosted pull request or merge request needs separate fresh
authorisation naming the branch and body hash; this does not gate a branch push.
In tower sessions the command guard also refuses these pushes, as a backstop.
Its project config `protectedBranches` replaces the protected-name defaults;
`[]` clears them, while an absent key keeps `main`, `master` and the remote
default. Force, delete, mirror, all and prune pushes remain refused.

## Where state lives

Personal notes, receipts, logs, queue and settings live in `~/.jig/<project>/`; set `JIG_HOME` to move the store. Projects are detached by default. Uninstalling a plugin keeps the store.

Under a sandbox that can't write `~/.jig`, records go to an ignored `.jig` folder in the repository, and the printed import command moves them later. The enable command needs write access to the personal store.

## Update or remove

Update the marketplace with `claude plugin marketplace update andrewbhy` or `codex plugin marketplace upgrade andrewbhy`. Update a selected plugin with `claude plugin update jig-plan@andrewbhy` or `codex plugin add jig-plan@andrewbhy`, substituting its name. Remove it with `claude plugin uninstall jig-plan@andrewbhy --scope local` or `codex plugin remove jig-plan@andrewbhy`.

## Licence

MIT; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Private plugins remain outside this public marketplace and export.
