# Scenarios · one walk and its two recordings

One walk on one block, explored: a loop that never ends on its own. The wearer can open the menu at any time to find a place and go there; the brain stays proactive about everything else. A destination adds a route, the map tile and an arrival; after an arrival the loop resumes. Every recording demonstrates several walking rules on purpose; the rule numbers refer to `docs/walking-rules.md`. Two recordings remain, their ids unchanged so the evals and the inspector keep their names: `walking`, shown as Explore, and `hungry`, shown as Lunch.

`data/scenarios/walk.json` holds it all: the pace track, the signal phase, the corner hold, world beats (absolute, or `after: intent` and timed from the moment the walk starts), and the two recordings that script the reviewer (gaze, pinch, choice, look up, head scan, the ask answer, `intent`, `choose`, `reply` and `go`). A recording's `intent` beat starts its walk; live, the sim starts it on the first step. The brain never reads the file; the sim injects what it says into the `WorldSnapshot`. Positions are n, metres north of the south crossing.

## The loop

1. Start corner, south-east, n = 0. The walk begins Stopped with the south crossing's light held red for 12 s and WAIT counting down on the pavement ahead. Nothing asks: a place chosen from the menu releases the light, a recording's start does, or it releases at 0:12 and the walk goes on. The same happens at the end of every lap.
2. East sidewalk north: Walk, Stroll on the theater stretch (n 11 to 25.5, about 0:10 to 0:34), Walk past the scaffold and the M4 shelter, Brisk on the north stretch (n 60 to 84, about 1:00 to 1:13), Walk to the corner.
3. North corner, about 1:15: the avenue light is red with 14 s to go (the walk file's phase). The map tile shows the turn from 20 m out. Crossing 10 s.
4. West sidewalk south at Walk, about 1:39 to 2:28. The wearer asks the south crossing 12 m out; it turns within seconds (actuated, at least 18 s of green first).
5. South crossing, 10 s, back to the start corner at about 2:39, and the light is held again: 12 s, every lap.

A destination replaces the loop with the router's shortest path to its door: the route band from the feet, the destination column at the door, the map tile at the bottom right, 4 s stopped at the door facing it, longer while the wearer keeps looking at it (up to 30 s, so its expanded view can be read and chosen from), then the loop resumes from there.

## Lunch · the menu, discovery, the pocket, a choice

Recording: the walk starts at 0:01, the menu opens on Food at 0:01.2, Goldie's from it at 0:03, then Mega Burger instead at 0:11, and it ends on the Big Bean's expanded view and a choice at 1:57.5.

1. 0:00 · Held at the corner: WAIT on the pavement; nothing asks. 0:01.2 the menu opens on Food: five places by walk time, Goldie's first.
2. 0:02 · One label, the best fit, while still stopped: Goldie's Counter, "3 min, 9 seats". The reason is in the log and never on a label (Rule 2).
3. 0:03 · Goldie's from the menu: it is the destination (cause `choice`), the menu folds, the route draws and says "Goldie's Counter · 15 m", the column rises at the door, the map tile slides in, and the light releases.
4. 0:08.5 · A look at Mega Burger across the avenue, 69 m ahead: its label, then its compact card a second of hold later (beyond 35 m), offering Go here instead. 0:11, Go here instead: the route redraws to Mega Burger (cause `choice`), up the block and across at the corner rather than back through the start; Goldie's chip goes, Mega Burger's comes.
5. 0:26 · Maya's banner slides down at the top center while walking: Messages, now, Maya, "Lunch? I'm by the Big Bean at 1.", its chips while the band is Stroll; reason "Clear sidewalk ahead". Nobody looks at it, so after 4 s of Walk it slides back up (0:40); it returns once the wearer has stood still half a second, never as a crossing begins.
6. 0:38.5 · A look at Trattoria da Lia across the street: label, card. 0:41 a pinch while walking saves it; nothing opens; Pocket 1. (Rule 6.)
7. 0:51 · The station stair, labelled with the view, holds its label for the look.
8. 1:02 to 1:15 · Brisk on the north stretch: labels at most, never a card. (Rules 1, 11.) 1:15, "No need to run"; the red light at 1:17, 12 s.
9. 1:18 · Stopped half a second at the red light, Maya's banner is back, the full thread with its chips. 1:18.5, On my way: "Big Bean · 40 m · route there?" 1:20, the pocket surfaces with the time available. (Rule 7.) 1:20.5, Yes: the route redraws to the Big Bean (cause `reply`, "Meeting Maya at 1"); the banner keeps the message and the reply with "Routing to the Big Bean" under them until 1:23, then leaves once and does not return. The M4 bus waits at its stop until then and passes at 1:24; no label rides it (Rule 8).
10. 1:44 · A look at the Big Bean on the way back: its card, Going here.
11. 1:53 · At the Big Bean door, facing it, the look held on it from 1:53.2: its card reads the friend first, "Maya's meeting you here at 1", then "Line of 4 · 5 min", and no reason line under it; the name keeps its line and the Going here badge sits under the live line. The brain decides the arrival at 1:52 as the wearer strolls up. No pocket at the door.
12. 1:55.5 · Two seconds of look from the card (rule 10): the expanded view stands beside the doorway, Order ahead · skip the line, the Cortado, the cold brew, the oat latte and the 12:46 pickup, the Cortado lifted and the action reading Order ahead; the rows lift in turn as the recording's head drifts across them; the wearer stays at the door while the look holds (rule 1).
13. 1:57.5 · The choice, the Cortado row: the other rows and the actions give way and "Cortado ordered · ready at 12:46, skip the line." resolves in the voice color with the one row left; the pocket counts it. 1:59.5 the look is released, the door stop ends, and the loop resumes with no destination. The recording ends at 2:02.

## Explore · restraint, right of way, snooze

Recording: the walk starts at 0:01 and again at the corner a lap later. No destination.

1. 0:01 · The walk starts and the light releases; nothing asks. Then to 0:10, nothing.
2. 0:10.5 · Stroll. The look rests on the Grace Theater marquee: its label at 0:11.3, the theater row labels together as the view settles, the card at 0:11.8, the expanded view in place at 0:13.8 (Rule 10). 0:17 to 0:24, the delivery truck crawls past between the wearer and the marquee; not a gate, the level holds while the overlay steps it out of the way (Rule 8).
3. 0:26 · Maya's banner at the top center; it folds after 4 s of Walk unlooked and is back half a second into the red light at 1:16.
4. 0:28 · The look moves to Trattoria da Lia: its label grows into the card, "Read from Italian"; the theater shrinks back to its label in the same move. 0:30, Kathy's Cupcakes: label, then card; the look moves on at 0:32.5 before it would expand.
5. 0:48 · On the straight past the scaffold the wearer looks up and holds it: "Snoozing", then the countdown from 0:50.3; Atlas Books, looked at from 0:51, is held "Snoozed". 0:55 looking up again cancels it by 0:57.5. (Rule 12.)
6. 1:13 · "No need to run". 1:15 red light; the map tile shows the turn ahead (1:25). Two food places were looked at, so at 1:17.6, "Hungry? · Find lunch · No" (Find lunch would open the menu on Food). No, at 1:20; the walk stays Explore. 1:19, Can't today to Maya; she answers "Next time".
7. 1:29 to 1:39 · Crossing: the glass says "Overlay paused while you cross the street"; nothing opens; the clock stays. A DM from Jules arrives at 1:29.5 and is held ("· 1 held"); a bike comes up the lane from behind as the wearer steps off: `BIKE` on the pavement with its arrow.
8. 1:39.7 · The far curb: "One message came in. Read it?", reason "Held that while you crossed". The view settles on the west side and its places label together. The loop continues south and across the south crossing.
9. 2:53 · Back at the start corner: the light held, nothing asks; the walk starts again at 2:56.5 and the second lap begins. The recording ends at 3:02. This is the walk a reviewer remembers: the brain doing almost nothing, correctly.

## Timing as built

The wearer decelerates into a stop line or a door at 0.9 m/s² rather than stopping dead, and turns its body at 3.2 rad/s, standing still while the turn is over a radian. Gaze beats start the head turning at the beat time and dwell counts from when the head is on the thing, so each ladder step lands a few tenths of a second after the beat. The evals' windows reflect this.

## Pace script

The pace track is by place, not time: Stroll on the east sidewalk from n 11 to 25.5, Brisk from n 60 to 84, Walk everywhere else (Stroll 0.6 m/s, Walk 1.38 m/s, Brisk 1.9 m/s, Stopped 0). Speed eases between bands over about a second; lights, doors and the corner hold stop the wearer. The reviewer never controls pace; the inspector shows the band live.

## The scripted reviewer

The recordings script what the reviewer does. They drive `pnpm record` for the evals, `?still=` frames for screenshots (`&live=1` steps the unscripted walk instead, for frames past a recording's end) and the attract loop behind the title screen. In the live demo the reviewer's own input replaces them; a beat that depends on the reviewer simply does not happen if they never do the thing. A scripted gaze holds until the next gaze event; `"id": null` releases it. The inspector's Overrides tab has "End the walk".

## Notifications (fixed behaviors)

| Kind | Behavior |
| --- | --- |
| Text or DM from a person | A banner at the top center at the next safe moment, sliding down: the Messages tile, the time ago, the sender and the line, the replies when a reply fits; the full thread at a stop; folds after 4 s of walking unlooked and is back at the next pause; held in a crossing and shown at the far curb; hidden in Brisk; stays until it is answered or dismissed, then folds by rule. A reply can change the walk, but only through what the walk file attaches to that reply (an offer to a place) |
| Social (likes, follows, comments) | Never shown one by one. Count on the held glyph; one strip when stopped: "3 notifications · later" |
| App update (package, order) | Batched under whatever is open |

## Proactive moments

| Moment | Line | Where | Scenarios |
| --- | --- | --- | --- |
| Pace to signal | "No need to run" | Glance at the curb | Every recording |
| Bus at the stop | "M4 in 2 min · not on today's route" | Pip on the stop; a label only when looked at or when the view settles on it | Explore, Lunch, a focused case |
| Which stairs | "Uptown in 4 · stairs at the corner" | Label on the station stair when looked at, three words and a number even in Brisk | Lunch |
| Sidewalk narrows | "Scaffolding ahead. Keep to the curb." | Route band shifts plus one glance | A focused case |
| Bike behind you | "BIKE · 2 s" with an arrow | Pavement, stop tone | Explore |
| The pocket | "12 s · what you saved" | Beside the held glyph, at a stop | Lunch |

## End screen

Reached from the inspector (Overrides: End the walk) or at the end of a recording. The street holds its last frame and dims to 35% over `t-scene` (reviewer chrome; the glasses are hidden), and the start screen's panel slides in from the left. It reads: "The walk"; one sentence built from the session's log ("In 2 minutes the glasses saw 14 places, showed you 7, saved 1 for a red light, got you to the Big Bean, and sent 1 reply", every number counted from this session: roster places that came within 70 m, distinct places that reached a card or an expanded view (so it never exceeds the places seen), distinct items held during a crossing, pinches saved, doors reached, and replies sent; a zero clause is dropped); a timeline of the whole session, 0:00 to its length, drawn left to right over 900 ms, with a tick for every card in ink and every hold in the voice color at half strength, the crossings shaded and the pace bands as a stepped line beneath; "What it decided", three lines in time order: first what the wearer's own answers led to (an offer the glasses made from a reply, the route it drew and a choice settled in an expanded view, as {place} · {confirmation}, all always listed when they happened, so a place can carry both its reroute and its order; then the last lunch pick and arrivals, one per place not yet listed), then the highest-scoring things shown that carried a reason line, one per place not yet listed. Never the menu, the map, the ask, a follow-up, the pocket or a whisper (the glasses asking or reminding is not deciding), and never a notification's delivery reason ("Clear sidewalk ahead" is when it was shown, not a decision); and the buttons See every decision, Walk again (the title), Keep walking (a new walk from the start corner with the intent panel up) and About. See every decision opens the inspector on this walk's Shows, at the first one; closing it returns to the end screen.
