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
| `--font-mono` | Martian Mono | All live numbers, times, counts, the pavement text, the held glyph, captions |
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
| Caption (reviewer chrome) | 10.5px mono | 400 | .1em uppercase |

Minimum 12px on a label, 14px in cards for anything that must be read while walking. Sizes are at the reference scale; the overlay scales with distance (see 5. Placement).

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

### Curves

| Curve | Definition | Use |
| --- | --- | --- |
| `ease-out` | `cubic-bezier(.22, 1, .36, 1)` (GSAP `power3.out`) | Anything entering |
| `ease-in` | `cubic-bezier(.64, 0, .78, 0)` (GSAP `power2.in`) | Anything leaving |
| `ease-gate` | `cubic-bezier(.4, 0, .2, 1)` (GSAP `power1.inOut`) | Recede only. No settle |
| `ease-travel` | GSAP `power2.inOut` | The light head along the leader |

### The moves, exactly

**Mark** (brain notices an object). Tick sound. Pip opacity 0 → 1 and scale .2 → 1 over 500 ms ease-out. Aura opacity .8 → 0 while scaling .5 → 2.6 over 900 ms `power2.out`, starting 50 ms after the pip.

**Gaze** (wearer dwells, from 450 ms of gaze). Aura to opacity 1, scale 1.6, over 800 ms `sine.inOut`. Pip to 1.6× over the same. Flare opacity 0 → 1 and scaleX 1.2 → 5.5 over 700 ms ease-out, starting at 300 ms; flare fades out over 700 ms ease-in starting at 1100 ms. Exactly one horizontal streak, never two.

**Travel** (light leaves the pip, at birth only). Head opacity 1. Leader draws from 0 to 1 along a straight segment from the pip to the nearest point of the nearest pane edge, over 320 ms to a glance or 460 ms to a card, `power2.inOut`, the head riding the tip. Head fades over 300 ms on arrival. Breath sound halfway. After that the segment simply follows the pane's edge every frame.

**Condense** (a pane is born; it runs once per pane). The seed hairline appears at the pane's top-left at width 0 and grows to the pane's width over 300 ms `power3.out`. 180 ms in, the pane reveals from the seed downward: `clip-path: inset(0 0 100% 0) → inset(0 0 0 0)` over `t-base` (420 ms for a card) ease-out, with chromatic separation `--ca` 2.4 → 0 settling over 700 ms `power2.out` from 340 ms. Children resolve from `opacity 0, y -3px, blur 5px` to rest over `t-base`, stagger 50 ms, from 260 ms. The seed fades over 450 ms ease-in from 500 ms. A pane the wearer earned by looking condenses while its light travels rather than after it, and its children resolve with the reveal, from 180 ms, so a label reads within half a second of the look.

Chromatic separation is implemented as text shadows: `calc(var(--ca) * -1px) 0 rgba(255,96,96,.6), calc(var(--ca) * 1px) 0 rgba(96,214,255,.6)`.

**Dissolve** (a pane leaves). Children fade with 4px blur over 160 ms, stagger 20 ms. The seed reappears at the pane's top at full width. The pane clips back to the top over `t-quick` ease-in with `--ca` 1.4, starting at 80 ms. The seed shrinks to width 0 over 220 ms ease-in from 240 ms. Exits are entrances in reverse.

**Retract** (the light returns to the pip). Head on; leader 1 → 0 over 300 ms `power2.in`; head off.

**Labels** (the view settles, walking rule 10). Every label in the set is born on one timeline: each condenses with its light, no mark first, the children resolving with the reveal from 180 ms, staggered 40 ms apart from the nearest place outward. When the set fades, the labels dissolve the same way, 40 ms apart. A label the look grows is never born again; it grows in place.

**Swap** (the look moves from one label to another). The card shrinks back to its label and the new label grows to its card in the same frame, both over 420 ms ease-out, so the eye sees one exchange and no third state. A card the look simply leaves shrinks to its label over 320 ms.

**Grow** (label → card → expanded). A pane is one surface from birth to death; a level change never builds a second one. The new content is measured off-screen, then the surface's width and height tween to the new size over `t-base` (420 ms to a card) or `t-open` (480 ms to the expanded view) ease-out, growing away from the corner its leader meets: upward from its bottom edge when it sits above its pip, away from the pip when it sits beside it. That corner does not move. The outgoing children fade with the dissolve blur over 120 ms; the incoming children resolve with the condense stagger (from `opacity 0, y -3px, blur 5px`, 50 ms apart) starting at 160 ms. No seed, no travel: the leader just follows the pane's edge as it grows. Nothing happens to the world. No dim, no blur, no depth of field.

**Shrink** (expanded or card → label, while the pane stays). Grow in reverse, ending on the smaller content, over 320 ms to a label (420 ms in a swap). A change in a pane's content structure at the same level is the same cross-fade, with a resize only if the measured size changed.

