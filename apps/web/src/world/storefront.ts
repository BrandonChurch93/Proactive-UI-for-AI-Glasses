import * as THREE from 'three';
import { PLACE_BY_ID } from '@lumen/shared';
import type { Lot, Storefront } from '@lumen/sim';
import { frameBox, framePoint, GeoBucket, hash, worldUV, type Frame } from './geom';
import { interiorMaterial } from './interior';
import type { MaterialLibrary } from './materials';
import { muralCanvas, signCanvas, SignAtlas, type AtlasOpts, type SignStyle } from './signs';

interface GlassPane {
  frame: Frame;
  u: number;
  y: number;
  w: number;
  h: number;
  d: number;
}

export interface StorefrontOutput {
  group: THREE.Group;
  theater?: { bulbs: THREE.InstancedMesh; blade: THREE.Mesh; front: THREE.Mesh };
}

const DEPTH = 0.42;

function onFace(atlas: SignAtlas, f: Frame, u0: number, u1: number, y0: number, y1: number, d: number, canvas: HTMLCanvasElement, opts: AtlasOpts = {}): void {
  atlas.add(canvas, [framePoint(f, u0, y0, d), framePoint(f, u1, y0, d), framePoint(f, u1, y1, d), framePoint(f, u0, y1, d)], opts);
}

function planeOn(f: Frame, u0: number, u1: number, y0: number, y1: number, d: number, mat: THREE.Material, flip = false): THREE.Mesh {
  const g = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
  const m = new THREE.Mesh(g, mat);
  const c = framePoint(f, (u0 + u1) / 2, (y0 + y1) / 2, d);
  m.position.copy(c);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flip ? f.n.clone().negate() : f.n);
  m.receiveShadow = true;
  return m;
}

