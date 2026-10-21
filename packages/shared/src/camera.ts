import { add, dot, scale, v3, type Vec3 } from './vec';

export interface CameraPose {
  pos: Vec3;
  yaw: number;
  pitch: number;
  fov: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
  inFront: boolean;
}

export const EYE_HEIGHT = 1.68;

export function fovForAspect(aspect: number): number {
  return aspect < 0.8 ? 70 : aspect < 1.2 ? 62 : 56;
}

export function basis(yaw: number, pitch: number): { fwd: Vec3; right: Vec3; up: Vec3 } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    fwd: v3(-sy * cp, sp, -cy * cp),
    right: v3(cy, 0, -sy),
    up: v3(sy * sp, cp, cy * sp),
  };
}

export function yawToward(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function pitchToward(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(to.y - from.y, Math.hypot(dx, dz));
}

export function project(pose: CameraPose, vp: Viewport, p: Vec3): Projected {
  const { fwd, right, up } = basis(pose.yaw, pose.pitch);
  const d = v3(p.x - pose.pos.x, p.y - pose.pos.y, p.z - pose.pos.z);
  const cz = dot(d, fwd);
  const cx = dot(d, right);
  const cyv = dot(d, up);
  const tanH = Math.tan(((pose.fov * Math.PI) / 180) / 2);
  const aspect = vp.w / vp.h;
  const z = Math.abs(cz) < 1e-6 ? 1e-6 : cz;
  const nx = cx / (z * tanH * aspect);
  const ny = cyv / (z * tanH);
  return { x: (nx * 0.5 + 0.5) * vp.w, y: (-ny * 0.5 + 0.5) * vp.h, depth: cz, inFront: cz > 0.05 };
}

export function rayThrough(pose: CameraPose, vp: Viewport, sx: number, sy: number): { origin: Vec3; dir: Vec3 } {
  const { fwd, right, up } = basis(pose.yaw, pose.pitch);
  const tanH = Math.tan(((pose.fov * Math.PI) / 180) / 2);
  const aspect = vp.w / vp.h;
  const nx = (sx / vp.w) * 2 - 1;
  const ny = -((sy / vp.h) * 2 - 1);
  const dir = add(add(fwd, scale(right, nx * tanH * aspect)), scale(up, ny * tanH));
  const l = Math.hypot(dir.x, dir.y, dir.z);
  return { origin: pose.pos, dir: scale(dir, 1 / l) };
}

export function angleOffAxis(pose: CameraPose, p: Vec3): number {
  const { fwd } = basis(pose.yaw, pose.pitch);
  const d = v3(p.x - pose.pos.x, p.y - pose.pos.y, p.z - pose.pos.z);
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dot(d, fwd) / l)));
}
