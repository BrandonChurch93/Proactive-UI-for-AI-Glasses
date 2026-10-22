# Walking Rules · how the interface behaves for a person on a street

The wearer's attention is the scarcest resource on the street. Every rule here treats it that way. Each rule has a trigger, a response, timing, and what the eval checks. The rules are deterministic; no model is involved. They are the center of the project.

## Pace bands

Speed comes from the wearer signal. Scripted speeds per band: Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s. Bands are hysteretic (a band changes only after 600 ms in the new range) so nothing flickers at a boundary.

| Band | Speed | What is allowed |
| --- | --- | --- |
| Stopped | < 0.2 m/s | Anything: glance on 0.45 s dwell, card on a further 0.6 s, expanded on a further 1.6 s or a pinch, the pocket surfaces |
| Stroll | 0.2 to 0.9 m/s | Glance; card on a further 0.8 s of dwell; expanded on a further 1.6 s |
| Walk | 0.9 to 1.6 m/s | Glance; card on a further 1.2 s of dwell only; pinch saves to the pocket |
| Brisk | > 1.6 m/s | The place being looked at gets a glance (three words and a number); anything else is the whisper line; pinch saves |

## Rule 1 · Speed-scaled focus zone

- Trigger: every frame, from the pace band.
- Response: the keep-out zone in the center of the view scales with speed. Stopped: middle 33% of width × 40% of height. Stroll 38 × 44. Walk 44 × 50. Brisk 52 × 58. World-zone content is placed outside it; content already inside it when the zone grows is pushed out over 320 ms ease-out, not cut.
- The pane on the thing being looked at is exempt: gaze is the center of the view, so that thing is always inside the zone, and its pane sits beside it. When the look moves away, the pane leaves the zone over the same 320 ms, or waits as its light if it has no place within its own width of it.
- Eval: in every frame of every walk, no world-zone pane above 20% opacity intersects the zone for its current band, except the pane being looked at and a pane in its 320 ms move out (after the zone grew or the look left).

## Rule 2 · Reading budget

- Trigger: a candidate is about to be shown while the band is not Stopped.
- Response: the brain estimates reading time (words × 240 ms + numbers × 320 ms) and compares it to the time the item will stay in comfortable view at the current speed. Glance content is capped at three words plus one number while walking (the place name does not count; a unit counts with its number); in Walk and Brisk the reason line is never on the glass, only in the log; a card is refused unless the band allows it; copy that does not fit is shortened by rule (drop the reason line first, then the second fact), never truncated with an ellipsis.
- Eval: no shown world-zone glance exceeds the cap in Walk or Brisk; no world-zone card appears in Walk without its dwell; in Brisk no card appears and the only world glance is the place being looked at. View-zone items (the errands card, message and call toasts, the pocket, the ask glance) are governed by the notification rules and the view zone's edge placement, not the dwell ladder: allowed in any band but Brisk, at the edge, folding after 4 s while moving unless looked at.

## Rule 3 · Auto-fold while walking

- Trigger: a glance has been shown for 2.5 s in Walk and is not the gaze target.
- Response: it folds on its own (dissolve, retract). Nothing waits to be dismissed while the wearer moves. In Stroll the limit is 4 s; Stopped has no limit; Brisk has no glances to fold. Like every change the wearer did not ask for, it never comes sooner than 2.5 s after the pane's last change of level.
- Eval: no non-gaze glance persists past its band's limit. Level hysteresis (1.2 s) applies to score-driven changes only, never to the dwell ladder's climbs or the look-away descent.

## Rule 4 · Entry

- Trigger: a new show.
- Response: a new pane is born at its placed position, beside or above its light, with the condense move. It never slides in from the edge of the view. While moving, a pane that is not the thing being looked at is born outside the focus zone, or waits as its light.
- Eval: the first frame of any pane while moving is outside the focus zone unless it is the thing being looked at.

## Rule 5 · Head-scan yielding

- Trigger: within 8 m of a curb, the head turns toward a side faster than 0.8 rad/s (the look-left, look-right before crossing).
- Response: content on that side yields instantly (fade to 15% and slide 24 px outward over 180 ms ease-gate) and returns when the head comes back (320 ms ease-out). Nothing is re-placed during the scan: panes stay with their stores, and one that the scan carries somewhere it could not normally sit yields as well. The glasses never compete with a safety check.
- Eval: in the scripted head-scan beat, the panes on the scanned side are below 20% opacity within 200 ms of the turn and restored within 400 ms of the return.

## Rule 6 · The pocket

- Trigger: a pinch on a gaze target while the band is Walk or Brisk.
- Response: nothing opens. The item is saved: a one-word confirmation at the pip ("Saved", 600 ms), and the held glyph gains a pocket count. Dwell still shows the glance; pinch never shows a card while moving.
- Eval: no expanded or card results from a pinch in Walk or Brisk; the pocket count increments; the item is present in the pocket.

## Rule 7 · The pocket surfaces at the pause

- Trigger: the wearer has been Stopped for 2 s, the pocket is not empty, and the time available (the signal countdown at a signal, otherwise 20 s) is at least 6 s.
- Response: the brain surfaces the pocket with the time available: "12 s · what you saved", with the saved items as a short list grown in place beside the held glyph. Pinch opens one; the rest wait. If the time available is under 6 s, the pocket waits for the next pause.
- Eval: the pocket surfaces within 500 ms of a qualifying stop with the correct remaining time; it never surfaces during a gate; it does not surface when time available is under 6 s.

