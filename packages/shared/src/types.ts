import type { Band, EntityKind, LiveValue, PlaceCopy, ScenarioId, Side, SignalState } from './data';
import type { Box3, Rect, Vec3 } from './vec';

export type Level = 'pip' | 'glance' | 'card' | 'expanded' | 'whisper';
export type Action = 'show' | 'hold' | 'promote' | 'demote' | 'dismiss' | 'save' | 'surface';
export type Timing = 'now' | 'next-pause' | 'batched' | 'after-gate';
export type Channel = 'visual' | 'ground' | 'edge';
export type Zone = 'world' | 'ground' | 'view';
export type ReasonKind = 'goal' | 'world' | 'gate' | 'budget' | 'social' | 'edge' | 'pace' | 'pocket';
export type WearerState = 'walking' | 'stopped' | 'crossing';
export type VehicleKind = 'car' | 'bus' | 'truck' | 'bike';
export type NotificationType = 'text' | 'dm' | 'social' | 'app' | 'call';

export const LEVEL_RANK: Record<Level | 'none', number> = {
  none: 0,
  pip: 1,
  whisper: 2,
  glance: 3,
  card: 4,
  expanded: 5,
};

export interface Entity extends PlaceCopy {
  id: string;
  name: string;
  kind: EntityKind;
  category: string;
  side: Side;
  pos: Vec3;
  door: Vec3;
  live: Record<string, LiveValue>;
  glance: string;
  depth: string | null;
  year?: number;
  distance: number;
  routeS: number;
  visible: boolean;
}

export interface Notification {
  id: string;
  type: NotificationType;
  at: number;
  from?: string;
  text?: string;
  count?: number;
  more?: number;
}

export interface Stop {
  id: string;
}

export interface Crosswalk {
  id: string;
  leg: 'avenue' | 'cross';
  distance: number;
  signal: SignalState;
  secondsLeft: number;
  toWalk: number;
  inRoadway: boolean;
  onRoute: boolean;
}

export interface VehicleInfo {
  id: string;
  kind: VehicleKind;
  pos: Vec3;
  vel: Vec3;
  bounds: Box3;
  timeToPath?: number;
  fromBehind?: boolean;
  wearerSide?: boolean;
}

export interface PersonInfo {
  id: string;
  pos: Vec3;
  bounds: Box3;
  facing: boolean;
  onPath: boolean;
  ahead: number;
}

export interface PaneReport {
  id: string;
  level: Level;
  zone: Zone;
  rect: Rect;
  opacity: number;
  gaze: boolean;
}

export interface WearerModel {
  dismissed: Record<string, number>;
  accepted: Record<string, number>;
  budgetUsed: number;
  budget: number;
  pocket: string[];
  snoozeUntil?: number;
}

export interface WorldSnapshot {
  t: number;
  wearer: {
    pos: Vec3;
    heading: Vec3;
    speed: number;
    state: WearerState;
    curbDistance: number;
    gaze: { target?: string; dwellMs: number; dir: Vec3; pitch: number; yaw: number; yawRate: number };
    pinch?: { target: string };
    dismiss?: { target?: string };
    choice?: { id: string; action: string };
  };
  env: {
    crosswalk?: Crosswalk;
    vehicles: VehicleInfo[];
    people: PersonInfo[];
    sidewalkNarrowsAhead?: { fromN: number; toN: number; distance: number };
    backdrop: Record<string, number>;
  };
  social: { inConversation: boolean; companions: number };
  entities: Entity[];
  inbox: Notification[];
  goal: { scenario: ScenarioId; stops?: Stop[]; destination?: string; arrived?: boolean };
  wearerModel: WearerModel;
  view?: { w: number; h: number; panes: PaneReport[] };
}

export interface ReasonPart {
  signal: string;
  value: number | string;
  weight: number;
}

export interface Reason {
  kind: ReasonKind;
  text: string;
  parts: ReasonPart[];
}

export interface ContentRow {
  title: string;
  sub?: string;
  value?: string;
  tone?: 'go' | 'warn' | 'stop' | 'voice' | 'done';
  key?: string;
}

