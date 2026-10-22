# Inspector Spec · the reviewer's side

The inspector proves the system is real. It is the only place in the demo where a normal interface is the right call, because its job is to be read, not felt. Reviewer chrome style from `docs/design-system.md` section 9.

## 1. Shape

```
packages/inspector
  src/
    index.ts        mount(root, store): Inspector
    timeline.ts     scrubber over the decision log
    decisions.ts    show / hold list with reason parts
    signals.ts      the signals as live values, including the pace band, the budget meter and the pocket
    overrides.ts    force a gate, zero the budget, set the pace band, mute social, snooze
    exporter.ts     JSON export in the eval format
```

Opens as a drawer over the right third of the screen on `I` or the `I · INSPECTOR` hint. The walk pauses when the inspector opens unless the reviewer resumes it.

## 2. Panels

- **Timeline.** The whole walk. Every decision is a tick (show in accent, hold in gray); gates are shaded spans; messages are markers. Scrubbing moves the wearer, the world and the overlay together, because the sim is deterministic and the log stores snapshots at 10 Hz.
- **Decisions.** Newest first. Each row: time, band, action, candidate, level, timing, and the reason expanded into its parts (`signal · value · weight`), with the plain-language reason line the wearer saw. Holds, saves and surfaces are rows too; most rows are holds, and that is the point. A row for a trimmed glance shows what the reading budget removed. The Overlay filter interleaves the brain's decisions with the glass's own log (births, resizes, moves, drops, hides, edge folds, step-asides and deaths, each with its cause and rect), so a reviewer can see when what the brain decided and what the wearer saw part ways.
- **Signals.** Pace band and speed, crosswalk and vehicles, attention (gaze target, dwell, the ladder level it has earned), social, goal, the attention budget as a meter that drains per show and refills one unit per 40 s of quiet (walking rule 13), the pocket's contents, snooze remaining, backdrop luminance behind each visible pane. Live values that move while the walk plays.
- **Overrides.** Force a gate, drop the attention budget to zero, set the pace band by hand, mute social, start a snooze, show the focus zone outline on the glasses view. Each applies live and is logged as an override so the eval export is honest.
- **Evals.** The scenario suite results for this build (from `docs/evals.md`): pass counts per scenario and per gate, with a link to each failing expectation.
- **Export.** One click downloads the run as JSON in the eval format.

## 3. Copy

The inspector speaks plainly and never in the brain's voice. "Held: in the roadway" not "Suppressed for your safety". Column headers are nouns. No em dashes.

## 4. As built

- `mount(root, store, onClose)` takes an `InspectorStore` (packages/inspector/src/store.ts): the frames, snapshots and overrides of the current walk, the eval report bundled at build time, and `seek`, `override`, `setPaused` and `exportRun`. The inspector never imports the sim, the brain or the renderer.
- The timeline is always visible above the tabs. It spans the whole walk; the part already computed is lighter, shows are accent ticks, holds are short gray ticks, gates and snoozes are shaded spans, messages are diamonds above the track. Drag or click to scrub, arrow keys step a second (shift for five).
- Scrubbing is a replay, not a cache: the app keeps the reviewer's own input per sim step (head, gaze) and per brain tick (pinches, choices, dismissals, overrides), rebuilds the sim and brain from zero in Node-speed fast mode, and runs only the last 2.5 s with the overlay on so every pane arrives in its true state. A scrub to the end of a walk takes about a quarter of a second. Scrubbing back keeps the known future; touching anything (a drag, a pinch, an override) discards it from that moment on.
- The Overrides tab also toggles the pace readout (reviewer chrome, off by default).
- Export writes `{ kind: 'lumen-run', scenario, seed, hz, source, snapshots, overrides, entries, overlay }`, where `overlay` is the glass's log up to the moment of export. `pnpm eval --file <export>` replays the snapshots through a fresh brain with the overrides at their times, checks that it reproduces the exported decision log exactly, runs every invariant, and for an untouched scripted run also the walk's hand-written expectations.
