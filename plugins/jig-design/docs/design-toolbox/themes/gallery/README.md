# Palette gallery

Open [index.html](index.html) in a browser. It is a standalone, offline page:
no server, fonts, packages or network requests are needed. Keep the toolbox's
shared CSS, grid tokens and `logo/final/` assets beside it when copying the page;
the palette data and application remain inline. All 72 groups and
their contrast reports are present in the HTML even without JavaScript.

Pick groups using the star buttons. The shortlist stays at the top; clicking a
pick reveals its tile and resets filters. Appearance and scheme filters combine.
Picks use localStorage in this browser and origin, with updates between tabs.
If browser settings deny storage (possible for local files), the page reports
that picks last only for the current visit.

There are 30 original OKLCH harmony groups: analogous, complementary,
split-complementary, triadic and monochrome with an accent, each around blue,
teal and warm orange, in both light and dark. Nine further groups adapt Nord,
Solarized dark/light, Catppuccin Mocha/Latte, Dracula, Tokyo Night and Gruvbox
dark/light. A Wada filter adds 24 numbered combinations from Sanzo Wada: twelve
three-colour and twelve four-colour sets, covering calm, warm and vivid moods in
dark and light. These are palette studies for choosing groups before building themes.

**Mixed contrast** adds four light-canvas studies: dark nodes and chrome,
saturated solid headers, light nodes with a dark desktop sidebar/dock, and an
enhanced light scheme targeting WCAG 2.2 normal-text contrast of 7:1.
**Neon and synthwave** adds three original schemes (deep navy, near black and
purple/pink), SynthWave ’84 and Shades of Purple. Neon stays on accents, edges
and chips; body text is neutral. Both groups are in the scheme filter and work
with the appearance filter and saved picks.

Each tile shows three background layers, two text values, four accents and four
state colours. Swatches expose labels and hex values on hover or keyboard focus.
The same SVG board fragment shows a task frame, three node types with header
tints, a selected node, two edges, a state chip and a question callout.
Wada tiles also show an upper strip of the original combination colours and a
note identifying derived background layers, neutral text and state colours. The
source canvas is preserved; exact mappings and combination numbers are recorded
in `SOURCES.md`.

The contrast mark checks primary text on the base layers, headers, chip,
question and any toolbar, sidebar and dock, plus secondary text on each base
layer, against an unrounded 4.5:1 threshold (7:1 for enhanced light). The new
tiles choose neutral text independently per surface, so dark nodes and solid
headers can use light text on a light canvas. Expand the mark for individual
surface verdicts and ratios. Warnings on older tiles preserve the source colours
so they can inform the later theme work. This is not a full accessibility audit.

All palette values, exact upstream revisions, adaptations, attribution and
licence links are in [SOURCES.md](SOURCES.md). Local notices are in `licences/`.
Gruvbox has no separate upstream licence file: its README's MIT/X11 declaration
and package metadata are preserved alongside the MIT terms. Tokyo Night uses
Enkia's MIT-licensed original VS Code palette.
Shades of Purple's complete notice adds an MIT-licensing condition; this gallery
and its adaptations are MIT licensed. Panda was excluded because its checked
revision had no clear licence. Exact revisions and findings are in `SOURCES.md`.

## Maintain and check

With Node.js 22 or newer, from this directory:

```text
node build.mjs
node check-gallery.mjs
```

The same contract check is also available through `node --test gallery.test.mjs`
for test discovery and the project's test-budget runner.

`palettes.mjs`, `wada.mjs`, `wada-data.json`, `wada-sources.md`, `app.js`,
`contrast-palettes.mjs`, `contrast-sources.md`, `gallery.css`, `template.html` and `sources.json` are
the inputs. `build.mjs` generates only `index.html` and `SOURCES.md`. The check
is read-only and requires no installed dependencies. It checks:

- Inline JavaScript parsing and embedded JSON.
- All 72 static tiles have source and colour records, reusable licence notices,
  and the required board elements.
- Imported colours belong to their pinned upstream palette; generated files
  match their inputs.
