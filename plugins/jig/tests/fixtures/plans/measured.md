# Example: measured plan links

## Intent
Kind: module
Jobs find their plans and the person can judge launch clarity.

## Acceptance
Workspace-relative and absolute local links resolve; missing targets refuse.

## Requirements
### Requirement: Job workspace
#### Scenario: Handoff elsewhere
- **WHEN** a brief lives outside the job workspace
- **THEN** --workspace resolves its relative plan link at the job

## Scope
Plan link resolution and short launch feedback.

## Out of scope
Provider launches and merge authority.

## Contracts
Existing structure failures still refuse; ambiguity warns by default.

## Slices
1. Resolve links with fixtures (20 minutes).
2. Record launch clarity evidence (15 minutes).

## Verification plan
| Risk | Check | Layer | Expected time | Acceptor |
|---|---|---|---|---|
| Wrong workspace | Workspace and absolute path cases | unit | under 1 second | fresh QA seat |

## Success measures
| Goal | Outcome | Metric | Tier | Baseline | Target | When | Source |
|---|---|---|---|---|---|---|---|
| G1 | Reliable plan links | broken-link incidents | 1 | 3 | 0 | retro | incident log |
| G2 | Clear launch | person's rubric decision | 3 | unknown | clear | next launch | recorded clarity rubric |

## Missed problems
Example of mp-2026-11-08-12 and mp-2026-11-08-14; link-resolution unit cases.

## Plan-check outcome
ambiguity: 1 of 2 goals unmeasured; soft warning, product proxy still needed.
OK: parser fixture only; no real review or authorization claimed.
