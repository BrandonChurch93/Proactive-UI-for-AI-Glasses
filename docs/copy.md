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
- No need to run
- Read from Italian
- When you're free (social hold follow-up)
- Saved for the next stop (pace)
- Snoozed (gate)
- Scaffolding ahead. Keep to the curb.

Added in the build (world and goal reasons for places and moments, each under 48 characters): Seats left for tonight · Open late · Lanes open now · Reading tonight at 7 · Counter seats open · Baked on site · Short line · Open till 9 · Keys cut, no wait · Stairs at the corner · Last stop · Counter open till 5 · End of the walk · Benches in the shade · Bus at the stop · Long red light · Clear sidewalk ahead · Lunch spots on this block · Seat held · Someone on the path

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
- Pocket rows: a place pinched while walking, its name and its glance (Mega Burger · 6 min wait · $); a choice the wearer settled, what was settled, split at its first interpunct into the row's title and its value (Dune: Part Two · 8:00 · two held). Every entry is listed under Expanded views.
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
| Trattoria da Lia | Sit-down, about 20 min · menu read from Italian | Sign reads home cooking · table in 20 min | Table in 20 |
| Kathy's Cupcakes | Not lunch, but a brown butter batch at 2 | Brown butter batch at 2 · 80 min from now | Batch at 2 |
| The Big Bean | Maya's meeting you here at 1 (once the wearer has said On my way and Yes; before that, the default) | Line of 4 · 5 min | Maya at 1 (Lunch, met) · Line of 4 |
| Main Street Pharmacy | | Your prescription is ready · counter 2, no line | Ready, counter 2 |
| Corner Hardware | | Keys cut while you wait · till 5 | Keys cut till 5 |
| Post Office | | A package for you · counter line of 8 | Line of 8 |
| Grace Theater | | Dune: Part Two at 8 · 12 seats left | Dune at 8 |
| Lucky Lanes | | 5 lanes open till 5 · walk right in | 5 lanes open |
| Atlas Books | | Four staff picks in stock · reading at 7, free | Reading at 7 |
| M4 stop | | M4 in 2 min · then 11 | M4 in 2 |
| 47th St Station | Uptown in 4 · stairs at the corner | Uptown in 4 · stairs at the corner | Uptown in 4 |
| Pocket Park | | Benches in the shade · end of the walk | Shaded benches |

A say line that names a plan speaks only once the wearer has agreed to it, and while it speaks the card shows no reason line, so the friend is read once and the line once.

Live lines on cards are always a fact from inside, never the hours (the hours live in the card's small meta line and never lead), fit one line of the card in 28 characters, and hint at what the expanded view holds, so a walker knows the stop is worth it. The glance line is what a label grows from. From `data/places.json`:

| Place | Live line | Glance | Meta |
| --- | --- | --- | --- |
| Grace Theater | 4 films · 8:00 has 12 seats | Four films tonight | Cinema · four screens · since 1981 |
| Atlas Books | Reading at 7 · 4 picks in | Reading at 7 · staff picks | Bookshop · new and used |
| Corner Hardware | Keys cut till 5 · no wait | Keys cut · no wait | Hardware · keys cut |
| Pocket Park | Shade till 2:30 · bench free | Benches in the shade | Park · shade and benches |
| Trattoria da Lia | Table in 20 min · translated | Table in 20 min | Home cooking · open until 11 PM |
| Main Street Pharmacy | Ready at counter 2 · no line | Prescription ready | Pharmacy · open till 9 |
| M4 stop | M4 in 2 · seats open | 2 min · next in 11 | Bus · uptown |
| 47th St Station | Uptown in 4 · elevator out | Uptown trains · 4 min | Subway · stairs at the corner |
| Post Office | Line of 8 · package ready | Package ready · line of 8 | Post office · counter service |
| Goldie's Counter | 3 min wait · 9 seats open | 3 min wait · 9 seats | Deli · $ · counter seating |
| Mega Burger | 6 min wait · 4 seats open | 6 min wait · $ | Burgers · $ · open late |
| Kathy's Cupcakes | Fresh batch at 2:00 | Fresh batch at 2 | Bakery · cupcakes and coffee |
| The Big Bean | Line of 4 · 5 min | Line of 4 · 5 min | Coffee · espresso bar |
| Lucky Lanes | 5 lanes open · $12 an hour | Lanes open · $12 an hour till 5 | Bowling · twelve lanes |

The cinema's marquee in the world carries the same bill, in its sign face: DUNE: PART TWO 8:00 · OPPENHEIMER 7:15 / SPIRITED AWAY 6:45 · THE AVENGERS 9:30 (the second line only while both still fit the marquee's type size). Titles are text; no poster art.

