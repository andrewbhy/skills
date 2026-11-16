# Motion lab

Generic motion stages with the toolbox house style. Open [index.html](index.html) from disk. Play and Replay rebuild every scene object and cancel outstanding animations and scheduled callbacks; speed changes reschedule remaining delays. Hidden stages and hidden tabs cancel work. Reduced motion preserves final facts and receipts.

The stage lifecycle, speed scheduler, cancellation, spring functions and Lucide icon geometry are copied and adapted from a local project's motion study dated 7 November 2026 (source index SHA-256: ef0f679bd4236a3fd63155a4c0b54ba515ac836ba033fad3a4b9c33ddf5af6a8). Source files were read only; project-specific sessions, tickets and hand-off scenes are excluded. Generic stages have been adapted to plain items, groups, panels and source/destination links. Lucide 0.468.0 geometry retains its [ISC notice](LUCIDE-LICENSE.txt). Other extracted code remains under the repository's existing terms; no separate third-party licence was present in the local study.

Timing defaults live in tokens.css; the panel writes those same CSS custom properties. Per-stage speed scales animation and scheduler time. Framework helpers remain a classic script so file URLs need no server or module fetch. Projects may copy this framework and supply their own stages; neither project scenes nor project tokens belong here.

The shared duration tiers and easing curves now live in [tokens.css](tokens.css).
General UI defaults finish under 300 ms; the transfer scene uses the separate
explanatory budget (250–1250 ms). The timing panel and speed slider deliberately
allow experiments outside those defaults; they do not approve a production
timing. The movement and drawer scenes select their own easing tokens, while
constant transfers use linear. Reduced motion drops movement and drawing but
keeps brief opacity feedback; transfer receipts remain without travelling dots.
These practices are adapted from Emil Kowalski's emil-design-eng,
review-animations/STANDARDS and choreograph; source links and the full MIT
notice are retained in the [toolbox attribution](../README.md#borrowed-practices-and-attribution).

Run `node check.cjs` for virtual-time scene and replay checks. These cannot establish actual browser layout, paint, accessibility, animation feel or visual replay consistency. Those remain pending; no browser was launched.

The [motion vocabulary](../motion-vocabulary.md) links directly to named stages,
including perimeter draw (event), halo (selection), breathing (real work),
attention loop (blocking question) and FLIP collapse. Breathing simulates one
event then stops at 30 seconds of silence; attention is a bounded 30-second
preview, acknowledged by hover, focus or click. Stop all is the preview's pause
control. Applications must also wire interaction pause/resume and settings,
visibility and actual event activity. These guards are not an application engine.

[Control recipes](../motion-recipes.md) use tokens.css plus recipes.css and the
optional recipes.mjs lifecycle adapters. They are tested separately with
`node --test tests/motion-recipes.test.mjs` from the repository root. The new
stages and adapters remain prototypes pending rendered and feel review.
