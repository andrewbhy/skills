# Grid notes

## Slice 4 — shared page shell, mockup contract and worked example

9 November 2026. Built the requested slice and shared-shell harness fix within
the supplied plan; no plan edit, commit, browser, network or provider session.
The example is an interactive layout prototype, not visual acceptance.

### Launch, history and scope

`node brief-check.mjs (available in the full source checkout) --workspace . <supplied-plan>` returned OK for
structure, `ambiguity: 1 of 3 goals unmeasured`, with the pre-existing unknown
Kind warning caused by prose on the Kind line. The supplied coordinator plan
check remains the recorded launch authority; no independent review or new
plan-seat outcome is claimed. The person explicitly supplied the shell fix
with this slice. The existing plan was preserved, as requested.

History intake: design and skills stores had zero open repeats. The named
checks for mp-2026-11-08-09 and mp-2026-11-08-17 are addressed by handing off
the actual `example.html` and leaving rendered acceptance pending. Colour and
selection incidents are outside this slice: no theme changes or rendered
contrast claims. For mp-2026-11-08-12/14, existing linked-plan/workspace tests
run alongside the new missing-grid brief tests. For mp-2026-11-08-13, no skill
sync ran during editing: the canonical changes are a checked patch. The plan
was not overwritten (mp-2026-11-08-16); no detached provider jobs, merge or
worktree cleanup ran (mp-2026-11-08-11/15).

### What changed

- `page-shell.mjs` owns the static brand and breadcrumb markup and explicit
  page CSS/grid imports. All 18 toolbox HTML files, including templates and
  the example, opt in with `data-grid`. Guide, gallery and component assembly
  generators emit the shared shell. A light header ground preserves the
  intended red tile/charcoal wordmark combination in theme demonstrations.
- `logo/final/` contains unchanged supplied 20–23 px red tiles, the 23 px
  reversed tile, charcoal/white outlined wordmarks, and font OFL/notice.
  Its README records the person's 8 November choice and source provenance.
  The brief's solid 지 below 48 CSS px overrides the handoff's older
  three-step recommendation. `logo/logo.html` is labelled historical.
- `check-page-shell.mjs` recursively checks all HTML, including templates.
  Missing/drifted shell, missing grid/page CSS, missing grid opt-in, and the
  provisional brand fail. Historical candidate art is allowed only on its
  candidates page, outside the brand. Good/bad fixtures prove rejection;
  individual mutations isolate each missing dependency and incorrect logo.
- Importing grid tokens exposed an inactive-scale bug: the static parser
  inferred the optional Vast specimen's type scale on legacy pages. The
  existing `grid.config.json` sidecar now selects each document's scale;
  importing a library alone does not. Pure `lintCSS` inference remains for
  unit callers. The existing style-debt file was not refreshed or changed.
- `brief-check.mjs (available in the full source checkout)` requires mockup titles/Intent to name
  `grid/tokens.css`, `grid/primitives.css`, `ui-tokens-check.mjs`,
  `style-lint.mjs` and `visual-check.mjs`. Both standalone plans and linked
  round briefs are checked. The round must name its own contract; fenced
  examples and linked plans cannot hide missing round inputs. Ordinary plans
  retain their existing behavior. The design brief documents this convention.
- `example.html`, `example.css` and `example.js` compose Needs you, a mixed-span
  board, rail, chat and secondary context. Width controls select exact 420,
  760, 1100, 1440 and 1920 CSS px containers, with labelled local scrolling
  for wide previews. Board columns query their own region; chat/notes/rail
  use existing shell thresholds. Narrow chat moves into a native dialog with
  focus return; its single composer/log moves with it and accepts local text.
  No message is persisted or sent. Geometry, focus, reflow and sticky composer
  behavior still need the coordinator's browser pass, including 320 px.
- The older toolbox checker now checks the chosen shell instead of requiring
  the provisional SVG. Its nested-nav assertion allows accessible anchor
  labels. The gallery checker permits exactly the local shared shell assets;
  palette/application assets remain inline. The gallery README describes the
  new local dependency when copying that page.

### Coordinator handoff

`.jig/skill-patch.diff` (ignored, requested local deliverable) changes the
canonical `jig-mockup/SKILL.md`, `jig-plan/brief-check.mjs` and the
`jig-verify/style-lint.mjs` helper copy. Non-`.agents` changes are direct.
`git apply --check .jig/skill-patch.diff` passes against the current worktree.
Repository-maintenance commands require the full jig source checkout.
The protected `.agents` files were not edited by this slice. Until application
and generation, the drift gate correctly reports the brief-check copy.

