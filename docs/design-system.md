# Design System · Proactive UI for AI Glasses

The glasses overlay is light projected into a sunlit city. Everything here was extracted from the approved prototypes (`reference/hero-block.html` for the world and the card, `reference/walking-rules.html` for the walking rules in motion). When this document and a prototype disagree, this document wins; when this document is silent, match the prototype. Behavior while moving is in `docs/walking-rules.md`, which outranks this document on that subject.

Subtitle used everywhere the name appears: *A UX study in when an assistant should speak, and when it should stay quiet.*

## 1. Principles

1. Quiet is the default. The empty state is the normal state.
2. The world is the canvas. Content belongs to the thing it describes. The HUD holds only status.
3. Born from the source. Content grows out of a pip on the object. Motion shows cause.
4. One thing at a time. At most one card open, always the place under the center; everything else is a pip or a label.
5. Attention climbs, pinch skips. Proactive content stops at a label; a settled view labels what is in it; the wearer's look takes one place further, a pinch only skips the wait.
6. Restraint is visible. A held decision leaves a tiny mark; the reason arrives when it is safe.
7. Never cover the path, traffic, or a face. Never enter the focus zone.
8. Receding is the most important animation in the system.
9. Expanding never changes the world. No dim, no blur, no depth of field. Glasses cannot blur your eyes.
10. The walker's attention is the budget. Everything shown while moving is sized, placed and timed for a person who cannot stop to read.

## 2. Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#fbfaf6` | Primary text |
| `--ink-2` | `rgba(251,250,246,.74)` | Secondary text, facts |
| `--voice` | `#ffd98a` | The brain's own words: reasons, held glyph, ask glance, pip, light |
| `--go` | `#9ff0bd` | Walk, open, seats available |
| `--warn` | `#ffc98a` | Low seats, flashing signal, caution |
| `--stop` | `#ff8f7a` | Don't walk, bike warning, full |
| `--glass-a` | `rgba(26,32,42,.62)` | Pane fill start (160deg gradient) |
| `--glass-b` | `rgba(14,18,26,.58)` | Pane fill end |
| `--edge-hi` | `rgba(255,250,236,.9)` | Edge hairline, lit end |
| `--edge-lo` | `rgba(255,250,236,.14)` | Edge hairline, dark end |
| `--edge-warm` | `rgba(255,217,138,.6)` | Edge hairline, anchor end |
| `--rule` | `rgba(255,250,236,.16)` | Dividers inside panes |

Category is hinted by pip color only. Cards never change color by category. Semantic tones (go, warn, stop) appear only on the live line, the pavement text, and the bike warning.

### Type

| Token | Family | Use |
| --- | --- | --- |
| `--font-ui` | Instrument Sans | All words |
| `--font-mono` | Martian Mono | All live numbers, times, counts, the pavement text, the held glyph |
| `--font-sign` | Archivo Black | World signage only (marquee, blade signs). Never in the overlay |

Both overlay families are vendored as OFL font files in `apps/web/public/fonts` (listed in `LICENSES.md`) with real fallback stacks; nothing loads from the network. Tabular numerals wherever a number updates.

Scale:

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Glance name | 15.5px | 500 | 0 |
| Glance short form (Walk, Brisk) | 12px mono | 400 | .01em |
| Card name | 20px | 600 | -.005em |
| Say line (card, expanded) | 14px | 400 | 0 |
| Short line (label) | 12px mono | 400 | 0.01em |
| Card live | 12px mono | 400 | .01em |
| Reason line | 11.5px | 400 | .005em |
| Expanded name | 21px | 600 | -.01em |
| Expanded row | 13.5px | 400 (title 600) | 0 |
| Pavement text | 34px mono | 500 | .16em |
| Whisper line | 15px (number in mono) | 400 | 0 |
| Pocket header | 11.5px mono | 500 | .04em |

Minimum 12px on a label, 14px in cards for anything that must be read while walking. A say line never breaks before its interpunct: the dot ends the first line, never starts the second (a non-breaking space before it). Sizes are at the reference scale; the overlay scales with distance (see 5. Placement).

### Surfaces (the material)

Smoked glass with a light edge. Exact recipe, from the prototype:

```css
.pane {
  background: linear-gradient(160deg, rgba(26,32,42,.62), rgba(14,18,26,.58));
  backdrop-filter: blur(18px) saturate(1.4);
  border-radius: 6px;
  box-shadow: inset 0 1px 0 rgba(255,250,236,.22);
}
.pane::before {            /* edge hairline, 1px, gradient */
  background: linear-gradient(120deg, rgba(255,250,236,.9), rgba(255,250,236,.28) 32%, rgba(255,250,236,.14) 66%, rgba(255,217,138,.6));
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; padding: 1px;
}
.pane::after {             /* top light hairline, from 6% to 56% of the width */
  background: linear-gradient(90deg, rgba(255,250,236,0), rgba(255,250,236,.95), rgba(255,250,236,0)); height: 1px;
}
```

Rules:
- Radius 6px everywhere. Nothing rounder; these are planes of light, not bubbles.
- No drop shadows. Things in the air do not cast shadows on the air.
- Text carries a faint emissive edge: `text-shadow: 0 0 10px rgba(255,255,255,.18)`.
- The transparent "condensed light" variant (near-clear fill, brightness-only backdrop) is rejected. It fails legibility over light façades.
- Expanded view uses the same material at blur 20px and the same adaptive fill alpha as the card.
- Backdrop adaptivity (walking rule 9): the fill alpha and body weight follow the sampled luminance behind the pane. Bright (above .6): alpha .78, weight 500. Mid: .66, 400. Dark (below .4): .52, 400. The change tweens over 250 ms and never during a condense.

