import {
  NOMINAL_SIZE,
  placeView,
  placeWorld,
  project,
  type BrainFrame,
  type Box3,
  type CameraPose,
  type PaneReport,
  type Rect,
  type Viewport,
} from '@lumen/shared';
import type { Sim } from './sim';

export function screenRect(pose: CameraPose, vp: Viewport, b: Box3): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let any = false;
  for (let i = 0; i < 8; i++) {
    const p = project(pose, vp, {
      x: i & 1 ? b.max.x : b.min.x,
      y: i & 2 ? b.max.y : b.min.y,
      z: i & 4 ? b.max.z : b.min.z,
    });
    if (!p.inFront) continue;
    any = true;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!any || x1 < 0 || y1 < 0 || x0 > vp.w || y0 > vp.h) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function keepOuts(sim: Sim, pose: CameraPose, vp: Viewport): Rect[] {
  const out: Rect[] = [];
  for (const v of sim.traffic.vehicles) {
    if (v.v < 0.3) continue;
    const r = screenRect(pose, vp, sim.traffic.bounds(v));
    if (r) out.push(r);
  }
  for (const p of sim.people.people) {
    if (!p.alive) continue;
    const r = screenRect(pose, vp, { min: { x: p.pos.x - 0.3, y: 0, z: p.pos.z - 0.3 }, max: { x: p.pos.x + 0.3, y: p.height, z: p.pos.z + 0.3 } });
    if (r && r.h > 30) out.push(r);
  }
  return out;
}

const VIEW_SIZE: Record<string, { w: number; h: number }> = {
  errands: { w: 300, h: 150 },
  toast: { w: 300, h: 84 },
  call: { w: 300, h: 96 },
  strip: { w: 280, h: 44 },
  pocket: { w: 300, h: 92 },
  ask: { w: 280, h: 74 },
  followup: { w: 320, h: 84 },
  whisper: { w: 360, h: 26 },
  place: { w: 292, h: 152 },
};

export function headlessView(frame: BrainFrame, sim: Sim): { w: number; h: number; panes: PaneReport[] } {
  const vp = sim.viewport;
  const pose = sim.cameraPose();
  const kos = keepOuts(sim, pose, vp);
  const panes: PaneReport[] = [];
  const stack = new Map<string, number>();
  for (const d of frame.items) {
    if (d.placement.zone === 'ground') continue;
    if (d.level === 'pip') continue;
    if (d.placement.zone === 'view') {
      const slot = d.placement.anchor.startsWith('view:') ? d.placement.anchor : 'view:edge-right';
      const size = d.level === 'expanded' ? NOMINAL_SIZE.expanded : (VIEW_SIZE[d.component] ?? VIEW_SIZE.toast!);
      const i = stack.get(slot) ?? 0;
      stack.set(slot, i + 1);
      panes.push({ id: d.id, level: d.level, zone: 'view', rect: round(placeView(slot, size, vp, i)), opacity: 1, gaze: Boolean(d.gaze) });
      continue;
    }
    const a = sim.anchorOf(d.placement.anchor);
    if (!a) continue;
    const lvl = d.level === 'whisper' ? 'glance' : d.level;
    const size = NOMINAL_SIZE[lvl as 'glance' | 'card' | 'expanded'] ?? NOMINAL_SIZE.glance;
    const pr = project(pose, vp, a);
    const placed = placeWorld({
      level: d.level,
      anchor: pr,
      distance: Math.hypot(a.x - pose.pos.x, a.y - pose.pos.y, a.z - pose.pos.z),
      size,
      band: frame.band,
      viewport: vp,
      focusOk: Boolean(d.placement.focusOk),
      keepOuts: kos,
    });
    if (placed.mode === 'offscreen' || placed.mode === 'pip') continue;
    panes.push({ id: d.id, level: placed.collapsed ?? d.level, zone: 'world', rect: round(placed.rect), opacity: 1, gaze: Boolean(d.gaze) });
  }
  return { w: vp.w, h: vp.h, panes };
}

function round(r: Rect): Rect {
  const k = (v: number): number => Math.round(v * 10) / 10;
  return { x: k(r.x), y: k(r.y), w: k(r.w), h: k(r.h) };
}
