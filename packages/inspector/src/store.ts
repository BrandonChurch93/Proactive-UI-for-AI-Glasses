import type { BrainFrame, Override, OverrideEntry, PaneReport, RunExport, ScenarioId, WorldSnapshot } from '@lumen/shared';

export interface EvalCase {
  name: string;
  rule?: string;
  pass: boolean;
  detail: string;
}

export interface EvalSuite {
  id: string;
  group: string;
  rule?: string;
  description?: string;
  pass: boolean;
  results: EvalCase[];
}

export interface EvalReport {
  version: 1;
  totals: { suites: number; passed: number; cases: number; casesPassed: number };
  byGroup: Record<string, { suites: number; passed: number }>;
  suites: EvalSuite[];
}

export interface InspectorStore {
  readonly scenario: ScenarioId;
  readonly duration: number;
  readonly report: EvalReport | null;
  now(): number;
  known(): number;
  frames(): readonly BrainFrame[];
  snapshots(): readonly WorldSnapshot[];
  overrides(): readonly OverrideEntry[];
  panes(): readonly PaneReport[];
  paused(): boolean;
  setPaused(p: boolean): void;
  seek(t: number): void;
  override(o: Override): void;
  focusOutline(): boolean;
  setFocusOutline(on: boolean): void;
  paceReadout(): boolean;
  setPaceReadout(on: boolean): void;
  exportRun(): RunExport;
  subscribe(fn: () => void): () => void;
}
