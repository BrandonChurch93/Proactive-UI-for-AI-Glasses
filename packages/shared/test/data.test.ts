import { describe, expect, it } from 'vitest';
import { PLACE_BY_ID, SCENARIO_IDS, WALK, compactSnapshot, hydrateSnapshot, synthesize, type Beat } from '../src';

const PANES = new Set(['errands', 'picker', 'intent', 'offer']);

describe('data', () => {
  it('every scripted beat refers to a place, an inbox item or a pocket entry that exists', () => {
    const inbox = new Set(WALK.beats.flatMap((b) => (b.kind === 'inbox' && b.id ? [b.id] : [])));
    const check = (where: string, b: Beat): void => {
      const ref = b.kind === 'gaze' || b.kind === 'pinch' || b.kind === 'live' || b.kind === 'choice' || b.kind === 'choose' || b.kind === 'go' ? b.id : b.kind === 'reply' ? b.id : undefined;
      if (!ref || (b.kind === 'choice' && PANES.has(ref))) return;
      const bare = ref.replace(/^pocket:/, '');
      expect(PLACE_BY_ID.has(bare) || inbox.has(bare), `${where} t=${b.t} ${b.kind} ${ref}`).toBe(true);
    };
    for (const b of WALK.beats) check('walk', b);
    for (const id of SCENARIO_IDS) for (const b of WALK.recordings[id].beats) check(id, b);
  });
});

describe('recorded snapshots', () => {
  it('keep what the brain reads from a place: its walk time and its picker line', () => {
    const snap = synthesize({ id: 'c', scenario: 'hungry', duration: 0.1, pace: [[0, 0]], only: ['goldies-counter'] })[0]!;
    snap.entities[0]!.walkS = 12;
    const back = hydrateSnapshot(JSON.parse(JSON.stringify(compactSnapshot(snap))));
    expect(back.entities[0]!.walkS).toBe(12);
    expect(back.entities[0]!.picker).toBe(PLACE_BY_ID.get('goldies-counter')!.picker);
  });
});

