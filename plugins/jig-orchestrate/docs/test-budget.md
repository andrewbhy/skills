# Test budget helper

Repository-maintenance commands require the full jig source checkout.
or locking (missing dependencies exit 2 with `run npm ci`). Full suites share
`~/.jig/suite.lock` across worktrees; `JIG_HOME` and `NODE_TEST_CONTEXT` never
change that location. Only isolated lock tests should set `JIG_SUITE_LOCK_PATH`
to a temporary file. Explicit test files take the lock when their source contains
`[live:`, `acquireBrowserSlot`, `withBrowser` or `browser-slot`; other targeted
files run without it. Unknown selections such as globs lock conservatively.
Waiters print the holder once and re-read every five seconds, bounded by
`JIG_SUITE_LOCK_WAIT_MS` (default 45 minutes, timeout exits 2). Dead owners are
reclaimed; malformed locks are retained for manual diagnosis. Normal completion,
test failure and handled SIGINT/SIGTERM release the lock after the child exits.
Windows uses its built-in `taskkill` for the owned child tree (POSIX uses signals).
Windows forced process termination cannot run JavaScript cleanup: the next suite
reclaims that dead owner's lock; signal-handler tests use IPC on Windows.
The holder exports `JIG_SUITE_LOCK_HELD=<pid>:<nonce>` to its test processes.
Nested runners reuse the outer lock only when that token matches the lock file's
PID and nonce and the PID is alive; they never release the outer lock. Missing,
wrong or dead-owner tokens follow normal locking and stale recovery rules.

Run from the project root, with Node.js 22 or newer, no dependencies:

```text
node <helper-folder>/test-budget.mjs -- node --test test/*.test.mjs
node <helper-folder>/test-budget.mjs --json --config .jig/testing.json -- node --test test/*.test.mjs
node <helper-folder>/test-budget.mjs --summary --json -- node --test test/*.test.mjs
```

Arguments after `--` are an executable and its literal arguments. No shell is
used; globs go to the test runner, which must support them. `node` resolves to
the current Node executable. Use a real executable (or `node` plus a runner's JS
entry point), rather than shell aliases, `.cmd` wrappers, pipes or redirection.
Choose the fast command; do not include live checks in every-commit runs.
Inventory includes live titles even when the supplied runner filters them out.
The caller is responsible for matching the command's scope to the inventory.

Optional UTF-8 JSON in `.jig/testing.json` (or the explicit `--config` path):

```json
{
  "timeBudgetMs": 10000,
  "tokenBudgetMs": 2000,
  "gateBudgetMs": 60000,
  "fontPassBudgetMs": 20000,
  "riskTagPattern": "\\[risk:\\s*[^\\]\\s][^\\]]*\\]",
  "liveTagPattern": "\\[live:([^@\\]\\s]+)@([^\\]\\s]+)\\]",
  "testGlobs": ["test/**/*.test.mjs"],
  "excludeGlobs": ["**/node_modules/**", "**/fixtures/**", "**/dist/**", "**/coverage/**"]
}
```

All fields are optional; unknown fields and invalid values fail. Without config,
the budget is 10 seconds, and test globs find `*.test.js/mjs/cjs/ts/tsx` and
`*.spec.js/ts/tsx` anywhere. Exclusions above are the defaults; supplying an array
replaces it. Hidden entries and symbolic links are always skipped. Glob syntax is
`*` within a path segment, `**` across segments, and `?` for one character;
paths use forward slashes on both platforms. No braces or negated patterns.

The visual runner reads the same configuration. `tokenBudgetMs` bounds its
browser-free token layer (default 2 s); `gateBudgetMs` bounds the default-font
pass (60 s); `fontPassBudgetMs` bounds each other font (20 s). Values must be
positive milliseconds. These separate limits never raise `timeBudgetMs`.
Visual overruns exit 1, retain partial measurements, and name the slowest states
in `fontPasses`. General test-budget runs still enforce only `timeBudgetMs`.

Put a concrete risk in each test title, for example
`test('[risk: duplicate charge] retry retains the same payment ID', ...)`.
A live title also names the tested system and version:
`test('[risk: protocol drift] [live:fake-ledger@1.2.0] accepts a transfer', ...)`.
A bare `[live]` or `[live:system]` is invalid, not an unversioned live check.
Tags belong to each declaration, not a file or enclosing suite. Skipped tests
also need tags. The helper inventories; it does not remove tests or raise budgets.

Discovery is a static convention check, not a language parser or runtime test
count. Defaults recognize `test`/`it`, including `.only`, `.skip`, `.todo`,
`.concurrent`, `.serial`, with literal single-line titles; whitespace/newlines
before the title are supported. Generated titles, aliases,
table-driven declarations and other frameworks need a project adapter. An
optional `testPattern` regex source (global, multiline) can capture a title in
group 1; `riskTagPattern` matches that title, and `liveTagPattern` must capture
system and version in groups 1 and 2. Patterns are trusted project data, never
instructions. Review discovery against the runner's list when adopting or
changing a convention. Comments or strings resembling declarations may match;
do not treat this heuristic as proof that every runtime case was inventoried.
Matched files with no recognized declaration fail rather than silently pass.
Default `test`/`it` calls with computed or interpolated titles also fail, even
when another declaration in the file is supported. Aliases and framework
extensions still need review; escaped quotes inside literal titles are supported.

