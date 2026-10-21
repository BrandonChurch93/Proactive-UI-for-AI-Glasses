# Audit plan · the last pass before deploy

What is checked before the demo ships, how, and what counts as a pass. Results are written into `STATUS.md` under the Phase 8 review.

## 1. Mobile, decided

Measured on a 390 × 844 portrait phone and an 844 × 390 landscape phone (touch, device pixel ratio 2):

- Portrait cannot carry the glasses interface. The focus zone keeps the middle third clear, which leaves about 130 px each side; a glance needs 214 px and a card 292 px, so everything collapses to a pip, and the expanded view is wider than the screen. The street becomes a tall slit, which misrepresents a wide field of view.
- Landscape phones show the street the way glasses would, but the reference-scale panes and the title screen are sized for 1280 × 800: the title overflows, cards fit only at their smallest scale, the expanded view never fits.
- Touch has drag and tap, but no dismiss, no pause, and the how-to says "Click" and "Esc".
- iOS Safari cannot lock orientation, and iPhones have no fullscreen API, so landscape can be asked for, not forced.

Decision: landscape on phones, portrait wherever the screen is at least 700 px wide (tablets). In a narrow portrait screen the demo pauses behind a prompt to turn the phone. To make landscape phones good:

- The overlay scales with the viewport (reference scale is 1280 × 800, never below 0.74), on top of the distance scale. A pane that cannot be placed at its level steps down a level before it falls back to a pip.
- The title screen has a compact layout for short screens.
- Touch gets long-press to dismiss and a visible pause control, and the how-to says "Tap" and "Long-press" on touch screens.
- Chrome respects the notch and home indicator (safe areas).
- Small touch devices start on the fast quality tier instead of waiting four seconds to fall back.

## 2. Automated gate

- `pnpm lint`, `pnpm test`, `pnpm eval`, `pnpm build` green.
- `scripts/play.ts` plays each walk end to end on the production build and fails on any console error or warning.
- `scripts/coldload.ts`: first pip under 6 s at 50 Mbit/s.
- `scripts/perf.ts`, `scripts/stats.ts`: draw calls under 300 at every beat, frame cost recorded.

## 3. Beats

Every beat in `docs/scenarios.md` for all three walks, scripted (`?scripted=1`) and by hand, at desktop size and on a landscape phone. Pass: the beat happens, the copy matches `docs/copy.md`, nothing covers the focus zone, nothing dims the world.

## 4. Input and flow

Drag, dwell, click or tap, dismiss (right-click, Esc, long-press), Enter, Space and the pause control, I and the hint. Title skip, each choice, the end card, Walk again, switching walks from the end card, Sound on and off, the rotate prompt appearing and clearing.

## 5. Inspector

Scrub the whole walk forward and back; every override applies and is logged; export a hand-played run with an override and score it with `pnpm eval --file` (round trip passes). The drawer works on a landscape phone.

## 6. Browsers and screens

Chromium, WebKit and Firefox engines (Playwright), at 1280 × 800, 1920 × 1080, 2560 × 1080, 1024 × 768, 844 × 390 and 390 × 844. Pass: no console errors, the title fits, panes place, the inspector fits.

## 7. Performance and memory

Frame cost per tier; memory after five rounds of Walk again (JS heap, geometries, textures, DOM nodes) must not grow round over round; cold load on a throttled network.

## 8. Accessibility

Keyboard only from title to end card; focus visible on every control; reduced motion; contrast numbers (already measured); the canvas and controls are labelled, and what the glasses show is announced politely to a screen reader.

## 9. Robustness

Tab hidden and shown mid-walk; resize and rotate mid-walk; rapid scenario switching; scrubbing after the end card; pause at every stage; a lost WebGL context recovers or says so.

## 10. Deploy

Built with relative paths; served from a subdirectory by a plain static server with no 404s; `README.md` says how to deploy.
