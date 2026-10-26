import { describe, expect, it } from 'vitest';
import { SCENARIO_IDS, SOUTH_CROSSWALK, WALK } from '@lumen/shared';
import { Sim, LANE_BY_ID, START, routeLoop, routeTo } from '../src';

const LAP_END = 190;

function footprint(sim: Sim, id: string) {
  const v = sim.traffic.vehicles.find((x) => x.id === id)!;
  return sim.traffic.bounds(v);
}

describe.each(SCENARIO_IDS)('sim · %s', (scenario) => {
  const sim = new Sim(scenario);
  const log: { t: number; minPerson: number; overlap: string | null; stuck: string | null }[] = [];
  const starts: { t: number; leg: string; state: string }[] = [];
  const scripted = new Set(['passerby']);
  let held = 0;
  while (sim.t < LAP_END) {
    sim.advanceTo(Math.round((sim.t + 0.1) * 10) / 10);
    const c = sim.wearer.crossing;
    if (c && !starts.some((x) => x.t === c.at)) starts.push({ t: c.at, leg: c.leg, state: sim.wearer.state });
    if (sim.holding && sim.lap > 0) held += 0.1;
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
      if (lane.southS !== undefined && v.s > lane.southS + 0.6 && rear < lane.southS + SOUTH_CROSSWALK.half * 2 + 1) stuck = v.id;
    }
    log.push({ t: sim.t, minPerson, overlap, stuck });
  }

  it('no two vehicles ever overlap', () => {
    expect(log.find((l) => l.overlap)?.overlap ?? null).toBeNull();
  });

  it('no vehicle stops inside the intersection or the south crosswalk', () => {
    expect(log.find((l) => l.stuck)?.stuck ?? null).toBeNull();
  });

  it('nobody outside a scripted beat comes within 3 m of the camera', () => {
    const worst = Math.min(...log.map((l) => l.minPerson));
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('starts every crossing on a walk signal', () => {
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) expect(s.state, `t=${s.t} ${s.leg}`).toBe('crossing');
  });

  it('completes a lap and holds the light at the corner again', () => {
    expect(sim.lap).toBeGreaterThanOrEqual(1);
    expect(held).toBeGreaterThan(WALK.holdS - 1);
  });
});

describe('router', () => {
  it('reaches a west-side door from the start corner across the south crossing', () => {
    const r = routeTo(START, 'mega-burger');
    expect(r.stops.map((s) => s.leg)).toEqual(['south']);
  });

  it('reaches the Post Office across the cross street', () => {
    expect(routeTo(START, 'post-office').stops.map((s) => s.leg)).toEqual(['cross']);
  });

  it('the loop crosses the avenue at the north corner and again at the south', () => {
    expect(routeLoop(START).stops.map((s) => s.leg)).toEqual(['avenue', 'south']);
  });

  it('a new destination asked for in a crossing waits for the far curb', () => {
    const sim = new Sim('walking');
    while (sim.wearer.crossing?.leg !== 'avenue') sim.advanceTo(Math.round((sim.t + 0.1) * 10) / 10);
    const to = sim.wearer.crossing!.to;
    sim.plan({ destination: 'goldies-counter' });
    sim.advanceTo(sim.t + 1);
    expect(sim.wearer.crossing?.to).toBe(to);
    while (sim.wearer.crossing) sim.advanceTo(Math.round((sim.t + 0.1) * 10) / 10);
    sim.advanceTo(sim.t + 0.2);
    expect(sim.route.target).toBe('goldies-counter');
    expect(sim.wearer.pos.x).toBeLessThan(0);
  });
});