Fixed grid/shell provider cases were added to `docs/mockup-scenarios.md` and
linked from `docs/plan-scenarios.md`. Fresh Codex and Claude Code scenarios
from their normal skill locations are **not run**: loaded/outcome/detection/
tokens remain pending or unknown. Their execution and rendered review belong
to the coordinator; this handoff grants no merge or visual acceptance.

### Verification

- Passed: targeted public checks and fixtures via
Repository-maintenance commands require the full jig source checkout.
  tests/grid-brief.test.mjs tests/grid.test.mjs tests/brief-check.test.mjs`:
  25 tests, 24 passed, zero failed, one browser test skipped. Both bad shell
  and missing-grid seeds failed for their intended reasons before the clean
  controls passed. The runner isolates signal logs; invoking the old CLI tests
  directly without that isolation encountered the existing global-log write
  restriction on a missing-file case.
- Passed: `node docs/design-toolbox/check-page-shell.mjs`: 18 pages, zero
  findings; whole-toolbox style check: zero findings and zero gaps, unchanged
  debt; `node docs/design-toolbox/themes/gallery/check-gallery.mjs`: drift,
  application VM and planted-defect checks pass. Example and assembly scripts
  parse under `node --check`; generated guides pass `build-guides.mjs --check`.
- Known blocker: `check-toolbox.mjs` gets past every old breadcrumb, including
  components, then stops on its stale home copy assertion expecting “Watch
  and tune motion timing; not a component library.” The home already said
  “Watch and tune motion timing. Find effect names…” before this slice;
  `git diff` confirms that copy is unchanged. No unrelated copy fix was made.
- Pending: generated-copy drift until the coordinator applies the patch;
  browser/rendered geometry, native dialog/keyboard behavior, visual craft,
  source accuracy review, fresh independent acceptance, provider scenarios
  and macOS. No live visual or production-readiness claim is made.

Final suite evidence: the first full no-browser run caught a regression in
the inactive-scale fix (an empty scale was passed to token semantic checks).
It was corrected by disabling library-scale inference only in the static
linter context while preserving `undefined` for callers with their own
default scale. The affected token/style/grid tests then passed (21 tests,
20 passed, one browser skip). Final shell/brief/token checks passed all ten
targeted tests after the last shell change. Both public static commands on
`grid/example.html` returned zero findings and zero gaps.

The final full run used workspace-local temporary files to respect the write
boundary: `JIG_NO_BROWSER=1` and TEMP/TMP/TMPDIR pointing to
`.jig/slice4-tmp`, then `node scripts/test-budget.mjs -- node
Repository-maintenance commands require the full jig source checkout.
12 browser skips, in 82.5 seconds. All 13 failures are branch/worktree fixtures
refusing their temporary destinations with “Folder is inside a Git repository”
because the allowed temporary root is inside this worktree. Those fixtures
passed in the earlier run using the runner's default OS temp directory; after
the correction, all affected token tests pass. No worktree guard, fixture or
budget was weakened to turn these constraints into a green full-suite claim.
The budget wrapper reported 82.6 seconds against the pre-existing 10-second
limit, plus existing metadata/tag gaps. Logs are retained locally in
`.jig/grid-slice4-suite.log` and `.jig/grid-slice4-final-suite.log`; temporary
test artifacts are under `.jig/slice4-tmp`. The generated drift gate remains
pending the coordinator patch, so `npm test` is not reported as passed.

Final source hygiene: `git diff --check`, guide drift check, gallery drift/VM
checks, 18-page shell check and `git apply --check .jig/skill-patch.diff` pass.
Telemetry ended `partly` for the pending gates. No commit was made.

## Slice 1

9 November 2026. Draft research register, opt-in CSS tokens and responsive
region contract only. No primitives, rendered guide, adoption, enforcement or
visual acceptance is claimed. Existing typography and themes remain unchanged.
No browser or network was used. Sources were recalled, not read live.

Open questions for slice 2:

- Verify at least ten rule rows against live sources with a fresh reviewer;
  record matches and mismatches. Check Material's current class boundaries and
  section labels, Atlassian's section labels, Every Layout's Measure location,
  and whether Apple's 44-point guidance is on the cited Layout page. Preserve
  the distinction between published guidance and local numeric adaptations.
