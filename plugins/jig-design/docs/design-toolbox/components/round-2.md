# Golden components, round 2 — 8 November 2026

Goal: choose, operate and copy ordinary desktop application controls while
keeping the current document, selection and keyboard position. The person's
moment is checking an application at working density, especially overlay edges.
The first thing to notice is the current workspace and its selected file.
Scenario: organise a small release workspace, inspect a file, change its tags,
resize panes, open contextual commands, delete locally and undo.

This is an offline interaction prototype, not a production component library.
The existing golden reference is the starter. No image-generation round is
needed for this ordinary application composition. Review sizes: 1400×900 and
560×900, 1× and 2× device scale, plus 200% zoom simulation. Themes: White board
and Electric for the live matrix; all seven remain available and token-checked.

Carry-forward Fix (person, 8 Nov): “margins are off, components clipping
(context menu a real bad offender, tooltip)”; apply actual open-state checks.
Fix: “and no motion?”; add replay and frame review. Strong objection: “these
feel website-like”; use a fixed window frame and independently scrolling panes.
Keep: semantic packs, one SVG outline set, visible names, native input semantics,
local actions, and no focus movement on load. No other dated Keep was supplied.

## Purpose ledger (written before markup)

| ID | Question | Encounter | Quiet default | Without it | Check |
|---|---|---|---|---|---|
| window | Where am I working? | Always | Title bar | Lose document context | Fills window; no document scroll |
| app-toolbar | What can I do here? | Current workspace | Named actions and shortcuts | Commands become hidden | Roving arrows; keyboard alternatives |
| explorer | Which file? | Navigation | File tree | Lose hierarchy | Arrows, Home/End, expand and select |
| editor-tabs | Which document? | Open documents | Closeable tabs | Lose placement | Select, close, overflow, focus retained |
| app-breadcrumbs | Where is this file? | Selected file | Ancestor links | Lose path context | Navigate ancestors |
| app-grid | Which items and properties? | Workspace | Sortable file grid | Cannot select/work in bulk | Shift/Control selection; resize; sort |
| app-table | What changed? | Workspace detail | Readable table | Cannot compare values | Header associations; narrow scroll |
| app-splitter | How much room? | Pane edge | Separator | Cannot resize work area | Pointer and arrow resize, min/max |
| inspector | What properties? | Selected file | Labelled property fields | Cannot edit selection | Independent scroll; draft preserved |
| app-status | What is selected? | Always | Quiet count/receipt | Lose action result | Durable Undo; live status |
| popover | Which view settings? | On request | Closed trigger | Cannot adjust local view | Escape/outside; anchored origin |
| dropdown | Which alternative? | Split action | Closed menu | Action alternatives hidden | Roving keys; Escape; bounds |
| split-button | Primary or alternate action? | Toolbar | Two attached buttons | Lose default action speed | Main action and menu independently named |
| combobox | Which owner? | Inspector | Labelled input | Cannot find an owner | Filter, arrows, Enter, Escape; IME |
| slider | What scale? | Inspector | Labelled range | Lose continuous adjustment | Native arrows; value output |
| number-input | How many copies? | Inspector | Labelled spinbutton | Cannot enter precise count | Increment/decrement, clamp, invalid input |
| accordion | Which detail group? | Inspector | First group open | Long property list | Two-beat toggle; keyboard immediate |
| disclosure | More details? | On request | Closed summary | Lose optional detail | Native keyboard toggle |
| avatar | Who owns it? | Owner field | Initials with name | Lose author cue | Name accessible; unknown fallback |
| count-badge | How many? | Tree/header | Exact count | Lose volume | 0, 1 and huge values wrap |
| kbd | What shortcut? | Action | Small hint | Harder to learn keys | Text and actual bound action agree |
| command-palette | Which command? | Ctrl/Cmd K | Closed | Commands harder to find | Filter; arrows; Enter; focus return |
| inline-alert | What needs correction? | Error | Local message | Error loses its field | Associated field; no reliance on hue |
| banner | What affects the workspace? | Local sample mode | Dismissible notice | Sample consequence unclear | Dismiss and restore on reset |
| skeleton | What is loading? | Explicit replay | Static placeholder | Loading structure absent | No false progress; no ambient loop |
| toggle-group | Which view? | Toolbar | One pressed view | Lose mode | Roving focus; exactly one pressed |
| tag-input | Which labels? | Inspector | Removable tags and input | Cannot edit labels | Enter add; Backspace remove; Undo |
| app-link | Where is the reference? | Detail content | Underlined link | No source access | Visible focus; copyable destination |
| code-block | What is the content? | Selected file | Preformatted reading | Lose code structure | Own scroll; copy action local |
| drag-handle | Where can I reorder? | Grid row | Named handle | No drag affordance | Visible drop target; Alt arrows alternative |
| replay | How does it change? | Component heading | Replay control | Cannot inspect motion | Restart cancels pending work |
| sample-playback | How does the scenario progress? | Opt in | Paused | Cannot review arrival sequence | Play/pause/replay/reset; hidden-tab pause |

## Evidence and decisions

Sources consulted 8 Nov 2026. Guidance supports the pattern, not every numeric
choice. The person's approved 28 px / 12–13 px / 4 px brief is the numeric
authority. Local density tokens are in `application-tokens.css`; theme semantic
roles stay authoritative for colour. No new palette is introduced.

