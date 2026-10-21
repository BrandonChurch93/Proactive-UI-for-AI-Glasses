import {
  MARGIN,
  configRect,
  distanceScale,
  focusRect,
  placeWorld,
  rectsOverlap,
  type Band,
  type Level,
  type PlaceInput,
  type Projected,
  type Rect,
  type Viewport,
} from '@lumen/shared';
import type { KeepOut } from './bridge';
import { MOVE } from './tokens';

export type Curve = 'out' | 'out2' | 'in' | 'gate' | 'linear';

const CURVES: Record<Curve, (x: number) => number> = {
  out: (x) => 1 - (1 - x) ** 4,
  out2: (x) => 1 - (1 - x) ** 3,
  in: (x) => x ** 3,
  gate: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  linear: (x) => x,
};

export class Track {
  private from: number;
  private to: number;
  private start = 0;
  private dur = 0;
  private curve: Curve = 'linear';

  constructor(v: number) {
    this.from = v;
    this.to = v;
  }

  get target(): number {
    return this.to;
  }

  at(t: number): number {
    if (this.dur <= 0 || t >= this.start + this.dur) return this.to;
    if (t <= this.start) return this.from;
    return this.from + (this.to - this.from) * CURVES[this.curve]((t - this.start) / this.dur);
  }

  go(t: number, to: number, dur: number, curve: Curve): void {
    if (to === this.to) return;
    this.from = this.at(t);
    this.to = to;
    this.start = t;
    this.dur = dur;
    this.curve = curve;
  }

  set(v: number): void {
    this.from = v;
    this.to = v;
    this.dur = 0;
  }
}

export interface FrameCtx {
  t: number;
  band: Band;
  vp: Viewport;
  keepOuts: readonly KeepOut[];
  focusOk?: boolean;
}

export interface PlaceRequest {
  level: Level;
  anchor: Projected;
  distance: number;
  size: { w: number; h: number };
  focusOk: boolean;
}

export type PlaceMode = 'pane' | 'pip' | 'edge';

export interface WorldPlace {
  mode: PlaceMode;
  rect: Rect;
  leader: { x: number; y: number };
  scale: number;
  side: 'left' | 'right';
  collapsed?: Level;
  edge?: { x: number; y: number };
}

interface Config {
  side: 'left' | 'right';
  vertical: 'above' | 'below';
  shrink: number | null;
}

export class Placement {
  private cfg: Config | null = null;
  private cfgAt = -Infinity;
  private shown: Rect | null = null;
  private offSince: number | null = null;
  private collapsed: Level | undefined;
  private last: WorldPlace | null = null;
  readonly jumpX = new Track(0);
  readonly jumpY = new Track(0);
  pinned: 'left' | 'right' | null = null;

  constructor(private enterEdge: boolean) {}

  reset(): void {
    this.cfg = null;
    this.shown = null;
    this.last = null;
  }

