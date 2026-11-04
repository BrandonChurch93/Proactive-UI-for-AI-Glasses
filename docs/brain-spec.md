# Brain Spec · the decision engine

The brain decides what to show the wearer, at what level, when, and when to hold back. It is a pure TypeScript package with no dependency on Three.js or the DOM. The simulation is one adapter; real glasses would be another. The brain never knows it is in a simulation.

It is a deterministic rules policy. No model, no network, no randomness. Every threshold is a number in `config.ts`. Given the same scenario script, two runs produce identical logs.

## 1. Shape

```
packages/brain
  src/
    types.ts         WorldSnapshot, Candidate, Decision, Reason, Config
    pace.ts          pace band with hysteresis (walking-rules pace bands)
    gates.ts         hard gates: safety, social, snooze, budget
    candidates.ts    entities, inbox items and proactive moments → candidates
    score.ts         relevance × value × proximity × novelty − cost
    ladder.ts        rule 10: pip / label / card / expanded by attention and band
    reading.ts       the reading budget: copy caps and trims per band
    pocket.ts        save on pinch while moving; surface at the pause
    timing.ts        now / next-pause / batched / after-gate; auto-fold; hysteresis
    brain.ts         the tick: snapshot in, decisions out
    log.ts           decision log, replayable
    config.ts        every number, with defaults; overridable per scenario
  test/              unit tests, lean
```

One loop, 10 Hz in the sim. Gates, pace, candidates, score, ladder, reading budget, pocket, timing, placement hints, log. Nothing async.

## 2. Input: `WorldSnapshot`

Produced by the adapter every tick.

```ts
interface WorldSnapshot {
  t: number;                        // seconds since walk start, from the sim clock
  wearer: {
    pos: Vec3; heading: Vec3; speed: number;         // m/s
    state: 'walking' | 'stopped' | 'crossing';
    gaze: { target?: string; dwellMs: number; dir: Vec3; pitch: number; yawRate: number };
    pinch?: { target: string };                       // this tick only
  };
  env: {
    crosswalk?: { id: string; distance: number; signal: 'walk' | 'flash' | 'dont'; secondsLeft: number; inRoadway: boolean };
    vehicles: { id: string; kind: 'car' | 'bus' | 'truck' | 'bike'; pos: Vec3; vel: Vec3; bounds: Box3; timeToPath?: number }[];
    people: { id: string; pos: Vec3; bounds: Box3; facing: boolean; onPath: boolean }[];
    sidewalkNarrowsAhead?: { fromN: number; toN: number };
    backdrop: Record<string, number>;                 // luminance 0..1 behind each visible pane, by candidate id
  };
  social: { inConversation: boolean; companions: number };
  entities: Entity[];               // places, stops, signs, within 120 m
  inbox: Notification[];            // texts, DMs, social, app updates, calls; arrive at scripted times
  goal: { scenario: 'hungry' | 'walking'; destination?: string; arrived?: boolean; lap?: number; corner?: boolean; intentAt?: number; suggest?: ScenarioId };
                                    // the sim's view: the intent the walk started with, the door it is routing to,
                                    // whether it is standing at that door, laps completed, and whether the light is held at the start corner
  wearerModel: { dismissed: Record<string, number>; accepted: Record<string, number>; budgetUsed: number; pocket: string[]; snoozeUntil?: number };
}
```

Entities carry a `kind` (food, cafe, theater, venue, shop, service, transit, park, sign), a position and anchor height, live data (wait, seats, hours, next departures), and a `depth` payload for the expanded view. See `docs/world-spec.md` and `data/places.json`. A place's card copy may give its live line a `tone` (`go`, `warn` or `stop`, for the status after the interpunct: `Uptown 4 min · elevator out` is `warn`); the brain passes it through as `content.liveTone` on the card while that line is the one shown (a live flag that swaps the line drops it), and the loader refuses any other tone.

## 3. Output: `Decision[]`

