# Import parser

Requires Node.js 22 or newer, with no dependencies or install step. Commands run
from this directory. This project has no screen or server.

The public export is `parseItems(text)` in `parse-items.mjs`. Pass JSON text
containing an array of records. Each record must have a nonempty string `title`;
whitespace-only titles are invalid. Success returns
`{ items: [{ title: "Dune" }], error: null }`. Titles are trimmed and extra fields
are ignored. An empty array is valid. Any invalid record rejects the whole import
with `{ items: null, error: "Item N must have a nonempty string title." }` (N is
one-based). Non-array JSON returns `Expected an array of records.` and malformed
JSON returns `Invalid JSON.` in the same error shape. Validation does not throw.

Run `npm run test:targeted` for the parser contract tests. Run `npm test` for the
full suite (currently the same tests). Both commands exit nonzero on failure.
Tests call the public export and use one record builder with case overrides.

For direct execution, run `node --input-type=module` and enter:

```js
import { parseItems } from './parse-items.mjs';
console.log(parseItems('[{"title":"Dune"}]'));
console.log(parseItems('[{"title":"   "}]'));
console.log(parseItems('{'));
```

There is intentionally no `.jig/verify.json`; scripts and this README are the
project's command and public-contract documentation.