### Spacing and radius

Pane padding: label 8px 13px 9px; card 12px 15px 11px; expanded 15px 17px 14px. Internal gaps 4px, 9px, 10px. Gap from the light to the pane: 24 px beside it, 22 px above or below it, at reference scale.

## 3. The light vocabulary (rendered in the scene, bloomed)

These are WebGL objects, not DOM, so they bloom with the marquee and read as light in the world. Additive sprites, depth-tested so a vehicle between the wearer and a pip occludes it, render order above the DOM-free scene.

| Element | Form | Size (world m) | Color (linear, >1 to bloom) |
| --- | --- | --- | --- |
| Pip | Radial glow sprite | 0.7 (×1.6 when gazed) | (2.4, 2.1, 1.5) |
| Aura | Larger radial sprite | 1.8 scaled 0.5 → 2.6 on mark, 1.6 on gaze | (1.1, .95, .7) at 90% |
| Flare | Horizontal streak sprite | 5.0 wide × 0.32 tall, scaleX 1.2 → 5.5 | (2.5, 2.4, 2.1) |
| Head | Small glow sprite | 0.5 | (3, 2.8, 2.3) |
| Leader | Straight two-point line, additive, from the pip to the nearest point of the nearest pane edge, 8 px in from its corners | 1px | (2.2, 2.1, 1.9) |
| Seed | DOM hairline, 1.5px, glow 12px, at birth only | pane width | `#fff9e9` |
| Edge light | DOM bar 4×26px, glow 10px and 24px | n/a | `#fff4d6` |
| Trace | DOM dashed hairline from a pane's home to where it stepped aside | overlap width plus 20 px | `rgba(255,250,236,.5)` |

The light vocabulary is depth-tested: a truck between the wearer and a pip occludes it. A pip never draws through a thing.

As built: the sizes above hold at 24 m and beyond (the hero distance); nearer than that each sprite keeps the angular size it has at 24 m, so a pip on a shop sign two metres away is a point of light, not a flood. The pip sits 0.6 m toward the eye from its anchor so the façade it names never swallows it. The leader's pane end is placed at most 6 m from the eye on the ray through the nearest point of the pane edge nearest the pip, so the line is straight on screen, in the air in front of the street, and only its far end can be hidden by something real.

Bloom: `UnrealBloomPass(strength .42, radius .45, threshold 1.02)`. Only emissives and the light vocabulary cross the threshold; sunlit white never does. Exposure `.58` with ACES filmic.

## 4. Motion

### Timing tokens

| Token | Value | Use |
| --- | --- | --- |
| `t-snap` | 120 ms | Pip brightness, counters |
| `t-quick` | 220 ms | Fold, dissolve, batch, toast exit |
| `t-base` | 360 ms | Condense, return, toast enter |
| `t-open` | 480 ms | Expanded view |
| `t-scene` | 900 ms | Fades between scenes, the opening |
| `t-pull` | 1400 ms | The looked-at card settling into the center of the viewfinder |
| `t-drift` | 900 ms | A pane easing out of the focus, or back to its light |

### Curves

| Curve | Definition | Use |
| --- | --- | --- |
| `ease-out` | `cubic-bezier(.22, 1, .36, 1)` (GSAP `power3.out`) | Anything entering |
| `ease-in` | `cubic-bezier(.64, 0, .78, 0)` (GSAP `power2.in`) | Anything leaving |
| `ease-gate` | `cubic-bezier(.4, 0, .2, 1)` (GSAP `power1.inOut`) | Recede only. No settle |
| `ease-travel` | GSAP `power2.inOut` | The light head along the leader; a pane drifting out of the focus or back to its light |

### The moves, exactly

**Mark** (brain notices an object). The Mark voice (Sound). Pip opacity 0 → 1 and scale .2 → 1 over 500 ms ease-out. Aura opacity .8 → 0 while scaling .5 → 2.6 over 900 ms `power2.out`, starting 50 ms after the pip.

**Gaze** (wearer dwells, from 450 ms of gaze). Aura to opacity 1, scale 1.6, over 800 ms `sine.inOut`. Pip to 1.6× over the same. Flare opacity 0 → 1 and scaleX 1.2 → 5.5 over 700 ms ease-out, starting at 300 ms; flare fades out over 700 ms ease-in starting at 1100 ms. Exactly one horizontal streak, never two.

**Travel** (light leaves the pip, at birth only). Head opacity 1. Leader draws from 0 to 1 along a straight segment from the pip to the nearest point of the nearest pane edge, over 320 ms to a glance or 460 ms to a card, `power2.inOut`, the head riding the tip. Head fades over 300 ms on arrival. Breath sound halfway. After that the segment simply follows the pane's edge every frame.

**Condense** (a pane is born; it runs once per pane). The seed hairline appears at the pane's top-left at width 0 and grows to the pane's width over 300 ms `power3.out`. 180 ms in, the pane reveals from the seed downward: `clip-path: inset(0 0 100% 0) → inset(0 0 0 0)` over `t-base` (420 ms for a card) ease-out, with chromatic separation `--ca` 2.4 → 0 settling over 700 ms `power2.out` from 340 ms. Children resolve from `opacity 0, y -3px, blur 5px` to rest over `t-base`, stagger 50 ms, from 260 ms. The seed fades over 450 ms ease-in from 500 ms. A pane the wearer earned by looking condenses while its light travels rather than after it, and its children resolve with the reveal, from 180 ms, so a label reads within half a second of the look.

