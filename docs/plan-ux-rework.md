# Plan · the UX rework (Phases 9 to 15)

For: the agent implementing this. Read `CLAUDE.md` first; its rules still hold. This plan supersedes the walking-rules numbers and the overlay behavior described in the docs wherever the two disagree. When you change a behavior here, rewrite the doc it lives in (`docs/walking-rules.md`, `docs/overlay-spec.md`, `docs/design-system.md`, `docs/brain-spec.md`, `docs/copy.md`, `docs/scenarios.md`) so the doc reads as built. Do not append "as built" paragraphs under the old text; replace the old text. Note every change in `STATUS.md`, one line each.

## 0. Why

The owner played the demo and saw: cards appearing far from the store being looked at, over the roadway; cards changing shape several times a second; cards vanishing and reappearing; nothing happening for seconds while a lit store is looked at. `docs/research/overlay-behavior-handoff.md` lists nine confirmed defects. They are real, but they are symptoms of four decisions:

1. Two state machines decide the pane's level (the brain at 10 Hz, the overlay at 60 Hz), neither knows the other's state, and every disagreement is rendered as a full dissolve, travel and condense of a new pane.
2. Live gaze re-picks its target every sim step with no commitment, out to 70 m, and every switch resets dwell and re-places the pane.
3. Placement ignores distance. A store 50 m away is a 20 px speck; its card is 270 px, centered "above" it, which is over the roadway.
4. The walking rules are tuned as a safety checklist, not as a demo. Four seconds from look to card, 22 s of Brisk with nothing, a snooze that fires when the view is dragged up, a budget of seven shows.

The target is a cinematic demo of proactive AR: the glasses feel ahead of the wearer, every pane belongs visibly to its store, nothing on screen changes faster than a person can read, and what the cards say sounds like an assistant thinking, not a listing.

## 1. The new model, in five sentences

- A pane is one surface that grows and shrinks in place. It is born once and dies once; between those it only resizes and moves.
- The brain owns the level. The overlay reports what it can show; the brain waits when a pane cannot be seen. The overlay never re-levels a pane on its own.
- Attention commits. A gaze target is acquired with a short grace, released with a longer one, and a flicker never resets the dwell.
- Distance decides size and eligibility. Near things get cards beside their frontage; far things get a label; nothing is ever placed over the roadway.
- Two channels, both sparse. Attention: the thing being looked at. Awareness: only what matters to the goal and the scripted moments. Everything else is dark until looked at.

## 2. Measurable bar (checked at the end of every phase from 11 on)

Measure with `scripts/gazeprobe.ts`, `scripts/overlaytrace.ts` and the new overlay log (Phase 9). All three walks, live mode, 1920 × 1080 and 1280 × 800.

| Measure | Bar |
| --- | --- |
| Level changes per pane | At most one per 2.5 s, except a gate, a dismiss or a look-away descent |
| Pane births per item per look | One. A promotion never creates a second pane |
| Distance from pane to its pip | The pane's nearest edge within 1.0 × the pane's width of the pip in every visible frame |
| Pane over the roadway | Never. The roadway projection is a keep-out |
| Keep-out rects | Never larger than the viewport |
| Look to glance (Walk) | Under 0.8 s, measured from the frame the view center enters the frontage |
| Look to card (Walk) | Under 2.2 s |
| Gaze target changes during a steady aim at one store | Zero after the first 250 ms |
| Pips lit at once with no gaze | At most 3, all goal-relevant or scripted moments |
| Hidden-while-climbing | The brain never promotes a pane the overlay reports as not visible |
| Console errors through a full walk | Zero |

## 3. Phases

Each phase ends with `pnpm test`, `pnpm eval`, `pnpm build` green, screenshots at the beats beside fresh reference screenshots, and a STATUS entry with the done criteria answered one by one.

### Phase 9 · See it (instrumentation and the two pure bugs)

Nothing in the later phases can be checked without this.

