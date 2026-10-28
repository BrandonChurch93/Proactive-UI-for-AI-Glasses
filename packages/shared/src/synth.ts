import { PLACES, type LiveValue, type ScenarioId, type SignalState } from './data';
import { readSignal, type SignalAnchor } from './signal';
import type { Entity, Notification, NotificationType, PersonInfo, VehicleInfo, VehicleKind, WorldSnapshot } from './types';
import { add, boxAround, dist, v3 } from './vec';
import { AVENUE_CROSSWALK_N, BLOCK, placeAnchor, placeDoor, zOf } from './world';

export interface CaseSpec {
  id: string;
  rule?: string;
  description?: string;
  scenario: ScenarioId;
  duration: number;
  startN?: number;
  pace: [number, number][];
  gaze?: [number, string | null][];
  pinch?: [number, string][];
  choice?: [number, string, string][];
  choose?: { t: number; id: string; row: string }[];
  dismiss?: [number, string | null][];
  pitch?: [number, number][];
  yaw?: [number, number][];
  settled?: [number, boolean][];
  crossing?: [number, number];
  signal?: { at: number; state: SignalState; secondsLeft: number };
  inbox?: { t: number; id: string; type: NotificationType; from?: string; text?: string; count?: number; more?: number }[];
  people?: { from: number; to: number; id: string; aheadM: number; onPath: boolean }[];
  vehicles?: {
    from: number;
    to: number;
    id: string;
    kind: VehicleKind;
    timeToPath?: number;
    fromBehind?: boolean;
    wearerSide?: boolean;
  }[];
  live?: { t: number; id: string; set: Record<string, LiveValue> }[];
  narrows?: { t: number; fromN: number; toN: number };
  arrive?: { t: number; id: string };
  conversation?: [number, number];
  only?: string[];
  config?: Record<string, unknown>;
}

const step = <T>(track: [number, T][] | undefined, t: number, fallback: T): T => {
  let v = fallback;
  for (const [at, val] of track ?? []) if (at <= t + 1e-9) v = val;
  return v;
};