Chromatic separation is implemented as text shadows: `calc(var(--ca) * -1px) 0 rgba(255,96,96,.6), calc(var(--ca) * 1px) 0 rgba(96,214,255,.6)`.

**Dissolve** (a pane leaves). Children fade with 4px blur over 160 ms, stagger 20 ms. The seed reappears at the pane's top at full width. The pane clips back to the top over `t-quick` ease-in with `--ca` 1.4, starting at 80 ms. The seed shrinks to width 0 over 220 ms ease-in from 240 ms. Exits are entrances in reverse.

**Retract** (the light returns to the pip). Head on; leader 1 → 0 over 300 ms `power2.in`; head off.

**Labels** (the view settles, walking rule 10). Every label in the set is born on one timeline: each condenses with its light, no mark first, the children resolving with the reveal from 180 ms, staggered 40 ms apart from the nearest place outward. When the set fades, the labels dissolve the same way, 40 ms apart. A label the look grows is never born again; it grows in place.

**Swap** (the look moves from one label to another). The card shrinks back to its label and the new label grows to its card in the same frame, both over 420 ms ease-out, so the eye sees one exchange and no third state. A card the look simply leaves shrinks to its label over 320 ms.

**Grow** (label → card → expanded). A pane is one surface from birth to death; a level change never builds a second one. The new content is measured off-screen, then the surface's width and height tween to the new size over `t-base` (420 ms to a card) or `t-open` (480 ms to the expanded view) ease-out, growing away from the corner its leader meets: upward from its bottom edge when it sits above its pip, away from the pip when it sits beside it. That corner does not move. The outgoing children fade with the dissolve blur over 120 ms; the incoming children resolve with the condense stagger (from `opacity 0, y -3px, blur 5px`, 50 ms apart) starting at 160 ms. No seed, no travel: the leader just follows the pane's edge as it grows. Nothing happens to the world. No dim, no blur, no depth of field.

**Hold** (the pane under the center can still grow). Every pane that can still grow by a held look carries a hold rule: a 1.5 px line in `--voice` along its bottom edge, inside the glass (2 px up, inset by the radius at each end), that fills from the side its leader meets across the pane's width as the hold counts toward the next level (label to card, card to expanded), `linear`, read off the brain's mark each frame, and completes exactly when the level changes. It is empty and invisible while the pane is not being looked at (it fades over `t-snap`), and it is absent on a pane at its last level for the band and distance: a compact card, a card in Walk, an expanded view. A card with no rule is a card that is done. While the pane is hidden by something in the world, the count pauses and resumes where it was. The fill line is the whole rule: there is no caption (one was tried and appeared for a frame or two, because the count begins on the first looked-at frame). The viewfinder's corners brighten on the same count, so the two always agree; their pull-in from 160 to 132 px is the hold itself, over `t-quick` when a place is held and back when it is released.

**Shrink** (expanded or card → label, while the pane stays). Grow in reverse, ending on the smaller content, over 320 ms to a label (420 ms in a swap). A change in a pane's content structure at the same level is the same cross-fade, with a resize only if the measured size changed.

