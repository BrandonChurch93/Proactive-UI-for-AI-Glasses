import { mkdirSync } from 'node:fs';
import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import { arg, ensureServer } from './lib/browser';

const base = arg('base', 'http://localhost:5173/')!;
const out = arg('out', 'shots/engines')!;
mkdirSync(out, { recursive: true });
const server = await ensureServer(base);
const engines: [string, BrowserType, object][] = [
  ['chrome', chromium, { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }],
  ['webkit', webkit, {}],
  ['firefox', firefox, { firefoxUserPrefs: { 'webgl.force-enabled': true } }],
];
let failed = false;
for (const [name, type, opts] of engines) {
  const browser = await type.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  const stills = ['?still=1&t=6', '?scenario=walking&still=1&t=14', '?scenario=hungry&still=1&t=62'];
  for (const [i, q] of stills.entries()) {
    await page.goto(base + q);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 300_000 });
    await page.screenshot({ path: `${out}/${name}-${i}.png` });
  }
  await page.goto(`${base}?scenario=hungry`);
  await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 300_000 });
  await page.waitForTimeout(8000);
  const t = await page.evaluate('window.__app.walk.t');
  const webgl2 = await page.evaluate('Boolean(document.createElement("canvas").getContext("webgl2"))');
  console.log(`${name} · webgl2 ${webgl2} · live walk reached ${Number(t).toFixed(1)} s · ${errors.length ? `${errors.length} console messages: ${[...new Set(errors)].slice(0, 4).join(' | ')}` : 'clean'}`);
  if (errors.length) failed = true;
  await browser.close();
}
await server?.close();
process.exit(failed ? 2 : 0);
