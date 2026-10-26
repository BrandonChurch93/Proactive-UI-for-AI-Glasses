import placesJson from '../../../data/places.json';
import walkJson from '../../../data/scenarios/walk.json';

export type ScenarioId = 'hungry' | 'errands' | 'walking';
export type Band = 'stopped' | 'stroll' | 'walk' | 'brisk';
export type Side = 'W' | 'E' | 'X';
export type EntityKind = 'food' | 'cafe' | 'theater' | 'venue' | 'shop' | 'service' | 'transit' | 'park' | 'sign';
export type Leg = 'avenue' | 'cross' | 'south';
export type SignalState = 'walk' | 'flash' | 'dont';
export type LiveValue = number | string | boolean;

export interface DepthRow {
  key?: string;
  title: string;
  sub?: string;
  value?: string;
  tone?: 'go' | 'warn' | 'stop';
  now?: boolean;
  when?: string;
}

export interface DepthPayload {
  sub: string;
  rows: DepthRow[];
  actions: { id: string; label: string; primary?: boolean }[];
  after?: Record<string, string>;
  liveAfter?: Record<string, string>;
}

export interface SayLine {
  line: string;
  short: string;
}

export type SayTable = { default: SayLine } & Partial<Record<ScenarioId, SayLine>>;

export interface PlaceCopy {
  card: { meta: string; live: string };
  say: SayTable;
  sayLive?: Record<string, SayTable>;
  short: string;
  reasons: { goal?: string; world?: string };
  expanded: DepthPayload | null;
  liveLines?: Record<string, string>;
  translate?: boolean;
  picker?: string;
}

export interface PlaceData extends PlaceCopy {
  id: string;
  name: string;
  kind: EntityKind;
  category: string;
  side: Side;
  anchor: { height: number };
  live: Record<string, LiveValue>;
  glance: string;
  depth: string | null;
  scenarios: ScenarioId[];
  n: [number, number] | null;
  year?: number;
}

export interface PaceZone {
  side: 'E' | 'W';
  fromN: number;
  toN: number;
  band: Band;
}

interface BeatBase {
  t: number;
  after?: 'intent';
  intent?: ScenarioId;
}

export type Beat =
  | (BeatBase & { kind: 'gaze'; id: string | null; dy?: number })
  | (BeatBase & { kind: 'pinch'; id: string })
  | (BeatBase & {
      kind: 'inbox';
      type: 'text' | 'dm' | 'social' | 'app';
      id?: string;
      from?: string;
      text?: string;
      count?: number;
      more?: number;
    })
  | (BeatBase & { kind: 'choice'; id: string; action: string })
  | (BeatBase & { kind: 'stops'; ids: string[] })
  | (BeatBase & { kind: 'live'; id: string; set: Record<string, LiveValue> })
  | (BeatBase & { kind: 'sidewalkNarrows'; fromN: number; toN: number })
  | (BeatBase & { kind: 'bus'; id: string; arrivesIn: number })
  | (BeatBase & { kind: 'headScan'; sequence: ('left' | 'right' | 'center')[] })
  | (BeatBase & { kind: 'person'; id: string; path: string; speed: number })
  | (BeatBase & { kind: 'vehicle'; id: string; lane: 'near' | 'far'; speed: number; fromN: number; toN: number })
  | (BeatBase & { kind: 'people'; id: string; count: number; onPath: boolean; until: number })
  | (BeatBase & { kind: 'lookUp'; seconds: number })
  | (BeatBase & { kind: 'ask'; answer: 'yes' | 'no'; answerAt: number })
  | (BeatBase & { kind: 'bike'; side: 'near' | 'far'; fromBehind: boolean; timeToPath: number })
  | (BeatBase & { kind: 'intent'; id: ScenarioId })
  | (BeatBase & { kind: 'choose'; id: string })
  | (BeatBase & { kind: 'reply'; id: string; reply: string })
  | (BeatBase & { kind: 'go'; id: string });

export type BeatKind = Beat['kind'];

export interface Recording {
  duration: number;
  beats: Beat[];
}

export interface WalkData {
  speeds: Record<Band, number>;
  pace: PaceZone[];
  signal: { state: SignalState; secondsLeft: number };
  holdS: number;
  beats: Beat[];
  recordings: Record<ScenarioId, Recording>;
}

const KINDS: readonly EntityKind[] = ['food', 'cafe', 'theater', 'venue', 'shop', 'service', 'transit', 'park', 'sign'];
const BANDS: readonly Band[] = ['stopped', 'stroll', 'walk', 'brisk'];
const BEAT_KINDS: readonly BeatKind[] = [
  'gaze',
  'pinch',
  'inbox',
  'choice',
  'stops',
  'live',
  'sidewalkNarrows',
  'bus',
  'headScan',
  'person',
  'vehicle',
  'people',
  'lookUp',
  'ask',
  'bike',
  'intent',
  'choose',
  'reply',
  'go',
];

