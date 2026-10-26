# Overlay Spec · the glasses layer

The overlay renders the brain's decisions. It owns placement, motion and the light vocabulary. It takes `Decision[]` and a camera; it never scores anything. Material, timings and moves are defined in `docs/design-system.md`; this document is how they are wired.

## 1. Shape

```
packages/overlay
  src/
    index.ts           mount(sceneBridge, root): Overlay
    panes/             label, glance, card, expanded, toast, strip, call, ask, reminder, followup, pocket, whisper
    ground/            route band, turn arc, destination marker, safety text
    light/             pip, aura, flare, head, leader, seed, edge light, trace
    place.ts           projection, speed-scaled focus zone, dynamic keep-outs, yielding, step-aside, hysteresis, edge folding, below-anchor fallback, scale by distance
    backdrop.ts        applies the sampled luminance to pane alpha and weight (walking rule 9)
    motion.ts          GSAP vocabulary: mark, gaze, travel, condense, dissolve, retract, open, close, recede, return, batch, yield, step aside, auto-fold, save, surface, whisper, snooze, edge fold
    sound.ts           synthesized sounds
    hud.ts             the recede container
```

Two render layers:
- **WebGL** (inside the scene, bloomed): pip, aura, flare, head, leader, destination column, route band and safety text are world geometry or sprites. They are added to the scene through a small bridge (`addLight(obj)`, `project(v3)`, `unprojectAtDepth(x,y,z)`), so the overlay package never imports the sim.
- **DOM** (above the canvas): panes, toasts, the held glyph, the ask glance, reviewer chrome. Positioned every frame from projected anchors. Panes use `backdrop-filter`; they are plain HTML and CSS so copy and layout stay editable without touching the renderer.

## 2. Input

```ts
overlay.apply(decisions: Decision[], t: number)
```

The overlay diffs against what is on screen and runs the matching move: a new `show` at label or glance → mark (if no pip yet, and only for proactive content; a label that answers a look or a settle condenses with its light) then travel and condense; `promote` → grow the same surface; `demote` that keeps a pane → shrink it; `demote` to a pip → dissolve, retract; `hold` while shown → nothing until a gate; gate on → recede; gate off → return and the held reason line; `save` → the save bloom and the glyph count; `surface` → the pocket pane; a `whisper` level → the whisper line. The overlay also reports back, through the bridge, the rect of every visible pane so the sim can sample the backdrop behind it, and it keeps a log of what the glass actually did: every pane birth, resize, move over 40 px, drop, hide, edge fold, step-aside and death, with its cause and rect, keyed by sim time. The walk stores the log beside the brain frames, exports it, and the inspector interleaves it with the brain's decisions.

Moves are queued per anchor so two decisions on the same object never fight. Recede interrupts anything.

## 3. Placement, per frame

