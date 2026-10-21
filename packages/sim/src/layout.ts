import { BLOCK, PLACES, placeAnchor, v3, zOf, type Box3, type Vec3 } from '@lumen/shared';
import { Rng } from './random';

export type FacadeStyle = 'limestone' | 'brick' | 'granite' | 'concrete' | 'glass' | 'bronze' | 'painted';
export type SignFormat = 'marquee' | 'fascia' | 'awning' | 'blade' | 'vinyl' | 'neon' | 'channel' | 'painted-wall' | 'canopy';
export type Facing = 'east' | 'west' | 'north' | 'south';

export const ALBEDO: Record<FacadeStyle | 'storefront' | 'sidewalk' | 'asphalt' | 'sky' | 'awning' | 'sign' | 'vehicle' | 'person' | 'tree' | 'mural', number> = {
  limestone: 0.74,
  brick: 0.34,
  granite: 0.5,
  concrete: 0.56,
  glass: 0.36,
  bronze: 0.3,
  painted: 0.62,
  storefront: 0.2,
  sidewalk: 0.66,
  asphalt: 0.3,
  sky: 0.9,
  awning: 0.42,
  sign: 0.7,
  vehicle: 0.45,
  person: 0.35,
  tree: 0.28,
  mural: 0.52,
};

export interface Storefront {
  kind: 'roster' | 'shop' | 'garage' | 'lobby' | 'blank';
  placeId?: string;
  name?: string;
  format: SignFormat;
  color: string;
  accent: string;
  n0: number;
  n1: number;
  awning?: boolean;
}

export interface Lot {
  id: string;
  street: 'avenue' | 'cross';
  side: 'W' | 'E' | 'N' | 'S';
  facing: Facing;
  a0: number;
  a1: number;
  setback: number;
  depth: number;
  height: number;
  style: FacadeStyle;
  tint: number;
  floorH: number;
  bayW: number;
  cornice: 'none' | 'thin' | 'deep' | 'parapet' | 'stepped';
  storefronts: Storefront[];
  rooftop: ('water-tower' | 'hvac' | 'billboard' | 'antenna' | 'penthouse')[];
  kindOf: 'building' | 'theater' | 'two-story' | 'mural' | 'garage' | 'park';
  upper?: { inset: number; height: number };
}

export interface Collider {
  box: Box3;
  albedo: number;
  normalHint?: Vec3;
  kind: 'facade' | 'store' | 'sign' | 'ground' | 'prop' | 'tower';
  id: string;
}

export interface Prop {
  kind:
    | 'tree'
    | 'lamp'
    | 'hydrant'
    | 'bollard'
    | 'newsstand'
    | 'bike-dock'
    | 'bus-shelter'
    | 'station-stair'
    | 'scaffold'
    | 'bench'
    | 'trash'
    | 'cart'
    | 'cafe-seating'
    | 'signal'
    | 'mailbox'
    | 'planter'
    | 'taxi-sign'
    | 'no-standing';
  pos: Vec3;
  rot: number;
  size?: Vec3;
  id: string;
}

export interface BackgroundTower {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
  style: FacadeStyle;
}

export interface BlockLayout {
  lots: Lot[];
  props: Prop[];
  towers: BackgroundTower[];
  colliders: Collider[];
  parked: { pos: Vec3; heading: number; color: string; kind: 'sedan' | 'taxi' | 'van' | 'suv' }[];
  scaffold: { n0: number; n1: number; x0: number; x1: number; height: number };
  sunDir: Vec3;
}

type LotSpec = Omit<Lot, 'street' | 'facing' | 'id' | 'storefronts' | 'rooftop'> & {
  storefronts?: Omit<Storefront, 'n0' | 'n1'> & { n0?: number; n1?: number };
  rooftop?: Lot['rooftop'];
};