```ts
interface Decision {
  id: string;                       // stable per candidate
  action: 'show' | 'hold' | 'promote' | 'demote' | 'dismiss' | 'save' | 'surface';
  level: 'pip' | 'label' | 'glance' | 'card' | 'expanded' | 'whisper';   // a place climbs pip, label, card, expanded; glance is for the view zone and moments
  timing: 'now' | 'next-pause' | 'batched' | 'after-gate';
  channel: 'visual' | 'ground' | 'edge';
  placement: { anchor: string; zone: 'world' | 'ground' | 'view'; prefer: 'side' | 'above' | 'below'; focusOk?: boolean; zoneOk?: boolean };
  content: { name: string; fact?: string; reason: Reason; depthRef?: string };
  reason: Reason;
  score: number;
  band: 'stopped' | 'stroll' | 'walk' | 'brisk';
  signals: SignalBundle;            // everything the decision rested on, for the log
}

interface Reason {
  kind: 'goal' | 'world' | 'gate' | 'budget' | 'social' | 'edge' | 'pace' | 'pocket';
  text: string;                     // the one line the wearer may see, at most 48 characters
  parts: { signal: string; value: number | string; weight: number }[];   // for the inspector
}
```

Reasons cite only the goal or the world. Never the wearer's body, eyes or habits. A pace reason reads "Saved for the next stop", never "You were walking fast".

## 4. The tick, in order

1. **Pace band.** From `wearer.speed`, with 600 ms hysteresis. Stopped < 0.2, Stroll 0.2 to 0.9, Walk 0.9 to 1.6, Brisk above. The band is attached to every decision.
2. **Gates.** Hard rules, no scoring:
   - Safety: `wearer.state === 'crossing'` or `env.crosswalk.inRoadway` or any vehicle with `timeToPath < 3` → every world-zone item holds, ground safety text shows, the held glyph counts anything that arrives. A bike with `timeToPath < 3` approaching from behind on the wearer's side → `BIKE · Ns` on the ground in the stop tone, with an arrow for its direction.
   - Social: `inConversation` (someone is talking to the wearer; not scripted in the v1 walks, covered by a focused eval) → messages and non-safety items hold; the curb follow-up becomes "When you're free". Any person within 2 m ahead on the wearer's path (`env.people` with `onPath`) → messages hold until passed; the wearer threads past people with nothing new arriving.
   - Snooze: `t < wearerModel.snoozeUntil` → only safety shows. The glyph counts down. The gesture is pitch above 0.55 rad with no gaze target for 2 s, the head still relative to the walking direction for the last second; the glyph reads "Snoozing" through the second second.
   - Budget: an attention budget per walk (default 7 proactive shows, regenerates one per 40 s of quiet). Shows earned by dwell or pinch are free, and so is the destination at its door, which the wearer asked for, whatever want it began as. Empty budget → only safety, calls, and gaze-triggered items.
3. **Candidates.** Every entity within range, every inbox item, every proactive moment (`docs/scenarios.md` lists them), and the pocket when the band is Stopped. Each gets `relevance` from the goal and `value` from the world.
4. **Score.** `score = relevance × value × proximity × novelty − cost`:
   - `relevance` ∈ [0,1]: 1 for an entity matching the goal, .35 for a gaze target regardless of goal, .1 otherwise.
   - `value`: wait and seats for food; time-to-departure for transit; seats left for shows.
   - `proximity`: `1 − distance / range`.
   - `novelty`: 1, halved per prior dismissal of that kind, ×1.2 per prior acceptance.
   - `cost`: .25 base, +.15 per band above Stopped, +.3 if a card is already open.
   - Calibration, as built (all in `config.ts`): `value` is about 1 for an ordinary option and rises toward 2 for a good one. Food and cafes: `1 + .6 × (10 − wait)/10 + .3 × seats/8`; a show with seats: `1 + .5 × seatsLeft/40`; transit: `1 + .6 × (6 − next)/6`, 1.6 with a bus at the stop. For Hungry, a cafe is a partial match (relevance .6). A bus at the stop has relevance .35, enough for a pip and never a proactive label.
   - A pip asks nothing of the reader, so its test is `relevance × value × proximity − .25 > 0` (no band surcharge, no novelty). A gaze target gets at least a pip once it has held the gaze for 250 ms (`ladder.pipDwellS`), and only then counts as a gaze target in the score; a place swept past stays dark.
   - `novelty` is 0 for content already presented and folded this walk (an item never repeats itself proactively until its live data changes).
   - The brain stays quiet for the first 0.8 s of a walk while the street fades up.
