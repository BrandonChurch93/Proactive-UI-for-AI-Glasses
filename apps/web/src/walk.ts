import { gsap } from 'gsap';
import { Brain } from '@lumen/brain';
import {
  LOOK_AWAY_S,
  PLACES,
  PLACE_BY_ID,
  WALK_SECONDS,
  angleWrap,
  clamp,
  pitchToward,
  viewfinderHalf,
  yawToward,
  compactSnapshot,
  type BrainFrame,
  type OverlayEvent,
  type Override,
  type PaneReport,
  type Rect,
  type RunExport,
  type ScenarioId,
  type WorldSnapshot,
} from '@lumen/shared';
import { Sim, SIM_HZ, TICK_HZ } from '@lumen/sim';
import { Overlay } from '@lumen/overlay';
import { ThreeBridge } from './bridge';
import type { World } from './world/world';

const ACQUIRE_GRACE_S = 0.25;
const FRONT_MIN_PX = 36;
const FRONT_MAX_FACING = (75 * Math.PI) / 180;
// A light this close to the center outranks a storefront that merely contains it: aiming at a light is precise.
const FRONT_BIAS_PX = 30;
// A pursuit stops turning the head once the place it holds is this far behind the shoulder.
const PURSUIT_MAX = (2 * Math.PI) / 3;
export const TURN_PER_VIEW = (2 * Math.PI) / 3;
// A place the wearer's own turn carries out of the square is let go at once; the grace is for the body's steps.
const TURNING_S = 0.1;

function distanceToQuad(x: number, y: number, q: { x: number; y: number }[]): number {
  let inside = q.length > 2;
  let sign = 0;
  let best = Infinity;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) inside = false;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l));
    best = Math.min(best, Math.hypot(x - (a.x + dx * u), y - (a.y + dy * u)));
  }
  return inside ? 0 : best;
}

function overlapsSquare(q: { x: number; y: number }[], cx: number, cy: number, h: number): boolean {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  if (Math.max(...xs) < cx - h || Math.min(...xs) > cx + h || Math.max(...ys) < cy - h || Math.min(...ys) > cy + h) return false;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const nx = a.y - b.y;
    const ny = b.x - a.x;
    if (nx === 0 && ny === 0) continue;
    const proj = q.map((p) => p.x * nx + p.y * ny);
    const c = cx * nx + cy * ny;
    const r = h * (Math.abs(nx) + Math.abs(ny));
    if (Math.max(...proj) < c - r || Math.min(...proj) > c + r) return false;
  }
  return true;
}

const STEP = 1 / SIM_HZ;
const STEPS_PER_TICK = SIM_HZ / TICK_HZ;
const WARM_STEPS = Math.round(2.5 * SIM_HZ);
const SEED = 47;
const ATTENTION_M = 70;

const clock = gsap.timeline({ autoRemoveChildren: true });
gsap.globalTimeline.remove(clock);
clock.set({}, {}, 1e9);
let clockBase = 0;
let clockLast = 0;

interface Events {
  pinch?: string;
  choice?: { id: string; action: string };
  dismiss?: string | null;
}

interface StepInput {
  yaw: number;
  pitch: number;
  gaze: string | null;
}

export interface WalkOptions {
  scripted: boolean;
  suggest?: ScenarioId | null;
  exact?: boolean;
  reducedMotion?: boolean;
  focusOutline?: boolean;
  attract?: boolean;
  chrome?: () => Rect[];
}

