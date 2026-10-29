import {
  Aside,
  PaneYield,
  Yield,
  LEVEL_RANK,
  NOMINAL_SIZE,
  Placement,
  boxKeepOut,
  doorwayRect,
  clamp,
  leftRecently,
  capKeepOut,
  groundY,
  placeView,
  project,
  roadwayKeepOuts,
  uiScale,
  type BrainFrame,
  type Box3,
  type FrameCtx,
  type HiddenBy,
  type KeepOut,
  type PaneReport,
  type Projector,
  type Rect,
  type Vec3,
  type Viewport,
} from '@lumen/shared';
import { STILL_S, STILL_SPEED } from './people';
import { LANE_BY_ID } from './traffic';
import { SIM_HZ, type Sim } from './sim';

const LOOKAHEAD = 0.45;
const VEHICLE_RANGE_M = 70;
const PERSON_RANGE_M = 28;

function union(a: { rect: Rect; depth: number } | null, b: { rect: Rect; depth: number } | null): { rect: Rect; depth: number } | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.rect.x, b.rect.x);
  const y = Math.min(a.rect.y, b.rect.y);
  const rect = { x, y, w: Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - x, h: Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - y };
  return { rect, depth: Math.min(a.depth, b.depth) };
}

export function keepOuts(sim: Sim, proj: Projector, vp: Viewport, eye: Vec3, maxDepth = Infinity): KeepOut[] {
  const out: KeepOut[] = [];
  const both = (now: { rect: Rect; depth: number } | null, ahead: { rect: Rect; depth: number } | null): { rect: Rect; depth: number; vx?: number } | null => {
    const u = union(now, ahead);
    if (!u || !now || !ahead) return u;
    return { ...u, vx: (ahead.rect.x + ahead.rect.w / 2 - (now.rect.x + now.rect.w / 2)) / LOOKAHEAD };
  };
  const push = (r: { rect: Rect; depth: number; vx?: number } | null, kind: KeepOut['kind'], moving: boolean, id: string, still = false): void => {
    if (!r || r.depth >= maxDepth) return;
    const k: KeepOut = { rect: capKeepOut(r.rect, vp), full: r.rect, kind, moving, id, depth: r.depth };
    if (still) k.still = true;
    if (r.vx !== undefined) k.vx = r.vx;
    out.push(k);
  };
  for (const v of sim.traffic.vehicles) {
    const b = sim.traffic.bounds(v);
    if (Math.hypot((b.min.x + b.max.x) / 2 - eye.x, (b.min.z + b.max.z) / 2 - eye.z) > VEHICLE_RANGE_M) continue;
    const lane = LANE_BY_ID.get(v.lane)!;
    const dx = lane.dir.x * v.v * LOOKAHEAD;
    const dz = lane.dir.z * v.v * LOOKAHEAD;
    const ahead = { min: { x: b.min.x + dx, y: b.min.y, z: b.min.z + dz }, max: { x: b.max.x + dx, y: b.max.y, z: b.max.z + dz } };
    push(both(boxKeepOut(b, proj, vp), boxKeepOut(ahead, proj, vp)), 'vehicle', v.v >= 0.3, v.id);
  }
  for (const p of sim.people.people) {
    if (!p.alive || p.spawnAt > sim.t) continue;
    if (Math.hypot(p.pos.x - eye.x, p.pos.z - eye.z) > PERSON_RANGE_M) continue;
    const vx = -Math.sin(p.heading) * p.speed * LOOKAHEAD;
    const vz = -Math.cos(p.heading) * p.speed * LOOKAHEAD;
    const box = (ox: number, oz: number, y0: number, y1: number): Box3 => ({
      min: { x: p.pos.x + ox - 0.3, y: y0, z: p.pos.z + oz - 0.3 },
      max: { x: p.pos.x + ox + 0.3, y: y1, z: p.pos.z + oz + 0.3 },
    });
    const g = groundY(p.pos.x, p.pos.z);
    const body = both(boxKeepOut(box(0, 0, g, g + p.height), proj, vp), boxKeepOut(box(vx, vz, g, g + p.height), proj, vp));
    if (!body || body.rect.h < 30) continue;
    const moving = p.speed > STILL_SPEED;
    const still = p.stillSince !== null && sim.t - p.stillSince >= STILL_S;
    push(body, 'person', moving, p.id, still);
    let dh = Math.atan2(-(eye.x - p.pos.x), -(eye.z - p.pos.z)) - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    if (Math.abs(dh) < 1.1) {
      push(both(boxKeepOut(box(0, 0, g + p.height - 0.3, g + p.height), proj, vp), boxKeepOut(box(vx, vz, g + p.height - 0.3, g + p.height), proj, vp)), 'face', moving, `${p.id}:face`, still);
    }
  }
  out.push(...roadwayKeepOuts(proj, vp));
  return out;
}

