import type { Band } from '@lumen/shared';
import { buildGraph, db, mulberry, pinkBuffer, type Graph } from './graph';

export const STREET_LEVELS = { traffic: -30, air: -42, pass: -24, hiss: -36, thud: -26, scuff: -34, beep: -34 } as const;
export const CADENCE: Record<Band, number> = { stopped: 0, stroll: 1.4, walk: 1.75, brisk: 2.0 };

// Measured on the rendered bed (scripts/soundcheck.ts): what each filter leaves of unit-RMS pink noise.
export const TRIM = { traffic: 0.98, air: 2.39, pass: 3.3, hiss: 3.16, scuff: 1.95, thud: 2.0, beep: 1.88 };

export interface StreetFrame {
  t: number;
  band: Band;
  crossing: boolean;
  walkSignal: boolean;
  beeping: boolean;
  roadPan: number;
  signalPan: number;
  paint: boolean;
}

export function startBed(g: Graph, noise: AudioBuffer, t: number, layers: { traffic: boolean; air: boolean } = { traffic: true, air: true }): () => void {
  const { ctx } = g;
  const traffic = ctx.createBufferSource();
  traffic.buffer = noise;
  traffic.loop = true;
  const lp1 = ctx.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.frequency.value = 600;
  lp1.Q.value = Math.SQRT1_2;
  const tg = ctx.createGain();
  const base = db(STREET_LEVELS.traffic) * TRIM.traffic;
  tg.gain.value = base;
  for (const [f, phase] of [[0.07, 0], [0.13, 0.4]] as const) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = f;
    const depth = ctx.createGain();
    depth.gain.value = base * (db(2) - 1);
    lfo.connect(depth).connect(tg.gain);
    lfo.start(t + phase);
  }
  traffic.connect(lp1).connect(tg).connect(g.street);
  const air = ctx.createBufferSource();
  air.buffer = noise;
  air.loop = true;
  air.loopStart = 1.3;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 0.6;
  const ag = ctx.createGain();
  ag.gain.value = db(STREET_LEVELS.air) * TRIM.air;
  air.connect(bp).connect(ag).connect(g.street);
  if (layers.traffic) traffic.start(t);
  if (layers.air) air.start(t, 1.3);
  return () => {
    if (layers.traffic) traffic.stop();
    if (layers.air) air.stop();
  };
}

// A vehicle going by: noise whose band follows a Doppler curve, panned across, with tire hiss riding it.
export function passVoice(g: Graph, noise: AudioBuffer, t: number, dur: number, panFrom: number, panTo: number, offset: number, parts: { body: boolean; tire: boolean } = { body: true, tire: true }): void {
  const { ctx } = g;
  const mid = t + dur * 0.45;
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(panFrom, t);
  pan.pan.linearRampToValueAtTime(panTo, t + dur);
  pan.connect(g.street);
  const env = (lv: number, trim: number): GainNode => {
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(db(lv) * trim, mid);
    e.gain.linearRampToValueAtTime(0, t + dur);
    e.connect(pan);
    return e;
  };
  const body = ctx.createBufferSource();
  body.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(900, mid);
  bp.frequency.exponentialRampToValueAtTime(250, t + dur);
  body.connect(bp).connect(env(STREET_LEVELS.pass, TRIM.pass));
  const tire = ctx.createBufferSource();
  tire.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 3000;
  hp.Q.value = 1.2;
  tire.connect(hp).connect(env(STREET_LEVELS.hiss, TRIM.hiss));
  if (parts.body) {
    body.start(t, offset);
    body.stop(t + dur + 0.05);
  }
  if (parts.tire) {
    tire.start(t, offset + 0.7);
    tire.stop(t + dur + 0.05);
  }
}

