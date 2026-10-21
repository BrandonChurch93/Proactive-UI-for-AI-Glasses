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
  if (n < 89.7) return ax < 7.4 ? v3((Math.sign(p.x) || 1) * 7.4, 0, p.z) : v3(p.x, 0, -Math.min(89.6, Math.max(84.4, n)));
  if (n > 104.3) return ax < 7.4 && n < 110 ? v3((Math.sign(p.x) || 1) * 7.4, 0, p.z) : v3(p.x, 0, -Math.min(109.6, Math.max(104.4, n)));
  return p;
}

export interface PeopleOptions {
  seed: number;
  signal: SignalAnchor;
  avoidCrosswalks: Leg[];
  scripted: { id: string; path: Waypoint[]; speed: number; spawnAt: number; anim?: PersonAnim; facePoint?: Vec3 }[];
}

const EAST_DOORS = [-30, -14, 2, 14, 21, 27, 32, 38, 44, 49, 54, 72, 81];
const WEST_DOORS = [-32, -16, -1, 12, 24, 32, 38, 50, 64, 74];

export class People {
  people: Person[] = [];
  private rng: Rng;
  private queue: { at: number; make: () => Person }[] = [];
  private seq = 0;

  constructor(
    private readonly opts: PeopleOptions,
    start: number,
  ) {
    this.rng = new Rng(opts.seed * 13 + 5);
    this.seedAmbient(start);
    this.seedIdle();
    for (const s of opts.scripted) {
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
      [-11.7, 36.6, Math.PI / 2, 'talk'],
      [-11.0, 37.3, -Math.PI / 2, 'talk'],
      [11.6, 82.4, -Math.PI / 2, 'idle'],
      [-12.35, 80.0, Math.PI / 2, 'sit'],
      [-12.0, 40.4, Math.PI / 2, 'sit'],
      [12.4, 50.6, -Math.PI / 2, 'sit'],
      [-10.4, 106.6, 0, 'wait'],
      [6.6, 108.6, Math.PI / 2, 'wait'],
      [-11.9, 22.6, Math.PI / 2, 'idle'],
      [12.2, 15.2, -Math.PI / 2, 'idle'],
    ];
    for (const [x, n, h, anim] of idle) {
      const p = this.person(`idle${this.seq++}`, [W(x, n)], 0, -999);
      p.heading = h;
      p.anim = anim;
      this.people.push(p);
    }
  }

  step(t: number, dt: number, wearer: Vec3, wearerMoving: boolean): void {
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0]!.at <= t) this.people.push(this.queue.shift()!.make());
    for (const p of this.people) {
      if (!p.alive) continue;
      if (p.path.length < 2 || p.idx >= p.path.length) {
        p.speed = 0;
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
      const tx = wp.x;
      const tz = zOf(wp.n);
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      const prev = p.path[p.idx - 1]!;
      if (prev.wait) {
        const sig = readSignal(this.opts.signal, prev.wait, t);
        if (sig.state !== 'walk' && Math.hypot(p.pos.x - prev.x, p.pos.z - zOf(prev.n)) < 0.3) {
          p.speed = 0;
          p.anim = 'wait';
          if (!p.scripted) this.keepClear(p, wearer, wearerMoving);
          continue;
        }
      }
      let want = p.baseSpeed;
      let vx = (dx / (d || 1)) * want;
      let vz = (dz / (d || 1)) * want;
      if (!p.scripted) {
        const ox = p.pos.x - wearer.x;
        const oz = p.pos.z - wearer.z;
        const od = Math.hypot(ox, oz);
        if (od < 5.5) {
          const push = (5.5 - od) / 5.5;
          vx += (ox / (od || 1)) * push * 2.2;
          vz += (oz / (od || 1)) * push * 2.2;
          const closing = (vx * -ox + vz * -oz) / (od || 1);
          if (closing > 0 && od < 3.8) want *= 0.4;
        }
        for (const q of this.people) {
          if (q === p || !q.alive) continue;
          const qx = p.pos.x - q.pos.x;
          const qz = p.pos.z - q.pos.z;
          const qd = Math.hypot(qx, qz);
          if (qd > 0.01 && qd < 0.9) {
            vx += (qx / qd) * (0.9 - qd) * 1.5;
            vz += (qz / qd) * (0.9 - qd) * 1.5;
          }
        }
      }
      const vl = Math.hypot(vx, vz) || 1;
      const speed = Math.min(vl, want * 1.15);
      const step = Math.min(speed * dt, Math.max(d, speed * dt));
      p.pos = v3(p.pos.x + (vx / vl) * step, 0, p.pos.z + (vz / vl) * step);
      if (!p.scripted) this.keepClear(p, wearer, wearerMoving);
      p.speed = speed;
      p.anim = 'walk';
      const target = Math.atan2(-(vx / vl), -(vz / vl));
      let dh = target - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += dh * Math.min(1, dt * 7);
      if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 0.35) p.idx++;
    }
    this.people = this.people.filter((p) => p.alive || t - p.spawnAt < 0);
  }

  private keepClear(p: Person, wearer: Vec3, _moving: boolean): void {
    const min = 3.2;
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
