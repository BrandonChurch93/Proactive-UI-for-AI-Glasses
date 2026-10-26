import { angleWrap, EYE_HEIGHT, nOf, v3, type Band, type Leg, type PaceZone, type SignalReading, type Vec3, type WearerState } from '@lumen/shared';
import { graphPos, headingAt, pointAt, type GraphPos, type Route } from './route';

export const STOP_DECEL = 0.9;
export const CROSSING_S = 10;
export const DOOR_S = 4;
const EASE_TAU = 0.42;
const TURN_RATE = 3.2;

export interface Crossing {
  at: number;
  seconds: number;
  leg: Leg;
  from: number;
  to: number;
}

export interface WearerEnv {
  speeds: Record<Band, number>;
  pace: readonly PaceZone[];
  signal(leg: Leg, t: number): SignalReading;
  ask(leg: Leg, t: number): void;
}

export class Wearer {
  s = 0;
  speed = 0;
  state: WearerState = 'stopped';
  pos: Vec3 = v3();
  heading: Vec3 = v3(0, 0, -1);
  bodyYaw = 0;
  lateral = 0;
  arrivedAt: number | null = null;
  holding = true;
  crossing: Crossing | null = null;
  route: Route;
  private released = new Set<number>();
  private lateralTarget = 0;

  constructor(
    private readonly env: WearerEnv,
    route: Route,
  ) {
    this.route = route;
    this.place(true);
  }

  get arrived(): boolean {
    return this.arrivedAt !== null;
  }

  where(): GraphPos {
    return graphPos(this.route, this.s);
  }

  setRoute(r: Route): void {
    this.route = r;
    this.s = 0;
    this.released.clear();
    this.arrivedAt = null;
    this.crossing = null;
  }

  band(): Band {
    const piece = this.route.pieces.find((p) => this.s <= p.s1 + 1e-6);
    const n = nOf(this.pos.z);
    const north = piece && piece.edge === 'E' && piece.d1 > piece.d0;
    for (const z of this.env.pace) {
      if (z.side === 'E' && north && n >= z.fromN && n < z.toN) return z.band;
    }
    return 'walk';
  }

  setLateralTarget(v: number): void {
    this.lateralTarget = v;
  }

  step(t: number, dt: number): void {
    const r = this.route;
    if (this.crossing) {
      const c = this.crossing;
      const k = Math.min(1, (t - c.at) / c.seconds);
      this.s = c.from + (c.to - c.from) * k;
      this.speed = (c.to - c.from) / c.seconds;
      this.state = 'crossing';
      this.lateral += (0 - this.lateral) * Math.min(1, dt * 3);
      if (k >= 1) {
        this.crossing = null;
        this.s = c.to;
      }
      this.place();
      return;
    }
    const stop = r.stops.find((st) => st.s > this.s - 0.01 && !this.released.has(st.s));
    if (stop && stop.s - this.s < 0.05 && this.speed < 0.3) {
      this.env.ask(stop.leg, t);
      const read = this.env.signal(stop.leg, t);
      if (read.state === 'walk') {
        this.released.add(stop.s);
        this.crossing = { at: t, seconds: CROSSING_S, leg: stop.leg, from: stop.s, to: stop.crossEnd };
        this.step(t, dt);
        return;
      }
    } else if (stop && stop.s - this.s < 12) this.env.ask(stop.leg, t);
    let target = this.holding || this.arrived ? 0 : this.env.speeds[this.band()];
    const want = Math.atan2(-this.heading.x, -this.heading.z);
    if (Math.abs(angleWrap(want - this.bodyYaw)) > 1) target = 0;
    const k = 1 - Math.exp(-dt / EASE_TAU);
    let v = this.speed + (target - this.speed) * k;
    if (stop) v = Math.min(v, Math.sqrt(2 * STOP_DECEL * Math.max(0, stop.s - this.s)));
    v = Math.min(v, Math.sqrt(2 * STOP_DECEL * Math.max(0, r.end - this.s)));
    this.speed = Math.max(0, v);
    let next = this.s + this.speed * dt;
    if (stop && next > stop.s) next = stop.s;
    if (next >= r.end - 0.02) {
      next = r.end;
      if (this.speed < 0.25 && this.arrivedAt === null) this.arrivedAt = t;
    }
    this.s = next;
    this.state = this.speed < 0.2 ? 'stopped' : 'walking';
    this.lateral += (this.lateralTarget - this.lateral) * Math.min(1, dt * 1.6);
    this.place(false, dt);
  }

  private place(snap = false, dt = 0): void {
    const p = pointAt(this.route, this.s);
    if (this.route.length > 0.5) this.heading = this.s >= this.route.length - 0.6 ? pointAt(this.route, this.route.length).dir : headingAt(this.route, this.s);
    const right = v3(-this.heading.z, 0, this.heading.x);
    this.pos = v3(p.pos.x + right.x * this.lateral, EYE_HEIGHT, p.pos.z + right.z * this.lateral);
    const target = Math.atan2(-this.heading.x, -this.heading.z);
    const err = angleWrap(target - this.bodyYaw);
    this.bodyYaw = snap || this.state === 'crossing' ? this.bodyYaw + err : this.bodyYaw + Math.sign(err) * Math.min(Math.abs(err), TURN_RATE * Math.max(dt, 1 / 60));
  }

  pathAhead(seconds: number): Vec3[] {
    const out: Vec3[] = [];
    const stop = this.route.stops.find((st) => st.s > this.s - 0.01 && !this.released.has(st.s) && !this.crossing);
    const reach = this.crossing ? this.crossing.to : Math.min(this.route.end, this.s + Math.max(this.speed, 0) * seconds + 1);
    const end = stop && !this.crossing ? Math.min(reach, stop.s) : reach;
    for (let s = this.s; s <= end + 1e-6; s += 0.5) out.push(pointAt(this.route, s).pos);
    return out;
  }

  nextStop(): { s: number; leg: Leg; crossEnd: number } | undefined {
    return this.route.stops.find((st) => st.crossEnd > this.s + 0.05);
  }

  curbDistance(): number {
    const stop = this.route.stops.find((st) => st.s > this.s - 0.6);
    return stop ? Math.max(0, stop.s - this.s) : 999;
  }
}
