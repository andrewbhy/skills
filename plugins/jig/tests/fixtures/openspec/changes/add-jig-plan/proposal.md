# Proposal: add jig-plan with a multi-lens plan check

## Why

Build briefs currently launch without a checked verification plan. The person sees expensive validation and repeated missed problems instead of a short, reviewable plan before work starts. Source: the read-only handoff's “Verification plan rules”, items 1–4.

## What Changes

- Add jig-plan: one page stating intent, what the person will see, acceptance, scope, out of scope, contracts, timeboxed slices, cheapest-layer verification with expected times and acceptors, riskiest unknown first, and relevant past missed problems.
- Add plan mode to jig-review, reusing its seat definitions. Testing, cost and history always run; add architecture for modules/contracts, product for behaviour, design/accessibility for UI, and other seats when risk warrants them.
- Fresh authorized reviewer contexts return blocking gaps and edits, each at most 120 words; target cheap models, parallel execution and 1–2 minutes overall. The coordinator resolves gaps and records an outcome before launch. Unavailable reviewers mean pending.
- A deterministic brief check at the launcher boundary requires plans for builds over about 30 minutes, any UI/product slice, or new module/contract. Record exemptions for timeboxed spikes, one-file fixes, coordinator edits under about 10 minutes, or an explicit person skip.

## Capabilities

### New Capabilities

- build-planning: pre-build planning, proportionate verification, independent multi-lens review, and launch eligibility.

### Modified Capabilities

None: this clone has no standing OpenSpec specifications. Existing jig-review behaviour is extended, not replaced.

## Impact

Proposed files: canonical .agents/skills/jig-plan/, generated Claude pointer, jig-review plan mode, brief template/checker, launcher integration, suite documentation and provider scenarios. jig-mockup, jig-verify and jig-correct reference the shared contract. This proposed feature requires no OpenSpec runtime.

Acceptance: the person reads one page and sees what changes, what is excluded, the checks and expected cost, the first risky slice and review outcome. Launch refuses an incomplete plan with the missing sections named, or unresolved blocking gaps. A recorded exemption explains why no plan was required.

Scope excludes implementation-review replacement, UI runner redesign, automatic acceptance/merge and silently starting provider sessions. Contracts and verification estimates: [design](design.md). Behaviour: [delta](specs/build-planning/spec.md). Slices: [tasks](tasks.md).
