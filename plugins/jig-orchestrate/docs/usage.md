# Local usage and skill loading

Run `node scripts/usage.mjs` in the jig checkout for the coordinator's usage
block. It reads local files only and makes no provider calls. Missing sources
produce plain lines, not errors. The bars show allowance used; the bold number
shows allowance left. Pace is the latest used percentage minus the earliest in the
same reset window, divided by elapsed days, over more than six hours. Reset
times group by minute because providers repeat them with one-second jitter, and
concurrent sessions report slightly stale values, so only a drop of more than
10 points below the window's peak counts as a reset and restarts the baseline.
It is an estimate, not a provider guarantee. Weekly Codex
records may be in the primary or secondary rate-limit window.

| Flag | Environment variable | Default |
|---|---|---|
| `--claude-projects-dir` | `USAGE_CLAUDE_PROJECTS_DIR` | `~/.claude/projects` (all project folders) |
| `--claude-project` | `USAGE_CLAUDE_PROJECT` | unset; select one folder name under the projects directory |
| `--codex-dir` | `USAGE_CODEX_DIR` | `~/.codex/sessions` |
| `--status-file` | `USAGE_STATUS_FILE` | `~/.claude/usage-latest.json` |
| `--utc-offset` | `USAGE_UTC_OFFSET` | Intl resolved zone at the snapshot time; then, on Windows, the OS zone read through PowerShell; then Node's native offset |
| `--now` | none | current time; ISO date override for fixtures |

On Windows Node can report a wrong native offset when Intl resolves no zone, so
the OS zone is read before that fallback.

Offsets are signed minutes east of UTC. For negative arguments use
`--utc-offset=-420`; `--utc-offset=540` selects nine hours east. Explicit flags
take precedence over environment variables. Defaults use the OS home directory;
explicit paths are passed as paths, so let your shell expand `~` when needed.
The transcript row totals output across the selected projects; it compares with
the busiest of the last seven recorded days, not a provider allowance.

Optional status-line capture: configure the provider's status-line command to
pipe its JSON payload to `node <jig-checkout>/scripts/statusline-usage.mjs`.
The command prints nothing and asks no questions. It accepts `--status-file`
and `USAGE_STATUS_FILE` with the same default as the reader, and `--now` for
fixtures. It stores only the capture time and whitelisted allowance percentages
and reset times. It overwrites the latest file and appends to
`usage-history.jsonl` beside it. Prompts, project paths and other payload fields
are discarded. Without capture, transcript output remains available but Claude
allowance percentages and weekly pace are unknown. Existing history enables
the `Claude weekly pace` row; a single capture cannot establish pace.

The orchestration settings in `.jig/config.json` are instruction-level settings:
`orchestrate.assistantAgents` defaults to true and
`orchestrate.weeklyLeftThreshold` defaults to 30 (range 0–100). At or below the
coordinator provider's threshold, every mechanical step goes to an assistant,
the coordinator prints usage before each implementation job, and only one
implementation job runs at a time unless the person overrides. Session and
machine constraints still apply. The queue helper's contracts are unchanged.

Run `node scripts/skill-load-check.mjs --repo <checkout> --loaded jig-plan,jig-orchestrate`
with the session's actual loaded names. Alternatives are positional names,
`--file <names-file>` or stdin; text lists use commas or whitespace, and JSON
string arrays are accepted. The inventory comes from `.agents/skills` in that
checkout, so use the main checkout after merge for the installation check.
Exit 0 means none missing, 1 means missing skills with the installation/fresh
session fix, and 2 means invalid input or an unreadable inventory. This command
checks supplied names; it cannot observe a session's context or prove freshness.

The skill's `delegate-brief.mjs` exports `renderDelegateBrief({ goal, files,
readOnly, browser, reportShape, wordCap })`. `browser` and `readOnly` are booleans
(defaults false and true); the word cap defaults to 300 and cannot exceed it.
Use the browser flag to choose one instruction line; other fields must not
include browser instructions. Final briefs and user-facing work remain with
the coordinator. Fixed two-provider scenarios and a fresh plugin installation
check remain separate coordinator work. macOS is not yet tested.
