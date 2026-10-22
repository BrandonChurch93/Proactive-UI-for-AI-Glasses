import { Brain, type ConfigOverride } from '@lumen/brain';
import { synthesize } from '@lumen/shared';
import { listCases } from '../packages/evals/src/suite';

// Runs one focused eval case through a fresh brain and prints its decisions (all, or one place's with --id),
// with the gaze target and band each tick, to set or check an expectation window.
const name = process.argv[2];
const only = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : undefined;
const found = listCases().find((c) => c.spec.id === name);
if (!found) throw new Error(`usage: tsx scripts/case.ts <case id> [--id place] [--pips]`);
const brain = new Brain({ scenario: found.spec.scenario, ...(found.spec.config ? { config: found.spec.config as ConfigOverride } : {}) });
for (const snap of synthesize(found.spec)) {
  const f = brain.tick(snap);
  for (const d of f.events) {
    if (only && d.id !== only) continue;
    if (!process.argv.includes('--pips') && d.level === 'pip' && d.action === 'hold') continue;
    console.log(f.t.toFixed(2).padStart(6), f.band.padEnd(8), (snap.wearer.gaze.target ?? '-').padEnd(20), String(snap.wearer.gaze.dwellMs).padStart(5), d.action.padEnd(8), d.level.padEnd(8), d.id.padEnd(20), d.cause ?? '', d.content.fact ?? '');
  }
}
