import type { Projected, Viewport } from './camera';
import type { Band } from './data';
import { keepOutsFor, type KeepOut } from './keepout';
import { MOVE } from './motion-tokens';
import { MARGIN, NOMINAL_SIZE, PIP_GAP, TEXT_FLOOR, anchorFactors, configRect, paneScale, placeWorld, type Align, type PlaceInput, type Vertical } from './placement';
import { focusRect } from './rules';
import { LEVEL_RANK, type Level } from './types';
import { angleWrap } from './vec';
import { rectsOverlap, type Rect } from './vec';

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
  chrome?: readonly Rect[];
  focusOk?: boolean;
  ui?: number;
  scanning?: boolean;
}

export interface PlaceRequest {
  level: Level;
  anchor: Projected;
  distance: number;
  size: { w: number; h: number };
  focusOk: boolean;
  zoneOk?: boolean;
  left?: boolean;
  sizeOf?: (level: Level) => { w: number; h: number };
}

export type PaneMode = 'pane' | 'pip' | 'edge';

export interface WorldPlace {
  mode: PaneMode;
  rect: Rect;
  leader: { x: number; y: number };
  scale: number;
  side: 'left' | 'right';
  collapsed?: Level;
  why?: 'collapse' | 'step-down' | 'room' | 'edge';
  moved?: 'replace' | 'rope' | 'clamp' | 'zone';
  align?: Align;
  vertical?: Vertical;
  edge?: { x: number; y: number };
  behind?: boolean;
  stilled?: boolean;
}

interface Config {
  side: Align;
  vertical: Vertical;
  scale: number;
  push: boolean;
  pushOff?: { x: number; y: number };
}

export function leftRecently(t: number, lookedAt: number): boolean {
  return t - lookedAt < MOVE.minShown;
}

const STEP_DOWN: Partial<Record<Level, Level[]>> = { expanded: ['card', 'label'], card: ['label'] };

export class Placement {
  private cfg: Config | null = null;
  private cfgAt = -Infinity;
  private shown: { x: number; y: number } | null = null;
  private shownRel: { x: number; y: number } | null = null;
  private shownW = 0;
  private shownBox: Rect | null = null;
  private offSince: number | null = null;
  private collapsed: Level | undefined;
  private step: Level | undefined;
  private folded = false;
  private scale: number | null = null;
  private scaleAt = -Infinity;
  private ui = 0;
  private last: WorldPlace | null = null;
  readonly jumpX = new Track(0);
  readonly jumpY = new Track(0);

  reset(): void {
    this.cfg = null;
    this.shown = null;
    this.last = null;
    this.folded = false;
    this.scale = null;
  }