1. **Overlay log.** The overlay emits an event for every pane birth, resize, move over 40 px, drop, hide, edge fold, step-aside and death, with cause and rect, keyed by sim time. `apps/web/src/walk.ts` stores it beside the brain frames and exports it in `exportRun`. The inspector's Decisions tab gets an "Overlay" filter that interleaves these with brain decisions. `scripts/overlaytrace.ts` reads the log instead of monkey-patching `transition`.
2. **Keep-out projection.** `rect()` in `apps/web/src/bridge.ts` and `screenRect()` in `packages/sim/src/headless.ts` project eight box corners and skip only corners behind the camera. Clip each box edge against the near plane (0.3 m) before projecting, then clamp the rect to the viewport. A keep-out is emitted only if the mover is between the eye and the anchor plane: its nearest depth is less than the anchor depth of at least one shown pane. Cap any keep-out at 60 % of the viewport in each dimension; larger means the mover fills the view, which is handled by the gate, not by placement.
3. **Roadway keep-out.** `keepOuts()` in `apps/web/src/bridge.ts` and `headless.ts` add the roadway: the projected quad of the road surface between the curbs from 2 m ahead of the wearer to 60 m ahead, cut at 48 % of the viewport height so the far street near the horizon does not block the sky above a far store. Kind `roadway`, never moving, never triggers step-aside; it only rejects positions.
4. **Shared placement in the evals.** `headless.ts` runs its own simplified placement. Move `Placement` and `Aside` from `packages/overlay/src/place.ts` to `packages/shared/src/placement-state.ts` (they need no DOM; `Track` goes with them, `MOVE` timings move to `packages/shared/src/motion-tokens.ts` and the overlay re-exports them). `headless.ts` uses the same classes per item, so recorded walks carry the same rects the live overlay would produce.

Done: the Post Office case from the handoff (`errands`, t 66) shows no keep-out wider than the viewport and no drop from vehicle `v48`; the overlay log appears in the inspector; `pnpm eval` runs on shared placement.

### Phase 10 · One surface

The pane becomes one element per item that morphs between levels.

1. **Morph.** In `packages/overlay/src/overlay.ts`, `transition()` on a level change no longer builds a new `Built` and dissolves the old. It measures the new content off-screen, then over `t-base` (420 ms to a card, `t-open` 480 ms to expanded) tweens the one pane's width, height and position with `ease-out`, cross-fading children: outgoing children fade over 120 ms with the dissolve blur, incoming children resolve with the condense stagger starting at 160 ms. The seed hairline runs only at birth. `it.old` is used only for death. The `shape` re-condense (overlay.ts line 646) becomes a child cross-fade with no resize unless the measured size changed.
2. **Anchored growth.** The pane grows from the edge nearest the pip: above the pip, it grows upward from its bottom edge; beside it, it grows away from the pip. The bottom corner the leader meets does not move during a morph.
3. **Leader.** Replace the 64-point world-space Bézier with a straight segment in screen space from the pip's projection to the midpoint of the pane edge nearest the pip, drawn as a two-point additive line in the WebGL layer (keep the bloom) and updated every frame. The light's travel at birth runs along this segment; a promotion does not travel, the segment just follows the pane edge as it morphs. Remove the `mix` and `fromCorner` machinery.
4. **Death.** Dissolve as today, then retract the leader. Edge fold as today.
5. **Design system.** Rewrite the Promote and Open moves in `docs/design-system.md` section 4 as "Grow" and "Shrink": one surface, timings above, no travel between levels. Update section 3's leader row.

Done: on `walking` t 4 (Grace Theater) the overlay log shows one birth and two resizes from glance to expanded, no second birth; the pane's bottom corner is within 4 px of where it was before each resize; the leader is straight.

### Phase 11 · One decision maker, with commitment

