# ADR 0002: jig stands alone

Status: accepted by the user, 7 Nov 2026.

## Decision

jig stands on its own: any provider, any work environment, with no dependency on a product that uses it. It makes one agent session work better, in any project.

## Why

- A dependency on any one orchestrator would limit where jig can be used.
- Testing jig on real work needs nothing but a coding agent.

## Rules

1. jig works in any project without a consuming product installed. A launcher or coordinator may use jig, but jig never depends on either.
2. jig code, skills and docs never name a tool that consumes it.
3. jig advises and does not enforce. An agent can skip a skill, so it grants no approval, merge or deployment.
4. Verify tools keep a documented contract for exit codes and evidence, so any tool can read their results.
5. jig holds general skills only. Domain skills live in their project.
6. Tool dependencies are allowed when declared, pinned and licence-recorded in [docs/borrowed.md](../borrowed.md). A required dependency produces a clear error when missing; an optional dependency reports the resulting evidence gap. Tool dependencies do not create a dependency on a consuming product.

## Consequences

Independence governs what jig depends on and prescribes, not what private
records describe. A signal or retro report may name the tool where a problem
occurred; these records stay ignored by Git and are never pushed. Committed
journal and missed-problems entries stay general, with no project, product or
environment names; they may point to private details by date. Retro decisions
reach public files as general rules, never private incident narratives.

- Anything a run must do belongs to whatever launches the run, not to jig.
- A change to the verify contract is a breaking change and needs a new major version.
- `tests/portability.test.mjs` checks every tracked file (`git ls-files`) for absolute machine paths and whole-word sibling repository names discovered at run time, with no file exemptions. Discovery uses the main checkout's parent, excludes the main checkout itself and requires a `.git` directory, so plain folders and linked worktrees do not count. If discovery is unavailable, the test reports the gap and still checks paths. Untracked private logs stay outside this scan. This mechanical check supports semantic review; it cannot identify every consuming product.
