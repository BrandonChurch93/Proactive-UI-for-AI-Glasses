import * as THREE from 'three';
import { BLOCK } from '@lumen/shared';
import type { BackgroundTower, FacadeStyle, Lot } from '@lumen/sim';
import { frameBox, GeoBucket, hash, worldUV, type Frame } from './geom';
import { interiorMaterial } from './interior';
import { TEXTURE_METERS, type MaterialLibrary } from './materials';

export const STORE_TOP = 4.9;
const RECESS = 0.24;

const WINDOW_RATIO: Record<FacadeStyle, [number, number]> = {
  limestone: [0.46, 0.58],
  brick: [0.44, 0.6],
  granite: [0.42, 0.56],
  concrete: [0.64, 0.56],
  glass: [0.9, 0.7],
  bronze: [0.9, 0.7],
  painted: [0.48, 0.58],
};

export interface WindowInstance {
  frame: Frame;
  u: number;
  y: number;
  w: number;
  h: number;
  d: number;
}

export interface BuildingOutput {
  group: THREE.Group;
  storefronts: { lot: Lot; frame: Frame; u0: number; u1: number; top: number }[];
}

export function lotFrames(l: Lot): Frame[] {
  const line = BLOCK.buildingLine;
  const out: Frame[] = [];
  if (l.street === 'avenue') {
    const x = l.side === 'W' ? -line - l.setback : line + l.setback;
    out.push({
      origin: new THREE.Vector3(x, 0, -l.a0),
      u: new THREE.Vector3(0, 0, -1),
      n: new THREE.Vector3(l.side === 'W' ? 1 : -1, 0, 0),
      width: l.a1 - l.a0,
    });
    if (l.a1 >= BLOCK.southLineN - 0.01 && l.kindOf !== 'park') {
      out.push({
        origin: new THREE.Vector3(l.side === 'W' ? -line - l.setback : line + l.setback, 0, -BLOCK.southLineN),
        u: new THREE.Vector3(l.side === 'W' ? -1 : 1, 0, 0),
        n: new THREE.Vector3(0, 0, -1),
        width: l.depth,
      });
    }
  } else {
    const z = l.side === 'N' ? -(BLOCK.northLineN + l.setback) : -(BLOCK.southLineN - l.setback);
    out.push({
      origin: new THREE.Vector3(l.a0, 0, z),
      u: new THREE.Vector3(1, 0, 0),
      n: new THREE.Vector3(0, 0, l.side === 'N' ? 1 : -1),
      width: l.a1 - l.a0,
    });
  }
  return out;
}

function bodyBox(l: Lot): THREE.Box3 {
  const line = BLOCK.buildingLine;
  if (l.street === 'avenue') {
    const z0 = -l.a1;
    const z1 = -l.a0;
    if (l.side === 'W') return new THREE.Box3(new THREE.Vector3(-line - l.setback - l.depth, 0, z0), new THREE.Vector3(-line - l.setback, l.height, z1));
    return new THREE.Box3(new THREE.Vector3(line + l.setback, 0, z0), new THREE.Vector3(line + l.setback + l.depth, l.height, z1));
  }
  if (l.side === 'N') return new THREE.Box3(new THREE.Vector3(l.a0, 0, -(BLOCK.northLineN + l.setback + l.depth)), new THREE.Vector3(l.a1, l.height, -(BLOCK.northLineN + l.setback)));
  return new THREE.Box3(new THREE.Vector3(l.a0, 0, -(BLOCK.southLineN - l.setback)), new THREE.Vector3(l.a1, l.height, -(BLOCK.southLineN - l.setback - l.depth)));
}

function inset(b: THREE.Box3, frames: Frame[], by: number): THREE.Box3 {
  const out = b.clone();
  for (const f of frames) {
    if (f.n.x > 0.5) out.max.x -= by;
    if (f.n.x < -0.5) out.min.x += by;
    if (f.n.z > 0.5) out.max.z -= by;
    if (f.n.z < -0.5) out.min.z += by;
  }
  return out;
}