1. **Visibility feedback.** `PaneReport` in `packages/shared/src/types.ts` gains `visible: boolean` and `hiddenBy?: 'keepout' | 'edge' | 'offscreen' | 'room'`. The overlay reports every item it holds, shown or not. `sim.snapshot()` passes the report into `WorldSnapshot.env.panes` (beside `backdrop`). In `packages/brain/src/ladder.ts`, `step()` takes `visible`; while a pane is not visible, `cardAt` and the expand clock pause and no promotion is issued. The brain logs a `hold` with cause `hidden` once per episode.
2. **Minimum hold.** `config.ladder.minShownS = 2.5`. A pane at a level holds that level at least 2.5 s unless a gate fires, the wearer dismisses, the band enters Brisk, or the look-away descent runs. Score-driven demotions and auto-fold wait for it.
3. **No overlay re-leveling for the gaze target.** In `Placement.update`, the gaze target's pane (`focusOk`) never edge-collapses and never steps down; it shrinks (scale to 0.74) and slides to fit, and if it truly cannot fit it reports `hiddenBy: 'room'` and the brain holds. Non-gaze panes keep edge collapse, but the 400 ms settle in `overlay.update` becomes 800 ms.
4. **Step-aside slides, it does not delete.** In `Aside`, a pane slides up to its own width to clear a mover; the drop to a dimmed pip happens only when the overlap exceeds 60 % of the pane for more than 300 ms (the delivery truck beat). A drop reports `hiddenBy: 'keepout'` so the ladder pauses. Return condenses in place, no re-birth.
5. **Docs.** `docs/brain-spec.md` section 4 step 5 gains the visibility rule and `minShownS`. `docs/walking-rules.md` rule 3 and rule 8 updated.

Done: the Post Office case shows glance, card, expanded in that order with no level reached while hidden; the overlay log shows no level change inside 2.5 s of the last one.

### Phase 12 · Gaze commitment and range

All in `apps/web/src/walk.ts` `liveGaze()` and `pursue()`, and `packages/sim/src/sim.ts` `updateGaze()`.

1. **Range.** `NEAR_GAZE_M` and `LIT_GAZE_M` become one `ATTENTION_M = 35`. Nothing beyond 35 m can be a gaze target. The brain caps any place beyond 30 m at glance (`config.ladder.cardWithinM = 30`), so a far store gets a label and the card arrives as the wearer closes in.
2. **Slivers.** A frontage quad is a candidate only if its projected width is at least 36 px and its facing angle to the view ray is under 75°. Otherwise the place falls through to the pip test, which stays at 70 px to acquire and 120 px to keep.
3. **Grace.** A new target must win for 250 ms of consecutive steps before it replaces the current one (null to target is immediate). The current target is released only after 400 ms of consecutive steps outside its release bounds. Both are constants beside `PIP_ACQUIRE_PX`.
4. **Dwell survives a flicker.** In `updateGaze()`, if the target returns within 600 ms of being lost, `gazeSince` is restored, not reset.
5. **Pursuit never switches.** While a pursuit is engaged, the gaze cannot move to another place without a drag. The head limit and the 300 ms settle stay.
6. **Scripted reviewer** keeps its 3.5° cone; evals are unaffected except where Phase 14 changes timings.

Done: `gazeprobe` aimed at the Post Office from `hungry` t 29 reports one target; a sweep across the east row at `hungry` t 4 lights nothing that is not dwelt on for 250 ms.

### Phase 13 · Placement by distance

In `packages/shared/src/placement.ts` and `Placement.update`.

