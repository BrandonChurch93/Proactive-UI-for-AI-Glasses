import {
  PLACE_BY_ID,
  PLACES,
  WALK,
  isScenarioId,
  angleOffAxis,
  angleWrap,
  pitchToward,
  yawToward,
  boxAround,
  dist,
  fovForAspect,
  nOf,
  placeAnchor,
  placeDoor,
  project,
  readSignal,
  v3,
  zOf,
  type CameraPose,
  type Crosswalk,
  type Entity,
  type LiveValue,
  type Notification,
  type ThreadLine,
  type PaneReport,
  type PersonInfo,
  type Beat,
  type ScenarioId,
  type SignalAnchor,
  type Vec3,
  type VehicleInfo,
  type Viewport,
  type WorldSnapshot,
  Settle,
} from '@lumen/shared';
import { Backdrop, type Dynamic } from './backdrop';
import { ALBEDO, buildLayout, type BlockLayout } from './layout';
import { SouthSignal } from './crossing';
import { People, type ScriptedPerson } from './people';
import { Head, STEEP, ScriptedReviewer, type Events } from './reviewer';
import { START, crossingAnchor, doorSpur, nearestS, routeLoop, routeTo, type Route } from './route';
import { LANE_BY_ID, Traffic, type ScriptedVehicle, type Vehicle } from './traffic';
import { DOOR_S, Wearer } from './wearer';

export const SIM_HZ = 60;
export const TICK_HZ = 10;
export const WARMUP = 40;

export interface SimOptions {
  seed?: number;
  viewport?: Viewport;
  layout?: BlockLayout;
  suggest?: ScenarioId | null;
}

export interface LiveInput {
  headYaw?: number;
  headPitch?: number;
  gazeId?: string | null;
}

const GAZE_ACQUIRE = (3.5 * Math.PI) / 180;
const GAZE_RELEASE = (6.0 * Math.PI) / 180;
const GAZE_FLICKER_S = 0.6;

const PICKUP_S = 3;

export interface Plan {
  destination?: string;
  go?: boolean;
}

export class Sim {
  readonly scenario: ScenarioId;
  readonly suggest: ScenarioId | undefined;
  readonly layout: BlockLayout;
  readonly signal: SignalAnchor;
  readonly south: SouthSignal;
  readonly wearer: Wearer;
  readonly traffic: Traffic;
  readonly people: People;
  readonly head: Head;
  private readonly settle = new Settle();
  readonly reviewer: ScriptedReviewer;
  readonly backdrop: Backdrop;
  viewport: Viewport;
  t: number;
  scripted = true;
  live: LiveInput = {};
  intent: ScenarioId | null = null;
  intentAt = -Infinity;
  lap = 0;
  holdUntil: number;
  reroutes: { t: number; to: string }[] = [];
  private timeline: Beat[];
  private want = 'start';
  private lastArrived: string | null = null;
  private liveData = new Map<string, Record<string, LiveValue>>();
  private gazeTarget: string | null = null;
  private gazeSince = 0;
  private lostGaze: { id: string; at: number; since: number } | null = null;
  private lastTickT = -Infinity;
  private pendingLive: Events = {};
  private anchors = new Map<string, Vec3>();
  private threads = new Map<string, ThreadLine[]>();

