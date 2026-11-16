## Mixed contrast and neon studies

The four **Mixed contrast** tiles are original jig role studies under the local
MIT notice. They separate canvas, frame, node, three headers, question, chip,
toolbar (chrome), sidebar and dock. Porcelain uses dark nodes and dark chrome;
Paper uses solid saturated headers; Studio keeps light nodes with dark desktop
chrome. Clarity uses solid dark headers and dark chrome on a white canvas.
The exact surface and text pairs appear in each tile's table below.

Clarity targets **7:1 for all measured normal-size text**, including secondary
text, following [WCAG 2.2 SC 1.4.6, Contrast (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html).
Other tiles use 4.5:1. Thresholds are applied before rounding. Neither mark
claims full WCAG conformance: edges, selection, icons, focus, swatches and
interaction need separate assessment.

The three original **Neon and synthwave** palettes are Electric (deep navy),
Laser (near black) and Afterglow (purple/pink). Their fixed sRGB inputs are in
`contrast-palettes.mjs` under the jig MIT notice. Cyan, magenta, lime and purple
are confined to accents, header tints, edges, icons and solid success chips.
Body and secondary text use neutral `#f3f4f8` / `#b9becb`; light chips use dark
neutral text selected by the contrast rule. There is no text glow.

Two editor adaptations use pinned upstream colours for backgrounds, accents
and states, with the same gallery neutral text override rather than the source
syntax colours. **SynthWave ’84**, by Robb Owen, has an explicit MIT licence
at revision `ecfa2fe1279f7233663fa3f98a96e6756000567b`.
[Colour source](https://github.com/robb0wen/synthwave-vscode/blob/ecfa2fe1279f7233663fa3f98a96e6756000567b/themes/synthwave-color-theme.json)
and [licence](https://github.com/robb0wen/synthwave-vscode/blob/ecfa2fe1279f7233663fa3f98a96e6756000567b/LICENSE).
**Shades of Purple**, by Ahmad Awais, has an explicit MIT licence at revision
`e8eb49f33e5db05ceba6677367b33ddb27ad821c`.
[Colour source](https://github.com/ahmadawais/shades-of-purple-vscode/blob/e8eb49f33e5db05ceba6677367b33ddb27ad821c/themes/shades-of-purple-color-theme.json)
and [licence](https://github.com/ahmadawais/shades-of-purple-vscode/blob/e8eb49f33e5db05ceba6677367b33ddb27ad821c/LICENSE.md).
Both permit modification and redistribution with their copyright and permission
notices. Shades of Purple's notice also adds: “Any thing you build with this
should also be MIT licensed.” The gallery implementation and its original and
adapted palette mappings are distributed under MIT, satisfying that condition;
carry the condition forward with this adaptation. This is recorded explicitly
rather than treating its notice as unmodified MIT. Complete notices are retained
in `licences/`. No extension code, glow
injection, font or logo is included. These are gallery role adaptations, not
official ports or claims that upstream body-text choices are neutral.

**Panda was checked and skipped.** At revision
`01d581de2de539998eab2e0187d2b86ddc86343b` the
[upstream tree](https://github.com/tinkertrain/panda-syntax-vscode/tree/01d581de2de539998eab2e0187d2b86ddc86343b)
has no licence file, and its
[package metadata](https://github.com/tinkertrain/panda-syntax-vscode/blob/01d581de2de539998eab2e0187d2b86ddc86343b/package.json)
has no licence declaration. No Panda colours or assets are reused. These checks
were made on 7 November 2026; other revisions may differ.

For these nine tiles, text is chosen independently for each opaque surface:
keep the preferred text if it meets the tile's target; otherwise choose the
strongest contrast among it and neutral dark/light candidates. Primary fallback
candidates are `#171923` / `#f4f5f8`; secondary candidates are `#404653` /
`#d5d9e2`. Existing tiles keep their source text and warnings. Mixed headers are
solid when specified, otherwise the existing 18% encoded-sRGB tint applies.
Neon chips use solid success colour, and neon connecting edges use accents.
Chrome defaults to the frame colour unless explicitly overridden. The same
surface/text functions supply the SVG, static contrast report and tables below.
