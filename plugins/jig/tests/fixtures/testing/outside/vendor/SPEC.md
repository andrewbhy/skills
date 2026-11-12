# Notebook CLI specification 1.0.0

System version: `notebook --version` reports `1.0.0`. Documentation version:
1.0.0. Machine-readable wire schema: `schema.json`, version 1.0.0.

Invocation: `node vendor/notebook.mjs --version`, `--ui`, or `--request`.
`--ui` is the system's native text interface; use its features for parity.
`--request` reads one JSON object from stdin and writes one JSON response.
`op` must be `list`, and `state` must be `all` or `open`.
The response's `version` is the outside system version. Items have integer
`id`, string `title` and boolean `done`. List order is ascending by ID for
both filters. Open items exclude done entries. This is a read-only system.

Official playbook starting point: inspect version and UI, list all, list open,
check fields, ordering and filtering. Save requests, responses and version.
