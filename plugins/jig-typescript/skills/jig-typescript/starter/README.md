# TypeScript starter

Copy these two configuration files only where configuration is missing. Use
Node.js 22 or newer for jig's helpers. This baseline targets modern ESM with
NodeNext resolution, no emitted output and no ambient platform types. Set
`"type": "module"` in the application package. Select the actual runtime's
`target`, `lib`, platform types and JSX mode in the project; this is not a
browser, React or declaration-build preset.

Pin the compiler and linter in the project's manifest and retain its lockfile:

```text
npm install --save-dev --save-exact typescript@7.0.2 @biomejs/biome@2.6.6
node node_modules/typescript/bin/tsc --project tsconfig.json
node node_modules/@biomejs/biome/bin/biome lint src --error-on-warnings
```

`tsconfig.json` cannot pin a compiler version. Check the manifest, lockfile and
`tsc --version` in CI; use `npm ci` for subsequent installs. Do not install
typescript-eslint 8.72.1 with TypeScript 7: its declared peer range is
`>=4.8.4 <6.1.0`. Do not bypass that range with force or legacy-peer-deps.

The starter enables only the listed lint rules, at error severity. Biome's
`noUnsafeTypeAssertion` rejects type assertions except `as const`, including
assertions that might be safe. Use narrowing or `satisfies` instead. Its promise
and assertion rules are nursery rules: keep the pin and re-run the fixtures on
upgrade. Promise analysis has inference limits; a green lint is not proof that
all promises are owned. Both lint tools permit a `void` escape that still needs
review for error handling.

TypeScript checks strictness, indexed access, optional properties and unused
locals/parameters. Biome checks explicit `any`, assertions, non-null assertions,
floating/misused promises, unused locals/imports and redundant rethrows. Neither
starter tool finds unused exports. For that, configure Knip with the project's
actual entry points; `knip@6.44.2` caught the fixture's unused export with
`--include exports --include-entry-exports`. That last flag is appropriate for
this application fixture, not automatically for a public library.

For compiler-based promise analysis, the experiment passed with exact pins
`oxlint@1.92.0` and `oxlint-tsgolint@7.0.2006`:

```text
node node_modules/oxlint/bin/oxlint --type-aware --deny typescript/no-floating-promises --deny typescript/no-unsafe-type-assertion src
```

These are optional additions, not dependencies of jig. Oxlint's type-aware
engine uses typescript-go; this fixture proves coexistence and detection with
TypeScript 7.0.2, not identical compiler internals or full language coverage.

Module boundaries need the project's architecture: configure dependency-cruiser
for allowed public entry points, forbidden layer edges and cycles, and seed a
forbidden import to prove detection. Use Biome `noRestrictedImports` for small
import bans. The two generic configuration files do not enforce an invented
module graph. No dependency-cruiser version was exercised in this proof.

Review must still catch missing boundary parsers, false type predicates,
internal defensive checks, swallowed errors, cancellation/lifetime ownership,
duplicate sources of truth, obsolete shims and whether a dependency earns its
cost. Run rejection, invalid-input and cancellation tests for changed behaviour.
Use a manifest check for exact direct dependency pins and a frozen lockfile
install in CI; neither starter configuration enforces dependency policy.

Repeatable clean/planted fixtures and commands live in ../scenarios/.

The files are named `*.starter.json` so that Biome and TypeScript never pick them up from the skill folder inside a project; copy them without `.starter`.
