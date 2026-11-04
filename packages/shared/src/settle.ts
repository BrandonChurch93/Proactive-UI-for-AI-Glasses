// One number for the walk's release grace and aiming window, the sim's flicker and the brain's look-away: the owner's
// "the moment", with room to ride out a glance.
export const LOOK_AWAY_S = 0.5;

export const SETTLE = { stillRate: 0.3, stillS: 0.3, moveRate: 0.6, moveS: 0.2, lookRad: 0.2 } as const;

export class Settle {
  settled = true;
  private still = 0;
  private moving = 0;
  private drift = 0;

  step(yawRate: number, dt: number): boolean {
    const r = Math.abs(yawRate);
    this.still = r < SETTLE.stillRate ? this.still + dt : 0;
    this.moving = r > SETTLE.moveRate ? this.moving + dt : 0;
    this.drift += yawRate * dt;
    if (!this.settled && this.still >= SETTLE.stillS - 1e-9) {
      this.settled = true;
      this.drift = 0;
    } else if (this.settled && (this.moving >= SETTLE.moveS - 1e-9 || Math.abs(this.drift) > SETTLE.lookRad)) {
      this.settled = false;
      this.still = 0;
    }
    return this.settled;
  }
}
