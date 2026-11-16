# jig-orchestrate

Coordinate jobs with an optional dashboard.

Skills: /jig-orchestrate:jig-orchestrate, /jig-orchestrate:jig-tower. In Codex, request these skill names directly.

Needs Node.js 22 or later on PATH. Git is required for repository commands. Run `npm ci --ignore-scripts` in this plugin folder for helpers with declared package dependencies; browser checks also need local Chrome/Chromium. Optional host tools report gaps when unavailable.

Install independently with `claude plugin install jig-orchestrate@andrewbhy --scope local` or `codex plugin add jig-orchestrate@andrewbhy`.

State and history stay in `~/.jig`; removing this plugin keeps them.

### Choose plugins per repository

1. Open `<repo>/.codex/config.toml` and choose which plugins to enable for that repository.
2. Open `.git/info/exclude` and add the line `/.codex/config.toml`. A linked worktree uses the common Git directory's `info/exclude`.
3. Keep this config untracked. Exclusions do not hide an already tracked file; that needs a separate repository decision.

## Use orchestration and the tower

Install `jig-orchestrate` using its line above. The easiest start is to ask the agent to use `jig-tower` for your project (Claude Code: `/jig-orchestrate:jig-tower`). The skill finds its own plugin folder and gives you the enable command if the tower is off.

For scripts run by hand, first find the installed jig-orchestrate folder:

- Claude Code: look up `jig-orchestrate@andrewbhy` in `~/.claude/plugins/installed_plugins.json` and use its `installPath` under the plugin cache. See [Claude Code's plugin loading reference](https://code.claude.com/docs/en/plugins/loading#find-plugins-on-disk).
- Codex: the installed cache is `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`; for this plugin use marketplace `andrewbhy` and plugin `jig-orchestrate`, then the installed version directory (`local` for local plugins). See [OpenAI's plugin packaging documentation](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work). If your host does not expose a documented cache location, use the skill.

Change to that plugin folder (or a jig source checkout). Both layers are off by default. Enable them for one project:

```text
node scripts/layers-enable.mjs --project <repo>
```

The command prints the project's store config and layers, and creates the missing `review-roots.json` with your project as a review root. It keeps existing review roots. Running it again keeps an existing `layers` key; use `--force` to replace that key. To enable orchestration with the tower off:

```text
node scripts/layers-enable.mjs --project <repo> --orchestration-only
```

Then ask the agent to use `jig-tower`, or change to the project directory and run `node "<plugin-folder>/scripts/tower.mjs" up`, replacing `<plugin-folder>` with the absolute installed path. The default port is 7788: open **http://127.0.0.1:7788**. To choose another port, run `tower.mjs up --port <n>`, for example `node "<plugin-folder>/scripts/tower.mjs" up --port 7790`. It listens on loopback only.

Version 0.2.0 serves the classic home page. To try the new home page, use the tower's Settings or set `{"newHome": true}` in `~/.jig/<project>/tower.json` (under `JIG_HOME` when overridden). Save as UTF-8 without a BOM. Windows PowerShell's `Set-Content -Encoding utf8` adds a BOM and breaks JSON loading; use an editor's UTF-8 without BOM option. Preserve other settings in an existing file.

Hooks are optional, shipped in `hooks-optional/`, and never installed automatically. Installing the plugin or enabling layers installs no hooks.

## Where state lives

Personal notes, receipts, logs, queue and settings live in `~/.jig/<project>/`; set `JIG_HOME` to move the store. Projects are detached by default. Uninstalling a plugin keeps the store.

Under a sandbox that can't write `~/.jig`, records go to an ignored `.jig` folder in the repository, and the printed import command moves them later. The enable command needs write access to the personal store.