1. Project the anchor. A pane whose anchor leaves the view folds at once (Edge fold); a light whose anchor is behind the camera or off-screen for more than 250 ms shows as the edge light, clamped to the nearest edge at the anchor's height. Skip the rest.
2. Scale: `clamp(22 / distance, .7, 1)`, times the viewport scale (design-system 5, Screen scale: 0.74 to 1.9), never below 1, so the smallest pane text (12 px at scale 1) never draws smaller at any size or distance: full size at 22 m and nearer, 0.7 at 31 m and beyond on screens large enough for that to stay above 12 px. The scale is chosen with the configuration and kept with it: a move never changes it, and inside the 1.2 s hysteresis a re-chosen configuration keeps the current scale too (no shrinking toward 0.74, a lift at the same scale), so a pane changes scale at most once per 2.5 s.
3. Positions, in order: beside the light on the side away from the view center, the pane's near edge 24 px from the light and rising from it, the light 85 % of the way down the pane's height so a tall view clears the sign the light sits on; then centered above the light, its bottom edge 22 px above it; then centered below. Each is tried at its scale and then shrunk toward 0.74. A position fits only if keeping it in the view moves it 24 px or less; otherwise the pane folds (step 9). The pane on the thing being looked at ignores the focus zone. Any other pane must also clear the zone; if none of the three does, it may be pushed just outside the zone only while it stays within its own width of its light, and that pushed spot then moves with the store; otherwise it waits as its light (`hiddenBy: room`) until there is room or it is looked at.
4. Reject positions over the view-edge panes (the Errands card, messages, the call) and the reviewer chrome (Sound, Pause, `I · INSPECTOR`, the pace readout, the held glyph), each padded 8 px, over the roadway, over the projected bounds of every vehicle (moving or stopped in traffic) and person between the eye and the pane's anchor, the path band, and face bounds. If no position clears the roadway, the pane sits centered above its light with its bottom at the roadway's top edge. Keep-outs are recomputed every frame; an overlap with a person or vehicle that lasts 120 ms (a face or a moving vehicle at once) triggers the step-aside move (walking rule 8). The roadway only rejects positions; it never triggers a step-aside.
   - A mover's keep-out is its box projected with every edge clipped at a 0.3 m near plane, its silhouette clipped to the view, then capped at 60% of the view in each dimension, trimmed from the side that runs off the view. It counts for a pane only when its nearest point is nearer than that pane's anchor.
   - The roadway is the road surface between the curbs (the avenue and the cross street) from 2 m to 60 m ahead of the eye, cut at 48% of the view height so the far street near the horizon never blocks the sky above a far store, and split into four horizontal bands that follow its perspective.
5. Yielding: within 8 m of a curb, a head turn faster than 0.8 rad/s toward a pane's side runs the yield move. A yielding pane's rect is frozen where it was when the yield began; it stays yielded until the scan ends (the head is back within 0.3 rad of where the scan began, or the look settles on a different place), and then placement resumes with a 320 ms ease from the frozen spot (walking rule 5).
6. Backdrop: apply the sampled luminance from the snapshot to the pane's fill alpha and weight (walking rule 9).
7. Hysteresis: a placed position is kept while it stays valid. The corner the pane grows from follows its light with a 4 px dead band on reprojection jitter; a change of more than 80 px in where the pane sits relative to its light animates over 320 ms, and so does a re-placement, unless the path would cross the focus zone for a pane that is not looked at. During a head scan at the curb (rule 5) nothing is re-placed: a pane stays with its store, and one that has ended up somewhere it could not normally be yields to 15% with the scan.
8. Edge collapse, for panes not looked at (including the one the look has just left): card within 8% of the edge → label; label within 4% → it folds. A new pane is born at its placed position with the condense move (walking rule 4).
9. Fold before the cut: a pane folds over `t-quick` when keeping it in the view would move it more than 24 px, when any part of it would lie outside the view, when it would cover the reviewer chrome, or when its anchor leaves the view. The fold fades the pane where it stands (it no longer follows its anchor); the edge light shows only when the anchor itself is off the view. A folded pane stays folded until it fits again 40 px clear of every view edge; a pane the look has just left stays folded. No pane is ever drawn partly outside the view above 20% opacity.

The expanded view grows in place from the card's position and is placed by the same rules with a larger box. It never docks to a screen edge and never changes the world.

## 4. Input model (sim side, but the overlay consumes it)

- Drag turns the head; the center of the view is the gaze point. A full 180°.
- Dwell: 250 ms on a place lights its label, and 0.5 s more of hold grows it into the card (walking rule 10). The brain receives `gaze.dwellMs` and `gaze.settled`; the overlay only shows the tell: aura and flare. Panes are placed in priority order each frame (the place under the center, then cards, then labels nearest first), and each pane placed is a hard rect, padded 6 px, for the ones after it, so labels never overlap; a label with no room waits as its light. A hidden pane keeps its measured size for placement, so it does not flicker between fitting and not.
- Pinch: a click with under 4 px of movement skips the wait on the gazed item or picks a choice; clicking a pane directly also works. Tap on touch. While the band is Walk or Brisk a pinch saves to the pocket instead.
- Snooze: looking up past 0.55 rad at nothing for 2 s, the head held still for the last second; the glyph reads "Snoozing" meanwhile. Looking up again the same way cancels.
- Dismiss: right-click, Esc, or looking away for 1.2 s per level.
- Keys: Enter expand, Esc dismiss, I inspector, Space pause.

