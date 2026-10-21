# Development Plan · start to finish

This plan is executed by Claude Code with autonomy. There are no owner checkpoints except a total blocker. Each phase has done criteria; a phase is not done until every box is checked and the check step passes. Record progress in `STATUS.md` after every phase and whenever a decision is made that the docs did not cover.

Every phase has the same shape:

1. Refresh: the ritual in `CLAUDE.md`, plus the docs named under "Read before" for the phase.
2. Build the boxes.
3. Check: the phase's check step, with fresh reference screenshots for any visual phase.
4. Review: re-read the done criteria one by one and answer each in `STATUS.md`. Fix what fails. Only then check the box.
5. Handoff: write the Handoff section in `STATUS.md` for a session that remembers nothing, commit, compact, run the refresh ritual.

Read first, in this order: `CLAUDE.md`, `docs/brief.md`, `docs/walking-rules.md`, `docs/design-system.md`, `docs/brain-spec.md`, `docs/overlay-spec.md`, `docs/world-spec.md`, `docs/scenarios.md`, `docs/inspector-spec.md`, `docs/evals.md`, `docs/architecture.md`, `docs/copy.md`. Then open `reference/hero-block.html` and `reference/walking-rules.html` in a browser and watch each all the way through. Write what you learned as reference notes in `STATUS.md`. You will open them again before every visual check; the notes are for orientation, not a substitute.

## Model

The whole build runs on Opus 5.5 with no token budget. Take the time every phase needs; the Thoroughness section of `CLAUDE.md` applies throughout.

## Phase 0 · Scaffold

Read before: `docs/architecture.md`.

- [ ] pnpm workspace with `apps/web` (Vite + TS) and `packages/{shared,brain,sim,overlay,inspector,evals}`.
- [ ] Lint and format config; Vitest; Playwright with `pnpm shot --url --out` that loads the app in `?still=1` mode, waits for `window.__done`, and saves a PNG, plus `pnpm shots --scenario --times` that uses `window.__stepTo` to save many frames from one browser session.
- [ ] Fonts vendored as OFL files; `LICENSES.md` started.
- [ ] `data/places.json` and `data/scenarios/*.json` loaded and typed from `docs/world-spec.md` and `docs/scenarios.md`.
- [ ] `apps/web` serves a black page with the title plate and the fonts loaded.
- Check: `pnpm build`, `pnpm test`, `pnpm shot` all run.

## Phase 1 · Brain and evals

Read before: `docs/walking-rules.md`, `docs/brain-spec.md`, `docs/evals.md`, `docs/scenarios.md`, `docs/copy.md` (reason lines and banned words).

- [ ] Types from `docs/brain-spec.md` in `packages/shared`.
- [ ] Pace band, gates, candidates, score, ladder, reading budget, pocket, timing, hysteresis, log. Config with defaults.
- [ ] Notification behaviors and the ask glance.
- [ ] Eval harness, expectations for the three walks, the walking-rule cases, gates, notifications and moments per `docs/evals.md`. Report JSON and HTML.
- [ ] Unit tests: one per gate, one per walking rule, determinism (two runs equal). Lean.
- Check: a hand-written 30-second snapshot script produces the expected decisions in a test; every walking-rule eval case has an expectation file, even before the sim exists (they run against hand-written snapshots now and recorded walks later).

## Phase 2 · Sim, headless

Read before: `docs/world-spec.md`, `docs/scenarios.md`, `data/`.

