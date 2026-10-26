# Copy · everything the wearer and the reviewer read

Rules: plain, warm, short. Sentence case. The brain never apologizes, never explains in the roadway, and in a reason line or a say line never mentions the wearer's eyes, body or habits. No em dashes anywhere; use the interpunct ( · ), a period, or a new sentence.

## Title screen

A panel on the left, reviewer chrome, over the live street; top to bottom:

- Subtitle (mono caps): A UX study in when an assistant should speak, and when it should stay quiet
- Name: **Proactive UI for AI Glasses**
- Setting: You're walking through a big city. The AI in your glasses decides what to show you, how much, and when to stay quiet.
- What this is (mono caps), three lines with mono keys: BRAIN · A deterministic rules engine, not a model. Same walk, same decisions, every time. / RULES · Thirteen walking rules for a person who is moving: content scales with speed, yields to a head check, saves itself for the red light, never covers a face or a car. / PROOF · Every decision is logged with its reasons and scored by an eval suite. Press I during a walk.
- Choose a walk (mono caps), four cards, each with "90 s": Hungry · Find a place and get there. / Errands · Three stops, one route. / Just walking · See what it does when you want nothing. / Watch · Sit back. Ninety seconds with captions.
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
- Ask glance (Just walking only): Hungry? · Find lunch · No

## Messages

- Text (Hungry): Maya · Running 10 late, order me the usual? · Reply · Later
- Text (Just walking, held behind the conversation): Maya · Lunch tomorrow? · Reply · Later
- DM (Errands, held in the crossing): Jules · Still on for tonight? · Reply · Later
- Call: Maya · Calling · Answer · Decline
- App: Package delivered · Front desk · 1 more / Order ready · 1 more

## What each place says

The clock: every walk starts at 12:40, and a line that names a time is written from it.

Each place has a say line per scenario, the one sentence the assistant would say about it, and its short form. The brain uses the scenario's line, else the default. The say line is the first line of the card and the expanded view; a label shows the short form in every band, which the reading budget still caps at three words and a number (a second fact after a comma is dropped by rule). Live data can replace the table (Corner Hardware closed early, the prescription picked up).

Rules for a say line: under 60 characters; at most two numbers (a unit counts with its number); never repeats the place's name; never a banned word; written from the 12:40 clock. The eval checks every say line the brain shows against these.

| Place | Hungry | Errands | Default (Just walking) | Short form |
| --- | --- | --- | --- | --- |
| Goldie's Counter | Fastest lunch on this side · 3 min, 9 seats | | Pastrami counter · 3 min wait | 3 min, 9 seats (Hungry) · 3 min wait |
| Mega Burger | 4 seats open, 6 min · across the street, on your way | | Burgers till 1 am · 6 min wait | 6 min wait |
| Trattoria da Lia | Sit-down, about 20 min · the sign says home cooking | | The sign says home cooking · open till 11 | Home cooking |
| Kathy's Cupcakes | Not lunch, but a brown butter batch at 2 | | Brown butter batch at 2 · 80 min from now | Batch at 2 |
| The Big Bean | Coffee after · line of 4, 5 min | Scaffolding over the door · keep to the curb | Line of 4 · 5 min | Line of 4 · Keep to the curb (Errands) |
| Main Street Pharmacy | | Prescription's ready · counter 2, no line | Open till 9 | Ready, counter 2 (Errands) · Open till 9 |
| Main Street Pharmacy, picked up | | | Picked up | Picked up |
| Corner Hardware | | Picture hooks in aisle 4 · open till 6 | Keys cut till 5 | Aisle 4, till 6 (Errands) · Keys cut till 5 |
| Corner Hardware, closed early | | Closed early today · dropped from the route | Closed early today | Closed early |
| Post Office | | Line of 8, about 12 min · you'll make the counter | Counter till 5 · line of 8 | 12 min, closes 5 (Errands) · Line of 8 |
| Grace Theater | | | Night Market at 8 has 40 seats · earlier shows filling | Night Market at 8 |
| Lucky Lanes | | | 5 lanes open till 5 · walk right in | 5 lanes open |
| Atlas Books | | | Poetry reading at 7 · upstairs, free | Reading at 7 |
| M4 stop | | M4 in 2 min · not on today's route | M4 in 2 min · then 11 | M4 in 2 |
| 47th St Station | Uptown in 4 · stairs at the corner | | Uptown in 4 · stairs at the corner | Uptown in 4 |
| Pocket Park | | | Benches in the shade · end of the walk | Shaded benches |

