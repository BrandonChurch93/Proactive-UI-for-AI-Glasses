import { arg, ensureServer, launch } from './lib/browser';
const scenario = arg('scenario', 'hungry')!;
const at = Number(arg('t', '29'));
const id = arg('id', 'post-office')!;
const hold = Number(arg('hold', '7'));
const server = await ensureServer('http://localhost:5173/');
const b = await launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`http://localhost:5173/?scenario=${scenario}`);
await p.waitForFunction(() => Boolean((window as unknown as { __app?: unknown }).__app), null, { timeout: 120000 });
const out = await p.evaluate(`(async () => {
  const id = ${JSON.stringify(id)};
  const walk = window.__app.walk;
  walk.paused = true; walk.seek(${at});
  const sim = walk.sim; const a = sim.anchorOf(id); const eye = sim.wearer.pos;
  walk.look(Math.atan2(-(a.x-eye.x), -(a.z-eye.z)) - sim.wearer.bodyYaw, Math.atan2(a.y-1.6-eye.y, Math.hypot(a.x-eye.x, a.z-eye.z)));
  walk.lookedAt = -Infinity;
  const o = walk.overlay; const log = [];
  const orig = o.transition.bind(o);
  o.transition = (it, want, t, edge) => {
    if (it.id === id) {
      const pl = it.placed || {};
      log.push(['T', +t.toFixed(2), it.want + '>' + want, 'dec=' + it.d.level, 'mode=' + pl.mode, 'coll=' + pl.collapsed, 'shapeChange=' + (it.cur && want === it.want), 'dropped=' + it.aside.dropped, 'edge=' + edge, 'focusOk=' + it.d.placement.focusOk]);
    }
    return orig(it, want, t, edge);
  };
  let last = '';
  walk.paused = false;
  const t0 = walk.t;
  while (walk.t - t0 < ${hold}) {
    await new Promise(r => setTimeout(r, 50));
    const it = o.items.get(id);
    const f = walk.last().frame;
    const d = f.items.find(x => x.id === id);
    const st = it ? [it.want, it.placed && it.placed.mode, it.placed && it.placed.collapsed, it.cur && it.cur.rect ? Math.round(it.cur.rect.x) + ',' + Math.round(it.cur.rect.y) : '-', d && d.placement.focusOk, d && JSON.stringify([d.content.fact, d.content.live, d.content.showReason, d.content.hint])] : [];
    const k = JSON.stringify([sim.gaze.target, d && d.level, st]);
    if (k !== last) { log.push(['S', +walk.t.toFixed(2), sim.gaze.target, d && d.level, ...st]); last = k; }
  }
  return log;
})()`);
for (const r of out as unknown[]) console.log(JSON.stringify(r));
await b.close();
await server?.close();
