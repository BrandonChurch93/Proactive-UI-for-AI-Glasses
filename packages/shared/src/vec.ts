export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dist2d = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, -1);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const round = (v: number, places = 3): number => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

export const box = (min: Vec3, max: Vec3): Box3 => ({ min, max });
export const boxCenter = (b: Box3): Vec3 => lerp3(b.min, b.max, 0.5);
export const boxAround = (c: Vec3, half: Vec3): Box3 => ({ min: sub(c, half), max: add(c, half) });

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rectIntersection = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};

export const angleWrap = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
};

export function rayBox(origin: Vec3, dir: Vec3, b: Box3): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const o = origin[k];
    const d = dir[k];
    if (Math.abs(d) < 1e-12) {
      if (o < b.min[k] || o > b.max[k]) return null;
      continue;
    }
    let t1 = (b.min[k] - o) / d;
    let t2 = (b.max[k] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}
