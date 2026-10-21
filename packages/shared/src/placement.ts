import type { Band } from './data';
import type { Projected, Viewport } from './camera';
import { focusRect } from './rules';
import type { Level } from './types';
import { clamp, rectsOverlap, type Rect } from './vec';

export type PlaceMode = 'side' | 'above' | 'below' | 'pip' | 'offscreen' | 'edge';

export interface PlaceInput {
  level: Level;
  anchor: Projected;
  distance: number;
  size: { w: number; h: number };
  band: Band;
  viewport: Viewport;
  focusOk: boolean;
  keepOuts: readonly Rect[];
  prefer?: { side: 'left' | 'right'; vertical: 'above' | 'below' };
}

export interface Placed {
  rect: Rect;
  scale: number;
  mode: PlaceMode;
  side: 'left' | 'right';
  vertical: 'above' | 'below';
  leader: { x: number; y: number };
  collapsed?: Level;
}

export const MARGIN = 16;

export const NOMINAL_SIZE: Record<'glance' | 'card' | 'expanded', { w: number; h: number }> = {
  glance: { w: 214, h: 60 },
  card: { w: 292, h: 152 },
  expanded: { w: 392, h: 318 },
};

export function distanceScale(distance: number): number {
  return clamp(30 / Math.max(0.1, distance), 0.92, 1.2);
}

function offsets(level: Level): { gap: number; dy: number } {
  return level === 'glance' ? { gap: 26, dy: 30 } : { gap: 40, dy: 46 };
}

function candidate(
  inp: PlaceInput,
  side: 'left' | 'right',
  vertical: 'above' | 'below',
  scale: number,
): Rect {
  const { anchor } = inp;
  const w = inp.size.w * scale;
  const h = inp.size.h * scale;
  const { gap, dy } = offsets(inp.level);
  const x = side === 'left' ? anchor.x - w - gap * scale : anchor.x + gap * scale;
  const y = vertical === 'above' ? anchor.y - h - dy * scale : anchor.y + dy * scale * 0.8;
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

function pushOutOfZone(r: Rect, zone: Rect, side: 'left' | 'right'): Rect {
  if (!rectsOverlap(r, zone)) return r;
  return side === 'left' ? { ...r, x: zone.x - r.w - 10 } : { ...r, x: zone.x + zone.w + 10 };
}

export function placeWorld(inp: PlaceInput): Placed {
  const { anchor, viewport: vp } = inp;
  const near: 'left' | 'right' = anchor.x < vp.w / 2 ? 'left' : 'right';
  const base = { side: near, vertical: 'above' as const, leader: { x: anchor.x, y: anchor.y } };
  const offscreen = !anchor.inFront || anchor.x < -20 || anchor.x > vp.w + 20 || anchor.y < -20 || anchor.y > vp.h + 20;
  if (offscreen) return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'offscreen' };

  const edgeFrac = Math.min(anchor.x, vp.w - anchor.x) / vp.w;
  let collapsed: Level | undefined;
  if ((inp.level === 'card' || inp.level === 'expanded') && edgeFrac < 0.08) collapsed = 'glance';
  if (inp.level === 'glance' && edgeFrac < 0.04) collapsed = 'pip';
  if (collapsed === 'pip') return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'pip', collapsed };

  const zone = focusRect(inp.band, vp.w, vp.h);
  const start = distanceScale(inp.distance);
  const pref = inp.prefer ?? { side: near, vertical: 'above' as const };
  const other = (s: 'left' | 'right'): 'left' | 'right' => (s === 'left' ? 'right' : 'left');
  const orders: ['left' | 'right', 'above' | 'below'][] = [
    [pref.side, pref.vertical],
    [pref.side, pref.vertical === 'above' ? 'below' : 'above'],
    [other(pref.side), 'above'],
    [other(pref.side), 'below'],
  ];
  for (const scale of [start, Math.min(start, 0.92), 0.84, 0.78]) {
    for (const [side, vertical] of orders) {
      let r = candidate(inp, side, vertical, scale);
      if (vertical === 'above' && r.y < MARGIN) continue;
      r = clampInto(r, vp);
      if (!inp.focusOk) r = pushOutOfZone(r, zone, side);
      if (!inView(r, vp)) continue;
      if (!inp.focusOk && rectsOverlap(r, zone)) continue;
      if (inp.keepOuts.some((k) => rectsOverlap(r, k))) continue;
      const leader = {
        x: side === 'left' ? r.x + r.w : r.x,
        y: vertical === 'above' ? r.y + r.h : r.y,
      };
      const placed: Placed = { rect: r, scale, mode: vertical === 'above' ? 'side' : 'below', side, vertical, leader };
      if (collapsed) placed.collapsed = collapsed;
      return placed;
    }
  }
  return { ...base, rect: { x: anchor.x, y: anchor.y, w: 0, h: 0 }, scale: 1, mode: 'pip' };
}

export type ViewSlot = 'view:edge-right' | 'view:edge-top' | 'view:glyph' | 'view:bottom';

export function placeView(slot: string, size: { w: number; h: number }, vp: Viewport, stackIndex = 0): Rect {
  const { w, h } = size;
  switch (slot) {
    case 'view:edge-top':
      return { x: vp.w - 24 - w, y: 24 + stackIndex * (h + 10), w, h };
    case 'view:glyph':
      return { x: MARGIN, y: vp.h - 44 - h, w, h };
    case 'view:bottom':
      return { x: (vp.w - w) / 2, y: vp.h - vp.h * 0.09 - h, w, h };
    default:
      return { x: vp.w - 24 - w, y: vp.h * 0.2 + stackIndex * (h + 10), w, h };
  }
}

export function enteringFrom(r: Rect, vp: Viewport, side: 'left' | 'right'): Rect {
  return side === 'left' ? { ...r, x: MARGIN } : { ...r, x: vp.w - MARGIN - r.w };
}