  update(req: PlaceRequest, ctx: FrameCtx): WorldPlace {
    const { vp, t } = ctx;
    const a = req.anchor;
    const out = !a.inFront || a.x < -20 || a.x > vp.w + 20 || a.y < -20 || a.y > vp.h + 20;
    if (out) {
      if (ctx.scanning && this.last?.mode === 'pane') return { ...this.last, stilled: true };
      if (this.last?.mode === 'pane' && a.inFront) return this.fold(a, vp);
      this.offSince ??= t;
      if (t - this.offSince >= MOVE.offscreenMs / 1000 || !this.last) {
        const behind = !a.inFront;
        const left = behind ? a.x > vp.w / 2 : a.x < vp.w / 2;
        const y = Math.max(40, Math.min(vp.h - 40, behind ? vp.h / 2 : a.y));
        this.shown = null;
        this.shownBox = null;
        this.cfg = null;
        const edge = { x: left ? 6 : vp.w - 6, y };
        return { mode: 'edge', rect: { x: edge.x, y, w: 0, h: 0 }, leader: edge, scale: 1, side: left ? 'left' : 'right', edge, behind };
      }
      return this.last;
    }
    this.offSince = null;

    const edgeFrac = Math.min(a.x, vp.w - a.x) / vp.w;
    const big = req.level === 'card' || req.level === 'expanded';
    const frozen = Boolean(ctx.scanning) && this.cfg !== null && this.last?.mode === 'pane';
    if (frozen) this.freezeCollapse();
    else if (req.focusOk && !req.left) {
      this.collapsed = undefined;
      this.step = undefined;
    } else if (big) {
      if (edgeFrac < 0.08) this.collapsed = 'label';
      else if (edgeFrac > 0.1) this.collapsed = undefined;
    } else if (req.level === 'label' || req.level === 'glance') {
      if (edgeFrac < 0.04) this.collapsed = 'pip';
      else if (edgeFrac > 0.055) this.collapsed = undefined;
    } else this.collapsed = undefined;
    if (this.collapsed === 'pip') return this.fold(a, vp);
    if (this.folded && req.left) return this.fold(a, vp);

    let jump: number | null = null;
    let moved: WorldPlace['moved'];
    const ui = ctx.ui ?? 1;
    if (ui !== this.ui) {
      this.ui = ui;
      this.cfg = null;
      this.scale = null;
    }
    const near = keepOutsFor(ctx.keepOuts, a.depth);
    const rects = near.map((k) => k.rect);
    const road = near.filter((k) => k.kind === 'roadway').map((k) => k.rect);
    const sizeFor = (lv: Level): { w: number; h: number } =>
      lv === req.level ? req.size : (req.sizeOf?.(lv) ?? NOMINAL_SIZE[lv as 'label' | 'card' | 'expanded'] ?? NOMINAL_SIZE.label);
    const make = (lv: Level): PlaceInput => ({
      level: lv,
      anchor: a,
      distance: req.distance,
      size: sizeFor(lv),
      band: ctx.band,
      viewport: vp,
      focusOk: req.focusOk,
      zoneOk: Boolean(req.zoneOk),
      keepOuts: rects,
      road,
      chrome: ctx.chrome ?? [],
      ui,
      ...(this.scale !== null && t - this.scaleAt < MOVE.hysteresis ? { scaleFrom: this.scale } : {}),
    });
    const near2: 'left' | 'right' = a.x < vp.w / 2 ? 'left' : 'right';
    const prefer = (): { side: Align; vertical: Vertical; push: boolean } | undefined => (this.cfg ? { side: this.cfg.side, vertical: this.cfg.vertical, push: this.cfg.push } : undefined);
    const withPrefer = (inp: PlaceInput): PlaceInput => {
      const pf = prefer();
      return pf ? { ...inp, prefer: pf } : inp;
    };
    let level: Level = req.level;
    if (this.collapsed === 'label' && LEVEL_RANK[level] > LEVEL_RANK.label) level = 'label';
    if (this.step && LEVEL_RANK[this.step] < LEVEL_RANK[level]) {
      if (t - this.cfgAt > MOVE.hysteresis) {
        const up = placeWorld(withPrefer(make(level)));
        if (up.mode !== 'pip' && up.mode !== 'offscreen') {
          this.step = undefined;
          this.cfg = null;
        } else level = this.step;
      } else level = this.step;
    }
    let inp = make(level);
    const scaleOf = (c: Config): number => c.scale;
    let res = this.cfg ? configRect(inp, this.cfg.side, this.cfg.vertical, scaleOf(this.cfg), this.cfg.push, this.cfg.pushOff) : null;
    const stilled = Boolean(res && !res.ok && frozen);
    if (res && stilled) res = { ...res, ok: true };
    if (req.left && res && !res.ok && !stilled) return this.fold(a, vp);
    if (req.focusOk && res && !res.ok && !stilled && Math.min(a.x, vp.w - a.x) < inp.size.w * scaleOf(this.cfg!) + PIP_GAP.beside + MARGIN) return this.fold(a, vp);
    if (!res || !res.ok) {
      let placed = placeWorld(withPrefer(inp));
      if ((placed.mode === 'pip' || placed.mode === 'offscreen') && !req.focusOk) {
        for (const lower of STEP_DOWN[level] ?? []) {
          const p2 = placeWorld(withPrefer(make(lower)));
          if (p2.mode !== 'pip' && p2.mode !== 'offscreen') {
            placed = p2;
            level = lower;
            this.step = lower;
            inp = make(lower);
            break;
          }
        }
      }
      const failed = placed.mode === 'pip' || placed.mode === 'offscreen';
      const squeeze = inp.scaleFrom ?? Math.max(0.74 * ui, TEXT_FLOOR);
      const fits = inp.size.w * squeeze <= vp.w - 2 * MARGIN && inp.size.h * squeeze <= vp.h - 2 * MARGIN;
      const reach = inp.size.w * paneScale(req.distance, ui) + PIP_GAP.beside + MARGIN;
      const nearEdge = Math.min(a.x, vp.w - a.x) < reach;
      if (failed && req.focusOk && fits && !nearEdge) {
        const same = this.cfg?.side === 'center' && this.cfg.vertical === 'lift' && this.cfg.scale === squeeze;
        if (!same) {
          if (this.cfg) {
            jump ??= MOVE.pushOut;
            moved ??= 'replace';
          }
          this.cfg = { side: 'center', vertical: 'lift', scale: squeeze, push: false };
          this.cfgAt = t;
        }
        res = configRect(inp, 'center', 'lift', squeeze);
      } else if (failed) {
        this.shown = null;
        this.shownBox = null;
        if (nearEdge) return this.fold(a, vp);
        this.folded = false;
        return this.remember({ mode: 'pip', rect: { x: a.x, y: a.y, w: 0, h: 0 }, leader: { x: a.x, y: a.y }, scale: 1, side: near2, why: 'room' });
      } else {
        const fresh = !this.cfg;
        this.cfg = { side: placed.align, vertical: placed.vertical, scale: placed.scale, push: placed.push };
        if (placed.push) this.cfg.pushOff = { x: placed.rect.x - a.x, y: placed.rect.y - a.y };
        this.cfgAt = t;
        res = configRect(inp, placed.align, placed.vertical, scaleOf(this.cfg), placed.push, this.cfg.pushOff);
        if (!fresh) {
          jump ??= MOVE.pushOut;
          moved ??= 'replace';
        }
      }
    }
    if (this.folded) {
      const r = res.rect;
      const gap = Math.min(r.x, vp.w - r.x - r.w, r.y, vp.h - r.y - r.h);
      if (res.held || gap < MARGIN + MOVE.foldHold) return this.fold(a, vp);
    }
    this.folded = false;
    const cfg = this.cfg!;
    const scale = scaleOf(cfg);
    if (this.scale === null || Math.abs(scale - this.scale) > 1e-6) {
      this.scale = scale;
      this.scaleAt = t;
    }
    const rect = { ...res.rect };
    const { fx, fy } = anchorFactors(cfg.side, cfg.vertical);
    const c = { x: rect.x + rect.w * fx, y: rect.y + rect.h * fy };
    const resized = this.shown !== null && Math.abs(rect.w - this.shownW) >= 0.5;
    const zoneNow = focusRect(ctx.band, vp.w, vp.h);
    const pathClear = (from: Rect): boolean => {
      const x = Math.min(from.x, rect.x);
      const y = Math.min(from.y, rect.y);
      const span = { x, y, w: Math.max(from.x + from.w, rect.x + rect.w) - x, h: Math.max(from.y + from.h, rect.y + rect.h) - y };
      return req.focusOk || Boolean(req.zoneOk) || !rectsOverlap(span, zoneNow);
    };
    if (jump !== null && this.shown && this.shownBox && !resized && pathClear(this.shownBox)) {
      this.kickFrom(t, { x: this.shownBox.x + this.shownBox.w * fx, y: this.shownBox.y + this.shownBox.h * fy }, c, jump, rect.w);
    } else if (this.shown && jump === null) {
      const d = Math.hypot(c.x - this.shown.x, c.y - this.shown.y);
      const rel = this.shownRel ? Math.hypot(c.x - a.x - this.shownRel.x, c.y - a.y - this.shownRel.y) : 0;
      if (rel > MOVE.ropeJump && this.last?.mode === 'pane' && !resized && !res.held) {
        this.kickFrom(t, this.shown, c, MOVE.pushOut, rect.w);
        moved ??= 'rope';
      } else {
        const rope = (target: number, cur: number): number => {
          const dd = target - cur;
          if (Math.abs(dd) <= MOVE.deadBand) return cur;
          return target - Math.sign(dd) * MOVE.deadBand;
        };
        const zone = focusRect(ctx.band, vp.w, vp.h);
        const nx = d > MOVE.ropeJump ? c.x : rope(c.x, this.shown.x);
        const ny = d > MOVE.ropeJump ? c.y : rope(c.y, this.shown.y);
        const held = { ...rect, x: nx - rect.w * fx, y: ny - rect.h * fy };
        if (req.focusOk || req.zoneOk || !rectsOverlap(held, zone)) {
          c.x = nx;
          c.y = ny;
        }
      }
    }
    this.shown = c;
    this.shownRel = { x: c.x - a.x, y: c.y - a.y };
    this.shownW = rect.w;
    rect.x = c.x - rect.w * fx;
    rect.y = c.y - rect.h * fy;
    this.shownBox = { ...rect };
    if (!req.focusOk && !req.zoneOk) {
      const jx = this.jumpX.at(t);
      const jy = this.jumpY.at(t);
      if ((jx !== 0 || jy !== 0) && rectsOverlap({ ...rect, x: rect.x + jx, y: rect.y + jy }, zoneNow)) {
        this.jumpX.set(0);
        this.jumpY.set(0);
      }
    }
    const placed: WorldPlace = { mode: 'pane', rect, leader: { x: c.x, y: c.y }, scale, side: rect.x + rect.w / 2 < vp.w / 2 ? 'left' : 'right', align: cfg.side, vertical: cfg.vertical };
    moved ??= res.held ?? undefined;
    if (moved) placed.moved = moved;
    if (stilled) placed.stilled = true;
    if (level !== req.level) {
      placed.collapsed = level;
      placed.why = this.collapsed === 'label' && level === 'label' ? 'collapse' : 'step-down';
    }
    return this.remember(placed);
  }

