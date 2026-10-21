import { Brain } from '@lumen/brain';
import { Sim, TICK_HZ, headlessView } from '@lumen/sim';
import { isScenarioId, isShow } from '@lumen/shared';

const s = process.argv[2] ?? 'hungry';
if (!isScenarioId(s)) throw new Error('usage: tsx scripts/decisions.ts hungry|errands|walking [--pips]');
const pips = process.argv.includes('--pips');
const sim = new Sim(s);
const brain = new Brain({ scenario: s });
let view;
for (let i = 0; i <= 99 * TICK_HZ; i++) {
  sim.advanceTo(i / TICK_HZ);
  const snap = sim.snapshot(view);
  const f = brain.tick(snap);
  view = headlessView(f, sim);
  for (const d of f.events) {
    if (!pips && d.level === 'pip' && d.action !== 'save') continue;
    const c = d.content;
    console.log(
      [f.t.toFixed(1).padStart(5), isShow(d) ? '*' : ' ', d.action.padEnd(8), d.level.padEnd(8), d.component.padEnd(11), d.id.padEnd(22), (d.cause ?? '').padEnd(12), c.name, c.fact ?? c.live ?? '', d.reason.text].join(' '),
    );
  }
}
