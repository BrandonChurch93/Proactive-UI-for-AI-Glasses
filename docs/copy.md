# Copy · everything the wearer and the reviewer read

Rules: plain, warm, short. Sentence case. The brain never apologizes, never explains in the roadway, and in a reason line or a say line never mentions the wearer's eyes, body or habits. No em dashes anywhere; use the interpunct ( · ), a period, or a new sentence.

## Title screen

A panel on the left, reviewer chrome, over the live street; top to bottom:

- Subtitle (mono caps): A UX study in when an assistant should speak, and when it should stay quiet
- Name: **Proactive UI for AI Glasses**
- Setting: You're walking through a big city. The AI in your glasses decides what to show you, how much, and when to stay quiet.
- What this is (mono caps), three lines with mono keys: BRAIN · A deterministic rules engine, not a model. Same walk, same decisions, every time. / RULES · Thirteen walking rules for a person who is moving: content scales with speed, yields to a head check, saves itself for the red light, never covers a face or a car. / PROOF · Every decision is logged with its reasons and scored by an eval suite. Press I during a walk.
- The walk (mono caps): Start the walk (primary, its label centered). Under it, in the setting's type: Explore the block. Open the menu at the bottom right to find a place and go there.
- Controls: LOOK drag · DWELL hold · PINCH click · ESC dismiss · I inspector
- Controls, on touch screens: LOOK drag · DWELL hold · PINCH tap · LONG-PRESS dismiss · I inspector
- Footer: Built by Brandon Church · Three.js, TypeScript, GSAP · About this project (no Source link: the README names no repository address)
- About panel: A browser simulation of a near-future pair of AI glasses on a city walk. / A real-time street is wired into a decision engine that reads your pace, surroundings, attention, goal and attention budget, then decides what to show, how much, when, and when to hold back. / The interface follows walking rules for a person who is moving: it shrinks as you speed up, yields when you check for traffic, saves what you pinched for the next red light, and never covers a face or a moving car. / The brain is a set of rules, not a model. Same walk, same decisions, every time. Press I during a walk to see every decision and its reasons, scrub the walk, and run the evals. / Built by Brandon Church with Three.js, TypeScript and GSAP. / Close

## Screens that cannot show it

- Rotate prompt (a phone held upright): Turn your phone sideways / The glasses see the street wide, and so does this demo.
- No WebGL: This demo needs a browser with WebGL 2. / Open it on a recent desktop browser, an iPad or a phone held sideways.
- Lost graphics context: The graphics card let go of the street. / Reload

## Touch controls (reviewer chrome)

- Pause · Resume

## Reason lines (max 48 characters)

Allowed kinds: goal, world, gate, budget, social, edge, pace, pocket.

- Short wait, on your side of the street
- On your route
- Your pick for lunch (the route to a lunch place chosen from the menu or with Go here instead)
- Open till 6
- Across the street, on your way
- Held that while you crossed
- Held for you
- In order along the way
- Hardware closed early. One stop left.
- No need to run
- Read from Italian
- When you're free (social hold follow-up)
- Saved for the next stop (pace)
- Snoozed (gate)
- Scaffolding ahead. Keep to the curb.

Added in the build (world and goal reasons for places and moments, each under 48 characters): Seats left for tonight · Open late · Lanes open now · Reading tonight at 7 · Counter seats open · Baked on site · Short line · Open till 9 · Stairs at the corner · Last stop · Counter open till 5 · End of the walk · Benches in the shade · Bus at the stop · Closed early today · Long red light · Clear sidewalk ahead · Lunch spots on this block · Seat held · Someone on the path

Log-only reasons (the inspector shows them; the wearer never does): Held: crossing · Held: in the roadway · Held: vehicle near the path · Held: attention budget spent · Counted on the glyph · Batched with what is open · Walk signal · Wait for the walk signal · Bike in the lane

Banned words in any reason: look, looked, looking, gaze, eyes, stared, glanced, habit, noticed you, walking fast, slow down, you were.

## Safety text (pavement)

- WALK 9 / WAIT 14 (countdown)
- BIKE · 2 s (with a direction arrow)

## Held and follow-up

- The crossing line, top center, the only words on the glass during a gate (caps on screen): Overlay paused while you cross the street (a crossing) · Overlay paused · traffic close by (the roadway and vehicle gates), with · 1 held or · 2 held after it while the glyph counts
- Held (glyph) · Held 2 · 3 · social · Pocket 1 · Snoozing (the second second of the gesture, before it takes) · 60 s (snooze countdown)
- Held that while you crossed. Still want it?
- One message came in. Read it?
- Two messages came in. Read them?
- 3 notifications · later

## The pocket, the whisper, the edge