1. **Scale.** `distanceScale` becomes `clamp(22 / distance, 0.78, 1.0)`. At 22 m and nearer the pane is full size; at 50 m it is 0.78. The `ui` viewport scale multiplies as today.
2. **Order of positions.** For the gaze target: beside the frontage first, on the side away from the view center, with the pane's near edge 24 px from the pip and vertically centered on the pip; then above the frontage, centered, bottom edge 22 px above the pip; then below. For non-gaze panes: the same order, then the focus-zone rules. The focus zone does not apply to the gaze target. Remove `enteringFrom` and the `pinned` edge entry: rule 4's "peripheral entry" becomes "a new pane is born at its placed position with the condense move", and the eval for rule 4 is rewritten to check the pane is outside the focus zone when it is not the gaze target.
3. **Never over the road.** The roadway keep-out from Phase 9 rejects every candidate. If no candidate clears it, the pane sits above the frontage at the roadway's top edge.
4. **Rope.** The 4 px dead band stays. The 40 px jump threshold in `Placement.update` becomes 80 px, and a jump animates over 320 ms as today.
5. **Docs.** `docs/design-system.md` section 5 rules 1, 6, 7 and `docs/overlay-spec.md` section 3 rewritten. `docs/walking-rules.md` rule 1 loses its exception paragraph (the gaze target is simply exempt) and rule 4 is rewritten.

Done: the `hungry` t 14 Mega Burger probe shows the label beside the awning at 0.78 scale with a short straight leader, no part of it over the road; at t 26 it has become a card as the distance drops under 30 m.

### Phase 14 · Pacing for a demo

Numbers in `packages/brain/src/config.ts`; rewrite the tables in `docs/walking-rules.md` and `docs/brain-spec.md` to match. Update every eval expectation whose window moves; do not loosen an invariant to make a case pass.

| Setting | Was | Now |
| --- | --- | --- |
| `ladder.glanceDwellS` | 0.8 | 0.45 |
| `ladder.cardDwellS` stopped / stroll / walk | 0.8 / 1.0 / 1.6 | 0.6 / 0.8 / 1.2 |
| `ladder.expandDwellS` | 2.0 | 1.6 |
| `ladder.lookAwayS` | 1.2 | 1.2 (unchanged) |
| Brisk | whisper only | glance allowed for the gaze target, 3 words and a number; whisper stays for things not looked at |
| `snooze` | pitch 0.35 for 1 s, no target | pitch 0.55 for 2 s, no target, no drag in the last second; the glyph shows "Snoozing" over the second second so it can be cancelled |
| `budget.shows` | 7, every show | 7, proactive shows only; dwell-earned shows are free |
| Awareness pips | every scoring entity | relevance ≥ 0.6 for the goal, plus scripted moments; at most 3 lit at once; everything else unlit until dwelt on |
| Hungry Brisk window | 0:36 to 0:58 | 0:44 to 0:57 |
| Reading budget in Walk | drops the reason, then facts | unchanged in rule; the glance now shows the `say` line's short form (Phase 15) |

Rule 13 keeps its meter. Rule 11's whisper stays for proactive content in Brisk. The tick stays at 10 Hz.

Done: `gazeprobe` on `errands` t 66 reports the glance within 0.8 s and the card within 2.2 s of the look; no snooze fires during a 90 s live walk with normal dragging; `pnpm eval` green with rewritten windows.

### Phase 15 · What the cards say

The cards are listings. They must read as an assistant that knows the goal, the time and the live data. Scope: `data/places.json`, `packages/brain/src/content.ts`, `packages/overlay/src/panes.ts`, `docs/copy.md`, `docs/world-spec.md`.

1. **The clock.** The walk starts at 12:40 and the world-spec says so. Any copy that mentions a time is relative to that.
2. **A `say` line per place per scenario.** `places.json` gains `say: { hungry?, errands?, walking?, default }`. The brain picks the scenario's line, else `default`. `Content` gains `say`. The `say` line is the one sentence the assistant would say; it is the glance's text and the card's first line. The `short` field becomes its three-word form for Walk.
3. **Pane anatomy.**
   - Glance: name, `say` (or `short` in Walk). Nothing else.
   - Card: name, `say`, one live line (the two facts that back the sentence), the reason line in Stopped and Stroll. No year. No hint line on the glass; the band hint moves to the reviewer captions.
   - Expanded: name, `say`, the rows that support one decision (never more than three), two actions, the `after` line. No "EST" label.
