export const T = {
  snap: 0.12,
  quick: 0.22,
  base: 0.36,
  baseCard: 0.42,
  open: 0.48,
  scene: 0.9,
} as const;

export const EASE = {
  out: 'power3.out',
  in: 'power2.in',
  gate: 'power1.inOut',
  travel: 'power2.inOut',
} as const;

export { MOVE } from '@lumen/shared';

export const LIGHT_COLOR = {
  pip: [2.4, 2.1, 1.5],
  aura: [1.1, 0.95, 0.7],
  flare: [2.5, 2.4, 2.1],
  head: [3, 2.8, 2.3],
  leader: [2.2, 2.1, 1.9],
} as const;

export const LIGHT_SIZE = { pip: 0.7, pipGazed: 1.6, aura: 1.8, flareW: 5.0, flareH: 0.32, head: 0.5 } as const;

export const BACKDROP = [
  { above: 0.6, alpha: 0.78, weight: 500 },
  { above: 0.4, alpha: 0.66, weight: 400 },
  { above: -1, alpha: 0.52, weight: 400 },
] as const;