- Saved (at the pip, 600 ms)
- 12 s · what you saved (header; the number follows the signal)
- Pocket rows: Mega Burger · 6 min wait · $
- Whisper line: the name and the say line's short form, three words and a number at most: Goldie's Counter · 3 min / Mega Burger · 6 min wait
- Ask glance (Explore only, at a stop after two food places were looked at): Hungry? · Find lunch · No. Find lunch opens the menu on Food.

## Messages

A text is a notification banner at the top center: the Messages app tile, Messages, and how long ago it came, `now` then `1 min` and so on from the walk's clock (Tuesday, from 12:40); then a warm monogram and the sender; the message; and up to three quick replies when a reply fits (at Stopped and Stroll, or while the wearer looks at it). A reply joins the thread on the right and stays there at every size, moving or not: a thread never drops a reply the wearer sent. The other side's answer follows on the left. The brain's own line, when it has one, sits under the thread in the voice color with Yes · Not now.

- Lunch and Explore, 25 s after the walk starts: Maya · Lunch? I'm by the Big Bean at 1. · On my way · Can't today · Where exactly?
  - On my way: Big Bean · {walk time} · route there? · Yes · Not now. Yes routes to the Big Bean (reason in the log and on the route: Meeting Maya at 1; at the door the arrival line carries it). After Yes the thread keeps the message and the reply with one line under them, Routing to the Big Bean, for 2.5 s (`minShownS`), then leaves once and does not return.
  - Where exactly?: Maya, 20 s later: Corner table by the window. Then the same offer.
  - Can't today: Maya: Next time. Nothing else.
- DM (Explore, held in the first crossing at 1:29): Jules · Still on for tonight? · Reply · Later; at the far curb: One message came in. Read it?
- App: Package delivered · Front desk · 1 more

## What each place says

The clock: every walk starts on a Tuesday at 12:40, shown top left on the glass as `Tue 12:40` and ticking with the walk, and a line that names a time is written from it. Maya's "at 1" is twenty minutes after the start, and the thread's timestamp is read from the same clock.

Each place has a say line per scenario, the one sentence the assistant would say about it, and its short form. The brain uses the scenario's line, else the default. The say line is the first line of the card and the expanded view; a label shows the short form in every band, which the reading budget still caps at three words and a number (a second fact after a comma is dropped by rule). Live data can replace the table.

Rules for a say line: under 60 characters; at most two numbers (a unit counts with its number); never repeats the place's name; never a banned word; written from the 12:40 clock. The eval checks every say line the brain shows against these.

| Place | Lunch | Default (Explore) | Short form |
| --- | --- | --- | --- |
| Goldie's Counter | Fastest lunch on this side · 3 min, 9 seats | Pastrami counter · 3 min wait | 3 min, 9 seats (Lunch) · 3 min wait |
| Mega Burger | 4 seats open, 6 min · across the street, on your way | Burgers till 1 am · 6 min wait | 6 min wait |
| Trattoria da Lia | Sit-down, about 20 min · the sign says home cooking | The sign says home cooking · open till 11 | Home cooking |
| Kathy's Cupcakes | Not lunch, but a brown butter batch at 2 | Brown butter batch at 2 · 80 min from now | Batch at 2 |
| The Big Bean | Coffee after · line of 4, 5 min | Line of 4 · 5 min | Line of 4 |
| Main Street Pharmacy | | Open till 9 | Open till 9 |
| Corner Hardware | | Keys cut till 5 | Keys cut till 5 |
| Post Office | | Counter till 5 · line of 8 | Line of 8 |
| Grace Theater | | Night Market at 8 has 40 seats · earlier shows filling | Night Market at 8 |
| Lucky Lanes | | 5 lanes open till 5 · walk right in | 5 lanes open |
| Atlas Books | | Poetry reading at 7 · upstairs, free | Reading at 7 |
| M4 stop | | M4 in 2 min · then 11 | M4 in 2 |
| 47th St Station | Uptown in 4 · stairs at the corner | Uptown in 4 · stairs at the corner | Uptown in 4 |
| Pocket Park | | Benches in the shade · end of the walk | Shaded benches |

Live lines on cards (the two facts behind the sentence) stay as in `data/places.json` and fit one line of the card, 28 characters at most: "3 min wait · 9 seats open", "5:30 nearly full · 40 at 8", "Ready since noon · till 9", "5 lanes open · $12 an hour", "Uptown trains · 4 min", "M4 · 2 min · next in 11".

## What a pane shows

