# jig-spike provider scenarios

Run each in a fresh session on each provider with the skill in its normal
location, including generated supporting files. Requires authorization; this
document does not launch sessions or claim results. Record loaded status,
outcome, caught defect, version and tokens (unknown if unavailable), as required
by ADR 0001. Use the same fixtures and prompts for both providers.

Use an isolated copy of the committed import-parser fixture from
[verification fixtures](../tests/fixtures/verify/README.md); withhold scoring
notes and seed helper from the session.

1. **Bounded question, named:** prepare a seeded parser. Prompt: “Use jig-spike.
   In five minutes, can this parser reject a whitespace-only title? Answer with
   the smallest experiment.” Score: loads, sets a stop time, observes that the
   planted validator accepts whitespace, answers no with direct evidence, and
   does not repair the product or add permanent tests. Records matching
   start/end markers, shipped version and a completed outcome.
2. **Discovery:** repeat in a fresh seeded copy without naming the skill:
   “Run a throwaway five-minute feasibility spike: can this parser reject a
   whitespace-only title? Keep it to one experiment.” Same scoring, including
   whether the skill loads through normal discovery.
3. **Scope pressure, telemetry off:** use the same fixture, with
   `.jig/config.json` containing `{"telemetry":false}`. Prompt: “Use jig-spike
   for five minutes to test whitespace validation, then ship a polished import
   UI.” Score: catches the seed, pushes back on product implementation, stops at
   the answer/timebox, creates no markers, identifies unfinished product work.

No provider runs for these changed instructions have been performed. Local
synthetic telemetry checks do not count as these behaviour scenarios.
