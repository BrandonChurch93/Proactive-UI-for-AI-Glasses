import { gsap } from 'gsap';
import {
  LEVEL_RANK,
  MARGIN,
  NOMINAL_SIZE,
  anchorFactors,
  clamp,
  focusRect,
  rectsOverlap,
  uiScale,
  type Level,
  placeView,
  type Band,
  type BrainFrame,
  type Decision,
  type Glyph,
  type HiddenBy,
  type OverlayEvent,
  type PaneReport,
  type Rect,
  type Vec3,
  type WorldSnapshot,
} from '@lumen/shared';
import { BackdropFill } from './backdrop';
import { leaderPoint, type ColumnHandle, type GroundTextHandle, type KeepOut, type LeaderHandle, type LightHandle, type RouteHandle, type SceneBridge } from './bridge';
import { batch, condense, dissolve, gaze, hidePane, lightVals, mark, recede, retract, travel, ungaze, unrecede, type LightVals, type PaneEls } from './motion';
import { buildPane, styles as s, whisperLine, type PaneHandlers, type PaneView } from './panes';
import { Aside, PaneYield, Placement, Track, Yield, leftRecently, type AsideState, type FrameCtx, type WorldPlace } from './place';
import { Sound } from './sound';
import { EASE, MOVE, T } from './tokens';

type PaneLevel = 'label' | 'glance' | 'card' | 'expanded' | 'none';

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
  box: HTMLElement;
  wrap: HTMLElement;
  seed: HTMLElement;
  width: number;
  height: number;
  w: Track;
  h: Track;
  level: PaneLevel;
  rect: Rect | null;
  fade: { v: number };
  opacity: number;
  off: { x: number; y: number } | null;
  watch: ResizeObserver | null;
  tl?: gsap.core.Timeline;
  still?: boolean;
  scale?: number;
}

interface Item {
  id: string;
  d: Decision;
  kind: 'world' | 'view';
  want: PaneLevel;
  cur: Built | null;
  old: Built[];
  stash: Built | null;
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
  born: number;
  condensingUntil: number;
  order: number;
  decided: Decision['level'] | null;
  pending: { want: PaneLevel; since: number } | null;
  restored: boolean;
  why: { kind: OverlayEvent['kind']; cause: string; detail?: string } | null;
  off: { x: number; y: number } | null;
  size: { w: number; h: number } | null;
  asideOn: boolean;
  fresh: OverlayEvent[];
  lastMove: OverlayEvent | null;
  changedAt: number;
  lookedAt: number;
  lag: number;
  swap: boolean;
  frozen: { x: number; y: number } | null;
}

export interface OverlayOptions {
  reducedMotion?: boolean;
  handlers?: Partial<PaneHandlers>;
  clock?: gsap.core.Timeline;
  log?: (e: OverlayEvent) => void;
  resumed?: boolean;
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
  private glyphBox: { key: string; rect: Rect } | null = null;
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
  private ui = 1;
  private readonly live: HTMLElement;
  private readonly clock: gsap.core.Timeline | null;
  private readonly log: ((e: OverlayEvent) => void) | null;
  private resuming: boolean;

