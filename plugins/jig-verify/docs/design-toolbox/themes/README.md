# Starter themes

Theme pass 7, 7 November 2026. Open [preview.html](preview.html) from disk. **White board is the default**, followed by its soft-card variant and the five favourites from the person's gallery picks. Board uses the shared picker and previous/next controls. Components puts both whiteboard variants first, side by side at a wide window; narrow windows stack the comparisons. Each comparison has its own token root. No server, dependencies or network are needed to view the packs. JavaScript off leaves the White board component workspace readable.

| Pack | Appearance | Source group and treatment |
|---|---|---|
| [white-board](white-board/theme.css) | Light, default | Paper / saturated headers; pure white canvas and panel, light grey card bodies, eight saturated type hues and white labels. Light chrome and near-black reading text. |
| [white-board-soft](white-board-soft/theme.css) | Light | Same source, white canvas and panel; quiet tinted card bodies filled to the bottom, stronger tinted headers, solid coloured leading edges. |
| [paper](paper/theme.css) | Light | Paper / saturated headers; the gallery's warm paper canvas and four exact saturated anchors. |
| [studio](studio/theme.css) | Mixed, light canvas | Studio / dark chrome; light nodes and canvas, dark toolbar, work queue/sidebar and chat/dock, separate light chrome text. |
| [clarity](clarity/theme.css) | Mixed, enhanced light | Clarity / enhanced light; white canvas, solid headers, dark chrome and **7:1 for every measured normal-text pair**. This is a text contrast target, not full AAA certification. |
| [dracula](dracula/theme.css) | Dark | Dracula; original purple/cyan/pink/orange anchors and canvas, distinct grounds and stronger coloured headers, neutral reading text and conventional state hues. |
| [electric](electric/theme.css) | Dark | Electric / deep navy; original navy canvas, navy chrome, cyan/pink/lime/violet anchors and stronger type headers. Neutral reading text without glow. |

The shortlist contained 21 gallery groups. This pass builds the requested five favourites plus the missing whiteboard treatment; the other shortlisted groups remain available in the read-only [gallery](gallery/README.md).

**White board vs Paper:** pure white canvas/panel with neutral grey layers vs warm paper canvas/panel with warm neutral layers; they share the same type hues.

## Pass 7 coordinator findings

| Finding | Change | Still needs a visual check |
|---|---|---|
| 1. Eight types shared four hues | Eight type angles at 45° intervals, rotated from each source key. Pairwise header checks require 0.045 ΔEOK and 30° hue separation. Type edges/headers stay at least 0.08 ΔEOK and header hues at least 12° from state ink. Working uses its own blue midpoint between type hues. | Recognising all eight types on Board, especially Ticket vs Check; judge White board, Dracula and Electric first. |
| 2. Zero surface steps and reversed light neutrals | Chrome has its own ground. Seven adjacent layer pairs must each differ by at least 0.025 ΔEOK; the real minimum now exceeds 0.03 in every pack. Light neutral steps 1–6 decrease monotonically. Actual card/frame and header/body pairs are checked too. | Visible depth without making the light-mode board too grey; inspect frame, card, header, panel and chrome together. |
| 3. Soft-card white band | The full `.map-node` background uses the same tint mix as `.node-content`, so fixed-height cards paint below the content. Selected cards retain their selection ground. | The bottom and edges of short-content cards at Middle and Far, including scrolling and selected cards. Static CSS checks cannot prove raster coverage. |
| 4. White board vs Paper unclear | The one-line distinction above explicitly names pure white vs warm paper. | Whether both treatments earn their place. |
| 5. Dark cards flat; Electric chrome grey | Stronger type-tinted headers must differ from the neutral card body by at least 0.10 ΔEOK in dark profiles. Electric chrome is navy; the later Board CSS rule now uses `surface-chrome`. Components shows eight actual header swatches and adds chrome to its layer ladder. | Dark header pop, navy continuity across toolbar/queue/chat, and comfort without glare. |
| 6. Needs you looked olive-brown | Light attention fill is orange `#ffb989`, with separate dark orange ink; the preview uses the checked state/fill pair. Clarity's link was darkened to retain 7:1 on that fill. The checker rejects low-chroma light attention fills. | Whether the chip reads clearly as orange/amber and remains the most useful attention signal. |

These are implemented changes with static evidence. No browser was launched in this pass.