function signFor(sf: Storefront, lot: Lot, W: number): { fascia?: SignStyle; awning?: SignStyle; blade?: SignStyle; vinyl?: SignStyle; neon?: SignStyle; painted?: SignStyle; channel?: SignStyle } {
  const place = sf.placeId ? PLACE_BY_ID.get(sf.placeId) : undefined;
  const name = place?.name ?? sf.name ?? '';
  const up = name.toUpperCase();
  const bandW = W - 0.9;
  switch (sf.placeId) {
    case 'mega-burger':
      return { channel: { text: 'MEGA BURGER', bg: sf.color, fg: sf.accent, w: bandW, h: 0.95, transparent: true, glow: 'rgba(255,200,60,0.6)' }, awning: { text: 'FLAME GRILLED · SINCE 1994', bg: sf.color, fg: '#fff3d6', w: W - 1, h: 0.26, font: 'ui' } };
    case 'lucky-lanes':
      return { neon: { text: 'Lucky Lanes', bg: '#0b0f18', fg: '#ffe6ee', glow: '#ff3d74', w: bandW, h: 0.95, font: 'script' }, vinyl: { text: 'BOWLING · ARCADE · BAR', bg: '', fg: '#ffffff', w: 3.2, h: 0.32, transparent: true, font: 'ui' } };
    case 'atlas-books':
      return { fascia: { text: 'ATLAS BOOKS', sub: 'NEW · USED · RARE', bg: sf.color, fg: sf.accent, w: bandW, h: 0.95, border: sf.accent } };
    case 'trattoria-da-lia':
      return { fascia: { text: 'Trattoria da Lia', bg: '#1f2a22', fg: '#efe2c4', w: bandW, h: 0.95, font: 'serif' }, awning: { text: 'Cucina casalinga · aperto fino alle 23', bg: sf.color, fg: sf.accent, w: W - 1, h: 0.26, font: 'serif', stripes: 'rgba(255,255,255,0.0)' } };
    case 'goldies-counter':
      return { fascia: { text: "GOLDIE'S", sub: 'COUNTER · DELI · SINCE 1961', bg: sf.color, fg: sf.accent, w: bandW, h: 0.95 }, awning: { text: 'PASTRAMI · SOUP · EGG CREAMS', bg: sf.accent, fg: '#f3e4c2', w: W - 1, h: 0.26, font: 'ui' } };
    case 'kathys-cupcakes':
      return { fascia: { text: "Kathy's Cupcakes", bg: '#fbe9ee', fg: sf.accent, w: bandW, h: 0.95, font: 'script' }, awning: { text: 'BAKED FRESH ALL DAY', bg: sf.color, fg: sf.accent, w: W - 1, h: 0.26, font: 'ui', stripes: 'rgba(255,255,255,0.55)' } };
    case 'big-bean':
      return { fascia: { text: 'THE BIG BEAN', sub: 'ESPRESSO BAR', bg: sf.color, fg: sf.accent, w: bandW, h: 0.95 } };
    case 'main-street-pharmacy':
      return { channel: { text: 'MAIN STREET PHARMACY', bg: '#1b1d20', fg: '#ffffff', w: bandW, h: 0.95, transparent: true, glow: 'rgba(255,255,255,0.4)' }, blade: { text: '+', bg: sf.accent, fg: '#ffffff', w: 0.9, h: 0.9, font: 'ui' } };
    case 'corner-hardware':
      return { fascia: { text: 'HARDWARE · KEYS CUT', bg: '#2b2f33', fg: '#f3e8d0', w: bandW, h: 0.95 }, painted: { text: 'CORNER HARDWARE', sub: 'PAINT · TOOLS · LOCKS · SINCE 1952', bg: '', fg: 'rgba(243,232,208,0.86)', w: Math.min(W - 1.4, 9), h: 2.6, transparent: true } };
    case 'post-office':
      return { channel: { text: 'POST OFFICE', bg: '', fg: sf.accent, w: Math.min(bandW, 6.2), h: 0.8, transparent: true } };
    case 'grace-theater':
      return {};
    default:
      break;
  }
  if (sf.kind === 'garage') return { fascia: { text: 'PARKING', sub: 'ENTRANCE · 24 HRS', bg: sf.color, fg: sf.accent, w: Math.min(bandW, 4), h: 0.9 } };
  if (sf.kind === 'lobby') return { channel: { text: up, bg: '', fg: sf.accent, w: Math.min(bandW, 3.2), h: 0.5, transparent: true } };
  if (sf.kind === 'blank') return {};
  switch (sf.format) {
    case 'awning':
      return { awning: { text: up, bg: sf.color, fg: sf.accent, w: W - 1, h: 0.26, font: 'ui' }, fascia: { text: up, bg: '#1d2024', fg: sf.accent, w: bandW, h: 0.95 } };
    case 'blade':
      return { blade: { text: name.split(' ')[0]!.toUpperCase(), bg: sf.color, fg: sf.accent, w: 0.9, h: 2.4 }, fascia: { text: up, bg: '#22252a', fg: '#e8e2d2', w: bandW, h: 0.95, font: 'ui' } };
    case 'vinyl':
      return { vinyl: { text: up, bg: '', fg: sf.accent, w: Math.min(W - 2.4, 4.2), h: 0.55, transparent: true }, fascia: { text: up, bg: sf.color, fg: sf.accent, w: bandW, h: 0.95 } };
    case 'neon':
      return { neon: { text: name, bg: '#0d0f14', fg: '#fff2f6', glow: sf.accent, w: bandW, h: 0.95, font: 'script' } };
    case 'channel':
      return { channel: { text: up, bg: '', fg: sf.accent, w: bandW, h: 0.9, transparent: true } };
    default:
      return { fascia: { text: up, bg: sf.color, fg: sf.accent, w: bandW, h: 0.95 } };
  }
}

