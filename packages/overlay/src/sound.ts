const dbv = (v: number): number => Math.pow(10, v / 20);

export const UI_LEVELS = { mark: -22, partial: -12, breath: -26, breathTone: -30, recedeTone: -30 } as const;
// The breath's envelope is set so its loudest 200 ms sits at -28 dBFS, 2 dB over the tone inside it (scripts/soundcheck.ts).

export interface SoundOut {
  ctx: BaseAudioContext;
  ui: AudioNode;
}

// The glasses' own voices. Each takes a start time so the same code plays live and renders offline.
export function markVoice(o: SoundOut, t: number): void {
  const { ctx } = o;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(dbv(UI_LEVELS.mark), t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.002, 0.18 / 4.6);
  g.connect(o.ui);
  for (const [f, lv] of [[2093, 0], [3136, -3], [5274, UI_LEVELS.partial]] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const k = ctx.createGain();
    k.gain.value = dbv(lv) * 0.97;
    osc.connect(k).connect(g);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

export function breathVoice(o: SoundOut, t: number, noise: AudioBuffer, from: number, to: number, dur: number, tone: { f: number; db: number; dur: number } | null): void {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(dbv(UI_LEVELS.breath) * 5.2, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(bp).connect(g).connect(o.ui);
  src.start(t);
  src.stop(t + dur + 0.02);
  if (!tone) return;
  const osc = ctx.createOscillator();
  osc.frequency.value = tone.f;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, t);
  tg.gain.linearRampToValueAtTime(dbv(tone.db), t + Math.min(0.06, tone.dur * 0.3));
  tg.gain.linearRampToValueAtTime(0, t + tone.dur);
  osc.connect(tg).connect(o.ui);
  osc.start(t);
  osc.stop(t + tone.dur + 0.02);
}

export function whiteBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buf;
}

export const UI_VOICES = {
  mark: (o: SoundOut, t: number): void => markVoice(o, t),
  unfold: (o: SoundOut, t: number, n: AudioBuffer): void => breathVoice(o, t, n, 900, 2600, 0.35, { f: 1046, db: UI_LEVELS.breathTone, dur: 0.35 }),
  open: (o: SoundOut, t: number, n: AudioBuffer): void => breathVoice(o, t, n, 900, 2600, 0.5, { f: 1046, db: UI_LEVELS.breathTone, dur: 0.5 }),
  recede: (o: SoundOut, t: number, n: AudioBuffer): void => breathVoice(o, t, n, 2400, 700, 0.5, { f: 196, db: UI_LEVELS.recedeTone, dur: 0.4 }),
} as const;

export class Sound {
  private out: SoundOut | null = null;
  private noise: AudioBuffer | null = null;
  private lastTick = -Infinity;
  enabled = false;

  attach(ctx: AudioContext, ui?: AudioNode): void {
    this.out = { ctx, ui: ui ?? ctx.destination };
    this.noise = whiteBuffer(ctx, 0.6);
  }

  private ready(): (SoundOut & { ctx: AudioContext }) | null {
    const o = this.out as (SoundOut & { ctx: AudioContext }) | null;
    if (!this.enabled || !o || o.ctx.state !== 'running') return null;
    return o;
  }

  tick(): void {
    const o = this.ready();
    if (!o || o.ctx.currentTime - this.lastTick < 0.15) return;
    this.lastTick = o.ctx.currentTime;
    UI_VOICES.mark(o, o.ctx.currentTime);
  }

  breathUp(long = false): void {
    const o = this.ready();
    if (o && this.noise) (long ? UI_VOICES.open : UI_VOICES.unfold)(o, o.ctx.currentTime, this.noise);
  }

  breathDown(): void {
    const o = this.ready();
    if (o && this.noise) UI_VOICES.recede(o, o.ctx.currentTime, this.noise);
  }
}
