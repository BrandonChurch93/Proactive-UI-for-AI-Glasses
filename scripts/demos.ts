import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEMOS, demoById, type Beat, type Demo, type DemoId } from '@lumen/shared';
import { arg, ensureServer, launch, waitQuiet } from './lib/browser';

// pnpm demos: plays each demo from its address bar form at 1920 x 1080, records a webm of it to .cache/demos, and judges it. Every
// beat landed, the gaze within 0.5 s of its time and a pinch, reply, go or choice with its effect within 0.5 s; the length within 2 s
// of the plan; no console errors; no world pane moving more than 6 px against the world from one sim step to the next, a pane changing
// size judged at the corner it grows from and a pane a head scan froze being the one exception (design-system 4, Steady); each film's moments
// happened; and it ends on the title screen. A contact sheet of a frame every 5 s goes to .cache/demos/<id>-sheet.jpg. --only look, --base, --keep to skip waiting.
const base = arg('base', 'http://localhost:5199/')!;
const only = arg('only');
const OUT = '.cache/demos';
const BEAT_S = 0.5;
// The reviewer's own damped turn over 60 degrees takes 0.6 s, and the look lands on the 10 Hz tick after it.
const GAZE_S = 0.7;
const LENGTH_S = 2;
const STEP_PX = 6;
const NEAR_PANE_PX = 300;

const recorder = `(() => {
  const rec = { first: null, last: null, steps: 0, pairs: 0, worst: 0, fails: [], dim: [], scans: 0, walk: null, far: 0, farFails: [] };
  window.__demoRec = rec;
  let installed = false;
  const cx = innerWidth / 2; const cy = innerHeight / 2;
  const prev = new Map();
  const sample = (walk) => {
    const o = walk.overlay;
    if (!o) return;
    const seen = new Map();
    for (const q of o.items.values()) {
      const c = q.cur;
      if (q.kind !== 'world' || q.dying || !c || !c.rect || c.level === 'none' || !q.placedPr) continue;
      const pz = q.placed || {};
      const fx = pz.fx !== undefined ? pz.fx : pz.align === 'left' ? 1 : pz.align === 'right' ? 0 : 0.5;
      const fy = pz.fy !== undefined ? pz.fy : pz.vertical === 'middle' ? 0.85 : pz.vertical === 'below' ? 0 : 1;
      const frozen = Boolean(q.frozen) || Boolean(q.yieldS && q.yieldS.on);
      const s = { x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h, lx: q.placedPr.x, ly: q.placedPr.y, o: c.opacity, lv: c.level, frozen };
      seen.set(q.id, s);
      if (frozen) rec.scans++;
      const a = prev.get(q.id);
      if (q.d.gaze && c.opacity < 0.6 && walk.sim.gaze.target === q.id) rec.dim.push(walk.t.toFixed(1) + ' ' + q.id);
      if (!a || a.o < 0.05 || c.opacity < 0.05 || frozen || a.frozen) continue;
      const dx = s.x + s.w * fx - s.lx - (a.x + a.w * fx - a.lx);
      const dy = s.y + s.h * fy - s.ly - (a.y + a.h * fy - a.ly);
      const d = Math.hypot(dx, dy);
      rec.pairs++;
      rec.worst = Math.max(rec.worst, d);
      const near = Math.hypot(Math.max(s.x - cx, 0, cx - (s.x + s.w)), Math.max(s.y - cy, 0, cy - (s.y + s.h))) <= ${NEAR_PANE_PX};
      if (!near) { rec.far = Math.max(rec.far, d); if (d > ${STEP_PX}) rec.farFails.push(q.id + ' ' + d.toFixed(1) + ' at ' + walk.t.toFixed(2) + ' x ' + s.x.toFixed(0) + ' ' + (pz.moved || '') + ' ' + (pz.why || '')); continue; }
      if (d > ${STEP_PX}) rec.fails.push(q.id + ' ' + d.toFixed(1) + ' px at ' + walk.t.toFixed(2) + ' ' + q.d.level + '/' + c.level + ' ' + (q.hold ? 'held' : q.ride ? 'ride' : pz.mode || '-') + ' op ' + c.opacity.toFixed(2) + ' glass ' + (s.x - a.x).toFixed(1) + ',' + (s.y - a.y).toFixed(1) + ' light ' + (s.lx - a.lx).toFixed(1) + ',' + (s.ly - a.ly).toFixed(1) + ' at x ' + s.x.toFixed(0) + ' w ' + s.w.toFixed(0) + (pz.moved ? ' moved:' + pz.moved : '') + (pz.why ? ' why:' + pz.why : ''));
    }
    prev.clear();
    for (const [k, v] of seen) prev.set(k, v);
  };
  const install = (walk) => {
    if (installed || !walk) return;
    installed = true;
    rec.walk = walk;
    const step = walk.step.bind(walk);
    walk.step = () => {
      const now = performance.timeOrigin + performance.now();
      rec.first ??= now;
      step();
      rec.steps++;
      if (!walk.ended) rec.last = now;
      sample(walk);
    };
  };
  let app;
  Object.defineProperty(window, '__app', { configurable: true, get: () => app, set: (v) => { app = v; install(v.walk); } });
})()`;

