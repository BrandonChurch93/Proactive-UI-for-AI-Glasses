import './styles/tokens.css';
import * as THREE from 'three';
import { isScenarioId } from '@lumen/shared';
import { Sim } from '@lumen/sim';
import { mountPlate } from './title/plate';
import { World } from './world/world';

declare global {
  interface Window {
    __probe?: (pts: [number, number][]) => number[][];
    __done?: boolean;
    __stepTo?: (t: number) => Promise<void>;
    __world?: World;
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
  let sim = new Sim(scenario, { viewport: { w: innerWidth, h: innerHeight } });
  const world = new World(canvas, sim, { still, quality: params.get('quality') === 'fast' ? 'fast' : 'high' });
  window.__world = world;
  world.core.resize(innerWidth, innerHeight);
  await document.fonts.ready;
  await world.load();
  if (params.get('nobloom') === '1') world.core.bloom.enabled = false;
  if (params.get('exposure')) world.core.renderer.toneMappingExposure = Number(params.get('exposure'));
  const stepTo = async (t: number): Promise<void> => {
    if (t < sim.t - 1e-6) {
      sim = new Sim(scenario, { viewport: { w: innerWidth, h: innerHeight } });
      world.setSim(sim);
    }
    const dt = 1 / 60;
    while (sim.t < t - 1e-6) {
      sim.step(dt);
      world.update(dt);
    }
    world.update(0);
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
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = 1 / 60;
    while (acc >= dt) {
      sim.step(dt);
      world.update(dt);
      acc -= dt;
    }
    world.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