## Sources and licence

Each standalone pack includes its complete CSS and a version **0.6.0** manifest. The manifest records the exact source group/id, original scheme label, gallery data file, presentation and a measured OKLCH harmony. These picked palettes remain **source palettes**: their four anchor hue angles derive from the actual sources. `typeAngles` declares a separate eight-part extension around the source key, rather than claiming all eight hues existed upstream. The checker validates source angles, both stored scale appearances, action/accent/selection roles and the rendered type hues independently. `workingHue` declares the semantic blue exception. The original gallery data is unchanged.

Paper, Studio, Clarity and Electric come from the original jig studies in [contrast-palettes.mjs](gallery/contrast-palettes.mjs). White board borrows Paper's four accents, then makes the canvas and panel white. Dracula comes from [palettes.mjs](gallery/palettes.mjs), pinned upstream revision and attribution recorded in its [manifest](dracula/theme.json). **Dracula Theme, created by Zeno Rocha**, is MIT licensed; its complete copyright and permission notice ships in [LICENSE-Dracula.txt](dracula/LICENSE-Dracula.txt), copied from the gallery's pinned licence. The generator checks that copy for drift. jig additions remain UNLICENSED; the repository has no declared licence. Board icons retain their embedded Lucide ISC/MIT notices.

## Scale and role contract

Every active pack defines **521 tokens**: the previous 500, plus eight type text roles, eight type edge roles, chrome surface/primary/secondary/boundary roles and the card-body mix switch. All previous role names remain. Geometry, typography and reduced motion retain the established values. Each pack can load alone, without a runtime palette generator or another stylesheet.

There are eleven stable family slots (neutral, blue, cyan, teal, green, lime, amber, orange, red, rose, violet), twelve steps each, in separate light and dark appearances plus active aliases: **396 scale tokens**. Family names are legacy slots, not fixed hues. Blue/cyan/violet/orange carry the four source accents; lime repeats orange and rose repeats blue. Teal carries Working's blue hue. Green/amber/red carry success, attention and error. All four source anchors remain exact at active step 9; step 10 supplies a darker variant. Other steps and the explicit type colours are original OKLCH constructions, reducing chroma at fixed lightness and hue to fit sRGB. Checks measure quantised opaque hex values.

Neutral steps 1–6 supply grounds, 7–8 boundaries and 11–12 reading text. Colour step 2 supplies state fills, 9–10 saturated anchors and 11 reading ink. Attention's light fill is deliberately more chromatic. Type surface/header/edge roles now contain explicit hex colours at their declared type angle, freeing eight types from the four source scale slots. Roles choose their actual usage, rather than assuming a step alone guarantees contrast. Both stored appearances contain valid colours; tests also assemble all fourteen complete light/dark role profiles. The manifest and active aliases choose the supported appearance. Changing only CSS color-scheme does not switch the pack.

The manifest now declares **stepped** layers. The checker measures canvas → frame body → node body → node header → panel → chrome, plus frame body → frame header and frame header → node body. Every edge requires at least **0.025 ΔEOK**, with no alias exemption. White canvas and white panel intentionally coincide as non-adjacent roles; panel and chrome do not alias. The reported minimum is over these real adjacent steps, not all possible non-adjacent combinations. Dark roles may move toward either lighter or darker grounds around the preserved source canvas; they are not presented as a monotonic scale. Archived depth packs retain their original all-pairs guard.

Type shapes and labels still identify all eight types. Each header pair must differ by **0.045 ΔEOK and 30° OKLCH hue**, after quantisation. The distance is a project guardrail selected from the pass-6 distinct-hue baselines: the four first-type headers had minima of 0.0155 in Electric, 0.0156 in Dracula and 0.0163 in White board soft, compared with 0.1421 in solid White board. The new floor is approximately three times the old tinted-header separation; it is not a published human recognition threshold. Actual current minima are about 0.065–0.071 and 44°.

Quiet type **body** tints retain the 0.030 chroma cap and at least 0.025 distance from canvas. Headers intentionally have more chroma, with dedicated checked text; primary/secondary/link body text is not assumed to work on a saturated header. Both stored profiles are assembled and checked by tests. Dark headers also require 0.10 distance from neutral node bodies. Soft cards use the checked type surface across the entire card; other bodies and queue rows use neutral grounds. Edges use the same declared type hue. Selection remains a separate outline and connector, with selected card bodies using the selection ground.