  get placedAt(): number {
    return this.cfgAt;
  }

  foldNow(a: { x: number; y: number }, vp: Viewport): WorldPlace {
    return this.fold(a, vp);
  }

  private fold(a: { x: number; y: number }, vp: Viewport): WorldPlace {
    this.folded = true;
    this.cfg = null;
    this.shown = null;
    this.shownBox = null;
    const left = a.x < vp.w / 2;
    const at = { x: left ? 6 : vp.w - 6, y: Math.max(40, Math.min(vp.h - 40, a.y)) };
    const off = a.x < 0 || a.x > vp.w || a.y < 0 || a.y > vp.h;
    const p: WorldPlace = { mode: 'edge', rect: { x: at.x, y: at.y, w: 0, h: 0 }, leader: at, scale: 1, side: left ? 'left' : 'right', why: 'edge' };
    if (off) p.edge = at;
    return this.remember(p);
  }

  private freezeCollapse(): void {
    if (this.collapsed === 'pip') this.collapsed = undefined;
  }

  private remember(p: WorldPlace): WorldPlace {
    this.last = p;
    return p;
  }

  ease(t: number, from: { x: number; y: number }, to: { x: number; y: number }, dur: number): void {
    if (Math.hypot(from.x - to.x, from.y - to.y) > MOVE.deadBand) this.kickFrom(t, from, to, dur);
  }

