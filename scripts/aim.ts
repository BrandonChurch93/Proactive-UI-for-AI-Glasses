import { mkdirSync } from 'node:fs';
import { arg, ensureServer, launch, waitQuiet } from './lib/browser';

// pnpm aim: plays Explore live for two laps and aims the way the owner does, at Stroll and at Walk. It picks a label
// or a card on the glass that the look is not on, drags the viewfinder onto it, steering by eye while the button is
// down, and lets go once the square shows it holds the place or the pane is under the center. One line per aim: the band, the
// place aimed at, the place the gaze holds 0.5 s after letting go, and any jump. A frame recorder in the page watches every world
// pane all the way round: a jump of the looked-at pane is a move of more than 60 px in 100 ms while its light moves less than 20 px;
// around each landing no pane within 300 px of the center may move more than 6 px against the world in a frame, for any reason.
// Passes at 95% held, no jump, every landing still, every drag exact, every look-away right. --laps, --w, --h, --verbose.
const base = arg('base', 'http://localhost:5199/')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
// Four laps: the turn off every card or view and the rest after it take about 4 s of each aim.
const laps = Number(arg('laps', '4'));
// A lap of the loop with its crossings is about 165 s of walk time; the bar's two-lap run uses the same 330 s.
const until = Number(arg('until', String(laps * 165)));
const maxS = Number(arg('seconds', '1200'));
const verbose = process.argv.includes('--verbose');
const shots = arg('shots');
const trace = process.argv.includes('--trace');
const tr = async (what: string, id: string): Promise<void> => {
  if (!trace) return;
  const s = await state();
  const p = s.panes.find((q) => q.id === id);
  const gone = p ? '' : ((await page.evaluate(`(() => { const w = window.__app.walk; const d = w.last().frame.items.find((x) => x.id === '${id}'); const r = w.overlay.report().panes.find((x) => x.id === '${id}'); const it = [...w.overlay.items.values()].find((x) => x.id === '${id}'); return 'brain ' + (d ? d.level + (d.placement.zoneOk ? ' zoneOk' : '') : 'none') + ' glass ' + (r ? r.level + ' ' + (r.hiddenBy ?? '') + ' want ' + it.want : 'none'); })()`)) as string);
  const pk = (await page.evaluate(`JSON.stringify({ ...window.__app.walk.pick, pursuit: window.__app.walk.pursuit, holding: window.__app.walk.holding })`)) as string;
  console.log(`    ${what} t ${s.t.toFixed(2)} target ${s.target} pick ${pk} aimed ${p ? `${p.level} vis ${p.vis} op ${p.op.toFixed(2)} mid ${(mid(p).x - cx).toFixed(0)},${(mid(p).y - cy).toFixed(0)} gap ${gap(p).toFixed(0)} light ${p.lx === null ? '-' : `${(p.lx - cx).toFixed(0)},${(p.ly! - cy).toFixed(0)}`}` : `gone (${gone})`}`);
};
if (shots) mkdirSync(shots, { recursive: true });
const cx = w / 2;
const cy = h / 2;
const NEAR_PANE_PX = 300;
const FRAME_PX = 6;

