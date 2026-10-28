import { mkdirSync } from 'node:fs';
import { PLACES } from '@lumen/shared';
import { arg, ensureServer, launch } from './lib/browser';

// Plays Explore live in real time and opens places the way a wearer would: choose each place from the menu, stand at
// its door, hold the look until the expanded view opens, move the pointer and then the viewfinder across the rows
// reading the action's label each time, choose the row named by --pick, then end the walk and read the end panel.
// tsx scripts/cardplay.ts --places grace-theater,atlas-books --pick grace-theater=8:00,atlas-books=7:00 --shots dir
const base = arg('base', 'http://localhost:5199/')!;
const list = arg('places', 'grace-theater,atlas-books')!.split(',');
const pick = new Map((arg('pick', 'grace-theater=8:00,atlas-books=7:00') ?? '').split(',').filter(Boolean).map((x) => x.split('=') as [string, string]));
const w = Number(arg('w', '1920'));
const h = Number(arg('h', '1080'));
const out = arg('shots');
const verbose = process.argv.includes('--verbose');
if (out) mkdirSync(out, { recursive: true });
const CATEGORY: Record<string, string> = { 'grace-theater': 'things', 'lucky-lanes': 'things', 'atlas-books': 'things', 'pocket-park': 'things', 'main-street-pharmacy': 'shops', 'corner-hardware': 'shops', 'post-office': 'shops', 'big-bean': 'food', 'goldies-counter': 'food', 'mega-burger': 'food', 'trattoria-da-lia': 'food', 'kathys-cupcakes': 'food', 'm4-stop': 'transit', '47th-st-station': 'transit' };

const server = await ensureServer(base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// The dev server reloads the page once after an eval run rewrites the report the inspector imports; let that pass first.
await page.goto(`${base}?scenario=walking`);
await page.waitForTimeout(8000);
await page.goto(`${base}?scenario=walking`);
await page.waitForFunction(() => Boolean((window as unknown as { __app?: { walk?: unknown } }).__app?.walk), null, { timeout: 120_000 });
await page.waitForTimeout(1200);

type State = { t: number; band: string; target: string | null; arrived: boolean; dest: string | null; glyph: string | null; body: number; head: { yaw: number; pitch: number }; level: Record<string, string | null> };
const read = (): Promise<State> =>
  page.evaluate(`(() => {
    const walk = window.__app.walk; const sim = walk.sim; const l = walk.last(); const f = l && l.frame;
    const level = {}; for (const id of ${JSON.stringify(PLACES.map((p) => p.id))}) { const it = f && f.items.find((d) => d.id === id); level[id] = it ? it.level : null; }
    return { t: walk.t, band: f ? f.band : 'stopped', target: sim.gaze.target, arrived: Boolean(l && l.snap.goal.arrived), dest: f ? (f.goal.destination ?? null) : null, glyph: f && f.glyph ? f.glyph.label : null, body: sim.wearer.bodyYaw, head: { ...walk.head }, level };
  })()`) as Promise<State>;
const toward = (anchor: string): Promise<{ yaw: number; pitch: number }> =>
  page.evaluate(`(() => { const sim = window.__app.walk.sim; const a = sim.anchorOf('${anchor}'); const e = sim.wearer.pos; return { yaw: Math.atan2(-(a.x - e.x), -(a.z - e.z)), pitch: Math.atan2(a.y - e.y, Math.hypot(a.x - e.x, a.z - e.z)) }; })()`) as Promise<{ yaw: number; pitch: number }>;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const k = (2 * Math.PI) / 3 / w;
const log = (s: string): void => console.log(s);
const shot = async (name: string): Promise<void> => {
  if (out) await page.screenshot({ path: `${out}/${name}.png` });
};
const park = (): Promise<void> => page.mouse.move(w * 0.5, h - 4);

async function drag(dx: number, dy: number): Promise<void> {
  const x0 = w * 0.5;
  const y0 = h * 0.94;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(x0 + (dx * i) / 16, y0 + (dy * i) / 16);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await park();
}

async function aim(anchor: string): Promise<void> {
  let x = w / 2;
  let y = h * 0.94;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 18; i >= 1; i--) {
    const r = await read();
    const p = await toward(anchor);
    x += wrap(p.yaw - (r.body + r.head.yaw)) / k / i;
    y += (p.pitch - r.head.pitch) / k / i;
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
  await park();
}

async function until(test: (s: State) => boolean, seconds: number): Promise<State | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const s = await read();
    if (test(s)) return s;
    await page.waitForTimeout(100);
  }
  return null;
}

