import type { Projected, Viewport } from './camera';
import { PLACE_BY_ID } from './data';
import { BLOCK, placeDoor, zOf } from './world';
import type { Box3, Rect, Vec3 } from './vec';

export type KeepOutKind = 'vehicle' | 'person' | 'face' | 'roadway';

export interface KeepOut {
  rect: Rect;
  full?: Rect;
  kind: KeepOutKind;
  moving: boolean;
  still?: boolean;
  id: string;
  depth: number;
  vx?: number;
}

export type Projector = (v: Vec3) => Projected;

export const KEEPOUT = {
  nearM: 0.3,
  cap: 0.6,
  roadFromM: 2,
  roadToM: 60,
  roadCut: 0.48,
  roadBands: 4,
} as const;

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

const BOX_EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) BOX_EDGES.push([i, i | bit]);

function clipPoly<T>(poly: T[], inside: (p: T) => number, cut: (a: T, b: T, k: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = inside(a);
    const db = inside(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(cut(a, b, da / (da - db)));
  }
  return out;
}

type P2 = { x: number; y: number };
const lerp2 = (a: P2, b: P2, k: number): P2 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// The opening a place's door light stands in: where people go in and out, which a pane at the door never covers.
export const DOORWAY = { halfM: 1.0, topM: 2.2, clearPx: 40, reach: 0.95 } as const;

export function doorwayRect(anchor: string, proj: Projector, vp: Viewport): Rect | null {
  if (!anchor.startsWith('door:')) return null;
  const p = PLACE_BY_ID.get(anchor.slice(5));
  if (!p) return null;
  const d = placeDoor(p);
  const alongX = p.side === 'X';
  const h = DOORWAY.halfM;
  const box: Box3 = alongX
    ? { min: { x: d.x - h, y: 0, z: d.z - 0.05 }, max: { x: d.x + h, y: DOORWAY.topM, z: d.z + 0.05 } }
    : { min: { x: d.x - 0.05, y: 0, z: d.z - h }, max: { x: d.x + 0.05, y: DOORWAY.topM, z: d.z + h } };
  return boxKeepOut(box, proj, vp)?.rect ?? null;
}

export function boxKeepOut(b: Box3, proj: Projector, vp: Viewport): { rect: Rect; depth: number } | null {
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) corners.push({ x: i & 1 ? b.max.x : b.min.x, y: i & 2 ? b.max.y : b.min.y, z: i & 4 ? b.max.z : b.min.z });
  const depth = corners.map((c) => proj(c).depth);
  const near = KEEPOUT.nearM;
  const pts: P2[] = [];
  let nearest = Infinity;
  const add = (p: Vec3): void => {
    const s = proj(p);
    pts.push({ x: s.x, y: s.y });
    nearest = Math.min(nearest, Math.max(near, s.depth));
  };
  for (const [i, j] of BOX_EDGES) {
    const di = depth[i]!;
    const dj = depth[j]!;
    if (di < near && dj < near) continue;
    if (di >= near) add(corners[i]!);
    if (dj >= near) add(corners[j]!);
    if ((di < near) !== (dj < near)) add(lerp3(corners[i]!, corners[j]!, (near - di) / (dj - di)));
  }
  if (pts.length < 3) return null;
  let hull = convexHull(pts);
  for (const f of [(p: P2) => p.x, (p: P2) => vp.w - p.x, (p: P2) => p.y, (p: P2) => vp.h - p.y]) hull = clipPoly(hull, f, lerp2);
  if (hull.length < 3) return null;
  const x0 = Math.min(...hull.map((p) => p.x));
  const y0 = Math.min(...hull.map((p) => p.y));
  const x1 = Math.max(...hull.map((p) => p.x));
  const y1 = Math.max(...hull.map((p) => p.y));
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, depth: nearest };
}

function convexHull(pts: P2[]): P2[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P2, a: P2, b: P2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function capSpan(a: number, len: number, view: number): [number, number] {
  const max = view * KEEPOUT.cap;
  if (len <= max) return [a, len];
  const atStart = a <= 0.5;
  const atEnd = a + len >= view - 0.5;
  if (atStart && !atEnd) return [a + len - max, max];
  if (atEnd && !atStart) return [a, max];
  return [a + (len - max) / 2, max];
}

export function capKeepOut(r: Rect, vp: Viewport): Rect {
  const [x, w] = capSpan(r.x, r.w, vp.w);
  const [y, h] = capSpan(r.y, r.h, vp.h);
  return { x, y, w, h };
}

const FAR = 400;
const ROAD_SURFACES: Vec3[][] = [
  [
    { x: -BLOCK.avenueHalf, y: 0, z: zOf(-FAR) },
    { x: BLOCK.avenueHalf, y: 0, z: zOf(-FAR) },
    { x: BLOCK.avenueHalf, y: 0, z: zOf(FAR) },
    { x: -BLOCK.avenueHalf, y: 0, z: zOf(FAR) },
  ],
  [
    { x: -FAR, y: 0, z: zOf(BLOCK.crossFrom) },
    { x: FAR, y: 0, z: zOf(BLOCK.crossFrom) },
    { x: FAR, y: 0, z: zOf(BLOCK.crossTo) },
    { x: -FAR, y: 0, z: zOf(BLOCK.crossTo) },
  ],
];

export function roadwayKeepOuts(proj: Projector, vp: Viewport): KeepOut[] {
  const out: KeepOut[] = [];
  const top = vp.h * KEEPOUT.roadCut;
  ROAD_SURFACES.forEach((surface, si) => {
    let poly = clipPoly(surface, (p) => proj(p).depth - KEEPOUT.roadFromM, lerp3);
    poly = clipPoly(poly, (p) => KEEPOUT.roadToM - proj(p).depth, lerp3);
    if (poly.length < 3) return;
    let flat: P2[] = poly.map((p) => proj(p));
    for (const f of [(p: P2) => p.x, (p: P2) => vp.w - p.x, (p: P2) => p.y - top, (p: P2) => vp.h - p.y]) flat = clipPoly(flat, f, lerp2);
    if (flat.length < 3) return;
    const y0 = Math.min(...flat.map((p) => p.y));
    const y1 = Math.max(...flat.map((p) => p.y));
    const n = KEEPOUT.roadBands;
    for (let k = 0; k < n; k++) {
      const a = y0 + ((y1 - y0) * k) / n;
      const b = y0 + ((y1 - y0) * (k + 1)) / n;
      const band = clipPoly(clipPoly(flat, (p) => p.y - a, lerp2), (p) => b - p.y, lerp2);
      if (band.length < 3) continue;
      const x0 = Math.min(...band.map((p) => p.x));
      const x1 = Math.max(...band.map((p) => p.x));
      if (x1 - x0 < 1) continue;
      out.push({ rect: { x: x0, y: a, w: x1 - x0, h: b - a }, kind: 'roadway', moving: false, id: `roadway:${si}:${k}`, depth: 0 });
    }
  });
  return out;
}

export function keepOutsFor(kos: readonly KeepOut[], anchorDepth: number): KeepOut[] {
  return kos.filter((k) => k.kind === 'roadway' || k.depth < anchorDepth);
}
