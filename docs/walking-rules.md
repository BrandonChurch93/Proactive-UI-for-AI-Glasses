# Walking Rules · how the interface behaves for a person on a street

The wearer's attention is the scarcest resource on the street. Every rule here treats it that way. Each rule has a trigger, a response, timing, and what the eval checks. The rules are deterministic; no model is involved. They are the center of the project.

## Pace bands

Speed comes from the wearer signal. Scripted speeds per band: Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s. Bands are hysteretic (a band changes only after 600 ms in the new range) so nothing flickers at a boundary.

| Band | Speed | What is allowed |
| --- | --- | --- |
| Stopped | < 0.2 m/s | Labels when the view settles, and they stay; the label under the center grows to its card after 0.5 s of hold, the card to its expanded view after 2 s more or on a pinch; the pocket surfaces |
| Stroll | 0.2 to 0.9 m/s | The same, except that places coming into view join the labels while the head is settled |
| Walk | 0.9 to 1.6 m/s | Labels, capped at three words and a number; the label under the center grows to its card after 0.5 s; no expanded view; pinch saves to the pocket |
| Brisk | > 1.6 m/s | Labels in the whisper form (name and one number), never a card; anything worth saying that is not looked at is the whisper line; pinch saves |

## Rule 1 · Speed-scaled focus zone

- Trigger: every frame, from the pace band.
- Response: the keep-out zone in the center of the view scales with speed. Stopped: middle 33% of width × 40% of height. Stroll 38 × 44. Walk 44 × 50. Brisk 52 × 58. World-zone content is placed outside it; content already inside it when the zone grows is pushed out over 320 ms ease-out, not cut.
- Labels: at Stopped and Stroll every label shows, inside the zone or not; while walking, a label whose place is inside the zone waits as its light unless it is under the center.
- The pane on the thing being looked at is exempt: gaze is the center of the view, so that thing is always inside the zone, and its pane sits beside it. The exemption lasts through the look-away descent: a pane the wearer has just left stays where it is and shrinks a level at a time where it stands, and only if it is still up 2.5 s after the look left (`minShownS`) does it leave the zone over the same 320 ms, or wait as its light if it has no place within its own width of it. One move, never two. The held pane sits beside the viewfinder: from the first held frame it comes over 320 ms ease-out to sit with its near edge 24 px outside the square, on the side its light is on, and holds there, its corner nearest the square keeping its offset from the light, so it moves on the glass only as the world does and the leader stretches to the light; a wearer can read one card while walking without touching anything. It re-places only for a cause that has lasted 300 ms (leaving the view, a face, the roadway) or at once for the chrome, grows in place around that corner, and goes back beside its light in one move once the look has been gone 1 s (design-system 5).
- The destination is exempt while the wearer stands at its door: they walked there to face it, and the stop is the moment its card or arrival line is for. The stop lasts 4 s, and longer while the wearer keeps looking at the place, up to 30 s, so its expanded view can be read and chosen from; the view stands beside the doorway, never over it (design-system 5). When they walk on, it walks down like a pane the look has left.
- Eval: in every frame of every walk, no world-zone pane above 20% opacity intersects the zone for its current band, except a label at Stopped or Stroll, a pane on its way out, the pane being looked at, a pane within 2.5 s of the look leaving it, a pane in its 320 ms move out (after the zone grew or that time ran out), and the destination's pane at its door and for 2.5 s after.

## Rule 2 · Reading budget

