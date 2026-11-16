# Layer (b) seat brief

Give a fresh cheap context only: `interaction.json` (rendered tables are fine),
the storyboards and the top tasks. No code, no mock, no chat history. It returns
under 600 words per top task, in the report format at the end.

## 1. Cognitive walkthrough, per top task

Take the task's steps in order. At each step ask the four questions and answer
each with evidence from the spec:

1. Will the user try to achieve the right effect (is it the obvious next goal)?
2. Will they notice that the correct action is available (visible, in the
   primary region, at that moment)?
3. Will they connect that action with the effect they want (label, icon, place)?
4. After acting, will they see progress (feedback in object, space and text)?

Also at every step check the screen's hierarchy (is the primary action where the
eye lands first; is the needed control shown at that moment; does a verb live in
more than one place) and the screen map (does the popup that arrives make sense;
can it be left; where does focus go). Add the dead click and the error row: can a
new person continue from each frame using only what is on screen?

## 2. Heuristic evaluation

Over the same material apply Nielsen's ten heuristics: visibility of system
status; match with the real world; user control and freedom; consistency and
standards; error prevention; recognition over recall; flexibility and
efficiency; minimalist design; error recovery; help. For games also check
Pinelle's set: consistent responses to input, adjustable difficulty and speed,
controls that can be remapped, clear goals, understandable status, no needless
repetition, skippable content. For each finding name the principle, not just
the symptom: modes, unlabeled confirmation, a verb in many places, hidden state,
contradictory hover and focus rules, targets too small for the stated monitors,
reading a log to learn an outcome.

## 3. Label-test seat (the five-second label test)

Give a fresh context only the verb labels (the `label` of each verb and the menu or button text, nothing else, no gloss). For each it says in one line what it expects the control to do. The coordinator compares with the gloss: a mismatch is severity 3 and the label changes. Two labels that the seat cannot tell apart are a mismatch.

## 4. Build walk (spec to build)

- Live typed input: does each key reach the live field and request without a
  hidden commit, clamp, lost edit or workaround keystroke?
- Labelled inserted content: is every inserted item visibly labelled so the
  person can tell what arrived, where it belongs and what to do next?

Give a fresh context the flows and the built slice (not the code). Web: a headless browser run. Game: the project-configured headless selftest with real input events; no window. It walks every top task input by input and reports each step where the build differs from the flow: wrong state, missing feedback place, a control not in the layout, an input the registry does not have. Run the checker with `--slice --registry` first. Differences are severity 3.

## 5. First-click and observed time (with the person)

Before the build the person points at the expected target on a static storyboard frame per top task (frames with `firstClick`); a wrong target is a Fix on the label or placement. At layer (d) the observed time per task is recorded against the KLM estimate; over 1.5 times is a finding on the model or the design.

## Report format

One line per finding: `severity 0-4 | task | step | input | heuristic | problem | fix`.
Severity (Nielsen): 0 not a problem, 1 cosmetic, 2 minor, 3 major (blocks),
4 catastrophe. A rule the script failed is never below 3; an outcome readable
only in a log or hidden panel is 3. Finish with `OK` only when there is no 3 or 4, else `BLOCK:` and
the list. State what was not checked. The reviewer never accepts the design;
the person's walkthrough does.
