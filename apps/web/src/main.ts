import './styles/tokens.css';
import * as THREE from 'three';
import { isScenarioId } from '@lumen/shared';
import { Sim } from '@lumen/sim';
import { mountPlate } from './title/plate';
import { World } from './world/world';
import { App } from './app';
import { hasWebGL2, mountFallback, mountLost } from './fallback';
import { TOUCH } from './title/title';
import type { Walk } from './walk';

declare global {
  interface Window {
    __probe?: (pts: [number, number][]) => number[][];
    __done?: boolean;
    __stepTo?: (t: number) => Promise<void>;
    __world?: World;
    __walk?: () => Walk;
    __app?: App;
    __stats?: () => { calls: number; triangles: number; textures: number; geometries: number };
  }
}

const params = new URLSearchParams(location.search);
const still = params.get('still') === '1';
const scenario = params.get('scenario');
const root = document.getElementById('app')!;

async function boot(): Promise<void> {
  if (!hasWebGL2()) {
    mountFallback(root);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    mountLost(root);
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A city street seen through the glasses');
  root.appendChild(canvas);
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none';
  root.appendChild(layer);
  const ui = document.createElement('div');
  root.appendChild(ui);
  const plate = mountPlate(root);
  const first = isScenarioId(scenario) ? scenario : 'walking';
  const small = TOUCH && Math.max(innerWidth, innerHeight) < 1100;
  const quality = params.get('quality') === 'fast' || (!params.get('quality') && small) ? 'fast' : 'high';
  const world = new World(canvas, new Sim(first, { viewport: { w: innerWidth, h: innerHeight } }), { still, quality });
  window.__world = world;
  world.core.resize(innerWidth, innerHeight);
  await document.fonts.ready;
  await world.load();
  if (params.get('nobloom') === '1') world.core.bloom.enabled = false;
  if (params.get('exposure')) world.core.renderer.toneMappingExposure = Number(params.get('exposure'));
  const app = new App(
    world,
    canvas,
    layer,
    ui,
    {
      ...(params.get('reduced') === '1' ? { reducedMotion: true } : {}),
      focusOutline: params.get('focus') === '1',
      pace: params.get('pace') === '1',
      exact: still,
      scripted: still || params.get('scripted') === '1',
    },
    isScenarioId(scenario) ? scenario : null,
  );
  window.__app = app;
  if (params.get('chrome') === '0') app.chrome.el.style.display = 'none';
  window.__walk = () => app.walk;
  plate.remove();
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
    const cam = params.get('cam')?.split(',').map(Number);
    window.__stepTo = async (t: number) => {
      app.walk.seek(t);
      if (app.title.visible) app.title.skipToChoice();
      world.update(0);
      if (cam && cam.length === 5) {
        world.core.camera.position.set(cam[0]!, cam[1]!, -cam[2]!);
        world.core.camera.rotation.set(cam[4]!, cam[3]!, 0, 'YXZ');
        world.core.camera.updateMatrixWorld();
      }
      world.render();
    };
    await document.fonts.ready;
    await window.__stepTo(Number(params.get('t') ?? 0));
    window.__done = true;
    return;
  }
  addEventListener('resize', () => {
    world.core.resize(innerWidth, innerHeight);
    app.resize();
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
    acc += Math.min(0.1, real);
    const dt = 1 / 60;
    while (acc >= dt) {
      app.frame(dt);
      acc -= dt;
    }
    world.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