**Choose** (the wearer takes the expanded view's action). The chosen row stays where it is; the other rows and the action pair dissolve, the Dissolve children move (opacity and a 4px blur over 160 ms, `ease-in`, 20 ms apart). Then the chosen row eases from where it stood to its place at the top of the list and the pane shrinks around it, both over `t-base` `ease-out` from the corner its leader meets, while the confirmation line resolves in `--voice` where the actions were (from `opacity 0, y -3px, blur 5px` over `t-base`). The confirmation ends in a time, a number or a place, so it reads as a thing that happened. Where the rows are not each a choice they all stay and only the actions give way to the confirmation. No sound.

**Recede** (safety gate). Breath-down sound. The whole glasses layer: `filter: blur(3px) brightness(.55)`, `translateY 14px`, `scale .985`, `opacity .38`, over 280 ms ease-gate, all at once. In-scene lights fade to 20%. The held glyph slides in from the left over `t-base` at 100 ms. The pavement safety text is in a separate layer and stays razor sharp. So do the clock and the crossing line: `Overlay paused while you cross the street` (a crossing) or `Overlay paused · traffic close by` (the roadway and vehicle gates), with `· 1 held` after it while the glyph counts, at the top center 56 px from the top at scale 1 (times `--ui`), Martian Mono 11 px caps at 0.08 em, `--ink` at 70% with a 1 px dark halo at 55%. It arrives 100 ms after the gate, like the glyph, condensing over `t-base` (from `opacity 0, y -3px, blur 4px`). It is the only line the glass shows during a gate, so it never competes with the pavement, and it is not a show on the budget.

**Return** (gate clears). Reverse over 550 ms ease-out, so the return is always slower than the retreat. Held glyph and the crossing line leave over `t-quick`, before the held reason line resolves. The held item's reason line then arrives last: "Held that while you crossed", resolving from blur over `t-base`.

**Batch**. A second item tucks under the open pane as a strip, from `y -8px, blur 4px` over `t-quick`, counted, never stacked above. A second text under an open banner is the same move: the strip sits 6 px under the banner, 36 px tall, and the banner's header carries the count.

**Yield** (head scan, walking rule 5). The panes on the scanned side, except the one the look is held on, go to opacity .15 and slide 24 px outward over 180 ms `ease-gate`, and hold still where they were when the yield began: no move, no clamp, no fold while yielded. They return over 320 ms ease-out when the scan is over (the head back where it started, or the look settled on a different place), easing from the held spot to their place. In-scene lights follow the same opacity.

**Step aside** (right of way, walking rule 8). The pane dims to .3 and slides clear by the overlap width plus 20 px over 220 ms, never further than its own width, a dashed trace from its home to its new place; it returns over 320 ms ease-out. If it cannot clear, it stays dimmed where it is; when the mover covers more than 60% of it for 300 ms it dissolves to its pip at .45 (the pane the look is held on stays dimmed instead, and the pull carries it off them), and when the way is clear the same pane condenses back in its own place.

**Auto-fold** (walking rule 3). Dissolve then retract, exactly the leave moves, with no sound. Nothing waits to be dismissed while the wearer moves.

**Save** (the pocket, walking rule 6). The Mark voice. "Saved" blooms at the pip from `y +6px` over 250 ms ease-out and leaves after 600 ms. The held glyph gains its count over `t-base`.

**Surface** (the pocket, walking rule 7). The pocket pane condenses beside the held glyph with `t-open`, breath-up sound. Its header counts down with the signal.

**Whisper** (walking rule 11). One line rises 8 px into place at the bottom edge over `t-base` ease-out, stays 2.5 s, leaves over `t-quick`.

**Snooze** (walking rule 12). Everything folds with the leave moves at once; the held glyph slides in with the countdown. Cancel reverses it.

**Edge fold**. Before the edge would cut a pane, it folds: when its anchor leaves the view, when keeping it in the view would move it more than 24 px, when any part of it would fall outside the view, or when it would touch the reviewer chrome. The pane dims to 0 over `t-quick` where it stands, without following its anchor. If the anchor is off the view the edge light appears at the nearest edge at the anchor's height; otherwise the pane's own light stays. It stays folded until it fits 40 px clear of the view edges, or the 16 px margin for the pane being looked at by a wearer standing still (a pane the look has just left stays folded); the return is a condense of the same pane, in place. No pane is ever drawn partly outside the view.

Laws: nothing bounces, overshoots or springs. Stagger is 40 to 50 ms, never more than 120 ms across a pane. Recede can interrupt any move mid-flight and never waits.

### Sound

Sound was cut in Phase 28. Two rounds of designed sound were heard and judged worse than none; neither the builder nor the reviewer can judge sound by ear, a portfolio demo is mostly watched muted, and a sound that is not clearly right lowers the bar for everything on the glass. The build has no audio.

## 5. Placement

Zones:
- World zone (pips, labels, cards, expanded view): projected from 3D anchors every frame. Scale with distance: `scale = clamp(22 / distance, .7, 1)` times the screen scale, never below 1 (no pane text under 12 px): full size at 22 m and nearer, a smaller label beyond.
- Ground zone (route, turn arc, destination marker, safety text): painted on the pavement in perspective.
- View zone (held glyph, message banners at the top center, the menu and the map tile above the menu button at the bottom right, the ask glance, reviewer chrome): fixed in view, edges only.

Rules:
1. Anchor at sign height for a storefront, chest height for a person. The pane on the held place has its own rule (walking rules 1 and 10), the owner's since 2026-10-31: it is drawn into the viewfinder. The look picks the pane nearest the center, and the frame it lands pins that pane to the world: its center keeps its offset from its light exactly where it stands, drawn or riding, and nothing moves it, not a come beside the square (that rule is retired, and with it "the square is never covered" for the looked-at pane), not a growth, not the chrome. Once the look has held (250 ms) and the pane has finished appearing, its center eases from where it stands toward the center of the view while the wearer rests on it: not dragging, not turning faster than 1.5 rad/s, its light within a pane's width of the square. At a door the center may stand in the opening, where people walk in and out: the pane is drawn as near the center as standing 40 px clear of the opening's middle half allows, on the side nearer the center, so it stands over the pier or the window as the door rule below asks. Anywhere, it is drawn as near the center as covering no other pane, no face and no one moving (a walker, a moving vehicle) allows, 20 px clear of them: rule 8 gives them the way, and pulling back onto them would keep the pane dimmed; once they have passed it settles back to the center. The approach is critically damped, so it starts softly, settles in `t-pull` (1400 ms) and never passes the center; no bounce, no snap. Moving, the pane keeps its center's offset from the projected light, so it moves on the glass only as the world does: a turn leaves it behind and nothing follows the head. The leader stretches back to the light. On the square is where it belongs now: the square is not a keep-out for it, and faces, a parked car or the roadway behind it do not move it. It grows about its own center and is never moved for it: at rest the pull keeps it 20 px clear of the chrome and inside the glass, carrying it clear smoothly; not at rest the chrome acts at once by the least shift that clears it, within 56 px, and otherwise leaves it where it is. A head scan does not yield it (rule 5 is for what the wearer is not looking at), and a person or a car that comes over it dims it rather than dropping it to its light, since the pull carries it off them. An expanded view the wearer drags across, the center on it or within 80 px of it, is being read: from that drag on the pull rests, so the rows stay where the drags put them. Once the look has been gone 1 s it drifts back beside its light over `t-drift` (900 ms) `ease-travel`; carried off the glass with its light far from the square it folds where it stands. Where its placement found no room for it when the look lands, it comes back just above its light and is drawn in from there. A crossing does not move it: it recedes where it stands. Otherwise the pane sits beside its light on the side away from the center of the view, its near edge 24 px from the light and rising from it, the light 85 % of the way down the pane's height, joined by a short straight leader; when that does not fit, the same on the side toward the center; then centered above the light with its bottom 22 px above it; then centered below. A pane beside its light that would run into the glass's own chrome above it (a banner, the clock) slides down its side until it clears it by 12 px, as long as its light stays beside it, 12 px or more below its top edge. At a door the pane has its own rule: the door light stands in the opening, and the pane stands over the pier or the window beside it, never over the opening, its near edge at least 40 px outside the doorway's projected width (the opening from the pavement to 2.2 m, 1 m either side of the door point) as far as staying within 0.95 of its own width of the light allows, and never over the middle half of the opening, the leader reaching back to the light; people walking in and out are left to rule 8 rather than steering the placement. It is never placed over the roadway; with nowhere else to go it sits above its light at the roadway's top edge.
2. Focus zone: scaled by pace band (walking rule 1). Stopped: the middle 33% of the width and 40% of the height. Stroll 38 × 44. Walk 44 × 50. Brisk 52 × 58. Nothing persistent inside it except the pane on the thing being looked at, which the zone does not apply to. When the zone grows, or the look leaves a pane that sits in it, the pane drifts out over `t-drift` (900 ms) `ease-travel` if it has a place within its own width of its light, and otherwise waits as its light.
3. Keep-out: roadway, vehicles in traffic (moving or stopped), people, the wearer's path, faces; recomputed every frame from projected bounds (walking rule 8). The view-edge cards and the reviewer chrome (Sound, Pause, `I · INSPECTOR`, the pace readout, the held glyph) are hard rects too, padded 8 px. A pane that cannot clear a mover dims in place and drops to its light when mostly covered; it steps aside only to a place clear of the chrome as well. Someone standing still (within 0.3 m of one spot for 2 s, so a walker jammed in place, stepping to and fro at a doorway, counts as standing and plays the waiting pose) is scenery: a pane is placed round them once, like a parked van, and never dimmed or dropped for them; their face is still never covered. A pane moving to a new place is judged against the chrome where it lands, not on the way there.
4. Calm backdrop: façade over sky over road, never over a bright sign. (The pip may sit above a marquee, never on it: a glow on a glow is invisible.)
5. Hysteresis: once placed, a pane holds for 1.2 s unless a keep-out forces it. The pane on the thing being looked at leaves its place, for the view's edge or for want of room, only for a cause that has lasted 300 ms; an anchor leaving the view and the chrome still act at once. Scale belongs to the placement: a move never changes it, and a placement re-chosen within 2.5 s of the pane's last change of scale keeps the current scale, so a pane approached at speed steps up in size at most once every 2.5 s.
6. Edge: a card that is not being looked at collapses to its label within 8% of the edge, and a label folds within 4%; the pane on the thing being looked at never collapses, it shrinks to 0.74 or folds when it reaches the edge. A pane is never cut by the edge: it folds first (Edge fold), and returns in place when it fits again or the wearer looks back. The head turns a full 180 degrees.
7. A new pane is born at its placed position with the condense move (walking rule 4); nothing slides in from the edge.

Screen scale: sizes above are at the reference view of 1280 × 800. Every pane, the held glyph and the whisper line scale by the viewport scale `--ui` on top of the distance scale, with `s = min(w / 1280, h / 800)`: below 1 it is `clamp(1.3 × s, 0.74, 1)`, so a landscape phone runs at 0.74 and anything from a 1024 × 640 laptop up runs at 1; above 1 it is `clamp(s, 1, 1.9)`, so 1920 × 1080 runs at 1.35, 2560 × 1440 at 1.8 and 3840 × 2160 at 1.9. The same value is set on the document root and multiplies every size in the reviewer chrome, the title screen and the end screen, which scale up with it but never below their phone-tuned sizes (`max(1, --ui)`), so text the reviewer reads and buttons they tap stay legible and large enough to hit on a phone. The view-edge offsets (24 px from the right, 56 px from the top, the glyph 44 px from the bottom) scale with it too. A pane that is not being looked at and cannot be placed at its level steps down a level (expanded to card to glance) before it falls back to its light, and steps back up when there is room again; the pane on the thing being looked at shrinks to 0.74 instead and never steps down. Phones held upright get a prompt to turn sideways instead of the street; tablets work both ways.

## 6. Components

| Component | Zone | Levels | Notes |
| --- | --- | --- | --- |
| Pip | World | Pip | Light vocabulary, category tint |
| Label | World | Label | Name and the short form of what the assistant would say about it, beside its storefront, scaled by distance; in Brisk the whisper form (name and one number). Nothing else. Up to six at once, when the view settles |
| Place card | World | Card | Name, the say line, one live line (the two facts behind it; a status after its interpunct may carry a tone, the dot and that phrase in `--go`, `--warn` or `--stop`, so bad news reads as bad news: `Uptown 4 min · elevator out` in warn), the reason in Stopped and Stroll. No year, no hint (no card exists in Brisk). Beyond 30 m the compact card: the photograph, name, say line and live line only (no reason line), at the distance scale, because at distance the photograph is the fastest read there is; it becomes the full card in place within 30 m. While a lunch destination is set, any other lunch place's card (compact or full) carries one primary action, Go here instead. Every card, compact or full, carries the place's photograph as a 44 px thumbnail left of the name (radius 4 px, the `--edge-lo` hairline, cover-cropped from the hero). An image that fails to load falls back to the kind's tone dot (8 px, centered in the slot: food #e0946a, cafe #d4ac7a, theater #ef7a74, venue #c49ae6, shop #e3cc84, service #9fd3c2, transit #7fa9e6, park #9fdc9f), the only place a kind color appears inside a pane |
| Expanded view | World, in place | Expanded | Everything the front door cannot say: what is inside, what is yours, what is about to happen, what can be done from the pavement. The name, the say line, up to four rows (three where a place cannot carry four), one primary action and `Not now`, then one confirmation. On top, the place's hero photograph, a full-bleed strip 112 px tall with the pane's top radius, under a gradient into the glass (`rgba(14,18,26,0)` at 30% to `.92`); the name sits under it, never over it, and it reveals with the clip as the card grows. Each row is the same anatomy: a mono key at the left where a time, an aisle or a platform fits, the title at 600, the sub line, the value at the right in mono with its tone; a row that is a thing (a dish) carries a 34 px thumbnail in the key's place; in a list that has thumbnails, a row without one keeps the title column: its key, when it has one, must fit the 34 px slot (a time or a short code, mono 11 px), and a row with neither sits flush. A place's name never wraps on a card: when the name and the Going here badge do not fit on one line beside the thumbnail, the badge drops under the live line, right-aligned. Where the rows are each a choice (the cinema's films, the bookshop's picks, the hardware store's aisles, the café's drinks), the row under the pointer, or under the center of the view while the place is held, lifts to 7% ink as the menu's rows do and the primary action's label reads for it (`Hold two for 7:15`); a tap lifts a row on a touch screen. Exactly one row is lifted at all times: the row under the look or the pointer, else the row marked now if it is a choice, else the first choice, so the action's "it" always has a referent the eye can find (Corner Hardware opens with Picture hooks lifted, the Big Bean with the Cortado, the cinema with 8:00). While the view is open at Stopped or Stroll and the look is on it, it holds its place in the world and the head moves the center across its rows (walking rule 10); a pinch chooses the lifted row. The fourth row grows the pane with the Grow move and nothing else in its anatomy changes. Pocket Park is the one place with rows and no action: the glass asks nothing of the wearer there |
| Menu button | View, bottom right | n/a | The wearer's own chrome: a 44 px round glass (the pane glass and its light edge) with a 20 px compass glyph at 1.3 px stroke in `--ink`, 24 px from the right and the bottom at scale 1 (times `max(1, --ui)`); the mono caps words `FIND A PLACE` at 11 px `--ink-2` to its left for the whole walk, so the button says what it does (`FIND` below 900 px wide). In the sharp layer, so it is up in every band and through every gate; panes keep clear of it like the clock. A click, or the pointer resting on it 0.5 s (the viewfinder cannot reach chrome fixed to the glass, so the pointer stands in for the look as over every view-zone pane), opens the menu |
| Menu | View, right edge above the button | Card | The wearer's way to find a place and go there, the assistant's own panel: 360 px wide at scale 1, a `--voice` hairline at 35% on its top edge, the eyebrow in mono caps 11 px `--ink-2` (`TUE 12:42 · FIND A PLACE`), `Where to?` in 22 px / 600, balanced. Four category rows 52 px tall with `--edge-lo` hairlines between them, each a 20 px glyph at 1.3 px stroke in `--ink-2` (a fork and knife, a ticket, a bag, a bus, drawn inline), the label 15 px / 600 and a hint 12.5 px in `--ink-2` from the world; `Close` quiet below. A category opens its places as rows (a 34 px thumbnail of the place's photograph, the name 14 px / 600, the walk time at the right in mono `--voice`, the picker line, the live line with its dot), by walk time, the order taken when the list opens and kept while it is open so a row never moves under the pointer, the eyebrow becoming `FOOD AND DRINK · BY WALK TIME` and `Back` quiet above the rows; the row under the pointer lifts to 7% ink; a click or a pinch makes it the destination. It condenses as a card does and its rows resolve 50 ms apart. Allowed in every band but Brisk, where it folds and the button stays; folds for every gate and comes back only when asked; Esc closes it; not on the attention budget; never dims the street |
| Going here chip | In a card header | n/a | Mono 10.5 px caps in `--voice`, 1 px `--voice` border at 50%, radius 3 px; on the destination's card and expanded view only; in the header beside the name when both fit on one line, otherwise under the live line, right-aligned, so the name never wraps |
| Leader, seed | World | Label, card | Light vocabulary |
| Clock | View, top left | n/a | The day and time from the walk's clock, `Tue 12:41`: Martian Mono 11.5 px at `--ui` 1, `--ink-2`, 16 px from the left and 14 px from the top. In the sharp layer with the pavement text and the crossing line, so it stays on the glass through every gate; panes keep clear of it like the held glyph. The thread's timestamp reads from the same clock |
| Held glyph | View | Any | Rotated square, accent, optional count (held items, pocket count, social count) or the snooze countdown; the only persistent element |
| Pocket pane | View, beside the glyph | Card | "12 s · what you saved" and the saved items as rows, each with a 28 px thumbnail; a place pinched while walking reads its name and its glance, a choice the wearer settled reads what was settled (`Dune: Part Two` · `8:00 · two held`). Surfaces at a stop, never at the stop where the choice was made |
| Whisper line | View, bottom edge | Whisper | Name · one fact, 2.5 s, Brisk only |
| Edge light | View edge | Pip | Where an off-view anchor is |
| Curb follow-up | View | Glance | "Held that while you crossed. Still want it?" |
| Safety text | Ground | Glance | WALK · WAIT countdown; BIKE · 2 s with an arrow; stop tone. One line on the pavement at a time: the bike line takes the countdown's place while it shows |
| Route | Ground | Glance | Pavement band fading 25 m ahead; turn arc; stays at 40% during a gate |
| Destination marker | Ground + world | Glance | Column of light, settles to a pip at the door |
| Map tile | View, right edge above the button | Card | A 180 px square at scale 1 (times `--ui`) of the pane glass, radius 8, 24 px above the menu button. A plan of the block heading-up along the walk, like a phone's navigation, 1 px to 0.55 m with the wearer in the lower third: the roadway in `--ink` at 10%, the sidewalks at 16%, the building footprints filled at 26% with a 1 px edge at 34%, the crosswalks as white bars at 60%, the route a 2.5 px line in `--voice` from the wearer to the destination, the wearer a 6 px white dot with a 60° cone at 14% where the head looks (body plus head, relative to the plan's up), and the destination its kind's tone dot (6 px) with its name beside it in mono 10 px `--ink` (`Big Bean`, without a leading The), on whichever side fits and always inside the tile. The plan turns with the route's direction under the wearer (its tangent at the wearer's place on the route), eased over `t-base` and held while the wearer is Stopped, so a corner reads as a right angle with the turn ahead and never as a diagonal; never with the head. Up while a destination is set and for 10 s after arrival, or with no destination for a turn ahead within 20 m (the route's arc drawn), gone once the turn is made; fades out over `t-quick`. In every band but Brisk, hidden by every gate and while the menu is open, not on the attention budget, never a gaze target |
| Message banner | View, top center | Glance, card | A text looks like a text: a banner 380 px wide at scale 1, radius 20, its glass lighter than any pane (`--ink` at 14% over the pane's adaptive fill, so it keeps its contrast over sky; the light edge at 40%; blur as the panes), at the top center 20 px under the clock line, sliding down from above over `t-base` and back up over `t-quick`. First row a phone's: a 28 px rounded-square app tile in Messages green (#34c759, radius 8) with the speech bubble in white, `Messages` 13 px / 600, and `now` (then `1 min` and on, from the walk's clock) in mono `--ink-2` at the right. Second row the sender 15 px / 600 with the 22 px warm monogram at its left; the message 15 px under it; the quick replies as chips (12 px, radius 4 px, the action border) when a reply fits, at Stopped and Stroll or while the wearer looks at it. The thread's answer side keeps its bubbles inside the banner (theirs in glass at 8% with a 12% hairline, the wearer's filled in ink at .86 with dark text, radius 6 px) and the brain's offer or note under it in `--voice` with Yes and Not now. While walking, a banner not looked at folds after 4 s and comes back once the wearer has stood still half a second, at its stopped size, never as a crossing begins; hidden in Brisk. It is the only pane with a color tile and the only one at the top center. Texts and DMs both use it. One banner at a time: a second text while one is up tucks under it with the Batch move as a strip of the same glass and width, 36 px tall, the monogram, the sender at 600 and the line on one row, and the banner's time reads the count first (`2 · now`); it is never drawn over the banner and never stacked above it, and a look or a click on the strip brings it up and tucks the other under. While the wearer reads a place's expanded view, a banner they are not looking at folds up, as it does while walking, and is back once they have stood still half a second with nothing being read |
| Notification strip | View | Glance | "3 notifications · later"; social only surfaces stopped |
| Ask glance | View edge | Glance | One line, two choices; Find lunch opens the menu on Food; only in Explore, at the first stop after two food places have been looked at |
| Reminder | World | Label, card | Tied to a place when passing one |
| Title screen | View | n/a | Over the live street; not a brain component |

Reason lines cite only the wearer's goal or a fact about the world. Never the wearer's body, eyes or habits. "Short wait, on your side of the street", "On your route", "Open till 6". Gaze is an input, not something the brain narrates.

## 7. Copy voice

Plain, warm, short. The brain speaks in sentence case and never apologizes or explains itself in the roadway. No em dashes anywhere in UI copy; use the interpunct ( · ), a period, or a new sentence. Examples live in `docs/copy.md`.

## 8. World art direction (what the overlay sits in)

Target: a real-time Three.js street that a reviewer mistakes for a game at first glance.

- Camera: eye height 1.68 m on the sidewalk, 56° FOV on desktop (62 at square, 70 portrait), walk bob scaled by pace (±1.2 cm at 2.2 Hz at Walk, ±2 mm roll, none when Stopped).
- Light: sun high and slightly off-axis, early afternoon, fixed. Directional 3.6 with 4096 PCF-soft shadows, hemisphere .42, ACES exposure .58, Sky addon with turbidity 3.6, environment from the sky. Trees and poles throw clear shadows on the pavement; both façades lit; the marquee still reads.
- Fog 120 to 900 m, haze toward the vanishing point.
- Post: bloom as above, a grade pass (cool shadows, warm highlights, vignette .55, grain .022). No depth of field, ever.
- Pixel ratio capped at 1.6; MSAA 4× on the composer target.
- As built (three r186): PCF-soft shadows no longer exist in three.js, so the 4096 shadow map uses PCF with radius 2. The sky's image-based light is far brighter than the reference's, so the environment runs at intensity .26 from an unclamped copy of the sky while the visible sky is clamped below the bloom threshold (sunlit white and sky never bloom; only emissives and the light vocabulary do). A warm, shadowless bounce light (.55) from the sunlit east façades lifts the shaded west façades, which is how both façades read lit with a sun off the avenue's axis. The sun sits at about 50° elevation, west-north-west. Material albedos are calibrated to real values (concrete paving .3, limestone .4) so nothing sunlit crosses 1.02. Interior-mapped windows are clamped under the threshold as well, so a lit shop ceiling never reads as a second pip. Bloom keeps strength .42, radius .45, threshold 1.02 and runs its blur chain at 0.8 of the CSS resolution.
- Massing: no two adjacent buildings share a façade style; heights, setbacks, cornice lines and storefront widths vary per lot; breaks in the row (the theater, a garage entrance, a vacant lot with a mural, a low two-story). The two sides never rhyme.
- Façades: PBR with albedo, roughness and bump from scanned CC0 materials where they buy fidelity; procedural generation only for massing and window layout. Blinds, lit interiors, AC units, cornices, water towers.
- Signage: each roster place gets a designed storefront (its own sign format, colors, awning or blade). Background shops use five or six sign formats. Names from `docs/world-spec.md`.
- Street life: carts, scaffolding, outdoor seating, newsstands, bike dock, trash, a bus that stops, hydrants, bollards, tree pits.
- People: rigged, animated characters with real walk cycles. Nobody within 3 m of the camera.
- Traffic: lanes, following distance, signals. Cars never pass through each other or stop inside the intersection. The delivery truck is a real vehicle with the same rules, scripted to crawl the near lane on cue.

## 9. Reviewer chrome

The inspector, the `I · INSPECTOR` hint and the title bar are not glasses UI. Every size in them multiplies by `max(1, --ui)` (section 5, Screen scale). The reviewer chrome sits at the top right so the bottom right is the menu button's: `I · INSPECTOR` 14 px from the corner (on touch the Pause control takes the corner and the hint moves 112 px left of it), and the pace readout, when on, under it. There is no sound control: sound was cut (section 4).

The start screen is a panel on the left, `#0e1216` at .94 with a 1 px `#1d2228` rule on its right edge, full height. At 900 px wide and 561 px tall and up, at scale 1: 46% of the width, between 600 and 880 px (never more than 49% of the width, so the street beside it is always the larger half), 64 px side padding and 48 px top and bottom (at most 4% of the view's height); three sections (the subtitle, name and setting; "What this is"; "The walk" and its button) 48 px apart (at most 3.6% of the view's height, so a height-bound screen keeps the footer in view), centered in the space above the controls strip and the footer, which are pinned to the bottom with the same side padding. Type at scale 1: subtitle Martian Mono 11 px caps in the accent (balanced, so no word sits alone), name 64 px / 600, setting 17 px over 1.55 lines, section heads Martian Mono 13 px caps, "What this is" 14 px over 1.5 lines, 18 px apart, with 11 px mono keys in the accent in a 72 px column, "Start the walk" a full-width primary button with its label centered (17 px / 600, dark text on #f4efe2), controls 12 px with mono keys, 16 px from key to key around the dot, footer 13 px. Where the panel sits at its floor (900 to 1304 px wide) it keeps the earlier, tighter spacing: 48 px sides, 32 px top and bottom (at most 3% of the height), sections 32 px apart (at most 2.4%), lines 10 px apart, so a 1024 x 768 laptop does not scroll. There is no choice on the panel. Under the button, in the setting's type: `Explore the block. Open the menu at the bottom right to find a place and go there.` Below 900 px wide, or under 561 px tall, the panel keeps its compact layout (name 56 px, or 30 px on a short screen, items 10 px apart and centered). The street beside it is never dimmed; below 900 px wide the panel spans the view and the street behind drops to 40% brightness. It slides in from the left over `t-scene` with its text resolving top to bottom (the condense blur, 120 ms apart) and slides out over 450 ms. The gaze mark stands in for eye tracking, which real glasses would have and this demo does not: a viewfinder at the center of the view, and the viewfinder is the target. It is a rounded square 160 px across at scale 1 (times `max(1, --ui)`), drawn as four corner ticks (each 22 px long, 1.5 px stroke, radius 10) rather than an outline, so it never hides what is under it; each tick carries a dark halo, a 1 px shadow straight down at 55% with no blur, so it reads over the brightest façade. Whatever is inside the square is being looked at (the walk's gaze picks it, overlay-spec 7). Over nothing the ticks are `--ink` at 45%; once something is held, `--voice` at 70% over `t-snap`. While a place is held (the look on it 250 ms) the corners pull inward from 160 to 132 px over `t-quick` ease-out and ease back when it is released, so the hold has a tell at the square itself; they brighten to full as the hold counts toward the next level (label to card: 0.5 s, or 1.0 s beyond 35 m; card to expanded view: 2 s at Stopped and Stroll), the same count the pane's hold rule shows (section 4, Hold); a pinch brightens them at once. A Martian Mono 9.5 px `EYE TRACKING` in the accent, with the same halo, sits inside the square at its bottom edge and rides in with the corners, saying what the square is (94 px wide at scale 1, inside the 132 px of the held square with 19 px to spare each side, and scaled with it at every size); it never fades. The viewfinder sits under the glasses layer: a pane over it covers its ticks behind the glass, and the pane's hold rule carries the count there. On the walk it is always on the glass: it is hidden only on the title, on the end screen and by the inspector's toggle, never by the pointer over a view-zone pane. In a gate it goes quiet where it stands, the ticks and the caption at 30% `--ink`, with no hold tell, and comes back over `t-snap` at the return, so the crossing line and the quiet square say the same thing; with reduced motion the corners stay at 160. The inspector's Overrides tab toggles it (on by default).

The end screen uses the same panel; behind it the street holds its last frame dimmed to 35% (the only place the street is ever dimmed besides the narrow start screen, both reviewer chrome) and the glasses are hidden. Its timeline is 36 px at scale 1: 2 px ticks in `--ink` for cards and in `--voice` at 50% for holds, crossings shaded `#1d2228`, the bands a 1 px stepped line under it, mono labels 0:00 and the session's length at the right; it draws left to right over 900 ms `power2.out` and the ticks rise as the draw reaches them. "What it decided" is 13 px mono caps over 14 px lines, the reason in `--voice`.