- [ ] Block geometry data: lots, massing per `docs/world-spec.md` section 2, routes, the corner crosswalks and signal cycle, lanes.
- [ ] Entities from `data/places.json` with anchors, live data and depth payloads.
- [ ] Wearer on rails along each route with the pace track; stops at signals; crossing state; gaze from the camera.
- [ ] Traffic with following distance and signals; pedestrians on paths; the delivery truck; scripted people and beats from the scenario files.
- [ ] Backdrop luminance sampling as a sim service (works headless with the geometry's material albedo; the renderer is not needed).
- [ ] `WorldSnapshot` at 10 Hz; `pnpm record` drives the scripted reviewer and writes walk files.
- Check: record all three walks; the brain runs over them with no errors; all evals pass; shows per walk within budget.

## Phase 3 · World, rendered

Read before: `docs/design-system.md` section 8 and section 3, `docs/world-spec.md`. Open `reference/hero-block.html` in the browser and screenshot it at `t=1`, `t=7` and `t=16` before you start; these are what you are matching.

- [ ] Three.js scene from the sim data: façades with scanned materials, storefronts with designed signage per roster place, rooftops, street furniture, trees, lamps, the scaffolding, the marquee and blade sign for the Grace Theater, the newsstand, the station stair.
- [ ] Lighting and post exactly per `docs/design-system.md` section 8 and the reference prototype. No depth of field.
- [ ] Rigged characters with walk cycles; vehicles with lanes; the bus that stops; the truck on cue.
- [ ] Camera on rails with bob; 180° head turn; quality tiers.
- [ ] Ambient audio bed.
- Check: `pnpm shots` at six points on each route; compare against `reference/hero-block.html` for lighting and material quality; no two adjacent lots share a style; no car intersects another; nobody within 3 m of the camera outside scripted beats; 60 fps on the dev machine.

## Phase 4 · Overlay

Read before: `docs/design-system.md` sections 2 to 7 in full, `docs/overlay-spec.md`, `docs/walking-rules.md`, `docs/copy.md`. Open both references in the browser and screenshot the glance, card, expanded, recede, whisper, pocket, yield and drop-to-pip beats before you start. Re-read the relevant design-system section before each component; never type a timing or a token from memory.

- [ ] Light vocabulary objects registered into the scene through the bridge, depth-tested so a truck occludes a pip.
- [ ] Panes, ground layer, toasts, held glyph with the pocket count and the snooze countdown, the pocket pane, the whisper line, the edge light, the ask glance, safety text.
- [ ] Motion vocabulary with the exact timings and curves from the design system; sound.
- [ ] Placement per `docs/overlay-spec.md` section 3: speed-scaled focus zone, dynamic keep-outs from people and vehicles, backdrop adaptivity, yielding, edge folding, below-anchor fallback, scale by distance.
- [ ] Input model: drag, dwell ladder, pinch, dismiss, keys, touch.
- Check: a placement test suite on a fixed camera asserts the focus zone is clear in every scripted beat for its band; screenshots at glance, card, expanded, whisper, pocket, yield, drop-to-pip, recede and return for each walk match the reference's look; reduced-motion mode works.

## Phase 5 · App and inspector

Read before: `docs/scenarios.md` opening and end card, `docs/inspector-spec.md`, `docs/design-system.md` section 9, `docs/copy.md` title screen and reviewer chrome.

- [ ] Title screen per `docs/scenarios.md` opening with the muted Just walking attract loop behind it; scenario choice; "Walk again" and the end card.
- [ ] The walk loop wiring sim → brain → overlay → log, with the overlay reporting pane rects back for backdrop sampling.
- [ ] `?scenario=` and `?still=` (with `window.__done` and `window.__stepTo`) modes.
- [ ] Inspector drawer per `docs/inspector-spec.md`, reading the live log and the eval report; export.
- Check: all three walks play end to end with no console errors; the inspector scrubs a whole walk; export round-trips through the eval runner.

## Phase 6 · Polish and proof

Read before: every doc in `docs/`, again, in full. Open both references again. This is the phase where you are the stranger seeing it for the first time.

- [ ] A visual pass on every scripted beat with screenshots, each beside a fresh reference screenshot; fix anything that would make a Reality Labs designer wince, and list every fix in `STATUS.md`.
- [ ] Play all three walks end to end as a stranger, inspector open, and fix what is not the bar. Then do it again.
- [ ] A doc audit: read every token, timing, curve and copy line in the build against `docs/design-system.md` and `docs/copy.md`; fix every drift.
- [ ] Legibility pass against the brightest and darkest façades with the backdrop sampler's numbers in `STATUS.md`.
- [ ] Performance pass to the budget.
- [ ] README with the one-liner, the GitHub paragraph from `docs/brief.md`, screenshots, how to run, how the brain works, the walking rules in one table, how evals work.
- [ ] `LICENSES.md` for every asset.
- Check: evals all pass; a cold load to first pip under 6 s on a normal connection; every doc in `docs/` matches what was built (update the docs where the build improved on them, and say so in `STATUS.md`).

## Phase 7 · Ship

- [ ] `pnpm build` clean; `apps/web/dist` runs from a static file server.
- [ ] Final `STATUS.md` with what was built, what changed from the docs and why, and anything left for the owner.
- The owner pushes to GitHub and deploys. Claude Code never pushes.

## Blockers

The owner is not watching and will not answer until the build is finished. Stop and write to `STATUS.md` under "Blocked" only for: an asset license question, or a decision that cannot be undone and that the docs do not settle. Everything else: decide, note the decision in `STATUS.md`, keep going. If you stop for anything else, the owner comes back to an unfinished build, which is the worst outcome.
