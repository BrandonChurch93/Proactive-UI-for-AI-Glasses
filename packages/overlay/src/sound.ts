export class Sound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastTick = -Infinity;
  enabled = false;

  attach(ctx: AudioContext): void {
    this.ctx = ctx;
    const len = Math.round(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    this.noise = buf;
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  tick(): void {
    const ctx = this.ready();
    if (!ctx || ctx.currentTime - this.lastTick < 0.15) return;
    this.lastTick = ctx.currentTime;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(1900, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.16);
  }

  private breath(from: number, to: number, dur: number, gain: number): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  breathUp(long = false): void {
    this.breath(900, 2600, long ? 0.5 : 0.35, 0.05);
  }

  breathDown(): void {
    this.breath(2400, 700, 0.5, 0.06);
  }
}
