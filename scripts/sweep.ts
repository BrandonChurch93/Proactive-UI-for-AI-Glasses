import { arg, ensureServer, launch } from './lib/browser';

// Sweeps the live view across a row of shopfronts, frame by frame, the way a person drags across a street.
// Reports every gaze target with how long it held, and every pip the brain lit during the sweep with the
// gaze time that preceded it. Defaults: the east row at Hungry t 4, Goldie's to The Big Bean in 1.5 s.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'hungry')!;
const at = Number(arg('t', '4'));
const x = Number(arg('x', '12.75'));
const n0 = Number(arg('from', '8'));
const n1 = Number(arg('to', '52'));
const dur = Number(arg('dur', '1.5'));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
for (let attempt = 0; attempt < 2; attempt++) {
  await p.goto(`${base}?scenario=${scenario}`);
  try {
    await p.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 90000 });
    break;
  } catch (e) {
    if (attempt === 1) throw e;
  }
}
const r = (await p.evaluate(`(async () => {
  const walk = window.__app.walk; walk.paused = true; walk.seek(${at});
  const sim = walk.sim;
  const aimAt = (n) => { const e = sim.wearer.pos; const ax = ${x}, az = -n, ay = 2.4; walk.look(Math.atan2(-(ax - e.x), -(az - e.z)) - sim.wearer.bodyYaw, Math.atan2(ay - e.y, Math.hypot(ax - e.x, az - e.z))); };
  aimAt(${n0});
  for (let i = 0; i < 30; i++) walk.seek(walk.t + 1 / 60);
  const t0 = walk.t; const spans = []; let cur = sim.gaze.target, since = 0; const lit = []; let lastTick = -1;
  const held = new Map();
  while (walk.t - t0 < ${dur} + 0.6) {
    const u = Math.min(1, (walk.t - t0) / ${dur});
    aimAt(${n0} + (${n1} - ${n0}) * u);
    walk.seek(walk.t + 1 / 60);
    const dt = walk.t - t0; const g = sim.gaze.target;
    if (g !== cur) { if (cur) spans.push([cur, +since.toFixed(3), +(dt - since).toFixed(3)]); cur = g; since = dt; }
    if (g) held.set(g, (held.get(g) || 0) + 1 / 60);
    const f = walk.last().frame;
    if (f.t !== lastTick) {
      lastTick = f.t;
      for (const d of f.events) if (d.placement.zone === 'world' && d.level === 'pip' && d.action === 'show') lit.push([+dt.toFixed(2), d.id, d.cause || '', +(held.get(d.id) || 0).toFixed(3)]);
    }
  }
  if (cur) spans.push([cur, +since.toFixed(3), +(walk.t - t0 - since).toFixed(3)]);
  return { spans, lit };
})()`)) as { spans: [string, number, number][]; lit: [number, string, string, number][] };
console.log(`sweep ${scenario} t ${at}, x ${x}, n ${n0} to ${n1} in ${dur} s at ${w} x ${h}`);
for (const [id, s0, d] of r.spans) console.log(`  gaze ${id.padEnd(22)} from ${s0.toFixed(2)} for ${d.toFixed(2)} s`);
for (const [t, id, cause, g] of r.lit) console.log(`  lit  ${id.padEnd(22)} at ${t.toFixed(2)} (${cause}) after ${g.toFixed(2)} s of gaze`);
const bad = r.lit.filter(([, , cause, g]) => cause === 'dwell' && g < 0.25 - 1e-6);
console.log(`pips lit by a gaze shorter than 250 ms: ${bad.length}`);
if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
await b.close();
await server?.close();
