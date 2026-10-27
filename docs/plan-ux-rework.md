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

## 7. Phase 18 · Look and see everything, and the two screens

The owner played the Phase 17 build on a 4K monitor and asked for four things. They are one phase because the first two change what the overlay is, and the last two change how the project is read by the people it is for: hiring managers and engineers, not players. Read `CLAUDE.md`, this whole file and `docs/walking-rules.md` first. Rewrite the docs in place as before. No em dashes.

### 18.1 · The attention model: labels, then one card

Today a place at rest is a dot of light and a look starts a climb (glance, card, expanded), so the thing changes under the wearer before it can be read, and only the looked-at place answers. The new model:

- **Dots stay sparse.** Awareness dots are unchanged: goal relevance 0.6 or more, or a scripted moment, at most three, lit in advance.
- **Labels answer a look, together.** When the view settles (head yaw rate under 0.3 rad/s for 300 ms), every roster place whose storefront is in view and within 70 m shows its **label** at the same moment: the name and the `short` line, beside its storefront, scaled by distance (18.2). Up to six labels, nearest first. Labels are born with the condense move and die with the dissolve, all together on one timeline, staggered 40 ms by distance. Labels fade back to dots when the view moves on (yaw rate above 0.6 rad/s for 200 ms) or after 4 s of walking with no label under the center of the view; at Stopped they stay.
- **The center grows.** The label under the center of the view (the gaze target, with Phase 12's 250 ms grace) grows into its **card** after 0.5 s of hold. Looking at another label shrinks the current card back to a label and grows the new one in one coordinated move: shrink and grow start together, 420 ms. One card at a time, always the one under the center.
- **Cards hold.** A card holds at least 2.0 s before it can expand (`ladder.cardHoldS = 2.0`); expanded comes after 2.0 s more of hold at Stopped or Stroll, or on a pinch at any time in those bands. Looking away from a card shrinks it to its label (not to a dot) over 320 ms; the label then follows the label rules.
- **Walking rules underneath.** Brisk: labels are the whisper form (name and one number) and never a card. The focus zone (rule 1) applies to labels while moving: a label whose place is inside the zone waits as a dot unless it is the gaze target; at Stopped and Stroll every label shows. Yield (rule 5), right of way (rule 8), the gates, the pocket and the notifications are unchanged. Labels are not shows for rule 13; cards and expanded views earned by a look stay free, as in Phase 14.
- **Where it lives.** The brain emits `label` as a level between `pip` and `glance` (`packages/shared/src/types.ts`, `LEVEL_RANK`); `glance` is retired for places (the view-zone glances, toasts and whispers keep their components). The settle detector lives in `packages/sim/src/sim.ts` beside `updateGaze` so the scripted reviewer and live play share it; the brain reads `wearer.gaze.settled` from the snapshot. The label content is `glanceContent` with the short line; the card and expanded anatomies from Phase 15 are unchanged.
- **Docs.** `docs/walking-rules.md` pace table and rule 10 rewritten around label, card, expanded; `docs/brain-spec.md` 3 and 4.5; `docs/design-system.md` 6 (components) and 4 (a "Labels" move: the shared timeline); `docs/brief.md` detail levels; `docs/scenarios.md` beats that say "glance".
- **Evals.** Rewrite rule 10's ladder cases for the new levels and timings; add one case: a settled view over three places shows three labels within 0.5 s of settle and exactly one card after 0.5 s more; moving the gaze to a second place swaps the card within 0.5 s and the first is a label again. Keep the banned-word and copy checks.

Done: live, on Just walking at 0:08 with the head turned to the theater row, three labels (theater, Trattoria, Lucky Lanes) appear together, the theater grows to its card at about 0.5 s, and moving the view to the Trattoria swaps the card with one shrink and one grow and no third state. Shot frame by frame at 1920 × 1080. Bar rows unchanged, plus: labels born per settle at most 6; card swaps per second at most 1.

### 18.2 · Distance: anything lit can be looked at

Phase 12's 35 m attention range and 30 m card limit left dots the wearer could see but not use. Remove `ATTENTION_M` in `apps/web/src/walk.ts`: any place in view within 70 m is a gaze candidate. Replace `cardWithinM` with a **compact card** beyond 30 m: name, say line and live line only, no rows, no reason, at the distance scale; the full card arrives when the place comes within 30 m, as a resize in place. Distance scale floor becomes 0.7 and is multiplied by the viewport scale from 18.3, so a far compact card is small but never under 12 px of text at any screen size.

Done: Hungry at 0:14, view on Mega Burger (58 m): label at once, compact card after 0.5 s, beside the awning, not over the road; at 0:26 (under 30 m) it resizes to the full card in place with one morph.

### 18.3 · Scale with the screen

`uiScale` in `packages/shared/src/placement.ts` caps at 1.0, so on a 4K monitor every pane is laptop-sized in a frame three times bigger. New rule: `s = min(w / 1280, h / 800)`; below 1 keep today's `clamp(s × 1.3, 0.74, 1)`; above 1 use `clamp(s, 1, 1.9)`. The same value is set as `--ui` on the document root and drives the overlay, the held glyph, the whisper line, the chrome (Sound, Pause, the inspector hint, the pace readout), the title screen and the end screen. Everything that is in CSS pixels today in `apps/web/src/title/title.module.css` and the chrome styles multiplies by `var(--ui)`; the `clamp(..vw..)` sizes go. The focus zone, keep-outs and edge rules already take `ui`.

Done: at 2560 × 1440 and 3840 × 2160 (device matrix rows added) the card's name reads at the same angular size as at 1280 × 800; nothing overlaps; `scripts/devices.ts` clean on all rows.

### 18.4 · The start screen

The audience reads before it plays. Keep the live street with the attract loop as the backdrop; put the words on a surface.

- **Layout.** A panel on the left, 40 % of the width (min 520, max 760 CSS px at `--ui` 1), full height, reviewer chrome material (`#0e1216` at 0.94, a 1 px `#1d2228` rule on its right edge), 48 px padding at `--ui` 1. The street fills the rest, undimmed. No text sits over the street.
- **Reading order inside the panel**, top to bottom, type at `--ui` 1:
  1. Subtitle in Martian Mono caps 11 px (as now), then the name at 56 px / 600, then "You're walking through a big city. The AI in your glasses decides what to show you, how much, and when to stay quiet." at 17 px.
  2. "What this is" · three lines at 14 px, each with a mono key: `BRAIN` A deterministic rules engine, not a model. Same walk, same decisions, every time. / `RULES` Thirteen walking rules for a person who is moving: content scales with speed, yields to a head check, saves itself for the red light, never covers a face or a car. / `PROOF` Every decision is logged with its reasons and scored by an eval suite. Press I during a walk.
  3. "Choose a walk" at 13 px mono caps, then four choice cards in a 2 × 2 grid, 17 px names: Hungry · Find a place and get there. / Errands · Three stops, one route. / Just walking · See what it does when you want nothing. / **Watch** · Sit back. Ninety seconds with captions. Each card carries "90 s" in mono at the right.
  4. Controls as one compact strip at 12 px: LOOK drag · DWELL hold · PINCH click · ESC dismiss · I inspector (touch wording on touch screens as today).
  5. Footer at 12 px: "Built by Brandon Church · Three.js, TypeScript, GSAP · About this project" with About opening the existing panel; add a "Source" link if `README.md` names a repository URL, else leave it out.
- **Watch.** Plays Hungry with the scripted reviewer, sound following the Sound control, and a caption strip in reviewer chrome at the bottom center (Martian Mono 11 px caps at `--ui` 1, the title's dark panel material, one line, 320 ms fade). Captions are a new `caption` beat kind in `data/scenarios/hungry.json`, ten of them, written into `docs/copy.md` under Captions (replace the current list): `0:02 Four lunch spots lit · the brain says one thing` / `0:14 Looking at Mega Burger · it opens` / `0:22 Pinch while walking · saved for later` / `0:36 Light about to change · nothing new` / `0:44 Brisk · one line at the bottom, no cards` / `0:58 Red light · the pocket surfaces` / `1:06 Hold a seat · the route draws` / `1:14 Crossing · everything recedes` / `1:24 Far curb · "Held that while you crossed"` / `1:34 Arrival`. Esc or a click ends Watch and returns to the start screen. Watch ends on the end screen with "Play it yourself" as the first button.
- **Motion.** The panel slides in from the left over `t-scene` with the text revealing top to bottom (reuse the current stagger); choosing a walk slides the panel out and the walk starts within 2 s as today. The attract loop keeps running behind.
- **Touch and small screens.** Below 900 px wide the panel becomes the full width with the street behind at 40 % brightness (this is reviewer chrome, not the glasses, so dimming is allowed here); the phone rotate prompt is unchanged.
- **Docs.** `docs/copy.md` Title screen section rewritten with every line above; `docs/scenarios.md` Opening rewritten; `docs/design-system.md` 9 (reviewer chrome) gains the panel.

Done: fresh screenshots at 1280 × 800, 1920 × 1080, 2560 × 1440 and 3840 × 2160 with the text legible and nothing over the street; Watch plays Hungry end to end with ten captions and lands on the end screen; the device matrix is clean.

### 18.5 · The end screen

The end is the payoff, not a menu. Replace the black screen.

- **Backdrop.** The last frame of the street, held and dimmed to 35 % (reviewer chrome; allowed). The glasses overlay is hidden.
- **Content**, in the same left panel as the start screen, so the two screens read as one piece:
  1. The scenario name at 56 px, then one sentence built from the log at 17 px: "In ninety seconds the glasses saw {places} places, showed you {cards}, held {held} while you crossed, and saved {saved} for the red light." `places` is the number of roster places that came within 70 m; `cards` counts decisions at card or expanded level, not labels or whispers; `held` counts distinct items held during gates; `saved` is the pocket's count. Any zero clause is dropped from the sentence.
  2. A timeline strip, full panel width, 36 px tall at `--ui` 1: ninety seconds left to right; a 2 px tick for every card or expanded show in `--ink`, a 2 px tick for every hold in `--voice` at 50 %, the gate periods shaded `#1d2228`, the bands drawn as a 1 px line under it whose height steps with the band. Mono labels `0:00` and `1:30`. Built from `walk.frames` in `apps/web/src/app.ts` beside `stats()`.
  3. "What it decided" at 13 px mono caps, then the three shows with the highest score that carried a reason line, in time order, each as `time · name · reason line` at 14 px with the reason in `--voice`.
  4. Buttons: **See every decision** (opens the inspector on this walk's log at its first show) · Walk again · the two other walks · About. After Watch, the first button is **Play it yourself**, which returns to the start screen with Hungry focused.
- **Motion.** The panel slides in over `t-scene` as the street dims; the timeline draws left to right over 900 ms `power2.out`; the ticks pop in with the draw.
- **Docs.** `docs/copy.md` Arrival and end rewritten; `docs/scenarios.md` End card rewritten; `docs/inspector-spec.md` notes the entry from the end screen.

Done: all three walks end on the panel with a true sentence (checked against the inspector's counts), a timeline whose ticks match the log, three decisions with reason lines that pass the banned-word check, and "See every decision" opening the inspector at the first show; screenshots at the four sizes.

### 18.6 · Order and checks

18.3 first (everything after is measured at the new scale), then 18.1, 18.2, 18.4, 18.5. Each with `pnpm -w test`, `eval`, `lint`, `build`, the bar on all three walks at 1920 × 1080 and 3840 × 2160 (replace 1280 × 800 with 4K in the bar runs; keep 1280 in the device matrix), fresh screenshots beside the reference frames, and a STATUS entry with the numbers. Commit on `build` after each sub-phase. Never push. When 18.5 is done, add one paragraph to the Final section of `STATUS.md` and stop.

## 8. Phase 19 · One walk

The owner played Phase 18 and set the direction: one street, one walk that never has to end, everything on it answers a look, and the intent (hungry, errands, nothing) is a layer on top that adds a list, a route and an arrival. Texting replaces the call and the "friends on the street"; a reply can change where you are going. The cards get a V3 designed in Figma and approved by the owner before they are built. Read `CLAUDE.md`, this whole file and `docs/walking-rules.md` first. Rewrite the docs in place. No em dashes.

### 19.0 · Cuts

- Watch (18.4) and its captions. The attract loop behind the title stays.
- The call toast, the `call` component and its evals. The social accumulation strip stays.
- The "two people talking on the path" beat and the text held behind it. The social gate stays in the brain and its focused eval; no walk stages it.
- The three scripted routes and the three scenario files as separate walks. One walk file replaces them (19.2).
- Phase 18's deviation "only lit places count beyond 35 m" is reversed: any place in view within 70 m can be looked at. The symptom it was hiding (a far store at the vanishing point grew a card unasked) is fixed by rule: beyond 35 m a label needs 1.0 s of hold to grow, not 0.5 s, and no label grows until the head has moved at least 5° since the walk or the lap began.

### 19.1 · The gaze mark

Real glasses would track the eyes; this demo has a view center and nothing shows it. Draw a mark at the center of the view, reviewer chrome, honest about being a stand-in:

- A ring 10 px across at `--ui` 1, 1 px stroke, `--ink` at 18 % over nothing.
- Over a lookable place it brightens to 55 % in `--voice` over `t-snap`, and a 1.5 px arc fills clockwise with the dwell: empty at acquisition, full when the card is earned (0.5 s, or 1.0 s beyond 35 m). It fills again from the card toward expanded in Stopped and Stroll. A pinch snaps it full.
- Hidden during a gate (with the recede), on the title, on the end panel, and while a view-zone pane has the pointer. Off in reduced motion except the ring. An inspector override "Gaze mark" toggles it, default on.
- `docs/design-system.md` 9 gains it; `docs/inspector-spec.md` lists the override.

Done: a frame with the ring over empty street, one over a label at half dwell, one at the card; the device matrix clean.

### 19.2 · The loop, the router and the opening

- **The loop.** The walk is a loop around the block: start at the south-east corner, east sidewalk north, cross the avenue at the north corner, west sidewalk south, cross the avenue at the south corner, back to the start. The cross street's crossing (`cross-east`) is a side leg for the Post Office. About 150 s at Walk. The walk never ends on its own; "End the walk" on the intent panel (19.3) or the inspector ends it.
- **The router.** Replace the hand-authored routes in `packages/sim/src/route.ts` with a sidewalk graph: four corner nodes, two sidewalks per side, the avenue crossings at both corners, the cross street crossing, and a door node per roster place on its sidewalk. Shortest path from the wearer's current position to any door or back to the start, as legs the existing route code already plays (sidewalk, crossing). Pace stays Walk by default; the signal logic and the stop line are unchanged; the wearer waits at a red light at any corner the route reaches. The route band, turn arc and destination column draw from the router's legs. Rerouting mid-walk (a new destination) rebuilds the path from where the wearer stands, never backtracks across a crossing already started, and is logged as a decision with cause `choice` or `reply`.
- **The opening.** The walk begins Stopped at the start corner with the sim holding the light red for 12 s. Every time the wearer reaches the start corner again (the end of a lap, or arriving back after a destination) the sim holds the light red for 12 s again. That is where the intent panel lives (19.3). Everything else about the start (title, the street fading up, the 0.8 s quiet) is unchanged.
- **One walk file.** `data/scenarios/walk.json` replaces the three. It holds the pace track (Walk, with Stroll on the theater stretch and Brisk on the north stretch as today), the signal phases, the scripted people and vehicles (the truck beat stays on the theater stretch, the bus stays at the M4 stop), live-data events keyed to intent start (`+40 s` for the hardware closure), the inbox keyed to intent start (19.4), and the scripted reviewer for `pnpm record`, which now also scripts `intent`, `choose` (a picker row), `reply` (a quick reply) and `go` (the route offer). Three scripted recordings (hungry, errands, walking) are made from the one file with different intent beats, so the evals keep their three walks.
- **Arrival does not end anything.** At a destination the wearer stops 4 s at the door, the arrival line shows, then the walk resumes along the loop with no destination and no intent (labels on everything, the brain quiet). For Errands the next stop is the next destination.

Done: a live lap from the corner, through a chosen door, back to the corner with the panel up again, no pause, no cut; `scripts/overlaylog.ts` on the three recordings; the bar unchanged.

### 19.3 · The intent panel, the lunch picker, the stops

All three are view-zone panes placed by the existing view rules (edge, never in a crossing, fold behind a gate, pointer is the gaze).

- **Intent panel.** Appears within 1 s of the wearer being Stopped at the start corner. "What are you up to?" with Hungry · Errands · Just walk · End the walk. The title's choice (19.5) preselects one so a first-time viewer sees where it lives. Choosing Just walk folds it. Choosing End the walk opens the end panel (19.6). Esc folds it (Just walk).
- **Lunch picker.** Replaces the panel in place on Hungry. Every roster place of kind food or cafe, one row each: image (V3) or tone dot (until V3), name, the Hungry say line, walk time from the router, wait and seats. Sorted by walk time. Six rows; the pane scrolls with the wheel or a drag while the pointer is over it, and the row under the pointer is the gaze target (the gaze mark sits on it). Pinch chooses; "Not now" folds it and the intent is Just walk. On a choice: the row's place becomes the destination, the route draws within 2 s, the light goes to WALK within 2 s, the picker folds, and the destination's card shows a `Going here` chip in `--voice` in its header from then on. Any other food place's card gains a primary action "Go here instead" that reroutes (logged as a decision with cause `choice`; the old destination's chip goes).
- **Stops list.** Replaces the panel on Errands: the three stops in order with why, as today's errands card, plus "Start" which sets the first stop as the destination. The hardware closure fires 40 s after the intent starts and reorders the list as today. Arrival at a stop shows its card, ticks it after 3 s ("Picked up"), and the next stop becomes the destination. After the last stop the walk resumes the loop.
- **Copy** for all three in `docs/copy.md` (replace the Errands card and ask glance sections): panel lines, picker header "Lunch on this block · by walk time", row format `name · say · walk time · wait and seats`, the chip, "Go here instead", "Not now", "Start".
- **Evals.** New cases: the panel within 1 s of Stopped at the corner; a `choose` beat draws the route within 2 s and sets the destination; "Go here instead" reroutes with cause `choice`; nothing opens during a crossing; the panel returns at the corner on the next lap.

Done: live, Hungry chosen at the light, Goldie's picked, routed, "Go here instead" on Mega Burger across the street reroutes, arrival, the loop resumes, the panel returns at the corner. Shot at each beat.

### 19.4 · Messages that change the walk

Texting replaces the call. The thread is a view-zone pane in the phone's grammar (V3 in Figma; until then the current toast with the fields below).

- **Anatomy.** Avatar (a warm monogram `M` in a circle; never a photo), sender, time (from the 12:40 clock), the message, and up to three quick replies as chips. A reply appears in the thread as a bubble on the right. The brain's own line, when it has one, sits under the thread in `--voice` with Yes and Not now.
- **Timing.** The text arrives 25 s after an intent starts (or 25 s into Just walk), at the next safe moment by the notification rules; held in a crossing, counted on the glyph, shown at the far curb. Replies are pinch targets; while walking the thread sits at the edge at glance size (sender, line, chips); at a stop it opens to the full thread.
- **Per intent.**
  - Hungry and Just walk: Maya · "Lunch? I'm by the Big Bean at 1." Replies: On my way · Can't today · Where exactly?
    - On my way: the brain says "Big Bean · 4 min · route there?" Yes sets the Big Bean as the destination (replacing a picked place; its chip moves) and draws the route. Not now folds.
    - Where exactly?: Maya replies 20 s later, "Corner table by the window," and the same offer follows.
    - Can't today: Maya replies "Next time" and nothing else happens.
  - Errands: Maya · "Can you grab stamps while you're out?" Replies: On it · Can't today. On it: "Post Office sells stamps · added as a stop" (if the Post Office is not already a stop it is appended; if it is, "already on your route"). Can't today: "Next time."
- **The brain reads the reply**, never the message text: the offer is keyed to the reply id and the place named in the scenario file, so the brain stays a rules policy with no language in it. Logged with cause `reply`; the reason line is in the goal voice ("Meeting Maya at 1").
- **Copy** in `docs/copy.md` Messages section rewritten with every line above; `docs/scenarios.md` Notifications table rewritten; the call rows removed.
- **Evals.** A `reply` beat within a window produces the offer within 1 s; `go` sets the destination and draws the route; a text arriving in a crossing is held and shown at the far curb; "Can't today" produces no route.

Done: live, Hungry: picked Goldie's, Maya's text at the edge while walking, "On my way" at the next stop, the offer, Yes, the route redraws to the Big Bean, the chip moves. Shot at each beat.

### 19.5 · The start panel, revised

Keep 18.4's panel and reading order with these changes: the choice block becomes one primary "Start the walk" and, under it, a line "At the first red light the glasses ask what you're up to," with Hungry · Errands · Just walk as three chips that preselect the intent panel. Watch is gone. The "What this is" lines stay. `docs/copy.md` Title section updated.

### 19.6 · The end panel, revised

Reached from "End the walk" on the intent panel, Esc on the intent panel, or the inspector. 18.5's panel with a session sentence: "In {m} minutes the glasses saw {places} places, showed you {cards}, held {held} while you crossed, saved {saved} for a red light, got you to {destinations}, and sent {replies} replies." Zero clauses dropped. The timeline spans the whole session. "Walk again" restarts at the title; "Keep walking" returns to the corner with the panel up.

### 19.7 · The V3 card family, designed first

The reviewer (not Opus) designs the V3 family in Figma and the owner approves it before any of it is built. The Figma file is the source of truth for the look of these components once the owner approves; `docs/design-system.md` is rewritten from it, and the code is built to it. Until approval, 19.1 to 19.6 use the current components.

In the family: label, compact card, card and expanded for each place kind (food, cafe, theater, venue, shop, service, transit, park), with an image slot; the lunch picker and its rows; the stops list; the message thread with quick replies and the route offer; the intent panel; the gaze mark in its three states; the whisper line; the pocket; the end panel; the start panel. Imagery: generated for the project in one consistent style (a hero image per place, a thumbnail per menu row and picker row, Maya's monogram), vendored as WebP under 60 KB each in `apps/web/public/img`, and listed in `LICENSES.md` as generated for this project.

Build order after approval: tokens and type scale, then label and card, then expanded, then the view-zone panes, then the two screens. Every component screenshot beside its Figma frame in the STATUS entry.

### 19.8 · Order and checks

19.0 and 19.1 first (small, immediate). Then 19.2, 19.3, 19.4, 19.5, 19.6, each with `pnpm -w test`, `eval`, `lint`, `build`, the bar on the three recordings at 1920 × 1080 and 3840 × 2160, fresh screenshots beside the reference frames, and a STATUS entry with the numbers. New bar rows: intent panel within 1 s of Stopped at the corner; route drawn within 2 s of a choice or a Yes; no pane during a crossing; laps completed without a pause. Commit on `build` after each sub-phase. Never push. Stop after 19.6 and write the Final paragraph; 19.7 starts only when the owner has approved the Figma file and says so.

## 9. Phase 20 · Polish round after the owner played Phase 19

The owner played 19.0 to 19.6 on a 4K monitor and a second reviewer verified the recordings. The structure holds. What follows is polish, each item small, in this order. Same rules as every phase: refresh ritual first, decide and note rather than ask, checks green at every step, docs rewritten in place, no em dashes, a STATUS entry with numbers, commit on `build`, never push.

1. **The focus mark becomes a viewfinder.** The 10 px ring is invisible on a large screen. Replace it with a rounded square about 44 px at `--ui` 1, drawn as four corner ticks (each 10 px long, 1.5 px stroke, radius 6) rather than a full outline, so it never hides what is under it. Ink at 30 % over nothing; voice at 70 % over a lookable place. The dwell is shown by the corners pulling inward from 44 to 36 px and brightening as the hold counts toward the card; a pinch snaps them in. A mono label `FOCUS` in the chrome accent, 9.5 px, sits 8 px under the square and fades out for good after the viewer's first card. Still reviewer chrome, still hidden during a gate and over the panels, still the inspector override.
2. **A clock on the glass.** Top-left of the view, in the glasses layer (so it recedes with everything else): the day and time from the walk's clock, `Tue 12:41`, Martian Mono 11.5 px at `--ui` 1, ink at 74 %. The walk starts Tuesday 12:40. The thread's timestamp and every "at 1" in the copy read from the same clock. `docs/design-system.md` 6 gains it; `docs/copy.md` names the day.
3. **Texts look like texts.** A speech-bubble glyph (an SVG, 14 px, ink at 74 %) sits left of the avatar in the thread header and `Messages` replaces `Text` as the channel label. Any future item that arrives from an app gets its own glyph the same way.
4. **The start panel.** Center the label on "Start the walk" (it is left-aligned now). Remove the three intent chips and the line above them: the walk asks the same question at the light, and asking twice makes the panel read as a form. Use the panel's height: name at 64 px at `--ui` 1, 32 px between the three sections, the controls strip and the footer pinned to the bottom with the same side padding. Nothing changes on screens under 900 px wide.
5. **"What it decided" on the end panel** prefers decisions with cause `reply`, `choice` and `arrival` (in time order), then fills with the highest-scored shows. The route offer and the reroute ("Meeting Maya at 1") must appear whenever they happened. A notification's delivery reason ("Clear sidewalk ahead") is never listed as a decision.
6. **Picker walk times in minutes.** Under 60 s reads "under a minute"; otherwise whole minutes, rounded up. Sorting keeps the true seconds.
7. **Labels while walking.** Confirm, live, that a settled head in Walk band labels the stores in view outside the focus zone (Hungry 1:40 walking south: Lucky Lanes, Atlas, Mega Burger across the street). If labels only appear at Stroll and Stopped, fix the rule interaction; the intent of 18.1 is that any settled look labels what it sees, in every band but Brisk.
8. **The bus at the north light.** At Hungry 1:18 the bus fills the center of the frame while Maya's text is up. Hold the bus at its stop 4 s longer, or move the text 5 s later, so the thread is read over the street.
9. **Lap two preselects Errands** on the Hungry recording's second corner. If the recording scripts it, say so in STATUS; if it is state leaking from the title, fix it.
10. **Images into the build.** The reviewer delivers `apps/web/public/img/*.webp` (14 heroes at 784 × 224, dish thumbnails at 176 × 176) and a block for `LICENSES.md`. Wire them: `places.json` gains `img` (hero) and each expanded row gains `img`; the card's 44 px thumbnail, the expanded view's 112 px hero strip with its gradient into the glass, the picker and pocket rows' 34 px thumbnails, exactly as the V3 spec page shows. A missing image falls back to the kind's tone dot. This is the first slice of 19.7 and may land before the rest of the V3 build.

Done: a 4K frame with the viewfinder over a label at half dwell and the clock top-left; the thread with its glyph; the start panel at 1280 × 800 and 3840 × 2160; the Hungry end panel listing the reroute; the picker in minutes; the three Hungry frames (1:18, 1:40, lap two corner) re-shot; every check green; the bar unchanged.

## 10. Phase 21 · Second polish round, after the reviewer verified Phase 20

Phase 20 holds: every check green, the bar unchanged, and all ten items present in the frames. Five things were found while watching the walks, each small. Same rules as every phase: refresh ritual first, decide and note rather than ask, checks green at every step, docs rewritten in place, no em dashes, a STATUS entry with numbers, commit on `build`, never push.

1. **The viewfinder vanishes over anything bright.** At Hungry 0:20 the square sits over a sunlit glass façade and the pavement, and at 30% ink it cannot be found at 1920 x 1080 or 3840 x 2160. Give the ticks the same dark halo the labels have (a 1 px shadow at 55%, no blur) and lift the resting ink to 45%; the voice state keeps 70%. It must read over the brightest façade in the backdrop sampler and still never hide what is under it. `docs/design-system.md` 9 updates the numbers.
2. **The Grace Theater photograph.** The reviewer replaced it: a row of red cinema seats, `hero-theater.webp` at `/private/tmp/claude-501/-Users-brandonchurch-Desktop-lumen-kit/24d9f336-ed23-45c6-b5aa-3626122a8a88/scratchpad/img/out/hero-theater.webp`, with its line in `LICENSES.theater.md` beside it. Copy the file over `apps/web/public/img/hero-theater.webp` and replace the theater line in `LICENSES.md`. No marquee with readable letters anywhere in the set.
3. **The thread after Yes.** On Hungry the reply goes at 1:18 and Yes at 1:20; from 1:21 to 1:26 the thread stands as the bare "Lunch? I'm by the Big Bean at 1." with the sent reply gone, then dissolves. A thread never drops a reply the wearer sent. After Yes it keeps the message, the reply and one line "Routing to the Big Bean" for `minShownS`, then leaves once and does not return. `docs/copy.md` gains the line.
4. **A label on a moving bus.** At Hungry 1:23 the Trattoria label from across the avenue sits on the window of the bus passing the wearer. Vehicles within 12 m are keep-out like people are; a label whose anchor is covered waits rather than riding the bus.
5. **The compact card keeps its photograph.** The first card of the Hungry walk, Mega Burger at 0:10, is compact (beyond 30 m) and so has no thumbnail, while every nearer card has one. At distance the photograph is the fastest read there is. The compact card keeps the 44 px thumbnail and drops only the reason line.

The owner then played Phase 20 and named the real problem: aiming. The head is capped at 90° each way and feels weighted; the viewfinder is still small and the lock it needs is smaller than the square, so a place must sit within 3° of the center; and because the body steps around people and bollards on its own, the aim slides off a card before the hold completes. Items 6 to 9 fix aiming as one piece. Do them before 1 to 5 if the round has to be split.

6. **A full turn, with no weight.** Remove the head limit (`HEAD_LIMIT` in `walk.ts`): the head turns 360° and wraps. A drag moves the head 1:1 with the pointer, a full view width equals 120° at every size, with no inertia and no easing while the pointer is down or a key is held; the only smoothing left is the pursuit's, and it runs only when the wearer is not dragging. A turn past the shoulder is what the head-check rules in `docs/walking-rules.md` are for, so looking back works the same as looking to the side. Keys stay as they are.
7. **The viewfinder is the target, and the target is the viewfinder.** The square grows to 160 px at `--ui` 1 (the same four corner ticks, each 22 px, 1.5 px stroke, radius 10), and `FOCUS` sits inside it at the bottom edge, mono 9.5 px, and never fades. Whatever is inside the square is being looked at: the gaze acquires a place when its anchor or the front of its storefront is inside the square (`PIP_ACQUIRE_PX` and `YAW_ACQUIRE` are replaced by the square's half-width) and releases only when it is 40 px outside the square. Among several places inside, the nearest to the center wins and keeps winning until it leaves. The square stays ink at 45% with the halo from item 1, voice at 70% once something is held, and the corners pull in from 160 to 132 as the hold counts. `docs/design-system.md` 9 is rewritten for the new size.
8. **The hold survives the body.** The body's steps around people and street furniture must not move the aim. Once a place is acquired, the pursuit holds it: the head counter-rotates for every body move and sidestep on its own, from the first frame, not only after a drag. The release grace grows from 0.4 s to 1.0 s, and a release shorter than the grace does not reset the dwell: the hold resumes where it was. The dwell timer is the brain's, so this is `lookAwayS` as well as the walk's grace; both read the same number. Only a deliberate turn away (the pointer or a key) ends a hold.
9. **Measured.** Add a probe to `scripts/gazeprobe.ts`: turn onto each of the fourteen places from the recorded position at the moment it enters 70 m, then hold still while the body walks its path for 6 s. Pass is every place reaching its card without a reset, at 1920 x 1080 and 3840 x 2160. Put the fourteen numbers in STATUS.
10. **The hold shows where it is going.** Nothing tells the wearer whether a pane has a further level, so they stare at a finished card waiting. Every pane that can still grow carries a hold rule: a 1.5 px line in the accent along its bottom edge, inside the glass, that fills from the leader's corner across the pane's width as the hold counts toward the next level (label to card, card to expanded), `linear`, and completes exactly when the level changes. It is empty and invisible while the pane is not being looked at, and it is absent on a pane at its last level, so a card with no rule is a card that is done. Under the rule's start, mono 9.5 px at 55% ink, the word `HOLD` on the label and `HOLD TO OPEN` on the card, gone the moment the fill begins. The viewfinder's corners keep pulling in as well; the two always agree. `docs/design-system.md` 7 gains the hold rule beside the grow move, and `docs/copy.md` the two words.

Done: the viewfinder visible over the sunlit façade at Hungry 0:20 at both sizes, measured by the backdrop sampler; the red seats on the theater's expanded view (Just walking 0:40); the thread at Hungry 1:22 with its reply; Hungry 1:23 with no label on the bus; Mega Burger at 0:10 with its thumbnail; the head turned fully round at Hungry 0:06 with no pane in the view; the 160 px viewfinder with FOCUS inside it over the Mega Burger card at half hold; the aim probe at fourteen of fourteen; the Trattoria card at Hungry 0:43 with its hold rule half full and the Big Bean card at 1:52 with none; every check green; the bar unchanged.

## 11. Phase 22 · The owner played Phase 21

Phase 21 holds: every check green, the bar unchanged, the aim probe and the live play at fourteen of fourteen with no slips at both sizes, every Done frame present. The owner then played it and found five things, and the reviewer found two. Same rules as every phase: refresh ritual first, decide and note rather than ask, checks green at every step, docs rewritten in place, no em dashes, a STATUS entry with numbers, commit on `build`, never push. Do them in this order; item 1 is a bug and comes first, item 5 is the largest and comes last.

1. **The drag belongs to the body.** The owner cannot turn all the way round: turning left stops short and turning right runs ahead to straight behind. The cause is the departure in Phase 21 item 6: while the pointer is down the body's own turn is subtracted from the head (`bodyWas` in `walk.ts`), so a drag that spans a corner is cancelled when the body turns the same way and doubled when it turns the other way. Measured with slow 3 s drags of 800 px (50° at 1920 wide) on the Hungry walk: along the straight the head turned 38° for a 50° drag; across the north corner it turned 17° the wrong way for one drag and 180° for the next; after the corner a 50° drag moved it 10°. A head is on a body, so the view swings with the body while the wearer turns, as it does while they hold still. Remove the compensation. A drag changes the head's yaw relative to the body 1:1 with the pointer at every moment, corners included; the pursuit still holds an acquired place through the body's turns, but only while the pointer is up, and the moment it goes down the drag owns the head. The 7° miss at Pocket Park that motivated the compensation was the probe's, not the view's: `aimplay.ts` computes its drag from the state before the body turns, and a person re-aims as they go; fix the probe to aim from the live state at each step. Then measure: add `--drags` to `scripts/gazeprobe.ts` that, on each walk, makes slow 3 s drags of 800 px left and right along a straight and across both corners, and twelve half-width drags round the circle each way, and reports every drag's turn against the pointer's; pass is every drag within 1° of the pointer's (the body's turn added, never subtracted or doubled) and the circle closing within 1° both ways. Screenshots looking straight back on both walks go in STATUS. `docs/overlay-spec.md` 4 loses "the aim is the wearer's alone".
2. **The crossing says why it is quiet.** During a crossing the glass carries nothing but the small Held glyph at the bottom left, and the owner was left wondering where everything went. A crossing line now says it: `Quiet while you cross` for a crossing, `Quiet near traffic` for the roadway and vehicle gates, with `· 1 held` (or `2 held`) after it while the glyph counts. It sits at the top center of the view, 56 px from the top at scale 1 (the view-edge offset, times `--ui`), Martian Mono 11 px caps with 0.08 em tracking, `--ink` at 70% with the label's halo, in the sharp layer with the pavement text, never receded. It arrives with Recede over `t-base` (condense, 100 ms after the gate like the glyph) and leaves with Return over `t-quick`, before the held reason line resolves. It is the only line the glass shows during a gate, so it never competes with the pavement, and it is not on the attention budget. `docs/copy.md` Held and follow-up gains the lines, `docs/design-system.md` 4 Recede and Return name it, and the bar gains a row: the line is up on every gate frame and on no other frame.
3. **The question at the corner.** The owner does not like "What are you up to?" and finds the panel bland, a card like every other card. The question becomes `What's on the agenda today?` and the answers `Looking for food` · `Running errands` · `Just exploring` · `End the walk`, the ids unchanged, so the title's line reads "the walk asks what's on the agenda at the first red light" and every doc, eval name and test that says Just walk or Hungry as an answer says the new words. The panel becomes the assistant's own: 360 px wide at scale 1, at the right edge as now, its glass carrying a `--voice` hairline at 35% along its top edge (the voice color marks the assistant speaking, as the reason line does). A mono caps eyebrow in `--ink-2` 11 px reads the moment from the walk's clock and the reason: `TUE 12:40 · LONG RED LIGHT`. The question under it in the display face at 22 px / 600, balanced. Three choices as full-width rows 52 px tall, hairlines of `--edge-lo` between them: a 20 px glyph at 1.3 px stroke in `--ink-2` at the left (a fork and knife, a list with three ticks, a compass needle; drawn inline like the Messages glyph), the label 15 px / 600, and under it a hint 12.5 px in `--ink-2` from the world: `Five places on this block` (the count of food and cafe places in the snapshot), `Three stops, one route`, `Quiet unless you look`. The row under the pointer lifts to 7% ink like the picker's rows; a suggested answer (`goal.suggest`) carries the primary fill; a click is the pinch that chooses. `End the walk` stays quiet below the rows, 12 px. The panel condenses as a card does, then its rows resolve 50 ms apart top to bottom, inside the stagger law; no new move. Lap two gets the same panel. The design-system table row for the intent panel and `docs/copy.md` The corner rewrite; the brain's content gains the hint strings and the count; the eval names follow the copy.
4. **The start screen breathes.** The owner finds it cramped and wants more width and more room between things. At scale 1: the panel 46% of the width (600 to 880 px), side padding 64 px, top and bottom 48 px; the three sections 48 px apart; the setting at 17 px over 1.55 lines; the "What this is" lines 18 px apart over 1.5 lines, their mono keys in a 72 px column; the controls strip with 16 px between keys; the footer 13 px. The name stays 64 px. Below 900 px wide nothing changes. Judge it at 1512 x 982 (the owner's laptop), 1920 x 1080 and 3840 x 2160: nothing clips, the button is in view without scrolling, the street beside it is never dimmed and still more than half the view. `docs/design-system.md` 10 (the start screen) updates its numbers; the screenshot at 1512 x 982 goes beside the old one in STATUS.
5. **Sound, rebuilt.** The owner: the atmosphere is worth having and all of it sounds plain bad. It does: the bed is one brown noise loop, the horn is two sawtooth notes every ten seconds, a footstep is a burst of noise, the tick is a bare sine. Rebuild the whole set as designed sound, still synthesized with no files (the only CC0 street recordings on Wikimedia Commons are one rainy afternoon and one crossing beeper, not enough for a bed, and no other source is CC0), seeded from the walk's clock so the same walk makes the same sound. One graph: every voice into a master bus, a compressor (threshold -18 dB, ratio 2.5, knee 12, attack 10 ms, release 250 ms), the master never above -6 dBFS peak; the UI voices pass through a convolver with a generated 1.1 s stereo impulse (exponentially decaying noise, low-passed at 4 kHz) mixed at 18%; the street bed is dry.
   - The street: pink noise (a Voss sum or a -3 dB per octave bank; brown is mud), in three layers. Distant traffic: low-passed at 600 Hz, two poles, at about -30 dBFS RMS, with two uncorrelated LFOs (0.07 and 0.13 Hz, ±4 dB) so it swells and sinks. Air: the same noise band-passed at 2.4 kHz, Q 0.6, at -42 dBFS, the hiss of outdoors. Passes: every 6 to 14 s a vehicle passes, band-passed noise whose center follows a Doppler curve 300 to 900 to 250 Hz over 2.2 to 3.5 s, panned from one side to the other with a StereoPanner, rising to -24 dBFS and falling, with tire hiss (band-pass 3 kHz) riding it at -36; the pass comes from the roadway's side of the wearer (its pan from the body yaw and the road's side), and no pass sounds during a crossing while the signal says WALK. No horns.
   - Steps: two layers per step, a thud (sine 70 Hz falling to 45 Hz over 60 ms at -26 dBFS) and a scuff (band-passed noise 1.2 to 2.5 kHz, 40 ms, -34 dBFS), panned ±0.15 alternating, at the walk's cadence (stroll 1.4, walk 1.75, brisk 2.0 steps a second, as the band reads), timing jitter ±12 ms from the seed, silent at Stopped, the scuff a touch brighter on crosswalk paint.
   - The signal: while the wearer stands at a curb on WAIT, and through the crossing, the crossing's beeper, a 2.4 kHz sine 30 ms at -34 dBFS once a second, panned toward the signal post; it stops at the far curb.
   - The glasses: Mark is a glass partial set, sines at 2093, 3136 and 5274 Hz (the third at -12 dB), 2 ms attack, 180 ms exponential decay, -22 dBFS, through the reverb. Unfold and open keep the rising breath (900 to 2600 Hz) with a 1046 Hz sine at -30 dB inside it, through the reverb. Recede is the falling breath with a 196 Hz sine, 400 ms, at -30 dB under it. The pocket surfacing is the long breath up. Nothing else sounds.
   - Measure, since neither of us can listen: `scripts/soundcheck.ts` renders every voice and 20 s of the bed through an OfflineAudioContext and prints peak, RMS and spectral centroid per voice, and the numbers go in STATUS; pass is the levels above within 2 dB, no sample above -6 dBFS, the bed between -32 and -28 dBFS RMS. Then `scripts/soundsheet.ts` writes the same renders as WAV files with an `index.html` of play buttons to `.cache/sound/` (not committed), so the owner can listen to each sound on its own and name the ones that are still wrong. Say in STATUS and in the Final paragraph that the set is measured, not heard, and that the owner's ears decide this item. The design-system Sound table is rewritten with the new set.
6. **Dead copy.** The HOLD and HOLD TO OPEN captions never appear: the brain's count begins on the first looked-at frame, so on the Hungry walk HOLD is on screen for one or two frames three times and HOLD TO OPEN never. Remove the caption from the overlay, `docs/copy.md` and `docs/design-system.md` 4 Hold; the fill line is the whole rule.
7. **The door time.** The Big Bean's card at its door lands at 1:53.0 (folded at the view edge from 1:48.5, then without room until the band reaches Stopped), not 1:52 as `docs/scenarios.md` and the Phase 21 Done line say; the Phase 20 frame at 1:52 was empty too. Write 1:53 where the docs say 1:52, or make the card land at 1:52 if the room check can be satisfied a second sooner without a pane in the roadway, and say which in STATUS.

Done: the drag probe within 1° on every drag on all three walks, with the two straight-back screenshots; the crossing line in the frames at Just walking 1:30 and Errands 1:51, and absent at Just walking 1:40; the new panel on Just walking lap two (2:54) at 1920 x 1080 and 3840 x 2160; the start screen at 1512 x 982, 1920 x 1080 and 3840 x 2160; the sound numbers in STATUS and the sheet in `.cache/sound/`; no HOLD caption anywhere; the door time agreed between docs and frames; every check green; the bar unchanged plus its new row.

## 12. Phase 23 · One mode, a menu, a map, and a notification that looks like one

Phase 22 holds: every check green, the drag within 1° on every walk, the crossing line on every gate frame, the agenda panel and the start screen as specified. The owner then played it and reshaped the product, and the reviewer agrees with the shape. The demo had three intents chosen at a corner; it becomes one walk the wearer explores, with a menu they can open at any time to find a place and go there, while the brain stays proactive about everything else. Same rules as every phase: refresh ritual first, decide and note rather than ask, checks green at every step, docs rewritten in place, no em dashes, a STATUS entry with numbers, commit on `build`, never push. Sound is not in this round (section 14). Do the items in this order.

1. **The crossing line says what is happening.** "Quiet while you cross" told the owner nothing. The line reads `Overlay paused while you cross the street` for a crossing and `Overlay paused · traffic close by` for the roadway and vehicle gates, with `· 1 held` as before. Same place, same type, same moves. `docs/copy.md` updates the lines and the bar row keeps its check.
2. **The clock stays.** The clock vanishes in a crossing because it lives in the hud that recedes. Move it to the sharp layer with the pavement text and the crossing line, so `Tue 12:41` is on the glass through every gate. Nothing else about it changes.
3. **One walk.** The demo starts in Explore and stays there. The agenda panel at the corner goes (the brain no longer asks; `cornerWants` keeps only the lunch picker's rows for item 4), the Errands intent goes with its recording, its eval suite and its stops list, and its places stay as places with their cards and expanded views. The start screen's "the walk asks what's on the agenda at the first red light" line goes; the panel says instead, under the button, `Explore the block. Open the menu at the bottom right to find a place and go there.` in the setting's type. Two recordings remain: `walking`, shown as Explore, and `hungry`, shown as Lunch, their ids unchanged so the evals and the inspector keep their names; the Lunch recording now opens the menu at the corner and chooses Goldie's through it (a choice event the reviewer script can send), so its beats hold. The Jules DM held in the crossing (Errands 1:50) moves to the Explore recording's first crossing at 1:29, so the "Held that while you crossed" moment and its eval survive. The ask glance (Hungry? · Find lunch) stays in Explore and Find lunch opens the menu on Food. `docs/scenarios.md` rewrites to two walks; `docs/brain-spec.md` 8 (the corner) and `docs/copy.md` The corner follow; the bar and `barall.sh` run two walks.
4. **The menu.** A button at the bottom right of the glass, the wearer's own chrome: a 44 px round glass (the pane glass, the light edge) with a 20 px compass glyph at 1.3 px stroke in `--ink`, 24 px from the right and bottom at scale 1 (times `max(1, --ui)`), and the mono caps word `FIND` to its left at 11 px `--ink-2` until the first time it is opened. The reviewer chrome moves out of its way: `I · INSPECTOR` joins `SOUND · OFF` at the top right, 112 px apart as the pair already is. The button is up in every band and every gate (it is chrome, sharp, never receded), and a click, or a look held 0.5 s with the viewfinder, opens the panel.
   - The panel: the agenda panel's treatment, which is now free: 360 px at the right edge above the button, the `--voice` hairline on its top edge, the eyebrow `TUE 12:42 · FIND A PLACE`, the question `Where to?` in the display face 22 px / 600, and four category rows 52 px tall with glyphs and hints from the world: `Food and drink` (fork and knife; `Five places · nearest 40 m`), `Things to do` (a ticket; `Theater, lanes, a reading, a park`), `Shops and services` (a bag; `Pharmacy, hardware, post office`), `Getting around` (a bus; `M4 in 4 min · uptown in 3`); the counts and times from the snapshot. Under them `Close` quiet.
   - A category opens its places as the lunch picker's rows (the 34 px thumbnail, the name, the walk time at the right in mono `--voice`, the picker line, the live line with its dot), sorted by walk time, the eyebrow becoming `FOOD AND DRINK · BY WALK TIME` and a `Back` quiet at the top left of the rows. A row under the pointer or the viewfinder lifts to 7% ink; a click or a pinch sets it as the destination: the panel folds, the route band draws from the feet with cause `choice`, the destination column rises at the door, the map tile (item 5) slides in, and the route ground glance says `{name} · {walk time}`. At the door the arrival line shows as now, and the next place can be chosen the same way; a new choice replaces the destination and re-announces with cause `choice`.
   - The lunch picker is this panel's Food rows, so the Lunch recording's picker at the corner is the menu opened on Food; the `picker` component becomes the menu's rows and the duplicate goes.
   - Rules: the panel is a view-zone pane at the right edge, allowed in every band but Brisk, where it folds and the button stays; it folds for every gate and comes back when asked, not on its own; Esc closes it; it is not on the attention budget; it never dims the street. The scripted reviewer sends `{ menu: 'open' }`, `{ menu: 'food' }` and a choice to drive it. Design-system gains the menu's row in the component table and the panel's section; `docs/overlay-spec.md` 7 names the button as a gaze target; `docs/copy.md` gains its lines.
5. **The map tile.** It was in the reference (`reference/lumen-study.html`: a 150 px tile in the lower corner, "only for a turn the wearer cannot see, or on request; slides into the lower corner, holds for the turn, leaves; the route stays on the ground the whole time") and in the design-system table, and it was never built. Build it: a 180 px square at scale 1 (times `--ui`) of the pane glass, radius 8, above the menu button at the right edge, 24 px up from it. Inside, a plan of the block drawn heading-up like a phone's navigation: the sidewalks and roadway of the avenue and the cross street in `--ink` at 20%, the building footprints at 8%, the wearer as a 6 px dot in `--ink` with a 60° view cone at 12%, the route as a 2 px line in `--voice` from the dot to the destination, the destination as its pip (the kind's tone, 6 px) and the crossings as their white bars; 1 px = 0.55 m so the whole block fits with the wearer in the lower third; the plan rotates with the body yaw, smoothed over `t-base`, never with the head. It shows while a destination is set, and, with no destination, for a turn the wearer cannot see as the reference says (the corner ahead within 20 m, the turn drawn as the route's arc), and it fades out over `t-quick` 10 s after arrival or once the turn is made. It is a view-zone pane, allowed in every band but Brisk, hidden by every gate, not on the attention budget, and the viewfinder never targets it. Design-system row and section; `docs/overlay-spec.md` 4 lists it under view.
6. **A text looks like a text.** The thread is a dark card like every other card, and the owner wants it to read as a notification at once. It becomes a banner: 380 px wide at scale 1, radius 20, the glass lighter than any pane (ink at 14%, the light edge at 40%, blur as the panes), at the top center of the view 20 px below the clock line, sliding down from above over `t-base` and back up over `t-quick`. Its first row is a phone's: a 28 px rounded-square app tile in Messages green (#34c759, radius 8) with the speech-bubble glyph in white, `Messages` 13 px / 600, and `now` (then `1 min` and so on, from the walk's clock) in mono `--ink-2` at the right; the second row the sender at 15 px / 600 with the warm monogram at its left; the message at 15 px under it; the quick replies as chips under the message when the band allows a reply (Stopped and Stroll, or a look held on the banner), hidden while walking faster. It is the only pane that carries a color tile and the only one at the top center, so it is unmistakable. The thread's answer side (the wearer's reply on the right, the other side's answer on the left, the brain's offer under it with Yes · Not now) keeps its bubbles inside the same banner. The edge rules still hold: the top center is the view's top edge, outside the focus zone; while walking a banner that is not looked at folds after 4 s as a toast does; nothing changes in Brisk, where it is hidden. The Jules DM and the Maya thread both use it. Design-system Message thread row and its section rewrite; `docs/walking-rules.md` rule 1's view-zone line names the top center; the evals that name the thread's edge move with it.
7. **The end panel and the inspector follow.** The end sentence drops the errands clause, the "What it decided" lines never name the menu, and the inspector's scenario picker shows Explore and Lunch. The device matrix is run again at the menu, the map and the banner.

Done: the crossing line reading `Overlay paused while you cross the street · 1 held` at Explore 1:30 (with the Jules DM held) and the clock on the glass in the same frame; the start screen with the new line and no corner question in a live walk; the menu closed and open on Food at 1920 x 1080 and 3840 x 2160; a destination chosen from it with the route band, the column and the map tile in one frame; the map tile alone for the corner turn at Explore 1:25; the Maya banner at Lunch 0:26 while walking and with its chips at 1:18; the Lunch recording reaching the Big Bean as before through the menu; two walks in the bar, every row holding at both sizes; every check green; no em dashes.

## 13. Phase 24 · Every card is worth the look

The owner walked past the theater and it did not tell them what is playing. Every place gets a reason to look twice: an expanded view that shows real choices, one action, a confirmation, a pocket entry and a line on the end panel, with the same three-step shape everywhere so the wearer learns it once. Written in full after Phase 23 is verified; the shape is fixed now so Phase 23 leaves room for it.

- The theater: `Now playing` with four films the wearer knows (titles only, chosen by the owner or by the builder from well-known releases: for example Dune: Part Two, The Avengers, Spirited Away, Oppenheimer), each a row with its next two times and seats (`Dune: Part Two · 5:30 and 8:00 · 12 seats at 8:00`); choosing a film opens its times as rows; `Hold two for 8:00` confirms as `Two held for 8:00 · I'll walk you there at 7:35`, goes to the pocket and the end panel. The marquee in the world shows the same title.
- The same depth for the rest, each with its real rows: the Big Bean's order ahead (three drinks, a pickup time), Lucky Lanes' lanes and times, Atlas Books' reading and a hold on the book, the station's next trains uptown and downtown, the M4 stop's next buses and a reminder, Pocket Park's benches in the shade, the pharmacy's pay ahead with a code, the hardware store's hold at the till, the post office's number. Mega Burger, Goldie's and the Trattoria keep their dishes and seats.
- One confirmation shape: the chosen row stays, the others dissolve, the confirmation line resolves in `--voice`, the pocket counts it, the end panel names it.
- New components where a flow needs one (a times row, a quantity, a pickup time), each added to the design-system table with its row, never a one-off.

## 14. Sound · held

The owner heard the Phase 22 set and it is worse than before. Nothing in sound changes until the owner says so; the Sound button stays as it is. Sound is the last round, and if it cannot be made right it is cut from the app, the button with it.
