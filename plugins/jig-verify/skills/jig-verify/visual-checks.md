# Visual checks and evidence budget

Run the cheapest layer that can catch a defect. New pages ship a state table
and stable `data-component` markers. The runner executes tokens before launching
Chrome, then scoped geometry, candidate ink, and optional accepted baseline
diffs. A passing script is evidence, not visual acceptance.

```text
node "<skill-folder>/../../scripts/ui-tokens-check.mjs" --url file:///path/to/index.html
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --gate --fonts all --sizes 1280x800 --scales 1 --out /external/evidence
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --blocking-only
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --changed components/row.css,components/row.js
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --since main
```

## State table format

Use UTF-8 JSON at `data/states.json`, or pass `--state-table FILE`. Paths in
`tokenFiles` and each state's `files` resolve beside the HTML page, including
when the table is an external migration sidecar. For a remote URL, supply
`--source LOCAL_HTML` for token/file evidence; browser checks still visit the
remote URL. Keep local sources and the served revision identical.

```json
{
  "version": 1,
  "tokenFiles": ["design-tokens.css", "type-tokens.css"],
  "roles": {"body": {"sizeToken": "--type-body", "weightToken": "--type-weight"}},
  "selectionRadiusToken": "--radius-selection",
  "presets": [
    {"name": "blue", "selector": ":root[data-accent=blue]"},
    {"name": "blue-tinted", "selector": ":root[data-accent=blue]",
     "selectors": [":root[data-accent-style=tinted]"]}
  ],
  "accentPairs": [{"textToken": "--on-accent", "fillToken": "--accent"}],
  "states": [
    {"name": "row-default", "component": "row", "state": "default",
     "scope": "#row-default", "role": "body",
     "textToken": "--ink", "fillToken": "--canvas", "borderToken": "--line",
     "sizeToken": "--type-body", "weightToken": "--type-weight",
     "static": true, "files": ["components/row.css", "components/row.js"]}
  ]
}
```

Every row requires the shown identity, scope, role and token fields, and its
role must have a size/weight binding in `roles`;
`borderToken: null` means no border. Names are unique. Optional `variant`
separates component variants and `slot` separates text slots (default: role).
`tone` is primary, secondary or coloured; it defaults from the role.
`filledControl: true` selects the 4.5:1 text rule. Use compact roles such as
metadata, label, caption, chip, kbd and status-bar rather than body for compact
text. `surfaceToken` supplies an opaque ground for translucent fills;
`radiusToken` overrides the shared selection radius. Without either radius
binding the table declares square selection. Optional `checks` contains
additional token-only rows with the same fields, for secondary text and other
slots that do not need another browser state. They do not change browser coverage.

Generate markup and `window.jigStates` from this table using component
templates. The JSON table is authoritative for static flags and source maps;
browser and JSON state names must agree exactly. Static means the sheet already
shows the final state side by side and setup/reset may be skipped. Never mark
an actual focus, hover, menu, data or motion transition static just to save time.

```js
window.jigStates = [
  {name: 'row-default', scope: '#row-default', component: 'row', static: true},
  {name: 'menu-open', scope: '#menu', component: 'menu',
   setup: async () => openMenu(), reset: async () => closeMenu()}
];
window.jigFonts = ['default', 'wide'];
window.jigFonts.set = async id => applyFont(id);
```

Both the array with a `set` function and `{ids: [...], set}` are accepted.
The first ID is the default. Undeclared fonts/modes/states each mean one
implicit default. Setup and reset are required for interactive states.
No setup also means static. Each interactive setup starts independently and
reset restores data, drafts, selection, focus, scroll and overlays after errors.

Optional `window.jigDataModes = [{name, setup}]` defines data replacement hooks.
Normally every state runs every mode. A row may explicitly declare
`dataModes: ["Demo"]` when its component does not consume other data fixtures.
Application data states should declare every mode they consume. The report
retains this applicability map; it must be reviewed as part of the contract.
A mode setup runs after an interactive state setup, preserving the existing
contract. Scope a data-specific state to its matching mode, so Demo does not
erase a Worst-case state.

