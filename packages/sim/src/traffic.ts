import { boxAround, v3, vehicleLight, zOf, type Box3, type SignalAnchor, type Vec3, type VehicleKind } from '@lumen/shared';
import { Rng } from './random';

export type BodyKind = 'sedan' | 'taxi' | 'suv' | 'van' | 'bus' | 'truck' | 'bike';

export interface Lane {
  id: string;
  road: 'avenue' | 'cross';
  origin: Vec3;
  dir: Vec3;
  length: number;
  stopS: number;
  conflictEndS: number;
  spawnRate: number;
}

export interface Vehicle {
  id: string;
  body: BodyKind;
  kind: VehicleKind;
  lane: string;
  s: number;
  v: number;
  v0: number;
  len: number;
  width: number;
  height: number;
  color: string;
  committed: boolean;
  dwell?: { at: number; until: number; s: number };
  crawl?: { from: number; to: number; speed: number; after: number };
  ignoresSignal?: boolean;
  lateral: number;
  wheel: number;
}

const L = (id: string, road: 'avenue' | 'cross', origin: Vec3, dir: Vec3, length: number, stopS: number, conflictEndS: number, spawnRate: number): Lane => ({
  id,
  road,
  origin,
  dir,
  length,
  stopS,
  conflictEndS,
  spawnRate,
});

export const LANES: Lane[] = [
  L('nb-in', 'avenue', v3(1.75, 0, zOf(-180)), v3(0, 0, -1), 760, 180 + 84.6, 180 + 108.6, 1 / 7.5),
  L('nb-out', 'avenue', v3(5.25, 0, zOf(-180)), v3(0, 0, -1), 760, 180 + 84.6, 180 + 108.6, 1 / 11),
  L('sb-in', 'avenue', v3(-1.75, 0, zOf(580)), v3(0, 0, 1), 780, 580 - 108.8, 580 - 84.4, 1 / 6.5),
  L('eb-out', 'cross', v3(-240, 0, zOf(91.75)), v3(1, 0, 0), 480, 240 - 12.4, 240 + 12.6, 1 / 14),
  L('eb-in', 'cross', v3(-240, 0, zOf(95.25)), v3(1, 0, 0), 480, 240 - 12.4, 240 + 12.6, 1 / 10),
  L('wb-in', 'cross', v3(240, 0, zOf(98.75)), v3(-1, 0, 0), 480, 240 - 12.4, 240 + 12.6, 1 / 11),
  L('wb-out', 'cross', v3(240, 0, zOf(102.25)), v3(-1, 0, 0), 480, 240 - 12.4, 240 + 12.6, 1 / 15),
];

export const LANE_BY_ID = new Map(LANES.map((l) => [l.id, l]));

const PAINT = ['#17181a', '#d8d8d2', '#8e949a', '#1f2c45', '#6e1d1d', '#2f3b31', '#b9b4a8', '#3a4455', '#5b6066', '#e8e6df'];
const DIMS: Record<BodyKind, { len: number; width: number; height: number; v0: [number, number] }> = {
  sedan: { len: 4.75, width: 1.84, height: 1.45, v0: [9.5, 12] },
  taxi: { len: 4.85, width: 1.86, height: 1.5, v0: [10, 12.5] },
  suv: { len: 4.9, width: 1.95, height: 1.75, v0: [9, 11.5] },
  van: { len: 5.4, width: 2.0, height: 2.3, v0: [8.5, 10.5] },
  bus: { len: 12.2, width: 2.55, height: 3.2, v0: [8, 9] },
  truck: { len: 7.6, width: 3.9, height: 4.15, v0: [7.5, 9] },
  bike: { len: 1.8, width: 0.6, height: 1.7, v0: [5, 6] },
};

export interface ScriptedVehicle {
  id: string;
  body: BodyKind;
  lane: string;
  spawnAt: number;
  spawnS: number;
  crawl?: { from: number; to: number; speed: number; after: number };
  dwell?: { at: number; until: number; s: number };
  lateral?: number;
  ignoresSignal?: boolean;
  v0?: number;
}

export class Traffic {
  vehicles: Vehicle[] = [];
  private rngs = new Map<string, Rng>();
  private nextSpawn = new Map<string, number>();
  private seq = 0;
  private scripted: ScriptedVehicle[];

  constructor(
    seed: number,
    private readonly signal: SignalAnchor,
    scripted: ScriptedVehicle[],
    start: number,
  ) {
    this.scripted = [...scripted].sort((a, b) => a.spawnAt - b.spawnAt);
    for (const [i, lane] of LANES.entries()) {
      const rng = new Rng(seed * 31 + i * 977 + 7);
      this.rngs.set(lane.id, rng);
      this.nextSpawn.set(lane.id, start + rng.range(0, 3));
    }
  }

  private make(lane: Lane, body: BodyKind, s: number, rng: Rng | null, id?: string): Vehicle {
    const d = DIMS[body];
    const v0 = rng ? rng.range(d.v0[0], d.v0[1]) : (d.v0[0] + d.v0[1]) / 2;
    return {
      id: id ?? `v${this.seq++}`,
      body,
      kind: body === 'bus' ? 'bus' : body === 'truck' ? 'truck' : body === 'bike' ? 'bike' : 'car',
      lane: lane.id,
      s,
      v: v0 * 0.8,
      v0,
      len: d.len,
      width: d.width,
      height: d.height,
      color: body === 'taxi' ? '#e8ad1c' : body === 'bus' ? '#2a5d9c' : body === 'truck' ? '#d4d0c6' : rng ? rng.pick(PAINT) : '#888',
      committed: false,
      lateral: 0,
      wheel: 0,
    };
  }

