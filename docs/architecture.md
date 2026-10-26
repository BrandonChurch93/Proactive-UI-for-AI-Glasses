# Architecture

## Stack

- TypeScript everywhere, strict. pnpm workspaces.
- Three.js (r160 or newer) for the world and the light vocabulary. GSAP for all overlay motion. Plain DOM and CSS for panes (CSS modules, no Tailwind).
- Vite for the app. A static site: no server, no API, no key. Hosts anywhere that serves files (Vercel, GitHub Pages, Netlify).
- Vitest for unit tests. The eval harness is a Node script.
- Playwright for screenshot checks during the build (Claude Code uses it to look at its own work).
- Assets: glTF characters and props from CC0 packs, KTX2 textures, all vendored into `apps/web/public/assets` with a `LICENSES.md`.

## Packages

```
apps/
  web/                    the demo: title screen, scenarios, the walk, the inspector drawer, the end card
packages/
  brain/                  the decision engine (docs/brain-spec.md, docs/walking-rules.md). No DOM, no Three.
  sim/                    the world: the block, routes, traffic, people, signals, scripted beats, backdrop luminance; produces WorldSnapshot
  overlay/                the glasses layer (docs/overlay-spec.md)
  inspector/              the reviewer drawer (docs/inspector-spec.md)
  evals/                  scenarios, expectations, runner, report (docs/evals.md)
  shared/                 types, config, the clock, vector helpers, and the DOM-free placement state (Placement, Aside, keep-out geometry, motion timings) that the overlay and the headless recorder both run
data/
  places.json             the roster with live data and depth payloads
  scenarios/*.json        timed beats and the pace track per walk
docs/                     everything in this folder
reference/                the approved prototypes; look, do not extend
```

Dependency direction: `apps/web → overlay, inspector, sim, brain, shared`; `overlay → shared` (and a scene bridge interface, not Three types from sim); `brain → shared`; `evals → brain, sim (headless), shared`. The brain never imports sim or overlay.

## The loop

```
sim.tick(dt) → WorldSnapshot            (includes backdrop luminance per visible pane)
brain.tick(snapshot) → Decision[]       (10 Hz, deterministic)
sim.plan(frame.goal)                    (the brain's destination; the sim routes to it)
overlay.apply(decisions, t)             (every frame; placement, walking-rule geometry, motion)
log.append(snapshot, decisions)
inspector.observe(log)
```

The overlay reports back which panes are visible and where, through the bridge, so the sim can sample the backdrop behind them and the brain can reason about the focus zone. That round trip is one frame late and that is fine. The plan is the other round trip: the brain decides where the wearer is going (an intent, a chosen place, the next errand) and the sim's router walks there, one tick later, without the brain knowing any geometry.

## Determinism

The sim is seeded. The clock is the sim's, never wall time. Scripted beats are data. GSAP is driven from the sim clock in `?still=` mode (`gsap.ticker.remove(gsap.updateRoot)` then `gsap.updateRoot(t)` per step) so a frame at `t` is the same frame every time. Given a recording and a seed, the walk, the log and the evals are identical run to run; that is what makes scrubbing and replay in the inspector possible.

## Modes

- `?scenario=hungry|errands|walking` skips the title screen to a walk.
- `pnpm record --scenario hungry` runs the sim and brain in Node with no renderer, fixed dt, driving the scripted reviewer from the scenario file, and writes the walk file for evals. There is no browser record mode.
- `?still=1&scenario=hungry&t=42` renders one frame at a walk time for screenshots, sets `window.__done = true` when the frame is drawn, and exposes `window.__stepTo(t)` so one browser session can render many frames. In still mode the scripted reviewer drives input.
- `?quality=fast|high` forces the quality tier.
- As built, also: `&scripted=1` plays a walk with the scripted reviewer in real time; `&reduced=1` forces reduced motion; `&focus=1` and `&pace=1` turn on the focus-zone outline and the pace readout; `?still=1` with no scenario renders the title screen over the attract loop at `t`; `&chrome=0` hides the reviewer chrome (used for the social image); `&cam=x,y,n,yaw,pitch` places a debug camera in a still. Without a scenario the app opens on the title screen.
- As built: the overlay's GSAP moves run on their own detached timeline, advanced from the sim clock every step, so they stop when the walk pauses and replay exactly on a scrub, while the title, end card and inspector animate on wall time.

## Performance

See `docs/world-spec.md` section 7. The overlay is cheap: fewer than ten DOM panes exist at once; the light vocabulary is four sprites, one line and three DOM lights.

## Deployment

`pnpm build` writes `apps/web/dist`. The owner pushes and deploys; nothing else is needed. There is no `.env`.
