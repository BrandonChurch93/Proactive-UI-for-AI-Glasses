# STATUS

Claude Code keeps this file current. One dated entry per phase, plus any decision the docs did not cover and anything that changed from the docs and why. One line per decision. Never paste logs here.

## Handoff

Written for a session that remembers nothing. Rewrite it at the end of every phase and before every compaction.

- Phase: 7 done. The build is complete; the Final section below is the summary for the owner.
- If anything is picked up again: run the refresh ritual, read Final and the Phase 6 review, then the "Left for the owner" list. Tools: scripts/play.ts (drive a session), scripts/shots.ts (stills, `--query cam=x,y,n,yaw,pitch` for a debug camera), scripts/coldload.ts (cold load to first pip on the build), scripts/perf.ts and perf2.ts (frame cost and its breakdown), scripts/decisions.ts, `pnpm eval --file <export>`.
- Open decisions: none.
- Last review verdict: Phase 7 passes its check.

## Final · 2026-10-20

### What was built

- A static site (`pnpm build` writes `apps/web/dist`, 17 MB, relative paths, runs from any file server and from a subpath) of a near-future pair of AI glasses on a ninety-second city walk. It opens on the title screen over the live street with the Just walking attract loop. You choose Hungry, Errands or Just walking, play the walk with your own head and gaze (drag, dwell, click, Esc), and end on a card that reads the walk's own log. The inspector (I) shows every decision with its reasons, scrubs the whole walk, applies logged overrides, shows this build's evals and exports the run.
- The world (apps/web/src/world, packages/sim): one avenue block and a cross street, hand-authored lots with scanned CC0 materials, interior-mapped windows, designed storefronts and signage for every place, rooftops, fire escapes, ghost signs, rigged CC0 people who walk door to door and wait for the light, CC0 cars in lanes under IDM following and exclusive signal phases, the M4 bus, the delivery truck, the bike, all lit by one sun with real shadows, bloom only on emissives and the light vocabulary.
- The brain (packages/brain): a deterministic rules policy at 10 Hz, every number in config.ts, every decision logged with a cause and signed reason parts.
- The overlay (packages/overlay): glass panes, the light vocabulary depth-tested in the scene, the full motion vocabulary on the sim clock, and the geometry of the walking rules (focus zone, edge entry, yielding, stepping aside, backdrop adaptivity, edge folding).
- The proof: 39 eval suites (869 checks) over the three recorded walks and 36 focused cases, 40 unit tests including the overlay's placement suite over every frame of every walk, an export that round-trips through `pnpm eval --file`.

### What changed from the docs, and why

Each is written into the doc it changes (look for "As built").

