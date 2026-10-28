import type { Band } from './data';
import type { Projected, Viewport } from './camera';
import { MOVE } from './motion-tokens';
import { focusRect } from './rules';
import type { Level } from './types';
import { clamp, rectsOverlap, type Rect } from './vec';

export type PlaceMode = 'side' | 'above' | 'below' | 'pip' | 'offscreen' | 'edge';

export type Align = 'left' | 'right' | 'center';
export type Vertical = 'above' | 'below' | 'middle' | 'lift';

export interface PlaceInput {
  level: Level;
  anchor: Projected;
  distance: number;
  size: { w: number; h: number };
  band: Band;
  viewport: Viewport;
  focusOk: boolean;
  zoneOk?: boolean;
  keepOuts: readonly Rect[];
  road?: readonly Rect[];
  chrome?: readonly Rect[];
  scaleFrom?: number;
  prefer?: { side: Align; vertical: Vertical; push?: boolean };
  ui?: number;
}

export interface Placed {
  rect: Rect;
  scale: number;
  mode: PlaceMode;
  side: 'left' | 'right';
  align: Align;
  vertical: Vertical;
  push: boolean;
  leader: { x: number; y: number };
  collapsed?: Level;
}

export const MARGIN = 16;
export const PIP_GAP = { beside: 24, above: 22 } as const;
const BESIDE_RISE = 0.85;

export const NOMINAL_SIZE: Record<'label' | 'glance' | 'card' | 'expanded', { w: number; h: number }> = {
  label: { w: 150, h: 52 },
  glance: { w: 214, h: 60 },
  card: { w: 292, h: 152 },
  expanded: { w: 392, h: 440 },
};

export const REFERENCE_VIEW = { w: 1280, h: 800 };

export function uiScale(vp: Viewport): number {
  const s = Math.min(vp.w / REFERENCE_VIEW.w, vp.h / REFERENCE_VIEW.h);
  return s < 1 ? clamp(s * 1.3, 0.74, 1) : clamp(s, 1, 1.9);
}

// The viewfinder is the gaze target: what is inside the square is being looked at, and it lets go 40 px outside.
export const VIEWFINDER = { size: 160, held: 132, keepPx: 40 } as const;

export function viewfinderHalf(vp: Viewport, keep = false): number {
  return (VIEWFINDER.size / 2 + (keep ? VIEWFINDER.keepPx : 0)) * Math.max(1, uiScale(vp));
}

export function distanceScale(distance: number): number {
  return clamp(22 / Math.max(0.1, distance), 0.7, 1);
}

// The smallest text in any pane is 12 px at scale 1; a pane never draws it smaller.
export const TEXT_FLOOR = 1;

export function paneScale(distance: number, ui: number): number {
  return Math.max(distanceScale(distance) * ui, TEXT_FLOOR);
}

export function anchorFactors(align: Align, vertical: Vertical): { fx: number; fy: number } {
  return { fx: align === 'left' ? 1 : align === 'right' ? 0 : 0.5, fy: vertical === 'middle' ? BESIDE_RISE : vertical === 'below' ? 0 : 1 };
}

function roadTop(road: readonly Rect[] | undefined, x0: number, x1: number): number {
  let top = Infinity;
  for (const r of road ?? []) if (r.x < x1 && r.x + r.w > x0) top = Math.min(top, r.y);
  return top;
}

function candidate(inp: PlaceInput, side: Align, vertical: Vertical, scale: number): Rect {
  const { anchor: a } = inp;
  const w = inp.size.w * scale;
  const h = inp.size.h * scale;
  if (vertical === 'middle') {
    const x = side === 'left' ? a.x - PIP_GAP.beside * scale - w : a.x + PIP_GAP.beside * scale;
    return { x, y: a.y - h * BESIDE_RISE, w, h };
  }
  const x = a.x - w / 2;
  if (vertical === 'below') return { x, y: a.y + PIP_GAP.above * scale, w, h };
  const y = a.y - PIP_GAP.above * scale - h;
  if (vertical === 'lift') return { x, y: Math.min(y, roadTop(inp.road, x, x + w) - 4 - h), w, h };
  return { x, y, w, h };
}

