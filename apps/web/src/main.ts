import './styles/tokens.css';
import * as THREE from 'three';
import { isScenarioId } from '@lumen/shared';
import { Sim } from '@lumen/sim';
import { mountPlate } from './title/plate';
import { World } from './world/world';
import { Walk } from './walk';

declare global {
  interface Window {
    __probe?: (pts: [number, number][]) => number[][];
    __done?: boolean;
    __stepTo?: (t: number) => Promise<void>;
    __world?: World;
    __walk?: () => Walk;
    __stats?: () => { calls: number; triangles: number; textures: number; geometries: number };
  }
}

const params = new URLSearchParams(location.search);
const still = params.get('still') === '1';
const scenario = params.get('scenario');
const app = document.getElementById('app')!;

async function boot(): Promise<void> {
  if (!isScenarioId(scenario)) {
    mountPlate(app);
    if (still) {
      window.__stepTo = async () => {};
      await document.fonts.ready;
      window.__done = true;
    }
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  app.appendChild(canvas);
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none';
  app.appendChild(layer);
  const world = new World(canvas, new Sim(scenario, { viewport: { w: innerWidth, h: innerHeight } }), { still, quality: params.get('quality') === 'fast' ? 'fast' : 'high' });
  window.__world = world;
  world.core.resize(innerWidth, innerHeight);
  await document.fonts.ready;
  await world.load();
  if (params.get('nobloom') === '1') world.core.bloom.enabled = false;
  if (params.get('exposure')) world.core.renderer.toneMappingExposure = Number(params.get('exposure'));
  const reduced = params.get('reduced') === '1' ? true : undefined;
  const scripted = still || params.get('scripted') === '1';
  const make = (): Walk => {
    const w = new Walk(world, scenario, layer, { scripted, ...(reduced !== undefined ? { reducedMotion: reduced } : {}) });
    w.overlay.setFocusOutline(params.get('focus') === '1');
    return w;
  };
  let walk = make();
  window.__walk = () => walk;
  const stepTo = async (t: number): Promise<void> => {
    if (t < walk.sim.t - 1e-6) {
      walk.dispose();
      walk = make();
    }
    const dt = 1 / 60;
    while (walk.sim.t < t - 1e-6) walk.step(dt);
    world.render();
  };
  window.__stats = () => {
    const r = world.core.renderer;
    r.info.autoReset = false;
    r.info.reset();
    r.render(world.core.scene, world.core.camera);
    const out = { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, geometries: r.info.memory.geometries };
    r.info.autoReset = true;
    return out;
  };
  window.__probe = (pts) => {
    const r = world.core.renderer;
    const w = innerWidth;
    const h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType });
    r.setRenderTarget(rt);
    r.render(world.core.scene, world.core.camera);
    r.setRenderTarget(null);
    const out = pts.map(([x, y]) => {
      const px = new Float32Array(4);
      r.readRenderTargetPixels(rt, Math.round(x), Math.round(h - y), 1, 1, px);
      return Array.from(px.slice(0, 3)).map((v) => Math.round(v * 1000) / 1000);
    });
    rt.dispose();
    return out;
  };
  if (still) {
    window.__stepTo = stepTo;
    await stepTo(Number(params.get('t') ?? 0));
    window.__done = true;
    return;
  }
  addEventListener('resize', () => world.core.resize(innerWidth, innerHeight));
  let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  let headYaw = 0.22;
  let headPitch = 0.04;
  let paused = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, yaw: headYaw, pitch: headPitch, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 4) drag.moved = true;
    headYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, drag.yaw + (e.clientX - drag.x) * 0.0032));
    headPitch = Math.max(-0.6, Math.min(0.75, drag.pitch + (e.clientY - drag.y) * 0.0028));
  });
  const end = (): void => {
    if (drag && !drag.moved) walk.pinch();
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    walk.dismiss();
  });
  layer.addEventListener('pointerover', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-gaze]');
    const pane = (e.target as HTMLElement).closest<HTMLElement>('[data-pane]');
    walk.hoverId = row?.dataset.gaze ?? (pane && pane.dataset.zone === 'view' ? pane.dataset.pane! : null);
  });
  layer.addEventListener('pointerout', () => (walk.hoverId = null));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') walk.dismiss();
    else if (e.key === 'Enter') walk.pinch();
    else if (e.key === ' ') {
      paused = !paused;
      e.preventDefault();
    }
  });
  const forced = params.get('quality');
  let fpsFrames = 0;
  let fpsTime = 0;
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    const real = (now - last) / 1000;
    last = now;
    if (!forced && fpsTime < 4 && real < 0.5) {
      fpsTime += real;
      fpsFrames++;
      if (fpsTime >= 4 && fpsTime / fpsFrames > 1 / 45 && world.core.quality === 'high') {
        world.core.setQuality('fast');
        world.core.resize(innerWidth, innerHeight);
      }
    }
    if (!paused) {
      if (!walk.sim.scripted) {
        walk.sim.live.headYaw = walk.sim.wearer.bodyYaw + headYaw;
        walk.sim.live.headPitch = headPitch;
      }
      acc += Math.min(0.1, real);
      const dt = 1 / 60;
      while (acc >= dt) {
        walk.step(dt);
        acc -= dt;
      }
    }
    world.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
