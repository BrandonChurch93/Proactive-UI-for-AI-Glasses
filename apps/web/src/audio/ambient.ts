export class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nextHorn = 6;
  private nextStep = 0;
  private stepSide = 0;
  on = false;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    let seed = 7;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      const w = (seed / 2147483647) * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const bed = ctx.createBufferSource();
    bed.buffer = buf;
    bed.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.08;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    bed.connect(lp).connect(bedGain).connect(master);
    const rumble = ctx.createBufferSource();
    rumble.buffer = buf;
    rumble.loop = true;
    rumble.playbackRate.value = 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 140;
    bp.Q.value = 0.7;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.05;
    rumble.connect(bp).connect(rumbleGain).connect(master);
    bed.start();
    rumble.start();
    lfo.start();
    return ctx;
  }

  toggle(): boolean {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    this.on = !this.on;
    this.master!.gain.linearRampToValueAtTime(this.on ? 1 : 0, ctx.currentTime + 0.8);
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

  update(t: number, speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.master) return;
    if (t > this.nextHorn) {
      this.nextHorn = t + 9 + ((t * 7919) % 11);
      this.horn(ctx);
    }
    if (speed > 0.25) {
      const rate = 1.65 * (speed / 1.38);
      if (t >= this.nextStep) {
        this.nextStep = t + 1 / Math.max(1.2, rate);
        this.step(ctx);
      }
    } else this.nextStep = t;
  }

  private horn(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.018, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(now);
      o.stop(now + 0.45);
    }
    lp.connect(g).connect(this.master!);
  }

  private step(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (((i * 2654435761) % 1000) / 500 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = this.stepSide++ % 2 ? 900 : 760;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master!);
    src.start(now);
  }
}