export class Walk {
  sim!: Sim;
  brain!: Brain;
  overlay: Overlay | null = null;
  readonly bridge: ThreeBridge;
  frames: BrainFrame[] = [];
  snapshots: WorldSnapshot[] = [];
  overlayLog: OverlayEvent[] = [];
  hoverId: string | null = null;
  head = { yaw: 0.22, pitch: 0.04 };
  paused = false;
  ended = false;
  private inputs: StepInput[] = [];
  private events = new Map<number, Events>();
  private overrideLog = new Map<number, Override[]>();
  private pending: Events = {};
  private pendingOverrides: Override[] = [];
  private stepIndex = 0;
  private tickIndex = 0;
  private view: { w: number; h: number; panes: PaneReport[] } | undefined;
  private listeners = new Set<() => void>();
  private focusOutline: boolean;
  private pursuit: { id: string; on: boolean; dyaw: number; dpitch: number } | null = null;
  private turned = false;
  private turnedAt = -Infinity;
  holding = false;
  private pick: { step: number; cur: string | null; cand: string | null; candSince: number; outSince: number | null } = { step: -2, cur: null, cand: null, candSince: 0, outSince: null };
  private sound: { ctx: AudioContext | null; ui: AudioNode | null; enabled: boolean } = { ctx: null, ui: null, enabled: false };

  constructor(
    readonly world: World,
    readonly scenario: ScenarioId,
    private readonly layer: HTMLElement,
    private readonly opts: WalkOptions,
  ) {
    this.focusOutline = Boolean(opts.focusOutline);
    this.bridge = new ThreeBridge(world.core.camera, new Sim(scenario, { seed: SEED }));
    if (opts.chrome) this.bridge.chromeRects = opts.chrome;
    world.core.scene.add(this.bridge.group);
    this.reset();
    this.overlay = this.makeOverlay();
  }

  get scripted(): boolean {
    return this.opts.scripted;
  }

  get t(): number {
    return this.sim.t;
  }

  get duration(): number {
    return this.opts.scripted ? WALK_SECONDS[this.scenario] : Math.max(this.known, this.sim.t);
  }

  end(): void {
    this.ended = true;
    for (const fn of this.listeners) fn();
  }

  get known(): number {
    return Math.max(this.sim.t, (this.snapshots.length - 1) / TICK_HZ);
  }

