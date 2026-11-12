# Goal glossary format

Pass glossary paths explicitly; jig never reads or writes a home directory by
default. A project glossary overrides the same word in a personal glossary,
including a draft overriding a confirmed entry. Missing supplied files fail.
The [empty example](glossary.example.md) ships without personal vocabulary.

Use the example's seven columns in order, one physical line per entry. Words
are case insensitive and unique per file. Meaning is a short explanation.
Measures is a JSON array of one to three objects with `metric`, numeric `tier`
(1 or 2), and `source`. No literal pipes or newlines in cells. Targets and
baselines belong in the plan, not a universal aesthetic threshold.

Status is `draft` or `confirmed`. Confirmed on is an ISO calendar date for a
confirmed entry, `-` for a draft. Last verdict is `-` or
`met on YYYY-MM-DD; measures met` (either result may be `not met`). Evidence
is `-` before a verdict, then a Markdown link to a file, never inline evidence.
A verdict does not erase confirmation or automatically accept work. A failed
translation remains visible at retro; revise and reconfirm its meaning.

`node scripts/goal-translate.mjs --plan plan.md --glossary vocabulary.md`
prints eight-column Success measures rows followed by one confirmation line
per subjective goal. Add `--project-glossary project.md` for overrides or
`--catalogue catalogue.md` to select another catalogue. No model calls occur.
Unknown terms use catalogue lookup first; without a fitting template they
remain draft with no invented proxy. The planner may make at most one cheap
model call per new word outside this helper, then seek confirmation once.

Generated proxy Source cells carry `glossary:word` or `draft:word` markers.
Keep these intact. Run brief-check with the same glossary arguments: only
confirmed glossary markers count as measured. A draft marker always stays
unmeasured until explicitly changed after confirmation. Existing and new rows
together must fit the four-row plan limit; merge goals when refused.

Record both results with `node scripts/goal-translate.mjs verdict --glossary
vocabulary.md --word word --measures met --verdict not-met --date YYYY-MM-DD
--evidence evidence.md`. Use `retro --glossary vocabulary.md` to list failed
translations. The person's verdict wins even when every measure passes.
