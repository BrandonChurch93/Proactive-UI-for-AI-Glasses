import { UI_VOICES, whiteBuffer, type SoundOut } from '@lumen/overlay';
import { STREET_LEVELS, Street, beepVoice, passVoice, startBed, stepVoice } from './ambient';
import { buildGraph, pinkBuffer, type Graph } from './graph';

// Renders each voice of the set offline through the same graph the walk plays, for scripts/soundcheck.ts and
// scripts/soundsheet.ts: neither of us can listen, so the set is measured here and the owner listens to the sheet.

type Measure = 'peak' | 'rms' | 'short';
interface Voice {
  seconds: number;
  target: number;
  measure: Measure;
  play(g: Graph, pink: AudioBuffer, white: AudioBuffer): void;
}

const ui = (g: Graph): SoundOut => ({ ctx: g.ctx, ui: g.ui });
const T0 = 0.05;

const bedStreet = (g: Graph, pink: AudioBuffer, seconds: number): void => {
  startBed(g, pink, 0);
  const street = new Street(g, pink);
  for (let t = 0; t < seconds; t += 0.05) street.update({ t, band: 'stopped', crossing: false, walkSignal: false, beeping: false, roadPan: 0.6, signalPan: 0, paint: false }, t);
};

export const VOICES: Record<string, Voice> = {
  mark: { seconds: 0.6, target: -22, measure: 'peak', play: (g) => UI_VOICES.mark(ui(g), T0) },
  unfold: { seconds: 1, target: -28, measure: 'short', play: (g, _p, w) => UI_VOICES.unfold(ui(g), T0, w) },
  open: { seconds: 1.2, target: -28, measure: 'short', play: (g, _p, w) => UI_VOICES.open(ui(g), T0, w) },
  recede: { seconds: 1.2, target: -28, measure: 'short', play: (g, _p, w) => UI_VOICES.recede(ui(g), T0, w) },
  thud: { seconds: 0.3, target: STREET_LEVELS.thud, measure: 'peak', play: (g, p) => stepVoice(g, p, T0, 0, false, 1, { thud: true, scuff: false }) },
  scuff: { seconds: 0.3, target: STREET_LEVELS.scuff, measure: 'peak', play: (g, p) => stepVoice(g, p, T0, 0, false, 1, { thud: false, scuff: true }) },
  step: { seconds: 0.3, target: -23, measure: 'peak', play: (g, p) => stepVoice(g, p, T0, 0.15, false, 1) },
  'step on paint': { seconds: 0.3, target: -23, measure: 'peak', play: (g, p) => stepVoice(g, p, T0, -0.15, true, 1) },
  beep: { seconds: 0.3, target: STREET_LEVELS.beep, measure: 'peak', play: (g) => beepVoice(g, T0, 0) },
  pass: { seconds: 3.4, target: STREET_LEVELS.pass, measure: 'short', play: (g, p) => passVoice(g, p, T0, 3, -0.75, 0.75, 1, { body: true, tire: false }) },
  'tire hiss': { seconds: 3.4, target: STREET_LEVELS.hiss, measure: 'short', play: (g, p) => passVoice(g, p, T0, 3, -0.75, 0.75, 1, { body: false, tire: true }) },
  'pass with hiss': { seconds: 3.4, target: STREET_LEVELS.pass, measure: 'short', play: (g, p) => passVoice(g, p, T0, 3, -0.75, 0.75, 1) },
  traffic: { seconds: 20, target: STREET_LEVELS.traffic, measure: 'rms', play: (g, p) => startBed(g, p, 0, { traffic: true, air: false }) },
  air: { seconds: 20, target: STREET_LEVELS.air, measure: 'rms', play: (g, p) => startBed(g, p, 0, { traffic: false, air: true }) },
  bed: { seconds: 20, target: -30, measure: 'rms', play: (g, p) => bedStreet(g, p, 20) },
};

export async function render(name: string, rate = 48000): Promise<Float32Array[]> {
  const v = VOICES[name];
  if (!v) throw new Error(`no voice ${name}`);
  const ctx = new OfflineAudioContext(2, Math.round(v.seconds * rate), rate);
  const g = buildGraph(ctx);
  v.play(g, pinkBuffer(ctx, 8, 2207), whiteBuffer(ctx, 0.6));
  const out = await ctx.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}

const dbOf = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k);
        const s = Math.sin(a * k);
        const xr = re[i + k + len / 2]! * c - im[i + k + len / 2]! * s;
        const xi = re[i + k + len / 2]! * s + im[i + k + len / 2]! * c;
        re[i + k + len / 2] = re[i + k]! - xr;
        im[i + k + len / 2] = im[i + k]! - xi;
        re[i + k] = re[i + k]! + xr;
        im[i + k] = im[i + k]! + xi;
      }
    }
  }
}

export function stats(ch: Float32Array[], rate = 48000): { peak: number; rms: number; short: number; centroid: number } {
  const n = ch[0]!.length;
  let peak = 0;
  let sum = 0;
  const mono = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const l = ch[0]![i]!;
    const r = ch[1]![i]!;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += (l * l + r * r) / 2;
    mono[i] = (l + r) / 2;
  }
  const win = Math.round(rate * 0.2);
  let best = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (ch[0]![i]! ** 2 + ch[1]![i]! ** 2) / 2;
    if (i >= win) acc -= (ch[0]![i - win]! ** 2 + ch[1]![i - win]! ** 2) / 2;
    if (i >= win - 1) best = Math.max(best, acc / win);
  }
  const N = 4096;
  const mag = new Float64Array(N / 2);
  for (let s = 0; s + N <= n; s += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k]! += Math.hypot(re[k]!, im[k]!);
  }
  let num = 0;
  let den = 0;
  for (let k = 1; k < N / 2; k++) {
    num += ((k * rate) / N) * mag[k]!;
    den += mag[k]!;
  }
  return { peak: dbOf(peak), rms: dbOf(Math.sqrt(sum / n)), short: dbOf(Math.sqrt(best || sum / n)), centroid: den ? num / den : 0 };
}

export function wav(ch: Float32Array[], rate = 48000): string {
  const n = ch[0]!.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c]![i]!)) * 32767, true);
  }
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function unityGain(): Promise<number> {
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, rate, rate);
  const g = buildGraph(ctx);
  const osc = ctx.createOscillator();
  osc.frequency.value = 1000;
  const k = ctx.createGain();
  k.gain.value = 0.01;
  osc.connect(k).connect(g.master);
  osc.start(0);
  const out = await ctx.startRendering();
  const d = out.getChannelData(0);
  let peak = 0;
  for (let i = rate / 2; i < rate; i++) peak = Math.max(peak, Math.abs(d[i]!));
  return peak / 0.01;
}

export const soundlab = {
  unity: unityGain,
  names: (): string[] => Object.keys(VOICES),
  async check(): Promise<{ name: string; target: number; measure: Measure; peak: number; rms: number; short: number; centroid: number }[]> {
    const out = [];
    for (const name of Object.keys(VOICES)) {
      const v = VOICES[name]!;
      out.push({ name, target: v.target, measure: v.measure, ...stats(await render(name)) });
    }
    return out;
  },
  async wav(name: string): Promise<string> {
    return wav(await render(name));
  },
};
