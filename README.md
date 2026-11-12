# skills

Agent skills by andrewbhy, packaged as plugins for Claude Code and Codex. This repository is a marketplace named `andrewbhy`; each plugin has its own folder under `plugins/`.

| Plugin | What it is |
|---|---|
| [`jig`](plugins/jig/README.md) | A provider-neutral set of planning, review, verification and coordination skills. State lives in `~/.jig`; nothing is written into your project by default. |

Needs Node 22 or later on the PATH. Full instructions for `jig`: [plugins/jig/README.md](plugins/jig/README.md).

## Claude Code

Install:

```
claude plugin marketplace add andrewbhy/skills
claude plugin install jig@andrewbhy
```

Update:

```
claude plugin marketplace update andrewbhy
claude plugin update jig@andrewbhy
```

Uninstall:

```
claude plugin uninstall jig@andrewbhy
claude plugin marketplace remove andrewbhy
```

Restart Claude Code after installing or updating. Skills load as `/jig:<skill>`, for example `/jig:plan`.

## Codex

Install:

```
codex plugin marketplace add andrewbhy/skills
codex plugin add jig@andrewbhy
```

Update:

```
codex plugin marketplace upgrade andrewbhy
codex plugin add jig@andrewbhy
```

Uninstall:

```
codex plugin remove jig@andrewbhy
codex plugin marketplace remove andrewbhy
```

Restart Codex after installing or updating.

## Where jig keeps its state

Everything personal (notes, logs, the review queue, settings) lives under `~/.jig/<project>/`. Nothing is written into your project or into the plugin folder unless you register the project as your own. A project is detached by default. Set `JIG_HOME` to move the store. Uninstalling does not delete `~/.jig`.

To start the review dashboard (tower), run the tower skill: `/jig:tower` in Claude Code, or ask Codex to use the `jig-tower` skill. It listens on `127.0.0.1` only. Details are in the [jig README](plugins/jig/README.md).

## Licence

MIT, see [LICENSE](LICENSE). Material adapted from other projects is credited in [NOTICE](NOTICE).
