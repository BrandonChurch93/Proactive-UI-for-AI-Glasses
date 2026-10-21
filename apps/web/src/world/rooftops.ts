import * as THREE from 'three';
import type { Lot } from '@lumen/sim';
import { GeoBucket, hash, worldUV } from './geom';
import type { MaterialLibrary } from './materials';
import { signCanvas, type SignAtlas } from './signs';

function roofCenter(l: Lot): { x: number; z: number; w: number; d: number; along: 'x' | 'z' } {
  const line = 13;
  if (l.street === 'avenue') {
    const front = l.side === 'W' ? -line - l.setback : line + l.setback;
    const back = l.side === 'W' ? front - l.depth : front + l.depth;
    return { x: (front + back) / 2, z: -(l.a0 + l.a1) / 2, w: Math.abs(back - front), d: l.a1 - l.a0, along: 'z' };
  }
  const front = l.side === 'N' ? -(110 + l.setback) : -(84 - l.setback);
  const back = l.side === 'N' ? front - l.depth : front + l.depth;
  return { x: (l.a0 + l.a1) / 2, z: (front + back) / 2, w: l.a1 - l.a0, d: Math.abs(back - front), along: 'x' };
}

export function buildRooftops(lots: Lot[], mats: MaterialLibrary, atlas: SignAtlas): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rooftops';
  const bucket = new GeoBucket();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5240, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.6, metalness: 0.4 });
  const hvac = new THREE.MeshStandardMaterial({ color: 0xb9b8b2, roughness: 0.55, metalness: 0.3 });
  const tar = new THREE.MeshStandardMaterial({ color: 0x4d4a46, roughness: 0.95 });
  for (const [i, l] of lots.entries()) {
    if (l.kindOf === 'park' || l.kindOf === 'mural') continue;
    const r = roofCenter(l);
    const y = l.height + 0.1;
    const back = (k: number): THREE.Vector3 => {
      const sx = l.street === 'avenue' ? (l.side === 'W' ? -1 : 1) : 0;
      const sz = l.street === 'cross' ? (l.side === 'N' ? -1 : 1) : 0;
      return new THREE.Vector3(r.x + sx * r.w * k, y, r.z + sz * r.d * k);
    };
    for (const kind of l.rooftop) {
      if (kind === 'water-tower') {
        const p = back(0.18);
        p.x += (hash(i) - 0.5) * Math.min(4, r.w * 0.3);
        const legH = 3.2;
        for (const [dx, dz] of [
          [-1.3, -1.3],
          [1.3, -1.3],
          [-1.3, 1.3],
          [1.3, 1.3],
        ] as const) {
          bucket.add(steel, new THREE.BoxGeometry(0.16, legH, 0.16).translate(p.x + dx, y + legH / 2, p.z + dz));
        }
        bucket.add(steel, new THREE.BoxGeometry(3.0, 0.12, 0.12).translate(p.x, y + legH * 0.55, p.z - 1.3));
        bucket.add(steel, new THREE.BoxGeometry(3.0, 0.12, 0.12).translate(p.x, y + legH * 0.55, p.z + 1.3));
        bucket.add(steel, new THREE.BoxGeometry(0.12, 0.12, 3.0).translate(p.x - 1.3, y + legH * 0.55, p.z));
        bucket.add(steel, new THREE.BoxGeometry(0.12, 0.12, 3.0).translate(p.x + 1.3, y + legH * 0.55, p.z));
        bucket.add(steel, new THREE.CylinderGeometry(2.0, 2.0, 0.2, 16).translate(p.x, y + legH, p.z));
        bucket.add(wood, new THREE.CylinderGeometry(1.85, 1.95, 3.8, 20).translate(p.x, y + legH + 2.0, p.z));
        for (const hy of [0.6, 1.8, 3.0]) bucket.add(steel, new THREE.CylinderGeometry(1.97, 1.97, 0.06, 20).translate(p.x, y + legH + hy, p.z));
        bucket.add(wood, new THREE.ConeGeometry(2.05, 1.3, 20).translate(p.x, y + legH + 4.55, p.z));
        bucket.add(steel, new THREE.SphereGeometry(0.12, 8, 6).translate(p.x, y + legH + 5.25, p.z));
      }
      if (kind === 'hvac') {
        const p = back(0.0);
        for (let k = 0; k < 2; k++) {
          const ox = (k - 0.5) * 2.4;
          bucket.add(hvac, new THREE.BoxGeometry(1.8, 1.2, 1.5).translate(p.x + (r.along === 'z' ? 0 : ox), y + 0.6, p.z + (r.along === 'z' ? ox : 0)));
          bucket.add(steel, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16).translate(p.x + (r.along === 'z' ? 0 : ox), y + 1.24, p.z + (r.along === 'z' ? ox : 0)));
        }
      }
      if (kind === 'antenna') {
        const p = back(0.1);
        bucket.add(steel, new THREE.CylinderGeometry(0.06, 0.1, 9, 6).translate(p.x, y + 4.5, p.z));
        bucket.add(steel, new THREE.BoxGeometry(1.4, 0.05, 0.05).translate(p.x, y + 7.5, p.z));
        bucket.add(steel, new THREE.BoxGeometry(0.05, 0.05, 1.4).translate(p.x, y + 6.2, p.z));
      }
      if (kind === 'penthouse') {
        const p = back(0.05);
        bucket.add(mats.trim.concrete, worldUV(new THREE.BoxGeometry(Math.min(8, r.w * 0.5), 4, Math.min(5, r.d * 0.5)).translate(p.x, y + 2, p.z), 3, 3));
      }
      if (kind === 'billboard') {
        const p = back(-0.1);
        const facing = l.street === 'avenue' ? (l.side === 'W' ? 1 : -1) : 0;
        const bw = 9;
        const bh = 3.6;
        const by = y + 2.6;
        for (const off of [-3, 0, 3]) {
          bucket.add(steel, new THREE.BoxGeometry(0.18, by + bh - y, 0.18).translate(p.x, y + (by + bh - y) / 2, p.z + off));
        }
        bucket.add(steel, new THREE.BoxGeometry(0.3, bh + 0.3, bw + 0.3).translate(p.x - facing * 0.1, by + bh / 2, p.z));
        const x = p.x + facing * 0.08;
        const c = signCanvas({ text: 'RIVERSIDE JAZZ', sub: 'FREE IN THE PARK · AUGUST WEEKENDS', bg: '#1b2a48', fg: '#f6d38a', w: bw, h: bh, font: 'sign' }, 90);
        const z0 = p.z + (facing > 0 ? bw / 2 : -bw / 2);
        const z1 = p.z - (facing > 0 ? bw / 2 : -bw / 2);
        atlas.add(c, [new THREE.Vector3(x, by, z0), new THREE.Vector3(x, by, z1), new THREE.Vector3(x, by + bh, z1), new THREE.Vector3(x, by + bh, z0)], { emissive: 0.12 });
      }
    }
    if (l.height > 12 && hash(i * 7.3) > 0.35) {
      const p = back(0.3);
      bucket.add(tar, new THREE.BoxGeometry(2.4, 2.6, 2.4).translate(p.x, y + 1.3, p.z + (hash(i) - 0.5) * 4));
    }
  }
  bucket.build(group);
  return group;
}