  update(req: PlaceRequest, ctx: FrameCtx): WorldPlace {
    const { vp, t } = ctx;
    const a = req.anchor;
    const out = !a.inFront || a.x < -20 || a.x > vp.w + 20 || a.y < -20 || a.y > vp.h + 20;
    if (out) {
      this.offSince ??= t;
      if (t - this.offSince >= MOVE.offscreenMs / 1000 || !this.last) {
        const behind = !a.inFront;
        const left = behind ? a.x > vp.w / 2 : a.x < vp.w / 2;
        const y = Math.max(40, Math.min(vp.h - 40, behind ? vp.h / 2 : a.y));
        this.shown = null;
        this.cfg = null;
        const edge = { x: left ? 6 : vp.w - 6, y };
        return { mode: 'edge', rect: { x: edge.x, y, w: 0, h: 0 }, leader: edge, scale: 1, side: left ? 'left' : 'right', edge };
      }
      return this.last;
    }
    this.offSince = null;

    const edgeFrac = Math.min(a.x, vp.w - a.x) / vp.w;
    const big = req.level === 'card' || req.level === 'expanded';
    if (big) {
      if (edgeFrac < 0.08) this.collapsed = 'glance';
      else if (edgeFrac > 0.1) this.collapsed = undefined;
    } else if (req.level === 'glance') {
      if (edgeFrac < 0.04) this.collapsed = 'pip';
      else if (edgeFrac > 0.055) this.collapsed = undefined;
    } else this.collapsed = undefined;
    if (this.collapsed === 'pip') {
      return this.remember({ mode: 'pip', rect: { x: a.x, y: a.y, w: 0, h: 0 }, leader: { x: a.x, y: a.y }, scale: 1, side: a.x < vp.w / 2 ? 'left' : 'right', collapsed: 'pip' });
    }

    let jump: number | null = null;
    if (this.pinned && ctx.band === 'stopped') {
      this.pinned = null;
      jump = MOVE.inward;
    }

    const inp: PlaceInput = {
      level: req.level,
      anchor: a,
      distance: req.distance,
      size: req.size,
      band: ctx.band,
      viewport: vp,
      focusOk: req.focusOk,
      keepOuts: ctx.keepOuts.map((k) => k.rect),
    };
    const scaleOf = (c: Config): number => c.shrink ?? distanceScale(req.distance);
    let res = this.cfg ? configRect(inp, this.cfg.side, this.cfg.vertical, scaleOf(this.cfg)) : null;
    if (!res || !res.ok) {
      const near: 'left' | 'right' = a.x < vp.w / 2 ? 'left' : 'right';
      const placed = placeWorld({ ...inp, prefer: { side: this.cfg?.side ?? near, vertical: this.cfg?.vertical ?? 'above' } });
      if (placed.mode === 'pip' || placed.mode === 'offscreen') {
        return this.remember({ mode: 'pip', rect: { x: a.x, y: a.y, w: 0, h: 0 }, leader: { x: a.x, y: a.y }, scale: 1, side: near });
      }
      const fresh = !this.cfg;
      const shrink = Math.abs(placed.scale - distanceScale(req.distance)) > 1e-6 ? placed.scale : null;
      this.cfg = { side: placed.side, vertical: placed.vertical, shrink };
      this.cfgAt = t;
      res = configRect(inp, placed.side, placed.vertical, scaleOf(this.cfg));
      if (fresh && this.enterEdge && ctx.band !== 'stopped') this.pinned = a.x < vp.w / 2 ? 'left' : 'right';
      else if (!fresh) jump ??= MOVE.pushOut;
    }
    const scale = scaleOf(this.cfg!);
    const rect = { ...res.rect };
    if (this.pinned) {
      rect.x = this.pinned === 'left' ? MARGIN : vp.w - MARGIN - rect.w;
      if (!req.focusOk && rectsOverlap(rect, focusRect(ctx.band, vp.w, vp.h))) {
        const zone = focusRect(ctx.band, vp.w, vp.h);
        rect.y = this.cfg!.vertical === 'above' ? zone.y - rect.h - 10 : zone.y + zone.h + 10;
        rect.y = Math.max(MARGIN, Math.min(vp.h - MARGIN - rect.h, rect.y));
      }
    }
    if (jump !== null && this.shown) {
      this.kickFrom(t, this.shown, rect, jump);
    } else if (this.shown && Math.abs(rect.w - this.shown.w) < 0.5) {
      const rope = (target: number, cur: number): number => {
        const d = target - cur;
        if (Math.abs(d) <= MOVE.deadBand) return cur;
        if (Math.abs(d) > 40) return target;
        return target - Math.sign(d) * MOVE.deadBand;
      };
      const zone = focusRect(ctx.band, vp.w, vp.h);
      const nx = rope(rect.x, this.shown.x);
      const ny = rope(rect.y, this.shown.y);
      const held = { ...rect, x: nx, y: ny };
      if (req.focusOk || !rectsOverlap(held, zone)) {
        rect.x = nx;
        rect.y = ny;
      }
    } else if (this.shown && this.last?.mode === 'pane' && Math.hypot(rect.x - this.shown.x, rect.y - this.shown.y) > 40) {
      this.kickFrom(t, this.shown, rect, MOVE.pushOut);
    }
    this.shown = rect;
    const leader = {
      x: this.cfg!.side === 'left' ? rect.x + rect.w : rect.x,
      y: this.cfg!.vertical === 'above' ? rect.y + rect.h : rect.y,
    };
    const placed: WorldPlace = { mode: 'pane', rect, leader, scale, side: this.cfg!.side };
    if (this.collapsed) placed.collapsed = this.collapsed;
    return this.remember(placed);
  }

  get placedAt(): number {
    return this.cfgAt;
  }

  private remember(p: WorldPlace): WorldPlace {
    this.last = p;
    return p;
  }

  private kickFrom(t: number, from: Rect, to: Rect, dur: number): void {
    this.jumpX.set(this.jumpX.at(t) + from.x - to.x);
    this.jumpY.set(this.jumpY.at(t) + from.y - to.y);
    this.jumpX.go(t, 0, dur, 'out');
    this.jumpY.go(t, 0, dur, 'out');
  }
}

export interface AsideState {
  dx: number;
  dy: number;
  opacity: number;
  dropped: boolean;
  active: boolean;
  trace: { from: Rect; to: Rect } | null;
}

export class Aside {
  private overlapSince: number | null = null;
  private clearSince: number | null = null;
  private dir: 'left' | 'right' | 'up' | 'down' | null = null;
  private readonly x = new Track(0);
  private readonly y = new Track(0);
  private readonly o = new Track(1);
  active = false;
  dropped = false;