- Trigger: a candidate is about to be shown while the band is not Stopped.
- Response: a label is the place's name and its say line's short form, never the sentence; the card carries the sentence. Label content is capped at three words plus one number while walking (the place name does not count; a unit counts with its number); in Walk and Brisk the reason line is never on the glass, only in the log; a card is refused unless the band allows it; copy that does not fit is shortened by rule (drop the reason line first, then the second fact), never truncated with an ellipsis.
- Eval: no label exceeds the cap in Walk or Brisk or carries a say line; no world-zone card appears in Walk without its hold; in Brisk a place is a label at most. View-zone items (message banners at the top center, which is the view's top edge and outside the focus zone; the menu and the map tile above the menu button at the bottom right; the pocket; the ask glance) are governed by the notification rules and the view zone's edge placement, not rule 10: allowed in any band but Brisk, at the edges, a banner folding after 4 s of walking unless looked at and back once the wearer has stood still half a second.

## Rule 3 · Auto-fold while walking

- Trigger: a proactive label (the brain's best fit, not an answer to a look) has been shown for 2.5 s in Walk and is not the gaze target.
- Response: it folds on its own (dissolve, retract). Labels that answer a settled view follow rule 10 instead. Nothing waits to be dismissed while the wearer moves. In Stroll the limit is 4 s; Stopped has no limit; Brisk has no proactive labels to fold. Like every change the wearer did not ask for, it never comes sooner than 2.5 s after the pane's last change of level.
- Eval: no proactive label persists past its band's limit. Level hysteresis (1.2 s) applies to score-driven changes only, never to rule 10's climbs or the look-away descent.

## Rule 4 · Entry

- Trigger: a new show.
- Response: a new pane is born at its placed position, beside or above its light, with the condense move. It never slides in from the edge of the view. While moving, a pane that is not the thing being looked at is born outside the focus zone, or waits as its light.
- Eval: the first frame of any pane while moving is outside the focus zone unless it is the thing being looked at.

## Rule 5 · Head-scan yielding

- Trigger: within 8 m of a curb, the head turns toward a side faster than 0.8 rad/s (the look-left, look-right before crossing).
- Response: content on that side yields instantly (fade to 15% and slide 24 px outward over 180 ms ease-gate) and holds still where it was when the yield began: no move, no clamp, no fold while it yields. It returns when the scan is over, the head back within 0.3 rad of where it started, the look settled on a different place, or the turn come to rest on a place for a second (a look at it, not a check for traffic: turning to face a shop at its door) (320 ms ease-out, from the held spot to its place). Nothing is re-placed during the scan: panes stay with their stores, and one that the scan carries somewhere it could not normally sit yields and holds as well. The glasses never compete with a safety check.
- Eval: in the scripted head-scan beat, the panes on the scanned side are below 20% opacity within 200 ms of the turn and restored within 400 ms of the return.

## Rule 6 · The pocket

- Trigger: a pinch on a gaze target while the band is Walk or Brisk.
- Response: nothing opens. The item is saved: a one-word confirmation at the pip ("Saved", 600 ms), and the held glyph gains a pocket count. A look still shows the label; pinch never shows a card while moving. A choice the wearer settles in an expanded view (two held, a copy held, a lane booked) is counted in the pocket the same way, its row reading what was settled.
- Eval: no expanded or card results from a pinch in Walk or Brisk; the pocket count increments; the item is present in the pocket.

## Rule 7 · The pocket surfaces at the pause

- Trigger: the wearer has been Stopped for 2 s, the pocket is not empty, and the time available (the signal countdown at a signal, otherwise 20 s) is at least 6 s.
- Response: the brain surfaces the pocket with the time available: "12 s · what you saved", with the saved items as a short list grown in place beside the held glyph. Pinch opens one; the rest wait. If the time available is under 6 s, the pocket waits for the next pause. A stop where the wearer has just settled a choice does not surface it: that stop was already theirs.
- Eval: the pocket surfaces within 500 ms of a qualifying stop with the correct remaining time; it never surfaces during a gate; it does not surface when time available is under 6 s, nor at the stop where a choice was settled.

## Rule 8 · The world has right of way

- Trigger: a person or vehicle (moving, or stopped in traffic like a bus at its stop) between the eye and the pane's anchor overlaps the pane's projected bounds for more than 120 ms. Something behind the thing the pane describes is not in its way.
- Response: the pane dims to 30% on the first frame and slides away from the overlap by the overlap width plus 20 px over 220 ms, up or down when it can, never along the mover's own path and never further than its own width, leaving a faint trace line to its home position. It returns when clear, over 320 ms ease-out. If it cannot clear, it stays dimmed in place, and drops to its pip only when the mover covers more than 60% of it for 300 ms (a face it cannot clear drops it at once). A dropped pane is hidden, not destroyed: the brain holds its level while it is out of sight, and it condenses back in its own place 300 ms after the way is clear. A vehicle within 12 m that covers a pane's light hides the pane at once, whether or not it overlaps the pane: a label over a passing bus would point at nothing the wearer can see, so it waits as its light rather than riding the bus, and condenses back 300 ms after the light is clear; the hold on it pauses meanwhile. A person whose speed has been under 0.2 m/s for 2 s is scenery, not a mover: placement goes round their body once, like a parked van, and never dims or drops a pane for them; their face stays a keep-out, since a pane never covers a face.
- Eval: in the scripted pedestrian beat, the card's rect never intersects the pedestrian's rect while the card is above 30% opacity; someone standing still never dims or drops a pane (unit test); a vehicle covering a pane dims it on the first frame and drops it only after 300 ms above 60% cover; a vehicle within 12 m over a pane's light hides it on the first frame (unit test).

## Rule 9 · Backdrop adaptivity

- Trigger: every 250 ms, for each visible pane.
- Response: the scene reports the luminance behind the pane (in the sim, a ray from the pane center into the scene returns the hit material's albedo and whether it is sunlit; in real glasses this would be the camera). Over a bright backdrop the glass fill alpha rises to .78 and body weight to 500; over a dark one it falls to .52 and weight 400. Text is never below 4.5:1 against the measured backdrop.
- Eval: contrast of primary text against the sampled backdrop is at least 4.5:1 at every scripted beat on both the lit and the shadowed façade.

## Rule 10 · Labels, then one card

- Trigger: the view settles (head turning slower than 0.3 rad/s for 300 ms after it moved faster than 0.6 rad/s for 200 ms, or after a slow, deliberate look carried it more than 0.2 rad), or a look rests on a place.
- Response: when the view settles, every place in view within 70 m shows its label at the same moment: its name and the short form of what the assistant would say, beside its storefront, scaled by distance, up to six, nearest first, born together on one timeline 40 ms apart by distance. The label under the center of the view (the gaze target, after Phase 12's 250 ms grace) grows into its card after 0.5 s of hold. A pane is its place: a look at a place's label or card is a look at the place, and a pane under the center outranks a light behind it. Held is held: a held place keeps the look while its pane, its light or its storefront is inside the viewfinder plus 40 px; while the head is still nothing nearer takes it, and during a turn or within a second of one only a place whose pane or light has been within 60 px of the center for 250 ms does, so the place a turn lands on is the one aimed at, and the glass moving a held pane beside the square never hands the look to whatever is left under the center. With nothing held, the square catches a pane or a light 48 px outside its edge. While the wearer drags the view, and half a second after, the labels and cards already on the glass ride with the world where they stand, so the one aimed at is where the turn meets it. Looking at another label shrinks the current card back to its label and grows the new one in one coordinated move, both over 420 ms: one card at a time, always the one under the center, and at most one new card a second. A card holds at least 2 s; at Stopped or Stroll a further 2 s of hold, or a pinch, expands it in place, the hold counted from the card or from the look, whichever came later (a card already up when the look arrives, the destination's at its door, takes 2 s of look). While an expanded view is open at Stopped or Stroll and the look is on the place or on the view, the view holds its place in the world: the head may turn anywhere within its bounds plus 80 px without it moving, so the center of the view travels across its rows, and the leader keeps reaching back to the light. The row under the center lifts, the action reads for it, and a pinch (the click, the space bar, a tap) chooses it; once the look has been off the view for 1 s it goes back to following its light. Looking away from a card for 1 s shrinks it to its label, not to its light; a look that comes back within that second takes its hold up where it left it, and a hold pauses while something in the world hides the pane. Labels fade back to their lights when their places leave the view as it moves on; while the view stays put they stay, in every band but Brisk. Walking with the head settled (once it has moved since the walk or the lap began), places that come into view within 70 m join the labels once they have been in view 0.5 s, up to six, and a label whose place slips out of view keeps its place for 1 s (and at least 2.5 s from its birth), moving or not, so the edge of the view never blinks; in Walk the ones inside the focus zone wait as their lights (rule 1), so the labels read along the edges of the street. In Brisk only the place under the center keeps its label. A label under the look, or under it within the last second, is never taken away when the view settles, even with its sign out of sight behind a tree. A look at a place lights its label even without a settle, and that place joins the labels. Any place in view within 70 m can be looked at. Beyond 35 m a label needs a full second of hold to grow, and no label grows until the head has moved at least 5° since the walk or the lap began, so a store at the vanishing point never grows a card unasked. A place beyond 30 m gets a compact card (its photograph, name, say line and live line, no reason, no rows) that never expands; as the wearer comes within 30 m it becomes the full card in place, one morph, and its expanded view needs 2 s of hold from then. Sweeping the view across a street lights nothing: a look must hold 250 ms. There is no separate hands-busy mode: a wearer carrying bags, holding a child's hand, or wearing gloves gets the same interface, because a held look reaches everything.
- Eval: a settled view over three places shows three labels at once and one card 0.5 s after the label under the center appeared; moving the look to a second place swaps the card in one tick, the first a label again; with no pinch, a look in Stopped reaches the label at 0.3 s, the card at 0.8 s and the expanded view at 2.8 s (on the 10 Hz tick), and in Walk the card and never the expanded view; no card is ever reached without its hold.

## Rule 11 · The whisper channel

- Trigger: Brisk band, and something worth saying that the wearer is not looking at (relevant to the goal, past the score threshold).
- Response: instead of a world-zone pane, the brain shows one captioned line at the bottom edge in the view zone: "Grace Theater · Dune at 8". After the name, three words and a number at most, 2.5 s, then gone, once per place per Brisk stretch. Labels in Brisk take the same form (name and one number), and the place the wearer is looking at gets its label, never a card. Visual when the wearer can afford it, a line when they cannot.
- Eval: in Brisk, no card; labels and whisper lines obey the cap and the duration.

## Rule 12 · Snooze

- Trigger: the wearer looks up (pitch above 0.55 rad) at nothing in particular for 2 s, with the head held still for the last of those seconds (relative to the walking direction, so a bend in the route is not a drag). Looking up at a sign is attention, not the gesture: with a gaze target the pitch does not count. Dragging the view up to a tall building keeps moving the head, so it does not snooze.
- Response: through the second second the held glyph reads "Snoozing", so looking down cancels it before anything happens. Then everything folds, the glyph shows "60 s" and counts down, and nothing new is shown except safety until it expires or the wearer looks up again the same way to cancel. The quietest control in the system.
- Eval: after the gesture, no shows for 60 s except gate-related safety text; the glyph shows "Snoozing" during the second second and then the countdown; a moving look up does not snooze.

## Rule 13 · The budget is visible

- Trigger: always, in the inspector.
- Response: the attention budget is a meter that drains on each proactive show (a decision with action `show` at whisper level or above that the wearer did not earn by looking or pinching; pips, labels that answer a settled view and ground safety text are not shows, and look-earned shows are free, as are answers to the wearer's own choices: the menu, the map tile and what a choice or an arrival brings up) and refills one unit per 40 s of quiet. The inspector shows it live and in the log.
- Eval: proactive shows per walk never exceed 7 plus the refills earned during the walk (9 on a 90 s walk with enough quiet); the meter in the log matches the count of shows that were not earned by dwell or pinch.

## How these combine

The gates in `docs/brain-spec.md` run first and beat everything. Then the pace band decides what is allowed and rule 10 decides when. Then placement runs with the current focus zone and keep-outs. Then the reading budget trims copy. Auto-fold and the pocket run on timers inside the brain tick. Backdrop adaptivity is an overlay concern and runs on its own clock.
