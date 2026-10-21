import { arg, launch, VIEWPORT } from './lib/browser';

const url = arg('url', 'http://localhost:4173/?scenario=hungry')!;
const mbps = Number(arg('mbps', '50'));
const latency = Number(arg('latency', '30'));
const browser = await launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: (mbps * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8 });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit' });
await page.waitForFunction(() => {
  const app = (window as unknown as { __app?: { walk: { frames: { events: { level: string; action: string }[] }[] } } }).__app;
  return Boolean(app?.walk.frames.some((f) => f && f.events.some((d) => d.action === 'show' && d.level === 'pip')));
}, null, { timeout: 120_000, polling: 50 });
console.log(JSON.stringify({ mbps, latency, firstPipMs: Date.now() - t0 }));
await browser.close();
