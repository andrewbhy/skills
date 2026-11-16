# Design brief for a mockup job

Use the project's existing brief and configuration; fill gaps from evidence
before asking again. This is a round brief, not a new product or token authority.
Adapted from Impeccable's PRODUCT.md and DESIGN.md distinctions; see
[attribution](README.md#borrowed-practices-and-attribution).

For jig's toolbox itself, link the existing [page tokens](jig-pages.css),
[type roles](typography/type.css), [theme packs and their manifests](themes/README.md)
and [motion tokens](motion-lab/tokens.css). A consuming project links its own
authoritative equivalents. Do not paste these values into the brief or create
a competing DESIGN.md token catalogue.

Every mockup round identifies itself as a mockup in its title or Intent, and
names `grid/tokens.css`, `grid/primitives.css`, its project `grid.config.json`
and commands for `ui-tokens-check.mjs`, `style-lint.mjs` and
`visual-check.mjs` (alignment, clip and 320 px reflow). Name pending browser
checks even when the builder cannot run them. Toolbox pages use
`page-shell.mjs` and run `check-page-shell.mjs`; see [the shared shell](README.md#shared-page-shell).

```markdown
# Mockup <round and stage> — brief v1

## Confirmed product facts
| Fact / constraint | Evidence path or decision | Confirmed by / date |
|---|---|---|
| Users, job, purpose and success | <existing PRODUCT.md or equivalent> | ... |
| Capabilities, terminology, accessibility and brand commitments | ... | ... |

## Open decisions
| Question | Evidence / current hypothesis (not confirmed) | Owner / blocks |
|---|---|---|
| ... | ... | ... |

## Desktop, input and density context
- Surface: desktop application / desktop web / other, with evidence.
- Inputs: mouse, keyboard, trackpad, touch; primary and supported alternatives.
- Real and minimum viewport, pane widths, zoom conditions: <project config link>.
- Density: named preset, row/control roles, representative data volume.
- Shell constraints: docking, scroll ownership, stable chrome, reading/typing anchor.

## Normative design sources (links, never copied token values)
- Semantic tokens: <project token file>; chosen pack and manifest: <paths>.
- Type roles (heading/body/control/metadata), shape and spacing: <source links>.
- Surface hierarchy, selection, keyboard focus, state and motion roles: <links>.
- Each binding constraint: source, confirmation status, affected ledger IDs.

## Explanatory design notes
- Why those roles support the task; <existing DESIGN.md or equivalent>.
- Prose explains application of tokens; conflicts go back to the authoritative
  source. It cannot silently redefine values. Do not create a second token list.

## This job
- Stage, goal, person's moment, first thing noticed, sample scenario, five
  components or coverage batch, deadline and shared harness revision/commands.
- Scope / what must remain intact / open decisions blocking this stage.
- Purpose ledger, layout rules, glossary, shape and motion language: <links>.
- References and anti-references: <image IDs and reactions, below>.
- Dated Keep / Fix / Strong objection, baseline and gate-attempt count: <links>.
- Applicable banned defaults and documented exceptions: <IDs and reasons>.
- Tweak-bar options and initial approved choice IDs: <config link>.
- Output, measurements, contact sheet, review matrix and remaining gaps: <paths>.
```

Omit irrelevant fields. Never invent product facts, customers, proof, data limits
or personal approval. Missing evidence stays open; pause only work that depends
on it. Do not start another interview when the brief already answers the question.

## Taste library and banned defaults

The taste library is a project-configured reference source: curated images plus
the person's **Love / Like / Not for me** reactions. For each image record a
stable ID, provenance/licence, source, reaction/date, their reason in their words
(or “reason not supplied”), the relevant crop/component, and what to transfer or
avoid. Link actual images in the stage brief and contact sheet; labels alone do
not establish fidelity. A reaction is evidence of taste, not approval to copy an
entire product. Missing reactions remain unknown. Keep the library's local path
in project configuration, never in the reusable skill.

Banned defaults are starting guardrails, with brief-scoped exceptions:

- Cards inside cards that add framing without a second useful grouping.
- Repeated rounded icon tiles stacked above headings without a task purpose.
- Decorative glows, radial halos and spotlights unrelated to state or identity.
- Identical feature-card grids, hero metrics or oversized marketing headers in
  dense application chrome.
- Default kit styling, arbitrary pill shapes, gradients, glass or ambient motion
  substituted for a project's type, shape, density and surface language.
- Decorative glyphs, placeholder metrics, redundant labels and invented claims.

These guardrails do not ban an approved palette, purple, system fonts, a selected
row stripe, visible keyboard focus or an intentional theme treatment. Record
exceptions with target, rule, reason and decision evidence; a Neon synth pack
may intentionally use glow. The [design inspector](design-inspector.md) warns
about the first three families; the rest require reference-based review.

## Standard mockup tweak bar

Provide labelled controls for **theme, accent, radius, density, font, surface
contrast and header**, plus **Copy JSON**. Use only approved options from the
project configuration, mapped to existing token/recipe references. If there is
only one approved option, show it disabled with the reason; do not invent a
font, theme or arbitrary numeric overrides to fill the bar.

Copy JSON exports a versioned record of the current choices as stable IDs,
including direction and fixture mode, so feedback can reproduce the exact look.
For example (IDs are placeholders, not shipped themes or new tokens):

```json
{"schemaVersion":1,"direction":"chosen-direction","fixture":"Demo","theme":"approved-pack","accent":"approved-accent","radius":"approved-radius","density":"approved-density","font":"approved-font","surfaceContrast":"approved-contrast","header":"approved-header"}
```

Keep controls keyboard accessible and preserve draft, focus, scroll and selection
when choices change. Copy reports success only after it succeeds; if clipboard
access is unavailable on a local file, expose selectable JSON for manual copying.
The bar is mock tooling with its own ledger entry, outside the product surface.
It appears from the look stage; choices remain inside that stage's scope (no
motion in stage 1). A tweak is a comparison, not approval or a permanent design
decision. Carry chosen JSON and reactions into the next job.
