import { readSignal, v3, zOf, type Leg, type SignalAnchor, type Vec3 } from '@lumen/shared';
import { Rng } from './random';

export type PersonAnim = 'walk' | 'idle' | 'talk' | 'sit' | 'wait';

export interface Waypoint {
  x: number;
  n: number;
  wait?: Leg;
}

export interface Person {
  id: string;
  pos: Vec3;
  heading: number;
  speed: number;
  baseSpeed: number;
  anim: PersonAnim;
  path: Waypoint[];
  idx: number;
  spawnAt: number;
  despawnAt?: number;
  alive: boolean;
  scripted: boolean;
  look: number;
  height: number;
  phase: number;
  facePoint?: Vec3;
  opacity: number;
  stillSince: number | null;
  // Where the person has been since stillSince was last reset: a walker jammed in place, stepping to and fro, is standing there.
  rest?: { x: number; z: number };
  goneAt: number | null;
}

const W = (x: number, n: number, wait?: Leg): Waypoint => (wait ? { x, n, wait } : { x, n });

export function walkable(p: Vec3): Vec3 {
  const n = -p.z;
  const ax = Math.abs(p.x);
  const onCrosswalk = (n > 85.6 && n < 89.6) || (n > 104.4 && n < 108.4) || (ax > 7.6 && ax < 11.6 && n > 89 && n < 105);
  if (onCrosswalk) return p;
  if (n < 84.3) {
    const sx = Math.sign(p.x) || 1;
    return v3(sx * Math.min(12.7, Math.max(7.4, ax)), 0, p.z);
  }
  if (n < 89.7) {
    if (ax < 7.4) return v3((Math.sign(p.x) || 1) * 7.4, 0, p.z);
    return ax <= 12.7 ? v3(p.x, 0, -Math.min(89.6, n)) : v3(p.x, 0, -Math.min(89.6, Math.max(84.4, n)));
  }
  if (n > 104.3) {
    if (ax < 7.4 && n < 110) return v3((Math.sign(p.x) || 1) * 7.4, 0, p.z);
    return ax <= 12.7 ? v3(p.x, 0, -Math.max(104.4, n)) : v3(p.x, 0, -Math.min(109.6, Math.max(104.4, n)));
  }
  return p;
}

export interface PeopleOptions {
  seed: number;
  signal: SignalAnchor;
  avoidCrosswalks: Leg[];
  scripted: ScriptedPerson[];
  absent?: readonly string[];
}

export interface ScriptedPerson {
  id: string;
  path: Waypoint[];
  speed: number;
  spawnAt: number;
  anim?: PersonAnim;
  facePoint?: Vec3;
}

const EAST_DOORS = [-30, -14, 2, 14, 21, 27, 32, 38, 44, 49, 54, 72, 81];
const WEST_DOORS = [-32, -16, -1, 12, 24, 32, 38, 50, 64, 74];

const GONE_S = 0.8;
const BEHIND_M = 1.7;
const DOORWAY_CLEAR_M = 6;
const PASS_WINDOW_M = 12;
const CURB_LANE_X = 7.45;
const FACADE_LANE_X = 12.5;
export const STILL_SPEED = 0.2;
export const STILL_S = 2;
const STILL_RADIUS_M = 0.3;

function enters(p: Person): boolean {
  const last = p.path[p.path.length - 1]!;
  return !p.scripted && p.path.length > 1 && Math.abs(last.x) >= 12.6 && last.n < 84;
}

export class People {
  people: Person[] = [];
  private rng: Rng;
  private queue: { at: number; make: () => Person }[] = [];
  private seq = 0;
  private doorSide = 0;
  private facing = 0;
  private doorAt: Vec3 | null = null;

  constructor(
    private readonly opts: PeopleOptions,
    start: number,
  ) {
    this.rng = new Rng(opts.seed * 13 + 5);
    this.seedAmbient(start);
    this.seedIdle();
    for (const s of opts.scripted) this.add(s);
    for (const p of this.people) if (opts.absent?.includes(p.id)) p.alive = false;
  }