const roster = (placeId: string, format: SignFormat, color: string, accent: string, awning = false): Omit<Storefront, 'n0' | 'n1'> => ({
  kind: 'roster',
  placeId,
  format,
  color,
  accent,
  awning,
});
const shop = (name: string, format: SignFormat, color: string, accent: string, awning = false): Omit<Storefront, 'n0' | 'n1'> => ({
  kind: 'shop',
  name,
  format,
  color,
  accent,
  awning,
});

const WEST: LotSpec[] = [
  { side: 'W', a0: -40, a1: -24, setback: 0.4, depth: 26, height: 44, style: 'concrete', tint: 1, floorH: 3.6, bayW: 3, cornice: 'thin', kindOf: 'building', storefronts: shop('Union Savings', 'channel', '#1f3b57', '#e9e2cf') },
  { side: 'W', a0: -24, a1: -8, setback: 0, depth: 24, height: 31, style: 'brick', tint: 1, floorH: 3.4, bayW: 2.6, cornice: 'deep', kindOf: 'building', storefronts: shop('Hollis Opticians', 'fascia', '#14171c', '#d8c79a') },
  { side: 'W', a0: -8, a1: 6, setback: 0.6, depth: 22, height: 52, style: 'limestone', tint: 0.98, floorH: 3.7, bayW: 2.9, cornice: 'deep', kindOf: 'building', rooftop: ['water-tower'], storefronts: shop('Delancey Florist', 'awning', '#2f4a32', '#f4efe2', true) },
  { side: 'W', a0: 6, a1: 18, setback: 0, depth: 18, height: 8.6, style: 'painted', tint: 1, floorH: 4.2, bayW: 3, cornice: 'parapet', kindOf: 'two-story', rooftop: ['hvac'], storefronts: shop('Nico Shoe Repair', 'vinyl', '#8a2b1d', '#f2e3c4') },
  { side: 'W', a0: 18, a1: 30, setback: 0, depth: 30, height: 15, style: 'brick', tint: 0.92, floorH: 4.5, bayW: 3, cornice: 'parapet', kindOf: 'theater', storefronts: roster('grace-theater', 'marquee', '#7a1818', '#f5ead0') },
  { side: 'W', a0: 30, a1: 34, setback: 0.3, depth: 20, height: 23, style: 'granite', tint: 1, floorH: 3.5, bayW: 2, cornice: 'thin', kindOf: 'building', storefronts: shop('Ray Locksmith', 'blade', '#c9a23a', '#1a1712') },
  { side: 'W', a0: 34, a1: 42, setback: 0, depth: 22, height: 27, style: 'painted', tint: 0.96, floorH: 3.4, bayW: 2.7, cornice: 'deep', kindOf: 'building', rooftop: ['water-tower'], storefronts: roster('trattoria-da-lia', 'awning', '#2e5a3a', '#f3ead6', true) },
  { side: 'W', a0: 42.6, a1: 56, setback: 0.8, depth: 34, height: 18, style: 'concrete', tint: 0.94, floorH: 4.6, bayW: 3.4, cornice: 'none', kindOf: 'building', rooftop: ['billboard'], storefronts: roster('lucky-lanes', 'neon', '#13243b', '#ff5a7a') },
  { side: 'W', a0: 56, a1: 60, setback: 1.5, depth: 1, height: 9, style: 'brick', tint: 0.95, floorH: 4, bayW: 4, cornice: 'none', kindOf: 'mural', storefronts: { kind: 'blank', format: 'painted-wall', color: '#c4553b', accent: '#2e6f8e' } },
  { side: 'W', a0: 60, a1: 68, setback: 0.2, depth: 24, height: 38, style: 'limestone', tint: 1.02, floorH: 3.6, bayW: 2.6, cornice: 'stepped', kindOf: 'building', storefronts: roster('atlas-books', 'fascia', '#0f2a24', '#d6b46a') },
  { side: 'W', a0: 68.6, a1: 78, setback: 0, depth: 26, height: 21, style: 'glass', tint: 1, floorH: 3.9, bayW: 1.6, cornice: 'thin', kindOf: 'building', storefronts: roster('mega-burger', 'channel', '#c8321f', '#ffd23f', true) },
  { side: 'W', a0: 78.6, a1: 84, setback: 0, depth: 22, height: 0.9, style: 'granite', tint: 1, floorH: 1, bayW: 2, cornice: 'none', kindOf: 'park', storefronts: { kind: 'blank', format: 'fascia', color: '#2b3a2a', accent: '#d7d1bf' } },
];

