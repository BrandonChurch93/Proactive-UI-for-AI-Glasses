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
- **Decisions.** Newest first. Each row: time, band, action, candidate, level, timing, and the reason expanded into its parts (`signal · value · weight`), with the plain-language reason line the wearer saw. Holds, saves and surfaces are rows too; most rows are holds, and that is the point. A row for a trimmed glance shows what the reading budget removed.
- **Signals.** Pace band and speed, crosswalk and vehicles, attention (gaze target, dwell, the ladder level it has earned), social, goal, the attention budget as a meter that drains per show and refills one unit per 40 s of quiet (walking rule 13), the pocket's contents, snooze remaining, backdrop luminance behind each visible pane. Live values that move while the walk plays.
- **Overrides.** Force a gate, drop the attention budget to zero, set the pace band by hand, mute social, start a snooze, show the focus zone outline on the glasses view. Each applies live and is logged as an override so the eval export is honest.
- **Evals.** The scenario suite results for this build (from `docs/evals.md`): pass counts per scenario and per gate, with a link to each failing expectation.
- **Export.** One click downloads the run as JSON in the eval format.

## 3. Copy

The inspector speaks plainly and never in the brain's voice. "Held: in the roadway" not "Suppressed for your safety". Column headers are nouns. No em dashes.
