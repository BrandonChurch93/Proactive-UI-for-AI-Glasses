import { arg, ensureServer, launch } from './lib/browser';

// Steps a scripted walk frame by frame over a window and follows one pane: its drawn rect, the anchor's
// projection, and the corner the pane grows from. For every level change it reports how far that corner
// moved (relative to the anchor) from the frame before the change to the end of the morph.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'walking')!;
const id = arg('id', 'grace-theater')!;
const from = Number(arg('from', '9'));
const to = Number(arg('to', '14'));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${base}?scenario=${scenario}&still=1&t=${from}`);
await p.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, { timeout: 120000 });
const rows = (await p.evaluate(`(async () => {
  const walk = window.__app.walk; const o = walk.overlay; const out = [];
  for (let t = ${from}; t <= ${to}; t += 1 / 60) {
    walk.seek(t);
    const it = o.items.get(${JSON.stringify(id)});
    if (!it || !it.cur || !it.cur.rect || !it.placed || it.placed.mode !== 'pane') { out.push(null); continue; }
    const a = walk.bridge.anchor(it.d.placement.anchor); const pr = walk.bridge.project(a);
    const fx = it.placed.align === 'left' ? 1 : it.placed.align === 'right' ? 0 : 0.5;
    const fy = it.placed.vertical === 'below' ? 0 : 1;
    const r = it.cur.rect;
    out.push({ t: +walk.t.toFixed(3), level: it.cur.level, x: r.x + r.w * fx - pr.x, y: r.y + r.h * fy - pr.y, w: r.w, h: r.h, opacity: it.cur.opacity });
  }
  return out;
})()`)) as ({ t: number; level: string; x: number; y: number; w: number; h: number; opacity: number } | null)[];
let worst = 0;
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1];
  const c = rows[i];
  if (!a || !c || a.level === c.level) continue;
  let m = 0;
  for (let k = i; k < Math.min(rows.length, i + 40); k++) {
    const r = rows[k];
    if (r) m = Math.max(m, Math.hypot(r.x - a.x, r.y - a.y));
  }
  worst = Math.max(worst, m);
  console.log(`${c.t.toFixed(2)}  ${a.level} > ${c.level}  size ${Math.round(a.w)}x${Math.round(a.h)} > ${Math.round(rows[Math.min(rows.length - 1, i + 39)]?.w ?? 0)}x${Math.round(rows[Math.min(rows.length - 1, i + 39)]?.h ?? 0)}  corner moved up to ${m.toFixed(1)} px`);
}
if (process.argv.includes("--frames")) for (const r of rows) if (r) console.log(r.t.toFixed(3), r.level, r.x.toFixed(1), r.y.toFixed(1), Math.round(r.w), Math.round(r.h));
console.log(`worst corner movement during a morph: ${worst.toFixed(1)} px`);
if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
await b.close();
await server?.close();
