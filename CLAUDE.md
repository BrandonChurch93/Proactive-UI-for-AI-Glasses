# CLAUDE.md · how to work in this repo

You are building Proactive UI for AI Glasses, a portfolio project the owner will show to engineers and designers at companies like Meta. The center of the project is `docs/walking-rules.md`. Read `docs/plan.md` and follow it phase by phase. The owner is not watching. You are the reviewer as well as the builder.

## The bar

- The world reads like a game at first glance: scanned materials, real shadows, rigged people, traffic that obeys lanes, no two lots alike, nothing that looks placeholder.
- The interface reads like the future: light that belongs to the thing it describes, dark glass with a light edge, motion that shows cause, nothing that bounces or springs, nothing in the focus zone, nothing that ever dims or blurs the world.
- The walking rules make a person on a real street feel looked after: content shrinks as they speed up, yields when they check for traffic, saves itself for the red light, steps out of the way of anything real.
- The brain is deterministic, logged and evaluated. Every decision has a reason a reviewer can read.
- Nothing ships that would make a Reality Labs designer wince. If you are unsure whether something meets this bar, it does not; fix it.

## Refresh ritual

Your memory of the docs decays with every compaction and every new session. Do not build from memory. These are rules, not suggestions:

- At the start of every session and immediately after every compaction: read `CLAUDE.md` (this file), `STATUS.md` in full, the current phase in `docs/plan.md`, and `docs/walking-rules.md`. Then write one line in `STATUS.md` under Handoff saying where you are and what is next.
- Before building or changing any pane, move, light, sound, color, type or layout: re-read the relevant section of `docs/design-system.md` and the relevant lines of `docs/copy.md`. Never type a token, a timing, a curve or a line of copy from memory.
- Before any work on the brain or the overlay's placement: re-read the rule in `docs/walking-rules.md` and its section in `docs/brain-spec.md` or `docs/overlay-spec.md`.
- Before every phase check and every visual pass: open `reference/hero-block.html` and `reference/walking-rules.html` in the browser again and screenshot the beats you are judging against. Put the reference frame and your frame side by side and say in `STATUS.md` what differs. Opening a reference in a browser is always allowed and always worth it.
- When a doc and your memory disagree, the doc is right. When a doc and the reference disagree, the doc is right. When two docs disagree, the order under Sources of truth decides, and you note the conflict in `STATUS.md`.

## Autonomy

- Work without checkpoints. Decide, note the decision in `STATUS.md`, keep going.
- Stop only for a total blocker (an asset license question, an irreversible decision the docs do not settle). Write it under "Blocked" in `STATUS.md` and move to other work if any exists. Time is not a constraint; finished and right is the only outcome.
- Use the tools you have to check your own work: run the evals, run `pnpm shots` and look at the PNGs beside fresh screenshots of the references. Do not call a phase done until its check step passes.
- Keep `STATUS.md` current: a dated entry per phase, decisions made, what changed from the docs and why, and the Handoff section always written for a session that remembers nothing.
- The owner is not available. "Should I ask the owner" is almost always answered by the docs; when it is not, decide, note it, continue. A blocker is only something that cannot be undone and that the docs leave open, or an asset license question.

## Thoroughness

There is no token budget. The owner is on a plan that lets you run around the clock, and the goal is to build this once, at a premium, and never touch it again. Spend whatever it takes to be sure.

- Re-read a doc whenever it would help, not only when the ritual requires it. Re-reading is always cheaper than a wrong guess.
- Screenshot freely: every beat, every walk, every façade, every time something visual changes. Look at them and judge them. Keep them at 1280 px wide so they stay legible.
- Open the references in the browser as often as you like. You may also read their source when you need an exact value the docs do not give (a shader constant, a sprite color); you still never import from them or extend them, because they are prototypes, not architecture.
- Play the demo yourself, end to end, as often as the plan says and more. Watching the thing is how you find what the tests cannot.
- Compact (`/compact`) at every phase boundary with a one-paragraph summary of state, for a clean context rather than for cost, then run the refresh ritual.
- Never paste logs, stack traces or file listings into `STATUS.md`. One line per decision. This is for the owner's reading, not for economy.
- When a check fails, fix the cause, not the check. When something is merely good, make it right.

## Sources of truth, in order

1. `docs/walking-rules.md` for anything about behavior while moving.
2. `docs/design-system.md` for anything visual or motion.
3. `docs/brain-spec.md`, `docs/overlay-spec.md`, `docs/world-spec.md`, `docs/scenarios.md`, `docs/inspector-spec.md`, `docs/evals.md`, `docs/architecture.md`, `docs/copy.md`.
4. `reference/hero-block.html` for the look of the world and the card in it; `reference/walking-rules.html` for the walking rules in motion; `reference/lumen-study.html` for the behavior of components neither of those shows (title screen, messages, route, arrival). References, not codebases: do not import from them. Open them in a browser as often as the refresh ritual says.
5. `docs/brief.md` for intent when the specs are silent.

When the build improves on a doc, update the doc and say so in `STATUS.md`.

## Conventions

- TypeScript, strict. pnpm workspaces. CSS modules, no Tailwind.
- Comments: almost none. Only a short comment that explains a non-obvious why someone could otherwise undo. Never narrate what code does.
- No em dashes anywhere in UI copy or docs. Use the interpunct ( · ), a period, or a new sentence.
- Tests: lean. One case per rule, negative cases, regression tests for real bugs. No duplicate cases that assert the same output through the same branch. The eval suite is the real test suite.
- Reason lines never cite the wearer's body, eyes or habits. The eval runner checks a banned-word list; keep it true.
- Nothing ever blurs, dims or defocuses the world when the overlay expands.
- No `Math.random()` and no `Date.now()` in `packages/brain`. The sim is seeded.
- No model calls, no network calls, no environment variables. This is a static site.
- Assets: CC0 only (fonts may be OFL), vendored, listed in `LICENSES.md` with source links.
- Performance budget in `docs/world-spec.md` section 7 is a requirement.

## Git

- Commit freely on the `build` branch with clear messages. Never push. The owner pushes and deploys.

## Quality checks you own

- `pnpm test`, `pnpm eval`, `pnpm build` green before any phase is marked done.
- Screenshots at the scripted beats for every walk, viewed side by side with fresh screenshots of the references, and judged against the bar above. Write the verdict in `STATUS.md`, including what you fixed because of it.
- A legibility check of every pane against the brightest and darkest façades, using the backdrop sampler.
- A console with zero errors through a full walk.
- A review pass at the end of every phase where you read the phase's done criteria again, one by one, and answer each honestly in `STATUS.md`. A box is not checked because the code exists; it is checked because you looked and it is right.
- A final review pass in Phase 6 where you play all three walks as a stranger would, with the inspector open, and fix everything that is not the bar.
