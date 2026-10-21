# STATUS

Claude Code keeps this file current. One dated entry per phase, plus any decision the docs did not cover and anything that changed from the docs and why. One line per decision. Never paste logs here.

## Handoff

Written for a session that remembers nothing. Rewrite it at the end of every phase and before every compaction.

- Phase: 0 done. Phase 1 (brain and evals) next.
- Next step: Phase 1 refresh (walking-rules, brain-spec, evals, scenarios, copy), then types in packages/shared, then the brain.
- Open decisions: none.
- Last review verdict: none yet.

## Reference notes

(What you learned from reference/hero-block.html and reference/walking-rules.html. Orientation only; you still open them before every visual check.)

- Composition: camera at x 8.3 (east sidewalk), eye 1.68, yaw .34 left toward the theater, pitch .05. The marquee sits left of center at about a third of the height, the avenue recedes to a bright hazy vanishing point right of center, the east façades run off the right edge. Sky is pale blue to white haze; fog colour #bfcbd8.
- Light: sun direction (-.62,.56,-.5), so the west façades (across the street) face the sun and read warm and lit; the east row is in soft shade. Hemisphere .42, exposure .58, ACES, bloom .42/.45/1.02. Only the marquee bulbs, the blade sign and the pip cross the bloom threshold.
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

## Log

- 2026-10-20 · Kit created. Nothing built yet. Start at docs/plan.md Phase 0.
- 2026-10-20 · Read every doc in plan order, opened and screenshotted both references, wrote reference notes. Starting Phase 0.
- 2026-10-20 · Phase 0 done. Decisions: TypeScript 6.0.3 (the newest typescript-eslint supports); Playwright drives the installed Google Chrome so WebGL runs on the Metal GPU, falling back to bundled Chromium; markdown is excluded from Prettier so the docs keep their authored form.
