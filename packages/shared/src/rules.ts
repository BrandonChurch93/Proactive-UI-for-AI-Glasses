import type { Band } from './data';

export const BANDS: readonly Band[] = ['stopped', 'stroll', 'walk', 'brisk'];

export const BAND_INDEX: Record<Band, number> = { stopped: 0, stroll: 1, walk: 2, brisk: 3 };

export const FOCUS_ZONE: Record<Band, { w: number; h: number }> = {
  stopped: { w: 0.33, h: 0.4 },
  stroll: { w: 0.38, h: 0.44 },
  walk: { w: 0.44, h: 0.5 },
  brisk: { w: 0.52, h: 0.58 },
};

export function focusRect(band: Band, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const z = FOCUS_ZONE[band];
  return { x: w * (0.5 - z.w / 2), y: h * (0.5 - z.h / 2), w: w * z.w, h: h * z.h };
}

export const CARD_DWELL_S: Record<Band, number | null> = { stopped: 0.8, stroll: 1.0, walk: 1.6, brisk: null };