// One line per beat that did not land, judged from the walk's own log after the film has ended.
const judge = `(beats, moments) => {
  const w = window.__demoRec.walk;
  const out = [];
  const frames = w.frames;
  const snaps = w.snapshots;
  const within = (t, fn, span) => {
    for (let k = 0; k < snaps.length; k++) {
      const s = snaps[k]; const f = frames[k];
      if (!s || !f || s.t < t - 0.02 || s.t > t + span + 0.02) continue;
      if (fn(s, f)) return s.t;
    }
    return null;
  };
  for (const b of beats) {
    let at = null;
    const name = b.kind + ' ' + (b.id ?? b.sequence?.join(' ') ?? '') + ' at ' + b.t;
    if (b.kind === 'gaze' && b.id) at = within(b.t, (s) => s.wearer.gaze.target === b.id, ${GAZE_S});
    else if (b.kind === 'gaze') at = within(b.t, (s) => !s.wearer.gaze.target, ${GAZE_S});
    else if (b.kind === 'pinch') at = within(b.t, (s, f) => f.events.some((d) => d.action === 'save' && d.id === b.id), ${BEAT_S});
    else if (b.kind === 'reply') at = within(b.t, (s) => s.inbox.find((n) => n.id === b.id)?.thread?.some((l) => l.me), ${BEAT_S});
    else if (b.kind === 'go') at = within(b.t, (s, f) => f.goal.destination !== undefined, ${BEAT_S});
    else if (b.kind === 'choose') at = within(b.t, (s, f) => f.events.some((d) => d.id === b.id && d.cause === 'choice'), ${BEAT_S});
    else if (b.kind === 'headScan') at = within(b.t, (s) => s.wearer.curbDistance < 8 && Math.abs(s.wearer.gaze.yawRate) > 0.8, ${BEAT_S});
    else continue;
    if (b.kind === 'gaze' && b.id && at === null) out.push({ name, at: null, ok: false, late: within(b.t, (s) => s.wearer.gaze.target === b.id, 4) });
    else out.push({ name, at, ok: at !== null });
  }
  const e = (id, action, level, cause) => frames.some((f) => f && f.events.some((d) => d.id === id && d.action === action && (!level || d.level === level) && (!cause || d.cause === cause)));
  const seen = eval('(' + moments + ')');
  return { out, end: w.t, moments: Object.entries(seen).filter(([, ok]) => !ok).map(([k]) => k), count: Object.keys(seen).length };
}`;

// What each film is for, beyond its beats: the walking rules it shows, read from the brain's own log.
const MOMENTS: Record<DemoId, string> = {
  look: `{ 'a view of the theater': e('grace-theater', 'promote', 'expanded'), 'the pocket': e('trattoria-da-lia', 'save'), 'the pocket at the light': e('pocket', 'surface'), 'a yield': window.__demoRec.scans > 0 }`,
  lunch: `{ 'the route': e('route', 'show', 'glance', 'reply'), 'the view at the door': e('big-bean', 'promote', 'expanded'), 'the order': e('big-bean', 'promote', 'expanded', 'choice') }`,
  quiet: `{ 'the whisper': e('whisper', 'show'), 'the bus, rule 8': window.__demoRec.walk.overlayLog.some((x) => x.kind === 'aside' && (x.detail ?? '').includes('m4-bus')), 'the gate': frames.some((f) => f && f.gate.safety), 'the pocket at the light': e('pocket', 'surface'), 'the inspector': window.__demoRec.inspected }`,
};