await waitQuiet();
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?scenario=walking`);
await page.waitForTimeout(8000);
await page.goto(`${base}?scenario=walking`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
await page.waitForTimeout(1200);

const recorder = `(() => {
  if (window.__aim) return;
  window.__aim = { log: [], ends: [] };
  const tick = () => {
    const walk = window.__app.walk; const sim = walk.sim; const o = walk.overlay;
    if (o && !o.__wrapped) {
      o.__wrapped = true;
      const end = o.endHold.bind(o);
      o.endHold = (it, fresh) => {
        if (it.hold) window.__aim.ends.push(walk.t.toFixed(2) + ' ' + it.id + (fresh ? ' fresh' : '') + ' at ' + ((new Error().stack || '').split('\\n')[2] || '').trim().replace(/^at /, '').replace(/\\(.*overlay\\.ts[^:]*:/, '(overlay.ts:'));
        return end(it, fresh);
      };
    }
    if (o && !walk.paused) {
      const id = sim.gaze.target;
      let p = null;
      const it = id ? [...o.items.values()].find((x) => x.id === id && x.kind === 'world' && !x.dying) : null;
      const b = it && it.cur;
      if (b && b.rect && b.level !== 'none') {
        // The light the overlay placed this frame against: projecting anew at this moment can catch the camera a step on in a fast drag.
        const a = sim.anchorOf(it.d.placement.anchor); const pr0 = a ? walk.bridge.project(a) : null; const pr = it.placedPr && pr0 && pr0.inFront ? { x: it.placedPr.x, y: it.placedPr.y, inFront: true } : pr0;
        const vis = Boolean(it.placed && it.placed.mode === 'pane' && !it.aside.dropped);
        const pl = it.placed || {}; const fx = pl.fx !== undefined ? pl.fx : pl.align === 'left' ? 1 : pl.align === 'right' ? 0 : 0.5; const fy = pl.fy !== undefined ? pl.fy : pl.vertical === 'middle' ? 0.85 : pl.vertical === 'below' ? 0 : 1;
        const vw = innerWidth; const vh = innerHeight;
        const ex = b.rect.x + b.rect.w >= vw - 1 ? 1 : b.rect.x <= 1 ? 0 : fx; const ey = b.rect.y + b.rect.h >= vh - 1 ? 1 : b.rect.y <= 1 ? 0 : fy;
        p = { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, gx: b.rect.x + b.rect.w * ex, gy: b.rect.y + b.rect.h * ey, side: it.hold ? 'held' : 'light ' + (pl.align || '-') + ' ' + (pl.vertical || '-'), yld: Boolean(it.frozen) || Boolean(it.yieldS && it.yieldS.on), aside: Math.abs(it.aside.x.at(o.t)) + Math.abs(it.aside.y.at(o.t)) > 0.5, o: b.opacity, lv: b.level, vis, come: Boolean(it.asideOn) || Math.abs(it.aside.x.at(o.t)) + Math.abs(it.aside.y.at(o.t)) > 0.5, how: it.hold ? 'held' : it.ride ? 'ride' : it.frozen ? 'frozen' : (it.placed && it.placed.mode) || '-', lx: pr && pr.inFront ? pr.x : null, ly: pr && pr.inFront ? pr.y : null, ax: it.aside.x.at(o.t) + (it.yieldS ? it.yieldS.offset(o.t) : 0), ay: it.aside.y.at(o.t), fv: Math.round(b.fade.v * 100) / 100, pl: it.placed && it.placed.rect ? [it.placed.rect.x, it.placed.rect.y, it.placed.rect.w, it.placed.rect.h, fx, fy].map((v) => Math.round(v * 100) / 100) : null, edge: b.rect.x <= 0.5 || b.rect.y <= 0.5 || b.rect.x + b.rect.w >= vw - 0.5 || b.rect.y + b.rect.h >= vh - 0.5 };
      }
      const all = [];
      for (const q of o.items.values()) {
        const c = q.cur;
        if (q.kind !== 'world' || q.dying || !c || !c.rect || c.level === 'none' || !q.placedPr) continue;
        const pz = q.placed || {}; const qx = pz.fx !== undefined ? pz.fx : pz.align === 'left' ? 1 : pz.align === 'right' ? 0 : 0.5; const qy = pz.fy !== undefined ? pz.fy : pz.vertical === 'middle' ? 0.85 : pz.vertical === 'below' ? 0 : 1;
        all.push({ id: q.id, x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h, fx: qx, fy: qy, lx: q.placedPr.x, ly: q.placedPr.y, o: c.opacity, lv: c.level, dl: q.d.level, how: q.hold ? 'held' : q.ride ? 'ride' : q.frozen ? 'frozen' : pz.mode || '-', moved: pz.moved, why: pz.why, ax: q.aside.x.at(o.t), ay: q.aside.y.at(o.t), yl: Boolean(q.yieldS && q.yieldS.on), jx: q.place ? q.place.jumpX.at(o.t) : 0, jy: q.place ? q.place.jumpY.at(o.t) : 0 });
      }
      window.__aim.log.push({ t: walk.t, id, p, down: walk.holding, all });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;
await page.evaluate(recorder);
type PaneS = { id: string; level: string; x: number; y: number; w: number; h: number; op: number; vis: boolean; lx: number | null; ly: number | null };
type S = { t: number; band: string; lap: number; target: string | null; gate: boolean; panes: PaneS[] };
const state = (): Promise<S> =>
  page.evaluate(`(() => {
    const walk = window.__app.walk; const sim = walk.sim; const o = walk.overlay; const f = walk.last() && walk.last().frame;
    const panes = [];
    for (const it of o ? o.items.values() : []) {
      const b = it.cur;
      if (it.kind !== 'world' || it.dying || !b || !b.rect || b.level === 'none') continue;
      const a = sim.anchorOf(it.d.placement.anchor); const pr = a ? walk.bridge.project(a) : null;
      panes.push({ id: it.id, level: b.level, x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, op: b.opacity, vis: Boolean(it.placed && it.placed.mode === 'pane' && !it.aside.dropped), lx: pr && pr.inFront ? pr.x : null, ly: pr && pr.inFront ? pr.y : null });
    }
    return { t: walk.t, band: f ? f.band : 'stopped', lap: sim.lap, target: sim.gaze.target, gate: Boolean(f && f.gate.safety), panes };
  })()`) as Promise<S>;
type All = { id: string; x: number; y: number; w: number; h: number; fx: number; fy: number; lx: number; ly: number; o: number; lv: string; dl: string; how: string; moved?: string; why?: string; ax: number; ay: number; yl: boolean; jx: number; jy: number };
type Rec = { t: number; id: string | null; down?: boolean; all?: All[]; p: { x: number; y: number; w: number; h: number; gx: number; gy: number; side: string; aside: boolean; yld: boolean; o: number; lv: string; vis: boolean; come: boolean; how: string; lx: number | null; ly: number | null; ax?: number; ay?: number; fv?: number; pl?: number[] | null; edge?: boolean } | null };
const drain = async (): Promise<Rec[]> => {
  await page.evaluate(recorder);
  return (await page.evaluate(`(() => { const l = window.__aim.log; window.__aim.log = []; return l; })()`)) as Rec[];
};

const gap = (p: { x: number; y: number; w: number; h: number }): number => Math.hypot(Math.max(p.x - cx, 0, cx - (p.x + p.w)), Math.max(p.y - cy, 0, cy - (p.y + p.h)));
const mid = (p: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
const park = (): Promise<void> => page.mouse.move(w * 0.5, h - 2);

// A drag starts on the street, never on a pane.
async function startPoint(): Promise<{ x: number; y: number }> {
  for (const [fx, fy] of [[0.5, 0.95], [0.3, 0.95], [0.7, 0.95], [0.5, 0.85], [0.2, 0.8]] as const) {
    const x = w * fx;
    const y = h * fy;
    const onCanvas = await page.evaluate(`document.elementFromPoint(${x}, ${y})?.tagName === 'CANVAS'`);
    if (onCanvas) return { x, y };
  }
  return { x: w * 0.5, y: h * 0.95 };
}

// The owner's aim: press, steer the pane under the square by eye, let go when the square has it.
async function drag(id: string): Promise<{ ok: boolean; held: boolean }> {
  const p0 = await startPoint();
  let x = p0.x;
  let y = p0.y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  let held = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 1600) {
    const s = await state();
    const p = s.panes.find((q) => q.id === id);
    if (!p) {
      await tr('lost', id);
      break;
    }
    // Let go once the square shows the hold (the corners close in after the 250 ms a look needs), as a person watching it would.
    if (s.target === id && ((await page.evaluate(`window.__app.walk.sim.gaze.dwellMs`)) as number) >= 250) {
      held = true;
      break;
    }
    await tr('drag', id);
    // A pane fading at the edge is clamped there; a person would aim at the place's light instead.
    const c = p.op < 0.5 && p.lx !== null ? { x: p.lx, y: p.ly! } : mid(p);
    const dx = c.x - cx;
    const dy = c.y - cy;
    if (Math.hypot(dx, dy) < 16) break;
    const k = Math.min(0.6, 160 / Math.hypot(dx, dy));
    // A drag carries the world with the pointer, so the pane comes to the center by dragging it there.
    x -= dx * k;
    y -= dy * k;
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await park();
  return { ok: true, held };
}

type Aim = { t: number; band: string; id: string; level: string; held: string | null; ok: boolean; skip: boolean; excused: string | null; jumps: number };
const aims: Aim[] = [];
const jumps: string[] = [];
let excusedCome = 0;
let lastRec: Rec[] = [];

const levelAt = new Map<string, { lv: string; t: number }>();
let jumpTotal = 0;
// From the frame the look lands on, the aimed pane's center keeps its offset from its light: under 2 px a frame and 6 px in all,
// and nothing but the world moves it. While the pointer is down, the looked-at pane's offset is constant to 1 px a frame.
type Landing = { still: number | null; perFrame: number; total: number; dragFrames: number; drag: number; dragAt?: string; landAt?: string; dragFails: string[]; ok: boolean };
const landings: Landing[] = [];
const awayRuns: boolean[] = [];
function landing(rec: Rec[], id: string): Landing {
  const off = (r: Rec): { x: number; y: number } | null => (r.p && r.p.lx !== null ? { x: r.p.x + r.p.w / 2 - r.p.lx, y: r.p.y + r.p.h / 2 - r.p.ly! } : null);
  let drag = 0;
  let dragAt: string | undefined;
  let dragFrames = 0;
  const dragFails: string[] = [];
  const frame = (r: Rec): string => {
    const p = r.p!;
    const o = off(r)!;
    return `${r.t.toFixed(3)} ${p.how} ${p.lv} drawn ${[p.x, p.y, p.w, p.h].map((v) => v.toFixed(1)).join(',')} light ${p.lx!.toFixed(1)},${p.ly!.toFixed(1)} offset ${o.x.toFixed(1)},${o.y.toFixed(1)}${p.pl ? ` placed ${p.pl.slice(0, 4).join(',')} at ${p.pl[4]},${p.pl[5]}` : ''}${p.ax || p.ay ? ` aside ${(p.ax ?? 0).toFixed(1)},${(p.ay ?? 0).toFixed(1)}` : ''} op ${p.o.toFixed(2)}${p.fv !== undefined ? ` fade ${p.fv}` : ''}`;
  };
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1]!;
    const b = rec[i]!;
    if (!a.down || !b.down || !a.id || a.id !== b.id) continue;
    const oa = off(a);
    const ob = off(b);
    // A pane at no opacity in either frame cannot be seen to move.
    if (!oa || !ob || Math.abs(a.p!.w - b.p!.w) > 0.5 || Math.abs(a.p!.h - b.p!.h) > 0.5 || a.p!.o < 0.05 || b.p!.o < 0.05) continue;
    dragFrames++;
    const dd = Math.hypot(ob.x - oa.x, ob.y - oa.y);
    if (dd > 1) dragFails.push(`${b.id} moved ${dd.toFixed(1)} px · before ${frame(a)} · then ${frame(b)}`);
    if (dd > drag) {
      drag = dd;
      dragAt = `${b.id} at ${b.t.toFixed(2)}, ${a.p!.how} to ${b.p!.how} ${b.p!.lv} ${b.p!.w.toFixed(0)}x${b.p!.h.toFixed(0)}${b.p!.edge ? ' at the view edge' : ''}${b.p!.ax ? ` aside ${b.p!.ax.toFixed(0)}` : ''} op ${b.p!.o.toFixed(2)}`;
    }
  }
  const k = rec.findIndex((r) => r.id === id && off(r));
  if (k < 0) return { still: null, perFrame: 0, total: 0, dragFrames, drag, ...(dragAt ? { dragAt } : {}), dragFails, ok: drag <= 1 };
  const o0 = off(rec[k]!)!;
  let perFrame = 0;
  let landAt: string | undefined;
  let total = 0;
  let still = 0;
  for (let i = k + 1; i < rec.length; i++) {
    const r = rec[i]!;
    const o = off(r);
    if (r.id !== id || !o) break;
    const prev = off(rec[i - 1]!);
    if (prev && Math.abs(rec[i - 1]!.p!.w - r.p!.w) <= 0.5) {
      const d = Math.hypot(o.x - prev.x, o.y - prev.y);
      if (d > perFrame) {
        perFrame = d;
        landAt = `${r.t.toFixed(2)}${r.p!.edge ? ' at the view edge' : ''} ${r.p!.how} ${r.p!.lv} ${r.p!.w.toFixed(0)}x${r.p!.h.toFixed(0)}`;
      }
    }
    total = Math.max(total, Math.hypot(o.x - o0.x, o.y - o0.y));
    still++;
  }
  return { still, perFrame, total, dragFrames, drag, ...(dragAt ? { dragAt } : {}), ...(landAt ? { landAt } : {}), dragFails, ok: perFrame < 2 && total < 6 && drag <= 1 };
}

// Around a landing, from 0.5 s before it to 0.5 s after, no world pane within 300 px of the center moves more than 6 px against the
// world in a frame, whatever moves it. A pane changing size is judged at the corner it grows from, a frame the browser dropped at its length.
const steadyFails: string[] = [];
let steadyPairs = 0;
function steady(rec: Rec[], id: string): void {
  const land = rec.find((r) => r.id === id);
  if (!land) return;
  const near = (q: All): boolean => gap(q) <= NEAR_PANE_PX;
  const line = (q: All): string => `${q.how} ${q.lv}/${q.dl} center ${(q.x + q.w / 2 - cx).toFixed(0)},${(q.y + q.h / 2 - cy).toFixed(0)} ${q.w.toFixed(0)}x${q.h.toFixed(0)} op ${q.o.toFixed(2)} light ${(q.lx - cx).toFixed(0)},${(q.ly - cy).toFixed(0)}${q.moved ? ` moved:${q.moved}` : ''}${q.why ? ` why:${q.why}` : ''}${q.ax || q.ay ? ` aside ${q.ax.toFixed(0)},${q.ay.toFixed(0)}` : ''}${q.yl ? ' yield' : ''}${q.jx || q.jy ? ` jump ${q.jx.toFixed(0)},${q.jy.toFixed(0)}` : ''}`;
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1]!;
    const b = rec[i]!;
    if (b.t < land.t - 0.5 || b.t > land.t + 0.5 || b.t <= a.t) continue;
    const limit = FRAME_PX * Math.max(1, Math.round((b.t - a.t) * 60));
    for (const q of b.all ?? []) {
      const was = a.all?.find((x) => x.id === q.id);
      if (!was || was.o < 0.05 || q.o < 0.05 || (!near(was) && !near(q))) continue;
      steadyPairs++;
      const dx = q.x + q.w * q.fx - q.lx - (was.x + was.w * q.fx - was.lx);
      const dy = q.y + q.h * q.fy - q.ly - (was.y + was.h * q.fy - was.ly);
      const d = Math.hypot(dx, dy);
      if (d > limit) steadyFails.push(`${q.id} moved ${d.toFixed(1)} px in ${((b.t - a.t) * 1000).toFixed(0)} ms, ${(b.t - land.t).toFixed(2)} s from the landing on ${id} · before ${a.t.toFixed(3)} ${line(was)} · then ${b.t.toFixed(3)} ${line(q)}`);
    }
  }
}

function scanJumps(rec: Rec[]): number {
  for (const r of rec) {
    if (!r.id || !r.p) continue;
    const l = levelAt.get(r.id);
    if (!l || l.lv !== r.p.lv) levelAt.set(r.id, { lv: r.p.lv, t: l ? r.t : -99 });
    (r as Rec & { lvAt?: number }).lvAt = levelAt.get(r.id)!.t;
  }
  const all = [...lastRec, ...rec];
  let n = 0;
  let j = 0;
  for (let i = 0; i < rec.length; i++) {
    const a = rec[i]!;
    if (!a.id || !a.p || !a.p.vis || a.p.o < 0.5 || a.p.lx === null) continue;
    while (j < all.length && all[j]!.t < a.t - 0.1 - 1e-6) j++;
    const b = all[j];
    if (!b || b.id !== a.id || !b.p || !b.p.vis || b.p.o < 0.5 || b.p.lx === null || a.t - b.t < 0.08) continue;
    // A level change grows the pane from a corner: there the corner is what may not jump, unless the pane changed side for want of room.
    const growing = b.p.lv !== a.p.lv || Math.abs(b.p.w - a.p.w) > 2 || Math.abs(b.p.h - a.p.h) > 2 || a.t - ((a as Rec & { lvAt?: number }).lvAt ?? -99) < 0.6;
    if (growing && a.p.side !== b.p.side) continue;
    const move = growing ? Math.hypot(a.p.gx - b.p.gx, a.p.gy - b.p.gy) : Math.hypot(mid(a.p).x - mid(b.p).x, mid(a.p).y - mid(b.p).y);
    const light = Math.hypot(a.p.lx - b.p.lx!, a.p.ly! - b.p.ly!);
    if (move <= 60 || light >= 20) continue;
    if (a.p.come || b.p.come) {
      excusedCome++;
      continue;
    }
    n++;
    jumpTotal++;
    const r = (q: NonNullable<Rec['p']>): string => `${q.lv} ${q.how} ${q.x.toFixed(0)},${q.y.toFixed(0)} ${q.w.toFixed(0)}x${q.h.toFixed(0)}${q.come ? ' come' : ''}`;
    if (jumps.length < 30) jumps.push(`${a.t.toFixed(2)} ${a.id} ${growing ? 'grew, its corner moved' : 'moved'} ${move.toFixed(0)} px in ${(a.t - b.t).toFixed(2)} s, light ${light.toFixed(0)} px (${r(b.p)} to ${r(a.p)})`);
    while (i + 1 < rec.length && rec[i + 1]!.t - a.t < 0.1) i++;
  }
  // Every level change of a held pane: how far the corner it grows from moved, from the frame before to 0.6 s after.
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]!;
    const b = all[i]!;
    if (!a.p || !b.p || a.id !== b.id || a.p.lv === b.p.lv || !/held|pinned/.test(a.p.how) || grownSeen.has(`${b.id}@${b.t}`)) continue;
    const span = all.slice(i).filter((q) => q.id === b.id && q.p && q.t - b.t <= 0.6);
    const after = span[span.length - 1];
    if (!after || !after.p || after.t - b.t < 0.55) continue;
    // A rule 8 step aside in the window moves the pane for the world, not for its growth.
    if (span.some((q) => q.p!.aside) || a.p.aside) continue;
    // Measured against its light: a pane that moves with the world has not moved for its growth.
    const moved = a.p.lx !== null && after.p.lx !== null ? Math.hypot(after.p.gx - after.p.lx - (a.p.gx - a.p.lx), after.p.gy - after.p.ly! - (a.p.gy - a.p.ly!)) : Math.hypot(after.p.gx - a.p.gx, after.p.gy - a.p.gy);
    const sideChanged = after.p.side !== a.p.side;
    grownSeen.add(`${b.id}@${b.t}`);
    const d = (q: NonNullable<Rec['p']>): string => `${q.lv} ${q.how} ${q.side} ${q.x.toFixed(0)},${q.y.toFixed(0)} ${q.w.toFixed(0)}x${q.h.toFixed(0)}`;
    grows.push({ t: b.t, id: b.id!, from: a.p.lv, to: b.p.lv, moved, sideChanged, detail: `${d(a.p)} to ${d(after.p)}` });
  }
  lastRec = all.slice(-120);
  return n;
}
const grows: { t: number; id: string; from: string; to: string; moved: number; sideChanged: boolean; detail: string }[] = [];
const grownSeen = new Set<string>();

