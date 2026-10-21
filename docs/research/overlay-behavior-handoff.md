# Research handoff · why the store cards feel wrong

For: an agent investigating the live behavior of the glasses overlay in this repo. Everything you need to reproduce is below; the repo is the source of truth. Read `CLAUDE.md` first for the project's rules.

## 1. What the owner sees

Playing the demo live (desktop, drag to look):

1. Looking at a store, nothing happens for "a good couple of seconds", even though a lit circle (the pip) is above it.
2. Distant stores ahead don't respond until they are almost overhead.
3. When a card does appear in the right place, it then "teleports" across the screen, trailing a long squiggly line back to the store.
4. Looking at the Post Office, the card "changed shape about four times in 1 to 2 seconds".
5. The lit circles promise something that often doesn't happen.

The owner's mental model, which the fix should serve: two kinds of proactivity. **Attention**: you have looked at something for a few seconds, so the glasses offer more (book the show, see reviews). **Awareness**: the glasses noticed something relevant to what you're doing and say so. The owner suspects the awareness layer (pips on everything) is part of the problem.

## 2. The pipeline, end to end

The overlay renders decisions from a deterministic brain. Nothing is random; every run can be replayed.

| Stage | What happens | Where |
| --- | --- | --- |
| Live gaze | Each sim step (60 Hz) picks the gaze target: the shopfront whose projected outline contains the view center, else the place whose pip is within 70 px of center, else the nearest frontage within 3° (6° to keep). Everything within 70 m. | `apps/web/src/walk.ts` `liveGaze` (line 248) |
| View follow (pursuit) | Once the head has settled on a target for 300 ms, the view keeps following it as the wearer walks, until the user drags. | `apps/web/src/walk.ts` `pursue` (315) |
| Dwell clock | Dwell counts from when the target last changed; any change resets it to 0. | `packages/sim/src/sim.ts` `updateGaze` (247), `gaze` (285) |
| Brain tick (10 Hz) | Gates (safety, snooze, budget) run first; then the dwell ladder. Glance at 0.8 s of dwell; card after a further 0.8 / 1.0 / 1.6 s (Stopped / Stroll / Walk); expanded after 2.0 s more on the card, Stopped or Stroll only; nothing above a pip in Brisk. Looking away for 1.2 s walks down one level. The gaze target always gets at least a pip. | `packages/brain/src/ladder.ts` `step` (79), `earnedByDwell` (71), `bandCap` (47); `packages/brain/src/config.ts` lines 64 to 77 |
| Decision → overlay | `overlay.apply` stores the standing decisions; `overlay.update` runs every render frame and decides the pane level to show (`paneLevelFor`), which can be lower than the brain's (edge collapse, step-down, dropped). | `packages/overlay/src/overlay.ts` `paneLevelFor` (477), `update` (565), level choice (627) |
| Level change | Every change of shown level is a full **transition**: dissolve the old pane, light travels, a **new** pane is built and condenses in. Placement-only changes are debounced 400 ms; brain changes and drops are immediate. A content-structure change at the same level also re-condenses. | `overlay.ts` `transition` (510), shape check (646) |
| Placement | Per pane per frame. Centered above the anchor first, then centered below, then the side positions; focus zone (clear middle of the view) applies except to the gaze target's pane; distance scale `clamp(30/d, .92, 1.2)` times a viewport scale; edge collapse (card→glance within 8% of the screen edge, glance→pip within 4%); step-down when a level can't fit; 1.2 s hysteresis on a configuration; 4 px rope dead band. | `packages/overlay/src/place.ts` `Placement.update` (128); `packages/shared/src/placement.ts` `candidate` (65), `configRect` (102), `placeWorld` (122) |
| Step aside (rule 8) | Keep-outs = projected bounds of moving vehicles and people within range, unioned with their position 0.45 s ahead. A face or a moving vehicle acts on the first frame. If the pane can't slide clear within 90 px, it drops to a dimmed pip and condenses back 300 ms after clear. | `apps/web/src/bridge.ts` `keepOuts` (179), `rect` (151); `place.ts` `Aside` (294), `solve` (356) |
| Leader (the line) | A 64-point cubic Bézier in **world space** from the pip to a point on the ray through the pane's corner at depth `min(anchor depth × 0.55, 6 m)`. Control points: 30% along +0.15 m up, 75% along −0.1 m down. Drawn on with `progress`, or blended between the old and new corner (`mix`) during a promotion. | `packages/overlay/src/bridge.ts` `leaderPoint` (3); `apps/web/src/bridge.ts` `createLeader` (313); `overlay.ts` (720 to 735) |
| Motion | Travel 320 ms to a glance, 460 ms to a card; condense reveal starts 180 ms in and runs 360 to 480 ms; dissolve about 460 ms; promote travel starts 200 ms into the dissolve. | `packages/overlay/src/motion.ts`; timings in `packages/overlay/src/tokens.ts` |

