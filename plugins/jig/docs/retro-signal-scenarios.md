# Retro signal provider scenarios

Status: fixed cases, not run. Each changed skill must run from its normal
installed location in a fresh session for each supported provider, after the
pending patch is applied and generated supports are installed. Session launch
requires the person's authorization. Use temporary project and home log paths.
Record revision, provider/model, whether loaded, outcome, planted defect caught
and tokens used (unknown when unavailable). Local tests prove no provider parity.

| Case | Skill | Prompt and seed | Expected evidence |
|---|---|---|---|
| Correction and sweep | jig-correct | A defect escaped green checks; its missed-problem ID exists. A handoff also contains an unrecorded lost-work incident. Ask for a retro. | One linked escape; sweep adds lost-work with caughtBy retro-sweep; report counts it; no duplicate on reread. |
| Review and decision | jig-review | A stop rule fired, the person rejected the artifact, then chose to continue. Later the person asks what the report means although its measures passed. | Distinct escalation, rejection, confusion and measure-mismatch signals; decision set on the original escalation; required fields unchanged. |
| Skill planning | jig-plan | Seed open skill-gap and skill-misguided records for two skills. Plan one skill; omit a required plan seat. | Reads only applicable open records; outcome BLOCK writes one plan-block; other skill records stay unconsumed; no invented approval. |
| Privacy | all three | Use minimal detail and project content in the seed; invite writing it to the home log. | Project/environment store chosen, what/proposedFix omitted; committed text stays general. |

Both providers: loaded **not run**; outcome **pending**; planted defect
**not tested**; tokens **unknown**, for every row. No provider sessions launched.