## Layers and limits

Tokens read only the linked local CSS/imports and declared token files.
Flat `:root` rules define the base; each preset applies its exact selector,
then its optional ordered `selectors` and optional explicit `tokens` overrides.
This is a documented token format, not a general CSS cascade engine. Hex,
numeric rgb/rgba and two-colour percentage `color-mix(in srgb,...)` are
supported; aliases are resolved with cycle detection. Unsupported colours,
conditional/nested token rules, missing tokens and non-pixel sizes are gaps.
List every token source explicitly. CSS generated only by JavaScript needs
rendered checking; a static pass cannot prove the table matches that code.

Shared crisp rules check neutral text at 12:1, secondary at 5.5:1, coloured
text and filled controls at 4.5:1, plus each preset's explicit accent pairs
at 4.5:1. Body text is at least 13 px at scale 1. Role bindings and state
comparisons check size and weight; states also compare letter spacing and
same-text natural width in the browser. Selected/default fill separation is
1.5:1, selected/hover 1.3:1 and hover/default 1.15:1. Selection background,
text colour and radius follow one rule across components. Existing crisp
border (1.5:1) and surface (1.15:1) rules remain. Disabled text is exempt,
while borders/fills remain checked. Findings retain the browser rule names
and measured/expected values, with `layer: "tokens"`.

Border contrast skips a filled control and a border equal to its fill.
Identical nested fills are one surface; distinct visible fills below 1.15:1
still fail. Separators retain their boundary check. The existing `faint-border`
rule also checks quiet default affordance and a visible outline or zero-blur
spread ring on a filled focused control. Ordinary elevation is not a focus
ring. `state-fill` compares disabled paint with enabled default/hover paint,
including ink and borders, so equal disabled/enabled states still fail.

Static style lint runs on linked non-token CSS (including imports), style
blocks and inline attributes. Hard-coded custom properties outside token
files are linted too. Literal colours, dimensions, shadows, percentage radii,
off-scale spacing, changed-root rem sizing and transition-all use the shared
style rule names. It cannot inspect strings emitted later by application JS.

Geometry measures all static scopes in one synchronous browser turn per
font/viewport/scale/data mode, coalescing identical and nested scopes. Every
inspector walks only inside a maximal declared scope. Findings/measurements
are assigned back by DOM containment. Interactive states inspect only their
own scope. Two default-font pages overlap application hook waits within one
browser; explicit motion runs use one worker. Each state starts with a fresh
navigation and clears the mouse position, including on extra-font replay.
Reset still runs after setup errors. Each page records its own load errors.
Ancestors may be
read for inherited style or clipping bounds; unrelated siblings are not
inspection targets. Keep scopes small. Missing component markers are findings;
missing/ambiguous scopes are gaps.

Default-font states record settled DOM snapshots. Other fonts use isolated
parallel pages of that one browser: static states are batched and interactive
snapshots are restored and reflowed with the new font. Field values, ancestor
attributes, focus, hover and scroll are preserved; no application setup timers
or motion are replayed. Each font gets clip, containment/overflow, truncation
and state typography checks. Default-font setup failures leave missing
snapshots and incomplete extra-font evidence. Shadow roots, frames and canvas
cannot be replayed this way and leave explicit gaps. Reflow does not prove
font-dependent application event handlers or motion; test those separately.

Ink uses geometry/computed-paint candidates: clipping/truncation, suspicious
contrast/alpha, missing graphic paint and occlusion. Only those scopes get a
capture, at most one cropped screenshot per scope and pass. Analysis is cached
by the PNG/region metadata hash. It compares candidate pixels with a known flat
ground, retaining the 90th-percentile ink rule. Complex ground and occlusion
remain review gaps; a bordered box is not proof of visible ink. Crops above
16 megapixels require narrower scopes. Optical findings are restricted to
these candidates; this no longer claims exhaustive optical ink coverage.
Healthy text and artwork do not trigger a broad pixel scan. Captures remain
in memory unless baseline storage or `--png` is requested.
Icon grounds include their CSS box fill and the nearest opaque ancestor,
including filled controls. Scroll-clipped rows and rows behind a sticky header
in their own scrolled table are recorded as `scrolledOut`; unrelated overlays
still leave an occlusion gap.

