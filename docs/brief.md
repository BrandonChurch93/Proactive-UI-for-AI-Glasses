# Brief · Proactive UI for AI Glasses

*A UX study in when an assistant should speak, and when it should stay quiet.*

## What it became

By 2026-11-03 the demo is one city block that loops, seen through the glasses at game quality, with two walks: Explore, where the wearer wanders and looks, and Lunch, which opens the menu on Food. A viewfinder at the center of the view stands in for eye tracking: whatever it rests on is drawn slowly into it, a label grows to its card and the card to its expanded view while the look holds, at any pace short of brisk, and looking away shrinks it again a second later. FIND A PLACE at the bottom right chooses a destination and walks there, with a map tile on the way; texts arrive as banners and a reply can change the walk; at the door the place's expanded view offers one choice; what was saved waits in the pocket for a red light; an end panel sums up the session; the inspector shows every decision with its reason. Errands, the call, the Watch mode and sound were cut along the way. The rest of this brief is the intent it started from.

## What we are building

A browser demo of a near-future pair of AI glasses on a city walk, where a deterministic brain decides what to show, how much, when, and when to go quiet. The overlay is the product. The street is the stage. The inspector is the proof.

- One hero block plus a cross street, rendered in real time at game quality. Three walks of about ninety seconds across it.
- The wearer walks on rails. The reviewer controls where the wearer looks, not where they go.
- Three scenarios chosen in-world at the start: Hungry, Errands, Just walking. Each has a route, a destination, and an end. Nothing loops.
- Display is near-future, full field of view. Content anchors to the world, not to a corner HUD.
- The brain is a rules policy, not a model. No LLM, no API, no key. Same inputs, same decisions, every run. That is what makes the inspector's replay and the eval suite honest.
- The center of the project is the walking rules (`docs/walking-rules.md`): how an interface behaves for a person who is moving, scanning for traffic, carrying things, and who cannot afford to read. Pace bands, a speed-scaled focus zone, a reading budget, auto-fold, the pocket, head-scan yielding, right of way for the world, backdrop adaptivity, the whisper channel, snooze.
- Two audiences, two interfaces: the glasses view for the reviewer watching, the inspector for the engineer checking the decisions.
- Audience: recruiters and engineers at companies working on this problem. Ninety seconds should land the premise. Ten minutes should prove the system.

## Descriptions

One line: A simulated city street wired into a decision engine that chooses what to show a person wearing glasses, how much, and when to stay quiet, as they walk.

GitHub: Proactive UI for AI Glasses is a browser simulation of a near-future pair of AI glasses on a city walk. A real-time street in Three.js is wired into a deterministic decision engine that reads the wearer's pace, surroundings, attention, social context, goal and attention budget, then decides what to surface, at what level of detail, when, and when to hold back. The interface follows a set of walking rules built for a person who is moving: content scales with speed, yields to a head check at the curb, saves itself for the next red light, and gets out of the way of anything real. Every decision is logged with its reasons and replayable in an inspector, and the engine is scored against scenario evals. Built as a portfolio study in proactive interface design.

LinkedIn: Proactive UI for AI Glasses is a UX study I built to answer one question: when should an assistant that can see what you see decide to speak? It is a simulated city street wired into a decision engine that gives you context as you walk toward a goal, and that goes quiet when the world needs your attention. The interface is built around walking: it shrinks as you speed up, yields when you check for traffic, saves what you pinched for the next red light, and never covers a face or a moving car. You choose what you are doing, the glasses do the rest, and an inspector shows every decision the brain made and why. Three.js, TypeScript, GSAP, and a scenario eval suite.

## Principles

1. Quiet is the default.
2. The world is the canvas.
3. Born from the source.
4. One thing at a time.
5. Attention climbs, pinch skips.
6. Restraint is visible.
7. Never cover the path, traffic, or a face.
8. Receding is the most important animation in the system.
9. Expanding never changes the world.
10. The walker's attention is the budget.

## Detail levels

Pip (a point of light on the object) → Label (its name and a few words beside it) → Card (compact panel with a leader) → Expanded (grown in place from the card). Pips are sparse; labels answer a look, up to six at once when the view settles; one card, always the place under the center of the view; one expanded. Every level above pip carries a reason line in the log. `docs/walking-rules.md` rule 10 says how a look climbs them; the pace band says how far it may climb.

## Input model

Look (drag turns the head, full 180°), Dwell (0.8 s on a pip promotes it), Pinch (click with no drag skips the wait or chooses; in Walk or Brisk it saves to the pocket instead), Dismiss (right-click, Esc, look away 1.2 s per level). Keys: Enter, Esc, I, Space. Touch: drag and tap. This mirrors real hardware: attention selects, a gesture confirms.

## Placement

World zone, ground zone, view zone. Anchor at sign height. Offset toward the nearer edge with a leader; below the anchor when there is no room above. Focus zone scaled by pace band (33×40 stopped to 52×58 brisk, percent of view), nothing persistent inside it except the pane on the thing being looked at, and labels at Stopped or Stroll. Keep-outs: roadway, vehicles, people, path, faces; dynamic, per frame. Hysteresis 1.2 s. Edge collapse. Content whose anchor leaves the view folds to an edge light. Full rules in `docs/overlay-spec.md`.

## Safety gate and the held state

In the roadway, or a vehicle approaching the path: everything recedes in one motion; only the pavement countdown and the held glyph stay at full strength; anything that arrives is counted on the glyph; at the far curb everything returns and the reason arrives last: "Held that while you crossed." No overlay ever says "paused for your safety". Safety is painted on the ground: the crossing countdown and the bike warning are one family.

## Messages and notifications

A text from a person: glance at the next safe moment. Social: never one by one; a count on the glyph, one strip when stopped. App updates: batched under whatever is open.

## Navigation

Route painted on the pavement, fading 25 m ahead. Turn cue anchored at the corner, pane out to the side. Destination column of light settling to a pip. Reroute shown as a decision, not a result.

## Title screen and opening

Over the live street: the name, the subtitle, two lines of setting, four lines of how, "What are you up to?" with three scenario cards. Skippable. Choosing starts the walk within two seconds. "Walk again" skips to the choice.

## The block

One avenue block and one cross street, 14 named places with everyday memorable names (`docs/world-spec.md`), no symmetry between lots, sun high and fixed, traffic that obeys lanes, rigged people, street life. Small enough to be finished at game quality; big enough for three different walks.

## The inspector

Timeline scrubbing over a deterministic log, show and hold rows with reason parts, the signals live (including pace band, attention budget, the pocket), overrides, evals, export. Reviewer chrome, not glasses UI.

## Decisions on the record

- Oct 20 2026, hero review: expanding never changes the world (no depth of field, no dim, no blur; the expanded view grows in place). The head turns a full 180°. The dark glass base with the light edge and the condense motion is the final material; the transparent variant is rejected. No symmetry in the world; sun high and fixed; traffic obeys lanes; people are rigged characters.
- Oct 20 2026, scope revision: no LLM anywhere. The brain is a deterministic rules policy. The district is cut to one hero block plus a cross street so the world can be finished at game quality. The saved effort goes into the walking rules.
- Oct 20 2026, walking rules review: no hands-busy mode. The dwell ladder replaces it: attention alone climbs every level, pinch is a shortcut. The whisper channel is Brisk only.
- The reference prototypes are the look to match, not code to extend.
