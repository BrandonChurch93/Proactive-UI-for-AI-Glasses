import { ensureServer, launch } from './lib/browser';
const url = process.argv[2]!; const pts = JSON.parse(process.argv[3]!);
const server = await ensureServer(url); const b = await launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(url); await p.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
console.log(JSON.stringify(await p.evaluate((q) => window.__probe!(q), pts)));
await b.close(); await server?.close();
