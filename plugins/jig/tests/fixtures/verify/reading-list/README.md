# Reading list

Requires Node.js 22 or newer. No packages to install. Run commands from this
directory. `npm start` serves http://127.0.0.1:4173/list; wait for the `Ready:`
message and an HTTP 200 from `/list`. Stop your server with Ctrl+C. `PORT` can
override the default if it is occupied; use the printed URL in that case.

One submission of a nonempty title adds exactly one row. Titles are trimmed.
Empty and whitespace-only titles display `Enter a title.` and leave the list
unchanged. Validation clears after a successful addition. Data lives only in
memory and resets on reload; duplicate titles across separate submissions are
allowed. Titles are displayed as text.

Run `npm run test:targeted` for add-item contract tests. Run `npm test` for the
full suite, including HTTP serving. Both commands exit nonzero on failure.
Tests use Node's built-in runner and HTTP test ports are allocated automatically.
These automated checks do not exercise a browser. For live evidence, open `/list`
at 390 x 844 and 1440 x 900 CSS pixels and exercise valid, empty, whitespace-only
and recovery submissions. `.jig/verify.json` records the project facts.