export function stepVoice(g: Graph, noise: AudioBuffer, t: number, pan: number, paint: boolean, offset: number, parts: { thud: boolean; scuff: boolean } = { thud: true, scuff: true }): void {
  const { ctx } = g;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(g.street);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.06);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, t);
  tg.gain.linearRampToValueAtTime(db(STREET_LEVELS.thud) * TRIM.thud, t + 0.004);
  tg.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
  osc.connect(tg).connect(p);
  if (parts.thud) {
    osc.start(t);
    osc.stop(t + 0.09);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = paint ? 2150 : 1750;
  bp.Q.value = 1.3;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0, t);
  sg.gain.linearRampToValueAtTime(db(STREET_LEVELS.scuff) * TRIM.scuff, t + 0.005);
  sg.gain.linearRampToValueAtTime(0, t + 0.04);
  src.connect(bp).connect(sg).connect(p);
  if (parts.scuff) {
    src.start(t, offset);
    src.stop(t + 0.05);
  }
}

export function beepVoice(g: Graph, t: number, pan: number): void {
  const { ctx } = g;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(g.street);
  const osc = ctx.createOscillator();
  osc.frequency.value = 2400;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(db(STREET_LEVELS.beep) * TRIM.beep, t + 0.003);
  e.gain.setValueAtTime(db(STREET_LEVELS.beep) * TRIM.beep, t + 0.027);
  e.gain.linearRampToValueAtTime(0, t + 0.03);
  osc.connect(e).connect(p);
  osc.start(t);
  osc.stop(t + 0.04);
}

// The street around the wearer, scheduled on the walk's clock from a seed, so the same walk makes the same sound.
export class Street {
  private rand = mulberry(47);
  private nextPass = 4;
  private nextStep = 0;
  private nextBeep = 0;
  private side = 1;
  private lastT = -Infinity;

  constructor(
    private readonly g: Graph,
    private readonly noise: AudioBuffer,
  ) {}

  reset(t: number): void {
    this.rand = mulberry(47 + Math.floor(t));
    this.nextPass = t + 4;
    this.nextStep = t;
    this.nextBeep = t;
  }

  update(f: StreetFrame, now: number): void {
    if (f.t < this.lastT - 0.5 || f.t > this.lastT + 2) this.reset(f.t);
    this.lastT = f.t;
    if (f.t >= this.nextPass) {
      const dur = 2.2 + this.rand() * 1.3;
      const dir = this.rand() < 0.5 ? -1 : 1;
      this.nextPass = f.t + 6 + this.rand() * 8;
      if (!(f.crossing && f.walkSignal)) {
        const bias = f.roadPan * 0.35;
        const clampP = (v: number): number => Math.max(-1, Math.min(1, v));
        passVoice(this.g, this.noise, now, dur, clampP(bias - dir * 0.75), clampP(bias + dir * 0.75), this.rand() * 3.5);
      }
    }
    const rate = CADENCE[f.band];
    if (rate > 0) {
      if (f.t >= this.nextStep) {
        const jitter = (this.rand() * 2 - 1) * 0.012;
        this.nextStep = f.t + 1 / rate + jitter;
        this.side = -this.side;
        stepVoice(this.g, this.noise, now, 0.15 * this.side, f.paint, this.rand() * 5);
      }
    } else this.nextStep = f.t;
    if (f.beeping) {
      if (f.t >= this.nextBeep) {
        this.nextBeep = Math.floor(f.t) + 1;
        beepVoice(this.g, now, f.signalPan);
      }
    } else this.nextBeep = f.t;
  }
}

export class Ambient {
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
  private graph: Graph | null = null;
  private street: Street | null = null;
  on = false;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const volume = ctx.createGain();
    volume.gain.value = 0;
    volume.connect(ctx.destination);
    this.volume = volume;
    const g = buildGraph(ctx, volume);
    this.graph = g;
    const noise = pinkBuffer(ctx, 8, 2207);
    startBed(g, noise, ctx.currentTime);
    this.street = new Street(g, noise);
    return ctx;
  }

  toggle(): boolean {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    this.on = !this.on;
    this.volume!.gain.linearRampToValueAtTime(this.on ? 1 : 0, ctx.currentTime + 0.8);
    return this.on;
  }

  pause(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.on) void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.on ? this.ctx : null;
  }

  get ui(): AudioNode | null {
    return this.graph?.ui ?? null;
  }

  update(f: StreetFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.street) return;
    this.street.update(f, ctx.currentTime);
  }
}
