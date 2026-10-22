import type { KeepOut, Projected, Vec3, Viewport } from '@lumen/shared';

export type { KeepOut } from '@lumen/shared';

export function leaderPoint(from: Vec3, to: Vec3, u: number): Vec3 {
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, z: from.z + (to.z - from.z) * u };
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
