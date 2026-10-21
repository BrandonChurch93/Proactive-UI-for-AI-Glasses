# Scenarios · beat sheets

Three ninety-second walks on the same block, each using it differently. Beats are fixed in time and place; the reviewer's gaze changes which pips become glances and cards. Each walk has a destination and ends. Nothing loops. Every walk demonstrates several walking rules on purpose; the rule numbers refer to `docs/walking-rules.md`.

Scripts live in `data/scenarios/*.json` as timed events the sim injects into the `WorldSnapshot` (pace changes, inbox items, scripted people and vehicles, live-data changes, signal phase). The brain reacts; it never reads the script.

## Opening (shared)

1. 0.0 s · Play. Title plate on black with the name and the subtitle. Pressing Play starts ambient audio.
2. 0.0 to 0.9 s · The street fades up behind the text (`t-scene`). The wearer is already walking.
3. The setting, two lines: "You're walking through a big city. The AI in your glasses decides what to show you, how much, and when to stay quiet."
4. How to use it, four lines: LOOK · Drag to turn your head. The walk is on rails. DWELL · Hold your gaze on anything that lights up and it opens. Keep looking and it opens further. PINCH · Click to skip the wait or choose. Esc to dismiss. I · Open the inspector: every decision the brain made, the reasons, and the evals.
5. "What are you up to?" with three cards: Hungry · Find a place and get there. Errands · Three stops, one route. Just walking · See what it does when you want nothing.
6. Skippable with a click. Choosing folds the text and the walk starts within two seconds. Behind the title screen the street already plays the Just walking script with the scripted reviewer, muted, as an attract loop. "Walk again" at the end skips to the choice.

## Hungry · discovery, the pocket, a choice

Route: east sidewalk north to the corner, cross the avenue, a few steps back south to Mega Burger. Destination: a seat.

1. 0:02 · Pips bloom on Goldie's Counter, Kathy's Cupcakes, Trattoria da Lia and Mega Burger. The brain shows one glance, the best fit: Goldie's, "3 min wait" (in Walk the reading budget allows three words and one number, so the second fact "9 seats" is dropped by rule; Stopped would show both). The reason, "Short wait, on your side of the street", is in the log and not on the glass, because the band is Walk and the reading budget drops the reason line first (Rule 2). The glance enters at the edge (Rule 4) and, not being looked at, folds itself at 0:05 (Rule 3).
2. 0:14 · Dwell on Mega Burger across the street, 50 m ahead, climbs the ladder: glance at 0.8 s, card at 1.6 s more because the band is Walk. One thing at a time. (Rule 10.)
3. 0:22 · The wearer pinches the Mega Burger card while walking. Nothing opens; "Saved" at the pip, the held glyph reads Pocket 1. (Rule 6.)
4. 0:30 · Look away. The card walks back down a level every 1.2 s and is gone. (Rule 10.)
5. 0:36 · Pace to signal: the light ahead is about to change. The wearer speeds up to Brisk on the script. (Rules 1, 2.)
6. 0:40 · Still Brisk. A dwell on the station stair at the corner gives only the whisper line at the bottom edge: "47th St Station · uptown 4 min". The focus zone is at its largest. (Rule 11.)
7. 0:58 · Red light at the corner anyway. "No need to run" at the curb. Stopped. A text from Maya arrives: "Running 10 late, order me the usual?", glance toast, reply or later.
8. 1:02 · The pocket surfaces: "12 s · what you saved", Mega Burger with its live line, grown beside the held glyph. (Rule 7.) At 1:04 a pinch opens its card; the gaze stays on it and 2 s later it expands in place: "Hold a seat · Not now". At 1:08, hold a seat. The route draws on the pavement, across the avenue and a few steps south.
9. 1:14 · Crossing, 10 s. Everything recedes. An app update arrives mid-crossing and is held. Far curb at 1:24: everything returns, then "Held that while you crossed" with "Order ready · 1 more" batched under the route glance.
10. 1:26 · A few steps south on the west sidewalk. The destination column stands at the door.
11. 1:34 · Arrival. The column settles to a pip. "Seat's held, inside on the left." Fade.

