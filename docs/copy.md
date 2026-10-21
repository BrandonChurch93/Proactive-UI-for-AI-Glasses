# Copy · everything the wearer and the reviewer read

Rules: plain, warm, short. Sentence case. The brain never apologizes, never explains in the roadway, and in a reason line never mentions the wearer's eyes, body or habits (an input hint such as KEEP LOOKING · MORE is an instruction to the reviewer, not a reason, and may say look). No em dashes anywhere; use the interpunct ( · ), a period, or a new sentence.

## Title screen

- Name: **Proactive UI for AI Glasses**
- Subtitle: A UX study in when an assistant should speak, and when it should stay quiet
- Setting, two lines: You're walking through a big city. / The AI in your glasses decides what to show you, how much, and when to stay quiet.
- How: LOOK · Drag to turn your head. The walk is on rails. / DWELL · Hold your gaze on anything that lights up and it opens. Keep looking and it opens further. / PINCH · Click to skip the wait or choose. Esc to dismiss. / I · Open the inspector: every decision the brain made, the reasons, and the evals.
- Question: What are you up to?
- Choices: Hungry · Find a place and get there. / Errands · Three stops, one route. / Just walking · See what it does when you want nothing.
- Skip: CLICK TO SKIP

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

- Held (glyph) · Held 2 · 3 · social · Pocket 1 · 60 s (snooze countdown)
- Held that while you crossed. Still want it?
- One message came in. Read it?
- Two messages came in. Read them?
- 3 notifications · later

## The pocket, the whisper, the edge

- Saved (at the pip, 600 ms)
- 12 s · what you saved (header; the number follows the signal)
- Pocket rows: Mega Burger · 6 min wait · $
- Card hints by band: KEEP LOOKING · MORE (Stopped, Stroll) / PINCH · SAVES FOR LATER (Walk)
- Whisper line: 47th St Station · uptown 4 min / Grace Theater · last show at 8 (three words and a number at most)
- Ask glance (Just walking only): Hungry? · Find lunch · No

## Messages

- Text (Hungry): Maya · Running 10 late, order me the usual? · Reply · Later
- Text (Just walking, held behind the conversation): Maya · Lunch tomorrow? · Reply · Later
- DM (Errands, held in the crossing): Jules · Still on for tonight? · Reply · Later
- Call: Maya · Calling · Answer · Decline
- App: Package delivered · Front desk · 1 more / Order ready · 1 more

## Places (glance facts, from the roster)

See `docs/world-spec.md` section 3 and `data/places.json`; the roster is the source. Live lines: "3 min wait · 9 seats", "Last show 8:00 · 40 seats left", "Uptown trains · 4 min", "M4 · 2 min · next in 11".

## Expanded views

- Theater: Tonight · three shows · box office till 9 / Hold two for 8:00 · Not now / I'll hold them till 7:40, no charge if you don't make it. / Two held for 8:00 · I'll walk you there at 7:35.
- Mega Burger: Hold a seat · Not now / Seat held. Follow the route, across and back.
- Deli: Hold a seat · Not now / Seat held. Follow the route, 40 m.
- Errands card: Three stops · one route / 1 Pharmacy · 2 Hardware · 3 Post Office / after the pickup: Two to go / 1 Hardware · 2 Post Office / after the closure: Hardware closed early. One stop left. / 1 Post Office
- Pharmacy stop: Prescription's ready here · counter 2 / Picked up

## Cards and expanded views for every place

Card lines (meta, live, year), the short walking form, and the expanded view (sub line, rows, two actions, the line after a choice) live in `data/places.json` and are the source for these. Highlights: Mega Burger · Burgers · $ · open late · 6 min wait · 4 seats open · Hold a seat · Not now. Lucky Lanes · Bowling · twelve lanes · Book a lane · Lane 6 is yours at 3:30. Atlas Books · Tonight at Atlas · Poetry reading · Save the reading. Trattoria da Lia · Menu · read from Italian · Cacio e pepe · Cheese and black pepper · Hold a table. Kathy's Cupcakes · Today's flavors · Brown butter · Save me one. The Big Bean · Order ahead · skip the line · Ordered. Ready in 5 min. M4 stop · Next four buses · Remind me at 11. 47th St Station · Next four departures · Route me there. Post Office · Counter · open till 5 · Take a number.

Short walking forms (used when a glance must fit three words and a number): Last show at 8 · 6 min wait · Lanes open · Open till 9 · Home cooking · Shaded benches · 3 min wait · Fresh batch at 2 · Line of 4 · Prescription's ready · Open till 6 · 2 min · uptown 4 min · Line of 8

## Arrival and end

- Seat's held, inside on the left.
- End card: {Scenario} · Held 11 things, showed 6 · Walk again · {other two}

## Reviewer chrome

- I · INSPECTOR
- Captions (optional, reviewer side only): Just walking · nothing shown / Looking at the marquee · dwell / Keep looking · it opens / Foot leaves the curb · exhale / Far curb · return / Pinch while walking · saved / Red light · the pocket / Truck passing · the card steps aside / Looking up · snooze
- Pace readout (reviewer chrome, off by default): PACE · WALK · 1.4 M/S
- Inspector headers: Timeline · Decisions · Signals · Overrides · Evals · Export
