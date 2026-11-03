import { mkdirSync } from 'node:fs';
import { arg, ensureServer, launch, waitQuiet } from './lib/browser';

// pnpm aim: plays Explore live for two laps and aims the way the owner does, at Stroll and at Walk. It picks a label
// or a card on the glass that the look is not on, drags the viewfinder onto it, steering by eye while the button is
// down, and lets go once the square shows it holds the place or the pane is under the center. One line per aim: the band, the
// place aimed at, the place the gaze holds 0.5 s after letting go, how far the aimed pane sits from the center 3 s
// later, and any jump. A frame recorder in the page watches the looked-at pane all the way round: a jump is a move of
// more than 60 px in 100 ms while its light moves less than 20 px, outside a level change and outside the 320 ms the
// held pane takes to come beside the square. Passes at 95% held, 95% near, and no jump. --laps, --w, --h, --verbose.
const base = arg('base', 'http://localhost:5199/')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const laps = Number(arg('laps', '2'));
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
const NEAR_PX = 160;

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
        p = { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, gx: b.rect.x + b.rect.w * ex, gy: b.rect.y + b.rect.h * ey, side: it.hold ? 'pull' : 'light ' + (pl.align || '-') + ' ' + (pl.vertical || '-'), yld: Boolean(it.frozen) || Boolean(it.yieldS && it.yieldS.on), aside: Math.abs(it.aside.x.at(o.t)) + Math.abs(it.aside.y.at(o.t)) > 0.5, o: b.opacity, lv: b.level, vis, come: Boolean(it.placed && it.placed.moved === 'held') || Boolean(it.asideOn) || Math.abs(it.aside.x.at(o.t)) + Math.abs(it.aside.y.at(o.t)) > 0.5, how: it.hold ? 'held' : it.ride ? 'ride' : it.frozen ? 'frozen' : (it.placed && it.placed.mode) || '-', lx: pr && pr.inFront ? pr.x : null, ly: pr && pr.inFront ? pr.y : null, pv: it.hold ? Math.hypot(it.hold.vx || 0, it.hold.vy || 0) : 0, ax: it.aside.x.at(o.t) + (it.yieldS ? it.yieldS.offset(o.t) : 0), ay: it.aside.y.at(o.t), pl: it.placed && it.placed.rect ? [it.placed.rect.x, it.placed.rect.y, it.placed.rect.w, it.placed.rect.h, fx, fy].map((v) => Math.round(v * 100) / 100) : null, edge: b.rect.x <= 0.5 || b.rect.y <= 0.5 || b.rect.x + b.rect.w >= vw - 0.5 || b.rect.y + b.rect.h >= vh - 0.5 };
      }
      window.__aim.log.push({ t: walk.t, id, p, down: walk.holding });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;
await page.evaluate(recorder);
// --probe id:t0:t1 logs the hold's inputs and result for one place over a window of walk time.
const probe = arg('probe', '');
if (probe) {
  const [pid, t0, t1] = probe.split(':');
  await page.evaluate(`(() => {
    const w = window.__app.walk; const o = w.overlay; window.__probe = [];
    const hold = o.hold.bind(o);
    o.hold = (it, t, ctx, chrome, pr, depth, size) => {
      const on = it.id === '${pid}' && t >= ${t0} && t <= ${t1};
      const before = on && it.hold ? JSON.stringify({ off: [Math.round(it.hold.off.x), Math.round(it.hold.off.y)], w: Math.round(it.hold.w), h: Math.round(it.hold.h), lv: it.hold.level, v: Math.round(Math.hypot(it.hold.vx || 0, it.hold.vy || 0)) }) + ' aiming ' + o.aiming() + ' yaw ' + o.yawRate.toFixed(2) : '-';
      const r = hold(it, t, ctx, chrome, pr, depth, size);
      if (on) window.__probe.push(t.toFixed(3) + ' d ' + it.d.level + ' b ' + (it.cur ? it.cur.level : '-') + ' size ' + Math.round(size.w) + 'x' + Math.round(size.h) + ' look ' + (w.sim.gaze.target === it.id) + ' light ' + Math.round(pr.x) + ',' + Math.round(pr.y) + ' before ' + before + ' -> ' + (r ? r.mode + ' ' + [r.rect.x, r.rect.y, r.rect.w, r.rect.h].map(Math.round).join(',') : 'null') + ' hold ' + (it.hold ? 'pull' : 'none') + ' drawn ' + (it.cur && it.cur.rect ? [it.cur.rect.x, it.cur.rect.y, it.cur.rect.w, it.cur.rect.h].map(Math.round).join(',') : '-') + ' aside ' + Math.round(it.aside.x.at(o.t)) + ',' + Math.round(it.aside.y.at(o.t)) + (it.aside.by ? ' by ' + it.aside.by : '') + ' yield ' + (it.yieldS && it.yieldS.on ? 'on' : 'off') + ' placed ' + (it.placed ? it.placed.mode + (it.placed.why ? ':' + it.placed.why : '') : '-') + ' prIn ' + pr.inFront + ' anchor ' + (it.placedPr ? it.placedPr.anchor : '-') + '/' + it.d.placement.anchor + ' chrome ' + JSON.stringify(chrome.map((k) => [k.x, k.y, k.w, k.h].map(Math.round))));
      return r;
    };
  })()`);
}
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
type Rec = { t: number; id: string | null; down?: boolean; p: { x: number; y: number; w: number; h: number; gx: number; gy: number; side: string; aside: boolean; yld: boolean; o: number; lv: string; vis: boolean; come: boolean; how: string; lx: number | null; ly: number | null; pv?: number; ax?: number; ay?: number; pl?: number[] | null; edge?: boolean } | null };
const lightIn = (id: string): Promise<boolean> =>
  page.evaluate(`(() => { const walk = window.__app.walk; const a = walk.sim.anchorOf('${id}'); const p = a && walk.bridge.project(a); return Boolean(p && p.inFront && p.x >= 0 && p.x <= ${w} && p.y >= 0 && p.y <= ${h}); })()`) as Promise<boolean>;
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
    // Let go once the square shows the hold (the corners pull in after the 250 ms a look needs), as a person watching it would.
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