  update(home: Rect, ctx: FrameCtx, focusOk: boolean): AsideState {
    const { t, vp } = ctx;
    const hits = ctx.keepOuts.filter((k) => rectsOverlap(home, k.rect));
    const hard = hits.some((k) => k.kind === 'face' || (k.kind === 'vehicle' && k.moving));
    if (hits.length > 0) {
      this.clearSince = null;
      this.overlapSince ??= t;
      const due = hard || t - this.overlapSince >= MOVE.asideHoldMs / 1000 - 1e-9;
      if (due && !this.dropped) {
        const move = this.solve(home, hits, ctx, focusOk);
        if (!move) {
          this.dropped = true;
          this.active = true;
          this.x.go(t, 0, MOVE.asideIn, 'out');
          this.y.go(t, 0, MOVE.asideIn, 'out');
          this.o.go(t, MOVE.asideOpacity, MOVE.asideIn, 'out');
        } else {
          this.active = true;
          this.x.go(t, move.dx, MOVE.asideIn, 'out');
          this.y.go(t, move.dy, MOVE.asideIn, 'out');
          this.o.go(t, MOVE.asideOpacity, MOVE.asideIn, 'out');
        }
      }
    } else {
      this.overlapSince = null;
      if (this.active) {
        this.clearSince ??= t;
        const wait = this.dropped ? 0.3 : 0;
        if (t - this.clearSince >= wait - 1e-9) {
          this.active = false;
          this.dropped = false;
          this.dir = null;
          this.x.go(t, 0, MOVE.asideOut, 'out');
          this.y.go(t, 0, MOVE.asideOut, 'out');
          this.o.go(t, 1, MOVE.asideOut, 'out');
        }
      }
    }
    void vp;
    const dx = this.x.at(t);
    const dy = this.y.at(t);
    const moved = Math.hypot(dx, dy) > 2;
    return {
      dx,
      dy,
      opacity: this.o.at(t),
      dropped: this.dropped,
      active: this.active,
      trace: moved ? { from: home, to: { ...home, x: home.x + dx, y: home.y + dy } } : null,
    };
  }

  private solve(home: Rect, hits: KeepOut[], ctx: FrameCtx, focusOk: boolean): { dx: number; dy: number } | null {
    const { vp } = ctx;
    const zone = focusRect(ctx.band, vp.w, vp.h);
    const pad = MOVE.asidePad;
    const x0 = Math.min(...hits.map((k) => k.rect.x));
    const x1 = Math.max(...hits.map((k) => k.rect.x + k.rect.w));
    const y0 = Math.min(...hits.map((k) => k.rect.y));
    const y1 = Math.max(...hits.map((k) => k.rect.y + k.rect.h));
    const opts: { dir: 'left' | 'right' | 'up' | 'down'; dx: number; dy: number }[] = [
      { dir: 'left', dx: x0 - pad - (home.x + home.w), dy: 0 },
      { dir: 'right', dx: x1 + pad - home.x, dy: 0 },
      { dir: 'up', dx: 0, dy: y0 - pad - (home.y + home.h) },
      { dir: 'down', dx: 0, dy: y1 + pad - home.y },
    ];
    const valid = opts.filter((o) => {
      const r = { ...home, x: home.x + o.dx, y: home.y + o.dy };
      if (r.x < MARGIN - 0.5 || r.y < MARGIN - 0.5 || r.x + r.w > vp.w - MARGIN + 0.5 || r.y + r.h > vp.h - MARGIN + 0.5) return false;
      if (!focusOk && rectsOverlap(r, zone)) return false;
      return !ctx.keepOuts.some((k) => rectsOverlap(r, k.rect));
    });
    if (valid.length === 0) return null;
    const keep = valid.find((o) => o.dir === this.dir);
    const best = keep ?? valid.reduce((a, b) => (Math.hypot(a.dx, a.dy) <= Math.hypot(b.dx, b.dy) ? a : b));
    this.dir = best.dir;
    return { dx: best.dx, dy: best.dy };
  }
}

export interface YieldInput {
  t: number;
  yawRate: number;
  curbDistance: number;
}

export class Yield {
  private side: 'left' | 'right' | null = null;
  private lastFast = -Infinity;

  update(inp: YieldInput): 'left' | 'right' | null {
    const fast = inp.curbDistance < 8 && Math.abs(inp.yawRate) > 0.8;
    if (fast) {
      this.side = inp.yawRate > 0 ? 'left' : 'right';
      this.lastFast = inp.t;
    } else if (this.side && inp.t - this.lastFast > 0.08) {
      this.side = null;
    }
    return this.side;
  }
}

export class PaneYield {
  private readonly x = new Track(0);
  private readonly o = new Track(1);
  on = false;

  update(t: number, side: 'left' | 'right' | null, paneSide: 'left' | 'right'): { dx: number; opacity: number } {
    const want = side !== null && side === paneSide;
    if (want && !this.on) {
      this.on = true;
      this.x.go(t, paneSide === 'left' ? -MOVE.yieldPx : MOVE.yieldPx, MOVE.yieldIn, 'gate');
      this.o.go(t, MOVE.yieldOpacity, MOVE.yieldIn, 'gate');
    } else if (!want && this.on) {
      this.on = false;
      this.x.go(t, 0, MOVE.yieldOut, 'out');
      this.o.go(t, 1, MOVE.yieldOut, 'out');
    }
    return { dx: this.x.at(t), opacity: this.o.at(t) };
  }
}
