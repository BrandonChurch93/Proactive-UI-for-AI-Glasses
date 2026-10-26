import { AVENUE_CROSSWALK, BLOCK, CROSS_CROSSWALK, PLACE_BY_ID, POST_OFFICE, SOUTH_CROSSWALK, placeDoor, nOf, v3, zOf, type Leg, type Vec3 } from '@lumen/shared';

export interface RoutePoint {
  x: number;
  n: number;
}

export interface RoutePiece {
  edge: string;
  d0: number;
  d1: number;
  s0: number;
  s1: number;
}

export interface Route {
  points: Vec3[];
  cum: number[];
  length: number;
  stops: { s: number; leg: Leg; crossEnd: number }[];
  end: number;
  pieces: RoutePiece[];
  target: string;
}

export type Node = 'SE' | 'NE' | 'NW' | 'SW' | 'XS' | 'XN';

interface Edge {
  id: string;
  a: Node;
  b: Node;
  pts: RoutePoint[];
  cum: number[];
  len: number;
  leg?: Leg;
}

const P = (x: number, n: number): RoutePoint => ({ x, n });

const AVE_E = BLOCK.avenueHalf + 1.2;
const SE = P(AVE_E, SOUTH_CROSSWALK.n);
const SW = P(-AVE_E, SOUTH_CROSSWALK.n);
const NE = P(AVE_E, AVENUE_CROSSWALK.n);
const NW = P(-AVE_E, AVENUE_CROSSWALK.n);
const XS = P(CROSS_CROSSWALK.x, BLOCK.crossFrom - 1.3);
const XN = P(CROSS_CROSSWALK.x, BLOCK.crossTo + 0.7);
const WEST_X = -8.8;
const DOOR_STAND = 3.4;

function edge(id: string, a: Node, b: Node, pts: RoutePoint[], leg?: Leg): Edge {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.n - pts[i - 1]!.n));
  const e: Edge = { id, a, b, pts, cum, len: cum[cum.length - 1]! };
  if (leg) e.leg = leg;
  return e;
}

export const EDGES: readonly Edge[] = [
  edge('E', 'SE', 'NE', [SE, P(BLOCK.wearerX, 1.0), P(BLOCK.wearerX, 43.2), P(7.75, 45.4), P(7.75, 52.6), P(9.9, 55.2), P(9.9, 60.8), P(BLOCK.wearerX, 62.6), P(BLOCK.wearerX, 85.4), P(8.25, 87.0), NE]),
  edge('CN', 'NE', 'XS', [NE, P(8.9, 87.9), XS]),
  edge('XC', 'XS', 'XN', [XS, XN], 'cross'),
  edge('AN', 'NE', 'NW', [NE, NW], 'avenue'),
  edge('W', 'NW', 'SW', [NW, P(-8.5, 86.4), P(WEST_X, 84), P(WEST_X, 1.0), SW]),
  edge('AS', 'SW', 'SE', [SW, SE], 'south'),
];

const EDGE_BY_ID = new Map(EDGES.map((e) => [e.id, e]));
const LOOP = ['E', 'AN', 'W', 'AS'];

export interface GraphPos {
  edge: string;
  d: number;
}

function pointOn(e: Edge, d: number): RoutePoint {
  const dd = Math.max(0, Math.min(e.len, d));
  let i = 1;
  while (i < e.cum.length - 1 && e.cum[i]! < dd) i++;
  const a = e.pts[i - 1]!;
  const b = e.pts[i]!;
  const seg = e.cum[i]! - e.cum[i - 1]!;
  const k = seg > 0 ? (dd - e.cum[i - 1]!) / seg : 0;
  return P(a.x + (b.x - a.x) * k, a.n + (b.n - a.n) * k);
}

function project(e: Edge, p: RoutePoint): { d: number; dist: number } {
  let best = { d: 0, dist: Infinity };
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1]!;
    const b = e.pts[i]!;
    const dx = b.x - a.x;
    const dn = b.n - a.n;
    const l2 = dx * dx + dn * dn || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.n - a.n) * dn) / l2));
    const dist = Math.hypot(p.x - (a.x + dx * k), p.n - (a.n + dn * k));
    if (dist < best.dist) best = { d: e.cum[i - 1]! + Math.sqrt(l2) * k, dist };
  }
  return best;
}

function slice(e: Edge, d0: number, d1: number): RoutePoint[] {
  const out: RoutePoint[] = [pointOn(e, d0)];
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);
  const inner = e.cum.map((c, i) => ({ c, i })).filter(({ c }) => c > lo + 1e-6 && c < hi - 1e-6);
  if (d1 < d0) inner.reverse();
  for (const { i } of inner) out.push(e.pts[i]!);
  out.push(pointOn(e, d1));
  return out;
}

interface Spur {
  edge: Edge;
  attach: number;
}

const spurs = new Map<string, Spur>();

