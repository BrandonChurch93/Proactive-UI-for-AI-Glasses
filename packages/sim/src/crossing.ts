import type { SignalReading, SignalState, VehicleLight } from '@lumen/shared';

export const SOUTH = { yellow: 3, allRed: 1, walk: 7, flash: 6, clear: 1, minGreen: 18, release: 0.6 } as const;

type Phase = 'green' | 'yellow' | 'allred' | 'held' | 'walk' | 'flash' | 'clear';

// The mid-block crossing at the south end is actuated: traffic runs until someone asks to cross, and the
// sim holds it at the start corner while the intent is chosen.
export class SouthSignal {
  private phase: Phase = 'green';
  private since = -Infinity;
  private asked: number | null = null;
  private holding = false;

  constructor(start: number, held: boolean) {
    this.since = start;
    if (held) {
      this.phase = 'held';
      this.holding = true;
    }
  }

  get held(): boolean {
    return this.holding;
  }

  request(t: number): void {
    if (this.phase === 'green' && this.asked === null) this.asked = t;
  }

  hold(t: number): void {
    this.holding = true;
    if (this.phase === 'green') this.go('yellow', t);
  }

  release(t: number): void {
    if (!this.holding) return;
    this.holding = false;
    if (this.phase === 'held') this.go('walk', t + SOUTH.release);
  }

  private go(p: Phase, t: number): void {
    this.phase = p;
    this.since = t;
  }

  step(t: number): void {
    const el = t - this.since;
    if (el < 0) return;
    switch (this.phase) {
      case 'green':
        if (this.asked !== null && el >= SOUTH.minGreen) {
          this.asked = null;
          this.go('yellow', t);
        }
        break;
      case 'yellow':
        if (el >= SOUTH.yellow) this.go('allred', t);
        break;
      case 'allred':
        if (el >= SOUTH.allRed) this.go(this.holding ? 'held' : 'walk', t);
        break;
      case 'walk':
        if (el >= SOUTH.walk) this.go('flash', t);
        break;
      case 'flash':
        if (el >= SOUTH.flash) this.go('clear', t);
        break;
      case 'clear':
        if (el >= SOUTH.clear) this.go(this.holding ? 'held' : 'green', t);
        break;
      case 'held':
        break;
    }
  }

  read(t: number): SignalReading {
    const el = Math.max(0, t - this.since);
    const ped: SignalState = this.phase === 'walk' && t >= this.since ? 'walk' : this.phase === 'flash' ? 'flash' : 'dont';
    if (ped === 'walk') return { state: 'walk', secondsLeft: SOUTH.walk - el, toWalk: 0, toDont: SOUTH.walk + SOUTH.flash - el };
    if (ped === 'flash') return { state: 'flash', secondsLeft: SOUTH.flash - el, toWalk: 99, toDont: SOUTH.flash - el };
    const toWalk =
      this.phase === 'walk'
        ? this.since - t
        : this.phase === 'allred'
          ? SOUTH.allRed - el
          : this.phase === 'yellow'
            ? SOUTH.yellow + SOUTH.allRed - el
            : this.phase === 'green' && this.asked !== null
              ? Math.max(0, SOUTH.minGreen - el) + SOUTH.yellow + SOUTH.allRed
              : 99;
    return { state: 'dont', secondsLeft: toWalk, toWalk, toDont: 0 };
  }

  vehicle(): VehicleLight {
    return this.phase === 'green' ? 'green' : this.phase === 'yellow' ? 'yellow' : 'red';
  }
}
