import { arg, ensureServer, launch } from './lib/browser';

const url = process.argv[2]!;
const expr = process.argv[3] ?? 'window.__info';
const server = await ensureServer(url);
const b = await launch();
const p = await b.newPage({ viewport: { width: Number(arg('w', '1280')), height: Number(arg('h', '800')) } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 300)));
await p.goto(url);
await p.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, { timeout: 120000 });
console.log(JSON.stringify(await p.evaluate(expr)));
await b.close();
await server?.close();
