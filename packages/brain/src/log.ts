import type { Decision, LogEntry, Override, OverrideEntry, WorldSnapshot } from '@lumen/shared';

export interface WalkLog {
  version: 1;
  scenario: string;
  seed: number;
  entries: LogEntry[];
  overrides: OverrideEntry[];
  snapshots: WorldSnapshot[];
}

export class DecisionLog {
  readonly entries: LogEntry[] = [];
  readonly overrides: OverrideEntry[] = [];
  private seq = 0;

  append(t: number, decision: Decision, snapshotRef: number): void {
    decision.seq = this.seq++;
    this.entries.push({ t, decision, snapshotRef });
  }

  override(t: number, override: Override): void {
    this.overrides.push({ t, override });
  }

  between(a: number, b: number): LogEntry[] {
    return this.entries.filter((e) => e.t >= a && e.t < b);
  }
}