**Recede** (safety gate). Breath-down sound. The whole glasses layer: `filter: blur(3px) brightness(.55)`, `translateY 14px`, `scale .985`, `opacity .38`, over 280 ms ease-gate, all at once. In-scene lights fade to 20%. The held glyph slides in from the left over `t-base` at 100 ms. The pavement safety text is in a separate layer and stays razor sharp.

**Return** (gate clears). Reverse over 550 ms ease-out, so the return is always slower than the retreat. Held glyph leaves over `t-quick`. The held item's reason line then arrives last: "Held that while you crossed", resolving from blur over `t-base`.

**Batch**. A second item tucks under the open pane as a strip, from `y -8px, blur 4px` over `t-quick`, counted, never stacked above.

**Yield** (head scan, walking rule 5). The panes on the scanned side go to opacity .15 and slide 24 px outward over 180 ms `ease-gate`, and hold still where they were when the yield began: no move, no clamp, no fold while yielded. They return over 320 ms ease-out when the scan is over (the head back where it started, or the look settled on a different place), easing from the held spot to their place. In-scene lights follow the same opacity.

**Step aside** (right of way, walking rule 8). The pane dims to .3 and slides clear by the overlap width plus 20 px over 220 ms, never further than its own width, a dashed trace from its home to its new place; it returns over 320 ms ease-out. If it cannot clear, it stays dimmed where it is; when the mover covers more than 60% of it for 300 ms it dissolves to its pip at .45, and when the way is clear the same pane condenses back in its own place.

**Auto-fold** (walking rule 3). Dissolve then retract, exactly the leave moves, with no sound. Nothing waits to be dismissed while the wearer moves.

**Save** (the pocket, walking rule 6). Glass tick. "Saved" blooms at the pip from `y +6px` over 250 ms ease-out and leaves after 600 ms. The held glyph gains its count over `t-base`.

**Surface** (the pocket, walking rule 7). The pocket pane condenses beside the held glyph with `t-open`, breath-up sound. Its header counts down with the signal.

**Whisper** (walking rule 11). One line rises 8 px into place at the bottom edge over `t-base` ease-out, stays 2.5 s, leaves over `t-quick`.

**Snooze** (walking rule 12). Everything folds with the leave moves at once; the held glyph slides in with the countdown. Cancel reverses it.

**Edge fold**. Before the edge would cut a pane, it folds: when its anchor leaves the view, when keeping it in the view would move it more than 24 px, when any part of it would fall outside the view, or when it would touch the reviewer chrome. The pane dims to 0 over `t-quick` where it stands, without following its anchor. If the anchor is off the view the edge light appears at the nearest edge at the anchor's height; otherwise the pane's own light stays. It stays folded until it fits 40 px clear of the view edges (a pane the look has just left stays folded); the return is a condense of the same pane, in place. No pane is ever drawn partly outside the view.

Laws: nothing bounces, overshoots or springs. Stagger is 40 to 50 ms, never more than 120 ms across a pane. Recede can interrupt any move mid-flight and never waits.

### Sound

Synthesized, no files. Off by default, one button turns it on.

| Event | Sound |
| --- | --- |
| Mark, confirm | Glass tick: sine 2600 → 1900 Hz over 80 ms, gain .09, 140 ms decay |
| Unfold, open | Breath up: band-passed noise 900 → 2600 Hz, 350 to 500 ms, gain .05 |
| Recede | Breath down: band-passed noise 2400 → 700 Hz, 500 ms, gain .06 |
| Ambient | Brown noise, low-pass 420 Hz with a slow LFO, gain .08 |

## 5. Placement

Zones:
- World zone (pips, labels, cards, expanded view): projected from 3D anchors every frame. Scale with distance: `scale = clamp(22 / distance, .78, 1)`: full size at 22 m and nearer, a smaller label beyond.
- Ground zone (route, turn arc, destination marker, safety text): painted on the pavement in perspective.
- View zone (held glyph, message toasts, map tile, the ask glance, reviewer chrome): fixed in view, edges only.

