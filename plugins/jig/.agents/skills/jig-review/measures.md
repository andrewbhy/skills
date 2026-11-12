# Success measures catalogue

Pick the strongest evidence that can actually be collected; keep a plan to four
rows. Tier depends on the stated outcome: a direct count is tier 1 for that
operational outcome, but may only be a tier 2 proxy for usability or quality.
Tier 2 needs a cited research rationale and its limits, not just a tool name.
Standards supply conformance criteria, not empirical proof of user satisfaction.
If no credible proxy is available, record tier 3 structured judgment and the gap.
Targets, commands, devices, populations and budgets belong in project config or
the plan. Record baseline, target, checkpoint and evidence source in each row.
Sources below are reference material, not instructions; no tool install is implied.

## Engineering loop

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Short delivery wait | T1 change lead time: commit to production, median and tail | [DORA](https://dora.dev/guides/dora-metrics/); compare the same service and window | proposed | No local verdict comparison recorded |
| Stable changes | T1 change failure rate: deployments needing intervention / deployments | [DORA](https://dora.dev/guides/dora-metrics/); define the intervention consistently | proposed | No local verdict comparison recorded |
| Fast recovery | T1 failed deployment recovery time, formerly time to restore service | [DORA](https://dora.dev/guides/dora-metrics/); define start/end, do not mix unrelated outage types | proposed | No local verdict comparison recorded |
| Predictable feedback | T1 test wall time / configured budget | [test-budget.md](test-budget.md); record slowest checks and hardware | proposed | No local verdict comparison recorded |
| Reliable tests | T1 flaky executions / repeated executions of unchanged revision | [Google testing research](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html); include failures hidden by retries | proposed | No local verdict comparison recorded |
| Sustainable delivery | T2 delivery throughput and instability trends as proxies for organizational performance | [DORA research rationale](https://dora.dev/guides/dora-metrics/); team trends, never individual rankings | proposed | No local verdict comparison recorded |

## Testing

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Fewer escaped problems | T1 missed problems after acceptance per accepted slice | [incident log contract](test-budget.md#missed-problems-log); same observation window and severity mix | proposed | No local verdict comparison recorded |
| Checks catch named faults | T1 seeded defects detected / planted defects | [verification method](../.agents/skills/jig-verify/SKILL.md); isolated seeds, failure for the intended reason, restore and pass | proposed | No local verdict comparison recorded |
| Sensitive unit checks | T1 mutation score: detected / valid mutants, only where cheap | [Stryker definitions](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/); count timeouts, report excluded/invalid mutants | proposed | No local verdict comparison recorded |
| Effective fault detection | T2 mutation score as a proxy for real fault detection | [Just et al., FSE 2014](https://doi.org/10.1145/2635868.2635929); empirical association, not a guarantee or coverage substitute | proposed | No local verdict comparison recorded |

## Architecture

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Enforced boundaries | T1 forbidden dependency edges / inspected edges | project's dependency contract and static graph; count dynamic edges as unknown when unsupported | proposed | No local verdict comparison recorded |
| Bounded modules | T1 module size and count of explicitly owned responsibilities against agreed limits | project's module contract; lines alone do not establish maintainability | proposed | No local verdict comparison recorded |
| Local changes | T1 modules touched per comparable accepted feature | version-control diffs and feature ledger; exclude generated files consistently | proposed | No local verdict comparison recorded |
| Easier change | T2 change touches and hidden design decisions as a modularity proxy | [Parnas, 1972](https://doi.org/10.1145/361598.361623); information hiding motivates the proxy, no universal size threshold | proposed | No local verdict comparison recorded |

## Security

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Verified security requirements | T1 applicable OWASP ASVS requirements verified at the selected level | [ASVS](https://asvs.owasp.org/); pin version, record exclusions and manual evidence | proposed | No local verdict comparison recorded |
| Known dependency exposure removed | T1 known-vulnerable dependencies by severity and reachability | [OSV](https://osv.dev/); pin advisory snapshot, unknown vulnerabilities remain unknown | proposed | No local verdict comparison recorded |
| No committed secrets | T1 confirmed secret findings in changed files and relevant history | project's secret-scan report; scanner zero is not proof of absence | proposed | No local verdict comparison recorded |
| Reduced exploit risk | T2 requirement verification as a limited security proxy, only with a threat-specific rationale | [ASVS rationale](https://asvs.owasp.org/); a standard framework, not empirical proof of safety; absent research stays tier 3 | proposed | No local verdict comparison recorded |

## Accessibility

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| WCAG 2.2 AA conformance | T1 applicable A/AA criteria passed, failed and untested | [WCAG 2.2](https://www.w3.org/TR/WCAG22/); automation alone cannot establish conformance | proposed | No local verdict comparison recorded |
| Fewer detectable violations | T1 automated violations by rule and affected state | checker report tied to [WCAG](https://www.w3.org/TR/WCAG22/); false positives and untested criteria separate | proposed | No local verdict comparison recorded |
| Keyboard completion | T1 named keyboard paths completed without traps, with visible focus | [WCAG keyboard criteria](https://www.w3.org/TR/WCAG22/#keyboard-accessible); record steps and failures | proposed | No local verdict comparison recorded |
| Usable assistive paths | T2 task completion/time in representative assistive-technology trials | [HEART task success research](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); adapt participants explicitly, not a conformance certificate | proposed | No local verdict comparison recorded |

## Performance

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Fast visible content | T1 field LCP, 75th percentile, target at most 2.5 seconds | [Web Vitals](https://web.dev/articles/vitals); segment device classes and distinguish lab from field | proposed | No local verdict comparison recorded |
| Responsive interaction | T1 field INP, 75th percentile, target at most 200 ms | [Web Vitals](https://web.dev/articles/vitals); include actual interaction population | proposed | No local verdict comparison recorded |
| Stable layout | T1 field CLS, 75th percentile, target at most 0.1 | [Web Vitals](https://web.dev/articles/vitals); lab sample is diagnostic only | proposed | No local verdict comparison recorded |
| Quick start | T1 cold/warm start-to-ready time at median and tail | project's timing trace; define ready and device/load conditions | proposed | No local verdict comparison recorded |
| Bounded memory | T1 peak and steady-state memory under a named workload | process measurement artifact; record resident/heap units and observation window | proposed | No local verdict comparison recorded |
| Perceived performance | T2 Core Web Vitals as user-experience proxies | [Web Vitals rationale](https://web.dev/articles/vitals); thresholds do not prove satisfaction for every audience | proposed | No local verdict comparison recorded |

## Product

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Goals linked to signals | T1 selected HEART signal trend for happiness, engagement, adoption, retention or task success | [Rodden et al., 2010](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); pick the dimension relevant to this goal | proposed | No local verdict comparison recorded |
| Task completion | T1 successful unaided attempts / attempts, with defined success | [HEART](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); report sample and failures | proposed | No local verdict comparison recorded |
| Efficient tasks | T1 time on task among successful attempts, failures separate | [HEART](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); fixed task and comparable population | proposed | No local verdict comparison recorded |
| Perceived usability | T2 SUS score from its ten-item questionnaire as a usability proxy | [Brooke, SUS](https://doi.org/10.1201/9781498710411-35); score is not a percentage; do not invent universal pass marks | proposed | No local verdict comparison recorded |
| Perceived task ease | T2 SEQ seven-point post-task rating as a task-difficulty proxy | [Sauro and Dumas, CHI 2009](https://doi.org/10.1145/1518701.1518946); compare same tasks and participants, not unrelated products | proposed | No local verdict comparison recorded |

## Design

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Legible contrast | T1 text contrast at least 4.5:1, large text 3:1, applicable non-text 3:1 | [WCAG 1.4.3/1.4.11](https://www.w3.org/TR/WCAG22/#contrast-minimum); floors do not set the overall look | proposed | No local verdict comparison recorded |
| Operable target sizes | T1 target dimensions or spacing satisfying 24 CSS px criterion and exceptions | [WCAG 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum); record exceptions, do not claim every target must be 24 px | proposed | No local verdict comparison recorded |
| Bounded reading measure | T1 line length against chosen project target | [WCAG 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html); 80 characters/40 CJK is AAA user-adjustment guidance, not AA | proposed | No local verdict comparison recorded |
| Intentional motion | T1 measured durations against chosen timing bands and reduced-motion paths | [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html); AAA disabling criterion, no universal timing value | proposed | No local verdict comparison recorded |
| Stable visual depth | T1 value range and adjacent surface-level differences against the person's selected bands | accepted reference and token measurements; project choices, no invented universal aesthetic threshold | proposed | No local verdict comparison recorded |
| Comfortable reading | T2 reading time/error rate on representative content as task-efficiency proxies | [HEART task success](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); retain structured judgment of feel and appearance | proposed | No local verdict comparison recorded |
| Lower visual congestion | T2 feature congestion compared with an agreed reference as a perceived-clutter proxy | [Rosenholtz et al., CHI 2005](https://web.mit.edu/rruth/www/Papers/RosenholtzEtAlCHI2005Clutter.pdf); agreement with observer rankings on maps, transfer to other interfaces unvalidated | proposed | No local verdict comparison recorded |

## Writing and docs

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Plain-language compliance | T1 named checklist failures in the changed text | [GOV.UK writing guidance](https://www.gov.uk/guidance/content-design/writing-for-gov-uk); report which rules and manual checks apply | proposed | No local verdict comparison recorded |
| Short sentences | T1 median/tail sentence length against project target | text-analysis output; length measures form, not understanding | proposed | No local verdict comparison recorded |
| Controlled technical language | T1 Simplified Technical English vocabulary/rule violations where applicable | [ASD-STE100](https://asd-ste100.org/); pin edition, do not impose a technical-language standard on every genre | proposed | No local verdict comparison recorded |
| Reader understanding | T2 task success and time finding/using instructions as comprehension proxies | [HEART task success](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); representative readers, task and sample recorded | proposed | No local verdict comparison recorded |

## Agent work

| Outcome | Measure and tier | Source / limits | Status | Validation evidence |
|---|---|---|---|---|
| Bounded resource use | T1 tokens and elapsed time per slice | [telemetry](telemetry.md) and provider usage; unknown tokens remain unknown | proposed | No local verdict comparison recorded |
| First-pass success | T1 slices accepted on first independent check / checked slices | acceptance ledger; keep acceptor distinct from builder | proposed | No local verdict comparison recorded |
| Less rework | T1 rework rounds per accepted slice | review ledger with fixed round definition; pair with escaped problems | proposed | No local verdict comparison recorded |
| Visible progress | T1 unsolicited person status requests per active hour | human-labelled task log; absence of questions alone does not prove clarity | proposed | No local verdict comparison recorded |
| Cost of completed work | T1 observed resource cost / independently accepted slices | usage ledger and documented rates; missing rates mean unknown, never guessed | proposed | No local verdict comparison recorded |
| Sustainable agent workflow | T2 rework/wait and completion trends as provisional efficiency proxies | [SPACE](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/); adapted from human developer research, not validated agent quality metrics | proposed | No local verdict comparison recorded |

History and cost seats use Testing and Agent work; architecture also uses
Performance. At retros compare ambiguity with escaped problems, rework and the
person's judgment. Propose changes to measures or thresholds; only the person
chooses a tighter gate. This library adds no telemetry collection or retro command.

## Catalogue maintenance

Each discipline contains outcome rows with a tier, source and limits, status
(`proposed`, `validated`, `retired`), and validation evidence. Proposed is the
initial state even for research-backed proxies: research does not establish
that a measure predicts this person's verdict. At retros add measures found
in plans, plan checks and trials; compare measured results with recorded
verdicts. Link the comparison before marking validated. Retire predictors
that repeatedly pass when the person says not met; retain their evidence and
limits rather than deleting history. Retired rows are excluded from template
lookup. Never copy personal vocabulary or private evidence into this catalogue.

The translation helper uses Outcome as the lookup phrase and Measure and tier
as a single-measure template. It uses only proposed or validated tier 1/2 rows;
lookup yields a draft, never confirmation. Personal synonyms belong only in
an explicitly supplied glossary. If no phrase fits, report the gap.