## Errands · navigation, sequencing, the curb

Route: east sidewalk north, a stop at the pharmacy, cross the cross street at the corner to the Post Office. Destination: the last stop.

1. 0:02 · The brain lists the three stops in one card at the view edge, in the order it chose, with why ("In order along the way"): Pharmacy, Hardware, Post Office. Route draws on the pavement. The card folds to the route after 4 s because the band is Walk. (Rules 1, 4.)
2. 0:24 · The pharmacy door. The wearer stops; its card unfolds from the sign: "Prescription's ready here · counter 2". At 0:28 the live data ticks "Picked up"; the errands card returns at the edge with the stop ticked, "Two to go", and the route redraws. At 0:29 the walk resumes.
3. 0:34 · Scaffolding over The Big Bean's frontage narrows the sidewalk ahead: the route band shifts to the curb side and one glance says why, "Scaffolding ahead. Keep to the curb." A route shown as a decision.
4. 0:40 · Bus at the M4 stop ahead: "M4 · 2 min · next in 11". Held at pip; not on the goal. A glance only if looked at.
5. 0:46 · Corner Hardware's live data changes: closed early. The brain says so, drops the stop, and the route redraws. The wearer watches the decision happen: "Hardware closed early. One stop left."
6. 0:52 · Social notifications accumulate on the held glyph while walking (1, 2, 3 · social by 0:58). Never one by one.
7. 1:10 · Red light at the corner, 8 s. The social strip surfaces once: "3 notifications · later". The card for the Post Office across the cross street is up on dwell. The wearer checks left and right before the light changes: the card yields to each head scan and returns. A passerby crosses between the wearer and the sign; the card steps aside with a trace, then comes back. (Rules 5, 8.)
8. 1:18 · Crossing the cross street, 10 s. A DM arrives mid-crossing: held. Far curb at 1:28: "One message came in. Read it?"
9. 1:35 · Post Office, 10 m on. "Line of 8 · 12 min" on its card. Package in hand, route folds back to the feet. Fade.

## Just walking · restraint, right of way, snooze

Route: east sidewalk north, the theater across the street near the start, end on the bench in Pocket Park at the far corner after crossing. No destination until the end.

1. 0:00 to 0:08 · Nothing. A pip or two on things the wearer looks at. Nothing else.
2. 0:08 · The wearer slows to Stroll and dwells on the Grace Theater marquee ahead across the street, the composition of `reference/hero-block.html`: glance, card, then the expanded view on continued dwell, grown in place: "Tonight · three shows · box office till 9", "Hold two for 8:00" and "Not now". Nothing happens to the world behind it. (Rule 10.)
3. 0:16 · Still at Stroll, still on the marquee. A delivery truck crawls up the near lane from 10 m behind and passes between the wearer and the marquee from about 0:17 to 0:22. The expanded view cannot clear it, drops to a dimmed pip, and returns when the truck has passed. (Rule 8.)
4. 0:26 · Gaze on the Trattoria da Lia sign ahead across the street, in Italian: translation card ("Home cooking · open until 11 PM", "Read from Italian"). The look moves on at 0:29, before the card would expand. First food glance.
5. 0:30 · Gaze on Kathy's Cupcakes beside the wearer: a glance, "Fresh batch at 2", that is all; the look moves on at 0:32, before the card dwell, and the glance walks down. Second food glance. (Rule 10.)
6. 0:32 · Back to Walk.
7. 0:38 · Two people talking on the sidewalk ahead, on the path: pips on them stay bare. No names, no info. A text that arrives ("Lunch tomorrow?") is held until they are passed at 0:46, then shows at glance at the edge.
8. 0:48 · A call from Maya: answer and decline at the view edge, world untouched. Decline at 0:51 folds it.
9. 0:54 · The wearer looks up at the sky for a second. Everything folds; the glyph counts down from 60; the glance that would have shown on Atlas Books ahead (dwelt on from 0:56) is held with the reason "Snoozed". (Rule 12.)
10. 1:02 · Looking up again cancels the snooze. Mega Burger comes up beside the wearer across the street; nothing shows, because nothing is looked at.
11. 1:19 · Red light at the corner, 6 s. Stopped, and two food glances have happened, so the ask glance appears once at the edge at 1:21: "Hungry? · Find lunch · No". No, at 1:23.
12. 1:25 · Crossing, 10 s: recede and return, same as always. A bike comes up the bike lane from behind on this side as the wearer steps off: `BIKE · 2 s` on the pavement with its arrow, stop tone, gone when the rider passes.
13. 1:35 · The bench in Pocket Park at the far corner. Idle glance, never two at once: "Benches in the shade". End of the walk. Fade. This is the walk a reviewer remembers: the brain doing almost nothing, correctly.