  // A move during a fast head turn starts no farther back than the pane's width, so it never trails its light.
  private kickFrom(t: number, from: { x: number; y: number }, to: { x: number; y: number }, dur: number, w = Infinity): void {
    const dx = this.jumpX.at(t) + from.x - to.x;
    const dy = this.jumpY.at(t) + from.y - to.y;
    const k = Math.min(1, (w * MOVE.kickReach) / Math.max(1e-6, Math.hypot(dx, dy)));
    this.jumpX.set(dx * k);
    this.jumpY.set(dy * k);
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
  by: string | null;
  trace: { from: Rect; to: Rect } | null;
}

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

export class Aside {
  private overlapSince: number | null = null;
  private coveredSince: number | null = null;
  private clearSince: number | null = null;
  private dir: 'left' | 'right' | 'up' | 'down' | null = null;
  private readonly x = new Track(0);
  private readonly y = new Track(0);
  private readonly o = new Track(1);
  active = false;
  dropped = false;
  by: string | null = null;

  update(home: Rect, ctx: FrameCtx, focusOk: boolean, depth = Infinity): AsideState {
    const { t } = ctx;
    const near = keepOutsFor(ctx.keepOuts, depth);
    const hits = near.filter((k) => k.kind !== 'roadway' && rectsOverlap(home, k.rect));
    const hard = hits.some((k) => k.kind === 'face' || (k.kind === 'vehicle' && k.moving));
    if (hits.length > 0) {
      this.clearSince = null;
      this.overlapSince ??= t;
      const due = hard || t - this.overlapSince >= MOVE.asideHoldMs / 1000 - 1e-9;
      if (due && !this.dropped) {
        const move = this.solve(home, hits, near, ctx, focusOk);
        this.by = hits.map((k) => `${k.kind} ${k.id}`).join(', ');
        this.active = true;
        const covered = Math.min(1, hits.reduce((sum, k) => sum + overlapArea(home, k.rect), 0) / Math.max(1, home.w * home.h));
        if (!move && covered > MOVE.asideDropCover) this.coveredSince ??= t;
        else this.coveredSince = null;
        const face = hits.some((k) => k.kind === 'face');
        if (!move && (face || (this.coveredSince !== null && t - this.coveredSince >= MOVE.asideDropMs / 1000 - 1e-9))) {
          this.dropped = true;
          this.coveredSince = null;
          this.x.go(t, 0, MOVE.asideIn, 'out');
          this.y.go(t, 0, MOVE.asideIn, 'out');
        } else if (!move) {
          this.x.go(t, 0, MOVE.asideIn, 'out');
          this.y.go(t, 0, MOVE.asideIn, 'out');
        } else {
          this.x.go(t, move.dx, MOVE.asideIn, 'out');
          this.y.go(t, move.dy, MOVE.asideIn, 'out');
        }
        this.o.go(t, MOVE.asideOpacity, MOVE.asideIn, 'out');
      }
    } else {
      this.overlapSince = null;
      this.coveredSince = null;
      if (this.active) {
        this.clearSince ??= t;
        const wait = this.dropped ? 0.3 : 0;
        if (t - this.clearSince >= wait - 1e-9) {
          this.active = false;
          this.dropped = false;
          this.dir = null;
          this.by = null;
          this.x.go(t, 0, MOVE.asideOut, 'out');
          this.y.go(t, 0, MOVE.asideOut, 'out');
          this.o.go(t, 1, MOVE.asideOut, 'out');
        }
      }
    }
    const dx = this.x.at(t);
    const dy = this.y.at(t);
    const moved = Math.hypot(dx, dy) > 2;
    return {
      dx,
      dy,
      opacity: this.o.at(t),
      dropped: this.dropped,
      active: this.active,
      by: this.by,
      trace: moved ? { from: home, to: { ...home, x: home.x + dx, y: home.y + dy } } : null,
    };
  }