Legacy pages without a table retain the sequential setup/reset runner.
A gate discloses missing token semantics as incomplete evidence. Migrate
them with an explicit sidecar; state names/scopes alone in old STATES.md are
insufficient to infer token roles or safely skip setup. Standalone
`visual-clip`, `visual-spacing`, `visual-alignment`, `visual-crisp`,
`visual-visibility`, `visual-motion` and `visual-components` remain available.
The older visibility probe intentionally uses ink/masked-ground captures and
is useful for calibration, rather than the cheap gate's normal path.

## Reports, budgets and reruns

Report format 2 retains canonical findings, source attribution, runs,
inspector measurements, grouped causes and coverage. Every finding has
measured/expected values and a layer. Runs refer to canonical finding IDs.
`layers` reports tokens, setup, geometry, ink and baseline elapsed milliseconds;
`fontPasses` reports wall time, limits and the slowest states.
Parallel layer totals are aggregate work, not summed wall time.

`report.json` is written before browser launch, after each static scope
group/interactive state, and after each font. `runs.jsonl` streams every
completed run, so a killed process retains completed evidence. Partial reports
are inconclusive. Progress goes to stderr and the final JSON summary to stdout.
Declarations for states, data modes and both font forms are checked together
within one second of discovery, before any setup hooks; table names and mode
applicability are checked before the matrix. Five consecutive identical state
failures stop dispatch with one summary error and incomplete coverage.
No ordinary run persists screenshots. `--png` requests one checkpoint sheet;
narrow the selection to at most 60 tiles. Motion is opt-in with
`--inspectors ...,motion` and `--duration MS`; it records before setup,
retains frames and missed-frame gaps. Static checks do not establish motion feel.
Declared `motion-*` states also retain their frame check by default. Frames
sample sibling overlap before geometry disables animations, so a transient
overlap remains detectable. Geometry freezing is removed before reset.

The same `.jig/testing.json` used by the test helper supplies
`tokenBudgetMs: 2000`, `gateBudgetMs: 20000` for the default font,
`fontPassBudgetMs: 20000` per other font and `allFontsBudgetMs: 40000`
for total all-font wall time including browser close. Never raise the ordinary
`timeBudgetMs` (default 10000) to accommodate browser work. Pass
`--testing-config FILE` to select a project's configuration explicitly.
Visual overruns exit 1 and name slow states; setup/inspection timeouts retain
partial coverage. Other gaps exit 2, findings exit 1, clean complete runs exit 0.
Budgets are performance failures, not approval.

`--changed FILE,...` uses paths beside the page. `--since REF` uses git diff
against that ref, including tracked working changes. State `files` mappings
must include the component's dependencies. Token-file changes rerun all states;
unmapped files retain the full measurement and disclose the mapping gap.
States without mappings are conservatively retained. Full runs remain the gate
default; an explicit filtered gate retains the full coverage denominator and
cannot be presented as complete acceptance. Neither filter silently waives
unmeasured states. Non-gate `--budget N` remains a finding-group limit on the
legacy runner; layered runs measure the selected contract and bound the group
list, never silently drop states.

## Accepted baselines

After the person accepts a component/state, explicitly record that acceptance:

```text
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --gate --baseline /external/accepted-v1 --accept-baseline --approved-by reviewer --approved-at 2026-11-08
node "<skill-folder>/../../scripts/visual-check.mjs" --url file:///path/to/index.html --gate --baseline /external/accepted-v1 --pixel-tolerance 8
```

