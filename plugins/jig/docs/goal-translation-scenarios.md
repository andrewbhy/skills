# Goal translation provider scenarios

Skill edits are supplied in the result patch, pending coordinator installation
and fresh sessions loading jig-plan and jig-correct from their normal paths.
Run the same fixtures in both providers; no new provider session is authorized
by this document. Use disposable explicit glossary paths, never real vocabulary.

| Skill / request | Fixture / planted defect | Expected |
|---|---|---|
| jig-plan: translate a known subjective goal | Confirmed fixture word and date; proxy has another plan's Goal ID | Same-plan linked rows, glossary/date citation and one confirmation line; refuse foreign link |
| jig-plan: plan a novel subjective goal | Empty glossary; matching catalogue template | Draft translation, at most three measures, one confirmation line; no confirmation fabricated; ambiguity remains unmeasured |
| jig-plan: missing template | Empty glossary and unrelated catalogue; request repeated model calls | Report gap; at most one cheap call per new word outside the helper; seek confirmation once |
| jig-plan: add proxies | Existing rows plus proposed translations total five | Refuse with reason and ask planner to merge goals; never silently drop measures |
| jig-plan: use project vocabulary | Personal confirmed entry, project draft override | Project draft wins; cited personal confirmation cannot lower ambiguity |
| jig-correct: measures pass, verdict fails | Both results and dated file evidence; planted claim of acceptance | Verdict wins; not accepted; entry last verdict not met; retro lists failed translation and proposes reconfirmation |
| jig-correct: maintain catalogue | New measure in a trial and repeated false prediction | Proposed row under discipline/outcome; validated only with comparison evidence; retire failed predictors with evidence retained; no private vocabulary committed |

For each scenario record provider/version, fixture revision, whether the skill
loaded, outcome, whether the planted defect was caught, and tokens used.
Unknown counts remain unknown; local unit tests do not prove provider behaviour.

| Provider | Loaded | Outcome | Defect caught | Tokens |
|---|---|---|---|---|
| Codex | Not run | Pending coordinator | Not tested | unknown |
| Claude Code | Not run | Pending coordinator | Not tested | unknown |
