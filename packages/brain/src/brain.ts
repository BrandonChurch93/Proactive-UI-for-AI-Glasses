import {
  angleWrap,
  clockAt,
  SETTLE,
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
  labelContent,
  liveLine,
  pipContent,
  reason,
  sayFor,
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
  zoneOk?: boolean;
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
  reason?: Reason;
  reply?: string;
  offer?: { place: string; why: string; state: 'waiting' | 'open' | 'yes' | 'no' };
  note?: string;
  seen?: boolean;
  closed?: { at: number; level: Level };
  walkS?: number;
  folded?: boolean;
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

function walkTime(s: number): string {
  return s < 60 ? 'under a minute' : `${Math.ceil(s / 60)} min`;
}

const DEFAULT_CAUSE: Partial<Record<Origin, Cause>> = {
  proactive: 'score',
  gaze: 'dwell',
  message: 'notification',
  social: 'notification',
  app: 'notification',
  safety: 'safety',
  ground: 'goal',
  followup: 'gate',
  arrival: 'arrival',
  goal: 'goal',
  pocket: 'pocket',
};

type MenuCategory = 'food' | 'things' | 'shops' | 'transit';
type MenuState = 'closed' | 'root' | MenuCategory;
const MENU_KINDS: Record<MenuCategory, (e: Entity) => boolean> = {
  food: (e) => e.kind === 'food' || e.kind === 'cafe',
  things: (e) => e.kind === 'theater' || e.kind === 'venue' || e.kind === 'park' || e.category === 'bookshop',
  shops: (e) => (e.kind === 'shop' || e.kind === 'service') && e.category !== 'bookshop',
  transit: (e) => e.kind === 'transit',
};
const MENU_TITLES: Record<MenuCategory, string> = { food: 'Food and drink', things: 'Things to do', shops: 'Shops and services', transit: 'Getting around' };
const MENU_WORDS: Record<string, string> = { 'live theater': 'theater', bowling: 'lanes', bookshop: 'a reading', park: 'a park', pharmacy: 'pharmacy', hardware: 'hardware', 'post office': 'post office' };
function isMenuCategory(v: string): v is MenuCategory {
  return v === 'food' || v === 'things' || v === 'shops' || v === 'transit';
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
function ago(s: number): string {
  return s < 60 ? 'now' : `${Math.floor(s / 60)} min`;
}

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

export class Brain {
  readonly cfg: Config;
  readonly log = new DecisionLog();
  private readonly pace: Pace;
  private readonly pocket = new Pocket();
  private items = new Map<string, LadderItem>();
  private dismissedNow = new Set<string>();
  private standing = new Map<string, Decision>();
  private holdEpisodes = new Map<string, Set<string>>();
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
  private labels = new Map<string, number>();
  private seen = new Map<string, { visible: boolean; since: number }>();
  private wasSettled = true;
  private cardGrownAt = -Infinity;
  private yaw0: number | null = null;
  private headMoved = false;
  private lap = 0;
  private budgetUsed = 0;
  private dismissed: Record<string, number> = {};
  private accepted: Record<string, number> = {};
  private snoozeUntil: number | undefined;
  private lookUpSince: number | null = null;
  private lookUpArmed = true;
  private headMovedAt = -Infinity;
  private lastPitch: number | null = null;
  private lastRelYaw: number | null = null;
  private goal: ScenarioId;
  private destination: string | undefined;
  private chosen = new Map<string, string>();
  private social = { count: 0, surfaced: false, stripUntil: -1 };
  private foodGlances = new Set<string>();
  private ask: 'none' | 'open' | 'done' = 'none';
  private askAt = -1;
  private whisper: { content: Content; reason: Reason; until: number; from: string } | null = null;
  private moments = new Set<string>();
  private needToRunUntil = -1;
  private arrival: string | null = null;
  private routeCause: Cause = 'goal';
  private corner: { lap: number; state: 'wait' | 'done' } | null = null;
  private menu: MenuState = 'closed';
  private mapUntil = -Infinity;
  private routeCauseNext: Cause | null = null;
  private routeWhy: string | null = null;
  private arrivalSaid: string | null = null;
  private atDoorSince: number | null = null;
  private routeShown: string | undefined;
  private overrides: { band: Band | null; gate: boolean; muteSocial: boolean } = {
    band: null,
    gate: false,
    muteSocial: false,
  };
  private frameEvents: Decision[] = [];
  private pathHeld = new Set<string>();
  private forcedDown = new Set<string>();
  private lastTarget: string | null = null;
  private lastTargetAt = -Infinity;
  private scanHold: string | null = null;
  private scanUntil = -Infinity;
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
    this.dismissedNow.clear();
    if (snap.goal.scenario && this.snapRef === 0) this.goal = snap.goal.scenario;
    this.trackArrival(snap);
    this.trackCorner(snap);

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
    this.updateScan(snap, t);
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

    this.ingestInbox(snap, t, dt, band);
    this.applyChoice(snap, t);
    this.applyPick(snap);
    this.applyDismiss(snap, t);

    if ((snap.goal.lap ?? 0) !== this.lap) {
      this.lap = snap.goal.lap ?? 0;
      this.yaw0 = null;
      this.headMoved = false;
    }
    this.yaw0 ??= snap.wearer.gaze.yaw;
    if (Math.abs(angleWrap(snap.wearer.gaze.yaw - this.yaw0)) >= this.cfg.ladder.moveRad) this.headMoved = true;
    const wants: Want[] = [];
    if (t >= this.cfg.quietStartS) {
      this.entityWants(snap, t, band, wants);
      this.peopleWants(snap, wants);
      this.momentWants(snap, t, band, wants);
      this.menuWants(snap, t, band, gate, wants);
      this.mapWants(snap, t, band, gate, wants);
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
        ...(target && tItem ? this.markFor(snap, t, band, target, tItem) : {}),
      },
      goal: {
        scenario: this.goal,
        ...(this.routeTarget(snap) ? { destination: this.routeTarget(snap)! } : {}),
        go: !this.corner || this.corner.state === 'done',
      },
      stoppedFor,
    };
  }

  private routeTarget(_snap: WorldSnapshot): string | undefined {
    return this.destination;
  }

  private trackCorner(snap: WorldSnapshot): void {
    const lap = snap.goal.lap ?? 0;
    if (snap.goal.corner) {
      if (!this.corner || this.corner.lap !== lap) this.corner = { lap, state: 'wait' };
      return;
    }
    if (this.corner) this.corner.state = 'done';
  }

  private setCorner(state: 'wait' | 'done'): void {
    if (this.corner) this.corner.state = state;
  }

  // A place chosen from the menu becomes the destination; a lunch place makes the walk a lunch walk.
  private pick(id: string): void {
    const e = this.snap.entities.find((x) => x.id === id);
    if (!e) return;
    if (e.kind === 'food' || e.kind === 'cafe') this.goal = 'hungry';
    this.setDestination(id, 'choice');
    this.menu = 'closed';
    this.setCorner('done');
  }

  // The brain reads which reply was chosen and what the walk file attaches to it, never the words of the message.
  private answerThread(inb: InboxItem, action: string): boolean {
    const spec = inb.n.replies?.find((x) => x.id === action);
    const fresh = (): void => {
      inb.movingS = 0;
      inb.stillS = 0;
    };
    if (spec && !inb.reply) {
      inb.reply = spec.id;
      this.bump(this.accepted, inb.n.type);
      if (spec.offer) inb.offer = { place: spec.offer.place, why: spec.offer.why, state: spec.answer ? 'waiting' : 'open' };
      fresh();
      return true;
    }
    if (action === 'go' && inb.offer?.state === 'open') {
      inb.offer.state = 'yes';
      this.setDestination(inb.offer.place, 'reply', inb.offer.why);
      fresh();
      return true;
    }
    if (action === 'not-now' && inb.offer?.state === 'open') {
      inb.offer.state = 'no';
      inb.status = 'done';
      return true;
    }
    return false;
  }

  private applyPick(snap: WorldSnapshot): void {
    const target = snap.wearer.pinch?.target;
    if (target?.startsWith('pick:') && this.menu !== 'closed' && this.menu !== 'root') this.pick(target.slice(5));
  }

  private setDestination(id: string | undefined, cause: Cause, why: string | null = null): void {
    if (id === this.destination) return;
    this.destination = id;
    this.routeCauseNext = cause;
    this.routeWhy = why;
  }

  private trackArrival(snap: WorldSnapshot): void {
    const at = snap.goal.arrived ? (snap.goal.destination ?? null) : null;
    const left = this.arrival;
    this.arrival = at;
    if (!left || at === left) return;
    if (this.arrivalSaid === left) this.announced.delete(left);
    this.arrivalSaid = null;
    this.atDoorSince = null;
    if (this.destination === left) this.setDestination(undefined, 'arrival');
    this.goal = 'walking';
  }

  private updateSnooze(snap: WorldSnapshot, t: number): void {
    const g = snap.wearer.gaze;
    const rel = angleWrap(g.yaw - Math.atan2(-snap.wearer.heading.x, -snap.wearer.heading.z));
    if (this.lastPitch === null || this.lastRelYaw === null || Math.abs(g.pitch - this.lastPitch) > 0.01 || Math.abs(angleWrap(rel - this.lastRelYaw)) > 0.015) this.headMovedAt = t;
    this.lastPitch = g.pitch;
    this.lastRelYaw = rel;
    const up = g.pitch > this.cfg.snooze.pitch && !g.target;
    if (!up) {
      this.lookUpSince = null;
      this.lookUpArmed = true;
    } else if (this.lookUpArmed) {
      if (this.lookUpSince === null) this.lookUpSince = t;
      if (t - this.lookUpSince >= this.cfg.snooze.holdS - 1e-9 && t - this.headMovedAt >= this.cfg.snooze.stillS - 1e-9) {
        this.lookUpArmed = false;
        this.lookUpSince = null;
        if (this.snoozeUntil !== undefined && t < this.snoozeUntil) this.snoozeUntil = undefined;
        else this.snoozeUntil = t + this.cfg.snooze.seconds;
      }
    }
    if (this.snoozeUntil !== undefined && t >= this.snoozeUntil) this.snoozeUntil = undefined;
  }

  private updateScan(snap: WorldSnapshot, t: number): void {
    const target = snap.wearer.gaze.target;
    if (target) {
      this.lastTarget = target;
      this.lastTargetAt = t;
    }
    const scanning = snap.wearer.curbDistance < this.cfg.safety.curbScanM && Math.abs(snap.wearer.gaze.yawRate) > 0.8;
    if (scanning && this.lastTarget && t - this.lastTargetAt < 2.5) {
      this.scanHold = this.lastTarget;
      this.scanUntil = t + 0.8;
    }
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
      const have = this.inbox.get(n.id);
      if (have) {
        have.n = n;
        continue;
      }
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
      it.walkS = (band === 'walk' || band === 'brisk') && snap.wearer.gaze.target !== it.n.id ? (it.walkS ?? 0) + dt : 0;
    }
  }

  private applyChoice(snap: WorldSnapshot, t: number): void {
    const c = snap.wearer.choice;
    if (!c) return;
    const inb = this.inbox.get(c.id);
    if (inb?.n.replies && this.answerThread(inb, c.action)) return;
    if (inb) {
      inb.status = 'done';
      if (c.action === 'answer' || c.action === 'reply') this.bump(this.accepted, inb.n.type);
      else this.bump(this.dismissed, inb.n.type);
      return;
    }
    // A recording starts its walk with an intent; Explore lets the light go, Lunch leaves the corner to the menu.
    if (c.id === 'intent') {
      if (c.action === 'hungry' || c.action === 'walking') {
        this.goal = c.action;
        this.ask = 'none';
        this.foodGlances.clear();
        this.setDestination(undefined, 'choice');
        this.routeCauseNext = 'choice';
        if (c.action === 'walking') this.setCorner('done');
      }
      return;
    }
    if (c.id === 'menu') {
      if (c.action === 'open') this.menu = this.menu === 'closed' ? 'root' : 'closed';
      else if (c.action === 'close') this.menu = 'closed';
      else if (c.action === 'back') this.menu = 'root';
      else if (isMenuCategory(c.action)) this.menu = c.action;
      else this.pick(c.action);
      return;
    }
    if (c.id === 'ask') {
      this.ask = 'done';
      if (c.action === 'yes' || c.action === 'find-lunch') {
        this.goal = 'hungry';
        this.menu = 'food';
      }
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
    if (c.action === 'go-instead') {
      this.setDestination(id, 'choice');
      this.bump(this.accepted, this.kindOf(id));
      return;
    }
    this.chosen.set(id, c.action);
    this.bump(this.accepted, this.kindOf(id));
    if (c.action === 'hold-seat' || c.action === 'hold-table') {
      this.setDestination(id, 'choice');
      this.goal = 'hungry';
    }
  }

  private applyDismiss(snap: WorldSnapshot, t: number): void {
    const d = snap.wearer.dismiss;
    if (!d) return;
    const targetId =
      d.target ??
      [...this.standing.values()]
        .filter((x) => x.placement.zone !== 'ground' && LEVEL_RANK[x.level] >= LEVEL_RANK.label)
        .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]?.id;
    if (!targetId) return;
    if (targetId === 'menu') {
      this.menu = 'closed';
      return;
    }
    this.dismissedNow.add(targetId);
    const li = this.items.get(targetId);
    if (li && isPane(li.level)) {
      li.level = li.level === 'label' ? 'pip' : li.level === 'card' ? 'label' : 'card';
      this.labels.delete(targetId);
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

  private proactiveUp(): number {
    let n = 0;
    for (const d of this.standing.values()) if (d.level === 'label' && d.placement.zone === 'world' && !this.labels.has(d.id) && !d.gaze) n++;
    return n;
  }

  private entityWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    const target = snap.wearer.gaze.target;
    const dwellS = snap.wearer.gaze.dwellMs / 1000;
    const pinch = snap.wearer.pinch?.target;
    const cardOpen = this.cardOpen();
    const frozen = this.gateNow.safety;
    const noticed = target && dwellS >= this.cfg.ladder.pipDwellS - 1e-9 ? target : undefined;
    this.updateLabels(snap, t, band, noticed);
    const list = candidates(
      snap.entities,
      {
        goal: this.goal,
        ...(this.destination ? { destination: this.destination } : {}),
        ...(noticed ? { target: noticed } : {}),
        band,
        cardOpenElsewhere: (id) => cardOpen && this.standing.get(id)?.level !== 'card',
        dismissed: this.dismissed,
        accepted: this.accepted,
        presented: this.presented,
      },
      this.cfg,
    );
    const moment = (e: Entity): boolean => e.kind === 'transit' && e.live.busAtStop === true;
    const eligible = list.filter(({ entity: e, scored: sc }) => e.id !== target && sc.pipScore > 0 && (sc.relevance >= this.cfg.ladder.awarenessRelevance || moment(e)));
    const isUp = (id: string): boolean => {
      const d = this.standing.get(id);
      return Boolean(d && d.placement.zone === 'world' && isPane(d.level));
    };
    const others = [...this.standing.values()].filter((d) => isUp(d.id) && !eligible.some((c) => c.entity.id === d.id)).length;
    const rankOf = (c: (typeof list)[number]): number => c.scored.pipScore + (isUp(c.entity.id) ? 100 : this.standing.get(c.entity.id)?.level === 'pip' ? 0.1 : 0) + (moment(c.entity) ? 10 : 0);
    const aware = new Set(
      eligible
        .sort((a, b) => rankOf(b) - rankOf(a))
        .slice(0, Math.max(0, this.cfg.ladder.awarenessPips - others))
        .map(({ entity: e }) => e.id),
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
        if (it.gazeSince === null || !it.wasTarget) this.resumeGaze(it, t);
        it.lastGazeAt = t;
      } else {
        if (it.wasTarget && it.gazeSince !== null) it.paused = { held: t - it.gazeSince, at: t };
        it.gazeSince = null;
        if (this.scanHold === e.id && t < this.scanUntil) it.lastGazeAt = t;
        if (this.routeTarget(snap) === e.id && e.distance < this.cfg.arrival.distanceM * 2) it.lastGazeAt = t;
      }
      it.wasTarget = isT;

      if (sc.score > this.cfg.score.glanceThreshold) it.aboveSince ??= t;
      else it.aboveSince = null;

      if (band !== 'brisk') it.whispered = false;
      else if (
        !isT &&
        !it.whispered &&
        !this.whisper &&
        !isPane(it.level) &&
        sc.relevance >= this.cfg.ladder.awarenessRelevance &&
        it.aboveSince !== null &&
        t - it.aboveSince >= this.cfg.score.promotionHoldS - 1e-9
      ) {
        it.whispered = true;
        this.whisper = { content: whisperContent(e, why, this.goal), reason: why, until: t + this.cfg.whisper.seconds, from: e.id };
      }

      const far = e.distance > this.cfg.ladder.cardWithinM;
      if (it.level === 'card' && it.far && !far) it.cardAt = t;
      it.far = far;
      const labelled = this.labels.has(e.id) || (this.routeTarget(snap) === e.id && e.distance < this.cfg.arrival.distanceM * 2);
      const visible = this.paneVisible(e.id);
      const dtL = Number.isFinite(it.lastT) ? Math.max(0, t - it.lastT) : 0;
      it.lastT = t;
      if (!isT) it.hiddenS = 0;
      if (!visible && isPane(it.level)) {
        if (isT) it.hiddenS += dtL;
        if (Number.isFinite(it.cardAt)) it.cardAt += dtL;
      }
      if (visible) it.hiddenLogged = false;

      const out = step(
        it,
        {
          t,
          band,
          target: isT,
          dwellS: Math.max(0, dwellS - it.hiddenS),
          visible,
          far,
          cardWait: t - this.cardGrownAt < this.cfg.ladder.swapGapS - 1e-9,
          growS: e.distance > this.cfg.ladder.nearM ? this.cfg.ladder.growFarS : this.cfg.ladder.growS,
          still: !this.headMoved,
          pinch: pinch === e.id,
          floor: aware.has(e.id) ? 'pip' : 'none',
          labelled,
          proactive: true,
          scoreAbove: sc.score > this.cfg.score.glanceThreshold,
          canProactive: this.proactiveUp() < this.cfg.ladder.maxProactive,
        },
        this.cfg,
      );
      const level = out.level;
      if (out.via === 'hidden' && isPane(it.level) && !it.hiddenLogged) {
        it.hiddenLogged = true;
        this.logHoldOnce(e.id, 'world', it.level as Level, 'place', reason('world', 'Held until it is back in sight', [{ signal: 'pane.visible', value: 0, weight: 1 }]), 'now', 'hidden');
      }
      if (level === 'card' && isT && rank(it.level) < rank('card')) {
        for (const [id, d] of this.standing) {
          if (id !== e.id && (d.level === 'card' || d.level === 'expanded')) {
            const other = this.items.get(id);
            if (other) {
              other.level = 'label';
              other.since = t;
              other.stepAt = t;
              this.forcedDown.add(id);
            }
          }
        }
      }
      if (level === 'none' && rank(it.level) === 0) continue;
      const gazeDriven = out.via === 'dwell' || out.via === 'pinch' || out.via === 'settle' || it.dwelt || isT || labelled;
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
        focusOk: isT,
        zoneOk: level === 'label' && (band === 'stopped' || band === 'stroll'),
        announce: level === 'expanded' ? `x:${this.chosen.get(e.id) ?? ''}` : level === 'card' ? (e.distance > this.cfg.ladder.cardWithinM ? 'c:compact' : 'c:full') : undefined,
        cause: this.dismissedNow.has(e.id) ? 'dismiss' : this.forcedDown.delete(e.id) ? 'look-away' : via === 'hold' ? undefined : via,
        onCommit: () => this.commitLadder(it, prevLevel, commitLevel, via, t, e, contentKey),
      };
      if (level === 'none') {
        w.level = 'pip';
        w.content = pipContent(e, why);
        w.remove = true;
      }
      wants.push(w);
    }
    const cards = wants.filter((w) => w.component === 'place' && (w.level === 'card' || w.level === 'expanded') && !w.remove);
    if (cards.length > 1) {
      const keep = cards.find((w) => w.gaze) ?? cards[0]!;
      for (const w of cards) {
        if (w === keep) continue;
        const e = snap.entities.find((x) => x.id === w.id);
        const li = this.items.get(w.id);
        if (!e || !li) continue;
        li.level = 'label';
        li.since = t;
        li.stepAt = t;
        w.level = 'label';
        w.cause = 'look-away';
        w.content = this.entityContent(e, 'label', w.reason, band);
        w.onCommit = undefined;
      }
    }
  }

  // A look that comes back within the look-away time takes its hold up where it left it.
  private resumeGaze(it: LadderItem, t: number): void {
    const p = it.paused;
    it.paused = null;
    if (p && t - p.at < this.cfg.ladder.lookAwayS - 1e-9) {
      it.gazeSince = t - p.held;
      if (it.level === 'card' && Number.isFinite(it.cardAt)) it.cardAt += t - p.at;
    } else it.gazeSince = t;
  }

  private markFor(snap: WorldSnapshot, t: number, band: Band, id: string, it: LadderItem): { mark?: { p: number; rate: number; next?: Level } } {
    const e = snap.entities.find((x) => x.id === id);
    if (!e) return {};
    const L = this.cfg.ladder;
    const shown = this.paneVisible(id);
    const ramp = (from: number, s: number): { p: number; rate: number } => ({ p: Math.min(1, Math.max(0, (t - from) / s)), rate: shown ? 1 / s : 0 });
    if (it.level === 'expanded') return { mark: { p: 1, rate: 0 } };
    if (it.level === 'card') {
      const opens = (band === 'stopped' || band === 'stroll') && e.distance <= L.cardWithinM && it.gazeSince !== null && it.gazeSince <= it.cardAt + 1e-9;
      return { mark: opens ? { ...ramp(it.cardAt, L.cardHoldS), next: 'expanded' } : { p: 1, rate: 0 } };
    }
    if (it.level === 'label' && band !== 'brisk' && this.headMoved) {
      const grow = e.distance > L.nearM ? L.growFarS : L.growS;
      return { mark: { ...ramp(Math.max(it.since + it.hiddenS, (it.gazeSince ?? t) + it.hiddenS, this.cardGrownAt + L.swapGapS - grow), grow), next: 'card' } };
    }
    return { mark: { p: 0, rate: 0 } };
  }

  private updateLabels(snap: WorldSnapshot, t: number, band: Band, target: string | undefined): void {
    const settled = snap.wearer.gaze.settled !== false;
    const rose = settled && !this.wasSettled;
    this.wasSettled = settled;
    const lc = this.cfg.labels;
    for (const e of snap.entities) {
      const s = this.seen.get(e.id);
      if (!s || s.visible !== e.visible) this.seen.set(e.id, { visible: e.visible, since: t });
    }
    const held = (id: string, visible: boolean, s: number): boolean => {
      const x = this.seen.get(id);
      return Boolean(x && x.visible === visible && t - x.since >= s - 1e-9);
    };
    for (const e of snap.entities) {
      if (!this.labels.has(e.id) || e.visible || e.id === target) continue;
      // A place at the edge of the view can blink out for a moment; it keeps its label through that.
      if (held(e.id, false, lc.goneS) && t - this.labels.get(e.id)! >= this.cfg.ladder.minShownS - 1e-9) this.labels.delete(e.id);
    }
    if (band === 'brisk') {
      for (const id of [...this.labels.keys()]) if (id !== target) this.labels.delete(id);
    } else if (settled) {
      const inView = snap.entities.filter((e) => e.visible && e.distance <= lc.rangeM).sort((a, b) => a.distance - b.distance).slice(0, lc.max);
      if (rose) {
        const next = new Map<string, number>();
        for (const e of inView) next.set(e.id, this.labels.get(e.id) ?? t);
        this.labels = next;
      } else if (this.headMoved && band !== 'stopped' && Math.abs(snap.wearer.gaze.yawRate) < SETTLE.stillRate) {
        for (const e of inView) if (e.id !== target && e.id !== snap.wearer.gaze.target && !this.labels.has(e.id) && held(e.id, true, lc.joinS) && this.labels.size < lc.max) this.labels.set(e.id, t);
      }
    }
    if (target && snap.entities.some((e) => e.id === target) && !this.labels.has(target)) {
      if (this.labels.size >= lc.max) {
        const far = snap.entities.filter((e) => this.labels.has(e.id)).sort((a, b) => b.distance - a.distance)[0];
        if (far) this.labels.delete(far.id);
      }
      this.labels.set(target, t);
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
      it.dwelt = false;
      it.byLabels = via === 'settle';
    }
    if (isPane(level) && (via === 'dwell' || via === 'pinch')) {
      it.dwelt = true;
      if (e.kind === 'food' || e.kind === 'cafe') this.foodGlances.add(e.id);
    }
    if (isPane(prev) && !isPane(level)) this.presented.set(e.id, contentKey);
    if (level === 'card') {
      it.cardAt = t;
      if (rank(prev) < rank('card')) this.cardGrownAt = t;
    }
    if (!isPane(level)) it.dwelt = rank(level) > 0 && it.dwelt && t - it.lastGazeAt < this.cfg.ladder.lookAwayS;
    it.level = level;
    it.since = t;
  }

  private entityContent(e: Entity, level: PaneLevel, why: Reason, band: Band): Content {
    if (level === 'expanded') return this.decorate(e, expandedContent(e, why, this.goal, new Set(this.inbox.keys()), this.chosen.get(e.id)), level);
    if (level === 'card') return this.decorate(e, cardContent(e, why, band, this.goal, e.distance > this.cfg.ladder.cardWithinM), level);
    if (level === 'label') return trimForPace(labelContent(e, why, this.goal), band === 'stopped' ? 'stroll' : band, undefined, this.cfg);
    return pipContent(e, why);
  }

  // The destination says so in its header; any other lunch place offers itself instead.
  private decorate(e: Entity, c: Content, level: PaneLevel): Content {
    if (this.routeTarget(this.snap) === e.id) return { ...c, chip: 'Going here' };
    if (level === 'card' && this.goal === 'hungry' && this.destination && (e.kind === 'food' || e.kind === 'cafe')) {
      return { ...c, actions: [{ id: 'go-instead', label: 'Go here instead', primary: true }] };
    }
    return c;
  }

  // The wearer's own way to find a place and go there: the categories, then a category's places by walk time.
  private menuWants(snap: WorldSnapshot, t: number, band: Band, gate: GateState, wants: Want[]): void {
    if (band === 'brisk' || gate.safety) this.menu = 'closed';
    if (this.menu === 'closed') return;
    const r = reason('world', 'Find a place', [{ signal: 'menu', value: this.menu, weight: 1 }]);
    const ents = snap.entities;
    if (this.menu === 'root') {
      const food = ents.filter((e) => MENU_KINDS.food(e));
      const m4 = ents.find((e) => e.id === 'm4-stop')?.live;
      const train = ents.find((e) => e.id === '47th-st-station')?.live;
      const names = (cat: MenuCategory): string => {
        const out = ents.filter((e) => MENU_KINDS[cat](e)).map((e) => MENU_WORDS[e.category] ?? e.category).join(', ');
        return out.charAt(0).toUpperCase() + out.slice(1);
      };
      const nearest = Math.round(Math.min(...food.map((e) => e.distance)) / 5) * 5;
      wants.push({
        id: 'menu',
        component: 'menu',
        zone: 'view',
        level: 'card',
        anchor: 'view:menu',
        content: {
          name: 'Where to?',
          fact: `${clockAt(t, true)} · Find a place`,
          reason: r,
          showReason: false,
          actions: [
            { id: 'food', label: 'Food and drink', hint: `${countWord(food.length)} places · nearest ${nearest} m` },
            { id: 'things', label: 'Things to do', hint: names('things') },
            { id: 'shops', label: 'Shops and services', hint: names('shops') },
            { id: 'transit', label: 'Getting around', hint: `M4 in ${m4?.next ?? '-'} min · uptown in ${train?.uptown ?? '-'}` },
            { id: 'close', label: 'Close' },
          ],
        },
        reason: r,
        origin: 'goal',
        timing: 'now',
        announce: 'root',
      });
      return;
    }
    const cat = this.menu;
    const rows = ents
      .filter((e) => MENU_KINDS[cat](e))
      .sort((a, b) => (a.walkS ?? 0) - (b.walkS ?? 0) || a.id.localeCompare(b.id))
      .map((e) => ({ key: `pick:${e.id}`, title: e.name, sub: e.picker ?? sayFor(e, this.goal).short, value: walkTime(e.walkS ?? 0), live: liveLine(e), kind: e.kind, ...(e.img ? { img: e.img } : {}) }));
    wants.push({
      id: 'menu',
      component: 'menu',
      zone: 'view',
      level: 'card',
      anchor: 'view:menu',
      content: { name: 'Where to?', fact: `${MENU_TITLES[cat]} · by walk time`, rows, reason: r, showReason: false, actions: [{ id: 'back', label: 'Back' }] },
      reason: r,
      origin: 'goal',
      timing: 'now',
      announce: cat,
    });
  }

  // The plan of the block, for a destination or for a turn the wearer cannot see yet; the route stays on the ground the whole time.
  private mapWants(snap: WorldSnapshot, t: number, band: Band, gate: GateState, wants: Want[]): void {
    if (snap.goal.arrived) this.mapUntil = Math.max(this.mapUntil, t + 10);
    const cw = snap.env.crosswalk;
    // The held light at the start corner is not a turn: the loop goes on up the block from there.
    const turn = Boolean(cw && cw.distance < 20 && snap.wearer.state !== 'crossing' && !snap.goal.corner);
    const why = this.destination ? 'Route to your pick' : t < this.mapUntil ? 'You made it' : turn ? 'A turn ahead' : null;
    if (!why || band === 'brisk' || gate.safety || this.menu !== 'closed') return;
    const r = reason('world', why, [
      { signal: 'map', value: this.destination ?? (turn ? 'turn' : 'arrived'), weight: 1 },
      ...(cw ? [{ signal: 'crosswalk.distance', value: Math.round(cw.distance), weight: 1 }] : []),
    ]);
    wants.push({ id: 'map', component: 'map', zone: 'view', level: 'card', anchor: 'view:map', content: { name: 'Map', reason: r, showReason: false }, reason: r, origin: 'goal', timing: 'now' });
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
        const c = trimForPace({ name: 'Scaffolding ahead', fact: 'Keep to the curb', reason: r }, band, undefined, this.cfg);
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

  private messageWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    const cardOpen = this.cardOpen();
    for (const it of this.inbox.values()) {
      const n = it.n;
      if (it.status === 'done' || n.type === 'social') continue;
      const thread = n.thread ?? [];
      if (it.offer?.state === 'waiting' && thread.some((l, i) => !l.me && thread.slice(0, i).some((m) => m.me))) {
        it.offer.state = 'open';
        it.movingS = 0;
        it.stillS = 0;
      }
      if (it.closed && t - it.closed.at >= this.cfg.ladder.minShownS - 1e-9) {
        it.status = 'done';
        continue;
      }
      const open = Boolean(n.replies) && (!it.reply || it.offer?.state === 'waiting' || it.offer?.state === 'open');
      if (n.replies && it.status === 'shown' && band === 'brisk') continue;
      // A banner nobody looks at folds after 4 s of walking, as a toast does, and is back once the wearer has stood still half a second, never as a crossing begins.
      if (open && it.status === 'shown' && (it.walkS ?? 0) >= this.cfg.viewFoldS - 1e-9) it.folded = true;
      if (it.folded && band === 'stopped' && this.stoppedSince !== null && t - this.stoppedSince >= 0.5 - 1e-9 && !this.gateNow.safety && snap.env.crosswalk?.signal !== 'walk') {
        it.folded = false;
        it.walkS = 0;
      }
      if (it.folded) continue;
      if (it.status === 'shown' && !open && !it.closed) {
        if (viewFoldDue(it.movingS, it.stillS, false, this.cfg, this.cfg.stoppedToastS)) {
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
      let announce: string | undefined;
      if (n.replies) {
        component = 'thread';
        level = band === 'stopped' ? 'card' : 'glance';
        // After Yes the thread keeps its size, the message, the reply and the routing line for minShownS, then leaves once.
        if (it.offer?.state === 'yes') {
          it.closed ??= { at: t, level };
          level = it.closed.level;
        }
        r =
          it.reason ??
          (this.gateWasPath(n.id) || it.n.at < t - 1
            ? reason('social', 'Held for you', parts)
            : band === 'stopped'
              ? reason('world', 'Long red light', parts)
              : reason('world', 'Clear sidewalk ahead', parts));
        const theirs = [...thread].reverse().find((l) => !l.me);
        content = { name: n.from ?? 'Message', fact: theirs?.text ?? n.text ?? '', avatar: (n.from ?? 'M').slice(0, 1), time: ago(t - n.at), app: 'Messages', reason: r, showReason: false };
        if (level === 'card' || it.reply) content.thread = thread.map((l) => ({ me: l.me, text: l.text }));
        if (!it.reply && (band === 'stopped' || band === 'stroll' || snap.wearer.gaze.target === n.id)) content.actions = n.replies.map((x) => ({ id: x.id, label: x.label }));
        else if (it.offer?.state === 'open') {
          const e = snap.entities.find((x) => x.id === it.offer!.place);
          content.note = `${(e?.name ?? it.offer.place).replace(/^The /, '')} · ${walkTime(e?.walkS ?? 0)} · route there?`;
          content.actions = [
            { id: 'go', label: 'Yes', primary: true },
            { id: 'not-now', label: 'Not now' },
          ];
        } else if (it.offer?.state === 'yes') {
          const e = snap.entities.find((x) => x.id === it.offer!.place);
          content.note = `Routing to ${(e?.name ?? it.offer.place).replace(/^The /, 'the ')}`;
        } else if (it.note) content.note = it.note;
        announce = `${it.reply ?? ''}|${it.offer?.state ?? ''}|${thread.length}`;
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
          it.reason ??
          (this.gateWasPath(n.id) || it.n.at < t - 1
            ? reason('social', 'Held for you', parts)
            : band === 'stopped'
              ? reason('world', 'Long red light', parts)
              : reason('world', 'Clear sidewalk ahead', parts));
        content = {
          name: n.from ?? 'Message',
          fact: n.text ?? '',
          avatar: (n.from ?? 'M').slice(0, 1),
          time: ago(t - n.at),
          app: 'Messages',
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
        anchor: n.type === 'app' ? 'view:edge-right' : 'view:banner',
        content,
        reason: r,
        origin: n.type === 'app' ? (it.heldInGate ? 'followup' : 'app') : 'message',
        timing,
        ...(announce !== undefined ? { announce } : {}),
        onCommit: () => {
          it.reason ??= r;
          it.seen = true;
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
    const busy = this.arrival !== null || (this.corner !== null && this.corner.state !== 'done');
    const gated = this.gateNow.safety || this.gateNow.snooze || busy;
    if (busy && band === 'stopped') this.pocket.surfacedThisStop = true;
    if (band === 'stopped' && this.pocket.shouldSurface(stoppedFor, avail, gated, this.cfg)) {
      this.pocket.surfacedThisStop = true;
      this.pocketUp = true;
    }
    if (band !== 'stopped') this.pocketUp = false;
    const pinch = snap.wearer.pinch?.target;
    const openedNow = new Set<string>();
    if (pinch?.startsWith('pocket:') && this.pocket.take(pinch.slice(7))) {
      openedNow.add(pinch);
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
            return { key: `pocket:${id}`, title: e?.name ?? id, value: e?.glance ?? '', ...(e ? { kind: e.kind } : {}), ...(e?.img ? { img: e.img } : {}) };
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
          pinch: pinch === id && !openedNow.has(id),
          floor: 'none',
          labelled: false,
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
          ? expandedContent(e, r, this.goal, new Set(this.inbox.keys()), this.chosen.get(e.id))
          : level === 'card'
            ? cardContent(e, r, band, this.goal)
            : trimForPace(labelContent(e, r, this.goal), band === 'stopped' ? 'stroll' : band, undefined, this.cfg);
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
        cause: this.dismissedNow.has(id) ? 'dismiss' : openedNow.has(id) ? 'pinch' : out.via === 'hold' || out.via === 'score' ? 'dwell' : out.via,
        announce: level === 'expanded' ? `x:${this.chosen.get(e.id) ?? ''}` : undefined,
        onCommit: () => {
          if (level !== prev) {
            if (rank(level) < rank(prev)) it.stepAt = t;
              it.level = level;
            it.since = t;
          }
        },
      });
    }
  }


  private askWants(snap: WorldSnapshot, t: number, band: Band, wants: Want[]): void {
    if (snap.goal.scenario !== 'walking' || this.goal !== 'walking') return;
    const stoppedFor = this.stoppedSince === null ? 0 : t - this.stoppedSince;
    if (this.ask === 'none' && band === 'stopped' && stoppedFor >= this.cfg.pocket.stoppedForS - 1e-9 && this.foodGlances.size >= this.cfg.ask.foodGlances) {
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
    for (const f of this.followups) {
      if (t < f.until || f.id !== 'followup') continue;
      for (const it of this.inbox.values()) if (MESSAGE_TYPES.has(it.n.type) && it.heldInGate && it.status === 'pending') it.status = 'done';
    }
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
    if (!this.arrival) return;
    const id = this.arrival;
    const e = snap.entities.find((x) => x.id === id);
    if (!e) return;
    if (this.goal === 'hungry' && this.chosen.get(e.id) === 'hold-seat') {
      const r = reason('goal', 'Seat held', [{ signal: 'arrived', value: e.id, weight: 1 }]);
      wants.push({
        id: 'arrival',
        component: 'arrival',
        zone: 'world',
        level: 'glance',
        anchor: `door:${e.id}`,
        content: { name: "Seat's held, inside on the left.", reason: r, showReason: false },
        reason: r,
        origin: 'arrival',
        zoneOk: true,
      });
      return;
    }
    const level: Level = 'label';
    const r = reason('goal', this.routeWhy ?? e.reasons.goal ?? 'You made it', [{ signal: 'arrived', value: e.id, weight: 1 }]);
    const own = wants.findIndex((w) => w.id === e.id);
    const mine = own >= 0 && !wants[own]!.remove ? wants[own]! : null;
    if (mine) {
      mine.anchor = `door:${e.id}`;
      mine.zoneOk = true;
      if (LEVEL_RANK[mine.level] >= LEVEL_RANK[level]) {
        mine.content = mine.level === 'label' ? { name: e.name, fact: e.glance, reason: r, showReason: true } : { ...mine.content, reason: r, showReason: true };
        mine.reason = r;
        if (this.arrivalSaid !== e.id && this.paneVisible(e.id)) {
          if (!this.announced.has(e.id)) this.announced.set(e.id, 'on the way');
          mine.cause = 'arrival';
          this.arrivalSaid = e.id;
        }
        if (this.arrivalSaid === e.id) mine.announce = 'arrived';
        return;
      }
      if (isPane(mine.level)) {
        mine.anchor = `door:${e.id}`;
        mine.zoneOk = true;
        // The promotion waits for the pane to stand at the door in sight, not for one visible frame between folds at the edge.
        if (this.paneVisible(e.id)) this.atDoorSince ??= t;
        else this.atDoorSince = null;
        if (this.atDoorSince === null || t - this.atDoorSince < this.cfg.arrival.anchorS - 1e-9) return;
      }
    }
    if (own >= 0) wants.splice(own, 1);
    const it = this.item(e.id);
    wants.push({
      id: e.id,
      component: 'place',
      zone: 'world',
      level,
      anchor: `door:${e.id}`,
      content: { name: e.name, fact: e.glance, reason: r, showReason: true },
      reason: r,
      origin: 'arrival',
      zoneOk: true,
      onCommit: () => {
        if (LEVEL_RANK[it.level] < LEVEL_RANK[level]) {
          it.level = level;
          it.since = t;
          it.shownAt = t;
          it.dwelt = true;
        }
        it.lastGazeAt = t;
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
      origin: 'proactive',
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

    const routeTo = this.routeTarget(snap);
    if (routeTo !== this.routeShown) {
      this.routeShown = routeTo;
      this.routeCause = this.routeCauseNext ?? 'goal';
      this.routeCauseNext = null;
    }
    if (routeTo && !this.arrival) {
      const nar = snap.env.sidewalkNarrowsAhead;
      const why = this.routeWhy ?? (this.goal === 'hungry' && this.routeCause === 'choice' ? 'Your pick for lunch' : null);
      const r = reason('goal', why ?? 'On your route', [
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
          ...(target ? { fact: walkTime(target.walkS ?? 0) } : {}),
          route: { to: routeTo, offset: nar && nar.distance < 30 && nar.distance > -6 ? 'curb' : 'center' },
          reason: r,
        },
        reason: r,
        origin: 'ground',
        channel: 'ground',
        announce: routeTo,
        cause: this.routeCause,
      });
    }
    const dest = this.arrival ?? routeTo;
    const de = dest ? snap.entities.find((e) => e.id === dest) : undefined;
    if (de && (de.distance < 45 || this.arrival)) {
      const r = reason('goal', this.arrival ? 'You made it' : 'On your route', [
        { signal: 'destination', value: de.id, weight: 1 },
        { signal: 'distance', value: Math.round(de.distance), weight: 1 },
      ]);
      wants.push({
        id: 'destination',
        component: 'destination',
        zone: 'ground',
        level: this.arrival ? 'pip' : 'glance',
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
        focusOk: w.focusOk === true,
        ...(w.zoneOk ? { zoneOk: true } : {}),
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

  private paneVisible(id: string): boolean {
    return this.snap.env.panes?.find((p) => p.id === id)?.visible ?? true;
  }

  private logHoldOnce(
    id: string,
    zone: Zone,
    level: Level,
    component: ComponentKind,
    r: Reason,
    timing: Timing,
    cause?: Cause,
  ): void {
    const key = `${r.kind}|${r.text}|${level}`;
    const seen = this.holdEpisodes.get(id) ?? new Set<string>();
    if (seen.has(key)) return;
    seen.add(key);
    this.holdEpisodes.set(id, seen);
    const w: Want = { id, component, zone, level, anchor: id, content: { name: id, reason: r }, reason: r, origin: 'proactive' };
    if (cause) w.cause = cause;
    this.emitEvent(w, 'hold', this.snap.t, timing);
    if (cause === 'hidden') seen.delete(key);
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
    if (g.social) {
      return { reason: reason('social', "When you're free", parts), timing: 'next-pause', keep: Boolean(prev) };
    }
    const isMessage = w.origin === 'message' || w.origin === 'app';
    if (isMessage && g.path && !prev) {
      return { reason: reason('social', 'Held for you', parts), timing: 'next-pause', keep: false };
    }
    if (w.zone === 'view' && w.component !== 'whisper' && this.bandNow === 'brisk' && !prev) {
      return { reason: reason('pace', 'Saved for the next stop', parts), timing: 'next-pause', keep: false };
    }
    const newShow = (!prev || LEVEL_RANK[prev.level] < LEVEL_RANK.whisper) && LEVEL_RANK[w.level] >= LEVEL_RANK.whisper;
    const asked = w.component === 'menu' || w.component === 'map';
    const budgeted = !asked && (w.origin === 'proactive' || w.origin === 'message' || w.origin === 'social' || w.origin === 'app' || w.origin === 'goal');
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
        const wouldShow = LEVEL_RANK[w.level] >= LEVEL_RANK.label || w.level === 'whisper';
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
      if (action && prev && prev.level === w.level && w.announce !== undefined && w.zone !== 'ground' && w.announce.startsWith('x:')) d.cause = 'choice';
      if (action) {
        this.log.append(t, d, this.snapRef);
        this.frameEvents.push(d);
        if (isShow(d) && !this.earned(w, d)) this.spendBudget();
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
    if (w.announce !== undefined && (!prev || LEVEL_RANK[prev.level] < LEVEL_RANK.whisper)) this.announced.set(w.id, w.announce);
    if (w.component === 'pocket' && !prev) return 'surface';
    if (!prev) return 'show';
    const a = LEVEL_RANK[prev.level];
    const b = LEVEL_RANK[w.level];
    const pane = (r: number): boolean => r >= LEVEL_RANK.whisper;
    const moved = (action: Decision['action']): Decision['action'] => {
      if (w.announce !== undefined) this.announced.set(w.id, w.announce);
      return action;
    };
    if (!pane(a) && pane(b)) return moved('show');
    if (pane(a) && !pane(b)) return moved('demote');
    if (b > a) return moved('promote');
    if (b < a) return moved('demote');
    if (w.announce !== undefined && w.announce !== this.announced.get(w.id)) {
      const first = !this.announced.has(w.id);
      this.announced.set(w.id, w.announce);
      if (!first) return w.zone === 'ground' ? 'show' : 'promote';
    }
    return null;
  }


  // The budget is for what the brain volunteers; answers to the wearer's own choices and arrivals are earned.
  private earned(w: Want, d: Decision): boolean {
    if (w.component === 'menu' || w.component === 'map') return true;
    if (w.component === 'thread' && this.inbox.get(w.id)?.seen) return true;
    return d.cause === 'dwell' || d.cause === 'pinch' || d.cause === 'settle' || d.cause === 'arrival' || d.cause === 'choice';
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
    const arming = this.lookUpArmed && this.lookUpSince !== null && t - this.lookUpSince >= this.cfg.snooze.holdS - this.cfg.snooze.stillS - 1e-9 && t - this.headMovedAt >= 0.2 - 1e-9;
    if (arming && !gate.safety) return { kind: 'snooze', label: 'Snoozing' };
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
