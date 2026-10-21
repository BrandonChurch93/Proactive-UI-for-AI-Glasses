import { arg, ensureServer, launch, VIEWPORT } from './lib/browser';

// Steps, separated by ';;' (or ';' when no step contains one): wait:ms, shot:path, click:x,y, key:Name, drag:x0,y0,x1,y1, eval:expr, text:selector-text-to-click
const url = arg('url', 'http://localhost:5173/')!;
const raw = arg('steps', 'wait:5000;shot:play.png') ?? '';
const steps = (raw.includes(';;') ? raw.split(/\s*;;\s*/) : raw.split(';')).filter(Boolean);
const server = await ensureServer(url);
const browser = await launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, acceptDownloads: true });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 120_000 });
for (const s of steps) {
  const [kind, ...rest] = s.split(':');
  const v = rest.join(':');
  if (kind === 'wait') await page.waitForTimeout(Number(v));
  else if (kind === 'shot') await page.screenshot({ path: v });
  else if (kind === 'click') {
    const [x, y] = v.split(',').map(Number);
    await page.mouse.click(x!, y!);
  } else if (kind === 'key') await page.keyboard.press(v);
  else if (kind === 'drag') {
    const [x0, y0, x1, y1] = v.split(',').map(Number);
    await page.mouse.move(x0!, y0!);
    await page.mouse.down();
    await page.mouse.move(x1!, y1!, { steps: 24 });
    await page.mouse.up();
  } else if (kind === 'text') await page.getByText(v, { exact: true }).first().click();
  else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(v)));
  else if (kind === 'download') {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Export this run').click()]);
    await dl.saveAs(v);
    console.log('saved', v);
  }
}
await browser.close();
await server?.close();
for (const e of errors) console.error(e);
process.exit(errors.some((e) => !e.startsWith('warning')) ? 2 : 0);