const EAST: LotSpec[] = [
  { side: 'E', a0: -40, a1: -22, setback: 0, depth: 28, height: 58, style: 'limestone', tint: 1, floorH: 3.7, bayW: 2.8, cornice: 'deep', kindOf: 'building', storefronts: shop('Marlow Hats', 'fascia', '#3b2a1e', '#e8d9b8') },
  { side: 'E', a0: -22, a1: -6, setback: 0.5, depth: 24, height: 36, style: 'bronze', tint: 1, floorH: 3.9, bayW: 1.8, cornice: 'thin', kindOf: 'building', storefronts: { kind: 'lobby', name: '220 Main', format: 'channel', color: '#1a1a1a', accent: '#d9c8a0' } },
  { side: 'E', a0: -6, a1: 10, setback: 0, depth: 22, height: 46, style: 'brick', tint: 1.04, floorH: 3.3, bayW: 2.5, cornice: 'deep', kindOf: 'building', rooftop: ['water-tower'], storefronts: shop('Sun Laundromat', 'vinyl', '#f2c230', '#1d3a5f') },
  { side: 'E', a0: 10, a1: 18, setback: 0, depth: 20, height: 30, style: 'limestone', tint: 1.03, floorH: 3.6, bayW: 2.8, cornice: 'stepped', kindOf: 'building', storefronts: roster('goldies-counter', 'fascia', '#f3e4c2', '#1d3a5f', true) },
  { side: 'E', a0: 18, a1: 24, setback: 0, depth: 16, height: 8.2, style: 'painted', tint: 0.98, floorH: 4, bayW: 3, cornice: 'parapet', kindOf: 'two-story', rooftop: ['hvac'], storefronts: shop('City Nails', 'neon', '#1b1b22', '#ff7ab8') },
  { side: 'E', a0: 24, a1: 30, setback: 0.3, depth: 20, height: 24, style: 'granite', tint: 1, floorH: 3.4, bayW: 2, cornice: 'thin', kindOf: 'building', storefronts: roster('kathys-cupcakes', 'awning', '#f2b8c6', '#5a2a3a', true) },
  { side: 'E', a0: 30, a1: 34, setback: 0, depth: 18, height: 34, style: 'brick', tint: 0.9, floorH: 3.3, bayW: 2, cornice: 'deep', kindOf: 'building', storefronts: shop('Park Tailors', 'blade', '#2a2d4a', '#efe6cf') },
  { side: 'E', a0: 34, a1: 42, setback: 0, depth: 24, height: 49, style: 'concrete', tint: 1.02, floorH: 3.6, bayW: 2.6, cornice: 'thin', kindOf: 'building', rooftop: ['antenna'], storefronts: roster('main-street-pharmacy', 'channel', '#ffffff', '#1f7a4d') },
  { side: 'E', a0: 42, a1: 46, setback: 0.6, depth: 20, height: 20, style: 'limestone', tint: 0.96, floorH: 3.8, bayW: 2, cornice: 'deep', kindOf: 'building', storefronts: shop('Elm Barbers', 'blade', '#b31b1b', '#ffffff') },
  { side: 'E', a0: 46, a1: 52, setback: 0, depth: 22, height: 41, style: 'brick', tint: 1.06, floorH: 3.3, bayW: 2.4, cornice: 'deep', kindOf: 'building', rooftop: ['water-tower'], storefronts: roster('big-bean', 'fascia', '#3b2416', '#f0d9a8') },
  { side: 'E', a0: 52, a1: 56, setback: 0, depth: 18, height: 28, style: 'granite', tint: 1.04, floorH: 3.4, bayW: 2, cornice: 'thin', kindOf: 'building', storefronts: shop('Ace Cleaners', 'vinyl', '#1d5fa8', '#ffffff') },
  { side: 'E', a0: 56, a1: 62, setback: 0, depth: 30, height: 16, style: 'concrete', tint: 0.92, floorH: 3, bayW: 6, cornice: 'none', kindOf: 'garage', storefronts: { kind: 'garage', name: 'Parking', format: 'channel', color: '#2a2e33', accent: '#f0b429' } },
  { side: 'E', a0: 62, a1: 68, setback: 1.2, depth: 1, height: 11, style: 'brick', tint: 1, floorH: 4, bayW: 4, cornice: 'none', kindOf: 'mural', storefronts: { kind: 'blank', format: 'painted-wall', color: '#2f6f6a', accent: '#f2b33d' } },
  { side: 'E', a0: 68, a1: 78, setback: 0, depth: 26, height: 33, style: 'painted', tint: 0.93, floorH: 3.5, bayW: 2.5, cornice: 'deep', kindOf: 'building', storefronts: roster('corner-hardware', 'painted-wall', '#a43a22', '#f3e8d0') },
  { side: 'E', a0: 78, a1: 84, setback: 0, depth: 24, height: 60, style: 'glass', tint: 1, floorH: 4, bayW: 1.5, cornice: 'thin', kindOf: 'building', rooftop: ['penthouse'], storefronts: shop('Union Savings', 'channel', '#1f3b57', '#e9e2cf') },
];