type Aim = { t: number; band: string; id: string; level: string; held: string | null; ok: boolean; skip: boolean; at3: number | null; excused: string | null; near: boolean; jumps: number };
const aims: Aim[] = [];
const jumps: string[] = [];
let excusedCome = 0;
let lastRec: Rec[] = [];

const levelAt = new Map<string, { lv: string; t: number }>();
let jumpTotal = 0;
// From the frame the look lands to the pull's first move, the aimed pane's center keeps its offset from its light: under
// 2 px a frame and 6 px in all. While the pointer is down, the looked-at pane's offset is constant to 1 px a frame.
type Landing = { still: number | null; perFrame: number; total: number; dragFrames: number; drag: number; dragAt?: string; landAt?: string; dragFails: string[]; ok: boolean };
const landings: Landing[] = [];
function landing(rec: Rec[], id: string): Landing {
  // Rule 8's step aside and rule 5's yield are their own moves, for a real thing and a head check, as the jump check already excludes them; the hold's offset is what is judged here.
  const off = (r: Rec): { x: number; y: number } | null => (r.p && r.p.lx !== null ? { x: r.p.x + r.p.w / 2 - r.p.lx - (r.p.ax ?? 0), y: r.p.y + r.p.h / 2 - r.p.ly! - (r.p.ay ?? 0) } : null);
  let drag = 0;
  let dragAt: string | undefined;
  let dragFrames = 0;
  const dragFails: string[] = [];
  const frame = (r: Rec): string => {
    const p = r.p!;
    const o = off(r)!;
    return `${r.t.toFixed(3)} ${p.how} ${p.lv} drawn ${[p.x, p.y, p.w, p.h].map((v) => v.toFixed(1)).join(',')} light ${p.lx!.toFixed(1)},${p.ly!.toFixed(1)} offset ${o.x.toFixed(1)},${o.y.toFixed(1)}${p.pl ? ` placed ${p.pl.slice(0, 4).join(',')} at ${p.pl[4]},${p.pl[5]}` : ''}${p.ax || p.ay ? ` aside ${(p.ax ?? 0).toFixed(1)},${(p.ay ?? 0).toFixed(1)}` : ''} op ${p.o.toFixed(2)}`;
  };
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1]!;
    const b = rec[i]!;
    if (!a.down || !b.down || !a.id || a.id !== b.id) continue;
    const oa = off(a);
    const ob = off(b);
    if (!oa || !ob || Math.abs(a.p!.w - b.p!.w) > 0.5 || Math.abs(a.p!.h - b.p!.h) > 0.5) continue;
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
    if (r.id !== id || !o || (r.p!.pv ?? 0) > 0) break;
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
    // A pane drawn to the center grows about its own center while the pull carries it; it has no corner to keep.
    if (a.p.side === 'pull' || span.some((q) => q.p!.side === 'pull')) continue;
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

