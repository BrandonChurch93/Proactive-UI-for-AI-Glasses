import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLACES } from '@lumen/shared';
import { arg, ensureServer, launch, waitQuiet } from './lib/browser';

// pnpm doors: plays Explore live in real time and visits every place in one walk the way a wearer would, with the
// look alone. For each place it opens the menu, chooses the place, walks to its door, aims at the door and holds the
// look; it measures how much of the stop the expanded view was on the glass at full opacity and what hid it, then
// turns the head row by row with the viewfinder (the pointer never rests on a row), reads the lifted row and the
// action's label, pinches with Enter, and reads the confirmation. One line per place; a place fails when the view is
// on the glass for less than 90% of the stop, when a row of choices does not lift under the look, or when the
// choice brings no confirmation. --laps 2 visits every place twice; --places a,b limits the list; --hold seconds.
// A stop that fails writes its whole trace, every 100 ms from the choice in the menu, to --tracedir (.cache/doors);
// --keep writes it for every stop.
const base = arg('base', 'http://localhost:5199/')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const laps = Number(arg('laps', '1'));
const holdS = Number(arg('hold', '16'));
const only = arg('places')?.split(',');
const ORDER = ['goldies-counter', 'grace-theater', 'kathys-cupcakes', 'trattoria-da-lia', 'main-street-pharmacy', 'lucky-lanes', 'big-bean', 'm4-stop', 'atlas-books', 'corner-hardware', 'mega-burger', 'pocket-park', '47th-st-station', 'post-office'];
const list = (only ?? ORDER).filter((id) => PLACES.some((p) => p.id === id));
const CATEGORY: Record<string, string> = { 'grace-theater': 'things', 'lucky-lanes': 'things', 'atlas-books': 'things', 'pocket-park': 'things', 'main-street-pharmacy': 'shops', 'corner-hardware': 'shops', 'post-office': 'shops', 'big-bean': 'food', 'goldies-counter': 'food', 'mega-burger': 'food', 'trattoria-da-lia': 'food', 'kathys-cupcakes': 'food', 'm4-stop': 'transit', '47th-st-station': 'transit' };
const verbose = process.argv.includes('--verbose');
const traceDir = arg('tracedir', fileURLToPath(new URL('../.cache/doors', import.meta.url)))!;
mkdirSync(traceDir, { recursive: true });
const keepAll = process.argv.includes('--keep');
const shots = arg('shots');
const burst = new Set(arg('burst')?.split(',') ?? []);
if (shots) mkdirSync(shots, { recursive: true });

