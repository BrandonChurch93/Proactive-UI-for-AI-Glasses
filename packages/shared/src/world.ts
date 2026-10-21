import type { PlaceData } from './data';
import { v3, type Vec3 } from './vec';

export const BLOCK = {
  length: 90,
  crossFrom: 90,
  crossTo: 104,
  avenueHalf: 7,
  sidewalk: 6,
  buildingLine: 13,
  wearerX: 8.3,
  laneX: [1.75, 5.25] as const,
  crossHalf: 7,
  crossCenterN: 97,
  southLineN: 84,
  northLineN: 110,
} as const;

export const zOf = (n: number): number => -n;
export const nOf = (z: number): number => -z;

export const AVENUE_CROSSWALK = { n: 87.6, half: 1.8 } as const;
export const CROSS_CROSSWALK = { x: 9.6, half: 1.8 } as const;
export const AVENUE_CROSSWALK_N = AVENUE_CROSSWALK.n;

export const POST_OFFICE = { x: 19.5, n: BLOCK.northLineN, door: { x: 19.5, n: BLOCK.northLineN - 0.4 } } as const;

const SPECIAL_ANCHORS: Record<string, (h: number) => Vec3> = {
  'm4-stop': (h) => v3(BLOCK.avenueHalf + 1.1, h, zOf(58)),
  '47th-st-station': (h) => v3(BLOCK.avenueHalf + 3.3, h, zOf(87.2)),
  'pocket-park': (h) => v3(-(BLOCK.avenueHalf + 4.4), h, zOf(85.6)),
  'post-office': (h) => v3(POST_OFFICE.x, h, zOf(POST_OFFICE.n - 0.3)),
};

const DOORS: Record<string, Vec3> = {
  'm4-stop': v3(BLOCK.avenueHalf + 1.1, 0, zOf(58)),
  '47th-st-station': v3(BLOCK.avenueHalf + 3.3, 0, zOf(86.6)),
  'pocket-park': v3(-10.8, 0, zOf(86.2)),
  'post-office': v3(POST_OFFICE.door.x, 0, zOf(POST_OFFICE.door.n)),
  'mega-burger': v3(-12.7, 0, zOf(76.6)),
  'main-street-pharmacy': v3(12.7, 0, zOf(35.6)),
};

export function placeAnchor(p: PlaceData): Vec3 {
  const special = SPECIAL_ANCHORS[p.id];
  if (special) return special(p.anchor.height);
  const n = p.n ?? [0, 0];
  const mid = (n[0] + n[1]) / 2;
  const x = p.side === 'E' ? BLOCK.buildingLine - 0.25 : -(BLOCK.buildingLine - 0.25);
  return v3(x, p.anchor.height, zOf(mid));
}

export function placeDoor(p: PlaceData): Vec3 {
  const d = DOORS[p.id];
  if (d) return d;
  const a = placeAnchor(p);
  const x = p.side === 'E' ? BLOCK.buildingLine - 0.3 : -(BLOCK.buildingLine - 0.3);
  return v3(x, 0, a.z);
}
