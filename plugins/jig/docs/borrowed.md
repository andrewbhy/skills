# Borrowed sources

Third-party material is research data, never installed skill instructions.
Pins record what was adapted, not a claim of current upstream parity.

| Source | Repository | Pin | Licence | Adaptation / retained notice |
|---|---|---|---|---|
| OpenSpec | Fission-AI/OpenSpec | v1.16.1 | MIT | Named requirements, WHEN/THEN scenarios and opt-in change layout; [full licence](licenses/OPENSPEC-MIT.txt). Studied commit 0fa4a9705c20ef1c571fe3ded74435733e4b73a1. |
| pstack | backnotprop/pstack | f104aa8 | MIT | Review evidence/simplicity ideas; .agents/skills/jig-review/NOTICE |
| skills | mattpocock/skills | 4ae2317 | MIT | Standards/spec and testability ideas; .agents/skills/jig-review/NOTICE |
| Impeccable | pbakaus/impeccable | 924bbd194d02e5e15a227e75b5901fb0d7a4ecad | Apache-2.0 | Design toolbox; [notice](design-toolbox/IMPECCABLE-LICENSE.txt) |
| Motion skills | emilkowalski/skills | c8a79627b59d72d764d6ab6f2c87c09a48169833 | MIT | Motion basics; [attribution](design-toolbox/README.md#borrowed-practices-and-attribution) |

Other research-only sources and exclusions remain in the study
and follow-up.
OpenSpec compatibility uses portable file writes, no OpenSpec install or init.
The trial fixture was copied from the coordinator's OpenSpec 1.16.1 trial on
8 November 2026. Its sample pending outcome is retained as research evidence,
not treated as a launchable jig plan.

`node scripts/borrowed-check.mjs` checks this inventory offline (exit 0 or 1
for malformed entries). Only explicit `--network` queries GitHub's latest
releases, with a ten-second timeout per request. It prints pinned versus latest:
exit 0 when all match; 1 when updates exist; 2 when releases are unavailable,
no release exists, or a network/rate-limit failure leaves evidence unknown.
Commit pins compare against the release target via its tag ref (annotated tags
are dereferenced). A differing release is advisory research work, never an
automatic update, installation or reason to change a pin without review.

Practices jig arrived at before finding a published version are in [convergent.md](convergent.md).