## 3. Confirmed defects (with evidence)

**D1 · Keep-outs blow up to cover the whole screen when a car passes close.** `bridge.rect()` projects the 8 corners of a 3D box and takes their screen bounds, skipping only corners behind the camera. A corner barely in front (depth just over 0.05 m) projects to huge coordinates. Evidence: Errands at 1:09.77, the Post Office card was dropped by vehicle `v48` whose keep-out rect was **6398 × 2854 px** on a 1920 × 1080 view. Over full walks, 7% (Errands), 10% (Hungry) and 19% (Just walking) of brain ticks have a keep-out covering more than half the screen; some are real occluders (the delivery truck), many are this artifact. Every pane drops while it lasts and re-condenses afterwards. The same algorithm is in `packages/sim/src/headless.ts` `screenRect` (line 15), so recorded walks and evals inherit it. This is the most likely cause of complaint 4 and part of 3.

```ts
// apps/web/src/bridge.ts
for (let i = 0; i < 8; i++) {
  const p = this.project({ x: i & 1 ? b.max.x : b.min.x, y: i & 2 ? b.max.y : b.min.y, z: i & 4 ? b.max.z : b.min.z });
  if (!p.inFront) continue;          // depth > 0.05 only; no near-plane clipping, no clamp to the view
  x0 = Math.min(x0, p.x); /* ... */
}
```

**D2 · The brain keeps climbing while the overlay has dropped the pane.** "Dropped" is overlay-only state; the brain doesn't know. Trace (Errands, Post Office): glance shown 1:07.4 → card 1:09.0 → dropped by D1 at 1:09.78 → brain promotes to expanded at 1:11.4 while nothing is visible → expanded condenses at 1:11.85. The user sees glance, card, nothing, expanded: four shapes in under three seconds.

**D3 · Every level change rebuilds the pane.** Glance → card → expanded are three different DOM panes with different sizes, each placed fresh (centered above the anchor), each with its own dissolve, travel and condense. Positions measured on the theater at 1920 × 1080: glance at y 403, card at y 333, expanded at y 72 (300+ px above the pip). It reads as jumping, not growing, and the leader stretches each time.

**D4 · Snooze fires by accident in live play.** Rule 12: pitch above 0.35 rad for 1 s with no gaze target snoozes for 60 s (`packages/brain/src/brain.ts` `updateSnooze`, line 300). Dragging the view up to look at a tall building does exactly that. Owner's log: at 0:37.9 every pip is dismissed and from 0:38.0 every place is held with reason "Snoozed". The only cue is "60 s" on the small glyph bottom-left.

**D5 · A 22-second window with no cards at all.** Hungry is scripted Brisk from 0:36 to 0:58 (`docs/scenarios.md`, pace script); rule 11 allows only the one-line whisper in Brisk. Looking at a lit store in that window does nothing, and nothing explains why.

**D6 · It's slow even when everything works.** Measured live (holding the view on the store with the view-follow): glance visible about 1.9 to 2.2 s after the look starts, card visible about 3.7 to 4.3 s. Composition: dwell thresholds (0.8 s, then 1.6 s more in Walk), the brain's 10 Hz tick, travel and condense.

**D7 · Distant targets get captured by nearer ones on the same line of sight.** Hungry at 0:29, aiming at the Post Office (across the cross street), the gaze went to the M4 stop, then the 47th St Station, then Corner Hardware, all along the same line; the view-follow then follows the wrong one. Shopfront outlines of facades seen nearly edge-on are long thin slivers that cover the vanishing direction.

**D8 · Pips flicker as the view sweeps.** The gaze target always gets at least a pip, and a low-relevance pip is dismissed by score once the gaze leaves. Owner's log: the pharmacy pip is shown and dismissed at 2.9, 4.1, 4.6, 5.8, 10.1, 11.3 s. Sweeping the view lights and unlights things along the way.

**D9 · The inspector can't see any of this.** It logs brain decisions only. Overlay-side changes (drops, step-downs, edge collapses, re-condenses, placement jumps) leave no trace, so the owner's log shows four Post Office steps over 7 s while they saw four shape changes in 2 s.

## 4. Hypotheses still to test

