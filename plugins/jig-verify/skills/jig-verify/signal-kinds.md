# Retro signals

Each kind has one owner. Tools record their own outcomes; agents record the
remaining kinds in the same reply turn, without duplicating a tool's signal.
Repeat is a repeatOf link, never a kind. Ownership can transfer in a later edit.

| Kind | Owner | When to record |
|---|---|---|
| escape | jig-correct (if installed; otherwise use your own equivalent and record which) | A defect escaped passed checks; link its mpId. |
| escalation | coordinator | A stop rule fires and the person must decide. |
| rejection | jig-review (if installed; otherwise use your own equivalent and record which) | The person rejects or corrects shown work. |
| coordinator-error | jig-correct (if installed; otherwise use your own equivalent and record which) | The coordinator makes its own mistake. |
| skill-gap | coordinator | A needed instruction is missing; name skill and proposedFix. |
| skill-misguided | coordinator | An instruction leads work astray; name skill and proposedFix. |
| plan-block | jig-plan (if installed; otherwise use your own equivalent and record which) | The plan-check outcome is BLOCK. |
| broken-brief | brief-check | The brief checker refuses an input. |
| false-alarm | jig-correct (if installed; otherwise use your own equivalent and record which) | A checker finding is established as noise. |
| missed-check | visual-check | A configured check or required coverage never ran. |
| over-budget | visual-check | A visual run exceeds its budget or stops incomplete. |
| lost-work | jig-correct (if installed; otherwise use your own equivalent and record which) | Work is deleted or overwritten. |
| confusion | jig-review (if installed; otherwise use your own equivalent and record which) | The person asks what shown work means. |
| measure-mismatch | jig-review (if installed; otherwise use your own equivalent and record which) | Measures pass but the person's verdict does not. |
| dependency | jig-correct (if installed; otherwise use your own equivalent and record which) | A tool or setup dependency is missing. |

Use `node "<skill-folder>/../../scripts/signals.mjs" add '<JSON>'` with required id, date, project,
level (jig, project, environment), kind, area, item and caughtBy. The helper
generates id and date when omitted. Optional fields: what, cost ({minutes} or
{rounds}), planLink, detailLink, mpId, repeatOf, consumedBy, ownErrorShare
(none, part, all), decision, skill, proposedFix. Invalid input exits 1; a busy
lock exits 2. No model calls are made.

Project/environment records use `.jig/signals.jsonl`; jig records describe
harness behaviour only and use `~/.jig/signals.jsonl`. JIG_SIGNALS_PROJECT
overrides the project root; JIG_SIGNALS_HOME overrides the home log directory.
Tests must override both with temporary directories. `signals.detail: minimal`
in `.jig/config.json` drops what and proposedFix before writing, retaining
kind, area, cost and links. Private logs and reports must be ignored by Git.

`set <id> <optional-field> <JSON-value>` changes one optional field; required
fields cannot change. `list` and `report` accept `--level` and `--since`.
`report --level environment` prints to stdout unless `--out` names a destination;
other reports default to `.jig/retros/<date>-<level>.md` in the current project.
Reports contain counts, separate minute/round totals, repeat links and open
skill questions, without raw what text. `consume <plan-link> <ids...>` marks
addressed records; `prune --level <level>` removes consumed records older than
30 days or unconsumed records older than 180 days. Open skill-gap and
skill-misguided records stay until consumed. All mutations use the same lock.
Repository-maintenance commands require the full jig source checkout.
Provider behaviour scenarios are in retro-signal-scenarios.md.
