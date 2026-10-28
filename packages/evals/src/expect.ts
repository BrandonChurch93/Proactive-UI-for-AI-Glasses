import {
  LEVEL_RANK,
  isShow,
  type Action,
  type Band,
  type Cause,
  type ComponentKind,
  type Decision,
  type Level,
  type ReasonKind,
  type ScenarioId,
  type Timing,
  type Zone,
} from '@lumen/shared';
import type { FrameRecord, RunResult } from './runner';

export interface Match {
  action?: Action | Action[];
  id?: string;
  idPrefix?: string;
  level?: Level | Level[];
  levelAtLeast?: Level;
  levelAtMost?: Level;
  reasonKind?: ReasonKind;
  reasonText?: string;
  band?: Band;
  timing?: Timing;
  zone?: Zone;
  component?: ComponentKind;
  cause?: Cause;
  gaze?: boolean;
  secondsAtLeast?: number;
  secondsIs?: number;
  nameIs?: string;
  sayIs?: string;
  factIs?: string | null;
  noteIs?: string;
  rowsAre?: string[];
  actionsAre?: string[];
  factIncludes?: string;
  showReason?: boolean;
  focusOk?: boolean;
  all?: boolean;
  allowNone?: boolean;
}

export interface StateMatch {
  band?: Band;
  safety?: boolean;
  snooze?: boolean;
  glyph?: string | null;
  glyphKind?: string;
  has?: string | string[];
  hasNot?: string | string[];
  levelsAtMost?: Level;
  level?: Record<string, Level | 'none'>;
  pocket?: number;
  goal?: ScenarioId;
  destination?: string | null;
}

export interface ExpCase {
  name?: string;
  rule?: string;
  between?: [number, number];
  at?: number;
  must?: Match;
  mustNot?: Match;
  max?: { shows?: number; holds?: number; nonGazeShows?: number };
  min?: { shows?: number; holds?: number };
  state?: StateMatch;
  stateSome?: StateMatch;
}

export interface Expectation {
  walk: string;
  owner?: string;
  cases: ExpCase[];
}

export interface CaseResult {
  name: string;
  rule?: string;
  pass: boolean;
  detail: string;
}

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function matches(d: Decision, m: Match): boolean {
  if (m.action && !arr(m.action).includes(d.action)) return false;
  if (m.id && d.id !== m.id) return false;
  if (m.idPrefix && !d.id.startsWith(m.idPrefix)) return false;
  if (m.level && !arr(m.level).includes(d.level)) return false;
  if (m.levelAtLeast && LEVEL_RANK[d.level] < LEVEL_RANK[m.levelAtLeast]) return false;
  if (m.levelAtMost && LEVEL_RANK[d.level] > LEVEL_RANK[m.levelAtMost]) return false;
  if (m.reasonKind && d.reason.kind !== m.reasonKind) return false;
  if (m.reasonText && d.reason.text !== m.reasonText) return false;
  if (m.band && d.band !== m.band) return false;
  if (m.timing && d.timing !== m.timing) return false;
  if (m.zone && d.placement.zone !== m.zone) return false;
  if (m.component && d.component !== m.component) return false;
  if (m.cause && d.cause !== m.cause) return false;
  if (m.gaze !== undefined && Boolean(d.gaze) !== m.gaze) return false;
  if (m.secondsAtLeast !== undefined && !((d.content.seconds ?? -1) >= m.secondsAtLeast)) return false;
  if (m.secondsIs !== undefined && d.content.seconds !== m.secondsIs) return false;
  if (m.nameIs !== undefined && d.content.name !== m.nameIs) return false;
  if (m.sayIs !== undefined && d.content.say !== m.sayIs) return false;
  if (m.factIs !== undefined && (d.content.fact ?? null) !== m.factIs) return false;
  if (m.noteIs !== undefined && d.content.note !== m.noteIs) return false;
  if (m.rowsAre !== undefined && JSON.stringify((d.content.rows ?? []).map((r) => r.title)) !== JSON.stringify(m.rowsAre)) return false;
  if (m.actionsAre !== undefined && JSON.stringify((d.content.actions ?? []).map((a) => a.label)) !== JSON.stringify(m.actionsAre)) return false;
  if (m.factIncludes !== undefined && !(d.content.fact ?? '').includes(m.factIncludes)) return false;
  if (m.showReason !== undefined && Boolean(d.content.showReason) !== m.showReason) return false;
  if (m.focusOk !== undefined && Boolean(d.placement.focusOk) !== m.focusOk) return false;
  return true;
}

function frameOk(f: FrameRecord, s: StateMatch): string | null {
  if (s.band && f.band !== s.band) return `band ${f.band}`;
  if (s.safety !== undefined && f.gate.safety !== s.safety) return `safety ${f.gate.safety}`;
  if (s.snooze !== undefined && f.gate.snooze !== s.snooze) return `snooze ${f.gate.snooze}`;
  if (s.glyph !== undefined && (f.glyph?.label ?? null) !== s.glyph) return `glyph ${f.glyph?.label ?? 'none'}`;
  if (s.glyphKind !== undefined && f.glyph?.kind !== s.glyphKind) return `glyph kind ${f.glyph?.kind ?? 'none'}`;
  for (const id of arr(s.has)) if (!f.items.some((i) => i.id === id)) return `missing ${id}`;
  for (const id of arr(s.hasNot)) if (f.items.some((i) => i.id === id)) return `has ${id}`;
  if (s.levelsAtMost) {
    const over = f.items.find((i) => i.zone !== 'ground' && LEVEL_RANK[i.level] > LEVEL_RANK[s.levelsAtMost!]);
    if (over) return `${over.id} at ${over.level}`;
  }
  for (const [id, lvl] of Object.entries(s.level ?? {})) {
    const it = f.items.find((i) => i.id === id);
    const got = it?.level ?? 'none';
    if (got !== lvl) return `${id} at ${got}, want ${lvl}`;
  }
  if (s.pocket !== undefined && f.pocket.length !== s.pocket) return `pocket ${f.pocket.length}`;
  if (s.goal !== undefined && f.goal.scenario !== s.goal) return `goal ${f.goal.scenario}`;
  if (s.destination !== undefined && (f.goal.destination ?? null) !== s.destination) return `destination ${f.goal.destination ?? 'none'}`;
  return null;
}

