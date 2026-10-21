import { arg, ensureServer, launch } from './lib/browser';

// Turns the live head onto a place's shopfront at a walk time, then holds still, sampling every 100 ms:
// what the gaze is on, the brain's level for the place, and whether its pane is visibly on screen and where.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'hungry')!;
const at = Number(arg('t', '12'));
const id = arg('id', 'mega-burger')!;
const hold = Number(arg('hold', '6'));
const along = Number(arg('along', '0'));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?scenario=${scenario}`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: unknown }).__app), null, { timeout: 120_000 });
const out = (await page.evaluate(`(async () => {
  const at = ${at}, id = ${JSON.stringify(id)}, hold = ${hold}, along = ${along};
  const walk = window.__app.walk;
  walk.paused = true;
  walk.seek(at);
  const sim = walk.sim;
  const a = sim.anchorOf(id);
  const eye = sim.wearer.pos;
  const aim = { x: a.x, y: a.y - 1.6, z: a.z + along };
  walk.look(Math.atan2(-(aim.x - eye.x), -(aim.z - eye.z)) - sim.wearer.bodyYaw, Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z)));
  walk.lookedAt = -Infinity;
  walk.paused = false;
  const rows = [];
  const t0 = walk.t;
  while (walk.t - t0 < hold) {
    await new Promise((r) => setTimeout(r, 100));
    const f = walk.last() && walk.last().frame;
    const item = f && f.items.find((d) => d.id === id);
    const el = document.querySelector('[data-pane="' + id + '"]');
    let shown = '';
    let rect = null;
    if (el) {
      const clip = getComputedStyle(el).clipPath;
      const kids = [...el.children].map((c) => Number(getComputedStyle(c).opacity));
      const open = !clip.includes('100%');
      if (open && Math.max(...kids) > 0.9 && Number(el.parentElement.style.opacity) > 0.5) shown = 'VISIBLE';
      const b = el.getBoundingClientRect();
      rect = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    }
    const p = walk.bridge.project(sim.anchorOf(id));
    rows.push([+(walk.t - t0).toFixed(1), sim.gaze.target, sim.gaze.dwellMs, item ? item.level : '-', f && f.band, shown, rect, [Math.round(p.x), Math.round(p.y)]]);
  }
  return rows;
})()`)) as unknown[][];
for (const r of out) console.log(JSON.stringify(r));
const shot = arg('shot');
if (shot) await page.screenshot({ path: shot });
for (const e of errors) console.error('pageerror', e);
await browser.close();
await server?.close();