const VIEW_SIZE: Record<string, { w: number; h: number }> = {
  thread: { w: 300, h: 150 },
  menu: { w: 360, h: 430 },
  map: { w: 180, h: 180 },
  toast: { w: 300, h: 84 },
  call: { w: 300, h: 96 },
  strip: { w: 280, h: 44 },
  pocket: { w: 300, h: 92 },
  ask: { w: 280, h: 74 },
  followup: { w: 320, h: 84 },
  whisper: { w: 360, h: 26 },
  place: { w: 292, h: 152 },
};

interface HeadlessItem {
  place: Placement;
  aside: Aside;
  yieldS: PaneYield;
  pane: PaneReport | null;
  lookedAt: number;
  frozen: Rect | null;
}

const hidden = (id: string, level: PaneReport['level'], gaze: boolean, by: HiddenBy): PaneReport => ({ id, level, zone: 'world', rect: { x: 0, y: 0, w: 0, h: 0 }, opacity: 0, gaze, visible: false, hiddenBy: by });

export class HeadlessView {
  private items = new Map<string, HeadlessItem>();
  private frame: BrainFrame | null = null;
  private readonly scan = new Yield();

  advanceTo(sim: Sim, t: number): void {
    const dt = 1 / SIM_HZ;
    while (sim.t < t - 1e-7) {
      sim.step(dt);
      this.update(sim);
    }
  }

  apply(frame: BrainFrame): void {
    this.frame = frame;
    for (const id of [...this.items.keys()]) if (!frame.items.some((d) => d.id === id)) this.items.delete(id);
  }

  private update(sim: Sim): void {
    const frame = this.frame;
    if (!frame) return;
    const vp = sim.viewport;
    const pose = sim.cameraPose();
    const proj = (v: Vec3): ReturnType<typeof project> => project(pose, vp, v);
    const anchors = new Map<string, Vec3>();
    let reach = 0;
    for (const d of frame.items) {
      if (d.placement.zone !== 'world') continue;
      const a = sim.anchorOf(d.placement.anchor);
      if (!a) continue;
      anchors.set(d.id, a);
      if (LEVEL_RANK[d.level] >= LEVEL_RANK.label && d.level !== 'whisper') reach = Math.max(reach, proj(a).depth);
    }
    const side = this.scan.update({ t: sim.t, yawRate: sim.head.yawRate, curbDistance: sim.wearer.curbDistance(), yaw: sim.head.yaw, target: sim.gaze.target });
    const ctx: FrameCtx = { t: sim.t, band: frame.band, vp, keepOuts: keepOuts(sim, proj, vp, pose.pos, reach), ui: uiScale(vp), scanning: side !== null };
    const taken: Rect[] = [];
    const rankOf = (d: (typeof frame.items)[number]): number => (d.placement.focusOk ? 0 : LEVEL_RANK[d.level] > LEVEL_RANK.label ? 1 : 2);
    const depthOf = (d: (typeof frame.items)[number]): number => {
      const a = anchors.get(d.id);
      return a ? proj(a).depth : Infinity;
    };
    const order = [...frame.items].sort((a, b) => rankOf(a) - rankOf(b) || depthOf(a) - depthOf(b));
    for (const d of order) {
      const a = anchors.get(d.id);
      if (!a) continue;
      let it = this.items.get(d.id);
      if (!it) {
        it = { place: new Placement(), aside: new Aside(), yieldS: new PaneYield(), pane: null, lookedAt: -Infinity, frozen: null };
        this.items.set(d.id, it);
      }
      const lv = d.level === 'label' || d.level === 'glance' || d.level === 'card' || d.level === 'expanded' ? d.level : 'label';
      const pr = proj(a);
      if (d.placement.focusOk) it.lookedAt = sim.t;
      if (it.frozen && it.yieldS.on && it.pane?.visible && LEVEL_RANK[d.level] >= LEVEL_RANK.label) {
        const paneSide = it.frozen.x + it.frozen.w / 2 < vp.w / 2 ? 'left' : 'right';
        const y = it.yieldS.update(sim.t, side !== null ? paneSide : null, paneSide);
        if (it.yieldS.on) {
          it.pane = { ...it.pane, level: d.level, gaze: Boolean(d.gaze), rect: round({ ...it.frozen, x: it.frozen.x + y.dx }), opacity: Math.round(y.opacity * 1000) / 1000 };
          continue;
        }
        it.frozen = null;
      }
      const exempt = Boolean(d.placement.focusOk) || leftRecently(sim.t, it.lookedAt);
      const placed = it.place.update(
        { level: lv, anchor: pr, distance: Math.hypot(a.x - pose.pos.x, a.y - pose.pos.y, a.z - pose.pos.z), size: NOMINAL_SIZE[lv], focusOk: exempt, zoneOk: Boolean(d.placement.zoneOk), left: exempt && !d.placement.focusOk, doorway: doorwayRect(d.placement.anchor, proj, vp) },
        taken.length ? { ...ctx, chrome: [...(ctx.chrome ?? []), ...taken] } : ctx,
      );
      if (placed.mode === 'pane' && LEVEL_RANK[d.level] >= LEVEL_RANK.label && d.level !== 'whisper') {
        const r = placed.rect;
        taken.push({ x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 });
      }
      const gaze = Boolean(d.gaze);
      if (placed.mode === 'edge') {
        it.pane = hidden(d.id, d.level, gaze, placed.behind ? 'offscreen' : 'edge');
        continue;
      }
      if (LEVEL_RANK[d.level] < LEVEL_RANK.label || d.level === 'whisper') {
        it.pane = { id: d.id, level: d.level, zone: 'world', rect: { x: 0, y: 0, w: 0, h: 0 }, opacity: 0, gaze, visible: true };
        continue;
      }
      if (placed.mode !== 'pane') {
        it.pane = hidden(d.id, d.level, gaze, 'room');
        continue;
      }
      const home = { x: placed.rect.x + it.place.jumpX.at(sim.t), y: placed.rect.y + it.place.jumpY.at(sim.t), w: placed.rect.w, h: placed.rect.h };
      const s = it.aside.update(home, ctx, exempt || Boolean(d.placement.zoneOk), pr.depth, pr);
      if (s.dropped) {
        it.pane = hidden(d.id, d.level, gaze, 'keepout');
        continue;
      }
      const level = placed.collapsed && LEVEL_RANK[placed.collapsed] < LEVEL_RANK[d.level] ? placed.collapsed : d.level;
      const paneSide = home.x + home.w / 2 < vp.w / 2 ? 'left' : 'right';
      const y = it.yieldS.update(sim.t, placed.stilled ? paneSide : side, paneSide);
      if (it.yieldS.on) it.frozen ??= { ...home, x: home.x + s.dx, y: home.y + s.dy };
      else it.frozen = null;
      const x = clamp(home.x + s.dx + y.dx, 0, Math.max(0, vp.w - home.w));
      it.pane = { id: d.id, level, zone: 'world', rect: round({ ...home, x, y: clamp(home.y + s.dy, 0, Math.max(0, vp.h - home.h)) }), opacity: Math.round(s.opacity * y.opacity * 1000) / 1000, gaze, visible: true };
    }
  }