export function doorSpur(id: string): Spur | undefined {
  const cached = spurs.get(id);
  if (cached) return cached;
  const place = PLACE_BY_ID.get(id);
  if (!place) return undefined;
  const door = placeDoor(place);
  const dn = nOf(door.z);
  let s: Spur;
  if (id === 'post-office' || place.side === 'X') {
    const pts = [XN, P(12.4, BLOCK.crossTo + 2.1), P(POST_OFFICE.door.x - 1.2, POST_OFFICE.door.n - 3.4), P(POST_OFFICE.door.x - 0.4, POST_OFFICE.door.n - 2.8)];
    s = { edge: edge(`spur:${id}`, 'XN', 'XN', pts), attach: -1 };
  } else {
    const side = place.side === 'W' ? EDGE_BY_ID.get('W')! : EDGE_BY_ID.get('E')!;
    const at = project(side, P(place.side === 'W' ? WEST_X : BLOCK.wearerX, dn));
    const from = pointOn(side, at.d);
    const endX = place.side === 'W' ? door.x + DOOR_STAND : door.x - DOOR_STAND;
    const far = place.side === 'W' ? endX < from.x - 0.3 : endX > from.x + 0.3;
    const pts = far ? [from, P(endX, dn)] : [from, from];
    s = { edge: edge(`spur:${id}`, side.a, side.a, pts), attach: at.d };
  }
  spurs.set(id, s);
  return s;
}

function edgeOf(id: string): Edge | undefined {
  if (id.startsWith('spur:')) return doorSpur(id.slice(5))?.edge;
  return EDGE_BY_ID.get(id);
}

interface Step {
  edge: Edge;
  d0: number;
  d1: number;
}

function nodePoint(n: Node): RoutePoint {
  return { SE, NE, NW, SW, XS, XN }[n];
}

function dijkstra(from: Map<Node, { cost: number; steps: Step[] }>): Map<Node, { cost: number; steps: Step[] }> {
  const best = new Map(from);
  const open = new Set(best.keys());
  while (open.size) {
    let u: Node | null = null;
    for (const n of open) if (u === null || best.get(n)!.cost < best.get(u)!.cost) u = n;
    open.delete(u!);
    const bu = best.get(u!)!;
    for (const e of EDGES) {
      const fwd = e.a === u ? e.b : e.b === u ? e.a : null;
      if (!fwd) continue;
      const c = bu.cost + e.len;
      if (!best.has(fwd) || best.get(fwd)!.cost > c + 1e-9) {
        best.set(fwd, { cost: c, steps: [...bu.steps, { edge: e, d0: e.a === u ? 0 : e.len, d1: e.a === u ? e.len : 0 }] });
        open.add(fwd);
      }
    }
  }
  return best;
}

interface Start {
  host: Edge;
  d: number;
  prefix: Step[];
  cost: number;
}

function hostOf(sp: Edge): Edge {
  return EDGE_BY_ID.get(sp.a === 'SE' ? 'E' : 'W')!;
}

function startOf(pos: GraphPos): Start {
  const e = edgeOf(pos.edge)!;
  if (!e.id.startsWith('spur:')) return { host: e, d: pos.d, prefix: [], cost: 0 };
  const sp = doorSpur(e.id.slice(5))!;
  const back: Step = { edge: e, d0: pos.d, d1: 0 };
  if (sp.attach < 0) {
    const xc = EDGE_BY_ID.get('XC')!;
    return { host: xc, d: xc.len, prefix: [back], cost: pos.d };
  }
  return { host: hostOf(e), d: sp.attach, prefix: [back], cost: pos.d };
}

function originOf(st: Start): Map<Node, { cost: number; steps: Step[] }> {
  const e = st.host;
  const origin = new Map<Node, { cost: number; steps: Step[] }>();
  const toA: Step[] = st.d > 1e-6 ? [{ edge: e, d0: st.d, d1: 0 }] : [];
  const toB: Step[] = e.len - st.d > 1e-6 ? [{ edge: e, d0: st.d, d1: e.len }] : [];
  origin.set(e.a, { cost: st.cost + st.d, steps: [...st.prefix, ...toA] });
  origin.set(e.b, { cost: st.cost + e.len - st.d, steps: [...st.prefix, ...toB] });
  return origin;
}

function build(steps: Step[], target: string): Route {
  const pts: RoutePoint[] = [];
  const pieces: RoutePiece[] = [];
  const stops: { s: number; leg: Leg; crossEnd: number }[] = [];
  let s = 0;
  for (const st of steps) {
    const sp = slice(st.edge, st.d0, st.d1);
    const len = Math.abs(st.d1 - st.d0);
    if (st.edge.leg && len > 1e-6) stops.push({ s, leg: st.edge.leg, crossEnd: s + len });
    pieces.push({ edge: st.edge.id, d0: st.d0, d1: st.d1, s0: s, s1: s + len });
    for (const p of sp) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.n - p.n) > 1e-6) pts.push(p);
    }
    s += len;
  }
  if (pts.length === 1) pts.push({ ...pts[0]! });
  const points = pts.map((p) => v3(p.x, 0, zOf(p.n)));
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const length = cum[cum.length - 1]!;
  const scale = s > 1e-6 ? length / s : 1;
  for (const st of stops) {
    st.s *= scale;
    st.crossEnd *= scale;
  }
  for (const pc of pieces) {
    pc.s0 *= scale;
    pc.s1 *= scale;
  }
  return { points, cum, length, stops, end: length, pieces, target };
}