export function buildStorefronts(
  list: { lot: Lot; frame: Frame; u0: number; u1: number; top: number }[],
  mats: MaterialLibrary,
  renderer: THREE.WebGLRenderer,
  atlas: SignAtlas,
): StorefrontOutput {
  const group = new THREE.Group();
  group.name = 'storefronts';
  const bucket = new GeoBucket();
  const glass: GlassPane[] = [];
  const doorGlass: GlassPane[] = [];
  const out: StorefrontOutput = { group };
  const dark = mats.storefront;

  for (const [i, s] of list.entries()) {
    const { lot, frame: f } = s;
    const sf = lot.storefronts[0];
    if (!sf) continue;
    const W = s.u1 - s.u0;
    const top = s.top;
    const trim = lot.style === 'glass' || lot.style === 'bronze' ? dark : mats.trim[lot.style];
    const tiled = (g: THREE.BufferGeometry): THREE.BufferGeometry => worldUV(g, 2.6, 2.6, hash(i));

    if (lot.kindOf === 'mural' || sf.kind === 'blank') {
      if (lot.kindOf === 'mural') {
        onFace(atlas, f, 0.3, W - 0.3, 0.4, Math.min(lot.height - 0.2, 8.4), -0.02, muralCanvas(W - 0.6, Math.min(lot.height - 0.6, 8), sf.color, sf.accent, 7 + i), { rough: 0.9 });
        bucket.add(mats.wall.brick, worldUV(frameBox(f, 0, W, 0, lot.height, 0, 0.6), 2.2, 2.2));
        bucket.add(mats.trim.concrete, worldUV(frameBox(f, -0.05, W + 0.05, lot.height, lot.height + 0.18, -0.08, 0.7), 2, 2));
      }
      continue;
    }

    if (sf.placeId === 'grace-theater') {
      out.theater = buildTheater(group, bucket, f, W, top, mats, renderer);
      continue;
    }

    const pil = W > 6 ? 0.5 : 0.36;
    bucket.add(trim, tiled(frameBox(f, 0, pil, 0, top, -0.06, DEPTH)));
    bucket.add(trim, tiled(frameBox(f, W - pil, W, 0, top, -0.06, DEPTH)));
    const bandBot = top - 1.05;
    bucket.add(dark, frameBox(f, pil, W - pil, bandBot, top - 0.04, -0.03, DEPTH));
    bucket.add(trim, tiled(frameBox(f, pil, W - pil, bandBot - 0.12, bandBot, -0.08, DEPTH)));

    if (sf.kind === 'garage') {
      bucket.add(dark, frameBox(f, pil, W - pil, 0, bandBot - 0.12, 2.2, 2.3));
      for (let y = 0.2; y < bandBot - 0.2; y += 0.22) bucket.add(mats.metalDark, frameBox(f, pil + 0.1, W - pil - 0.1, y, y + 0.03, 2.15, 2.2));
      bucket.add(trim, tiled(frameBox(f, pil, W - pil, bandBot - 0.6, bandBot - 0.12, -0.02, 2.2)));
    } else {
      const doorW = sf.kind === 'lobby' ? 2.4 : 1.7;
      const doorAt = sf.kind === 'lobby' ? W / 2 : hash(i * 3.1) > 0.5 ? pil + 0.4 + doorW / 2 : W - pil - 0.4 - doorW / 2;
      const d0 = doorAt - doorW / 2;
      const d1 = doorAt + doorW / 2;
      const recess = 1.1;
      bucket.add(dark, frameBox(f, d0 - 0.06, d0, 0, bandBot - 0.12, DEPTH, DEPTH + recess));
      bucket.add(dark, frameBox(f, d1, d1 + 0.06, 0, bandBot - 0.12, DEPTH, DEPTH + recess));
      bucket.add(dark, frameBox(f, d0, d1, bandBot - 0.6, bandBot - 0.12, DEPTH, DEPTH + recess));
      doorGlass.push({ frame: f, u: doorAt, y: (bandBot - 0.6) / 2, w: doorW - 0.1, h: bandBot - 0.62, d: DEPTH + recess });
      bucket.add(mats.metalDark, frameBox(f, doorAt - 0.02, doorAt + 0.02, 0, bandBot - 0.6, DEPTH + recess - 0.06, DEPTH + recess - 0.02));
      const segs: [number, number][] = [
        [pil, d0 - 0.06],
        [d1 + 0.06, W - pil],
      ];
      for (const [a, b] of segs) {
        if (b - a < 0.4) continue;
        bucket.add(dark, frameBox(f, a, b, 0, 0.52, DEPTH - 0.18, DEPTH));
        const n = Math.max(1, Math.round((b - a) / 2.2));
        const pw = (b - a) / n;
        for (let k = 0; k < n; k++) {
          const u = a + pw * (k + 0.5);
          glass.push({ frame: f, u, y: (0.52 + bandBot - 0.12) / 2, w: pw - 0.08, h: bandBot - 0.12 - 0.52, d: DEPTH - 0.02 });
          if (k > 0) bucket.add(mats.metalDark, frameBox(f, a + pw * k - 0.04, a + pw * k + 0.04, 0.52, bandBot - 0.12, DEPTH - 0.08, DEPTH));
        }
      }
    }

    const signs = signFor(sf, lot, W);
    const bandY0 = bandBot + 0.03;
    const bandY1 = top - 0.07;
    const cu = W / 2;
    if (signs.fascia) {
      onFace(atlas, f, cu - signs.fascia.w / 2, cu + signs.fascia.w / 2, bandY0, bandY1, -0.035, signCanvas(signs.fascia));
    }
    if (signs.channel) {
      const hh = Math.min(signs.channel.h, bandY1 - bandY0);
      const yc = (bandY0 + bandY1) / 2;
      onFace(atlas, f, cu - signs.channel.w / 2, cu + signs.channel.w / 2, yc - hh / 2, yc + hh / 2, -0.09, signCanvas({ ...signs.channel, transparent: true }, 260), { emissive: signs.channel.glow ? 0.9 : 0.25, alpha: true });
    }
    if (signs.neon) {
      onFace(atlas, f, cu - signs.neon.w / 2, cu + signs.neon.w / 2, bandY0, bandY1, -0.04, signCanvas(signs.neon, 220), { emissive: 2.4 });
    }
    if (signs.painted) {
      const p = signs.painted;
      const y0 = top + 1.2;
      onFace(atlas, f, cu - p.w / 2, cu + p.w / 2, y0, y0 + p.h, -0.005, signCanvas({ ...p, transparent: true }, 120), { alpha: true, rough: 0.95 });
    }
    if (signs.vinyl && sf.kind !== 'garage') {
      const v = signs.vinyl;
      const au = W / 2 > 3 ? W * 0.3 : W / 2;
      onFace(atlas, f, au - v.w / 2, au + v.w / 2, 1.9, 1.9 + v.h, DEPTH - 0.05, signCanvas({ ...v, transparent: true }, 240), { alpha: true });
    }
    if (signs.blade) {
      const b = signs.blade;
      const at = hash(i * 5.7) > 0.5 ? 0.25 : W - 0.25;
      const y0 = top + 0.4;
      const d0 = -0.15;
      const d1 = -0.15 - b.w;
      const side = (sign: number): THREE.Vector3 => f.u.clone().multiplyScalar(0.045 * sign);
      const c = signCanvas(b, 200);
      const P = (d: number, y: number, s: number): THREE.Vector3 => framePoint(f, at, y, d).add(side(s));
      atlas.add(c, [P(d0, y0, -1), P(d1, y0, -1), P(d1, y0 + b.h, -1), P(d0, y0 + b.h, -1)], { emissive: sf.placeId ? 0.35 : 0.12 });
      atlas.add(c, [P(d1, y0, 1), P(d0, y0, 1), P(d0, y0 + b.h, 1), P(d1, y0 + b.h, 1)], { emissive: sf.placeId ? 0.35 : 0.12 });
      bucket.add(dark, frameBox(f, at - 0.04, at + 0.04, y0 - 0.05, y0 + b.h + 0.05, d0 + 0.02, d1 - 0.02));
      bucket.add(mats.metalDark, frameBox(f, at - 0.03, at + 0.03, y0 + b.h - 0.08, y0 + b.h - 0.02, -0.02, d1 - 0.1));
    }
    if (sf.awning && signs.awning) {
      addAwning(atlas, f, W, bandBot, signs.awning);
    }
  }
  bucket.build(group);
  group.add(glassMesh(glass, interiorMaterial('shop')));
  group.add(glassMesh(doorGlass, interiorMaterial('shop')));
  return out;
}

