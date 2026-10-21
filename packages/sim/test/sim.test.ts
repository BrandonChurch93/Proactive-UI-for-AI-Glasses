import { describe, expect, it } from 'vitest';
import { SCENARIO_IDS, readSignal } from '@lumen/shared';
import { Sim, LANE_BY_ID } from '../src';

const WALK_END = { hungry: 98, errands: 98, walking: 99 } as const;

function footprint(sim: Sim, id: string) {
  const v = sim.traffic.vehicles.find((x) => x.id === id)!;
  return sim.traffic.bounds(v);
}

describe.each(SCENARIO_IDS)('sim · %s', (scenario) => {
  const sim = new Sim(scenario);
  const log: { t: number; minPerson: number; overlap: string | null; stuck: string | null; s: number; state: string }[] = [];
  const scripted = new Set(['passerby', 'conversation-a', 'conversation-b']);
  while (sim.t < WALK_END[scenario]) {
    sim.advanceTo(Math.round((sim.t + 0.1) * 10) / 10);
    let minPerson = Infinity;
    for (const p of sim.people.people) {
      if (!p.alive || scripted.has(p.id)) continue;
      minPerson = Math.min(minPerson, Math.hypot(p.pos.x - sim.wearer.pos.x, p.pos.z - sim.wearer.pos.z));
    }
    let overlap: string | null = null;
    const vs = sim.traffic.vehicles;
    for (let i = 0; i < vs.length && !overlap; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const a = footprint(sim, vs[i]!.id);
        const b = footprint(sim, vs[j]!.id);
        if (a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z) {
          overlap = `${vs[i]!.id}/${vs[j]!.id}`;
          break;
        }
      }
    }
    let stuck: string | null = null;
    for (const v of vs) {
      if (v.kind === 'bike' || v.v > 0.3) continue;
      const lane = LANE_BY_ID.get(v.lane)!;
      const rear = v.s - v.len;
      if (v.s > lane.stopS + 0.6 && rear < lane.stopS + 24) stuck = v.id;
    }
    log.push({ t: sim.t, minPerson, overlap, stuck, s: sim.wearer.s, state: sim.wearer.state });
  }

  it('no two vehicles ever overlap', () => {
    expect(log.find((l) => l.overlap)?.overlap ?? null).toBeNull();
  });

  it('no vehicle stops inside the intersection', () => {
    expect(log.find((l) => l.stuck)?.stuck ?? null).toBeNull();
  });

  it('nobody outside a scripted beat comes within 3 m of the camera', () => {
    const worst = Math.min(...log.map((l) => l.minPerson));
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('crosses only on a walk signal and ends at the destination', () => {
    const stop = sim.route.stops[0]!;
    for (const l of log.filter((x) => x.state === 'crossing')) {
      const sig = readSignal(sim.signal, stop.leg, l.t);
      expect(sig.state, `t=${l.t}`).not.toBe('dont');
    }
    expect(sim.wearer.arrived).toBe(true);
  });
});