Rules:
1. Anchor at sign height for a storefront, chest height for a person. The pane sits beside its light on the side away from the center of the view, its near edge 24 px from the light and rising from it, the light 85 % of the way down the pane's height, joined by a short straight leader; when that does not fit, centered above the light with its bottom 22 px above it; then centered below. It is never placed over the roadway; with nowhere else to go it sits above its light at the roadway's top edge.
2. Focus zone: scaled by pace band (walking rule 1). Stopped: the middle 33% of the width and 40% of the height. Stroll 38 × 44. Walk 44 × 50. Brisk 52 × 58. Nothing persistent inside it except the pane on the thing being looked at, which the zone does not apply to. When the zone grows, or the look leaves a pane that sits in it, the pane moves out over 320 ms if it has a place within its own width of its light, and otherwise waits as its light.
3. Keep-out: roadway, vehicles in traffic (moving or stopped), people, the wearer's path, faces; recomputed every frame from projected bounds (walking rule 8). The view-edge cards and the reviewer chrome (Sound, Pause, `I · INSPECTOR`, the pace readout, the held glyph) are hard rects too, padded 8 px. A pane that cannot clear a mover dims in place and drops to its light when mostly covered.
4. Calm backdrop: façade over sky over road, never over a bright sign. (The pip may sit above a marquee, never on it: a glow on a glow is invisible.)
5. Hysteresis: once placed, a pane holds for 1.2 s unless a keep-out forces it. Scale belongs to the placement: a move never changes it, and a placement re-chosen inside the 1.2 s keeps the current scale.
6. Edge: a card that is not being looked at collapses to its label within 8% of the edge, and a label folds within 4%; the pane on the thing being looked at never collapses, it shrinks to 0.74 or folds when it reaches the edge. A pane is never cut by the edge: it folds first (Edge fold), and returns in place when it fits again or the wearer looks back. The head turns a full 180 degrees.
7. A new pane is born at its placed position with the condense move (walking rule 4); nothing slides in from the edge.

Screen scale: sizes above are at the reference view of 1280 × 800. Every pane, the held glyph and the whisper line scale by the viewport scale `--ui` on top of the distance scale, with `s = min(w / 1280, h / 800)`: below 1 it is `clamp(1.3 × s, 0.74, 1)`, so a landscape phone runs at 0.74 and anything from a 1024 × 640 laptop up runs at 1; above 1 it is `clamp(s, 1, 1.9)`, so 1920 × 1080 runs at 1.35, 2560 × 1440 at 1.8 and 3840 × 2160 at 1.9. The same value is set on the document root and multiplies every size in the reviewer chrome, the title screen and the end screen, which scale up with it but never below their phone-tuned sizes (`max(1, --ui)`), so text the reviewer reads and buttons they tap stay legible and large enough to hit on a phone. The view-edge offsets (24 px from the right, 56 px from the top, the glyph 44 px from the bottom) scale with it too. A pane that is not being looked at and cannot be placed at its level steps down a level (expanded to card to glance) before it falls back to its light, and steps back up when there is room again; the pane on the thing being looked at shrinks to 0.74 instead and never steps down. Phones held upright get a prompt to turn sideways instead of the street; tablets work both ways.

## 6. Components

| Component | Zone | Levels | Notes |
| --- | --- | --- | --- |
| Pip | World | Pip | Light vocabulary, category tint |
| Label | World | Label | Name and the short form of what the assistant would say about it, beside its storefront, scaled by distance; in Brisk the whisper form (name and one number). Nothing else. Up to six at once, when the view settles |
| Place card | World | Card | Name, the say line, one live line (the two facts behind it), the reason in Stopped and Stroll. No year, no hint (no card exists in Brisk) |
| Expanded view | World, in place | Expanded | One decision: name, the say line, at most three rows that support it, two actions, then the line after a choice |
| Errands card | View edge | Card | The stops in order with why; ticks a stop on pickup; reorders on a closure; folds to the route after 4 s while moving |
| Leader, seed | World | Label, card | Light vocabulary |
| Held glyph | View | Any | Rotated square, accent, optional count (held items, pocket count, social count) or the snooze countdown; the only persistent element |
| Pocket pane | View, beside the glyph | Card | "12 s · what you saved" and the saved items as rows; surfaces at a stop |
| Whisper line | View, bottom edge | Whisper | Name · one fact, 2.5 s, Brisk only |
| Edge light | View edge | Pip | Where an off-view anchor is |
| Curb follow-up | View | Glance | "Held that while you crossed. Still want it?" |
| Safety text | Ground | Glance | WALK · WAIT countdown; BIKE · 2 s with an arrow; stop tone. One line on the pavement at a time: the bike line takes the countdown's place while it shows |
| Route | Ground | Glance | Pavement band fading 25 m ahead; turn arc; stays at 40% during a gate |
| Destination marker | Ground + world | Glance | Column of light, settles to a pip at the door |
| Map tile | View | Glance | Only for a turn the wearer cannot see |
| Message toast | View | Glance, card | Sender, one line, reply or later; enters from the edge; allowed in any band but Brisk |
| Notification strip | View | Glance | "3 notifications · later"; social only surfaces stopped |
| Call toast | View | Card | Answer, decline; interrupts a walk, never a crossing; view zone, so allowed in Walk |
| Ask glance | View edge | Glance | One line, two choices; only in Just walking, at the first stop after two food places have been looked at |
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

The inspector, captions, the `I · INSPECTOR` hint and the title bar are not glasses UI. Every size in them multiplies by `max(1, --ui)` (section 5, Screen scale). They use a plain dark panel style: `#0e1216` surfaces, `#1d2228` rules, Instrument Sans, Martian Mono for data, `#f0b429` for the one accent. They must never be mistaken for part of the world. The pace band readout and the focus zone outline (both reviewer chrome, both off by default) use the same style.
