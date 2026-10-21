import { gsap } from 'gsap';
import {
  LEVEL_RANK,
  NOMINAL_SIZE,
  focusRect,
  placeView,
  type Band,
  type BrainFrame,
  type Decision,
  type Glyph,
  type PaneReport,
  type Rect,
  type Vec3,
  type WorldSnapshot,
} from '@lumen/shared';
import { BackdropFill } from './backdrop';
import { leaderPoint, type ColumnHandle, type GroundTextHandle, type KeepOut, type LeaderHandle, type LightHandle, type RouteHandle, type SceneBridge } from './bridge';
import { condense, dissolve, gaze, hidePane, lightVals, mark, recede, retract, travel, ungaze, unrecede, type LightVals, type PaneEls } from './motion';
import { buildPane, styles as s, whisperLine, type PaneHandlers, type PaneView } from './panes';
import { Aside, PaneYield, Placement, Track, Yield, type AsideState, type FrameCtx, type WorldPlace } from './place';
import { Sound } from './sound';
import { EASE, MOVE, T } from './tokens';

type PaneLevel = 'glance' | 'card' | 'expanded' | 'none';

const HELD_LINE = 'Held that while you crossed';

interface Lights {
  pip: LightHandle;
  aura: LightHandle;
  flare: LightHandle;
  head: LightHandle;
  leader: LeaderHandle;
}

interface Built {
  view: PaneView;
  wrap: HTMLElement;
  seed: HTMLElement;
  width: number;
  height: number;
  level: PaneLevel;
  rect: Rect | null;
  corner: { x: number; y: number } | null;
  fade: { v: number };
  opacity: number;
  off: { x: number; y: number } | null;
  tl?: gsap.core.Timeline;
}

interface Item {
  id: string;
  d: Decision;
  kind: 'world' | 'view';
  want: PaneLevel;
  cur: Built | null;
  old: Built[];
  tl: gsap.core.Timeline | null;
  gtl: gsap.core.Timeline | null;
  L: LightVals;
  lights: Lights | null;
  place: Placement | null;
  aside: Aside;
  yieldS: PaneYield;
  fill: BackdropFill;
  marked: boolean;
  gazed: boolean;
  dying: boolean;
  deadAt: number;
  edge: HTMLElement | null;
  edgeO: Track;
  trace: HTMLElement | null;
  placed: WorldPlace | null;
  fromCorner: { x: number; y: number } | null;
  born: number;
  condensingUntil: number;
  order: number;
}

export interface OverlayOptions {
  reducedMotion?: boolean;
  handlers?: Partial<PaneHandlers>;
  clock?: gsap.core.Timeline;
}

export interface OverlayState {
  band: Band;
  receded: boolean;
  items: { id: string; level: string; want: PaneLevel; rect: Rect | null; opacity: number; mode?: string; dropped: boolean; aside: boolean; yielded: boolean }[];
  glyph: string | null;
  whisper: string | null;
}

class RouteView {
  private h: RouteHandle | null = null;
  private key = '';
  private readonly drawn = new Track(0);
  private readonly op = new Track(0);
  private to = '';
  private offset: 'center' | 'curb' = 'center';

  constructor(private bridge: SceneBridge) {}

  update(t: number, d: Decision | undefined, gateK: number): void {
    if (d?.content.route) {
      const key = `${d.content.route.to}|${d.content.route.offset}`;
      if (key !== this.key) {
        const sameTarget = d.content.route.to === this.to;
        this.key = key;
        this.to = d.content.route.to;
        this.offset = d.content.route.offset;
        if (!sameTarget || this.op.target === 0) {
          this.drawn.set(0);
          this.drawn.go(t, 1, MOVE.routeDraw, 'out2');
        }
        this.op.go(t, 1, T.base, 'out');
      }
    } else if (this.key) {
      this.key = '';
      this.drawn.go(t, 0, 0.8, 'in');
      this.op.go(t, 0, 0.8, 'in');
    }
    const o = this.op.at(t);
    if (o <= 0.001 && !this.key) {
      this.h?.set({ points: [], opacity: 0, drawn: 0, fadeStart: 0, fadeEnd: 25 });
      return;
    }
    this.h ??= this.bridge.createRoute();
    const gate = MOVE.routeGate + (1 - MOVE.routeGate) * Math.min(1, Math.max(0, (gateK - 0.2) / 0.8));
    this.h.set({ points: this.bridge.routePath(this.to, this.offset), opacity: o * gate, drawn: this.drawn.at(t), fadeStart: 0, fadeEnd: 25 });
  }

