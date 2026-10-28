# World Spec · the block

One avenue block and one cross street, rendered in real time in Three.js, that a reviewer mistakes for a game at first glance. Small on purpose: everything in view is finished. Art direction is in `docs/design-system.md` section 8. This document is the content.

## 1. Layout

- Positions along the block are given in metres north of the start, written n. The block runs from n = 0 (the south crossing, the start corner) to n = 90 (the corner). The cross street runs east-west from n = 90 to 104, a four-way intersection with a crosswalk on every leg. The avenue is 14 m curb to curb (two lanes each way at 1.75 and 5.25 m from the center line, parking against the curbs) with 6 m sidewalks; the cross street is also 14 m curb to curb. A crossing at Walk takes 10 s. Half a block of the cross street is built in each direction (70 m east and west); beyond that, and north of the cross street, the city continues as lit background massing with no storefronts. The sim maps n to its own axis (north is -z in Three.js); every doc and data file uses n.
- The walk is a loop around the block that never ends on its own: the start corner (south-east, n = 0), the east sidewalk north (8.3 m east of the avenue's center line), across the avenue at the north corner, the west sidewalk south (8.8 m west of the center line), across the avenue at the south crossing, back to the start. About 160 s a lap at Walk with the pace track's Stroll and Brisk stretches, plus the lights. The cross street's east crossing is a side leg to the Post Office.
- The router (`packages/sim/src/route.ts`) is a sidewalk graph: four corner nodes (SE, NE, NW, SW), the two sidewalks, the avenue crossings at the north corner and at n = 0, the cross street's east crossing (XS to XN), and a door spur per roster place from its sidewalk. Dijkstra from where the wearer stands to any door or back to the start corner. A door spur ends 3.4 m in front of the door and the wearer turns to face it, so the stop frames the shopfront and its card. The brain owns the destination; the sim reads it from each frame's goal (`sim.plan`) and rebuilds the route from the wearer's current position. A new destination asked for during a crossing waits for the far curb, so the router never turns back across a crossing already started. The route band and the destination column draw from the router's legs.
- The south crossing at n = 0 is a mid-block crossing on its own actuated signal (`packages/sim/src/crossing.ts`): traffic runs green until a pedestrian asks (the wearer, 12 m out), then after at least 18 s of green, 3 s yellow, 1 s all red, WALK 7 s, flashing 6 s, 1 s clear. The sim holds it red for 12 s every time the wearer stands at the start corner (the opening and the end of every lap); choosing an intent or a destination releases it. Stop bars 1 m before it in both directions; signal heads on the poles at its south-east and north-west corners.
- As built: the east side of the avenue has no parking on this block (bus route, loading zone and the scaffold), so both northbound lanes carry traffic, the bus pulls in at the M4 stop in the curb lane and dwells 9 s (25 s on Hungry, so it leaves on the green after Maya's thread has been read at the north light rather than streaming past the wearer during it), the truck crawls the curb lane and the bike rides its right edge; the west curb lane is the parking lane, so southbound traffic uses the inner lane. The cross street has two moving lanes each way. Its sidewalks put the building lines at n = 84 (south side) and n = 110 (north side), so the Post Office façade is at n = 110, 6.5 m east of the corner building line. Crosswalks: across the avenue centred on n = 87.6 and n = 106.4; across the cross street centred on x = ±9.6. Stop lines 1 m before each.
- As built: street furniture keeps the beats' sightlines clear. No lamp stands where the wearer passes during the theater dwell (the east lamps are at n = -10, 12, 38, 66 and 82; the one at n = 3 stood in the opening frame and moved, as did the no-standing sign, now at n = 8.5), and no west-side tree stands on the line from the wearer to Mega Burger during the Hungry dwell (west trees at n = 9.5, 29.5, 46.2, 56.8 and 75). The theater's pip anchor is 6.9 m up, clear above the marquee. A door stop is 3.4 m in front of the door (the Post Office's 2.8 m, from the cross street side), so the frame shows the shopfront rather than the inside of the lintel. Idle people on the west sidewalk stand at least 3 m off the walking line.
- As built: background towers are rejected wherever they would overlap a street or a built lot (one had been standing across the cross street east of the corner). Exposed party walls carry period ghost signs and lot-line windows. Shop interiors are chosen by the place: cafes and food show a counter and menu board, goods shops show stock, the theater, the post office and services show a lobby or counter. Road paint is calibrated to 0.58 albedo so sunlit crosswalks never bloom. The M4 bus has a lit interior with seats, poles and passengers behind its windows. Pocket Park has three trees over its lawn.
- Signals at the corner: a 42 s cycle on each leg (WALK 18 s, flashing 8 s, DONT WALK 16 s), the two legs opposed. As built, "opposed" means the cross leg runs half a cycle (21 s) behind the avenue leg, which makes the vehicle phases exclusive: avenue traffic is green for the 13 s after the avenue walk leg goes DONT, then 3 s of yellow; cross traffic the same, half a cycle later; the 5 s between are all-red. No two movements ever share the intersection. The walk file sets the phase once (DONT WALK with 5 s left at t = 0), so a wearer who leaves the start corner at 0:01 meets a red light at the north corner at 1:15 with 14 s to wait. The wearer stops at the stop line; the sim clamps the wearer at a stop regardless of the pace track's arithmetic.
- Camera starts at n = 0 on the east sidewalk at the south crossing, facing north with the Grace Theater marquee across the street ahead-left, the composition in `reference/hero-block.html`, the light held red and WAIT on the pavement ahead.

## 2. Massing rules (binding)

- No two adjacent lots share a façade style.
- Heights, setbacks, cornice lines and storefront widths vary per lot. Front-row heights 16 to 60 m; second-row towers behind, 80 to 240 m, in haze.
- Breaks in each row: the theater (low, with the marquee), a two-story building, a vacant-lot mural wall, a parking garage entrance. The two sides of the avenue never rhyme.
- Façade styles: limestone, brick, granite, concrete, glass curtain, bronze curtain. Scanned CC0 PBR sets for the materials (albedo, roughness, normal); procedural only for massing and window layout.
- Storefront band 0 to 4.9 m with real depth: recessed doors, display windows with interiors, awnings, blade signs, posters.
- Rooftops: parapets, water towers, HVAC, one billboard. Far skyline fades in haze.

## 3. The roster

Everyday, memorable names. Each place has a glance line and an expanded depth. Data lives in `data/places.json`; this table is the source of truth for names and intent. Positions are n, metres north of the start; W is the west side (across from the wearer), E is the east side (the wearer's side), X is the cross street.

| Place | Side · n | Kind | Glance line | Expanded view | Scenarios |
| --- | --- | --- | --- | --- | --- |
| Grace Theater | W · 18 to 30 | Cinema · since 1981 (the marquee reads the bill) | Four films tonight | Four films with their next showings and seats, hold two for the one under the look | Explore |
| Mega Burger | W · 70 to 78 | Burgers | 6 min wait · $ | Menu with a shake, hold a seat | Lunch |
| Lucky Lanes | W · 44 to 56 | Bowling | Lanes open · $12 an hour till 5 | Lane availability and shoe rental, book | Explore |
| Atlas Books | W · 60 to 68 | Bookshop | Reading at 7 · staff picks | Three staff picks in stock and the reading, hold a copy or save the reading | Explore |
| Trattoria da Lia | W · 34 to 42 | Italian (sign in Italian) | Table in 20 min | Menu and the set lunch, read from Italian, hold a table | Lunch, Explore |
| Pocket Park | W · 80 to 90, the south-west corner | Park | Benches in the shade | Shade, a free bench, how quiet; no action | All |
| Goldie's Counter | E · 10 to 18 | Deli | 3 min wait · 9 seats | Menu with a side, hold a seat | Lunch |
| Kathy's Cupcakes | E · 24 to 30 | Bakery | Fresh batch at 2 | Today's flavors, the last two red velvet, save one | Lunch, Explore |
| The Big Bean | E · 46 to 52 | Coffee | Line of 4 · 5 min | Three drinks to order ahead for the 12:46 pickup | Lunch |
| Main Street Pharmacy | E · 34 to 42 | Pharmacy | Prescription ready | Your prescription at counter 2, the copay, the line, flu shots; pay ahead (no medicine ever named) | Explore (the menu) |
| Corner Hardware | E · 68 to 78 | Hardware | Keys cut · no wait | Keys cut while you wait and three things in stock by aisle, hold one at the till | Explore (the menu) |
| M4 stop | E · 58 | Bus | 2 min · next in 11 | Next four buses, seats and lateness | Explore |
| 47th St Station | E · 86, stair at the corner | Subway | Uptown trains · 4 min | Next three departures and the elevator out | Lunch |
| Post Office | X · north side, 10 m east of the corner | Service | Package ready · line of 8 | The line, a package at the pickup window, the stamp kiosk; take a number | Explore (the menu) |

As built: the 47th St Station entrance sits along the east building line just before the corner (n 78 to 83) rather than at the corner itself, so the corner stays clear for waiting and crossing; the newsstand stands at n 65 and the M4 shelter at the curb at n 58, with every route stepping behind the shelter as pedestrians do.

Street furniture with no card: bike dock, taxi stand, the garage entrance, the scaffolding over The Big Bean's frontage that narrows the east sidewalk (a focused case), crosswalks with countdowns, a delivery truck that crawls the near lane on cue (Just walking beat), a newsstand at the corner.

Signage rule: a person's name or a plain descriptor, two or three words. Each roster place gets a designed storefront with its own sign format (marquee, blade, painted brick, awning text, window vinyl, neon). Background shops use five or six formats, never one. Background shop names are invented in the same voice and never repeat a roster name.

## 4. Life

- Traffic: cars, taxis, vans, a bus that stops at the M4 stop, the delivery truck. Each vehicle's box in the sim matches the model as drawn, because keep-outs and the backdrop sampler use the sim's box: models scale to the sim's length and never wider than its width, so the stubby truck model is drawn 7.6 m long, 4.15 m tall and 2.5 m wide, inside its lane. Lane logic with following distance; signals obeyed; never through each other; never stopped inside the intersection. Parked cars along the avenue.
- People: rigged characters with walk cycles (CC0 low-poly packs, e.g. Quaternius or Kenney, loaded as glTF). Idle groups talking (the social signal), someone at the newsstand, someone waiting at the light. Nobody within 3 m of the camera except scripted beats.
- Scripted people for beats: a rider in the bike lane for the bike moment.
- Ambient audio: a city bed of distant traffic and air, vehicles passing from the roadway's side, footsteps at the band's cadence, the crossing's beeper at a curb on WAIT and through a crossing; no horns (design-system 4, Sound).

## 5. Lighting

Early afternoon, sun high and slightly off-axis, fixed. Every walk starts on a Tuesday at 12:40 (the clock on the glass), and any copy that names a time is written from that clock (Kathy's 2:00 batch is 80 min away; the Post Office counter closes at 5). Both sides of the street lit; trees and poles throw clear shadows on the pavement. Marquee and neon read against daylight through bloom. No time-of-day slider.

## 6. Backdrop luminance

The sim reports, per visible pane, the luminance behind the pane's center: a ray from the camera through the pane center into the scene, returning the hit material's albedo scaled by whether it is sunlit (sky counts as .9). Updated every 250 ms. This feeds walking rule 9 and the legibility evals.

## 7. Performance budget

- As built: the high tier uses SMAA on the graded image instead of MSAA and a 3072 shadow map, 5.9 ms per frame at pixel ratio 1.6 on the development machine (an M4 Pro), against 7.6 ms with 4x MSAA and 4096 shadows; the fast tier (pixel ratio 1, no anti-aliasing, 2048 shadows) is 5.1 ms there. Draw calls 217 to 278 across the beats. The build is 17 MB. A cold load to the first pip takes 4.0 s at 50 Mbit/s with 30 ms latency (7.4 s at 20 Mbit/s).
- 60 fps on a 2021 MacBook Air class GPU at 1.6 pixel ratio; graceful fallback to pixel ratio 1 and no MSAA on slower devices, detected by frame time over the first four seconds.
- Draw calls under 300 in view; instancing for windows, bulbs, leaves, bollards, cars.
- All textures ≤ 2048, KTX2 or compressed PNG; total asset payload under 30 MB.
- Loading: the title screen covers the load; the walk never starts before the block is ready. A cold load to the first pip under 6 s on a normal connection.
