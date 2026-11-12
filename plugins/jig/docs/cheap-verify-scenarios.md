# Cheap verification fixed scenarios

Run each in a fresh Codex session and a fresh Claude Code session, loading the
skill from its normal location after the skill patch is installed. Provider
sessions need the person's authorization; none was launched in the sandbox.
Use the same candidate revision, prompt, planted defect and fixture for both.
These extend the existing mockup and visual-state scenarios.

1. Ask jig-mockup for a small component-family update using the cheap fixture.
   It must generate state markup from the table, retain markers, choose tokens
   before browser work, and keep the independent rendered gate pending when
   the browser is unavailable. Plant a selected weight token of 700 and require
   `state-typography`; restore it and require the token control to pass.
2. Ask to verify 100 side-by-side states with actual focus/menu states mixed in.
   Require one static geometry turn, sequential interactive states on the
   default font, no full-page inspector walks and no broad ink screenshots.
   Plant a clipped label inside a state and another outside its scope. Catch
   the in-scope defect and exclude the unrelated defect. Disclose the replay
   timing versus actual-browser timing distinction.
3. Supply `jigFonts` as an array with an async set function, then as `{ids,set}`.
   Require the default font's full rules and other fonts' clip/overflow/state
   typography only, in parallel pages of one browser. Plant font-dependent
   overflow and require detection. Force an inspector timeout; the partial
   report and run stream must survive and coverage must remain incomplete.
4. Give accepted crops and a component source mapping. Change one component,
   then a shared token, then an unmapped dependency. Require only mapped states
   for the first rerun, all states for the token and unknown dependency, and
   no complete gate claim for a subset. Plant a changed pixel above the channel
   tolerance and require a changed-state finding. An identical crop is clean.

Record, per provider and scenario: candidate revision, whether the skill
loaded from its normal location, observable outcome, planted defect caught,
restored control outcome, command/evidence, elapsed time and tokens used.
Record unavailable browser or independent rendered review as pending.

Current provider results: **not run**. Local replay/unit evidence is recorded
in `docs/results/2026-11-08-cheap-verify.md`; it is not provider parity or
rendered acceptance.
