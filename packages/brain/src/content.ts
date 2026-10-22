import type { Band, Content, ContentRow, Entity, Reason, ReasonKind, ReasonPart, SayLine, SayTable, ScenarioId } from '@lumen/shared';

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

export function sayFor(e: Entity, scenario: ScenarioId): SayLine {
  let table: SayTable = e.say;
  for (const [flag, t] of Object.entries(e.sayLive ?? {})) {
    if (e.live[flag] === true) table = t;
  }
  return table[scenario] ?? table.default;
}

export function glanceContent(e: Entity, r: Reason, scenario: ScenarioId): Content {
  return { name: e.name, say: sayFor(e, scenario).line, reason: r, showReason: false, depthRef: e.depth ?? undefined };
}

export function cardContent(e: Entity, r: Reason, band: Band, scenario: ScenarioId): Content {
  const say = sayFor(e, scenario).line;
  const c: Content = {
    name: e.name,
    say,
    live: liveLine(e),
    reason: r,
    showReason: (band === 'stopped' || band === 'stroll') && !say.toLowerCase().includes(r.text.replace(/\.$/, '').toLowerCase()),
  };
  if (e.depth) c.depthRef = e.depth;
  return c;
}

export function expandedContent(e: Entity, r: Reason, scenario: ScenarioId, arrived: ReadonlySet<string>, chosen?: string): Content {
  const x = e.expanded;
  const settled = Object.entries(x?.liveAfter ?? {}).find(([flag]) => e.live[flag] === true);
  if (settled) return { name: e.name, say: sayFor(e, scenario).line, rows: [], reason: r, showReason: false, note: settled[1] };
  const rows: ContentRow[] = (x?.rows ?? [])
    .filter((row) => !row.when || arrived.has(row.when))
    .slice(0, 3)
    .map((row) => {
      const out: ContentRow = { title: row.title };
      if (row.key) out.key = row.key;
      if (row.sub) out.sub = row.sub;
      if (row.value) out.value = row.value;
      if (row.tone) out.tone = row.tone;
      if (row.now) out.tone = row.tone ?? 'voice';
      return out;
    });
  const c: Content = { name: e.name, say: sayFor(e, scenario).line, rows, reason: r, showReason: false };
  if (e.depth) c.depthRef = e.depth;
  if (chosen && x?.after?.[chosen]) c.note = x.after[chosen];
  else if (x?.actions?.length) c.actions = x.actions.map((a) => ({ ...a }));
  return c;
}

export function whisperContent(e: Entity, r: Reason, scenario: ScenarioId): Content {
  const s = sayFor(e, scenario).short.split(/ · |, /)[0]!;
  const fact = /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
  return { name: e.name, fact, reason: r, showReason: false };
}

export function pipContent(e: { name: string }, r: Reason): Content {
  return { name: e.name, reason: r, showReason: false };
}
