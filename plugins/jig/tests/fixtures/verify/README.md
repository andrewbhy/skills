# Verification fixtures: coordinator guide

These are the two standalone projects for [the fixed scenarios](../../../docs/verify-scenarios.md).
They require Node.js 22 or newer and have no dependencies. The committed sources
are correct and their tests pass. No provider sessions are run by these projects.

`reading-list/` is the screen fixture, with `/list`, targeted and full tests,
and `.jig/verify.json` including 390 x 844 and 1440 x 900 viewports.
`import-parser/` is the no-screen fixture with documented commands and no config,
as required by the configuration-absent scenario. Its full suite currently equals
its targeted suite. Both have existing whitespace regression tests.

## Prepare an isolated input

From this directory, run the following with a fresh destination whose parent
already exists. Relative destinations resolve from the current working directory.
Use the same committed revision and preparation for both providers.

```text
node prepare.mjs reading-list <new-ui-directory> --seed
node prepare.mjs import-parser <new-parser-directory> --seed
```

The helper copies only the selected project. It refuses existing destinations or
destinations inside the source project, and changes exactly one validation
condition in the copy from trimmed-length to raw-length. Whitespace is accepted,
while empty input is still rejected. The existing targeted command must fail for
whitespace validation; the session should repair the validator and get it green.
It never edits the committed fixture. To prepare the small-scope control, omit
`--seed` when copying the parser. To discard a run, remove only its isolated copy.

Record `git rev-parse HEAD` from the jig checkout as the fixture revision (the
fixtures are committed here), along with jig `VERSION` and the other fields in
the scenario protocol. If using git in the isolated project, commit its clean
copy first, then apply the same one-condition replacement there, or commit the
prepared input and retain the original fixture revision separately. Mount the
source skill and generated pointer in normal discovery locations; run the jig
pointer check before provider invocation.

Give the session only its project copy and the scenario prompt. Keep this guide,
`prepare.mjs`, and the scenario scoring notes outside its project. The helper
does not install skills or start a provider. Do not copy the entire fixture
collection into a session. A prepared seeded copy is deliberately failing;
do not use its test result as the clean-fixture baseline.

## Local checks and evidence limits

In each source project run `npm run test:targeted` then `npm test`. To prove the
seed independently, prepare a seeded copy, run its targeted command and confirm
the whitespace cases fail. Restore only the changed condition in that copy and
rerun the same command; then run its full suite on the restored candidate.

The UI full suite checks the actual HTTP server and assets but does not drive a
browser. The coordinator must supply an authorized browser for live interaction
and viewport evidence, or record that part as Not tested. These fixtures are
local scenario inputs, not production apps. Provider behaviour and parity remain
untested until the coordinator runs and records the scenarios.
