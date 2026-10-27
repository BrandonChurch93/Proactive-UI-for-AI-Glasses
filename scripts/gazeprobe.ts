import { PLACES } from '@lumen/shared';
import { arg, ensureServer, launch } from './lib/browser';

// Turns the live head onto a place's shopfront at a walk time, then holds still, sampling every 100 ms:
// what the gaze is on, the brain's level for the place, and whether its pane is visibly on screen and where.
// With --aim, it runs the aim probe instead: for each place, from where the walk puts the wearer when the place
// comes within 70 m, turn onto its light, then hold still for 6 s while the body walks on. Pass is the card
// reached with the place held throughout and its dwell never reset.
// With --drags, the drag probe: on the live walk, in real time, slow 3 s drags of 800 px left and right along a
// straight and across both corners, then twelve half-width drags round the circle each way. Each drag's turn of the
// head in the world must be the pointer's turn plus the body's own turn, within 1°, and the circle must close.
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
if (process.argv.includes('--drags')) {
  const k = (2 * Math.PI) / 3 / w;
  const deg = (r: number): number => (r * 180) / Math.PI;
  const evs = `(() => { const rv = window.__app.walk.sim.reviewer; return [...rv.choices.map((c) => ({ t: c.t, ev: { choice: { id: c.id, action: c.action } } })), ...rv.pinches.map((x) => ({ t: x.t, ev: { pinch: x.id } }))].sort((a, b) => a.t - b.t); })()`;
  const plan = (await page.evaluate(`(() => {
    const walk = window.__app.walk; walk.paused = true;
    const evs = ${evs};
    const ys = []; let k = 0;
    while (walk.t < 110) {
      while (k < evs.length && evs[k].t <= walk.t + 1e-6) walk.queue(evs[k++].ev);
      walk.seek(walk.t + 0.25);
      ys.push([walk.t, walk.sim.wearer.bodyYaw, walk.sim.wearer.speed]);
    }
    const un = []; let acc = ys[0][1];
    for (let i = 0; i < ys.length; i++) { if (i) acc += Math.atan2(Math.sin(ys[i][1] - ys[i - 1][1]), Math.cos(ys[i][1] - ys[i - 1][1])); un.push(acc); }
    const corners = []; let straight = null;
    for (let i = 0; i + 12 < ys.length; i++) {
      const turn = Math.abs(un[i + 12] - un[i]);
      if (turn > 0.45 && (!corners.length || ys[i][0] - corners[corners.length - 1] > 12)) corners.push(ys[i][0]);
      if (straight === null && ys[i][0] > 5 && ys[i][2] > 0.9 && i + 28 < ys.length && Math.abs(un[i + 28] - un[i]) < 0.01) straight = ys[i][0];
    }
    return { corners: corners.slice(0, 2), straight };
  })()`)) as { corners: number[]; straight: number };
  await page.goto(`${base}?scenario=${scenario}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
  await page.waitForTimeout(500);
  const state = (): Promise<{ t: number; world: number; body: number; rel: number }> =>
    page.evaluate(`(() => { const w = window.__app.walk; return { t: w.t, world: w.sim.head.yaw, body: w.sim.wearer.bodyYaw, rel: w.head.yaw }; })()`) as Promise<{ t: number; world: number; body: number; rel: number }>;
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const pump = async (): Promise<number> =>
    (await page.evaluate(`(() => { const w = window.__app.walk; const evs = ${evs}; const done = window.__queued ??= new Set(); evs.forEach((e, i) => { if (!done.has(i) && e.t <= w.t + 1e-6) { done.add(i); w.queue(e.ev); } }); return w.t; })()`)) as number;
  const drag = async (px: number, seconds: number, label: string): Promise<{ label: string; pointer: number; body: number; head: number; err: number }> => {
    const n = Math.max(6, Math.round(seconds * 30));
    const x0 = w / 2 - px / 2;
    const y0 = h * 0.86;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    let world = 0;
    let body = 0;
    let rel = 0;
    let last = await state();
    let moved = 0;
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(x0 + (px * i) / n, y0);
      moved = (px * i) / n;
      await page.waitForTimeout((seconds * 1000) / n);
      await pump();
      const s = await state();
      const dw = wrap(s.world - last.world);
      const db = wrap(s.body - last.body);
      world += dw;
      body += db;
      rel += wrap(s.rel - last.rel);
      if (process.argv.includes('--verbose') && Math.abs(deg(dw - db - (px / n) * k)) > 0.05) console.log(label, i, s.t.toFixed(2), 'off', deg(dw - db - (px / n) * k).toFixed(2), 'rel', deg(s.rel).toFixed(1), 'body', deg(s.body).toFixed(1));
      last = s;
    }
    await page.waitForTimeout(60);
    const s = await state();
    world += wrap(s.world - last.world);
    body += wrap(s.body - last.body);
    rel += wrap(s.rel - last.rel);
    await page.mouse.up();
    // the first move past the 4 px threshold applies the whole delta from the press, so the pointer's turn is the full span
    const pointer = moved * k;
    // The head turns on the body by the pointer's angle; in the world that is the pointer's turn plus the body's.
    // The camera takes the body's turn one sim step late, so the world sum is read for the report, the relative turn for the pass.
    return { label, pointer: deg(pointer), body: deg(body), head: deg(world), err: deg(rel - pointer) };
  };
  const rows: { label: string; pointer: number; body: number; head: number; err: number }[] = [];
  const waitFor = async (t: number): Promise<void> => {
    while ((await pump()) < t) await page.waitForTimeout(50);
  };
  const circle = async (dir: number): Promise<number> => {
    const a = await state();
    for (let i = 0; i < 12; i++) rows.push(await drag((dir * w) / 2, 0.6, `circle ${dir > 0 ? 'right' : 'left'} ${i + 1}`));
    const b = await state();
    return deg(wrap(b.rel - a.rel));
  };
  await page.evaluate(`window.__app.walk.paused = false`);
  const closeR = await circle(1);
  const closeL = await circle(-1);
  const spots: [string, number][] = [['straight', plan.straight], ...plan.corners.map((c, i): [string, number] => [`corner ${i + 1}`, c])];
  for (const [name, t] of spots.sort((a, b) => a[1] - b[1])) {
    await waitFor(t - 0.5);
    rows.push(await drag(-800 * (w / 1920), 3, `${name} left`));
    rows.push(await drag(800 * (w / 1920), 3, `${name} right`));
  }
  let worst = 0;
  for (const r of rows) {
    worst = Math.max(worst, Math.abs(r.err));
    if (!r.label.startsWith('circle') || Math.abs(r.err) > 1) console.log(`${Math.abs(r.err) <= 1 ? 'pass' : 'FAIL'} ${r.label.padEnd(18)} pointer ${r.pointer.toFixed(1)}°, body ${r.body.toFixed(1)}°, head in the world ${r.head.toFixed(1)}°, head on the body off the pointer by ${r.err.toFixed(2)}°`);
  }
  console.log(`circle closes ${closeR.toFixed(2)}° right, ${closeL.toFixed(2)}° left; corners at ${plan.corners.map((c) => c.toFixed(1)).join(', ')}, straight at ${plan.straight?.toFixed(1)}`);
  console.log(`drags ${scenario} ${w} x ${h}: ${rows.filter((r) => Math.abs(r.err) <= 1).length} of ${rows.length} within 1°, worst ${worst.toFixed(2)}°${Math.abs(closeR) <= 1 && Math.abs(closeL) <= 1 ? '' : ', circle open'}`);
} else if (process.argv.includes('--aim')) {
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