  constructor(scenario: ScenarioId, opts: SimOptions = {}) {
    const seed = opts.seed ?? 47;
    this.scenario = scenario;
    this.suggest = opts.suggest === null ? undefined : (opts.suggest ?? scenario);
    this.layout = opts.layout ?? buildLayout(seed);
    this.signal = { at: 0, leg: 'avenue', state: WALK.signal.state, secondsLeft: WALK.signal.secondsLeft };
    this.south = new SouthSignal(-WARMUP, false);
    this.wearer = new Wearer(
      {
        speeds: WALK.speeds,
        pace: WALK.pace,
        signal: (leg, t) => (leg === 'south' ? this.south.read(t) : readSignal(this.signal, leg, t)),
        ask: (leg, t) => {
          if (leg === 'south') this.south.request(t);
        },
      },
      routeLoop(START),
    );
    this.holdUntil = WALK.holdS;
    this.reviewer = new ScriptedReviewer(WALK.recordings[scenario].beats);
    this.viewport = opts.viewport ?? { w: 1280, h: 800 };
    this.backdrop = new Backdrop(this.layout.colliders, this.layout.sunDir);
    for (const p of PLACES) {
      this.liveData.set(p.id, { ...p.live });
      this.anchors.set(p.id, placeAnchor(p));
    }
    this.timeline = WALK.beats.filter((b) => !b.after);
    this.traffic = new Traffic(seed, this.signal, this.scriptedVehicles(this.timeline), -WARMUP, () => this.south.vehicle());
    this.people = new People({ seed, signal: this.signal, avoidCrosswalks: ['avenue', 'cross'], scripted: this.scriptedPeople(this.timeline) }, -WARMUP);
    this.head = new Head(this.wearer.bodyYaw + 0.26, 0.05);
    this.t = -WARMUP;
    const dt = 1 / SIM_HZ;
    let held = false;
    while (this.t < -1e-9) {
      if (!held && this.t >= -6) {
        this.south.hold(this.t);
        held = true;
      }
      this.south.step(this.t);
      this.traffic.step(this.t, dt);
      this.people.step(this.t, dt, this.wearer.pos, true);
      this.t = Math.round((this.t + dt) * 1e6) / 1e6;
    }
    this.t = 0;
  }

  get route(): Route {
    return this.wearer.route;
  }

  get holding(): boolean {
    return this.wearer.holding;
  }

  private scriptedVehicles(beats: readonly Beat[]): ScriptedVehicle[] {
    const out: ScriptedVehicle[] = [];
    for (const b of beats) {
      if (b.kind === 'vehicle') {
        const startN = b.fromN - 27;
        out.push({
          id: b.id,
          body: 'truck',
          lane: b.lane === 'near' ? 'nb-out' : 'nb-in',
          spawnAt: b.t - (b.fromN - startN) / b.speed,
          spawnS: startN + 180,
          crawl: { from: b.fromN, to: b.toN, speed: b.speed, after: -Infinity },
        });
      }
      if (b.kind === 'bus') {
        const arrive = b.t + b.arrivesIn;
        out.push({ id: 'm4-bus', body: 'bus', lane: 'nb-out', spawnAt: arrive - 15.5, spawnS: 180 - 40, dwell: { at: arrive, until: arrive + (b.dwellS ?? 9), s: 180 + 60.6 }, v0: 8.5 });
      }
      if (b.kind === 'bike') {
        const speed = 5.5;
        const lineN = 87.6;
        const startN = lineN - (b.timeToPath + 2) * speed;
        out.push({ id: 'bike', body: 'bike', lane: 'nb-out', spawnAt: b.t - 2, spawnS: startN + 180, lateral: 1.35, ignoresSignal: true, v0: speed });
      }
    }
    return out;
  }

  private scriptedPeople(beats: readonly Beat[]): ScriptedPerson[] {
    const out: ScriptedPerson[] = [];
    for (const b of beats) {
      if (b.kind === 'person') {
        out.push({ id: b.id, path: [{ x: 6.2, n: 89.9 }, { x: 16, n: 89.85 }, { x: 24, n: 89.2 }, { x: 31.5, n: 84.2 }], speed: b.speed, spawnAt: b.t - 1 });
      }
    }
    return out;
  }

