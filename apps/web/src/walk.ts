import { gsap } from 'gsap';
import { Brain } from '@lumen/brain';
import {
  PLACES,
  PLACE_BY_ID,
  WALK_SECONDS,
  angleWrap,
  pitchToward,
  yawToward,
  compactSnapshot,
  type BrainFrame,
  type OverlayEvent,
  type Override,
  type PaneReport,
  type RunExport,
  type ScenarioId,
  type WorldSnapshot,
} from '@lumen/shared';
import { Sim, SIM_HZ, TICK_HZ } from '@lumen/sim';
import { Overlay } from '@lumen/overlay';
import { ThreeBridge } from './bridge';
import type { World } from './world/world';

const YAW_ACQUIRE = (3 * Math.PI) / 180;
const YAW_RELEASE = (6 * Math.PI) / 180;
const HEAD_LIMIT = Math.PI / 2;
const PURSUIT_RATE = 6;
const PURSUIT_SETTLED_RAD = 0.03;
const PURSUIT_DWELL_MS = 300;
const PIP_ACQUIRE_PX = 70;
const FRONT_RELEASE_PX = 40;
const PIP_RELEASE_PX = 120;
const PURSUIT_AFTER_DRAG_S = 0.25;
const ACQUIRE_GRACE_S = 0.25;
const RELEASE_GRACE_S = 0.4;
const FRONT_MIN_PX = 36;
const FRONT_MAX_FACING = (75 * Math.PI) / 180;

