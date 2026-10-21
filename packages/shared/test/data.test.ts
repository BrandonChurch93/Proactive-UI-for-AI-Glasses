import { describe, expect, it } from 'vitest';
import { PLACE_BY_ID, SCENARIOS, SCENARIO_IDS } from '../src';

describe('data', () => {
  it('every scripted beat refers to a place, an inbox item or a pocket entry that exists', () => {
    for (const id of SCENARIO_IDS) {
      const s = SCENARIOS[id];
      const inbox = new Set(s.beats.flatMap((b) => (b.kind === 'inbox' && b.id ? [b.id] : [])));
      for (const b of s.beats) {
        const ref =
          b.kind === 'gaze' || b.kind === 'pinch' || b.kind === 'arrive' || b.kind === 'live' || b.kind === 'choice'
            ? b.id
            : undefined;
        if (!ref) continue;
        const bare = ref.replace(/^pocket:/, '');
        expect(PLACE_BY_ID.has(bare) || inbox.has(bare), `${id} t=${b.t} ${b.kind} ${ref}`).toBe(true);
      }
      expect(PLACE_BY_ID.has(s.destination)).toBe(true);
    }
  });
});