  last(): { frame: BrainFrame; snap: WorldSnapshot } | null {
    const k = this.tickIndex - 1;
    const frame = this.frames[k];
    const snap = this.snapshots[k];
    return frame && snap ? { frame, snap } : null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setFocusOutline(on: boolean): void {
    this.focusOutline = on;
    this.overlay?.setFocusOutline(on);
  }

  private makeOverlay(resumed = false): Overlay {
    clockBase = clockLast + 1 - this.sim.t;
    const o = new Overlay(this.bridge, this.layer, {
      clock,
      resumed,
      time: !this.opts.attract,
      log: (e) => this.overlayLog.push(e),
      ...(this.opts.reducedMotion !== undefined ? { reducedMotion: this.opts.reducedMotion } : {}),
      handlers: {
        pinch: (id) => this.pinch(id),
        choice: (id, action) => {
          this.queue({ choice: { id, action } });
          if (id === 'intent' && action === 'end') this.end();
        },
      },
    });
    o.setFocusOutline(this.focusOutline);
    if (this.sound.ctx) o.sound.attach(this.sound.ctx, this.sound.ui ?? undefined);
    o.sound.enabled = this.sound.enabled;
    return o;
  }

  setSound(ctx: AudioContext | null, enabled: boolean, ui: AudioNode | null = null): void {
    if (ctx && ctx !== this.sound.ctx && this.overlay) this.overlay.sound.attach(ctx, ui ?? undefined);
    this.sound = { ctx: ctx ?? this.sound.ctx, ui: ui ?? this.sound.ui, enabled };
    if (this.overlay) this.overlay.sound.enabled = enabled;
  }

  private reset(): void {
    this.sim = new Sim(this.scenario, { seed: SEED, viewport: { w: innerWidth, h: innerHeight }, ...(this.opts.suggest !== undefined ? { suggest: this.opts.suggest } : {}) });
    this.sim.scripted = this.opts.scripted;
    this.brain = new Brain();
    this.bridge.setSim(this.sim);
    this.world.setSim(this.sim);
    this.stepIndex = 0;
    this.tickIndex = 0;
    this.view = undefined;
    this.ended = false;
  }

  setGlassesVisible(on: boolean): void {
    this.layer.style.visibility = on ? '' : 'hidden';
    this.bridge.group.visible = on;
  }

  dispose(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.world.core.scene.remove(this.bridge.group);
    this.bridge.dispose();
    this.listeners.clear();
  }

  private diverge(): void {
    this.inputs.length = Math.min(this.inputs.length, this.stepIndex);
    for (const k of [...this.events.keys()]) if (k >= this.tickIndex) this.events.delete(k);
    for (const k of [...this.overrideLog.keys()]) if (k >= this.tickIndex) this.overrideLog.delete(k);
    this.frames.length = Math.min(this.frames.length, this.tickIndex);
    this.snapshots.length = Math.min(this.snapshots.length, this.tickIndex);
  }

  private queue(ev: Events): void {
    if (this.opts.scripted) return;
    this.diverge();
    this.pending = { ...this.pending, ...ev };
  }

  pinch(id?: string): void {
    const target = id ?? this.sim.gaze.target ?? undefined;
    if (target) this.queue({ pinch: target });
  }

  dismiss(): void {
    const panel = this.last()?.frame.items.find((d) => d.id === 'menu');
    this.queue({ dismiss: panel?.id ?? this.sim.gaze.target ?? null });
  }

  look(yaw: number, pitch: number): void {
    if (this.opts.scripted) return;
    if (this.stepIndex < this.inputs.length && (Math.abs(yaw - this.head.yaw) > 1e-4 || Math.abs(pitch - this.head.pitch) > 1e-4)) this.diverge();
    this.head = { yaw: angleWrap(yaw), pitch: clamp(pitch, -0.6, 0.75) };
    this.turned = true;
    this.turnedAt = this.sim.t;
  }

  turn(dyaw: number, dpitch: number): void {
    this.look(this.head.yaw + dyaw, this.head.pitch + dpitch);
  }

  override(o: Override): void {
    this.diverge();
    this.pendingOverrides.push(o);
  }

  overrides(): { t: number; override: Override }[] {
    return this.brain.log.overrides.map((e) => ({ t: e.t, override: e.override }));
  }

  private liveGaze(): string | null {
    if (this.hoverId) return this.hoverId;
    const t = this.sim.t;
    const pk = this.pick;
    if (pk.step !== this.stepIndex - 1) {
      pk.cur = this.sim.gaze.target;
      pk.cand = null;
      pk.outSince = null;
    }
    pk.step = this.stepIndex;
    const { best, curIn } = this.rawGaze(pk.cur);
    // Held still, the place in the square keeps it until it leaves; only a turn lets a nearer one take over.
    const aiming = t - this.turnedAt <= LOOK_AWAY_S + 1e-9;
    if (pk.cur === null || (curIn && (!aiming || best === null || best === pk.cur))) {
      pk.cur ??= best;
      pk.cand = null;
      pk.outSince = null;
      return pk.cur;
    }
    if (curIn) pk.outSince = null;
    else if (t - this.turnedAt <= TURNING_S + 1e-9) {
      pk.cur = best;
      pk.cand = null;
      pk.outSince = null;
      return pk.cur;
    } else pk.outSince ??= t;
    if (best !== pk.cand) {
      pk.cand = best;
      pk.candSince = t;
    }
    if (pk.cand && t - pk.candSince >= ACQUIRE_GRACE_S - 1e-9) {
      pk.cur = pk.cand;
      pk.cand = null;
      pk.outSince = null;
    } else if (pk.outSince !== null && t - pk.outSince >= LOOK_AWAY_S - 1e-9) {
      pk.cur = null;
      pk.outSince = null;
    }
    return pk.cur;
  }

  private rawGaze(cur: string | null): { best: string | null; curIn: boolean } {
    const eye = this.sim.wearer.pos;
    const lit = new Set<string>();
    for (const d of this.last()?.frame.items ?? []) if (d.placement.zone === 'world') lit.add(d.placement.anchor);
    const ids = new Set<string>([...PLACES.map((p) => p.id), ...lit]);
    const vp = { w: innerWidth, h: innerHeight };
    const cx = vp.w / 2;
    const cy = vp.h / 2;
    const half = viewfinderHalf(vp);
    const keepHalf = viewfinderHalf(vp, true);
    const frontBias = FRONT_BIAS_PX * (half / viewfinderHalf({ w: 1280, h: 800 }));
    let best: string | null = null;
    let bestOff = Infinity;
    let curIn = false;
    for (const id of ids) {
      const a = this.sim.anchorOf(id);
      const far = a ? Math.hypot(a.x - eye.x, a.z - eye.z) : Infinity;
      if (!a || far > ATTENTION_M) continue;
      const place = PLACE_BY_ID.get(id);
      let front: { x: number; y: number }[] | null = null;
      if (place?.n) {
        const quad = [
          { x: a.x, y: 0.3, z: -place.n[0] },
          { x: a.x, y: 0.3, z: -place.n[1] },
          { x: a.x, y: a.y + 0.8, z: -place.n[1] },
          { x: a.x, y: a.y + 0.8, z: -place.n[0] },
        ].map((c) => this.bridge.project(c));
        const mid = { x: a.x - eye.x, z: -(place.n[0] + place.n[1]) / 2 - eye.z };
        const facing = Math.acos(Math.min(1, Math.abs(mid.x) / (Math.hypot(mid.x, mid.z) || 1)));
        if (quad.every((q) => q.inFront) && Math.abs(quad[1]!.x - quad[0]!.x) >= FRONT_MIN_PX && facing < FRONT_MAX_FACING) front = quad;
      } else {
        const seg = [{ x: a.x, y: 0.9, z: a.z }, { x: a.x, y: a.y + 0.8, z: a.z }].map((c) => this.bridge.project(c));
        if (seg.every((q) => q.inFront)) front = seg;
      }
      const pr = this.bridge.project(a);
      const pin = pr.inFront ? [pr] : null;
      const within = (h: number): boolean => Boolean((front && overlapsSquare(front, cx, cy, h)) || (pin && overlapsSquare(pin, cx, cy, h)));
      if (id === cur && within(keepHalf)) curIn = true;
      if (!within(half)) continue;
      const off = Math.min(front ? distanceToQuad(cx, cy, front) + frontBias : Infinity, pin ? Math.hypot(pr.x - cx, pr.y - cy) : Infinity) + far / 10000;
      if (off < bestOff) {
        best = id;
        bestOff = off;
      }
    }
    return { best, curIn };
  }

  private pursue(gaze: string | null): void {
    const sim = this.sim;
    const a = gaze && !gaze.includes(':') ? sim.anchorOf(gaze) : undefined;
    if (!gaze || !a) {
      this.pursuit = null;
      return;
    }
    const eye = sim.wearer.pos;
    const body = sim.wearer.bodyYaw;
    const toYaw = yawToward(eye, a);
    const toPitch = pitchToward(eye, a);
    // While the pointer is down the drag owns the head; the hold resumes when it comes up.
    if (!this.pursuit || this.pursuit.id !== gaze || this.turned || this.holding) {
      // Only a place the wearer turned onto is held; one the walk carries into the square does not pull the head after it.
      const on = this.turned || this.holding || this.sim.t - this.turnedAt <= LOOK_AWAY_S + 1e-9;
      this.turned = false;
      this.pursuit = { id: gaze, on, dyaw: angleWrap(body + this.head.yaw - toYaw), dpitch: this.head.pitch - toPitch };
      return;
    }
    if (!this.pursuit.on) return;
    const yaw = angleWrap(toYaw + this.pursuit.dyaw - body);
    if (Math.abs(yaw) > PURSUIT_MAX) return;
    this.head = { yaw, pitch: clamp(toPitch + this.pursuit.dpitch, -0.6, 0.75) };
  }

  step(): void {
    this.core(false);
  }

  private core(fast: boolean): void {
    const sim = this.sim;
    if (!sim.scripted) {
      let inp = this.inputs[this.stepIndex];
      if (!inp) {
        this.pursue(this.pick.cand ?? sim.gaze.target);
        inp = { yaw: sim.wearer.bodyYaw + this.head.yaw, pitch: this.head.pitch, gaze: this.liveGaze() };
        this.inputs[this.stepIndex] = inp;
      }
      sim.live.headYaw = inp.yaw;
      sim.live.headPitch = inp.pitch;
      sim.live.gazeId = inp.gaze;
    }
    sim.step(STEP);
    this.stepIndex++;
    if (!fast) this.world.update(STEP);
    if (this.stepIndex % STEPS_PER_TICK === 0) this.tick(fast);
    if (!fast && this.overlay) {
      clockLast = clockBase + sim.t;
      clock.time(clockLast);
      this.overlay.update(sim.t);
    }
  }

  private tick(fast: boolean): void {
    const k = this.tickIndex;
    const sim = this.sim;
    if (!sim.scripted) {
      let ev = this.events.get(k);
      if (!ev && Object.keys(this.pending).length > 0) {
        ev = this.pending;
        this.events.set(k, ev);
        this.pending = {};
      }
      if (ev) sim.setLiveEvents(ev);
    }
    let ovs = this.overrideLog.get(k);
    if (!ovs && this.pendingOverrides.length > 0) {
      ovs = this.pendingOverrides;
      this.overrideLog.set(k, ovs);
      this.pendingOverrides = [];
    }
    for (const o of ovs ?? []) this.brain.applyOverride(o, sim.t);
    const snap = sim.snapshot(fast ? undefined : (this.overlay?.report() ?? this.view));
    const frame = this.brain.tick(snap);
    sim.plan(frame.goal);
    snap.wearerModel = frame.model;
    this.frames[k] = frame;
    if (!fast || !this.snapshots[k]) this.snapshots[k] = snap;
    this.tickIndex++;
    if (!fast && this.overlay) {
      this.overlay.apply(frame, snap);
      this.view = this.overlay.report();
    }
    if (!this.ended && this.opts.scripted && sim.t >= this.duration - 1e-6) this.ended = true;
    if (!fast) for (const fn of this.listeners) fn();
  }

  seek(t: number): void {
    const target = Math.max(0, this.opts.scripted ? Math.min(Math.round(t * SIM_HZ), Math.round(this.duration * SIM_HZ)) : Math.round(t * SIM_HZ));
    if (target === this.stepIndex) return;
    const back = target < this.stepIndex;
    if (back || (!this.opts.exact && target - this.stepIndex > WARM_STEPS)) {
      if (back) this.reset();
      this.overlay?.dispose();
      this.overlay = null;
      const warmFrom = this.opts.exact ? this.stepIndex : Math.max(this.stepIndex, target - WARM_STEPS);
      while (this.stepIndex < warmFrom) this.core(true);
      const from = this.sim.t;
      this.overlayLog = this.overlayLog.filter((e) => e.t < from);
      this.overlay = this.makeOverlay(true);
    }
    while (this.stepIndex < target) this.core(false);
    for (const fn of this.listeners) fn();
  }

  exportRun(): RunExport {
    const n = this.tickIndex;
    return {
      version: 1,
      kind: 'lumen-run',
      scenario: this.scenario,
      seed: SEED,
      hz: TICK_HZ,
      source: this.opts.scripted ? 'scripted' : 'live',
      snapshots: this.snapshots.slice(0, n).map(compactSnapshot),
      overrides: this.brain.log.overrides.map((e) => ({ t: e.t, override: e.override })),
      entries: this.brain.log.entries.map((e) => [e.t, e.decision]),
      overlay: this.overlayLog.filter((e) => e.t <= this.sim.t + 1e-6),
    };
  }
}
