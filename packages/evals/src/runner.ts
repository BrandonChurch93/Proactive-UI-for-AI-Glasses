import { Brain, type ConfigOverride } from '@lumen/brain';
import type { BrainFrame, Decision, Glyph, LogEntry, OverrideEntry, WorldSnapshot } from '@lumen/shared';

export interface FrameItem {
  id: string;
  level: Decision['level'];
  component: Decision['component'];
  zone: Decision['placement']['zone'];
  action: Decision['action'];
  gaze?: boolean;
  zoneOk?: boolean;
  cause?: Decision['cause'];
  seconds?: number;
}

export interface FrameRecord {
  t: number;
  band: BrainFrame['band'];
  gate: BrainFrame['gate'];
  glyph: Glyph | null;
  items: FrameItem[];
  budget: number;
  budgetUsed: number;
  pocket: string[];
  stoppedFor: number;
  dwell: BrainFrame['dwell'];
  goal: BrainFrame['goal'];
}

export interface RunResult {
  id: string;
  snapshots: WorldSnapshot[];
  frames: FrameRecord[];
  entries: LogEntry[];
  brain: Brain;
}

export function run(
  id: string,
  snapshots: WorldSnapshot[],
  scenario: WorldSnapshot['goal']['scenario'],
  config?: ConfigOverride,
  overrides: readonly OverrideEntry[] = [],
): RunResult {
  const brain = new Brain({ scenario, ...(config ? { config } : {}) });
  const frames: FrameRecord[] = [];
  let next = 0;
  for (const s of snapshots) {
    while (next < overrides.length && overrides[next]!.t <= s.t + 1e-9) brain.applyOverride(overrides[next]!.override, overrides[next++]!.t);
    const f = brain.tick(s);
    frames.push({
      t: f.t,
      band: f.band,
      gate: f.gate,
      glyph: f.glyph,
      items: f.items.map((d) => {
        const out: FrameItem = { id: d.id, level: d.level, component: d.component, zone: d.placement.zone, action: d.action };
        if (d.gaze) out.gaze = true;
        if (d.placement.zoneOk) out.zoneOk = true;
        if (d.cause) out.cause = d.cause;
        if (d.content.seconds !== undefined) out.seconds = d.content.seconds;
        return out;
      }),
      budget: f.model.budget,
      budgetUsed: f.model.budgetUsed,
      pocket: f.model.pocket,
      stoppedFor: f.stoppedFor,
      dwell: f.dwell,
      goal: f.goal,
    });
  }
  return { id, snapshots, frames, entries: brain.log.entries, brain };
}

export function fingerprint(r: RunResult): string {
  return JSON.stringify(r.entries.map((e) => [e.t, e.decision]));
}