// With nothing to aim at, look back along the street, to one side and then the other, as a wearer does.
let side = 1;
async function lookAlong(): Promise<void> {
  const hd = (await page.evaluate(`({ ...window.__app.walk.head })`)) as { yaw: number; pitch: number };
  const k = (2 * Math.PI) / 3 / w;
  const dyaw = Math.atan2(Math.sin(0.45 * side - hd.yaw), Math.cos(0.45 * side - hd.yaw));
  side = -side;
  const p0 = await startPoint();
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((dyaw / k) * i) / 10, p0.y + (((0.06 - hd.pitch) / k) * i) / 10);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await park();
  await page.waitForTimeout(1200);
}

const ui = Math.min(w / 1280, h / 800) < 1 ? Math.max(0.74, Math.min(1, Math.min(w / 1280, h / 800) * 1.3)) : Math.min(1.9, Math.max(1, Math.min(w / 1280, h / 800)));
const recent = new Map<string, number>();
let tail: Rec[] = [];
let idleSince: number | null = null;
const tStart = Date.now();
let lastT = -1;
let reloads = 0;
for (;;) {
  const s = await state();
  if (s.t < lastT - 1) {
    reloads++;
    console.log(`(the page reloaded at ${lastT.toFixed(1)} s; the run goes on from the start of the walk)`);
  }
  if (verbose && Math.abs(s.t - lastT) < 1e-6 && lastT > 0) console.log('(walk time did not move: ' + (await page.evaluate(`JSON.stringify({ paused: window.__app.walk.paused, ended: window.__app.walk.ended, mode: window.__app.mode, end: window.__app.end && window.__app.end.visible, title: window.__app.title && window.__app.title.visible })`)) + ')');
  lastT = s.t;
  if (s.t >= until || Date.now() - tStart > maxS * 1000) {
    if (verbose) console.log(`(stopped at ${s.t.toFixed(1)} s of walk time, ${((Date.now() - tStart) / 1000).toFixed(0)} s real)`);
    break;
  }
  const between = await drain();
  scanJumps(between);
  tail = [...tail, ...between].slice(-90);
  if (s.band !== 'stroll' && s.band !== 'walk') {
    await page.waitForTimeout(250);
    continue;
  }
  const cands = s.panes.filter((p) => (p.level === 'label' || p.level === 'card') && p.vis && p.op > 0.9 && p.id !== s.target && (recent.get(p.id) ?? -99) < s.t - 6 && Math.abs(mid(p).x - cx) < w * 0.4 && Math.abs(mid(p).y - cy) < h * 0.38 && gap(p) > 4);
  if (!cands.length) {
    idleSince ??= Date.now();
    if (Date.now() - idleSince > 1500) {
      idleSince = null;
      await lookAlong();
    } else await page.waitForTimeout(250);
    continue;
  }
  idleSince = null;
  const pick = cands.sort((a, b) => gap(a) - gap(b))[0]!;
  recent.set(pick.id, s.t);
  await drag(pick.id);
  const rel = await state();
  for (let i = 0; trace && i < 10; i++) {
    await tr('after', pick.id);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  const s05 = await state();
  const tag = `${String(aims.length + 1).padStart(2, '0')}-${s.band}-${pick.id}`;
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: `${shots}/${tag}-a.png` });
  await page.waitForTimeout(shots ? 1900 : 2100);
  const s3 = await state();
  if (shots) await page.screenshot({ path: `${shots}/${tag}-b.png` });
  // The glass is quiet in a crossing by design, and a vehicle or a person passing between the eye and the place while
  // the wearer aims has right of way over the pane (rule 8): those aims say nothing about aiming and are not counted.
  const crossing = s05.gate || s3.gate;
  const mover = (await page.evaluate(`(() => { const e = window.__app.walk.overlayLog.find((e) => e.id === '${pick.id}' && e.t >= ${s.t} && (e.kind === 'aside' || e.kind === 'drop') && e.cause === 'keepout' && /vehicle|person/.test(e.detail ?? '')); return e ? e.detail.match(/(?:vehicle|person) ([^,]+)/)[1] : null; })()`)) as string | null;
  const moverEarly = mover !== null && ((await page.evaluate(`window.__app.walk.overlayLog.some((e) => e.id === '${pick.id}' && e.t >= ${s.t} && e.t <= ${rel.t + 0.5} && (e.kind === 'aside' || e.kind === 'drop') && e.cause === 'keepout' && /vehicle|person/.test(e.detail ?? ''))`)) as boolean);
  const excused: string | null = crossing ? 'a crossing paused the glass' : moverEarly && s05.target !== pick.id ? `rule 8 for ${mover} while aiming` : null;
  const recs = await drain();
  const j = scanJumps(recs);
  const land = landing(recs, pick.id);
  landings.push(land);
  steady([...tail, ...recs], pick.id);
  tail = recs.slice(-90);
  const a: Aim = { t: rel.t, band: s.band, id: pick.id, level: pick.level, held: s05.target, ok: s05.target === pick.id, skip: crossing || Boolean(excused), excused, jumps: j };
  aims.push(a);
  console.log(`${a.skip ? 'skip' : a.ok ? 'ok  ' : 'MISS'} ${a.t.toFixed(1).padStart(6)} ${a.band.padEnd(6)} aimed at ${a.id}:${a.level} · held ${a.held ?? 'nothing'} 0.5 s later${excused ? ` (${excused}, excused)` : ''}${j ? ` · ${j} jump${j > 1 ? 's' : ''}` : ''}`);
  console.log(`     landing: ${land.still === null ? 'the look never landed' : `${land.still} frames still, at most ${land.perFrame.toFixed(1)} px a frame, ${land.total.toFixed(1)} px in all${land.perFrame >= 2 && land.landAt ? ` (${land.landAt})` : ''}`} · drag: ${land.dragFrames} frames, at most ${land.drag.toFixed(1)} px a frame${land.drag > 1 && land.dragAt ? ` (${land.dragAt})` : ''}${land.ok ? '' : ' NOT STILL'}`);
  for (const f of land.dragFails) console.log(`       drag failed: ${f}`);
  if (verbose && !a.ok) {
    const log = (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${pick.id}' && e.t >= ${rel.t - 0.6}).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '') + (e.level ? ' ' + e.level : '')).join(' | ')`)) as string;
    console.log(`       overlay log: ${log || 'nothing'}`);
    console.log(`       at release: ${rel.panes.filter((p) => p.vis).map((p) => `${p.id}:${p.level} pane ${gap(p).toFixed(0)} px light ${p.lx === null ? '-' : Math.hypot(p.lx - cx, p.ly! - cy).toFixed(0)} px`).join(', ')}`);
  }
  // The owner's move: from a card or a view, one turn off it, then rest where the turn ended. The look must be off the place by
  // the end of the turn, the pane its label within the look-away (on the brain's 10 Hz tick) and its morph, and the place not
  // looked at again during the rest unless its light is inside the viewfinder.
  const brainLevel = (): Promise<string | null> => page.evaluate(`(() => { const f = window.__app.walk.last() && window.__app.walk.last().frame; const d = f && f.items.find((x) => x.id === '${pick.id}'); return d ? d.level : null; })()`) as Promise<string | null>;
  const lv0 = await brainLevel();
  if (!a.skip && (lv0 === 'card' || lv0 === 'expanded')) {
    const sb = await state();
    const pb = sb.panes.find((q) => q.id === pick.id);
    if (pb && pb.vis && !sb.gate) {
      const tag2 = `${String(aims.length).padStart(2, '0')}-${pick.id}-away`;
      if (shots) await page.screenshot({ path: `${shots}/${tag2}-0-before.png` });
      // Off it: away from the center on the pane's side, or away from its light when the pane is at the center (a turn that carries
      // the light into the viewfinder is a look at the place, and rightly takes it back).
      const side = Math.abs(mid(pb).x - cx) > 10 ? mid(pb).x - cx : (pb.lx ?? mid(pb).x) - cx;
      const turn = 100 * Math.max(1, ui) * (side >= 0 ? 1 : -1);
      const turnAt = sb.t;
      const p0 = await startPoint();
      await page.mouse.move(p0.x, p0.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(p0.x + (turn * i) / 8, p0.y);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await park();
      // The turn has ended once the walk has stepped past its last move: two frames.
      await page.waitForTimeout(40);
      const se = await state();
      const lastTake = async (): Promise<{ t: number; from: string | null; to: string | null; by: string } | null> => page.evaluate('window.__app.walk.lastTake') as Promise<{ t: number; from: string | null; to: string | null; by: string } | null>;
      // Off by the turn's end: not the target, or let go during the turn and taken back by its light inside the viewfinder.
      const lt0 = await lastTake();
      const retakenByLight = (q: typeof lt0): boolean => Boolean(q && q.to === pick.id && q.t >= turnAt && /light/.test(q.by));
      const off = se.target !== pick.id || retakenByLight(lt0);
      const look = (): Promise<string> => page.evaluate(`(() => { const w = window.__app.walk; return JSON.stringify({ t: +w.t.toFixed(2), pick: w.pick.cur, cand: w.pick.cand, left: [...w.leftLook.entries()], take: w.lastTake, ref: w.travelRef && { id: w.travelRef.id, x: Math.round(w.travelRef.x), y: Math.round(w.travelRef.y), yaw: +w.travelRef.yaw.toFixed(3), d: Math.round(w.travelRef.d) }, head: +w.head.yaw.toFixed(3), onCard: w.onCard, aim: w.overlay.aimables().filter((x) => x.anchor === '${pick.id}').map((x) => [x.level, ...[x.rect.x, x.rect.y, x.rect.w, x.rect.h].map(Math.round), +x.opacity.toFixed(2)]), brain: (w.last().frame.items.find((x) => x.id === '${pick.id}') || {}).level, sinceTurn: +(w.sim.t - w.turnedAt).toFixed(2), holding: w.holding }); })()`) as Promise<string>;
      const lookAtEnd = off ? '' : await look();
      let lookAtBack = '';
      let gated = false;
      let lightBack = retakenByLight(lt0);
      if (shots) await page.screenshot({ path: `${shots}/${tag2}-1-after.png` });
      let brainAt: number | null = null;
      let glassAt: number | null = null;
      let back: string | null = null;
      let shot6 = false;
      while (true) {
        const sr = await state();
        const dt = sr.t - se.t;
        if (sr.gate) {
          gated = true;
          break;
        }
        if (dt > 3) break;
        const lv = await brainLevel();
        if (brainAt === null && lv !== 'card' && lv !== 'expanded') brainAt = dt;
        const pr = sr.panes.find((q) => q.id === pick.id);
        if (glassAt === null && (!pr || (pr.level !== 'card' && pr.level !== 'expanded' && pr.h <= 80 * Math.max(1, ui)))) glassAt = dt;
        if (sr.target === pick.id && retakenByLight(await lastTake())) lightBack = true;
        // Taken back by its light is a look at the place: leaving again later, in the frame this samples, is not a second taking.
        if (!back && !lightBack && sr.target === pick.id) {
          const lightIn = (pr && pr.lx !== null && Math.abs(pr.lx - cx) <= 80 * Math.max(1, ui) && Math.abs(pr.ly! - cy) <= 80 * Math.max(1, ui)) || retakenByLight(await lastTake());
          if (!lightIn) {
            back = `${dt.toFixed(2)} s`;
            lookAtBack = await look();
          }
        }
        if (shots && !shot6 && dt >= 0.6) {
          shot6 = true;
          await page.screenshot({ path: `${shots}/${tag2}-2-label.png` });
        }
        await page.waitForTimeout(100);
      }
      if (shots) await page.screenshot({ path: `${shots}/${tag2}-3-rest.png` });
      // A safety gate holds every pane on the glass: a look-away it interrupts says nothing about looking away.
      if (gated) {
        console.log(`     look-away: a turn off the ${lv0}, interrupted by a safety gate; not counted`);
        continue;
      }
      // Taken back by its light inside the viewfinder is a look at the place, and then its card rightly stays.
      const byLight = !back && lightBack;
      const ok = off && !back && (byLight || (brainAt !== null && brainAt <= 0.75 + 1e-6 && glassAt !== null && glassAt <= 1.6 + 1e-6));
      awayRuns.push(ok);
      console.log(`     look-away: a turn of ${Math.abs(turn).toFixed(0)} px off the ${lv0}; the look ${off ? 'off the place' : `still on it (${se.target})`} as the turn ends; its label on the brain ${brainAt === null ? 'never' : `${brainAt.toFixed(2)} s`} and on the glass ${glassAt === null ? 'never' : `${glassAt.toFixed(2)} s`} after; ${back ? `looked at again at ${back} while resting` : byLight ? 'looked at again by its light in the viewfinder, so it stays' : 'not looked at again while resting'}${ok ? '' : ' FAILED'}`);
      if (!ok && lookAtEnd) console.log(`       the look at the turn's end: ${lookAtEnd}`);
      if (!ok && lookAtBack) console.log(`       the look when taken back: ${lookAtBack}`);
      if (!ok && brainAt === null) console.log(`       the brain after the rest: ${await page.evaluate(`(() => { const w = window.__app.walk; const b = w.brain; const it = b.items.get('${pick.id}'); const l = w.last(); const e = l && l.snap.entities.find((x) => x.id === '${pick.id}'); return JSON.stringify({ t: +w.t.toFixed(2), level: it && it.level, lastGazeAt: it && +it.lastGazeAt.toFixed(2), stepAt: it && +it.stepAt.toFixed(2), since: it && +it.since.toFixed(2), gate: b.gateNow, scanHold: b.scanHold, scanUntil: +b.scanUntil.toFixed(2), band: l && l.frame.band, dest: l && l.frame.goal.destination, dist: e && e.distance, target: w.sim.gaze.target, labelled: b.labels && b.labels.has && b.labels.has('${pick.id}') }); })()`)}`);
    }
  }
}

const counted = aims.filter((a) => !a.skip);
const n = counted.length;
const okN = counted.filter((a) => a.ok).length;
const jumpN = jumpTotal;
const bands = [...new Set(aims.map((a) => a.band))].join(' and ');
const pctOk = n ? (100 * okN) / n : 0;
console.log(`\n${n} aims over ${laps} laps (${aims.length - n} more ran into a crossing or rule 8) at ${w} x ${h} (${bands}): held the aimed place 0.5 s later ${okN} of ${n} (${pctOk.toFixed(1)}%); jumps ${jumpN} (${excusedCome} frames of a rule 8 step aside not counted); console errors ${errors.length}${reloads ? `; ${reloads} reloads` : ''}`);
for (const j of jumps) {
  const [t, id] = j.split(' ');
  const near = (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${id}' && Math.abs(e.t - ${t}) < 0.5).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '')).join(' | ')`)) as string;
  console.log('  jump ' + j + (near ? ` · log: ${near}` : ''));
  if (verbose) console.log('    hold ended ' + ((await page.evaluate(`window.__aim.ends.filter((e) => e.includes(' ${id}') && Math.abs(parseFloat(e) - ${t}) < 0.5).join(' | ')`)) as string));
}
for (const e of errors.slice(0, 5)) console.log('  error ' + e);
const growBad = grows.filter((g) => g.moved >= 60 && !g.sideChanged);
console.log(`level changes of a held pane: ${grows.length}, the corner it grows from moved under 60 px in ${grows.length - growBad.length}${grows.some((g) => g.sideChanged) ? ` (${grows.filter((g) => g.sideChanged).length} changed side for want of room)` : ''}`);
for (const g of growBad) {
  console.log(`  grew ${g.t.toFixed(2)} ${g.id} ${g.from} to ${g.to}: its corner moved ${g.moved.toFixed(0)} px (${g.detail})`);
  if (verbose) console.log('    log ' + ((await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${g.id}' && e.t > ${g.t - 0.2} && e.t < ${g.t + 0.8}).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '')).join(' | ')`)) as string) + ' · hold ended ' + ((await page.evaluate(`window.__aim.ends.filter((e) => e.includes(' ${g.id}') && parseFloat(e) > ${g.t - 0.2} && parseFloat(e) < ${g.t + 0.8}).join(' | ')`)) as string));
}
const landBad = landings.filter((l) => !l.ok).length;
console.log(`landings: ${landings.filter((l) => l.still !== null).length} aims, ${landings.filter((l) => l.still !== null && l.perFrame < 2 && l.total < 6).length} still from the landing on; drags: ${landings.filter((l) => l.dragFrames).length}, ${landings.filter((l) => l.dragFrames && l.drag <= 1).length} with the looked-at pane exact to 1 px a frame`);
console.log(`look-aways: ${awayRuns.length} turns off a card or a view, ${awayRuns.filter(Boolean).length} with the look gone by the turn's end, the label within 0.75 s (at its size on the glass by 1.6 s) and the place not taken back while resting`);
console.log(`around the landings: ${steadyPairs} frame pairs of panes within ${NEAR_PANE_PX} px of the center, ${steadyFails.length} over ${FRAME_PX} px a frame against the world`);
for (const f of steadyFails.slice(0, 30)) console.log(`  moved: ${f}`);
const pass = n >= 40 && pctOk >= 95 && steadyFails.length === 0 && jumpN === 0 && errors.length === 0 && growBad.length === 0 && landBad === 0 && awayRuns.every(Boolean);
console.log(pass ? 'PASS' : 'FAIL');
await browser.close();
await server?.close();
process.exit(pass ? 0 : 1);