## Rule 8 · The world has right of way

- Trigger: a person or vehicle (moving, or stopped in traffic like a bus at its stop) between the eye and the pane's anchor overlaps the pane's projected bounds for more than 120 ms. Something behind the thing the pane describes is not in its way.
- Response: the pane dims to 30% on the first frame and slides away from the overlap by the overlap width plus 20 px over 220 ms, up or down when it can, never along the mover's own path and never further than its own width, leaving a faint trace line to its home position. It returns when clear, over 320 ms ease-out. If it cannot clear, it stays dimmed in place, and drops to its pip only when the mover covers more than 60% of it for 300 ms (a face it cannot clear drops it at once). A dropped pane is hidden, not destroyed: the brain holds its level while it is out of sight, and it condenses back in its own place 300 ms after the way is clear.
- Eval: in the scripted pedestrian beat, the card's rect never intersects the pedestrian's rect while the card is above 30% opacity; a vehicle covering a pane dims it on the first frame and drops it only after 300 ms above 60% cover.

## Rule 9 · Backdrop adaptivity

- Trigger: every 250 ms, for each visible pane.
- Response: the scene reports the luminance behind the pane (in the sim, a ray from the pane center into the scene returns the hit material's albedo and whether it is sunlit; in real glasses this would be the camera). Over a bright backdrop the glass fill alpha rises to .78 and body weight to 500; over a dark one it falls to .52 and weight 400. Text is never below 4.5:1 against the measured backdrop.
- Eval: contrast of primary text against the sampled backdrop is at least 4.5:1 at every scripted beat on both the lit and the shadowed façade.

## Rule 10 · The dwell ladder

- Trigger: continuous gaze on one anchor.
- Response: attention alone climbs every level. 0.45 s of dwell shows the glance; the band's card dwell past it (0.6 s Stopped, 0.8 s Stroll, 1.2 s Walk) shows the card; a further 1.6 s of dwell on the card, in Stopped or Stroll only, expands it. A glance the wearer earns by looking condenses while its light travels, so it reads well inside a second of the look; in Brisk the place being looked at climbs to a glance and no further. Pinch is a shortcut that skips the wait, never a requirement. A place beyond 30 m climbs no further than its glance: a far store gets a label, and the card comes as the wearer closes in. A look has to hold for 250 ms before a place even lights, so sweeping the view across a street lights nothing. Looking away for 1.2 s walks back down one level at a time. There is no separate hands-busy mode: a wearer carrying bags, holding a child's hand, or wearing gloves gets the same interface, because dwell already reaches everything.
- Eval: with no pinch events, a scripted dwell in Stopped reaches the glance at 0.5 s, the card at 1.1 s and the expanded view at 2.7 s (on the 10 Hz tick); the same dwell in Walk reaches the card at 1.7 s and never expands; no level is ever reached without the dwell its band requires.

## Rule 11 · The whisper channel

- Trigger: Brisk band, and something worth saying that the wearer is not looking at (relevant to the goal, past the score threshold).
- Response: instead of a world-zone pane, the brain shows one captioned line at the bottom edge in the view zone: "Grace Theater · last show at 8". After the name, three words and a number at most, 2.5 s, then gone, once per place per Brisk stretch. The place the wearer is looking at gets its glance instead, capped the same way. Visual when the wearer can afford it, a line when they cannot.
- Eval: in Brisk, no card, and no world-zone glance except the place being looked at; whisper lines obey the cap and the duration.

## Rule 12 · Snooze

- Trigger: the wearer looks up (pitch above 0.55 rad) at nothing in particular for 2 s, with the head held still for the last of those seconds (relative to the walking direction, so a bend in the route is not a drag). Looking up at a sign is attention, not the gesture: with a gaze target the pitch does not count. Dragging the view up to a tall building keeps moving the head, so it does not snooze.
- Response: through the second second the held glyph reads "Snoozing", so looking down cancels it before anything happens. Then everything folds, the glyph shows "60 s" and counts down, and nothing new is shown except safety until it expires or the wearer looks up again the same way to cancel. The quietest control in the system.
- Eval: after the gesture, no shows for 60 s except gate-related safety text; the glyph shows "Snoozing" during the second second and then the countdown; a moving look up does not snooze.

## Rule 13 · The budget is visible

- Trigger: always, in the inspector.
- Response: the attention budget is a meter that drains on each proactive show (a decision with action `show` at whisper level or above that the wearer did not earn by looking or pinching; pips and ground safety text are not shows, and dwell-earned shows are free) and refills one unit per 40 s of quiet. The inspector shows it live and in the log.
- Eval: proactive shows per walk never exceed 7 plus the refills earned during the walk (9 on a 90 s walk with enough quiet); the meter in the log matches the count of shows that were not earned by dwell or pinch.

## How these combine

The gates in `docs/brain-spec.md` run first and beat everything. Then the pace band decides what is allowed and the dwell ladder decides when. Then placement runs with the current focus zone and keep-outs. Then the reading budget trims copy. Auto-fold and the pocket run on timers inside the brain tick. Backdrop adaptivity is an overlay concern and runs on its own clock.