const CROSS: (LotSpec & { street: 'cross' })[] = [
  { street: 'cross', side: 'N', a0: 13, a1: 15.8, setback: 0, depth: 26, height: 50, style: 'limestone', tint: 1, floorH: 3.7, bayW: 2.8, cornice: 'deep', kindOf: 'building', storefronts: { kind: 'blank', format: 'fascia', color: '#222', accent: '#ccc' } },
  { street: 'cross', side: 'N', a0: 15.8, a1: 24.6, setback: 0, depth: 24, height: 14, style: 'granite', tint: 1.03, floorH: 4.6, bayW: 2.9, cornice: 'stepped', kindOf: 'building', storefronts: roster('post-office', 'channel', '#e9e5d8', '#1d3a6b') },
  { street: 'cross', side: 'N', a0: 24.6, a1: 38, setback: 0.4, depth: 26, height: 39, style: 'brick', tint: 0.96, floorH: 3.4, bayW: 2.5, cornice: 'deep', kindOf: 'building', rooftop: ['water-tower'], storefronts: shop('Bloom Florist', 'awning', '#4c6b3c', '#f7f1e3', true) },
  { street: 'cross', side: 'N', a0: 38, a1: 56, setback: 0, depth: 26, height: 62, style: 'glass', tint: 1, floorH: 4, bayW: 1.5, cornice: 'thin', kindOf: 'building', storefronts: { kind: 'lobby', name: '41 West', format: 'channel', color: '#111', accent: '#ddd' } },
  { street: 'cross', side: 'N', a0: 56, a1: 83, setback: 0.5, depth: 26, height: 33, style: 'concrete', tint: 1, floorH: 3.6, bayW: 3, cornice: 'thin', kindOf: 'building', storefronts: shop('Kim Deli', 'fascia', '#ffd23f', '#202020') },
  { street: 'cross', side: 'S', a0: 30, a1: 52, setback: 0, depth: 22, height: 26, style: 'brick', tint: 1.05, floorH: 3.4, bayW: 2.6, cornice: 'deep', kindOf: 'building', storefronts: shop('Harbor Wine', 'blade', '#5a1830', '#f4e6c8') },
  { street: 'cross', side: 'S', a0: 52, a1: 83, setback: 0, depth: 22, height: 44, style: 'limestone', tint: 1, floorH: 3.6, bayW: 2.8, cornice: 'deep', kindOf: 'building', storefronts: shop('Ivy Books', 'fascia', '#1c3324', '#e5d8b0') },
  { street: 'cross', side: 'N', a0: -24, a1: -13, setback: 0, depth: 24, height: 47, style: 'granite', tint: 1, floorH: 3.6, bayW: 2.4, cornice: 'deep', kindOf: 'building', storefronts: shop('Harlow Drugs', 'channel', '#0f5a3a', '#fff') },
  { street: 'cross', side: 'N', a0: -48, a1: -24, setback: 0, depth: 24, height: 30, style: 'painted', tint: 0.95, floorH: 3.4, bayW: 2.6, cornice: 'thin', kindOf: 'building', storefronts: shop('Rosa Shoes', 'awning', '#8a2b1d', '#f4e8d2', true) },
  { street: 'cross', side: 'N', a0: -83, a1: -48, setback: 0.4, depth: 24, height: 54, style: 'bronze', tint: 1, floorH: 3.9, bayW: 1.8, cornice: 'thin', kindOf: 'building', storefronts: { kind: 'lobby', name: '10 Grand', format: 'channel', color: '#151515', accent: '#d9c8a0' } },
  { street: 'cross', side: 'S', a0: -60, a1: -36, setback: 0, depth: 22, height: 36, style: 'concrete', tint: 1, floorH: 3.6, bayW: 3, cornice: 'thin', kindOf: 'building', storefronts: shop('Grand Hardware', 'fascia', '#3a3f45', '#f0b429') },
  { street: 'cross', side: 'S', a0: -83, a1: -60, setback: 0, depth: 22, height: 25, style: 'brick', tint: 0.92, floorH: 3.3, bayW: 2.5, cornice: 'deep', kindOf: 'building', storefronts: shop('Lotus Garden', 'neon', '#1a1a1a', '#ff6b3d') },
];

