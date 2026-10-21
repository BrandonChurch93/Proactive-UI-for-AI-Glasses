import type { Band, Timing } from '@lumen/shared';
import type { Config } from './config';

export function autoFoldLimit(band: Band, cfg: Config): number | null {
  return cfg.autoFoldS[band];
}

export function messageTiming(band: Band, gated: boolean, cardOpen: boolean, batched: boolean): Timing {
  if (gated) return 'after-gate';
  if (batched && cardOpen) return 'batched';
  return band === 'stopped' ? 'now' : 'next-pause';
}

export function scoreChangeAllowed(since: number, t: number, cfg: Config): boolean {
  return t - since >= cfg.hysteresisS - 1e-9;
}

export function viewFoldDue(movingS: number, stillS: number, gaze: boolean, cfg: Config, stillLimit?: number): boolean {
  if (gaze) return false;
  if (movingS >= cfg.viewFoldS - 1e-9) return true;
  return stillLimit !== undefined && stillS >= stillLimit - 1e-9;
}