  dispose(): void {
    this.h?.dispose();
  }
}

class ColumnView {
  private col: ColumnHandle | null = null;
  private pip: LightHandle | null = null;
  private readonly height = new Track(0);
  private readonly op = new Track(0);
  private readonly pipO = new Track(0);
  private id = '';
  private settled = false;

  constructor(private bridge: SceneBridge) {}

  update(t: number, d: Decision | undefined): void {
    if (d) {
      if (d.placement.anchor !== this.id) {
        this.id = d.placement.anchor;
        this.settled = false;
        this.height.set(0);
        this.height.go(t, 26, MOVE.columnSettle, 'out2');
        this.op.go(t, 1, T.base, 'out');
      }
      if (d.level === 'pip' && !this.settled) {
        this.settled = true;
        this.height.go(t, 0, MOVE.columnSettle, 'out');
        this.pipO.go(t, 1, MOVE.columnSettle, 'out');
      }
    } else if (this.id) {
      this.id = '';
      this.op.go(t, 0, T.quick, 'in');
      this.pipO.go(t, 0, T.quick, 'in');
    }
    const pos = this.bridge.anchor(`column:${this.id || 'none'}`) ?? this.lastPos;
    if (!pos) return;
    this.lastPos = pos;
    this.col ??= this.bridge.createColumn();
    const cam = this.bridge.camera().pos;
    const near = Math.hypot(pos.x - cam.x, pos.z - cam.z);
    const fade = Math.min(1, Math.max(0, (near - 4) / 10));
    this.col.set({ pos, opacity: this.op.at(t) * (0.15 + 0.85 * fade), height: this.height.at(t) });
    const po = this.pipO.at(t);
    if (po > 0.001 || this.pip) {
      this.pip ??= this.bridge.createLight('pip');
      this.pip.set({ pos: { x: pos.x, y: pos.y + 2.6, z: pos.z }, opacity: po, scale: 1 });
    }
  }

  private lastPos: Vec3 | null = null;

  dispose(): void {
    this.col?.dispose();
    this.pip?.dispose();
  }
}

class SafetyView {
  private h: GroundTextHandle | null = null;
  private readonly op = new Track(0);
  private last: Decision | null = null;

  constructor(private bridge: SceneBridge) {}

  update(t: number, d: Decision | undefined): boolean {
    if (d) {
      this.last = d;
      this.op.go(t, 1, T.base, 'out');
    } else this.op.go(t, 0, T.quick, 'in');
    const o = this.op.at(t);
    const src = this.last;
    if (!src) return false;
    const at = this.bridge.safetyAnchor(src.placement.anchor);
    if (!at) return o > 0;
    this.h ??= this.bridge.createGroundText();
    const c = src.content;
    const tone = c.tone === 'go' || c.tone === 'warn' || c.tone === 'stop' ? c.tone : 'stop';
    const text = c.fact ? `${c.name} · ${c.fact}` : c.seconds !== undefined ? `${c.name} ${Math.max(0, Math.ceil(c.seconds))}` : c.name;
    const arrow = c.arrow === 'left' || c.arrow === 'right' ? c.arrow : undefined;
    this.h.set({ pos: at.pos, yaw: at.yaw, text, tone, opacity: o, ...(arrow ? { arrow } : {}) });
    return o > 0.001;
  }

  dispose(): void {
    this.h?.dispose();
  }
}

export class Overlay {
  readonly root: HTMLElement;
  readonly sound = new Sound();
  private readonly hud: HTMLElement;
  private readonly worldLayer: HTMLElement;
  private readonly viewLayer: HTMLElement;
  private readonly fixed: HTMLElement;
  private readonly glyphEl: HTMLElement;
  private readonly glyphLabel: HTMLElement;
  private readonly focusEl: HTMLElement;
  private items = new Map<string, Item>();
  private order = 0;
  private frame: BrainFrame | null = null;
  private snap: WorldSnapshot | null = null;
  private band: Band = 'walk';
  private receded = false;
  private gateTl: gsap.core.Timeline | null = null;
  private readonly gateK = { v: 1 };
  private gateEndAt = -Infinity;
  private glyph: Glyph | null = null;
  private glyphShown = false;
  private glyphTl: gsap.core.Timeline | null = null;
  private whisper: { id: string; el: HTMLElement; text: string } | null = null;
  private route: RouteView;
  private column: ColumnView;
  private safety = new Map<string, SafetyView>();
  private readonly yieldTracker = new Yield();
  private lastYaw: number | null = null;
  private lastT = 0;
  private yawRate = 0;
  private t = 0;
  private readonly reduced: boolean;
  private readonly handlers: PaneHandlers;
  private snooze = false;
  private readonly clock: gsap.core.Timeline | null;