| IDs | Decision and published evidence | Interpretation / limit |
|---|---|---|
| window, explorer, inspector | [Apple, designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos): keyboard and pointing-device input; [windows](https://developer.apple.com/design/human-interface-guidelines/windows) and [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Fixed application frame; compact window collapses auxiliary panes on request. This is a browser mock, not native macOS window chrome. |
| app-toolbar, app-grid, app-status | [VS Code UX architecture](https://code.visualstudio.com/api/ux-guidelines/overview), [context menus](https://code.visualstudio.com/api/ux-guidelines/context-menus) | Separate navigation/editor/status regions; context-specific file actions. No extension or VS Code runtime implied. |
| all | [Fluent layout](https://fluent2.microsoft.design/layout) | 4 px spacing base; use explicit local exceptions for contiguous rows and border joins. Fluent also permits 2/6/10; this round follows the person's stricter grid. |
| window, inspector | [Windows responsive techniques](https://learn.microsoft.com/en-us/windows/apps/design/layout/responsive-design) | Reposition or reveal panes at narrow widths while keeping controls reachable. |
| combobox, dropdown | [Fluent combobox](https://fluent2.microsoft.design/components/web/react/core/combobox/usage) and [Radix primitives inventory](https://www.radix-ui.com/primitives/docs/overview/introduction) | Label separately; filter long choices; retain typed text. The inventory is a coverage comparison; no dependency is installed for an offline prototype. |
| app-grid, command-palette | [Linear issue selection](https://linear.app/docs/select-issues), [context-menu design](https://linear.app/now/invisible-details) | Distinguish focused row from selected set; allow range and additive selection; expose contextual commands by pointer and keyboard. |
| inspector, app-splitter | [Figma navigation](https://help.figma.com/hc/en-us/articles/360039831974-Explore-the-navigation-bar-and-left-sidebar), [properties panel](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar) and [UI3 retrospective](https://www.figma.com/blog/our-approach-to-designing-ui3/) | Official indexed article text was available; direct fetch was blocked. It supports separate navigation, work area and properties, and fixed, resizable panels. No Figma geometry is copied. The top toolbar follows the desktop workbench context, rather than Figma's bottom canvas toolbar. |

## Motion gate and language

Every row answers frequency, purpose, easing and fastest useful duration. The
shared `motion-lab/tokens.css` remains the authority. Timing multipliers 2×/5×
are review conditions; direction variants are **Compact workspace** and
**Comfortable workspace** on the single density axis, same data and geometry.

| Components / moment | Frequency | Purpose | Easing / duration | Rest and reduced motion |
|---|---|---|---|---|
| menu, dropdown, popover, combobox, tooltip appear | Occasional pointer opening | Tie surface to its trigger | ease-enter; duration-popover 160 ms; scale .96→1 + opacity | Full size; reduced opacity only; keyboard opening instant; adjacent tooltip instant |
| dialog opens / command palette opens | Occasional / very frequent palette | Establish modal plane / immediate command access | Dialog centre .96→1 + fade, 160 ms; keyboard palette instant | Focus remains inside; reduced opacity only |
| toast arrives / leaves | Occasional | Confirm local destructive action and Undo | From bottom 8 px, 160 ms; exit 120 ms | Persistent until dismissed; reduced opacity only |
| accordion, disclosure, tree pointer expansion | Occasional | Explain newly revealed hierarchy | Content fades (80 ms), layout changes once, content appears (80 ms); ease-enter | Never animate height; keyboard toggles instant; reduced fades only |
| tabs indicator changes | Tens/day pointer; 100+ keyboard | Show related panel | Translate indicator; duration-feedback 120 ms; ease-move | Selected surface stays; keyboard immediate; reduced colour only |
| buttons, split-button, drag-handle press | Frequent pointer | Tactile response | Scale .97; duration-feedback 120 ms | Scale 1; reduced colour only |
| checkbox changes | Occasional pointer | Confirm a completed choice | Box colour then tick drawing; duration-feedback 120 ms | Native checked fact; reduced colour/opacity |
| badge, avatar, alert, banner, skeleton, kbd, link, code, number, range, tags, table | On explicit change or Replay | Explain arrival or local feedback | Brief opacity / colour; duration-feedback 120 ms | No perpetual shimmer or synthetic activity |
| focus, selection, typing, range drag, resizing, roving tree/list/menu/toolbar focus | 100+/day | Immediate precise control | Rejected: frequency and task speed; no animation | Instant in all motion modes |

Rejected candidates: animated grid sorting (frequency: repeated scanning must
stay immediate); sliding keyboard focus (purpose: delays exact targeting);
shimmering skeleton (purpose: suggests progress without evidence); bouncing
status count (frequency: distracts on every selection). Selection and focus
never wait for motion. Replay is explicit and paused initially. Hidden tabs
cancel replay and pause scripted sample timers; reset cancels all pending work.

## Data boundary and limits

The existing `GoldenData.view(mode)` feeds workspace grid, file tree, selected
title, path, counts and inspector. Titles and paths are unbounded mock strings;
owner is optional, tags unbounded, no invented API maximum. Demo 3, One 1,
Empty 0, Many 32 displayed records; Worst case has eight displayed records and a
separate billion-record illustrative total (never claimed loaded). Input drafts
belong to their controls and do not reset on a theme/density/data switch.
Plain text is deliberate reading content in descriptions, code and file names.

## Review record

Baseline, Windows Chrome 157: static clip check finds no clips while overlays
are closed, and reports eight native-widget gaps. The spacing probe finds
489 candidates per viewport when off-grid checks are included. Root cause:
the document sets root type to 13 px, turning every rem-based spacing token
into a fractional spacing (16 becomes 13, 8 becomes 6.5), plus margin/grid
double spacing. Round 2 fixes root geometry independently of desktop type.

Acceptance and the next-day motion review remain pending until evidence is
recorded in README. macOS and assistive technology are not tested here.