- Confirm 24/32 px for the fifth Vast numeral role, the line-height pairings,
  and the draft margins on the mixed-span board, Needs you row and chat column.
- Set minimum useful main/inspector/second-pane widths, rail width and shell
  gaps before implementing content-fit collapse; test container ownership to
  avoid applying shell width classes to narrower children.
- Implement plain CSS primitives and literal container thresholds; decide the
  smallest drift check tying those literals to tokens for slice 3. Tokens do
  not make queries or target sizes work by themselves.
- Validate pinned composer, long input, keyboard, safe areas, sheet focus,
  320 px reflow and text-spacing overrides when rendered work is available.
  Show the worked example at the plan's five widths; do not infer visual fit
  from static checks. Phone behavior applies to compact embedded regions too.
- Later checks must distinguish grid geometry and target/safe-area sizes from
  spacing tokens, and preserve existing style debt without refreshing it.

## Project decisions

These excerpts record the supplied grid plan and Slice 1 brief (person,
9 November 2026) without private machine paths. They are project sources,
not claims about what the external publications mandate.

| Decision | Supplied words / plan section |
|---|---|
| D1 | Slice 1 Intent: “Keep the existing 4 px base and do not touch themes.” |
| D2 | Plan, Content 1: “base 4 px; spacing 4, 8, 12, 16, 24, 32, 48, 64; line heights on the base; a type scale template each project fills in.” Requirements / One spacing scale: off-token padding, margin or gap fails. |
| D3 | Plan, Content 2: “inner gap 8, outer gap 24 or 32; panel inset one token per container.” Requirements / Proximity: inner and outer gaps, “with no third value”. |
| D4 | Plan, Content 1: “12 px meta, 14 px code, 15 px content including chat body, 18 px one view title, plus one card numeral size”; “15 to 16 px for chat resolves to 15 px.” Requirements / One type scale: undeclared sizes or sizes “under 12 px” fail. |
| D5 | Plan, Content 4: breakpoints by container width; regions collapse to drawers/sheets; WCAG 2.5.8 minimum 24 CSS px; touch target 44 px per Apple HIG; pinned composer, bottom sheets, WCAG reflow at 320 CSS px. Requirements / Responsive by regions: “type and spacing do not scale with the viewport”. |
| D6 | Plan, Content 5: “12 columns, 24 px gutter, margins per width class; span by importance.” |
| D7 | Plan, Content 3: “reading column capped near 72 characters.” |
| D8 | Plan, Content 6: existing style-debt entries allowed; new or duplicated off-scale declarations fail; debt list never refreshed to hide new debt. Out of scope: restyling existing pages, themes, colour and motion. |

## Launch and verification

The supplied plan is the existing authority for this slice; no replacement
plan or provider sessions were started. `node brief-check.mjs (available in the full source checkout)` on the
supplied plan returned OK for structure only, with `ambiguity: 1 of 3 goals
unmeasured` and a warning that prose on the Kind line makes Kind unknown.
Its recorded plan-check outcome says blocking points were resolved; this job
does not independently establish those review seats or fresh-provider parity.
The plan was left unchanged.

History intake: seven design incidents, zero open repeats. Colour/selection
incidents mp-2026-11-07-03/04/05/06 and mp-2026-11-08-07 are outside this
token-only slice; no colour changes or rendered-contrast claims are made.
For mp-2026-11-08-09 (named check
`missed-design-self-acceptance-mp-2026-11-08-09`) and mp-2026-11-08-17
(`missed-design-presented-wrong-artifact-mp-2026-11-08-17`), the review assertion
is that these four files are the artifact being reported, and static checks
do not establish rendered acceptance. Evidence: the draft status above and
the explicit rendered questions left open for slice 2.

Validation on jig 0.1.0, base revision `25cdce8` (Windows; macOS not tested):

- Passed: a disposable Node assertion run checked all 31 rule rows for four
  nonempty cells and source links, unique/defined tokens, exact spacing and
  type scales, width thresholds, five region rows, local links/fragments and
  LF endings. An in-memory missing-source seed failed for the intended reason.
  This proves citation presence and internal consistency, not source accuracy
  or enforcement against future pages. No check script was added in this slice.