  constructor(
    private bridge: SceneBridge,
    parent: HTMLElement,
    opts: OverlayOptions = {},
  ) {
    this.clock = opts.clock ?? null;
    this.reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.handlers = { choice: opts.handlers?.choice ?? (() => {}), pinch: opts.handlers?.pinch ?? (() => {}) };
    this.root = document.createElement('div');
    this.root.className = s.root!;
    this.hud = document.createElement('div');
    this.hud.className = s.hud!;
    this.worldLayer = document.createElement('div');
    this.worldLayer.className = s.fixed!;
    this.viewLayer = document.createElement('div');
    this.viewLayer.className = s.fixed!;
    this.hud.append(this.worldLayer, this.viewLayer);
    this.fixed = document.createElement('div');
    this.fixed.className = s.fixed!;
    this.glyphEl = document.createElement('div');
    this.glyphEl.className = s.glyph!;
    this.glyphEl.appendChild(document.createElement('i'));
    this.glyphLabel = document.createElement('span');
    this.glyphEl.appendChild(this.glyphLabel);
    this.focusEl = document.createElement('div');
    this.focusEl.className = s.focusOutline!;
    this.focusEl.dataset.label = 'FOCUS ZONE';
    this.fixed.append(this.glyphEl, this.focusEl);
    this.root.append(this.hud, this.fixed);
    parent.appendChild(this.root);
    this.route = new RouteView(bridge);
    this.column = new ColumnView(bridge);
  }

  private tl(vars?: gsap.TimelineVars): gsap.core.Timeline {
    const tl = gsap.timeline(vars);
    this.clock?.add(tl, this.clock.time());
    return tl;
  }

  setFocusOutline(on: boolean): void {
    this.focusEl.style.display = on ? 'block' : 'none';
  }

  apply(frame: BrainFrame, snap: WorldSnapshot): void {
    const t = frame.t;
    this.frame = frame;
    this.snap = snap;
    this.band = frame.band;
    if (frame.gate.safety !== this.receded) this.setReceded(frame.gate.safety, t);
    this.snooze = frame.gate.snooze;
    this.setGlyph(frame.glyph);
    const seen = new Set<string>();
    for (const d of frame.items) {
      if (d.placement.zone === 'ground') continue;
      if (d.component === 'whisper') {
        seen.add(d.id);
        this.setWhisper(d);
        continue;
      }
      seen.add(d.id);
      let it = this.items.get(d.id);
      if (!it || it.dying) {
        if (it) this.disposeItem(it);
        it = this.createItem(d, t);
        this.items.set(d.id, it);
      }
      it.d = d;
    }
    if (this.whisper && !seen.has(this.whisper.id)) this.setWhisper(null);
    for (const it of this.items.values()) {
      if (!seen.has(it.id) && !it.dying) {
        it.dying = true;
        it.deadAt = t;
      }
    }
    for (const e of frame.events) {
      if (e.action === 'save') this.saveBloom(e);
    }
  }

  private createItem(d: Decision, t: number): Item {
    const world = d.placement.zone === 'world';
    const it: Item = {
      id: d.id,
      d,
      kind: world ? 'world' : 'view',
      want: 'none',
      cur: null,
      old: [],
      tl: null,
      gtl: null,
      L: lightVals(),
      lights: null,
      place: world ? new Placement(d.placement.enter === 'edge') : null,
      aside: new Aside(),
      yieldS: new PaneYield(),
      fill: new BackdropFill(),
      marked: false,
      gazed: false,
      dying: false,
      deadAt: 0,
      edge: null,
      edgeO: new Track(0),
      trace: null,
      placed: null,
      fromCorner: null,
      born: t,
      condensingUntil: 0,
      order: this.order++,
    };
    if (world && this.bridge.anchor(d.placement.anchor)) {
      it.lights = {
        pip: this.bridge.createLight('pip'),
        aura: this.bridge.createLight('aura'),
        flare: this.bridge.createLight('flare'),
        head: this.bridge.createLight('head'),
        leader: this.bridge.createLeader(),
      };
      const tl = this.tl();
      mark(tl, it.L, 0);
      it.marked = true;
      this.sound.tick();
    }
    return it;
  }

