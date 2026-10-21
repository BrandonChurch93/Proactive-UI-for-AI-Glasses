import { gsap } from 'gsap';
import { Brain } from '@lumen/brain';
import { PLACES, type BrainFrame, type PaneReport, type ScenarioId, type WorldSnapshot } from '@lumen/shared';
import { Sim, TICK_HZ } from '@lumen/sim';
import { Overlay } from '@lumen/overlay';
import { ThreeBridge } from './bridge';
import type { World } from './world/world';

const ACQUIRE = (3.5 * Math.PI) / 180;
const RELEASE = (6.0 * Math.PI) / 180;

gsap.ticker.remove(gsap.updateRoot);
gsap.ticker.lagSmoothing(0);
let clockBase = 0;
let clockLast = 0;

export interface WalkOptions {
  scripted: boolean;
  reducedMotion?: boolean;
  onFrame?: (frame: BrainFrame, snap: WorldSnapshot) => void;
}

export class Walk {
  readonly sim: Sim;
  readonly brain: Brain;
  readonly overlay: Overlay;
  readonly bridge: ThreeBridge;
  readonly frames: BrainFrame[] = [];
  last: { frame: BrainFrame; snap: WorldSnapshot } | null = null;
  hoverId: string | null = null;
  private view: { w: number; h: number; panes: PaneReport[] } | undefined;
  private tickIndex = 0;

  constructor(
    readonly world: World,
    readonly scenario: ScenarioId,
    parent: HTMLElement,
    private opts: WalkOptions,
  ) {
    clockBase = clockLast + 1;
    this.sim = new Sim(scenario, { viewport: { w: innerWidth, h: innerHeight } });
    this.sim.scripted = opts.scripted;
    this.brain = new Brain({ scenario });
    world.setSim(this.sim);
    this.bridge = new ThreeBridge(world.core.camera, this.sim);
    world.core.scene.add(this.bridge.group);
    this.overlay = new Overlay(this.bridge, parent, {
      ...(opts.reducedMotion !== undefined ? { reducedMotion: opts.reducedMotion } : {}),
      handlers: {
        pinch: (id) => this.pinch(id),
        choice: (id, action) => this.sim.setLiveEvents({ choice: { id, action } }),
      },
    });
  }

  dispose(): void {
    this.overlay.dispose();
    this.world.core.scene.remove(this.bridge.group);
  }

  pinch(id?: string): void {
    if (this.sim.scripted) return;
    const target = id ?? this.sim.gaze.target ?? undefined;
    if (target) this.sim.setLiveEvents({ pinch: target });
  }

  dismiss(): void {
    if (this.sim.scripted) return;
    this.sim.setLiveEvents({ dismiss: this.sim.gaze.target ?? null });
  }

  private liveGaze(): string | null {
    if (this.hoverId) return this.hoverId;
    const cur = this.sim.gaze.target;
    let best: string | null = null;
    let bestOff = Infinity;
    const ids = PLACES.map((p) => p.id);
    for (const d of this.last?.frame.items ?? []) if (d.placement.zone === 'world' && !ids.includes(d.placement.anchor)) ids.push(d.placement.anchor);
    for (const id of ids) {
      const a = this.sim.anchorOf(id);
      if (!a) continue;
      const off = this.sim.offTarget(a);
      const limit = id === cur ? RELEASE : ACQUIRE;
      if (off < limit && off < bestOff) {
        best = id;
        bestOff = off;
      }
    }
    return best;
  }

  step(dt: number): void {
    const sim = this.sim;
    if (!sim.scripted) sim.live.gazeId = this.liveGaze();
    sim.step(dt);
    this.world.update(dt);
    while (sim.t + 1e-7 >= this.tickIndex / TICK_HZ) {
      this.tick();
      this.tickIndex++;
    }
    clockLast = clockBase + sim.t;
    gsap.updateRoot(clockLast);
    this.overlay.update(sim.t);
  }

  private tick(): void {
    const snap = this.sim.snapshot(this.view);
    const frame = this.brain.tick(snap);
    snap.wearerModel = frame.model;
    this.frames.push(frame);
    this.last = { frame, snap };
    this.overlay.apply(frame, snap);
    this.view = this.overlay.report();
    this.opts.onFrame?.(frame, snap);
  }
}
