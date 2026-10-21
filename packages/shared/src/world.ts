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
  crosswalkWidth: 3.2,
} as const;

export const zOf = (n: number): number => -n;
export const nOf = (z: number): number => -z;

export const AVENUE_CROSSWALK_N = 88.2;
export const CROSS_CROSSWALK_X = BLOCK.wearerX + 1.2;

export const POST_OFFICE = { n: 106.5, x: 22, door: { n: 104.6, x: 22 } } as const;

export function placeAnchor(p: PlaceData): Vec3 {
  if (p.side === 'X' || p.n === null) return v3(POST_OFFICE.x, p.anchor.height, zOf(POST_OFFICE.n - 1.6));
  const mid = (p.n[0] + p.n[1]) / 2;
  if (p.id === 'm4-stop') return v3(BLOCK.avenueHalf + 0.9, p.anchor.height, zOf(mid));
  if (p.id === '47th-st-station') return v3(BLOCK.avenueHalf + 2.2, p.anchor.height, zOf(87.4));
  if (p.id === 'pocket-park') return v3(-(BLOCK.avenueHalf + 3.4), p.anchor.height, zOf(85));
  const x = p.side === 'E' ? BLOCK.buildingLine - 0.25 : -(BLOCK.buildingLine - 0.25);
  return v3(x, p.anchor.height, zOf(mid));
}

export function placeDoor(p: PlaceData): Vec3 {
  if (p.side === 'X' || p.n === null) return v3(POST_OFFICE.door.x, 0, zOf(POST_OFFICE.door.n));
  const a = placeAnchor(p);
  const x = p.side === 'E' ? BLOCK.buildingLine - 0.4 : -(BLOCK.buildingLine - 0.4);
  if (p.id === 'm4-stop' || p.id === '47th-st-station' || p.id === 'pocket-park') return v3(a.x, 0, a.z);
  return v3(x, 0, a.z);
}