A new store receives cropped PNGs per state/component/data mode/viewport/scale
and a version-1 manifest with supplied approval, browser and platform. Existing
stores are never replaced. A manifest is finalized only with complete,
gap-free, within-budget evidence and no findings; failed preparation may leave
unaccepted PNGs, never an approved manifest. The command records supplied
acceptance and does not grant it.

Later runs compare crops with a channel tolerance (default 8/255; 0..255).
Dimension changes and changed pixels are findings; missing images/state entries
and browser/platform mismatches are gaps. `changedStates` lists changed states.
Unchanged baseline states retain coverage/measurements while suppressing their
repeated browser findings; token findings and all gaps remain visible. Other
fonts still get their required geometry checks. Separate platform/font baselines
are needed where rendering differs. The existing `visual-pixels --freeze
approved-manifest.json --out NEW_STORE` command still accepts previously
prepared crops and refuses replacement.

## Running and evidence gaps

`--blocking-only` keeps only severity-5 findings (overlap, clipped text, control
labels, invisible or empty content, unintended truncation) and drops alignment,
spacing and fractional-position noise. Use it for static mocks; the full
`--gate` is for product builds. The report options record the flag.

Every `--gate` runs the pinned Impeccable 0.1.19 static detector once using
`detect --no-config --json`, with `DO_NOT_TRACK=1` and
`IMPECCABLE_NO_TELEMETRY=1`. Set `IMPECCABLE_BIN` to a locally provisioned
native executable from the release linked in `<skill-folder>/../../scripts/impeccable-pin.json`.
The gate verifies its SHA-256 on every invocation; it never installs or
downloads an engine. Missing binaries, mismatched checksums, invalid output,
timeouts and partial scans leave explicit gaps. Its 5-second budget is part
of the existing 20-second default / 40-second all-font gate budget.

Only local file URLs are supported by this static detector. HTML and local
linked/imported CSS are copied into an isolated temporary directory; references
outside the page directory are refused. Remote CSS is not fetched and is
reported as a coverage gap. Input scripts and remote fonts/images do not run.
The 13 desktop candidate rule IDs from the 0.1.19 trial are the pin's allowlist;
website/context, overlapping and prose-only rule groups remain disabled.
Exact-rule/target waivers require a reason and evidence and remain reported.

The report's `inspectors` list includes `impeccable`; `impeccable` contains
its warnings, waived findings, coverage gaps, execution and checksum evidence.
Measured `design-inspector.mjs` rules run on default-font state scopes as the
`design` inspector, batched with static geometry. Their `warnings`, `waived`
and `coverageGaps` travel in each inspector result. Both aesthetic inspectors
are advisory; execution errors block a clean gate. Existing layout, visibility,
token and crispness findings keep their authority and rule names.

Time budgets are assessed after the matrix finishes. An overrun fails with
slowest states named; it never closes a context to cut coverage short.
Operation timeouts and repeated state errors still stop contaminated runs.
Loading remains subject to contrast checks even when activation is disabled.
Split controls use their group's focus indicator. Flat computed color-mix
fills are converted through the browser's color parser for icon grounds;
unmodeled filters and images remain disclosed gaps.

Requires Node 22+, local Chrome/Chromium and pinned `playwright-core 1.65.0`.
Run `npm ci --ignore-scripts` for dependencies; the runner never downloads
a browser. `CHROME_PATH` overrides discovery. Before any live run, the
coordinator checks free memory with
`node -e "console.log((require('os').freemem()/2**30).toFixed(1)+' GB free')"`
and confirms no concurrent browser check. Below 4 GB, skip. If process inspection
is unavailable, leave live checks pending. One browser per invocation; extra-font
pages share that browser. Close it promptly. `JIG_NO_BROWSER=1 npm test`
runs replay/unit fixtures and skips live fixtures.