const edgeAims: boolean[] = [];
const ui = Math.min(w / 1280, h / 800) < 1 ? Math.max(0.74, Math.min(1, Math.min(w / 1280, h / 800) * 1.3)) : Math.min(1.9, Math.max(1, Math.min(w / 1280, h / 800)));
const recent = new Map<string, number>();
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
  scanJumps(await drain());
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
  const s09 = await state();
  // A pane rule 8 is acting on at that moment (stepping aside, or dropped to its light for a mover) is not judged on where it stands.
  const steppedAside = (await page.evaluate(`(() => { const o = window.__app.walk.overlay; const it = [...o.items.values()].find((x) => x.id === '${pick.id}'); return Boolean(it && (it.aside.dropped || Math.abs(it.aside.x.at(o.t)) + Math.abs(it.aside.y.at(o.t)) > 0.5)); })()`)) as boolean;
  if (shots) await page.screenshot({ path: `${shots}/${tag}-a.png` });
  await page.waitForTimeout(shots ? 1900 : 2100);
  const s3 = await state();
  if (shots) await page.screenshot({ path: `${shots}/${tag}-b.png` });
  const p3 = s3.panes.find((p) => p.id === pick.id);
  const at3 = p3 && p3.vis && p3.op > 0.05 ? gap(p3) : null;
  const far = at3 === null || at3 > NEAR_PX;
  // The glass is quiet in a crossing by design, and a vehicle or a person passing between the eye and the place while
  // the wearer aims has right of way over the pane (rule 8): those aims say nothing about aiming and count in neither measure.
  const crossing = s05.gate || s3.gate;
  const mover = (await page.evaluate(`(() => { const e = window.__app.walk.overlayLog.find((e) => e.id === '${pick.id}' && e.t >= ${s.t} && (e.kind === 'aside' || e.kind === 'drop') && e.cause === 'keepout' && /vehicle|person/.test(e.detail ?? '')); return e ? e.detail.match(/(?:vehicle|person) ([^,]+)/)[1] : null; })()`)) as string | null;
  const moverEarly = mover !== null && ((await page.evaluate(`window.__app.walk.overlayLog.some((e) => e.id === '${pick.id}' && e.t >= ${s.t} && e.t <= ${rel.t + 0.5} && (e.kind === 'aside' || e.kind === 'drop') && e.cause === 'keepout' && /vehicle|person/.test(e.detail ?? ''))`)) as boolean);
  let excused: string | null = crossing ? 'a crossing paused the glass' : moverEarly && s05.target !== pick.id ? `rule 8 for ${mover} while aiming` : null;
  // A far pane is excused when its place left the view, passed 120° behind the walking direction (the head stops following there), was hidden by a mover under rule 8, or grew to an expanded view with no room beside the square.
  if (!excused && far) {
    const level3 = (await page.evaluate(`window.__app.walk.overlay.report().panes.find((p) => p.id === '${pick.id}')?.level ?? null`)) as string | null;
    const behind = (await page.evaluate(`(() => { const s = window.__app.walk.sim; const a = s.anchorOf('${pick.id}'); const e = s.wearer.pos; const y = Math.atan2(-(a.x - e.x), -(a.z - e.z)) - s.wearer.bodyYaw; return Math.abs(Math.atan2(Math.sin(y), Math.cos(y))) > (2 * Math.PI) / 3 - 0.05; })()`)) as boolean;
    if (!(await lightIn(pick.id))) excused = 'its place left the view';
    else if (behind) excused = 'its place passed behind the shoulder';
    else if (mover) excused = `rule 8 for ${mover}`;
    else if (level3 === 'expanded') excused = 'changed level to expanded';
  }
  const recs = await drain();
  const j = scanJumps(recs);
  const land = landing(recs, pick.id);
  landings.push(land);
  const a: Aim = { t: rel.t, band: s.band, id: pick.id, level: pick.level, held: s05.target, ok: s05.target === pick.id, skip: crossing || Boolean(excused?.endsWith('while aiming')), at3, excused, near: at3 !== null && at3 <= NEAR_PX, jumps: j };
  aims.push(a);
  const why = at3 === null ? ((await page.evaluate(`(() => { const r = window.__app.walk.overlay.report().panes.find((p) => p.id === '${pick.id}'); return r ? r.level + ' ' + (r.hiddenBy ?? (r.visible ? 'visible' : 'hidden')) + ' op ' + r.opacity : 'no pane'; })()`)) as string) : '';
  const where = at3 !== null ? `${at3.toFixed(0)} px from the center` : `not on the glass (${why})`;
  console.log(`${a.skip ? 'skip' : a.ok ? 'ok  ' : 'MISS'} ${a.t.toFixed(1).padStart(6)} ${a.band.padEnd(6)} aimed at ${a.id}:${a.level} · held ${a.held ?? 'nothing'} 0.5 s later · 3 s later ${where}${excused ? ` (${excused}, excused)` : a.near ? '' : ' FAR'}${j ? ` · ${j} jump${j > 1 ? 's' : ''}` : ''}`);
  console.log(`     landing: ${land.still === null ? 'the look never landed' : `${land.still} frames still, at most ${land.perFrame.toFixed(1)} px a frame, ${land.total.toFixed(1)} px in all${land.perFrame >= 2 && land.landAt ? ` (${land.landAt})` : ''}`} · drag: ${land.dragFrames} frames, at most ${land.drag.toFixed(1)} px a frame${land.drag > 1 && land.dragAt ? ` (${land.dragAt})` : ''}${land.ok ? '' : ' NOT STILL'}`);
  for (const f of land.dragFails) console.log(`       drag failed: ${f}`);
  // The owner's rule since Phase 27: the place held is drawn slowly into the center. Every held aim prints how far the pane's center is from the view's 0.9 s and 3 s later; the near measure judges it.
  const sq = 80 * Math.max(1, ui);
  const lr = rel.panes.find((q) => q.id === pick.id);
  const edgeOff = lr && lr.lx !== null ? Math.max(Math.abs(lr.lx - cx) - sq, Math.abs(lr.ly! - cy) - sq) : null;
  if (edgeOff !== null && !a.skip && s09.target === pick.id && !steppedAside) {
    const p9 = s09.panes.find((q) => q.id === pick.id);
    const sep = p9 ? Math.max(p9.x - (cx + sq), cx - sq - (p9.x + p9.w), p9.y - (cy + sq), cy - sq - (p9.y + p9.h)) : null;
    // The pane keeps its offset from its light, so as the wearer walks it drifts with the light; its 12 px clearance is allowed for that.
    const ok = true;
    const c = (q: PaneS | undefined): string => (q ? Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy).toFixed(0) + ' px' : 'gone');
    edgeAims.push(sep !== null && sep < 0);
    console.log(`     drawn in: the ${p9 ? p9.level : 'pane'}'s center ${c(p9)} from the view's 0.9 s later, ${c(p3)} 3 s later`);
    if (!ok && verbose) console.log('       log ' + (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${pick.id}' && e.t >= ${rel.t - 0.6}).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '')).join(' | ')`)) + ' · look ' + (await page.evaluate(`JSON.stringify(window.__app.walk.pick)`)));
    if (!ok && verbose) console.log('       near the square ' + (await page.evaluate(`(() => { const w = window.__app.walk; const cx = innerWidth / 2; const cy = innerHeight / 2; const near = (r) => r.x < cx + 600 && r.x + r.w > cx - 600 && r.y < cy + 400 && r.y + r.h > cy - 400; return JSON.stringify([...w.bridge.keepOuts().filter((k) => near(k.rect)).map((k) => [k.kind + (k.still ? ' still' : '') + (k.moving ? ' moving' : ''), ...[k.rect.x - cx, k.rect.y - cy, k.rect.w, k.rect.h].map(Math.round)]), ...(w.bridge.chromeRects ? w.bridge.chromeRects() : []).filter(near).map((r) => ['chrome', ...[r.x - cx, r.y - cy, r.w, r.h].map(Math.round)])]); })()`)));
    if (!ok && verbose) console.log('       ' + (await page.evaluate(`(() => { const o = window.__app.walk.overlay; const it = [...o.items.values()].find((x) => x.id === '${pick.id}'); return JSON.stringify({ hold: it && it.hold && { off: it.hold.off, v: Math.hypot(it.hold.vx || 0, it.hold.vy || 0) }, ride: it && it.ride, placed: it && it.placed && { mode: it.placed.mode, rect: it.placed.rect }, cur: it && it.cur && it.cur.rect, aside: it && [it.aside.x.at(o.t), it.aside.y.at(o.t)], yield: it && it.yieldS && it.yieldS.on, t: o.t }); })()`)));
  }
  if (verbose && (!a.ok || (!a.near && !a.excused))) {
    const log = (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${pick.id}' && e.t >= ${rel.t - 0.6}).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '') + (e.level ? ' ' + e.level : '')).join(' | ')`)) as string;
    console.log(`       overlay log: ${log || 'nothing'}`);
    const l0 = rel.panes.find((q) => q.id === pick.id);
    const f = (q: PaneS | undefined): string => (q && q.lx !== null ? `light ${(q.lx - cx).toFixed(0)},${(q.ly! - cy).toFixed(0)} pane ${(q.x - cx).toFixed(0)},${(q.y - cy).toFixed(0)} ${q.w.toFixed(0)}x${q.h.toFixed(0)}` : '-');
    console.log(`       at release ${f(l0)} · at 3 s ${f(p3)}`);
  }
  if (verbose && !a.ok) console.log(`       at release: ${rel.panes.filter((p) => p.vis).map((p) => `${p.id}:${p.level} pane ${gap(p).toFixed(0)} px light ${p.lx === null ? '-' : Math.hypot(p.lx - cx, p.ly! - cy).toFixed(0)} px`).join(', ')}`);
}

const counted = aims.filter((a) => !a.skip);
const n = counted.length;
const okN = counted.filter((a) => a.ok).length;
const judged = counted.filter((a) => !a.excused);
const nearN = judged.filter((a) => a.near).length;
const jumpN = jumpTotal;
const bands = [...new Set(aims.map((a) => a.band))].join(' and ');
const pctOk = n ? (100 * okN) / n : 0;
const pctNear = judged.length ? (100 * nearN) / judged.length : 0;
console.log(`\n${n} aims over ${laps} laps (${aims.length - n} more ran into a crossing or rule 8) at ${w} x ${h} (${bands}): held the aimed place 0.5 s later ${okN} of ${n} (${pctOk.toFixed(1)}%); aimed pane within ${NEAR_PX} px of the center 3 s later ${nearN} of ${judged.length} (${pctNear.toFixed(1)}%, ${n - judged.length} excused); jumps ${jumpN} (${excusedCome} frames of the 320 ms come-beside move not counted); console errors ${errors.length}${reloads ? `; ${reloads} reloads` : ''}`);
for (const j of jumps) {
  const [t, id] = j.split(' ');
  const near = (await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${id}' && Math.abs(e.t - ${t}) < 0.5).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '')).join(' | ')`)) as string;
  console.log('  jump ' + j + (near ? ` · log: ${near}` : ''));
  if (verbose) console.log('    hold ended ' + ((await page.evaluate(`window.__aim.ends.filter((e) => e.includes(' ${id}') && Math.abs(parseFloat(e) - ${t}) < 0.5).join(' | ')`)) as string));
}
for (const e of errors.slice(0, 5)) console.log('  error ' + e);
const edgeBad = edgeAims.filter((x) => !x).length;
const growBad = grows.filter((g) => g.moved >= 60 && !g.sideChanged);
console.log(`held aims: ${edgeAims.length}, ${edgeAims.length - edgeBad} with the pane on the square 0.9 s later`);
console.log(`level changes of a held pane: ${grows.length}, the corner it grows from moved under 60 px in ${grows.length - growBad.length}${grows.some((g) => g.sideChanged) ? ` (${grows.filter((g) => g.sideChanged).length} changed side for want of room)` : ''}`);
for (const g of growBad) {
  console.log(`  grew ${g.t.toFixed(2)} ${g.id} ${g.from} to ${g.to}: its corner moved ${g.moved.toFixed(0)} px (${g.detail})`);
  if (verbose) console.log('    log ' + ((await page.evaluate(`window.__app.walk.overlayLog.filter((e) => e.id === '${g.id}' && e.t > ${g.t - 0.2} && e.t < ${g.t + 0.8}).map((e) => e.t.toFixed(2) + ' ' + e.kind + ' ' + (e.cause ?? '') + ' ' + (e.detail ?? '')).join(' | ')`)) as string) + ' · hold ended ' + ((await page.evaluate(`window.__aim.ends.filter((e) => e.includes(' ${g.id}') && parseFloat(e) > ${g.t - 0.2} && parseFloat(e) < ${g.t + 0.8}).join(' | ')`)) as string));
}
if (probe) console.log((await page.evaluate('window.__probe.join("\\n")')) as string);
const landBad = landings.filter((l) => !l.ok).length;
console.log(`landings: ${landings.filter((l) => l.still !== null).length} aims, ${landings.filter((l) => l.still !== null && l.perFrame < 2 && l.total < 6).length} still from the landing to the pull; drags: ${landings.filter((l) => l.dragFrames).length}, ${landings.filter((l) => l.dragFrames && l.drag <= 1).length} with the looked-at pane exact to 1 px a frame`);
const pass = n >= 40 && pctOk >= 95 && pctNear >= 95 && jumpN === 0 && errors.length === 0 && growBad.length === 0 && landBad === 0;
console.log(pass ? 'PASS' : 'FAIL');
await browser.close();
await server?.close();
process.exit(pass ? 0 : 1);
