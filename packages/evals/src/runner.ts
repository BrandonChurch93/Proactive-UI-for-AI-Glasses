import { Brain, type ConfigOverride } from '@lumen/brain';
import type { BrainFrame, Decision, Glyph, LogEntry, WorldSnapshot } from '@lumen/shared';

export interface FrameItem {
  id: string;
  level: Decision['level'];
  component: Decision['component'];
  zone: Decision['placement']['zone'];
  action: Decision['action'];
  gaze?: boolean;
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
}

export interface RunResult {
  id: string;
  snapshots: WorldSnapshot[];
  frames: FrameRecord[];
  entries: LogEntry[];
  brain: Brain;
}

export function run(id: string, snapshots: WorldSnapshot[], scenario: WorldSnapshot['goal']['scenario'], config?: ConfigOverride): RunResult {
  const brain = new Brain({ scenario, ...(config ? { config } : {}) });
  const frames: FrameRecord[] = [];
  for (const s of snapshots) {
    const f = brain.tick(s);
    frames.push({
      t: f.t,
      band: f.band,
      gate: f.gate,
      glyph: f.glyph,
      items: f.items.map((d) => {
        const out: FrameItem = { id: d.id, level: d.level, component: d.component, zone: d.placement.zone, action: d.action };
        if (d.gaze) out.gaze = true;
        if (d.cause) out.cause = d.cause;
        if (d.content.seconds !== undefined) out.seconds = d.content.seconds;
        return out;
      }),
      budget: f.model.budget,
      budgetUsed: f.model.budgetUsed,
      pocket: f.model.pocket,
      stoppedFor: f.stoppedFor,
      dwell: f.dwell,
    });
  }
  return { id, snapshots, frames, entries: brain.log.entries, brain };
}

export function fingerprint(r: RunResult): string {
  return JSON.stringify(r.entries.map((e) => [e.t, e.decision]));
}