function inView(r: Rect, vp: Viewport): boolean {
  return r.x >= MARGIN - 0.5 && r.y >= MARGIN - 0.5 && r.x + r.w <= vp.w - MARGIN + 0.5 && r.y + r.h <= vp.h - MARGIN + 0.5;
}

function clampInto(r: Rect, vp: Viewport): Rect {
  return {
    ...r,
    x: clamp(r.x, MARGIN, Math.max(MARGIN, vp.w - MARGIN - r.w)),
    y: clamp(r.y, MARGIN, Math.max(MARGIN, vp.h - MARGIN - r.h)),
  };
}

export const ZONE_GAP = 14;
const SLIDE_KEEP = 12;

function pushOutOfZone(r: Rect, zone: Rect, anchorX: number, anchorY: number, vp: Viewport): Rect {
  if (!rectsOverlap(r, zone)) return r;
  const side = anchorX < vp.w / 2 ? 'left' : 'right';
  const x = side === 'left' ? zone.x - r.w - ZONE_GAP : zone.x + zone.w + ZONE_GAP;
  const y = clamp(anchorY - r.h * 0.62, MARGIN, Math.max(MARGIN, vp.h - MARGIN - r.h));
  return { ...r, x, y };
}

export function configRect(
  inp: PlaceInput,
  side: Align,
  vertical: Vertical,
  scale: number,
  push = false,
  pushOff?: { x: number; y: number },
): { rect: Rect; ok: boolean; held: 'clamp' | 'zone' | null; leader: { x: number; y: number } } {
  const vp = inp.viewport;
  const zone = focusRect(inp.band, vp.w, vp.h);
  const raw = candidate(inp, side, vertical, scale);
  let r = clampInto(raw, vp);
  const dx = Math.abs(r.x - raw.x);
  const dy = Math.abs(r.y - raw.y);
  // Beside its light, a pane slides down its side to clear the glass's own chrome above it (a banner, the clock), while its light stays beside it.
  if (vertical === 'middle') {
    const over = (inp.chrome ?? []).filter((k) => rectsOverlap(r, k) && k.y < r.y + r.h / 2);
    const y = over.length ? Math.max(...over.map((k) => k.y + k.h + 1)) : r.y;
    if (y > r.y && y + r.h <= vp.h - MARGIN + 0.5 && y <= inp.anchor.y - SLIDE_KEEP) r = { ...r, y };
  }
  const pushed = push && !inp.focusOk && (pushOff !== undefined || rectsOverlap(r, zone));
  if (pushed) r = pushOff ? { ...r, x: inp.anchor.x + pushOff.x, y: inp.anchor.y + pushOff.y } : pushOutOfZone(r, zone, inp.anchor.x, inp.anchor.y, vp);
  const fits = pushed || (vertical === 'middle' ? dx < 0.5 && dy <= MOVE.clampMax : dy < 0.5 && dx <= MOVE.clampMax);
  const clear = !(inp.road ?? []).some((k) => rectsOverlap(r, k)) && !(inp.chrome ?? []).some((k) => rectsOverlap(r, k));
  const gap = Math.hypot(Math.max(r.x - inp.anchor.x, 0, inp.anchor.x - (r.x + r.w)), Math.max(r.y - inp.anchor.y, 0, inp.anchor.y - (r.y + r.h)));
  const ok = inView(r, vp) && fits && clear && (inp.focusOk || inp.zoneOk || !rectsOverlap(r, zone)) && (!pushed || gap <= r.w * 0.9);
  const { fx, fy } = anchorFactors(side, vertical);
  const held = pushed ? 'zone' : dx > 0.5 || dy > 0.5 ? 'clamp' : null;
  return { rect: r, ok, held, leader: { x: r.x + r.w * fx, y: r.y + r.h * fy } };
}