function distanceToQuad(x: number, y: number, q: { x: number; y: number }[]): number {
  let inside = true;
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

function angleToSpan(a: number, y0: number, y1: number): number {
  const d0 = angleWrap(a - y0);
  const d1 = angleWrap(a - y1);
  if (Math.sign(d0) !== Math.sign(d1) && Math.abs(d0) + Math.abs(d1) < Math.PI) return 0;
  return Math.min(Math.abs(d0), Math.abs(d1));
}
const STEP = 1 / SIM_HZ;
const STEPS_PER_TICK = SIM_HZ / TICK_HZ;
const WARM_STEPS = Math.round(2.5 * SIM_HZ);
const SEED = 47;
const ATTENTION_M = 35;

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
  exact?: boolean;
  reducedMotion?: boolean;
  focusOutline?: boolean;
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
  private arrivedAt: number | null = null;
  private listeners = new Set<() => void>();
  private focusOutline: boolean;
  private pursuit: { id: string; dyaw: number; dpitch: number } | null = null;
  private lookedAt = -Infinity;
  private following = false;
  private pick: { step: number; cur: string | null; cand: string | null; candSince: number; outSince: number | null } = { step: -2, cur: null, cand: null, candSince: 0, outSince: null };
  holding = false;
  private sound: { ctx: AudioContext | null; enabled: boolean } = { ctx: null, enabled: false };

  constructor(
    readonly world: World,
    readonly scenario: ScenarioId,
    private readonly layer: HTMLElement,
    private readonly opts: WalkOptions,
  ) {
    this.focusOutline = Boolean(opts.focusOutline);
    this.bridge = new ThreeBridge(world.core.camera, new Sim(scenario, { seed: SEED }));
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
    return WALK_SECONDS[this.scenario];
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
      log: (e) => this.overlayLog.push(e),
      ...(this.opts.reducedMotion !== undefined ? { reducedMotion: this.opts.reducedMotion } : {}),
      handlers: {
        pinch: (id) => this.pinch(id),
        choice: (id, action) => this.queue({ choice: { id, action } }),
      },
    });
    o.setFocusOutline(this.focusOutline);
    if (this.sound.ctx) o.sound.attach(this.sound.ctx);
    o.sound.enabled = this.sound.enabled;
    return o;
  }

  setSound(ctx: AudioContext | null, enabled: boolean): void {
    if (ctx && ctx !== this.sound.ctx && this.overlay) this.overlay.sound.attach(ctx);
    this.sound = { ctx: ctx ?? this.sound.ctx, enabled };
    if (this.overlay) this.overlay.sound.enabled = enabled;
  }

  private reset(): void {
    this.sim = new Sim(this.scenario, { seed: SEED, viewport: { w: innerWidth, h: innerHeight } });
    this.sim.scripted = this.opts.scripted;
    this.brain = new Brain({ scenario: this.scenario });
    this.bridge.setSim(this.sim);
    this.world.setSim(this.sim);
    this.stepIndex = 0;
    this.tickIndex = 0;
    this.view = undefined;
    this.arrivedAt = null;
    this.ended = false;
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
    this.queue({ dismiss: this.sim.gaze.target ?? null });
  }

  look(yaw: number, pitch: number): void {
    if (this.opts.scripted) return;
    if (this.stepIndex < this.inputs.length && (Math.abs(yaw - this.head.yaw) > 1e-4 || Math.abs(pitch - this.head.pitch) > 1e-4)) this.diverge();
    this.head = { yaw, pitch };
    this.lookedAt = this.sim.t;
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
    if (pk.cur === null || best === pk.cur) {
      pk.cur = best;
      pk.cand = null;
      pk.outSince = null;
      return pk.cur;
    }
    if (best && best !== pk.cand) {
      pk.cand = best;
      pk.candSince = t;
    } else if (!best) pk.cand = null;
    if (curIn) pk.outSince = null;
    else pk.outSince ??= t;
    if (pk.cand && t - pk.candSince >= ACQUIRE_GRACE_S - 1e-9) {
      pk.cur = pk.cand;
      pk.cand = null;
      pk.outSince = null;
    } else if (pk.outSince !== null && t - pk.outSince >= RELEASE_GRACE_S - 1e-9) {
      pk.cur = null;
      pk.outSince = null;
    }
    return pk.cur;
  }

  private rawGaze(cur: string | null): { best: string | null; curIn: boolean } {
    const eye = this.sim.wearer.pos;
    const lit = new Set<string>();
    for (const d of this.last()?.frame.items ?? []) if (d.placement.zone === 'world') lit.add(d.placement.anchor);
    const following = this.following && this.pursuit && !this.holding && this.sim.t - this.lookedAt >= PURSUIT_AFTER_DRAG_S ? this.pursuit.id : null;
    const ids = following ? new Set([following]) : new Set<string>([...PLACES.map((p) => p.id), ...lit]);
    const pose = this.sim.cameraPose();
    const vw = innerWidth;
    const vh = innerHeight;
    let best: string | null = null;
    let bestOff = Infinity;
    let curIn = false;
    const take = (id: string, off: number): void => {
      if (id === cur) curIn = true;
      if (off < bestOff) {
        best = id;
        bestOff = off;
      }
    };
    for (const id of ids) {
      const a = this.sim.anchorOf(id);
      if (!a || Math.hypot(a.x - eye.x, a.z - eye.z) > ATTENTION_M) continue;
      const keep = id === cur;
      const place = PLACE_BY_ID.get(id);
      if (place?.n) {
        const quad = [
          { x: a.x, y: 0.3, z: -place.n[0] },
          { x: a.x, y: 0.3, z: -place.n[1] },
          { x: a.x, y: a.y + 0.8, z: -place.n[1] },
          { x: a.x, y: a.y + 0.8, z: -place.n[0] },
        ].map((c) => this.bridge.project(c));
        const mid = { x: a.x - eye.x, z: -(place.n[0] + place.n[1]) / 2 - eye.z };
        const facing = Math.acos(Math.min(1, Math.abs(mid.x) / (Math.hypot(mid.x, mid.z) || 1)));
        const wide = quad.every((q) => q.inFront) && Math.abs(quad[1]!.x - quad[0]!.x) >= FRONT_MIN_PX && facing < FRONT_MAX_FACING;
        if (wide) {
          const inside = distanceToQuad(vw / 2, vh / 2, quad);
          if (inside <= (keep ? FRONT_RELEASE_PX : 0)) {
            take(id, -0.2 + Math.hypot(a.x - eye.x, a.z - eye.z) / 10000);
            continue;
          }
        }
      }
      const pr = this.bridge.project(a);
      const px = Math.hypot(pr.x - vw / 2, pr.y - vh / 2);
      if (pr.inFront && px < (keep ? PIP_RELEASE_PX : PIP_ACQUIRE_PX)) {
        take(id, px / 4000 - 0.05);
        continue;
      }
      if (place?.n) continue;
      let y0 = yawToward(pose.pos, a);
      let y1 = y0;
      if (place?.n) {
        y0 = yawToward(pose.pos, { x: a.x, y: a.y, z: -place.n[0] });
        y1 = yawToward(pose.pos, { x: a.x, y: a.y, z: -place.n[1] });
      }
      const dyaw = angleToSpan(pose.yaw, y0, y1);
      const flat = Math.hypot(a.x - pose.pos.x, a.z - pose.pos.z);
      const top = Math.atan2(a.y + 0.8 - pose.pos.y, flat);
      const bottom = Math.atan2(0.9 - pose.pos.y, flat);
      const dpitch = pose.pitch > top ? pose.pitch - top : pose.pitch < bottom ? bottom - pose.pitch : 0;
      if (dyaw > (keep ? YAW_RELEASE : YAW_ACQUIRE) || dpitch > (keep ? 0.2 : 0.12)) continue;
      take(id, dyaw + dpitch + Math.abs(angleWrap(yawToward(pose.pos, a) - pose.yaw)) * 0.02 - (keep ? 0.02 : 0));
    }
    return { best, curIn };
  }

  private pursue(gaze: string | null): void {
    const sim = this.sim;
    const a = gaze && !gaze.includes(':') ? sim.anchorOf(gaze) : undefined;
    this.following = false;
    if (!gaze || !a) {
      this.pursuit = null;
      return;
    }
    const eye = sim.wearer.pos;
    const worldYaw = sim.wearer.bodyYaw + this.head.yaw;
    const toYaw = yawToward(eye, a);
    const toPitch = pitchToward(eye, a);
    const dragging = this.holding || sim.t - this.lookedAt < PURSUIT_AFTER_DRAG_S;
    const settled = Math.abs(angleWrap(sim.head.yaw - worldYaw)) < PURSUIT_SETTLED_RAD && sim.gaze.dwellMs >= PURSUIT_DWELL_MS && this.pick.cand === null;
    if (!this.pursuit || this.pursuit.id !== gaze || dragging || !settled) {
      this.pursuit = { id: gaze, dyaw: angleWrap(worldYaw - toYaw), dpitch: this.head.pitch - toPitch };
      return;
    }
    this.following = true;
    const k = Math.min(1, STEP * PURSUIT_RATE);
    const yaw = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, angleWrap(toYaw + this.pursuit.dyaw - sim.wearer.bodyYaw)));
    const pitch = Math.max(-0.6, Math.min(0.75, toPitch + this.pursuit.dpitch));
    this.head = { yaw: this.head.yaw + angleWrap(yaw - this.head.yaw) * k, pitch: this.head.pitch + (pitch - this.head.pitch) * k };
  }

  step(): void {
    this.core(false);
  }

  private core(fast: boolean): void {
    const sim = this.sim;
    if (!sim.scripted) {
      let inp = this.inputs[this.stepIndex];
      if (!inp) {
        this.pursue(sim.gaze.target);
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
    snap.wearerModel = frame.model;
    this.frames[k] = frame;
    if (!fast || !this.snapshots[k]) this.snapshots[k] = snap;
    this.tickIndex++;
    if (!fast && this.overlay) {
      this.overlay.apply(frame, snap);
      this.view = this.overlay.report();
    }
    if (sim.wearer.arrived && this.arrivedAt === null) this.arrivedAt = sim.t;
    if (!this.ended && (sim.t >= this.duration - 1e-6 || (this.arrivedAt !== null && sim.t - this.arrivedAt >= 4))) this.ended = true;
    if (!fast) for (const fn of this.listeners) fn();
  }

  seek(t: number): void {
    const target = Math.max(0, Math.min(Math.round(t * SIM_HZ), Math.round(this.duration * SIM_HZ)));
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