States use a glyph and word plus their own reading fill. Attention now uses orange fill and dark ink in light mode; in dark mode it retains bright ink on a dark fill. All four state solids still have checked `text-on-state` pairs as a compatibility guarantee. State ink chroma must exceed quiet body tints by 0.035. Type edges and headers must be at least 0.08 ΔEOK from each state's ink, with at least 12° between header and state ink hues. Working is blue, error red, attention orange/amber (50–100°), success green; Unknown is neutral. Selection and connectors remain at least 0.08 ΔEOK from every state. These distances and tint limits are project design guardrails, not claims of colour-vision safety or recognition thresholds.

Dark reading and chip text retain the below-20% HSL saturation guard from the person's earlier Night discomfort feedback. Dracula's original tinted comment text is replaced with more readable neutral secondary text. Comfort still requires the person's viewing.

## Contrast and measured results

Reading text, links, disabled text, action labels, chip labels, type header labels and chrome text require **4.5:1**, or **7:1 in Clarity**. Essential control boundaries, type edges, selected boundaries, action fills and focus require **3:1**. Primary/secondary/links are checked across ten neutral roles, all five state reading fills and all quiet type surfaces. Every header uses its own type text pair. State text is checked on its matching fill and panel, including the actual attention-chip pair. Chrome labels and chrome boundaries use their dedicated chrome surface; neutral control interiors keep their normal reading roles. Chrome focus rings use the checked chrome boundary against the surrounding chrome; controls inside the light question panel use the ordinary focus role.

Relation lines use canvas. Accent strokes and header hue are redundant decoration. Scrim carries no content. Arbitrary cross-state combinations, text on accent fills, images and opacity are outside this contract. No accessibility or comfort certification follows from these arithmetic checks.

The checker rejects missing, duplicate, unknown or cyclic tokens, malformed manifests/colours, wrong active aliases, unchecked CSS overrides, invalid harmony geometry and report drift. The CSV records every checked pair with its actual hex colours, unrounded decision ratio and threshold. Display minima are floored, never rounded into a pass.

<!-- contrast:start -->
| Minimum ratio in group | clarity | dracula | electric | paper | studio | white-board | white-board-soft |
|---|---:|---:|---:|---:|---:|---:|---:|
| Primary text / all surfaces | 11.19 | 8.80 | 9.86 | 11.19 | 10.85 | 11.19 | 11.19 |
| Secondary text / all surfaces | 7.00 | 6.01 | 6.74 | 7.00 | 6.79 | 7.00 | 7.00 |
| Link text / all surfaces | 7.36 | 8.80 | 9.86 | 6.61 | 6.37 | 6.61 | 6.61 |
| Disabled text / disabled | 10.56 | 9.21 | 9.94 | 9.95 | 9.48 | 10.56 | 10.56 |
| Action text / action | 10.83 | 7.76 | 12.17 | 6.52 | 5.62 | 6.52 | 6.52 |
| Chip text / saturated states | 12.23 | 9.56 | 9.56 | 10.40 | 10.40 | 10.40 | 10.40 |
| attention chip / all surfaces | 7.75 | 5.43 | 6.08 | 6.68 | 6.48 | 6.68 | 6.68 |
| working chip / all surfaces | 7.46 | 6.94 | 7.79 | 6.42 | 6.24 | 6.42 | 6.42 |
| success chip / all surfaces | 7.31 | 5.97 | 6.69 | 6.22 | 6.02 | 6.22 | 6.22 |
| error chip / all surfaces | 8.06 | 5.36 | 6.00 | 6.99 | 6.77 | 6.99 | 6.99 |
| attention text / matching fill + panel | 7.75 | 9.37 | 9.37 | 6.68 | 6.68 | 6.68 | 6.68 |
| working text / matching fill + panel | 10.81 | 11.95 | 11.96 | 9.30 | 8.51 | 9.30 | 9.30 |
| success text / matching fill + panel | 10.64 | 10.24 | 10.24 | 9.05 | 8.26 | 9.05 | 9.05 |
| error text / matching fill + panel | 11.56 | 9.27 | 9.27 | 10.03 | 9.15 | 10.03 | 10.03 |
| unknown text / matching fill + panel | 9.56 | 7.08 | 7.80 | 8.96 | 8.55 | 9.56 | 9.56 |
| Control boundary / all surfaces | 4.45 | 3.93 | 4.38 | 4.45 | 4.31 | 4.45 | 4.45 |
| Selected boundary / all surfaces | 6.47 | 4.35 | 3.73 | 4.28 | 3.36 | 4.28 | 4.28 |
| Action fill / all surfaces | 6.47 | 4.35 | 7.64 | 3.90 | 3.26 | 3.90 | 3.90 |
| Focus ring / all surfaces | 6.47 | 4.35 | 3.73 | 4.28 | 3.36 | 4.28 | 4.28 |
| Relation line / canvas | 7.45 | 5.33 | 7.06 | 7.01 | 6.70 | 7.45 | 7.45 |
| Selected line / canvas | 10.82 | 5.90 | 6.01 | 6.75 | 5.22 | 7.17 | 7.17 |
| Type header text / header | 7.70 | 6.18 | 6.20 | 6.23 | 10.94 | 6.23 | 10.99 |
| Type edge / body | 5.03 | 4.66 | 5.14 | 4.76 | 4.55 | 5.08 | 5.27 |
| Chrome text / chrome | 16.49 | 14.69 | 14.71 | 15.89 | 14.03 | 16.88 | 16.88 |
| Chrome secondary / chrome | 11.65 | 10.38 | 10.40 | 9.95 | 9.92 | 10.56 | 10.56 |
| Chrome boundary / chrome | 6.00 | 5.34 | 5.35 | 6.31 | 5.10 | 6.71 | 6.71 |
<!-- contrast:end -->

