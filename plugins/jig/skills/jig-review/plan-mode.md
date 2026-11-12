# jig-review plan mode (draft)

Use before a build with jig-plan's format. This supplements diff mode; there
is no commit diff or built-in correctness review to run yet.

1. Read the request, plan, rules, ADRs and history. Record the plan body hash
   (excluding outcome), jig version, signals and reasons. Run
   `node "<skill-folder>/plan-seats.mjs" '<JSON signal object>'` (one JSON argument;
   quote for the caller's shell). Boolean signals: ui, behaviour, module,
   contract, security, data, dependency. Keep every fixed selected seat and its
   checklist; judgement may add seats. Record skipped seats and reasons.
   Set signals from what the plan changes: a plan that only reallocates checks
   for unchanged UI sets ui false. A recheck after edits reruns only the seats
   whose findings the edits address.
   Testing is the QA seat in planning mode.
   Read [measures.md](measures.md): testing uses Testing, architecture uses
   Architecture and Performance, product uses Product, design uses Design,
   accessibility and security use their named disciplines; cost uses Engineering
   loop and Agent work, history uses Testing and Agent work.
2. Give each selected seat the same plan body, rules, relevant history and its
   fixed three-question checklist, in already authorized independent fresh cheap
   contexts, in parallel. Each returns seat, body hash, evidence answering all
   questions, BLOCK or OK, gaps and edits in about 100 words. Total allowance:
   under three minutes. Expired allowance, unavailable context, missing answer
   or stale hash means BLOCK. Same-session checks are not independent. Do not
   launch provider sessions without authorization.
   Within its third answer each seat proposes tier 1 or 2 measures for its
   discipline from the library, with baseline, target, collection checkpoint
   and source. Product proposes a measurable proxy for every tier 3 goal using
   its Goal ID. No credible proxy means an explicit gap, never invented research.
3. The coordinator resolves edits and reruns affected seats after material
   changes. Under Plan-check outcome record selected/skipped reasons, per-seat
   status, body hash, elapsed time and tokens (unknown stays unknown). Finish
   with `OK: <summary>` only when all required seats are OK; otherwise
   `BLOCK: <issues and pending seats>`. Preserve earlier findings as prose,
   without obsolete literal BLOCK outcome lines. Cost checks expensive layers
   and budgets; history checks incident-linked assertions and open repeats.
   Retain the strongest useful proposals in at most four Success measures rows.
   Write the outcome line first, then run brief-check once and record its
   `ambiguity: N of M goals unmeasured` in the outcome, or explain
   legacy/exempt/malformed tables when no score is available. Running it while
   the outcome is BLOCK or PENDING only refuses and logs a broken-brief. The
   soft warning informs the review; it does not turn into a structural refusal.
4. Run brief-check on the final plan/brief. Structure checks do not establish
   seat identity, truth, review quality or authority. Passing never approves a
   build, merge or presentation. Builder and coordinator cannot self-accept.

For UI plans design checks references, mockup gates, content extremes and motion
without launching browsers. Fresh-provider skill scenarios remain separate;
pending scenarios leave the skill draft even if a plan's review is OK.
