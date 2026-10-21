import { angleWrap, EYE_HEIGHT, v3, type Band, type Leg, type ScenarioData, type Vec3, type WearerState } from '@lumen/shared';
import { headingAt, pointAt, type Route } from './route';

export const STOP_DECEL = 0.9;
const EASE_TAU = 0.42;

export interface Crossing {
  at: number;
  seconds: number;
  leg: Leg;
  from: number;
  to: number;
}

export class Wearer {
  s = 0;
  speed: number;
  state: WearerState = 'walking';
  pos: Vec3 = v3();
  heading: Vec3 = v3(0, 0, -1);
  bodyYaw = 0;
  lateral = 0;
  arrived = false;
  crossing: Crossing | null = null;
  private crossings: Crossing[];
  private released = new Set<number>();
  private lateralTarget = 0;

  constructor(
    private readonly data: ScenarioData,
    readonly route: Route,
  ) {
    this.speed = this.targetSpeed(0);
    this.crossings = data.beats
      .filter((b): b is Extract<typeof b, { kind: 'crossing' }> => b.kind === 'crossing')
      .map((b) => {
        const stop = route.stops.find((s) => s.leg === b.leg) ?? route.stops[0]!;
        return { at: b.t, seconds: b.seconds, leg: b.leg, from: stop.s, to: stop.crossEnd };
      });
    this.place();
  }

  band(t: number): Band {
    let band: Band = 'walk';
    for (const seg of this.data.pace) if (seg.t <= t + 1e-9) band = seg.band;
    return band;
  }

  targetSpeed(t: number): number {
    return this.data.speeds[this.band(t)];
  }

  setLateralTarget(v: number): void {
    this.lateralTarget = v;
  }

  step(t: number, dt: number): void {
    const active = this.crossings.find((c) => t >= c.at - 1e-9 && t < c.at + c.seconds);
    if (active) {
      this.crossing = active;
      this.state = 'crossing';
      const k = (t - active.at) / active.seconds;
      this.s = active.from + (active.to - active.from) * k;
      this.speed = (active.to - active.from) / active.seconds;
      this.released.add(active.from);
      this.lateral += (0 - this.lateral) * Math.min(1, dt * 3);
      this.place();
      return;
    }
    if (this.crossing && t >= this.crossing.at + this.crossing.seconds) {
      this.s = Math.max(this.s, this.crossing.to);
      this.crossing = null;
    }
    let target = this.targetSpeed(t);
    if (this.arrived) target = 0;
    const k = 1 - Math.exp(-dt / EASE_TAU);
    let v = this.speed + (target - this.speed) * k;
    const stop = this.route.stops.find((st) => st.s > this.s - 0.01 && !this.released.has(st.s));
    if (stop) {
      const left = Math.max(0, stop.s - this.s);
      v = Math.min(v, Math.sqrt(2 * STOP_DECEL * left));
    }
    const left = this.route.end - this.s;
    v = Math.min(v, Math.sqrt(2 * STOP_DECEL * Math.max(0, left)));
    this.speed = Math.max(0, v);
    let next = this.s + this.speed * dt;
    if (stop && next > stop.s) next = stop.s;
    if (next >= this.route.end - 0.02) {
      next = this.route.end;
      if (this.speed < 0.25) this.arrived = true;
    }
    this.s = next;
    this.state = this.speed < 0.2 ? 'stopped' : 'walking';
    this.lateral += (this.lateralTarget - this.lateral) * Math.min(1, dt * 1.6);
    this.place();
  }

  private place(): void {
    const p = pointAt(this.route, this.s);
    this.heading = headingAt(this.route, this.s);
    const right = v3(-this.heading.z, 0, this.heading.x);
    this.pos = v3(p.pos.x + right.x * this.lateral, EYE_HEIGHT, p.pos.z + right.z * this.lateral);
    const target = Math.atan2(-this.heading.x, -this.heading.z);
    this.bodyYaw = this.bodyYaw + angleWrap(target - this.bodyYaw);
  }

  pathAhead(seconds: number): Vec3[] {
    const out: Vec3[] = [];
    const stop = this.route.stops.find((st) => st.s > this.s - 0.01 && !this.released.has(st.s) && !this.crossing);
    const reach = this.crossing ? this.crossing.to : Math.min(this.route.end, this.s + Math.max(this.speed, 0) * seconds + 1);
    const end = stop && !this.crossing ? Math.min(reach, stop.s) : reach;
    for (let s = this.s; s <= end + 1e-6; s += 0.5) out.push(pointAt(this.route, s).pos);
    return out;
  }

  curbDistance(): number {
    const stop = this.route.stops.find((st) => st.s > this.s - 0.6);
    return stop ? Math.max(0, stop.s - this.s) : 999;
  }
}
