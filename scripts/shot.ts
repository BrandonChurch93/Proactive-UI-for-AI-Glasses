import { arg, ensureServer, launch, VIEWPORT } from './lib/browser';

const url = arg('url');
const out = arg('out', 'shot.png')!;
if (!url) {
  console.error('usage: pnpm shot --url "http://localhost:5173/?scenario=hungry&still=1&t=22" --out shot.png');
  process.exit(1);
}

const server = await ensureServer(url);
const browser = await launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__done === true, null, { timeout: 180_000 });
await page.screenshot({ path: out });
await browser.close();
await server?.close();
for (const e of errors) console.error('console error:', e);
console.log(out);
process.exit(errors.length ? 2 : 0);
