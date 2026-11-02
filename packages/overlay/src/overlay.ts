import { gsap } from 'gsap';
import {
  LEVEL_RANK,
  MARGIN,
  NOMINAL_SIZE,
  PIP_GAP,
  READ,
  VIEWFINDER,
  anchorFactors,
  DOORWAY,
  keepOutsFor,
  viewfinderHalf,
  type Projected,
  angleWrap,
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
  clockAt,
} from '@lumen/shared';
import { BackdropFill } from './backdrop';
import { leaderPoint, type ColumnHandle, type GroundTextHandle, type KeepOut, type LeaderHandle, type LightHandle, type RouteHandle, type SceneBridge } from './bridge';
import { batch, condense, dissolve, gaze, hidePane, lightVals, mark, recede, retract, slideIn, slideOut, travel, ungaze, unrecede, type LightVals, type PaneEls } from './motion';
import { MENU_GLYPHS, buildPane, isBanner, isTucked, styles as s, whisperLine, type PaneHandlers, type PaneView } from './panes';
import { Aside, PaneYield, Placement, Track, Yield, leftRecently, type AsideState, type FrameCtx, type WorldPlace } from './place';
import { EASE, MOVE, T } from './tokens';

type PaneLevel = 'label' | 'glance' | 'card' | 'expanded' | 'none';

const HELD_LINE = 'Held that while you crossed';
const QUIET_LINE = { crossing: 'Overlay paused while you cross the street', roadway: 'Overlay paused · traffic close by', vehicle: 'Overlay paused · traffic close by' } as const;

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
  rule: HTMLElement;
  width: number;
  height: number;
  w: Track;
  h: Track;
  level: PaneLevel;
  rect: Rect | null;
  fade: { v: number };
  slide: { v: number };
  home: Rect | null;
  opacity: number;
  off: { x: number; y: number } | null;
  watch: ResizeObserver | null;
  tl?: gsap.core.Timeline;
  still?: boolean;
  scale?: number;
}

// The pane the look is on: its center keeps an offset from its projected light, fixed the frame the look lands and driven
// toward the center of the view by the pull while the wearer rests.
interface Held {
  fx: number;
  fy: number;
  off: { x: number; y: number };
  w: number;
  h: number;
  outSince: number | null;
  level: Level;
  readGap?: number;
  // An expanded view the wearer has dragged across is being read: the pull would move its rows from under the eye.
  reread?: boolean;
  // The pull has begun: until then nothing, not even the chrome, moves the pane.
  pulled?: boolean;
  vx?: number;
  vy?: number;
  lastT?: number;
}

// Critically damped, so the pull starts softly and settles in t-pull without passing the center.
const PULL_W = 5.8 / MOVE.pull;

function factors(p: WorldPlace): { fx: number; fy: number } {
  return p.fx !== undefined && p.fy !== undefined ? { fx: p.fx, fy: p.fy } : anchorFactors(p.align ?? 'center', p.vertical ?? 'above');
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
  homeAt: { x: number; y: number; t: number } | null;
  lag: number;
  swap: boolean;
  frozen: { x: number; y: number } | null;
  edgeSince: number | null;
  hold: Held | null;
  holdEnded: boolean;
  ride: { x: number; y: number } | null;
  foldedUntil: number;
  // Where the light was, and which anchor it was, when the pane was last placed: an arrival moves the anchor to the door.
  placedPr: { x: number; y: number; anchor: string } | null;
}

const FOLD_LEAD_S = 0.4;
const MAP_M_PER_PX = 0.55;
const MAP_VOICE = '#ffd98a';
const MAP_TONES: Record<string, string> = { food: '#e0946a', cafe: '#d4ac7a', theater: '#ef7a74', venue: '#c49ae6', shop: '#e3cc84', service: '#9fd3c2', transit: '#7fa9e6', park: '#9fdc9f' };
// A newborn pane's first frames move with its placement settling, not with the view; that is not motion to look ahead along.
const FOLD_SETTLE_S = 0.1;
const FAST_TURN = 1.5;