function addAwning(atlas: SignAtlas, f: Frame, W: number, bandBot: number, s: SignStyle): void {
  const proj = 1.5;
  const drop = 0.7;
  const yTop = bandBot + 0.05;
  const span = W - 0.6;
  const c = document.createElement('canvas');
  c.width = Math.min(1000, Math.round(span * 60));
  c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = s.bg;
  x.fillRect(0, 0, c.width, c.height);
  if (s.stripes && s.stripes !== 'rgba(255,255,255,0.0)') {
    x.fillStyle = s.stripes;
    const sw = c.width / Math.max(4, Math.round(span / 0.32));
    for (let i = 0; i < c.width; i += sw * 2) x.fillRect(i, 0, sw, c.height);
  }
  const grad = x.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0.05)');
  x.fillStyle = grad;
  x.fillRect(0, 0, c.width, c.height);
  const P = (u: number, y: number, d: number): THREE.Vector3 => framePoint(f, u, y, d);
  atlas.add(c, [P(0.3, yTop - drop, -proj), P(W - 0.3, yTop - drop, -proj), P(W - 0.3, yTop, 0), P(0.3, yTop, 0)], { rough: 0.92, doubleSided: true });
  atlas.add(c, [P(0.3, yTop - drop - 0.3, -proj), P(0.3, yTop - 0.3, 0), P(0.3, yTop, 0), P(0.3, yTop - drop, -proj)], { rough: 0.92, doubleSided: true });
  atlas.add(c, [P(W - 0.3, yTop - 0.3, 0), P(W - 0.3, yTop - drop - 0.3, -proj), P(W - 0.3, yTop - drop, -proj), P(W - 0.3, yTop, 0)], { rough: 0.92, doubleSided: true });
  onFace(atlas, f, 0.3, W - 0.3, yTop - drop - 0.3, yTop - drop, -proj, signCanvas(s, 300), { rough: 0.9 });
  const yb = yTop - drop - 0.3;
  const yt = yTop - drop;
  const d = -proj + 0.012;
  atlas.add(c, [P(W - 0.3, yb, d), P(0.3, yb, d), P(0.3, yt, d), P(W - 0.3, yt, d)], { rough: 0.92 });
}

