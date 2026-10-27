import { mkdirSync } from 'node:fs';
import { arg, ensureServer, launch } from './lib/browser';

const DEVICES: { name: string; w: number; h: number; dpr: number; touch: boolean }[] = [
  { name: 'phone-portrait', w: 390, h: 844, dpr: 3, touch: true },
  { name: 'phone-landscape', w: 844, h: 390, dpr: 3, touch: true },
  { name: 'phone-se-landscape', w: 667, h: 375, dpr: 2, touch: true },
  { name: 'ipad-landscape', w: 1180, h: 820, dpr: 2, touch: true },
  { name: 'ipad-portrait', w: 820, h: 1180, dpr: 2, touch: true },
  { name: 'ipad-mini-portrait', w: 744, h: 1133, dpr: 2, touch: true },
  { name: 'ipad-mini-landscape', w: 1133, h: 744, dpr: 2, touch: true },
  { name: 'laptop', w: 1280, h: 800, dpr: 2, touch: false },
  { name: 'laptop-small', w: 1024, h: 768, dpr: 2, touch: false },
  { name: 'desktop', w: 1920, h: 1080, dpr: 1, touch: false },
  { name: 'ultrawide', w: 2560, h: 1080, dpr: 1, touch: false },
  { name: 'qhd', w: 2560, h: 1440, dpr: 1, touch: false },
  { name: 'uhd', w: 3840, h: 2160, dpr: 1, touch: false },
];

const base = arg('base', 'http://localhost:5173/')!;
const out = arg('out', 'shots/devices')!;
const only = arg('only');
const beats = (arg('beats', 'walking:14,hungry:62,hungry:3.5') ?? '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const server = await ensureServer(base);
const browser = await launch();
let failed = false;
for (const d of DEVICES) {
  if (only && !only.split(',').includes(d.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.touch && Math.min(d.w, d.h) < 600, hasTouch: d.touch });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  await page.goto(`${base}?still=1&t=6`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 180_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${d.name}-title.png` });
  for (const b of beats) {
    const [scenario, t] = b.split(':');
    await page.goto(`${base}?scenario=${scenario}&still=1&t=${t}`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 180_000 });
    await page.screenshot({ path: `${out}/${d.name}-${scenario}-${t}.png` });
  }
  console.log(`${d.name} ${d.w}x${d.h}${errors.length ? ` · ${errors.length} console messages: ${errors.slice(0, 3).join(' | ')}` : ' · clean'}`);
  if (errors.length) failed = true;
  await ctx.close();
}
await browser.close();
await server?.close();
process.exit(failed ? 2 : 0);
