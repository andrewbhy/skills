# Responsive regions (slice 1 draft)

Sources, rationale and qualification for every rule are in the linked rows of
[rules.md](rules.md). This table is a local adaptation of Material's window
classes to **available container inline size**, not viewport or device type.
Thresholds and columns are [G14–G16](rules.md); gutters and margins are G17–G18.
Numbers are CSS px unless marked otherwise. Source verification is pending.

| Class / available inline size | Columns / gutter / inline margin each side | Navigation rail | Main task | Inspector / side | Second task pane | Rule and source |
|---|---|---|---|---|---|---|
| Compact: 0–<600 | 4 / 24 / 16 | Drawer via labelled navigation control | Visible, single reading flow | Bottom sheet on demand | Bottom sheet on demand | [G20](rules.md), [Material 3, Compact width](https://m3.material.io/foundations/layout/applying-layout/window-size-classes); mapping is local. |
| Medium: 600–<840 | 8 / 24 / 24 | Drawer | Visible | Task sheet on demand | Task sheet on demand | [G21](rules.md), [Material 3, Medium width](https://m3.material.io/foundations/layout/applying-layout/window-size-classes); mapping is local. |
| Expanded: 840–<1200 | 12 / 24 / 32 | Visible | Visible | Task sheet on demand | Task sheet on demand | [G22](rules.md), [Material 3, Expanded width](https://m3.material.io/foundations/layout/applying-layout/window-size-classes); mapping is local. |
| Large: 1200–<1600 | 12 / 24 / 32 | Visible | Visible | Visible if content fits | Task sheet on demand | [G23](rules.md), [Material 3, Large width](https://m3.material.io/foundations/layout/applying-layout/window-size-classes); mapping is local. |
| Extra-wide: >=1600 | 12 / 24 / 48 | Visible | Visible | Visible if content fits | Visible if content fits | [G24](rules.md), [Material 3, Extra-large width](https://m3.material.io/foundations/layout/applying-layout/window-size-classes); mapping is local. |

The table's columns describe a grid **inside a region**, not a second column
grid spanning the rail and all panes. The shell chooses region presence from
its own width; a board inside main chooses its own class and margin from its
available width (G15, G18). A 1440 px shell can have a medium-width main region.
Avoid double page margins by assigning the region grid a single margin owner.

G24 treats the table as the maximum visible set. Content fit may require fewer
regions: collapse second pane, then inspector, then rail. Minimum useful pane
widths and shell gaps remain slice 2 questions. Preserve the task rather than
compressing fonts or inventing smaller gaps (G13). An opened sheet temporarily
overlays the main task; it does not mount another copy of its state. One modal
surface opens at a time (G20, G25).

At a boundary, the new class starts exactly at its stated lower bound. The
later example's 420, 760, 1100, 1440 and 1920 px **container** cases correspond
to compact, medium, expanded, large and extra-wide respectively; 320 px is the
additional reflow case (G14, G26). Slice 2 must also try immediately below/at
each threshold and narrow nested regions. This mapping is a test intention,
not evidence that a rendered layout passed.

Phone rules, including narrow embedded regions:

| Rule | Behavior | Source with section |
|---|---|---|
| P01 Main first | Keep one reading flow, with navigation in a drawer and auxiliary tasks in bottom sheets. Keep every task reachable. | [G20, G25](rules.md); [Material 3 window classes](https://m3.material.io/foundations/layout/applying-layout/window-size-classes), Compact width (local mapping). |
| P02 Reflow | At 320 CSS px, no two-dimensional scrolling for ordinary text/controls or lost functionality. Put an essential map/table's two-dimensional scrolling in its own region. | [G26](rules.md); [WCAG 1.4.10, Reflow and exception](https://www.w3.org/TR/WCAG22/#reflow). |
| P03 Targets | At least 24 by 24 CSS px by default everywhere; 44 by 44 for compact/touch layouts, including touch on a wide screen. Visible icons can be smaller than hit areas. | [G28–G29](rules.md); [WCAG 2.5.8, Target Size (Minimum), exceptions](https://www.w3.org/TR/WCAG22/#target-size-minimum); [Apple HIG Layout, minimum control size](https://developer.apple.com/design/human-interface-guidelines/layout) (web adaptation; verification pending). |
| P04 Composer | Pin to the visible task region's bottom outside scrolling history; accommodate long input, safe areas and software keyboard without hiding the last message or actions. | [G30](rules.md); project D5 in [notes](notes.md#project-decisions); [Apple HIG Layout, Safe areas](https://developer.apple.com/design/human-interface-guidelines/layout) (section label pending verification). |
| P05 Sheets | Dismissible bottom sheet, title and close control; Escape, contained focus and focus return; long content can fill and scroll the sheet. Preserve task state on collapse. | [G25, G31](rules.md); [toolbox Craft basics, Every overlay can be left](../README.md#craft-basics-the-reviewer-checks-before-the-person-sees-anything-person-7-nov-2026); project D5 in [notes](notes.md#project-decisions). |
| P06 Stable rhythm | Keep the chosen type scale and spacing; recompose regions instead of shrinking everything. User text-spacing overrides must not clip or lose content. | [G13, G27](rules.md); [Every Layout, Sidebar and Switcher](https://every-layout.dev/layouts/); [WCAG 1.4.12, Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing). |
