# jig at work

jig is a set of skills for planning, reviewing, verifying and coordinating agent work. In work mode it adds nothing to the repository you are working in: every note, log and setting lives in `~/.jig`.

## Install

Needs Node 22 or later on the PATH, and Claude Code or the Codex CLI. The plugin is the `jig` folder of the `andrewbhy/skills` repository, which is a marketplace named `andrewbhy` for both tools.

Claude Code (macOS or Windows):

```
claude plugin marketplace add andrewbhy/skills
claude plugin install jig@andrewbhy
```

Codex:

```
codex plugin marketplace add andrewbhy/skills
codex plugin add jig@andrewbhy
```

Restart the tool (or start a new session) after installing. Offline or behind a proxy: clone the repository, then `claude plugin marketplace add <path to the clone>` or `codex plugin marketplace add <path to the clone>`.

## First run

In any repository, in Claude Code, run `/jig:plan` (an alias for the `jig-plan` skill; `/jig:jig-plan` also works). The other aliases are `/jig:review`, `/jig:verify`, `/jig:spike`, `/jig:correct`, `/jig:interaction`, `/jig:merge`, `/jig:mockup`, `/jig:orchestrate`, `/jig:tower`, `/jig:typescript` and `/jig:worktree`.

In Codex, name the skill in your prompt, for example "use the jig-plan skill". The slash aliases are a Claude Code feature.

## Where state lives

- Everything personal goes under `~/.jig/<project>/`, where `<project>` is the repository folder name: telemetry markers, signals, the review queue, missed-problem records, design feedback, plans and results the skills write.
- Set `JIG_HOME` to move the store.
- Nothing is written into the repository or into the plugin folder (the plugin folder changes on every update).
- Telemetry is on and local: markers stay in `~/.jig/<project>/telemetry.jsonl` and nothing is sent anywhere. Turn it off with `{ "telemetry": false }` in `~/.jig/<project>/config.json`.

## Detached by default

A repository is detached unless you registered it as your own in `~/.jig/projects.json` (`"name": "path"` or `"name": { "path": "...", "mode": "own" }`). A detached repository's own `.jig` folder is ignored, and a script that would write into the repository stops with exit code 2 and names `--in-repo`. Skills write plans and results to `~/.jig/<project>/plans` and `results` instead of `docs/`.

## Tower (review dashboard)

Create `~/.jig/<project>/review-roots.json` once: `{ "roots": [ { "prefix": "runs", "path": "<folder with files to review>" } ] }`, then run `/jig:tower` in Claude Code (in Codex, ask it to use the jig-tower skill). The dashboard listens on `127.0.0.1` only. To group work by project, add `~/.jig/project-groups.json` (see the comment at the top of `scripts/project-groups.mjs`).

## What reads local logs

`telemetry-report.mjs` and `usage.mjs` read the session logs that Claude Code and Codex keep under `~/.claude` and `~/.codex` to total tokens. They read local files only and use no network. The visual and mockup helpers need `npm ci` in the plugin folder for `playwright-core`; they are not needed for planning, review or verification.

## Update

Claude Code:

```
claude plugin marketplace update andrewbhy
claude plugin update jig@andrewbhy
```

Codex:

```
codex plugin marketplace upgrade andrewbhy
codex plugin add jig@andrewbhy
```

Restart the tool afterwards. State in `~/.jig` is not touched by an update.

## Uninstall

Claude Code:

```
claude plugin uninstall jig@andrewbhy
claude plugin marketplace remove andrewbhy
```

Codex:

```
codex plugin remove jig@andrewbhy
codex plugin marketplace remove andrewbhy
```

Neither removes `~/.jig`. Delete that folder yourself if you want your notes, logs and settings gone.

## If something private was pushed by mistake

Delete the GitHub repository, rotate any secret that was in it, then export again into a fresh repository (`node scripts/export-public.mjs --out <new folder>`). The export refuses on private names, secrets and broken links, but only the names you listed in `~/.jig/export-private.txt` can be found by name, so read the first report yourself.