await waitQuiet();
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// The dev server reloads the page once after an eval run rewrites the report the inspector imports; let that pass first.
await page.goto(`${base}?scenario=walking`);
await page.waitForTimeout(8000);
await page.goto(`${base}?scenario=walking`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
await page.waitForTimeout(1200);

// The stop's trace: what the brain had for the place, what the glass showed, why, and where the look was, every 100 ms.
const recorder = `(() => {
  if (window.__door) return;
  window.__door = { id: null, rows: [] };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const wrap = () => {
    const w = window.__app && window.__app.walk; const o = w && w.overlay;
    if (!o || o.__wrapped) return;
    o.__wrapped = true;
    const end = o.endHold.bind(o);
    o.endHold = (it, fresh) => {
      const d = window.__door;
      if (d.id && it.id === d.id && it.hold) d.rows.push(w.t.toFixed(2) + ' · hold ended at ' + (new Error().stack || '').split('\\n').slice(2, 3).join('').trim());
      return end(it, fresh);
    };
  };
  setInterval(() => {
    wrap();
    const d = window.__door; const w = window.__app && window.__app.walk;
    if (!d.id || !w || !w.overlay) return;
    const o = w.overlay; const it = o.items.get(d.id); const f = w.last() && w.last().frame;
    const dec = f && f.items.find((x) => x.id === d.id); const r = o.report().panes.find((p) => p.id === d.id); const g = w.sim.gaze;
    const rect = it && it.cur && it.cur.rect;
    const ko = rect ? w.bridge.keepOuts().filter((k) => hit(k.rect, rect)).map((k) => k.id).join('|') : '';
    const mk = f && f.dwell && f.dwell.mark;
    d.rows.push([w.t.toFixed(2), f ? f.band : '-', dec ? dec.level + '@' + dec.placement.anchor : 'none', r ? r.level : '-', r ? (r.visible ? 'visible' : 'hidden:' + r.hiddenBy) : '-', r ? r.opacity : 0, it && it.placed ? it.placed.mode + (it.placed.why ? ':' + it.placed.why : '') : '-', it ? it.want : '-', it && it.hold ? (it.hold.came ? 'held' : 'pinned') + (it.hold.side ? ':' + it.hold.side : '') : it && it.ride ? 'ride' : '', it && it.aside && it.aside.dropped ? 'dropped' : '', g.target ? g.target + ' ' + g.dwellMs : 'no look', mk ? (mk.next || '-') + ' ' + mk.p.toFixed(2) : '', ko, w.sim.lostGaze ? 'lost ' + w.sim.lostGaze.id + '@' + w.sim.lostGaze.at.toFixed(2) : '', w.sim.wearer.arrivedAt === null ? '' : 'at door since ' + w.sim.wearer.arrivedAt.toFixed(2) + ' for ' + w.sim.wearer.route.target, w.pick ? 'pick ' + w.pick.cur + (w.pick.cand ? ' cand ' + w.pick.cand : '') : '', rect ? [rect.x, rect.y, rect.w, rect.h].map(Math.round).join(',') : ''].join(' · '));
  }, 100);
})()`;
const watchStop = async (id: string | null): Promise<void> => {
  await page.evaluate(recorder);
  await page.evaluate(`window.__door.id = ${id ? `'${id}'` : 'null'}; window.__door.rows = [];`);
};
const writeTrace = async (id: string, lap: number, line: string): Promise<string> => {
  const rows = (await page.evaluate('window.__door.rows')) as string[];
  const decisions = (await page.evaluate(`window.__app.walk.brain.log.entries.filter((e) => e.decision.id === '${id}').slice(-40).map((e) => e.t.toFixed(2) + ' ' + e.decision.action + ' ' + e.decision.level + ' ' + e.decision.cause)`)) as string[];
  const glass = (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${id}').slice(-60).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.level ?? '') + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? ''))`)) as string[];
  const reroutes = (await page.evaluate(`window.__app.walk.sim.reroutes.slice(-8).map((r) => r.t.toFixed(2) + ' to ' + r.to)`)) as string[];
  const file = `${traceDir}/${id}-lap${lap}.txt`;
  writeFileSync(file, [line, '', 'every 100 ms: walk time · band · brain level@anchor · glass level · visible or hidden:why · opacity · placed mode · want · hold · aside · look and dwell · mark · keep-outs over the pane · the last look lost · the door dwell · the live pick · the pane x,y,w,h', ...rows, '', 'brain decisions for the place', ...decisions, '', 'reroutes', ...reroutes, '', 'overlay log for the place', ...glass, ''].join('\n'));
  return file;
};

type State = { t: number; band: string; target: string | null; arrived: boolean; dest: string | null; glyph: string | null; body: number; head: { yaw: number; pitch: number }; level: string | null };
const read = (id: string): Promise<State> =>
  page.evaluate(`(() => {
    const walk = window.__app.walk; const sim = walk.sim; const l = walk.last(); const f = l && l.frame;
    const it = f && f.items.find((d) => d.id === '${id}');
    return { t: walk.t, band: f ? f.band : 'stopped', target: sim.gaze.target, arrived: Boolean(l && l.snap.goal.arrived && l.snap.goal.destination === '${id}'), dest: f ? (f.goal.destination ?? null) : null, glyph: f && f.glyph ? f.glyph.label : null, body: sim.wearer.bodyYaw, head: { ...walk.head }, level: it ? it.level : null };
  })()`) as Promise<State>;
const glass = (id: string): Promise<{ on: boolean; why: string }> =>
  page.evaluate(`(() => {
    const o = window.__app.walk.overlay; const r = o.report().panes.find((p) => p.id === '${id}'); const it = [...o.items.values()].find((x) => x.id === '${id}');
    const on = Boolean(r && r.visible && r.level === 'expanded' && r.opacity > 0.98);
    let why = '';
    if (!on) why = !r ? 'no pane' : r.level !== 'expanded' ? 'at ' + r.level : !r.visible ? (r.hiddenBy ?? 'hidden') + (it && it.aside && it.aside.by ? ' ' + it.aside.by : '') : 'dimmed' + (it && it.aside && it.aside.by ? ' ' + it.aside.by : '');
    return { on, why };
  })()`) as Promise<{ on: boolean; why: string }>;
const toward = (anchor: string): Promise<{ yaw: number; pitch: number }> =>
  page.evaluate(`(() => { const sim = window.__app.walk.sim; const a = sim.anchorOf('${anchor}'); const e = sim.wearer.pos; return { yaw: Math.atan2(-(a.x - e.x), -(a.z - e.z)), pitch: Math.atan2(a.y - e.y, Math.hypot(a.x - e.x, a.z - e.z)) }; })()`) as Promise<{ yaw: number; pitch: number }>;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const k = (2 * Math.PI) / 3 / w;
const park = (): Promise<void> => page.mouse.move(w * 0.5, h - 2);
const pane = (id: string): string => `[data-pane="${id}"]`;
const label = (id: string): Promise<string | null> => page.evaluate(`document.querySelector('${pane(id)} button[data-follow]')?.textContent ?? null`) as Promise<string | null>;
const lifted = (id: string): Promise<string | null> => page.evaluate(`document.querySelector('${pane(id)} li[data-lift]')?.dataset.row ?? null`) as Promise<string | null>;
const rows = (id: string): Promise<{ row: string; x: number; y: number; top: number; bottom: number }[]> =>
  page.evaluate(`[...document.querySelectorAll('${pane(id)} li[data-row]')].map((li) => { const r = li.getBoundingClientRect(); return { row: li.dataset.row, x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })`) as Promise<{ row: string; x: number; y: number; top: number; bottom: number }[]>;

async function drag(dx: number, dy: number, steps = 12): Promise<void> {
  const x0 = w * 0.5;
  const y0 = h * 0.97;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await park();
}

// Turns the head onto the anchor the way a person does: a quick drag, then a check, and a nudge if it is off.
async function aim(id: string, anchor: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r0 = await read(id);
    const p0 = await toward(anchor);
    if (attempt > 0 && Math.abs(wrap(p0.yaw - (r0.body + r0.head.yaw))) < 0.12 && Math.abs(p0.pitch - r0.head.pitch) < 0.12) break;
    let x = w / 2;
    let y = h * 0.97;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 4; i >= 1; i--) {
      const r = await read(id);
      const p = await toward(anchor);
      x += wrap(p.yaw - (r.body + r.head.yaw)) / k / i;
      y += (p.pitch - r.head.pitch) / k / i;
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    await park();
  }
}

async function until(id: string, test: (s: State) => boolean, seconds: number): Promise<State | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const s = await read(id);
    if (test(s)) return s;
    await page.waitForTimeout(100);
  }
  return null;
}