4. **The lines.** Reasons stay as they are in `docs/copy.md` (they are the inspector's "why", and they already pass the banned-word check). The `say` lines:

| Place | hungry | errands | walking / default |
| --- | --- | --- | --- |
| Goldie's Counter | Fastest lunch on this side · 3 min, 9 seats | | Pastrami counter · 3 min wait |
| Mega Burger | 4 seats open, 6 min · across the street, on your way | | Burgers till 1 am · 6 min wait |
| Trattoria da Lia | Sit-down, about 20 min · the sign says home cooking | | The sign says home cooking · open till 11 |
| Kathy's Cupcakes | Not lunch, but a brown butter batch at 2 | | Brown butter batch at 2 · 80 min from now |
| The Big Bean | Coffee after · line of 4, 5 min | Scaffolding over the door · keep to the curb | Line of 4 · 5 min |
| Main Street Pharmacy | | Prescription's ready · counter 2, no line | Open till 9 |
| Corner Hardware | | Picture hooks in aisle 4 · open till 6 | Keys cut till 5 |
| Corner Hardware, closed early | | Closed early today · dropped from the route | Closed early today |
| Post Office | | Line of 8, about 12 min · counter closes at 5, you'll make it | Counter till 5 · line of 8 |
| Grace Theater | | | Night Market at 8 has 40 seats · the 5:30 is nearly full |
| Lucky Lanes | | | 5 lanes open till 5 · $12 an hour |
| Atlas Books | | | Poetry reading at 7 · upstairs, free |
| M4 stop | | M4 in 2 min · not on today's route | M4 in 2 min · then 11 |
| 47th St Station | Uptown in 4 · stairs at the corner | | Uptown in 4 · stairs at the corner |
| Pocket Park | | | Benches in the shade · end of the walk |

Short forms (Walk): 3 min, 9 seats · 6 min wait · Home cooking · Batch at 2 · Line of 4 · Ready, counter 2 · Aisle 4, till 6 · Closed early · 12 min, closes 5 · 40 seats at 8 · 5 lanes open · Reading at 7 · M4 in 2 · Uptown in 4 · Shaded benches.

5. **Expanded views.** Each becomes one decision. Grace Theater: the three shows stay, primary "Hold two for 8:00". Mega Burger and Goldie's: rows become "Seat now · 6 min" / "Order ahead · ready in 8" / "Maya's usual · pastrami" (Hungry only, after Maya's text), primary "Hold a seat". Post Office: rows "Line of 8 · about 12 min" / "Counter till 5" / "Pickup window till 6", primary "Take a number", after "You're number 9. I'll say when it's close." Pharmacy: "Counter 2 · ready" / "Pay ahead", after "Paid. Show the code at counter 2." Others as in `places.json` with the `yearLabel` removed.
6. **Copy rules** in `docs/copy.md` gain: a `say` line is under 60 characters, contains at most one number pair, never repeats the name, and never contains a banned word.

Done: every card on every walk screenshot reads as a sentence; the reason-line banned-word check extended to `say` passes; `docs/copy.md` lists every `say` line.

### Phase 16 · Play it as a stranger

All three walks, live, inspector open, 1920 × 1080 and 1280 × 800, plus the device matrix. Screenshots at every beat beside fresh reference screenshots. Fix everything that is not the bar in section 2. Then the Final section in `STATUS.md` is rewritten.

Optional, if everything above is done: a "Watch" choice on the title screen that plays Hungry with the scripted reviewer and the reviewer captions on, so a visitor can see the whole story without touching anything.

## 4. What does not change

The material, the condense and dissolve moves, the light vocabulary (except the leader), the world, the inspector's structure, determinism in the brain, the safety gate and the recede, the pocket, the notifications, the ground layer, the eval harness. No `Math.random`, no `Date.now` in the brain. Nothing ever dims or blurs the world. No em dashes in copy or docs. Reasons never cite the wearer's body, eyes or habits.

## 5. Order and compaction

Phases 9 to 15 in order; each depends on the one before. Compact at every phase boundary and run the refresh ritual from `CLAUDE.md`, reading this file in place of the current phase of `docs/plan.md`. Commit on `build` after each phase. Never push.

## 6. Phase 17 · Fix round after the owner's review

The owner and a second reviewer played the Phase 16 build (beat stills of all three walks at 1280 × 800, frame-by-frame stills around every look-away, the overlay log, `scripts/bar.ts` and `scripts/sweep.ts`). The rework holds: one birth per item, no promotions while hidden, the theater sequence and the pocket read as intended, the copy reads as an assistant. What is left is at the edges, literally: what a pane does when the look leaves it and when it reaches the edge of the view. Fix these in order, each with the usual checks, and add the three new bar rows to `scripts/bar.ts`.

1. **Fold before the cut.** Panes run off the view half-drawn: Trattoria at Just walking 29.6 (left), the theater view at 26.1 (left), the station card at Hungry 44.9 (right), the Post Office card at Errands 72.8 (left, while yielding). Edge fold is keyed on the anchor leaving the view, but a 292 px pane is cut long before its pip is. Rule: when the clamp would displace a pane more than 24 px, or any part of it would lie outside the view, it folds to the edge light over `t-quick` and stays folded until it fits again. A pane never draws partly outside the view at more than 20 % opacity. New bar row: pane frames partly outside the view above 20 % opacity, must be 0.
2. **Reviewer chrome is a keep-out.** The pharmacy's "Picked up" view sits on the Sound control at Errands 29.3 and the Kathy's glance sits on it at Just walking 31.8. The Sound control, the `I · INSPECTOR` hint, the held glyph and the pace readout are hard rects for world panes, exactly as the edge cards became in Phase 16. New bar row: pane frames overlapping chrome, must be 0.
3. **Look-away shrinks in place.** When the look leaves a pane, rule 1 pushes it out of the focus zone at once, so the Trattoria card jumps from beside its sign to the view edge (Just walking 29.2) while the sign is still 300 px inside the view, then the look-away descent shrinks it a second later. Two moves where one is enough. Rule 1's exemption now persists through the look-away descent: a pane the wearer has just left stays where it is, shrinks a level at a time where it stands, and only leaves the zone if it is still up when the descent would hold it there longer than `minShownS`. Rewrite rule 1 and its eval accordingly.
4. **Keep scale through a move.** The theater view changes scale twice in 170 ms (Just walking 26.38 and 26.55, 0.84 then 1.0) as it moves to the top-left. A move never changes scale; scale re-evaluates only when the configuration is re-chosen, with the 1.2 s hysteresis. New bar row: scale changes per pane inside 2.5 s, at most 1.
5. **Freeze during a head scan.** The yielding Post Office card still moves and clamps at Errands 72.1 to 73.25 (26 logged steps at 15 % opacity). While a pane is yielding, its rect is frozen at the moment the yield began; placement resumes on return.
6. **Glance copy fits two lines.** "Brown butter batch at 2 · 80 min from now" and "The sign says home cooking · open till 11" wrap to three lines in a glance. A glance shows the `say` line only in Stopped; in every other band it shows the `short` form. Where a `say` line still wraps past two lines at reference scale in Stopped, shorten it in `places.json` (an eval checks the width the way the 28-character live-line check does).
7. **The Kathy's beat.** The scripted look at Just walking 0:30 stares at a blank awning fascia from 2 m, the glance arrives 1.3 s later and lives 0.5 s in the top-right corner. Move the gaze beat to 0:27.5 from about 8 m away (the frontage, not the fascia), hold it 2.5 s, and let the look move on at 0:30. Update `docs/scenarios.md` and the Just walking eval windows.

Done: the four frames in item 1 and the two in item 2 re-shot and clean; the Trattoria look-away shot at 29.0, 29.2, 29.4 shows the card shrinking beside its sign and folding at the edge, never jumping; the three new bar rows at 0, 0 and at most 1 on all three walks at both sizes; `pnpm -w test`, `eval`, `lint`, `build` green; STATUS entry with the measured numbers; commit on `build`.