export function buildBuildings(lots: Lot[], towers: BackgroundTower[], mats: MaterialLibrary): BuildingOutput {
  const group = new THREE.Group();
  group.name = 'buildings';
  const bucket = new GeoBucket();
  const windowsOffice: WindowInstance[] = [];
  const windowsHome: WindowInstance[] = [];
  const shopGlass: WindowInstance[] = [];
  const frames: WindowInstance[] = [];
  const sills: WindowInstance[] = [];
  const acUnits: WindowInstance[] = [];
  const escapes: { frame: Frame; u0: number; u1: number; floors: { yb: number; y: number }[] }[] = [];
  const storefronts: BuildingOutput['storefronts'] = [];

  const tiled = (style: FacadeStyle, g: THREE.BufferGeometry, off = 0): THREE.BufferGeometry => {
    const [tu, tv] = TEXTURE_METERS[style];
    return worldUV(g, tu, tv, off);
  };

  for (const [li, l] of lots.entries()) {
    if (l.kindOf === 'park') continue;
    const fs = lotFrames(l);
    const curtain = l.style === 'glass' || l.style === 'bronze';
    const wallMat = mats.wall[l.style];
    const trimMat = mats.trim[l.style];
    const body = bodyBox(l);
    const recess = l.kindOf === 'mural' ? 0 : curtain ? 0.05 : RECESS;
    const core = inset(body, fs, recess);
    const top = l.height;
    const cH = l.cornice === 'deep' ? 1.1 : l.cornice === 'stepped' ? 1.4 : l.cornice === 'thin' ? 0.45 : l.cornice === 'parapet' ? 0.9 : 0;
    const hasStorefront = l.kindOf !== 'mural' && l.storefronts.length > 0;
    const sfH = hasStorefront ? Math.min(STORE_TOP, l.height - 0.6) : 0;
    const upper = new THREE.BoxGeometry(core.max.x - core.min.x, top - 0.02 - sfH, core.max.z - core.min.z);
    upper.translate((core.min.x + core.max.x) / 2, sfH + (top - 0.02 - sfH) / 2, (core.min.z + core.max.z) / 2);
    bucket.add(curtain ? mats.wall[l.style] : wallMat, tiled(l.style, upper, hash(li) * 4));
    if (hasStorefront) {
      const shop = inset(body, fs.slice(0, 1), 2.4);
      const lower = new THREE.BoxGeometry(shop.max.x - shop.min.x, sfH, shop.max.z - shop.min.z);
      lower.translate((shop.min.x + shop.max.x) / 2, sfH / 2, (shop.min.z + shop.max.z) / 2);
      bucket.add(wallMat, tiled(l.style, lower, hash(li) * 4));
      const soffit = frameBox(fs[0]!, 0, fs[0]!.width, sfH - 0.1, sfH, 0.3, 2.4);
      bucket.add(mats.storefront, soffit);
    }
    const roof = new THREE.BoxGeometry(core.max.x - core.min.x - 0.4, 0.12, core.max.z - core.min.z - 0.4);
    roof.translate((core.min.x + core.max.x) / 2, top + 0.04, (core.min.z + core.max.z) / 2);
    bucket.add(mats.roof, roof);

    for (const [fi, f] of fs.entries()) {
      const W = f.width;
      const hasStore = l.kindOf !== 'mural' && fi === 0;
      const sfTop = hasStore ? Math.min(STORE_TOP, l.height - 0.6) : 0;
      if (hasStore) storefronts.push({ lot: l, frame: f, u0: 0, u1: W, top: sfTop });
      if (l.kindOf === 'mural') continue;
      if (!hasStore && l.height > 4) {
        bucket.add(wallMat, tiled(l.style, frameBox(f, 0, W, 0, STORE_TOP, 0, recess)));
      }
      const y0 = hasStore ? sfTop : STORE_TOP;
      const y1 = top - cH;
      if (curtain) {
        const g = frameBox(f, 0, W, y0, top, -0.02, recess);
        bucket.add(mats.wall[l.style], tiled(l.style, g, hash(li + fi) * 3));
        for (let u = 0; u <= W + 0.01; u += l.bayW) bucket.add(trimMat, frameBox(f, Math.max(0, u - 0.06), Math.min(W, u + 0.06), y0, top, -0.12, 0.02));
        for (let y = y0; y <= top; y += l.floorH) bucket.add(trimMat, frameBox(f, 0, W, y - 0.08, y + 0.08, -0.1, 0.02));
        continue;
      }
      const span = y1 - y0;
      if (span < 1.5) {
        if (span > 0) bucket.add(wallMat, tiled(l.style, frameBox(f, 0, W, y0, y1, 0, recess)));
      } else {
        const floors = Math.max(1, Math.round(span / l.floorH));
        const fh = span / floors;
        const edge = W < 4 ? 0.35 : 0.6;
        const bays = Math.max(1, Math.round((W - edge * 2) / l.bayW));
        const bw = (W - edge * 2) / bays;
        const [rw, rh] = WINDOW_RATIO[l.style];
        const ww = bw * rw;
        const wh = Math.min(fh * rh, fh - 0.9);
        const kind = l.style === 'concrete' || l.style === 'granite' ? windowsOffice : windowsHome;
        let lastTop = y0;
        for (let k = 0; k < floors; k++) {
          const fy = y0 + k * fh;
          const yb = fy + (fh - wh) * 0.58;
          const yt = yb + wh;
          bucket.add(wallMat, tiled(l.style, frameBox(f, 0, W, lastTop, yb, 0, recess), hash(li) * 4));
          lastTop = yt;
          let u = 0;
          for (let b = 0; b < bays; b++) {
            const cu = edge + bw * (b + 0.5);
            const wu0 = cu - ww / 2;
            bucket.add(wallMat, tiled(l.style, frameBox(f, u, wu0, yb, yt, 0, recess), hash(li) * 4));
            u = wu0 + ww;
            const seed = hash(li * 131 + fi * 17 + k * 7 + b);
            const inst = { frame: f, u: cu, y: (yb + yt) / 2, w: ww, h: wh, d: recess - 0.005 };
            kind.push(inst);
            frames.push({ ...inst, d: recess - 0.04 });
            sills.push({ frame: f, u: cu, y: yb - 0.06, w: ww + 0.22, h: 0.12, d: -0.08 });
            if (kind === windowsHome && seed < 0.13) acUnits.push({ frame: f, u: cu + (seed - 0.065) * ww * 2, y: yb + 0.24, w: Math.min(0.7, ww * 0.62), h: 0.42, d: -0.12 });
            if (l.style === 'limestone' || l.style === 'brick') {
              bucket.add(trimMat, tiled(l.style, frameBox(f, wu0 - 0.1, wu0 + ww + 0.1, yt, yt + 0.22, -0.05, recess), seed));
            }
          }
          bucket.add(wallMat, tiled(l.style, frameBox(f, u, W, yb, yt, 0, recess), hash(li) * 4));
          if ((l.style === 'limestone' || l.style === 'granite') && k % 3 === 2 && k < floors - 1) {
            bucket.add(trimMat, tiled(l.style, frameBox(f, 0, W, fy + fh - 0.08, fy + fh + 0.16, -0.12, recess)));
          }
        }
        bucket.add(wallMat, tiled(l.style, frameBox(f, 0, W, lastTop, y1, 0, recess), hash(li) * 4));
        if (l.style === 'brick' && floors >= 3 && fi === 0 && bays >= 3 && l.height < 50) {
          const b0 = Math.floor(bays / 2) - 1;
          const list: { yb: number; y: number }[] = [];
          for (let k = 0; k < floors; k++) list.push({ yb: y0 + k * fh, y: y0 + k * fh + (fh - wh) * 0.58 });
          escapes.push({ frame: f, u0: edge + bw * b0 + bw * 0.1, u1: edge + bw * (b0 + 2) - bw * 0.1, floors: list });
        }
      }
      if (hasStore) bucket.add(trimMat, tiled(l.style, frameBox(f, 0, W, sfTop - 0.05, sfTop + 0.32, -0.16, recess)));
      addCornice(bucket, f, l, top, cH, trimMat, wallMat, tiled);
    }
  }

  for (const t of towers) {
    const style: FacadeStyle = t.style;
    const g = new THREE.BoxGeometry(t.x1 - t.x0, t.height, t.z1 - t.z0);
    g.translate((t.x0 + t.x1) / 2, t.height / 2, (t.z0 + t.z1) / 2);
    const curtain = style === 'glass' || style === 'bronze';
    const mat = curtain ? mats.wall[style] : style === 'concrete' ? mats.curtain.grid : mats.wall[style];
    const [tu, tv] = curtain || style === 'concrete' ? [14, 14] : TEXTURE_METERS[style];
    bucket.add(mat, worldUV(g, tu, tv));
    const cap = new THREE.BoxGeometry(t.x1 - t.x0 + 0.6, 1.2, t.z1 - t.z0 + 0.6);
    cap.translate((t.x0 + t.x1) / 2, t.height + 0.6, (t.z0 + t.z1) / 2);
    bucket.add(mats.trim[style], worldUV(cap, 3, 3));
  }
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.55, metalness: 0.45 });
  for (const e of escapes) {
    const f = e.frame;
    for (const [k, fl] of e.floors.entries()) {
      const py = fl.y - 0.05;
      bucket.add(iron, frameBox(f, e.u0, e.u1, py - 0.05, py, -1.15, 0));
      bucket.add(iron, frameBox(f, e.u0, e.u1, py + 0.95, py + 1.0, -1.17, -1.12));
      for (let u = e.u0; u <= e.u1 + 0.01; u += 0.6) bucket.add(iron, frameBox(f, u - 0.012, u + 0.012, py, py + 0.98, -1.16, -1.13));
      for (const u of [e.u0, e.u1]) bucket.add(iron, frameBox(f, u - 0.02, u + 0.02, py, py + 0.98, -1.15, 0));
      if (k < e.floors.length - 1) {
        const next = e.floors[k + 1]!.y - 0.05;
        const steps = 9;
        for (let i = 0; i < steps; i++) {
          const a = i / steps;
          const u = e.u0 + 0.3 + (e.u1 - e.u0 - 0.9) * a;
          const yy = py + (next - py) * a;
          bucket.add(iron, frameBox(f, u, u + 0.24, yy, yy + 0.03, -0.95, -0.35));
        }
        bucket.add(iron, frameBox(f, e.u0 + 0.3, e.u1 - 0.6, (py + next) / 2 - 0.02, (py + next) / 2 + 0.02, -0.98, -0.93));
      }
    }
    const last = e.floors[0]!.y - 0.05;
    bucket.add(iron, frameBox(f, e.u1 - 0.55, e.u1 - 0.5, last - 2.6, last, -0.95, -0.9));
    bucket.add(iron, frameBox(f, e.u1 - 0.15, e.u1 - 0.1, last - 2.6, last, -0.95, -0.9));
  }
  bucket.build(group);

  const acMat = new THREE.MeshStandardMaterial({ color: 0xc7c4bb, roughness: 0.6, metalness: 0.25 });
  group.add(instanced(acUnits.map((a) => ({ ...a, d: -0.05 })), acMat, 'box', true));
  group.add(instanced(windowsOffice, interiorMaterial('office'), 'plane', false));
  group.add(instanced(windowsHome, interiorMaterial('home'), 'plane', false));
  group.add(instanced(frames, mats.white, 'frame', true));
  group.add(instanced(sills, mats.trim.limestone, 'box', true));
  void shopGlass;
  return { group, storefronts };
}

