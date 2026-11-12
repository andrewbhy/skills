# Design

## Context

See proposal.md for motivation. The clone already has jig-review seats, missed-problems.mjs, test-budget.mjs, a canonical .agents/skills tree and generated Claude pointers. It lacks jig-plan and a launch-time brief schema. Source is the handoff's Verification plan rules 1–4; item 3 supersedes item 2's tester-only review. No implementation is part of this spike.

## Goals / Non-Goals

Goals: one readable plan and one shared enforceable launch contract; reuse seats and budget/history tooling. Non-goals: new UI runner, replacing post-build review, self-acceptance or auto-merge.

## Decisions

1. Keep the build plan and specification on one page. Use required headings plus a short verification table. OpenSpec's four planning artifacts here are evaluation fixtures, not the proposed user-facing jig format. Alternative: four mandatory files; rejected for intake cost.
2. Keep one source in jig-plan plus generated pointers using sync-skills.mjs. Extend jig-review with plan mode instead of creating competing testing/design/architecture seat text. Existing diff mode remains intact.
3. Shared contracts: plan input carries size/signals, exemption reason if any, sections, verification rows (risk/check/layer/expectedSeconds/acceptor/lowerLayerReason), slices (goal/minutes/check), history references and outcome. Each seat returns seat name, brief revision, status (clear/gaps/pending), gaps and edits. The coordinator edits the brief, records selected/skipped seats with reasons and reruns affected seats after material edits. Launch accepts only the current revision's clear required seats or a recorded exemption.
4. Put presence/field checks in a portable Node script called by the launcher, not just skill prose. Review content needs independent judgement; a heading checker cannot prove the plan is sound. No authorization is inferred from a review result.
5. Target a two-minute multi-seat allowance, at most 120 words per seat, using already authorized fresh cheap contexts. If unavailable, record pending. No new provider sessions or agents are launched by this sample. Model/token allowance belongs in project configuration; record measured usage, leave unknown values unknown.

## Verification plan

Estimates below are proposed acceptance budgets, not measurements from this spike. Builder checks are evidence; a fresh tester accepts checker behaviour, fresh provider sessions establish loading, and the person judges plan readability.

| Risk | Check | Cheapest sufficient layer | Expected time | Acceptor |
|---|---|---|---|---|
| Missing sections pass | Negative fixtures delete each required section and row field; expect named refusal | Unit on parsed text | 5 s | Fresh tester |
| Presence mistaken for approval | Pending seat, stale revision and blocking-gap fixtures refuse; valid/exempt controls pass | Launcher integration with stub reviewers | 10 s | Fresh tester |
| Wrong seats/cost | UI/module/behaviour signal fixtures choose required seats; timeout stays pending | Unit | 5 s | Fresh tester |
| Repeated missed problems | History fixture cites an incident and blocks an unreviewed repeat | Unit plus short history review | 10 s + 30 s | History seat |
| Provider drift | sync-skills.mjs --check; fresh provider scenarios for missing/valid/exempt plans | Static plus real skill loading | 1 s + up to 5 min/provider | Fresh provider testers |
| Person cannot judge outcome | Read one representative plan for visible acceptance and exclusions | Person review | 1 min | Person |

Browser/pixel checks: none; text/launcher contracts have no rendering risk. Run on Windows and macOS before claiming support. Real provider checks are reserved because stubs cannot prove skill discovery or provider instruction following.

## History and riskiest unknown

Read relevant skills/product-slice incidents via missed-problems.mjs and docs/missed-problems.jsonl. Runner/design incidents about expensive matrices and partial coverage motivate cost/refusal fixtures; do not treat this summary as a fresh history-seat review. Existing jig-review already forbids builder/coordinator self-acceptance. First prove that a launcher cannot bypass a pending or stale plan outcome; polishing skill prose comes later.

## Risks / Trade-offs

- A missing external launcher integration leaves prose optional: land the contract and refusal fixture first.
- Fixed headings can reward filler: require content review as well as deterministic completeness.
- Fresh reviews can cost more than two minutes: stop pending and replan, retaining completed findings.
- More fields can bloat a page: concise tables and links for supporting evidence; the plan keeps the decision itself.

## Migration Plan

Add checker and template with negative fixtures, then skill and plan-mode guidance, then references and launcher wiring. Preserve current diff review. Rollback disables the new launcher hook and removes the skill/pointer together; retain review evidence. No live installation or merge occurs in this spike.

## Plan-check outcome

PENDING: sample planning artifacts only. No independent seats or real provider scenarios executed; this is not a launchable build brief or an implementation acceptance.
