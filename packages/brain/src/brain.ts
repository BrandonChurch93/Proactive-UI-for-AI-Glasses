import {
  FOCUS_ZONE,
  LEVEL_RANK,
  isShow,
  type Band,
  type BrainFrame,
  type Channel,
  type Cause,
  type ComponentKind,
  type Content,
  type Decision,
  type Entity,
  type GateState,
  type Glyph,
  type Level,
  type Notification,
  type Override,
  type Reason,
  type ReasonPart,
  type ScenarioId,
  type SignalBundle,
  type Timing,
  type WearerModel,
  type WorldSnapshot,
  type Zone,
} from '@lumen/shared';
import { DEFAULT_CONFIG, withConfig, type Config, type ConfigOverride } from './config';
import {
  cardContent,
  entityReason,
  expandedContent,
  glanceContent,
  pipContent,
  reason,
  whisperContent,
} from './content';
import { bikeBehind, computeGates, gateList } from './gates';
import { isPane, newLadderItem, rank, step, type LadderItem, type PaneLevel } from './ladder';
import { DecisionLog } from './log';
import { Pace } from './pace';
import { Pocket } from './pocket';
import { trimForPace } from './reading';
import { type Scored } from './score';
import { candidates } from './candidates';
import { messageTiming, viewFoldDue } from './timing';

type Origin =
  | 'proactive'
  | 'gaze'
  | 'message'
  | 'social'
  | 'call'
  | 'app'
  | 'safety'
  | 'ground'
  | 'followup'
  | 'arrival'
  | 'goal'
  | 'pocket';

interface Want {
  id: string;
  component: ComponentKind;
  zone: Zone;
  level: Level;
  anchor: string;
  content: Content;
  reason: Reason;
  origin: Origin;
  score?: number;
  scored?: Scored;
  distance?: number;
  timing?: Timing;
  channel?: Channel;
  announce?: string;
  focusOk?: boolean;
  gaze?: boolean;
  cause?: Cause;
  remove?: boolean;
  onCommit?: () => void;
  onHold?: (r: Reason) => void;
}

interface InboxItem {
  n: Notification;
  status: 'pending' | 'shown' | 'done';
  shownAt: number;
  movingS: number;
  stillS: number;
  heldInGate: boolean;
}

interface FollowUp {
  id: string;
  content: Content;
  reason: Reason;
  until: number;
  component: ComponentKind;
}

const HOLD_TEXT: Record<string, string> = {
  crossing: 'Held: crossing',
  roadway: 'Held: in the roadway',
  vehicle: 'Held: vehicle near the path',
};

const MESSAGE_TYPES = new Set(['text', 'dm']);

const DEFAULT_CAUSE: Partial<Record<Origin, Cause>> = {
  proactive: 'score',
  gaze: 'dwell',
  message: 'notification',
  social: 'notification',
  call: 'notification',
  app: 'notification',
  safety: 'safety',
  ground: 'goal',
  followup: 'gate',
  arrival: 'arrival',
  goal: 'goal',
  pocket: 'pocket',
};

export class Brain {
  readonly cfg: Config;
  readonly log = new DecisionLog();
  private readonly pace: Pace;
  private readonly pocket = new Pocket();
  private items = new Map<string, LadderItem>();
  private standing = new Map<string, Decision>();
  private holdEpisodes = new Map<string, string>();
  private presented = new Map<string, string>();
  private inbox = new Map<string, InboxItem>();
  private followups: FollowUp[] = [];
  private heldInGate = new Set<string>();
  private lastT = -1;
  private snapRef = -1;
  private gateWas = false;
  private stoppedSince: number | null = null;
  private briskAt = -Infinity;
  private quietS = 0;
  private budget: number;
  private budgetUsed = 0;
  private dismissed: Record<string, number> = {};
  private accepted: Record<string, number> = {};
  private snoozeUntil: number | undefined;
  private lookUpSince: number | null = null;
  private lookUpArmed = true;
  private goal: ScenarioId;
  private destination: string | undefined;
  private stops: string[] = [];
  private chosen = new Map<string, string>();
  private errands = { key: '', shownAt: -1, movingS: 0, stillS: 0, folded: true };
  private social = { count: 0, surfaced: false, stripUntil: -1 };
  private foodGlances = new Set<string>();
  private ask: 'none' | 'open' | 'done' = 'none';
  private askAt = -1;
  private whisper: { content: Content; reason: Reason; until: number; from: string } | null = null;
  private moments = new Set<string>();
  private needToRunUntil = -1;
  private arrived = false;
  private overrides: { band: Band | null; gate: boolean; muteSocial: boolean } = {
    band: null,
    gate: false,
    muteSocial: false,
  };
  private frameEvents: Decision[] = [];
  private pathHeld = new Set<string>();
  private pocketUp = false;
  private heldGlyph = new Set<string>();
  private announced = new Map<string, string>();
  private bandNow: Band = 'walk';
  private gateNow: GateState = { safety: false, social: false, path: false, snooze: false, budgetEmpty: false };
  private snap!: WorldSnapshot;

  constructor(opts: { config?: ConfigOverride; scenario?: ScenarioId } = {}) {
    this.cfg = opts.config ? withConfig(opts.config) : DEFAULT_CONFIG;
    this.pace = new Pace(this.cfg);
    this.budget = this.cfg.budget.shows;
    this.goal = opts.scenario ?? 'walking';
  }

  model(): WearerModel {
    const m: WearerModel = {
      dismissed: { ...this.dismissed },
      accepted: { ...this.accepted },
      budgetUsed: this.budgetUsed,
      budget: this.budget,
      pocket: [...this.pocket.items],
    };
    if (this.snoozeUntil !== undefined) m.snoozeUntil = this.snoozeUntil;
    return m;
  }

  applyOverride(o: Override, t: number): void {
    this.log.override(t, o);
    if (o.kind === 'band') this.overrides.band = o.band;
    if (o.kind === 'gate') this.overrides.gate = o.on;
    if (o.kind === 'mute-social') this.overrides.muteSocial = o.on;
    if (o.kind === 'budget-zero') this.budget = 0;
    if (o.kind === 'snooze') this.snoozeUntil = t + this.cfg.snooze.seconds;
  }

