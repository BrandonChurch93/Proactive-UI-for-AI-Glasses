import { arg, ensureServer, launch } from './lib/browser';

// Plays a scripted walk frame by frame and summarizes its overlay log: counts by kind and cause, births per
// place, and every drop, hide, edge fold and move. --list prints every event.
const base = arg('base', 'http://localhost:5173/')!;
const scenario = arg('scenario', 'walking')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const list = process.argv.includes('--list');
const server = await ensureServer(base);
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await p.goto(`${base}?scenario=${scenario}&still=1&t=0`);
await p.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, { timeout: 120000 });
const log = (await p.evaluate(`(async () => {
  const walk = window.__app.walk;
  for (let t = 1; t <= walk.duration + 0.01; t += 1) { walk.seek(Math.min(t, walk.duration)); await new Promise(r => setTimeout(r, 0)); }
  return walk.overlayLog;
})()`)) as { t: number; id: string; kind: string; level: string; from?: string; cause: string; detail?: string; rect?: { x: number; y: number; w: number; h: number } }[];
const line = (e: (typeof log)[number]): string => {
  const r = e.rect ? `  [${Math.round(e.rect.x)},${Math.round(e.rect.y)} ${Math.round(e.rect.w)}x${Math.round(e.rect.h)}]` : '';
  return `${e.t.toFixed(2).padStart(6)}  ${e.kind.padEnd(6)} ${e.id.padEnd(24)} ${(e.from && e.from !== e.level ? `${e.from}>${e.level}` : e.level).padEnd(16)} ${e.cause}${e.detail ? ` · ${e.detail}` : ''}${r}`;
};
const count = new Map<string, number>();
for (const e of log) count.set(`${e.kind} ${e.cause}`, (count.get(`${e.kind} ${e.cause}`) ?? 0) + 1);
console.log(`${scenario} · ${log.length} events at ${w} x ${h}`);
for (const [k, n] of [...count].sort()) console.log(`  ${k.padEnd(24)} ${n}`);
const births = new Map<string, number>();
for (const e of log) if (e.kind === 'birth') births.set(e.id, (births.get(e.id) ?? 0) + 1);
console.log(`births per item: ${[...births].map(([id, n]) => `${id} ${n}`).join(', ')}`);
for (const e of log) if (list || ['drop', 'hide', 'edge', 'move', 'resize'].includes(e.kind)) console.log(line(e));
if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
await b.close();
await server?.close();
