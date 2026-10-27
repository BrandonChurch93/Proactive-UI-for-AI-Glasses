import { LEVEL_RANK, type Band, type Level } from '@lumen/shared';
import type { Config } from './config';
import { scoreChangeAllowed } from './timing';

export type PaneLevel = 'none' | 'pip' | 'label' | 'glance' | 'card' | 'expanded';

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
  paused: { held: number; at: number } | null;
  aboveSince: number | null;
  whispered: boolean;
  wasTarget: boolean;
  lastT: number;
  hiddenS: number;
  hiddenLogged: boolean;
  byLabels: boolean;
  far: boolean;
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
    paused: null,
    aboveSince: null,
    whispered: false,
    wasTarget: false,
    lastT: -Infinity,
    hiddenS: 0,
    hiddenLogged: false,
    byLabels: false,
    far: false,
  };
}

const ORDER: PaneLevel[] = ['none', 'pip', 'label', 'card', 'expanded'];
const RANK: Record<PaneLevel, number> = { none: 0, pip: 1, label: 2, glance: 2, card: 3, expanded: 4 };

export const up = (l: PaneLevel): PaneLevel => ORDER[Math.min(ORDER.length - 1, RANK[l] + 1)]!;
export const down = (l: PaneLevel): PaneLevel => ORDER[Math.max(0, RANK[l] - 1)]!;
export const rank = (l: PaneLevel): number => RANK[l];
export const maxLevel = (a: PaneLevel, b: PaneLevel): PaneLevel => (rank(a) >= rank(b) ? a : b);
export const isPane = (l: PaneLevel | Level): boolean => LEVEL_RANK[l] >= LEVEL_RANK.label;

export function bandCap(band: Band): PaneLevel {
  if (band === 'brisk') return 'label';
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
  labelled: boolean;
  proactive: boolean;
  scoreAbove: boolean;
  canProactive: boolean;
  visible?: boolean;
  far?: boolean;
  cardWait?: boolean;
  growS?: number;
  still?: boolean;
}

export interface LadderOut {
  level: PaneLevel;
  via: 'dwell' | 'pinch' | 'score' | 'settle' | 'look-away' | 'auto-fold' | 'band' | 'hold' | 'hidden';
  gaze: boolean;
}

export function earnedByDwell(it: LadderItem, inp: LadderInput, cfg: Config): PaneLevel {
  if (inp.dwellS < cfg.ladder.pipDwellS - 1e-9) return 'none';
  if (inp.band === 'brisk' || inp.still || rank(it.level) < rank('label')) return 'label';
  const held = inp.t - Math.max(it.since, it.gazeSince ?? inp.t) - it.hiddenS;
  return held >= (inp.growS ?? cfg.ladder.growS) - 1e-9 ? 'card' : 'label';
}

export function step(it: LadderItem, inp: LadderInput, cfg: Config): LadderOut {
  const { t, band } = inp;
  const visible = inp.visible !== false;
  const held = t - it.since < cfg.ladder.minShownS - 1e-9;
  if (inp.target && !visible) return { level: maxLevel(it.level, 'pip'), via: 'hidden', gaze: true };
  if (inp.target) {
    let earned = earnedByDwell(it, inp, cfg);
    if (
      it.level === 'card' &&
      !inp.far &&
      (band === 'stopped' || band === 'stroll') &&
      it.gazeSince !== null &&
      it.gazeSince <= it.cardAt + 1e-9 &&
      t - it.cardAt >= cfg.ladder.cardHoldS - 1e-9
    ) {
      earned = 'expanded';
    }
    let via: LadderOut['via'] = 'dwell';
    if (inp.pinch && (band === 'stopped' || band === 'stroll')) {
      const next = up(maxLevel(it.level, 'label'));
      if (rank(next) > rank(earned) && !(inp.far && next === 'expanded')) {
        earned = next;
        via = 'pinch';
      }
    }
    if (inp.cardWait && rank(earned) > rank('label') && rank(it.level) < rank('card')) earned = 'label';
    if (inp.far && rank(earned) > rank('card')) earned = 'card';
    let level = maxLevel(it.level, earned);
    const cap = bandCap(band);
    if (rank(level) > rank(cap)) level = cap;
    if (level === 'none' && inp.labelled) level = 'label';
    if (level === 'none') level = inp.floor;
    return { level, via: rank(level) > rank(it.level) ? via : rank(level) < rank(it.level) ? 'band' : 'hold', gaze: true };
  }

  if (rank(it.level) > rank('label')) {
    if (t - Math.max(it.lastGazeAt, it.stepAt) >= cfg.ladder.lookAwayS - 1e-9) return { level: 'label', via: 'look-away', gaze: false };
    const cap = bandCap(band);
    if (rank(it.level) > rank(cap) && (band === 'brisk' || !held)) return { level: cap, via: 'band', gaze: false };
    return { level: it.level, via: 'hold', gaze: false };
  }

  if (isPane(it.level)) {
    if (inp.labelled) return { level: it.level, via: 'hold', gaze: false };
    if (it.dwelt || it.byLabels) return { level: inp.floor, via: 'settle', gaze: false };
    const limit = cfg.autoFoldS[band];
    if (limit !== null && !held && t - it.shownAt >= limit - 1e-9) return { level: inp.floor, via: 'auto-fold', gaze: false };
    if (!inp.scoreAbove && !held && scoreChangeAllowed(it.since, t, cfg)) return { level: inp.floor, via: 'score', gaze: false };
    return { level: it.level, via: 'hold', gaze: false };
  }

  if (inp.labelled && visible) return { level: 'label', via: 'settle', gaze: false };

  if (inp.proactive && inp.scoreAbove && inp.canProactive && band !== 'brisk' && visible) {
    const settled = it.level === 'none' || scoreChangeAllowed(it.since, t, cfg);
    if (settled && it.aboveSince !== null && t - it.aboveSince >= cfg.score.promotionHoldS - 1e-9) {
      return { level: 'label', via: 'score', gaze: false };
    }
  }

  const want: PaneLevel = inp.floor;
  const relight = it.level === 'none' && want === 'pip' && it.since > 0;
  if (want !== it.level && (want === 'none' || relight) && !scoreChangeAllowed(it.since, t, cfg)) {
    return { level: it.level, via: 'hold', gaze: false };
  }
  return { level: want, via: want === it.level ? 'hold' : 'score', gaze: false };
}