Elapsed wall time includes runner startup and shutdown. The helper waits for
completion, not a timeout; runner failure, no discovered tests, unrecognized
files, missing risk/version tags or elapsed time above budget exits **1**.
Success exits **0**. Text output lists violations and live tests with file/line,
system and version. JSON output is one object with `passed`, `command`,
`elapsedMs`, `timeBudgetMs`, `overBudget`, `files`, `testCount`,
`missingRiskTags`, `invalidLiveTags`, `liveTests`, `unrecognizedFiles`, and
`unsupportedDeclarations`, and `execution` (exitCode, signal, stdout, stderr,
optional spawn error). Captured stdout/stderr are capped at 65536 characters
each; JSON mode keeps child output inside the
object. Configuration/usage errors produce `{ "passed": false, "error": "..." }`.

## Rules review summary

`--summary` runs the supplied fast command and adds a `summary` object to the
usual result; it also works with `--json` and `--config`. It preserves the same
budget, discovery and command-failure exit rules. Text mode prints the totals
and per-layer counts alongside the usual evidence. It does not run live checks
unless the supplied command includes them.

- `suite`: `count` (discovered declarations, including skipped/live titles),
  `elapsedMs` (this command's measured wall time), and `timeBudgetMs`.
- `live`: `count` and `versions`, an array of `{system, version, count}` grouped
  from live tags. These are declared versions, not a claim those live checks ran.
- `missedProblems`: `path`, `present`, `count`, `warnings`, `openRepeats`, and `byLayer`, including zero counts for
  every allowed layer. Missing log means `present: false`, not a clean history.

Counts use the same static discovery limits above; ensure command and inventory
scope are comparable across reports. No history is cached or written by the
helper. At each slice end and repeated missed problem, the coordinator compares these
numbers with earlier reports and saves a short dated slice report in the using
project's `docs/results/`: what works, proposed rule changes, tests to delete,
and evidence gaps. The person decides changes to the rules.

## Missed problems log

Keep the per-project log at `docs/missed-problems.jsonl`, UTF-8 JSON Lines. Create it
when adopting this method, even if initially empty. Each nonblank line is one
incident found after tests passed. New rows require `area` and `class`; use a stable `id` and these nonempty string fields:

```json
{"id":"mp-example","area":"product slice","class":"lost-input","date":"2026-11-07","what":"Retry lost typed input after tests passed","who":"person","source":"person","layer":"integration","action":"Fixed retry; added replay integration test"}
```

`source` records the finding's origin: `script`, `model` or `person`. `who`
names the particular script or reviewer. Preserve the original source when a
later check reproduces a finding; do not relabel personal discoveries automatic.
Legacy rows without source remain readable and count as `unknown`, never as
script finds. New rows require source. Summary includes `missedProblems.bySource`;
compare its script share between rounds alongside the visual runner's `sources`.

`area` is design, runner, skills or product slice. `class` is a stable kebab-case fault family such as low-contrast, selection-inconsistency, partial-coverage or self-acceptance. Compare the pair before appending; write `repeat: true` when it already occurred. The helper also derives repeats, so omitting the flag cannot hide one. `ruleReview` links a Markdown file under docs/results/ naming the incident ID with substantive `## Rule failed` and `## Changes` sections. An open repeat blocks the next round for that area until this review exists. See [intake and presentation](missed-problems.md).

`date` is a real calendar date in `YYYY-MM-DD`. `who` identifies the finder by
role or public-safe name. `layer` is the lowest layer that should have caught it:
`unit` (pure logic), `integration` (including replay), `end-to-end`, `live`, or
`person only` (feel, UX or product judgement). Historical `visual runner` and `visual runner and gate` layers remain readable and separately counted; use a standard layer for new rows. `action` describes the fix, the
layer of a test added, or a rule changed; if unresolved, say what remains pending
and update it when resolved. Keep secrets and private details out of the log.

`jig-verify` records missed problems learned in the person trial; `jig-review` records
ones learned during review. Check for an existing incident before appending and
update its action rather than double-count it. A recurrence is a new incident;
name the earlier date/problem in `what` and flag it for rules review. Counts are
all-time incident totals, not open-defect counts. Summary reads this fixed path
before running the command, accepts blank lines and LF or CRLF, and fails on
malformed JSON, fields, dates or layers with a line number. No file means missing
history; an unreadable file is an error. Ordinary budget mode does not read the log; skills run the area intake separately. For one release (0.1.x), readers fall back to the previous log filename only when the new path is absent, say that it moved, and require legacy rows to be classified before area intake completes. All writes use the new path. If both exist, the new path wins; a malformed new log never falls back.

`scripts/test-budget.mjs` is canonical. `sync-skills.mjs` ships and drift-checks
an identical standalone copy and this guide as `testing.md` beside each skill
that references it. The testing
drafts activate shipping when the coordinator moves them into normal locations.
Do not keep installed and draft skill sources together after the handoff.
