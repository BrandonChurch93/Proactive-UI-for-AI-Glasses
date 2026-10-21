import { ensureServer, launch } from './lib/browser';
const url = process.argv[2] ?? 'http://localhost:5173/?scenario=hungry&still=1&t=30';
const server = await ensureServer(url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await p.goto(url);
await p.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, { timeout: 60000 });
const result = await p.evaluate(`(async () => {
  const w = window.__world;
  const r = w.core.renderer;
  const gl = r.getContext();
  const px = new Uint8Array(4);
  w.core.resize(1280, 800);
  function time(n) {
    const s = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); w.core.composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); s.push(performance.now() - t0); }
    s.sort((a, b) => a - b);
    return +s[Math.floor(s.length / 2)].toFixed(2);
  }
  const out = {};
  time(10);
  out.base = time(25);
  r.shadowMap.enabled = false; w.core.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  time(5); out.noShadows = time(25);
  r.shadowMap.enabled = true; w.core.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  time(5);
  w.core.bloom.enabled = false; out.noBloom = time(25); w.core.bloom.enabled = true;
  const hide = (name) => { const g = w.core.scene.getObjectByName(name); g.visible = false; const v = time(25); g.visible = true; return v; };
  out.noBuildings = hide('buildings');
  out.noStorefronts = hide('storefronts');
  out.noProps = hide('props');
  out.noPeople = hide('people');
  out.noVehicles = hide('vehicles');
  out.noSigns = hide('signs');
  const tgt = w.core.composer.renderTarget1; const samples = tgt.samples; tgt.samples = 0; w.core.composer.renderTarget2.samples = 0; time(5); out.noMsaa = time(25); tgt.samples = samples; w.core.composer.renderTarget2.samples = samples;
  w.core.setQuality('fast'); w.core.resize(1280, 800); time(5); out.fast = time(25);
  out.pr = r.getPixelRatio();
  return out;
})()`);
console.log(JSON.stringify(result));
await b.close();
await server?.close();