  report(sim: Sim): { w: number; h: number; panes: PaneReport[] } {
    const vp = sim.viewport;
    const panes: PaneReport[] = [];
    const stack = new Map<string, number>();
    let below = 0;
    for (const d of this.frame?.items ?? []) {
      if (d.placement.zone !== 'view' || d.placement.anchor !== 'view:edge-top') continue;
      const size = VIEW_SIZE[d.component] ?? VIEW_SIZE.toast!;
      const r = placeView('view:edge-top', size, vp, stack.get('top') ?? 0, 0, uiScale(vp));
      stack.set('top', (stack.get('top') ?? 0) + 1);
      below = Math.max(below, r.y + r.h + 10);
    }
    stack.clear();
    let tuck = 0;
    for (const d of this.frame?.items ?? []) {
      if (d.placement.zone === 'ground' || d.component === 'whisper') continue;
      if (d.placement.zone === 'view') {
        const slot = d.placement.anchor.startsWith('view:') ? d.placement.anchor : 'view:edge-right';
        const size = d.level === 'expanded' ? NOMINAL_SIZE.expanded : (VIEW_SIZE[d.component] ?? VIEW_SIZE.toast!);
        const i = stack.get(slot) ?? 0;
        stack.set(slot, i + 1);
        const rect = placeView(slot, size, vp, i, slot === 'view:edge-right' ? below : slot === 'view:banner' ? tuck : 0, uiScale(vp));
        if (slot === 'view:banner' && d.component !== 'strip') tuck = rect.y + rect.h + 6 * uiScale(vp);
        panes.push({ id: d.id, level: d.level, zone: 'view', rect: round(rect), opacity: 1, gaze: Boolean(d.gaze), visible: true });
        continue;
      }
      const p = this.items.get(d.id)?.pane;
      if (p) panes.push(p);
    }
    return { w: vp.w, h: vp.h, panes };
  }
}

function round(r: Rect): Rect {
  const k = (v: number): number => Math.round(v * 10) / 10;
  return { x: k(r.x), y: k(r.y), w: k(r.w), h: k(r.h) };
}
