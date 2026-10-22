import { arg, ensureServer, launch } from './lib/browser';

// Measures the section 2 bar of docs/plan-ux-rework.md on one walk, live, at one view size. The head follows
// the beat sheet's aims through the live gaze path (frontage, pip, cone) exactly as a person dragging the view
// would, the reviewer's pinches and dismissals are fed in as live input, and the walk is stepped frame by frame.
// --probes runs the look-to-glance and look-to-card probes instead.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'walking')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const probes = process.argv.includes('--probes');
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

async function open(sc: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await p.goto(`${base}?scenario=${sc}`);
    try {
      await p.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 90000 });
      await p.waitForTimeout(500);
      return;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
}

const PROBES: Record<string, { t: number; id: string }[]> = {
  hungry: [
    { t: 6, id: 'kathys-cupcakes' },
    { t: 29, id: 'post-office' },
  ],
  errands: [
    { t: 66, id: 'post-office' },
    { t: 17, id: 'main-street-pharmacy' },
  ],
  walking: [
    { t: 4, id: 'grace-theater' },
    { t: 40, id: 'atlas-books' },
  ],
};

if (probes) {
  for (const pr of PROBES[scenario] ?? []) {
    await open(scenario);
    const r = (await p.evaluate(`(async () => {
      const id = ${JSON.stringify(pr.id)};
      const walk = window.__app.walk; walk.paused = true; walk.seek(${pr.t});
      const sim = walk.sim; const o = walk.overlay;
      const aim = () => { const a = sim.anchorOf(id); const e = sim.wearer.pos; walk.look(Math.atan2(-(a.x - e.x), -(a.z - e.z)) - sim.wearer.bodyYaw, Math.atan2(a.y - 1.6 - e.y, Math.hypot(a.x - e.x, a.z - e.z))); };
      aim(); walk.lookedAt = -Infinity;
      const t0 = walk.t; let on = null, glance = null, card = null, pre = null; const targets = []; let lastT; let band = null;
      const shown = (lv) => { const it = o.items.get(id); if (!it || !it.cur || it.cur.level !== lv || it.cur.opacity < 0.9) return false; const k = it.cur.view.kids[0]; return k && Number(getComputedStyle(k).opacity) > 0.9; };
      while (walk.t - t0 < 4) {
        walk.seek(walk.t + 1 / 60);
        const dt = walk.t - t0;
        const g = sim.gaze.target;
        if (g !== lastT) { targets.push([+dt.toFixed(3), g]); lastT = g; }
        if (band === null && walk.last()) band = walk.last().frame.band;
        if (on === null && g === id) { on = dt; const it = o.items.get(id); if (it && it.cur) pre = it.cur.level; }
        if (on === null) continue;
        if (glance === null && (shown('glance') || shown('card') || shown('expanded'))) glance = dt - on;
        if (card === null && (shown('card') || shown('expanded'))) card = dt - on;
      }
      return { glance, card, targets, band, on, pre };
    })()`)) as { glance: number | null; card: number | null; targets: [number, string | null][]; band: string; on: number | null; pre: string | null };
    const late = r.on === null ? r.targets.length : r.targets.filter(([t]) => t > r.on! + 0.25).length;
    console.log(`probe ${scenario} t ${pr.t} ${pr.id} (${r.band}): on target after ${r.on?.toFixed(2) ?? 'never'} s${r.pre ? `, already a ${r.pre}` : ''}; glance ${r.glance?.toFixed(2) ?? 'none'} s, card ${r.card?.toFixed(2) ?? 'none'} s after; gaze changes after the first 250 ms on target ${late}  targets ${JSON.stringify(r.targets)}`);
  }
} else {
  await open(scenario);
  const out = (await p.evaluate(`(async () => {
    const walk = window.__app.walk; walk.paused = true;
    const sim = walk.sim; const o = walk.overlay;
    const vp = { w: innerWidth, h: innerHeight };
    const m = { frames: 0, paneFrames: 0, farFrames: 0, worstFar: 0, worstFarAt: null, roadFrames: 0, worstRoad: 0, worstRoadAt: null, keepW: 0, keepH: 0, pipsMax: 0, pipsAt: null, hiddenPromotes: [] };
    let lastTick = -1;
    const overlap = (a, r) => Math.max(0, Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x)) * Math.max(0, Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y));
    while (walk.t < walk.duration - 0.02 && !walk.ended) {
      const ai = sim.reviewer.aim(sim.t, sim.wearer.pos, sim.wearer.bodyYaw, sim.anchorOf, sim.wearer.state === 'crossing');
      walk.look(ai.yaw - sim.wearer.bodyYaw, ai.pitch);
      const prevT = sim.t;
      walk.seek(walk.t + 1 / 60);
      const ev = sim.reviewer.eventsBetween(prevT, sim.t);
      if (Object.keys(ev).length) walk.queue(ev);
      m.frames++;
      const kos = walk.bridge.keepOuts();
      const road = kos.filter((k) => k.kind === 'roadway');
      for (const k of kos) { m.keepW = Math.max(m.keepW, k.rect.w / vp.w); m.keepH = Math.max(m.keepH, k.rect.h / vp.h); }
      let lit = 0;
      for (const it of o.items.values()) {
        if (it.kind === 'world' && it.lights && !it.dying && it.L.pip > 0.5) {
          const a = walk.bridge.anchor(it.d.placement.anchor); const pr = a && walk.bridge.project(a);
          if (pr && pr.inFront && pr.x > 0 && pr.x < vp.w && pr.y > 0 && pr.y < vp.h) lit++;
        }
        const c = it.cur;
        if (it.kind !== 'world' || !c || !c.rect || c.opacity < 0.5 || it.want === 'none') continue;
        const a = walk.bridge.anchor(it.d.placement.anchor); if (!a) continue;
        const pr = walk.bridge.project(a); if (!pr.inFront) continue;
        m.paneFrames++;
        const r = c.rect;
        const dx = Math.max(r.x - pr.x, 0, pr.x - (r.x + r.w)); const dy = Math.max(r.y - pr.y, 0, pr.y - (r.y + r.h));
        const ratio = Math.hypot(dx, dy) / r.w;
        if (ratio > 1) { m.farFrames++; if (ratio > m.worstFar) { m.worstFar = ratio; m.worstFarAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
        let ov = 0; for (const k of road) ov += overlap(r, k.rect);
        if (ov > 1) { m.roadFrames++; const f = ov / (r.w * r.h); if (f > m.worstRoad) { m.worstRoad = f; m.worstRoadAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
      }
      if (!sim.gaze.target && lit > m.pipsMax) { m.pipsMax = lit; m.pipsAt = +walk.t.toFixed(2); }
      const last = walk.last();
      if (last && last.frame.t !== lastTick) {
        lastTick = last.frame.t;
        for (const d of last.frame.events) {
          if (d.action !== 'promote' || d.placement.zone !== 'world') continue;
          const it = o.items.get(d.id);
          if (!it || it.want === 'none' || !it.cur || it.cur.opacity < 0.3) m.hiddenPromotes.push([+last.frame.t.toFixed(1), d.id, d.level]);
        }
      }
    }
    return { m, log: walk.overlayLog, t: walk.t };
  })()`)) as {
    m: { frames: number; paneFrames: number; farFrames: number; worstFar: number; worstFarAt: unknown; roadFrames: number; worstRoad: number; worstRoadAt: unknown; keepW: number; keepH: number; pipsMax: number; pipsAt: number | null; hiddenPromotes: unknown[] };
    log: { t: number; id: string; kind: string; level: string; from?: string; cause: string; detail?: string }[];
    t: number;
  };
  const { m, log } = out;
  const EXEMPT = /gate|safety|dismiss|look-away|band|choice/;
  const RANK: Record<string, number> = { none: 0, pip: 1, whisper: 1, glance: 2, card: 3, expanded: 4 };
  const changes = new Map<string, { t: number; exempt: boolean }[]>();
  const births = new Map<string, number>();
  let maxBirths = 0;
  let maxBirthsAt = '';
  for (const e of log) {
    const levelChange = e.from !== undefined && e.from !== e.level;
    if (levelChange) {
      const list = changes.get(e.id) ?? [];
      const climb = /dwell|pinch/.test(e.detail ?? '') && (RANK[e.level] ?? 0) > (RANK[e.from!] ?? 0);
      list.push({ t: e.t, exempt: climb || EXEMPT.test(`${e.cause} ${e.detail ?? ''}`) || e.kind === 'death' || e.kind === 'edge' });
      changes.set(e.id, list);
    }
    if (e.kind === 'birth') {
      const n = (births.get(e.id) ?? 0) + 1;
      births.set(e.id, n);
      if (n > maxBirths) {
        maxBirths = n;
        maxBirthsAt = `${e.id} at ${e.t.toFixed(2)}`;
      }
    }
    if (e.kind === 'death') births.delete(e.id);
  }
  const fast: string[] = [];
  for (const [id, list] of changes) {
    for (let i = 1; i < list.length; i++) {
      if (list[i]!.exempt) continue;
      const gap = list[i]!.t - list[i - 1]!.t;
      if (gap < 2.5 - 1e-6) fast.push(`${id} ${gap.toFixed(2)} s at ${list[i]!.t.toFixed(2)}`);
    }
  }
  const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  console.log(`bar ${scenario} ${w}x${h} live, ${m.frames} frames to ${out.t.toFixed(1)} s`);
  console.log(`  level changes inside 2.5 s (not gate, dismiss, look-away, dwell climb): ${fast.length}${fast.length ? `  ${fast.slice(0, 6).join('; ')}` : ''}`);
  console.log(`  most births per item per life: ${maxBirths} (${maxBirthsAt})`);
  console.log(`  pane edge farther than 1.0 x its width from its pip: ${m.farFrames} of ${m.paneFrames} pane frames (${pct(m.farFrames, m.paneFrames)}), worst ${m.worstFar.toFixed(2)} x ${JSON.stringify(m.worstFarAt)}`);
  console.log(`  pane over the roadway: ${m.roadFrames} of ${m.paneFrames} pane frames (${pct(m.roadFrames, m.paneFrames)}), worst ${(100 * m.worstRoad).toFixed(1)}% of the pane ${JSON.stringify(m.worstRoadAt)}`);
  console.log(`  largest keep-out: ${(100 * m.keepW).toFixed(0)}% x ${(100 * m.keepH).toFixed(0)}% of the view`);
  console.log(`  most pips lit with no gaze: ${m.pipsMax}${m.pipsAt !== null ? ` at ${m.pipsAt}` : ''}`);
  console.log(`  promotions while the pane was not visible: ${m.hiddenPromotes.length}${m.hiddenPromotes.length ? `  ${JSON.stringify(m.hiddenPromotes.slice(0, 6))}` : ''}`);
}
console.log(`  console errors: ${errors.length}${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`);
await b.close();
await server?.close();