export function synthesize(spec: CaseSpec, hz = 10): WorldSnapshot[] {
  const out: WorldSnapshot[] = [];
  const dt = 1 / hz;
  let n = spec.startN ?? 0;
  let gazeId: string | null = null;
  let gazeSince = 0;
  let prevYaw = 0;
  const live = new Map<string, Record<string, LiveValue>>(PLACES.map((p) => [p.id, { ...p.live }]));
  const anchor: SignalAnchor | undefined = spec.signal ? { ...spec.signal, leg: 'avenue' } : undefined;
  const frames = Math.round(spec.duration * hz);
  for (let i = 0; i <= frames; i++) {
    const t = Math.round(i * dt * 1000) / 1000;
    const crossing = spec.crossing !== undefined && t >= spec.crossing[0] && t < spec.crossing[1];
    const speed = crossing ? 1.38 : step(spec.pace, t, 0);
    if (i > 0) n += (crossing ? 0 : speed) * dt;
    const g = step(spec.gaze, t, null as string | null);
    if (g !== gazeId) {
      gazeId = g;
      gazeSince = t;
    }
    for (const l of spec.live ?? []) if (Math.abs(l.t - t) < dt / 2) Object.assign(live.get(l.id) ?? {}, l.set);
    const x = crossing && spec.crossing ? BLOCK.wearerX - ((t - spec.crossing[0]) / (spec.crossing[1] - spec.crossing[0])) * 16.6 : BLOCK.wearerX;
    const pos = v3(x, 1.68, zOf(n));
    const turned = step(spec.yaw, t, 0);
    const yawRate = i === 0 ? 0 : (turned - prevYaw) / dt;
    prevYaw = turned;
    const yaw = spec.yaw ? turned : gazeId && i > 0 ? 0.12 : 0;
    const entities: Entity[] = PLACES.filter((p) => !spec.only || spec.only.includes(p.id)).map((p) => {
      const a = placeAnchor(p);
      const e: Entity = {
        id: p.id,
        name: p.name,
        kind: p.kind,
        category: p.category,
        side: p.side,
        pos: a,
        door: placeDoor(p),
        live: { ...(live.get(p.id) ?? {}) },
        glance: p.glance,
        depth: p.depth,
        distance: dist(pos, a),
        routeS: p.n ? (p.n[0] + p.n[1]) / 2 : 110,
        visible: -a.z > n - 5,
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
    });
    const inbox: Notification[] = (spec.inbox ?? [])
      .filter((m) => m.t <= t + 1e-9)
      .map((m) => {
        const note: Notification = { id: m.id, type: m.type, at: m.t };
        if (m.from) note.from = m.from;
        if (m.text) note.text = m.text;
        if (m.count !== undefined) note.count = m.count;
        if (m.more !== undefined) note.more = m.more;
        return note;
      });
    const people: PersonInfo[] = (spec.people ?? [])
      .filter((p) => t >= p.from && t < p.to)
      .map((p) => {
        const c = v3(BLOCK.wearerX, 0.9, zOf(n + p.aheadM));
        return { id: p.id, pos: c, bounds: boxAround(c, v3(0.3, 0.9, 0.3)), facing: false, onPath: p.onPath, ahead: p.aheadM };
      });
    const vehicles: VehicleInfo[] = (spec.vehicles ?? [])
      .filter((v) => t >= v.from && t < v.to)
      .map((v) => {
        const c = add(pos, v3(-2, -0.9, 4));
        const out: VehicleInfo = { id: v.id, kind: v.kind, pos: c, vel: v3(0, 0, -5), bounds: boxAround(c, v3(1, 1, 2)) };
        if (v.timeToPath !== undefined) out.timeToPath = v.timeToPath;
        if (v.fromBehind !== undefined) out.fromBehind = v.fromBehind;
        if (v.wearerSide !== undefined) out.wearerSide = v.wearerSide;
        return out;
      });
    const snap: WorldSnapshot = {
      t,
      wearer: {
        pos,
        heading: v3(0, 0, -1),
        speed,
        state: crossing ? 'crossing' : speed < 0.2 ? 'stopped' : 'walking',
        curbDistance: Math.max(0, AVENUE_CROSSWALK_N - 1.2 - n),
        gaze: {
          dwellMs: gazeId ? Math.round((t - gazeSince) * 1000) : 0,
          dir: v3(0, 0, -1),
          pitch: step(spec.pitch, t, 0),
          yaw,
          yawRate,
          settled: step(spec.settled, t, true),
          ...(gazeId ? { target: gazeId } : {}),
        },
      },
      env: { vehicles, people, backdrop: {} },
      social: {
        inConversation: spec.conversation !== undefined && t >= spec.conversation[0] && t < spec.conversation[1],
        companions: 0,
      },
      entities,
      inbox,
      goal: { scenario: spec.scenario },
      wearerModel: { dismissed: {}, accepted: {}, budgetUsed: 0, budget: 7, pocket: [] },
    };
    const pinch = spec.pinch?.find(([at]) => Math.abs(at - t) < dt / 2);
    if (pinch) snap.wearer.pinch = { target: pinch[1] };
    const choice = spec.choice?.find(([at]) => Math.abs(at - t) < dt / 2);
    if (choice) snap.wearer.choice = { id: choice[1], action: choice[2] };
    const pick = spec.choose?.find((c) => Math.abs(c.t - t) < dt / 2);
    if (pick) snap.wearer.choice = { id: pick.id, action: PLACES.find((p) => p.id === pick.id)?.expanded?.actions.find((a) => a.primary)?.id ?? 'choose', row: pick.row };
    const dismiss = spec.dismiss?.find(([at]) => Math.abs(at - t) < dt / 2);
    if (dismiss) snap.wearer.dismiss = dismiss[1] ? { target: dismiss[1] } : {};
    if (anchor) {
      const s = readSignal(anchor, 'avenue', t);
      const distance = Math.max(0, AVENUE_CROSSWALK_N - 1.2 - n);
      snap.env.crosswalk = {
        id: 'avenue-south',
        leg: 'avenue',
        distance: crossing ? 0 : distance,
        signal: s.state,
        secondsLeft: s.secondsLeft,
        toWalk: s.toWalk,
        inRoadway: crossing,
        onRoute: true,
      };
    }
    if (spec.narrows && t >= spec.narrows.t) {
      snap.env.sidewalkNarrowsAhead = { fromN: spec.narrows.fromN, toN: spec.narrows.toN, distance: spec.narrows.fromN - n };
    }
    if (spec.arrive && t >= spec.arrive.t) {
      snap.goal.destination = spec.arrive.id;
      snap.goal.arrived = true;
    }
    out.push(snap);
  }
  return out;
}

