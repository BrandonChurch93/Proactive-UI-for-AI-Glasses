import { angleWrap, clamp, pitchToward, yawToward, type Beat, type ScenarioId, type Vec3 } from '@lumen/shared';

export class Head {
  yaw: number;
  pitch: number;
  yawRate = 0;
  private yawV = 0;
  private pitchV = 0;

  constructor(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  step(dt: number, targetYaw: number, targetPitch: number, omega: number): void {
    const prev = this.yaw;
    const ty = this.yaw + angleWrap(targetYaw - this.yaw);
    const ay = omega * omega * (ty - this.yaw) - 2 * omega * this.yawV;
    this.yawV += ay * dt;
    this.yaw += this.yawV * dt;
    const ap = omega * omega * (targetPitch - this.pitch) - 2 * omega * this.pitchV;
    this.pitchV += ap * dt;
    this.pitch += this.pitchV * dt;
    this.yawRate = dt > 0 ? (this.yaw - prev) / dt : 0;
  }

  set(yaw: number, pitch: number): void {
    this.yawV = 0;
    this.pitchV = 0;
    this.yaw = yaw;
    this.pitch = pitch;
  }
}

export const HEAD_LIMIT = Math.PI / 2;
export const IDLE_PITCH = 0.04;
export const STEEP = 0.3;

export interface Events {
  pinch?: string;
  choice?: { id: string; action: string };
  dismiss?: string | null;
}

export class ScriptedReviewer {
  private gazes: { t: number; id: string | null; dy: number }[];
  private pinches: { t: number; id: string }[];
  private choices: { t: number; id: string; action: string }[];
  private lookUps: { t: number; seconds: number }[];
  private scans: { t: number; sequence: string[] }[];

  readonly intents: { t: number; id: ScenarioId }[];

  constructor(b: readonly Beat[]) {
    this.intents = b.flatMap((x) => (x.kind === 'intent' ? [{ t: x.t, id: x.id }] : []));
    this.gazes = b.flatMap((x) => (x.kind === 'gaze' ? [{ t: x.t, id: x.id, dy: x.dy ?? 0 }] : []));
    this.pinches = b.flatMap((x) => (x.kind === 'pinch' ? [{ t: x.t, id: x.id }] : []));
    this.choices = b.flatMap((x) => {
      if (x.kind === 'choice') return [{ t: x.t, id: x.id, action: x.action }];
      if (x.kind === 'ask') return [{ t: x.answerAt, id: 'ask', action: x.answer === 'no' ? 'no' : 'find-lunch' }];
      if (x.kind === 'intent') return [{ t: x.t, id: 'intent', action: x.id }];
      if (x.kind === 'choose') return [{ t: x.t, id: 'picker', action: x.id }];
      if (x.kind === 'reply') return [{ t: x.t, id: x.id, action: x.reply }];
      if (x.kind === 'go') return [{ t: x.t, id: x.id, action: 'go' }];
      return [];
    });
    this.lookUps = b.flatMap((x) => (x.kind === 'lookUp' ? [{ t: x.t, seconds: x.seconds }] : []));
    this.scans = b.flatMap((x) => (x.kind === 'headScan' ? [{ t: x.t, sequence: x.sequence }] : []));
  }

  gazeId(t: number): string | null {
    let id: string | null = null;
    for (const g of this.gazes) if (g.t <= t + 1e-9) id = g.id;
    return id;
  }

  aimPoint(t: number, anchorOf: (id: string) => Vec3 | undefined): Vec3 | undefined {
    let g: { id: string | null; dy: number } | null = null;
    for (const x of this.gazes) if (x.t <= t + 1e-9) g = x;
    const a = g?.id && !g.id.startsWith('pocket:') ? anchorOf(g.id) : undefined;
    return a && { ...a, y: a.y - g!.dy };
  }

  eventsBetween(a: number, b: number): Events {
    const ev: Events = {};
    const p = this.pinches.find((x) => x.t > a + 1e-9 && x.t <= b + 1e-9);
    if (p) ev.pinch = p.id;
    const c = this.choices.find((x) => x.t > a + 1e-9 && x.t <= b + 1e-9);
    if (c) ev.choice = { id: c.id, action: c.action };
    return ev;
  }

  lookingUp(t: number): boolean {
    return this.lookUps.some((l) => t >= l.t && t < l.t + l.seconds + 0.25);
  }

  scanOffset(t: number): number | null {
    for (const s of this.scans) {
      const k = t - s.t;
      if (k < 0 || k > 2.2) continue;
      if (k < 0.7) return 1.05;
      if (k < 1.65) return -1.05;
      return 0;
    }
    return null;
  }

  aim(t: number, eye: Vec3, bodyYaw: number, anchorOf: (id: string) => Vec3 | undefined, crossing: boolean): { yaw: number; pitch: number; omega: number } {
    const idle = 0.2 + 0.06 * Math.sin(t * 0.21) + 0.03 * Math.sin(t * 0.53 + 1.3);
    let yaw = bodyYaw + (crossing ? 0.05 * Math.sin(t * 0.7) : idle);
    let pitch = IDLE_PITCH + 0.012 * Math.sin(t * 0.37);
    let omega = 6.5;
    const a = this.aimPoint(t, anchorOf);
    if (a) {
      yaw = yawToward(eye, a);
      pitch = clamp(pitchToward(eye, a), -0.4, STEEP);
      omega = 9;
    }
    const scan = this.scanOffset(t);
    if (scan !== null) {
      yaw += scan;
      omega = 10;
    }
    if (this.lookingUp(t)) {
      pitch = 0.62;
      omega = 8;
    }
    const off = clamp(angleWrap(yaw - bodyYaw), -HEAD_LIMIT, HEAD_LIMIT);
    return { yaw: bodyYaw + off, pitch, omega };
  }
}
