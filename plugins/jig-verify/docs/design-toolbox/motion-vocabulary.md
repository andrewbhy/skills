# Motion vocabulary

Use the person's description to find a name, then use that name in the brief
and motion ledger. A name describes an effect; it does not approve its use.
The frequency gate and the person's decisions still apply.

The coordinator answers a loose description with the exact term, a one-line
meaning and its lab link **before building**. If two meanings fit, give the
closest match and one alternative. If there is no stage, say so; agree a small
lab comparison before implementation rather than inventing a link.

## Our lab effects

These names describe the local motion study. The reverse-lookup method is
adapted from [animation-vocabulary](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-vocabulary/SKILL.md);
the meanings and limits below come from the person's motion decisions.

| Loose description | Exact term | Meaning | Lab |
|---|---|---|---|
| Circles around the edge; draws a border after something happened | **Perimeter draw** | One outline traces the boundary to mark a real event, in its result colour; it never means selection. | [Perimeter draw](motion-lab/index.html#perimeter-draw) |
| Glow around the selected thing | **Halo** | A steady outer highlight with a thin outline marks selection; it appears quickly without travelling. | [Halo](motion-lab/index.html#halo) |
| Looks alive while it works; slowly gets brighter | **Breathing** | A subtle 3–4 s brightness cycle reports real continuing work, stopping after about 30 s without events. | [Breathing](motion-lab/index.html#breathing) |
| Scream at the user; keep asking for attention | **Attention loop** | A blocking question breathes at about 0.9 s initially, then pulses about every 6 s until seen; interaction pauses it. | [Attention loop](motion-lab/index.html#attention-loop) |
| A shooting star follows the connection | **Comet trail** | A bright head with a short fading tail traverses an edge once for a real transfer or focus event. | [Comet trail](motion-lab/index.html#comet) |
| The gap closes as the item disappears | **FLIP collapse** | Measure First and Last positions, Invert the difference, then Play transforms as the leaving item exits outside layout. | [FLIP collapse](motion-lab/index.html#flip-collapse) |
| Dashes run along the selected connection | **Edge flow** | A directional crawl accompanies a static edge highlight while focused; the lab shows one finite pass. | [Edge flow](motion-lab/index.html#edge-flow) |
| A dot carries a message | **Message dot** | One dot travels source to receiver per real message; both ends retain their final facts. | [Single dot](motion-lab/index.html#single-dot) |
| Several messages travel quickly | **Message burst** | Up to five dots follow in quick succession; excess traffic becomes a count. | [Message bursts](motion-lab/index.html#message-bursts) |
| Number rolls up or down | **Number ticker** | Digits move in the direction of a real value change, with tabular figures keeping the surrounding layout stable. | [Number changes](motion-lab/index.html#numbers) |

Breathing and attention have an off switch, run only in view, stop when the tab
is hidden, and become steady labelled cues under reduced motion. Attention stops
on hover, focus or opening. Tune outline and halo strength per theme, light first.
The lab is a demonstration, not evidence of acceptance in an application.

## Common descriptions

Each row is paraphrased from
[animation-vocabulary](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/animation-vocabulary/SKILL.md).
“No stage” means this toolbox has no dedicated demonstration yet.

| Loose description | Exact term | Meaning | Lab |
|---|---|---|---|
| Appears gently; disappears | Fade in / fade out | Opacity changes while position stays fixed. | [State change](motion-lab/index.html#state-change) |
| Comes in from the side | Slide in | Translation carries an object into view. | [Arrival](motion-lab/index.html#arrival) |
| Grows into place | Scale in | An object grows from nearly full size, usually while fading in. | [Panel open](motion-lab/index.html#panel-open) |
| Grows out of the button | Origin-aware animation | Scaling is anchored at the trigger rather than at the panel centre. | [Panel open](motion-lab/index.html#panel-open) |
| One replaces another in place | Crossfade | The old surface fades away as its replacement becomes visible. | No stage |
| One shape turns into another | Morph | The outline itself changes shape continuously. | No stage |
| The same object travels into a detail view | Shared element transition | A recognisable object connects its old and new locations and sizes. | No stage |
| Uncovers like a curtain | Reveal / clip-path | A moving clipping boundary exposes content without moving the content. | No stage |
| Soft-edged curtain | Mask | A mask varies visibility, including partially transparent edges. | No stage |
| Items arrive one after another | Stagger | Small start offsets make a group readable as a sequence. | No stage |
| First this, then that | Choreography | Related changes are timed as one meaningful gesture. | No stage |
| Starts quickly, settles gently | Ease-out | Speed falls toward the destination. | [Easing comparison](motion-lab/index.html#easing) |
| Slow, quick, slow move | Ease-in-out | Speed rises and falls during an on-screen move. | No stage |
| Moves at an even speed | Linear | Distance changes uniformly with time. | [Easing comparison](motion-lab/index.html#easing) |
| Springy; carries a flick into the next move | Spring / momentum | A physical response carries position and velocity toward a new target. | [Easing comparison](motion-lab/index.html#easing) |
| Bouncy when it appears | Pop in / bounce | An entrance overshoots its resting size or position; visible overshoot is outside our house style. | No stage |
| Can grab it while it is still moving | Interruptible animation | New input redirects from the currently displayed value. | No stage |
| Presses in under my finger | Press feedback | A small temporary scale change acknowledges pointer-down. | [Button recipe](motion-recipes.md#button-press) |
| A section folds away | Accordion / disclosure | Content visibility changes while its trigger and expanded state remain clear. | [Fold](motion-lab/index.html#fold) |
| Resists at an edge, then returns | Rubber-banding | Increasing resistance communicates a drag boundary. | No stage |
| Tiny jitter, broken movement | Jank / dropped frames | Missed rendering deadlines interrupt continuous motion. | No stage |
| Shiny loading sweep; floating background | Shimmer / idle animation | Repeating decorative motion; not used in the application toolbox. | No stage |

For implementation use [motion recipes](motion-recipes.md). Full MIT notice:
[toolbox attribution](README.md#borrowed-practices-and-attribution).