  private startIntent(id: ScenarioId, t: number): void {
    this.intent = id;
    this.intentAt = t;
    const beats = WALK.beats.filter((b) => b.after === 'intent' && b.intent === id).map((b) => ({ ...b, t: Math.round((t + b.t) * 1e6) / 1e6 }));
    this.timeline = [...this.timeline, ...beats].sort((a, b) => a.t - b.t);
    for (const b of beats) if (b.kind === 'stops') for (const sid of b.ids) this.liveData.set(sid, { ...PLACE_BY_ID.get(sid)?.live });
    for (const v of this.scriptedVehicles(beats)) this.traffic.add(v);
    for (const p of this.scriptedPeople(beats)) this.people.add(p);
  }

  private release(t: number): void {
    if (!this.wearer.holding) return;
    this.wearer.holding = false;
    this.south.release(t);
  }

  plan(p: Plan): void {
    if (p.destination !== this.lastArrived) this.lastArrived = null;
    const dest = p.destination && p.destination !== this.lastArrived && doorSpur(p.destination) ? p.destination : 'start';
    this.want = dest;
    if (p.go && this.wearer.holding) this.release(this.t);
  }

  private dwelling(t: number): boolean {
    const w = this.wearer;
    return w.arrivedAt !== null && w.route.target !== 'start' && t - w.arrivedAt < DOOR_S;
  }

  private navigate(t: number): void {
    const w = this.wearer;
    if (w.holding && t >= this.holdUntil - 1e-9) this.release(t);
    if (w.arrivedAt !== null && w.route.target === 'start') {
      this.lap++;
      w.setRoute(routeLoop(START));
      w.holding = true;
      this.holdUntil = t + WALK.holdS;
      this.south.hold(t);
      this.want = 'start';
      return;
    }
    if (w.arrivedAt !== null && !this.dwelling(t)) {
      this.lastArrived = w.route.target;
      if (this.want === w.route.target) this.want = 'start';
      this.reroute(this.want, t);
      return;
    }
    if (w.arrivedAt !== null && t - w.arrivedAt >= PICKUP_S && this.stopIds().includes(w.route.target)) {
      const live = this.liveData.get(w.route.target);
      if (live && live.pickedUp !== true) live.pickedUp = true;
    }
    if (this.want !== w.route.target && w.state !== 'crossing' && !this.dwelling(t)) {
      this.reroute(this.want, t);
      if (this.want !== 'start') this.release(t);
    }
  }

  private reroute(target: string, t: number): void {
    const w = this.wearer;
    const at = w.where();
    w.setRoute(target === 'start' ? routeLoop(at) : routeTo(at, target));
    this.reroutes.push({ t, to: target });
  }

  private walkSeconds(id: string): number {
    const r = this.route.target === id ? this.route.length - this.wearer.s : routeTo(this.wearer.where(), id).length;
    return Math.round(r / WALK.speeds.walk);
  }

  private stopIds(): string[] {
    const b = this.timeline.filter((x) => x.kind === 'stops' && x.t <= this.t + 1e-9).at(-1);
    return b && b.kind === 'stops' ? b.ids : [];
  }

  anchorOf = (id: string): Vec3 | undefined => {
    const a = this.anchors.get(id);
    if (a) return a;
    if (id.startsWith('door:')) {
      const p = PLACE_BY_ID.get(id.slice(5));
      if (!p) return undefined;
      const d = placeDoor(p);
      return v3(d.x, 2.3, d.z);
    }
    if (id.startsWith('person:')) {
      const p = this.people.people.find((q) => q.id === id.slice(7));
      return p ? v3(p.pos.x, p.height * 0.78, p.pos.z) : undefined;
    }
    if (id.startsWith('signal:')) {
      const leg = id === 'signal:south' ? 'south' : id === 'signal:cross-east' ? 'cross' : 'avenue';
      return crossingAnchor(leg, this.wearer.pos.x < 0);
    }
    if (id === 'scaffolding') return v3(10.4, 2.8, zOf(52.6));
    return undefined;
  };

  cameraPose(): CameraPose {
    return { pos: this.wearer.pos, yaw: this.head.yaw, pitch: this.head.pitch, fov: fovForAspect(this.viewport.w / this.viewport.h) };
  }

