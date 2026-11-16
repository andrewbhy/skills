# Local telemetry

Node.js 22 or newer is the only prerequisite. Nothing is uploaded. Set
`"telemetry": false` in the project root's `.jig/config.json` to disable marker
writes and reporting (default: enabled). This is separate from `.jig/verify.json`,
which holds verification facts. Invalid configuration fails closed. Add
`/.jig/telemetry.jsonl` to the project's `.gitignore`: local history is not meant
to be committed. jig itself ignores it. To clear the history, delete the file;
the next marker starts a new one.

## Markers

Copy the whole `skills/jig-<name>/` folder into a normal skill discovery
location. For the generated Claude pointer, preserve its relative path to that
Repository-maintenance commands require the full jig source checkout.
generates each folder's `VERSION` from root `VERSION`, and `telemetry.mjs` from
`telemetry-marker.mjs (available in the full source checkout)`. `npm test` checks both for drift. The standalone
helper uses only Node's standard library, with no shell syntax or provider hooks.

Use the loaded skill's absolute folder path and an explicit project root. The
helper does not guess the project from the current directory. Quote paths with
spaces on Windows and macOS:

```text
node "<skill-folder>/telemetry.mjs" start "<project-root>" codex
node "<skill-folder>/telemetry.mjs" end "<project-root>" codex <printed-run-id> passed
```

Use `claude` for Claude Code. Start prints a UUID; retain it for end. When off,
start prints `off`, which end accepts without writing. Outcomes are `passed`,
`failed`, `stopped`, or `partly`: describe the evidence/completion, not whether a
feasibility answer was yes. A well-proven negative answer can pass. Missing end
means incomplete; the helper cannot guarantee an agent writes either marker.
Disclose marker failures. Exit status: 0 on success (including off), 1 for invalid
arguments/configuration or write failure. End writes no stdout.

Each event is one UTF-8 JSON line in `<project-root>/.jig/telemetry.jsonl`:

```json
{"event":"start","skill":"jig-verify","version":"0.1.0","runId":"11111111-1111-4111-8111-111111111111","provider":"codex","time":"2026-01-01T10:01:00.000Z"}
{"event":"end","skill":"jig-verify","version":"0.1.0","runId":"11111111-1111-4111-8111-111111111111","provider":"codex","time":"2026-01-01T10:04:00.000Z","outcome":"passed"}
```

Times are UTC; skill and version come from the loaded folder. No project path,
transcript path or message data is written. Independent runs have independent IDs.

## Report

From a jig checkout:

```text
node scripts/telemetry-report.mjs "<project-root>"
node scripts/telemetry-report.mjs "<project-root>" --json
```

Default output is a short table grouped by skill, provider and outcome, followed
by JSON. `--json` prints JSON alone. JSON includes `runs` (version, model, start,
end, duration in milliseconds, outcome, counters and match status) and `summary`.
Nothing is written back to the markers. No markers means an empty report.
Exit status: 0 even for unknown usage; 1 for bad markers/configuration/arguments.

The reporter streams local provider JSONL files from:

- Codex: `~/.codex/sessions/**/*.jsonl`.
- Claude Code: `~/.claude/projects/<encoded-project-path>/*.jsonl`, replacing
  each non-alphanumeric project-path character with `-`. Nested subagent records
  are excluded; counts cover the main session only.

`--codex-home <dir>` and `--claude-home <dir>` select different local homes,
including synthetic fixtures. No provider process is launched. Only timestamps,
session IDs, working directories, record types, models, message IDs for
deduplication, and usage fields are selected. Transcript bytes necessarily pass
through the scanner, but message bodies, prompts, code and tool arguments are
skipped without decoding. They are never inspected, retained in report objects,
printed or copied. Matching paths and session IDs remain internal.

A record matches only when its session ID and project path are unambiguous and
its time span overlaps the markers. Windows drive paths compare without case or
separator differences; POSIX paths retain case. Symlink aliases are not resolved.
Two overlapping sessions for the project are ambiguous. No nearest-session guess.

Usage is attributed by provider timestamp in **(start, end]**:

- Codex subtracts consecutive `total_token_usage` counters, using the last at or
  before start as baseline. Before the first count, the recorded session starts
  at zero. Repeated counters add zero; null-info rate-limit updates add nothing.
  Resets or missing/invalid counters are unknown. Do not sum `last_token_usage`:
  it may repeat.
- Claude counts each message ID once across duplicate content blocks. A message
  spanning a marker is unknown because it cannot be split. Total input includes
  fresh input, cache creation and cache reads; cached is cache reads, a subset of
  input. This matches Codex's inclusive input convention. Output includes any
  reasoning already included by the provider; it is not added again.

Sources: [Codex protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs),
[Claude transcript locations](https://code.claude.com/docs/en/hooks#common-input-fields),
[Claude input accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#understanding-the-token-breakdown).
These are provider formats, not a jig-controlled stable API.

Unmatched, unreadable, ambiguous, incomplete and unsupported usage stays `null`
in JSON and `unknown` in the table, with a per-run status. A corrupt/unreadable
file in a searched provider directory conservatively makes that provider unknown:
it could hide a competing session. For Codex, a valid first `session_meta` record
with a session ID and a different project path excludes that file before scanning
its body. Damage in that unrelated body does not affect the report; an unreadable
header or a damaged matching session still makes usage unknown.
If any run is unknown, the summary's token
totals are unknown and `unknownRuns` counts gaps. Missing end markers have unknown
duration and a stopped outcome. No prorating, pricing, clock tolerance or inferred
model. Usage recorded after end, including the final response after the end
command, is outside the window. Overlapping skill windows may count the same
usage; summaries are not exclusive billing totals. Flush records before reporting.

## Evidence limits

Synthetic fixtures cover both schemas, matching failures, duplicates, privacy
projection and a copied helper. Tests never use real transcripts. Local checks
do not establish provider behaviour or parity: fresh skill scenarios on both
providers remain required before merge and require authorization.
