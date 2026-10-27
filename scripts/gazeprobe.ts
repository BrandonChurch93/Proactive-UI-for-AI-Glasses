import { PLACES } from '@lumen/shared';
import { arg, ensureServer, launch } from './lib/browser';

// Turns the live head onto a place's shopfront at a walk time, then holds still, sampling every 100 ms:
// what the gaze is on, the brain's level for the place, and whether its pane is visibly on screen and where.
// With --aim, it runs the aim probe instead: for each place, from where the walk puts the wearer when the place
// comes within 70 m, turn onto its light, then hold still for 6 s while the body walks on. Pass is the card
// reached with the place held throughout and its dwell never reset.
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
if (process.argv.includes('--aim')) {
  const res = (await page.evaluate(`(async () => {
    const ids = ${JSON.stringify(PLACES.map((p) => p.id))};
    const walk = window.__app.walk;
    walk.paused = true;
    const sim = () => walk.sim;
    const rv = sim().reviewer;
    const evs = [...rv.choices.map((c) => ({ t: c.t, ev: { choice: { id: c.id, action: c.action } } })), ...rv.pinches.map((x) => ({ t: x.t, ev: { pinch: x.id } }))].sort((a, b) => a.t - b.t);
    const replay = (until) => {
      if (walk.t > 0) walk.seek(0);
      for (const e of evs) {
        if (e.t >= until) break;
        walk.seek(e.t);
        walk.queue(e.ev);
      }
      walk.seek(until);
    };
    const enter = {};
    replay(0);
    let k = 0;
    while (walk.t < 160 && Object.keys(enter).length < ids.length) {
      while (k < evs.length && evs[k].t <= walk.t + 1e-6) walk.queue(evs[k++].ev);
      walk.seek(walk.t + 0.1);
      const w = sim().wearer;
      if (w.speed < 0.3) continue;
      for (const id of ids) {
        const a = sim().anchorOf(id);
        if (enter[id] === undefined && a && Math.hypot(a.x - w.pos.x, a.z - w.pos.z) <= 70) enter[id] = +walk.t.toFixed(1);
      }
    }
    const out = [];
    for (const id of ids) {
      const t0 = enter[id];
      if (t0 === undefined) { out.push({ id, t0: null }); continue; }
      replay(t0);
      const s = sim();
      const a = s.anchorOf(id);
      const e = s.wearer.pos;
      const d0 = Math.hypot(a.x - e.x, a.z - e.z);
      walk.look(Math.atan2(-(a.x - e.x), -(a.z - e.z)) - s.wearer.bodyYaw, Math.atan2(a.y - e.y, d0));
      const from = { ...e };
      let on = null, card = null, resets = 0, lastDwell = -1, band = null, level = null, other = null;
      while (walk.t - t0 < 6) {
        walk.seek(walk.t + 1 / 60);
        const g = s.gaze;
        const f = walk.last() && walk.last().frame;
        if (f && band === null) band = f.band;
        if (on === null) { if (g.target === id) { on = walk.t - t0; lastDwell = g.dwellMs; } else other = g.target; continue; }
        if (g.target !== id || g.dwellMs < lastDwell) resets++;
        lastDwell = g.dwellMs;
        const it = f && f.items.find((d) => d.id === id);
        if (it) level = it.level;
        if (card === null && it && (it.level === 'card' || it.level === 'expanded')) card = walk.t - t0;
      }
      const w = s.wearer.pos;
      out.push({ id, t0, d0: +d0.toFixed(1), band, on, card, resets, walked: +Math.hypot(w.x - from.x, w.z - from.z).toFixed(1), level, other });
    }
    return out;
  })()`)) as {
    id: string;
    t0: number | null;
    d0?: number;
    band?: string;
    on?: number | null;
    card?: number | null;
    resets?: number;
    walked?: number;
    level?: string | null;
    other?: string | null;
  }[];
  let pass = 0;
  for (const r of res) {
    const ok = r.t0 !== null && r.card !== null && r.card !== undefined && r.resets === 0;
    if (ok) pass++;
    console.log(
      `${ok ? 'pass' : 'FAIL'} ${r.id.padEnd(22)} t ${r.t0 ?? '-'} at ${r.d0 ?? '-'} m (${r.band ?? '-'}), held after ${r.on?.toFixed(2) ?? 'never'} s, card ${r.card?.toFixed(2) ?? 'none'} s, resets ${r.resets ?? '-'}, walked ${r.walked ?? '-'} m, ends ${r.level ?? '-'}${r.on === null ? ` (on ${r.other})` : ''}`,
    );
  }
  console.log(`aim ${scenario} ${w} x ${h}: ${pass} of ${res.length}`);
} else {
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
}
for (const e of errors) console.error('pageerror', e);
await browser.close();
await server?.close();
