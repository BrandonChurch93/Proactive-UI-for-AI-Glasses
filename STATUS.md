# STATUS

Claude Code keeps this file current. One dated entry per phase, plus any decision the docs did not cover and anything that changed from the docs and why. One line per decision. Never paste logs here.

## Handoff

Written for a session that remembers nothing. Rewrite it at the end of every phase and before every compaction.

- Phase: 2 done (sim, headless). Phase 3 (world, rendered) next.
- Next step: refresh design-system sections 8 and 3 and world-spec; screenshot reference/hero-block.html at t=1, 7, 16; vendor CC0 assets (ambientCG PBR sets, Quaternius or Kenney rigged characters and cars) into apps/web/public/assets with LICENSES.md rows; build apps/web/src/world from packages/sim (layout.ts is the lot table, Sim exposes vehicles, people, wearer, head).
- Where things are: sim in packages/sim/src (layout.ts hand-authored lots and colliders, route.ts, wearer.ts, traffic.ts IDM with signals, people.ts, reviewer.ts scripted head, backdrop.ts sampler, headless.ts placement for record, sim.ts); placement solver in packages/shared/src/placement.ts; brain in packages/brain/src (brain.ts orchestrates; ladder.ts is rule 10; reading.ts rule 2; pocket.ts rules 6 and 7); case synthesizer in packages/shared/src/synth.ts; evals in packages/evals (cases, expectations, invariants.ts, `pnpm eval`).
- Open decisions: none.
- Last review verdict: none yet.

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

- 2026-10-20 · Kit created. Nothing built yet. Start at docs/plan.md Phase 0.
- 2026-10-20 · Read every doc in plan order, opened and screenshotted both references, wrote reference notes. Starting Phase 0.
- 2026-10-20 · Phase 2 done. Decisions: east avenue side has no parking (west curb lane parks); signal legs offset half a cycle so vehicle phases are exclusive; Post Office façade on the cross street's north building line at n = 110; the wearer eases into stop lines at 0.9 m/s²; a gaze target counts when the view is within 3.5° of the anchor or on the shop's frontage when the sign is steep; walk files are build artifacts re-recorded by `pnpm eval`. Docs updated: world-spec, scenarios (timing as built), brain-spec, walking-rules rule 12, evals.
- 2026-10-20 · Reference note corrected: in hero-block.html the sun is west-north-west, so the east façades (the wearer's side) are sunlit and the west façades (theater side) are in shade; walking-rules.html encodes the same (west luminance x .45).
- 2026-10-20 · Phase 1 done. Decisions: pips skip the band surcharge (a pip asks nothing of the reader) so the beat sheet's four pips bloom; value is calibrated around 1 with good options toward 2; a cafe is a .6 match for Hungry; content is never repeated proactively until its live data changes; the quiet start is 0.8 s; Brisk folds every pane at once (walking rules outrank the gaze-target grace); ground items are never shows; a person on the path means within 2 m of the path line and up to 12 m ahead, which is what the Just walking beat needs. All written into brain-spec.md.
- 2026-10-20 · Conflict noted: scenarios.md had Goldie's showing "3 min wait · 9 seats" in Walk; rule 2 caps a walking glance at three words and one number, so the build shows "3 min wait". Walking rules win; scenarios.md updated.
- 2026-10-20 · Copy added: card lines, short walking forms, world reasons and expanded views for all 14 places, in data/places.json and summarised in copy.md.
- 2026-10-20 · Phase 0 done. Decisions: TypeScript 6.0.3 (the newest typescript-eslint supports); Playwright drives the installed Google Chrome so WebGL runs on the Metal GPU, falling back to bundled Chromium; markdown is excluded from Prettier so the docs keep their authored form.
