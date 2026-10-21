import { add, dot, rayBox, rayThrough, scale, v3, type Box3, type CameraPose, type Rect, type Vec3, type Viewport } from '@lumen/shared';
import { ALBEDO, type Collider } from './layout';

export const SHADE = 0.45;

export interface Dynamic {
  box: Box3;
  albedo: number;
}

function faceNormal(b: Box3, p: Vec3): Vec3 {
  const eps = 0.02;
  if (Math.abs(p.x - b.min.x) < eps) return v3(-1, 0, 0);
  if (Math.abs(p.x - b.max.x) < eps) return v3(1, 0, 0);
  if (Math.abs(p.y - b.max.y) < eps) return v3(0, 1, 0);
  if (Math.abs(p.z - b.min.z) < eps) return v3(0, 0, -1);
  if (Math.abs(p.z - b.max.z) < eps) return v3(0, 0, 1);
  return v3(0, -1, 0);
}

export class Backdrop {
  constructor(
    private readonly colliders: readonly Collider[],
    private readonly sun: Vec3,
  ) {}

  private nearest(origin: Vec3, dir: Vec3, dynamic: readonly Dynamic[]): { t: number; box: Box3; albedo: number } | null {
    let best: { t: number; box: Box3; albedo: number } | null = null;
    for (const c of this.colliders) {
      const t = rayBox(origin, dir, c.box);
      if (t !== null && t > 0.05 && (!best || t < best.t)) best = { t, box: c.box, albedo: c.albedo };
    }
    for (const d of dynamic) {
      const t = rayBox(origin, dir, d.box);
      if (t !== null && t > 0.05 && (!best || t < best.t)) best = { t, box: d.box, albedo: d.albedo };
    }
    return best;
  }

  sunlit(p: Vec3, n: Vec3): boolean {
    if (dot(n, this.sun) <= 0.02) return false;
    const o = add(p, scale(n, 0.05));
    for (const c of this.colliders) {
      if (c.kind === 'ground') continue;
      const t = rayBox(o, this.sun, c.box);
      if (t !== null && t > 0.01) return false;
    }
    return true;
  }

  sampleRay(origin: Vec3, dir: Vec3, dynamic: readonly Dynamic[] = []): number {
    const hit = this.nearest(origin, dir, dynamic);
    if (!hit || hit.t > 900) return ALBEDO.sky;
    const p = add(origin, scale(dir, hit.t));
    const n = faceNormal(hit.box, p);
    return Math.min(1, hit.albedo * (this.sunlit(p, n) ? 1 : SHADE));
  }

  sampleRect(pose: CameraPose, vp: Viewport, r: Rect, dynamic: readonly Dynamic[] = []): number {
    const { origin, dir } = rayThrough(pose, vp, r.x + r.w / 2, r.y + r.h / 2);
    return Math.round(this.sampleRay(origin, dir, dynamic) * 1000) / 1000;
  }
}
