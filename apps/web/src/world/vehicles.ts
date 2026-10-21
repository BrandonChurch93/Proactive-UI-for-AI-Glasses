import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BodyKind, Sim, Vehicle } from '@lumen/sim';
import { floatAttributes, hash } from './geom';
import type { MaterialLibrary } from './materials';
import { signMaterial, signTexture } from './signs';

export const MODEL_FOR: Partial<Record<BodyKind, string[]>> = {
  sedan: ['sedan-a', 'sedan-b'],
  taxi: ['taxi'],
  suv: ['suv'],
  van: ['pickup'],
  truck: ['truck'],
};
const MODELS = ['sedan-a', 'sedan-b', 'taxi', 'suv', 'pickup', 'truck'];
const PAINTABLE = new Set(['sedan-a', 'sedan-b', 'suv']);
const CAPACITY = 72;

let loader: GLTFLoader | null = null;
export function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

interface Baked {
  body: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  wheels: THREE.Vector3[];
  length: number;
  textured?: THREE.Material;
}

function surface(name: string, color: THREE.Color, paint: boolean): { rough: number; metal: number } {
  if (/window/i.test(name)) return { rough: 0.06, metal: 0.85 };
  if (/light/i.test(name)) return { rough: 0.2, metal: 0.1 };
  if (/black|grey/i.test(name)) return { rough: 0.7, metal: 0.1 };
  if (paint) return { rough: 0.3, metal: 0.35 };
  return { rough: color.r + color.g + color.b > 2 ? 0.45 : 0.55, metal: 0.15 };
}

async function bake(name: string): Promise<Baked> {
  const g = await gltfLoader().loadAsync(`/assets/cars/${name}.glb`);
  const root = g.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let front = new THREE.Vector3(0, 0, 1);
  const parts: THREE.BufferGeometry[] = [];
  const wheelParts: { geo: THREE.BufferGeometry; box: THREE.Box3 }[] = [];
  let paintMat: THREE.Material | null = null;
  let textured: THREE.Material | undefined;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
    for (const mat of mats) {
      if (!paintMat && /^(blue|lightblue|white|yellow)$/i.test(mat.name)) paintMat = mat;
      if (/headlight/i.test(mat.name)) front = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      if (mat.map) textured = mat;
    }
  });
  const alongX = size.x > size.z;
  const dirSign = alongX ? Math.sign(front.x - center.x) || 1 : Math.sign(front.z - center.z) || 1;
  const yaw = Math.atan2(alongX ? dirSign : 0, alongX ? 0 : dirSign);
  const fix = new THREE.Matrix4().makeRotationY(Math.PI - yaw).multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = floatAttributes(m.geometry.clone());
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(fix, m.matrixWorld));
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.getAttribute('position').count, materialIndex: 0 }];
    const flat = floatAttributes(geo.index ? geo.toNonIndexed() : geo);
    const n = flat.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const paint = new Float32Array(n);
    const rough = new Float32Array(n);
    const metal = new Float32Array(n);
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] ?? mats[0]!;
      const c = mat.color ?? new THREE.Color(1, 1, 1);
      const isPaint = mat === paintMat && PAINTABLE.has(name);
      const sf = surface(mat.name, c, mat === paintMat);
      for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) {
        col[i * 3] = isPaint ? 1 : c.r;
        col[i * 3 + 1] = isPaint ? 1 : c.g;
        col[i * 3 + 2] = isPaint ? 1 : c.b;
        paint[i] = isPaint ? 1 : 0;
        rough[i] = sf.rough;
        metal[i] = sf.metal;
      }
    }
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flat.setAttribute('aPaint', new THREE.BufferAttribute(paint, 1));
    flat.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    flat.setAttribute('aMetal', new THREE.BufferAttribute(metal, 1));
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    flat.clearGroups();
    if (/wheel/i.test(m.name) || /wheel/i.test(m.parent?.name ?? '')) {
      flat.computeBoundingBox();
      wheelParts.push({ geo: flat, box: flat.boundingBox!.clone() });
    } else parts.push(flat);
  });
  const body = mergeGeometries(parts, false)!;
  const wheels: THREE.Vector3[] = [];
  let wheel: THREE.BufferGeometry | null = null;
  for (const w of wheelParts) {
    const c = w.box.getCenter(new THREE.Vector3());
    const s = w.box.getSize(new THREE.Vector3());
    if (s.x > s.z * 1.6 || s.x > 1.2) {
      wheels.push(new THREE.Vector3(w.box.min.x + s.z / 2, c.y, c.z), new THREE.Vector3(w.box.max.x - s.z / 2, c.y, c.z));
    } else {
      wheels.push(c);
      if (!wheel) {
        wheel = w.geo.clone();
        wheel.translate(-c.x, -c.y, -c.z);
      }
    }
  }
  if (!wheel) {
    wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16).rotateZ(Math.PI / 2).toNonIndexed();
    const n = wheel.getAttribute('position').count;
    wheel.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.04), 3));
    for (const k of ['aPaint', 'aRough', 'aMetal']) wheel.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n).fill(k === 'aRough' ? 0.8 : 0), 1));
  }
  const out: Baked = { body, wheel, wheels, length: alongX ? size.x : size.z };
  if (textured) out.textured = textured;
  return out;
}

function bodyMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPaint;
        attribute float aRough;
        attribute float aMetal;
        varying float vRough;
        varying float vMetal;`,
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
        vColor.rgb *= color;
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor.rgb, aPaint);
        #endif
        vRough = aRough;
        vMetal = aMetal;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;\nvarying float vMetal;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMetal;');
  };
  m.customProgramCacheKey = () => 'baked-vehicle';
  return m;
}

function buildBus(mats: MaterialLibrary, renderer: THREE.WebGLRenderer): THREE.Group {
  const g = new THREE.Group();
  const L = 12.2;
  const W = 2.55;
  const H = 3.0;
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.3 });
  const blueM = new THREE.MeshStandardMaterial({ color: 0x1d4f9a, roughness: 0.4, metalness: 0.3 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.6 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H - 0.35, L, 3, 0.18), paint);
  body.position.y = 0.35 + (H - 0.35) / 2;
  g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 1.15, L - 0.9), glassM);
  band.position.set(0, 2.05, -0.2);
  g.add(band);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 1.6, 0.04), glassM);
  windshield.position.set(0, 2.0, -L / 2 - 0.01);
  g.add(windshield);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.32, L - 0.4), blueM);
  stripe.position.set(0, 1.05, 0);
  g.add(stripe);
  const dest = signMaterial(signTexture({ text: 'M4  MADISON AV', bg: '#0b0b0b', fg: '#ffb43a', w: 1.9, h: 0.28, font: 'ui' }, renderer, 260), { emissive: 1.8 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.28), dest);
  sign.position.set(0, 2.92, -L / 2 - 0.03);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const wheelG = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18).rotateZ(Math.PI / 2);
  for (const z of [-L / 2 + 2.3, L / 2 - 2.6]) {
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) {
      const w = new THREE.Mesh(wheelG, mats.rubber);
      w.position.set(x, 0.5, z);
      w.name = 'wheel';
      g.add(w);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function buildBike(mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.4, metalness: 0.5 });
  const wheel = new THREE.TorusGeometry(0.34, 0.025, 6, 22).rotateY(Math.PI / 2);
  for (const z of [-0.52, 0.52]) {
    const w = new THREE.Mesh(wheel, mats.rubber);
    w.position.set(0, 0.36, z);
    w.name = 'wheel';
    g.add(w);
  }
  const tube = (a: THREE.Vector3, b: THREE.Vector3): void => {
    const d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, d.length(), 6), frame);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(m);
  };
  const bb = new THREE.Vector3(0, 0.36, 0.02);
  const seat = new THREE.Vector3(0, 0.95, 0.18);
  const head = new THREE.Vector3(0, 0.98, -0.42);
  tube(new THREE.Vector3(0, 0.36, 0.52), bb);
  tube(bb, seat);
  tube(bb, head);
  tube(seat, head);
  tube(head, new THREE.Vector3(0, 0.36, -0.52));
  tube(new THREE.Vector3(0, 0.36, 0.52), seat);
  const rider = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc69172, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), rider);
  torso.position.set(0, 1.32, 0.0);
  torso.rotation.x = -0.55;
  g.add(torso);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin);
  headM.position.set(0, 1.72, -0.22);
  g.add(headM);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), frame);
  helmet.position.set(0, 1.75, -0.22);
  g.add(helmet);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 3, 8), mats.metalDark);
    leg.position.set(s * 0.11, 0.72, 0.08);
    leg.rotation.x = 0.3 * s;
    leg.name = s > 0 ? 'legR' : 'legL';
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 3, 8), rider);
    arm.position.set(s * 0.2, 1.3, -0.25);
    arm.rotation.x = 1.1;
    g.add(arm);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

interface Batch {
  baked: Baked;
  body: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  wheelCount: number;
}

export class VehicleView {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private specials = new Map<string, { obj: THREE.Object3D; wheels: THREE.Object3D[]; legs: THREE.Object3D[] }>();
  private bus: THREE.Group | null = null;
  private m4 = new THREE.Matrix4();
  private mw = new THREE.Matrix4();

  constructor(
    private readonly mats: MaterialLibrary,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.group.name = 'vehicles';
  }

  async load(): Promise<void> {
    const baked = await Promise.all(MODELS.map((n) => bake(n)));
    const mat = bodyMaterial();
    for (const [i, name] of MODELS.entries()) {
      const b = baked[i]!;
      const im = new THREE.InstancedMesh(b.body, b.textured ? (b.textured as THREE.Material) : mat, CAPACITY);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3).fill(1), 3);
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      const wm = new THREE.InstancedMesh(b.wheel, b.textured ?? mat, CAPACITY * Math.max(4, b.wheels.length));
      wm.count = 0;
      wm.castShadow = true;
      wm.frustumCulled = false;
      this.group.add(wm);
      this.batches.set(name, { baked: b, body: im, wheels: wm, wheelCount: 0 });
    }
  }

  parked(sim: Sim): THREE.Group {
    const g = new THREE.Group();
    const byModel = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
    for (const [i, p] of sim.layout.parked.entries()) {
      const name = p.kind === 'taxi' ? 'taxi' : p.kind === 'suv' ? 'suv' : p.kind === 'van' ? 'pickup' : hash(i) > 0.5 ? 'sedan-a' : 'sedan-b';
      const b = this.batches.get(name)!;
      const k = 4.75 / b.baked.length;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.pos.x, 0, p.pos.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading), new THREE.Vector3(k, k, k));
      const list = byModel.get(name) ?? [];
      list.push({ m, c: this.batches.get(name)!.baked.textured ? new THREE.Color(1, 1, 1) : new THREE.Color(p.color) });
      byModel.set(name, list);
    }
    for (const [name, list] of byModel) {
      const b = this.batches.get(name)!;
      const im = new THREE.InstancedMesh(b.baked.body, b.body.material, list.length);
      list.forEach((x, i) => {
        im.setMatrixAt(i, x.m);
        im.setColorAt(i, x.c);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
      const wm = new THREE.InstancedMesh(b.baked.wheel, b.wheels.material, list.length * b.baked.wheels.length);
      let j = 0;
      for (const x of list) for (const w of b.baked.wheels) wm.setMatrixAt(j++, new THREE.Matrix4().multiplyMatrices(x.m, new THREE.Matrix4().makeTranslation(w.x, w.y, w.z)));
      wm.castShadow = true;
      wm.computeBoundingSphere();
      g.add(wm);
    }
    return g;
  }

  private special(v: Vehicle): { obj: THREE.Object3D; wheels: THREE.Object3D[]; legs: THREE.Object3D[] } {
    let view = this.specials.get(v.id);
    if (view) return view;
    let obj: THREE.Object3D;
    if (v.body === 'bus') {
      this.bus ??= buildBus(this.mats, this.renderer);
      obj = this.bus.clone(true);
    } else obj = buildBike(this.mats);
    const wheels: THREE.Object3D[] = [];
    const legs: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if (/wheel/i.test(o.name)) wheels.push(o);
      if (/^leg/.test(o.name)) legs.push(o);
    });
    this.group.add(obj);
    view = { obj, wheels, legs };
    this.specials.set(v.id, view);
    return view;
  }

  update(sim: Sim): void {
    for (const b of this.batches.values()) {
      b.body.count = 0;
      b.wheelCount = 0;
    }
    const seen = new Set<string>();
    const eye = sim.wearer.pos;
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (const v of sim.traffic.vehicles) {
      const { pos, heading } = sim.traffic.pose(v);
      if (Math.abs(pos.x - eye.x) > 320 || Math.abs(pos.z - eye.z) > 650) continue;
      if (v.body === 'bus' || v.body === 'bike') {
        seen.add(v.id);
        const s = this.special(v);
        s.obj.position.set(pos.x, 0, pos.z);
        s.obj.rotation.y = heading;
        for (const w of s.wheels) w.rotation.x = -v.wheel;
        for (const [i, l] of s.legs.entries()) l.rotation.x = Math.sin(v.wheel * 0.35 + i * Math.PI) * 0.6;
        continue;
      }
      const list = MODEL_FOR[v.body] ?? ['sedan-a'];
      const name = list[Math.floor(hash(Number(v.id.replace(/\D/g, '')) || 3) * list.length)]!;
      const b = this.batches.get(name)!;
      if (b.body.count >= CAPACITY) continue;
      const k = v.len / b.baked.length;
      q.setFromAxisAngle(yAxis, heading);
      this.m4.compose(new THREE.Vector3(pos.x, 0, pos.z), q, new THREE.Vector3(k, k, k));
      b.body.setMatrixAt(b.body.count, this.m4);
      b.body.setColorAt(b.body.count, b.baked.textured ? col.setRGB(1, 1, 1) : col.set(v.color));
      b.body.count++;
      for (const w of b.baked.wheels) {
        if (b.wheelCount >= b.wheels.instanceMatrix.count) break;
        this.mw.makeTranslation(w.x, w.y, w.z).multiply(new THREE.Matrix4().makeRotationX(-v.wheel));
        b.wheels.setMatrixAt(b.wheelCount++, new THREE.Matrix4().multiplyMatrices(this.m4, this.mw));
      }
    }
    for (const b of this.batches.values()) {
      b.wheels.count = b.wheelCount;
      b.wheels.instanceMatrix.needsUpdate = true;
      b.body.instanceMatrix.needsUpdate = true;
      if (b.body.instanceColor) b.body.instanceColor.needsUpdate = true;
    }
    for (const [id, s] of this.specials) {
      if (!seen.has(id)) {
        this.group.remove(s.obj);
        this.specials.delete(id);
      }
    }
  }
}
