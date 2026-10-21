import type { Band } from '@lumen/shared';

export interface Config {
  quietStartS: number;
  band: { stroll: number; walk: number; brisk: number; hysteresisS: number };
  range: number;
  score: {
    goalRelevance: number;
    partialRelevance: Record<string, Record<string, number>>;
    gazeRelevance: number;
    otherRelevance: number;
    pipCost: number;
    baseCost: number;
    perBandCost: number;
    openCardCost: number;
    glanceThreshold: number;
    promotionHoldS: number;
    dismissFactor: number;
    acceptFactor: number;
  };
  ladder: {
    glanceDwellS: number;
    cardDwellS: Record<Band, number | null>;
    expandDwellS: number;
    lookAwayS: number;
    maxGlances: number;
  };
  hysteresisS: number;
  autoFoldS: Record<Band, number | null>;
  viewFoldS: number;
  stoppedToastS: number;
  reading: { wordMs: number; numberMs: number; glanceWords: number; glanceNumbers: number; comfortAngle: number };
  pocket: { savedMs: number; stoppedForS: number; minSeconds: number; defaultSeconds: number };
  budget: { shows: number; refillS: number };
  safety: { vehicleTimeToPath: number; curbScanM: number };
  snooze: { pitch: number; holdS: number; seconds: number };
  whisper: { seconds: number };
  followupS: number;
  needToRun: { briskWithinS: number; curbM: number; seconds: number };
  ask: { foodGlances: number };
  arrival: { distanceM: number };
}

export const DEFAULT_CONFIG: Config = {
  quietStartS: 0.8,
  band: { stroll: 0.2, walk: 0.9, brisk: 1.6, hysteresisS: 0.6 },
  range: 120,
  score: {
    goalRelevance: 1,
    partialRelevance: { hungry: { cafe: 0.6 } },
    gazeRelevance: 0.35,
    otherRelevance: 0.1,
    pipCost: 0.25,
    baseCost: 0.25,
    perBandCost: 0.15,
    openCardCost: 0.3,
    glanceThreshold: 0.45,
    promotionHoldS: 0.4,
    dismissFactor: 0.5,
    acceptFactor: 1.2,
  },
  ladder: {
    glanceDwellS: 0.8,
    cardDwellS: { stopped: 0.8, stroll: 1.0, walk: 1.6, brisk: null },
    expandDwellS: 2.0,
    lookAwayS: 1.2,
    maxGlances: 3,
  },
  hysteresisS: 1.2,
  autoFoldS: { stopped: null, stroll: 4, walk: 2.5, brisk: 0 },
  viewFoldS: 4,
  stoppedToastS: 8,
  reading: { wordMs: 240, numberMs: 320, glanceWords: 3, glanceNumbers: 1, comfortAngle: 0.9 },
  pocket: { savedMs: 600, stoppedForS: 2, minSeconds: 6, defaultSeconds: 20 },
  budget: { shows: 7, refillS: 40 },
  safety: { vehicleTimeToPath: 3, curbScanM: 8 },
  snooze: { pitch: 0.35, holdS: 1, seconds: 60 },
  whisper: { seconds: 2.5 },
  followupS: 6,
  needToRun: { briskWithinS: 12, curbM: 4, seconds: 4 },
  ask: { foodGlances: 2 },
  arrival: { distanceM: 4 },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type ConfigOverride = DeepPartial<Config>;

export function withConfig(over?: ConfigOverride): Config {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(b)) {
      const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b)) out[k] = merge((a as Record<string, unknown>)[k], v);
      return out;
    }
    return b;
  };
  return merge(DEFAULT_CONFIG, over) as Config;
}
