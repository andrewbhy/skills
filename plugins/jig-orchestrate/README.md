# jig-orchestrate

Coordinate jobs with an optional dashboard.

Skills: /jig-orchestrate:jig-orchestrate. In Codex, request these skill names directly.

Needs Node.js 22 or later on PATH. Git is required for repository commands. Run `npm ci --ignore-scripts` in this plugin folder for helpers with declared package dependencies; browser checks also need local Chrome/Chromium. Optional host tools report gaps when unavailable.

Install independently with `claude plugin install jig-orchestrate@andrewbhy --scope local` or `codex plugin add jig-orchestrate@andrewbhy`.

State and history stay in `~/.jig`; removing this plugin keeps them.

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

