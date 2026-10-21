import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Frame {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  n: THREE.Vector3;
  width: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export function framePoint(f: Frame, u: number, y: number, d: number): THREE.Vector3 {
  return f.origin.clone().addScaledVector(f.u, u).addScaledVector(UP, y).addScaledVector(f.n, -d);
}

export function worldUV(g: THREE.BufferGeometry, tileU: number, tileV: number, offset = 0): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    let u: number;
    let v: number;
    if (ny > 0.7) {
      u = x / tileU;
      v = z / tileV;
    } else if (nx > 0.7) {
      u = z / tileU;
      v = y / tileV;
    } else {
      u = x / tileU;
      v = y / tileV;
    }
    uv[i * 2] = u + offset;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function aabbBox(min: THREE.Vector3, max: THREE.Vector3): THREE.BufferGeometry {
  const sx = Math.max(0.001, max.x - min.x);
  const sy = Math.max(0.001, max.y - min.y);
  const sz = Math.max(0.001, max.z - min.z);
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  return g;
}

export function frameBox(f: Frame, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number): THREE.BufferGeometry {
  const a = framePoint(f, u0, y0, d0);
  const b = framePoint(f, u1, y1, d1);
  return aabbBox(new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)), new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)));
}

export class GeoBucket {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const list = this.parts.get(mat) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.parts.set(mat, list);
  }

  build(group: THREE.Group, opts: { cast?: boolean; receive?: boolean } = {}): void {
    for (const [mat, list] of this.parts) {
      if (list.length === 0) continue;
      for (const g of list) {
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      }
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
  }
}

export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function floatAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}
