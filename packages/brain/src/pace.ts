import type { Band } from '@lumen/shared';
import type { Config } from './config';

export function bandFor(speed: number, cfg: Config): Band {
  if (speed < cfg.band.stroll) return 'stopped';
  if (speed < cfg.band.walk) return 'stroll';
  if (speed <= cfg.band.brisk) return 'walk';
  return 'brisk';
}

export class Pace {
  band: Band | null = null;
  changedAt = 0;
  private pending: Band | null = null;
  private pendingSince = 0;

  constructor(private readonly cfg: Config) {}

  update(speed: number, t: number, forced: Band | null = null): Band {
    const raw = forced ?? bandFor(speed, this.cfg);
    if (this.band === null || forced) {
      if (this.band !== raw) this.changedAt = t;
      this.band = raw;
      this.pending = null;
      return raw;
    }
    if (raw === this.band) {
      this.pending = null;
      return this.band;
    }
    if (raw !== this.pending) {
      this.pending = raw;
      this.pendingSince = t;
    }
    if (t - this.pendingSince >= this.cfg.band.hysteresisS - 1e-9) {
      this.band = raw;
      this.changedAt = t;
      this.pending = null;
    }
    return this.band;
  }
}