  tick(snap: WorldSnapshot): BrainFrame {
    this.snap = snap;
    const t = snap.t;
    const dt = this.lastT < 0 ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    this.snapRef++;
    this.frameEvents = [];
    if (snap.goal.scenario && this.snapRef === 0) this.goal = snap.goal.scenario;
    if (snap.goal.destination && !this.destination && snap.goal.scenario === 'errands') {
      this.destination = snap.goal.destination;
    }

    const band = this.pace.update(snap.wearer.speed, t, this.overrides.band);
    this.bandNow = band;
    if (band === 'brisk') this.briskAt = t;
    if (band === 'stopped') {
      if (this.stoppedSince === null) {
        this.stoppedSince = t;
        this.pocket.surfacedThisStop = false;
      }
    } else {
      this.stoppedSince = null;
    }
    const stoppedFor = this.stoppedSince === null ? 0 : t - this.stoppedSince;

    this.updateSnooze(snap, t);
    const gate = computeGates(
      snap,
      { snoozed: this.snoozeUntil !== undefined && t < this.snoozeUntil, budget: this.budget, forceSafety: this.overrides.gate },
      this.cfg,
    );
    if (this.overrides.muteSocial) gate.social = false;
    this.gateNow = gate;
    const gateStarted = gate.safety && !this.gateWas;
    const gateEnded = !gate.safety && this.gateWas;
    this.gateWas = gate.safety;
    if (gateStarted) this.onGateStart(t);
    if (gateEnded) this.onGateEnd(t);

    if (snap.goal.stops && this.stops.length === 0) this.stops = snap.goal.stops.map((s) => s.id);
    this.ingestInbox(snap, t, dt, band);
    this.applyChoice(snap, t);
    this.applyDismiss(snap, t);

    const wants: Want[] = [];
    if (t >= this.cfg.quietStartS) {
      this.entityWants(snap, t, band, wants);
      this.peopleWants(snap, wants);
      this.momentWants(snap, t, band, wants);
      this.errandsWants(snap, t, dt, band, wants);
      this.messageWants(snap, t, band, wants);
      this.pocketWants(snap, t, band, stoppedFor, wants);
      this.askWants(snap, t, band, wants);
      this.followupWants(t, wants);
      this.arrivalWants(snap, t, wants);
      this.whisperWants(t, wants);
    }
    this.groundWants(snap, t, band, wants);
    this.commit(wants, t, band, gate);
    this.refillBudget(dt, gate);

    const target = snap.wearer.gaze.target;
    const tItem = target ? this.items.get(target) : undefined;
    return {
      t,
      band,
      speed: snap.wearer.speed,
      gate,
      items: [...this.standing.values()],
      events: this.frameEvents,
      glyph: this.glyph(t, gate),
      focus: FOCUS_ZONE[band],
      model: this.model(),
      dwell: {
        ...(target ? { target } : {}),
        dwellMs: snap.wearer.gaze.dwellMs,
        earned: (tItem?.level ?? 'none') as Level | 'none',
      },
      goal: {
        scenario: this.goal,
        ...(this.destination ? { destination: this.destination } : {}),
        stops: this.openStops(snap),
      },
      stoppedFor,
    };
  }

  private updateSnooze(snap: WorldSnapshot, t: number): void {
    const up = snap.wearer.gaze.pitch > this.cfg.snooze.pitch;
    if (!up) {
      this.lookUpSince = null;
      this.lookUpArmed = true;
    } else if (this.lookUpArmed) {
      if (this.lookUpSince === null) this.lookUpSince = t;
      if (t - this.lookUpSince >= this.cfg.snooze.holdS - 1e-9) {
        this.lookUpArmed = false;
        this.lookUpSince = null;
        if (this.snoozeUntil !== undefined && t < this.snoozeUntil) this.snoozeUntil = undefined;
        else this.snoozeUntil = t + this.cfg.snooze.seconds;
      }
    }
    if (this.snoozeUntil !== undefined && t >= this.snoozeUntil) this.snoozeUntil = undefined;
  }

  private onGateStart(_t: number): void {
    this.heldInGate.clear();
  }

  private onGateEnd(t: number): void {
    const messages: string[] = [];
    const apps: InboxItem[] = [];
    for (const id of this.heldInGate) {
      const it = this.inbox.get(id);
      if (!it) continue;
      if (MESSAGE_TYPES.has(it.n.type)) messages.push(id);
      if (it.n.type === 'app') apps.push(it);
    }
    const held = reason('gate', 'Held that while you crossed', [{ signal: 'gate', value: 'cleared', weight: 1 }]);
    if (messages.length > 0) {
      const one = messages.length === 1;
      this.followups.push({
        id: 'followup',
        component: 'followup',
        content: {
          name: one ? 'One message came in.' : 'Two messages came in.',
          fact: one ? 'Read it?' : 'Read them?',
          reason: held,
          showReason: true,
          actions: [
            { id: 'read', label: 'Read', primary: true },
            { id: 'later', label: 'Later' },
          ],
        },
        reason: held,
        until: t + this.cfg.followupS,
      });
    }
    for (const a of apps) {
      a.status = 'pending';
      a.heldInGate = true;
    }
    this.heldInGate.clear();
  }

  private ingestInbox(snap: WorldSnapshot, t: number, dt: number, band: Band): void {
    for (const n of snap.inbox) {
      if (this.inbox.has(n.id)) continue;
      if (n.type === 'social') {
        this.social.count += n.count ?? 1;
        this.social.surfaced = false;
        this.inbox.set(n.id, { n, status: 'done', shownAt: t, movingS: 0, stillS: 0, heldInGate: false });
        this.logHoldOnce(
          n.id,
          'view',
          'glance',
          'strip',
          reason('social', 'Counted on the glyph', [{ signal: 'social.count', value: this.social.count, weight: 1 }]),
          band === 'stopped' ? 'now' : 'next-pause',
        );
        continue;
      }
      this.inbox.set(n.id, { n, status: 'pending', shownAt: -1, movingS: 0, stillS: 0, heldInGate: false });
    }
    const moving = band !== 'stopped';
    for (const it of this.inbox.values()) {
      if (it.status !== 'shown') continue;
      if (moving) it.movingS += dt;
      else it.stillS += dt;
    }
    if (moving) this.errands.movingS += dt;
    else this.errands.stillS += dt;
  }

