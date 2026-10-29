import type { Band, Content, ContentRow, DepthRow, Entity, Reason, ReasonKind, ReasonPart, SayLine, SayTable, ScenarioId } from '@lumen/shared';

const NONE: ReadonlySet<string> = new Set();

export interface Chosen {
  action: string;
  row?: string;
}

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
  if (e.kind === 'transit' && e.live.busAtStop === true) return reason('world', 'Bus at the stop', parts);
  if (goal && e.reasons.goal) return reason('goal', e.reasons.goal, parts);
  return reason('world', e.reasons.world ?? e.reasons.goal ?? 'On your route', parts);
}

// A line that names a plan (Maya meeting you here) speaks only once the wearer has said yes to it.
export function sayFor(e: Entity, scenario: ScenarioId, met: ReadonlySet<string> = NONE): SayLine {
  let table: SayTable = e.say;
  for (const [flag, t] of Object.entries(e.sayLive ?? {})) {
    if (e.live[flag] === true) table = t;
  }
  const line = table[scenario];
  return line && (!line.when || met.has(line.when)) ? line : table.default;
}

export function rowId(row: Pick<DepthRow, 'key' | 'title'>): string {
  return row.key ?? row.title;
}

// The row the primary action reads for when nothing is lifted: the one marked now, else the first that is a choice.
export function defaultRow(e: Entity): DepthRow | undefined {
  const rows = e.expanded?.rows ?? [];
  return rows.find((r) => r.now && r.act) ?? rows.find((r) => r.act);
}

export function resolveChoice(e: Entity, action: string, row?: string): { row?: DepthRow; after?: string; pocket?: string } {
  const x = e.expanded;
  const choices = (x?.rows ?? []).filter((r) => r.act);
  if (choices.length) {
    const picked = choices.find((r) => rowId(r).toLowerCase() === row?.toLowerCase()) ?? defaultRow(e)!;
    return { row: picked, ...(picked.after ? { after: picked.after } : {}), ...(picked.pocket ? { pocket: picked.pocket } : {}) };
  }
  const after = x?.after?.[action];
  const pocket = x?.pocket?.[action];
  return { ...(after ? { after } : {}), ...(pocket ? { pocket } : {}) };
}

export function labelContent(e: Entity, r: Reason, scenario: ScenarioId, met: ReadonlySet<string> = NONE): Content {
  const c: Content = { name: e.name, fact: sayFor(e, scenario, met).short, reason: r, showReason: false };
  if (e.depth) c.depthRef = e.depth;
  return c;
}

export function cardContent(e: Entity, r: Reason, band: Band, scenario: ScenarioId, compact = false, met: ReadonlySet<string> = NONE): Content {
  const line = sayFor(e, scenario, met);
  const say = line.line;
  const c: Content = {
    name: e.name,
    say,
    live: liveLine(e),
    reason: r,
    showReason: !compact && !line.when && (band === 'stopped' || band === 'stroll') && !say.toLowerCase().includes(r.text.replace(/\.$/, '').toLowerCase()),
    kind: e.kind,
  };
  if (e.depth) c.depthRef = e.depth;
  if (e.img) c.img = e.img;
  return c;
}

export function expandedContent(e: Entity, r: Reason, scenario: ScenarioId, arrived: ReadonlySet<string>, chosen?: Chosen, met: ReadonlySet<string> = NONE): Content {
  const x = e.expanded;
  const say = sayFor(e, scenario, met).line;
  const settled = Object.entries(x?.liveAfter ?? {}).find(([flag]) => e.live[flag] === true);
  const img = e.img ? { img: e.img } : {};
  if (settled) return { name: e.name, say, rows: [], reason: r, showReason: false, note: settled[1], kind: e.kind, ...img };
  const done = chosen ? resolveChoice(e, chosen.action, chosen.row) : null;
  const lead = defaultRow(e);
  const rows: ContentRow[] = (x?.rows ?? [])
    .filter((row) => !row.when || arrived.has(row.when))
    .filter((row) => !done?.row || row === done.row)
    .slice(0, 4)
    .map((row) => {
      const out: ContentRow = { title: row.title };
      if (row.img) out.img = row.img;
      if (row.key) out.key = row.key;
      if (row.sub) out.sub = row.sub;
      if (row.value) out.value = row.value;
      if (row.tone) out.tone = row.tone;
      if (row.now) out.tone = row.tone ?? 'voice';
      if (row.act && !done) out.act = row.act;
      if (row === lead && !done) out.lead = true;
      return out;
    });
  const c: Content = { name: e.name, say, rows, reason: r, showReason: false, kind: e.kind, ...img };
  if (e.depth) c.depthRef = e.depth;
  if (done?.after) c.note = done.after;
  else if (x?.actions?.length) {
    c.actions = x.actions.map((a) => (a.primary && lead?.act ? { ...a, label: lead.act } : { ...a }));
  }
  return c;
}

export function whisperContent(e: Entity, r: Reason, scenario: ScenarioId, met: ReadonlySet<string> = NONE): Content {
  // The short form keeps its case, as on the label: a film's title starts with a capital.
  const fact = sayFor(e, scenario, met).short.split(/ · |, /)[0]!;
  return { name: e.name, fact, reason: r, showReason: false };
}

export function pipContent(e: { name: string }, r: Reason): Content {
  return { name: e.name, reason: r, showReason: false };
}