- Label: the name and the say line's short form (in Brisk, the name and one number). Nothing else.
- Card: the name, the say line, one live line, and the reason line in Stopped and Stroll (a compact card, beyond 30 m, has no reason line) unless the say line already says it (Mega Burger's "across the street, on your way"). No year, no category line, no hint on the glass.
- Expanded view: the name, the say line, at most three rows that support one decision, two actions, and after a choice, the line that confirms it. No "EST" label.

## Expanded views

- Grace Theater: the three shows (5:30 The Winter Guest · 12 seats / 8:00 Night Market · 40 seats / 10:30 Late Set · Plenty) / Hold two for 8:00 · Not now / after: Two held for 8:00 · I'll walk you there at 7:35.
- Mega Burger: The Mega · Double patty · cheddar · $9.50 / Classic · Single patty · pickles · $7 / Fries · Hand cut · sea salt · $3.50 / Hold a seat · Not now / after: Seat held. Follow the route, across and back.
- Goldie's Counter: Pastrami on rye · Hand sliced · mustard · $14 / Matzo ball soup · Chicken broth · dill · $8 / Egg cream · Chocolate · seltzer · $4.50 / Hold a seat · Not now / after: Seat held. Follow the route, 40 m.
- Post Office: Line of 8 · about 12 min / Counter · till 5 / Pickup window · till 6 / Take a number · Not now / after: You're number 9. I'll say when it's close.
- Main Street Pharmacy: Counter 2 · ready / Pay ahead · Not now / after: Paid. Show the code at counter 2. / once picked up, the decision is settled: Picked up / In your bag. Two stops to go.
- The others keep their rows and actions from `data/places.json`, at most three rows: Lucky Lanes · Book a lane · Lane 6 is yours at 3:30. Atlas Books · Save the reading. Trattoria da Lia · Cacio e pepe · Cheese and black pepper · Hold a table. Kathy's Cupcakes · Brown butter · Save me one. The Big Bean · Order ahead · Ordered. Ready in 5 min. M4 stop · Remind me at 11. 47th St Station · Route me there. Corner Hardware · Hold it at the till.
## The menu

- The button, bottom right, the wearer's own: a compass in a round glass; FIND beside it until the first time it is opened.
- The panel (a click on the button, or the pointer resting on it 0.5 s): the eyebrow from the walk's clock, TUE 12:42 · FIND A PLACE (mono caps) / Where to? / Food and drink · {Five} places · nearest {40} m (food and cafe places, the nearest by straight distance, to 10 m) / Things to do · Theater, lanes, a reading, a park / Shops and services · Pharmacy, hardware, post office / Getting around · M4 in {4} min · uptown in {3} (the bus stop's and the station's live times) / Close (quiet). Reason in the log: Find a place.
- A category's places: {CATEGORY} · BY WALK TIME (mono caps) / Where to? / Back (quiet, above the rows) / one row per place by walk time: {name} · {picker line, else the short form} · {walk time} · {live line}, the walk time as under a minute below 60 s, otherwise whole minutes rounded up (1 min, 2 min); the rows sort by the true seconds; the route offer's {walk time} reads the same way. Picker lines: Goldie's Counter · Fastest lunch on this side. Kathy's Cupcakes · Not lunch, a batch at 2. The Big Bean · Coffee after. Trattoria da Lia · Home cooking, sit-down. Mega Burger · Burgers, counter seats.
- A place chosen: the panel folds, the route draws, and the route's ground glance reads {name} · {walk time} (Goldie's Counter · under a minute): its name and its fact, the walk time from where the route was drawn, read out to a screen reader and kept in the log; the end panel names the place alone.
- The destination's card and expanded view: Going here (a chip in the header, in the voice color). Any other lunch place's card while a lunch destination is set: Go here instead (primary).
- The corner asks nothing: the light holds 12 s each lap, WAIT counting down, and a place chosen from the menu releases it.

## Arrival and end

- Seat's held, inside on the left.
- End screen, in the start screen's panel: The walk / In {m} minutes the glasses saw {places} places, showed you {cards}, held {held} while you crossed, saved {saved} for a red light, got you to {destinations}, and sent {replies} replies. ({m} is the session in whole minutes, at least 1, "minute" when 1; {destinations} names the doors reached, "the Big Bean" or "Goldie's Counter and the Big Bean", or counts them past two, "3 places"; "1 reply"; any clause whose number is zero is dropped; with nothing left: In {m} minutes the glasses stayed quiet.) / the timeline, 0:00 and the session's length / What it decided (mono caps), three lines: {time} · {name} · {reason line}, never the menu or the map / See every decision · Walk again · Keep walking · About

## Reviewer chrome

- FOCUS (inside the viewfinder, at its bottom edge, always)
- I · INSPECTOR
- Pace readout (reviewer chrome, off by default): PACE · WALK · 1.4 M/S
- Inspector headers: Timeline · Decisions · Signals · Overrides · Evals · Export
