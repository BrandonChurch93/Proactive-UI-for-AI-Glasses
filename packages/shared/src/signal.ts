import type { Leg, SignalState } from './data';

export const SIGNAL = { cycle: 42, walk: 18, flash: 8, dont: 16, crossOffset: 21 } as const;

export interface SignalAnchor {
  at: number;
  leg: Leg;
  state: SignalState;
  secondsLeft: number;
}

const END: Record<SignalState, number> = {
  walk: SIGNAL.walk,
  flash: SIGNAL.walk + SIGNAL.flash,
  dont: SIGNAL.cycle,
};

const mod = (a: number, m: number): number => ((a % m) + m) % m;

export function phaseAt(anchor: SignalAnchor, leg: Leg, t: number): number {
  const p0 = END[anchor.state] - anchor.secondsLeft;
  const shift = leg === anchor.leg ? 0 : SIGNAL.crossOffset;
  return mod(p0 + (t - anchor.at) + shift, SIGNAL.cycle);
}

export interface SignalReading {
  state: SignalState;
  secondsLeft: number;
  toWalk: number;
  toDont: number;
}

export function readSignal(anchor: SignalAnchor, leg: Leg, t: number): SignalReading {
  const p = phaseAt(anchor, leg, t);
  if (p < SIGNAL.walk) {
    return { state: 'walk', secondsLeft: SIGNAL.walk - p, toWalk: 0, toDont: SIGNAL.walk + SIGNAL.flash - p };
  }
  if (p < SIGNAL.walk + SIGNAL.flash) {
    return { state: 'flash', secondsLeft: SIGNAL.walk + SIGNAL.flash - p, toWalk: SIGNAL.cycle - p, toDont: SIGNAL.walk + SIGNAL.flash - p };
  }
  return { state: 'dont', secondsLeft: SIGNAL.cycle - p, toWalk: SIGNAL.cycle - p, toDont: 0 };
}

export type VehicleLight = 'green' | 'yellow' | 'red';

export function vehicleLight(anchor: SignalAnchor, road: Leg, t: number): VehicleLight {
  const pedLeg: Leg = road === 'avenue' ? 'avenue' : 'cross';
  const p = phaseAt(anchor, pedLeg, t);
  const start = SIGNAL.walk + SIGNAL.flash;
  if (p < start) return 'red';
  if (p < SIGNAL.cycle - 3) return 'green';
  return 'yellow';
}
