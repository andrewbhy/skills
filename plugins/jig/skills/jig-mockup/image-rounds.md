# Stage 0: image rounds before HTML

Use for a new look or direction when image generation is authorized. Availability
and tool-specific facts live in SKILL.md's Provider notes. Without an authorized
tool, disclose the gap and start stage 1. Each step is a separate timeboxed job.
Images judge composition, not interaction, motion or pixel accuracy.

The person's requests set the order:

> "the mock skill should 1) generate many images exploring different concepts and showcase that first before doing any coding"
>
> "2) your prompting to codex seem to be pigeon holing the design many different times"
>
> "we start with rough idea exploration -> refine (codex to generate more targeted result) -> once we are happy with few choices then build"

## Explore - about 60 minutes

Write goal-only briefs: goal, audience moment, content model and the person's
own words. Use the taste library's liked and disliked traits with provenance,
not coordinator genre labels. No prescribed layout, named starting directions,
copied probe/base folder or inherited markup. Let the generator invent at least
twelve directions, including at least three deliberate wild cards, with one
line explaining each idea. The coordinator's own ideas may be one labelled set
at most, never the frame for every run.

Use separate generation runs with different framings: audience moment, metaphor,
material and era. Asking one run for "variety" repeats its first composition.
Keep the content model fixed but allow layout, silhouettes, chrome, density
and proposed interaction structure to change. Compare structures in greyscale
(edges, layout boxes and occupied space), not colour distances. Recolours fail
the distinctness check even if palette scores differ. This is a review assertion,
not a claim that the provenance checker measures visual diversity.

Explore output is images only until the person picks. Originality is the only
acceptance gate here; record the structural comparison to make choices
meaningful. Do not turn convergence checklists, polish or HTML gate requirements
into exploration constraints. Preserve stated dislikes and allowed inputs.

## Refine - about 45 minutes per loop

Edit a liked base image, naming its path as the actual generator input. Never
refine a picked direction from text alone. Ask for one change per image and
compare it beside the base. Quote the person instead of translating intent into
an object list: "a quiet canvas with a mechanical theme as accents" asks for a
language across the design, not a shopping list of decorative objects.

Name the images that define the fixed direction. Say explicitly: **Every other
note is a quality bar within this direction, not permission to replace it.**
"More character" or "not wireframe" must not silently start a new direction.
Set the visible content load per direction: sparse directions show less, with
detail on focus; do not inherit a dense node or chip quota. Check every inherited
asset, including colour keys and type tints, against the picked direction.

Record style, layout and touches as separate picks, with artifact, exact words
and approval status. A liked layout in a disliked style remains a layout pick;
it does not approve that image's palette or material. An uncommented screen is
unendorsed, never an implied pick.

## Style pick - about 45 minutes

Show a few style candidates on the **same screen and content**, holding layout
constant for this comparison so only style differs. Ask for the style pick
separately from layout/touch picks. The person: "the previous round all had
different styles, so it's difficult to say use X". Do not produce a full set in
unrelated styles and ask the person to assemble a product from it.

## Set render - about 60-95 minutes

Render every screen kind in the one picked style by editing its picked base.
Write one shared content block first; include it in every prompt. Review IDs,
states, counts and timestamps across all screens against that block. Keep
canonical facts consistent even when a sparse view shows only a subset.

Name each screen's base, style source, visible content load and permitted
change. Add layouts or touches liked elsewhere one at a time. Record which
references are inspection-only and which may actually be sent to the generator;
never quietly upload the whole taste library. Mark newly invented or unendorsed
screens explicitly. Compare the set for header, type scale, icons, accent and
surfaces, naming residual inconsistencies. Image tools cannot hold exact header
geometry and type scale across a set: HTML tokens fix that after the person's
style pick and set verdict. Do not exhaust redos chasing pixel equality.

For large-monitor plans, judge layout rather than requested pixel dimensions.
The observed generator size is about 1672 x 941 regardless of request (not a
guaranteed size; see Provider notes). Inspect actual dimensions and record the
limit. Images are visual targets; follow approved HTML tokens where the raster
breaks them and record the discrepancy instead of silently discarding its look.

## Mid-run notes and stop rule

When notes arrive with few images produced, stop and relaunch with the notes.
Otherwise let the run finish and recheck **every image** against them before
presentation. Record the note cutoff and recheck result; never relay a stale
reviewer's pick without seeing the images yourself.