export interface OverlayOptions {
  reducedMotion?: boolean;
  handlers?: Partial<PaneHandlers>;
  clock?: gsap.core.Timeline;
  log?: (e: OverlayEvent) => void;
  resumed?: boolean;
  time?: boolean;
  aiming?: () => boolean;
  gaze?: () => { target: string | null; dwellMs: number };
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

function nudge(r: Rect, vp: { w: number; h: number }, avoid: Rect[]): { x: number; y: number } | null {
  const ok = (q: Rect): boolean => q.x >= MARGIN && q.y >= MARGIN && q.x + q.w <= vp.w - MARGIN && q.y + q.h <= vp.h - MARGIN && !avoid.some((k) => rectsOverlap(q, k));
  for (let d = 0; d <= 56; d += 4) {
    const e = Math.round(d / Math.SQRT2);
    for (const [sx, sy] of d === 0 ? [[0, 0]] : [[0, d], [0, -d], [d, 0], [-d, 0], [e, e], [-e, e], [e, -e], [-e, -e]]) {
      if (ok({ ...r, x: r.x + sx!, y: r.y + sy! })) return { x: sx!, y: sy! };
    }
  }
  return null;
}

export class Overlay {
  readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly worldLayer: HTMLElement;
  private readonly viewLayer: HTMLElement;
  private readonly fixed: HTMLElement;
  private readonly glyphEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private timeBox: { key: string; rect: Rect } | null = null;
  private readonly glyphLabel: HTMLElement;
  private readonly focusEl: HTMLElement;
  private readonly quietEl: HTMLElement;
  private readonly menuBtn: HTMLButtonElement;
  private menuHover: { on: boolean; since: number | null; fired: boolean } = { on: false, since: null, fired: false };
  private menuBox: { key: string; rect: Rect } | null = null;
  private quietTl: gsap.core.Timeline | null = null;
  quietOn = false;
  private items = new Map<string, Item>();
  private order = 0;
  private frame: BrainFrame | null = null;
  private snap: WorldSnapshot | null = null;
  private band: Band = 'walk';
  private receded = false;
  private aiming: () => boolean;
  // The look as it is this frame, not as of the last tick: a pane must be pinned before the tick that marks it looked at re-places it.
  private gazeNow: () => { target: string | null; dwellMs: number };
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
    this.aiming = opts.aiming ?? (() => false);
    this.gazeNow = opts.gaze ?? (() => ({ target: this.snap?.wearer.gaze.target ?? null, dwellMs: this.snap?.wearer.gaze.dwellMs ?? 0 }));
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
    this.timeEl = document.createElement('div');
    this.timeEl.className = s.time!;
    if (opts.time === false) this.timeEl.style.display = 'none';
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
    this.quietEl = document.createElement('div');
    this.quietEl.className = s.quietLine!;
    this.menuBtn = document.createElement('button');
    this.menuBtn.type = 'button';
    this.menuBtn.className = s.menuBtn!;
    this.menuBtn.setAttribute('aria-label', 'Find a place');
    this.menuBtn.innerHTML = `<span class="${s.menuFind}">FIND<span class="${s.menuWide}"> A PLACE</span></span><i>${MENU_GLYPHS.compass}</i>`;
    if (opts.time === false) this.menuBtn.style.display = 'none';
    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.choice('menu', 'open');
    });
    // The viewfinder cannot reach chrome fixed to the glass, so the pointer stands in for the look, as over every view-zone pane.
    this.menuBtn.addEventListener('pointerenter', () => (this.menuHover = { on: true, since: null, fired: false }));
    this.menuBtn.addEventListener('pointerleave', () => (this.menuHover = { on: false, since: null, fired: false }));
    this.fixed.append(this.timeEl, this.glyphEl, this.quietEl, this.menuBtn, this.focusEl, this.live);
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
    if (frame.gate.safety) {
      const held = frame.glyph?.kind === 'held' && frame.glyph.count ? ` · ${frame.glyph.count} held` : '';
      const text = `${QUIET_LINE[frame.gate.safetyCause ?? 'vehicle']}${held}`;
      if (this.quietEl.textContent !== text) this.quietEl.textContent = text;
    }
    const time = clockAt(t, true);
    if (this.timeEl.textContent !== time) this.timeEl.textContent = time;
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
      homeAt: null,
      lag: 0,
      swap: false,
      frozen: null,
      edgeSince: null,
      hold: null,
      holdEnded: false,
      ride: null,
      foldedUntil: -Infinity,
      placedPr: null,
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
    this.quietOn = on;
    this.quietTl?.kill();
    this.quietTl = on
      ? this.tl().fromTo(this.quietEl, { opacity: 0, filter: 'blur(4px)', y: -3 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: T.base, ease: EASE.out, clearProps: 'filter' }, MOVE.glyphAt)
      : this.tl().to(this.quietEl, { opacity: 0, duration: T.quick, ease: EASE.in });
    if (on) {
      this.gateTl = recede(this.tl(), this.hud, this.gateK);
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

  private mapYaw: number | null = null;
  private mapT = 0;

  // The plan heading-up along the walk: it turns with the route under the wearer, eased over t-base and held while they stand, never with the head; the head is the cone.
  private drawMap(cv: HTMLCanvasElement, t: number): void {
    const m = this.bridge.mapView?.();
    if (!m) return;
    const size = 180;
    const dpr = Math.min(3, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) * this.ui);
    const px = Math.round(size * dpr);
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    const dt = Math.max(0, t - this.mapT);
    this.mapT = t;
    if (this.mapYaw === null || dt > 1) this.mapYaw = m.heading;
    else if (this.band !== 'stopped') this.mapYaw += angleWrap(m.heading - this.mapYaw) * (1 - Math.exp(-dt / (T.base / 3)));
    const yaw = this.mapYaw;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const k = dpr / MAP_M_PER_PX;
    const cx = (size / 2) * dpr;
    const cy = size * (2 / 3) * dpr;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const ox = cx - (c * m.x - sn * m.z) * k;
    const oy = cy - (sn * m.x + c * m.z) * k;
    g.setTransform(c * k, sn * k, -sn * k, c * k, ox, oy);
    const rect = (a: { x0: number; z0: number; x1: number; z1: number }): [number, number, number, number] => [Math.min(a.x0, a.x1), Math.min(a.z0, a.z1), Math.abs(a.x1 - a.x0), Math.abs(a.z1 - a.z0)];
    for (const kind of ['walk', 'road'] as const) {
      g.fillStyle = kind === 'road' ? 'rgba(251,250,246,0.10)' : 'rgba(251,250,246,0.16)';
      for (const a of m.areas) if (a.kind === kind) g.fillRect(...rect(a));
    }
    g.fillStyle = 'rgba(251,250,246,0.26)';
    g.strokeStyle = 'rgba(251,250,246,0.34)';
    g.lineWidth = dpr / k;
    for (const a of m.areas) {
      if (a.kind !== 'building') continue;
      g.fillRect(...rect(a));
      g.strokeRect(...rect(a));
    }
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (const x of m.crossings) {
      const [x0, z0, w, h] = rect(x);
      if (x.bars === 'z') for (let i = x0 + 0.4; i < x0 + w - 0.3; i += 1.2) g.fillRect(i, z0, 0.6, h);
      else for (let i = z0 + 0.4; i < z0 + h - 0.3; i += 1.2) g.fillRect(x0, i, w, 0.6);
    }
    if (m.route.length > 1) {
      g.strokeStyle = MAP_VOICE;
      g.lineWidth = (2.5 * dpr) / k;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      m.route.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const look = angleWrap(m.head - yaw);
    const reach = 46 * dpr;
    g.fillStyle = 'rgba(251,250,246,0.14)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, reach, -Math.PI / 2 - look - Math.PI / 6, -Math.PI / 2 - look + Math.PI / 6);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
    g.fill();
    if (m.dest) {
      const pad = 8 * dpr;
      const dx = clamp(c * k * m.dest.x - sn * k * m.dest.z + ox, pad, px - pad);
      const dy = clamp(sn * k * m.dest.x + c * k * m.dest.z + oy, pad, px - pad);
      g.fillStyle = MAP_TONES[m.dest.kind] ?? MAP_VOICE;
      g.beginPath();
      g.arc(dx, dy, 3 * dpr, 0, Math.PI * 2);
      g.fill();
      g.font = `400 ${10 * dpr}px 'Martian Mono', ui-monospace, monospace`;
      g.textBaseline = 'middle';
      const tw = g.measureText(m.dest.name).width;
      const gap = 7 * dpr;
      const edge = 6 * dpr;
      const fitsRight = dx + gap + tw <= px - edge;
      const fitsLeft = dx - gap - tw >= edge;
      const tx = clamp(fitsRight || !fitsLeft ? dx + gap : dx - gap - tw, edge, px - edge - tw);
      const overDot = tx < dx + 4 * dpr && tx + tw > dx - 4 * dpr;
      const ty = overDot ? (dy + 14 * dpr <= px - pad ? dy + 14 * dpr : dy - 14 * dpr) : dy;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(14,18,26,0.55)';
      g.fillText(m.dest.name, tx + dpr * 0.5, ty + dpr * 0.5);
      g.fillStyle = '#fbfaf6';
      g.fillText(m.dest.name, tx, ty);
    }
  }

  private menuDwell(t: number): void {
    const open = this.frame?.items.some((d) => d.id === 'menu') ?? false;
    const h = this.menuHover;
    if (!h.on || h.fired || open) return;
    h.since ??= t;
    if (t - h.since >= 0.5 - 1e-9) {
      h.fired = true;
      this.handlers.choice('menu', 'open');
    }
  }

  private menuRect(): Rect | null {
    if (this.menuBtn.style.display === 'none') return null;
    const key = `${this.ui}|${innerWidth >= 900}`;
    if (this.menuBox?.key !== key) {
      const r = this.menuBtn.getBoundingClientRect();
      const host = this.root.getBoundingClientRect();
      this.menuBox = { key, rect: { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height } };
    }
    return this.menuBox.rect;
  }

  private timeRect(): Rect | null {
    if (!this.timeEl.textContent || this.timeEl.style.display === 'none') return null;
    const key = `${this.timeEl.textContent}|${this.ui}`;
    if (this.timeBox?.key !== key) {
      const r = this.timeEl.getBoundingClientRect();
      const host = this.root.getBoundingClientRect();
      this.timeBox = { key, rect: { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height } };
    }
    return this.timeBox.rect;
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
    if (isBanner(it.d.component, it.d.content) || isTucked(it.d.component, it.d.content)) box.classList.add(s.bannerPane!);
    box.dataset.pane = it.d.id;
    box.dataset.zone = it.d.placement.zone;
    const seed = document.createElement('div');
    seed.className = s.seed!;
    const rule = document.createElement('div');
    rule.className = s.holdRule!;
    rule.appendChild(document.createElement('i'));
    box.append(view.el, rule);
    wrap.append(box, seed);
    (it.kind === 'world' ? this.worldLayer : this.viewLayer).appendChild(wrap);
    const width = view.el.offsetWidth;
    const height = view.el.offsetHeight;
    const b: Built = {
      view,
      box,
      wrap,
      seed,
      rule,
      width,
      height,
      w: new Track(width),
      h: new Track(height),
      level,
      rect: null,
      fade: { v: 1 },
      slide: { v: 0 },
      home: null,
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

  // The hold rule fills from the leader's side toward the next level and is the viewfinder's count, read off the same mark.
  // What a pinch does on a place whose expanded view is up: its action, for the lifted row.
  choiceFor(id: string): { id: string; action: string; row?: string } | null {
    const it = this.items.get(id);
    const b = it?.cur;
    if (!it || !b || b.level !== 'expanded' || b.fade.v < 0.5 || it.want === 'none') return null;
    const btn = b.view.el.querySelector<HTMLElement>(`button.${s.primary}`);
    const action = btn?.dataset.k?.startsWith('a:') ? btn.dataset.k.slice(2) : null;
    if (!action) return null;
    const row = b.view.el.querySelector<HTMLElement>('li[data-lift]')?.dataset.row;
    return row === undefined ? { id, action } : { id, action, row };
  }

  // The held place's pane is pinned to the world the frame the look lands: its center keeps its offset from its light exactly
  // where it stands, drawn or riding, and nothing moves it until the look has held and the wearer rests; then the pull draws it
  // toward the center of the viewfinder. It goes back to following its light once the look has been gone 1 s.
  private hold(it: Item, t: number, ctx: FrameCtx, chrome: Rect[], pr: Projected, depth: number, size: { w: number; h: number }): WorldPlace | null {
    const b = it.cur;
    const placed = it.placed;
    const g = this.gazeNow();
    const look = g.target === it.id;
    const vp = ctx.vp;
    const half = viewfinderHalf(vp);
    const gap = PIP_GAP.beside * Math.max(1, ctx.ui ?? 1);
    const lightAway = Math.hypot(Math.max(0, Math.abs(pr.x - vp.w / 2) - half), Math.max(0, Math.abs(pr.y - vp.h / 2) - half));
    // The look landing on a place whose placement had no room for it, or folded it at the edge, brings it back where its light is; the pull draws it in from there.
    const inView = pr.x >= 0 && pr.x <= vp.w && pr.y >= 0 && pr.y <= vp.h;
    if (!it.hold && look && pr.inFront && inView && !it.dying && placed && (placed.mode === 'pip' || placed.mode === 'edge') && !placed.behind && LEVEL_RANK[it.d.level] >= LEVEL_RANK.label && it.placedPr?.anchor === it.d.placement.anchor) {
      const sc = b?.scale ?? this.ui;
      const w0 = size.w * sc;
      const h0 = size.h * sc;
      if (lightAway <= gap + w0) {
        // Still drawn as it folds, it is pinned where it is; gone, it comes back just above its light.
        const shown = b?.rect && b.opacity > 0.05 && b.level !== 'none';
        const c = shown ? { x: b.rect!.x + b.rect!.w / 2 - pr.x, y: b.rect!.y + b.rect!.h / 2 - pr.y } : { x: 0, y: -h0 / 2 - gap };
        it.hold = { fx: 0.5, fy: 0.5, off: c, w: w0, h: h0, outSince: null, level: it.d.level, vx: 0, vy: 0, lastT: t };
        const r0 = { x: pr.x + c.x - w0 / 2, y: pr.y + c.y - h0 / 2, w: w0, h: h0 };
        return { mode: 'pane', rect: r0, leader: { x: pr.x + c.x, y: pr.y + c.y }, scale: sc, side: r0.x + r0.w / 2 < vp.w / 2 ? 'left' : 'right', fx: 0.5, fy: 0.5 };
      }
    }
    if (!pr.inFront || it.dying || !b || (!it.hold && (!b.rect || b.level === 'none')) || !placed || placed.mode !== 'pane' || (g.target && !look) || it.placedPr?.anchor !== it.d.placement.anchor) return this.endHold(it);
    const scale = placed.scale;
    const W = size.w * scale;
    const H = size.h * scale;
    const doorway = this.bridge.doorway?.(it.d.placement.anchor) ?? null;
    // The last placement was made against last frame's light; carried to this frame's, so a fast turn does not skew the offset.
    const lag = it.placedPr ? { x: pr.x - it.placedPr.x, y: pr.y - it.placedPr.y } : { x: 0, y: 0 };
    if (!it.hold) {
      // A pane frozen by a head scan stands where the scan began, not where its placement says: pin it once the scan is over.
      // ...and one still condensing or growing is not yet at its measured size, which its placement still has to catch up with.
      if (!look || it.frozen || b.level !== it.d.level) return null;
      // Pinned where it is drawn: its placement plus any move under way, so the landing frame never moves it.
      const at = { x: placed.rect.x + lag.x + (it.place?.jumpX.at(t) ?? 0), y: placed.rect.y + lag.y + (it.place?.jumpY.at(t) ?? 0) };
      const c = { x: at.x + placed.rect.w / 2 - pr.x, y: at.y + placed.rect.h / 2 - pr.y };
      it.hold = { fx: 0.5, fy: 0.5, off: c, w: W, h: H, outSince: null, level: it.d.level, vx: 0, vy: 0, lastT: t };
      it.place?.jumpX.set(0);
      it.place?.jumpY.set(0);
    }
    const hd = it.hold;
    if (look) hd.outSince = null;
    else hd.outSince ??= t;
    if (hd.outSince !== null && t - hd.outSince >= READ.leaveS - 1e-9) return this.endHold(it);
    if (Math.abs(W - hd.w) > 0.5 || Math.abs(H - hd.h) > 0.5) {
      hd.w = W;
      hd.h = H;
      // It grows about its own center, never moved for it: the pull, which keeps it off the chrome and inside the glass, carries it clear.
      hd.level = it.d.level;
    }
    // The pull acts only once the look has held, and only while the wearer rests on the place: not dragging, not turning fast, its light still near the viewfinder.
    // Moving, the pane keeps its offset from its light and stays in the world, so a turn leaves it behind; nothing follows the head.
    const dt = clamp(t - (hd.lastT ?? t), 0, 0.05);
    hd.lastT = t;
    // A drag with the center on the view, or within the reading margin of it, is the wearer working its rows; a drag elsewhere is a turn.
    if (it.d.level === 'expanded' && this.aiming()) {
      const r0 = { x: pr.x + hd.off.x - W / 2, y: pr.y + hd.off.y - H / 2, w: W, h: H };
      const g0 = Math.hypot(Math.max(r0.x - vp.w / 2, 0, vp.w / 2 - (r0.x + r0.w)), Math.max(r0.y - vp.h / 2, 0, vp.h / 2 - (r0.y + r0.h)));
      if (g0 <= READ.marginPx * this.ui) hd.reread = true;
    }
    const rest = look && g.dwellMs >= VIEWFINDER.holdMs && b.fade.v >= 0.9 && !hd.reread && !this.aiming() && Math.abs(this.yawRate) < FAST_TURN && lightAway <= gap + W;
    if (rest) hd.pulled = true;
    let vx = rest ? (hd.vx ?? 0) : 0;
    let vy = rest ? (hd.vy ?? 0) : 0;
    if (rest) {
      // At a door the center may stand in the opening, where people walk in and out: the pane is drawn as near the center as standing clear of it allows.
      let gx = vp.w / 2;
      if (doorway) {
        const mid = { x: doorway.x + doorway.w * 0.25, y: doorway.y, w: doorway.w * 0.5, h: doorway.h };
        const c = DOORWAY.clearPx * Math.max(1, ctx.ui ?? 1);
        if (rectsOverlap({ x: gx - W / 2, y: vp.h / 2 - H / 2, w: W, h: H }, mid)) {
          const left = mid.x - c - W / 2;
          const right = mid.x + mid.w + c + W / 2;
          const fitsAt = (x: number): boolean => x - W / 2 >= MARGIN && x + W / 2 <= vp.w - MARGIN;
          const options = [left, right].filter(fitsAt).sort((p, q) => Math.abs(p - gx) - Math.abs(q - gx));
          if (options.length) gx = options[0]!;
        }
      }
      // ...and as near as covering no face, no one moving and no other pane allows: rule 8 gives them the way, and a pull back onto them would keep the pane dimmed.
      let gy = vp.h / 2;
      const movers = [...keepOutsFor(ctx.keepOuts, depth).filter((k) => k.kind !== 'roadway' && !k.still && (k.kind !== 'vehicle' || k.moving)).map((k) => k.rect), ...(ctx.chrome ?? chrome), ...this.othersDrawn(it)].map((k) => ({ x: k.x - MOVE.asidePad, y: k.y - MOVE.asidePad, w: k.w + 2 * MOVE.asidePad, h: k.h + 2 * MOVE.asidePad }));
      const clearAt = (x: number, y: number): boolean => {
        const q = { x: x - W / 2, y: y - H / 2, w: W, h: H };
        return q.x >= MARGIN && q.y >= MARGIN && q.x + W <= vp.w - MARGIN && q.y + H <= vp.h - MARGIN && !movers.some((k) => rectsOverlap(q, k));
      };
      if (!clearAt(gx, gy)) {
        let found: { x: number; y: number } | null = null;
        for (let r = 8; r <= 480 && !found; r += 8) {
          for (let i = 0; i < 16 && !found; i++) {
            const x = gx + Math.cos((i * Math.PI) / 8) * r;
            const y = gy + Math.sin((i * Math.PI) / 8) * r;
            if (clearAt(x, y)) found = { x, y };
          }
        }
        if (found) {
          gx = found.x;
          gy = found.y;
        }
      }
      vx += (PULL_W * PULL_W * (gx - pr.x - hd.off.x) - 2 * PULL_W * vx) * dt;
      vy += (PULL_W * PULL_W * (gy - pr.y - hd.off.y) - 2 * PULL_W * vy) * dt;
    }
    hd.vx = vx;
    hd.vy = vy;
    const pullSpeed = Math.hypot(vx, vy);
    hd.off = { x: hd.off.x + vx * dt, y: hd.off.y + vy * dt };
    let rect = { x: pr.x + hd.off.x - W / 2, y: pr.y + hd.off.y - H / 2, w: W, h: H };
    const out = rect.x < MARGIN - 0.5 || rect.y < MARGIN - 0.5 || rect.x + rect.w > vp.w - MARGIN + 0.5 || rect.y + rect.h > vp.h - MARGIN + 0.5;
    // While the wearer turns away, a held pane leaving the view lets go and rides with the world like the rest.
    // An expanded view being read is the exception: the head travels its rows with drags, and it holds its place while part of it leaves the glass (walking rule 10).
    // While the look stays on the place, a drag that keeps the center on the view or the view as near as that drag has brought it is the wearer working its rows; one that
    // carries it farther away is a turn away. The few pixels allowed are a standing wearer's sway, and with them the frame a drag begins is not a turn away either.
    const m = READ.marginPx * this.ui;
    const gapNow = Math.hypot(Math.max(rect.x - vp.w / 2, 0, vp.w / 2 - (rect.x + rect.w)), Math.max(rect.y - vp.h / 2, 0, vp.h / 2 - (rect.y + rect.h)));
    if (!this.aiming()) hd.readGap = undefined;
    else hd.readGap = Math.min(hd.readGap ?? gapNow, gapNow);
    const reading = it.d.level === 'expanded' && this.aiming() && look && (gapNow <= m || gapNow <= (hd.readGap ?? gapNow) + READ.swayPx * this.ui);
    if (out && this.aiming() && !reading) {
      it.hold = null;
      it.ride = { x: rect.x - pr.x, y: rect.y - pr.y };
      return null;
    }
    // A view being read stays where the reader's drags put it. Standing still the center on it is reading.
    const read = it.d.level === 'expanded' && look && (reading || (gapNow <= m && this.band === 'stopped'));
    // Not resting, the chrome acts at once, by the least shift that clears it; resting, the pull carries the pane clear of it.
    if (!read && !rest && hd.pulled && chrome.some((k) => rectsOverlap(rect, k))) {
      const s2 = nudge(rect, vp, chrome);
      if (s2) {
        hd.off = { x: hd.off.x + s2.x, y: hd.off.y + s2.y };
        hd.vx = 0;
        hd.vy = 0;
        rect = { ...rect, x: rect.x + s2.x, y: rect.y + s2.y };
      }
    }
    // Leaving the glass with its place a pane's width from the square, it folds at once, as a pane whose anchor leaves the view does.
    if (!read && out && lightAway > gap + W) {
      this.endHold(it);
      it.holdEnded = false;
      it.foldedUntil = t + T.quick;
      return it.place ? it.place.foldNow(pr, vp) : null;
    }
    return this.pane(rect, pr, hd.off, scale, placed, vp, pullSpeed);
  }

  // Every other pane on the glass as last drawn, whatever order this frame places them in.
  private othersDrawn(it: Item): Rect[] {
    const out: Rect[] = [];
    for (const x of this.items.values()) if (x !== it && !x.dying && x.cur?.rect && x.cur.opacity > 0.05 && x.cur.level !== 'none') out.push(x.cur.rect);
    return out;
  }

  private pane(rect: Rect, pr: Projected, off: { x: number; y: number }, scale: number, placed: WorldPlace, vp: { w: number; h: number }, pullSpeed: number): WorldPlace {
    const p: WorldPlace = { mode: 'pane', rect, leader: { x: pr.x + off.x, y: pr.y + off.y }, scale, side: rect.x + rect.w / 2 < vp.w / 2 ? 'left' : 'right', fx: 0.5, fy: 0.5 };
    if (placed.align) p.align = placed.align;
    if (placed.vertical) p.vertical = placed.vertical;
    if (pullSpeed > 20) p.moved = 'held';
    return p;
  }

  private endHold(it: Item, fresh = false): null {
    if (it.hold) {
      it.hold = null;
      it.place?.jumpX.set(0);
      it.place?.jumpY.set(0);
      if (!fresh && it.placed?.mode === 'pane' && it.placedPr) it.place?.adopt(it.placed, it.placedPr);
      else it.place?.reset(true);
      it.holdEnded = !fresh;
    }
    return null;
  }

  // The row under the pointer, else the one tapped, else the one under the viewfinder's center while the place is looked at, else the row the action reads for.
  private liftRow(it: Item, b: Built, vp: { w: number; h: number }): void {
    const rows = b.view.el.querySelectorAll<HTMLElement>('li[data-row]');
    if (!rows.length) return;
    let pick: HTMLElement | null = null;
    for (const li of rows) if (li.matches(':hover')) pick = li;
    pick ??= [...rows].find((li) => li.dataset.tap !== undefined) ?? null;
    const r = b.rect;
    const cx = vp.w / 2;
    const cy = vp.h / 2;
    if (!pick && r && this.snap?.wearer.gaze.target === it.id && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
      for (const li of rows) {
        const q = li.getBoundingClientRect();
        if (cy >= q.top && cy <= q.bottom) pick = li;
      }
    }
    // Exactly one row is lifted at all times, so the action's "it" always has a referent the eye can find.
    pick ??= [...rows].find((li) => li.dataset.lead !== undefined) ?? rows[0]!;
    for (const li of rows) {
      if (li === pick) li.dataset.lift = '';
      else delete li.dataset.lift;
    }
    const btn = b.view.el.querySelector<HTMLElement>('button[data-follow]');
    const label = pick?.dataset.act ?? btn?.dataset.follow;
    if (btn && label && btn.textContent !== label) btn.textContent = label;
  }

  private holdRule(it: Item, b: Built, t: number, pr: { x: number; y: number } | null): void {
    const f = this.frame;
    const m = f?.dwell.target === it.id ? f.dwell.mark : undefined;
    const on = Boolean(m?.next) && !it.dying && b.level === it.d.level && (b.level === 'label' || b.level === 'card');
    const p = on && m && f ? clamp(m.p + m.rate * Math.max(0, t - f.t), 0, 1) : 0;
    const fromRight = Boolean(pr && b.rect && pr.x > b.rect.x + b.rect.w / 2);
    const key = `${on && p > 0 ? 1 : 0}|${fromRight ? 1 : 0}`;
    if (b.rule.dataset.key !== key) {
      b.rule.dataset.key = key;
      b.rule.classList.toggle(s.holdOn!, on && p > 0);
      b.rule.classList.toggle(s.holdRight!, fromRight);
    }
    b.rule.style.setProperty('--hold', p.toFixed(4));
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

  // A choice settles in place: the rows that stay stay, the others and the actions dissolve, and the confirmation resolves where the actions were.
  private settle(it: Item, b: Built, t: number, why: Item['why'] | undefined): boolean {
    const c = it.d.content;
    const old = b.view;
    const acts = old.el.querySelector<HTMLElement>(`.${s.actions}`);
    const titles = new Set((c.rows ?? []).map((r) => r.title));
    const lis = [...old.el.querySelectorAll<HTMLElement>('li')];
    const kept = lis.filter((li) => titles.has(li.querySelector('b')?.textContent ?? ''));
    const keep = kept[0];
    if (!keep || !acts || !c.note || c.actions?.length || this.reduced) return false;
    it.tl?.kill();
    const tl = this.tl();
    const leaving = [...lis.filter((li) => !kept.includes(li)), acts];
    tl.to(leaving, { opacity: 0, filter: 'blur(4px)', duration: MOVE.dissolveKids, ease: EASE.in, stagger: MOVE.dissolveStagger }, 0);
    const out = MOVE.dissolveKids + MOVE.dissolveStagger * Math.max(0, leaving.length - 1);
    const view = buildPane({ ...it.d, level: 'expanded' }, 'expanded', this.handlers);
    gsap.set(view.el, { opacity: 0 });
    b.box.appendChild(view.el);
    b.view = view;
    const note = view.el.querySelector<HTMLElement>('[data-k="note"]');
    tl.call(() => {
      const scale = b.scale ?? 1;
      const li = view.el.querySelector<HTMLElement>('li');
      const dy = li ? (keep.getBoundingClientRect().top - li.getBoundingClientRect().top) / scale : 0;
      old.el.remove();
      gsap.set(view.el, { opacity: 1 });
      if (note) gsap.set(note, { opacity: 0 });
      if (li && Math.abs(dy) > 0.5) gsap.fromTo(li, { y: dy }, { y: 0, duration: T.base, ease: EASE.out });
      if (note) gsap.fromTo(note, { opacity: 0, y: -3, filter: 'blur(5px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: T.base, ease: EASE.out, clearProps: 'filter' });
      b.width = view.el.offsetWidth;
      b.height = view.el.offsetHeight;
      b.w.go(this.t, b.width, T.base, 'out');
      b.h.go(this.t, b.height, T.base, 'out');
      this.watch(b);
    }, [], out);
    it.condensingUntil = t + out + T.base;
    it.changedAt = t;
    it.tl = tl;
    if (why) {
      it.why = why;
      it.restored = false;
      this.note(it, 'resize', 'choice', why.detail, undefined, 'expanded');
    }
    return true;
  }

  private morph(it: Item, b: Built, want: PaneLevel, t: number, from: PaneLevel, why: Item['why'] | undefined): void {
    if (from === 'expanded' && want === 'expanded' && b.level === 'expanded' && this.settle(it, b, t, why)) return;
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
      } else if (isBanner(it.d.component, it.d.content)) end = slideOut(dtl, 0, this.reduced, prev.fade, prev.slide, -((prev.rect?.y ?? 0) + (prev.rect?.h ?? prev.height) + 20));
      else end = dissolve(dtl, this.els(prev), it.lag, this.reduced, prev.fade);
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
      if (world && returned) {
        // Travel is a birth's: a pane coming back from a fold or a drop condenses in place, its leader with it.
        gsap.set(it.L, { lead: 1, leadO: 1, head: 0 });
        at = it.lag;
      } else if (world) {
        const dur = big ? MOVE.travelCard : MOVE.travelGlance;
        const tStart = (t - it.born < 0.05 && !looked ? 0.35 : 0) + it.lag;
        const arrive = travel(tl, it.L, tStart, dur, this.reduced);
        at = looked ? tStart : arrive;
      }
      const held = it.d.reason.text === HELD_LINE && it.d.content.showReason !== false;
      const whyAt = held ? Math.max(0, this.gateEndAt + MOVE.returnS - t) : undefined;
      const batched = it.d.component === 'strip' && !this.reduced && whyAt === undefined;
      const banner = isBanner(it.d.component, it.d.content);
      const end = banner ? slideIn(tl, this.els(b), at, this.reduced, b.fade, b.slide, -(b.height * this.ui + 80 * this.ui)) : batched ? batch(tl, this.els(b), at, b.fade) : condense(tl, this.els(b), at, {
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
    const time = this.timeRect();
    if (time) chrome.push({ x: time.x - 8, y: time.y - 8, w: time.w + 16, h: time.h + 16 });
    const menu = this.menuRect();
    if (menu) chrome.push({ x: menu.x - 8, y: menu.y - 8, w: menu.w + 16, h: menu.h + 16 });
    this.menuDwell(t);
    const ctx: FrameCtx = { t, band: this.band, vp, keepOuts, chrome, ui, scanning: yieldSide !== null };
    const gk = this.gateK.v;
    const pipMul = this.snooze ? 0.3 : 1;
    const zone = focusRect(this.band, vp.w, vp.h);
    gsap.set(this.focusEl, { left: zone.x, top: zone.y, width: zone.w, height: zone.h });

    const aimingNow = this.aiming();
    const slots = new Map<string, number>();
    const ordered = this.placeOrder();
    this.stagger(ordered);
    const taken: Rect[] = [];
    let below = 0;
    let tuck = 0;
    for (const it of ordered) {
      const r = it.kind === 'view' && !it.dying && it.d.placement.anchor === 'view:edge-top' ? it.cur?.rect : null;
      if (r && it.cur!.opacity > 0.05) below = Math.max(below, r.y + r.h + 10);
      const banner = it.kind === 'view' && !it.dying && it.d.placement.anchor === 'view:banner' && it.d.component !== 'strip' ? it.cur?.rect : null;
      if (banner && it.cur!.opacity > 0.05) tuck = Math.max(tuck, banner.y + banner.h + 6 * ui);
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
          // A drag over, the pane the look is on stays where it rode, pinned; the rest go back to their placement in one move.
          if (it.ride && (!aimingNow || !p.inFront || it.dying)) {
            const r = it.placed?.mode === 'pane' ? { ...it.placed.rect, x: p.x + it.ride.x, y: p.y + it.ride.y } : null;
            it.ride = null;
            if (r && p.inFront && this.gazeNow().target === it.id && !it.hold) {
              it.hold = { fx: 0.5, fy: 0.5, off: { x: r.x + r.w / 2 - p.x, y: r.y + r.h / 2 - p.y }, w: r.w, h: r.h, outSince: null, level: it.d.level, vx: 0, vy: 0, lastT: t };
            } else {
              it.place.reset(true);
              it.holdEnded = true;
            }
          }
          const held = this.hold(it, t, taken.length ? { ...ctx, chrome: [...chrome, ...taken] } : ctx, chrome, p, depth, size);
          // While the wearer drags the view, and a moment after, a pane already on the glass rides with the world where it stands, so the one aimed at is where the turn meets it.
          // A move under way stops when the ride begins, so the pane never moves against the world it rides with: one still condensing rides from where its move ends, one already on the glass from where it stands.
          if (!held && !it.ride && aimingNow && p.inFront && it.placed?.mode === 'pane' && it.cur?.rect && it.want !== 'none' && !it.dying) {
            const settling = t < it.condensingUntil;
            const jx = settling ? 0 : it.place.jumpX.at(t);
            const jy = settling ? 0 : it.place.jumpY.at(t);
            // Against the light its placement was made with: this frame's has already turned with the drag.
            const at = it.placedPr ?? p;
            it.ride = { x: it.placed.rect.x + jx - at.x, y: it.placed.rect.y + jy - at.y };
            it.place.jumpX.set(0);
            it.place.jumpY.set(0);
          }
          // A pane the hold folded stays folded for its fade, so it comes back by condensing rather than jumping.
          if (!held && t < it.foldedUntil && it.place) placed = it.place.foldNow(p, vp);
          else if (held) placed = held;
          else if (it.ride) {
            const { moved: _m, ...last } = it.placed!;
            const r = { ...last.rect, x: p.x + it.ride.x, y: p.y + it.ride.y };
            // Riding off the glass it folds at the edge, as a pane whose light leaves the view does: held to the glass it would slide along the edge against the world.
            if (r.x < 0 || r.y < 0 || r.x + r.w > vp.w || r.y + r.h > vp.h) {
              it.ride = null;
              it.foldedUntil = t + T.quick;
              placed = it.place.foldNow(p, vp);
            } else placed = { ...last, rect: r };
          }
          else if (it.frozen && it.yieldS.on && it.placed?.mode === 'pane') placed = it.placed;
          else placed = it.place.update({ level: lv, anchor: p, distance: dist, size, focusOk: Boolean(d.placement.focusOk) || leftRecently(t, it.lookedAt), zoneOk: Boolean(d.placement.zoneOk), left: !d.placement.focusOk && leftRecently(t, it.lookedAt), sizeOf, doorway: this.bridge.doorway?.(d.placement.anchor) ?? null }, taken.length ? { ...ctx, chrome: [...chrome, ...taken] } : ctx);
          // Back to following its light, the pane moves there from where the hold left it, in one 320 ms move.
          if (!held && !it.ride && it.holdEnded) {
            it.holdEnded = false;
            const r = it.cur?.rect;
            // In a fast turn the eye is not on it: it takes its place at once rather than trailing its light.
            if (r && placed.mode === 'pane' && Math.abs(this.yawRate) < FAST_TURN) {
              const f = factors(placed);
              it.place.ease(t, { x: r.x + r.w * f.fx, y: r.y + r.h * f.fy }, { x: placed.rect.x + placed.rect.w * f.fx, y: placed.rect.y + placed.rect.h * f.fy }, MOVE.drift, Infinity, 'gate');
            }
          }
          if (placed.mode === 'pane' && LEVEL_RANK[d.level] >= LEVEL_RANK.label && !it.dying) {
            const r = placed.rect;
            taken.push({ x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 });
          }
          it.placed = placed;
          it.placedPr = { x: p.x, y: p.y, anchor: d.placement.anchor };
        }
      }
      let aside: AsideState | null = null;
      let corner: { x: number; y: number } | null = null;
      let fx = 0.5;
      let fy = 1;
      if (placed && placed.mode === 'pane' && it.place) {
        ({ fx, fy } = factors(placed));
        corner = { x: placed.rect.x + placed.rect.w * fx + it.place.jumpX.at(t), y: placed.rect.y + placed.rect.h * fy + it.place.jumpY.at(t) };
      }
      if (placed && placed.mode === 'pane' && corner && LEVEL_RANK[d.level] >= LEVEL_RANK.label && !it.dying) {
        const sc = placed.scale;
        const c = placed.collapsed;
        const lv = c && c !== 'pip' && LEVEL_RANK[d.level] > LEVEL_RANK[c] ? c : d.level;
        const size = it.cur && it.cur.level === lv ? { w: it.cur.width, h: it.cur.height } : (NOMINAL_SIZE[lv as 'label'] ?? NOMINAL_SIZE.label);
        const home = { x: corner.x - size.w * sc * fx, y: corner.y - size.h * sc * fy, w: size.w * sc, h: size.h * sc };
        const inset = MARGIN - MOVE.deadBand - 2;
        // A pane riding toward the chrome keeps moving while it fades, so the test looks ahead along its motion by the fold's length.
        const dt = it.homeAt ? t - it.homeAt.t : 0;
        const ahead = dt > 1e-4 && dt < 0.2 && t - it.born > FOLD_SETTLE_S ? { ...home, x: home.x + ((home.x - it.homeAt!.x) / dt) * FOLD_LEAD_S, y: home.y + ((home.y - it.homeAt!.y) / dt) * FOLD_LEAD_S } : home;
        it.homeAt = { x: home.x, y: home.y, t };
        // The view's edge must have held 300 ms before it folds a pane that fits (the drawn rect is clamped meanwhile); the chrome folds at once.
        const atEdge = !it.hold && (home.x < inset || home.y < inset || home.x + home.w > vp.w - inset || home.y + home.h > vp.h - inset);
        if (atEdge && d.placement.focusOk) it.edgeSince ??= t;
        else it.edgeSince = null;
        // A held pane answers to the chrome in the hold itself; folded here, the look's rescue placed it again a frame later and it blinked.
        const outside = !it.hold && ((atEdge && (it.edgeSince === null || t - it.edgeSince >= MOVE.leaveMs / 1000 - 1e-9)) || chrome.some((r) => rectsOverlap(home, r) || (!d.placement.focusOk && rectsOverlap(ahead, r))));
        if (outside && !it.frozen && pr && it.place) {
          placed = it.place.foldNow(pr, vp);
          it.placed = placed;
          corner = null;
        } else aside = it.aside.update(home, ctx, Boolean(d.placement.focusOk || d.placement.zoneOk) || leftRecently(t, it.lookedAt), depth, pr ?? undefined, Boolean(it.hold));
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
            // The pane the look is held on is not what a head scan checks past: it does not yield.
            const y = it.yieldS.update(t, it.hold ? null : fz ? (yieldSide !== null ? paneSide : null) : placed.stilled ? paneSide : yieldSide, paneSide);
            yieldO = y.opacity;
            // A riding pane is already pinned to the world; a head scan fades it but does not freeze it, so it has no return to make.
            if (it.yieldS.on && !it.hold && !it.ride) it.frozen ??= { x: at.x + a.dx, y: at.y + a.dy };
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
          // A strip is the tucked one whatever the draw order; counting banners by order put a banner under itself.
          const i = slot === 'view:banner' ? (d.component === 'strip' ? 1 : 0) : b === it.cur ? (slots.get(slot) ?? 0) : 0;
          if (b === it.cur) slots.set(slot, i + 1);
          scale = ui;
          const home = b.home && b !== it.cur ? b.home : placeView(slot, { w: b.w.at(t) * ui, h: b.h.at(t) * ui }, vp, i, slot === 'view:edge-right' ? below : slot === 'view:banner' ? tuck : 0, ui);
          b.home = home;
          rect = { ...home, y: home.y + b.slide.v };
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
        if (b === it.cur && it.kind === 'world') this.holdRule(it, b, t, pr);
        if (b === it.cur && b.level === 'expanded') this.liftRow(it, b, vp);
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
    const mapItem = this.items.get('map');
    const mapCanvas = mapItem?.cur?.view.el.querySelector('canvas');
    if (mapCanvas && !mapItem?.dying) this.drawMap(mapCanvas, t);
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
      const { fx, fy } = factors(placed);
      it.off = { x: placed.rect.x + placed.rect.w * fx - pr.x, y: placed.rect.y + placed.rect.h * fy - pr.y };
    } else if (b && placed?.mode === 'pane' && pr && !born) {
      const { fx, fy } = factors(placed);
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

  // What the live gaze can aim at besides lights and storefronts: every pane on the glass, by its anchor.
  // `placed` marks a pane the hold put beside the square: it is inside the keep square wherever it stands.
  aimables(): { anchor: string; rect: Rect; opacity: number }[] {
    const out: { anchor: string; rect: Rect; opacity: number }[] = [];
    for (const it of this.items.values()) {
      const b = it.cur;
      if (it.kind !== 'world' || it.dying || !b?.rect || b.level === 'none' || b.opacity <= 0.05 || it.placed?.mode !== 'pane' || it.aside.dropped) continue;
      out.push({ anchor: it.d.placement.anchor, rect: b.rect, opacity: b.opacity });
    }
    return out;
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
