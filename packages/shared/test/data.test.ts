import { describe, expect, it } from 'vitest';
import { PLACE_BY_ID, SCENARIO_IDS, WALK, type Beat } from '../src';

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