- Contrast reference values, the 4.5:1 boundary and OKLCH reference conversion.
- Filters, favourites, persistence, shortlist links, reset, cross-tab updates and
  corrupt or denied storage using the actual handlers in a small Node VM DOM
  substitute. This does not emulate browser rendering.
- Detection proof: removing a tile's source record in memory must fail the same
  coverage check; unchanged records must pass.
- All 24 Wada combination numbers and memberships match the pinned dataset;
  source colours supply accents and canvas, neutral colours supply text/states,
  and every measured text pair passes. Corrupted Wada membership and unreadable
  text must fail the same checks. Wada filters and saved favourites are exercised.
- Every emitted SVG surface and text colour matches its static contrast report
  and its own source table. Missing reports, wrong text and missing dock coverage
  are planted in memory and rejected. All nine new tiles meet their text target;
  7:1 boundaries, solid headers, neutral neon text and the new filters are checked.

`collect-sources.mjs` is an optional maintainer command requiring network access.
It refreshes `sources.json` and imported licence notices from upstream, pinned
to the fetched revisions. Review licence changes and rebuild afterwards.
It preserves the separate Wada and neon records. `collect-neon.mjs` fetches only
the two pinned neon sources and complete notices; review its pinned revisions
and licence conditions before changing them. `collect-wada.mjs` refreshes only the
pinned MIT dataset and notice; it retains numerical hex/membership data without
book prose or imagery. The copyright research, territorial limits and dataset
attribution are maintained in `wada-sources.md` and generated into `SOURCES.md`.

## Verification on 7 November 2026

Mixed contrast / neon follow-up: all 72 tiles pass the gallery static/Node VM
contract on Windows, Node.js 24.22.2. The nine new tiles each report 14 text
pairs. Their minimum ratio is 5.05:1; enhanced light's minimum is 7.39:1.
The checker proves detection of missing per-surface reports, dark text on dark
nodes and a missing dock surface, as well as the existing attribution and Wada
defects. The gallery-only test passed through the 10-second budget runner;
`git diff --check` passed for this directory. No repository-wide suite, browser,
native DOM, visual layout, assistive technology or macOS checks were run. Palette
appearance and product judgement remain pending; these are palette studies.
Verification telemetry was skipped because it writes outside the authorized
gallery directory. No provider sessions or additional agents were started.

Follow-up changes are limited to `README.md`, `SOURCES.md`, `app.js`, `build.mjs`,
`check-gallery.mjs`, `collect-sources.mjs`, `collect-neon.mjs`,
`contrast-palettes.mjs`, `contrast-sources.md`, `index.html`, `palettes.mjs`,
`sources.json`, `template.html`, `licences/jig-harmonies.txt`,
`licences/synthwave-84.txt` and `licences/shades-of-purple.txt`.
Everything remains uncommitted. Earlier Wada verification follows for context.

Passed the static and Node VM checks above on Windows with Node.js 24.22.2.
The Wada follow-up started after gallery commit `36c846c`, using `jig-verify (if installed; otherwise use your own equivalent and record which)`
0.1.0. The budgeted gallery contract passed within its 10-second budget. All Wada
text pairs pass, with a minimum measured ratio of 4.75:1. The existing edits
outside this directory were left untouched. Verification telemetry was skipped
because its marker would write outside the permitted gallery directory.
No browser was launched, as requested. Visual layout, native browser controls,
actual localStorage behaviour, keyboard/screen-reader use and macOS remain
untested. The person's judgement of palette combinations and board readability
remains pending. No theme packs or files outside this gallery were changed by
this task, and nothing was committed.

Wada follow-up files: `README.md`, `SOURCES.md`, `app.js`, `build.mjs`,
`check-gallery.mjs`, `collect-sources.mjs`, `collect-wada.mjs`, `gallery.css`,
`index.html`, `licences/wada.txt`, `palettes.mjs`, `sources.json`, `template.html`,
`wada-data.json`, `wada-sources.md` and `wada.mjs`. The gallery-only contract and
diff whitespace checks were run; the repository-wide suite was not run for this
isolated change. The page remains a palette study, with visual and product
judgement pending as described above.
