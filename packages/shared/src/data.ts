import placesJson from '../../../data/places.json';
import hungryJson from '../../../data/scenarios/hungry.json';
import errandsJson from '../../../data/scenarios/errands.json';
import walkingJson from '../../../data/scenarios/walking.json';

export type ScenarioId = 'hungry' | 'errands' | 'walking';
export type Band = 'stopped' | 'stroll' | 'walk' | 'brisk';
export type Side = 'W' | 'E' | 'X';
export type EntityKind = 'food' | 'cafe' | 'theater' | 'venue' | 'shop' | 'service' | 'transit' | 'park' | 'sign';
export type Leg = 'avenue' | 'cross';
export type SignalState = 'walk' | 'flash' | 'dont';
export type LiveValue = number | string | boolean;

export interface DepthRow {
  key?: string;
  title: string;
  sub?: string;
  value?: string;
  tone?: 'go' | 'warn' | 'stop';
  now?: boolean;
}

export interface DepthPayload {
  sub: string;
  yearLabel?: string;
  rows: DepthRow[];
  actions: { id: string; label: string; primary?: boolean }[];
  note?: string;
  after?: Record<string, string>;
}

export interface PlaceCopy {
  card: { meta: string; live: string; year?: string };
  short: string;
  reasons: { goal?: string; world?: string };
  expanded: DepthPayload | null;
  liveLines?: Record<string, string>;
  translate?: boolean;
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

export interface PaceSegment {
  t: number;
  band: Band;
  until?: number | 'signal';
}

interface BeatBase {
  t: number;
}

export type Beat =
  | (BeatBase & { kind: 'gaze'; id: string | null })
  | (BeatBase & { kind: 'pinch'; id: string })
  | (BeatBase & { kind: 'signal'; leg: Leg; state: SignalState; secondsLeft: number })
  | (BeatBase & {
      kind: 'inbox';
      type: 'text' | 'dm' | 'social' | 'app' | 'call';
      id?: string;
      from?: string;
      text?: string;
      count?: number;
      more?: number;
    })
  | (BeatBase & { kind: 'choice'; id: string; action: string })
  | (BeatBase & { kind: 'crossing'; leg: Leg; seconds: number })
  | (BeatBase & { kind: 'arrive'; id: string })
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
  | (BeatBase & { kind: 'bike'; side: 'near' | 'far'; fromBehind: boolean; timeToPath: number });

export type BeatKind = Beat['kind'];

export interface ScenarioData {
  scenario: ScenarioId;
  route: string[];
  destination: string;
  speeds: Record<Band, number>;
  pace: PaceSegment[];
  beats: Beat[];
}

const KINDS: readonly EntityKind[] = ['food', 'cafe', 'theater', 'venue', 'shop', 'service', 'transit', 'park', 'sign'];
const BANDS: readonly Band[] = ['stopped', 'stroll', 'walk', 'brisk'];
const BEAT_KINDS: readonly BeatKind[] = [
  'gaze',
  'pinch',
  'signal',
  'inbox',
  'choice',
  'crossing',
  'arrive',
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
  if (!isRecord(raw.reasons)) fail(where, 'reasons must be an object');
  for (const r of Object.values(raw.reasons)) {
    if (typeof r !== 'string' || r.length > 48) fail(where, `reason over 48 characters: ${String(r)}`);
  }
  return raw as unknown as PlaceData;
}

function validateScenario(raw: unknown, id: ScenarioId): ScenarioData {
  const where = `scenarios/${id}`;
  if (!isRecord(raw)) fail(where, 'not an object');
  if (raw.scenario !== id) fail(where, `scenario field is ${String(raw.scenario)}`);
  if (!Array.isArray(raw.pace) || raw.pace.length === 0) fail(where, 'pace must be a non-empty array');
  let lastT = -1;
  for (const [i, seg] of (raw.pace as unknown[]).entries()) {
    if (!isRecord(seg) || typeof seg.t !== 'number' || !BANDS.includes(seg.band as Band)) {
      fail(where, `pace[${i}] malformed`);
    }
    if (seg.t < lastT) fail(where, `pace[${i}] out of order`);
    lastT = seg.t;
  }
  if (!Array.isArray(raw.beats)) fail(where, 'beats must be an array');
  for (const [i, b] of (raw.beats as unknown[]).entries()) {
    if (!isRecord(b) || typeof b.t !== 'number') fail(where, `beats[${i}] needs a numeric t`);
    if (!BEAT_KINDS.includes(b.kind as BeatKind)) fail(where, `beats[${i}] unknown kind ${String(b.kind)}`);
  }
  if (!isRecord(raw.speeds)) fail(where, 'speeds must be an object');
  return raw as unknown as ScenarioData;
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

export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioData>> = {
  hungry: validateScenario(hungryJson, 'hungry'),
  errands: validateScenario(errandsJson, 'errands'),
  walking: validateScenario(walkingJson, 'walking'),
};

export const SCENARIO_IDS: readonly ScenarioId[] = ['hungry', 'errands', 'walking'];

export const WALK_SECONDS: Record<ScenarioId, number> = { hungry: 98, errands: 100, walking: 102 };

export function isScenarioId(v: unknown): v is ScenarioId {
  return v === 'hungry' || v === 'errands' || v === 'walking';
}

export function place(id: string): PlaceData {
  const p = PLACE_BY_ID.get(id);
  if (!p) throw new Error(`data: no place ${id}`);
  return p;
}
