import { arg, launch } from './lib/browser';

// Steps a scripted walk to each time and screenshots the gaze mark: tsx scripts/markshot.ts --scenario walking --times 5,9.05 --out dir
const sc = arg('scenario', 'walking')!;
const times = (arg('times', '5') ?? '5').split(',').map(Number);
const out = arg('out', 'shots')!;
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const b = await launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(`http://localhost:5199/?scenario=${sc}&scripted=1`);
await p.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 90000 });
await p.evaluate('document.fonts.ready');
await p.waitForTimeout(800);
for (const t of times) {
  const info = await p.evaluate(`(() => { const a = window.__app; a.walk.paused = true; a.walk.seek(${t}); a.updateMark(); a.walk.overlay.update(a.walk.t); window.__world.render(); const f = a.walk.last().frame; return JSON.stringify({ t: a.walk.t, target: f.dwell.target, mark: f.dwell.mark }); })()`);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${sc}-mark-${t}.png` });
  console.log(info);
}
await b.close();