## 5. Ground layer

- Route band: 0.46 m wide, additive, fades to zero 25 m ahead; drawn as quads in the scene so it sits on the pavement and takes perspective. Draws on from the feet over 1.2 s `power2.out`.
- Turn arc at the corner, 2.4 m radius.
- Destination column: 26 m tall gradient at the door, settles to a pip on arrival over 1.2 s.
- Safety text: WALK · WAIT countdown and BIKE · Ns as a world-space plane at the curb line in Martian Mono, tone by state. The pavement is the only place safety lives.
- During a gate the route dims to 40% and stays.

## 6. Accessibility and legibility

- Every pane passes 4.5:1 for primary text and 3:1 for secondary against the darkest and brightest façades on the block, with backdrop adaptivity applied (test both, and record the sampler's luminance in the test).
- `prefers-reduced-motion`: travel and flare are skipped, condense becomes a 200 ms fade, recede, return and yield keep their timing (they are safety).
- Focus is visible on any interactive element; the whole demo is keyboard operable.

## 7. As built

- Gaze: the view center is the gaze point. In live play a place counts as looked at when the view center falls on its shopfront (from about a metre above the pavement to just above the sign) or within 70 px of its light (120 px to keep it). Any place within 35 m can be looked at, and any place whose light is lit (a dot or a label) within 70 m; the brain gives a place beyond 30 m a compact card, and the full card arrives in place as the wearer closes in. Once a place is looked at, the view keeps following it as the wearer walks (smooth pursuit, as eyes do) until the reviewer drags; the follow starts only when the head has settled on the place for 300 ms and no other place is challenging it, it never turns the head past 90° from the walking direction, and while it runs the gaze cannot move to another place without a drag. The scripted reviewer aims exactly and uses the sim's 3.5° cone. Over a view-zone pane (a toast, the pocket's rows) the pointer is the gaze, since those panes have no place in the world to turn toward.
- Placement is the shared solver in `packages/shared/src/placement.ts` and `placement-state.ts`, run by the overlay and by the headless recorder alike. Hysteresis keeps a pane's position, alignment and shrink until it stops being valid (it leaves the view, it would sit over the roadway, or for a pane not looked at, it enters the focus zone).
- Keep-outs carry a 0.45 s lookahead along each mover's velocity. A face or a moving vehicle acts on the first frame; a body after 120 ms. The live overlay and the headless recorder build keep-outs with the same code (`keepOuts` in `packages/sim/src/headless.ts`, geometry in `packages/shared/src/keepout.ts`) and place panes with the same `Placement` and `Aside` (`packages/shared/src/placement-state.ts`), so recorded walks carry the rects the glasses would show. A pane that cannot slide clear (a truck filling the view) dissolves to its pip at 45% and condenses again 300 ms after the way is clear. View-zone panes are exempt from stepping aside: they live at the edges by design and have no pip to fall back to.
- Each dissolve runs on its own timeline so a newer move on the same anchor never strands a half-dissolved pane.
- Strips (app updates) arrive with the Batch move rather than a condense, and an anchor leaving the view fades its pane over t-quick (Edge fold) rather than dissolving it.
- View edge: the call sits at the top right, 56 px down so it clears the Sound and Pause controls; messages, the Errands card and the ask glance stack down the right edge from 20% of the view height, or below the call when it reaches further.
- Ground: the route band is a soft-edged ribbon (0.46 m with a 0.14 m core) that draws on from the feet; the safety text lies on the crosswalk 1.9 m past the curb along the crossing, reading in the crossing direction, and during the crossing it travels 5.5 m ahead of the wearer so the countdown stays in view through the recede, never closer than 1.2 m to the far curb so it never lands on the sidewalk; it sits on a soft dark under-glow so it reads on white paint as well as asphalt; the bike warning lies 5.5 m ahead of the wearer (nearer than that it falls below the bottom of the view at eye height) and takes the countdown's place while it shows; the destination column fades as the wearer comes within 14 m of the door and settles to a pip 2.6 m above the door.
- The arrival line is anchored at the door at head height (`door:<id>`), not the sign, so it is in view when the wearer is at the door.
- GSAP is driven by the sim clock (`gsap.updateRoot`), so stills, pauses and seeks show exactly the frame the timing implies.
- Viewport scale and step-down: see design-system 5 (as built). Placement passes the scale into the shared solver, so the focus zone, keep-outs and edge rules are unchanged at every size.
- Touch: drag turns the head, a tap pinches, a long-press (550 ms without moving) dismisses, and a Pause control sits beside Sound. A phone held upright pauses behind the rotate prompt and resumes when turned.
- Accessibility: whatever condenses onto the glass is also announced to a screen reader through a polite live region; the canvas is labelled; opening the inspector moves focus into it and closing returns it.
- Stability: a change of level that comes only from placement (near the screen edge, off view, not enough room) must hold for 800 ms before it happens, and never happens while the pane is yielding to a head scan. Without this, dragging the view or a head scan flipped a pane between card, glance and edge several times a second, and each flip restarted the reveal so the pane never appeared. Level changes the brain decides, and the drop to a pip for a vehicle, stay immediate.
- One surface: each item has one pane element from birth to death. A level change (from the brain, an edge collapse or a step-down) or a change in the content's structure measures the new content off-screen and morphs the same element (design-system 4, Grow and Shrink). Placement holds the corner the pane grows from, not its top-left, so the rope's 4 px dead band and a re-placement's 320 ms move act on that corner and a resize never moves it. The one exception is a resize that no longer fits its place (an expanded view with no room above): it takes its new place at once, as it did before.
- Leader: a two-point line from the pip to the nearest point of the pane edge nearest the pip (8 px in from its corners), recomputed every frame, so beside a pane the line stays level and short. Its pane end is placed in the scene at most 6 m from the eye on the ray through that point, so the line is straight on screen, depth-tested and bloomed.
- Live gaze picks, in order: the shopfront whose projected outline contains the center of the view, if that outline is at least 36 px wide and faces the view within 75° (a frontage seen nearly edge-on is a sliver that would cover the vanishing direction, so it does not count); else the place whose light is within 70 px of the center; else, for a place with no frontage (the Post Office, the station stair), the nearest within 3°. Commitment: a new place must win for 250 ms in a row before it replaces the current one (from nothing it is immediate); the current one is let go only after 400 ms outside its keep bounds; and in the sim, a place that comes back within 600 ms of being lost keeps the dwell it had. A place lights only after 250 ms of gaze, so sweeping the view across a row of shops lights nothing.
- Visibility: `report()` lists every item the overlay holds, pips included, with `visible` and `hiddenBy` (`keepout` after a drop, `edge` when the anchor is off view, `offscreen` when it is behind the eye, `room` when the pane cannot be placed). The pane on the thing being looked at never edge-collapses and never steps down a level: away from the edge it shrinks to 0.74 and lifts above its anchor, near the edge it folds (step 9), and it reports `room` only if neither works. A pane that is hidden (dropped, folded to the edge, no room) keeps its element and condenses back in place; the overlay log calls that a `return`, so a pane is born once per life.
- Step aside slides a pane at most its own width. It prefers up or down, because people and vehicles cross the view sideways, and it never slides the way the mover is travelling (each keep-out carries its on-screen speed from the lookahead), so a pane is never chased across the view. Once a direction is chosen it is kept while it still clears. A mover that would need a longer slide, or that can only be cleared along its own path, leaves the pane dimmed in place; the pane drops to its light only after the mover has covered more than 60% of it for 300 ms.
