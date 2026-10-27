export function db(v: number): number {
  return Math.pow(10, v / 20);
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pink noise (Kellet's -3 dB per octave filter on seeded white noise), each channel its own sequence, normalized to unit RMS.
export function pinkBuffer(ctx: BaseAudioContext, seconds: number, seed: number, channels = 2): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const rand = mulberry(seed + c * 7919);
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const w = rand() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      d[i] = v;
      sum += v * v;
    }
    const k = 1 / Math.sqrt(sum / len || 1);
    for (let i = 0; i < len; i++) d[i]! *= k;
  }
  return buf;
}

function impulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const a = Math.exp(-2 * Math.PI * 4000 / ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const rand = mulberry(seed + c * 104729);
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.exp((-6.9 * i) / len);
      lp = (1 - a) * (rand() * 2 - 1) + a * lp;
      d[i] = lp * env;
    }
  }
  return buf;
}

export interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  street: GainNode;
  ui: GainNode;
}

// One graph for everything: every voice into a master bus, a gentle compressor, then a ceiling at -6 dBFS.
// The glasses' voices share a small generated room; the street is dry.
export function buildGraph(ctx: BaseAudioContext, out: AudioNode = ctx.destination): Graph {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 2.5;
  comp.knee.value = 12;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -9;
  ceiling.ratio.value = 20;
  ceiling.knee.value = 0;
  ceiling.attack.value = 0.001;
  ceiling.release.value = 0.08;
  // A Web Audio compressor adds makeup gain the spec fixes from its settings; each is trimmed back to unity for quiet signals.
  const trimComp = ctx.createGain();
  trimComp.gain.value = 1 / 1.6353;
  const trimCeiling = ctx.createGain();
  trimCeiling.gain.value = 1 / 1.8051;
  master.connect(comp).connect(trimComp).connect(ceiling).connect(trimCeiling).connect(out);
  const street = ctx.createGain();
  street.connect(master);
  const ui = ctx.createGain();
  ui.connect(master);
  const room = ctx.createConvolver();
  room.normalize = true;
  room.buffer = impulse(ctx, 1.1, 1101);
  const wet = ctx.createGain();
  wet.gain.value = 0.18;
  ui.connect(room).connect(wet).connect(master);
  return { ctx, master, street, ui };
}
