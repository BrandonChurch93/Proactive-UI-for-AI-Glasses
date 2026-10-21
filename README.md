# Proactive UI for AI Glasses

*A UX study in when an assistant should speak, and when it should stay quiet.*

A simulated city street wired into a decision engine that chooses what to show a person wearing glasses, how much, and when to stay quiet, as they walk.

Proactive UI for AI Glasses is a browser simulation of a near-future pair of AI glasses on a city walk. A real-time street in Three.js is wired into a deterministic decision engine that reads the wearer's pace, surroundings, attention, social context, goal and attention budget, then decides what to surface, at what level of detail, when, and when to hold back. The interface follows a set of walking rules built for a person who is moving: content scales with speed, yields to a head check at the curb, saves itself for the next red light, and gets out of the way of anything real. Every decision is logged with its reasons and replayable in an inspector, and the engine is scored against scenario evals. Built as a portfolio study in proactive interface design.

## This repository

This is the build kit. The docs are complete; the code is built from them by Claude Code following `docs/plan.md`.

- `CLAUDE.md` · how to work in this repo: the bar, the refresh ritual, autonomy, conventions
- `docs/brief.md` · what this is and why
- `docs/walking-rules.md` · the center of the project: how the interface behaves for a person on a street
- `docs/design-system.md` · tokens, material, motion, light vocabulary, components, world art direction
- `docs/brain-spec.md` · the decision engine, deterministic
- `docs/overlay-spec.md` · the glasses layer
- `docs/world-spec.md` · the block, roster, massing, lighting, performance
- `docs/scenarios.md` · the three walks, beat by beat
- `docs/inspector-spec.md` · the reviewer's drawer
- `docs/evals.md` · the eval suite
- `docs/architecture.md` · packages, loop, modes, deployment
- `docs/copy.md` · every line of copy
- `docs/plan.md` · the phases and their done criteria
- `data/` · the roster and scenario scripts
- `reference/` · the approved prototypes (look as often as needed, do not extend)
- `prompts/start.md` · the prompt that starts the build
- `STATUS.md` · the build log

## Running (once built)

```
pnpm install
pnpm dev          # the demo
pnpm test         # lean unit tests
pnpm eval         # the scenario and walking-rule evals (the real suite)
pnpm record --scenario hungry                      # writes the walk file for evals
pnpm shot --url "http://localhost:5173/?scenario=hungry&still=1&t=22" --out shot.png
pnpm shots --scenario hungry --times 14,22,62,78   # frames for a visual check
pnpm build        # a static site in apps/web/dist
```

No keys, no environment variables, no server. The demo is a static site.

## Credits

Built by Brandon Church. Three.js, GSAP, TypeScript. Assets are CC0 (fonts OFL) and listed in `LICENSES.md`.