- Passed: repository `npm test` with `JIG_NO_BROWSER=1`, invoked through the
  Node npm CLI under `node scripts/test-budget.mjs -- node <npm-cli> test`.
  Nine skill pointers checked; 277 tests total, 266 passed, zero failed,
  11 browser tests skipped. Test runner duration was 95.0 seconds.
- Failed: the budget wrapper measured 96.2 seconds against the configured
  10-second budget. It also reported missing risk tags, unsupported dynamic
  titles and missing live-version metadata in existing tests (including
  deliberately malformed metadata fixtures). The slowest test was the
  ineffective-scenario-seeds test at 10.1 seconds. No budgets, tests or
  configuration were changed to hide these findings.
- Failed: `node docs/design-toolbox/check-toolbox.mjs` stopped at
  `components/index.html: breadcrumb missing`. Both that page and the checker
  match HEAD (`git diff --exit-code HEAD --` on those two paths returned zero).
  This is an existing blocker to the requested all-green toolbox acceptance;
  this slice leaves existing components and the shared checker unchanged.
- Not tested: live source accuracy, rendering, browser behavior, independent
  acceptance and macOS. No network, browser or provider sessions were run.
  Only the four grid files were authored; no commit was made.

## Slice 2 — primitives and offline guide

9 November 2026. Added `primitives.css`, `guide.css` and `index.html`; linked
the guide from the toolbox home and README. No commit, browser, network,
provider session or extra agent process was used. The guide is an interactive
reference prototype, not rendered acceptance or the full slice 4 application
example. Slice 1's rules, tokens and region contract are unchanged.

### Disposition of slice 1 questions

- The supplied plan answers the spacing, proximity, stable sizing, region
  thresholds, nested container ownership, fixed gutter and 72ch measure
  questions. Implemented those values without changing the plan. Shell queries
  its `grid-shell` ancestor; column grids query their own `grid-region`
  ancestor. Margins belong to that column grid once, not to its shell or cards.
  Compact children span all four tracks; wider regions allow mixed spans.
- The plan does not settle pane dimensions. Prototype choices are rail 64 px,
  useful main minimum 320 px, inspector 280 px, second pane 320 px and the
  existing 24 px gutter. The visible sets need at least 408, 712 and 1056 px
  respectively, below their 840, 1200 and 1600 px class thresholds. Compact
  main has no fixed minimum and can reflow inside its inset at 320 px.
  Content with greater minima must use the documented ordered
  `data-grid-collapse` sets: second pane, then inspector, then rail. These are
  explicit project content decisions, not automatic content measurement.
- The plan requests one numeral size but does not choose it. Retained the
  provisional 24/32 px numeral and existing line pairings/margins for the live
  specimens. Fit remains unconfirmed until rendered review and the slice 4
  board, Needs you row and chat example. The guide declares a separate fixed
  32/32 px page heading; it overrides shared viewport-scaled display type and
  page padding without modifying `jig-pages.css` or existing style debt.
- Implemented literal thresholds 600, 840, 1200 and 1600 px. The disposable
  static check confirms they match token declarations. Slice 3 should add
  durable drift assertions for both named query families, column counts,
  margin selection and guide table snapshots against the Markdown sources.
  The table snapshots in the guide contain all 31 rule rows and five width
  classes, including their source qualifications and links.
- The actual container specimen has the five requested widths, a 320 px
  option and a one-pixel slider for boundary checks. Its wide preview scrolls
  inside its labelled canvas; ordinary guide content does not intentionally
  require horizontal scrolling, apart from labelled source tables. CSS
  changes region presence; JavaScript changes only the demo container width
  and the explicitly selected content-fit override.
- Collapsed regions have labelled openers: navigation uses a side drawer;
  auxiliary panes use a bottom sheet in compact containers and a dialog in
  wider containers. One native modal dialog receives
  the existing panel node, keeping drafts on the same inputs. Close restores
  that node and requests focus return. Native Escape, focus containment,
  focus return and bottom-sheet rendering need browser verification. Native
  dialog focus behaviour was not inferred from the source-DOM simulation.
- Pinned composer, long-input/keyboard/safe-area behaviour and the full chat
  example remain slice 4 work. Text-spacing overrides, actual 320 px reflow,
  all five widths, just-below/at boundaries, narrow nested regions and rendered
  fit remain coordinator browser checks. Source verification of ten rules,
  current section names and Apple's point-to-web adaptation remains for the
  fresh reviewer with web access; no offline claim closes those questions.
