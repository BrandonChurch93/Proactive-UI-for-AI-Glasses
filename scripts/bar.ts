import { WALK_SECONDS, isScenarioId } from '@lumen/shared';
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
const lapRun = process.argv.includes('--lap');
const end = Number(arg('until', lapRun ? '330' : String(isScenarioId(scenario) ? WALK_SECONDS[scenario] : 112)));
const shots = (arg('shots') ?? '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
const shotDir = arg('shotdir', '.')!;
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'log' && /^(far|hidden promote) /.test(m.text())) console.log(m.text());
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
    { t: 40, id: 'lucky-lanes' },
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
      const walk = window.__app.walk; walk.paused = true;
      if (walk.t > 0) walk.seek(0);
      const rv = walk.sim.reviewer;
      const evs = [...rv.choices.map((c) => ({ t: c.t, ev: { choice: { id: c.id, action: c.action } } })), ...rv.pinches.map((x) => ({ t: x.t, ev: { pinch: x.id } }))].filter((e) => e.t < ${pr.t}).sort((a, b) => a.t - b.t);
      for (const e of evs) { walk.seek(e.t); walk.queue(e.ev); }
      walk.seek(${pr.t});
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
        if (glance === null && (shown('label') || shown('glance') || shown('card') || shown('expanded'))) glance = dt - on;
        if (card === null && (shown('card') || shown('expanded'))) card = dt - on;
        if (${process.argv.includes('--aside')}) { const it = o.items.get(id); if (it && it.cur && Math.round(dt * 60) % 6 === 0) console.log('far aside', dt.toFixed(2), it.cur.level, it.cur.opacity.toFixed(2), it.aside ? it.aside.by || '-' : '-', it.hold ? (it.hold.pull ? 'pull' : 'hold') : ''); }
      }
      const dec = walk.brain.log.entries.filter((e) => e.decision.id === id && e.t >= t0 - 0.05).slice(0, 6).map((e) => [+(e.t - t0).toFixed(2), e.decision.action, e.decision.level, e.decision.cause]);
      if (${process.argv.includes('--why')}) console.log(JSON.stringify(dec));
      return { glance, card, targets, band, on, pre, dec };
    })()`)) as { glance: number | null; card: number | null; targets: [number, string | null][]; band: string; on: number | null; pre: string | null };
    const late = r.on === null ? r.targets.length : r.targets.filter(([t]) => t > r.on! + 0.25).length;
    if (process.argv.includes('--why')) console.log(JSON.stringify((r as unknown as { dec: unknown }).dec));
    console.log(`probe ${scenario} t ${pr.t} ${pr.id} (${r.band}): on target after ${r.on?.toFixed(2) ?? 'never'} s${r.pre ? `, already a ${r.pre}` : ''}; glance ${r.glance?.toFixed(2) ?? 'none'} s, card ${r.card?.toFixed(2) ?? 'none'} s after; gaze changes after the first 250 ms on target ${late}  targets ${JSON.stringify(r.targets)}`);
  }
} else {
  await open(scenario);
  await p.evaluate(`(() => {
    const walk = window.__app.walk; walk.paused = true;
    if (walk.t > 0) walk.seek(0);
    const sim = walk.sim; const o = walk.overlay;
    if (${nolookup}) sim.reviewer.lookUps = [];
    const lap = { laps: 0, pauses: [], stillFrom: null, crossBirths: [], crossFrames: 0, routes: [], destAt: null, dest: null, corners: [], cornerFrom: null };
    const vp = { w: innerWidth, h: innerHeight };
    const m = { frames: 0, paneFrames: 0, farFrames: 0, worstFar: 0, worstFarAt: null, roadFrames: 0, roadHeld: 0, worstRoad: 0, worstRoadAt: null, keepW: 0, keepH: 0, pipsMax: 0, pipsAt: null, hiddenPromotes: [], per: {}, snoozes: 0, outFrames: 0, outAt: [], chromeFrames: 0, chromeAt: [], scaleLast: {}, scaleAt: {}, levels: {} };
    let lastTick = -1;
    const overlap = (a, r) => Math.max(0, Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x)) * Math.max(0, Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y));
    const birthsBefore = () => walk.overlayLog.length;
    window.__bar = { m, lap };
    window.__bar.step = (until) => {
    while (walk.t < until - 0.02 && !walk.ended) {
      const ai = sim.reviewer.aim(sim.t, sim.wearer.pos, sim.wearer.bodyYaw, sim.anchorOf, sim.wearer.state === 'crossing');
      const body = sim.wearer.bodyYaw;
      const want = ${lapRun} ? { yaw: body + 0.22, pitch: 0.04 } : ${wander} ? { yaw: body + 0.6 * Math.sin(sim.t * 0.5), pitch: 0.35 + 0.35 * Math.sin(sim.t * 0.37) } : ai;
      // The live head has no weight, so the person dragging it is the spring the sim used to be (omega 11).
      const hs = (window.__bar.head ??= { yaw: body + walk.head.yaw, pitch: walk.head.pitch, vy: 0, vp: 0 });
      const ty = hs.yaw + Math.atan2(Math.sin(want.yaw - hs.yaw), Math.cos(want.yaw - hs.yaw));
      hs.vy += (121 * (ty - hs.yaw) - 22 * hs.vy) / 60; hs.yaw += hs.vy / 60;
      hs.vp += (121 * (want.pitch - hs.pitch) - 22 * hs.vp) / 60; hs.pitch += hs.vp / 60;
      walk.look(hs.yaw - body, hs.pitch);
      const prevT = sim.t;
      const logFrom = birthsBefore();
      walk.seek(walk.t + 1 / 60);
      if (!${lapRun}) {
        const ev = sim.reviewer.eventsBetween(prevT, sim.t);
        if (Object.keys(ev).length) walk.queue(ev);
      }
      m.frames++;
      { const lf = walk.last(); if (lf) { const g = lf.frame.gate.safety; if (g) m.gateFrames = (m.gateFrames || 0) + 1; const up = o.quietOn && Boolean(o.quietEl.textContent); if (up !== g) { m.quietBad = (m.quietBad || 0) + 1; if (!m.quietAt) m.quietAt = [+walk.t.toFixed(2), g, up]; } } }
      const w = sim.wearer;
      const crossing = w.state === 'crossing';
      if (crossing) {
        for (const e of walk.overlayLog.slice(logFrom)) if (e.kind === 'birth' && e.level !== 'pip') lap.crossBirths.push([+e.t.toFixed(2), e.id, e.level]);
      }
      const cw = walk.last()?.snap.env.crosswalk;
      const atLight = cw && cw.distance < 0.6 && cw.signal !== 'walk';
      const explained = crossing || sim.holding || atLight || w.arrivedAt !== null;
      if (w.speed < 0.05 && !explained) lap.stillFrom ??= sim.t;
      else {
        if (lap.stillFrom !== null && sim.t - lap.stillFrom > 1) lap.pauses.push([+lap.stillFrom.toFixed(1), +(sim.t - lap.stillFrom).toFixed(1)]);
        lap.stillFrom = null;
      }
      lap.laps = sim.lap;
      if (sim.holding && w.speed < 0.05) {
        if (lap.cornerFrom === null) { lap.cornerFrom = sim.t; lap.corners.push([+sim.t.toFixed(2), null]); }
        const panel = o.items.get('intent');
        const open = lap.corners[lap.corners.length - 1];
        if (open[1] === null && panel && panel.cur && panel.cur.opacity >= 0.5) open[1] = +(sim.t - lap.cornerFrom).toFixed(2);
      } else if (!sim.holding) lap.cornerFrom = null;
      const goalDest = walk.last()?.frame.goal.destination ?? null;
      if (goalDest !== lap.dest) {
        lap.dest = goalDest;
        if (goalDest) { lap.destAt = sim.t; lap.routes.push([+sim.t.toFixed(2), goalDest, null]); }
      }
      const rv = o.route;
      const open = lap.routes.find((r) => r[2] === null && r[1] === goalDest);
      if (open && rv && rv.to === goalDest && rv.drawn.at(sim.t) >= 0.99 && rv.op.at(sim.t) >= 0.99) open[2] = +(sim.t - open[0]).toFixed(2);
      const kos = walk.bridge.keepOuts();
      const road = kos.filter((k) => k.kind === 'roadway');
      for (const k of kos) { m.keepW = Math.max(m.keepW, k.rect.w / vp.w); m.keepH = Math.max(m.keepH, k.rect.h / vp.h); }
      let lit = 0; const litIds = [];
      for (const it of o.items.values()) {
        if (it.kind === 'world' && it.lights && !it.dying && it.L.pip > 0.5 && it.d.level === 'pip') {
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
        const ratio = it.yieldS && it.yieldS.on ? 0 : Math.hypot(dx, dy) / r.w;
        if (ratio > 1) { m.farFrames++; if (ratio > m.worstFar) { m.worstFar = ratio; m.worstFarAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
        if (ratio > 1 && ${process.argv.includes('--far')}) console.log('far', walk.t.toFixed(3), it.id, JSON.stringify(r), Math.round(pr.x), Math.round(pr.y), c.opacity.toFixed(2), JSON.stringify(it.placed && { mode: it.placed.mode, moved: it.placed.moved }), it.aside ? JSON.stringify({ a: it.aside.active, by: it.aside.by }) : '');
        let ov = 0; for (const k of road) ov += overlap(r, k.rect);
        if (ov > 1) { m.roadFrames++; if (it.hold) m.roadHeld = (m.roadHeld || 0) + 1; const f = ov / (r.w * r.h); if (f > m.worstRoad) { m.worstRoad = f; m.worstRoadAt = [+walk.t.toFixed(2), it.id, it.cur.level]; } }
      }
      const chromeRects = [];
      for (const el of window.__app.chrome.el.children) {
        if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('role') === 'alert' || /PAUSED/.test(el.textContent || '') || getComputedStyle(el).display === 'none' || Number(getComputedStyle(el).opacity) < 0.05) continue;
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
          if (prev !== undefined && Math.abs(sc - prev) > 0.002) {
            (m.scaleAt[it.id] = m.scaleAt[it.id] || []).push(+walk.t.toFixed(3));
            if (${process.argv.includes('--far')}) console.log('far scale', walk.t.toFixed(3), it.id, prev.toFixed(3), sc.toFixed(3), JSON.stringify(it.placed.moved ?? null), it.d.level);
          }
          m.scaleLast[it.id] = sc;
        } else delete m.scaleLast[it.id];
      }
      if (!sim.gaze.target && lit > m.pipsMax) { m.pipsMax = lit; m.pipsAt = +walk.t.toFixed(2); m.pipsIds = litIds; }
      const last = walk.last();
      if (last && last.frame.t !== lastTick) {
        lastTick = last.frame.t;
        if (last.frame.gate.snooze && !m.wasSnoozed) m.snoozes++;
        m.wasSnoozed = last.frame.gate.snooze;
        for (const d of last.frame.events) {
          const before = m.levels[d.id];
          if (d.action !== 'hold') m.levels[d.id] = d.action === 'dismiss' ? 'none' : d.level;
          if (d.action !== 'promote' || d.placement.zone !== 'world' || before === d.level) continue;
          const it = o.items.get(d.id);
          if (!it || it.want === 'none' || !it.cur || it.cur.opacity < 0.3) {
            m.hiddenPromotes.push([+last.frame.t.toFixed(1), d.id, d.level]);
            if (${process.argv.includes('--why')}) console.log('hidden promote', walk.t.toFixed(2), d.id, d.level, d.cause, JSON.stringify(it && { want: it.want, op: it.cur && it.cur.opacity, mode: it.placed && it.placed.mode, why: it.why, dropped: it.aside.dropped }), JSON.stringify(walk.brain.log.entries.filter((e) => e.decision.id === d.id && e.t > walk.t - 4).map((e) => [e.t, e.decision.action, e.decision.level, e.decision.cause])), JSON.stringify(walk.overlayLog.filter((e) => e.id === d.id && e.t > walk.t - 4).map((e) => [e.t, e.kind, e.level, e.cause, e.detail])));
          }
        }
      }
    }
    };
  })()`);
  for (const at of [...shots.filter((x) => x < end), end]) {
    await p.evaluate(`window.__bar.step(${at})`);
    if (at === end) break;
    await p.evaluate('window.__app.world.render()');
    await p.screenshot({ path: `${shotDir}/${scenario}-live-${at}.png` });
  }
  const out = (await p.evaluate(`(() => { const walk = window.__app.walk; return { m: window.__bar.m, log: walk.overlayLog, t: walk.t, lap: window.__bar.lap }; })()`)) as {
    m: { frames: number; quietBad?: number; quietAt?: unknown; gateFrames?: number; paneFrames: number; farFrames: number; worstFar: number; worstFarAt: unknown; roadFrames: number; roadHeld?: number; worstRoad: number; worstRoadAt: unknown; keepW: number; keepH: number; pipsMax: number; pipsAt: number | null; hiddenPromotes: unknown[]; per: Record<string, number>; snoozes: number };
    log: { t: number; id: string; kind: string; level: string; from?: string; cause: string; detail?: string }[];
    t: number;
    lap: { laps: number; pauses: [number, number][]; crossBirths: unknown[]; routes: [number, string, number | null][]; corners: [number, number | null][] };
  };
  const { m, log } = out;
  const only = arg('id');
  const span = arg('span');
  if (span) {
    const [a, z] = span.split(',').map(Number);
    for (const e of log) if (e.t >= a! && e.t <= z!) console.log(`  ${e.t.toFixed(2)} ${e.id} ${e.kind} ${e.from ?? ''}>${e.level} ${e.cause} ${e.detail ?? ''}`);
  }
  if (only) for (const e of log) if (e.id === only) console.log(`  ${e.t.toFixed(2)} ${e.kind} ${e.from ?? ''}>${e.level} ${e.cause} ${e.detail ?? ''}`);
  const EXEMPT = /gate|safety|dismiss|look-away|band|choice/;
  const RANK: Record<string, number> = { none: 0, pip: 1, whisper: 1, label: 2, glance: 2, card: 3, expanded: 4 };
  const changes = new Map<string, { t: number; exempt: boolean }[]>();
  const births = new Map<string, number>();
  let maxBirths = 0;
  let maxBirthsAt = '';
  for (const e of log) {
    const levelChange = e.from !== undefined && e.from !== e.level;
    if (levelChange) {
      const list = changes.get(e.id) ?? [];
      const climb = /dwell|pinch|arrival/.test(e.detail ?? '') && (RANK[e.level] ?? 0) > (RANK[e.from!] ?? 0);
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
  console.log(`  pane over the roadway: ${m.roadFrames} of ${m.paneFrames} pane frames (${pct(m.roadFrames, m.paneFrames)}; the held pane, drawn in by the pull, ${m.roadHeld ?? 0} of them), worst ${(100 * m.worstRoad).toFixed(1)}% of the pane ${JSON.stringify(m.worstRoadAt)}`);
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
  const labelBirths = log.filter((e) => (e.kind === 'birth' || e.kind === 'return') && e.level === 'label').map((e) => e.t).sort((a, b) => a - b);
  let perSettle = 0;
  let perSettleAt = 0;
  for (let i = 0; i < labelBirths.length; i++) {
    let n = 0;
    for (let j = i; j < labelBirths.length && labelBirths[j]! - labelBirths[i]! < 0.5; j++) n++;
    if (n > perSettle) {
      perSettle = n;
      perSettleAt = labelBirths[i]!;
    }
  }
  if (process.argv.includes('--why')) console.log('settle window', JSON.stringify(log.filter((e) => (e.kind === 'birth' || e.kind === 'return') && e.level === 'label' && e.t >= perSettleAt - 1e-6 && e.t < perSettleAt + 0.5).map((e) => [e.t, e.id, e.kind, e.cause, e.detail])));
  const grows = log.filter((e) => e.kind === 'resize' && e.level === 'card' && e.from === 'label').map((e) => e.t);
  let swaps = 0;
  let swapsAt = 0;
  for (let i = 0; i < grows.length; i++) {
    let n = 0;
    for (let j = i; j < grows.length && grows[j]! - grows[i]! < 1; j++) n++;
    if (n > swaps) {
      swaps = n;
      swapsAt = grows[i]!;
    }
  }
  console.log(`  most labels born per settle (within 0.5 s): ${perSettle}${perSettle ? ` at ${perSettleAt.toFixed(2)}` : ''}`);
  console.log(`  most cards grown in any second: ${swaps}${swaps ? ` at ${swapsAt.toFixed(2)}` : ''}`);
  console.log(`  pane frames partly outside the view above 20% opacity: ${mm.outFrames}${mm.outFrames ? `  ${JSON.stringify(mm.outAt)}` : ''}`);
  console.log(`  pane frames overlapping chrome: ${mm.chromeFrames}${mm.chromeFrames ? `  ${JSON.stringify(mm.chromeAt)}` : ''}`);
  console.log(`  most scale changes per pane inside 2.5 s: ${scaleMax}${scaleMax ? ` (${scaleWorst})` : ''}`);
  console.log(`  promotions while the pane was not visible: ${m.hiddenPromotes.length}${m.hiddenPromotes.length ? `  ${JSON.stringify(m.hiddenPromotes.slice(0, 6))}` : ''}`);
  const L = out.lap;
  const slow = L.routes.filter((r) => r[2] === null || r[2] > 2);
  console.log(`  route drawn within 2 s of a choice or a Yes: ${L.routes.length - slow.length} of ${L.routes.length}${L.routes.length ? `  ${JSON.stringify(L.routes)}` : ''}`);
  console.log(`  panes born during a crossing: ${L.crossBirths.length}${L.crossBirths.length ? `  ${JSON.stringify(L.crossBirths.slice(0, 6))}` : ''}`);
  console.log(`  laps completed: ${L.laps}; stops longer than 1 s not at a light, a door or the corner: ${L.pauses.length}${L.pauses.length ? `  ${JSON.stringify(L.pauses.slice(0, 6))}` : ''}`);
  console.log(`  crossing line up on gate frames and on no other: ${m.quietBad ? `${m.quietBad} frames wrong, first ${JSON.stringify(m.quietAt)}` : `yes`} (${m.gateFrames ?? 0} gate frames)`);
}
console.log(`  console errors: ${errors.length}${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`);
await b.close();
await server?.close();
