import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { readSignal, vehicleLight, type SignalAnchor } from '@lumen/shared';
import type { BlockLayout, Prop } from '@lumen/sim';
import { GeoBucket, hash } from './geom';
import type { MaterialLibrary } from './materials';
import { signCanvas, type SignAtlas } from './signs';

type Builder = (bucket: GeoBucket, p: Prop, at: (g: THREE.BufferGeometry) => THREE.BufferGeometry) => void;

function placed(p: Prop): (g: THREE.BufferGeometry) => THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(p.pos as THREE.Vector3, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(1, 1, 1));
  return (g) => g.applyMatrix4(m);
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0: number, r1: number, h: number, x = 0, y = 0, z = 0, seg = 12): THREE.BufferGeometry => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);

export interface PropsOutput {
  group: THREE.Group;
  update(t: number): void;
}

function leafTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  let s = 41;
  const R = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 520; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.pow(R(), 0.55) * 116;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r * 0.92;
    const light = 18 + R() * 26 + (y < 128 ? 8 : 0);
    g.fillStyle = `hsl(${82 + R() * 30}, ${34 + R() * 26}%, ${light}%)`;
    g.save();
    g.translate(x, y);
    g.rotate(R() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, 5 + R() * 6, 2.6 + R() * 2.8, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildProps(layout: BlockLayout, mats: MaterialLibrary, renderer: THREE.WebGLRenderer, signal: SignalAnchor, atlas: SignAtlas): PropsOutput {
  const group = new THREE.Group();
  group.name = 'props';
  const bucket = new GeoBucket();
  const green = new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: 0.55, metalness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f4a8a, roughness: 0.45, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a1e1a, roughness: 0.5, metalness: 0.2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8a62a, roughness: 0.5, metalness: 0.2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  const soil = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x4f6b35, roughness: 0.95 });
  const plywood = new THREE.MeshStandardMaterial({ color: 0x2f4a36, roughness: 0.85 });
  const dark = mats.metalDark;

  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xd8e4c4 });
  const sway = { value: 0 };
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = sway;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = wp.x * 0.37 + wp.z * 0.21;
        transformed.x += sin(uSway * 1.3 + ph) * 0.05 * (position.y + 0.5);
        transformed.z += cos(uSway * 1.1 + ph * 1.3) * 0.04 * (position.y + 0.5);`,
      );
  };
  leafMat.customProgramCacheKey = () => 'leaf-sway';
  const leaves: THREE.Matrix4[] = [];

  const builders: Partial<Record<Prop['kind'], Builder>> = {
    tree: (b, p, at) => {
      const h = 4.4 + hash(p.pos.z) * 1.2;
      b.add(mats.bark, at(cyl(0.08, 0.13, h, 0, h / 2, 0, 9)));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + hash(p.pos.z + k);
        const br = cyl(0.04, 0.08, 1.8, 0, 0.9, 0, 6);
        br.rotateZ(0.7).rotateY(a).translate(0, h - 0.8, 0);
        b.add(mats.bark, at(br));
      }
      b.add(soil, at(box(1.0, 0.03, 1.0, 0, 0.152, 0)));
      for (const [x, z, w, d] of [
        [0.5, 0, 0.03, 1.0],
        [-0.5, 0, 0.03, 1.0],
        [0, 0.5, 1.0, 0.03],
        [0, -0.5, 1.0, 0.03],
      ] as const) {
        b.add(dark, at(box(w, 0.03, d, x, 0.42, z)));
        b.add(dark, at(box(0.03, 0.27, 0.03, x + (w > 0.1 ? 0.48 : 0), 0.29, z + (d > 0.1 ? 0.48 : 0))));
      }
      const n = 150;
      for (let i = 0; i < n; i++) {
        const u = hash(p.pos.z * 13 + i);
        const v = hash(p.pos.x * 7 + i * 3.1);
        const w = hash(i * 9.7 + p.pos.z);
        const a = u * Math.PI * 2;
        const r = Math.sqrt(v) * 2.1;
        const y = h - 0.4 + (w - 0.35) * 2.6;
        const pos = new THREE.Vector3(p.pos.x + Math.cos(a) * r, y, p.pos.z + Math.sin(a) * r);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hash(i + 1) * 3, hash(i + 2) * 3, hash(i + 3) * 3));
        const s = 0.85 + hash(i + 4) * 0.55;
        leaves.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, 1)));
      }
    },
    lamp: (b, _p, at) => {
      b.add(dark, at(cyl(0.09, 0.15, 8.6, 0, 4.3, 0, 10)));
      b.add(dark, at(cyl(0.2, 0.24, 0.5, 0, 0.25, 0, 10)));
      const arm = cyl(0.05, 0.06, 2.2, 0, 0, 0, 6);
      arm.rotateZ(Math.PI / 2 - 0.12).translate(-1.05, 8.55, 0);
      b.add(dark, at(arm));
      b.add(dark, at(box(0.8, 0.2, 0.32, -2.2, 8.62, 0)));
      b.add(mats.white, at(box(0.62, 0.04, 0.24, -2.2, 8.5, 0)));
    },
    hydrant: (b, _p, at) => {
      b.add(red, at(cyl(0.15, 0.17, 0.7, 0, 0.5, 0, 12)));
      b.add(red, at(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.85, 0)));
      b.add(red, at(cyl(0.06, 0.06, 0.48, 0, 0.62, 0, 8).rotateZ(Math.PI / 2).translate(0, 0, 0)));
      b.add(red, at(cyl(0.2, 0.2, 0.05, 0, 0.18, 0, 12)));
    },
    bollard: (b, _p, at) => {
      b.add(dark, at(cyl(0.11, 0.12, 0.95, 0, 0.62, 0, 10)));
      b.add(dark, at(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.1, 0)));
    },
    newsstand: (b, _p, at) => {
      b.add(green, at(box(1.6, 2.4, 2.4, 0, 1.35, 0)));
      b.add(green, at(box(2.0, 0.12, 2.8, 0, 2.6, 0)));
      b.add(dark, at(box(0.06, 1.0, 2.0, -0.83, 1.4, 0)));
    },
    'station-stair': (b, _p, at) => {
      for (const sx of [-1.15, 1.15]) {
        b.add(green, at(box(0.06, 1.0, 5.4, sx, 0.65, 0)));
        b.add(green, at(box(0.1, 0.08, 5.5, sx, 1.16, 0)));
        b.add(green, at(cyl(0.05, 0.05, 2.6, sx, 1.3, -2.55, 8)));
      }
      b.add(dark, at(box(2.2, 0.2, 5.2, 0, 0.06, 0)));
      for (let k = 0; k < 8; k++) b.add(mats.concrete, at(box(2.1, 0.08, 0.32, 0, -0.1 - k * 0.18, -2.2 + k * 0.32)));
    },
    'bus-shelter': (b, _p, at) => {
      b.add(dark, at(box(1.6, 0.12, 4.4, 0, 2.62, 0)));
      for (const z of [-2.1, 2.1]) for (const x of [-0.7, 0.7]) b.add(dark, at(box(0.07, 2.6, 0.07, x, 1.3, z)));
      b.add(glass, at(box(0.03, 2.1, 4.2, 0.7, 1.35, 0)));
      b.add(glass, at(box(1.4, 2.1, 0.03, 0, 1.35, -2.1)));
      b.add(wood, at(box(0.4, 0.06, 2.6, 0.45, 0.48, 0)));
      b.add(dark, at(box(0.06, 2.8, 0.06, -0.85, 1.4, 2.4)));
    },
    'bike-dock': (b, _p, at) => {
      b.add(dark, at(box(0.3, 0.08, 9, 0, 0.04, 0)));
      for (let k = 0; k < 8; k++) {
        const z = -3.9 + k * 1.1;
        b.add(blue, at(box(0.12, 0.9, 0.12, 0, 0.45, z)));
        if (hash(k * 3.3) > 0.25) {
          for (const dz of [-0.48, 0.48]) b.add(dark, at(new THREE.TorusGeometry(0.33, 0.03, 6, 18).rotateY(Math.PI / 2).translate(0.45, 0.36, z + dz)));
          b.add(blue, at(box(0.06, 0.06, 1.0, 0.45, 0.62, z).rotateX(0)));
          b.add(dark, at(box(0.36, 0.05, 0.05, 0.45, 0.92, z - 0.44)));
        }
      }
    },
    'cafe-seating': (b, p, at) => {
      const len = p.size?.z ?? 4;
      for (let z = -len / 2 + 0.6; z < len / 2; z += 1.4) {
        b.add(dark, at(cyl(0.3, 0.3, 0.04, 0, 0.74, z, 14)));
        b.add(dark, at(cyl(0.025, 0.025, 0.72, 0, 0.37, z, 6)));
        for (const dx of [-0.48, 0.48]) {
          b.add(dark, at(box(0.38, 0.03, 0.38, dx, 0.46, z)));
          b.add(dark, at(box(0.03, 0.42, 0.38, dx + Math.sign(dx) * 0.18, 0.68, z)));
        }
      }
    },
    bench: (b, _p, at) => {
      b.add(wood, at(box(1.8, 0.05, 0.45, 0, 0.46, 0)));
      b.add(wood, at(box(1.8, 0.4, 0.05, 0, 0.72, -0.21)));
      for (const x of [-0.8, 0.8]) b.add(dark, at(box(0.06, 0.46, 0.45, x, 0.23, 0)));
    },
    trash: (b, _p, at) => {
      b.add(green, at(cyl(0.3, 0.26, 0.85, 0, 0.43, 0, 14)));
      b.add(dark, at(cyl(0.31, 0.31, 0.05, 0, 0.87, 0, 14)));
    },
    mailbox: (b, _p, at) => {
      b.add(blue, at(box(0.5, 0.9, 0.48, 0, 0.75, 0)));
      b.add(blue, at(cyl(0.25, 0.25, 0.48, 0, 1.2, 0, 14).rotateX(Math.PI / 2)));
      for (const x of [-0.2, 0.2]) b.add(dark, at(box(0.05, 0.3, 0.05, x, 0.15, 0)));
    },
    cart: (b, _p, at) => {
      b.add(mats.white, at(box(0.9, 1.0, 1.8, 0, 0.75, 0)));
      b.add(dark, at(box(0.92, 0.08, 1.82, 0, 1.28, 0)));
      for (const z of [-0.6, 0.6]) b.add(dark, at(new THREE.TorusGeometry(0.22, 0.05, 6, 14).rotateY(Math.PI / 2).translate(0.47, 0.22, z)));
      b.add(dark, at(cyl(0.025, 0.025, 1.6, 0, 2.0, 0, 6)));
      b.add(yellow, at(new THREE.ConeGeometry(1.1, 0.5, 10).translate(0, 2.85, 0)));
    },
    planter: (b, p, at) => {
      const l = p.size?.z ?? 2;
      b.add(mats.concrete, at(box(0.7, 0.6, l, 0, 0.3, 0)));
      b.add(grass, at(box(0.6, 0.1, l - 0.1, 0, 0.62, 0)));
    },
    'taxi-sign': (b, _p, at) => {
      b.add(dark, at(cyl(0.035, 0.035, 2.6, 0, 1.3, 0, 6)));
      b.add(yellow, at(box(0.04, 0.45, 0.6, 0, 2.4, 0)));
    },
    'no-standing': (b, _p, at) => {
      b.add(dark, at(cyl(0.03, 0.03, 2.5, 0, 1.25, 0, 6)));
      b.add(mats.white, at(box(0.03, 0.55, 0.32, 0, 2.2, 0)));
    },
  };

  const signals = buildSignals(group, bucket, dark);

  for (const p of layout.props) {
    if (p.kind === 'lamp') p.rot = p.pos.x > 0 ? 0 : Math.PI;
    const at = placed(p);
    const fn = builders[p.kind];
    if (fn) {
      fn(bucket, p, at);
      continue;
    }
    if (p.kind === 'signal') continue;
  }

  const s = layout.scaffold;
  const sz = (n: number): number => -n;
  for (let n = s.n0; n <= s.n1 + 0.01; n += 1.75) {
    for (const x of [s.x0, s.x1 - 0.1]) bucket.add(dark, cyl(0.04, 0.04, s.height, x, s.height / 2, sz(n), 6));
  }
  bucket.add(plywood, box(s.x1 - s.x0 + 0.3, 0.25, s.n1 - s.n0 + 0.3, (s.x0 + s.x1) / 2, s.height, sz((s.n0 + s.n1) / 2)));
  bucket.add(plywood, box(s.x1 - s.x0 + 0.3, 1.0, 0.05, (s.x0 + s.x1) / 2, s.height + 0.6, sz(s.n0 - 0.15)));
  bucket.add(plywood, box(0.05, 1.0, s.n1 - s.n0 + 0.3, s.x0 - 0.15, s.height + 0.6, sz((s.n0 + s.n1) / 2)));
  for (let n = s.n0; n <= s.n1; n += 1.75) bucket.add(dark, box(s.x1 - s.x0, 0.06, 0.06, (s.x0 + s.x1) / 2, s.height - 0.2, sz(n)));
  const sx0 = s.x0 - 0.18;
  const sm = sz((s.n0 + s.n1) / 2);
  const sy = s.height + 0.6;
  atlas.add(signCanvas({ text: 'SIDEWALK OPEN · BUSINESS AS USUAL', bg: '#2f4a36', fg: '#f1ead8', w: 6.6, h: 0.8, font: 'ui' }), [
    new THREE.Vector3(sx0, sy - 0.4, sm + 3.3),
    new THREE.Vector3(sx0, sy - 0.4, sm - 3.3),
    new THREE.Vector3(sx0, sy + 0.4, sm - 3.3),
    new THREE.Vector3(sx0, sy + 0.4, sm + 3.3),
  ]);

  bucket.add(grass, box(16, 0.18, 5.2, -21.5, 0.09, sz(81.4)));
  bucket.add(soil, box(16, 0.2, 0.6, -21.5, 0.1, sz(84)));
  for (let x = -13.2; x > -29.5; x -= 1.4) bucket.add(dark, box(0.05, 0.9, 0.05, x, 0.45, sz(84.05)));
  bucket.add(dark, box(16, 0.05, 0.05, -21.4, 0.88, sz(84.05)));
  bucket.add(dark, box(0.05, 0.05, 5.4, -13.15, 0.88, sz(81.4)));

  bucket.build(group);

  const leafGeo = new THREE.PlaneGeometry(1, 1);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  leaves.forEach((m, i) => leafMesh.setMatrixAt(i, m));
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  leafMesh.computeBoundingSphere();
  group.add(leafMesh);

  const quadAt = (c: THREE.Vector3, w: number, h: number, yaw: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(w / 2);
    const u = new THREE.Vector3(0, h / 2, 0);
    return [c.clone().sub(r).sub(u), c.clone().add(r).sub(u), c.clone().add(r).add(u), c.clone().sub(r).add(u)];
  };
  const stair = layout.props.find((p) => p.kind === 'station-stair');
  if (stair) {
    const globeMat = new THREE.MeshStandardMaterial({ color: 0x58d68d, emissive: 0x58d68d, emissiveIntensity: 1.6, roughness: 0.3 });
    const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 14, 10), globeMat, 2);
    [-1.15, 1.15].forEach((sx, i) => globes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(stair.pos.x + sx, 2.75, stair.pos.z + 2.55)));
    group.add(globes);
    atlas.add(signCanvas({ text: '47 St', sub: 'UPTOWN · DOWNTOWN', bg: '#141414', fg: '#ffffff', w: 1.6, h: 0.5, font: 'ui' }), quadAt(new THREE.Vector3(stair.pos.x, 2.25, stair.pos.z + 2.6), 1.6, 0.5, 0), { emissive: 0.4, doubleSided: true });
  }
  const shelter = layout.props.find((p) => p.kind === 'bus-shelter');
  if (shelter) {
    const c = signCanvas({ text: 'M4', sub: 'MADISON AV · UPTOWN', bg: '#1d4f9a', fg: '#ffffff', w: 0.55, h: 0.55, font: 'ui' });
    atlas.add(c, quadAt(new THREE.Vector3(shelter.pos.x - 0.85, 2.95, shelter.pos.z - 2.4), 0.55, 0.55, Math.PI / 2), { emissive: 0.2, doubleSided: true });
  }
  const news = layout.props.find((p) => p.kind === 'newsstand');
  if (news) {
    atlas.add(signCanvas({ text: 'NEWS', sub: 'PAPERS · MAGAZINES · SNACKS', bg: '#1d3a2a', fg: '#f3e9cf', w: 2.2, h: 0.5 }), quadAt(new THREE.Vector3(news.pos.x - 0.83, 2.35, news.pos.z), 2.2, 0.5, -Math.PI / 2));
  }
  void renderer;

  return {
    group,
    update(t: number) {
      sway.value = t;
      signals.update(signal, t);
    },
  };
}

function glyph(kind: 'walk' | 'hand'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = kind === 'walk' ? '#f4f4f0' : '#ff8a2a';
  g.strokeStyle = g.fillStyle;
  g.lineCap = 'round';
  if (kind === 'walk') {
    g.beginPath();
    g.arc(66, 26, 11, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(62, 44);
    g.lineTo(56, 78);
    g.moveTo(56, 78);
    g.lineTo(40, 112);
    g.moveTo(56, 78);
    g.lineTo(76, 108);
    g.moveTo(61, 50);
    g.lineTo(40, 70);
    g.moveTo(61, 50);
    g.lineTo(82, 66);
    g.stroke();
  } else {
    g.beginPath();
    g.roundRect(38, 50, 52, 56, 12);
    g.fill();
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.roundRect(40 + i * 13, 18 + (i === 0 || i === 3 ? 8 : 0), 10, 42, 5);
      g.fill();
    }
    g.beginPath();
    g.roundRect(84, 62, 24, 11, 5);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSignals(group: THREE.Group, bucket: GeoBucket, dark: THREE.Material): { update(a: SignalAnchor, t: number): void } {
  const walkT = glyph('walk');
  const handT = glyph('hand');
  const pedWalk = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: walkT, emissiveIntensity: 2.0 });
  const pedHand = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: handT, emissiveIntensity: 2.2 });
  const pedOff = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.4 });
  const corners: { x: number; n: number; veh: { road: 'avenue' | 'cross'; yaw: number }; ped: { leg: 'avenue' | 'cross'; yaw: number }[] }[] = [
    { x: 7.6, n: 89.7, veh: { road: 'cross', yaw: -Math.PI / 2 }, ped: [{ leg: 'avenue', yaw: -Math.PI / 2 }, { leg: 'cross', yaw: Math.PI }] },
    { x: -7.6, n: 89.7, veh: { road: 'avenue', yaw: Math.PI }, ped: [{ leg: 'avenue', yaw: Math.PI / 2 }, { leg: 'cross', yaw: Math.PI }] },
    { x: 7.6, n: 104.3, veh: { road: 'avenue', yaw: 0 }, ped: [{ leg: 'cross', yaw: 0 }, { leg: 'avenue', yaw: -Math.PI / 2 }] },
    { x: -7.6, n: 104.3, veh: { road: 'cross', yaw: Math.PI / 2 }, ped: [{ leg: 'cross', yaw: 0 }, { leg: 'avenue', yaw: Math.PI / 2 }] },
  ];
  const lampSlots: { road: 'avenue' | 'cross'; index: number; color: THREE.Color }[] = [];
  const lampMats: THREE.Matrix4[] = [];
  const faceSlots: { leg: 'avenue' | 'cross'; m: THREE.Matrix4 }[] = [];
  const colors = [new THREE.Color(3.2, 0.5, 0.35), new THREE.Color(3.0, 1.7, 0.3), new THREE.Color(0.6, 3.0, 1.5)];
  for (const c of corners) {
    const base = new THREE.Vector3(c.x, 0, -c.n);
    bucket.add(dark, new THREE.CylinderGeometry(0.1, 0.13, 5.6, 10).translate(base.x, 2.8, base.z));
    const head = new THREE.Matrix4().compose(new THREE.Vector3(base.x, 4.6, base.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.veh.yaw), new THREE.Vector3(1, 1, 1));
    bucket.add(dark, new THREE.BoxGeometry(0.42, 1.15, 0.32).translate(0, 0, 0.3).applyMatrix4(head));
    bucket.add(dark, new THREE.BoxGeometry(0.46, 1.2, 0.04).translate(0, 0, 0.47).applyMatrix4(head));
    for (let i = 0; i < 3; i++) {
      lampSlots.push({ road: c.veh.road, index: i, color: colors[i]! });
      lampMats.push(new THREE.Matrix4().multiplyMatrices(head, new THREE.Matrix4().makeTranslation(0, 0.36 - i * 0.36, 0.465)));
    }
    c.ped.forEach((pd, k) => {
      const pm = new THREE.Matrix4().compose(new THREE.Vector3(base.x, 2.7 + k * 0.5, base.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pd.yaw), new THREE.Vector3(1, 1, 1));
      bucket.add(dark, new THREE.BoxGeometry(0.4, 0.4, 0.24).translate(0, 0, 0.24).applyMatrix4(pm));
      faceSlots.push({ leg: pd.leg, m: new THREE.Matrix4().multiplyMatrices(pm, new THREE.Matrix4().makeTranslation(0, 0, 0.365)) });
    });
  }
  const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true }), lampMats.length);
  lampMats.forEach((m, i) => {
    lamps.setMatrixAt(i, m);
    lamps.setColorAt(i, new THREE.Color(0.02, 0.02, 0.02));
  });
  group.add(lamps);
  const faceGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const facesWalk = new THREE.InstancedMesh(faceGeo, pedWalk, faceSlots.length);
  const facesHand = new THREE.InstancedMesh(faceGeo, pedHand, faceSlots.length);
  const facesOff = new THREE.InstancedMesh(faceGeo, pedOff, faceSlots.length);
  group.add(facesWalk, facesHand, facesOff);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const off = new THREE.Color(0.02, 0.02, 0.02);
  return {
    update(a: SignalAnchor, t: number) {
      const light = { avenue: vehicleLight(a, 'avenue', t), cross: vehicleLight(a, 'cross', t) };
      lampSlots.forEach((sl, i) => {
        const l = light[sl.road];
        const on = (sl.index === 0 && l === 'red') || (sl.index === 1 && l === 'yellow') || (sl.index === 2 && l === 'green');
        lamps.setColorAt(i, on ? sl.color : off);
      });
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      const read = { avenue: readSignal(a, 'avenue', t), cross: readSignal(a, 'cross', t) };
      faceSlots.forEach((f, i) => {
        const r = read[f.leg];
        const blinkOff = r.state === 'flash' && Math.floor(t * 2) % 2 === 1;
        facesWalk.setMatrixAt(i, r.state === 'walk' ? f.m : zero);
        facesHand.setMatrixAt(i, r.state !== 'walk' && !blinkOff ? f.m : zero);
        facesOff.setMatrixAt(i, blinkOff ? f.m : zero);
      });
      facesWalk.instanceMatrix.needsUpdate = true;
      facesHand.instanceMatrix.needsUpdate = true;
      facesOff.instanceMatrix.needsUpdate = true;
    },
  };
}

export function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}