function facingOf(side: Lot['side']): Facing {
  return side === 'W' ? 'east' : side === 'E' ? 'west' : side === 'N' ? 'south' : 'north';
}

function lotFrom(spec: LotSpec, street: 'avenue' | 'cross', i: number): Lot {
  const sf = spec.storefronts;
  const stores: Storefront[] = sf ? [{ ...sf, n0: sf.n0 ?? spec.a0, n1: sf.n1 ?? spec.a1 }] : [];
  return {
    id: `${street}-${spec.side}-${i}`,
    street,
    side: spec.side,
    facing: facingOf(spec.side),
    a0: spec.a0,
    a1: spec.a1,
    setback: spec.setback,
    depth: spec.depth,
    height: spec.height,
    style: spec.style,
    tint: spec.tint,
    floorH: spec.floorH,
    bayW: spec.bayW,
    cornice: spec.cornice,
    storefronts: stores,
    rooftop: spec.rooftop ?? [],
    kindOf: spec.kindOf,
    ...(spec.upper ? { upper: spec.upper } : {}),
  };
}

export function lotBox(l: Lot): Box3 {
  const line = BLOCK.buildingLine;
  if (l.street === 'avenue') {
    const z0 = zOf(l.a1);
    const z1 = zOf(l.a0);
    if (l.side === 'W') return { min: v3(-line - l.setback - l.depth, 0, z0), max: v3(-line - l.setback, l.height, z1) };
    return { min: v3(line + l.setback, 0, z0), max: v3(line + l.setback + l.depth, l.height, z1) };
  }
  if (l.side === 'N') return { min: v3(l.a0, 0, zOf(BLOCK.northLineN + l.setback + l.depth)), max: v3(l.a1, l.height, zOf(BLOCK.northLineN + l.setback)) };
  return { min: v3(l.a0, 0, zOf(BLOCK.southLineN - l.setback)), max: v3(l.a1, l.height, zOf(BLOCK.southLineN - l.setback - l.depth)) };
}