  add(s: ScriptedPerson): void {
    this.queue.push({
      at: s.spawnAt,
      make: () => {
        const p = this.person(s.id, s.path, s.speed, s.spawnAt, true);
        if (s.anim) p.anim = s.anim;
        if (s.facePoint) p.facePoint = s.facePoint;
        return p;
      },
    });
  }

  private person(id: string, path: Waypoint[], speed: number, at: number, scripted = false): Person {
    const first = path[0]!;
    const next = path[1] ?? first;
    return {
      id,
      pos: v3(first.x, 0, zOf(first.n)),
      heading: Math.atan2(-(next.x - first.x), next.n - first.n),
      speed: path.length > 1 ? speed : 0,
      baseSpeed: speed,
      anim: path.length > 1 ? 'walk' : 'idle',
      path,
      idx: 1,
      spawnAt: at,
      alive: true,
      scripted,
      look: this.rng.int(0, 1_000_000),
      height: this.rng.range(1.58, 1.88),
      phase: this.rng.range(0, Math.PI * 2),
      opacity: 1,
      stillSince: path.length > 1 ? null : at,
      goneAt: null,
    };
  }

  private ambientPath(rng: Rng): Waypoint[] {
    const kind = rng.int(0, 9);
    const ex = (): number => rng.range(10.6, 12.2);
    const wx = (): number => -rng.range(10.6, 12.2);
    const cs = (): number => rng.range(85.2, 88.6);
    const cn = (): number => rng.range(105.4, 108.8);
    const avoid = this.opts.avoidCrosswalks;
    switch (kind) {
      case 0:
      case 1: {
        const a = rng.pick(EAST_DOORS);
        let b = rng.pick(EAST_DOORS);
        if (Math.abs(a - b) < 20) b = a < 30 ? 82 : -40;
        const x = ex();
        return [W(12.7, a), W(x, a), W(x, b), W(b > 80 ? 30 : 12.7, b > 80 ? cs() : b)];
      }
      case 2:
      case 3: {
        const a = rng.pick(WEST_DOORS);
        let b = rng.pick(WEST_DOORS);
        if (Math.abs(a - b) < 20) b = a < 30 ? 82 : -40;
        const x = wx();
        return [W(-12.7, a), W(x, a), W(x, b), W(b > 80 ? -30 : -12.7, b > 80 ? cs() : b)];
      }
      case 4: {
        const n = cn();
        return [W(70, n), W(14, n), W(rng.range(9.6, 12.4), n, 'avenue'), W(-10.5, n), W(-60, n)];
      }
      case 5: {
        const n = cn();
        return [W(-60, n), W(-rng.range(9.6, 12.4), n, 'avenue'), W(10.5, n), W(70, n)];
      }
      case 6: {
        if (avoid.includes('cross')) return [W(-60, cs()), W(-13.5, cs()), W(-11.5, 70)];
        const x = rng.range(10.6, 12.2);
        return [W(x, 60), W(x, 88.6, 'cross'), W(x, 105.4), W(x + 6, 107.8), W(70, 107.8)];
      }
      case 7: {
        if (avoid.includes('avenue')) return [W(-12.2, 40), W(-11.6, 84.6), W(-60, cs())];
        const n = rng.range(86.4, 88.8);
        return [W(-11.6, 70), W(-9.4, n, 'avenue'), W(9.4, n), W(11.8, 60), W(12.7, 44)];
      }
      default: {
        const n = cs();
        return [W(-60, n), W(-14, n), W(-11.6, 70)];
      }
    }
  }

  private seedAmbient(start: number): void {
    const rng = new Rng(this.opts.seed * 101 + 3);
    let t = start;
    for (let i = 0; i < 40; i++) {
      const path = this.ambientPath(rng);
      const speed = rng.range(1.05, 1.45);
      const at = t;
      this.queue.push({ at, make: () => this.person(`p${this.seq++}`, path, speed, at) });
      t += rng.range(1.2, 4.5);
    }
  }