## What a pane shows

- Label: the name and the say line's short form (in Brisk, the name and one number). Nothing else.
- Card: the name, the say line, one live line, and the reason line in Stopped and Stroll (a compact card, beyond 30 m, has no reason line) unless the say line already says it (Mega Burger's "across the street, on your way"). No year, no category line, no hint on the glass.
- Expanded view: what the front door cannot say. The name, the say line, up to four rows (three where a place cannot carry four) with a key where a time, an aisle or a platform fits, one action and Not now, and after a choice the line that confirms it, ending in a time, a number or a place. Where the rows are each a choice the action reads for the row under the look or the pointer. Pocket Park has rows and no action. No "EST" label.

## Expanded views

Each place, in `data/places.json` order of interest: its sub line, its rows (key · title · sub · value, with the tone or now marker in brackets), its action, what each choice settles (the confirmation line, in `--voice`, where the actions were), and the pocket entry it leaves. On the choice, the chosen row stays and the rest give way; the end panel names it in What it decided as {place} · {confirmation}.

- **Grace Theater** · Now playing · next showings: 8:00 · Dune: Part Two · 2 h 46 · also 5:30, nearly full · 12 seats (warn, now) / 7:15 · Oppenheimer · 3 h · also 4:00 · 40 seats (go) / 6:45 · Spirited Away · 2 h 5 · also 3:30 · Plenty (go) / 9:30 · The Avengers · 2 h 23 · also 6:30 · Plenty (go). Action, following the row: Hold two for 8:00 / Hold two for 7:15 / Hold two for 6:45 / Hold two for 9:30 · Not now. After: Two held for Dune at 8:00 · I'll walk you there at 7:35. / Two held for Oppenheimer at 7:15 · I'll walk you there at 6:50. / Two held for Spirited Away at 6:45 · I'll walk you there at 6:20. / Two held for The Avengers at 9:30 · I'll walk you there at 9:05. Pocket: Dune: Part Two · 8:00 · two held / Oppenheimer · 7:15 · two held / Spirited Away · 6:45 · two held / The Avengers · 9:30 · two held.
- **Atlas Books** · Staff picks · in stock today: Fiction · Tomorrow, and Tomorrow, and Tomorrow · Gabrielle Zevin · 2 copies · $18 / Classic · The Great Gatsby · F. Scott Fitzgerald · used · $6 / Science · Sapiens · Yuval Noah Harari · 1 copy · $24 (warn) / 7:00 · Poetry reading · Upstairs · free · tonight. Action, following the row: Hold a copy / Save the reading · Not now. After: Tomorrow, and Tomorrow, and Tomorrow held at the counter under your name · till 9. / The Great Gatsby held at the counter under your name · till 9. / Sapiens held at the counter under your name · till 9. / Saved. I'll remind you at 6:45. Pocket: Tomorrow, and Tomorrow, and Tomorrow · held till 9 / The Great Gatsby · held till 9 / Sapiens · held till 9 / Poetry reading · 7:00 · saved.
- **Corner Hardware** · In stock today · aisles: Keys · Keys cut · About 5 min · till 5 · $3 (go) / Aisle 4 · Picture hooks · Bottom shelf · $4 / Aisle 2 · AA batteries · Packs of 8 · $9 / Aisle 7 · LED bulbs · Warm white · packs of 4 · $12. Action, following the row: Hold it at the till · Not now. After: Picture hooks held at the till under your name. / AA batteries held at the till under your name. / LED bulbs held at the till under your name. Pocket: Picture hooks · at the till / AA batteries · at the till / LED bulbs · at the till. Not a choice: Keys cut.
- **Pocket Park** · Right now: Shade · East benches in shade · Sun reaches them at 2:30 · till 2:30 / Free · Bench by the fountain · Two of five free · now (go) / Quiet · Six people · No events today · quiet. No action: the park asks nothing.
- **Trattoria da Lia** · Menu · read from Italian: Cacio e pepe · Cheese and black pepper · $16 (photo) / Lasagne della nonna · Grandma's lasagne · $19 (photo) / Tiramisù · Coffee and mascarpone · $8 (photo) / Set lunch · Pranzo fisso · Two courses and coffee · read from Italian · $24. Action: Hold a table · Not now. After: Table for two at 1:00 · ask for Lia. Pocket: Table for two · 1:00.
- **Main Street Pharmacy** · Pickup · counter 2: Rx · Your prescription · Ready since noon · counter 2 (go) / Copay · Copay $10 · Insurance on file · card / Line · No one at counter 2 · Front register has 3 · now / Also · Flu shots · Walk in till 8 · free. Action: Pay ahead · Not now. After: Paid. Show the code at counter 2. Pocket: Prescription · paid, counter 2.
- **M4 stop** · Next four buses: 2 min · M4 uptown · Seats open · on time (go) / 11 min · M4 uptown · Standing room · 3 min late (warn) / 19 min · M4 uptown · Seats open · on time / 24 min · M4 Limited · Skips 50th to 59th · on time. Action: Remind me at 11 · Not now. After: I'll tell you when it's 3 min out. Pocket: M4 uptown · I'll say at 3 min.
- **47th St Station** · Next departures · access: 4 min · Uptown local · Platform A · crowded · on time / 7 min · Downtown local · Platform B · seats · on time / 10 min · Uptown express · Skips 50th · 2 min late (warn) / Access · Elevator out of service · Stairs at the corner, 24 steps · till Fri (warn). Action: Route me there · Not now. After: Stairs on your right at the corner · 24 steps. Pocket: Stairs at the corner · 24 steps.
- **Post Office** · Counter · open till 5: Line · 8 ahead · About 12 min · till 5 / Window · A package for you · Pickup window · no line · till 6 (go) / Stamps · Kiosk · No line · 24 h. Action: Take a number · Not now. After: You're number 9 · about 12 min. I'll say when it's close. Pocket: Number 9 · about 12 min.
- **Mega Burger** · Counter and booths · open till 1: The Mega · Double patty · cheddar · $9.50 (photo) / Classic · Single patty · pickles · $7 (photo) / Fries · Hand cut · sea salt · $3.50 (photo) / Shake · Vanilla or chocolate · $5. Action: Hold a seat · Not now. After: Seat held. Follow the route, across and back. Pocket: Mega Burger · seat held.
- **Goldie's Counter** · Counter seating · open till 4: Pastrami on rye · Hand sliced · mustard · $14 (photo) / Matzo ball soup · Chicken broth · dill · $8 (photo) / Egg cream · Chocolate · seltzer · $4.50 (photo) / Half sour pickle · On the side · $2. Action: Hold a seat · Not now. After: Seat held. Follow the route, 40 m. Pocket: Goldie's Counter · seat held.
- **Kathy's Cupcakes** · Today's flavors: Brown butter · Fresh at 2 · $4 (photo) / Lemon poppy · In the case · $4 (photo) / Double chocolate · Sold out (stop, photo) / Red velvet · Last two · $4 (warn). Action: Save me one · Not now. After: One brown butter, held at the counter. Pocket: Brown butter · held at 2.
- **Lucky Lanes** · Lanes right now: 1 to 4 · League play · Till 6 · Booked (warn) / 5 to 9 · Walk in · $12 an hour till 5 · Open (go) / 10 to 12 · Party · From 4 · Booked (warn) / Rental · Shoes · Sizes 4 to 15 · $4. Action: Book a lane · Not now. After: Lane 6 is yours at 3:30. Pocket: Lane 6 · 3:30 · booked.
- **The Big Bean** · Order ahead · skip the line: Cortado · $4.25 (photo) / Cold brew · $5 (photo) / Oat latte · $5.75 (photo) / 12:46 · Pickup at the counter · Skip the line of 4. Action, following the row: Order ahead · Not now. After: Cortado ordered · ready at 12:46, skip the line. / Cold brew ordered · ready at 12:46, skip the line. / Oat latte ordered · ready at 12:46, skip the line. Pocket: Cortado · ready at 12:46 / Cold brew · ready at 12:46 / Oat latte · ready at 12:46. Not a choice: Pickup at the counter.

- Settled at a door: the destination's expanded view carries no reason line; the arrival line (You made it, or the route's why) stays on its card.
## The menu