- Good/bad proximity examples use the same valid tokens, swapping inner and
  outer gaps in the bad case. This shows why token compliance alone cannot
  establish correct grouping. Geometry defaults remain separately named;
  no new positive spacing step was added.

### Launch and evidence

The supplied plan remains the authority. Before implementation,
`node brief-check.mjs (available in the full source checkout) <supplied-plan>` returned OK for structure,
`ambiguity: 1 of 3 goals unmeasured`, and the existing unknown-Kind warning.
Its recorded plan-review outcome was used; no new independent review or
provider-parity claim is made. jig-plan intake and jig-verify were applied.
Verification telemetry started successfully; completion is recorded below.

Design history intake again reported seven incidents and zero open repeats.
For `missed-design-self-acceptance-mp-2026-11-08-09` and
`missed-design-presented-wrong-artifact-mp-2026-11-08-17`, the review assertion
is that `grid/index.html` is the delivered artifact, and source inspection
and script simulation cannot close visual feedback. This note and the guide's
prototype notice preserve that distinction. The five colour/selection history
items remain outside a layout-only slice; no theme was edited and no rendered
contrast acceptance is claimed.

Windows, Node 24.22.2; macOS not tested:

- Passed: `node scripts/style-lint.mjs docs/design-toolbox/grid`: zero findings
  and gaps. Whole-toolbox `lintDirectory` with `styleDebt` and the existing
  `style-debt.json` entries: zero new findings and gaps. The debt file is
  unchanged against HEAD.
- Passed: a disposable Node assertion run checked local links and HTML
  fragments, unique IDs, exact content and sources of all 31 rule rows, five
  region rows, defined CSS variables (including specimen inline variables),
  token-only margin/padding/gaps, absence of viewport-sized dimensions in new
  CSS, query literals and local resource loading. An in-memory 10 px gap seed
  was rejected by the existing style lint, and the unchanged source passed.
  This proves static detection, not the slice 3 enforcement contract.
- Passed: the actual inline guide script executed in a Node VM with a minimal
  DOM double. Checked all six width presets, slider values immediately below
  and at each threshold, exclusive active-width state, same-node panel
  movement with edited drafts retained, close/focus requests, native-close
  event restoration, queued close/reopen handling and content-fit overrides.
  Slider assertions establish state changes, not CSS layout at those widths.
- Failed as known on base: `node docs/design-toolbox/check-toolbox.mjs` stops
  at `components/index.html: breadcrumb missing`. Neither that file nor the
  checker was changed. The later toolbox assertions are not claimed as run.
- The first full-suite invocation used an incorrect npm CLI path and did not
  run tests; the path was discovered from the installed command and corrected.
  Budget inventory also reports existing missing risk tags, unsupported
  dynamic titles and missing live-version metadata. None were edited.
- Full-suite command: `JIG_NO_BROWSER=1 node scripts/test-budget.mjs --summary
  -- node <installed-npm-cli> test`, with TEMP/TMP redirected under the
  worktree to respect the write boundary. Nine skill pointers checked.
  Failed: wrapper measured 88.8 seconds against 10 seconds and retained the
  existing inventory findings. In addition, worktree/cleanup scenario fixtures
  that require scratch repositories outside any Git repository failed with
  `Folder is inside a Git repository`: their temporary root was necessarily
  inside this worktree. This is a restricted-run gap, not evidence of a grid
  regression or an all-green suite. The ineffective-scenario-seeds test was
  the slowest reported unit at 11.2 seconds. No test, budget or fixture was
  changed to hide failures; a normal external-temp suite run remains pending.
