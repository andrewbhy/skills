# Fixed TypeScript pack scenarios

These fixtures are product checks, not evidence of skill behaviour in either
provider. Revised scenarios need fresh provider runs. Keep this scoring guide
outside the project supplied to a future session.

## Local tool proof

From the jig root, run:

```text
node skill-drafts/jig-typescript/scenarios/prove.mjs prepare
npm install --prefix <printed-temp-folder> --cache <writable-cache-folder>
node skill-drafts/jig-typescript/scenarios/prove.mjs run <printed-temp-folder>
```

After promotion, use `.agents/skills/jig-typescript/scenarios/prove.mjs` as the
script path. The helper uses Node paths and launches tools without a shell on
Windows and macOS. `prepare` writes exact pins and starter configuration. Use a
new temporary folder, never a working project: `run` replaces `src/index.ts`.
Install creates the local lockfile; later replay in that folder can use `npm ci`.
The helper verifies installed versions, tool exit codes and named diagnostics;
it restores the clean fixture even if execution throws. Exit 0 means expected
detection and expected gaps matched; exit 1 means a mismatch. `proof.json` retains
commands, exits and diagnostics with the temporary root redacted. Nothing starts
a provider session. Behavioural tests run the public function, including in the
planted fixture; deleting the module must fail those tests. The implicit seed
must fail its ingress contract tests; a checked parser must pass them and all
tools. Separate regressions that accept empty or whitespace-only titles must
fail the corresponding tests. The helper restores the explicit clean module
and its tests at the end, regardless of which fixture was prepared.

The combined planted fixture contains explicit `any`, an unchecked cast, a
floating promise and an unused export. Its extra wrong-type assignment exists
to prove TypeScript's own check fails. Separate probes prove that TypeScript
accepts those first four hazards, Biome catches the first three, and only Knip
in this proof catches the unused export. The Biome command is the full check,
including the formatter; a formatting-only probe must fail it while passing the
type check. The starter explicitly enables two-space formatting so clean fixtures
conform. Clean checks run before and after.

## Provider protocol (coordinator; not run)

After promotion, generate pointers and supporting files with
`node "<skill-folder>/../../scripts/sync-skills.mjs"`; require `npm run check`. In fresh isolated projects,
load the skill from its normal discovery location, with its generated support
files and the generated pointer where applicable. Run every scenario in a fresh
Codex session and a fresh Claude Code session, only when authorized. Use the
same jig revision, fixtures and prompt for both. Do not expose this scoring
guide. Keep initial and final snapshots and tool evidence.

Record for every run: jig version/revision, fixture identity, provider/model and
version, prompt, whether the skill loaded, outcome, whether each planted defect
was caught, evidence links, and input/cached/output tokens from provider records
(unknown when unavailable). Confirm start/end telemetry markers share the skill,
version and run ID. Also check telemetry disabled writes no markers. Compare
outcomes and explain differences; passing local commands is not provider parity.

### Explicit invocation: repair the hazards

Fixture: run `prepare <new-temporary-folder> explicit`, then install its exact
pins. The helper supplies the planted module, public-function tests, README,
Knip configuration and package scripts. Keep all of them in the session project.

Prompt: "Use jig-typescript to repair this TypeScript application. Keep the tool
checks strict, preserve public behaviour, remove obsolete exports, and show what
the checks detected."

Score: normal discovery loads the skill; the project's `npm test` runs before
code changes and after the repair; all five combined defects are found;
the repair removes `any`, assertions, unowned promises, obsolete exports and the
wrong assignment without suppression or weaker checks. Before editing, it lists
each README/task/test contract rule, adds a public-entry test for any untested
stated contract and runs it before implementing the change, then checks each
through the public entry point. Type check, full Biome check (linter and formatter),
unused-export checks and `npm test` pass afterwards; deleting the module or
changing its rendering/rejection behaviour fails acceptance. The report
distinguishes the tools and identifies missing module-boundary checks rather
than claiming full enforcement.

### Implicit discovery: parse the boundary

Fixture: run `prepare <new-temporary-folder> implicit`, then install its exact
pins. The helper copies `implicit.ts` into `src/index.ts`, the title-ingestion
contract into the project's `README.md`, and `implicit-behaviour.mjs` into
`test/title.test.mjs`, with an `npm test` script. Supply all of these to the
session, along with the generated tool configuration and package scripts.
`ingestTitle` is the public ingress; the seed keeps the unsafe cast and internal
null fallback but is callable without an import-time crash. Its tests fail on
the seeded contract violations, including empty and whitespace-only titles.
The contract requires non-empty string titles and rejection of missing, null, numeric, empty and
whitespace-only titles at ingress before internal rendering.

Prompt: "Fix the TypeScript title ingestion contract. Check a valid title and
malformed external input; remove redundant internal handling."

Score: the skill loads without being named; the session runs `npm test` before
changing code, observes the seeded behavioural failures, and runs it again after
the repair. It preserves the supplied tests and test script without weakening
assertions, skipping cases or moving validation into internal rendering. The
session replaces the cast with a parser, keeps one type/schema contract, rejects
missing, null, numeric, empty and whitespace-only titles at ingress, and removes
the internal null fallback. It calls the
public ingress with valid and invalid input and reports actual results. It
does not add a blanket catch, a new schema dependency for this tiny shape, or
claim cancellation or architecture was tested. Before editing, it lists every
README/task/test contract rule and adds and runs a public-entry test before
implementation for any stated contract that has none; its public-ingress checks
account for each one. `npm test`, type check, full Biome check (linter and
formatter) and unused-export checks pass. A repair that accepts empty or
whitespace-only titles fails acceptance even when the tool checks pass.

Both scenarios must pass in both providers before merge. Module graph and
cancellation integration remain project-specific checks, not covered here.
