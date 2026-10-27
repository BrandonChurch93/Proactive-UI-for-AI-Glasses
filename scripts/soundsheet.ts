import { mkdirSync, writeFileSync } from 'node:fs';
import { arg, ensureServer, launch } from './lib/browser';

// Writes every voice of the sound set, rendered offline through the walk's own graph, as a WAV beside an index.html
// of play buttons in .cache/sound/ (not committed), so the owner can listen to each sound on its own and name the
// ones that are still wrong. The numbers next to each come from the same render as scripts/soundcheck.ts.
const base = arg('base', 'http://localhost:5199/')!;
const out = arg('out', '.cache/sound')!;
mkdirSync(out, { recursive: true });
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(base);
await page.waitForFunction(() => Boolean((window as unknown as { __soundlab?: unknown }).__soundlab), null, { timeout: 120_000 });
const rows = (await page.evaluate(`window.__soundlab().then((lab) => lab.check())`)) as { name: string; target: number; measure: string; peak: number; rms: number; short: number; centroid: number }[];
const NOTES: Record<string, string> = {
  mark: 'A place is noticed: three glass partials, 2 ms attack, 180 ms decay, in the room.',
  unfold: 'A pane grows: the rising breath with a 1046 Hz sine inside it, in the room.',
  open: 'The expanded view, and the pocket surfacing: the long rising breath.',
  recede: 'A crossing begins: the falling breath with a 196 Hz sine under it, in the room.',
  thud: 'The heel of a step: a 70 to 45 Hz sine.',
  scuff: 'The sole of a step: a short band of noise.',
  step: 'One step, both layers, a little to one side.',
  'step on paint': 'A step on crosswalk paint: the scuff a touch brighter.',
  beep: 'The crossing signal, once a second at a curb on WAIT and through the crossing.',
  pass: 'A vehicle going by, panned across, its band following a Doppler curve.',
  'tire hiss': 'The tire hiss that rides a pass.',
  'pass with hiss': 'A pass as you hear it in the walk.',
  traffic: 'Distant traffic: low-passed pink noise that swells and sinks.',
  air: 'The hiss of outdoors.',
  bed: '20 s of the street as it plays: traffic, air and the passes, no steps.',
};
const files: string[] = [];
for (const r of rows) {
  const file = `${r.name.replace(/\s+/g, '-')}.wav`;
  const b64 = (await page.evaluate(`window.__soundlab().then((lab) => lab.wav(${JSON.stringify(r.name)}))`)) as string;
  writeFileSync(`${out}/${file}`, Buffer.from(b64, 'base64'));
  files.push(file);
}
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sound sheet</title>
<style>
:root { color-scheme: dark; --bg: #0e1216; --fg: #e9ebee; --fg2: #8e96a1; --rule: #1d2228; --accent: #f0b429; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 6px; }
p.lede { color: var(--fg2); margin: 0 0 28px; }
.row { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; padding: 14px 0; border-top: 1px solid var(--rule); align-items: center; }
.name { font-weight: 600; }
.note { color: var(--fg2); grid-column: 1; }
.nums { font: 12px ui-monospace, Menlo, monospace; color: var(--fg2); grid-column: 1; }
audio { grid-row: 1 / span 3; grid-column: 2; }
@media (max-width: 560px) { .row { grid-template-columns: 1fr; } audio { grid-row: auto; grid-column: 1; width: 100%; } }
</style>
</head>
<body>
<main>
<h1>Sound sheet</h1>
<p class="lede">Every sound of the walk, rendered on its own through the same graph the walk plays. These are measured, not heard: listen to each, and name the ones that are still wrong.</p>
${rows
  .map(
    (r, i) => `<div class="row"><div class="name">${esc(r.name)}</div><audio controls preload="none" src="${files[i]}"></audio><div class="note">${esc(NOTES[r.name] ?? '')}</div><div class="nums">peak ${r.peak.toFixed(1)} dBFS · RMS ${r.rms.toFixed(1)} · loudest 200 ms ${r.short.toFixed(1)} · centroid ${Math.round(r.centroid)} Hz</div></div>`,
  )
  .join('\n')}
</main>
</body>
</html>
`;
writeFileSync(`${out}/index.html`, html);
console.log(`soundsheet: ${files.length} sounds and index.html in ${out}`);
await browser.close();
await server?.close();