function addCornice(
  bucket: GeoBucket,
  f: Frame,
  l: Lot,
  top: number,
  cH: number,
  trim: THREE.Material,
  wall: THREE.Material,
  tiled: (s: FacadeStyle, g: THREE.BufferGeometry, off?: number) => THREE.BufferGeometry,
): void {
  const W = f.width;
  const s = l.style;
  switch (l.cornice) {
    case 'deep':
      bucket.add(wall, tiled(s, frameBox(f, 0, W, top - cH, top, 0, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.35, W + 0.35, top - 0.42, top, -0.85, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.2, W + 0.2, top - 0.7, top - 0.42, -0.45, RECESS)));
      for (let u = 0.3; u < W - 0.2; u += 0.55) bucket.add(trim, tiled(s, frameBox(f, u, u + 0.18, top - 0.98, top - 0.7, -0.3, 0)));
      break;
    case 'stepped':
      bucket.add(wall, tiled(s, frameBox(f, 0, W, top - cH, top, 0, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.15, W + 0.15, top - 1.4, top - 1.1, -0.35, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.3, W + 0.3, top - 0.35, top, -0.55, RECESS)));
      break;
    case 'thin':
      bucket.add(wall, tiled(s, frameBox(f, 0, W, top - cH, top, 0, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.1, W + 0.1, top - 0.2, top + 0.05, -0.3, RECESS)));
      break;
    case 'parapet':
      bucket.add(wall, tiled(s, frameBox(f, 0, W, top - cH, top + 0.9, 0, RECESS)));
      bucket.add(trim, tiled(s, frameBox(f, -0.05, W + 0.05, top + 0.9, top + 1.06, -0.1, RECESS + 0.3)));
      break;
    default:
      break;
  }
}

