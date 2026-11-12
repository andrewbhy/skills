# Interaction pattern library

Seed entries in the style of the GOV.UK design system: pattern, use when, avoid
when, evidence. Consult it when a design decision comes up and cite the pattern
by name in the spec. An entry earns its place by evidence from a decision the
person made or a rejection they recorded; add entries only with evidence, and
remove one the person overturns. Quotes are the person's words as recorded in
the project documents of 11 Nov 2026, in which the products are an image-review
app ("the app") and a tactics game ("the game"). Checked by
`node "<skill-folder>/interaction-check.mjs" --patterns patterns.md`.

## Patterns

### Arm then confirm
Use when: an action spends a turn, a resource or cannot be undone (attack, bandage, send for generation). The first click or Enter arms the target and locks a preview; a second click on the same target, or Enter, commits. One grammar for every such action.
Avoid when: the action is reversible and cheap (move with free undo, select, hover): one click, with undo.
Evidence: the person's confirm-model answer in the game's language draft 2 (law 4: "reversible is free, irreversible asks once, in one way"). The rejected grey-box had mode keys plus Enter to confirm, and the person called it "too much friction".

### Back means back only
Use when: a product has several layers and menus. Esc and right-click mean back one step, first match wins (close a sheet, dismiss a prompt, disarm, unpin, then deselect).
Avoid when: never bind them to commit, open a menu, undo or end a turn; do not let a layer reuse them without a listed exception.
Evidence: the strong-reviewer pass on the game's draft 1 found right-click, Tab and digits each meaning two things; draft 2 fixed "Right-click and Esc mean back only; Tab is own units only; digits are the ability bar only".

### No floating panels over a busy grid
Use when: the main surface is a dense grid or board. Overlays are either full-focus (cover the board, one clear way out) or docked in a fixed column.
Avoid when: tooltips-with-controls, popovers and slot menus that hide the cells the person is judging. A popover that needs its own chips signals the wrong pattern.
Evidence: the app's rejected workspace mock ("a spaghetti of controls ... without proper thinking of how the workflow would work"; popovers became more chips each round). The accepted low-fi opens the single-image view full-focus over the board.

### Click selects, drag moves, a button or Enter opens
Use when: items can be focused, selected, moved and inspected. Click focuses or selects, press-and-drag moves the item or the whole selection (ghost shows the count), and a dedicated expand button, double-click or Enter opens the detail view.
Avoid when: a plain click that also edits, acts or opens; one gesture with two meanings in one state.
Evidence: the app's low-fi round 4 interaction model after the person's round 3 review; the game's map: "a click on a ready ally only selects".

### Quick actions on the item, deep work in a full view
Use when: a frequent small decision (keep, reject, tag a flag) repeats per item, next to a heavy task (refine, study, compare). Put the quick action on the item or a key; give the deep task its own dedicated screen with a clear way back.
Avoid when: per-item editing on the card, a second editing surface in a drawer, a quick action that needs three clicks.
Evidence: the app's round 4: "cards stay light: no per-image editing on the card"; workflow drop zones open dedicated screens, after the person's complaint of controls in too many places.

### Infinite scroll with visible loading
Use when: reviewing a long run of images, where order and context matter. One scrolling grid with sticky section dividers, "Loading more..." row, and a count ("245 of 478 loaded", "Run 5 of 12").
Avoid when: the person must reach a specific page or item by number (offer numbered pages as a switch, not the default); content with no stable order.
Evidence: the app's low-fi round 4 made infinite scroll the default with a pager as an option, after the person's review of paged rounds.

### Plain words with count and time
Use when: a button starts work that costs time or money. Label it with the plain action, count and time: "Generate 8 images, about 2 min"; "Commit 48 (about 11 min)".
Avoid when: jargon or engine terms as labels (recipe versions, "run batch") with no cost; a bare "Submit".
Evidence: the app's storyboard button text for a commit; jig's own workflow rule that every control names the workflow step it serves (incident mp-2026-11-11-01).

### Resizable side panels
Use when: a side column holds working detail (recipe, tags, metadata) on monitors from 1366 to 3440 wide. Drag the edge, double-click resets, keys adjust, width is saved.
Avoid when: fixed widths tuned to one monitor; a panel that cannot shrink below the board's needs.
Evidence: the person's ultrawide and 4K monitors, where "elements [were] too small and uncomfortable to interact with" in the rejected mock; the accepted low-fi resizes the right column and the tag sidebar by dragging.

### Hover teaches, click arms
Use when: the person needs odds, cost or consequence before committing. Hover or focus shows a preview card with every figure that the engine will use; hover never changes state.
Avoid when: previews that appear only after commit; two different numbers for preview and result.
Evidence: the game's laws 1 and 2 in language draft 2, replacing the grey-box where the person had to read a log to learn outcomes.

### Refuse with a reason
Use when: an input is invalid (out of range, no line of sight, not allowed). No state change and a one-line reason beside the cursor.
Avoid when: silent refusal, a dead click that looks like a bug.
Evidence: the game's input map row "a silent refusal" in the never-means column; the storyboard rule that every flow has an invalid-input row.

### State on the object
Use when: a piece of state matters to a decision (wounds, queue status, selection). Draw it on the object itself, repeat in at most one other place, and give every state a shape and a word.
Avoid when: state that exists only as a HUD number or only in a log, or colour alone.
Evidence: the game's laws 3, 5, 8 and 9 in language draft 2 ("the log is never required"), from the person's critique that the grey-box interface "gives no value".

### Workflow before screens
Use when: starting any UI. Agree the tasks, steps, decisions, entry and exit; every control names the workflow step it serves or is cut; future features appear as labelled placeholders.
Avoid when: mocking a page that holds everything a study has, then bolting on the next feature each round.
Evidence: incident mp-2026-11-11-01 (four rounds, about 0.7M tokens, rejected as a spaghetti of controls) and the resulting jig-mockup workflow gate.

### Layered navigation with one way back
Use when: a game or app has several layers (shell, strategic map, tactical board, research) and screens inside them. Give the screen map one entry per layer (start, load, resume), one parent per layer, one closer per screen and one named return; the same back input works in every layer.
Avoid when: a layer reachable only through another layer's popup; two different returns from one screen; a layer that redefines back without a listed exception.
Evidence: the person's 11 Nov request for the game interaction plan: a screen map of layers and menus with how each is entered, what closes it and where the user returns (plan docs/plans/2026-11-11-jig-interaction.md, Intent); checked by rules 3 and 3b.

### Interrupting popup queues input
Use when: the game raises a popup on its own (mission end, research done, an enemy declaration). Declare in the screen map its trigger, whether it interrupts, pauses or overlays, what closes it, where it returns and where focus goes; an interrupting popup queues or refuses a pending input with a reason, and the person is never left unsure what happened to their click.
Avoid when: a popup that swallows an input silently, closes only by a hidden key, or returns to a different screen than it interrupted.
Evidence: a game-slice request for auto-popups with entry, close and return rows in the screen map (plan Intent and A8, 11 Nov 2026), which became rule 3b: trigger, effect, closer, return, focus and pending input.
