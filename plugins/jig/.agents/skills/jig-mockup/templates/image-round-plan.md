# Plan: <image round>

## Intent
Kind: ui
Step: <explore / refine / style pick / set render>; goal and audience moment:
<goal>. Person's exact words: <quotes with source/date>. Taste references:
<IDs and traits, including dislikes>; open choices separate from confirmed facts.

Explore briefs give goals, audience, content model and quoted words only: no
layout, named directions or copied base folder. Generate at least twelve
original directions, three wild cards, in separate audience-moment, metaphor,
material and era runs. The coordinator's ideas are one labelled set at most.
For convergence, name defining bases and state: every other note is a quality
bar within that direction. Do not fill explore's brief with convergence rows.

## Acceptance
<Step deliverables and decision asked>. Images only until the person's style
pick and set verdict; no HTML in this job. Originality is explore's only gate;
record greyscale structural comparison. Convergence adds base fidelity review.

## Requirements
### Requirement: <one observable outcome>
#### Scenario: <named case>
- **WHEN** <trigger>
- **THEN** <observable image/record and reviewer judgement>

## Scope
Output folder: <external scratch folder>. Plan is read-only. The job owns:
<exact files>; read-only inputs: <paths>. Use Node for JSON, never PowerShell
ConvertTo-Json. Keep the whole folder until the person's pick/verdict.

| Repeat plan-check row | Decision before launch |
|---|---|
| Provenance and gallery | Every image, including redo/withheld outputs: prompt, provenance, per-image note, gallery entry; checker command and report destination. |
| Set composition | Screen kinds, counts, picked style/base per screen, unendorsed/new work labels; for style pick use the same screen/content. Layout and touch picks recorded independently, applied one at a time. |
| Shared content | One canonical content block written first and included in every multi-screen prompt; IDs, states, counts, timestamps and direction-specific visible load; sparse views open detail on focus. |
| Notes contents | Per-image base, single change, base/set comparison, known defects, pick status; Keep/Fix/Strong objection IDs and mid-run notes/recheck. |
| Generator inputs | Exact allowed input images, per-image bases, actual edit inputs; distinguish inspection-only references never sent to generator; explore inputs explicitly empty. Check inherited colour keys/assets against direction. |
| Originality including series names | Project-approved banned brand/product/artist/series terms and aliases, process words and justified own-name exception; arrays in image-round.json. |
| Timebox with redo time | Start/deadline, generation/comparison time per item, one redo allowance and slack; explore ~60, refine ~45, style pick ~45, set ~60-95 minutes. |
| Stop after a failed redo | Mark item failed; two failures of the same gate stop for re-plan; attempt counts survive fix-job renames. |
| File ownership | Exact writable files; plan and source bases read-only; no overwrites of another job's files. |
| Keep folder until the pick | Owner and retention/revisit point; no cleanup before the person's verdict is recorded. |

## Out of scope
<HTML, interaction proof, motion, pixel fidelity; additional exclusions>.

## Contracts
Use the image-round.json, gallery and provenance contracts in
[the image guide](../image-rounds.md#files-and-deterministic-checker).
Resolve this link from the shipped template; replace it with the actual skill
link when copying the plan into a run. Use round-relative record paths.

Refine/set render edit picked bases, one change per image; no text-only refines.
If notes arrive early, stop and relaunch; otherwise recheck every result before
presentation. Withhold stated-dislike violations from the person-facing gallery.
Record actual image size: layout judgement only; exact header/type scale is
fixed with HTML tokens after the pick, not an endless image redo loop.

## Slices
1. <Inputs, shared block and prompts; minutes>.
2. <Generation plus comparison and one redo per item; minutes>.
3. <Notes, provenance, gallery, checker and presentation inventory; minutes>.
Total: <hard deadline including slack>. Then coordinator opens every image beside
its base; convergence fresh review asks "is this the same direction as the base?"
first; person picks. No reviewer pick is relayed unseen.

## Verification plan
| Risk | Check | Layer | Expected time | Acceptor |
|---|---|---|---|---|
| Missing files, unlisted outputs, disallowed inputs or banned prompt terms | node <skill-folder>/scripts/image-round-check.mjs <round-folder> | static | <budget> | fresh QA seat |
| Recolours instead of directions | Greyscale edges/layout/occupied-space comparison; explain structural differences | review | <budget> | coordinator; person's explore pick |
| Drift at convergence | Each output beside picked base: same direction first, checklist second; inherited assets fit | review | <budget> | fresh seat |
| Inconsistent set content/style | Shared IDs/states/counts/timestamps plus header/type/icon/accent comparison; defects named | review | <budget> | fresh seat |
| Mid-run notes lost | Note cutoff, stop/relaunch or all-image recheck recorded | review | <budget> | coordinator |
| Unpickable presentation | Absolute clickable image links grouped by screen kind; stated-dislike violations withheld | review | <budget> | coordinator |
| Taste | <step-specific pick; style pick and set verdict before HTML> | person | their time | person |

## Success measures
| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |
|---|---|---|---|---|---|---|---|
| G1 | <goal outcome> | <metric> | <tier> | <known baseline> | <target> | <checkpoint> | <source> |

## Missed problems
<Relevant incidents and named executable checks/review assertions; exclusions>.

## Plan-check outcome
<Seat, date, findings and fixes; run brief-check and record result before launch>.