  private solve(home: Rect, hits: KeepOut[], near: KeepOut[], ctx: FrameCtx, focusOk: boolean): { dx: number; dy: number } | null {
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
      return !near.some((k) => rectsOverlap(r, k.rect));
    });
    const chased = (o: { dir: string }): boolean => hits.some((k) => Math.abs(k.vx ?? 0) > 20 && (o.dir === 'right' ? k.vx! > 0 : o.dir === 'left' ? k.vx! < 0 : false));
    const close = valid.filter((o) => Math.hypot(o.dx, o.dy) <= home.w && !chased(o));
    if (close.length === 0) return null;
    const keep = close.find((o) => o.dir === this.dir);
    const vertical = close.filter((o) => o.dir === 'up' || o.dir === 'down');
    const pool = vertical.length > 0 ? vertical : close;
    const best = keep ?? pool.reduce((a, b) => (Math.hypot(a.dx, a.dy) <= Math.hypot(b.dx, b.dy) ? a : b));
    this.dir = best.dir;
    return { dx: best.dx, dy: best.dy };
  }
}

export interface YieldInput {
  t: number;
  yawRate: number;
  curbDistance: number;
  yaw?: number;
  target?: string | null;
}

export class Yield {
  private side: 'left' | 'right' | null = null;
  private lastFast = -Infinity;
  private from: number | null = null;
  private prevYaw: number | null = null;
  private target: string | null = null;

  update(inp: YieldInput): 'left' | 'right' | null {
    const fast = inp.curbDistance < 8 && Math.abs(inp.yawRate) > 0.8;
    if (fast) {
      if (!this.side) {
        this.from = this.prevYaw ?? inp.yaw ?? null;
        this.target = inp.target ?? null;
      }
      this.side = inp.yawRate > 0 ? 'left' : 'right';
      this.lastFast = inp.t;
    } else if (this.side && inp.t - this.lastFast > 0.08) {
      const back = this.from === null || inp.yaw === undefined || Math.abs(angleWrap(inp.yaw - this.from)) < MOVE.yieldBack;
      const elsewhere = Boolean(inp.target) && inp.target !== this.target;
      if (back || elsewhere || inp.curbDistance >= 8) {
        this.side = null;
        this.from = null;
      }
    }
    if (!fast) this.prevYaw = inp.yaw ?? null;
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