  private seedIdle(): void {
    const idle: [number, number, number, PersonAnim][] = [
      [-12.5, 34.8, Math.PI / 2, 'talk'],
      [-11.85, 35.5, -Math.PI / 2, 'talk'],
      [11.6, 67.4, -Math.PI / 2, 'idle'],
      [-12.35, 80.0, Math.PI / 2, 'sit'],
      [-12.0, 40.4, Math.PI / 2, 'sit'],
      [12.4, 50.6, -Math.PI / 2, 'sit'],
      [-10.4, 106.6, 0, 'wait'],
      [6.6, 108.6, Math.PI / 2, 'wait'],
      [-12.1, 22.6, Math.PI / 2, 'idle'],
      [12.2, 15.2, -Math.PI / 2, 'idle'],
    ];
    for (const [x, n, h, anim] of idle) {
      const p = this.person(`idle${this.seq++}`, [W(x, n)], 0, -999);
      p.heading = h;
      p.anim = anim;
      this.people.push(p);
    }
  }

  step(t: number, dt: number, wearer: Vec3, wearerMoving: boolean, doorSide = 0, facing = doorSide): void {
    this.doorSide = doorSide;
    this.facing = facing;
    this.doorAt = wearer;
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0]!.at <= t) {
      const next = this.queue.shift()!.make();
      if (!next.scripted && this.outOfTheirDoor(next.path)) {
        const path = this.ambientPath(this.rng);
        const speed = this.rng.range(1.05, 1.45);
        const at = t + this.rng.range(0.5, 3);
        this.queue.push({ at, make: () => this.person(`p${this.seq++}`, path, speed, at) });
        this.queue.sort((a, b) => a.at - b.at);
        continue;
      }
      if (this.opts.absent?.includes(next.id)) next.alive = false;
      this.people.push(next);
    }
    for (const p of this.people) {
      if (!p.alive) continue;
      this.goFurther(p);
      // A doorway is a passage: someone walking into a shop steps over the threshold and is gone inside within a second.
      if (p.goneAt !== null || (p.idx >= p.path.length && enters(p))) {
        p.goneAt ??= t;
        const k = (t - p.goneAt) / GONE_S;
        p.pos = v3(p.pos.x - Math.sin(p.heading) * p.baseSpeed * 0.6 * dt, 0, p.pos.z - Math.cos(p.heading) * p.baseSpeed * 0.6 * dt);
        p.speed = p.baseSpeed * 0.6;
        p.opacity = Math.max(0, 1 - k);
        if (k >= 1) {
          p.alive = false;
          const path = this.ambientPath(this.rng);
          const at = t + this.rng.range(0.5, 3);
          const speed = this.rng.range(1.05, 1.45);
          this.queue.push({ at, make: () => this.person(`p${this.seq++}`, path, speed, at) });
        }
        continue;
      }
      if (p.path.length < 2 || p.idx >= p.path.length) {
        p.speed = 0;
        p.stillSince ??= t;
        if (p.path.length >= 2 && !p.scripted) {
          p.alive = false;
          const path = this.ambientPath(this.rng);
          const at = t + this.rng.range(0.5, 3);
          const speed = this.rng.range(1.05, 1.45);
          this.queue.push({ at, make: () => this.person(`p${this.seq++}`, path, speed, at) });
        }
        if (p.scripted && p.path.length >= 2) p.alive = false;
        continue;
      }
      const wp = p.path[p.idx]!;
      // Someone being led behind the wearer walks for the lane a few steps ahead, so every step agrees with the detour.
      const behind = !p.scripted && this.passBehind(p);
      const tx = behind ? this.behindLane(wearer.x) : wp.x;
      const tz = behind ? p.pos.z + Math.sign(zOf(wp.n) - p.pos.z) * 3 : zOf(wp.n);
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      const prev = p.path[p.idx - 1]!;
      if (prev.wait) {
        const sig = readSignal(this.opts.signal, prev.wait, t);
        if (sig.state !== 'walk' && Math.hypot(p.pos.x - prev.x, p.pos.z - zOf(prev.n)) < 0.3) {
          p.speed = 0;
          p.stillSince ??= t;
          p.anim = 'wait';
          if (!p.scripted) this.keepClear(p, wearer, wearerMoving);
          continue;
        }
      }
      let want = p.baseSpeed;
      let vx = (dx / (d || 1)) * want;
      let vz = (dz / (d || 1)) * want;
      if (!p.scripted && !behind && !this.goingIn(p)) {
        const ox = p.pos.x - wearer.x;
        const oz = p.pos.z - wearer.z;
        const od = Math.hypot(ox, oz);
        if (od < 5.5) {
          const push = (5.5 - od) / 5.5;
          const nx = ox / (od || 1);
          const nz = oz / (od || 1);
          const side = vx * nz - vz * nx >= 0 ? 1 : -1;
          vx += nx * push * 2.2 + nz * side * push * 1.8;
          vz += nz * push * 2.2 - nx * side * push * 1.8;
          const closing = (vx * -ox + vz * -oz) / (od || 1);
          if (closing > 0 && od < 3.8) want *= 0.7;
        }
        for (const q of this.people) {
          if (q === p || !q.alive) continue;
          const qx = p.pos.x - q.pos.x;
          const qz = p.pos.z - q.pos.z;
          const qd = Math.hypot(qx, qz);
          if (qd > 0.01 && qd < 1.15) {
            vx += (qx / qd) * (1.15 - qd) * 1.8;
            vz += (qz / qd) * (1.15 - qd) * 1.8;
          }
        }
      }
      const vl = Math.hypot(vx, vz) || 1;
      const speed = Math.min(vl, want * 1.15);
      const step = Math.min(speed * dt, Math.max(d, speed * dt));
      const before = p.pos;
      p.pos = v3(p.pos.x + (vx / vl) * step, 0, p.pos.z + (vz / vl) * step);
      if (!p.scripted && !this.goingIn(p)) this.keepClear(p, wearer, wearerMoving);
      else if (!p.scripted) p.pos = walkable(p.pos);
      if (!p.scripted && step > 1e-4) {
        const gain = Math.hypot(tx - before.x, tz - before.z) - Math.hypot(tx - p.pos.x, tz - p.pos.z);
        if (gain < step * 0.3) {
          const slides = [v3(before.x + Math.sign(dx) * step, 0, before.z), v3(before.x, 0, before.z + Math.sign(dz) * step)].map((c) => walkable(c));
          let best = p.pos;
          let bestGain = gain;
          for (const c of slides) {
            const g = Math.hypot(tx - before.x, tz - before.z) - Math.hypot(tx - c.x, tz - c.z);
            if (g > bestGain + 1e-6 && Math.hypot(c.x - wearer.x, c.z - wearer.z) >= 3.2) {
              best = c;
              bestGain = g;
            }
          }
          p.pos = best;
        }
      }
      p.speed = speed;
      if (!p.rest || Math.hypot(p.pos.x - p.rest.x, p.pos.z - p.rest.z) > STILL_RADIUS_M) {
        p.rest = { x: p.pos.x, z: p.pos.z };
        p.stillSince = Math.hypot(p.pos.x - before.x, p.pos.z - before.z) < STILL_SPEED * dt ? t : null;
      } else p.stillSince ??= t;
      p.anim = p.stillSince !== null && t - p.stillSince > 0.5 ? 'wait' : 'walk';
      const target = Math.atan2(-(vx / vl), -(vz / vl));
      let dh = target - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += dh * Math.min(1, dt * 7);
      if (behind ? Math.abs(zOf(wp.n) - p.pos.z) < 0.5 : Math.hypot(tx - p.pos.x, tz - p.pos.z) < 0.35) p.idx++;
    }
    this.people = this.people.filter((p) => p.alive || t - p.spawnAt < 0);
  }

  // The lane behind the wearer, on the curb side, as far back as the pavement allows.
  private behindLane(x: number): number {
    const lane = x - this.facing * BEHIND_M;
    return Math.sign(lane) * Math.min(Math.max(Math.abs(lane), CURB_LANE_X), FACADE_LANE_X);
  }

  // Only someone passing along the pavement goes behind the wearer; someone heading into a shop goes straight in.
  private passBehind(p: Person): boolean {
    const w = this.doorAt;
    if (this.doorSide === 0 || w === null || Math.sign(p.pos.x) !== this.doorSide || Math.abs(p.pos.x) <= 7 || Math.abs(p.pos.z - w.z) >= PASS_WINDOW_M) return false;
    const wp = p.path[Math.min(p.idx, p.path.length - 1)]!;
    return Math.abs(wp.x) < 12.6;
  }

  // Someone bound for the door the wearer is reading, or one a few metres from it, goes in a few doors further along instead,
  // so nobody walks between the wearer and what they read.
  private goFurther(p: Person): void {
    const w = this.doorAt;
    if (p.scripted || this.doorSide === 0 || w === null || p.path.length < 2 || p.idx >= p.path.length) return;
    const last = p.path[p.path.length - 1]!;
    if (Math.abs(last.x) < 12.6 || Math.sign(last.x) !== this.doorSide) return;
    const wn = -w.z;
    const dn = last.n - wn;
    if (Math.abs(dn) >= DOORWAY_CLEAR_M) return;
    const away = dn < 0 ? -1 : 1;
    let n = wn + away * (DOORWAY_CLEAR_M + 3);
    if (n > 82 || n < -40) n = wn - away * (DOORWAY_CLEAR_M + 3);
    for (let i = Math.max(p.idx, 1); i < p.path.length; i++) if (Math.abs(p.path[i]!.n - last.n) < 0.01) p.path[i] = { ...p.path[i]!, n };
  }

  // Someone heading into a doorway near the wearer's door walks straight in: no ring pushes them back from the threshold.
  private goingIn(p: Person): boolean {
    const w = this.doorAt;
    if (this.doorSide === 0 || w === null) return false;
    const wp = p.path[Math.min(p.idx, p.path.length - 1)]!;
    return Math.abs(wp.x) >= 12.6 && Math.sign(wp.x) === this.doorSide && Math.abs(zOf(wp.n) - w.z) < DOORWAY_CLEAR_M;
  }

  // While the wearer stands at a door, nobody comes out of a doorway within DOORWAY_CLEAR_M of them, and nobody is born on
  // that pavement within PASS_WINDOW_M, so everyone passing arrives with room to step behind them.
  private outOfTheirDoor(path: Waypoint[]): boolean {
    const w = this.doorAt;
    const first = path[0]!;
    if (this.doorSide === 0 || w === null || Math.sign(first.x) !== this.doorSide || Math.abs(first.x) <= 7) return false;
    const dz = Math.abs(zOf(first.n) - w.z);
    return dz < (Math.abs(first.x) >= 12.6 ? Math.max(DOORWAY_CLEAR_M, PASS_WINDOW_M) : PASS_WINDOW_M);
  }

  private keepClear(p: Person, wearer: Vec3, _moving: boolean): void {
    const min = this.passBehind(p) ? Math.max(0.7, Math.abs(wearer.x - this.behindLane(wearer.x)) - 0.2) : 3.2;
    const dist = (q: Vec3): number => Math.hypot(q.x - wearer.x, q.z - wearer.z);
    if (dist(p.pos) >= min) {
      p.pos = walkable(p.pos);
      return;
    }
    const ox = p.pos.x - wearer.x;
    const oz = p.pos.z - wearer.z;
    const od = Math.hypot(ox, oz) || 1;
    let q = walkable(v3(wearer.x + (ox / od) * min, 0, wearer.z + (oz / od) * min));
    if (dist(q) < min - 0.01) {
      const alongZ = Math.abs(p.pos.x) < 13.2 && -p.pos.z < 84;
      const dir = alongZ ? Math.sign(p.pos.z - wearer.z) || 1 : Math.sign(p.pos.x - wearer.x) || 1;
      for (let k = 0; k < 40 && dist(q) < min; k++) {
        q = walkable(alongZ ? v3(q.x, 0, q.z + dir * 0.15) : v3(q.x + dir * 0.15, 0, q.z));
      }
    }
    p.pos = q;
  }
}