function window(r: RunResult, c: ExpCase): [number, number] {
  if (c.between) return c.between;
  if (c.at !== undefined) return [c.at - 0.05, c.at + 0.05];
  return [-Infinity, Infinity];
}

function describe(c: ExpCase): string {
  if (c.name) return c.name;
  const w = c.between ? `[${c.between[0]}, ${c.between[1]})` : c.at !== undefined ? `@${c.at}` : 'always';
  const what = c.must ? `must ${JSON.stringify(c.must)}` : c.mustNot ? `mustNot ${JSON.stringify(c.mustNot)}` : c.max ? `max ${JSON.stringify(c.max)}` : c.min ? `min ${JSON.stringify(c.min)}` : c.state ? `state ${JSON.stringify(c.state)}` : `stateSome ${JSON.stringify(c.stateSome)}`;
  return `${w} ${what}`;
}

export function evaluate(r: RunResult, exp: Expectation): CaseResult[] {
  const out: CaseResult[] = [];
  for (const c of exp.cases) {
    const [a, b] = window(r, c);
    const evs = r.entries.filter((e) => e.t >= a - 1e-9 && e.t < b - 1e-9).map((e) => ({ t: e.t, d: e.decision }));
    const frames = r.frames.filter((f) => f.t >= a - 1e-9 && f.t < b - 1e-9);
    const name = describe(c);
    const res = (pass: boolean, detail = ''): void => {
      const cr: CaseResult = { name, pass, detail };
      if (c.rule) cr.rule = c.rule;
      out.push(cr);
    };
    if (c.must) {
      if (c.must.all) {
        const { all: _all, allowNone, ...m } = c.must;
        const pool = evs.filter((e) => e.d.placement.zone !== 'ground' || m.zone === 'ground');
        const bad = pool.find((e) => !matches(e.d, m));
        if (pool.length === 0) res(Boolean(allowNone), 'no decisions in window');
        else if (bad) res(false, `t=${bad.t} ${bad.d.action} ${bad.d.id} ${bad.d.level} ${bad.d.reason.kind}: ${bad.d.reason.text}`);
        else res(true, `${pool.length} decisions`);
      } else {
        const hit = evs.find((e) => matches(e.d, c.must!));
        res(Boolean(hit), hit ? `t=${hit.t} ${hit.d.action} ${hit.d.id} ${hit.d.level}` : `no match among ${evs.length} decisions`);
      }
    } else if (c.mustNot) {
      const hit = evs.find((e) => matches(e.d, c.mustNot!));
      res(!hit, hit ? `t=${hit.t} ${hit.d.action} ${hit.d.id} ${hit.d.level}` : '');
    } else if (c.max || c.min) {
      const shows = evs.filter((e) => isShow(e.d) && e.d.cause !== 'settle').length;
      const asked = new Set(['menu', 'map']);
      const nonGaze = new Set(evs.filter((e) => isShow(e.d) && e.d.cause !== 'dwell' && e.d.cause !== 'pinch' && e.d.cause !== 'settle' && !e.d.gaze && !asked.has(e.d.component)).map((e) => e.d.id)).size;
      const holds = evs.filter((e) => e.d.action === 'hold').length;
      const fails: string[] = [];
      if (c.max?.shows !== undefined && shows > c.max.shows) fails.push(`shows ${shows} > ${c.max.shows}`);
      if (c.max?.nonGazeShows !== undefined && nonGaze > c.max.nonGazeShows) fails.push(`non-gaze shows ${nonGaze} > ${c.max.nonGazeShows}`);
      if (c.max?.holds !== undefined && holds > c.max.holds) fails.push(`holds ${holds} > ${c.max.holds}`);
      if (c.min?.shows !== undefined && shows < c.min.shows) fails.push(`shows ${shows} < ${c.min.shows}`);
      if (c.min?.holds !== undefined && holds < c.min.holds) fails.push(`holds ${holds} < ${c.min.holds}`);
      res(fails.length === 0, fails.join('; ') || `shows ${shows}, non-gaze ${nonGaze}, holds ${holds}`);
    } else if (c.state) {
      if (frames.length === 0) res(false, 'no frames in window');
      else {
        let bad: string | null = null;
        for (const f of frames) {
          const why = frameOk(f, c.state);
          if (why) {
            bad = `t=${f.t} ${why}`;
            break;
          }
        }
        res(!bad, bad ?? `${frames.length} frames`);
      }
    } else if (c.stateSome) {
      const hit = frames.find((f) => frameOk(f, c.stateSome!) === null);
      res(Boolean(hit), hit ? `t=${hit.t}` : `none of ${frames.length} frames`);
    }
  }
  return out;
}