- The button, bottom right, the wearer's own: a compass in a round glass; FIND beside it until the first time it is opened.
- The panel (a click on the button, or the pointer resting on it 0.5 s): the eyebrow from the walk's clock, TUE 12:42 · FIND A PLACE (mono caps) / Where to? / Food and drink · {Five} places · nearest {40} m (food and cafe places, the nearest by straight distance, to 10 m) / Things to do · Theater, lanes, a reading, a park / Shops and services · Pharmacy, hardware, post office / Getting around · M4 in {4} min · uptown in {3} (the bus stop's and the station's live times) / Close (quiet). Things to do reads Cinema, lanes, a reading, a park. Reason in the log: Find a place.
- A category's places: {CATEGORY} · BY WALK TIME (mono caps) / Where to? / Back (quiet, above the rows) / one row per place by walk time: {name} · {picker line, else the short form} · {walk time} · {live line}, the walk time below 60 s as the distance (40 m, rounded to 5 m), otherwise whole minutes rounded up (1 min, 2 min), so no two rows read the same; the rows sort by the true seconds when the list opens and keep that order while it is open; the route offer's {walk time} and the route's glance read the same way. Picker lines: Goldie's Counter · Fastest lunch on this side. Kathy's Cupcakes · Not lunch, a batch at 2. The Big Bean · Coffee after. Trattoria da Lia · Home cooking, sit-down. Mega Burger · Burgers, counter seats.
- A place chosen: the panel folds, the route draws, and the route's ground glance reads {name} · {walk time} (Goldie's Counter · 40 m): its name and its fact, the walk time from where the route was drawn, read out to a screen reader and kept in the log; the end panel names the place alone.
- The destination's card and expanded view: Going here (a chip in the header, in the voice color). Any other lunch place's card while a lunch destination is set: Go here instead (primary).
- The corner asks nothing: the light holds 12 s each lap, WAIT counting down, and a place chosen from the menu releases it.

