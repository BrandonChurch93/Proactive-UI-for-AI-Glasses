import { mkdirSync } from 'node:fs';
import { arg, ensureServer, launch } from './lib/browser';

// Plays the Explore walk live in real time the way a wearer uses the menu: click the button, choose a category and
// a place, then walk to it with the map up, watching for the route, the map, Maya's banner and the arrival.
const base = arg('base', 'http://localhost:5199/')!;
const place = arg('place', 'big-bean')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const out = arg('shots');
if (out) mkdirSync(out, { recursive: true });
const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?scenario=walking`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
await page.waitForTimeout(1500);
const state = (): Promise<{ t: number; items: string[]; dest: string | null; band: string; arrived: boolean }> =>
  page.evaluate(`(() => { const w = window.__app.walk; const f = w.last().frame; const s = w.last().snap; return { t: w.t, items: f.items.filter((d) => d.placement.zone !== 'world').map((d) => d.id + ':' + d.level), dest: f.goal.destination ?? null, band: f.band, arrived: Boolean(s.goal.arrived) }; })()`) as Promise<{ t: number; items: string[]; dest: string | null; band: string; arrived: boolean }>;
const shot = async (name: string): Promise<void> => {
  if (out) await page.screenshot({ path: `${out}/${name}.png` });
};
const log: string[] = [];
const note = async (what: string): Promise<void> => {
  const s = await state();
  const line = `${s.t.toFixed(1).padStart(6)} ${what.padEnd(26)} band ${s.band.padEnd(7)} dest ${String(s.dest).padEnd(14)} ${s.items.join(' ')}`;
  log.push(line);
  console.log(line);
};
await note('start');
await page.click('[aria-label="Find a place"]');
await page.waitForSelector('[data-pane="menu"] [data-k="a:food"]', { timeout: 5000 });
await page.waitForTimeout(500);
await note('menu open');
await shot('menu-open');
const category = place === 'big-bean' || place === 'goldies-counter' || place === 'mega-burger' ? 'food' : 'things';
await page.click(`[data-pane="menu"] [data-k="a:${category}"]`);
await page.waitForSelector(`[data-gaze="pick:${place}"]`, { timeout: 5000 });
await page.waitForTimeout(500);
await note(`menu on ${category}`);
await shot('menu-category');
await page.click(`[data-gaze="pick:${place}"]`);
await page.waitForTimeout(800);
await note('place chosen');
await shot('chosen');
let sawMap = false;
let sawBanner = false;
let arrived = false;
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(500);
  const s = await state();
  if (!sawMap && s.items.some((x) => x.startsWith('map:'))) {
    sawMap = true;
    await note('map up');
  }
  if (!sawBanner && s.items.some((x) => x.startsWith('maya-lunch:'))) {
    sawBanner = true;
    await note("Maya's banner");
    await shot('banner');
  }
  if (!arrived && s.arrived) {
    arrived = true;
    await note('arrived');
    await page.waitForTimeout(1500);
    await shot('arrived');
    break;
  }
}
console.log(`menuplay: map ${sawMap ? 'yes' : 'NO'}, Maya's banner ${sawBanner ? 'yes' : 'NO'}, arrived ${arrived ? 'yes' : 'NO'}, console errors ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('error', e);
await browser.close();
await server?.close();
