import { LEVEL_RANK, type Band, type Level } from '@lumen/shared';
import type { Config } from './config';
import { scoreChangeAllowed } from './timing';

export type PaneLevel = 'none' | 'pip' | 'glance' | 'card' | 'expanded';

export interface LadderItem {
  id: string;
  level: PaneLevel;
  since: number;
  shownAt: number;
  dwelt: boolean;
  lastGazeAt: number;
  stepAt: number;
  cardAt: number;
  gazeSince: number | null;
  aboveSince: number | null;
  whispered: boolean;
  wasTarget: boolean;
  lastT: number;
  hiddenS: number;
  hiddenLogged: boolean;
}

export function newLadderItem(id: string): LadderItem {
  return {
    id,
    level: 'none',
    since: 0,
    shownAt: 0,
    dwelt: false,
    lastGazeAt: -Infinity,
    stepAt: -Infinity,
    cardAt: -Infinity,
    gazeSince: null,
    aboveSince: null,
    whispered: false,
    wasTarget: false,
    lastT: -Infinity,
    hiddenS: 0,
    hiddenLogged: false,
  };
}

const ORDER: PaneLevel[] = ['none', 'pip', 'glance', 'card', 'expanded'];

export const up = (l: PaneLevel): PaneLevel => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(l) + 1)]!;
export const down = (l: PaneLevel): PaneLevel => ORDER[Math.max(0, ORDER.indexOf(l) - 1)]!;
export const rank = (l: PaneLevel): number => ORDER.indexOf(l);
export const maxLevel = (a: PaneLevel, b: PaneLevel): PaneLevel => (rank(a) >= rank(b) ? a : b);
export const isPane = (l: PaneLevel | Level): boolean => LEVEL_RANK[l] >= LEVEL_RANK.glance;

export function bandCap(band: Band): PaneLevel {
  if (band === 'brisk') return 'pip';
  if (band === 'walk') return 'card';
  return 'expanded';
}

export interface LadderInput {
  t: number;
  band: Band;
  target: boolean;
  dwellS: number;
  pinch: boolean;
  floor: 'none' | 'pip';
  proactive: boolean;
  scoreAbove: boolean;
  canProactive: boolean;
  visible?: boolean;
  far?: boolean;
}

export interface LadderOut {
  level: PaneLevel;
  via: 'dwell' | 'pinch' | 'score' | 'look-away' | 'auto-fold' | 'band' | 'hold' | 'hidden';
  gaze: boolean;
}

export function earnedByDwell(dwellS: number, band: Band, cfg: Config): PaneLevel {
  const gl = cfg.ladder.glanceDwellS;
  if (dwellS < cfg.ladder.pipDwellS - 1e-9) return 'none';
  if (dwellS < gl - 1e-9) return 'pip';
  const cd = cfg.ladder.cardDwellS[band];
  if (cd !== null && dwellS >= gl + cd - 1e-9) return 'card';
  return 'glance';
}

export function step(it: LadderItem, inp: LadderInput, cfg: Config): LadderOut {
  const { t, band } = inp;
  const visible = inp.visible !== false;
  const held = t - it.since < cfg.ladder.minShownS - 1e-9;
  if (inp.target && !visible) return { level: maxLevel(it.level, 'pip'), via: 'hidden', gaze: true };
  if (inp.target) {
    let earned = earnedByDwell(inp.dwellS, band, cfg);
    if (
      it.level === 'card' &&
      (band === 'stopped' || band === 'stroll') &&
      it.gazeSince !== null &&
      it.gazeSince <= it.cardAt + 1e-9 &&
      t - it.cardAt >= cfg.ladder.expandDwellS - 1e-9
    ) {
      earned = 'expanded';
    }
    let via: LadderOut['via'] = 'dwell';
    if (inp.pinch && band !== 'walk' && band !== 'brisk') {
      const next = up(maxLevel(it.level, 'pip'));
      if (rank(next) > rank(earned)) {
        earned = next;
        via = 'pinch';
      }
    }
    if (inp.far && rank(earned) > rank('glance')) earned = 'glance';
    const lit: PaneLevel = inp.dwellS >= cfg.ladder.pipDwellS - 1e-9 ? 'pip' : inp.floor;
    let level = maxLevel(it.level, maxLevel(earned, lit));
    if (rank(level) > rank(bandCap(band))) level = bandCap(band);
    return { level, via: rank(level) > rank(it.level) ? via : rank(level) < rank(it.level) ? 'band' : 'hold', gaze: true };
  }

  if (isPane(it.level)) {
    if (it.dwelt) {
      if (t - Math.max(it.lastGazeAt, it.stepAt) >= cfg.ladder.lookAwayS - 1e-9) {
        const next = down(it.level);
        return { level: next === 'none' ? inp.floor : next, via: 'look-away', gaze: false };
      }
    } else {
      const limit = cfg.autoFoldS[band];
      if (limit !== null && !held && t - it.shownAt >= limit - 1e-9) return { level: inp.floor, via: 'auto-fold', gaze: false };
      if (!inp.scoreAbove && !held && scoreChangeAllowed(it.since, t, cfg)) return { level: inp.floor, via: 'score', gaze: false };
    }
    const cap = it.dwelt ? bandCap(band) : band === 'walk' ? 'glance' : bandCap(band);
    if (rank(it.level) > rank(cap) && (band === 'brisk' || !held)) return { level: cap === 'pip' ? inp.floor : cap, via: 'band', gaze: false };
    return { level: it.level, via: 'hold', gaze: false };
  }

  if (it.level === 'pip' && it.dwelt && t - it.lastGazeAt < cfg.ladder.lookAwayS) {
    return { level: 'pip', via: 'hold', gaze: false };
  }

  if (inp.proactive && inp.scoreAbove && inp.canProactive && band !== 'brisk' && visible) {
    const settled = it.level === 'none' || scoreChangeAllowed(it.since, t, cfg);
    if (settled && it.aboveSince !== null && t - it.aboveSince >= cfg.score.promotionHoldS - 1e-9) {
      return { level: 'glance', via: 'score', gaze: false };
    }
  }

  const want: PaneLevel = inp.floor;
  if (want !== it.level && it.level !== 'none' && want === 'none' && !scoreChangeAllowed(it.since, t, cfg)) {
    return { level: it.level, via: 'hold', gaze: false };
  }
  return { level: want, via: want === it.level ? 'hold' : 'score', gaze: false };
}
