import { Brain } from '@lumen/brain';
import { HeadlessView, Sim, TICK_HZ } from '@lumen/sim';
import { isScenarioId, nOf } from '@lumen/shared';

const s = process.argv[2] ?? 'walking';
if (!isScenarioId(s)) throw new Error('usage: tsx scripts/lap.ts hungry|walking [--s=300]');
const secs = Number(process.argv.find((a) => a.startsWith('--s='))?.slice(4) ?? 320);
const sim = new Sim(s);
const brain = new Brain();
const headless = new HeadlessView();
let view;
let last = '';
for (let i = 0; i <= secs * TICK_HZ; i++) {
  headless.advanceTo(sim, i / TICK_HZ);
  const snap = sim.snapshot(view);
  const f = brain.tick(snap);
  sim.plan(f.goal);
  headless.apply(f);
  view = headless.report(sim);
  const w = sim.wearer;
  const cw = snap.env.crosswalk;
  const key = `${w.state} ${f.band} lap${sim.lap} ${sim.route.target} ${f.goal.scenario}${f.goal.destination ? `>${f.goal.destination}` : ''}${snap.goal.arrived ? ' ARRIVED' : ''}${snap.goal.corner ? ' CORNER' : ''}`;
  if (key !== last) {
    console.log(`${snap.t.toFixed(1).padStart(6)}  ${key.padEnd(60)} x=${w.pos.x.toFixed(1)} n=${nOf(w.pos.z).toFixed(1)} ${cw ? `${cw.id} ${cw.signal} d=${cw.distance.toFixed(1)} toWalk=${cw.toWalk}` : ''}`);
    last = key;
  }
}
console.log('reroutes', JSON.stringify(sim.reroutes));