- Gaze is the view center, but live acquisition is tolerant in pitch (people look at the shopfront, not the sign's exact point) and the pointer is the gaze over view-zone panes, which have no place in the world. Because the gaze target is centered and the focus zone keeps the middle third clear, a card always sits just outside the zone, joined to its pip by the leader, rather than tucked beside the pip as in reference scene 1.
- The light vocabulary keeps its 24 m angular size when nearer; the leader's pane end sits at most 6 m from the eye so only its far end can be occluded.
- The delivery truck uses the inner northbound lane (it filled the whole frame in the curb lane); the beat still happens.
- The theater dwell frames the marquee about 60 degrees off the walking line, not the reference's 38, because the beat sheet puts the wearer 13 m from it at 0:08.
- The Errands passerby cannot reach a card that sits above a 4 m sign (heads stay at the horizon), so rule 8 is shown by the truck in Just walking and by its eval case; the step-aside still runs whenever a body or face does reach a pane.
- View-zone panes do not step aside; they live at the edges by design and have no pip to fall back to.
- Sound stays off until the Sound control is pressed and is muted behind the title.
- The high tier uses SMAA and a 3072 shadow map instead of 4x MSAA and 4096 (7.6 to 5.9 ms on the development machine).
- Scrubbing replays recorded input from zero rather than caching states (exact, and fast: under a quarter of a second for a whole walk).
- Smaller settled points: arrival anchored at the door, the signal moment on the far signal head, the countdown traveling ahead of the wearer while crossing, Pocket Park's anchor over the lawn, lamps and trees moved off the beats' sightlines, route endings a couple of metres from the doors.

### Left for the owner

- Push and deploy: `pnpm build`, then host `apps/web/dist` anywhere static. Nothing else is needed.
- The 60 fps budget on a 2021 MacBook Air could not be measured here. On the development machine (M4 Pro) the high tier costs 5.9 ms and the fast tier 5.1 ms; on an M1 Air the high tier will likely run near 24 ms and the automatic fallback after four seconds will move it to the fast tier. Worth one look on that hardware.
- A cold load to the first pip is 4.0 s at 50 Mbit/s and 7.4 s at 20 Mbit/s. Textures are JPEG because no KTX2 encoder was available; converting them would cut the 20 Mbit/s case.
- People are the best CC0 rigged characters available from this network (Quaternius via poly.pizza); Google Drive refused the higher-quality Quaternius packs. Swapping them in through `scripts/assets.ts` would raise the world the most.
- Ghost signs sit high on the party walls where the walk rarely looks, and shop interiors are convincing at a glance but repetitive up close.

## Reference notes

(What you learned from reference/hero-block.html and reference/walking-rules.html. Orientation only; you still open them before every visual check.)

- Composition: camera at x 8.3 (east sidewalk), eye 1.68, yaw .34 left toward the theater, pitch .05. The marquee sits left of center at about a third of the height, the avenue recedes to a bright hazy vanishing point right of center, the east façades run off the right edge. Sky is pale blue to white haze; fog colour #bfcbd8.
- Light: sun direction (-.62,.56,-.5), west-north-west and high, so the east façades (the wearer's side) take the sun and the west façades (the theater side) are in shade, lifted by sky and hemisphere light. Hemisphere .42, exposure .58, ACES, bloom .42/.45/1.02. Only the marquee bulbs, the blade sign and the pip cross the bloom threshold.
- Grade shader: cool shadows (.96,1,1.05) below luminance .45, warm highlights (1.04,1,.95) above .6, saturation 1.08, vignette .55, grain .022. Copy the constants, not the code.
- The card: 292 px wide, sits up and left of the pip with a curved leader from the pip to the card's nearest bottom corner. Glance is three lines (name, mono fact, voice reason). Card is name plus mono year, meta, live line with a green dot, a rule, the voice reason, a dim mono hint. The dark glass reads clearly over both the lit limestone and the red brick.
- The light vocabulary: pip is a warm point with a soft halo just above the marquee; the flare is one long horizontal streak; the head rides the leader. Pip, flare and leader are not depth tested in the reference (the build must depth test).
- Expanded (t 10.5 to 13): the reference docks it bottom-left and blurs plus dims the world. Both are wrong per the docs; the build grows it in place from the card and never touches the world.
- Recede (t 17): whole HUD blurs 3 px, dims, drops 14 px; WALK 5 in green mono on the pavement stays sharp; Held glyph bottom-left. Return at 19.6 with "Held that while you crossed" arriving last in voice yellow on the card.
- Walking rules: focus zone shown as a dashed red outline (reviewer chrome); pace readout bottom-right in mono caps; pocket pane bottom-left above the held glyph; whisper line bottom-center with the interpunct in voice; WAIT 14 countdown on the pavement; the truck beat drops the card to a dimmed pip that the truck should occlude (the reference draws it through the truck; the build must not).
- Backdrop scene: the deli card on the lit east façade at Stopped reads with deeper glass and heavier type; the reference's luminance is a per-material constant, the build samples albedo times sunlit.
- What the reference lacks and the build must exceed: façades are flat procedural textures on boxes, every lot is a box with the same storefront band, people are capsules, cars are rounded boxes that pass through each other, trees are leaf cards. The bar in CLAUDE.md is above the reference for the world; the reference is the floor for lighting and the exact spec for the glass.

## Blocked

(nothing)

## Reviews

One entry per phase check: what you compared, what differed from the reference or the docs, what you fixed.

### Phase 0 · 2026-10-20
- pnpm workspace with apps/web and the six packages: yes, packages export TypeScript source and are consumed by Vite, Vitest and tsx directly.
- Lint, format, Vitest, Playwright `pnpm shot` and `pnpm shots`: yes. Both scripts start a Vite server themselves when nothing is listening, wait for `window.__done`, and drive `window.__stepTo` for multi-frame runs.
- Fonts vendored as OFL woff2 with license texts, LICENSES.md started: yes.
- places.json and the three scenario files load through a validator into typed data; a test checks every scripted id resolves: yes.
- Black page with the title plate in Instrument Sans: yes, screenshot checked.
- Check: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm shot` all green.

### Phase 7 · 2026-10-20
- `pnpm build` clean (typecheck, evals 39/39, Vite): yes.
- `apps/web/dist` runs from a static file server: yes, served by `python3 -m http.server` from a `/lumen/` subdirectory, title to walk to inspector with no console errors (the build now uses relative paths, and the loader no longer asks for four AO maps that never existed, which the dev server had been masking).
- Final STATUS entry: yes, above.

### Phase 6 · 2026-10-20
- Visual pass on every scripted beat, each beside fresh reference frames (hero, walking-rules scenes, the study's title and arrival). Fixed because of it: the delivery truck filled the whole frame for three seconds (moved to the inner northbound lane, it still passes between the wearer and the marquee); the M4 bus read as a dark slab up close (lit interior with seats, poles, passengers and pillars, a door, lamps, a side sign); an awning showed its lettering mirrored from underneath; a 96 m background tower stood across the cross street east of the corner and was the "blank brick wall" in the Errands corner beat (towers now avoid streets and lots); exposed party walls got period ghost signs and lot-line windows; every shop showed the same bookshelves (interiors now follow the place: counter and menu board, goods, or a lobby with posters); sunlit crosswalk paint bloomed (paint calibrated to 0.58); pedestrians jammed at the park corner because the walkable clamp pinned them at n 84.4 (fixed, plus a wall slide; stalled walker-seconds now 2 to 3 percent); the Just walking end looked at a bare lawn with its glance off view (Pocket Park anchor moved over the park, three trees planted, the last metre turns to face it); the WALK countdown fell behind the wearer during the crossing and was unreadable on white paint (it travels ahead while crossing, on a dark under-glow, 30 percent larger).
- Played all three walks end to end as a stranger, twice: scripted real time on the production build (all three, to their end cards, no console errors) and live with my own input (Just walking, Hungry from the first dwell through the pocket, hold a seat, crossing and arrival; Errands with the inspector open and overrides). Fixed because of it: live gaze almost never caught a sign, since a person looks at a shopfront and not at the point its sign hangs (now 4 degrees in yaw, generous in pitch, lit things to 70 m); a pane pinned to one edge stayed there after the head turned past its anchor (it now follows the anchor's side).
- Doc audit: every token, type size, padding, timing and curve in packages/overlay checked against design-system 2 to 6, and every string against copy.md. Fixed: strips now arrive with the Batch move, an anchor leaving the view fades its pane over t-quick (Edge fold) instead of a full dissolve, the inspector has its "Timeline" header.
- Legibility: the backdrop sampler read 0.09 at the darkest pane (a shaded façade behind the errands card at 0:30) and 0.90 at the brightest (sky behind the social strip at 1:12); with backdrop adaptivity primary text is at least 6.56:1 and secondary at least 4.46:1 across every pane of all three walks (the overlay tests also sweep 0 to 1 and the façade albedo extremes).
- Performance: draw calls 217 to 278 at the beats; high tier 5.9 ms per frame at pixel ratio 1.6 on the development machine (was 7.6) after replacing 4x MSAA with SMAA and 4096 shadows with 3072; fast tier 5.1 ms; the build is 17 MB (the raw asset cache had been copied into dist, 300 MB, now outside public); cold load to the first pip 4.0 s at 50 Mbit/s and 30 ms latency, 7.4 s at 20 Mbit/s. A 2021 Air is roughly a quarter of this GPU, so the high tier lands near 24 ms there and the four-second fallback to the fast tier will usually engage; I could not measure on that hardware.
- README with the one-liner, the GitHub paragraph, six screenshots, how to run, how the brain works, the walking rules table and how evals work: yes. LICENSES.md covers every texture, model and font.
- Check: pnpm eval 39/39 (869 checks), pnpm test 40, lint and build green; cold load under 6 s on a normal connection; docs updated where the build improved on them (overlay-spec 7, world-spec, brain-spec, scenarios, design-system).

### Phase 5 · 2026-10-20
- Compared the title screen against reference/lumen-study.html scene 01 (fresh screenshot): same layout, type and staging (name, mono subtitle, setting, how-to box, question, three choices, CLICK TO SKIP), over the build's own street instead of the study's.
- Title screen with the muted Just walking attract loop behind it, scenario choice, end card, "Walk again": yes. The page opens on the name plate while assets load, the street fades up behind the text, a click anywhere skips to the choice, choosing folds the text and the walk starts in about 1.5 s. The end card fades to black and reads the walk's own log ("Just walking · Held 2 things, showed 7"); "Walk again" returns to the choice over the attract loop, the other two scenarios start directly.
- The walk loop sim, brain, overlay and log with pane rects fed back for the backdrop: yes (apps/web/src/walk.ts).
- `?scenario=` and `?still=` with `__done` and `__stepTo`: yes, plus `scripted=1`, `reduced=1`, `focus=1`, `pace=1`, and a title still.
- Inspector drawer: yes. Timeline, Decisions (reason parts, cause, what the reading budget trimmed), Signals (pace, gates, crosswalk, vehicles, attention, budget meter, pocket, snooze, backdrop per pane), Overrides (gate, budget, band, mute social, snooze, focus outline, pace readout, each logged), Evals (this build's report), Export.
- Check: all three walks played end to end in real time on the production build with no console errors, each ending on its card, quality tier high throughout. The inspector scrubs the whole walk: a jump to 1:02 takes 230 ms, back to 0:20 takes 80 ms. Export round-trips: a scripted Hungry run with a budget override, exported from the browser, scores 19/19 through `pnpm eval --file`, including an exact replay of its decision log. pnpm test 40, pnpm eval 39/39, lint and build green.
- What playing it caught and I fixed: the inspector drawer stayed off screen (GSAP kept the CSS translate); the overlay's moves were driven by the global GSAP clock, which would have frozen the title, end card and drawer whenever the walk paused (the overlay now has its own detached timeline advanced from the sim clock); in live mode the view center rested on Pocket Park 87 m away and opened its card unasked (live gaze now needs something lit within 70 m or any place within 30 m); the title's mono subtitle wrapped.

### Phase 4 · 2026-10-20
- Compared against fresh reference frames (hero t 2, 5, 7, 10.5, 12, 16, 18, 21; walking-rules scenes 0 to 6). The glass, type, live line, hint, expanded rows, whisper line, held glyph, pocket pane and recede read the same; the build's leader and pip are depth-tested and bloomed with the scene, the expanded view grows in place and nothing dims or blurs the world.
- Light vocabulary through the bridge, depth-tested: yes. Pip, aura, flare and head are additive sprites, the leader a 64-point bezier, the route a soft ribbon, the column a gradient billboard, all in a scene group; the truck in Just walking hides the dropped pip.
- Panes, ground layer, toasts, held glyph (pocket count, social count, snooze countdown), pocket pane, whisper line, edge light, ask glance, safety text: yes, every component the brain emits on the three walks renders (checked frame by frame: 38 frames across the walks).
- Motion vocabulary with design-system timings and curves; sound: yes. Every number lives in packages/overlay/src/tokens.ts; GSAP runs on the sim clock. Sound is synthesized (tick, breath up, breath down) and waits for the Sound button in Phase 5.
- Placement per overlay-spec 3: yes. Speed-scaled zone with push-out over 320 ms, edge entry while moving and inward move at Stopped over 480 ms, keep-outs with lookahead, yield, step-aside with trace, drop to pip, edge collapse, edge light off view, below-anchor fallback, scale by distance.
- Input model: yes. Drag turns the head, the view center is the gaze, click without movement pinches, clicking a pane pinches it, buttons choose, right-click and Esc dismiss, Enter pinches, Space pauses, pointer events cover touch.
- Check: packages/overlay/test runs the real placement over every frame of all three walks (1,300 to 1,800 pane frames each) and finds no world pane in its band's zone and no first frame inside it; rule 5 below 20% within 200 ms and restored within 400 ms; rule 8 never above 30% over a walking pedestrian, moving vehicles act on the first frame, a truck that fills the view drops the pane to its pip; legibility at least 4.5:1 primary and 3:1 secondary from the darkest façade sample (shaded granite) to the sky. Reduced motion checked in frames (fade condense, no travel or flare). Live mode runs with no console errors. pnpm test 40, pnpm eval 39/39 (869 checks), lint and build green.
- What the frames caught and I fixed: the pip sat on the marquee (anchor raised to 6.9 m); a lamp pole filled the theater beat (moved); a street tree hid the Mega Burger pip and leader (moved) and the leader's pane end sat inside buildings (pulled to at most 6 m from the eye); interrupted dissolves left glowing seed hairlines behind; the step-aside never cleared once dropped to a pip; the route ribbon was back-face culled; the bike warning fell below the view; "No need to run" was anchored to the pole behind the wearer (now the far signal head); the arrival line was anchored to a sign out of view; the destination column flooded the frame at the door; the PCF-soft warning; interiors bloomed like pips; a pip two metres away was a flood of light.
- After the first commit of the phase, a second look caught and fixed: the bike warning was clipped and lost its arrow; the Pocket Park glance repeated its fact as its reason; passers-by jammed behind the wearer's personal space and clumped (they now steer around); the Hungry wearer arrived facing away from the door, so the arrival line was off view (the last metres now turn to the door).
- Not at the bar yet, carried to Phase 6: the M4 bus is a dark slab up close; the west corner is still busy at the end of Just walking (a stream of passers-by beside the bench); an awning shows its text mirrored from underneath; the truck fills the whole frame for three seconds in Just walking.

### Phase 3 · 2026-10-20
- Compared against reference/hero-block.html at t=1, 7, 16 (fresh screenshots from this session). Lighting family matches (sun west-north-west, warm lit east façades, cool shade, haze down the avenue, the marquee and blade reading through bloom); the build is richer in every other respect: scanned PBR façades with recessed window reveals and interior-mapped rooms behind every pane, designed storefronts and eight sign formats, cars and rigged people instead of boxes and capsules, signals that follow the cycle.
- Three.js scene from sim data with scanned materials, designed signage per roster place, rooftops (water towers, HVAC, a billboard, antennas), furniture, trees, lamps, scaffold, marquee and blade, newsstand, station stair: yes.
- Lighting and post per design-system 8: yes, with the r186 deviations written into design-system.md (PCF instead of PCF-soft, calibrated environment and albedos, a bounce light, sky clamped under the bloom threshold, bloom blur at reduced internal resolution). No depth of field anywhere.
- Rigged characters with walk cycles (14 Quaternius CC0 models, walk speed matched to stride), vehicles in lanes (7 CC0 car models baked and instanced), the bus that stops (procedural; no CC0 bus exists), the truck on cue: yes.
- Camera on rails with bob, a 180° head turn (live drag, clamped to ±90° from the body), quality tiers (auto fallback after 4 s, `?quality=` forces): yes.
- Ambient audio bed (city bed, traffic rumble, distant horns, footsteps matched to pace): built in apps/web/src/audio/ambient.ts, switched on by the Sound control in Phase 5.
- Check: six frames per route reviewed; no two adjacent lots share a style (layout data); no car overlaps another and nobody comes within 3 m (sim tests); 60 fps on the dev machine (16.7 ms frames, 7.8 ms render at pixel ratio 1.6, 182 to 232 draw calls including the shadow pass, under the 300 budget).
- What the sweeps caught and I fixed: sky and sunlit surfaces blooming (calibrated albedo, clamped sky); the r186 sky shader renamed its output so the clamp silently missed; NaN guard in the window shader; trees, the subway stair, the bus shelter and a lamp standing on the wearer's line; car baking clamping quantized vertices; merged people scaled to 3% by unskinned bounds; textured trucks tinted black; draw calls cut from 1,500 to about 200 (baked instanced cars, merged skinned people, a sign atlas, instanced signal lamps).
- Not yet at the bar, carried to the Phase 6 visual pass: exposed party walls are large blank brick (want ghost signs or lot-line windows), people are low-poly (best CC0 available; Google Drive refused the higher-quality Quaternius packs from this network), interiors could vary more, the fast tier needs measuring against a 2021 Air-class GPU budget (4.4 ms here).

### Phase 2 · 2026-10-20
- Block geometry data: yes. 12 west lots, 15 east lots, 12 cross-street lots, hand-authored; no two adjacent share a style; breaks: theater, two two-storys, two mural lots, the garage, the park. Background towers in haze. Lanes, crosswalks, stop lines, props, scaffold, parked cars.
- Entities with anchors, live data and depth payloads: yes, from data/places.json through shared placeAnchor and placeDoor.
- Wearer on rails with the pace track, stop-line deceleration, the timed crossing, threading past the conversation pair: yes.
- Traffic with IDM following and signals, pedestrians door to door, the truck, the bus that stops, the bike, the passerby: yes.
- Backdrop luminance as a sim service: yes, ray against the same colliders the renderer builds, sunlit or shaded by a shadow ray.
- WorldSnapshot at 10 Hz and `pnpm record`: yes, two seconds for all three walks; `pnpm eval` re-records first.
- Check: three walks recorded, brain runs with no errors, 39/39 eval suites (869 checks) including all three full walks against their hand-written beat-sheet expectations; budget and meter within limits on every walk. Sim tests: no vehicle overlaps another, none stops inside the intersection, no ambient person within 3 m of the camera, every crossing on WALK, every walk arrives.
- What the recorded walks caught and I fixed: snooze fired when the head pitched up to read a sign close by (rule 12 now needs no gaze target; walking-rules.md updated); a head-scan at the curb walked the Post Office card down (a scan now pauses the look-away, rule 5's intent); a pinch from the pocket was applied twice; after holding a seat the accepted bonus made the brain offer Trattoria at the light (other options for a goal with a destination go quiet); the after-gate update was blocked by the budget; time-to-path called a car 4 m away a threat; avoidance pushed people through façades.

### Phase 1 · 2026-10-20
- Types from the brain spec in packages/shared: yes, extended with what the brain needed and the spec implied (dismiss, choice, curb distance, crosswalk toWalk, the overlay's pane rects, a decision `cause`, the BrainFrame output).
- Pace, gates, candidates, score, ladder, reading budget, pocket, timing, hysteresis, log, config: yes, one module each, every number in config.ts.
- Notification behaviours and the ask glance: yes (texts, DMs, calls, social count and strip, app updates batched or followed up, curb follow-up, ask after two dwelt food glances).
- Eval harness: yes. 36 suites: 19 walking-rule cases (every rule 1 to 13 has a case and an expectation file; rules 5, 8, 9 are owned by the overlay tests for geometry), 4 gates, 7 notifications, 6 moments, plus hand-written expectations for the three full walks. Every run also passes 17 global invariants. Report in packages/evals/report/latest.json and latest.html.
- Unit tests: 17, lean: pace hysteresis, one per gate, rule-level units, the hand-written 30 s Hungry script, determinism.
- Check: the hand-written 30 s Hungry script reproduces the beat sheet to the tick (glance 2.0, fold 4.5, Mega Burger glance 14.8, card 16.4, save 22.0, walk down 31.1 and 32.3). `pnpm eval` 36/36, 743/743 checks. typecheck, lint, test green.
- What the first eval run caught and I fixed (Phase 1): a pip-to-glance promotion 0.4 s after the pip broke the 1.2 s hysteresis (fixed by settling before promotion and moving the quiet start to 0.8 s so the glance still lands at 0:02); hold episodes collapsed across levels so a snoozed glance never logged (keyed by level now); content marked presented at show time folded a live glance after 1.2 s (marked at fold time now).

## Log

- 2026-10-20 · Phase 7 done. The build is finished; see Final.
- 2026-10-20 · Phase 6 done. Decisions: the truck uses the inner northbound lane (scenarios.md updated); SMAA replaces MSAA in the high tier; ghost signs are invented period ads, no real brands; live gaze is tolerant in pitch; the countdown follows the wearer during a crossing.
- 2026-10-20 · Phase 5 done. Decisions: sound stays off until the Sound control is pressed, and stays off behind the title (the attract loop is muted); "Walk again" returns to the choice (scenarios.md) while the end card also offers the other two walks directly (copy.md); scrubbing replays from recorded input rather than caching states; `pnpm build` runs the evals first so the inspector always ships this build's report.
- 2026-10-20 · Phase 4 done. Decisions: the pointer is the gaze only over view-zone panes (they have no place in the world to turn toward); the light vocabulary keeps its hero-distance angular size when nearer; view-zone panes do not step aside; the overlay is driven by the sim clock. Conflicts noted: the Errands passerby cannot reach a card that sits above a 4 m sign (heads stay at the horizon), so the step-aside in that beat never triggers and rule 8 is shown by the truck in Just walking and by its eval case; the Just walking theater dwell frames the marquee about 60° off the walking line rather than the reference's 38°, because the beat sheet puts the wearer 13 m from it at 0:08 and moving the lot would shift every later beat. Docs updated: design-system 3 and 8, overlay-spec 7 (as built), world-spec.
- 2026-10-20 · Kit created. Nothing built yet. Start at docs/plan.md Phase 0.
- 2026-10-20 · Read every doc in plan order, opened and screenshotted both references, wrote reference notes. Starting Phase 0.
- 2026-10-20 · Phase 3 done. Decisions: CC0 people and cars from Quaternius via poly.pizza (the pipeline refuses anything not CC0); the bus is procedural; textures are JPEG from ambientCG 2K sets resized to 1024 and 512 (no KTX2 encoder available; total asset payload about 14 MB of the 30 MB budget); the sun raised to about 50°; trees, lamps and furniture hug the curb so the wearer's line stays clear.
- 2026-10-20 · Phase 2 done. Decisions: east avenue side has no parking (west curb lane parks); signal legs offset half a cycle so vehicle phases are exclusive; Post Office façade on the cross street's north building line at n = 110; the wearer eases into stop lines at 0.9 m/s²; a gaze target counts when the view is within 3.5° of the anchor or on the shop's frontage when the sign is steep; walk files are build artifacts re-recorded by `pnpm eval`. Docs updated: world-spec, scenarios (timing as built), brain-spec, walking-rules rule 12, evals.
- 2026-10-20 · Reference note corrected: in hero-block.html the sun is west-north-west, so the east façades (the wearer's side) are sunlit and the west façades (theater side) are in shade; walking-rules.html encodes the same (west luminance x .45).
- 2026-10-20 · Phase 1 done. Decisions: pips skip the band surcharge (a pip asks nothing of the reader) so the beat sheet's four pips bloom; value is calibrated around 1 with good options toward 2; a cafe is a .6 match for Hungry; content is never repeated proactively until its live data changes; the quiet start is 0.8 s; Brisk folds every pane at once (walking rules outrank the gaze-target grace); ground items are never shows; a person on the path means within 2 m of the path line and up to 12 m ahead, which is what the Just walking beat needs. All written into brain-spec.md.
- 2026-10-20 · Conflict noted: scenarios.md had Goldie's showing "3 min wait · 9 seats" in Walk; rule 2 caps a walking glance at three words and one number, so the build shows "3 min wait". Walking rules win; scenarios.md updated.
- 2026-10-20 · Copy added: card lines, short walking forms, world reasons and expanded views for all 14 places, in data/places.json and summarised in copy.md.
- 2026-10-20 · Phase 0 done. Decisions: TypeScript 6.0.3 (the newest typescript-eslint supports); Playwright drives the installed Google Chrome so WebGL runs on the Metal GPU, falling back to bundled Chromium; markdown is excluded from Prettier so the docs keep their authored form.
