import type { Band, Entity, Reason, ScenarioId } from '@lumen/shared';
import type { Config } from './config';
import { entityReason } from './content';
import { score, scoreParts, type Scored } from './score';

export interface Candidate {
  entity: Entity;
  scored: Scored;
  reason: Reason;
  contentKey: string;
}

export interface CandidateContext {
  goal: ScenarioId;
  openStops: readonly string[];
  allStops: readonly string[];
  destination?: string;
  target?: string;
  band: Band;
  cardOpenElsewhere: (id: string) => boolean;
  dismissed: Readonly<Record<string, number>>;
  accepted: Readonly<Record<string, number>>;
  presented: ReadonlyMap<string, string>;
}

export function contentKeyOf(e: Entity): string {
  return `${e.id}|${JSON.stringify(e.live)}`;
}

export function candidates(entities: readonly Entity[], ctx: CandidateContext, cfg: Config): Candidate[] {
  const out: Candidate[] = [];
  for (const e of entities) {
    if (e.distance > cfg.range) continue;
    const contentKey = contentKeyOf(e);
    const listed = ctx.goal === 'errands' && ctx.allStops.includes(e.id);
    const scored = score(
      e,
      {
        goal: ctx.goal,
        stops: ctx.goal === 'errands' ? ctx.openStops : [],
        ...(ctx.destination ? { destination: ctx.destination } : {}),
        gaze: ctx.target === e.id,
        band: ctx.band,
        cardOpen: ctx.cardOpenElsewhere(e.id),
        dismissed: ctx.dismissed[e.kind] ?? 0,
        accepted: ctx.accepted[e.kind] ?? 0,
        presented: ctx.presented.get(e.id) === contentKey || listed,
      },
      cfg,
    );
    out.push({ entity: e, scored, reason: entityReason(e, scored.goal, scoreParts(scored)), contentKey });
  }
  return out;
}
