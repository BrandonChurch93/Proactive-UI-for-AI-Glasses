import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Brain } from '@lumen/brain';
import { SCENARIO_IDS, compactSnapshot, isScenarioId, type ScenarioId, type WorldSnapshot } from '@lumen/shared';
import { Sim, TICK_HZ, headlessView } from '@lumen/sim';
import { ROOT, type WalkFile } from './suite';

export const WALK_SECONDS: Record<ScenarioId, number> = { hungry: 98, errands: 98, walking: 99 };

export function recordWalk(scenario: ScenarioId, seed = 47): WalkFile {
  const sim = new Sim(scenario, { seed });
  const brain = new Brain({ scenario });
  const snapshots: WorldSnapshot[] = [];
  let view: WorldSnapshot['view'];
  const ticks = Math.round(WALK_SECONDS[scenario] * TICK_HZ);
  for (let i = 0; i <= ticks; i++) {
    sim.advanceTo(i / TICK_HZ);
    const snap = sim.snapshot(view);
    const frame = brain.tick(snap);
    snap.wearerModel = frame.model;
    snapshots.push(snap);
    view = headlessView(frame, sim);
  }
  return { version: 1, scenario, seed, hz: TICK_HZ, snapshots };
}

const isMain = process.argv[1]?.endsWith('record.ts');
if (isMain) {
  const argv = process.argv.slice(2);
  const which = argv.includes('--scenario') ? argv[argv.indexOf('--scenario') + 1] : 'all';
  const list = which === 'all' ? SCENARIO_IDS : isScenarioId(which) ? [which] : [];
  if (list.length === 0) {
    console.error('usage: pnpm record --scenario hungry|errands|walking|all');
    process.exit(1);
  }
  for (const s of list) {
    const walk = recordWalk(s);
    const path = join(ROOT, 'scenarios', `${s}.walk.json`);
    writeFileSync(path, JSON.stringify({ ...walk, snapshots: walk.snapshots.map(compactSnapshot) }));
    console.log(`${path} · ${walk.snapshots.length} snapshots`);
  }
}