export interface Content {
  name: string;
  fact?: string;
  reason: Reason;
  depthRef?: string;
  year?: string;
  meta?: string;
  live?: string;
  hint?: string;
  sub?: string;
  rows?: ContentRow[];
  actions?: { id: string; label: string; primary?: boolean }[];
  note?: string;
  trimmed?: string[];
  showReason?: boolean;
  strips?: { id: string; text: string }[];
  route?: { to: string; offset: 'center' | 'curb'; crossing?: 'avenue' | 'cross' };
  seconds?: number;
  tone?: 'go' | 'warn' | 'stop' | 'voice';
  arrow?: 'left' | 'right' | 'up' | 'down';
}

export type ComponentKind =
  | 'place'
  | 'person'
  | 'moment'
  | 'toast'
  | 'call'
  | 'strip'
  | 'errands'
  | 'pocket'
  | 'ask'
  | 'followup'
  | 'whisper'
  | 'route'
  | 'destination'
  | 'safety'
  | 'arrival';

export interface SignalBundle {
  speed: number;
  band: Band;
  gaze?: string;
  dwellMs: number;
  gates: string[];
  budget: number;
  distance?: number;
  score?: { relevance: number; value: number; proximity: number; novelty: number; cost: number };
  signal?: string;
}

export interface Decision {
  id: string;
  action: Action;
  level: Level;
  timing: Timing;
  channel: Channel;
  placement: {
    anchor: string;
    zone: Zone;
    prefer: 'side' | 'above' | 'below';
    enter?: 'edge' | 'anchor';
    focusOk?: boolean;
  };
  content: Content;
  reason: Reason;
  score: number;
  band: Band;
  signals: SignalBundle;
  component: ComponentKind;
  cause?: Cause;
  gaze?: boolean;
  seq?: number;
}

export type Cause =
  | 'dwell'
  | 'pinch'
  | 'score'
  | 'look-away'
  | 'auto-fold'
  | 'band'
  | 'gate'
  | 'choice'
  | 'dismiss'
  | 'notification'
  | 'goal'
  | 'pocket'
  | 'safety'
  | 'arrival'
  | 'timer';

export interface Glyph {
  kind: 'held' | 'pocket' | 'social' | 'snooze';
  label: string;
  count?: number;
}

export interface GateState {
  safety: boolean;
  safetyCause?: 'crossing' | 'roadway' | 'vehicle';
  social: boolean;
  path: boolean;
  snooze: boolean;
  budgetEmpty: boolean;
}

export interface BrainFrame {
  t: number;
  band: Band;
  speed: number;
  gate: GateState;
  items: Decision[];
  events: Decision[];
  glyph: Glyph | null;
  focus: { w: number; h: number };
  model: WearerModel;
  dwell: { target?: string; dwellMs: number; earned: Level | 'none' };
  goal: { scenario: ScenarioId; destination?: string; stops: string[] };
  stoppedFor: number;
}

export interface LogEntry {
  t: number;
  decision: Decision;
  snapshotRef: number;
}

export interface OverrideEntry {
  t: number;
  override: Override;
}

export type Override =
  | { kind: 'gate'; on: boolean }
  | { kind: 'budget-zero' }
  | { kind: 'band'; band: Band | null }
  | { kind: 'mute-social'; on: boolean }
  | { kind: 'snooze' };

export const BANNED_REASON_WORDS = [
  'look',
  'looked',
  'looking',
  'gaze',
  'eyes',
  'stared',
  'glanced',
  'habit',
  'noticed you',
  'walking fast',
  'slow down',
  'you were',
] as const;

export function reasonIsClean(text: string): boolean {
  const lower = text.toLowerCase();
  return !BANNED_REASON_WORDS.some((w) =>
    w.includes(' ') ? lower.includes(w) : new RegExp(`\\b${w}\\b`).test(lower),
  );
}

export function isShow(d: Decision): boolean {
  return d.action === 'show' && d.placement.zone !== 'ground' && LEVEL_RANK[d.level] >= LEVEL_RANK.whisper;
}

export interface RunExport {
  version: 1;
  kind: 'lumen-run';
  scenario: import('./data').ScenarioId;
  seed: number;
  hz: number;
  source: 'scripted' | 'live';
  snapshots: import('./compact').CompactSnapshot[];
  overrides: OverrideEntry[];
  entries: [number, Decision][];
}
