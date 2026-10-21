import { ensureServer, launch } from './lib/browser';

const url = process.argv[2] ?? 'http://localhost:5173/?scenario=hungry';
const server = await ensureServer(url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(url);
await p.waitForFunction(() => Boolean((window as unknown as { __world?: unknown }).__world), null, { timeout: 60000 });
await p.waitForTimeout(6000);
const result = await p.evaluate(`(async () => {
  const w = window.__world;
  const times = [];
  await new Promise((resolve) => {
    let last = performance.now();
    function step(now) {
      times.push(now - last);
      last = now;
      if (times.length < 240) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  const gl = w.core.renderer.getContext();
  const px = new Uint8Array(4);
  const sync = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    w.core.composer.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync.push(performance.now() - t0);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sorted = [...times].sort((a, b) => a - b);
  return { rafAvgMs: +avg(times.slice(10)).toFixed(2), rafP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), syncRenderMs: +avg(sync.slice(5)).toFixed(2), pixelRatio: w.core.renderer.getPixelRatio(), quality: w.core.quality };
})()`);
console.log(JSON.stringify(result));
await b.close();
await server?.close();