export const START: GraphPos = { edge: 'E', d: 0 };

// Callers reroute only on a sidewalk; the sim holds a new destination until the far curb of a crossing.
export function routeTo(pos: GraphPos, target: string): Route {
  const st = startOf(pos);
  const best = dijkstra(originOf(st));
  if (target === 'start') return build(best.get('SE')!.steps, target);
  const sp = doorSpur(target);
  if (!sp) return routeLoop(pos);
  const tail: Step = { edge: sp.edge, d0: 0, d1: sp.edge.len };
  if (sp.attach < 0) return build([...best.get('XN')!.steps, tail], target);
  const host = hostOf(sp.edge);
  const viaA = best.get(host.a)!.cost + sp.attach;
  const viaB = best.get(host.b)!.cost + host.len - sp.attach;
  const here = st.host.id === host.id ? st.cost + Math.abs(st.d - sp.attach) : Infinity;
  if (here <= Math.min(viaA, viaB)) return build([...st.prefix, { edge: host, d0: st.d, d1: sp.attach }, tail], target);
  if (viaA <= viaB) return build([...best.get(host.a)!.steps, { edge: host, d0: 0, d1: sp.attach }, tail], target);
  return build([...best.get(host.b)!.steps, { edge: host, d0: host.len, d1: sp.attach }, tail], target);
}

export function routeLoop(pos: GraphPos): Route {
  const st = startOf(pos);
  const steps: Step[] = [...st.prefix];
  let at = st.host;
  let d = st.d;
  if (at.id === 'XC' || at.id === 'CN') {
    if (at.id === 'XC') {
      steps.push({ edge: at, d0: d, d1: 0 });
      const cn = EDGE_BY_ID.get('CN')!;
      steps.push({ edge: cn, d0: cn.len, d1: 0 });
    } else steps.push({ edge: at, d0: d, d1: 0 });
    at = EDGE_BY_ID.get('AN')!;
    d = 0;
  }
  steps.push({ edge: at, d0: d, d1: at.len });
  for (let i = LOOP.indexOf(at.id) + 1; i < LOOP.length; i++) {
    const nx = EDGE_BY_ID.get(LOOP[i]!)!;
    steps.push({ edge: nx, d0: 0, d1: nx.len });
  }
  return build(steps, 'start');
}

export function graphPos(r: Route, s: number): GraphPos {
  const pc = r.pieces.find((p) => s <= p.s1 + 1e-6) ?? r.pieces[r.pieces.length - 1];
  if (!pc) return START;
  const span = pc.s1 - pc.s0;
  const k = span > 1e-9 ? Math.max(0, Math.min(1, (s - pc.s0) / span)) : 1;
  return { edge: pc.edge, d: pc.d0 + (pc.d1 - pc.d0) * k };
}

export function nodePos(n: Node): Vec3 {
  const p = nodePoint(n);
  return v3(p.x, 0, zOf(p.n));
}

export function pointAt(r: Route, s: number): { pos: Vec3; dir: Vec3 } {
  const ss = Math.max(0, Math.min(r.length, s));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i]! < ss) i++;
  const a = r.points[i - 1]!;
  const b = r.points[i]!;
  const seg = r.cum[i]! - r.cum[i - 1]!;
  const t = seg > 0 ? (ss - r.cum[i - 1]!) / seg : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { pos: v3(a.x + dx * t, 0, a.z + dz * t), dir: v3(dx / l, 0, dz / l) };
}

export function headingAt(r: Route, s: number, window = 1.4): Vec3 {
  const a = pointAt(r, s - window).pos;
  const b = pointAt(r, s + window).pos;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  return l > 1e-6 ? v3(dx / l, 0, dz / l) : pointAt(r, s).dir;
}

export function nearestS(r: Route, p: Vec3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1]!;
    const b = r.points[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    const qx = a.x + dx * t;
    const qz = a.z + dz * t;
    const d = Math.hypot(p.x - qx, p.z - qz);
    if (d < bestD) {
      bestD = d;
      best = r.cum[i - 1]! + Math.sqrt(l2) * t;
    }
  }
  return best;
}

export function crossingAnchor(leg: Leg, fromWest = false): Vec3 {
  if (leg === 'south') return fromWest ? v3(7.6, 3.35, zOf(SOUTH_CROSSWALK.n - 2.1)) : v3(-7.6, 3.35, zOf(SOUTH_CROSSWALK.n + 2.1));
  return leg === 'avenue' ? v3(-7.6, 3.35, zOf(89.7)) : v3(7.6, 3.35, zOf(104.3));
}