  private applyChoice(snap: WorldSnapshot, t: number): void {
    const c = snap.wearer.choice;
    if (!c) return;
    const inb = this.inbox.get(c.id);
    if (inb) {
      inb.status = 'done';
      if (c.action === 'answer' || c.action === 'reply') this.bump(this.accepted, inb.n.type);
      else this.bump(this.dismissed, inb.n.type);
      return;
    }
    if (c.id === 'ask') {
      this.ask = 'done';
      if (c.action === 'yes' || c.action === 'find-lunch') this.goal = 'hungry';
      return;
    }
    if (c.id === 'followup') {
      this.followups = this.followups.filter((f) => f.id !== 'followup');
      if (c.action === 'read') {
        for (const it of this.inbox.values()) {
          if (MESSAGE_TYPES.has(it.n.type) && it.heldInGate) it.status = 'pending';
        }
      }
      return;
    }
    const id = c.id.replace(/^pocket:/, '');
    if (c.action === 'not-now') {
      this.bump(this.dismissed, this.kindOf(id));
      for (const key of [id, `pocket:${id}`]) {
        const li = this.items.get(key);
        if (li && li.level === 'expanded') {
          li.level = 'card';
          li.since = t;
          li.stepAt = t;
          li.gazeSince = null;
        }
      }
      return;
    }
    this.chosen.set(id, c.action);
    this.bump(this.accepted, this.kindOf(id));
    if (c.action === 'hold-seat' || c.action === 'hold-table') {
      this.destination = id;
      this.goal = 'hungry';
    }
  }

