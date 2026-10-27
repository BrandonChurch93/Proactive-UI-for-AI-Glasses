# Scenarios · the walk and its three recordings

One walk on one block: a loop that never ends on its own. The intent (Looking for food, Running errands, or nothing, Just exploring) is a layer on top that adds a list, a route and an arrival; after an arrival the loop resumes with no intent. Every recording demonstrates several walking rules on purpose; the rule numbers refer to `docs/walking-rules.md`.

`data/scenarios/walk.json` holds it all: the pace track, the signal phase, the corner hold, world beats (absolute, or `after: intent` and timed from the moment that intent starts), and three recordings that script the reviewer (gaze, pinch, choice, look up, head scan, the ask answer, and the new `intent`, `choose`, `reply` and `go`). The brain never reads the file; the sim injects what it says into the `WorldSnapshot`. Positions are n, metres north of the south crossing.

## The loop

1. Start corner, south-east, n = 0. The walk begins Stopped with the south crossing's light held red for 12 s and WAIT counting down on the pavement ahead. At 0:00.8 the intent panel asks what's on the agenda today (nothing filled; a recording opened by its link fills its own intent on the first lap). Just exploring, a lunch place from the picker or Start on the stops list releases the light; otherwise it releases at 0:12 and the walk goes on as it is. The same happens at the end of every lap.
2. East sidewalk north: Walk, Stroll on the theater stretch (n 11 to 25.5, about 0:10 to 0:34), Walk past the scaffold and the M4 shelter, Brisk on the north stretch (n 60 to 84, about 1:00 to 1:13), Walk to the corner.
3. North corner, about 1:15: the avenue light is red with 14 s to go (the walk file's phase). Crossing 10 s.
4. West sidewalk south at Walk, about 1:39 to 2:28. The wearer asks the south crossing 12 m out; it turns within seconds (actuated, at least 18 s of green first).
5. South crossing, 10 s, back to the start corner at about 2:39, and the light is held again: 12 s, every lap.

A destination replaces the loop with the router's shortest path to its door: 4 s stopped at the door facing it, then the loop resumes from there. Errands takes its stops in list order; a closed stop drops out and the route redraws.

## Hungry · discovery, the pocket, a choice

Recording: Hungry at 0:01, Goldie's from the picker at 0:03, then Mega Burger instead at 0:11.

1. 0:00 · Held at the corner: WAIT on the pavement. 0:00.8 the intent panel; Hungry at 0:01, and the lunch picker replaces it: five places by walk time, Goldie's first (10 s).
2. 0:02 · One label, the best fit, while still stopped: Goldie's Counter, "3 min, 9 seats". The reason is in the log and never on a label (Rule 2).
3. 0:03 · Goldie's from the picker: it is the destination (cause `choice`), the route draws, the picker folds and the light releases.
4. 0:08.5 · A look at Mega Burger across the avenue, 69 m ahead: its label, then its compact card a second of hold later (beyond 35 m), offering Go here instead. 0:11, Go here instead: the route redraws to Mega Burger (cause `choice`), up the block and across at the corner rather than back through the start; Goldie's chip goes, Mega Burger's comes.
5. 0:38.5 · A look at Trattoria da Lia across the street: label, card. 0:41 a pinch while walking saves it; nothing opens; Pocket 1. (Rule 6.)
6. 0:51 · A look at the station stair: its label and its card at 0:52.
7. 1:02 to 1:15 · Brisk on the north stretch: labels at most, never a card. (Rules 1, 11.) 1:15, "No need to run"; the red light at 1:17, 12 s.
8. 0:26 · Maya's text at the view edge while walking, at glance size: "Lunch? I'm by the Big Bean at 1." with On my way · Can't today · Where exactly?, reason "Clear sidewalk ahead". In Brisk (1:02) it steps out of view and comes back at 1:15.
9. 1:18 · Stopped at the red light, the full thread. 1:18.5, On my way: "Big Bean · under a minute · route there?" 1:20, the pocket surfaces with the time available. (Rule 7.) 1:20.5, Yes: the route redraws to the Big Bean (cause `reply`, "Meeting Maya at 1"); the thread keeps the message and the reply with "Routing to the Big Bean" under them until 1:23, then leaves once and does not return. The M4 bus waits at its stop until then and passes at 1:24; no label rides it (Rule 8).
10. 1:44 · A look at the Big Bean on the way back: its card, Going here.
11. 1:53 · At the Big Bean door, facing it: its card with the arrival line, "Meeting Maya at 1". The brain decides the arrival at 1:52 as the wearer strolls up; the card has been folded at the view edge since 1:48 and lands on the glass at 1:53, once the wearer is Stopped facing the door and it fits 40 px clear. No pocket at the door.
12. 1:56 · After 4 s at the door the loop resumes with no destination and no intent. The recording ends at 1:58.

## Errands · navigation, sequencing, the curb

Recording: the reviewer stands at the light, chooses Errands at 0:08 and Start at 0:10. Stops: Pharmacy, Hardware, Post Office, in that order.

1. 0:00 to 0:08 · Held at the corner, WAIT counting down, the intent panel from 0:00.8, nothing proactive.
2. 0:08 · Errands. The stops list replaces the panel: "Three stops · one route", reason "In order along the way", and Start. No route yet.
3. 0:10 · Start: the route draws to the pharmacy (cause `choice`) and the light releases. The list folds to the route by 0:15. (Rules 1, 4.)
4. 0:35.5 · A look at the pharmacy ahead: label, card half a second later, expanded on continued hold at Stroll.
5. 0:41 · The scaffold narrows the sidewalk ahead: the route band shifts to the curb and one glance, "Scaffolding ahead. Keep to the curb."
6. 0:51 · The pharmacy door: stopped, facing it, its card at the door. 0:54 the prescription is picked up; the errands card returns, "Two to go". 0:55 the route redraws to Hardware (cause `goal`).
7. 0:58 · Corner Hardware closes early: "Hardware closed early. One stop left." The route redraws to the Post Office.
8. 0:59 to 1:05 · Three social notifications on the glyph, never one by one. 1:08, the bus at the M4 stop: a pip, not on the goal.
9. 1:32 · Red at the cross street, 18 s. The social strip once, "3 notifications · later". The Post Office card up on dwell at 1:37. Head scans at 1:39 and a passerby: no level changes. (Rules 5, 8.)
10. 1:50 to 2:00 · Crossing the cross street. A DM from Jules at 1:52 is held; at the far curb, "One message came in. Read it?"
11. 2:08 · The Post Office door; its card holds. 2:11 done: "All done", reason "Every stop done". 2:12 the loop resumes, back across the cross street, with no intent. The recording ends at 2:16.

## Just walking · restraint, right of way, snooze

Recording: Just exploring at 0:01, and again at the corner a lap later. No destination.

1. 0:00.8 · The intent panel; Just exploring at 0:01 folds it and releases the light. Then to 0:10, nothing.
2. 0:10.5 · Stroll. The look rests on the Grace Theater marquee: its label at 0:11.3, the theater row labels together as the view settles, the card at 0:11.8, the expanded view in place at 0:13.8 (Rule 10). 0:17 to 0:24, the delivery truck crawls past between the wearer and the marquee; not a gate, the level holds while the overlay steps it out of the way (Rule 8).
3. 0:28 · The look moves to Trattoria da Lia: its label grows into the card, "Read from Italian"; the theater shrinks back to its label in the same move. 0:30, Kathy's Cupcakes: label, then card; the look moves on at 0:32.5 before it would expand.
4. 0:48 · On the straight past the scaffold the wearer looks up and holds it: "Snoozing", then the countdown from 0:50.3; Atlas Books, looked at from 0:51, is held "Snoozed". 0:55 looking up again cancels it by 0:57.5. (Rule 12.)
5. 1:13 · "No need to run". 1:15 red light; two food places were looked at, so at 1:17.6, "Hungry? · Find lunch · No". No, at 1:20; the walk stays Just exploring.
6. 1:29 to 1:39 · Crossing: nothing opens. A bike comes up the lane from behind as the wearer steps off: `BIKE` on the pavement with its arrow.
7. 1:40.6 · The far curb: the view settles on the west side and its places label together. The loop continues south and across the south crossing.
8. 2:53 · Back at the start corner: the light held, the intent panel within a second of stopping. Just exploring at 2:56.5; the second lap begins. The recording ends at 3:02. This is the walk a reviewer remembers: the brain doing almost nothing, correctly.

## Timing as built

The wearer decelerates into a stop line or a door at 0.9 m/s² rather than stopping dead, and turns its body at 3.2 rad/s, standing still while the turn is over a radian. Gaze beats start the head turning at the beat time and dwell counts from when the head is on the thing, so each ladder step lands a few tenths of a second after the beat. The evals' windows reflect this.

## Pace script

The pace track is by place, not time: Stroll on the east sidewalk from n 11 to 25.5, Brisk from n 60 to 84, Walk everywhere else (Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s, Stopped 0). Speed eases between bands over about a second; lights, doors and the corner hold stop the wearer. The reviewer never controls pace; the inspector shows the band live.

## The scripted reviewer

The recordings script what the reviewer does. They drive `pnpm record` for the evals, `?still=` frames for screenshots (`&live=1` steps the unscripted walk instead, for frames past a recording's end) and the attract loop behind the title screen. In the live demo the reviewer's own input replaces them; a beat that depends on the reviewer simply does not happen if they never do the thing. A scripted gaze holds until the next gaze event; `"id": null` releases it. The inspector's Overrides tab has "End the walk".

## Notifications (fixed behaviors)

| Kind | Behavior |
| --- | --- |
| Text or DM from a person | A thread at the view edge at the next safe moment: glance size while walking (sender, the line, the replies), the full thread at a stop; held in a crossing and shown at the far curb; out of view in Brisk and back after it; stays until it is answered or dismissed, then folds by rule. A reply can change the walk, but only through what the walk file attaches to that reply (an offer to a place, a stop added) |
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

## End screen

Reached from End the walk on the intent panel, from the inspector, or at the end of a recording (Esc on the intent panel folds it as Just exploring; see STATUS 19.3). The street holds its last frame and dims to 35% over `t-scene` (reviewer chrome; the glasses are hidden), and the start screen's panel slides in from the left. It reads: "The walk"; one sentence built from the session's log ("In 2 minutes the glasses saw 14 places, showed you 7, saved 1 for a red light, got you to the Big Bean, and sent 1 reply", every number counted from this session: roster places that came within 70 m, decisions that brought something to a card or an expanded view, distinct items held during a crossing, pinches saved, doors reached, and replies sent; a zero clause is dropped); a timeline of the whole session, 0:00 to its length, drawn left to right over 900 ms, with a tick for every card in ink and every hold in the voice color at half strength, the crossings shaded and the pace bands as a stepped line beneath; "What it decided", three lines in time order, one per name: first what the wearer's own answers led to (an offer the glasses made from a reply, and the route it drew, both always listed when they happened; then the last lunch pick and arrivals), then the highest-scoring things shown that carried a reason line. Never the intent panel or the picker, and never a notification's delivery reason ("Clear sidewalk ahead" is when it was shown, not a decision); and the buttons See every decision, Walk again (the title), Keep walking (a new walk from the start corner with the intent panel up) and About. See every decision opens the inspector on this walk's Shows, at the first one; closing it returns to the end screen.