function fail(where: string, what: string): never {
  throw new Error(`data: ${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validatePlace(raw: unknown, i: number): PlaceData {
  const where = `places[${i}]`;
  if (!isRecord(raw)) fail(where, 'not an object');
  for (const k of ['id', 'name', 'category', 'glance'] as const) {
    if (typeof raw[k] !== 'string' || raw[k] === '') fail(where, `${k} must be a non-empty string`);
  }
  if (!KINDS.includes(raw.kind as EntityKind)) fail(where, `unknown kind ${String(raw.kind)}`);
  if (!['W', 'E', 'X'].includes(raw.side as string)) fail(where, `unknown side ${String(raw.side)}`);
  if (!isRecord(raw.anchor) || typeof raw.anchor.height !== 'number') fail(where, 'anchor.height must be a number');
  if (!isRecord(raw.live)) fail(where, 'live must be an object');
  if (raw.n !== null && !(Array.isArray(raw.n) && raw.n.length === 2 && raw.n.every((x) => typeof x === 'number'))) {
    fail(where, 'n must be [from, to] or null');
  }
  if (!Array.isArray(raw.scenarios)) fail(where, 'scenarios must be an array');
  if (!isRecord(raw.card) || typeof raw.card.meta !== 'string' || typeof raw.card.live !== 'string') {
    fail(where, 'card needs meta and live');
  }
  if (typeof raw.short !== 'string') fail(where, 'short must be a string');
  const sayOk = (t: unknown): boolean => isRecord(t) && isRecord(t.default) && Object.values(t).every((v) => isRecord(v) && typeof v.line === 'string' && typeof v.short === 'string');
  if (!sayOk(raw.say)) fail(where, 'say needs a default line and short form, and every entry a line and a short form');
  if (raw.sayLive !== undefined && !(isRecord(raw.sayLive) && Object.values(raw.sayLive).every(sayOk))) fail(where, 'sayLive entries must be say tables');
  if (raw.picker !== undefined && typeof raw.picker !== 'string') fail(where, 'picker must be a string');
  if (!isRecord(raw.reasons)) fail(where, 'reasons must be an object');
  for (const r of Object.values(raw.reasons)) {
    if (typeof r !== 'string' || r.length > 48) fail(where, `reason over 48 characters: ${String(r)}`);
  }
  return raw as unknown as PlaceData;
}

function validateBeats(raw: unknown, where: string): void {
  if (!Array.isArray(raw)) fail(where, 'beats must be an array');
  for (const [i, b] of (raw as unknown[]).entries()) {
    if (!isRecord(b) || typeof b.t !== 'number') fail(where, `beats[${i}] needs a numeric t`);
    if (!BEAT_KINDS.includes(b.kind as BeatKind)) fail(where, `beats[${i}] unknown kind ${String(b.kind)}`);
    if (b.after !== undefined && b.after !== 'intent') fail(where, `beats[${i}] after must be intent`);
  }
}

function validateWalk(raw: unknown): WalkData {
  const where = 'scenarios/walk';
  if (!isRecord(raw)) fail(where, 'not an object');
  if (!isRecord(raw.speeds)) fail(where, 'speeds must be an object');
  if (!Array.isArray(raw.pace)) fail(where, 'pace must be an array');
  for (const [i, z] of (raw.pace as unknown[]).entries()) {
    if (!isRecord(z) || (z.side !== 'E' && z.side !== 'W') || typeof z.fromN !== 'number' || typeof z.toN !== 'number' || !BANDS.includes(z.band as Band)) fail(where, `pace[${i}] malformed`);
  }
  if (!isRecord(raw.signal) || typeof raw.signal.secondsLeft !== 'number') fail(where, 'signal needs a state and secondsLeft');
  if (typeof raw.holdS !== 'number') fail(where, 'holdS must be a number');
  validateBeats(raw.beats, where);
  if (!isRecord(raw.recordings)) fail(where, 'recordings must be an object');
  for (const id of ['hungry', 'errands', 'walking']) {
    const r = raw.recordings[id];
    if (!isRecord(r) || typeof r.duration !== 'number') fail(where, `recording ${id} needs a duration`);
    validateBeats(r.beats, `${where}/${id}`);
  }
  return raw as unknown as WalkData;
}

export const PLACES: readonly PlaceData[] = (() => {
  const list = (placesJson as { places: unknown[] }).places;
  const out = list.map(validatePlace);
  const ids = new Set<string>();
  for (const p of out) {
    if (ids.has(p.id)) fail('places', `duplicate id ${p.id}`);
    ids.add(p.id);
  }
  return out;
})();

export const PLACE_BY_ID: ReadonlyMap<string, PlaceData> = new Map(PLACES.map((p) => [p.id, p]));

export const WALK: Readonly<WalkData> = validateWalk(walkJson);

export const SCENARIO_IDS: readonly ScenarioId[] = ['hungry', 'errands', 'walking'];

export const WALK_SECONDS: Record<ScenarioId, number> = {
  hungry: WALK.recordings.hungry.duration,
  errands: WALK.recordings.errands.duration,
  walking: WALK.recordings.walking.duration,
};

export function isScenarioId(v: unknown): v is ScenarioId {
  return v === 'hungry' || v === 'errands' || v === 'walking';
}

export function place(id: string): PlaceData {
  const p = PLACE_BY_ID.get(id);
  if (!p) throw new Error(`data: no place ${id}`);
  return p;
}
