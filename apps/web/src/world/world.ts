import * as THREE from 'three';
import type { Sim } from '@lumen/sim';
import { buildBuildings } from './buildings';
import { loadMaterials, type MaterialLibrary } from './materials';
import { createRenderCore, followSun, type Quality, type RenderCore } from './render';
import { buildStreet } from './street';
import { buildStorefronts } from './storefront';
import { buildProps } from './props';
import { SignAtlas } from './signs';
import { buildRooftops } from './rooftops';
import { VehicleView } from './vehicles';
import { PeopleView } from './people';

export interface WorldOptions {
  still: boolean;
  quality: Quality;
}

export class World {
  readonly core: RenderCore;
  mats!: MaterialLibrary;
  private sim: Sim;
  private dynamic: { update(sim: Sim, dt: number, t: number): void }[] = [];
  private bobPhase = 0;
  private focus = new THREE.Vector3();
  private curb = 0.15;

  constructor(
    canvas: HTMLCanvasElement,
    sim: Sim,
    readonly opts: WorldOptions,
  ) {
    this.sim = sim;
    this.core = createRenderCore(canvas, { still: opts.still, quality: opts.quality });
  }

  async load(): Promise<void> {
    this.mats = await loadMaterials(this.core.renderer);
    const { scene } = this.core;
    scene.add(buildStreet(this.mats));
    const b = buildBuildings(this.sim.layout.lots, this.sim.layout.towers, this.mats);
    scene.add(b.group);
    const atlas = new SignAtlas();
    const sf = buildStorefronts(b.storefronts, this.mats, this.core.renderer, atlas);
    scene.add(sf.group);
    const props = buildProps(this.sim.layout, this.mats, this.core.renderer, this.sim.signal, atlas);
    scene.add(props.group);
    scene.add(buildRooftops(this.sim.layout.lots, this.mats, atlas));
    scene.add(atlas.build(this.core.renderer));
    this.dynamic.push({ update: (_s, _dt, t) => props.update(t) });
    const vehicles = new VehicleView(this.mats, this.core.renderer);
    const people = new PeopleView();
    await Promise.all([vehicles.load(), people.load()]);
    scene.add(vehicles.group, vehicles.parked(this.sim), people.group);
    this.dynamic.push({ update: (s) => vehicles.update(s) }, { update: (s, dt) => people.update(s, dt) });
  }

  addDynamic(d: { update(sim: Sim, dt: number, t: number): void }): void {
    this.dynamic.push(d);
  }

  setSim(sim: Sim): void {
    this.sim = sim;
  }

  update(dt: number): void {
    const sim = this.sim;
    const { camera } = this.core;
    const w = sim.wearer;
    const pace = Math.min(1, w.speed / 1.38);
    this.bobPhase += dt * 2.2 * Math.PI * 2 * Math.max(0.35, w.speed / 1.38) * 0.5;
    const bob = w.state === 'stopped' ? 0 : Math.sin(this.bobPhase * 2) * 0.012 * pace;
    const roll = w.state === 'stopped' ? 0 : Math.sin(this.bobPhase) * 0.002 * pace;
    const pose = sim.cameraPose();
    const n = -pose.pos.z;
    const ax = Math.abs(pose.pos.x);
    const curb = ax >= 7 && !(n > 90 && n < 104) ? 0.15 : 0;
    this.curb += (curb - this.curb) * Math.min(1, dt * 6 || 1);
    camera.position.set(pose.pos.x, pose.pos.y + bob + this.curb, pose.pos.z);
    camera.rotation.set(pose.pitch, pose.yaw, roll, 'YXZ');
    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
    this.focus.set(pose.pos.x, 0, pose.pos.z).addScaledVector(fwd, 38);
    followSun(this.core.sun, this.focus);
    for (const d of this.dynamic) d.update(sim, dt, sim.t);
    this.core.grade.uniforms['uTime']!.value = sim.t;
    this.core.sky.material.uniforms['time']!.value = sim.t;
  }

  render(): void {
    this.core.composer.render();
  }
}