Repository-maintenance commands require the full jig source checkout.
  tests/ui-tokens.test.mjs` with browser fixtures disabled and workspace-local
  temp: eight passed, zero failed/skipped, about 219 ms. Includes the real
  whole-toolbox style-debt ratchet and token detection fixtures. Final grid
  lint again returned zero findings/gaps, and `git diff --check` passed.
- Verification telemetry ended as partly: rendered and independent acceptance
  and a normal full-suite environment remain unavailable. Automatic approval
  review rejected removal of the verified workspace-local test temporary root
  as `blocked by policy`. Leftover `jig-scratch` and `node-compile-cache`
  directories remain under the ignored `.jig/grid-slice2-tmp` directory; no
  cleanup completion is claimed.
- Not tested: browser rendering and interactions, live source accuracy,
  independent visual/accessibility acceptance, provider scenarios or macOS.
  No screenshot or UI acceptance was manufactured. No skill was changed.

Files authored in slice 2: `grid/primitives.css`, `grid/guide.css`,
`grid/index.html`, appended `grid/notes.md`, `../README.md`, `../index.html`.

## Slice 3 — checks and fixtures

9 November 2026. Extended the existing style, token, alignment and clipping
checks; added the small `scripts/visual-reflow.mjs` helper and fixtures under
`tests/fixtures/grid`. No commit, network, browser, provider session or extra
agent process was used. The guide remains a prototype pending rendered and
independent acceptance. The supplied plan was read without modification;
`brief-check` again passed structure with its existing ambiguity/Kind warnings.
Its recorded plan-check outcome was used; no fresh review pass is claimed.

### Check contracts and commands

`grid.config.json` declares this guide's fixed scale: 12, 14, 15, 18, 24 and
32 CSS px (the last is the already existing guide heading). Project-specific
scales belong in the nearest ancestor sidecar with `version: 1`, `typeScale`
and optional relative `tokenFiles`. The bad/clean fixture project declares
12, 14, 15, 18 and 24. Do not add sizes to a sidecar to excuse a violation.
Static aliases, shorthand/logical spacing, font shorthand, conditional token
alternatives, unresolved variables and cycles are exercised without a browser.
Grid spacing must reach a `--grid-space-*` token; zero and `auto` are layout
exceptions. Unsupported computed values fail in configured grid projects.
This conservative declaration check does not evaluate the CSS cascade.
Unconfigured legacy styles retain the existing raw-value/debt checks; their
tokenized typography has not been migrated or certified by this slice.

Run from the repository root:

```text
node scripts/style-lint.mjs
node scripts/ui-tokens-check.mjs
node scripts/style-lint.mjs docs/design-toolbox/grid/index.html
node scripts/ui-tokens-check.mjs tests/fixtures/grid/extra-font-size.html
```

Both default commands scan every toolbox HTML/CSS file and apply the unchanged,
counted `style-debt.json` allowances. A supplied HTML path includes its local
stylesheets/imports. `lintDirectory` still returns unfiltered findings for
existing callers; `checkStyles` is the shared ratcheted entry point. Existing
state-table options and exports remain supported. Token state rows now also
reject text below 12 px regardless of role. A grid-only page with a sidecar
does not need a fabricated colour/state table to run its static grid checks.

With `JIG_NO_BROWSER=1` set in the environment, run:

```text
Repository-maintenance commands require the full jig source checkout.
Repository-maintenance commands require the full jig source checkout.
```

The grid tests plant off-scale spacing, extra sizes, 11 px text, overwritten
bad token alternatives, duplicate debt, shifted cards, clipped text, covered
controls and narrow prose. Clean controls pass. They also check the production
spacing steps, literal region/shell thresholds, column/margin bindings and the
guide's 31 rule IDs against the Markdown register. These are source checks,
not published-source verification or a complete rendered guide snapshot.

`scanClip(selector)` promotes the draft's reusable visible-box, self-clipping
and sampled control-coverage logic; its page URLs, launch loop and empty
finding were discarded. `inspectClip` keeps its text-Range contract.
`inspectClipping(page, selector)` combines them. The clip CLI and both normal
shared runner paths execute the promoted scan, proven by a Node replay test.
Extra-font passes retain their existing text-only scope. Inline zero client
widths and intervening scroll viewports remain clean controls.

Card rows are sibling `[data-grid-card]`, `.card`, `.grid-panel` or
`.region-card` elements with overlapping vertical extents. Top edges and the
corresponding left/right content insets (border plus padding) must agree within
1 px; unequal card widths are allowed. This explicit rule catches larger drift
than the existing generic 1–3 px near-miss heuristic. Reflow checks text ranges
at exactly 320 CSS px, including nested horizontal scrollers. Tables and named
`data-reflow-canvas` previews are exceptions; the existing labelled guide demo
now declares that canvas marker. Ordinary prose remains subject to reflow.

Coordinator browser commands, after the machine memory/coordination guard and
with `JIG_NO_BROWSER` unset:

```text
Repository-maintenance commands require the full jig source checkout.
node scripts/visual-alignment.mjs --url <file-URL> --root <card-container>
node scripts/visual-clip.mjs --url <file-URL> --root <content>
node scripts/visual-reflow.mjs --url <file-URL> --root <content>
```

The grid browser test owns one browser and closes it in `finally`. Missing
Chrome, missing Playwright, low memory or the no-browser flag produce an
explicit skip; assertion failures do not become skips. Browser detection and
guide geometry remain unverified in this job. Three-point coverage sampling
does not prove every pixel is unobstructed; reflow geometry does not establish
WCAG conformance.

### Evidence and remaining work

Windows, Node 24.22.2, jig 0.1.0, base revision `25cdce8`; macOS not tested.
Design/runner history intake found zero open repeats. The named inline and
scroll-boundary checks (mp-2026-11-07-01/02) have explicit replay clean controls;
their real browser parity remains pending. The claimed-not-built check
(mp-2026-11-08-04) has an executable sequential/batched integration assertion.
The partial-coverage check (mp-2026-11-08-08) remains covered by existing runner
regressions. For the two artifact/self-acceptance incidents
(mp-2026-11-08-09/17), the review assertion is that static/replay evidence here
does not close rendered guide feedback. Colour/theme incidents are outside
this checks-only slice; no theme was changed or accepted.

- Passed: both whole-toolbox static CLIs and the guide page path; zero new
  findings/gaps. The debt file, known breadcrumb page and toolbox checker are
  unchanged against HEAD. Known-bad static fixtures fail for the intended
  reasons, with the selector/property/value reported; clean controls pass.
- Passed: targeted grid/style/token tests, and the affected font calibration
  and batched runner tests, with browsers disabled. An initial regression in
  extra-font scope was corrected; the original test now passes unchanged.
- Full Node suite, once on the final code: with `JIG_NO_BROWSER=1` and TEMP/TMP
  inside the worktree, ran
Repository-maintenance commands require the full jig source checkout.
  Actual runner: 287 tests, 262 passed, 13 failed, 12 skipped, 71.5 seconds.
  All 13 failures are worktree/branch-cleanup fixtures refusing temporary
  scratch roots inside a Git repository, as already observed in slice 2's
  restricted run. All grid, style, token, generator-fixture and affected
  visual-runner tests passed. Grid-specific result: nine passed and one
  browser test explicitly skipped. A normal external-temp run remains pending.
  The budget wrapper failed at 71.6 seconds against 10 seconds and retained
  existing missing-risk, unsupported-title and live-version inventory findings;
  budgets and existing worktree tests were not changed. Raw output remains at
  `.jig/grid-slice3-suite.log` (ignored, workspace-local to honor this job's
  write boundary). The separate generated-copy drift gate is still failing,
  so this is not an all-green repository check.
- Failed as known on base: the toolbox checker still stops at
  `components/index.html: breadcrumb missing`.
- Pending: generated skill support copies. The drift check correctly detects
  changed helper sources. The existing generator now includes the reflow helper
  and its fixture tests cover that package member, but running
Repository-maintenance commands require the full jig source checkout.
  directory. The coordinator must regenerate and run `--check` with write
  access. No canonical skill instructions or generated copies were hand-edited.
  Fresh two-provider scenarios remain coordinator work before a skill merge;
  no provider launch was authorized or attempted here.
- Cleanup blocked: inspected `.jig/grid-slice2-tmp` contains 95 Node compiled
  cache files under `node-compile-cache/v24.22.2-x64-964aae3f`, plus
  `jig-scratch/visual-43492-1794251342265/motion.json` and
  `jig-scratch/visual-51480-1794251342051/clip.json`. Both reports contain zero
  runs and only `Browser disabled: JIG_NO_BROWSER=1`. Automatic approval review
  rejected the path-checked recursive removal and a safer removal of individual
  inspected files, both as `blocked by policy`. Nothing was removed.

Files authored/changed in this slice: `scripts/style-lint.mjs`,
`scripts/ui-tokens-check.mjs`, `scripts/visual-alignment.mjs`,
`scripts/visual-clip.mjs`, `scripts/visual-reflow.mjs`,
`scripts/visual-check.mjs`, `scripts/visual-static.mjs`,
Repository-maintenance commands require the full jig source checkout.
`tests/sync-skills.test.mjs`, the grid fixture directory,
`docs/visual-checks.md`, `grid/grid.config.json`, the guide's canvas marker
in `grid/index.html`, and this appended note. Existing slice 1/2 files and
the pre-existing toolbox home/README edits were preserved.