function glassMesh(list: GlassPane[], mat: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, list.length));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach((p, i) => {
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.frame.n);
    m4.compose(framePoint(p.frame, p.u, p.y, p.d), q, new THREE.Vector3(p.w, p.h, 1));
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = list.length;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function buildTheater(group: THREE.Group, bucket: GeoBucket, f: Frame, W: number, top: number, mats: MaterialLibrary, renderer: THREE.WebGLRenderer): NonNullable<StorefrontOutput['theater']> {
  const red = new THREE.MeshStandardMaterial({ color: 0x7a1818, roughness: 0.55, metalness: 0.1 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2e6c4, roughness: 0.5, emissive: 0x5a4a28, emissiveIntensity: 0.35 });
  bucket.add(mats.trim.limestone, worldUV(frameBox(f, 0, 0.6, 0, top + 0.2, -0.08, DEPTH), 2, 2));
  bucket.add(mats.trim.limestone, worldUV(frameBox(f, W - 0.6, W, 0, top + 0.2, -0.08, DEPTH), 2, 2));
  bucket.add(mats.storefront, frameBox(f, 0.6, W - 0.6, 0, top, DEPTH, DEPTH + 0.1));
  const posterMat = new THREE.MeshStandardMaterial({ color: 0x3a2630, roughness: 0.6 });
  for (const u of [1.4, W - 1.4]) {
    bucket.add(mats.metalDark, frameBox(f, u - 0.75, u + 0.75, 0.9, 2.9, DEPTH - 0.1, DEPTH));
    group.add(planeOn(f, u - 0.62, u + 0.62, 1.0, 2.8, DEPTH - 0.11, posterMat));
  }
  const doorGlass = interiorMaterial('shop');
  const doors = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), doorGlass, 4);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.n);
  for (let k = 0; k < 4; k++) {
    const m4 = new THREE.Matrix4().compose(framePoint(f, W / 2 - 2.4 + k * 1.6, 1.45, DEPTH - 0.01), q, new THREE.Vector3(1.4, 2.7, 1));
    doors.setMatrixAt(k, m4);
  }
  group.add(doors);

  const mTop = 5.2;
  const mBot = 3.7;
  const proj = 1.7;
  const len = W - 0.5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
  box.scale.set(1, 1, 1);
  const boxGeo = frameBox(f, 0.25, W - 0.25, mBot + 0.08, mTop, -proj, 0);
  const boxMesh = new THREE.Mesh(boxGeo, red);
  boxMesh.castShadow = true;
  boxMesh.receiveShadow = true;
  group.add(boxMesh);
  void box;
  group.add(new THREE.Mesh(frameBox(f, 0.25, W - 0.25, mBot, mBot + 0.08, -proj, 0), cream));
  const mc = document.createElement('canvas');
  mc.width = 2048;
  mc.height = 384;
  const mg = mc.getContext('2d')!;
  mg.fillStyle = '#f5ead0';
  mg.fillRect(0, 0, 2048, 384);
  mg.fillStyle = '#1a1512';
  mg.textAlign = 'center';
  mg.textBaseline = 'middle';
  mg.font = '400 150px "Archivo Black", Arial';
  mg.fillText('GRACE THEATER', 1024, 120);
  mg.font = '700 92px "Instrument Sans", Arial';
  mg.fillStyle = '#7a1818';
  mg.fillText('TONIGHT · NIGHT MARKET · 8:00', 1024, 282);
  const mt = new THREE.CanvasTexture(mc);
  mt.colorSpace = THREE.SRGBColorSpace;
  mt.anisotropy = 8;
  const frontMat = new THREE.MeshStandardMaterial({ map: mt, emissiveMap: mt, emissive: 0xffffff, emissiveIntensity: 0.36, roughness: 0.6 });
  const front = planeOn(f, 0.5, W - 0.5, mBot + 0.2, mTop - 0.2, -proj - 0.01, frontMat);
  group.add(front);
  const side = (u: number): void => {
    group.add(new THREE.Mesh(frameBox(f, u - 0.01, u + 0.01, mBot + 0.2, mTop - 0.2, -proj + 0.1, -0.1), frontMat));
  };
  side(0.24);
  side(W - 0.24);

  const bulbG = new THREE.SphereGeometry(0.07, 10, 8);
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd27a, emissiveIntensity: 3.2, roughness: 0.3 });
  const pts: THREE.Vector3[] = [];
  for (let u = 0.45; u < len; u += 0.45) for (const y of [mBot + 0.08, mTop]) pts.push(framePoint(f, u, y, -proj - 0.04));
  for (const y of [3.9, 4.12, 4.34, 4.56, 4.78, 5.0]) {
    pts.push(framePoint(f, 0.3, y, -proj - 0.04), framePoint(f, W - 0.3, y, -proj - 0.04));
  }
  for (let u = 0.45; u < len; u += 0.45) pts.push(framePoint(f, u, mBot + 0.02, -proj + 0.2));
  const bulbs = new THREE.InstancedMesh(bulbG, bulbM, pts.length);
  pts.forEach((p, i) => bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(bulbs);

  const bc = document.createElement('canvas');
  bc.width = 256;
  bc.height = 1024;
  const bg = bc.getContext('2d')!;
  bg.fillStyle = '#8f1d1d';
  bg.fillRect(0, 0, 256, 1024);
  bg.fillStyle = '#fff1c9';
  bg.font = '400 150px "Archivo Black", Arial';
  bg.textAlign = 'center';
  bg.textBaseline = 'middle';
  'GRACE'.split('').forEach((ch, i) => bg.fillText(ch, 128, 120 + i * 190));
  const bt = new THREE.CanvasTexture(bc);
  bt.colorSpace = THREE.SRGBColorSpace;
  const bladeM = new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.55 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.5), [red, red, red, red, bladeM, bladeM]);
  blade.position.copy(framePoint(f, W - 1.4, 10.5, -0.9));
  blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.u.clone().negate());
  blade.castShadow = true;
  group.add(blade);
  void renderer;
  return { bulbs, blade, front };
}