Canvas reading and selection separation:

<!-- reading:start -->
| Pack | Primary / canvas | Secondary / canvas | Minimum selection ΔEOK |
|---|---:|---:|---:|
| clarity | 18.73 | 11.72 | 0.1487 |
| dracula | 11.94 | 8.16 | 0.1679 |
| electric | 15.89 | 10.86 | 0.2089 |
| paper | 17.65 | 11.04 | 0.2083 |
| studio | 16.85 | 10.54 | 0.2227 |
| white-board | 18.73 | 11.72 | 0.2083 |
| white-board-soft | 18.73 | 11.72 | 0.2083 |
<!-- reading:end -->

Enforced adjacent surface/header minima (header chroma is excluded from the quiet body-tint maximum):

<!-- palette:start -->
| Pack | Minimum adjacent surface ΔEOK | Minimum header ΔEOK | Minimum header hue gap | Maximum body tint chroma | Minimum state chroma |
|---|---:|---:|---:|---:|---:|
| clarity | 0.0331 | 0.0656 | 44.11° | 0.0209 | 0.0673 |
| dracula | 0.0404 | 0.0653 | 44.06° | 0.0217 | 0.0798 |
| electric | 0.0391 | 0.0649 | 44.25° | 0.0212 | 0.0840 |
| paper | 0.0344 | 0.0690 | 44.15° | 0.0207 | 0.0783 |
| studio | 0.0334 | 0.0690 | 44.23° | 0.0211 | 0.0775 |
| white-board | 0.0331 | 0.0690 | 44.15° | 0.0207 | 0.0783 |
| white-board-soft | 0.0331 | 0.0711 | 44.19° | 0.0207 | 0.0783 |
<!-- palette:end -->

## Retired packs

Moved intact into [retired/](retired/): calm-workbench, warm-studio, night, night-dim, night-warm, neon-synth and neon-synth-vivid. None appears in the picker or Components comparisons. Tests still exercise their contrast, malformed inputs and isolated variant changes via their archived paths. The legacy generator recipes remain available for those regression tests; the active build only generates the seven chosen packs.

## Build and check

Edit [palette.mjs](palette.mjs) for role mappings and source selection; gallery files are read-only. [build-palettes.mjs](build-palettes.mjs) generates complete active CSS, manifests, embedded preview harmony data and the Dracula notice. It shares the established non-colour values from archived Calm. Its --check mode refuses drift, including manifest presentation/source metadata. External packs do not need a bundled folder name: the checker validates their manifest's harmony and presentation. A source-palette pack must supply its source id/group and full presentation record. New component roles are required together; legacy packs retain their original 500-token contract.

Run from the repository root:

