import { gsap } from 'gsap';
import { Brain } from '@lumen/brain';
import {
  PLACES,
  WALK_SECONDS,
  compactSnapshot,
  type BrainFrame,
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

const ACQUIRE = (3.5 * Math.PI) / 180;
const RELEASE = (6.0 * Math.PI) / 180;
const STEP = 1 / SIM_HZ;
const STEPS_PER_TICK = SIM_HZ / TICK_HZ;
const WARM_STEPS = Math.round(2.5 * SIM_HZ);
const SEED = 47;
const NEAR_GAZE_M = 30;
const LIT_GAZE_M = 70;

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

  private makeOverlay(): Overlay {
    clockBase = clockLast + 1 - this.sim.t;
    const o = new Overlay(this.bridge, this.layer, {
      clock,
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
    const cur = this.sim.gaze.target;
    const eye = this.sim.wearer.pos;
    const range = new Map<string, number>(PLACES.map((p) => [p.id, NEAR_GAZE_M]));
    for (const d of this.last()?.frame.items ?? []) if (d.placement.zone === 'world') range.set(d.placement.anchor, LIT_GAZE_M);
    let best: string | null = null;
    let bestOff = Infinity;
    for (const [id, limitM] of range) {
      const a = this.sim.anchorOf(id);
      if (!a || Math.hypot(a.x - eye.x, a.z - eye.z) > limitM) continue;
      const off = this.sim.offTarget(a);
      if (off < (id === cur ? RELEASE : ACQUIRE) && off < bestOff) {
        best = id;
        bestOff = off;
      }
    }
    return best;
  }

  step(): void {
    this.core(false);
  }

  private core(fast: boolean): void {
    const sim = this.sim;
    if (!sim.scripted) {
      let inp = this.inputs[this.stepIndex];
      if (!inp) {
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
    const snap = sim.snapshot(fast ? undefined : this.view);
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
      this.overlay = this.makeOverlay();
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
    };
  }
}
