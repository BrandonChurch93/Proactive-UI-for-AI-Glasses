import { PLACES } from '@lumen/shared';
import { arg, ensureServer, launch } from './lib/browser';

// Plays a live walk in real time with the mouse, the way a person aims: drag the view onto the next storefront
// the walk passes, let go, hold still until its card opens. Reports each aim and whether the card slipped away.
const base = arg('base', 'http://localhost:5199/')!;
const scenario = arg('scenario', 'hungry')!;
const until = Number(arg('until', '120'));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const shots = arg('shots');
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?scenario=${scenario}`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, {
  timeout: 120_000,
});

type State = {
  t: number;
  band: string;
  gate: boolean;
  target: string | null;
  dwell: number;
  body: number;
  head: { yaw: number; pitch: number };
  places: {
    id: string;
    d: number;
    yaw: number;
    pitch: number;
    level: string | null;
    inFront: boolean;
    x: number;
    y: number;
  }[];
};
const read = (): Promise<State> =>
  page.evaluate(`(() => {
    const walk = window.__app.walk; const sim = walk.sim; const f = walk.last() && walk.last().frame;
    const e = sim.wearer.pos;
    const places = ${JSON.stringify(PLACES.map((p) => p.id))}.map((id) => {
      const a = sim.anchorOf(id); const p = walk.bridge.project(a);
      const it = f && f.items.find((d) => d.id === id);
      return { id, d: Math.hypot(a.x - e.x, a.z - e.z), yaw: Math.atan2(-(a.x - e.x), -(a.z - e.z)), pitch: Math.atan2(a.y - e.y, Math.hypot(a.x - e.x, a.z - e.z)), level: it ? it.level : null, inFront: p.inFront, x: p.x, y: p.y };
    });
    return { t: walk.t, band: f ? f.band : 'stopped', gate: Boolean(f && f.gate.safety), target: sim.gaze.target, dwell: sim.gaze.dwellMs, body: sim.wearer.bodyYaw, head: { ...walk.head }, places };
  })()`) as Promise<State>;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const k = (2 * Math.PI) / 3 / w;

const why = (id: string): Promise<string> =>
  page.evaluate(`(() => {
    const walk = window.__app.walk; const f = walk.last().frame; const rep = walk.overlay.report();
    const it = f.items.find((d) => d.id === ${JSON.stringify(id)});
    const pane = rep.panes.find((p) => p.id === ${JSON.stringify(id)});
    return JSON.stringify({ level: it && it.level, cause: it && it.cause, mark: f.dwell.mark, earned: f.dwell.earned, pane, holds: walk.brain.log.entries.filter((e) => e.decision.id === ${JSON.stringify(id)}).slice(-3).map((e) => [e.t, e.decision.action, e.decision.level, e.decision.cause]) });
  })()`) as Promise<string>;

async function click(sel: string): Promise<boolean> {
  const el = await page.$(sel);
  if (!el) return false;
  await el.click();
  return true;
}

await page.waitForTimeout(1500);
if (scenario === 'hungry') {
  await page.waitForSelector('button:has-text("Hungry")', { timeout: 10_000 });
  await click('button:has-text("Hungry")');
  await page.waitForSelector('[data-gaze="pick:goldies-counter"]', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await click('[data-gaze="pick:goldies-counter"]');
}

const done = new Set<string>();
const report: string[] = [];
let slips = 0;
while (true) {
  const s = await read();
  if (s.t > until) break;
  const world = s.body + s.head.yaw;
  const next =
    s.gate || s.band === 'brisk'
      ? undefined
      : s.places
          .filter((p) => !done.has(p.id) && p.d < 40 && Math.abs(wrap(p.yaw - s.body)) < 1.9)
          .sort((a, b) => a.d - b.d)[0];
  if (!next) {
    await page.waitForTimeout(150);
    continue;
  }
  const dx = wrap(next.yaw - world) / k;
  const dy = (next.pitch - s.head.pitch) / k;
  const x0 = w / 2;
  const y0 = h * 0.86;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dx, y0 + dy, { steps: 18 });
  await page.mouse.up();
  const t0 = (await read()).t;
  let on: number | null = null;
  let card: number | null = null;
  let slip = '';
  let lastDwell = -1;
  let blocked = 0;
  let lastT = t0;
  while (true) {
    await page.waitForTimeout(50);
    const r = await read();
    const p = r.places.find((q) => q.id === next.id)!;
    if (on === null) {
      if (r.target === next.id) on = r.t - t0;
      else if (r.t - t0 > 1.5) {
        slip = `never held (on ${r.target}) ${await page.evaluate(`(() => { const w = window.__app.walk; const a = w.sim.anchorOf(${JSON.stringify(next.id)}); const p = w.bridge.project(a); return JSON.stringify({ raw: w.rawGaze(w.pick.cur), pick: w.pick, p: [Math.round(p.x), Math.round(p.y), p.inFront], turnedAgo: w.sim.t - w.turnedAt, pursuit: w.pursuit }); })()`)}`;
        break;
      }
      lastDwell = r.dwell;
      continue;
    }
    if (r.target !== next.id) slip = `lost to ${r.target} at ${(r.t - t0).toFixed(2)} s`;
    else if (r.dwell < lastDwell) slip = `dwell reset at ${(r.t - t0).toFixed(2)} s`;
    lastDwell = r.dwell;
    if (slip) break;
    if (p.level === 'card' || p.level === 'expanded') {
      card = r.t - t0;
      if (shots) await page.screenshot({ path: `${shots}/${next.id}.png` });
      break;
    }
    const hidden = (await why(next.id)).includes('"hiddenBy":"keepout"');
    if (hidden) blocked += r.t - lastT;
    lastT = r.t;
    if (r.band === 'brisk' || r.gate || r.t - t0 - blocked > 4 || r.t - t0 > 15) {
      slip =
        r.band === 'brisk'
          ? 'brisk before the card'
          : r.gate
            ? 'gate before the card'
            : r.t - t0 > 15
              ? 'held, the world in the way'
              : `no card in 4 s in sight ${await why(next.id)}`;
      break;
    }
  }
  done.add(next.id);
  const bodyMoved = (await read()).body - s.body;
  const line = `${slip && !/^(brisk|gate|held)/.test(slip) ? 'SLIP' : 'ok  '} ${next.id.padEnd(22)} t ${t0.toFixed(1)} at ${next.d.toFixed(1)} m (${s.band}), turn ${((wrap(next.yaw - world) * 180) / Math.PI).toFixed(0)} deg, held ${on?.toFixed(2) ?? '-'} s, card ${card?.toFixed(2) ?? '-'} s, body turned ${((bodyMoved * 180) / Math.PI).toFixed(1)} deg${blocked > 0.05 ? `, hidden by the world ${blocked.toFixed(1)} s` : ''} ${slip}`;
  if (line.startsWith('SLIP')) slips++;
  report.push(line);
  console.log(line);
}
console.log(`aimplay ${scenario} ${w} x ${h}: ${report.length} aims, ${slips} slipped`);
for (const e of errors) console.error('error', e);
await browser.close();
await server?.close();
