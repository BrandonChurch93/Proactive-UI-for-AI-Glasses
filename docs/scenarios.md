# Scenarios · the walk and its three recordings

One walk on one block: a loop that never ends on its own. The intent (Hungry, Errands, or nothing, Just walk) is a layer on top that adds a list, a route and an arrival; after an arrival the loop resumes with no intent. Every recording demonstrates several walking rules on purpose; the rule numbers refer to `docs/walking-rules.md`.

`data/scenarios/walk.json` holds it all: the pace track, the signal phase, the corner hold, world beats (absolute, or `after: intent` and timed from the moment that intent starts), and three recordings that script the reviewer (gaze, pinch, choice, look up, head scan, the ask answer, and the new `intent`, `choose`, `reply` and `go`). The brain never reads the file; the sim injects what it says into the `WorldSnapshot`. Positions are n, metres north of the south crossing.

## The loop

1. Start corner, south-east, n = 0. The walk begins Stopped with the south crossing's light held red for 12 s and WAIT counting down on the pavement ahead. An intent chosen in that time (the recording's `intent` beat, or the title's choice at 0:01 until the intent panel of Phase 19.3) releases it; otherwise it releases at 0:12 and the walk is Just walk.
2. East sidewalk north: Walk, Stroll on the theater stretch (n 11 to 25.5, about 0:10 to 0:34), Walk past the scaffold and the M4 shelter, Brisk on the north stretch (n 60 to 84, about 1:00 to 1:13), Walk to the corner.
3. North corner, about 1:15: the avenue light is red with 14 s to go (the walk file's phase). Crossing 10 s.
4. West sidewalk south at Walk, about 1:39 to 2:28. The wearer asks the south crossing 12 m out; it turns within seconds (actuated, at least 18 s of green first).
5. South crossing, 10 s, back to the start corner at about 2:39, and the light is held again: 12 s, every lap.

A destination replaces the loop with the router's shortest path to its door: 4 s stopped at the door facing it, then the loop resumes from there. Errands takes its stops in list order; a closed stop drops out and the route redraws.

## Hungry · discovery, the pocket, a choice

Recording: Hungry at 0:01. Destination chosen at the red light: Mega Burger, across the avenue a few steps south.

1. 0:00 · Held at the corner: WAIT on the pavement. Hungry at 0:01; the light releases and the walk starts with no destination.
2. 0:02 · One label, the best fit: Goldie's Counter, "3 min". The reason, "Short wait, on your side of the street", is in the log and never on a label (Rule 2). Born outside the focus zone (Rule 4); not looked at, it folds at 0:04.7 (Rule 3).
3. 0:35 · A look at Mega Burger across the avenue, about 48 m ahead: its label at 0:35.5, its compact card a second of hold later (beyond 35 m), no reason, no rows; it never expands while beyond 30 m. (Rule 10.)
4. 0:41 · A pinch while walking saves it. Nothing opens; Pocket 1 on the glyph. (Rule 6.)
5. 0:47 · Look away: the card shrinks back to its label at 0:48.
6. 0:51 · A look at the station stair: its label and, as the view settles, the corner's other places beside it; its card at 0:52.
7. 1:00 to 1:13 · Brisk on the north stretch: labels at most, never a card. (Rules 1, 11.)
8. 1:13 · "No need to run" at the curb. 1:15, red light, 14 s. 1:16.5, a text from Maya, "Running 10 late, order me the usual?", reason "Long red light".
9. 1:17.6 · The pocket surfaces: "11 s · what you saved". (Rule 7.) 1:19, a pinch opens Mega Burger's card; 1:21 it expands in place; 1:23, hold a seat: Mega Burger becomes the destination (cause `choice`) and the route draws across the avenue and a few steps south.
10. 1:29 to 1:39 · Crossing. Nothing opens; "Order ready" arrives at 1:33 and is held; at the far curb it shows, "Held that while you crossed".
11. 1:40 · The destination column on the way to the door. 1:48, at the door, facing it: "Seat's held, inside on the left."
12. 1:52 · After 4 s the loop resumes south with no destination and no intent. The recording ends at 1:58.

## Errands · navigation, sequencing, the curb

Recording: the reviewer stands at the light and chooses Errands at 0:11.5. Stops: Pharmacy, Hardware, Post Office, in that order.

1. 0:00 to 0:11.5 · Held at the corner, WAIT counting down, nothing proactive.
2. 0:11.5 · Errands. The three stops in one card at the edge, "Three stops · one route", reason "In order along the way". The route draws to the pharmacy (cause `choice`). The card folds to the route by 0:16.5. (Rules 1, 4.)
3. 0:37 · A look at the pharmacy ahead: label, card half a second later, expanded on continued hold at Stroll.
4. 0:44.5 · The scaffold narrows the sidewalk ahead: the route band shifts to the curb and one glance, "Scaffolding ahead. Keep to the curb."
5. 0:52.4 · The pharmacy door: stopped, facing it, its card at the door. 0:55.4 the prescription is picked up; the errands card returns, "Two to go". 0:56.4 the route redraws to Hardware (cause `goal`).
6. 1:01.5 · Corner Hardware closes early: "Hardware closed early. One stop left." The route redraws to the Post Office.
7. 1:02.5 to 1:08.5 · Three social notifications on the glyph, never one by one. 1:11.5, the bus at the M4 stop: a pip, not on the goal.
8. 1:34 · Red at the cross street, 15 s. The social strip once, "3 notifications · later". The Post Office card up on dwell at 1:38. Head scans at 1:40 and a passerby: no level changes. (Rules 5, 8.)
9. 1:50 to 2:00 · Crossing the cross street. A DM from Jules at 1:52.5 is held; at the far curb, "One message came in. Read it?"
10. 2:07 · The Post Office door; its card holds. 2:10.8 done: "All done", reason "Every stop done". 2:11.8 the loop resumes, back across the cross street, with no intent. The recording ends at 2:16.

## Just walking · restraint, right of way, snooze

Recording: Just walk at 0:01. No destination.

1. 0:00 to 0:10 · Nothing.
2. 0:10.5 · Stroll. The look rests on the Grace Theater marquee: its label at 0:11.3, the theater row labels together as the view settles, the card at 0:11.8, the expanded view in place at 0:13.8 (Rule 10). 0:17 to 0:24, the delivery truck crawls past between the wearer and the marquee; not a gate, the level holds while the overlay steps it out of the way (Rule 8).
3. 0:28 · The look moves to Trattoria da Lia: its label grows into the card, "Read from Italian"; the theater shrinks back to its label in the same move. 0:30, Kathy's Cupcakes: label, then card; the look moves on at 0:32.5 before it would expand.
4. 0:48 · On the straight past the scaffold the wearer looks up and holds it: "Snoozing", then the countdown from 0:50.3; Atlas Books, looked at from 0:51, is held "Snoozed". 0:55 looking up again cancels it by 0:57.5. (Rule 12.)
5. 1:13 · "No need to run". 1:15 red light; two food places were looked at, so at 1:17.6, "Hungry? · Find lunch · No". No, at 1:20; the walk stays Just walk.
6. 1:29 to 1:39 · Crossing: nothing opens. A bike comes up the lane from behind as the wearer steps off: `BIKE` on the pavement with its arrow.
7. 1:40.6 · The far curb: the view settles on the west side and its places label together. The loop continues south. The recording ends at 1:52. This is the walk a reviewer remembers: the brain doing almost nothing, correctly.

## Timing as built

The wearer decelerates into a stop line or a door at 0.9 m/s² rather than stopping dead, and turns its body at 3.2 rad/s, standing still while the turn is over a radian. Gaze beats start the head turning at the beat time and dwell counts from when the head is on the thing, so each ladder step lands a few tenths of a second after the beat. The evals' windows reflect this.

## Pace script

The pace track is by place, not time: Stroll on the east sidewalk from n 11 to 25.5, Brisk from n 60 to 84, Walk everywhere else (Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s, Stopped 0). Speed eases between bands over about a second; lights, doors and the corner hold stop the wearer. The reviewer never controls pace; the inspector shows the band live.

## The scripted reviewer

The recordings script what the reviewer does. They drive `pnpm record` for the evals, `?still=` frames for screenshots (`&live=1` steps the unscripted walk instead, for frames past a recording's end) and the attract loop behind the title screen. In the live demo the reviewer's own input replaces them; a beat that depends on the reviewer simply does not happen if they never do the thing. A scripted gaze holds until the next gaze event; `"id": null` releases it. The inspector's Overrides tab has "End the walk".

## Notifications (fixed behaviors)

| Kind | Behavior |
| --- | --- |
| Text or DM from a person | Glance toast, sender and one line, at the next safe moment, reply or later |
| Social (likes, follows, comments) | Never shown one by one. Count on the held glyph; one strip when stopped: "3 notifications · later" |
| App update (package, order) | Batched under whatever is open |

## Proactive moments

| Moment | Line | Where | Scenarios |
| --- | --- | --- | --- |
| Pace to signal | "No need to run" | Glance at the curb | Every recording |
| Bus at the stop | "M4 in 2 min · not on today's route" | Pip on the stop; a label only when looked at or when the view settles on it | Errands |
| Which stairs | "Uptown in 4 · stairs at the corner" | Label on the station stair when looked at, three words and a number even in Brisk | Hungry |
| Closed early | "Hardware closed early. One stop left." | The errands card, reordered | Errands |
| Sidewalk narrows | "Scaffolding ahead. Keep to the curb." | Route band shifts plus one glance | Errands |
| Bike behind you | "BIKE · 2 s" with an arrow | Pavement, stop tone | Just walking |
| The pocket | "12 s · what you saved" | Beside the held glyph, at a stop | Hungry |

## End screen (shared)

Reached from "End the walk" in the inspector or at the end of a recording. The street holds its last frame and dims to 35% over `t-scene` (reviewer chrome; the glasses are hidden), and the start screen's panel slides in from the left. It reads: the scenario name; one sentence built from the log ("In ninety seconds the glasses saw 14 places, showed you 3, held 1 while you crossed, and saved 1 for the red light", every number counted from this walk: roster places that came within 70 m, decisions that brought something to a card or an expanded view, distinct items held during a crossing, and pinches saved; a zero clause is dropped); a timeline of the walk, drawn left to right over 900 ms, with a tick for every card in ink and every hold in the voice color at half strength, the crossings shaded and the pace bands as a stepped line beneath; "What it decided", the three highest-scoring things shown that carried a reason line, one per name, in time order; and the buttons See every decision, Walk again, the other two walks and About. See every decision opens the inspector on this walk's Shows, at the first one; closing it returns to the end screen.
