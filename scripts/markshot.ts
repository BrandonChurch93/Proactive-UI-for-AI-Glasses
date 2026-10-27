import { arg, launch } from './lib/browser';

// Steps a scripted walk to each time and screenshots the gaze mark: tsx scripts/markshot.ts --scenario walking --times 5,9.05 --out dir
// With --sample it also reads the backdrop sampler behind each corner tick and prints the tick's contrast against its
// halo and against the street: the ink at 45% (or the voice at 70% and up) over the backdrop, the halo black at 55%.
const sc = arg('scenario', 'walking')!;
const times = (arg('times', '5') ?? '5').split(',').map(Number);
const out = arg('out', 'shots')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(`http://localhost:5199/?scenario=${sc}&scripted=1`);
await p.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 90000 });
await p.evaluate('document.fonts.ready');
await p.waitForTimeout(800);
for (const t of times) {
  const info = await p.evaluate(`(() => { const a = window.__app; a.walk.paused = true; a.walk.seek(${t}); a.updateMark(); a.walk.overlay.update(a.walk.t); window.__world.render(); const f = a.walk.last().frame; return JSON.stringify({ t: a.walk.t, target: f.dwell.target, mark: f.dwell.mark }); })()`);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${sc}-mark-${t}.png` });
  console.log(info);
  if (process.argv.includes('--sample')) {
    const rows = await p.evaluate(`(() => {
      const a = window.__app; const sim = a.walk.sim; const pose = sim.cameraPose(); const vp = { w: innerWidth, h: innerHeight };
      const dyn = sim.dynamicColliders();
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const rel = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return [...document.querySelectorAll('[class*="corner"]')].map((el) => {
        const r = el.getBoundingClientRect();
        const L = sim.backdrop.sampleRect(pose, vp, { x: r.x, y: r.y, w: r.width, h: r.height }, dyn);
        const cs = getComputedStyle(el);
        const m = cs.color.match(/[0-9.]+/g).map(Number);
        const o = Number(cs.opacity);
        const tick = o * rel(m[0], m[1], m[2]) + (1 - o) * L;
        const halo = 0.45 * L;
        const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        return { L, opacity: o, vsHalo: +ratio(tick, halo).toFixed(2), vsStreet: +ratio(tick, L).toFixed(2), haloVsStreet: +ratio(halo, L).toFixed(2) };
      });
    })()`);
    console.log(JSON.stringify(rows));
  }
}
await b.close();