  liveOf(id: string): Record<string, LiveValue> {
    return this.liveData.get(id) ?? {};
  }

  private applyLiveBeats(a: number, b: number): void {
    for (const beat of this.timeline) {
      if (beat.kind === 'live' && beat.t > a + 1e-9 && beat.t <= b + 1e-9) Object.assign(this.liveData.get(beat.id) ?? {}, beat.set);
    }
    const bus = this.traffic.vehicles.find((v) => v.id === 'm4-bus');
    const m4 = this.liveData.get('m4-stop');
    if (m4) m4.busAtStop = Boolean(bus && bus.dwell && b >= bus.dwell.at - 1 && b < bus.dwell.until && Math.abs(bus.s - bus.dwell.s) < 3 && bus.v < 0.5);
  }

  step(dt: number): void {
    const t0 = this.t;
    const t1 = Math.round((t0 + dt) * 1e6) / 1e6;
    if (this.scripted) for (const x of this.reviewer.intents) if (x.t > t0 + 1e-9 && x.t <= t1 + 1e-9) this.startIntent(x.id, t1);
    this.south.step(t1);
    this.navigate(t1);
    this.wearer.step(t1, dt);
    this.traffic.step(t1, dt);
    this.people.step(t1, dt, this.wearer.pos, this.wearer.speed > 0.2);
    if (this.scripted) {
      const aim = this.reviewer.aim(t1, this.wearer.pos, this.wearer.bodyYaw, this.anchorOf, this.wearer.state === 'crossing');
      this.head.step(dt, aim.yaw, aim.pitch, aim.omega);
    } else {
      const ty = this.live.headYaw ?? this.head.yaw;
      const tp = this.live.headPitch ?? this.head.pitch;
      this.head.step(dt, ty, tp, 11);
    }
    this.applyLiveBeats(t0, t1);
    this.settle.step(this.head.yawRate, dt);
    this.updateGaze(t1);
    this.t = t1;
  }

  advanceTo(t: number): void {
    const dt = 1 / SIM_HZ;
    while (this.t < t - 1e-7) this.step(dt);
  }

  private updateGaze(t: number): void {
    let id: string | null = null;
    if (this.scripted) {
      const want = this.reviewer.gazeId(t);
      if (want?.startsWith('pocket:')) id = want;
      else if (want) {
        const a = this.reviewer.aimPoint(t, this.anchorOf);
        if (a) {
          const off = this.offTarget(a);
          const keep = this.gazeTarget === want && off < GAZE_RELEASE;
          if (off < GAZE_ACQUIRE || keep) id = want;
        }
      }
    } else {
      id = this.live.gazeId ?? null;
    }
    if (id !== this.gazeTarget) {
      if (this.gazeTarget) this.lostGaze = { id: this.gazeTarget, at: t, since: this.gazeSince };
      const back = id !== null && this.lostGaze?.id === id && t - this.lostGaze.at <= GAZE_FLICKER_S + 1e-9;
      this.gazeTarget = id;
      this.gazeSince = back ? this.lostGaze!.since : t;
    }
  }

  offTarget(a: Vec3): number {
    const pose = this.cameraPose();
    const eye = pose.pos;
    const yawDiff = Math.abs(angleWrap(yawToward(eye, a) - pose.yaw));
    const top = pitchToward(eye, a);
    const bottom = Math.min(top, STEEP);
    const below = Math.max(0, bottom - 0.04 - pose.pitch);
    const above = Math.max(0, pose.pitch - top - 0.04);
    if (top > STEEP) return Math.hypot(yawDiff * Math.cos(pose.pitch), below, above);
    return angleOffAxis(pose, a);
  }

  setLiveEvents(ev: Events): void {
    if (ev.choice?.id === 'intent' && isScenarioId(ev.choice.action)) this.startIntent(ev.choice.action, this.t);
    this.pendingLive = { ...this.pendingLive, ...ev };
  }

