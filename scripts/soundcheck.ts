import { arg, ensureServer, launch } from './lib/browser';

// Renders every voice of the sound set and 20 s of the street bed offline, through the same graph the walk plays,
// and prints peak, RMS, the loudest 200 ms and the spectral centroid of each. Pass: each voice within 2 dB of its
// level (peak for a tone, the loudest 200 ms for a sweep, RMS for a layer), no sample above -6 dBFS, the bed
// between -32 and -28 dBFS RMS. Measured, not heard: the owner's ears decide.
const base = arg('base', 'http://localhost:5199/')!;
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(base);
await page.waitForFunction(() => Boolean((window as unknown as { __soundlab?: unknown }).__soundlab), null, { timeout: 120_000 });
const rows = (await page.evaluate(`window.__soundlab().then((lab) => lab.check())`)) as { name: string; target: number; measure: 'peak' | 'rms' | 'short'; peak: number; rms: number; short: number; centroid: number }[];
let fails = 0;
for (const r of rows) {
  const level = r[r.measure];
  const off = level - r.target;
  const bedOk = r.name !== 'bed' || (r.rms >= -32 && r.rms <= -28);
  const ok = Math.abs(off) <= 2 && r.peak <= -6 && bedOk;
  if (!ok) fails++;
  console.log(`${ok ? 'pass' : 'FAIL'} ${r.name.padEnd(15)} ${r.measure.padEnd(5)} ${level.toFixed(1).padStart(6)} dBFS against ${r.target} (${off >= 0 ? '+' : ''}${off.toFixed(1)}) · peak ${r.peak.toFixed(1).padStart(6)} · RMS ${r.rms.toFixed(1).padStart(6)} · loudest 200 ms ${r.short.toFixed(1).padStart(6)} · centroid ${Math.round(r.centroid).toString().padStart(5)} Hz`);
}
console.log(`soundcheck: ${rows.length - fails} of ${rows.length} pass`);
await browser.close();
await server?.close();
