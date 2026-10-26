export const SETTLE = { stillRate: 0.3, stillS: 0.3, moveRate: 0.6, moveS: 0.2 } as const;

export class Settle {
  settled = true;
  private still = 0;
  private moving = 0;

  step(yawRate: number, dt: number): boolean {
    const r = Math.abs(yawRate);
    this.still = r < SETTLE.stillRate ? this.still + dt : 0;
    this.moving = r > SETTLE.moveRate ? this.moving + dt : 0;
    if (!this.settled && this.still >= SETTLE.stillS - 1e-9) this.settled = true;
    else if (this.settled && this.moving >= SETTLE.moveS - 1e-9) this.settled = false;
    return this.settled;
  }
}