  get gaze(): { target: string | null; dwellMs: number } {
    return { target: this.gazeTarget, dwellMs: this.gazeTarget ? Math.round((this.t - this.gazeSince) * 1000) : 0 };
  }

  private crosswalk(): Crosswalk | undefined {
    const w = this.wearer;
    if (w.holding) {
      const left = Math.max(0, this.holdUntil - this.t) + 0.6;
      return { id: 'south', leg: 'south', distance: 0, signal: 'dont', secondsLeft: r2(left), toWalk: r2(left), inRoadway: false, onRoute: true };
    }
    const stop = w.nextStop();
    if (!stop) return undefined;
    const reading = stop.leg === 'south' ? this.south.read(this.t) : readSignal(this.signal, stop.leg, this.t);
    const crossing = w.state === 'crossing';
    return {
      id: stop.leg === 'avenue' ? 'avenue-south' : stop.leg === 'cross' ? 'cross-east' : 'south',
      leg: stop.leg,
      distance: crossing ? 0 : Math.max(0, stop.s - w.s),
      signal: reading.state,
      secondsLeft: Math.round(reading.secondsLeft * 100) / 100,
      toWalk: Math.round(reading.toWalk * 100) / 100,
      inRoadway: crossing,
      onRoute: true,
    };
  }

  private vehicleInfo(): VehicleInfo[] {
    const w = this.wearer;
    const moving = w.speed > 0.3 || w.state === 'crossing';
    const path = moving ? w.pathAhead(3) : [];
    const out: VehicleInfo[] = [];
    for (const v of this.traffic.vehicles) {
      const pose = this.traffic.pose(v);
      if (dist(pose.pos, w.pos) > 60) continue;
      const lane = LANE_BY_ID.get(v.lane)!;
      const vel = v3(lane.dir.x * v.v, 0, lane.dir.z * v.v);
      const info: VehicleInfo = { id: v.id, kind: v.kind, pos: rv(pose.pos), vel: rv(vel), bounds: rb(this.traffic.bounds(v)) };
      const ttp = this.timeToPath(v, pose.pos, vel, path);
      if (ttp !== undefined) info.timeToPath = Math.round(ttp * 100) / 100;
      if (v.kind === 'bike') {
        info.fromBehind = vel.z < 0 && nOf(pose.pos.z) < nOf(w.pos.z) + 1;
        info.wearerSide = Math.sign(pose.pos.x) === Math.sign(w.pos.x);
        if (w.crossing?.leg === 'avenue' && v.v > 0.5) {
          const lineZ = zOf(87.6);
          const t = (lineZ - (pose.pos.z - (lane.dir.z * v.len) / 2)) / vel.z;
          if (t > 0 && t < 4) info.timeToPath = Math.round(t * 100) / 100;
        }
      }
      out.push(info);
    }
    return out;
  }

  private timeToPath(v: Vehicle, pos: Vec3, vel: Vec3, path: Vec3[]): number | undefined {
    if (path.length === 0 || v.v < 0.3) return undefined;
    const speed = Math.hypot(vel.x, vel.z) || 1;
    const ax = vel.x / speed;
    const az = vel.z / speed;
    for (let tau = 0; tau <= 3 + 1e-9; tau += 0.1) {
      const cx = pos.x + vel.x * tau;
      const cz = pos.z + vel.z * tau;
      for (const q of path) {
        const dx = q.x - cx;
        const dz = q.z - cz;
        const along = Math.abs(dx * ax + dz * az) - v.len / 2;
        const lat = Math.abs(-dx * az + dz * ax) - v.width / 2;
        if (Math.hypot(Math.max(0, along), Math.max(0, lat)) < 0.7) return tau;
      }
    }
    return undefined;
  }