// Samples the glass every 100 ms for a while, tallying the time the view was on it and what hid it.
async function watch(id: string, seconds: number, tally: { on: number; all: number; why: Map<string, number> }): Promise<void> {
  const t0 = Date.now();
  let last = (await read(id)).t;
  while (Date.now() - t0 < seconds * 1000) {
    await page.waitForTimeout(100);
    const s = await read(id);
    const g = await glass(id);
    const dt = Math.max(0, s.t - last);
    last = s.t;
    tally.all += dt;
    if (process.argv.includes('--people') && Math.round(s.t * 10) % 10 === 0)
      console.log(`   ${s.t.toFixed(1)} ${(await page.evaluate(`(() => { const s = window.__app.walk.sim; const w = s.wearer.pos; return JSON.stringify(s.people.people.filter((p) => p.alive && Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < 7).map((p) => [p.id, +p.pos.x.toFixed(1), +(-p.pos.z).toFixed(1), +p.speed.toFixed(2), p.stillSince === null ? '-' : +(s.t - p.stillSince).toFixed(1), p.anim, p.idx, JSON.stringify(p.path[Math.min(p.idx, p.path.length - 1)])])); })()`)) as string} wearer ${JSON.stringify(await page.evaluate('(() => { const w = window.__app.walk.sim.wearer.pos; return [+w.x.toFixed(1), +(-w.z).toFixed(1)]; })()'))}`);
    if (g.on) tally.on += dt;
    else tally.why.set(g.why, (tally.why.get(g.why) ?? 0) + dt);
  }
}

