# Overlay Spec · the glasses layer

The overlay renders the brain's decisions. It owns placement, motion and the light vocabulary. It takes `Decision[]` and a camera; it never scores anything. Material, timings and moves are defined in `docs/design-system.md`; this document is how they are wired.

## 1. Shape

```
packages/overlay
  src/
    index.ts           mount(sceneBridge, root): Overlay
    panes/             glance, card, expanded, toast, strip, call, ask, reminder, followup, pocket, whisper
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

The overlay diffs against what is on screen and runs the matching move: a new `show` at glance → mark (if no pip yet) then travel and condense; `promote` → dissolve, travel, condense; `demote` → dissolve, retract; `hold` while shown → nothing until a gate; gate on → recede; gate off → return and the held reason line; `save` → the save bloom and the glyph count; `surface` → the pocket pane; a `whisper` level → the whisper line. The overlay also reports back, through the bridge, the rect of every visible pane so the sim can sample the backdrop behind it.

Moves are queued per anchor so two decisions on the same object never fight. Recede interrupts anything.

## 3. Placement, per frame

1. Project the anchor. If behind the camera or off-screen for more than 250 ms, fold to the edge light (clamped to the nearest edge at the anchor's height) and skip the rest.
2. Scale: `clamp(30 / distance, .92, 1.2)`.
3. Offset up and toward the nearer screen edge; the leader meets the pane's bottom corner nearest the anchor. If the pane would leave the top of the view, place it below the anchor instead.
4. Reject positions inside the focus zone for the current band (walking rule 1), the roadway projection, the projected bounds of every vehicle and person, the path band, and face bounds; try side, then above, then below; fall back to glance, then pip. Keep-outs are recomputed every frame; an overlap that lasts 120 ms triggers the step-aside move, and if the pane cannot clear it drops to a pip (walking rule 8).
5. Yielding: within 8 m of a curb, a head turn faster than 0.8 rad/s toward a pane's side runs the yield move; the return runs when the turn stops (walking rule 5).
6. Backdrop: apply the sampled luminance from the snapshot to the pane's fill alpha and weight (walking rule 9).
7. Hysteresis 1.2 s on a placed position; a 4 px dead band on reprojection jitter.
8. Edge collapse: card within 8% of the edge → glance; glance within 4% → pip. New content while moving enters at the edge and moves inward only at Stopped (walking rule 4).

The expanded view grows in place from the card's position and is placed by the same rules with a larger box. It never docks to a screen edge and never changes the world.

## 4. Input model (sim side, but the overlay consumes it)

- Drag turns the head; the center of the view is the gaze point. A full 180°.
- Dwell: a pip within 28 px of the gaze point for 800 ms promotes it, and continued dwell keeps climbing per the dwell ladder (walking rule 10). The brain receives `gaze.dwellMs`; the overlay only shows the tell: aura and flare.
- Pinch: a click with under 4 px of movement skips the wait on the gazed item or picks a choice; clicking a pane directly also works. Tap on touch. While the band is Walk or Brisk a pinch saves to the pocket instead.
- Snooze: looking up past 0.35 rad for 1 s. Looking up again cancels.
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

- Gaze: the view center is the gaze point. In live play a place counts as looked at when the view is within 4° of its anchor in yaw (7° to keep it) and anywhere from a little below to well above it in pitch, because people look at a shopfront, not at the exact point its sign hangs; things already lit count out to 70 m, anything else within 30 m. The scripted reviewer aims exactly and uses the sim's 3.5° cone. Over a view-zone pane (a toast, the pocket's rows) the pointer is the gaze, since those panes have no place in the world to turn toward.
- A pane pinned to the edge while moving switches edges, over 320 ms, when its anchor crosses to the other side of the view (past 40% or 60% of the width).
- Placement is the shared solver in `packages/shared/src/placement.ts`. Hysteresis keeps a pane's side, height and shrink until its configuration stops being valid (it leaves the view or the focus zone covers it), and a 4 px rope dead band follows the anchor without stepping. Content that enters at the edge while moving stays pinned to that edge, following the anchor's height, and moves inward over 480 ms when the band reaches Stopped.
- Because the gaze target is centered and the focus zone keeps the middle third clear, a card on the thing being looked at always sits just outside the zone, a few hundred pixels from its pip, joined by the leader.
- Keep-outs carry a 0.45 s lookahead along each mover's velocity. A face or a moving vehicle acts on the first frame; a body after 120 ms. A pane that cannot slide clear (a truck filling the view) dissolves to its pip at 45% and condenses again 300 ms after the way is clear. View-zone panes are exempt from stepping aside: they live at the edges by design and have no pip to fall back to.
- Each dissolve runs on its own timeline so a newer move on the same anchor never strands a half-dissolved pane.
- Strips (app updates) arrive with the Batch move rather than a condense, and an anchor leaving the view fades its pane over t-quick (Edge fold) rather than dissolving it.
- Ground: the route band is a soft-edged ribbon (0.46 m with a 0.14 m core) that draws on from the feet; the safety text lies on the crosswalk 1.9 m past the curb along the crossing, reading in the crossing direction, and during the crossing it travels 5.5 m ahead of the wearer so the countdown stays in view through the recede; it sits on a soft dark under-glow so it reads on white paint as well as asphalt; the bike warning lies 5.5 m ahead of the wearer (nearer than that it falls below the bottom of the view at eye height); the destination column fades as the wearer comes within 14 m of the door and settles to a pip 2.6 m above the door.
- The arrival line is anchored at the door at head height (`door:<id>`), not the sign, so it is in view when the wearer is at the door.
- GSAP is driven by the sim clock (`gsap.updateRoot`), so stills, pauses and seeks show exactly the frame the timing implies.
- Viewport scale and step-down: see design-system 5 (as built). Placement passes the scale into the shared solver, so the focus zone, keep-outs and edge rules are unchanged at every size.
- Touch: drag turns the head, a tap pinches, a long-press (550 ms without moving) dismisses, and a Pause control sits beside Sound. A phone held upright pauses behind the rotate prompt and resumes when turned.
- Accessibility: whatever condenses onto the glass is also announced to a screen reader through a polite live region; the canvas is labelled; opening the inspector moves focus into it and closing returns it.
