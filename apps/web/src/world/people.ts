import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Person, Sim } from '@lumen/sim';
import { floatAttributes } from './geom';
import { gltfLoader } from './vehicles';

export const PEOPLE_MODELS = [
  'man-long-sleeves',
  'man-shirt',
  'man-casual',
  'man-suit',
  'woman-casual',
  'woman-dress',
  'woman-tank-top',
  'business-man',
  'worker',
  'hoodie',
  'casual',
  'woman-a',
  'woman-b',
  'woman-c',
] as const;

interface Proto {
  scene: THREE.Object3D;
  clips: Record<'walk' | 'idle' | 'sit', THREE.AnimationClip>;
  height: number;
  stride: number;
}

interface View {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  mixer: THREE.AnimationMixer;
  actions: Record<'walk' | 'idle' | 'sit', THREE.AnimationAction>;
  current: 'walk' | 'idle' | 'sit';
  stride: number;
}

export class PeopleView {
  readonly group = new THREE.Group();
  private protos: Proto[] = [];
  private views = new Map<string, View>();

  constructor() {
    this.group.name = 'people';
  }

  async load(): Promise<void> {
    this.protos = await Promise.all(
      PEOPLE_MODELS.map(async (name) => {
        const g = await gltfLoader().loadAsync(`/assets/people/${name}.glb`);
        const scene = g.scene;
        mergeSkinned(scene);
        scene.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.frustumCulled = false;
            const list = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of list as THREE.MeshStandardMaterial[]) {
              mat.roughness = Math.max(0.6, mat.roughness ?? 0.8);
              mat.metalness = 0;
            }
          }
        });
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene, true);
        const clip = (n: string): THREE.AnimationClip => g.animations.find((a) => a.name === n) ?? g.animations[0]!;
        return { scene, clips: { walk: clip('walk'), idle: clip('idle'), sit: clip('sit') }, height: box.max.y - box.min.y, stride: 1.25 };
      }),
    );
  }

  private make(p: Person): View {
    const proto = this.protos[p.look % this.protos.length]!;
    const inner = cloneSkinned(proto.scene);
    const root = new THREE.Group();
    const k = p.height / proto.height;
    inner.scale.setScalar(k);
    root.add(inner);
    const mixer = new THREE.AnimationMixer(inner);
    const actions = {
      walk: mixer.clipAction(proto.clips.walk),
      idle: mixer.clipAction(proto.clips.idle),
      sit: mixer.clipAction(proto.clips.sit),
    };
    for (const a of Object.values(actions)) {
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      a.time = (p.phase / (Math.PI * 2)) * a.getClip().duration;
    }
    const start = p.anim === 'walk' ? 'walk' : p.anim === 'sit' ? 'sit' : 'idle';
    actions[start].setEffectiveWeight(1);
    this.group.add(root);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    return { root, meshes, mixer, actions, current: start, stride: proto.stride * k };
  }

  update(sim: Sim, dt: number): void {
    const seen = new Set<string>();
    for (const p of sim.people.people) {
      if (!p.alive || p.spawnAt > sim.t) continue;
      seen.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = this.make(p);
        this.views.set(p.id, v);
      }
      v.root.position.set(p.pos.x, 0.15 * onSidewalk(p.pos), p.pos.z);
      const d = Math.hypot(p.pos.x - sim.wearer.pos.x, p.pos.z - sim.wearer.pos.z);
      v.root.visible = d < 70;
      if (!v.root.visible) continue;
      for (const m of v.meshes) m.castShadow = d < 40;
      let yaw = p.heading;
      if (p.facePoint) yaw = Math.atan2(-(p.facePoint.x - p.pos.x), -(p.facePoint.z - p.pos.z));
      v.root.rotation.y = yaw + Math.PI;
      const want: View['current'] = p.speed > 0.25 ? 'walk' : p.anim === 'sit' ? 'sit' : 'idle';
      if (want !== v.current) {
        v.actions[want].reset().setEffectiveWeight(1).fadeIn(0.35);
        v.actions[v.current].fadeOut(0.35);
        v.current = want;
      }
      const walk = v.actions.walk;
      const cycle = walk.getClip().duration;
      walk.timeScale = want === 'walk' ? Math.max(0.4, (p.speed * cycle) / (v.stride * 2)) : 1;
      v.mixer.update(dt);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(v.root);
        this.views.delete(id);
      }
    }
  }
}

const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

function approx(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
  return a.elements.every((v, i) => Math.abs(v - b.elements[i]!) < 1e-3 * Math.max(1, Math.abs(v)));
}

export function mergeSkinned(scene: THREE.Object3D): void {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  if (meshes.length < 2) return;
  const base = meshes[0]!;
  const textured = meshes.some((m) => (Array.isArray(m.material) ? m.material : [m.material]).some((x) => (x as THREE.MeshStandardMaterial).map));
  const sameBind = meshes.every((m) => {
    if (!m.bindMatrix.equals(base.bindMatrix) || m.skeleton.bones.length !== base.skeleton.bones.length) return false;
    if (!m.skeleton.bones.every((b, i) => b === base.skeleton.bones[i])) return false;
    const d = new THREE.Matrix4().copy(base.skeleton.boneInverses[0]!).invert().multiply(m.skeleton.boneInverses[0]!);
    return m.skeleton.boneInverses.every((inv, i) => new THREE.Matrix4().multiplyMatrices(base.skeleton.boneInverses[i]!, d).equals(inv) || approx(new THREE.Matrix4().multiplyMatrices(base.skeleton.boneInverses[i]!, d), inv));
  });
  if (textured || !sameBind) return;
  const parts: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) geo.deleteAttribute(k);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: n, materialIndex: 0 }];
    for (const gr of groups) {
      const c = (mats[gr.materialIndex ?? 0] ?? mats[0]!).color;
      for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floatAttributes(geo);
    const t = new THREE.Matrix4().copy(base.skeleton.boneInverses[0]!).invert().multiply(m.skeleton.boneInverses[0]!);
    geo.applyMatrix4(t);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) return;
  merged.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(merged, personMaterial);
  mesh.name = 'person';
  base.parent!.add(mesh);
  mesh.position.copy(base.position);
  mesh.quaternion.copy(base.quaternion);
  mesh.scale.copy(base.scale);
  mesh.bind(base.skeleton, base.bindMatrix);
  for (const m of meshes) m.parent!.remove(m);
}

function onSidewalk(p: THREE.Vector3 | { x: number; z: number }): number {
  const n = -p.z;
  const ax = Math.abs(p.x);
  if (ax >= 7 && (n < 90 || n > 104)) return 1;
  if (n < 90 && n > 84 && ax >= 7) return 1;
  if (n > 104 && n < 110 && ax >= 7) return 1;
  if (ax >= 13) return 1;
  return 0;
}