export function placeWorld(inp: PlaceInput): Placed {
  const { anchor, viewport: vp } = inp;
  const away: 'left' | 'right' = anchor.x < vp.w / 2 ? 'left' : 'right';
  const base = { side: away, align: away as Align, vertical: 'above' as Vertical, push: false, leader: { x: anchor.x, y: anchor.y } };
  const offscreen = !anchor.inFront || anchor.x < -20 || anchor.x > vp.w + 20 || anchor.y < -20 || anchor.y > vp.h + 20;
  if (offscreen) return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'offscreen' };

  const edgeFrac = Math.min(anchor.x, vp.w - anchor.x) / vp.w;
  let collapsed: Level | undefined;
  if (!inp.focusOk && (inp.level === 'card' || inp.level === 'expanded') && edgeFrac < 0.08) collapsed = 'label';
  if (!inp.focusOk && (inp.level === 'label' || inp.level === 'glance') && edgeFrac < 0.04) collapsed = 'pip';
  if (collapsed === 'pip') return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'pip', collapsed };

  const ui = inp.ui ?? 1;
  const start = inp.scaleFrom ?? paneScale(inp.distance, ui);
  const scales = inp.scaleFrom !== undefined ? [start] : [start, 0.84 * ui, 0.78 * ui, 0.74 * ui].map((sc) => Math.max(sc, TEXT_FLOOR)).filter((sc, i, all) => sc <= start + 1e-9 && all.indexOf(sc) === i);
  const all: [Align, Vertical][] = [
    [away, 'middle'],
    [away === 'left' ? 'right' : 'left', 'middle'],
    ['center', 'above'],
    ['center', 'below'],
  ];
  const pref = inp.prefer;
  const orders = pref && !pref.push ? [[pref.side, pref.vertical] as [Align, Vertical], ...all.filter(([a, v]) => a !== pref.side || v !== pref.vertical)] : all;
  const done = (r: Rect, scale: number, side: Align, vertical: Vertical, push: boolean, leader: { x: number; y: number }): Placed => {
    const placed: Placed = { rect: r, scale, mode: vertical === 'below' ? 'below' : vertical === 'middle' ? 'side' : 'above', side: side === 'center' ? away : side, align: side, vertical, push, leader };
    if (collapsed) placed.collapsed = collapsed;
    return placed;
  };
  for (const scale of scales) {
    for (const [side, vertical] of orders) {
      const c = configRect(inp, side, vertical, scale);
      if (c.ok && !inp.keepOuts.some((k) => rectsOverlap(c.rect, k))) return done(c.rect, scale, side, vertical, false, c.leader);
    }
  }
  if (!inp.focusOk) {
    const c = configRect(inp, 'center', 'above', start, true);
    if (c.ok && !inp.keepOuts.some((k) => rectsOverlap(c.rect, k))) return done(c.rect, start, 'center', 'above', true, c.leader);
  }
  const lift = configRect(inp, 'center', 'lift', start);
  const r = lift.rect;
  const gap = Math.hypot(Math.max(r.x - anchor.x, 0, anchor.x - (r.x + r.w)), Math.max(r.y - anchor.y, 0, anchor.y - (r.y + r.h)));
  if (lift.ok && (inp.focusOk || gap <= r.w * 0.9)) return done(lift.rect, start, 'center', 'lift', false, lift.leader);
  return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'pip' };
}

export type ViewSlot = 'view:edge-right' | 'view:edge-top' | 'view:glyph' | 'view:bottom';

export function placeView(slot: string, size: { w: number; h: number }, vp: Viewport, stackIndex = 0, below = 0, ui = 1): Rect {
  const { w, h } = size;
  const gap = 10 * ui;
  switch (slot) {
    case 'view:edge-top':
      return { x: vp.w - 24 * ui - w, y: 56 * ui + stackIndex * (h + gap), w, h };
    case 'view:glyph':
      return { x: MARGIN * ui, y: vp.h - 44 * ui - h, w, h };
    case 'view:menu':
      return { x: vp.w - 24 * ui - w, y: vp.h - (24 + 44 + 16) * Math.max(1, ui) - h, w, h };
    case 'view:map':
      return { x: vp.w - 24 * ui - w, y: vp.h - (24 + 44 + 24) * Math.max(1, ui) - h, w, h };
    case 'view:banner':
      return { x: (vp.w - w) / 2, y: Math.max((14 + 14 + 20) * ui, 52 * Math.max(1, ui)), w, h };
    case 'view:bottom':
      return { x: (vp.w - w) / 2, y: vp.h - vp.h * 0.09 - h, w, h };
    default:
      return { x: vp.w - 24 * ui - w, y: Math.max(vp.h * 0.2, below) + stackIndex * (h + gap), w, h };
  }
}