  private spawn(t: number): void {
    for (const lane of LANES) {
      let at = this.nextSpawn.get(lane.id)!;
      const rng = this.rngs.get(lane.id)!;
      while (at <= t) {
        const last = this.vehicles.filter((v) => v.lane === lane.id).sort((a, b) => a.s - b.s)[0];
        if (!last || last.s - last.len > 14) {
          const roll = rng.next();
          const body: BodyKind = lane.road === 'avenue' ? (roll < 0.34 ? 'taxi' : roll < 0.62 ? 'sedan' : roll < 0.86 ? 'suv' : 'van') : roll < 0.2 ? 'taxi' : roll < 0.6 ? 'sedan' : roll < 0.85 ? 'suv' : 'van';
          this.vehicles.push(this.make(lane, body, 0, rng));
        }
        at += Math.max(2.4, -Math.log(1 - rng.next()) / lane.spawnRate);
      }
      this.nextSpawn.set(lane.id, at);
    }
    while (this.scripted.length && this.scripted[0]!.spawnAt <= t) {
      const sv = this.scripted.shift()!;
      const lane = LANE_BY_ID.get(sv.lane)!;
      const v = this.make(lane, sv.body, sv.spawnS, null, sv.id);
      if (sv.crawl) v.crawl = sv.crawl;
      if (sv.dwell) v.dwell = sv.dwell;
      if (sv.lateral !== undefined) v.lateral = sv.lateral;
      if (sv.ignoresSignal) v.ignoresSignal = true;
      if (sv.v0 !== undefined) v.v0 = sv.v0;
      v.v = sv.crawl ? sv.crawl.speed : v.v0;
      this.vehicles = this.vehicles.filter((o) => !(o.lane === v.lane && Math.abs(o.s - v.s) < 12));
      this.vehicles.push(v);
    }
  }

  step(t: number, dt: number): void {
    this.spawn(t);
    const byLane = new Map<string, Vehicle[]>();
    for (const v of this.vehicles) {
      const list = byLane.get(v.lane) ?? [];
      list.push(v);
      byLane.set(v.lane, list);
    }
    for (const [laneId, list] of byLane) {
      const lane = LANE_BY_ID.get(laneId)!;
      list.sort((a, b) => b.s - a.s);
      const light = vehicleLight(this.signal, lane.road, t);
      for (let i = 0; i < list.length; i++) {
        const v = list[i]!;
        const lead = list[i - 1];
        let v0 = v.v0;
        if (v.crawl && t >= v.crawl.after) {
          const n = this.nOf(lane, v.s);
          if (n < v.crawl.to) v0 = v.crawl.speed;
        } else if (v.crawl && t < v.crawl.after) {
          v0 = 0;
        }
        let gap = Infinity;
        let dv = 0;
        if (lead) {
          gap = lead.s - lead.len - v.s;
          dv = v.v - lead.v;
        }
        const front = v.s;
        if (!v.ignoresSignal && front < lane.stopS + 0.5) {
          const toStop = lane.stopS - front;
          const canStop = toStop > (v.v * v.v) / (2 * 3.2) || light === 'red';
          if (light !== 'green' && canStop && !v.committed) {
            if (toStop < gap) {
              gap = Math.max(0.05, toStop);
              dv = v.v;
            }
          }
        }
        if (front >= lane.stopS) v.committed = true;
        if (v.dwell && t < v.dwell.until) {
          const toDwell = v.dwell.s - front;
          if (toDwell > -0.5 && toDwell < gap) {
            gap = Math.max(0.05, toDwell);
            dv = v.v;
          }
        }
        const a = idm(v.v, v0, gap, dv);
        v.v = Math.max(0, v.v + a * dt);
        if (lead) {
          const maxS = lead.s - lead.len - 1.6;
          const next = v.s + v.v * dt;
          if (next > maxS) {
            v.s = Math.max(v.s, maxS);
            v.v = Math.min(v.v, lead.v);
          } else v.s = next;
        } else v.s += v.v * dt;
        v.wheel += (v.v * dt) / 0.34;
      }
    }
    this.vehicles = this.vehicles.filter((v) => v.s < (LANE_BY_ID.get(v.lane)?.length ?? 0));
  }

  private nOf(lane: Lane, s: number): number {
    return -(lane.origin.z + lane.dir.z * s);
  }

  pose(v: Vehicle): { pos: Vec3; dir: Vec3; heading: number } {
    const lane = LANE_BY_ID.get(v.lane)!;
    const center = v.s - v.len / 2;
    const right = v3(-lane.dir.z, 0, lane.dir.x);
    const pos = v3(
      lane.origin.x + lane.dir.x * center + right.x * v.lateral,
      0,
      lane.origin.z + lane.dir.z * center + right.z * v.lateral,
    );
    return { pos, dir: lane.dir, heading: Math.atan2(-lane.dir.x, -lane.dir.z) };
  }

  bounds(v: Vehicle): Box3 {
    const { pos, dir } = this.pose(v);
    const along = Math.abs(dir.x) > 0.5;
    const hx = along ? v.len / 2 : v.width / 2;
    const hz = along ? v.width / 2 : v.len / 2;
    return boxAround(v3(pos.x, v.height / 2, pos.z), v3(hx, v.height / 2, hz));
  }
}

function idm(v: number, v0: number, gap: number, dv: number): number {
  const aMax = 1.7;
  const b = 2.4;
  const T = 1.25;
  const s0 = 2.2;
  if (v0 <= 0.01) return v > 0 ? -b * 2 : 0;
  const free = 1 - Math.pow(v / v0, 4);
  if (!Number.isFinite(gap)) return aMax * free;
  const sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(aMax * b)));
  return Math.max(-9, aMax * (free - Math.pow(sStar / Math.max(0.1, gap), 2)));
}
