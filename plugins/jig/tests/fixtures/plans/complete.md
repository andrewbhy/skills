# Example: a portable planning command

## Intent
The person sees one checked plan before a build starts.

## Acceptance
The command refuses missing sections and accepts complete reviewed plans.

## Requirements
### Requirement: Launch check
#### Scenario: Missing section
- **WHEN** a plan lacks verification
- **THEN** the launch check refuses it with reasons

## Scope
One portable command and its fixtures.

## Out of scope
Browser checks, provider launches and merge authority.

## Contracts
Exit 0 means structurally complete; exit 1 means refused, including unreadable input.

## Slices
1. Prove missing-section refusal, the riskiest unknown (10 minutes).
2. Document the command (5 minutes).

## Verification plan
| Risk | Check | Layer | Expected time | Acceptor |
|---|---|---|---|---|
| Missing sections pass | Delete each section and run CLI | unit | 2 seconds | fresh QA seat |

## Missed problems
Example history only: unknown history must remain an evidence gap.

## Plan-check outcome
OK: fixture review record for parser tests only; no actual review or authorization claimed.