  private disposeItem(it: Item): void {
    it.tl?.kill();
    it.gtl?.kill();
    for (const b of [it.cur, ...it.old]) {
      b?.tl?.kill();
      b?.wrap.remove();
    }
    it.edge?.remove();
    it.trace?.remove();
    if (it.lights) for (const h of Object.values(it.lights)) (h as { dispose(): void }).dispose();
    this.items.delete(it.id);
  }

  private setReceded(on: boolean, t: number): void {
    this.receded = on;
    this.gateTl?.kill();
    if (on) {
      this.gateTl = recede(this.tl(), this.hud, this.gateK);
      this.sound.breathDown();
    } else {
      this.gateTl = unrecede(this.tl(), this.hud, this.gateK);
      this.gateEndAt = t;
    }
  }

  private setGlyph(g: Glyph | null): void {
    const label = g?.label ?? null;
    const prev = this.glyph?.label ?? null;
    this.glyph = g;
    if (label && !this.glyphShown) {
      this.glyphShown = true;
      this.glyphLabel.textContent = label;
      this.glyphTl?.kill();
      this.glyphTl = this.tl().fromTo(this.glyphEl, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: T.base, ease: EASE.out }, this.receded ? MOVE.glyphAt : 0);
    } else if (!label && this.glyphShown) {
      this.glyphShown = false;
      this.glyphTl?.kill();
      this.glyphTl = this.tl().to(this.glyphEl, { opacity: 0, x: -6, duration: T.quick, ease: EASE.in });
    } else if (label && label !== prev) {
      const kindChanged = g?.kind !== undefined && this.glyphLabel.dataset.kind !== g.kind;
      if (g?.kind === 'snooze' && !kindChanged) this.glyphLabel.textContent = label;
      else this.tl().to(this.glyphLabel, { opacity: 0, duration: T.snap, ease: EASE.in }).call(() => {
        this.glyphLabel.textContent = label;
      }).to(this.glyphLabel, { opacity: 1, duration: T.base, ease: EASE.out });
    }
    if (g) this.glyphLabel.dataset.kind = g.kind;
  }

  private setWhisper(d: Decision | null): void {
    if (d) {
      const text = `${d.content.name}|${d.content.fact ?? ''}`;
      if (this.whisper?.text === text) return;
      if (this.whisper) this.whisper.el.remove();
      const el = whisperLine(d.content);
      this.viewLayer.appendChild(el);
      this.whisper = { id: d.id, el, text };
      this.tl().fromTo(el, { opacity: 0, y: MOVE.whisperRise }, { opacity: 1, y: 0, duration: T.base, ease: EASE.out });
    } else if (this.whisper) {
      const el = this.whisper.el;
      this.whisper = null;
      this.tl({ onComplete: () => el.remove() }).to(el, { opacity: 0, duration: T.quick, ease: EASE.in });
    }
  }

  private saveBloom(e: Decision): void {
    const a = this.bridge.anchor(e.placement.anchor);
    if (!a) return;
    const p = this.bridge.project(a);
    if (!p.inFront) return;
    const el = document.createElement('div');
    el.className = s.saved!;
    el.textContent = 'Saved';
    this.worldLayer.appendChild(el);
    const w = el.offsetWidth;
    gsap.set(el, { x: p.x - w / 2, y: p.y - 30 });
    this.tl({ onComplete: () => el.remove() })
      .fromTo(el, { opacity: 0, y: p.y - 24 }, { opacity: 1, y: p.y - 30, duration: MOVE.saveRise, ease: EASE.out })
      .to(el, { opacity: 0, duration: T.quick, ease: EASE.in }, MOVE.saveRise + MOVE.saveHold);
    this.sound.tick();
  }

  private paneLevelFor(it: Item, placed: WorldPlace | null): PaneLevel {
    if (it.dying) return 'none';
    const lv = it.d.level;
    if (lv !== 'glance' && lv !== 'card' && lv !== 'expanded') return 'none';
    if (it.kind === 'view') return lv;
    if (!placed || placed.mode !== 'pane') return 'none';
    if (it.aside.dropped) return 'none';
    if (placed.collapsed === 'glance' && LEVEL_RANK[lv] > LEVEL_RANK.glance) return 'glance';
    return lv;
  }

  private build(it: Item, level: PaneLevel): Built {
    const view = buildPane({ ...it.d, level: level as Decision['level'] }, level as Decision['level'], this.handlers);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform,opacity';
    const seed = document.createElement('div');
    seed.className = s.seed!;
    view.el.style.position = 'relative';
    wrap.append(view.el, seed);
    (it.kind === 'world' ? this.worldLayer : this.viewLayer).appendChild(wrap);
    const width = view.el.offsetWidth;
    const height = view.el.offsetHeight;
    const b: Built = { view, wrap, seed, width, height, level, rect: null, corner: null, fade: { v: 1 }, opacity: 0, off: null };
    hidePane(this.els(b));
    gsap.set(view.el, { opacity: 1 });
    return b;
  }

  private els(b: Built): PaneEls {
    return { pane: b.view.el, seed: b.seed, kids: b.view.kids, why: b.view.why, width: b.width };
  }

  private transition(it: Item, want: PaneLevel, t: number): void {
    it.tl?.kill();
    const tl = this.tl();
    const prev = it.cur;
    let at = 0;
    const world = it.kind === 'world' && it.lights !== null;
    if (prev) {
      const dtl = this.tl();
      const end = dissolve(dtl, this.els(prev), 0, this.reduced, prev.fade);
      dtl.call(() => {
        prev.wrap.remove();
        it.old = it.old.filter((o) => o !== prev);
      }, [], end + 0.02);
      prev.tl = dtl;
      it.old.push(prev);
      at = end;
      it.fromCorner = prev.corner;
    }
    it.cur = null;
    if (want !== 'none') {
      const b = this.build(it, want);
      it.cur = b;
      const big = want === 'card' || want === 'expanded';
      if (world) {
        const dur = big ? MOVE.travelCard : MOVE.travelGlance;
        const tStart = !prev && t - it.born < 0.05 ? 0.35 : at;
        at = travel(tl, it.L, tStart, dur, Boolean(prev && it.fromCorner), this.reduced);
        if (big) tl.call(() => this.sound.breathUp(want === 'expanded'), [], tStart + dur / 2);
      } else if (big || it.d.component === 'pocket') {
        tl.call(() => this.sound.breathUp(true), [], at);
      }
      const held = it.d.reason.text === HELD_LINE && it.d.content.showReason !== false;
      const whyAt = held ? Math.max(0, this.gateEndAt + MOVE.returnS - t) : undefined;
      const end = condense(tl, this.els(b), at, {
        card: big,
        reduced: this.reduced,
        open: want === 'expanded' || it.d.component === 'pocket',
        ...(whyAt !== undefined ? { whyAt } : {}),
        fade: b.fade,
      });
      it.condensingUntil = t + end;
    } else if (world && prev) {
      retract(tl, it.L, Math.max(0, at - 0.12), this.reduced);
    }
    it.want = want;
    it.tl = tl;
  }

  update(t: number): void {
    this.t = t;
    const vp = this.bridge.viewport();
    const cam = this.bridge.camera();
    if (this.lastYaw !== null && t > this.lastT) {
      let dy = cam.yaw - this.lastYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yawRate = dy / (t - this.lastT);
    }
    if (t !== this.lastT) {
      this.lastYaw = cam.yaw;
      this.lastT = t;
    }
    const keepOuts = this.bridge.keepOuts();
    const ctx: FrameCtx = { t, band: this.band, vp, keepOuts };
    const yieldSide = this.yieldTracker.update({ t, yawRate: this.yawRate, curbDistance: this.bridge.curbDistance() });
    const gk = this.gateK.v;
    const pipMul = this.snooze ? 0.3 : 1;
    const zone = focusRect(this.band, vp.w, vp.h);
    gsap.set(this.focusEl, { left: zone.x, top: zone.y, width: zone.w, height: zone.h });

    const slots = new Map<string, number>();
    const ordered = [...this.items.values()].sort((a, b) => a.order - b.order);
    for (const it of ordered) {
      const d = it.d;
      let anchorPos: Vec3 | undefined;
      let depth = 1;
      let placed: WorldPlace | null = null;
      let pr: { x: number; y: number } | null = null;
      if (it.kind === 'world') {
        anchorPos = this.bridge.anchor(d.placement.anchor);
        if (anchorPos && it.place) {
          const p = this.bridge.project(anchorPos);
          pr = p.inFront ? p : null;
          depth = p.depth;
          const lv = d.level === 'glance' || d.level === 'card' || d.level === 'expanded' ? d.level : 'glance';
          const nominal = NOMINAL_SIZE[lv];
          const size = it.cur && it.cur.level === lv ? { w: it.cur.width, h: it.cur.height } : nominal;
          const cam = this.bridge.camera();
          const dist = Math.hypot(anchorPos.x - cam.pos.x, anchorPos.y - cam.pos.y, anchorPos.z - cam.pos.z);
          placed = it.place.update({ level: lv, anchor: p, distance: dist, size, focusOk: Boolean(d.placement.focusOk) }, ctx);
          it.placed = placed;
        }
      }
      let aside: AsideState | null = null;
      let home: Rect | null = null;
      if (placed && placed.mode === 'pane' && it.place && LEVEL_RANK[d.level] >= LEVEL_RANK.glance && !it.dying) {
        const sc = placed.scale;
        const lv = placed.collapsed === 'glance' ? 'glance' : d.level;
        const size = it.cur && it.cur.level === lv ? { w: it.cur.width, h: it.cur.height } : (NOMINAL_SIZE[lv as 'glance'] ?? NOMINAL_SIZE.glance);
        home = { x: placed.rect.x + it.place.jumpX.at(t), y: placed.rect.y + it.place.jumpY.at(t), w: size.w * sc, h: size.h * sc };
        aside = it.aside.update(home, ctx, Boolean(d.placement.focusOk));
      }
      const want = this.paneLevelFor(it, placed);
      if (want !== it.want) this.transition(it, want, t);
      else if (it.cur && it.cur.view.shape !== buildShape(it, want, this.handlers)) this.transition(it, want, t);
      else if (it.cur) it.cur.view.update(d.content);

      const lum = this.snap?.env.backdrop[it.id];
      const fill = it.fill.update(t, lum, t < it.condensingUntil);
      let paneOpacity = 0;
      let yieldO = 1;
      for (const b of [it.cur, ...it.old]) {
        if (!b) continue;
        let rect: Rect;
        let scale = 1;
        let asideO = 1;
        if (it.kind === 'world') {
          if (b !== it.cur || !placed || placed.mode !== 'pane') {
            if (b.off && pr) rect = { ...(b.rect ?? { w: 0, h: 0 }), x: pr.x + b.off.x, y: pr.y + b.off.y } as Rect;
            else if (b.rect) rect = b.rect;
            else continue;
            scale = it.placed?.scale ?? 1;
          } else {
            scale = placed.scale;
            const base = { x: home?.x ?? placed.rect.x, y: home?.y ?? placed.rect.y, w: b.width * scale, h: b.height * scale };
            const a = aside ?? { dx: 0, dy: 0, opacity: 1, dropped: false, active: false, trace: null };
            asideO = a.opacity;
            const y = it.yieldS.update(t, yieldSide, base.x + base.w / 2 < vp.w / 2 ? 'left' : 'right');
            yieldO = y.opacity;
            rect = { x: base.x + a.dx + y.dx, y: base.y + a.dy, w: base.w, h: base.h };
            this.setTrace(it, a.trace && !a.dropped ? a.trace : null, a.opacity);
            b.corner = { x: placed.side === 'left' ? rect.x + rect.w : rect.x, y: placed.leader.y - placed.rect.y + rect.y };
            if (pr) b.off = { x: rect.x - pr.x, y: rect.y - pr.y };
          }
        } else {
          const slot = d.placement.anchor.startsWith('view:') ? d.placement.anchor : 'view:edge-right';
          const i = b === it.cur ? (slots.get(slot) ?? 0) : 0;
          if (b === it.cur) slots.set(slot, i + 1);
          rect = b.rect && b !== it.cur ? b.rect : placeView(slot, { w: b.width, h: b.height }, vp, i);
          if (slot === 'view:glyph') rect = { ...rect, y: vp.h - 44 - b.height };
          if (b === it.cur) {
            const y = it.yieldS.update(t, yieldSide, rect.x + rect.w / 2 < vp.w / 2 ? 'left' : 'right');
            yieldO = y.opacity;
            rect = { ...rect, x: rect.x + y.dx };
          }
        }
        b.rect = rect;
        const o = b.fade.v * asideO * yieldO;
        b.opacity = o;
        if (b === it.cur) paneOpacity = o;
        b.wrap.style.transform = `translate3d(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        b.wrap.style.opacity = o.toFixed(3);
        b.view.el.style.setProperty('--fill-a', fill.alpha.toFixed(3));
        b.view.el.style.setProperty('--fill-b', (fill.alpha - 0.04).toFixed(3));
        b.view.el.style.setProperty('--weight', String(fill.weight));
      }

      if (it.lights && anchorPos) {
        const gazedNow = this.frame?.dwell.target === it.id && (this.frame?.dwell.dwellMs ?? 0) >= 800 && !it.dying;
        if (gazedNow && !it.gazed) {
          it.gazed = true;
          it.gtl?.kill();
          it.gtl = this.tl();
          gaze(it.gtl, it.L, 0, this.reduced);
        } else if (!gazedNow && it.gazed) {
          it.gazed = false;
          it.gtl?.kill();
          it.gtl = this.tl();
          ungaze(it.gtl, it.L, 0);
        }
        if (it.dying && it.want === 'none' && !it.cur && it.old.length === 0 && it.L.pip > 0 && !it.gtl?.isActive()) {
          it.gtl = this.tl();
          it.gtl.to(it.L, { pip: 0, aura: 0, flare: 0, duration: T.quick, ease: EASE.in });
        }
        const dropped = it.aside.dropped ? MOVE.droppedPip : 1;
        const lightMul = gk * yieldO * pipMul;
        it.lights.pip.set({ pos: anchorPos, opacity: Math.min(1, it.L.pip) * lightMul * dropped, scale: it.L.pipS });
        it.lights.aura.set({ pos: anchorPos, opacity: it.L.aura * 0.9 * lightMul * dropped, scale: it.L.auraS });
        it.lights.flare.set({ pos: anchorPos, opacity: it.L.flare * lightMul, scaleX: it.L.flareSX });
        const target = it.cur?.corner ?? it.old[it.old.length - 1]?.corner ?? it.fromCorner;
        if (target && it.L.leadO > 0.001) {
          const from = it.fromCorner ?? target;
          const cx = from.x + (target.x - from.x) * it.L.mix;
          const cy = from.y + (target.y - from.y) * it.L.mix;
          const to = this.bridge.unprojectAtDepth(cx, cy, Math.max(0.5, Math.min(depth * 0.55, 6)));
          const leadO = it.L.leadO * gk * (it.cur ? Math.max(paneOpacity, it.L.head) : 1);
          it.lights.leader.set({ from: anchorPos, to, progress: it.L.lead, opacity: Math.min(1, leadO) });
          it.lights.head.set({ pos: leaderPoint(anchorPos, to, it.L.lead), opacity: it.L.head * gk, scale: 1 });
        } else {
          it.lights.leader.set({ from: anchorPos, to: anchorPos, progress: 0, opacity: 0 });
          it.lights.head.set({ opacity: 0 });
        }
      }

      const edgeOn = !it.dying && placed?.mode === 'edge' && LEVEL_RANK[d.level] >= LEVEL_RANK.glance;
      it.edgeO.go(t, edgeOn ? 1 : 0, T.quick, edgeOn ? 'out' : 'in');
      const eo = it.edgeO.at(t);
      if (eo > 0.001 && placed?.edge) {
        if (!it.edge) {
          it.edge = document.createElement('div');
          it.edge.className = s.edge!;
          this.worldLayer.appendChild(it.edge);
        }
        it.edge.style.transform = `translate3d(${placed.edge.x}px, ${placed.edge.y}px, 0)`;
        it.edge.style.opacity = eo.toFixed(3);
      } else if (it.edge) it.edge.style.opacity = '0';

      if (it.dying && !it.cur && it.old.length === 0 && t - it.deadAt > 0.6 && !it.tl?.isActive() && !it.gtl?.isActive() && it.L.pip < 0.01) this.disposeItem(it);
    }

    const ground = new Map<string, Decision>();
    for (const d of this.frame?.items ?? []) if (d.placement.zone === 'ground') ground.set(d.id, d);
    this.route.update(t, ground.get('route'), gk);
    this.column.update(t, ground.get('destination'));
    for (const [id, d] of ground) {
      if (d.component !== 'safety') continue;
      if (!this.safety.has(id)) this.safety.set(id, new SafetyView(this.bridge));
    }
    for (const [id, sv] of this.safety) {
      const alive = sv.update(t, ground.get(id));
      if (!alive && !ground.has(id)) {
        sv.dispose();
        this.safety.delete(id);
      }
    }
  }

  private setTrace(it: Item, trace: { from: Rect; to: Rect } | null, o: number): void {
    if (!trace) {
      if (it.trace) it.trace.style.opacity = '0';
      return;
    }
    if (!it.trace) {
      it.trace = document.createElement('div');
      it.trace.className = s.trace!;
      this.worldLayer.appendChild(it.trace);
    }
    const ax = trace.from.x + trace.from.w / 2;
    const ay = trace.from.y + trace.from.h;
    const bx = trace.to.x + trace.to.w / 2;
    const by = trace.to.y + trace.to.h;
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    it.trace.style.width = `${len.toFixed(1)}px`;
    it.trace.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${ang.toFixed(4)}rad)`;
    it.trace.style.opacity = Math.min(1, (1 - o) / (1 - MOVE.asideOpacity)).toFixed(3);
  }

  report(): { w: number; h: number; panes: PaneReport[] } {
    const vp = this.bridge.viewport();
    const panes: PaneReport[] = [];
    for (const it of this.items.values()) {
      const b = it.cur;
      if (!b || !b.rect || b.opacity < 0.01 || b.level === 'none') continue;
      const r = b.rect;
      const sc = it.kind === 'world' ? (it.placed?.scale ?? 1) : 1;
      panes.push({
        id: it.id,
        level: b.level,
        zone: it.kind,
        rect: { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(b.width * sc * 10) / 10, h: Math.round(b.height * sc * 10) / 10 },
        opacity: Math.round(b.opacity * 1000) / 1000,
        gaze: Boolean(it.d.gaze),
      });
    }
    return { w: vp.w, h: vp.h, panes };
  }

  state(): OverlayState {
    return {
      band: this.band,
      receded: this.receded,
      items: [...this.items.values()].map((it) => ({
        id: it.id,
        level: it.d.level,
        want: it.want,
        rect: it.cur?.rect ?? null,
        opacity: it.cur?.opacity ?? 0,
        ...(it.placed ? { mode: it.placed.mode } : {}),
        dropped: it.aside.dropped,
        aside: it.aside.active,
        yielded: it.yieldS.on,
      })),
      glyph: this.glyphShown ? this.glyphLabel.textContent : null,
      whisper: this.whisper?.el.textContent ?? null,
    };
  }

  hit(x: number, y: number): string | null {
    for (const it of this.items.values()) {
      const r = it.cur?.rect;
      if (!r || !it.cur || it.cur.opacity < 0.3) continue;
      const sc = it.kind === 'world' ? (it.placed?.scale ?? 1) : 1;
      if (x >= r.x && x <= r.x + it.cur.width * sc && y >= r.y && y <= r.y + it.cur.height * sc) return it.id;
    }
    return null;
  }

  dispose(): void {
    for (const it of [...this.items.values()]) this.disposeItem(it);
    this.route.dispose();
    this.column.dispose();
    for (const sv of this.safety.values()) sv.dispose();
    this.gateTl?.kill();
    this.glyphTl?.kill();
    this.root.remove();
  }

  get now(): number {
    return this.t;
  }

  keepOutsNow(): KeepOut[] {
    return this.bridge.keepOuts();
  }
}

const shapeCache = new WeakMap<Decision, Map<PaneLevel, string>>();

function buildShape(it: Item, level: PaneLevel, h: PaneHandlers): string {
  let m = shapeCache.get(it.d);
  if (!m) {
    m = new Map();
    shapeCache.set(it.d, m);
  }
  const hit = m.get(level);
  if (hit !== undefined) return hit;
  const v = buildPane({ ...it.d }, level as Decision['level'], h);
  m.set(level, v.shape);
  return v.shape;
}
