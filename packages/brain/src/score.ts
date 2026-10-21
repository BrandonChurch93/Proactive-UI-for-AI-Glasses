import { BAND_INDEX, clamp, type Band, type Entity, type ReasonPart, type ScenarioId } from '@lumen/shared';
import type { Config } from './config';

export interface Scored {
  relevance: number;
  value: number;
  proximity: number;
  novelty: number;
  cost: number;
  score: number;
  pipScore: number;
  goal: boolean;
}

export interface ScoreInput {
  goal: ScenarioId;
  stops: readonly string[];
  destination?: string;
  gaze: boolean;
  band: Band;
  cardOpen: boolean;
  dismissed: number;
  accepted: number;
  presented: boolean;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export function isClosed(e: Entity): boolean {
  return e.live.closedEarly === true;
}

export function goalRelevance(e: Entity, inp: ScoreInput, cfg: Config): number {
  if (inp.destination === e.id) return cfg.score.goalRelevance;
  if (inp.goal === 'errands') {
    return inp.stops.includes(e.id) ? cfg.score.goalRelevance : 0;
  }
  if (inp.goal === 'hungry') {
    if (e.kind === 'food') return cfg.score.goalRelevance;
    return cfg.score.partialRelevance.hungry?.[e.kind] ?? 0;
  }
  return 0;
}

export function value(e: Entity, goal: ScenarioId, stops: readonly string[]): number {
  if (isClosed(e)) return 0;
  const wait = num(e.live.wait);
  switch (e.kind) {
    case 'food':
    case 'cafe': {
      if (wait === undefined) return 1;
      const seats = num(e.live.seats);
      return 1 + 0.6 * clamp((10 - wait) / 10, 0, 1) + (seats === undefined ? 0 : 0.3 * clamp(seats / 8, 0, 1));
    }
    case 'theater':
      return 1 + 0.5 * clamp((num(e.live.seatsLeft) ?? 0) / 40, 0, 1);
    case 'transit': {
      if (e.live.busAtStop === true) return 1.6;
      const next = num(e.live.next) ?? num(e.live.uptown);
      return next === undefined ? 1 : 1 + 0.6 * clamp((6 - next) / 6, 0, 1);
    }
    case 'service':
    case 'shop':
      if (goal === 'errands' && stops.includes(e.id)) return e.live.pickedUp === true ? 0 : 1.5;
      return 1;
    default:
      return 1;
  }
}

export function score(e: Entity, inp: ScoreInput, cfg: Config): Scored {
  const g = goalRelevance(e, inp, cfg);
  let relevance = g > 0 ? g : cfg.score.otherRelevance;
  if (e.kind === 'transit' && e.live.busAtStop === true) relevance = Math.max(relevance, cfg.score.gazeRelevance);
  if (inp.gaze) relevance = Math.max(relevance, cfg.score.gazeRelevance);
  const val = value(e, inp.goal, inp.stops);
  const proximity = clamp(1 - e.distance / cfg.range, 0, 1);
  const novelty =
    (inp.presented ? 0 : 1) * cfg.score.dismissFactor ** inp.dismissed * cfg.score.acceptFactor ** inp.accepted;
  const cost =
    cfg.score.baseCost + cfg.score.perBandCost * BAND_INDEX[inp.band] + (inp.cardOpen ? cfg.score.openCardCost : 0);
  const base = relevance * val * proximity;
  return {
    relevance,
    value: val,
    proximity,
    novelty,
    cost,
    score: base * novelty - cost,
    pipScore: base - cfg.score.pipCost,
    goal: g > 0,
  };
}

export function scoreParts(s: Scored): ReasonPart[] {
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return [
    { signal: 'relevance', value: r(s.relevance), weight: 1 },
    { signal: 'value', value: r(s.value), weight: 1 },
    { signal: 'proximity', value: r(s.proximity), weight: 1 },
    { signal: 'novelty', value: r(s.novelty), weight: 1 },
    { signal: 'cost', value: r(s.cost), weight: -1 },
  ];
}
