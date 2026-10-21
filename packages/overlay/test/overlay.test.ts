import { describe, expect, it } from 'vitest';
import { Brain } from '@lumen/brain';
import { FOCUS_ZONE, LEVEL_RANK, NOMINAL_SIZE, SCENARIO_IDS, focusRect, project, rectsOverlap, type Rect } from '@lumen/shared';
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
        if (i % (60 / TICK_HZ) === 0) frame = brain.tick(sim.snapshot());
        const pose = sim.cameraPose();
        const kos: KeepOut[] = keepOuts(sim, pose, VP).map((rect, k) => ({ rect, kind: 'person', moving: true, id: String(k) }));
        const ctx: FrameCtx = { t: sim.t, band: frame.band, vp: VP, keepOuts: kos };
        const zone = focusRect(frame.band, VP.w, VP.h);
        for (const d of frame.items) {
          if (d.placement.zone !== 'world' || LEVEL_RANK[d.level] < LEVEL_RANK.glance || d.level === 'whisper') continue;
          const a = sim.anchorOf(d.placement.anchor);
          if (!a) continue;
          let p = placements.get(d.id);
          if (!p) {
            p = new Placement(d.placement.enter === 'edge');
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
      const s = aside.update(card, ctx(t, [{ rect: ahead, kind: 'person', moving: true, id: 'p' }]), false);
      const shown: Rect = { ...card, x: card.x + s.dx, y: card.y + s.dy };
      if (rectsOverlap(shown, now) && !s.dropped) worst = Math.max(worst, s.opacity);
    }
    expect(worst).toBeLessThanOrEqual(MOVE.asideOpacity + 1e-6);
  });

  it('steps aside by the overlap plus 20 px and comes back when clear', () => {
    const aside = new Aside();
    const pane: Rect = { x: 40, y: 200, w: 292, h: 152 };
    const ko: KeepOut = { rect: { x: 20, y: 150, w: 60, h: 400 }, kind: 'person', moving: false, id: 'p' };
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

  it('a person who would need a long slide to clear drops the pane to its light instead', () => {
    const aside = new Aside();
    const ko: KeepOut = { rect: { x: 360, y: 150, w: 180, h: 400 }, kind: 'person', moving: false, id: 'p' };
    let s = aside.update(card, ctx(0, [ko]), false);
    for (let t = STEP; t < 0.6; t += STEP) s = aside.update(card, ctx(t, [ko]), false);
    expect(s.dropped).toBe(true);
    expect(Math.hypot(s.dx, s.dy)).toBeLessThan(1);
  });

  it('a moving vehicle dims the pane on the first frame and drops it to a pip when it cannot clear', () => {
    const aside = new Aside();
    const truck: KeepOut = { rect: { x: 0, y: 0, w: 1280, h: 800 }, kind: 'vehicle', moving: true, id: 'truck' };
    let s = aside.update(card, ctx(0, [truck]), false);
    expect(s.dropped).toBe(true);
    for (let t = STEP; t < 2; t += STEP) s = aside.update(card, ctx(t, [truck]), false);
    expect(s.dropped).toBe(true);
    for (let t = 2; t < 2.4; t += STEP) s = aside.update(card, ctx(t, []), false);
    expect(s.dropped).toBe(false);
  });
});

describe('rule 1 · the zone grows, content is pushed out over 320 ms, not cut', () => {
  it('moves a pane that the larger zone covers and animates the jump', () => {
    const p = new Placement(false);
    const anchor = { x: 560, y: 380, depth: 20, inFront: true };
    const req = { level: 'glance' as const, anchor, distance: 20, size: NOMINAL_SIZE.glance, focusOk: false };
    const base: FrameCtx = { t: 0, band: 'stopped', vp: VP, keepOuts: [] };
    p.update(req, base);
    p.update(req, { ...base, t: 2, band: 'brisk' });
    const zone = focusRect('brisk', VP.w, VP.h);
    const r = p.update(req, { ...base, t: 2 + 1 / 60, band: 'brisk' });
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