  private peopleInfo(): PersonInfo[] {
    const w = this.wearer;
    const out: PersonInfo[] = [];
    for (const p of this.people.people) {
      if (!p.alive || p.spawnAt > this.t) continue;
      const d = dist(v3(p.pos.x, 0, p.pos.z), v3(w.pos.x, 0, w.pos.z));
      if (d > 30) continue;
      const s = nearestS(this.route, p.pos);
      const ahead = s - w.s;
      const lateral = this.lateralToRoute(p.pos);
      const onPath = p.speed < 0.3 && ahead > 0 && ahead <= 12 && lateral <= 2;
      const c = v3(p.pos.x, p.height / 2, p.pos.z);
      const toW = Math.atan2(-(w.pos.x - p.pos.x), -(w.pos.z - p.pos.z));
      let dh = toW - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      out.push({ id: p.id, pos: rv(v3(p.pos.x, 0, p.pos.z)), bounds: rb(boxAround(c, v3(0.3, p.height / 2, 0.3))), facing: Math.abs(dh) < 1.1, onPath, ahead: Math.round(ahead * 10) / 10 });
    }
    return out;
  }

  private lateralToRoute(p: Vec3): number {
    let best = Infinity;
    const pts = this.route.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
      best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
    }
    return best;
  }

  private entities(pose: CameraPose): Entity[] {
    const out: Entity[] = [];
    for (const p of PLACES) {
      const a = this.anchors.get(p.id)!;
      const pr = project(pose, this.viewport, a);
      const e: Entity = {
        id: p.id,
        name: p.name,
        kind: p.kind,
        category: p.category,
        side: p.side,
        pos: a,
        door: placeDoor(p),
        live: { ...this.liveOf(p.id) },
        glance: p.glance,
        depth: p.depth,
        distance: Math.round(dist(this.wearer.pos, a) * 100) / 100,
        routeS: Math.round(nearestS(this.route, placeDoor(p)) * 10) / 10,
        walkS: this.walkSeconds(p.id),
        visible: pr.inFront && pr.x > 0 && pr.x < this.viewport.w && pr.y > 0 && pr.y < this.viewport.h,
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
      if (p.picker) e.picker = p.picker;
      if (p.img) e.img = p.img;
      out.push(e);
    }
    return out;
  }

  private inbox(): Notification[] {
    const out: Notification[] = [];
    let social = 0;
    for (const b of this.timeline) {
      if (b.kind !== 'inbox' || b.t > this.t + 1e-9) continue;
      const id = b.id ?? `${b.type}-${social++}`;
      const n: Notification = { id, type: b.type, at: b.t };
      if (b.from) n.from = b.from;
      if (b.text) n.text = b.text;
      if (b.count !== undefined) n.count = b.count;
      if (b.more !== undefined) n.more = b.more;
      if (b.replies) {
        n.replies = b.replies;
        n.thread = [{ me: false, text: b.text ?? '', at: b.t }, ...(this.threads.get(id) ?? []).filter((l) => l.at <= this.t + 1e-9)];
      }
      out.push(n);
    }
    return out;
  }

  // The other side of a conversation is the world's: a reply goes into the thread, and the answer the walk file gives for it follows.
  private answer(id: string, replyId: string): void {
    const b = this.timeline.find((x) => x.kind === 'inbox' && x.id === id);
    if (!b || b.kind !== 'inbox' || !b.replies || this.threads.has(id)) return;
    const r = b.replies.find((x) => x.id === replyId);
    if (!r) return;
    const lines: ThreadLine[] = [{ me: true, text: r.label, at: this.t }];
    if (r.answer) lines.push({ me: false, text: r.answer.text, at: Math.round((this.t + r.answer.after) * 1000) / 1000 });
    this.threads.set(id, lines);
  }

  dynamicColliders(): Dynamic[] {
    const out: Dynamic[] = [];
    for (const v of this.traffic.vehicles) out.push({ box: this.traffic.bounds(v), albedo: ALBEDO.vehicle });
    for (const p of this.people.people) {
      if (!p.alive) continue;
      out.push({ box: boxAround(v3(p.pos.x, p.height / 2, p.pos.z), v3(0.25, p.height / 2, 0.25)), albedo: ALBEDO.person });
    }
    return out;
  }

  snapshot(view?: { w: number; h: number; panes: PaneReport[] }): WorldSnapshot {
    const w = this.wearer;
    const pose = this.cameraPose();
    const events = this.scripted ? this.reviewer.eventsBetween(this.lastTickT, this.t) : this.pendingLive;
    if (events.choice) this.answer(events.choice.id, events.choice.action);
    this.pendingLive = {};
    this.lastTickT = this.t;
    const backdrop: Record<string, number> = {};
    if (view) {
      const dyn = this.dynamicColliders();
      for (const p of view.panes) if (p.visible && p.rect.w > 0) backdrop[p.id] = this.backdrop.sampleRect(pose, view, p.rect, dyn);
    }
    const narrows = this.timeline.find((b) => b.kind === 'sidewalkNarrows' && b.t <= this.t + 1e-9);
    const snap: WorldSnapshot = {
      t: Math.round(this.t * 1000) / 1000,
      wearer: {
        pos: v3(round(w.pos.x), round(w.pos.y), round(w.pos.z)),
        heading: v3(round(w.heading.x), 0, round(w.heading.z)),
        speed: round(w.speed),
        state: w.state,
        curbDistance: round(w.curbDistance()),
        gaze: {
          dwellMs: this.gaze.dwellMs,
          dir: v3(round(-Math.sin(pose.yaw) * Math.cos(pose.pitch)), round(Math.sin(pose.pitch)), round(-Math.cos(pose.yaw) * Math.cos(pose.pitch))),
          pitch: round(this.head.pitch),
          yaw: round(this.head.yaw),
          yawRate: round(this.head.yawRate),
          settled: this.settle.settled,
          ...(this.gazeTarget ? { target: this.gazeTarget } : {}),
        },
      },
      env: { vehicles: this.vehicleInfo(), people: this.peopleInfo(), backdrop },
      social: { inConversation: false, companions: 0 },
      entities: this.entities(pose),
      inbox: this.inbox(),
      goal: { scenario: this.intent ?? 'walking', lap: this.lap },
      wearerModel: { dismissed: {}, accepted: {}, budgetUsed: 0, budget: 7, pocket: [] },
    };
    if (events.pinch) snap.wearer.pinch = { target: events.pinch };
    if (events.choice) snap.wearer.choice = events.choice;
    if (events.dismiss !== undefined) snap.wearer.dismiss = events.dismiss ? { target: events.dismiss } : {};
    const cw = this.crosswalk();
    if (cw) snap.env.crosswalk = cw;
    if (narrows && narrows.kind === 'sidewalkNarrows') {
      const n = nOf(w.pos.z);
      if (n < narrows.toN) snap.env.sidewalkNarrowsAhead = { fromN: narrows.fromN, toN: narrows.toN, distance: round(narrows.fromN - n) };
    }
    const stops = this.stopIds();
    if (stops.length) snap.goal.stops = stops.map((id) => ({ id }));
    if (this.intent) snap.goal.intentAt = round(this.intentAt);
    if (w.holding) snap.goal.corner = true;
    if (this.suggest && this.lap === 0) snap.goal.suggest = this.suggest;
    if (w.route.target !== 'start') snap.goal.destination = w.route.target;
    if (this.dwelling(this.t)) snap.goal.arrived = true;
    if (view) {
      snap.view = view;
      snap.env.panes = view.panes.map((p) => (p.hiddenBy ? { id: p.id, visible: p.visible, hiddenBy: p.hiddenBy } : { id: p.id, visible: p.visible }));
    }
    return snap;
  }
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const rv = (p: Vec3): Vec3 => v3(r2(p.x), r2(p.y), r2(p.z));
const rb = (b: { min: Vec3; max: Vec3 }): { min: Vec3; max: Vec3 } => ({ min: rv(b.min), max: rv(b.max) });
