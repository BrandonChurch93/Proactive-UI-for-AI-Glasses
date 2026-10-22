import { MOVE, Track } from '@lumen/shared';

export { Aside, Placement, Track, type AsideState, type Curve, type FrameCtx, type PaneMode as PlaceMode, type PlaceRequest, type WorldPlace } from '@lumen/shared';

export interface YieldInput {
  t: number;
  yawRate: number;
  curbDistance: number;
}

export class Yield {
  private side: 'left' | 'right' | null = null;
  private lastFast = -Infinity;

  update(inp: YieldInput): 'left' | 'right' | null {
    const fast = inp.curbDistance < 8 && Math.abs(inp.yawRate) > 0.8;
    if (fast) {
      this.side = inp.yawRate > 0 ? 'left' : 'right';
      this.lastFast = inp.t;
    } else if (this.side && inp.t - this.lastFast > 0.08) {
      this.side = null;
    }
    return this.side;
  }
}

export class PaneYield {
  private readonly x = new Track(0);
  private readonly o = new Track(1);
  on = false;

  update(t: number, side: 'left' | 'right' | null, paneSide: 'left' | 'right'): { dx: number; opacity: number } {
    const want = side !== null && side === paneSide;
    if (want && !this.on) {
      this.on = true;
      this.x.go(t, paneSide === 'left' ? -MOVE.yieldPx : MOVE.yieldPx, MOVE.yieldIn, 'gate');
      this.o.go(t, MOVE.yieldOpacity, MOVE.yieldIn, 'gate');
    } else if (!want && this.on) {
      this.on = false;
      this.x.go(t, 0, MOVE.yieldOut, 'out');
      this.o.go(t, 1, MOVE.yieldOut, 'out');
    }
    return { dx: this.x.at(t), opacity: this.o.at(t) };
  }
}