**H1 · The squiggly line.** The leader is a 3D Bézier whose control points go up then down (an S by construction), running from a pip 20 to 70 m away to a point at most 6 m from the eye. When the pane jumps (D1, D3, a placement re-decision) the near end jumps and the curve sweeps. Check whether a straight screen-space segment from pip to pane edge, drawn in 2D, removes the complaint.

**H2 · Placement re-decisions that look like teleports.** `focusOk` is true only while the place is the gaze target, recomputed every brain tick. When gaze flickers (D7, D8), the pane's configuration becomes invalid, it is re-placed and animated across over 320 ms (`kickFrom`, `place.ts`). Also check the step-down retry every 1.2 s (`place.ts` line 191) for card/glance oscillation, and edge collapse at 8% and 10%.

**H3 · Content-shape re-condense.** `overlay.ts` line 646 re-condenses a pane when the structure of its content changes between ticks at the same level. The reading budget trims copy by pace and distance; if a fact or the reason line toggles from tick to tick, the pane rebuilds. Not seen in my traces, worth a targeted check.

**H4 · The evals can't catch any of it.** `packages/sim/src/headless.ts` is a simplified placement (no step-down, no step aside, no debounce, no transitions), so recorded walks pass while live behavior is wrong. An overlay-in-the-loop test is missing.

## 5. Reproduce

```
pnpm install
pnpm dev                                   # http://localhost:5173
```

Live: `http://localhost:5173/?scenario=hungry` (or `errands`, `walking`). Press I for the inspector; its Signals tab shows "Looking at" and the dwell.

Tools (all use the installed Chrome; run with the dev server up or they start one):

```
# Turn the view onto a place at a walk time, hold still, sample every 100 ms:
# gaze target, dwell, brain level, whether the pane is visibly on screen, its rect, the pip's screen position.
npx tsx scripts/gazeprobe.ts --scenario errands --t 66 --id post-office --hold 7 --shot /tmp/po.png

# Same, but logs every overlay transition with its cause (decided level, placement mode, collapse, dropped, edge, focusOk)
# and every change of the shown pane's state.
npx tsx scripts/overlaytrace.ts --scenario errands --t 66 --id post-office --hold 7

# Evaluate any expression in a still frame at any size.
npx tsx scripts/evalpage.ts "http://localhost:5173/?scenario=errands&still=1&t=69.8" "window.__walk().bridge.keepOuts()" --w 1920 --h 1080

# The brain's decisions for a whole scripted walk.
npx tsx scripts/decisions.ts errands
```

Place ids: `grace-theater`, `mega-burger`, `trattoria-da-lia`, `goldies-counter`, `kathys-cupcakes`, `big-bean`, `main-street-pharmacy`, `corner-hardware`, `post-office`, `lucky-lanes`, `atlas-books`, `m4-stop`, `47th-st-station`, `pocket-park`.

Good cases to start with: Errands t 66 Post Office (D1, D2); Just walking t 4 Grace Theater (D3); Hungry t 4 pharmacy (D7); Hungry t 29 Post Office (D7); Hungry t 36 onward (D5).

## 6. Constraints on any fix

- `CLAUDE.md` rules hold: deterministic brain (no `Math.random`, no `Date.now` in `packages/brain`), reasons never cite the wearer's body or eyes, nothing ever dims or blurs the world, no em dashes in copy.
- Sources of truth in order: `docs/walking-rules.md`, `docs/design-system.md`, then the specs. Rule 1 (focus zone) was already changed after owner testing so the gaze target's pane may sit beside it in the clear zone; rule 4's "edge of the view" is read as the edge of the clear zone. Further rule changes are fine if they serve the owner's two-channel model; note them in the doc and in `STATUS.md`.
- `pnpm test` (42 tests), `pnpm eval` (39 suites) and `pnpm lint` must stay green; change an expectation only when the rule it encodes changes on purpose.

## 7. Questions worth answering

1. How much of the bad feel goes away with D1 fixed alone (near-plane clipping and a clamp to the view; occlusion only by things actually between the eye and the pane's anchor)?
2. Should a level change grow the same pane in place (one surface that resizes), instead of dissolving one pane and condensing another?
3. Should the brain know when the overlay can't show a pane (dropped, edge-folded), so the ladder pauses instead of climbing unseen?
4. In live play, what should trigger snooze, and what should Brisk do for attention-driven cards?
5. Do pips earn their place, or should attention feedback be a highlight of the storefront under the view center, and awareness a separate, sparse channel (edge notices with a pointer) as the owner describes?