export function buildLayout(seed = 47): BlockLayout {
  const rng = new Rng(seed);
  const lots: Lot[] = [
    ...WEST.map((s, i) => lotFrom(s, 'avenue', i)),
    ...EAST.map((s, i) => lotFrom(s, 'avenue', i)),
    ...CROSS.map((s, i) => lotFrom(s, 'cross', i)),
  ];

  const towers: BackgroundTower[] = [];
  const lotBoxes = lots.map(lotBox);
  const clear = (x0: number, x1: number, z0: number, z1: number): boolean => {
    if (x1 > -BLOCK.buildingLine && x0 < BLOCK.buildingLine) return false;
    if (z0 < zOf(BLOCK.southLineN) && z1 > zOf(BLOCK.northLineN)) return false;
    return !lotBoxes.some((b) => x0 < b.max.x + 1 && x1 > b.min.x - 1 && z0 < b.max.z + 1 && z1 > b.min.z - 1);
  };
  const addTower = (x: number, z: number, w: number, d: number, h: number): void => {
    const style = rng.pick<FacadeStyle>(['concrete', 'limestone', 'glass', 'granite', 'bronze', 'brick']);
    if (!clear(x - w / 2, x + w / 2, z - d / 2, z + d / 2)) return;
    towers.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, height: h, style });
  };
  for (let n = 116; n < 640; n += rng.range(18, 34)) {
    for (const side of [-1, 1]) {
      const w = rng.range(22, 34);
      addTower(side * (BLOCK.buildingLine + w / 2 + rng.range(0, 1.5)), zOf(n + 10), w, rng.range(18, 30), rng.range(30, 140));
    }
  }
  for (let i = 0; i < 70; i++) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(52, 300);
    const n = rng.range(-120, 700);
    addTower(x, zOf(n), rng.range(26, 60), rng.range(26, 60), rng.range(80, 240));
  }
  for (const side of [-1, 1]) {
    for (let x = 90; x < 260; x += rng.range(24, 40)) {
      for (const s of [BLOCK.southLineN - 14, BLOCK.northLineN + 14]) addTower(side * x, zOf(s), rng.range(22, 34), 26, rng.range(40, 150));
    }
  }

  const props: Prop[] = [];
  let pid = 0;
  const prop = (kind: Prop['kind'], x: number, n: number, rot = 0, size?: Vec3, y = 0): void => {
    const p: Prop = { kind, pos: v3(x, y, zOf(n)), rot, id: `${kind}-${pid++}` };
    if (size) p.size = size;
    props.push(p);
  };
  const curbE = BLOCK.avenueHalf;
  for (const n of [27.5, 40.5, 63.5, 73.5]) prop('tree', curbE + 0.58, n);
  for (const n of [9.5, 29.5, 46.2, 56.8, 75]) prop('tree', -(curbE + 0.62), n);
  for (const n of [-10, 3, 38, 66, 82]) prop('lamp', curbE + 0.5, n, Math.PI / 2);
  for (const n of [-4, 22, 44, 70]) prop('lamp', -(curbE + 0.5), n, -Math.PI / 2);
  prop('hydrant', curbE + 0.45, 8.6);
  prop('hydrant', -(curbE + 0.45), 33.2);
  prop('hydrant', curbE + 0.45, 66.4);
  for (const n of [21.4, 22.6, 23.8]) prop('bollard', curbE + 0.4, n);
  for (const n of [85.2, 86.4]) prop('bollard', curbE + 0.4, n);
  prop('newsstand', 11.7, 65.2, -Math.PI / 2, v3(2.4, 2.6, 1.6));
  prop('station-stair', 11.7, 80.6, 0, v3(2.2, 1.1, 5.2));
  prop('bike-dock', -(curbE + 0.9), 52, 0, v3(0.8, 1.1, 9));
  prop('bus-shelter', curbE + 0.85, 58, 0, v3(1.6, 2.6, 4.2));
  prop('trash', curbE + 0.6, 26.4);
  prop('trash', -(curbE + 0.6), 64.6);
  prop('trash', curbE + 0.6, 79.5);
  prop('mailbox', curbE + 0.7, 44.6);
  prop('cart', 12.0, 16.4, -Math.PI / 2, v3(1.8, 2.1, 1));
  prop('cafe-seating', -11.8, 39, 0, v3(1.2, 1, 5.5));
  prop('cafe-seating', 12.2, 49.5, 0, v3(0.9, 1, 4));
  prop('planter', -12.4, 63, 0, v3(0.8, 0.7, 2.4));
  prop('taxi-sign', -(curbE + 0.4), 12.5);
  prop('no-standing', curbE + 0.35, 2.0);
  prop('no-standing', curbE + 0.35, 52.5);
  for (const n of [79.6, 82.4]) prop('bench', -12.35, n, Math.PI / 2);
  prop('bench', -10.6, 86.4, Math.PI);
  for (const [x, n] of [
    [-16.6, 80.6],
    [-22.4, 82.3],
    [-27.4, 80.2],
  ] as const)
    prop('tree', x, n);
  for (const [x, n, r] of [
    [curbE + 0.4, 85.6, Math.PI],
    [-(curbE + 0.4), 89.8, Math.PI / 2],
    [curbE + 0.4, 104.6, -Math.PI / 2],
    [-(curbE + 0.4), 104.6, 0],
  ] as const) {
    prop('signal', x, n, r);
  }

  const scaffold = { n0: 45.6, n1: 52.6, x0: 10.4, x1: 13.0, height: 4.2 };

  const parked: BlockLayout['parked'] = [];
  const colors = ['#17181a', '#cfcfc8', '#8e949a', '#1f2c45', '#6e1d1d', '#2f3b31', '#b9b4a8', '#3a4455'];
  for (let n = 1; n < 80; n += rng.range(5.4, 7.2)) {
    if ((n > 15 && n < 32) || (n > 50 && n < 54)) continue;
    if (rng.chance(0.18)) continue;
    parked.push({ pos: v3(-6.05, 0, zOf(n)), heading: Math.PI, color: rng.pick(colors), kind: rng.pick(['sedan', 'sedan', 'suv', 'van', 'taxi'] as const) });
  }

  const colliders: Collider[] = [];
  for (const l of lots) {
    const b = lotBox(l);
    colliders.push({ box: b, albedo: ALBEDO[l.style] * l.tint, kind: 'facade', id: l.id });
    if (l.kindOf !== 'mural' && l.kindOf !== 'park') {
      const sb = { ...b, max: { ...b.max, y: Math.min(4.9, l.height) } };
      const grow = 0.18;
      if (l.facing === 'east') sb.max = { ...sb.max, x: sb.max.x + grow };
      if (l.facing === 'west') sb.min = { ...sb.min, x: sb.min.x - grow };
      if (l.facing === 'south') sb.max = { ...sb.max, z: sb.max.z + grow };
      if (l.facing === 'north') sb.min = { ...sb.min, z: sb.min.z - grow };
      colliders.push({ box: sb, albedo: ALBEDO.storefront, kind: 'store', id: `${l.id}-store` });
    }
  }
  for (const t of towers) {
    colliders.push({ box: { min: v3(t.x0, 0, t.z0), max: v3(t.x1, t.height, t.z1) }, albedo: ALBEDO[t.style] * 0.9, kind: 'tower', id: 'tower' });
  }
  for (const p of PLACES) {
    const a = placeAnchor(p);
    if (p.side === 'X') {
      colliders.push({ box: { min: v3(a.x - 3, a.y - 0.6, a.z - 0.3), max: v3(a.x + 3, a.y + 0.6, a.z + 0.1) }, albedo: ALBEDO.sign, kind: 'sign', id: `sign-${p.id}` });
    }
  }
  colliders.push({ box: { min: v3(-1000, -1, -1000), max: v3(1000, 0, 1000) }, albedo: ALBEDO.asphalt, kind: 'ground', id: 'ground' });

  return { lots, props, towers, colliders, parked, scaffold, sunDir: sunDirection() };
}

export function sunDirection(): Vec3 {
  const x = -0.52;
  const y = 0.76;
  const z = -0.39;
  const l = Math.hypot(x, y, z);
  return v3(x / l, y / l, z / l);
}
