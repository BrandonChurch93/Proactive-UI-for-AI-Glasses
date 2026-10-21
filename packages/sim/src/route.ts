import { AVENUE_CROSSWALK, BLOCK, CROSS_CROSSWALK, POST_OFFICE, v3, zOf, type Leg, type ScenarioId, type Vec3 } from '@lumen/shared';

export interface RoutePoint {
  x: number;
  n: number;
}

export interface Route {
  points: Vec3[];
  cum: number[];
  length: number;
  stops: { s: number; leg: Leg; crossEnd: number }[];
  end: number;
}

const P = (x: number, n: number): RoutePoint => ({ x, n });

const AVE_STOP_E = P(BLOCK.avenueHalf + 0.6, AVENUE_CROSSWALK.n);
const AVE_FAR_W = P(-(BLOCK.avenueHalf + 0.6), AVENUE_CROSSWALK.n);
const CROSS_STOP = P(CROSS_CROSSWALK.x, BLOCK.crossFrom - 1.3);
const CROSS_FAR = P(CROSS_CROSSWALK.x, BLOCK.crossTo + 0.7);


const SCAFFOLD_DETOUR: RoutePoint[] = [P(BLOCK.wearerX, 43.2), P(7.75, 45.4), P(7.75, 52.6)];
const BUS_DETOUR: RoutePoint[] = [P(9.9, 55.2), P(9.9, 60.8), P(BLOCK.wearerX, 62.6)];
const eastWithShelter = (to: number): RoutePoint[] => [P(BLOCK.wearerX, 0), P(BLOCK.wearerX, 53.4), ...BUS_DETOUR, P(BLOCK.wearerX, to)];

interface RouteSpec {
  legs: RoutePoint[][];
  crossings: { leg: Leg; afterLeg: number }[];
}

const SPECS: Record<ScenarioId, RouteSpec> = {
  hungry: {
    legs: [
      [...eastWithShelter(85.4), P(8.05, 87.0), AVE_STOP_E],
      [AVE_STOP_E, AVE_FAR_W],
      [AVE_FAR_W, P(-8.5, 86.4), P(-8.6, 78.4), P(-11.2, 77.0)],
    ],
    crossings: [{ leg: 'avenue', afterLeg: 0 }],
  },
  errands: {
    legs: [
      [P(BLOCK.wearerX, 0), ...SCAFFOLD_DETOUR, ...BUS_DETOUR, P(BLOCK.wearerX, 85.6), P(8.9, 87.6), CROSS_STOP],
      [CROSS_STOP, CROSS_FAR],
      [CROSS_FAR, P(12.4, BLOCK.crossTo + 2.1), P(POST_OFFICE.door.x - 1.2, POST_OFFICE.door.n - 1.6), P(POST_OFFICE.door.x, POST_OFFICE.door.n - 1.1)],
    ],
    crossings: [{ leg: 'cross', afterLeg: 0 }],
  },
  walking: {
    legs: [
      [...eastWithShelter(85.4), P(8.05, 87.0), AVE_STOP_E],
      [AVE_STOP_E, AVE_FAR_W],
      [AVE_FAR_W, P(-9.0, 87.1), P(-9.7, 86.7)],
    ],
    crossings: [{ leg: 'avenue', afterLeg: 0 }],
  },
};

function dedupe(points: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.n - p.n) > 1e-6) out.push(p);
  }
  return out;
}

export function buildRoute(scenario: ScenarioId): Route {
  const spec = SPECS[scenario];
  const pts: RoutePoint[] = [];
  const legEnds: number[] = [];
  for (const leg of spec.legs) {
    pts.push(...leg);
    legEnds.push(pts.length - 1);
  }
  const clean = dedupe(pts);
  const points = clean.map((p) => v3(p.x, 0, zOf(p.n)));
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const sOf = (p: RoutePoint): number => {
    const i = clean.findIndex((q) => Math.hypot(q.x - p.x, q.n - p.n) < 1e-6);
    return cum[i]!;
  };
  const stops = spec.crossings.map((c) => {
    const start = spec.legs[c.afterLeg]!.at(-1)!;
    const end = spec.legs[c.afterLeg + 1]!.at(-1)!;
    return { s: sOf(start), leg: c.leg, crossEnd: sOf(end) };
  });
  return { points, cum, length: cum[cum.length - 1]!, stops, end: cum[cum.length - 1]! };
}

export function pointAt(r: Route, s: number): { pos: Vec3; dir: Vec3 } {
  const ss = Math.max(0, Math.min(r.length, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i]! < ss) i++;
  const a = r.points[i - 1]!;
  const b = r.points[i]!;
  const seg = r.cum[i]! - r.cum[i - 1]!;
  const t = seg > 0 ? (ss - r.cum[i - 1]!) / seg : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { pos: v3(a.x + dx * t, 0, a.z + dz * t), dir: v3(dx / l, 0, dz / l) };
}

export function headingAt(r: Route, s: number, window = 1.4): Vec3 {
  const a = pointAt(r, s - window).pos;
  const b = pointAt(r, s + window).pos;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  return l > 1e-6 ? v3(dx / l, 0, dz / l) : pointAt(r, s).dir;
}

export function nearestS(r: Route, p: Vec3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1]!;
    const b = r.points[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    const qx = a.x + dx * t;
    const qz = a.z + dz * t;
    const d = Math.hypot(p.x - qx, p.z - qz);
    if (d < bestD) {
      bestD = d;
      best = r.cum[i - 1]! + Math.sqrt(l2) * t;
    }
  }
  return best;
}
