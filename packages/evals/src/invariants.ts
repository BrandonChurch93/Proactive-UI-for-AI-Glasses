import { DEFAULT_CONFIG, countCopy, type Config } from '@lumen/brain';
import {
  LEVEL_RANK,
  focusRect,
  isShow,
  rectsOverlap,
  reasonIsClean,
  type Decision,
  type LogEntry,
  type ReasonKind,
} from '@lumen/shared';
import type { CaseResult } from './expect';
import type { RunResult } from './runner';

const ALLOWED: ReasonKind[] = ['goal', 'world', 'gate', 'budget', 'social', 'edge', 'pace', 'pocket'];
const TICK = 0.1 + 1e-6;

function strings(d: Decision): string[] {
  const c = d.content;
  return [
    d.reason.text,
    c.name,
    c.fact,
    c.meta,
    c.live,
    c.hint,
    c.sub,
    c.note,
    ...(c.rows ?? []).flatMap((r) => [r.title, r.sub, r.value, r.key]),
    ...(c.actions ?? []).map((a) => a.label),
  ].filter((x): x is string => typeof x === 'string');
}

type Check = (r: RunResult, cfg: Config) => string | null;

const checks: { rule: string; name: string; check: Check }[] = [
  {
    rule: 'reasons',
    name: 'every reason cites an allowed kind, is at most 48 characters and never cites the wearer',
    check: (r) => {
      for (const e of r.entries) {
        const d = e.decision;
        if (!ALLOWED.includes(d.reason.kind)) return `t=${e.t} ${d.id} kind ${d.reason.kind}`;
        if (d.reason.text.length > 48) return `t=${e.t} ${d.id} reason over 48: ${d.reason.text}`;
        if (!reasonIsClean(d.reason.text)) return `t=${e.t} ${d.id} banned word: ${d.reason.text}`;
      }
      return null;
    },
  },
  {
    rule: 'copy',
    name: 'no em dash in any line the brain produces',
    check: (r) => {
      for (const e of r.entries) for (const s of strings(e.decision)) if (/[\u2014\u2013]/.test(s)) return `t=${e.t} ${e.decision.id}: ${s}`;
      return null;
    },
  },
  {
    rule: 'gates',
    name: 'during a safety gate every decision outside the ground layer is a hold with reason kind gate',
    check: (r) => {
      const gated = new Set(r.frames.filter((f) => f.gate.safety).map((f) => f.t));
      for (const e of r.entries) {
        if (!gated.has(e.t) || e.decision.placement.zone === 'ground') continue;
        if (e.decision.action !== 'hold' || e.decision.reason.kind !== 'gate') {
          return `t=${e.t} ${e.decision.action} ${e.decision.id} ${e.decision.reason.kind}`;
        }
      }
      return null;
    },
  },
  {
    rule: 'walking-1',
    name: 'focus zone: no world pane intersects the zone for its band, except the pane being looked at (a pane leaves over 320 ms when the zone grows or the look moves away)',
    check: (r) => {
      let bandAt = -Infinity;
      const lookedAt = new Map<string, number>();
      for (let i = 0; i < r.snapshots.length; i++) {
        const s = r.snapshots[i]!;
        const f = r.frames[i]!;
        if (i > 0 && r.frames[i - 1]!.band !== f.band) bandAt = f.t;
        const view = s.view;
        if (!view) continue;
        for (const p of view.panes) if (p.gaze) lookedAt.set(p.id, f.t);
        if (f.t - bandAt < 0.32 + TICK) continue;
        const zone = focusRect(f.band, view.w, view.h);
        for (const p of view.panes) {
          if (p.zone !== 'world' || p.opacity < 0.2 || LEVEL_RANK[p.level] < LEVEL_RANK.glance) continue;
          if (!rectsOverlap(p.rect, zone) || p.gaze || f.t - (lookedAt.get(p.id) ?? -Infinity) < 0.32 + TICK) continue;
          return `t=${s.t} ${p.id} ${p.level} in the ${f.band} zone`;
        }
      }
      return null;
    },
  },
  {
    rule: 'walking-2',
    name: 'reading budget: walk glances fit three words and a number with no reason; no card in Walk without its dwell; nothing but whisper in Brisk',
    check: (r, cfg) => {
      for (const e of r.entries) {
        const d = e.decision;
        if (d.placement.zone === 'world' && d.level === 'glance' && d.band === 'walk' && (d.action === 'show' || d.action === 'promote' || d.action === 'demote')) {
          if (d.content.showReason) return `t=${e.t} ${d.id} shows a reason in Walk`;
          if (d.content.fact) {
            const c = countCopy(d.content.fact);
            if (c.words > cfg.reading.glanceWords || c.numbers > cfg.reading.glanceNumbers) return `t=${e.t} ${d.id} fact over cap: ${d.content.fact}`;
          }
        }
        if (d.band === 'brisk' && (d.action === 'show' || d.action === 'promote') && d.placement.zone !== 'ground' && LEVEL_RANK[d.level] >= LEVEL_RANK.glance) {
          return `t=${e.t} ${d.id} ${d.level} appeared in Brisk`;
        }
      }
      return null;
    },
  },
  {
    rule: 'walking-3',
    name: 'auto-fold: no proactive world glance outlives its band limit',
    check: (r, cfg) => {
      const open = new Map<string, number>();
      for (const f of r.frames) {
        const glances = new Set(f.items.filter((i) => i.zone === 'world' && i.level === 'glance' && i.cause === 'score' && !i.gaze).map((i) => i.id));
        for (const id of [...open.keys()]) if (!glances.has(id)) open.delete(id);
        for (const id of glances) {
          if (!open.has(id)) open.set(id, f.t);
          const limit = cfg.autoFoldS[f.band];
          if (limit !== null && !f.gate.safety && f.t - open.get(id)! > limit + TICK + 0.05) return `t=${f.t} ${id} up ${(f.t - open.get(id)!).toFixed(1)} s in ${f.band}`;
        }
      }
      return null;
    },
  },
  {
    rule: 'walking-4',
    name: 'entry: a world pane born while moving is outside the focus zone unless it is the thing being looked at',
    check: (r) => {
      const shown = new Set<string>();
      for (let i = 0; i < r.snapshots.length; i++) {
        const s = r.snapshots[i]!;
        const f = r.frames[i]!;
        const view = s.view;
        if (!view) continue;
        const zone = focusRect(f.band, view.w, view.h);
        const now = new Set<string>();
        for (const p of view.panes) {
          if (p.zone !== 'world' || !p.visible || p.opacity < 0.05 || LEVEL_RANK[p.level] < LEVEL_RANK.glance) continue;
          now.add(p.id);
          if (shown.has(p.id) || f.band === 'stopped' || p.gaze) continue;
          if (rectsOverlap(p.rect, zone)) return `t=${s.t} ${p.id} born inside the ${f.band} zone`;
        }
        shown.clear();
        for (const id of now) shown.add(id);
      }
      return null;
    },
  },
  {
    rule: 'walking-6',
    name: 'the pocket: a pinch in Walk or Brisk saves and never opens a card',
    check: (r) => {
      for (let i = 0; i < r.snapshots.length; i++) {
        const s = r.snapshots[i]!;
        const f = r.frames[i]!;
        const p = s.wearer.pinch?.target;
        if (!p || p.startsWith('pocket:') || (f.band !== 'walk' && f.band !== 'brisk')) continue;
        const evs = r.entries.filter((e) => Math.abs(e.t - s.t) < 1e-6 && e.decision.id === p);
        if (evs.some((e) => (e.decision.action === 'promote' || e.decision.action === 'show') && LEVEL_RANK[e.decision.level] >= LEVEL_RANK.card)) return `t=${s.t} pinch on ${p} opened a pane`;
        const saved = r.entries.some((e) => e.decision.action === 'save' && e.decision.id === p && e.t <= s.t + 1e-6);
        if (!saved) return `t=${s.t} pinch on ${p} was not saved`;
      }
      return null;
    },
  },
  {
    rule: 'walking-7',
    name: 'the pocket surfaces within 500 ms of a qualifying stop, never in a gate, never under 6 s',
    check: (r, cfg) => {
      let surfacedThisStop = false;
      let qualifiedAt: number | null = null;
      for (let i = 0; i < r.frames.length; i++) {
        const f = r.frames[i]!;
        const s = r.snapshots[i]!;
        if (f.band !== 'stopped') {
          surfacedThisStop = false;
          qualifiedAt = null;
          continue;
        }
        const surf = r.entries.find((e) => Math.abs(e.t - f.t) < 1e-6 && e.decision.action === 'surface');
        if (surf) {
          if (f.gate.safety || f.gate.snooze) return `t=${f.t} surfaced during a gate`;
          if ((surf.decision.content.seconds ?? 0) < cfg.pocket.minSeconds) return `t=${f.t} surfaced with ${surf.decision.content.seconds} s`;
          surfacedThisStop = true;
        }
        const cw = s.env.crosswalk;
        const avail = cw && cw.onRoute && cw.distance < 10 && cw.signal !== 'walk' ? cw.toWalk : cfg.pocket.defaultSeconds;
        const prevPocket = i > 0 ? r.frames[i - 1]!.pocket.length : 0;
        const qualifies = f.stoppedFor >= cfg.pocket.stoppedForS - 1e-9 && prevPocket > 0 && avail >= cfg.pocket.minSeconds && !f.gate.safety && !f.gate.snooze;
        if (qualifies && qualifiedAt === null) qualifiedAt = f.t;
        if (qualifiedAt !== null && !surfacedThisStop && f.t - qualifiedAt > 0.5 + 1e-6) return `t=${f.t} qualified at ${qualifiedAt} but no surface`;
      }
      return null;
    },
  },
  {
    rule: 'walking-10',
    name: 'the dwell ladder: no card or expanded without its dwell or a pinch, never expanded above Stroll, never two place cards',
    check: (r, cfg) => {
      const cardAt = new Map<string, number>();
      for (let i = 0; i < r.frames.length; i++) {
        const f = r.frames[i]!;
        const s = r.snapshots[i]!;
        const places = f.items.filter((it) => it.component === 'place' && LEVEL_RANK[it.level] >= LEVEL_RANK.card);
        if (places.length > 1 && !f.gate.safety) return `t=${f.t} two place cards: ${places.map((p) => p.id).join(', ')}`;
        for (const e of r.entries.filter((x) => Math.abs(x.t - f.t) < 1e-6)) {
          const d = e.decision;
          if (d.component !== 'place') continue;
          const climbed = d.action === 'promote' || d.action === 'show';
          if (!climbed) continue;
          const pinched = s.wearer.pinch?.target === d.id;
          if (d.level === 'card') {
            cardAt.set(d.id, f.t);
            if (d.id.startsWith('pocket:')) continue;
            const need = (cfg.ladder.glanceDwellS + (cfg.ladder.cardDwellS[f.band] ?? Infinity)) * 1000 - 1;
            const ok = (pinched && (f.band === 'stopped' || f.band === 'stroll')) || (s.wearer.gaze.target === d.id && s.wearer.gaze.dwellMs >= need);
            if (!ok) return `t=${f.t} card on ${d.id} without dwell (${s.wearer.gaze.dwellMs} ms in ${f.band})`;
          }
          if (d.level === 'expanded') {
            if (f.band !== 'stopped' && f.band !== 'stroll') return `t=${f.t} expanded ${d.id} in ${f.band}`;
            const c = cardAt.get(d.id);
            const ok = pinched || (c !== undefined && f.t - c >= cfg.ladder.expandDwellS - 1e-6 && s.wearer.gaze.target === d.id);
            if (!ok) return `t=${f.t} expanded ${d.id} without 2 s on the card`;
          }
        }
      }
      return null;
    },
  },
  {
    rule: 'walking-11',
    name: 'whisper: only in Brisk, name plus three words and a number, gone after 2.5 s',
    check: (r, cfg) => {
      let since: number | null = null;
      for (const f of r.frames) {
        const w = f.items.find((i) => i.component === 'whisper');
        if (!w) {
          since = null;
          continue;
        }
        since ??= f.t;
        if (f.t - since > cfg.whisper.seconds + TICK) return `t=${f.t} whisper up ${(f.t - since).toFixed(1)} s`;
      }
      for (const e of r.entries) {
        const d = e.decision;
        if (d.component !== 'whisper' || d.action !== 'show') continue;
        if (d.band !== 'brisk') return `t=${e.t} whisper in ${d.band}`;
        const c = countCopy(d.content.fact ?? '');
        if (c.words > 3 || c.numbers > 1) return `t=${e.t} whisper over cap: ${d.content.fact}`;
      }
      return null;
    },
  },
  {
    rule: 'walking-12',
    name: 'snooze: nothing but safety shows while snoozed, and the glyph counts down',
    check: (r) => {
      for (const f of r.frames) {
        if (!f.gate.snooze) continue;
        if (f.glyph?.kind !== 'snooze') return `t=${f.t} snoozed without the countdown glyph`;
        const shown = r.entries.find((e) => Math.abs(e.t - f.t) < 1e-6 && isShow(e.decision));
        if (shown) return `t=${f.t} ${shown.decision.id} shown while snoozed`;
        const up = f.items.find((i) => i.zone !== 'ground' && LEVEL_RANK[i.level] >= LEVEL_RANK.whisper);
        if (up) return `t=${f.t} ${up.id} still up while snoozed`;
      }
      return null;
    },
  },
  {
    rule: 'walking-13',
    name: 'budget: budgeted shows never exceed the budget plus refills, and the meter matches the show count',
    check: (r, cfg) => {
      const shows = r.entries.filter((e) => isShow(e.decision)).length;
      const last = r.frames[r.frames.length - 1];
      if (!last) return null;
      if (last.budgetUsed !== shows) return `meter ${last.budgetUsed} but ${shows} shows`;
      let refills = 0;
      for (let i = 1; i < r.frames.length; i++) {
        const a = r.frames[i - 1]!;
        const b = r.frames[i]!;
        if (b.budget > a.budget) refills += b.budget - a.budget;
      }
      const exempt = (d: Decision): boolean =>
        d.cause === 'dwell' || d.cause === 'pinch' || d.component === 'call' || d.cause === 'gate' || d.cause === 'arrival';
      const bound = r.entries.filter((e) => isShow(e.decision) && !exempt(e.decision)).length;
      if (bound > cfg.budget.shows + refills) return `${bound} budgeted shows > ${cfg.budget.shows} + ${refills}`;
      return null;
    },
  },
  {
    rule: 'hysteresis',
    name: 'no score-driven level change within 1.2 s of the last change on the same item, no band change within 600 ms',
    check: (r, cfg) => {
      const last = new Map<string, number>();
      const gated = new Set(r.frames.filter((f) => f.gate.safety).map((f) => f.t));
      for (const e of r.entries as LogEntry[]) {
        const d = e.decision;
        if (d.action === 'hold' || d.action === 'save' || d.component !== 'place') continue;
        const prev = last.get(d.id);
        if (d.cause === 'score' && prev !== undefined && e.t - prev < cfg.hysteresisS - 1e-6 && !gated.has(e.t)) {
          return `t=${e.t} ${d.id} score change ${(e.t - prev).toFixed(2)} s after the last`;
        }
        last.set(d.id, e.t);
      }
      let bandAt = -Infinity;
      for (let i = 1; i < r.frames.length; i++) {
        if (r.frames[i]!.band !== r.frames[i - 1]!.band) {
          if (r.frames[i]!.t - bandAt < cfg.band.hysteresisS - 1e-6) return `t=${r.frames[i]!.t} band flicker`;
          bandAt = r.frames[i]!.t;
        }
      }
      return null;
    },
  },
  {
    rule: 'timing',
    name: 'messages shown while moving are next-pause; held in a gate they are after-gate',
    check: (r) => {
      for (const e of r.entries) {
        const d = e.decision;
        if (d.component !== 'toast' && d.component !== 'call') continue;
        if (d.action === 'show' && d.band !== 'stopped' && d.timing !== 'next-pause') return `t=${e.t} ${d.id} timing ${d.timing} while moving`;
        if (d.action === 'hold' && d.reason.kind === 'gate' && d.reason.text !== 'Snoozed' && d.timing !== 'after-gate') return `t=${e.t} ${d.id} held in a gate as ${d.timing}`;
      }
      return null;
    },
  },
  {
    rule: 'social',
    name: 'nobody on the path gets a message: none shows while a person is on the path ahead',
    check: (r) => {
      for (const f of r.frames) {
        if (!f.gate.path) continue;
        const shown = r.entries.find((e) => Math.abs(e.t - f.t) < 1e-6 && e.decision.action === 'show' && (e.decision.component === 'toast' || e.decision.component === 'call'));
        if (shown) return `t=${f.t} ${shown.decision.id} shown with someone on the path`;
      }
      return null;
    },
  },
  {
    rule: 'placement',
    name: 'every show carries a zone, a preference and its band; only the pane being looked at may enter the focus zone',
    check: (r) => {
      for (const e of r.entries) {
        const d = e.decision;
        if (d.action !== 'show') continue;
        if (!d.placement.zone || !d.placement.prefer || !d.band) return `t=${e.t} ${d.id} missing placement hints`;
        if (d.placement.focusOk && !d.gaze) return `t=${e.t} ${d.id} ${d.level} allowed in the focus zone`;
      }
      return null;
    },
  },
];

export function invariants(r: RunResult, cfg: Config = DEFAULT_CONFIG): CaseResult[] {
  return checks.map((c) => {
    const why = c.check(r, cfg);
    return { name: c.name, rule: c.rule, pass: why === null, detail: why ?? '' };
  });
}

