import type { WorldSnapshot } from '@lumen/shared';
import type { Config } from './config';

export class Pocket {
  items: string[] = [];
  surfacedThisStop = false;

  save(id: string): boolean {
    if (this.items.includes(id)) return false;
    this.items.push(id);
    return true;
  }

  take(id: string): boolean {
    const i = this.items.indexOf(id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  timeAvailable(snap: WorldSnapshot, cfg: Config): number {
    const cw = snap.env.crosswalk;
    if (cw && cw.onRoute && cw.distance < 10 && cw.signal !== 'walk') return cw.toWalk;
    return cfg.pocket.defaultSeconds;
  }

  shouldSurface(stoppedFor: number, available: number, gated: boolean, cfg: Config): boolean {
    return (
      !gated &&
      !this.surfacedThisStop &&
      this.items.length > 0 &&
      stoppedFor >= cfg.pocket.stoppedForS - 1e-9 &&
      available >= cfg.pocket.minSeconds
    );
  }
}
