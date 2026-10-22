import { arg, ensureServer, launch } from './lib/browser';

// Turns the live head onto a place at a walk time and holds still. Prints the overlay log for that place
// (every birth, resize, move, drop, hide, edge fold, step-aside and death, with cause and rect), every change
// of gaze target or brain level, and the widest keep-out seen while holding. --all prints every place's events.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'hungry')!;
const at = Number(arg('t', '29'));
const id = arg('id', 'post-office')!;
const hold = Number(arg('hold', '7'));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const all = process.argv.includes('--all');
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await p.goto(`${base}?scenario=${scenario}`);
await p.waitForFunction(() => Boolean((window as unknown as { __app?: unknown }).__app), null, { timeout: 120000 });
const out = (await p.evaluate(`(async () => {
  const id = ${JSON.stringify(id)};
  const walk = window.__app.walk;
  walk.paused = true; walk.seek(${at});
  const sim = walk.sim; const a = sim.anchorOf(id); const eye = sim.wearer.pos;
  walk.look(Math.atan2(-(a.x-eye.x), -(a.z-eye.z)) - sim.wearer.bodyYaw, Math.atan2(a.y-1.6-eye.y, Math.hypot(a.x-eye.x, a.z-eye.z)));
  walk.lookedAt = -Infinity;
  const from = walk.overlayLog.length;
  const states = [];
  let last = '';
  let widest = null;
  walk.paused = false;
  const t0 = walk.t;
  while (walk.t - t0 < ${hold}) {
    await new Promise(r => setTimeout(r, 50));
    const f = walk.last().frame;
    const d = f.items.find(x => x.id === id);
    const k = JSON.stringify([sim.gaze.target, d && d.level]);
    if (k !== last) { states.push([+walk.t.toFixed(2), 'gaze=' + sim.gaze.target, 'brain=' + (d ? d.level : '-')]); last = k; }
    for (const ko of walk.bridge.keepOuts()) {
      if (ko.kind === 'roadway') continue;
      const area = ko.rect.w * ko.rect.h;
      if (!widest || area > widest.area) widest = { t: +walk.t.toFixed(2), id: ko.id, kind: ko.kind, area, w: Math.round(ko.rect.w), h: Math.round(ko.rect.h) };
    }
  }
  walk.paused = true;
  return { states, log: walk.overlayLog.slice(from), widest };
})()`)) as { states: unknown[][]; log: { t: number; id: string; kind: string; level: string; from?: string; cause: string; detail?: string; rect?: { x: number; y: number; w: number; h: number } }[]; widest: { t: number; id: string; kind: string; w: number; h: number } | null };
const rows: [number, string][] = [];
for (const s of out.states) rows.push([s[0] as number, `  state  ${s.slice(1).join('  ')}`]);
for (const e of out.log) {
  if (!all && e.id !== id) continue;
  const r = e.rect ? `  [${Math.round(e.rect.x)},${Math.round(e.rect.y)} ${Math.round(e.rect.w)}x${Math.round(e.rect.h)}]` : '';
  rows.push([e.t, `  ${e.kind.padEnd(6)} ${all ? e.id.padEnd(22) : ''}${(e.from && e.from !== e.level ? `${e.from}>${e.level}` : e.level).padEnd(16)} ${e.cause}${e.detail ? ` · ${e.detail}` : ''}${r}`]);
}
rows.sort((x, y) => x[0] - y[0]);
for (const [t, line] of rows) console.log(t.toFixed(2).padStart(6) + line);
const wd = out.widest;
console.log(wd ? `widest keep-out: ${wd.kind} ${wd.id} ${wd.w} x ${wd.h} at ${wd.t} (view ${w} x ${h})` : 'no keep-outs');
const births = out.log.filter((e) => e.id === id && e.kind === 'birth').length;
console.log(`${id}: ${births} births, ${out.log.filter((e) => e.id === id && e.kind === 'drop').length} drops`);
if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
await b.close();
await server?.close();
