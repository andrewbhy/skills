# Build planning delta

## Purpose

Let the person inspect a compact build plan and let launchers reject incomplete or unchecked work before implementation spends its budget.

## ADDED Requirements

### Requirement: Proportionate plan requirement
jig SHALL require a checked plan for build work estimated over 30 minutes, any UI or product slice, and any new module or contract. It SHALL permit a recorded exemption for a timeboxed spike, one-file fix, coordinator edit under 10 minutes, or explicit person skip.

#### Scenario: Small UI slice still needs a plan
- **WHEN** a 15-minute UI build is prepared without an exemption
- **THEN** launch requires a checked plan

#### Scenario: Person authorizes a spike
- **WHEN** a spike has a timebox and a recorded exemption reason
- **THEN** launch records the exemption without requiring the plan check

### Requirement: Person-readable plan and specification
jig SHALL produce a one-page plan with intent and what the person sees, observable acceptance, scope, out of scope, contracts, timeboxed slices, verification plan, riskiest unknown first, relevant past missed problems, and a plan-check outcome.

#### Scenario: Review the plan before spending
- **WHEN** the person opens the plan for a proposed build
- **THEN** they can locate the visible outcome, exclusions, boundary contracts, costed checks, first risky slice and review result on that page

### Requirement: Cheapest sufficient verification
Each verification row SHALL name a risk, check, cheapest sufficient layer, expected time and acceptor. Browser and pixel checks MUST justify why tokens, unit or integration checks cannot catch that risk. Expensive checks SHALL be reserved for important risks needing them.

#### Scenario: Token rule proposed as a browser test
- **WHEN** a colour-token constraint is assigned to a browser without a lower-layer justification
- **THEN** the testing lens reports a blocking gap and proposes a token check

### Requirement: Independent multi-lens plan check
jig SHALL reuse review seats in plan mode, always including testing, cost and history, plus architecture for modules/contracts, product for behaviour and design/accessibility for UI. Each fresh authorized seat SHALL return blocking gaps and suggested edits in at most 120 words, targeting cheap models and 1–2 minutes total with parallel seats where available.

#### Scenario: UI plan triage
- **WHEN** a UI behaviour plan is checked
- **THEN** testing, cost, history, product, design and accessibility review it before launch eligibility is recorded

#### Scenario: No independent context available
- **WHEN** a required seat cannot run in a fresh authorized context
- **THEN** its result remains pending and the coordinator cannot self-record a pass

### Requirement: History informs the next brief
jig SHALL read relevant prior decisions and docs/missed-problems.jsonl at intake. It SHALL carry applicable incidents into named risks and checks, explain exclusions and missing history, and block repeated problems until the incident-linked rule review is recorded.

#### Scenario: Previously missed partial coverage
- **WHEN** runner work follows a recorded incident about accepting partial coverage
- **THEN** the plan includes a named complete-coverage check and cites the incident rather than claiming a clean history

### Requirement: Launch refusal is enforced outside skills
The launcher SHALL refuse a non-exempt brief missing required sections, a verification row field or the plan-check outcome, and SHALL name the omissions. It SHALL refuse unresolved blocking gaps or pending required seats. Section presence alone MUST NOT count as review acceptance.

#### Scenario: Missing verification plan
- **WHEN** a complete-looking brief omits verification checks and expected times
- **THEN** the launch check returns nonzero and names the missing verification fields

#### Scenario: Review finds a blocking contract gap
- **WHEN** all headings exist but the architecture seat reports an unresolved boundary contract
- **THEN** launch remains blocked until the edited brief is rechecked and its outcome recorded

### Requirement: Budget exhaustion is not a pass
jig SHALL record slice timeboxes, verification estimates and review allowance before launch, placing the riskiest unknown first. Exhausted allowance, incomplete coverage or an overlong review SHALL leave the plan pending for replan or an explicit exemption, never silently pass.

#### Scenario: Review reaches its allowance
- **WHEN** required seats have not finished at the plan-check timebox
- **THEN** the outcome says pending, names missing seats and prevents ordinary launch

### Requirement: One provider-neutral source
jig SHALL maintain its plan contract in the canonical skill tree with generated provider pointers and shared portable Node checks. Fresh Claude Code and Codex scenarios MUST demonstrate loading, refusal and valid-plan handling before merging; Windows and macOS results SHALL distinguish executed checks from untested platforms.

#### Scenario: Generated provider pointer drifts
- **WHEN** the Claude pointer diverges from the canonical plan skill
- **THEN** jig's sync check fails before the change is eligible to merge
