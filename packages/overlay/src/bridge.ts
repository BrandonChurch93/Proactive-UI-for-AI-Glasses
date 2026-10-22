import type { KeepOut, Projected, Vec3, Viewport } from '@lumen/shared';

export type { KeepOut } from '@lumen/shared';

export function leaderPoint(from: Vec3, to: Vec3, u: number): Vec3 {
  const c1 = { x: from.x + (to.x - from.x) * 0.3, y: from.y + (to.y - from.y) * 0.3 + 0.15, z: from.z + (to.z - from.z) * 0.3 };
  const c2 = { x: from.x + (to.x - from.x) * 0.75, y: from.y + (to.y - from.y) * 0.75 - 0.1, z: from.z + (to.z - from.z) * 0.75 };
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return {
    x: a * from.x + b * c1.x + c * c2.x + d * to.x,
    y: a * from.y + b * c1.y + c * c2.y + d * to.y,
    z: a * from.z + b * c1.z + c * c2.z + d * to.z,
  };
}

export type LightKind = 'pip' | 'aura' | 'flare' | 'head';

export interface LightHandle {
  set(p: { pos?: Vec3; opacity?: number; scale?: number; scaleX?: number; scaleY?: number; tint?: [number, number, number] }): void;
  dispose(): void;
}

export interface LeaderHandle {
  set(p: { from: Vec3; to: Vec3; progress: number; opacity: number }): void;
  dispose(): void;
}

export interface RouteHandle {
  set(p: { points: Vec3[]; opacity: number; drawn: number; fadeStart: number; fadeEnd: number }): void;
  dispose(): void;
}

export interface ColumnHandle {
  set(p: { pos: Vec3; opacity: number; height: number }): void;
  dispose(): void;
}

export interface GroundTextHandle {
  set(p: { pos: Vec3; yaw: number; text: string; sub?: string; tone: 'go' | 'warn' | 'stop'; opacity: number; arrow?: 'left' | 'right' }): void;
  dispose(): void;
}

export interface SceneBridge {
  viewport(): Viewport;
  project(v: Vec3): Projected;
  unprojectAtDepth(x: number, y: number, depth: number): Vec3;
  camera(): { pos: Vec3; yaw: number; pitch: number };
  anchor(id: string): Vec3 | undefined;
  keepOuts(maxDepth?: number): KeepOut[];
  routePath(to: string, offset: 'center' | 'curb'): Vec3[];
  safetyAnchor(id: string): { pos: Vec3; yaw: number } | undefined;
  createLight(kind: LightKind): LightHandle;
  createLeader(): LeaderHandle;
  createRoute(): RouteHandle;
  createColumn(): ColumnHandle;
  createGroundText(): GroundTextHandle;
  curbDistance(): number;
}
