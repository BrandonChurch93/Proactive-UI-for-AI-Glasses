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
  goal: { scenario: 'hungry' | 'errands' | 'walking'; stops?: Stop[]; destination?: string; arrived?: boolean; lap?: number; corner?: boolean; intentAt?: number };
                                    // the sim's view: the intent the wearer chose, the errands list, the door it is routing to,
                                    // whether it is standing at that door, laps completed, and whether the light is held at the start corner
  wearerModel: { dismissed: Record<string, number>; accepted: Record<string, number>; budgetUsed: number; pocket: string[]; snoozeUntil?: number };
}
```

Entities carry a `kind` (food, cafe, theater, venue, shop, service, transit, park, sign), a position and anchor height, live data (wait, seats, hours, next departures), and a `depth` payload for the expanded view. See `docs/world-spec.md` and `data/places.json`.

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
   - Budget: an attention budget per walk (default 7 proactive shows, regenerates one per 40 s of quiet). Shows earned by dwell or pinch are free. Empty budget → only safety, calls, and gaze-triggered items.
3. **Candidates.** Every entity within range, every inbox item, every proactive moment (`docs/scenarios.md` lists them), and the pocket when the band is Stopped. Each gets `relevance` from the goal and `value` from the world.
4. **Score.** `score = relevance × value × proximity × novelty − cost`:
   - `relevance` ∈ [0,1]: 1 for an entity matching the goal, .35 for a gaze target regardless of goal, .1 otherwise.
   - `value`: wait and seats for food; time-to-departure for transit; seats left for shows; an errand stop that is open and on the route for errands.
   - `proximity`: `1 − distance / range`.
   - `novelty`: 1, halved per prior dismissal of that kind, ×1.2 per prior acceptance.
   - `cost`: .25 base, +.15 per band above Stopped, +.3 if a card is already open.
   - Calibration, as built (all in `config.ts`): `value` is about 1 for an ordinary option and rises toward 2 for a good one. Food and cafes: `1 + .6 × (10 − wait)/10 + .3 × seats/8`; a show with seats: `1 + .5 × seatsLeft/40`; transit: `1 + .6 × (6 − next)/6`, 1.6 with a bus at the stop; an open errand stop on the route 1.5, a closed or finished one 0. For Hungry, a cafe is a partial match (relevance .6). A bus at the stop has relevance .35, enough for a pip and never a proactive label.
   - A pip asks nothing of the reader, so its test is `relevance × value × proximity − .25 > 0` (no band surcharge, no novelty). A gaze target gets at least a pip once it has held the gaze for 250 ms (`ladder.pipDwellS`), and only then counts as a gaze target in the score; a place swept past stays dark.
   - `novelty` is 0 for content already presented and folded this walk (an item never repeats itself proactively until its live data changes), and for errand stops already listed on the errands card.
   - The brain stays quiet for the first 0.8 s of a walk while the street fades up.
5. **Ladder** (`docs/walking-rules.md` rule 10 and the pace bands). World-zone items only; view-zone items (the errands card, toasts, the pocket, the ask glance) follow the notification rules and are allowed in any band but Brisk. Awareness pips are sparse: a pip without gaze only for a place relevant to the goal (relevance .6 or more) or a scripted moment (the bus at the stop), at most three lit at once counting panes already up (the one being looked at included, so the count holds when the look moves on), moments first, places already lit kept over newcomers; everything else stays dark until looked at for 250 ms. Labels: the snapshot's `wearer.gaze.settled` comes from the sim's settle detector (head yaw rate under 0.3 rad/s for 300 ms after it went over 0.6 rad/s for 200 ms), shared by the scripted reviewer and live play. On each settle the brain takes every place in view within 70 m, nearest first, up to six, as the label set; a place the wearer looks at joins it. A member shows at `label` (cause `settle`, not a show for the budget); members whose places leave the view while it moves are dropped; the whole set fades after 4 s of walking with no member under the center, and stays at Stopped. The place under the center lights its label at 250 ms of gaze and grows to its card after 0.5 s more of hold on the label (`ladder.growS`; 1.0 s beyond 35 m, `growFarS`; and not at all until the head has moved 5°, `moveRad`, since the walk or the lap began), at most one new card a second (`ladder.swapGapS`); growing a card shrinks any other card to its label in the same tick. A card holds 2 s (`ladder.cardHoldS`); at Stopped or Stroll 2 s more of hold, or a pinch, expands it. Looking away for 1.2 s shrinks a card or expanded view straight to its label. A place beyond 30 m (`ladder.cardWithinM`) grows to a compact card (no reason, no rows) and never expands; crossing 30 m turns it into the full card in place (a `promote` at the same level, with a new `announce` key) and restarts the expand hold. Proactive: a label if score > .45 and fewer than three proactive labels are up, auto-folding by rule 3. In Brisk a place is a label at most, in the whisper form, and a place worth saying that is not looked at (goal-relevant, past the score threshold for 400 ms) produces one `whisper` line, once per Brisk stretch. A label at Stopped or Stroll carries `placement.zoneOk`, so the focus zone does not hide it. Each frame's `dwell.mark` reports the gaze target's progress toward its next level (`p` from 0 to 1 and its `rate` per second), so the reviewer's gaze mark can fill between ticks.
6. **Pocket.** A pinch on a gaze target in Walk or Brisk emits `save`; nothing opens. When the band has been Stopped for 2 s and the pocket is not empty and the time available (the signal countdown at a signal, otherwise 20 s) is at least 6 s, emit `surface` with the time available. Under 6 s, wait for the next pause.
7. **Reading budget.** A label is the name and the say line's short form; the card carries the say line. Trim by rule: drop the reason line first, then the second fact. Label copy while moving is capped at three words plus one number. Never truncate with an ellipsis.
8. **Timing.** `now` if stopped or the item is a gaze target; `next-pause` for messages while walking; `batched` if a card is open; `after-gate` if a gate is up. Auto-fold: a proactive world-zone label folds after 2.5 s in Walk, 4 s in Stroll, never in Stopped; a view-zone item while moving folds after 4 s unless looked at.
9. **Hysteresis.** A score-driven level change holds for 1.2 s unless a gate fires, and a score-driven promotion needs the score to hold for 400 ms. The dwell ladder's climbs and the look-away descent are exempt: they are the wearer's attention, not a score. A band change never demotes a gaze target instantly; it waits for the look-away.
10. **Placement hints.** Zone, preferred side, and whether the item may enter the focus zone (only the gaze target's pane, while it is the gaze target). The overlay does the geometry.
11. **Log.** Append every decision, including holds, with its signals and band. A "show" for the budget and the evals is a decision with action `show` at whisper level or above outside the ground layer; pips and everything painted on the ground (safety text, route, destination column) are not shows. Each decision also carries a `cause` (dwell, pinch, score, look-away, auto-fold, band, gate, choice, reply, notification, goal, pocket, safety, arrival, timer) so hysteresis and the ladder can be checked from the log. Holds are logged once per item, level and reason.

As built, the tick returns a `BrainFrame`: the standing decisions (everything on the glass, each the latest decision for its item), this tick's new decisions (the log entries), the gate state, the glyph, the focus zone for the band, the wearer model and the dwell. `overlay.apply` diffs the standing decisions and plays the one-shot moves from the new ones.

A head-scan near the curb (rule 5) is not a look-away: while the head turns faster than 0.8 rad/s within 8 m of a curb, the item last looked at keeps its level and its look-away timer is paused for 0.8 s after the scan. A gaze target is capped at the band's ceiling (card in Walk, nothing above a pip in Brisk) so an expanded view never rides into a walk.

Two conflicts settled in favour of `docs/walking-rules.md`: entering Brisk folds every pane at once, gaze target or not (no panes in Brisk outranks "a band change never demotes a gaze target instantly"); and a card earned by dwell that the wearer looks away from walks down by look-away, not by the band cap, except into Brisk.

The brain owns the intent, the destination and the errands order; the sim owns where the wearer is. An intent arrives as a choice (`{ id: 'intent', action }`), from the title, the reviewer's script or (Phase 19.3) the intent panel; it clears any destination. A destination is set by a choice (hold a seat; in 19.3 a picker row or "Go here instead"; in 19.4 a Yes to an offer) and, for Errands, is the first open stop in list order. Each frame's `goal.destination` is the route target the sim follows (`sim.plan(frame.goal)`), so the brain stays a rules policy with no geometry in it. When the target changes, the route ground glance re-announces with a cause: `choice` or `reply` for the wearer's own act, `goal` when the next stop takes over or a closure drops one. When the sim reports the wearer at the door (`goal.arrived`), the arrival line shows (an errands stop shows its card), anchored at the door at head height (`door:<id>`) so it is in view when the wearer turns to face it; the arrival card is exempt from the dwell ladder. When the sim leaves the door, a reached destination clears; Hungry and a finished Errands drop to no intent (Just walk), and a finished errands list says "All done" until it folds, then clears. Within 8 m of the route target the target's pane does not walk down by look-away, so the arrival moment never follows a fold of the same pane by a fraction of a second. A moment tied to a crossing ("No need to run") is anchored on the pedestrian signal across the street, where the wearer is looking.

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