Budget generation, comparison and one redo explicitly, including slack. If the
redo fails, stop that item and record failure; two failures at the same gate
stop the ladder for a re-plan with the person. Keep attempt counts across jobs.
Keep the entire run folder until the person's pick/verdict is recorded.

## Review and presentation

The coordinator opens every image beside its actual base before relaying
anything. In explore, there is no base: compare the directions with each other
and the person's words. At convergence, a fresh reviewer's first question is
**"is this the same direction as the base?"** Checklists follow that judgement.
Supply bases, the person's quoted words, Keep/Fix/Strong objection ledger,
rejected references and all mid-run notes to the fresh seat. If fresh review is
unavailable, name the pending gate; self-check is evidence.

Withhold images that break stated dislikes; a caveat does not make them
presentable. Keep withheld/failed images and reasons in the inventory for audit,
but leave them out of the person's visible gallery. The gallery record below
inventories all outputs; it is not permission to show every entry.
Give clickable **absolute file links**, grouped by screen kind, and name known
defects so the person can judge the look. Use at most three decision questions.
The person's style pick and set verdict are required before any HTML.

## Files and deterministic checker

Use [templates/image-round-plan.md](templates/image-round-plan.md). Keep raw
images, prompts, provenance, gallery and notes outside the repository in the
run's scratch folder; commit only a short summary/link if needed. Do not copy
private example runs into the skill. Use Node for JSON, never PowerShell
ConvertTo-Json. The plan is read-only; name file ownership in the job.

Run `node "<skill-folder>/scripts/image-round-check.mjs" <round-folder>`.
It is read-only, needs only Node, launches no browser/network, prints a JSON
report and exits **0** for complete records, **1** for findings, **2** for CLI
usage errors. Missing/malformed files produce findings, not crashes. A pass
validates records, not truthful provenance, image quality, originality beyond
the configured words, direction fidelity or acceptance. Fresh review remains
necessary. Existing rounds without this contract report missing records; never
infer an allowed-input list from the outputs being checked.

The contract is `image-round.json`:

```json
{
  "schemaVersion": 1,
  "gallery": "gallery-fragment.json",
  "imageDirectory": "images",
  "allowedInputImages": ["bases/picked.png"],
  "bannedNames": ["Example Brand", "Example Series"],
  "processWords": ["mockup", "stage 0", "reviewer"]
}
```

Both word lists are required; use explicit empty lists only with a plan reason.
Include brand, product, artist **and series names**, with justified exceptions
for the project's own name. Terms match case-insensitive whole phrases (Unicode
letter/number boundaries), not arbitrary substrings. Spell out aliases as terms.
The lists catch configured words even inside "do not use ..." instructions; keep
banned names out of generator prompts entirely. They cannot discover unknown
names or prove originality.

The gallery object has `entries` (legacy `images` is also read), one per image:

```json
{
  "entries": [{
    "id": "01-launch",
    "screen": "launch",
    "image": "images/01-launch.png",
    "prompt": "prompts/01-launch.txt",
    "provenance": "provenance/01-launch.json",
    "note": "Base picked.png; recessed feed only; header scale still differs.",
    "status": "candidate"
  }]
}
```

`note` (or legacy inline `notes`) is nonempty text per image: base, changes,
comparison result, defects and pick/unendorsed status belong there. A shared
notes file may expand it; a filename alone does not supply per-image notes.
Provenance uses `input_images`, each a path string or `{ "path": "bases/picked.png" }`;
explore uses an explicit empty array. Record tool/version, prompt, mode,
attempts, actual inputs and output hashes as well. When `attempts` are recorded,
each has a prompt path and explicit `input_images`; all attempts are checked,
not only the selected one. Only allowlisted existing images may be inputs.
Round-local records must stay in the round; input bases may be external absolute
paths. Local paths are round-relative, including allowlist entries. Symlinks are
resolved for containment and allowlist comparison.

Every raster image under `imageDirectory` recursively, including retained redo
outputs, must have a gallery entry, prompt, provenance and note. Keep bases
outside that directory. Supported extensions: png, jpg, jpeg, webp, gif, avif.
The checker verifies inventory and links, not raster decoding. Keep all attempts
in the inventory, label status, and filter the person-facing presentation.