## Arrival and end

- Seat's held, inside on the left.
- End screen, in the start screen's panel: The walk / In {m} minutes the glasses saw {places} places, showed you {cards}, held {held} while you crossed, saved {saved} for a red light, got you to {destinations}, and sent {replies} replies. ({m} is the session in whole minutes, at least 1, "minute" when 1; {destinations} names the doors reached, "the Big Bean" or "Goldie's Counter and the Big Bean", or counts them past two, "3 places"; "1 reply"; any clause whose number is zero is dropped; with nothing left: In {m} minutes the glasses stayed quiet.) / the timeline, 0:00 and the session's length / What it decided (mono caps), three lines: {time} · {name} · {reason line}, or {time} · {place} · {confirmation} for a choice the wearer settled (0:37 · Grace Theater · Two held for Dune at 8:00 · I'll walk you there at 7:35.), never the menu or the map / See every decision · Walk again · Keep walking · About

## Reviewer chrome

- FOCUS (inside the viewfinder, at its bottom edge, always)
- I · INSPECTOR
- Pace readout (reviewer chrome, off by default): PACE · WALK · 1.4 M/S
- Inspector headers: Timeline · Decisions · Signals · Overrides · Evals · Export
- Inspector, under a choice the wearer settled: Confirmed · {confirmation}