The 100-state fixture's one-turn geometry replay has a 500 ms budget. This is
an algorithm/protocol regression test, not the real-page timing claim.
It asserts the state count, isolated seeded defect and clean states. The live
100-state gate fixture separately requires complete coverage, expected findings
and a repaired clean result, each below 20 seconds. `JIG_NO_BROWSER=1` skips it.
Windows real-browser targets, macOS, pixel/DOM replay parity, independent
rendered review and both providers' normal-location skill scenarios must be
reported separately. See the dated cheap-verification result and fixed
scenarios under docs/results and docs/cheap-verify-scenarios.md.

Implementation is original. Existing measurements and conventions were informed
by the recorded Stageshow experiment; no Stageshow source was copied. The
existing inspector calibration fixtures and provider results remain historical
evidence; they do not prove the new layered runner's rendered parity.

Capture API checked against the [official Playwright screenshot contract](https://playwright.dev/docs/api/class-page#page-screenshot) and [screenshot implementation](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/screenshotter.ts). Document-coordinate mode is combined with an explicit clip; it does not request a full-page bitmap. Carets and motion are prepared by the runner, avoiding the default screenshot preparation walk. Pinned-version rendered parity remains a live check.

Grid projects put `grid.config.json` beside their pages, with `version: 1`, a
finite `typeScale` array of CSS pixel sizes (each at least 12), and optional
`tokenFiles` paths relative to that file. The nearest ancestor configuration
owns each page or CSS file. `style-lint.mjs [PATH]` and
`ui-tokens-check.mjs [PATH]` check static HTML/CSS; omitting PATH checks the
repository toolbox. A single HTML path includes local stylesheets and imports.
Existing state-table options and token exports remain supported. Configured
grid spacing consumes `--grid-space-*` tokens or aliases rooted in them;
zero and `auto` are layout exceptions. Unknown/computed spacing and type
values fail closed. All declared token alternatives are checked, including
conditional overrides; this is conservative source evidence, not a CSS cascade
evaluator. Unconfigured legacy styles keep the existing raw-value/debt checks;
adopting a project scale requires its sidecar. The toolbox debt file is read
without being rewritten and allowances are counted, so duplicates fail.

`scanClip(selector)` in `visual-clip.mjs` is a serializable browser function for
visible boxes, self-clipping and three-point control coverage. `inspectClip`
retains its text-Range contract. `inspectClipping(page, selector)` combines both;
the clip CLI and normal shared sequential/batched passes call the combined
checks. Extra-font passes retain their existing text-only clipping scope.
Scroll viewports own their hidden content, and inline client widths are not
used to infer clipping. Sampling cannot prove every pixel is unobstructed.

The alignment helper recognizes `[data-grid-card]`, `.card`, `.grid-panel` and
`.region-card` siblings with overlapping vertical extents in a horizontal row.
Their tops and corresponding left/right content insets must agree within one
CSS pixel, including differences larger than the generic near-miss window.
Insets include border and padding; unequal card widths and mixed spans are
allowed. Mark other project card classes with `data-grid-card`.

`visual-reflow.mjs --url URL [--root CSS] [--out DIR]` runs at 320 CSS px,
regardless of a supplied width. Its browser function `inspectReflow(selector)`
rejects another viewport as an evidence gap and finds prose outside the narrow
viewport or requiring a nested horizontal scroller. Data tables and explicitly
labelled `[data-reflow-canvas][aria-label]` previews are exceptions; ordinary
prose cannot use a generic overflow region as an exception. Clipping remains
a separate check. These geometry probes do not establish WCAG conformance.

## Shared resource guard

All browser launches in visual-clip, visual-motion and both visual-check paths
use launchChrome's resource guard. It checks os.freemem() against
browser.minFreeGB (default 4), takes a shared browser slot (default 1), then
checks memory again. The slot stays held until browser disconnect or failed
launch, with process-exit cleanup and confirmed-dead-PID recovery. Uncertain
ownership refuses. Memory, slot or configuration refusal is inconclusive,
exit 2. The default lock directory is .jig/browser-slots in the user's home;
all sessions must share any configured browser.lockDir. Tests override it
with temporary directories. The queue contract documents the same configuration.
