import { arg, launch } from './lib/browser';

// Seeks a walk to its end and screenshots the end screen: tsx scripts/endshot.ts --scenario hungry --w 1920 --h 1080 --out file.png
const sc = arg('scenario', 'hungry')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const out = arg('out', 'end.png')!;
const base = arg('base', 'http://localhost:5199/')!;
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${base}?scenario=${sc}&scripted=1`);
await p.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 90000 });
await p.waitForTimeout(800);
await p.evaluate('(() => { const a = window.__app; a.walk.paused = true; a.walk.seek(a.walk.duration); a.walk.paused = false; })()');
await p.waitForTimeout(2600);
await p.screenshot({ path: out });
const info = await p.evaluate('(() => { const a = window.__app; return { end: a.end.visible, text: a.end.el.querySelector("p")?.textContent, decided: [...a.end.el.querySelectorAll("div > div > div")].map((d) => d.textContent).slice(0, 0), buttons: [...a.end.el.querySelectorAll("button")].map((x) => x.textContent) }; })()');
console.log(JSON.stringify(info));
for (const e of errors) console.error('pageerror', e);
await b.close();
