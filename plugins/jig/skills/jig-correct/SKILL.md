---
name: "jig-correct"
description: "Record a missed problem after checks passed, classify it, detect repeats and carry a rule review into a brief, named check or skill edit. Use for the correction loop, not ordinary bug implementation or acceptance."
---

# jig-correct

Work mode: in a project that is not one of the person's own registered projects, write plans, results, reviews and design notes under the personal jig store (`~.jig<project>plans`, `results`, `design`), never into the repository, unless the person says otherwise; the helpers already keep their own state there.

Own the lesson from a missed problem, not approval of the work.

Start: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-correct/telemetry.mjs" start "<project-root>" <provider>`;
retain the run ID (`off` means disabled). Read jig's [VERSION](VERSION).
Read [testing.md](testing.md#missed-problems-log) for the log schema and
[missed-problems.md](missed-problems.md) for intake and rule-review requirements.

1. **Record the incident.** Read docs/missed-problems.jsonl, falling back to the
previous filename only as the helper documents. Migrate legacy rows before new
writes; keep all incidents and unknown origins. Search for the same incident
before appending: update its action, preserve its ID and original source, and
never count reproduction as a new discovery. A recurrence is a new incident.
Record a stable ID, date, what happened, who found it, source, lowest test layer
that should have caught it (or person only), and action or pending work.
2. **Classify and compare.** Assign area (design, runner, skills, product slice)
and a stable class such as low-contrast, selection-inconsistency,
partial-coverage or self-acceptance. Reuse the earlier fault family rather than
renaming it to hide a repeat. Compare earlier entries with the same area/class;
mark a recurrence repeat: true. Run
`node "${CLAUDE_PLUGIN_ROOT}/skills/jig-correct/missed-problems.mjs" --area <area>` and report open repeats.
3. **Review the failed rule.** A repeat blocks the next round for that area.
Write a short incident-linked Markdown review under docs/results/: use
`## Rule failed` for the rule and why it missed this, and `## Changes` for
what changes and how it will be checked. Name every incident ID covered. Add
its project-relative path as ruleReview in each repeated row. Do not use an
unrelated report or promise a review later to lift the block. Rerun intake.
4. **Make the lesson usable.** Carry each relevant incident into one brief line
and a named executable check or an explicit rendered/reference review assertion.
Use the lowest useful layer; prove the check detects the defect and then passes
when fixed. If the failure is in the method, edit the owning skill's single
source and regenerate its support and pointers; follow the project's skill
scenarios before merge. Keep project facts in project configuration. Report
proposed edits separately if protected files require a patch. The coordinator
can triage but cannot accept its own correction; request a fresh seat for
acceptance, with renders and reference for UI. Noise dismissals need that seat's
agreement and a checker calibration item.
5. **Read success measures at retros.** Compare the plan-check ambiguity line
(distinct tier 3 goals without a same-ID tier 1/2 proxy / all goals) and its
collection evidence with missed problems, rework and the person's structured
judgment. Legacy or missing scores are unknown, never zero. Propose better
metrics/proxies or threshold calibration; only the person chooses a tighter
plan.ambiguityGate or plan.ambiguityThreshold after the retro. The default is
a soft warning at >= 0.5; do not change configuration automatically.
   Compare confirmed glossary translations against the person's verdicts.
   Record both measured results and the verdict with dated file evidence in
   the explicit owning glossary using goal-translate.mjs verdict. When
   measures pass but the person says not met, the verdict wins: work is not
   accepted. Set last verdict to not met; run goal-translate.mjs retro with
   the same personal/project paths to list failed translations. Revise the
   failed meaning and seek reconfirmation; do not erase the failed evidence.
   Maintain [measures.md](measures.md) by discipline then outcome. Add measures
   found in plans, plan checks, trials and retros as proposed with tier and
   source. Compare measures with verdicts and link validation evidence before
   marking validated; retire predictors that fail, retaining evidence and
   limits. Do not copy personal vocabulary or private evidence into jig.
6. **Hand back the loop.** Report incident IDs, area/class, repeats, rule-review
link, brief line, named check and executed evidence. Separate written reviews,
implemented changes, pending checks and provider scenario gaps. Re-run intake
before the next round. A closed rule-review block does not prove the product
fixed or grant presentation, merge or deployment authority.

End: run `node "${CLAUDE_PLUGIN_ROOT}/skills/jig-correct/telemetry.mjs" end "<project-root>" <provider> <run-id> <passed|failed|stopped|partly>`;
disclose marker failures and keep unknown token counts unknown.

## Retro signals

In the same reply turn, record escape (link mpId), coordinator-error,
lost-work, false-alarm and dependency with the signals.mjs helper beside this
skill. Read signal-kinds.md for the one owner of each kind. Search the private
log for the same incident first; update it rather than duplicating it. A
recurrence is a new record; the helper supplies repeatOf. Use project or
environment level for work details. Use jig level only for harness behaviour,
never project content. Keep committed journal and missed-problems entries
general; private signals may identify the tool involved and hold the detail.

Before each retro report, the coordinator sweeps the person's messages,
handoff notes and ledgers since the previous retro. List incidents with no
signal, record each through add with caughtBy retro-sweep, then run report
with --level and --since. The report's Unrecorded count comes from those rows;
an unavailable source is a gap, never a zero. Show the private report once.
Use consume <plan-link> <ids...> for records addressed by a decision or skill
plan; open skill-gap and skill-misguided stay until a plan consumes them.
Run prune only after recording consumption. Environment reports go to stdout
or an explicitly chosen --out path, never automatically into the harness.

## Provider notes

- **Codex:** use codex for telemetry. Load the canonical .agents/skills/jig-correct/ source.
- **Claude Code:** use claude for telemetry. The generated .claude/skills/jig-correct/SKILL.md points to the canonical source; resolve supporting files there.
- **Both:** use already authorized tools only. Do not start provider sessions for scenarios or acceptance without authorization. Record unavailable independent review as pending.