  constructor(
    private bridge: SceneBridge,
    parent: HTMLElement,
    opts: OverlayOptions = {},
  ) {
    this.clock = opts.clock ?? null;
    this.log = opts.log ?? null;
    this.resuming = Boolean(opts.resumed);
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
    this.live = document.createElement('div');
    this.live.className = 'sr';
    this.live.setAttribute('aria-live', 'polite');
    this.fixed.append(this.glyphEl, this.focusEl, this.live);
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
    this.resuming = false;
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
      stash: null,
      tl: null,
      gtl: null,
      L: lightVals(),
      lights: null,
      place: world ? new Placement() : null,
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
      born: t,
      condensingUntil: 0,
      order: this.order++,
      decided: null,
      pending: null,
      restored: this.resuming && LEVEL_RANK[d.level] >= LEVEL_RANK.label && d.level !== 'whisper',
      why: null,
      off: null,
      size: null,
      asideOn: false,
      fresh: [],
      lastMove: null,
      changedAt: -Infinity,
      lookedAt: -Infinity,
      lag: 0,
      swap: false,
      frozen: null,
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
    if (it.stash) this.note(it, 'death', 'brain', 'gone', undefined, it.want);
    for (const e of it.fresh) this.log?.(e);
    it.fresh = [];
    it.tl?.kill();
    it.gtl?.kill();
    for (const b of [it.cur, it.stash, ...it.old]) {
      b?.tl?.kill();
      b?.watch?.disconnect();
      b?.wrap.remove();
    }
    it.tl?.kill();
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

  private placeOrder(): Item[] {
    const depth = new Map<Item, number>();
    for (const it of this.items.values()) {
      const a = it.kind === 'world' ? this.bridge.anchor(it.d.placement.anchor) : undefined;
      depth.set(it, a ? this.bridge.project(a).depth : 0);
    }
    const key = (it: Item): number => (it.kind === 'view' ? 0 : it.d.placement.focusOk ? 1 : LEVEL_RANK[it.d.level] > LEVEL_RANK.label ? 2 : 3);
    return [...this.items.values()].sort((a, b) => key(a) - key(b) || depth.get(a)! - depth.get(b)! || a.order - b.order);
  }

  private stagger(items: Item[]): void {
    const depth = (it: Item): number => {
      const a = this.bridge.anchor(it.d.placement.anchor);
      return a ? this.bridge.project(a).depth : Infinity;
    };
    const born = items.filter((it) => it.kind === 'world' && it.d.level === 'label' && it.want === 'none' && !it.cur && !it.stash);
    const gone = items.filter((it) => it.kind === 'world' && it.want === 'label' && (it.dying || LEVEL_RANK[it.d.level] < LEVEL_RANK.label));
    for (const it of items) it.lag = 0;
    for (const group of [born, gone]) {
      if (group.length < 2) continue;
      group.sort((a, b) => depth(a) - depth(b)).forEach((it, i) => (it.lag = i * MOVE.labelStagger));
    }
    const shrink = items.filter((it) => it.kind === 'world' && it.d.level === 'label' && (it.want === 'card' || it.want === 'expanded'));
    const grow = items.filter((it) => it.kind === 'world' && (it.d.level === 'card' || it.d.level === 'expanded') && it.want === 'label');
    const swap = shrink.length > 0 && grow.length > 0;
    for (const it of items) it.swap = swap && (shrink.includes(it) || grow.includes(it));
  }

  private glyphRect(): Rect | null {
    if (!this.glyphShown) return null;
    const key = `${this.glyphLabel.textContent}|${this.ui}`;
    if (this.glyphBox?.key !== key) {
      const r = this.glyphEl.getBoundingClientRect();
      const host = this.root.getBoundingClientRect();
      this.glyphBox = { key, rect: { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height } };
    }
    return this.glyphBox.rect;
  }

  private paneLevelFor(it: Item, placed: WorldPlace | null): PaneLevel {
    if (it.dying) return 'none';
    const lv = it.d.level;
    if (lv !== 'label' && lv !== 'glance' && lv !== 'card' && lv !== 'expanded') return 'none';
    if (it.kind === 'view') return lv;
    if (!placed || placed.mode !== 'pane') return 'none';
    if (it.aside.dropped) return 'none';
    const c = placed.collapsed;
    if (c && c !== 'pip' && LEVEL_RANK[lv] > LEVEL_RANK[c]) return c as PaneLevel;
    return lv;
  }

  private build(it: Item, level: PaneLevel): Built {
    const view = buildPane({ ...it.d, level: level as Decision['level'] }, level as Decision['level'], this.handlers);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform,opacity';
    const box = document.createElement('div');
    box.className = s.pane!;
    box.dataset.pane = it.d.id;
    box.dataset.zone = it.d.placement.zone;
    const seed = document.createElement('div');
    seed.className = s.seed!;
    box.appendChild(view.el);
    wrap.append(box, seed);
    (it.kind === 'world' ? this.worldLayer : this.viewLayer).appendChild(wrap);
    const width = view.el.offsetWidth;
    const height = view.el.offsetHeight;
    const b: Built = {
      view,
      box,
      wrap,
      seed,
      width,
      height,
      w: new Track(width),
      h: new Track(height),
      level,
      rect: null,
      fade: { v: 1 },
      opacity: 0,
      off: null,
      watch: null,
    };
    this.watch(b);
    this.sizeBox(b, level);
    hidePane(this.els(b));
    gsap.set([box, view.el], { opacity: 1 });
    return b;
  }

  private sizeBox(b: Built, level: PaneLevel): void {
    if (b.box.dataset.level !== level) {
      b.box.dataset.level = level;
      b.box.classList.toggle(s.expandedPane!, level === 'expanded');
    }
    const w = `${b.w.at(this.t).toFixed(1)}px`;
    const h = `${b.h.at(this.t).toFixed(1)}px`;
    if (b.box.style.width !== w) b.box.style.width = w;
    if (b.box.style.height !== h) b.box.style.height = h;
  }

  private watch(b: Built): void {
    b.watch?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    const el = b.view.el;
    b.watch = new ResizeObserver(() => {
      if (b.view.el === el) this.remeasure(b, this.t);
    });
    b.watch.observe(el);
  }

  private remeasure(b: Built, t: number): void {
    const w = b.view.el.offsetWidth;
    const h = b.view.el.offsetHeight;
    if (Math.abs(w - b.width) < 0.5 && Math.abs(h - b.height) < 0.5) return;
    b.width = w;
    b.height = h;
    b.w.go(t, w, this.reduced ? 0 : T.base, 'out');
    b.h.go(t, h, this.reduced ? 0 : T.base, 'out');
  }

  private els(b: Built): PaneEls {
    return { pane: b.box, seed: b.seed, kids: b.view.kids, why: b.view.why, width: b.width };
  }

  private paneRect(_it: Item, b: Built): Rect | undefined {
    if (!b.rect) return undefined;
    const k = (v: number): number => Math.round(v * 10) / 10;
    return { x: k(b.rect.x), y: k(b.rect.y), w: k(b.rect.w), h: k(b.rect.h) };
  }

  private note(it: Item, kind: OverlayEvent['kind'], cause: string, detail?: string, rect?: Rect, from?: PaneLevel): void {
    const e: OverlayEvent = { t: this.t, id: it.id, kind, level: it.want, cause };
    if (from !== undefined) e.from = from;
    if (detail) e.detail = detail;
    if (rect) e.rect = rect;
    it.fresh.push(e);
  }

  private explain(it: Item, placed: WorldPlace | null, want: PaneLevel, decided: boolean): NonNullable<Item['why']> {
    const d = it.d;
    const brain = { cause: 'brain', detail: [d.action, d.cause].filter(Boolean).join(' · ') };
    if (want === 'none') {
      if (it.dying) return { kind: 'death', cause: 'brain', detail: 'gone' };
      if (LEVEL_RANK[d.level] < LEVEL_RANK.label || d.level === 'whisper') return { kind: 'death', ...brain };
      if (it.aside.dropped) return { kind: 'drop', cause: 'keepout', detail: it.aside.by ?? '' };
      if (!placed || placed.mode === 'edge') return { kind: 'edge', cause: placed?.why === 'edge' ? 'view edge' : 'offscreen' };
      return { kind: 'hide', cause: placed.why ?? 'room', detail: d.placement.focusOk ? '' : 'not looked at' };
    }
    if (it.restored) return { kind: 'birth', cause: 'resume' };
    if (decided) return { kind: 'birth', ...brain };
    if (placed?.collapsed && placed.why) return { kind: 'birth', cause: placed.why };
    return { kind: 'birth', cause: 'return', detail: d.placement.focusOk && it.why?.detail === 'not looked at' ? 'looked at again' : (it.why?.cause ?? '') };
  }

  private morph(it: Item, b: Built, want: PaneLevel, t: number, from: PaneLevel, why: Item['why'] | undefined): void {
    it.tl?.kill();
    const tl = this.tl();
    gsap.set(b.box, { clipPath: 'inset(0 0 0% 0)', '--ca': 0 });
    gsap.set(b.seed, { opacity: 0 });
    b.fade.v = 1;
    if (it.lights) gsap.set(it.L, { lead: 1, leadO: 1, head: 0 });
    const old = b.view;
    tl.to(old.kids, { opacity: 0, filter: 'blur(4px)', duration: MOVE.morphOut, ease: EASE.in }, 0);
    tl.call(() => old.el.remove(), [], MOVE.morphOut + 0.02);
    if (old.why) tl.to(old.why, { opacity: 0, duration: MOVE.morphOut, ease: EASE.in }, 0);
    const view = buildPane({ ...it.d, level: want as Decision['level'] }, want as Decision['level'], this.handlers);
    b.box.appendChild(view.el);
    gsap.set(view.el, { opacity: 1 });
    gsap.set(view.kids, { opacity: 0 });
    if (view.why) gsap.set(view.why, { opacity: 0 });
    b.view = view;
    b.width = view.el.offsetWidth;
    b.height = view.el.offsetHeight;
    this.watch(b);
    const grow = from !== want;
    const dur = this.reduced ? 0 : it.swap ? MOVE.swap : want === 'expanded' ? T.open : want === 'card' ? T.baseCard : want === 'label' ? MOVE.labelShrink : T.base;
    b.w.go(t, b.width, dur, 'out');
    b.h.go(t, b.height, dur, 'out');
    b.level = want;
    this.sizeBox(b, want);
    const c = it.d.content;
    if (grow) this.live.textContent = [c.name, c.fact ?? c.live, c.showReason !== false ? c.reason.text : ''].filter(Boolean).join('. ');
    const held = it.d.reason.text === HELD_LINE && it.d.content.showReason !== false;
    const whyAt = held ? Math.max(0, this.gateEndAt + MOVE.returnS - t) : undefined;
    const kids = whyAt !== undefined && view.why ? view.kids.filter((k) => k !== view.why) : view.kids;
    let end: number;
    if (this.reduced) {
      tl.to(kids, { opacity: 1, duration: 0.2, ease: 'none' }, 0);
      end = 0.2;
    } else {
      tl.fromTo(
        kids,
        { opacity: 0, y: -3, filter: 'blur(5px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: T.base, ease: EASE.out, stagger: MOVE.stagger, clearProps: 'filter' },
        MOVE.morphIn,
      );
      end = MOVE.morphIn + T.base + MOVE.stagger * Math.max(0, kids.length - 1);
    }
    if (whyAt !== undefined && view.why) {
      const w = Math.max(end, whyAt);
      tl.fromTo(view.why, { opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0px)', duration: T.base, ease: EASE.out, clearProps: 'filter' }, w);
      end = w + T.base;
    }
    if (grow && (want === 'card' || want === 'expanded') && LEVEL_RANK[want] > LEVEL_RANK[from]) tl.call(() => this.sound.breathUp(want === 'expanded'), [], 0);
    it.condensingUntil = t + Math.max(end, dur);
    it.changedAt = t;
    it.want = want;
    it.tl = tl;
    it.off = null;
    it.size = null;
    if (why) {
      it.why = why;
      it.restored = false;
      this.note(it, 'resize', why.cause, why.detail, undefined, from);
    }
  }

  private transition(it: Item, want: PaneLevel, t: number, edge = false, why?: Item['why']): void {
    it.tl?.kill();
    const tl = this.tl();
    const prev = it.cur;
    const from = it.want;
    if (prev && want !== 'none') {
      this.morph(it, prev, want, t, from, why);
      return;
    }
    if (!prev && want === 'none' && it.stash && why?.kind === 'death') {
      const b = it.stash;
      it.stash = null;
      b.tl?.kill();
      b.wrap.remove();
      it.old = it.old.filter((o) => o !== b);
      it.want = want;
      it.why = why;
      this.note(it, 'death', why.cause, why.detail, undefined, from);
      return;
    }
    const prevRect = prev ? this.paneRect(it, prev) : undefined;
    let at = 0;
    const world = it.kind === 'world' && it.lights !== null;
    if (prev) {
      const keep = !it.dying && why !== undefined && why !== null && why.kind !== 'death';
      const dtl = this.tl();
      let end: number;
      if (edge) {
        prev.still = true;
        dtl.to(prev.fade, { v: 0, duration: T.quick, ease: EASE.in });
        end = T.quick;
      } else end = dissolve(dtl, this.els(prev), it.lag, this.reduced, prev.fade);
      dtl.call(() => {
        if (keep) prev.wrap.style.opacity = '0';
        else {
          prev.watch?.disconnect();
          prev.wrap.remove();
        }
        it.old = it.old.filter((o) => o !== prev);
      }, [], end + 0.02);
      prev.tl = dtl;
      it.old.push(prev);
      if (keep) it.stash = prev;
      at = end;
    }
    it.cur = null;
    let returned = false;
    if (want !== 'none') {
      const c = it.d.content;
      this.live.textContent = [c.name, c.fact ?? c.live, c.showReason !== false ? c.reason.text : ''].filter(Boolean).join('. ');
      const b = it.stash ? this.restore(it, it.stash, want) : this.build(it, want);
      returned = it.stash === b;
      it.stash = null;
      it.cur = b;
      const big = want === 'card' || want === 'expanded';
      const looked = it.d.cause === 'dwell' || it.d.cause === 'pinch' || it.d.cause === 'settle';
      if (world) {
        const dur = big ? MOVE.travelCard : MOVE.travelGlance;
        const tStart = (t - it.born < 0.05 && !looked ? 0.35 : 0) + it.lag;
        const arrive = travel(tl, it.L, tStart, dur, this.reduced);
        at = looked && !returned ? tStart : arrive;
        if (big) tl.call(() => this.sound.breathUp(want === 'expanded'), [], tStart + dur / 2);
      } else if (big || it.d.component === 'pocket') {
        tl.call(() => this.sound.breathUp(true), [], at);
      }
      const held = it.d.reason.text === HELD_LINE && it.d.content.showReason !== false;
      const whyAt = held ? Math.max(0, this.gateEndAt + MOVE.returnS - t) : undefined;
      const batched = it.d.component === 'strip' && !this.reduced && whyAt === undefined;
      const end = batched ? batch(tl, this.els(b), at, b.fade) : condense(tl, this.els(b), at, {
        card: big,
        reduced: this.reduced,
        open: want === 'expanded' || it.d.component === 'pocket',
        ...(whyAt !== undefined ? { whyAt } : {}),
        ...(looked ? { kidsAt: MOVE.revealAt } : {}),
        fade: b.fade,
      });
      it.condensingUntil = t + end;
    } else if (world && prev) {
      retract(tl, it.L, edge ? 0 : Math.max(0, at - 0.12), this.reduced || edge);
    }
    it.want = want;
    it.tl = tl;
    it.off = null;
    it.size = null;
    it.changedAt = t;
    if (why && (want !== 'none' || prev)) {
      it.why = why;
      it.restored = false;
      this.note(it, returned ? 'return' : why.kind, why.cause, why.detail, want === 'none' ? prevRect : undefined, from);
    }
  }

  private restore(it: Item, b: Built, want: PaneLevel): Built {
    b.tl?.kill();
    b.still = false;
    it.old = it.old.filter((o) => o !== b);
    if (b.level !== want || b.view.shape !== buildShape(it, want, this.handlers)) {
      const view = buildPane({ ...it.d, level: want as Decision['level'] }, want as Decision['level'], this.handlers);
      b.view.el.replaceWith(view.el);
      gsap.set(view.el, { opacity: 1 });
      b.view = view;
      this.watch(b);
      b.width = view.el.offsetWidth;
      b.height = view.el.offsetHeight;
      b.w.set(b.width);
      b.h.set(b.height);
      b.level = want;
      this.sizeBox(b, want);
    }
    hidePane(this.els(b));
    return b;
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
    let reach = 0;
    for (const it of this.items.values()) {
      if (it.kind !== 'world' || it.dying || LEVEL_RANK[it.d.level] < LEVEL_RANK.label) continue;
      const a = this.bridge.anchor(it.d.placement.anchor);
      if (a) reach = Math.max(reach, this.bridge.project(a).depth);
    }
    const keepOuts = this.bridge.keepOuts(reach);
    const ui = uiScale(vp);
    if (ui !== this.ui) {
      this.ui = ui;
      this.root.style.setProperty('--ui', ui.toFixed(3));
    }
    const yieldSide = this.yieldTracker.update({ t, yawRate: this.yawRate, curbDistance: this.bridge.curbDistance(), yaw: cam.yaw, target: this.snap?.wearer.gaze.target ?? null });
    const chrome: Rect[] = [];
    for (const it of this.items.values()) {
      const r = it.kind === 'view' && !it.dying && it.cur && it.cur.opacity > 0.05 ? it.cur.rect : null;
      if (r) chrome.push({ x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 });
    }
    for (const r of this.bridge.chrome?.() ?? []) chrome.push({ x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 });
    const glyph = this.glyphRect();
    if (glyph) chrome.push({ x: glyph.x - 8, y: glyph.y - 8, w: glyph.w + 16, h: glyph.h + 16 });
    const ctx: FrameCtx = { t, band: this.band, vp, keepOuts, chrome, ui, scanning: yieldSide !== null };
    const gk = this.gateK.v;
    const pipMul = this.snooze ? 0.3 : 1;
    const zone = focusRect(this.band, vp.w, vp.h);
    gsap.set(this.focusEl, { left: zone.x, top: zone.y, width: zone.w, height: zone.h });

    const slots = new Map<string, number>();
    const ordered = this.placeOrder();
    this.stagger(ordered);
    const taken: Rect[] = [];
    let below = 0;
    for (const it of ordered) {
      const r = it.kind === 'view' && !it.dying && it.d.placement.anchor === 'view:edge-top' ? it.cur?.rect : null;
      if (r && it.cur!.opacity > 0.05) below = Math.max(below, r.y + r.h + 10);
    }
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
          const lv = d.level === 'label' || d.level === 'glance' || d.level === 'card' || d.level === 'expanded' ? d.level : 'label';
          const nominal = NOMINAL_SIZE[lv];
          const kept = it.cur ?? it.stash;
          const size = kept && kept.level === lv ? { w: kept.width, h: kept.height } : nominal;
          const cam = this.bridge.camera();
          const dist = Math.hypot(anchorPos.x - cam.pos.x, anchorPos.y - cam.pos.y, anchorPos.z - cam.pos.z);
          const sizeOf = (l: Level): { w: number; h: number } =>
            kept && kept.level === l ? { w: kept.width, h: kept.height } : (NOMINAL_SIZE[l as 'label' | 'card' | 'expanded'] ?? NOMINAL_SIZE.label);
          if (d.placement.focusOk) it.lookedAt = t;
          if (it.frozen && it.yieldS.on && it.placed?.mode === 'pane') placed = it.placed;
          else placed = it.place.update({ level: lv, anchor: p, distance: dist, size, focusOk: Boolean(d.placement.focusOk) || leftRecently(t, it.lookedAt), zoneOk: Boolean(d.placement.zoneOk), left: !d.placement.focusOk && leftRecently(t, it.lookedAt), sizeOf }, taken.length ? { ...ctx, chrome: [...chrome, ...taken] } : ctx);
          if (placed.mode === 'pane' && LEVEL_RANK[d.level] >= LEVEL_RANK.label && !it.dying) {
            const r = placed.rect;
            taken.push({ x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 });
          }
          it.placed = placed;
        }
      }
      let aside: AsideState | null = null;
      let corner: { x: number; y: number } | null = null;
      let fx = 0.5;
      let fy = 1;
      if (placed && placed.mode === 'pane' && it.place) {
        ({ fx, fy } = anchorFactors(placed.align ?? 'center', placed.vertical ?? 'above'));
        corner = { x: placed.rect.x + placed.rect.w * fx + it.place.jumpX.at(t), y: placed.rect.y + placed.rect.h * fy + it.place.jumpY.at(t) };
      }
      if (placed && placed.mode === 'pane' && corner && LEVEL_RANK[d.level] >= LEVEL_RANK.label && !it.dying) {
        const sc = placed.scale;
        const c = placed.collapsed;
        const lv = c && c !== 'pip' && LEVEL_RANK[d.level] > LEVEL_RANK[c] ? c : d.level;
        const size = it.cur && it.cur.level === lv ? { w: it.cur.width, h: it.cur.height } : (NOMINAL_SIZE[lv as 'label'] ?? NOMINAL_SIZE.label);
        const home = { x: corner.x - size.w * sc * fx, y: corner.y - size.h * sc * fy, w: size.w * sc, h: size.h * sc };
        const inset = MARGIN - MOVE.deadBand - 2;
        const outside = home.x < inset || home.y < inset || home.x + home.w > vp.w - inset || home.y + home.h > vp.h - inset || chrome.some((r) => rectsOverlap(home, r));
        if (outside && !it.frozen && pr && it.place) {
          placed = it.place.foldNow(pr, vp);
          it.placed = placed;
          corner = null;
        } else aside = it.aside.update(home, ctx, Boolean(d.placement.focusOk || d.placement.zoneOk) || leftRecently(t, it.lookedAt), depth);
      }
      const want = this.paneLevelFor(it, placed);
      const decided = it.d.level !== it.decided;
      const inZone = !d.placement.focusOk && !leftRecently(t - MOVE.pushOut, it.lookedAt) && want === 'none' && Boolean(it.cur?.rect && rectsOverlap(it.cur.rect, zone));
      const backInView = Boolean(d.placement.focusOk) && it.want === 'none' && want !== 'none';
      const cr = it.cur?.rect;
      const strayed = want === 'none' && it.kind === 'world' && Boolean(cr && pr && Math.hypot(Math.max(cr.x - pr.x, 0, pr.x - (cr.x + cr.w)), Math.max(cr.y - pr.y, 0, pr.y - (cr.y + cr.h))) > cr.w);
      const urgent = decided || it.dying || it.aside.dropped || it.kind === 'view' || inZone || backInView || strayed || placed?.mode === 'edge' || (it.want === 'none' && !it.cur && t - it.born < 0.05) || (it.why?.kind === 'drop' && want !== 'none');
      if (want !== it.want) {
        if (urgent) {
          it.pending = null;
          const why = this.explain(it, placed, want, decided);
          it.decided = it.d.level;
          this.transition(it, want, t, placed?.mode === 'edge' || inZone, why);
        } else if (!it.yieldS.on) {
          if (!it.pending || it.pending.want !== want) it.pending = { want, since: t };
          else if (t - it.pending.since >= MOVE.settle && t - it.changedAt >= MOVE.minShown) {
            it.pending = null;
            this.transition(it, want, t, placed?.mode === 'edge', this.explain(it, placed, want, false));
          }
        }
      } else {
        it.pending = null;
        it.decided = it.d.level;
      }
      if (want === it.want && it.cur && it.cur.view.shape !== buildShape(it, want, this.handlers)) this.transition(it, want, t, false, { kind: 'resize', cause: 'shape' });
      else if (it.cur && it.cur.view.update(d.content)) this.remeasure(it.cur, t);

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
            const nearView = pr && depth > 1 && pr.x > -vp.w * 0.25 && pr.x < vp.w * 1.25 && pr.y > -vp.h * 0.25 && pr.y < vp.h * 1.25;
            if (b.off && pr && nearView && !b.still) rect = { ...(b.rect ?? { w: 0, h: 0 }), x: pr.x + b.off.x, y: pr.y + b.off.y } as Rect;
            else if (b.rect) rect = b.rect;
            else continue;
            scale = b.scale ?? it.placed?.scale ?? 1;
          } else {
            scale = placed.scale;
            b.scale = scale;
            const w = b.w.at(t) * scale;
            const h = b.h.at(t) * scale;
            const at = corner ?? { x: placed.rect.x + placed.rect.w * fx, y: placed.rect.y + placed.rect.h * fy };
            const base = { x: at.x - w * fx, y: at.y - h * fy, w, h };
            const a = aside ?? { dx: 0, dy: 0, opacity: 1, dropped: false, active: false, by: null, trace: null };
            asideO = a.opacity;
            const fz = it.frozen;
            const paneSide = (fz ? fz.x - w * fx + w / 2 : base.x + base.w / 2) < vp.w / 2 ? 'left' : 'right';
            const y = it.yieldS.update(t, fz ? (yieldSide !== null ? paneSide : null) : placed.stilled ? paneSide : yieldSide, paneSide);
            yieldO = y.opacity;
            if (it.yieldS.on) it.frozen ??= { x: at.x + a.dx, y: at.y + a.dy };
            else if (fz) {
              it.place?.ease(t, fz, { x: at.x + a.dx, y: at.y + a.dy }, MOVE.yieldOut);
              it.frozen = null;
            }
            rect = fz ? { x: fz.x - w * fx + y.dx, y: fz.y - h * fy, w, h } : { x: base.x + a.dx + y.dx, y: base.y + a.dy, w: base.w, h: base.h };
            this.setTrace(it, a.trace && !a.dropped ? a.trace : null, a.opacity);
            if (pr) b.off = { x: rect.x - pr.x, y: rect.y - pr.y };
          }
        } else {
          const slot = d.placement.anchor.startsWith('view:') ? d.placement.anchor : 'view:edge-right';
          const i = b === it.cur ? (slots.get(slot) ?? 0) : 0;
          if (b === it.cur) slots.set(slot, i + 1);
          scale = ui;
          rect = b.rect && b !== it.cur ? b.rect : placeView(slot, { w: b.w.at(t) * ui, h: b.h.at(t) * ui }, vp, i, slot === 'view:edge-right' ? below : 0, ui);
          if (slot === 'view:glyph') rect = { ...rect, y: vp.h - 44 * ui - b.h.at(t) * ui };
          if (b === it.cur) {
            const y = it.yieldS.update(t, yieldSide, rect.x + rect.w / 2 < vp.w / 2 ? 'left' : 'right');
            yieldO = y.opacity;
            rect = { ...rect, x: rect.x + y.dx };
          }
        }
        if (it.kind === 'world') rect = { ...rect, x: clamp(rect.x, 0, Math.max(0, vp.w - rect.w)), y: clamp(rect.y, 0, Math.max(0, vp.h - rect.h)) };
        b.rect = rect;
        const o = b.fade.v * asideO * yieldO;
        b.opacity = o;
        if (b === it.cur) paneOpacity = o;
        b.wrap.style.transform = `translate3d(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        b.wrap.style.opacity = o.toFixed(3);
        this.sizeBox(b, b.level);
        b.box.style.setProperty('--fill-a', fill.alpha.toFixed(3));
        b.box.style.setProperty('--fill-b', (fill.alpha - 0.04).toFixed(3));
        b.box.style.setProperty('--weight', String(fill.weight));
      }

      if (it.lights && anchorPos) {
        const gazedNow = this.frame?.dwell.target === it.id && (this.frame?.dwell.dwellMs ?? 0) >= MOVE.gazeTellMs && !it.dying;
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
        const lr = (it.cur ?? it.old[it.old.length - 1])?.rect;
        if (lr && pr && it.L.leadO > 0.001) {
          const m = edgePointNearest(lr, pr);
          const to = this.bridge.unprojectAtDepth(m.x, m.y, Math.max(0.5, Math.min(depth * 0.55, 6)));
          const leadO = it.L.leadO * gk * (it.cur ? Math.max(paneOpacity, it.L.head) : 1);
          it.lights.leader.set({ from: anchorPos, to, progress: it.L.lead, opacity: Math.min(1, leadO) });
          it.lights.head.set({ pos: leaderPoint(anchorPos, to, it.L.lead), opacity: it.L.head * gk, scale: 1 });
        } else {
          it.lights.leader.set({ from: anchorPos, to: anchorPos, progress: 0, opacity: 0 });
          it.lights.head.set({ opacity: 0 });
        }
      }

      const edgeOn = !it.dying && placed?.mode === 'edge' && LEVEL_RANK[d.level] >= LEVEL_RANK.label;
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

      this.track(it, placed, aside, pr);
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
    const isBike = (d: Decision | undefined): boolean => Boolean(d?.placement.anchor.startsWith('bike:'));
    const bike = [...ground.values()].some(isBike);
    for (const [id, sv] of this.safety) {
      const d = ground.get(id);
      const alive = sv.update(t, bike && d && !isBike(d) ? undefined : d);
      if (!alive && !ground.has(id)) {
        sv.dispose();
        this.safety.delete(id);
      }
    }
  }

  private track(it: Item, placed: WorldPlace | null, aside: AsideState | null, pr: { x: number; y: number } | null): void {
    const on = Boolean(aside?.active && !aside.dropped);
    if (on && !it.asideOn) this.note(it, 'aside', 'keepout', aside?.by ?? '');
    else if (!on && it.asideOn && !aside?.dropped) this.note(it, 'aside', 'clear');
    it.asideOn = on;
    const b = it.cur;
    const born = it.fresh.some((e) => e.kind === 'birth');
    if (it.frozen && placed?.mode === 'pane' && pr) {
      const { fx, fy } = anchorFactors(placed.align ?? 'center', placed.vertical ?? 'above');
      it.off = { x: placed.rect.x + placed.rect.w * fx - pr.x, y: placed.rect.y + placed.rect.h * fy - pr.y };
    } else if (b && placed?.mode === 'pane' && pr && !born) {
      const { fx, fy } = anchorFactors(placed.align ?? 'center', placed.vertical ?? 'above');
      const off = { x: placed.rect.x + placed.rect.w * fx - pr.x, y: placed.rect.y + placed.rect.h * fy - pr.y };
      if (it.off && Math.hypot(off.x - it.off.x, off.y - it.off.y) > 40) {
        const cause = placed.moved ?? placed.why ?? 'anchor';
        const lm = it.lastMove;
        if (lm && lm.cause === cause && this.t - lm.t < 0.25) {
          const r = this.paneRect(it, b);
          if (r) lm.rect = r;
          lm.detail = `${Number(lm.detail?.split(' ')[0] ?? 1) + 1} steps`;
        } else {
          this.note(it, 'move', cause);
          it.lastMove = it.fresh[it.fresh.length - 1]!;
        }
        it.off = off;
      } else if (!it.off) it.off = off;
    }
    if (b) {
      const sc = it.kind === 'world' ? (it.placed?.scale ?? 1) : this.ui;
      const size = { w: b.width * sc, h: b.height * sc };
      if (it.size && Math.abs(size.w - it.size.w) > it.size.w * 0.12) this.note(it, 'resize', 'scale');
      if (!it.size || Math.abs(size.w - it.size.w) > it.size.w * 0.12) it.size = size;
    }
    const later: OverlayEvent[] = [];
    for (const e of it.fresh) {
      if (e.kind === 'birth' && e.t === this.t && !e.rect) {
        later.push(e);
        continue;
      }
      if (!e.rect && b) {
        const r = this.paneRect(it, b);
        if (r) e.rect = r;
      }
      this.log?.(e);
    }
    it.fresh = later;
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
    const k = (v: number): number => Math.round(v * 10) / 10;
    for (const it of this.items.values()) {
      if (it.dying || it.d.component === 'whisper') continue;
      const b = it.cur;
      let hiddenBy: HiddenBy | undefined;
      if (it.kind === 'world') {
        const pl = it.placed;
        const wantsPane = LEVEL_RANK[it.d.level] >= LEVEL_RANK.label;
        if (!pl) hiddenBy = 'offscreen';
        else if (pl.mode === 'edge') hiddenBy = pl.behind ? 'offscreen' : 'edge';
        else if (it.aside.dropped) hiddenBy = 'keepout';
        else if (wantsPane && (pl.mode === 'pip' || it.want === 'none')) hiddenBy = 'room';
      }
      const r = b?.rect;
      const report: PaneReport = {
        id: it.id,
        level: b && b.level !== 'none' ? b.level : it.d.level,
        zone: it.kind,
        rect: r ? { x: k(r.x), y: k(r.y), w: k(r.w), h: k(r.h) } : { x: 0, y: 0, w: 0, h: 0 },
        opacity: b ? Math.round(b.opacity * 1000) / 1000 : 0,
        gaze: Boolean(it.d.gaze),
        visible: hiddenBy === undefined,
      };
      if (hiddenBy) report.hiddenBy = hiddenBy;
      panes.push(report);
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
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return it.id;
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

function edgePointNearest(r: Rect, p: { x: number; y: number }): { x: number; y: number } {
  const edges: [number, number, number, number][] = [
    [r.x, r.y + r.h, r.x + r.w, r.y + r.h],
    [r.x, r.y, r.x + r.w, r.y],
    [r.x, r.y, r.x, r.y + r.h],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
  ];
  let best = edges[0]!;
  let bestD = Infinity;
  for (const e of edges) {
    const dx = e[2] - e[0];
    const dy = e[3] - e[1];
    const u = Math.max(0, Math.min(1, ((p.x - e[0]) * dx + (p.y - e[1]) * dy) / (dx * dx + dy * dy || 1)));
    const dd = Math.hypot(p.x - (e[0] + dx * u), p.y - (e[1] + dy * u));
    if (dd < bestD - 0.5) {
      bestD = dd;
      best = e;
    }
  }
  const inset = 8;
  const dx = best[2] - best[0];
  const dy = best[3] - best[1];
  const len = Math.hypot(dx, dy) || 1;
  const along = Math.max(inset, Math.min(len - inset, ((p.x - best[0]) * dx + (p.y - best[1]) * dy) / len));
  return { x: best[0] + (dx / len) * along, y: best[1] + (dy / len) * along };
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
