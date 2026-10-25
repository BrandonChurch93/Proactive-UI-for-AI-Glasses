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
const nolookup = process.argv.includes('--nolookup');
const wander = process.argv.includes('--wander');
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

// dy: how far below the anchor the person aims. Across the street people look at the shopfront (1.6 m below
// the sign); a store on their own side well ahead is seen edge-on, so they look at its sign (0.2 m).
const PROBES: Record<string, { t: number; id: string; dy?: number }[]> = {
  hungry: [
    { t: 6, id: 'kathys-cupcakes', dy: 0.2 },
    { t: 29, id: 'post-office' },
  ],
  errands: [
    { t: 66, id: 'post-office' },
    { t: 17, id: 'main-street-pharmacy' },
  ],
  walking: [
    { t: 4, id: 'grace-theater' },
    { t: 50, id: 'atlas-books' },
  ],
};

if (probes) {
  for (const pr of PROBES[scenario] ?? []) {
    await open(scenario);
    const r = (await p.evaluate(`(async () => {
      const id = ${JSON.stringify(pr.id)};
      const walk = window.__app.walk; walk.paused = true; walk.seek(${pr.t});
      const sim = walk.sim; const o = walk.overlay;
      const aim = () => { const a = sim.anchorOf(id); const e = sim.wearer.pos; walk.look(Math.atan2(-(a.x - e.x), -(a.z - e.z)) - sim.wearer.bodyYaw, Math.atan2(a.y - ${pr.dy ?? 1.6} - e.y, Math.hypot(a.x - e.x, a.z - e.z))); };
      aim(); walk.lookedAt = -Infinity;
      const t0 = walk.t; let on = null, glance = null, card = null, pre = null; const targets = []; let lastT; let band = null;
      const shown = (lv) => { const it = o.items.get(id); if (!it || !it.cur || it.cur.level !== lv || it.cur.opacity < 0.9) return false; const k = it.cur.view.kids[0]; return k && Number(getComputedStyle(k).opacity) >= 0.5; };
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
    if (${nolookup}) sim.reviewer.lookUps = [];
    const vp = { w: innerWidth, h: innerHeight };
    const m = { frames: 0, paneFrames: 0, farFrames: 0, worstFar: 0, worstFarAt: null, roadFrames: 0, worstRoad: 0, worstRoadAt: null, keepW: 0, keepH: 0, pipsMax: 0, pipsAt: null, hiddenPromotes: [], per: {}, snoozes: 0, outFrames: 0, outAt: [], chromeFrames: 0, chromeAt: [], scaleLast: {}, scaleAt: {} };
    let lastTick = -1;
    const overlap = (a, r) => Math.max(0, Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x)) * Math.max(0, Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y));
    while (walk.t < walk.duration - 0.02 && !walk.ended) {
      const ai = sim.reviewer.aim(sim.t, sim.wearer.pos, sim.wearer.bodyYaw, sim.anchorOf, sim.wearer.state === 'crossing');
      if (${wander}) walk.look(0.6 * Math.sin(sim.t * 0.5), 0.35 + 0.35 * Math.sin(sim.t * 0.37));
      else walk.look(ai.yaw - sim.wearer.bodyYaw, ai.pitch);
      const prevT = sim.t;
      walk.seek(walk.t + 1 / 60);
      const ev = sim.reviewer.eventsBetween(prevT, sim.t);
      if (Object.keys(ev).length) walk.queue(ev);
      m.frames++;
      const kos = walk.bridge.keepOuts();
      const road = kos.filter((k) => k.kind === 'roadway');
      for (const k of kos) { m.keepW = Math.max(m.keepW, k.rect.w / vp.w); m.keepH = Math.max(m.keepH, k.rect.h / vp.h); }
      let lit = 0; const litIds = [];
      for (const it of o.items.values()) {
        if (it.kind === 'world' && it.lights && !it.dying && it.L.pip > 0.5) {
          const a = walk.bridge.anchor(it.d.placement.anchor); const pr = a && walk.bridge.project(a);
          if (pr && pr.inFront && pr.x > 0 && pr.x < vp.w && pr.y > 0 && pr.y < vp.h) { lit++; litIds.push(it.id + ':' + it.d.level); }
        }
        const c = it.cur;
        if (it.kind !== 'world' || !c || !c.rect || c.opacity < 0.5 || it.want === 'none') continue;
        const k0 = c.view.kids[0]; if (!k0 || Number(getComputedStyle(k0).opacity) < 0.5) continue;
        const a = walk.bridge.anchor(it.d.placement.anchor); if (!a) continue;
        const pr = walk.bridge.project(a); if (!pr.inFront || pr.x < 0 || pr.x > vp.w || pr.y < 0 || pr.y > vp.h) continue;
        m.paneFrames++;
        m.per[it.id] = (m.per[it.id] || 0) + 1;
        const r = c.rect;
        const dx = Math.max(r.x - pr.x, 0, pr.x - (r.x + r.w)); const dy = Math.max(r.y - pr.y, 0, pr.y - (r.y + r.h));
        const ratio = Math.hypot(dx, dy) / r.w;
        if (ratio > 1) { m.farFrames++; if (ratio > m.worstFar) { m.worstFar = ratio; m.worstFarAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
        let ov = 0; for (const k of road) ov += overlap(r, k.rect);
        if (ov > 1) { m.roadFrames++; const f = ov / (r.w * r.h); if (f > m.worstRoad) { m.worstRoad = f; m.worstRoadAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
      }
      const chromeRects = [];
      for (const el of window.__app.chrome.el.children) {
        if (el.getAttribute('role') === 'alert' || /PAUSED/.test(el.textContent || '') || getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) chromeRects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      if (Number(getComputedStyle(o.glyphEl).opacity) > 0.05) { const r = o.glyphEl.getBoundingClientRect(); if (r.width > 0) chromeRects.push({ x: r.left, y: r.top, w: r.width, h: r.height }); }
      for (const it of o.items.values()) {
        if (it.kind !== 'world') continue;
        for (const b of [it.cur, ...it.old]) {
          if (!b || !b.rect || b.opacity <= 0.2) continue;
          const r = b.rect;
          if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > vp.w + 0.5 || r.y + r.h > vp.h + 0.5) { m.outFrames++; if (m.outAt.length < 6) m.outAt.push([+walk.t.toFixed(2), it.id, b.level, Math.round(r.x), Math.round(r.y), +b.opacity.toFixed(2)]); }
          if (chromeRects.some((c) => overlap(r, c) > 1)) { m.chromeFrames++; if (m.chromeAt.length < 6) m.chromeAt.push([+walk.t.toFixed(2), it.id, b.level]); }
        }
        if (it.cur && it.cur.opacity > 0.2 && it.placed && it.placed.mode === 'pane') {
          const sc = it.placed.scale; const prev = m.scaleLast[it.id];
          if (prev !== undefined && Math.abs(sc - prev) > 0.002) (m.scaleAt[it.id] = m.scaleAt[it.id] || []).push(+walk.t.toFixed(3));
          m.scaleLast[it.id] = sc;
        }
      }
      if (!sim.gaze.target && lit > m.pipsMax) { m.pipsMax = lit; m.pipsAt = +walk.t.toFixed(2); m.pipsIds = litIds; }
      const last = walk.last();
      if (last && last.frame.t !== lastTick) {
        lastTick = last.frame.t;
        if (last.frame.gate.snooze && !m.wasSnoozed) m.snoozes++;
        m.wasSnoozed = last.frame.gate.snooze;
        for (const d of last.frame.events) {
          if (d.action !== 'promote' || d.placement.zone !== 'world') continue;
          const it = o.items.get(d.id);
          if (!it || it.want === 'none' || !it.cur || it.cur.opacity < 0.3) m.hiddenPromotes.push([+last.frame.t.toFixed(1), d.id, d.level]);
        }
      }
    }
    return { m, log: walk.overlayLog, t: walk.t };
  })()`)) as {
    m: { frames: number; paneFrames: number; farFrames: number; worstFar: number; worstFarAt: unknown; roadFrames: number; worstRoad: number; worstRoadAt: unknown; keepW: number; keepH: number; pipsMax: number; pipsAt: number | null; hiddenPromotes: unknown[]; per: Record<string, number>; snoozes: number };
    log: { t: number; id: string; kind: string; level: string; from?: string; cause: string; detail?: string }[];
    t: number;
  };
  const { m, log } = out;
  const only = arg('id');
  if (only) for (const e of log) if (e.id === only) console.log(`  ${e.t.toFixed(2)} ${e.kind} ${e.from ?? ''}>${e.level} ${e.cause} ${e.detail ?? ''}`);
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
      const world = e.kind === 'drop' || (e.kind === 'hide' && /not looked at/.test(e.detail ?? '')) || (e.kind === 'return' && /looked at again|offscreen|view edge/.test(e.detail ?? '')) || (e.kind === 'hide' && e.cause === 'collapse' && e.level === 'none') || (e.kind === 'return' && e.cause === 'return' && /keepout/.test(e.detail ?? ''));
      list.push({ t: e.t, exempt: climb || world || EXEMPT.test(`${e.cause} ${e.detail ?? ''}`) || e.kind === 'death' || e.kind === 'edge' });
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
  console.log(`  level changes inside 2.5 s (not gate, dismiss, look-away, dwell climb, right of way): ${fast.length}${fast.length ? `  ${fast.slice(0, 6).join('; ')}` : ''}`);
  console.log(`  most births per item per life: ${maxBirths} (${maxBirthsAt})`);
  console.log(`  pane edge farther than 1.0 x its width from its pip (pip in view): ${m.farFrames} of ${m.paneFrames} pane frames (${pct(m.farFrames, m.paneFrames)}), worst ${m.worstFar.toFixed(2)} x ${JSON.stringify(m.worstFarAt)}`);
  console.log(`  pane over the roadway: ${m.roadFrames} of ${m.paneFrames} pane frames (${pct(m.roadFrames, m.paneFrames)}), worst ${(100 * m.worstRoad).toFixed(1)}% of the pane ${JSON.stringify(m.worstRoadAt)}`);
  console.log(`  largest keep-out: ${(100 * m.keepW).toFixed(0)}% x ${(100 * m.keepH).toFixed(0)}% of the view`);
  console.log(`  most pips lit with no gaze: ${m.pipsMax}${m.pipsAt !== null ? ` at ${m.pipsAt} ${JSON.stringify((m as unknown as { pipsIds?: string[] }).pipsIds ?? [])}` : ''}`);
  if (process.argv.includes('--per')) console.log(`  pane frames per item: ${JSON.stringify(m.per)}`);
  console.log(`  snoozes started: ${m.snoozes}${nolookup ? ' (no deliberate look-ups)' : wander ? ' (wandering drag, pitch up to 0.7 rad)' : ''}`);
  const mm = m as unknown as { outFrames: number; outAt: unknown[]; chromeFrames: number; chromeAt: unknown[]; scaleAt: Record<string, number[]> };
  let scaleMax = 0;
  let scaleWorst = '';
  for (const [id, ts] of Object.entries(mm.scaleAt)) {
    for (let i = 0; i < ts.length; i++) {
      let n = 0;
      for (let j = i; j < ts.length && ts[j]! - ts[i]! < 2.5; j++) n++;
      if (n > scaleMax) {
        scaleMax = n;
        scaleWorst = `${id} from ${ts[i]!.toFixed(2)}`;
      }
    }
  }
  console.log(`  pane frames partly outside the view above 20% opacity: ${mm.outFrames}${mm.outFrames ? `  ${JSON.stringify(mm.outAt)}` : ''}`);
  console.log(`  pane frames overlapping chrome: ${mm.chromeFrames}${mm.chromeFrames ? `  ${JSON.stringify(mm.chromeAt)}` : ''}`);
  console.log(`  most scale changes per pane inside 2.5 s: ${scaleMax}${scaleMax ? ` (${scaleWorst})` : ''}`);
  console.log(`  promotions while the pane was not visible: ${m.hiddenPromotes.length}${m.hiddenPromotes.length ? `  ${JSON.stringify(m.hiddenPromotes.slice(0, 6))}` : ''}`);
}
console.log(`  console errors: ${errors.length}${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`);
await b.close();
await server?.close();
