import { mkdirSync } from 'node:fs';
import { arg, ensureServer, launch, VIEWPORT } from './lib/browser';

const scenario = arg('scenario', 'hungry')!;
const times = (arg('times', '0') ?? '0')
  .split(',')
  .map(Number)
  .filter((t) => Number.isFinite(t));
const outDir = arg('out', `shots/${scenario}`)!;
const base = arg('base', 'http://localhost:5173')!;
const extra = arg('query', '')!;
const width = Number(arg('width', String(VIEWPORT.width)));
const height = Number(arg('height', String(VIEWPORT.height)));
mkdirSync(outDir, { recursive: true });

const first = times[0] ?? 0;
const url = `${base}/?scenario=${scenario}&still=1&t=${first}${extra ? `&${extra}` : ''}`;
const server = await ensureServer(url);
const browser = await launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__done === true, null, { timeout: 180_000 });
for (const t of times) {
  await page.evaluate(async (time) => {
    await window.__stepTo!(time);
  }, t);
  const file = `${outDir}/${scenario}-t${String(t).padStart(5, '0')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
await server?.close();
for (const e of errors) console.error('console error:', e);
process.exit(errors.length ? 2 : 0);
