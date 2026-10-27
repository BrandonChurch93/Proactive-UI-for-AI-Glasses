import { describe, expect, it } from 'vitest';
import { Brain } from '@lumen/brain';
import { FOCUS_ZONE, KEEPOUT, anchorFactors, LEVEL_RANK, NOMINAL_SIZE, SCENARIO_IDS, boxKeepOut, capKeepOut, focusRect, project, rectsOverlap, roadwayKeepOuts, zOf, type CameraPose, type Rect } from '@lumen/shared';
import { ALBEDO, SHADE, Sim, TICK_HZ, keepOuts } from '@lumen/sim';
import type { KeepOut } from '../src/bridge';
import { primaryContrast, secondaryContrast, tierFor } from '../src/backdrop';
import { Aside, PaneYield, Placement, Yield, type FrameCtx } from '../src/place';
import { MOVE } from '../src/tokens';

const VP = { w: 1280, h: 800 };
const STEP = 1 / 60;

describe('placement on every beat of the three walks', () => {
  for (const scenario of SCENARIO_IDS) {
    it(`${scenario}: no world pane in the focus zone for its band, every first frame while moving outside it`, () => {
      const sim = new Sim(scenario, { viewport: VP });
      const brain = new Brain({ scenario });
      const placements = new Map<string, Placement>();
      let frame = brain.tick(sim.snapshot());
      let violations: string[] = [];
      let entries = 0;
      const seen = new Set<string>();
      for (let i = 1; i <= 98 * 60; i++) {
        sim.step(STEP);
        if (i % (60 / TICK_HZ) === 0) {
          frame = brain.tick(sim.snapshot());
          sim.plan(frame.goal);
        }
        const pose = sim.cameraPose();
        const kos: KeepOut[] = keepOuts(sim, (v) => project(pose, VP, v), VP, pose.pos);
        const ctx: FrameCtx = { t: sim.t, band: frame.band, vp: VP, keepOuts: kos };
        const zone = focusRect(frame.band, VP.w, VP.h);
        for (const d of frame.items) {
          if (d.placement.zone !== 'world' || LEVEL_RANK[d.level] < LEVEL_RANK.glance || d.level === 'whisper') continue;
          const a = sim.anchorOf(d.placement.anchor);
          if (!a) continue;
          let p = placements.get(d.id);
          if (!p) {
            p = new Placement();
            placements.set(d.id, p);
          }
          const lv = d.level as 'glance' | 'card' | 'expanded';
          const placed = p.update(
            { level: lv, anchor: project(pose, VP, a), distance: Math.hypot(a.x - pose.pos.x, a.y - pose.pos.y, a.z - pose.pos.z), size: NOMINAL_SIZE[lv], focusOk: Boolean(d.placement.focusOk) },
            ctx,
          );
          if (placed.mode !== 'pane') continue;
          const r: Rect = { x: placed.rect.x + p.jumpX.at(sim.t), y: placed.rect.y + p.jumpY.at(sim.t), w: placed.rect.w, h: placed.rect.h };
          const key = `${d.id}:${d.level}`;
          if (!seen.has(key)) {
            seen.add(key);
            if (frame.band !== 'stopped') {
              entries++;
              if (rectsOverlap(r, zone) && !d.placement.focusOk) violations.push(`${sim.t.toFixed(2)} first frame of ${key} inside the zone`);
            }
          }
          const settling = p.jumpX.at(sim.t) !== 0 || p.jumpY.at(sim.t) !== 0;
          if (!d.placement.focusOk && !settling && rectsOverlap(r, zone)) violations.push(`${sim.t.toFixed(2)} ${key} in the ${frame.band} zone`);
        }
        for (const id of [...placements.keys()]) if (!frame.items.some((d) => d.id === id)) placements.delete(id);
      }
      violations = [...new Set(violations)];
      expect(violations.slice(0, 5)).toEqual([]);
      expect(entries).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe('rule 5 · head-scan yielding', () => {
  it('a pane on the scanned side is below 20% within 200 ms of the turn and restored within 400 ms of the return', () => {
    const y = new Yield();
    const left = new PaneYield();
    const right = new PaneYield();
    let t = 0;
    const run = (until: number, yawRate: number): { left: number; right: number } => {
      let out = { left: 1, right: 1 };
      for (; t < until - 1e-9; t += STEP) {
        const side = y.update({ t, yawRate, curbDistance: 3 });
        out = { left: left.update(t, side, 'left').opacity, right: right.update(t, side, 'right').opacity };
      }
      return out;
    };
    run(1, 0);
    expect(run(1.2, 1.4).left).toBeLessThan(0.2);
    const during = run(1.6, 1.4);
    expect(during.left).toBeLessThan(0.2);
    expect(during.right).toBe(1);
    expect(run(2.0, 0).left).toBeGreaterThan(0.99);
  });

  it('does not yield away from the curb', () => {
    const y = new Yield();
    expect(y.update({ t: 0, yawRate: 2, curbDistance: 12 })).toBeNull();
  });

  it('ends a yield left open at the curb once the curb is behind', () => {
    const y = new Yield();
    y.update({ t: 0, yawRate: 0, curbDistance: 3, yaw: 0 });
    expect(y.update({ t: 0.1, yawRate: 2, curbDistance: 3, yaw: 0.2 })).toBe('left');
    expect(y.update({ t: 0.5, yawRate: 0, curbDistance: 3, yaw: 1.5 })).toBe('left');
    expect(y.update({ t: 9, yawRate: 0, curbDistance: 40, yaw: 1.5 })).toBeNull();
  });
});

describe('rule 8 · the world has right of way', () => {
  const card: Rect = { x: 300, y: 200, w: 292, h: 152 };
  const ctx = (t: number, keepOuts: KeepOut[]): FrameCtx => ({ t, band: 'stopped', vp: VP, keepOuts });

  it("a walking pedestrian never overlaps the card while it is above 30%", () => {
    const aside = new Aside();
    const lookahead = 0.45;
    const speed = 160;
    let worst = 0;
    for (let t = 0; t < 6; t += STEP) {
      const x = -200 + speed * t;
      const now: Rect = { x, y: 260, w: 60, h: 300 };
      const ahead: Rect = { x, y: 260, w: 60 + speed * lookahead, h: 300 };
      const s = aside.update(card, ctx(t, [{ rect: ahead, kind: 'person', moving: true, id: 'p', depth: 5 }]), false);
      const shown: Rect = { ...card, x: card.x + s.dx, y: card.y + s.dy };
      if (rectsOverlap(shown, now) && !s.dropped) worst = Math.max(worst, s.opacity);
    }
    expect(worst).toBeLessThanOrEqual(MOVE.asideOpacity + 1e-6);
  });

  it('steps aside by the overlap plus 20 px and comes back when clear', () => {
    const aside = new Aside();
    const pane: Rect = { x: 40, y: 200, w: 292, h: 152 };
    const ko: KeepOut = { rect: { x: 20, y: 150, w: 60, h: 400 }, kind: 'person', moving: false, id: 'p', depth: 5 };
    let s = aside.update(pane, ctx(0, [ko]), false);
    for (let t = STEP; t < 0.6; t += STEP) s = aside.update(pane, ctx(t, [ko]), false);
    expect(s.opacity).toBeCloseTo(MOVE.asideOpacity, 2);
    const moved: Rect = { ...pane, x: pane.x + s.dx, y: pane.y + s.dy };
    expect(rectsOverlap(moved, ko.rect)).toBe(false);
    expect(Math.abs(s.dx)).toBeCloseTo(60, 0);
    expect(s.trace).not.toBeNull();
    for (let t = 0.6; t < 1.2; t += STEP) s = aside.update(pane, ctx(t, []), false);
    expect(s.opacity).toBeGreaterThan(0.99);
    expect(Math.hypot(s.dx, s.dy)).toBeLessThan(0.5);
  });

  it('a person who would need a slide longer than the pane is wide drops the pane to its light instead', () => {
    const aside = new Aside();
    const ko: KeepOut = { rect: { x: 300, y: 150, w: 400, h: 400 }, kind: 'person', moving: false, id: 'p', depth: 5 };
    let s = aside.update(card, ctx(0, [ko]), false);
    for (let t = STEP; t < 0.6; t += STEP) s = aside.update(card, ctx(t, [ko]), false);
    expect(s.dropped).toBe(true);
    expect(Math.hypot(s.dx, s.dy)).toBeLessThan(1);
  });

  it('a moving vehicle dims the pane on the first frame and drops it to a pip only after covering most of it for 300 ms', () => {
    const aside = new Aside();
    const truck: KeepOut = { rect: { x: 0, y: 0, w: 1280, h: 800 }, kind: 'vehicle', moving: true, id: 'truck', depth: 5 };
    let s = aside.update(card, ctx(0, [truck]), false);
    expect(s.active).toBe(true);
    expect(s.dropped).toBe(false);
    for (let t = STEP; t < 0.25; t += STEP) s = aside.update(card, ctx(t, [truck]), false);
    expect(s.dropped).toBe(false);
    for (let t = 0.25; t < 2; t += STEP) s = aside.update(card, ctx(t, [truck]), false);
    expect(s.dropped).toBe(true);
    for (let t = 2; t < 2.2; t += STEP) s = aside.update(card, ctx(t, []), false);
    expect(s.dropped).toBe(true);
    for (let t = 2.2; t < 2.5; t += STEP) s = aside.update(card, ctx(t, []), false);
    expect(s.dropped).toBe(false);
  });

  it('a label whose light is behind a near bus waits as its light instead of riding the bus, and only a near vehicle does it', () => {
    const label: Rect = { x: 700, y: 300, w: 150, h: 52 };
    const light = { x: 680, y: 340 };
    const bus = (depth: number): KeepOut => ({ rect: { x: 600, y: 250, w: 400, h: 200 }, kind: 'vehicle', moving: true, id: 'm4-bus', depth });
    const far = new Aside();
    expect(far.update(label, ctx(0, [bus(15)]), false, 40, light).dropped).toBe(false);
    const aside = new Aside();
    let s = aside.update(label, ctx(0, [bus(6)]), false, 40, light);
    expect(s.dropped).toBe(true);
    for (let t = STEP; t < 1; t += STEP) s = aside.update(label, ctx(t, [bus(6)]), false, 40, light);
    expect(s.dropped).toBe(true);
    for (let t = 1; t < 1.2; t += STEP) s = aside.update(label, ctx(t, []), false, 40, light);
    expect(s.dropped).toBe(true);
    for (let t = 1.2; t < 1.4; t += STEP) s = aside.update(label, ctx(t, []), false, 40, light);
    expect(s.dropped).toBe(false);
  });
});

describe('keep-outs', () => {
  const pose: CameraPose = { pos: { x: 8.3, y: 1.68, z: zOf(60) }, yaw: 0.2, pitch: 0, fov: 56 };
  const proj = (v: { x: number; y: number; z: number }): ReturnType<typeof project> => project(pose, VP, v);

  it('a car passing beside the eye, partly behind it, stays inside the view and under the cap', () => {
    const car = { min: { x: 4.3, y: 0, z: zOf(63.5) }, max: { x: 6.2, y: 1.5, z: zOf(59.27) } };
    const k = boxKeepOut(car, proj, VP)!;
    expect(k.rect.x).toBeGreaterThanOrEqual(0);
    expect(k.rect.x + k.rect.w).toBeLessThanOrEqual(VP.w);
    expect(k.rect.y + k.rect.h).toBeLessThanOrEqual(VP.h);
    expect(k.depth).toBeGreaterThanOrEqual(KEEPOUT.nearM);
    const capped = capKeepOut(k.rect, VP);
    expect(capped.w).toBeLessThanOrEqual(VP.w * KEEPOUT.cap + 1e-9);
    expect(capped.h).toBeLessThanOrEqual(VP.h * KEEPOUT.cap + 1e-9);
  });

  it('a mover too big to keep whole is capped from the side that runs off the view, so its edge facing the panes stays true', () => {
    const car = capKeepOut({ x: 0, y: 300, w: VP.w, h: VP.h - 300 }, VP);
    expect(car.y).toBe(300);
    expect(car.h).toBeCloseTo(VP.h * KEEPOUT.cap, 6);
  });

  it('a person behind the anchor does not move the pane', () => {
    const aside = new Aside();
    const pane: Rect = { x: 300, y: 200, w: 292, h: 152 };
    const far: KeepOut = { rect: { x: 280, y: 150, w: 80, h: 400 }, kind: 'person', moving: true, id: 'p', depth: 30 };
    let s = aside.update(pane, { t: 0, band: 'stopped', vp: VP, keepOuts: [far] }, false, 20);
    for (let t = STEP; t < 0.6; t += STEP) s = aside.update(pane, { t, band: 'stopped', vp: VP, keepOuts: [far] }, false, 20);
    expect(s.active).toBe(false);
    expect(s.opacity).toBe(1);
  });

  it('the roadway covers the avenue ahead and nothing above 48% of the view', () => {
    const road = roadwayKeepOuts(proj, VP);
    expect(road.length).toBeGreaterThan(0);
    for (const k of road) expect(k.rect.y).toBeGreaterThanOrEqual(VP.h * KEEPOUT.roadCut - 1e-6);
    const p = proj({ x: 0, y: 0, z: zOf(75) });
    expect(road.some((k) => p.x >= k.rect.x && p.x <= k.rect.x + k.rect.w && p.y >= k.rect.y && p.y <= k.rect.y + k.rect.h)).toBe(true);
  });
});

describe('one surface', () => {
  it('a level change grows the pane from the corner its leader meets, which does not move', () => {
    const p = new Placement();
    const anchor = { x: 640, y: 520, depth: 14, inFront: true };
    const ctx: FrameCtx = { t: 0, band: 'stroll', vp: VP, keepOuts: [] };
    const corner = (p: { rect: Rect; align?: 'left' | 'right' | 'center'; vertical?: 'above' | 'below' | 'middle' | 'lift' }): { x: number; y: number } => {
      const { fx, fy } = anchorFactors(p.align ?? 'center', p.vertical ?? 'above');
      return { x: p.rect.x + p.rect.w * fx, y: p.rect.y + p.rect.h * fy };
    };
    let a = p.update({ level: 'glance', anchor, distance: 14, size: NOMINAL_SIZE.glance, focusOk: true }, ctx);
    for (let t = STEP; t < 0.5; t += STEP) a = p.update({ level: 'glance', anchor: { ...anchor, y: anchor.y - t * 30 }, distance: 14, size: NOMINAL_SIZE.glance, focusOk: true }, { ...ctx, t });
    const b = p.update({ level: 'card', anchor: { ...anchor, y: anchor.y - 0.5 * 30 }, distance: 14, size: NOMINAL_SIZE.card, focusOk: true }, { ...ctx, t: 0.5 });
    expect([b.align, b.vertical]).toEqual([a.align, a.vertical]);
    expect(Math.hypot(corner(b).x - corner(a).x, corner(b).y - corner(a).y)).toBeLessThan(4);
  });
});

describe('rule 1 · the zone grows, content is pushed out over 320 ms, not cut', () => {
  it('goes back to its light when the larger zone leaves no place within its own width of it', () => {
    const p = new Placement();
    const anchor = { x: 640, y: 400, depth: 20, inFront: true };
    const req = { level: 'glance' as const, anchor, distance: 20, size: NOMINAL_SIZE.glance, focusOk: false };
    const base: FrameCtx = { t: 0, band: 'stopped', vp: VP, keepOuts: [] };
    p.update(req, { ...base, t: 0 });
    expect(p.update(req, { ...base, t: 2, band: 'brisk' }).mode).toBe('pip');
  });

  it('moves a pane that the larger zone covers and animates the jump', () => {
    const p = new Placement();
    const anchor = { x: 400, y: 380, depth: 20, inFront: true };
    const req = { level: 'glance' as const, anchor, distance: 20, size: NOMINAL_SIZE.glance, focusOk: false };
    const base: FrameCtx = { t: 0, band: 'stopped', vp: VP, keepOuts: [] };
    p.update(req, base);
    p.update(req, { ...base, t: 2, band: 'brisk' });
    const zone = focusRect('brisk', VP.w, VP.h);
    const r = p.update(req, { ...base, t: 2 + 1 / 60, band: 'brisk' });
    expect(r.mode).toBe('pane');
    expect(rectsOverlap(r.rect, zone)).toBe(false);
    const after = p.update(req, { ...base, t: 2 + MOVE.pushOut + 0.05, band: 'brisk' });
    expect(p.jumpX.at(2 + MOVE.pushOut + 0.05)).toBe(0);
    expect(rectsOverlap(after.rect, zone)).toBe(false);
  });
});

describe('rule 9 · legibility against the brightest and darkest façades', () => {
  const facades = Object.entries(ALBEDO).filter(([k]) => !['sky', 'vehicle', 'person', 'tree', 'sign'].includes(k));
  const brightest = Math.max(...facades.map(([, a]) => a), ALBEDO.sky);
  const darkest = Math.min(...facades.map(([, a]) => a)) * SHADE;

  it(`primary text ≥ 4.5:1 and secondary ≥ 3:1 from the darkest (${darkest.toFixed(3)}) to the brightest (${brightest.toFixed(3)}) sample`, () => {
    for (let lum = 0; lum <= 1.0001; lum += 0.01) {
      const { alpha } = tierFor(lum);
      expect(primaryContrast(lum, alpha)).toBeGreaterThanOrEqual(4.5);
      expect(secondaryContrast(lum, alpha)).toBeGreaterThanOrEqual(3);
    }
    expect(tierFor(brightest).alpha).toBe(0.78);
    expect(tierFor(darkest).alpha).toBe(0.52);
  });

  it('the bands match the design system', () => {
    expect(FOCUS_ZONE.stopped).toEqual({ w: 0.33, h: 0.4 });
    expect(tierFor(0.7)).toEqual({ alpha: 0.78, weight: 500 });
    expect(tierFor(0.5)).toEqual({ alpha: 0.66, weight: 400 });
    expect(tierFor(0.2)).toEqual({ alpha: 0.52, weight: 400 });
  });
});