const pane = (id: string): string => `[data-pane="${id}"]`;
const label = (id: string): Promise<string | null> => page.evaluate(`document.querySelector('${pane(id)} button[data-follow]')?.textContent ?? null`) as Promise<string | null>;
const lifted = (id: string): Promise<string | null> => page.evaluate(`document.querySelector('${pane(id)} li[data-lift]')?.dataset.row ?? null`) as Promise<string | null>;
const rows = (id: string): Promise<{ row: string; x: number; y: number; top: number; bottom: number }[]> =>
  page.evaluate(`[...document.querySelectorAll('${pane(id)} li[data-row]')].map((li) => { const r = li.getBoundingClientRect(); return { row: li.dataset.row, x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })`) as Promise<{ row: string; x: number; y: number; top: number; bottom: number }[]>;
const shown = async (id: string, seconds = 3): Promise<boolean> => {
  for (let i = 0; i < seconds * 10; i++) {
    const ok = (await page.evaluate(`(() => { const r = window.__app.walk.overlay.report().panes.find((p) => p.id === '${id}'); return Boolean(r && r.visible && r.opacity > 0.9 && r.level === 'expanded'); })()`)) as boolean;
    if (ok) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

let failures = 0;
for (const id of list) {
  // The menu folds in Brisk by rule; a wearer opens it again once the walk eases.
  for (let tries = 0; tries < 6; tries++) {
    await until((s) => s.band !== 'brisk', 60);
    try {
      await page.click('[aria-label="Find a place"]', { timeout: 3000 });
      await page.waitForSelector(`[data-pane="menu"] [data-k="a:${CATEGORY[id]}"]`, { timeout: 3000 });
      await page.click(`[data-pane="menu"] [data-k="a:${CATEGORY[id]}"]`, { timeout: 3000 });
      await page.waitForSelector(`[data-gaze="pick:${id}"]`, { timeout: 3000 });
      await page.click(`[data-gaze="pick:${id}"]`, { timeout: 3000 });
      break;
    } catch {
      log(`  menu closed under the pointer (${(await read()).band}), again`);
      await page.keyboard.press('Escape');
    }
  }
  await park();
  const at = await until((s) => s.arrived && s.dest === id && s.band === 'stopped', 240);
  log(`${id}: ${at ? `at the door ${at.t.toFixed(1)} s` : 'NEVER ARRIVED'}`);
  if (!at) {
    failures++;
    continue;
  }
  await aim(`door:${id}`);
  const open = await until((s) => s.level[id] === 'expanded', 8);
  log(`  held the look at ${at.t.toFixed(1)} s, expanded ${open ? `at ${open.t.toFixed(1)} s (${open.band})` : 'NEVER'}`);
  if (!open) {
    failures++;
    continue;
  }
  for (let i = 0; i < (process.argv.includes('--trace') ? 16 : 0); i++) {
    log(`    ${(await page.evaluate(`(() => { const w = window.__app.walk; const o = w.overlay; const it = [...o.items.values()].find((x) => x.id === '${id}'); const r = o.report().panes.find((p) => p.id === '${id}'); const f = w.last().frame; const d = f.items.find((x) => x.id === '${id}'); const a = it && it.aside; return JSON.stringify([w.t.toFixed(2), f.band, w.sim.gaze.target, d && d.level, d && d.action, r && r.visible, r && r.hiddenBy, r && +r.opacity.toFixed(2), it && it.placed && it.placed.mode, it && it.placed && it.placed.why, a && a.dropped, a && a.by, it && it.want]); })()`)) as string}`);
    await page.waitForTimeout(120);
  }
  log(`  on the glass and clear: ${await shown(id)}`);
  for (let i = 0; i < 100; i++) {
    const settled = (await page.evaluate(`(() => { const o = window.__app.walk.overlay; const it = [...o.items.values()].find((x) => x.id === '${id}'); const r = o.report().panes.find((p) => p.id === '${id}'); return Boolean(r && r.visible && r.opacity > 0.98 && it && it.condensingUntil < o.t - 0.4 && it.cur && it.cur.view.el.querySelector('li')); })()`)) as boolean;
    if (settled) break;
    await page.waitForTimeout(100);
  }
  await shot(`${id}-expanded`);
  log(`  nothing lifted: ${await label(id)}`);
  for (const r0 of await rows(id)) {
    await shown(id, 1);
    const r = (await rows(id)).find((x) => x.row === r0.row) ?? r0;
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(200);
    log(`  pointer on ${r.row.padEnd(38)} lifted ${String(await lifted(id)).padEnd(38)} action ${await label(id)}`);
    if (r0.row === (await rows(id))[1]?.row) await shot(`${id}-pointer`);
  }
  const want = pick.get(id);
  if (want) {
    await shown(id, 2);
    // A place whose rows are not choices takes --pick <id>=primary: its one action, as it stands.
    const r = want === 'primary' ? { row: 'primary', x: w / 2, y: h - 4 } : (await rows(id)).find((x) => x.row === want);
    if (r) {
      await page.mouse.move(r.x, r.y);
      await page.waitForTimeout(200);
      const before = (await label(id)) ?? ((await page.evaluate(`document.querySelector('${pane(id)} button[data-k^="a:"]')?.textContent ?? null`)) as string | null);
      const box = (await page.evaluate(`(() => { const b = document.querySelector('${pane(id)} button[data-follow]') ?? document.querySelector('${pane(id)} button[data-k^="a:"]'); if (!b) return null; const q = b.getBoundingClientRect(); const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { x: q.left + q.width / 2, y: q.top + q.height / 2, top: e ? e.tagName + ' ' + (e.textContent ?? '').slice(0, 30) : 'none' }; })()`)) as { x: number; y: number; top: string } | null;
      if (verbose) log(`  button ${JSON.stringify(box)}`);
      if (box) await page.mouse.click(box.x, box.y);
      await park();
      await page.waitForTimeout(1300);
      const note = (await page.evaluate(`document.querySelector('${pane(id)} [data-k="note"]')?.textContent ?? null`)) as string | null;
      const left = (await page.evaluate(`[...document.querySelectorAll('${pane(id)} li')].map((li) => li.textContent)`)) as string[];
      const st = await read();
      log(`  chose ${want} with "${before}": "${note}" · ${left.length} row left · glyph ${st.glyph}`);
      await shot(`${id}-chosen`);
    }
  }
  await park();
  await page.waitForTimeout(300);
  for (const name of (await rows(id)).map((r) => r.row).reverse()) {
    await shown(id, 1);
    for (let i = 0; i < 3; i++) {
      const r = (await rows(id)).find((x) => x.row === name);
      if (!r || (r.top <= h / 2 && r.bottom >= h / 2)) break;
      await drag(w / 2 - r.x, h / 2 - r.y);
      await page.waitForTimeout(350);
    }
    const st = await read();
    const after = (await rows(id)).find((x) => x.row === name);
    const where = after ? `row ${Math.round(after.top)} to ${Math.round(after.bottom)} vs center ${h / 2}` : 'row gone';
    log(`  viewfinder to ${name.padEnd(36)} lifted ${String(await lifted(id)).padEnd(38)} action ${await label(id)} · look on ${st.target} · ${st.level[id]}${verbose ? ` · ${where}` : ''}`);
    if (name === (await rows(id))[1]?.row) await shot(`${id}-viewfinder`);
  }
  await drag(w * 0.3, 0);
  await page.waitForTimeout(1500);
}
await page.evaluate('window.__app.walk.end()');
await page.waitForTimeout(3000);
const end = (await page.evaluate('(() => { const a = window.__app; return { text: a.end.el.querySelector("p")?.textContent, decided: [...a.end.el.querySelectorAll("div > div:has(> i + b)")].map((d) => [...d.children].map((c) => c.textContent).join(" · ")) }; })()')) as { text: string; decided: string[] };
log(`end panel: ${end.text}`);
for (const d of end.decided) log(`  ${d}`);
await shot('end');
log(`cardplay: ${list.length} places, ${failures} failed, console errors ${errors.length}`);
for (const e of errors.slice(0, 5)) log(`error ${e}`);
await browser.close();
await server?.close();