5. **Ladder** (`docs/walking-rules.md` rule 10 and the pace bands). World-zone items only; view-zone items (banners, the menu, the map tile, the pocket, the ask glance) follow the notification rules and are allowed in any band but Brisk. Awareness pips are sparse: a pip without gaze only for a place relevant to the goal (relevance .6 or more) or a scripted moment (the bus at the stop), at most three lit at once counting panes already up (the one being looked at included, so the count holds when the look moves on), moments first, places already lit kept over newcomers; everything else stays dark until looked at for 250 ms. Labels: the snapshot's `wearer.gaze.settled` comes from the sim's settle detector (head yaw rate under 0.3 rad/s for 300 ms after it went over 0.6 rad/s for 200 ms), shared by the scripted reviewer and live play. On each settle the brain takes every place in view within 70 m, nearest first, up to six, as the label set; a place the wearer looks at joins it. A member shows at `label` (cause `settle`, not a show for the budget); members whose places leave the view are dropped; while the snapshot's `gaze.settled` holds in Stroll or Walk and the head has moved since the walk or lap began, places that have been in view 0.5 s within range join the set (not the place being looked at, which waits for its 250 ms), and a member leaves only after 1 s out of view and 2.5 s after it joined (`labels.joinS`, `labels.goneS`, `ladder.minShownS`); through a settle and through `goneS` the set keeps every member that is the gaze target, was within the last second, or has its pane under the viewfinder (from the overlay's report), visible or not, so a label under the look is never taken away by the roster; in Brisk the set is only the place under the center. The sim's settle detector also counts a slow look: more than 0.2 rad of head travel since the last settle, then 300 ms under 0.3 rad/s. The place under the center lights its label at 250 ms of gaze and grows to its card after 0.5 s more of hold on the label (`ladder.growS`; 1.0 s beyond 35 m, `growFarS`; and not at all until the head has moved 5°, `moveRad`, since the walk or the lap began), at most one new card a second (`ladder.swapGapS`); growing a card shrinks any other card to its label in the same tick. A card holds 2 s (`ladder.cardHoldS`); in every band short of Brisk 2 s more of hold expands it (at Stopped or Stroll a pinch does too; at Walk a pinch saves), the hold counted from the card or from the look, whichever came later. A label a card or a view came down to by look-away stays at least `ladder.minShownS` (2.5 s) before the roster can fold it, so it is not gone the tick after it shrank and reborn at the next settle. Looking away for 0.5 s (`ladder.lookAwayS`, the shared `LOOK_AWAY_S` that the walk's release grace and aiming window and the sim's flicker also read; 1 s until Phase 30, the owner's "the moment") shrinks a card or expanded view straight to its label, every time. For a card or a view the walk's gaze lets the look go the frame the center of the view leaves the pane's rect, or a turn carries the pane more than half the held square from where it stood at rest, with no grace of its own, so the shrink comes 0.5 s after the look leaves; only its pane keeps or takes the look, dimmed or not, and a place the look has left is taken again only as a look lands (overlay-spec 7, Gaze). At the destination's door the view keeps Phase 29's rule: its rect plus 24 px (`READ.marginPx`, `lookOnPane`) and the door's light. A look that comes back within that half second resumes its hold where it left it (the time away is not counted, for the label's grow and the card's expand alike), and a hold pauses while the pane is hidden by something in the world. The mark reports `next`, the level the hold is counting toward, only when a held look can reach it now (not on a compact card, a label in Brisk, or a label before the head has moved 5°), and it starts its count where the ladder will grow, after the one-card-a-second gap; the overlay's hold rule and the viewfinder read it. A place beyond 30 m (`ladder.cardWithinM`) grows to a compact card (the photograph kept, no reason, no rows) and never expands; crossing 30 m turns it into the full card in place (a `promote` at the same level, with a new `announce` key) and restarts the expand hold. Proactive: a label if score > .45 and fewer than three proactive labels are up, auto-folding by rule 3. In Brisk a place is a label at most, in the whisper form, and a place worth saying that is not looked at (goal-relevant, past the score threshold for 400 ms) produces one `whisper` line, once per Brisk stretch. A label at Stopped or Stroll carries `placement.zoneOk`, so the focus zone does not hide it. Each frame's `dwell.mark` reports the gaze target's progress toward its next level (`p` from 0 to 1 and its `rate` per second), so the reviewer's gaze mark can fill between ticks.
6. **Pocket.** A pinch on a gaze target in Walk or Brisk emits `save`; nothing opens. A choice settled in an expanded view also goes in the pocket, with its entry from the place's data (a row's `pocket`, else the action's), and marks the stop it was made at as already surfaced. When the band has been Stopped for 2 s and the pocket is not empty and the time available (the signal countdown at a signal, otherwise 20 s) is at least 6 s, emit `surface` with the time available. Under 6 s, wait for the next pause.
7. **Reading budget.** A label is the name and the say line's short form; the card carries the say line. Trim by rule: drop the reason line first, then the second fact. Label copy while moving is capped at three words plus one number. Never truncate with an ellipsis.
8. **Timing.** `now` if stopped or the item is a gaze target; `next-pause` for messages while walking; `batched` if a card is open; `after-gate` if a gate is up. Auto-fold: a proactive world-zone label folds after 2.5 s in Walk, 4 s in Stroll, never in Stopped; a view-zone item while moving folds after 4 s unless looked at. No fold clock runs while a safety gate is up: the crossing recedes the glass, so a text that landed at the curb keeps its time for the far one.
9. **Hysteresis.** A score-driven level change holds for 1.2 s unless a gate fires, and a score-driven promotion needs the score to hold for 400 ms. The dwell ladder's climbs and the look-away descent are exempt: they are the wearer's attention, not a score. A band change never demotes a gaze target instantly; it waits for the look-away.
10. **Placement hints.** Zone, preferred side, and whether the item may enter the focus zone (only the gaze target's pane, while it is the gaze target). The overlay does the geometry.
11. **Log.** Append every decision, including holds, with its signals and band. A "show" for the budget and the evals is a decision with action `show` at whisper level or above outside the ground layer; pips and everything painted on the ground (safety text, route, destination column) are not shows. Each decision also carries a `cause` (dwell, pinch, score, look-away, auto-fold, band, gate, choice, reply, notification, goal, pocket, safety, arrival, timer) so hysteresis and the ladder can be checked from the log. Holds are logged once per item, level and reason.

As built, the tick returns a `BrainFrame`: the standing decisions (everything on the glass, each the latest decision for its item), this tick's new decisions (the log entries), the gate state, the glyph, the focus zone for the band, the wearer model and the dwell. `overlay.apply` diffs the standing decisions and plays the one-shot moves from the new ones.

A head-scan near the curb (rule 5) is not a look-away while it lasts: while the head turns faster than 0.8 rad/s within 8 m of a curb, and for 0.8 s after, the item last looked at keeps its level (`scanKeep` in the ladder). Its look-away is not paused: if the look is back on it within the scan, the hold resumes; if not, the half second counts from the turn and it shrinks as soon as the scan is over. A gaze target is capped at the band's ceiling (a label in Brisk), so a card or an expanded view never rides into Brisk.

Two conflicts settled in favour of `docs/walking-rules.md`: entering Brisk folds every pane at once, gaze target or not (no panes in Brisk outranks "a band change never demotes a gaze target instantly"); and a card earned by dwell that the wearer looks away from walks down by look-away, not by the band cap, except into Brisk.

At the start corner (the sim reports `goal.corner` while it holds the light) the brain asks nothing: the light holds 12 s each lap with WAIT counting down, and a place chosen from the menu releases it (`goal.go`). A recording starts its walk with an intent choice (`{ id: 'intent', action }`): Explore lets the light go at once; Lunch leaves the corner to the menu, which the recording opens on Food. Live, the sim starts its scenario's intent on the first step, so the walk's timed beats (Maya's text, the truck, the bike) come in live play too. The menu is the wearer's own: closed, the four categories, or one category's places, driven by choice events on `menu` (`open`, `food` · `things` · `shops` · `transit`, `back`, `close`, or a place id) and by a pinch on a row (`pick:<id>`). A category's places are ordered by walk time when the list opens and keep that order while it is open; a walk time under a minute reads as the distance (`40 m`, rounded to 5 m, from the walk time at the walking speed), from a minute as whole minutes rounded up, in the list, the route's ground glance and the route offer alike. A place chosen becomes the destination with cause `choice`, the route's ground glance reads `{name} · {walk time}` (the name and, as its fact, the walk time when it was drawn), and a lunch place makes the goal Lunch, so Go here instead and "Your pick for lunch" apply; a new choice replaces the destination. The menu closes in Brisk and on every gate and never reopens on its own; it is not on the attention budget. The map tile is a view-zone want while a destination is set and for 10 s after arrival, or with no destination when a crossing turn is within 20 m; never in Brisk, in a gate or while the menu is open; not on the budget.

A text with quick replies is a thread. The sim keeps the conversation (the wearer's reply joins it, and the answer the walk file gives for that reply follows after its delay); the brain never reads the words. It reads which reply was chosen and what the walk file attaches to it: an offer (a place and a why) opens "{place} · {walk time} · route there?" under the thread at once, or once the other side has answered when the reply asked a question; Yes sets the place as the destination with cause `reply`, the why as the route's reason and, at the door, the arrival line's reason; Not now folds it. A thread stays at the top center until it is answered or dismissed, at glance size while moving and full at a stop, out of view in Brisk (coming off a crossing, only once Brisk has lasted 2.5 s past the gate, so a thread that crossed with the wearer never blinks out and back); its later returns are not new shows for the budget. Every text and DM is a banner at the top center (`view:banner`): its time reads `now`, then `1 min` and on, from the walk's clock; its quick replies come only when a reply fits (Stopped, Stroll, or the banner looked at); while walking an unanswered banner that is not looked at folds after `viewFoldS` (4 s) of Walk or Brisk and comes back once the wearer has been Stopped half a second with no gate and no WALK signal, at its stopped size, which logs a new show.

The brain owns the intent and the destination; the sim owns where the wearer is. An intent arrives as a choice (`{ id: 'intent', action }`) from the reviewer's script; it clears any destination. A destination is set by a choice (a place from the menu, hold a seat, "Go here instead", or a Yes to an offer). Each frame's `goal.destination` is the route target the sim follows (`sim.plan(frame.goal)`), so the brain stays a rules policy with no geometry in it. When the target changes, the route ground glance re-announces with a cause: `choice` or `reply` for the wearer's own act, `goal` when the next stop takes over or a closure drops one. When the sim reports the wearer at the door (`goal.arrived`), the arrival line shows, anchored at the door at head height (`door:<id>`) so it is in view when the wearer turns to face it; the arrival card is exempt from the dwell ladder, and a held look grows it to its expanded view after 2 s like any card (the sim keeps the wearer at the door while they look, up to 30 s). A seat held there is the arrival line on the place's own pane (`Seat's held, inside on the left.`), never a second glance at the same door, so a held look still opens the view. A pane already up for the place (a label the settled view gave it) moves to the door anchor first and grows to its card only once it has been in sight there for 0.3 s in a row (a destination the wearer is already looking at comes up as its card then, the card's own content with the arrival line, and its expanded view 2 s later; one that is not looked at as its label) (`arrival.anchorS`; a fold at the view edge starts the count again), so nothing grows while it is still arriving or flapping at the edge. When the sim leaves the door, a reached destination clears; Lunch drops back to Explore. Within 8 m of the route target, before the wearer is at the door, a fold of the target's pane at the view's edge does not count toward its look-away, so the arrival moment never follows a fold of the same pane by a fraction of a second; at the door looking away counts as it does anywhere. A card or a view kept up from the approach that the wearer is not looking at when it comes into sight at the door comes down to the arrival line on its label at once (cause `arrival`). A moment tied to a crossing ("No need to run") is anchored on the pedestrian signal across the street, where the wearer is looking.

An expanded view is the place's depth from `data/places.json`: up to four rows, one primary action and `Not now`, and what each choice settles. Where the rows are each a choice, each row carries its action label (`act`), its confirmation (`after`) and its pocket entry (`pocket`), and the primary action's label in the decision is the default row's (the row marked now, else the first choice); otherwise the place's `after` and `pocket` are keyed by the action. A choice event names the place, the action and, when the wearer lifted one, the row (`{ id, action, row }`; the reviewer's `choose` beat with a `row`). The brain resolves the row (the lifted one, else the default), keeps `{ action, row }` as the place's chosen state, and from then on the expanded view carries only the chosen row and the confirmation as its note, with no actions; where the rows are not choices they all stay. The pane's `announce` key becomes `x:{action}:{row}`, so the change is logged as a promote at the same level with cause `choice` and the confirmation in its content; the inspector shows it on that line and the end panel names it in What it decided as `{place} · {confirmation}`. A say line can name a plan (`when`: the inbox item whose offer the wearer accepted, as the Big Bean's `Maya's meeting you here at 1`); it speaks only once the wearer has said yes, else the default line speaks, and while it speaks the card carries no reason line, since the say line already says why. Pocket Park has rows and no action.

One banner at a time: when two texts want the top center, an open thread is the banner (else the one shown first) and the other a strip (component `strip`, the sender and the line) tucked under it; the banner's time carries the count (`2 · now`) and its announce key the count, so the change is logged; a look or a pinch on the strip makes that text the banner. While the wearer reads a place's expanded view (any band short of Brisk, the place the gaze target at `expanded`), a text banner they are not looking at folds, and it comes back once nothing is being read and they have stood still half a second.

Notifications have fixed behaviors (see `docs/scenarios.md`): a text shows at glance at the next safe moment; social accumulates on the held glyph and surfaces once when stopped; a call shows at the edge during a walk but never in a crossing; app updates batch under whatever is open.

## 5. The ask glance

There is no intent inference. The wearer sets the intent. The one place the brain asks is Just walking: once the wearer has looked at two food places long enough to light their labels (kinds `food` and `cafe` both count), the next time the band is Stopped it offers one line at the edge, "Hungry? · Find lunch · No". It asks when the wearer can answer, never while moving. Yes switches the intent to hungry; no suppresses the question until the next intent.

## 6. Determinism and the clock

The brain takes `t` from the snapshot, never from `Date.now()`. No `Math.random()` anywhere in the package. Two runs of the same walk produce identical logs. That is what makes the eval suite and the inspector's replay possible.

## 7. The log

```ts
interface LogEntry { t: number; decision: Decision; snapshotRef: number }
```

Snapshots are stored at 10 Hz for the walk (a ninety-second walk is small). The inspector scrubs this log; the eval suite scores it. Export is JSON.

## 8. Config

All thresholds above live in `config.ts` with defaults and are overridable per scenario, so evals can test a rule in isolation. The walking-rule numbers are the ones in `docs/walking-rules.md`; if the build changes one, change it there too and say so in `STATUS.md`.

## 9. Not in v1

Learning across walks, real sensor input, face recognition of any kind, real data feeds, any model call. Privacy is a rule, not a feature: people are never identified; "someone is talking to you" is the most the brain knows.