async function play(browser: Awaited<ReturnType<typeof launch>>, d: Demo): Promise<boolean> {
  const dir = join(OUT, `${d.id}-raw`);
  rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(recorder);
  await page.goto(`${base}?demo=${d.id}`);
  await page.waitForFunction(`Boolean(window.__demoRec?.first)`, null, { timeout: 180_000 });
  if (d.inspectorAt !== undefined) {
    await page.waitForFunction(`window.__demoRec.walk.t >= ${d.inspectorAt + 4}`, null, { timeout: (d.to - d.from + 60) * 1000, polling: 100 });
    await page.screenshot({ path: join(OUT, `${d.id}-inspector.jpg`), type: 'jpeg', quality: 85 });
    await page.evaluate(`window.__demoRec.inspected = window.__app.inspector.isOpen && !window.__app.walk.paused`);
  }
  await page.waitForFunction(`window.__demoRec.walk.ended`, null, { timeout: (d.to - d.from + 60) * 1000, polling: 200 });
  const titled = await page
    .waitForFunction(`window.__app.title.visible && window.__app.walk !== window.__demoRec.walk`, null, { timeout: 8000, polling: 100 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(1200);
  const beats: Beat[] = d.reviewer.filter((b) => b.kind !== 'intent');
  const result = (await page.evaluate(`(${judge})(${JSON.stringify(beats)}, ${JSON.stringify(MOMENTS[d.id])})`)) as { out: { name: string; at: number | null; ok: boolean; late?: number | null }[]; end: number; moments: string[]; count: number };
  const rec = (await page.evaluate(`(() => { const r = window.__demoRec; const { walk, ...rest } = r; return rest; })()`)) as { first: number; last: number; steps: number; pairs: number; worst: number; fails: string[]; dim: string[]; scans: number; far: number; farFails: string[] };
  const closedAt = Date.now();
  await context.close();
  const video = readdirSync(dir).find((f) => f.endsWith('.webm'));
  const webm = join(OUT, `${d.id}.webm`);
  if (video) renameSync(join(dir, video), webm);
  rmSync(dir, { recursive: true, force: true });
  const lengthWall = (rec.last - rec.first) / 1000;
  const lengthSim = result.end - d.from;
  const missed = result.out.filter((b) => !b.ok);
  const ok = errors.length === 0 && missed.length === 0 && result.moments.length === 0 && Math.abs(lengthWall - d.lengthS) <= LENGTH_S && Math.abs(lengthSim - d.lengthS) <= LENGTH_S && rec.fails.length === 0 && titled;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${d.id}: ${result.out.length - missed.length} of ${result.out.length} beats, ${result.count - result.moments.length} of ${result.count} moments · ${lengthWall.toFixed(1)} s by the clock, ${lengthSim.toFixed(1)} s of walk, planned ${d.lengthS} s · ${errors.length} console errors · ${rec.pairs} step pairs, worst ${rec.worst.toFixed(1)} px, ${rec.fails.length} over ${STEP_PX} · ${titled ? 'title' : 'NO TITLE'} after the fade`);
  for (const m of result.moments) console.log(`  never happened: ${m}`);
  for (const b of missed) console.log(`  missed: ${b.name}${b.late ? `, landed at ${b.late}` : ''}`);
  for (const f of rec.fails.slice(0, Number(arg('fails', '12')))) console.log(`  moved: ${f}`);
  for (const f of rec.farFails.slice(0, Number(arg('fails', '12')))) console.log(`  far: ${f}`);
  for (const e of errors.slice(0, 6)) console.log(`  error: ${e}`);
  console.log(`  far from the center, worst ${rec.far.toFixed(1)} px`);
  if (rec.dim.length) console.log(`  the looked-at pane under 60%: ${rec.dim[0]} to ${rec.dim[rec.dim.length - 1]} (${rec.dim.length} steps)`);
  if (video) sheet(d, webm, duration(webm) - (closedAt - rec.first) / 1000);
  return ok;
}

// The video starts with the first paint, not with the page: the film is found from the end of the video, which is known.
function duration(webm: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
}

function sheet(d: Demo, webm: string, offset: number): void {
  const count = Math.floor((d.to - d.from) / 5) + 1;
  const out = join(OUT, `${d.id}-sheet.jpg`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', Math.max(0, offset).toFixed(2), '-i', webm, '-vf', `fps=1/5,scale=640:-1,tile=3x${Math.ceil(count / 3)}:padding=2`, '-frames:v', '1', '-q:v', '3', out]);
}

if (only && !demoById(only)) throw new Error('usage: pnpm demos [--only look|lunch|quiet]');
if (!process.argv.includes('--keep')) await waitQuiet(20);
mkdirSync(OUT, { recursive: true });
const server = await ensureServer(base);
const browser = await launch();
let pass = true;
for (const d of DEMOS) if (!only || d.id === only) pass = (await play(browser, d)) && pass;
await browser.close();
await server?.close();
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
