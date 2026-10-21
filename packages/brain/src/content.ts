import type { Band, Content, ContentRow, Entity, Reason, ReasonKind, ReasonPart } from '@lumen/shared';

export function reason(kind: ReasonKind, text: string, parts: ReasonPart[] = []): Reason {
  if (text.length > 48) throw new Error(`reason over 48 characters: ${text}`);
  return { kind, text, parts };
}

export function liveLine(e: Entity): string {
  for (const [flag, line] of Object.entries(e.liveLines ?? {})) {
    if (e.live[flag] === true) return line;
  }
  return e.card.live;
}

export function glanceFact(e: Entity): string {
  for (const [flag, line] of Object.entries(e.liveLines ?? {})) {
    if (e.live[flag] === true) return line;
  }
  return e.glance;
}

export function entityReason(e: Entity, goal: boolean, parts: ReasonPart[]): Reason {
  if (e.translate) return reason('world', e.reasons.world ?? 'Read from Italian', parts);
  if (e.live.closedEarly === true) return reason('world', 'Closed early today', parts);
  if (e.kind === 'transit' && e.live.busAtStop === true) return reason('world', 'Bus at the stop', parts);
  if (goal && e.reasons.goal) return reason('goal', e.reasons.goal, parts);
  return reason('world', e.reasons.world ?? e.reasons.goal ?? 'On your route', parts);
}

export function hintFor(band: Band): string {
  return band === 'walk' ? 'PINCH · SAVES FOR LATER' : 'KEEP LOOKING · MORE';
}

export function glanceContent(e: Entity, r: Reason): Content {
  return { name: e.name, fact: glanceFact(e), reason: r, depthRef: e.depth ?? undefined };
}

export function cardContent(e: Entity, r: Reason, band: Band): Content {
  const c: Content = {
    name: e.name,
    meta: e.card.meta,
    live: liveLine(e),
    reason: r,
    hint: hintFor(band),
    showReason: band !== 'walk',
  };
  if (e.card.year) c.year = e.card.year;
  if (e.depth) c.depthRef = e.depth;
  return c;
}

export function expandedContent(e: Entity, r: Reason, chosen?: string): Content {
  const x = e.expanded;
  const rows: ContentRow[] = (x?.rows ?? []).map((row) => {
    const out: ContentRow = { title: row.title };
    if (row.key) out.key = row.key;
    if (row.sub) out.sub = row.sub;
    if (row.value) out.value = row.value;
    if (row.tone) out.tone = row.tone;
    if (row.now) out.tone = row.tone ?? 'voice';
    return out;
  });
  const c: Content = {
    name: e.name,
    sub: x?.sub ?? e.card.meta,
    rows,
    reason: r,
    showReason: true,
  };
  if (x?.yearLabel) c.year = x.yearLabel;
  if (e.depth) c.depthRef = e.depth;
  if (chosen && x?.after?.[chosen]) {
    c.note = x.after[chosen];
  } else {
    if (x?.actions?.length) c.actions = x.actions.map((a) => ({ ...a }));
    if (x?.note) c.note = x.note;
  }
  return c;
}

export function whisperContent(e: Entity, r: Reason): Content {
  const s = e.short;
  const fact = /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
  return { name: e.name, fact, reason: r, showReason: false };
}

export function pipContent(e: { name: string }, r: Reason): Content {
  return { name: e.name, reason: r, showReason: false };
}