  private applyDismiss(snap: WorldSnapshot, t: number): void {
    const d = snap.wearer.dismiss;
    if (!d) return;
    const targetId =
      d.target ??
      [...this.standing.values()]
        .filter((x) => x.placement.zone !== 'ground' && LEVEL_RANK[x.level] >= LEVEL_RANK.glance)
        .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]?.id;
    if (!targetId) return;
    const li = this.items.get(targetId);
    if (li && isPane(li.level)) {
      li.level = li.level === 'glance' ? 'pip' : li.level === 'card' ? 'glance' : 'card';
      li.since = t;
      li.stepAt = t;
      li.gazeSince = null;
      li.dwelt = true;
      this.bump(this.dismissed, this.kindOf(targetId));
      return;
    }
    const inb = this.inbox.get(targetId);
    if (inb) {
      inb.status = 'done';
      this.bump(this.dismissed, inb.n.type);
    }
    if (targetId === 'ask') this.ask = 'done';
    this.followups = this.followups.filter((f) => f.id !== targetId);
  }

  private bump(rec: Record<string, number>, key: string): void {
    rec[key] = (rec[key] ?? 0) + 1;
  }

  private kindOf(id: string): string {
    return this.snap.entities.find((e) => e.id === id)?.kind ?? id;
  }

  private item(id: string): LadderItem {
    let it = this.items.get(id);
    if (!it) {
      it = newLadderItem(id);
      this.items.set(id, it);
    }
    return it;
  }

  private cardOpen(except?: string): boolean {
    for (const d of this.standing.values()) {
      if (d.id === except) continue;
      if ((d.level === 'card' || d.level === 'expanded') && d.placement.zone !== 'ground') return true;
    }
    return false;
  }

  private glancesUp(): number {
    let n = 0;
    for (const d of this.standing.values()) if (d.level === 'glance' && d.placement.zone === 'world') n++;
    return n;
  }

  private openStops(snap: WorldSnapshot): string[] {
    return this.stops.filter((id) => {
      const e = snap.entities.find((x) => x.id === id);
      return !e || (e.live.pickedUp !== true && e.live.closedEarly !== true);
    });
  }

  private viewSeconds(e: Entity, speed: number): number {
    if (speed < 0.2) return Infinity;
    return Math.max(0.5, (e.distance * Math.cos(this.cfg.reading.comfortAngle)) / speed);
  }

  private entityWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    const target = snap.wearer.gaze.target;
    const dwellS = snap.wearer.gaze.dwellMs / 1000;
    const pinch = snap.wearer.pinch?.target;
    const cardOpen = this.cardOpen();
    const stops = this.openStops(snap);
    const frozen = this.gateNow.safety;
    const list = candidates(
      snap.entities,
      {
        goal: this.goal,
        openStops: stops,
        allStops: this.stops,
        ...(this.destination ? { destination: this.destination } : {}),
        ...(target ? { target } : {}),
        band,
        cardOpenElsewhere: (id) => cardOpen && this.standing.get(id)?.level !== 'card',
        dismissed: this.dismissed,
        accepted: this.accepted,
        presented: this.presented,
      },
      this.cfg,
    );
    for (const { entity: e, scored: sc, reason: why, contentKey } of list) {
      const it = this.item(e.id);
      const isT = target === e.id;
      const parts = why.parts;

      if (frozen) continue;

      if (pinch === e.id && (band === 'walk' || band === 'brisk')) {
        if (this.pocket.save(e.id)) {
          this.bump(this.accepted, e.kind);
          this.emitEvent({
            id: e.id,
            component: 'place',
            zone: 'world',
            level: it.level === 'none' ? 'pip' : (it.level as Level),
            anchor: e.id,
            content: { name: 'Saved', fact: e.name, reason: reason('pocket', 'Saved for the next stop', parts) },
            reason: reason('pocket', 'Saved for the next stop', [
              { signal: 'band', value: band, weight: 1 },
              { signal: 'pocket', value: this.pocket.items.length, weight: 1 },
            ]),
            origin: 'pocket',
            gaze: true,
          }, 'save', t);
        }
      }

      if (isT) {
        if (it.gazeSince === null || !it.wasTarget) it.gazeSince = t;
        it.lastGazeAt = t;
      } else {
        it.gazeSince = null;
      }
      it.wasTarget = isT;

      if (band === 'brisk' && isT && dwellS >= this.cfg.ladder.glanceDwellS && !it.whispered) {
        it.whispered = true;
        this.whisper = { content: whisperContent(e, why), reason: why, until: t + this.cfg.whisper.seconds, from: e.id };
      }
      if (!isT) it.whispered = false;

      if (sc.score > this.cfg.score.glanceThreshold) it.aboveSince ??= t;
      else it.aboveSince = null;

      const out = step(
        it,
        {
          t,
          band,
          target: isT,
          dwellS,
          pinch: pinch === e.id,
          floor: sc.pipScore > 0 ? 'pip' : 'none',
          proactive: true,
          scoreAbove: sc.score > this.cfg.score.glanceThreshold,
          canProactive: this.glancesUp() < this.cfg.ladder.maxGlances,
        },
        this.cfg,
      );
      const level = out.level;
      if (level === 'card' && isT && rank(it.level) < rank('card')) {
        for (const [id, d] of this.standing) {
          if (id !== e.id && (d.level === 'card' || d.level === 'expanded')) {
            const other = this.items.get(id);
            if (other) {
              other.level = 'glance';
              other.since = t;
              other.stepAt = t;
            }
          }
        }
      }
      if (level === 'none' && rank(it.level) === 0) continue;
      const gazeDriven = out.via === 'dwell' || out.via === 'pinch' || it.dwelt || isT;
      const prevLevel = it.level;
      const commitLevel = level;
      const via = out.via;
      const w: Want = {
        id: e.id,
        component: 'place',
        zone: 'world',
        level: level === 'none' ? 'pip' : (level as Level),
        anchor: e.id,
        content: this.entityContent(e, level, why, band),
        reason: why,
        origin: gazeDriven ? 'gaze' : 'proactive',
        score: sc.score,
        scored: sc,
        distance: e.distance,
        gaze: isT,
        focusOk: isT && level === 'glance',
        announce: level === 'expanded' ? `x:${this.chosen.get(e.id) ?? ''}` : undefined,
        cause: via === 'hold' ? undefined : via,
        onCommit: () => this.commitLadder(it, prevLevel, commitLevel, via, t, e, contentKey),
      };
      if (level === 'none') {
        w.level = 'pip';
        w.content = pipContent(e, why);
        w.remove = true;
      }
      wants.push(w);
    }
  }

  private commitLadder(
    it: LadderItem,
    prev: PaneLevel,
    level: PaneLevel,
    via: string,
    t: number,
    e: Entity,
    contentKey: string,
  ): void {
    if (level === prev) return;
    if (rank(level) < rank(prev)) it.stepAt = t;
    if (!isPane(prev) && isPane(level)) {
      it.shownAt = t;
      it.dwelt = via === 'dwell' || via === 'pinch';
      if (it.dwelt && (e.kind === 'food' || e.kind === 'cafe')) this.foodGlances.add(e.id);
    }
    if (isPane(prev) && !isPane(level)) this.presented.set(e.id, contentKey);
    if (level === 'card') it.cardAt = t;
    if (!isPane(level)) it.dwelt = rank(level) > 0 && it.dwelt && t - it.lastGazeAt < this.cfg.ladder.lookAwayS;
    it.level = level;
    it.since = t;
  }

  private entityContent(e: Entity, level: PaneLevel, why: Reason, band: Band): Content {
    if (level === 'expanded') return expandedContent(e, why, this.chosen.get(e.id));
    if (level === 'card') return cardContent(e, why, band);
    if (level === 'glance') {
      const c = glanceContent(e, why);
      return trimForPace(c, band, this.viewSeconds(e, this.snap.wearer.speed), e.short, this.cfg);
    }
    return pipContent(e, why);
  }

  private peopleWants(snap: WorldSnapshot, wants: Want[]): void {
    for (const p of snap.env.people) {
      if (!p.onPath) continue;
      const r = reason('world', 'Someone on the path', [
        { signal: 'person.onPath', value: 1, weight: 1 },
        { signal: 'person.ahead', value: Math.round(p.ahead * 10) / 10, weight: 1 },
      ]);
      wants.push({
        id: `person:${p.id}`,
        component: 'person',
        zone: 'world',
        level: 'pip',
        anchor: `person:${p.id}`,
        content: { name: 'Person', reason: r, showReason: false },
        reason: r,
        origin: 'proactive',
      });
    }
  }

  private momentWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    const cw = snap.env.crosswalk;
    if (
      !this.moments.has('need-to-run') &&
      cw &&
      cw.onRoute &&
      cw.distance < this.cfg.needToRun.curbM &&
      cw.signal === 'dont' &&
      band !== 'brisk' &&
      t - this.briskAt < this.cfg.needToRun.briskWithinS
    ) {
      this.moments.add('need-to-run');
      this.needToRunUntil = t + this.cfg.needToRun.seconds;
    }
    if (t < this.needToRunUntil && cw) {
      const r = reason('pace', 'No need to run', [
        { signal: 'signal', value: cw.signal, weight: 1 },
        { signal: 'toWalk', value: Math.round(cw.toWalk), weight: 1 },
        { signal: 'band.recent', value: 'brisk', weight: 1 },
      ]);
      wants.push({
        id: 'need-to-run',
        component: 'moment',
        zone: 'world',
        level: 'glance',
        anchor: `signal:${cw.id}`,
        content: { name: 'No need to run', reason: r, showReason: false },
        reason: r,
        origin: 'proactive',
      });
    }

    const nar = snap.env.sidewalkNarrowsAhead;
    if (nar && nar.distance < 22 && nar.distance > 0 && !this.moments.has('scaffolding')) {
      this.moments.add('scaffolding');
      this.items.set('scaffolding', { ...newLadderItem('scaffolding'), level: 'glance', since: t, shownAt: t });
    }
    const sit = this.items.get('scaffolding');
    if (sit && sit.level === 'glance' && nar) {
      const limit = this.cfg.autoFoldS[band];
      if (limit !== null && t - sit.shownAt >= limit) {
        sit.level = 'none';
      } else {
        const r = reason('world', 'Scaffolding ahead. Keep to the curb.', [
          { signal: 'sidewalk.narrows', value: `${nar.fromN} to ${nar.toN}`, weight: 1 },
          { signal: 'distance', value: Math.round(nar.distance), weight: 1 },
        ]);
        const c = trimForPace(
          { name: 'Scaffolding ahead', fact: 'Keep to the curb', reason: r },
          band,
          snap.wearer.speed > 0.2 ? nar.distance / snap.wearer.speed : Infinity,
          undefined,
          this.cfg,
        );
        wants.push({
          id: 'scaffolding',
          component: 'moment',
          zone: 'world',
          level: 'glance',
          anchor: 'scaffolding',
          content: c,
          reason: r,
          origin: 'proactive',
        });
      }
    }
  }

  private errandsWants(snap: WorldSnapshot, t: number, _dt: number, band: Band, wants: Want[]): void {
    if (this.stops.length === 0) return;
    const ents = new Map(snap.entities.map((e) => [e.id, e]));
    const ordered = [...this.stops].sort((a, b) => (ents.get(a)?.routeS ?? 0) - (ents.get(b)?.routeS ?? 0));
    const short = (id: string): string =>
      (ents.get(id)?.name ?? id).replace('Main Street ', '').replace('Corner ', '');
    const done = ordered.filter((id) => ents.get(id)?.live.pickedUp === true);
    const closed = ordered.filter((id) => ents.get(id)?.live.closedEarly === true);
    const open = ordered.filter((id) => !done.includes(id) && !closed.includes(id));
    let name = 'Three stops · one route';
    let r = reason('goal', 'In order along the way', [
      { signal: 'stops', value: ordered.length, weight: 1 },
      { signal: 'order', value: ordered.map(short).join(' > '), weight: 1 },
    ]);
    if (closed.length > 0) {
      name = 'Hardware closed early. One stop left.';
      r = reason('world', 'Hardware closed early. One stop left.', [
        { signal: 'live.closedEarly', value: short(closed[0]!), weight: 1 },
        { signal: 'stops.open', value: open.length, weight: 1 },
      ]);
    } else if (done.length > 0) {
      name = open.length === 2 ? 'Two to go' : open.length === 1 ? 'One to go' : 'All done';
    }
    const rows = [
      ...done.map((id) => ({ title: short(id), tone: 'done' as const, value: 'Picked up' })),
      ...closed.map((id) => ({ title: short(id), tone: 'stop' as const, value: 'Closed' })),
      ...open.map((id, i) => ({ key: String(i + 1), title: short(id) })),
    ];
    const key = `${done.join()}|${closed.join()}`;
    if (key !== this.errands.key) {
      this.errands = { key, shownAt: t, movingS: 0, stillS: 0, folded: false };
    }
    if (this.errands.folded) return;
    if (viewFoldDue(this.errands.movingS, this.errands.stillS, false, this.cfg)) {
      this.errands.folded = true;
      return;
    }
    wants.push({
      id: 'errands',
      component: 'errands',
      zone: 'view',
      level: 'card',
      anchor: 'view:edge-right',
      content: { name, rows, reason: r, showReason: name !== r.text },
      reason: r,
      origin: 'goal',
      announce: key,
      timing: band === 'stopped' ? 'now' : 'next-pause',
    });
  }

  private messageWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    const cardOpen = this.cardOpen();
    const anchorFor = (n: Notification): string => (n.type === 'call' ? 'view:edge-top' : 'view:edge-right');
    for (const it of this.inbox.values()) {
      const n = it.n;
      if (it.status === 'done' || n.type === 'social') continue;
      if (it.status === 'shown') {
        const still = n.type === 'call' ? 20 : this.cfg.stoppedToastS;
        if (viewFoldDue(it.movingS, it.stillS, false, this.cfg, still) && n.type !== 'call') {
          it.status = 'done';
          continue;
        }
        if (n.type === 'call' && t - it.shownAt > 20) {
          it.status = 'done';
          continue;
        }
      }
      if (MESSAGE_TYPES.has(n.type) && it.heldInGate && it.status === 'pending') {
        if (this.followups.some((f) => f.id === 'followup')) continue;
      }
      const parts: ReasonPart[] = [
        { signal: 'inbox.type', value: n.type, weight: 1 },
        { signal: 'band', value: band, weight: 1 },
      ];
      let r: Reason;
      let content: Content;
      let level: Level = 'glance';
      let component: ComponentKind = 'toast';
      if (n.type === 'call') {
        component = 'call';
        level = 'card';
        r = reason('social', 'Clear sidewalk ahead', parts);
        content = {
          name: n.from ?? 'Call',
          fact: 'Calling',
          reason: r,
          showReason: false,
          actions: [
            { id: 'answer', label: 'Answer', primary: true },
            { id: 'decline', label: 'Decline' },
          ],
        };
      } else if (n.type === 'app') {
        component = 'strip';
        r = it.heldInGate
          ? reason('gate', 'Held that while you crossed', [...parts, { signal: 'gate', value: 'cleared', weight: 1 }])
          : reason('world', 'Batched with what is open', parts);
        content = {
          name: n.text ?? 'Update',
          ...(n.more ? { fact: `${n.more} more` } : {}),
          reason: r,
          showReason: true,
        };
      } else {
        r =
          this.gateWasPath(n.id) || it.n.at < t - 1
            ? reason('social', 'Held for you', parts)
            : band === 'stopped'
              ? reason('world', 'Long red light', parts)
              : reason('world', 'Clear sidewalk ahead', parts);
        content = {
          name: n.from ?? 'Message',
          fact: n.text ?? '',
          reason: r,
          showReason: false,
          actions: [
            { id: 'reply', label: 'Reply', primary: true },
            { id: 'later', label: 'Later' },
          ],
        };
      }
      const timing = messageTiming(band, false, cardOpen, n.type === 'app');
      wants.push({
        id: n.id,
        component,
        zone: 'view',
        level,
        anchor: anchorFor(n),
        content,
        reason: r,
        origin: n.type === 'call' ? 'call' : n.type === 'app' ? 'app' : 'message',
        timing,
        onCommit: () => {
          if (it.status === 'pending') {
            it.status = 'shown';
            it.shownAt = t;
            it.movingS = 0;
            it.stillS = 0;
          }
        },
        onHold: () => {
          if (this.gateNow.safety) {
            it.heldInGate = true;
            this.heldInGate.add(n.id);
          }
          if (this.gateNow.path) this.pathHeld.add(n.id);
        },
      });
    }

    if (this.social.count > 0 && !this.social.surfaced && band === 'stopped' && !this.gateNow.safety) {
      this.social.surfaced = true;
      this.social.stripUntil = t + 6;
    }
    if (t < this.social.stripUntil) {
      const r = reason('world', 'Long red light', [
        { signal: 'social.count', value: this.social.count, weight: 1 },
        { signal: 'band', value: band, weight: 1 },
      ]);
      wants.push({
        id: 'social',
        component: 'strip',
        zone: 'view',
        level: 'glance',
        anchor: 'view:edge-right',
        content: { name: `${this.social.count} notifications`, fact: 'later', reason: r, showReason: false },
        reason: r,
        origin: 'social',
        timing: 'now',
        onCommit: () => {
          if (t + 0.11 >= this.social.stripUntil) this.social.count = 0;
        },
      });
    } else if (this.social.surfaced && this.social.stripUntil > 0 && t >= this.social.stripUntil) {
      this.social.count = 0;
      this.social.stripUntil = -1;
    }
  }

  private gateWasPath(id: string): boolean {
    return this.pathHeld.has(id);
  }

  private pocketWants(snap: WorldSnapshot, t: number, band: Band, stoppedFor: number, wants: Want[]): void {
    const avail = this.pocket.timeAvailable(snap, this.cfg);
    const gated = this.gateNow.safety || this.gateNow.snooze;
    if (band === 'stopped' && this.pocket.shouldSurface(stoppedFor, avail, gated, this.cfg)) {
      this.pocket.surfacedThisStop = true;
      this.pocketUp = true;
    }
    if (band !== 'stopped') this.pocketUp = false;
    const pinch = snap.wearer.pinch?.target;
    if (pinch?.startsWith('pocket:') && this.pocket.take(pinch.slice(7))) {
      const it = this.item(pinch);
      it.level = 'card';
      it.since = t;
      it.cardAt = t;
      it.shownAt = t;
      it.dwelt = true;
      it.gazeSince = snap.wearer.gaze.target === pinch ? t : null;
      it.lastGazeAt = t;
      it.wasTarget = snap.wearer.gaze.target === pinch;
    }
    const secs = Math.floor(avail);
    if (this.pocketUp && this.pocket.items.length > 0) {
      const ents = new Map(snap.entities.map((e) => [e.id, e]));
      const r = reason('pocket', 'Saved for the next stop', [
        { signal: 'stoppedFor', value: Math.round(stoppedFor * 10) / 10, weight: 1 },
        { signal: 'timeAvailable', value: secs, weight: 1 },
        { signal: 'pocket', value: this.pocket.items.length, weight: 1 },
      ]);
      wants.push({
        id: 'pocket',
        component: 'pocket',
        zone: 'view',
        level: 'card',
        anchor: 'view:glyph',
        content: {
          name: `${secs} s · what you saved`,
          seconds: secs,
          rows: this.pocket.items.map((id) => {
            const e = ents.get(id);
            return { key: `pocket:${id}`, title: e?.name ?? id, value: e?.glance ?? '' };
          }),
          reason: r,
          showReason: false,
        },
        reason: r,
        origin: 'pocket',
      });
    }
    for (const [id, it] of this.items) {
      if (!id.startsWith('pocket:') || it.level === 'none') continue;
      const e = snap.entities.find((x) => x.id === id.slice(7));
      if (!e) continue;
      const isT = snap.wearer.gaze.target === id;
      if (isT) {
        if (!it.wasTarget || it.gazeSince === null) it.gazeSince = t;
        it.lastGazeAt = t;
      } else it.gazeSince = null;
      it.wasTarget = isT;
      const out = step(
        it,
        {
          t,
          band,
          target: isT,
          dwellS: snap.wearer.gaze.dwellMs / 1000,
          pinch: pinch === id,
          floor: 'none',
          proactive: false,
          scoreAbove: false,
          canProactive: false,
        },
        this.cfg,
      );
      const level = out.level === 'pip' ? 'none' : out.level;
      const r = entityReason(e, true, [{ signal: 'pocket', value: 'opened', weight: 1 }]);
      const prev = it.level;
      if (level === 'none') {
        if (!this.gateNow.safety) {
          it.level = 'none';
          it.since = t;
        }
        continue;
      }
      const content =
        level === 'expanded'
          ? expandedContent(e, r, this.chosen.get(e.id))
          : level === 'card'
            ? { ...cardContent(e, r, band), hint: band === 'walk' ? 'PINCH · SAVES FOR LATER' : 'KEEP LOOKING · MORE' }
            : glanceContent(e, r);
      wants.push({
        id,
        component: 'place',
        zone: 'view',
        level: level as Level,
        anchor: 'view:glyph',
        content,
        reason: r,
        origin: 'gaze',
        gaze: isT,
        announce: level === 'expanded' ? `x:${this.chosen.get(e.id) ?? ''}` : undefined,
        onCommit: () => {
          if (level !== prev) {
            if (rank(level) < rank(prev)) it.stepAt = t;
            if (level === 'card') it.cardAt = t;
            it.level = level;
            it.since = t;
          }
        },
      });
    }
  }


  private askWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    if (snap.goal.scenario !== 'walking' || this.goal !== 'walking') return;
    if (this.ask === 'none' && band === 'stopped' && this.foodGlances.size >= this.cfg.ask.foodGlances) {
      this.ask = 'open';
      this.askAt = t;
    }
    if (this.ask !== 'open') return;
    if (band !== 'stopped' && t - this.askAt > 1) {
      this.ask = 'done';
      return;
    }
    const r = reason('world', 'Lunch spots on this block', [
      { signal: 'food.glances', value: this.foodGlances.size, weight: 1 },
      { signal: 'band', value: band, weight: 1 },
    ]);
    wants.push({
      id: 'ask',
      component: 'ask',
      zone: 'view',
      level: 'glance',
      anchor: 'view:edge-right',
      content: {
        name: 'Hungry?',
        reason: r,
        showReason: false,
        actions: [
          { id: 'find-lunch', label: 'Find lunch', primary: true },
          { id: 'no', label: 'No' },
        ],
      },
      reason: r,
      origin: 'proactive',
      timing: 'now',
    });
  }

  private followupWants(t: number, wants: Want[]): void {
    this.followups = this.followups.filter((f) => t < f.until);
    for (const f of this.followups) {
      wants.push({
        id: f.id,
        component: f.component,
        zone: 'view',
        level: 'glance',
        anchor: 'view:edge-right',
        content: f.content,
        reason: f.reason,
        origin: 'followup',
        timing: 'after-gate',
      });
    }
  }

  private arrivalWants(snap: WorldSnapshot, t: number, wants: Want[]): void {
    if (!snap.goal.arrived) return;
    if (!this.arrived) this.arrived = true;
    const id = snap.goal.destination ?? this.destination;
    const e = snap.entities.find((x) => x.id === id);
    if (!e) return;
    if (this.goal === 'hungry' && this.chosen.get(e.id) === 'hold-seat') {
      const r = reason('goal', 'Seat held', [{ signal: 'arrived', value: e.id, weight: 1 }]);
      wants.push({
        id: 'arrival',
        component: 'arrival',
        zone: 'world',
        level: 'glance',
        anchor: e.id,
        content: { name: "Seat's held, inside on the left.", reason: r, showReason: false },
        reason: r,
        origin: 'arrival',
      });
      return;
    }
    const existing = this.standing.get(e.id);
    if (existing && LEVEL_RANK[existing.level] >= LEVEL_RANK.glance) return;
    const r = reason('goal', e.reasons.goal ?? 'End of the walk', [{ signal: 'arrived', value: e.id, weight: 1 }]);
    const it = this.item(e.id);
    wants.push({
      id: e.id,
      component: 'place',
      zone: 'world',
      level: 'glance',
      anchor: e.id,
      content: { name: e.name, fact: e.glance, reason: r, showReason: true },
      reason: r,
      origin: 'arrival',
      onCommit: () => {
        if (!isPane(it.level)) {
          it.level = 'glance';
          it.since = t;
          it.shownAt = t;
          it.dwelt = true;
          it.lastGazeAt = t + 1e6;
        }
      },
    });
  }

  private whisperWants(t: number, wants: Want[]): void {
    if (!this.whisper) return;
    if (t >= this.whisper.until) {
      this.whisper = null;
      return;
    }
    wants.push({
      id: 'whisper',
      component: 'whisper',
      zone: 'view',
      level: 'whisper',
      anchor: 'view:bottom',
      content: this.whisper.content,
      reason: this.whisper.reason,
      origin: 'gaze',
      gaze: true,
    });
  }

  private groundWants(snap: WorldSnapshot, t: number, _band: Band, wants: Want[]): void {
    const cw = snap.env.crosswalk;
    if (cw && cw.onRoute && (cw.distance < 12 || snap.wearer.state === 'crossing')) {
      const walk = cw.signal !== 'dont';
      const secs = walk ? Math.max(0, Math.ceil(cw.secondsLeft + (cw.signal === 'walk' ? 8 : 0))) : Math.ceil(cw.toWalk);
      const r = reason('gate', walk ? 'Walk signal' : 'Wait for the walk signal', [
        { signal: 'signal', value: cw.signal, weight: 1 },
        { signal: 'seconds', value: secs, weight: 1 },
      ]);
      wants.push({
        id: 'safety:signal',
        component: 'safety',
        zone: 'ground',
        level: 'glance',
        anchor: `signal:${cw.id}`,
        content: {
          name: walk ? 'WALK' : 'WAIT',
          seconds: secs,
          tone: cw.signal === 'walk' ? 'go' : cw.signal === 'flash' ? 'warn' : 'stop',
          reason: r,
        },
        reason: r,
        origin: 'safety',
        channel: 'ground',
      });
    }
    const bike = bikeBehind(snap, this.cfg);
    if (bike) {
      const secs = Math.max(1, Math.round(bike.timeToPath ?? 2));
      const r = reason('gate', 'Bike in the lane', [
        { signal: 'bike.timeToPath', value: Math.round((bike.timeToPath ?? 0) * 10) / 10, weight: 1 },
      ]);
      const ahead = { x: snap.wearer.heading.x, z: snap.wearer.heading.z };
      const side = ahead.x * bike.vel.z - ahead.z * bike.vel.x;
      wants.push({
        id: 'safety:bike',
        component: 'safety',
        zone: 'ground',
        level: 'glance',
        anchor: `bike:${bike.id}`,
        content: { name: 'BIKE', fact: `${secs} s`, seconds: secs, tone: 'stop', arrow: side > 0 ? 'left' : 'right', reason: r },
        reason: r,
        origin: 'safety',
        channel: 'ground',
      });
    }

    const stops = this.openStops(snap);
    const routeTo = this.goal === 'errands' && this.stops.length > 0 ? stops[0] : this.destination;
    if (routeTo && !this.arrived) {
      const nar = snap.env.sidewalkNarrowsAhead;
      const r = reason('goal', 'On your route', [
        { signal: 'route.to', value: routeTo, weight: 1 },
        { signal: 'route.offset', value: nar && nar.distance < 30 ? 'curb' : 'center', weight: 1 },
      ]);
      const target = snap.entities.find((e) => e.id === routeTo);
      wants.push({
        id: 'route',
        component: 'route',
        zone: 'ground',
        level: 'glance',
        anchor: 'route',
        content: {
          name: target?.name ?? routeTo,
          route: { to: routeTo, offset: nar && nar.distance < 30 && nar.distance > -6 ? 'curb' : 'center' },
          reason: r,
        },
        reason: r,
        origin: 'ground',
        channel: 'ground',
        announce: routeTo,
      });
    }
    const dest = this.destination ?? (this.goal === 'errands' ? this.stops[this.stops.length - 1] : undefined);
    const de = dest ? snap.entities.find((e) => e.id === dest) : undefined;
    if (de && (routeTo || this.arrived) && (de.distance < 45 || this.arrived)) {
      const r = reason('goal', this.arrived ? 'You made it' : 'On your route', [
        { signal: 'destination', value: de.id, weight: 1 },
        { signal: 'distance', value: Math.round(de.distance), weight: 1 },
      ]);
      wants.push({
        id: 'destination',
        component: 'destination',
        zone: 'ground',
        level: this.arrived ? 'pip' : 'glance',
        anchor: de.id,
        content: { name: de.name, reason: r },
        reason: r,
        origin: 'ground',
        channel: 'ground',
      });
    }
    void t;
  }

  private emitEvent(w: Want, action: Decision['action'], t: number, timing?: Timing): Decision {
    const d = this.toDecision(w, action, timing ?? w.timing ?? 'now');
    this.log.append(t, d, this.snapRef);
    this.frameEvents.push(d);
    return d;
  }

  private signals(w: Want): SignalBundle {
    const s: SignalBundle = {
      speed: Math.round(this.snap.wearer.speed * 100) / 100,
      band: this.bandNow,
      dwellMs: Math.round(this.snap.wearer.gaze.dwellMs),
      gates: gateList(this.gateNow),
      budget: this.budget,
    };
    if (this.snap.wearer.gaze.target) s.gaze = this.snap.wearer.gaze.target;
    if (w.distance !== undefined) s.distance = Math.round(w.distance * 10) / 10;
    if (w.scored) {
      const r = (v: number): number => Math.round(v * 1000) / 1000;
      s.score = {
        relevance: r(w.scored.relevance),
        value: r(w.scored.value),
        proximity: r(w.scored.proximity),
        novelty: r(w.scored.novelty),
        cost: r(w.scored.cost),
      };
    }
    if (this.snap.env.crosswalk) s.signal = this.snap.env.crosswalk.signal;
    return s;
  }

  private toDecision(w: Want, action: Decision['action'], timing: Timing): Decision {
    const moving = this.bandNow !== 'stopped';
    const d: Decision = {
      id: w.id,
      action,
      level: w.level,
      timing,
      channel: w.channel ?? (w.zone === 'view' ? 'edge' : 'visual'),
      placement: {
        anchor: w.anchor,
        zone: w.zone,
        prefer: w.zone === 'ground' ? 'below' : 'side',
        enter: moving && w.zone !== 'ground' ? 'edge' : 'anchor',
        focusOk: w.focusOk === true,
      },
      content: w.content,
      reason: w.reason,
      score: Math.round((w.score ?? 0) * 1000) / 1000,
      band: this.bandNow,
      signals: this.signals(w),
      component: w.component,
    };
    if (w.gaze) d.gaze = true;
    const cause = w.cause ?? DEFAULT_CAUSE[w.origin];
    if (cause) d.cause = cause;
    return d;
  }

  private logHoldOnce(
    id: string,
    zone: Zone,
    level: Level,
    component: ComponentKind,
    r: Reason,
    timing: Timing,
  ): void {
    const key = `${r.kind}|${r.text}|${level}`;
    if (this.holdEpisodes.get(id) === key) return;
    this.holdEpisodes.set(id, key);
    const w: Want = { id, component, zone, level, anchor: id, content: { name: id, reason: r }, reason: r, origin: 'proactive' };
    this.emitEvent(w, 'hold', this.snap.t, timing);
  }

  private verdict(w: Want, prev: Decision | undefined): 'pass' | 'freeze' | { reason: Reason; timing: Timing; keep: boolean } {
    if (w.origin === 'safety' || w.zone === 'ground') return 'pass';
    const g = this.gateNow;
    const parts: ReasonPart[] = [{ signal: 'gates', value: gateList(g).join(' ') || 'none', weight: 1 }];
    if (g.safety) {
      if (prev) return 'freeze';
      return { reason: reason('gate', HOLD_TEXT[g.safetyCause ?? 'crossing'] ?? 'Held: crossing', parts), timing: 'after-gate', keep: false };
    }
    if (g.snooze) {
      return { reason: reason('gate', 'Snoozed', parts), timing: 'next-pause', keep: false };
    }
    if (g.social && w.origin !== 'call') {
      return { reason: reason('social', "When you're free", parts), timing: 'next-pause', keep: Boolean(prev) };
    }
    const isMessage = w.origin === 'message' || w.origin === 'call' || w.origin === 'app';
    if (isMessage && g.path && !prev) {
      return { reason: reason('social', 'Held for you', parts), timing: 'next-pause', keep: false };
    }
    if (w.zone === 'view' && w.component !== 'whisper' && this.bandNow === 'brisk' && !prev) {
      return { reason: reason('pace', 'Saved for the next stop', parts), timing: 'next-pause', keep: false };
    }
    const newShow = (!prev || LEVEL_RANK[prev.level] < LEVEL_RANK.whisper) && LEVEL_RANK[w.level] >= LEVEL_RANK.whisper;
    const budgeted = w.origin === 'proactive' || w.origin === 'message' || w.origin === 'social' || w.origin === 'app' || w.origin === 'goal';
    if (newShow && budgeted && this.budget <= 0) {
      return {
        reason: reason('budget', 'Held: attention budget spent', [...parts, { signal: 'budget', value: this.budget, weight: 1 }]),
        timing: 'next-pause',
        keep: false,
      };
    }
    return 'pass';
  }

  private commit(wants: Want[], t: number, band: Band, gate: GateState): void {
    const next = new Map<string, Decision>();
    for (const w of wants) {
      const prev = this.standing.get(w.id);
      const remove = w.remove === true;
      const v = this.verdict(w, prev);
      if (v === 'freeze') {
        if (prev) next.set(w.id, prev);
        continue;
      }
      if (v !== 'pass') {
        const wouldShow = LEVEL_RANK[w.level] >= LEVEL_RANK.glance || w.level === 'whisper';
        const isNewPip = w.level === 'pip' && !prev && !remove;
        if ((wouldShow || isNewPip) && !(prev && prev.level === w.level && v.keep)) {
          if (!remove && (!prev || LEVEL_RANK[w.level] > LEVEL_RANK[prev.level] || !v.keep)) {
            this.logHoldOnce(w.id, w.zone, w.level, w.component, v.reason, v.timing);
            if (gate.safety) this.heldGlyph.add(w.id);
          }
        }
        w.onHold?.(v.reason);
        if (v.keep && prev) next.set(w.id, prev);
        continue;
      }
      this.holdEpisodes.delete(w.id);
      if (remove) {
        w.onCommit?.();
        continue;
      }
      const action = this.transition(prev, w);
      const timing = w.timing ?? (gate.safety ? 'after-gate' : 'now');
      const d = this.toDecision(w, action ?? prev?.action ?? 'show', timing);
      if (action) {
        this.log.append(t, d, this.snapRef);
        this.frameEvents.push(d);
        if (isShow(d)) this.spendBudget();
      }
      w.onCommit?.();
      next.set(w.id, d);
    }
    for (const [id, prev] of this.standing) {
      if (next.has(id)) continue;
      if (gate.safety && prev.placement.zone !== 'ground') {
        next.set(id, prev);
        continue;
      }
      const li = this.items.get(id);
      if (li && li.level !== 'none' && !this.gateNow.snooze && !id.startsWith('pocket:')) {
        if (!gate.safety) {
          li.level = 'none';
          li.since = t;
        }
      }
      const d: Decision = { ...prev, action: 'dismiss', band, signals: this.signals({ ...(prev as unknown as Want) }) };
      this.log.append(t, d, this.snapRef);
      this.frameEvents.push(d);
    }
    if (this.gateNow.snooze) {
      for (const li of this.items.values()) {
        if (li.level !== 'none' && !next.has(li.id)) {
          li.level = 'none';
          li.since = t;
        }
      }
    }
    this.standing = next;
    if (!gate.safety) this.heldGlyph.clear();
  }


  private transition(prev: Decision | undefined, w: Want): Decision['action'] | null {
    if (w.component === 'pocket' && !prev) return 'surface';
    if (!prev) return 'show';
    const a = LEVEL_RANK[prev.level];
    const b = LEVEL_RANK[w.level];
    const pane = (r: number): boolean => r >= LEVEL_RANK.whisper;
    if (!pane(a) && pane(b)) return 'show';
    if (pane(a) && !pane(b)) return 'demote';
    if (b > a) return 'promote';
    if (b < a) return 'demote';
    if (w.announce !== undefined && w.announce !== this.announced.get(w.id)) {
      const first = !this.announced.has(w.id);
      this.announced.set(w.id, w.announce);
      if (!first) return w.zone === 'ground' ? 'show' : 'promote';
    }
    return null;
  }


  private spendBudget(): void {
    this.budgetUsed++;
    this.budget = Math.max(0, this.budget - 1);
    this.quietS = 0;
  }

  private refillBudget(dt: number, gate: GateState): void {
    const busy = [...this.standing.values()].some(
      (d) => d.placement.zone !== 'ground' && LEVEL_RANK[d.level] >= LEVEL_RANK.whisper,
    );
    if (busy || gate.safety) return;
    this.quietS += dt;
    if (this.quietS >= this.cfg.budget.refillS - 1e-9) {
      this.quietS -= this.cfg.budget.refillS;
      if (this.budget < this.cfg.budget.shows) this.budget++;
    }
  }

  private glyph(t: number, gate: GateState): Glyph | null {
    if (gate.snooze && this.snoozeUntil !== undefined) {
      return { kind: 'snooze', label: `${Math.max(0, Math.ceil(this.snoozeUntil - t))} s` };
    }
    if (gate.safety) {
      const n = this.heldGlyph.size;
      return { kind: 'held', label: n > 1 ? `Held ${n}` : 'Held', count: n };
    }
    if (this.pocket.items.length > 0) {
      return { kind: 'pocket', label: `Pocket ${this.pocket.items.length}`, count: this.pocket.items.length };
    }
    if (this.social.count > 0) {
      return { kind: 'social', label: `${this.social.count} · social`, count: this.social.count };
    }
    return null;
  }
}

export { DEFAULT_CONFIG };