Live lines on cards (the two facts behind the sentence) stay as in `data/places.json` and fit one line of the card, 28 characters at most: "3 min wait · 9 seats open", "5:30 nearly full · 40 at 8", "Ready since noon · till 9", "5 lanes open · $12 an hour", "Uptown trains · 4 min", "M4 · 2 min · next in 11".

## What a pane shows

- Label: the name and the say line's short form (in Brisk, the name and one number). Nothing else.
- Card: the name, the say line, one live line, and the reason line in Stopped and Stroll (a compact card, beyond 30 m, has no reason line) unless the say line already says it (Mega Burger's "across the street, on your way"). No year, no category line, no hint on the glass.
- Expanded view: the name, the say line, at most three rows that support one decision, two actions, and after a choice, the line that confirms it. No "EST" label.

## Expanded views

- Grace Theater: the three shows (5:30 The Winter Guest · 12 seats / 8:00 Night Market · 40 seats / 10:30 Late Set · Plenty) / Hold two for 8:00 · Not now / after: Two held for 8:00 · I'll walk you there at 7:35.
- Mega Burger: Seat now · 6 min / Order ahead · ready in 8 / Maya's usual · pastrami (Hungry, once Maya's text has arrived) / Hold a seat · Not now / after: Seat held. Follow the route, across and back.
- Goldie's Counter: Seat now · 3 min / Order ahead · ready in 5 / Maya's usual · pastrami (Hungry, once Maya's text has arrived) / Hold a seat · Not now / after: Seat held. Follow the route, 40 m.
- Post Office: Line of 8 · about 12 min / Counter · till 5 / Pickup window · till 6 / Take a number · Not now / after: You're number 9. I'll say when it's close.
- Main Street Pharmacy: Counter 2 · ready / Pay ahead · Not now / after: Paid. Show the code at counter 2. / once picked up, the decision is settled: Picked up / In your bag. Two stops to go.
- Corner Hardware, closed early: Closed early today / Dropped from the route. The Post Office is next.
- The others keep their rows and actions from `data/places.json`, at most three rows: Lucky Lanes · Book a lane · Lane 6 is yours at 3:30. Atlas Books · Save the reading. Trattoria da Lia · Cacio e pepe · Cheese and black pepper · Hold a table. Kathy's Cupcakes · Brown butter · Save me one. The Big Bean · Order ahead · Ordered. Ready in 5 min. M4 stop · Remind me at 11. 47th St Station · Route me there. Corner Hardware · Hold it at the till.
- Errands card: Three stops · one route / 1 Pharmacy · 2 Hardware · 3 Post Office / after the pickup: Two to go / 1 Hardware · 2 Post Office / after the closure: Hardware closed early. One stop left. / 1 Post Office

## Arrival and end

- Seat's held, inside on the left.
- End screen, in the start screen's panel: {Scenario} / In ninety seconds the glasses saw {places} places, showed you {cards}, held {held} while you crossed, and saved {saved} for the red light. (any clause whose number is zero is dropped; with nothing left: In ninety seconds the glasses stayed quiet.) / the timeline, 0:00 and 1:30 / What it decided (mono caps), three lines: {time} · {name} · {reason line} / See every decision · Walk again · {other two} · About
- End after Watch: Play it yourself first, then the same buttons

## Reviewer chrome

- I · INSPECTOR
- Captions (Watch only, `caption` beats in `data/scenarios/hungry.json`, shown 6 s each): 0:02 Three lunch spots lit · the brain says one thing / 0:14 Looking at Mega Burger · it opens / 0:22 Pinch while walking · saved for later / 0:36 Light about to change · nothing new / 0:44 Brisk · one line at the bottom, no cards / 0:58 Red light · the pocket surfaces / 1:06 Hold a seat · the route draws / 1:14 Crossing · everything recedes / 1:24 Far curb · "Held that while you crossed" / 1:34 Arrival
- Pace readout (reviewer chrome, off by default): PACE · WALK · 1.4 M/S
- Inspector headers: Timeline · Decisions · Signals · Overrides · Evals · Export