~~~text
node docs/design-toolbox/themes/build-palettes.mjs
node docs/design-toolbox/themes/build-palettes.mjs --check
node docs/design-toolbox/themes/check-themes.mjs --write
node docs/design-toolbox/themes/check-themes.mjs
node --test docs/design-toolbox/themes/theme-pass7.test.mjs
node --test --test-name-pattern="unused appearance|variants confound|layers collapse|solid header or dark chrome" tests/theme-packs.test.mjs
~~~

The checker discovers immediate child folders with either theme file; half-missing packs fail, and gallery/retired are excluded because neither contains immediate theme files. To validate an archived or external pack, pass its folder explicitly. To add an active pack, add source/presentation metadata, a picker option and matching packNames entry, then regenerate the embedded harmony data. The iframe comparisons use the same picker order and preserve offline file viewing.

## Preview and verification limits

Board keeps the frozen 20-item release-preparation map with eight types, three task frames, working/waiting/stalled sessions, checks and open questions. Middle shows full nodes and named links; Far uses compact chips that open full details. Task relations and selected-session links retain their previous geometry and behaviour. The work queue and docked chat use the same theme. Components shows equal map/queue samples and the larger answer/composer workspace. Drafts and answers survive theme changes. All of this remains a **static palette prototype**, not live work execution.

Pass 7 verification is on Windows with Node 24.22.2, base revision `d5685a7`. **Passed:** `check-themes.mjs` (2,100 contrast pairs across seven 521-token packs), `build-palettes.mjs --check`, and seven tests in [theme-pass7.test.mjs](theme-pass7.test.mjs). The tests assemble all fourteen light/dark profiles, preserve the four exact source anchors per active pack, validate all seven archived packs read-only, run the preview's existing geometry check without a DOM, and check the final CSS background declarations. In-memory defect seeds reject duplicate headers, repeated type angles, state collisions, collapsed adjacent layers, reversed light neutrals, flat dark headers, grey navy chrome and dull attention fills; untouched inputs recover. This proves arithmetic/static detection, not rendered appearance.

**Passed:** four existing read-only regression tests selected with the command above: archived variants, legacy defect detection, fourteen profiles, and header/chrome contrast failures. The new suite also passes the existing budget helper when run from this directory: `node ../../../skills/jig-verify/test-budget.mjs -- node --test theme-pass7.test.mjs`, about 1.3 seconds against 10 seconds. No budget configuration was changed.

**Failed — coordinator follow-up outside this task's allowed folder:** two existing tests in `tests/theme-packs.test.mjs` encode superseded pass-6 expectations. Line 74 expects attention background to be `state-attention` with white text; pass 7 uses `state-attention-surface` with checked dark ink. Line 317 expects white-board chrome to equal white panel; pass 7 requires a visible chrome step (`#f3f3f3`). Both were run and failed at those assertions. Update them to the new roles/adjacent-step contract before running the full suite. They were left untouched to respect the themes-only scope. The root-level budget inventory also fails on existing missing risk/live tags and unsupported declarations across unrelated tests; the scoped new suite passes. No full repository suite is claimed.

**Not tested — requested limit:** no browser was launched; rendering, clipping, motion, keyboard/screen-reader use, live zoom, long-session comfort and the person's visual judgement remain pending. The six-item table above lists the visual checks. **macOS not tested.** Review was sequential, without an independent agent. No provider sessions were launched. Skill telemetry/evidence files outside this directory were not written because of the folder-only instruction. All work remains uncommitted.

Changed files are confined to this directory: README.md, palette.mjs, build-palettes.mjs, check-themes.mjs, contrast.csv, preview.html, new theme-pass7.test.mjs, and theme.css/theme.json in each of the seven active packs. Geometry, typography and motion token values remain unchanged. Nothing in gallery/ or retired/ was edited, and no repository test or skill file was edited.

## Shared typography dependency

Active packs import `../../typography/type.css` and alias their interface/code fonts, text sizes, weights and leading to it. The bundled preview resolves this locally, including inside component comparison frames. When copying packs into a project, copy the shared type stylesheet too and preserve or rewrite the relative import as part of the build. The pack folder now depends on that shared asset; copying only `theme.css` loses its type definitions. Colours remain pack-specific. See the [toolbox typography notes](../README.md#toolbox-pages-and-typography-8-november-2026) for the scale and visible changes.