const UNIT = {
  plane: new THREE.PlaneGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  frame: (() => {
    const parts: THREE.BufferGeometry[] = [];
    const bar = (x: number, y: number, w: number, h: number): void => {
      const g = new THREE.BoxGeometry(w, h, 0.06);
      g.translate(x, y, 0);
      parts.push(g);
    };
    bar(0, 0.5, 1.04, 0.05);
    bar(0, -0.5, 1.04, 0.05);
    bar(-0.5, 0, 0.05, 1.04);
    bar(0.5, 0, 0.05, 1.04);
    bar(0, 0.12, 1.0, 0.03);
    bar(0, 0, 0.025, 1.0);
    let n = 0;
    for (const p of parts) n += p.toNonIndexed().getAttribute('position').count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    for (const p of parts) {
      const q = p.toNonIndexed();
      pos.set(q.getAttribute('position').array as Float32Array, o * 3);
      nor.set(q.getAttribute('normal').array as Float32Array, o * 3);
      o += q.getAttribute('position').count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  })(),
};

function instanced(list: WindowInstance[], mat: THREE.Material, unit: keyof typeof UNIT, cast: boolean): THREE.InstancedMesh {
  const geo = UNIT[unit].clone();
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, list.length)), 1));
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  list.forEach((w, i) => {
    const p = w.frame.origin.clone().addScaledVector(w.frame.u, w.u).add(new THREE.Vector3(0, w.y, 0)).addScaledVector(w.frame.n, -w.d);
    q.setFromUnitVectors(zAxis, w.frame.n);
    s.set(w.w, w.h, unit === 'box' ? (w.h > 0.3 ? 0.55 : 0.2) : 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