## Pace script

Every walk carries a pace track in its scenario file: a band per segment, with the sim's speed per band (Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s, Stopped 0). Default Walk. Hungry: Brisk 0:36 to 0:58, Stopped 0:58 to 1:14. Errands: Stopped 0:24 to 0:29 at the pharmacy, Stopped 1:10 to 1:18 at the corner. Just walking: Stroll 0:08 to 0:32, Stopped 1:19 to 1:25. Speed eases between bands over about a second, and the sim clamps the wearer at a stop line, so the arithmetic of speed × time lands the wearer at the corner (n = 90) within a metre on every walk. The reviewer never controls pace; the inspector shows the band live.

## The scripted reviewer

The scenario files also script what the reviewer does: gaze targets, pinches, choices, looking up, head scans, the ask answer. These drive three things: `pnpm record` for the evals, `?still=` frames for screenshots, and the attract loop behind the title screen (the Just walking script, muted, looping until a scenario is chosen). In the live demo the reviewer's own input replaces them: a gaze event in the script is where the beat sheet expects the reviewer to look, and the reviewer-chrome captions (`docs/copy.md`) nudge toward it. A beat that depends on the reviewer's input simply does not happen if they never do the thing; the brain reacts to what is actually looked at, which is the point. A scripted gaze holds until the next gaze event; `"id": null` releases it.

## Notifications (fixed behaviors)

| Kind | Behavior |
| --- | --- |
| Text or DM from a person | Glance toast, sender and one line, at the next safe moment, reply or later |
| Social (likes, follows, comments) | Never shown one by one. Count on the held glyph; one strip when stopped: "3 notifications · later" |
| Call | Toast at the edge with answer and decline. Interrupts a walk, never a crossing. World untouched |
| App update (package, order) | Batched under whatever is open |

## Proactive moments

| Moment | Line | Where | Scenarios |
| --- | --- | --- | --- |
| Pace to signal | "No need to run" | Glance at the curb | Hungry |
| Bus at the stop | "M4 · 2 min · next in 11" | Pip on the stop; a glance only when looked at | Errands |
| Which stairs | "47th St Station · uptown 4 min" | Whisper on the station stair (Brisk) | Hungry |
| Closed early | "Hardware closed early. One stop left." | The errands card, reordered | Errands |
| Sidewalk narrows | "Scaffolding ahead. Keep to the curb." | Route band shifts plus one glance | Errands |
| Bike behind you | "BIKE · 2 s" with an arrow | Pavement, stop tone | Just walking |
| The pocket | "12 s · what you saved" | Beside the held glyph, at a stop | Hungry |

## End card (shared)

Fade to black over `t-scene`, then a quiet card: the scenario name, one line of what the brain decided most often (from the log: "Held 11 things, showed 6"), and "Walk again" with the other two scenarios.
