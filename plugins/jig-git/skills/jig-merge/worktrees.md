# Worktree command contract

`node "<skill-folder>/../../scripts/worktree.mjs" ...` (or the generated helper beside either branch
skill) runs with Node 22+ and Git on PATH, without dependencies or a shell.
Run from any checkout of the repository. The first entry in Git's worktree list
is the main checkout; bare repositories are refused.
Commands return JSON on stdout, exit 0 on success, or a diagnostic on stderr and
exit 1 on refusal/failure, or exit 2 when the registry lock is busy. Git's own
worktree and branch rules remain in force.

| Command | Result |
| --- | --- |
| `open <name> [--base <local-branch>]` | New branch and sibling worktree, registered with creation time. Names are lowercase words with hyphen or slash separators. Existing paths, names or branches are refused. |
| `list` | Every Git worktree: path, branch (null when detached), merged, dirty, ageDays and ageSource, registered status, scratch paths and missing flags. |
| `register <name> <folder>` | Register an existing disposable directory for a live managed worktree. Relative folder paths resolve from the command's working directory. |
| `adopt <name> <path>` | Register an existing Git worktree with its actual branch. Detached, protected, locked, foreign and already registered worktrees are refused. |
| `consume <name> <file>` | Record the SHA-256 of a protected private file in the worktree's `.jig/consumed.json`. The file path is relative to that worktree. A later content change invalidates consumption. |
| `close <name> [--into <branch>] [--import <dir>]` | Require a registered live worktree on its recorded branch, clean and merged into the selected integration branch, with all protected private files consumed; remove it through Git, delete the branch and its registered scratch folders. Run outside every folder being removed. Import copies private files to `<dir>/<name>/` and verifies bytes before recording consumption or removing anything. |
| `close <name> --force --reason "reason"` | Explicitly discard dirty/unmerged work and echo the stated reason in the receipt. Does not bypass private-file protection, path, lock, registration or protected-branch checks. The caller must have authority to discard that work. |
| `doctor` | Preview merged-but-present, missing and prunable Git entries, orphan registrations, changed branches and stale scratch. Report project backstop configuration for each provider directory present, with runtime-loading gaps. Never deletes anything. |

Project facts live in the main checkout's optional `.jig/worktree.json`:

```json
{
  "root": "../project-wt",
  "mainBranch": "main",
  "base": "main",
  "integrationBranch": "main",
  "disposable": ["node_modules/", ".npm-cache/"]
}
```

Omit fields to use `<main-checkout-name>-wt` beside the main checkout, `main`,
and the main branch respectively. The root resolves relative to the main
checkout; an absolute local root also works. These are local branches, never
remote-tracking refs. Merge detection means commit ancestry against the current
local integration branch (`--into`, then `integrationBranch`, then `mainBranch`);
fetch/update that branch according to project policy first. Both the configured
integration branch and any explicit `--into` target are protected against deletion.
Squash or rebase merges may not preserve ancestry: refusal is intentional;
inspect the result before authorizing forced disposal with a reason.

The script owns `.jig/worktrees.json` in the main checkout, version 1, containing
`worktrees: [{name, branch, path, created, scratch: [path]}]`. Paths are absolute
local paths; keep this file out of Git. Do not copy it between machines or edit
it to authorize deletion. Mutations use an exclusive `.jig/worktrees.lock`
directory and atomic registry replacement. Read-only commands do not take the
lock; rerun a preview after a concurrent mutation. If a command was interrupted,
inspect Git's worktree list, registry and any `.tmp` file before manually
clearing the lock. An existing temporary registry file is refused, never overwritten.
The script never steals a lock. If registry persistence or cleanup fails after
Git changed, it exits 1: use `doctor` and recover the remaining resources rather
than repeating deletion blindly. Git worktree removal clears that worktree's
administration entry; no global prune or sweep runs as a side effect.

Safety boundaries apply even with force. Worktrees must be outside existing
checkouts and provider folders. Scratch must also be outside checkouts, common
Git metadata, other registered worktree paths and scratch folders; it cannot
contain a Git repository. Physical ancestor paths are resolved at registration
and rechecked before deletion. A changed symlink at a stored path is refused;
nested symlinks are removed as links and never traversed. All scratch paths are
checked before removing the worktree. Locked worktrees, changed branches, the
main checkout and configured main and integration branches are protected. Detached
worktrees are listed but cannot be closed; unmanaged worktrees need `adopt` first.
No scan of arbitrary filesystem
folders is possible: doctor reports stale scratch only from the registry.

Dirty means Git's tracked changes and untracked files. Close separately protects
ignored files under `.jig/` and elsewhere, except configured disposable directories.
Tracked `.jig/` files use the normal dirty/merge checks and need no consumption.
Import also copies tracked `.jig/` files. The default disposable list is `node_modules/` and
`.npm-cache/`; setting `disposable` replaces it. Entries are relative directory
paths with no traversal; `.jig/` cannot be declared disposable. Junctions and
symlinks are disposable links: their targets are never traversed, and the links
are unlinked only after checks pass, before Git removes the worktree. A symlinked
`.jig/` root is refused. The generated consumption manifest itself is control
metadata, excluded from the private-file set; malformed or linked manifests refuse.
An untracked manifest does not count as dirtiness and is removed just before Git
removal, so projects need not ignore it. If Git then refuses, the private files
remain but consumption may need recording again.
An unconsumed file refuses close with its relative path, including with `--force`.

Use `consume` only after a private file has been used or preserved. Alternatively,
`--import` preserves every protected private file, including already consumed
files, under `<dir>/<name>/<relative-path>`. Import refuses destinations within
the worktree or overlapping its scratch or Git metadata. It resolves the destination
physically, refuses redirected child paths and existing files with different bytes;
equal copies are reusable.
It copies without overwriting, verifies the full batch against source SHA-256
hashes, records consumption, then checks protection again before removal. A copy,
verification or consumption-write failure removes nothing and reports the copies
already present; keep those copies and retry after resolving the failure. Import
does not authorize dirty/unmerged tracked work: that still needs explicit force
authority. A failure after Git removal explicitly warns of a stale registry;
doctor shows the orphan entry, and repeating close refuses rather than deleting
anything else. Never use raw Git removal to bypass a close refusal.

Age is elapsed days since registration for managed worktrees;
unmanaged worktrees use folder birth time as an approximation, or null when
missing. Stale scratch means missing, associated with a merged branch, orphaned,
or associated with a missing or changed-branch worktree; age alone grants no
deletion authority. Missing/prunable entries are reported for manual inspection,
never automatically pruned; retain their registry until scratch recovery is done.

## Optional provider backstop

Additional close guards are installed separately by the person. Without them, use the lifecycle helper directly and retain its dirty-worktree and authority checks. No hook files or provider settings are required by this plugin.
