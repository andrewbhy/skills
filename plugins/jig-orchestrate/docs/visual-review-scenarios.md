# Shared visual verification scenarios

Status: fixed scenarios; **Not run** in fresh provider sessions. These extend
the mockup, verify and review scenarios when the visual runner or UI seats
change. Local tests exercise scripts; they do not prove skill loading or parity.
The person must authorize provider sessions. Do not start them from a skill.

Use a fresh isolated project per scenario, with each skill loaded from its
normal discovery location, for both providers. Supply the source skills and
generated support from the same revision, `tests/fixtures/visual/alignment.html`
as the fixture, a screenshot of its clean state as reference and a separately
approved clean component baseline. Keep this scoring guide outside that project.
Record skill, provider/model/version, revision and diff hash, prompt, whether
it loaded, outcome, planted defect caught, tokens used (unknown if unavailable),
script report/contact-sheet links, and independence gaps. Never seed the real
component toolbox or alter its acceptance scripts.

1. **Mockup, shared states and golden components.** Prompt: “Use jig-mockup to
   prepare a key-component checkpoint from the existing fixture and reference;
   leave everything uncommitted.” Seed a 2 px edge miss, a 13 px raw gap and an
   overlay reachable only through a declared state. Pass: golden markup/styles
   are reused, independent setup/reset states are exercised by the shared
   runner, the seed is detected and repaired without weakening checks, and one
   annotated sheet reaches an independent reviewer. A builder's own visual
   opinion must never complete the gate. Repeat clean: no invented defects.
2. **Verify, renders rather than code.** Prompt: “Use jig-verify to check the
   changed screen.” Seed a half-pixel edge, an overflowing child and a reset
   which fails after the first state. Pass: script evidence names the geometry
   defects; reset failure is inconclusive and stops dependent states; a clean
   code diff or geometry pass is not called visual/fidelity acceptance. Findings
   keep `source: script`; independent model/person discoveries keep their own
   origin even after a regression check is added. Repeat without seeds.
3. **Review, split seats and independent fidelity.** Prompt: “Use jig-review
   to review this UI change against the reference and approved baseline.” Seed
   incorrect singular text, an unbreakable string, a wrong surface token and a
   cause/effect motion reversal. Pass: diff signals select Visual craft,
   Fidelity, Content stress, Motion, Accessibility and QA. Every catalogue
   cites shared state measurements/renders; Fidelity uses a fresh authorized
   context and the fixed pairwise rubric, never the builder. Motion sees strips
   in light/dark and discloses missing next-day review. If the independent
   context is unavailable, Fidelity remains pending. Sources survive merged
   catalogues and missed problem records. Repeat clean with no changed motion: Motion
   records the evidence for no applicable motion rather than inventing work.
4. **Verify and mockup, complete gates with pinned advisories.** Prompt: "Use
   jig-verify to check this component checkpoint, then carry the report into
   jig-mockup review." Supply the pinned detector and a static desktop fixture
   with loading controls, a split group focus ring and icons on color-mix fills.
   Plant an invisible filled-control icon and remove only the group ring.
   Require detection, then clean repaired controls; loading receives contrast
   checks. Set a tiny font time budget: every declared state/font must finish,
   then fail with slowest states. Require `impeccable` in the gate inspector
   list, execution/checksum evidence, telemetry-off detect flags and measured
   design warnings in the same report. Remove or corrupt the detector: no
   clean gate. Review aesthetic warnings against the reference without weakening
   layout rules. Record loaded, outcome, planted-defect detection and tokens for
   each skill in fresh Codex and Claude Code sessions. **Not run; authorization
   and normal-location installation remain pending.**

| Skill scenario | First provider | Second provider |
|---|---|---|
| Mockup states/golden controls | Not run | Not run |
| Verify rendered/reset/source discipline | Not run | Not run |
| Review independent split seats | Not run | Not run |

For each row retain **loaded / outcome / planted defect caught / tokens**.
Fresh sessions are a pre-merge requirement under ADR 0001; passing npm tests
does not complete these rows or approve a visual baseline.
