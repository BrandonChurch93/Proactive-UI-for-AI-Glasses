import { PLACE_BY_ID } from './data';
import type { Entity, WorldSnapshot } from './types';
import { placeAnchor, placeDoor } from './world';

type CompactEntity = Pick<Entity, 'id' | 'distance' | 'routeS' | 'visible' | 'live'>;
export type CompactSnapshot = Omit<WorldSnapshot, 'entities'> & { entities: CompactEntity[] };

export function compactSnapshot(s: WorldSnapshot): CompactSnapshot {
  return {
    ...s,
    entities: s.entities.map((e) => ({ id: e.id, distance: e.distance, routeS: e.routeS, visible: e.visible, live: e.live })),
  };
}

export function hydrateSnapshot(c: CompactSnapshot): WorldSnapshot {
  return {
    ...c,
    entities: c.entities.map((ce) => {
      const p = PLACE_BY_ID.get(ce.id);
      if (!p) throw new Error(`hydrate: unknown place ${ce.id}`);
      const e: Entity = {
        ...ce,
        name: p.name,
        kind: p.kind,
        category: p.category,
        side: p.side,
        pos: placeAnchor(p),
        door: placeDoor(p),
        glance: p.glance,
        depth: p.depth,
        card: p.card,
        short: p.short,
        say: p.say,
        reasons: p.reasons,
        expanded: p.expanded,
      };
      if (p.year !== undefined) e.year = p.year;
      if (p.liveLines) e.liveLines = p.liveLines;
      if (p.sayLive) e.sayLive = p.sayLive;
      if (p.translate) e.translate = p.translate;
      return e;
    }),
  };
}