const lines: string[] = [];
let failures = 0;
const reloaded = (e: unknown): boolean => /context was destroyed|reading 'walk'|navigation/i.test(String(e));
for (let lap = 1; lap <= laps; lap++) {
  for (let k = 0; k < list.length; k++) {
    const id = list[k]!;
    try {
      await visit(id, lap);
    } catch (e) {
      if (!reloaded(e)) throw e;
      // The dev server reloaded the page (a file changed under it); the walk restarts, and this place is played again.
      console.log(`   the page reloaded during ${id}; the walk restarts and this place is played again`);
      await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
      await page.waitForTimeout(1200);
      k--;
    }
  }
}

async function visit(id: string, lap: number): Promise<void> {
  {
    const name = PLACES.find((p) => p.id === id)!.name;
    await watchStop(id);
    for (let tries = 0; tries < 6; tries++) {
      await until(id, (s) => s.band !== 'brisk', 60);
      try {
        await page.click('[aria-label="Find a place"]', { timeout: 3000 });
        await page.waitForSelector(`[data-pane="menu"] [data-k="a:${CATEGORY[id]}"]`, { timeout: 3000 });
        await page.click(`[data-pane="menu"] [data-k="a:${CATEGORY[id]}"]`, { timeout: 3000 });
        await page.waitForSelector(`[data-gaze="pick:${id}"]`, { timeout: 3000 });
        await page.click(`[data-gaze="pick:${id}"]`, { timeout: 3000 });
        break;
      } catch {
        await page.keyboard.press('Escape');
      }
    }
    await park();
    const at = await until(id, (s) => s.arrived && s.dest === id && s.band === 'stopped', 300);
    if (!at) {
      failures++;
      lines.push(`${name.padEnd(22)} never reached the door`);
      console.log(`${lines[lines.length - 1]} · trace ${await writeTrace(id, lap, lines[lines.length - 1]!)}`);
      return;
    }
    await aim(id, `door:${id}`);
    const open = await until(id, (s) => s.level === 'expanded', 6);
    const inS = open ? open.t - at.t : NaN;
    if (verbose) console.log(`   report ${(await page.evaluate(`(() => { const w = window.__app.walk; const o = w.overlay; const it = o.items.get('${id}'); const r = o.report().panes.find((p) => p.id === '${id}'); const a = w.bridge.project(w.sim.anchorOf('door:${id}')); return JSON.stringify({ a: [Math.round(a.x), Math.round(a.y), +a.depth.toFixed(1)], door: w.bridge.doorway('door:${id}'), pl: it && it.place && { folded: it.place.folded, cfg: it.place.cfg, collapsed: it.place.collapsed, step: it.place.step, leave: it.place.leaveSince }, size: it && it.cur && [it.cur.width, it.cur.height], edgeSince: it && it.edgeSince, r, placed: it && it.placed && [it.placed.mode, it.placed.why], want: it && it.want, anchor: it && it.d.placement.anchor, cmp: it && it.d.component, items: w.last().frame.items.filter((d) => d.placement.anchor === 'door:${id}').map((d) => d.id + ':' + d.component + ':' + d.level) }); })()`)) as string}`);
    if (verbose) console.log(`   arrived ${at.t.toFixed(2)} · ${JSON.stringify(await page.evaluate(`window.__app.walk.brain.log.entries.filter((e) => e.decision.id === '${id}' && e.t > ${at.t - 3}).map((e) => [e.t, e.decision.action, e.decision.level, e.decision.cause])`))} · look ${JSON.stringify(await page.evaluate(`(() => { const w = window.__app.walk; return [w.sim.gaze.target, w.sim.gaze.dwellMs]; })()`))}`);
    const tally = { on: 0, all: 0, why: new Map<string, number>() };
    if (open) await watch(id, Math.max(0, 3 - (open.t - at.t)) + 1, { on: 0, all: 0, why: new Map() });
    const t0 = (await read(id)).t;
    if (shots) await page.screenshot({ path: `${shots}/${id}-lap${lap}-open.png` });
    // The look stays on the place; the viewfinder walks the rows of choices one by one, with the head alone.
    const seen: string[] = [];
    const labels: string[] = [];
    const want = (await rows(id)).map((r) => r.row);
    for (const name2 of want) {
      for (let i = 0; i < 3; i++) {
        const r = (await rows(id)).find((x) => x.row === name2);
        if (!r || (r.top <= h / 2 && r.bottom >= h / 2)) break;
        await drag(w / 2 - r.x, h / 2 - r.y);
        await page.waitForTimeout(250);
      }
      if (process.argv.includes('--trace')) console.log(`   row ${name2}: ${(await page.evaluate(`(() => { const w = window.__app.walk; const o = w.overlay; const it = o.items.get('${id}'); const r = o.report().panes.find((p) => p.id === '${id}'); return JSON.stringify({ t: w.t.toFixed(1), target: w.sim.gaze.target, pick: w.pick, read: it && it.read, log: w.overlayLog.filter((e) => e.id === '${id}' && e.t > w.t - 4).slice(-8).map((e) => [+e.t.toFixed(2), e.kind, e.level, e.cause, e.detail]), dec: w.brain.log.entries.filter((e) => e.decision.id === '${id}' && e.t > w.t - 4).slice(-6).map((e) => [e.t, e.decision.action, e.decision.level, e.decision.cause]), cond: it && [it.d.level, o.band, it.cur && it.cur.level, it.placed && it.placed.mode, Boolean(it.cur && it.cur.rect), it.cur && +it.cur.opacity.toFixed(2), +(it.condensingUntil - o.t).toFixed(2), o.snap && o.snap.wearer.gaze.target], placed: it && it.placed && [it.placed.mode, Math.round(it.placed.rect.x), Math.round(it.placed.rect.y)], rep: r && [r.level, r.visible, Math.round(r.rect.x), Math.round(r.rect.y), Math.round(r.rect.w), Math.round(r.rect.h)], band: w.last().frame.band }); })()`)) as string} rows ${JSON.stringify((await rows(id)).map((x) => [x.row, Math.round(x.top), Math.round(x.bottom)]))}`);
      await watch(id, 0.8, tally);
      const l = await lifted(id);
      if (l === name2) {
        seen.push(name2);
        labels.push((await label(id)) ?? '');
      }
    }
    if (shots && burst.has(id)) {
      for (let i = 0; i < 8 && (await read(id)).t - t0 < holdS; i++) {
        await watch(id, 1, tally);
        await page.screenshot({ path: `${shots}/${id}-lap${lap}-hold${i}.png` });
      }
    }
    await watch(id, Math.max(0, holdS - ((await read(id)).t - t0)), tally);
    const choice = (await rows(id)).length ? await lifted(id) : null;
    await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: `${shots}/${id}-lap${lap}-chosen.png` });
    const note = (await page.evaluate(`document.querySelector('${pane(id)} [data-k="note"]')?.textContent ?? null`)) as string | null;
    const pct = tally.all > 0 ? (100 * tally.on) / tally.all : 0;
    const hid = [...tally.why.entries()].sort((a, b) => b[1] - a[1]).map(([k2, v]) => `${k2} ${v.toFixed(1)} s`).join(', ');
    const asks = PLACES.find((p) => p.id === id)!.expanded?.actions.some((a) => a.primary) ?? false;
    const fail = !open || inS > 3 || pct < 90 || seen.length < want.length || (asks && !note);
    if (fail) failures++;
    const line = `${fail ? 'FAIL' : 'ok  '} ${name.padEnd(22)} lap ${lap} · door ${(t0 - at.t + tally.all).toFixed(1)} s · expanded in ${Number.isFinite(inS) ? inS.toFixed(1) : '-'} s · on the glass ${tally.on.toFixed(1)} of ${tally.all.toFixed(1)} s (${pct.toFixed(0)}%)${hid ? ` · hidden by ${hid}` : ''} · rows lifted by the look ${seen.length} of ${want.length}${labels.length ? ` (${[...new Set(labels)].join(' / ')})` : ''} · chose ${choice ?? (asks ? 'the action' : 'nothing')}: ${note ?? (asks ? 'NO CONFIRMATION' : 'no action, as meant')}`;
    lines.push(line);
    console.log(fail || keepAll ? `${line} · trace ${await writeTrace(id, lap, line)}` : line);
    if (verbose) console.log(`   ${JSON.stringify(await page.evaluate(`window.__app.walk.overlay.report().panes.filter((p) => p.visible).map((p) => p.id + ':' + p.level)`))}`);
    await drag(w * 0.35, 0);
    await until(id, (s) => !s.arrived, 40);
  }
}
console.log(`doors: ${lines.length} stops, ${failures} failed, console errors ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log(`error ${e}`);
await browser.close();
await server?.close();
process.exit(failures ? 1 : 0);
