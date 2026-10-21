import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK } from '@lumen/shared';
import type { Lot } from '@lumen/sim';
import { frameBox, framePoint, hash, type Frame } from './geom';

const GHOST: { text: string; sub: string; band: string }[] = [
  { text: 'HOTEL ARLINGTON', sub: 'ROOMS · BATHS · BY THE WEEK', band: '#7a2a1f' },
  { text: 'SCHULER & SONS', sub: 'FINE FURNITURE · EST 1908', band: '#2f4a3a' },
  { text: 'MAJESTIC STORAGE', sub: 'FIREPROOF · MOVING · PACKING', band: '#24324a' },
  { text: "KELLER'S BAKERY", sub: 'BREAD · ROLLS · CAKES', band: '#6b4a1e' },
  { text: 'UNION LAUNDRY', sub: 'COLLARS AND CUFFS · DAILY', band: '#4a2a40' },
  { text: 'PIANOS · ORGANS', sub: 'TUNING AND REPAIR · 3RD FLOOR', band: '#3a3a3a' },
];

interface Face {
  frame: Frame;
  y0: number;
  y1: number;
  u0: number;
  u1: number;
  seed: number;
}

function sideFrames(l: Lot): { frame: Frame; boundary: number; dir: 1 | -1 }[] {
  const line = BLOCK.buildingLine;
  if (l.street === 'avenue') {
    const x = l.side === 'W' ? -line - l.setback : line + l.setback;
    const inward = new THREE.Vector3(l.side === 'W' ? -1 : 1, 0, 0);
    return [
      { frame: { origin: new THREE.Vector3(x, 0, -l.a1), u: inward, n: new THREE.Vector3(0, 0, -1), width: l.depth }, boundary: l.a1, dir: 1 },
      { frame: { origin: new THREE.Vector3(x, 0, -l.a0), u: inward, n: new THREE.Vector3(0, 0, 1), width: l.depth }, boundary: l.a0, dir: -1 },
    ];
  }
  const z = l.side === 'N' ? -(BLOCK.northLineN + l.setback) : -(BLOCK.southLineN - l.setback);
  const inward = new THREE.Vector3(0, 0, l.side === 'N' ? -1 : 1);
  return [
    { frame: { origin: new THREE.Vector3(l.a1, 0, z), u: inward, n: new THREE.Vector3(1, 0, 0), width: l.depth }, boundary: l.a1, dir: 1 },
    { frame: { origin: new THREE.Vector3(l.a0, 0, z), u: inward, n: new THREE.Vector3(-1, 0, 0), width: l.depth }, boundary: l.a0, dir: -1 },
  ];
}

function exposedFaces(lots: Lot[]): Face[] {
  const out: Face[] = [];
  lots.forEach((l, i) => {
    if (l.kindOf === 'park' || l.kindOf === 'mural' || l.style === 'glass' || l.style === 'bronze' || l.height < 12) return;
    for (const s of sideFrames(l)) {
      const neighbor = lots.find((m) => m !== l && m.street === l.street && m.side === l.side && Math.abs((s.dir === 1 ? m.a0 : m.a1) - s.boundary) < 0.8);
      const below = neighbor && neighbor.kindOf !== 'park' ? neighbor.height : 0;
      const y0 = Math.max(below + 0.8, 4.2);
      const y1 = l.height - 1.4;
      const u0 = 0.8 + (neighbor ? Math.max(0, neighbor.setback - l.setback) : 0);
      const u1 = Math.min(l.depth, 18) - 0.8;
      if (y1 - y0 < 4.5 || u1 - u0 < 5) continue;
      out.push({ frame: s.frame, y0, y1, u0, u1, seed: hash(i * 7 + (s.dir === 1 ? 3 : 5)) });
    }
  });
  return out;
}

function ghostCanvas(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ad: (typeof GHOST)[number], seed: number): void {
  let s = Math.floor(seed * 2147483646) + 1;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = ad.band;
  g.globalAlpha = 0.7;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  g.fillStyle = '#efe6cf';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * 0.36;
  g.font = `400 ${size}px "Archivo Black", "Arial Black", sans-serif`;
  while (g.measureText(ad.text).width > w * 0.88 && size > 8) {
    size *= 0.94;
    g.font = `400 ${size}px "Archivo Black", "Arial Black", sans-serif`;
  }
  g.fillText(ad.text, x + w / 2, y + h * 0.4);
  let sub = h * 0.13;
  g.font = `700 ${sub}px "Instrument Sans", Arial, sans-serif`;
  while (g.measureText(ad.sub).width > w * 0.84 && sub > 6) {
    sub *= 0.94;
    g.font = `700 ${sub}px "Instrument Sans", Arial, sans-serif`;
  }
  g.fillText(ad.sub, x + w / 2, y + h * 0.75);
  g.strokeStyle = '#efe6cf';
  g.lineWidth = h * 0.02;
  g.strokeRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) {
    g.globalAlpha = 0.25 + rnd() * 0.6;
    const bx = x + rnd() * w;
    const by = y + rnd() * h;
    g.fillRect(bx, by, 4 + rnd() * 26, 2 + rnd() * 7);
  }
  for (let row = 0; row < h; row += h / 18) {
    g.globalAlpha = 0.35;
    g.fillRect(x, y + row, w, 1.5);
  }
  g.restore();
}

export function buildPartyWalls(lots: Lot[], renderer: THREE.WebGLRenderer, mats: { glass: THREE.Material; trim: THREE.Material }): THREE.Group {
  const group = new THREE.Group();
  group.name = 'party-walls';
  const faces = exposedFaces(lots);
  const facing = (f: Face): number => (-f.frame.origin.z < 8 ? -5 : 0) + f.frame.n.z * 2 - Math.abs(f.frame.origin.x) * f.frame.n.x * Math.sign(f.frame.origin.x) * 0.05 + (f.y1 - f.y0) * 0.02;
  const ghostFaces = [...faces].sort((a, b) => facing(b) - facing(a)).filter((f) => facing(f) > 0.2).slice(0, GHOST.length);
  const windowFaces = faces.filter((f) => !ghostFaces.includes(f));
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const cellW = W / 2;
  const cellH = H / 3;
  const pos: number[] = [];
  const uv: number[] = [];
  ghostFaces.forEach((f, i) => {
    const ad = GHOST[Math.floor(f.seed * 997) % GHOST.length]!;
    const cx = (i % 2) * cellW;
    const cy = Math.floor(i / 2) * cellH;
    ghostCanvas(g, cx + 4, cy + 4, cellW - 8, cellH - 8, ad, f.seed);
    const width = Math.min(f.u1 - f.u0, 13);
    const height = Math.min(f.y1 - f.y0, width * (cellH / cellW) * 1.0);
    const u0 = f.u0 + (f.u1 - f.u0 - width) * 0.35;
    const y0 = f.y1 - height - 0.6;
    const p = (u: number, y: number): THREE.Vector3 => framePoint(f.frame, u, y, -0.025);
    const quad = [p(u0, y0), p(u0 + width, y0), p(u0 + width, y0 + height), p(u0, y0 + height)];
    const flip = f.frame.u.x * f.frame.n.z - f.frame.u.z * f.frame.n.x >= 0 ? 1 : -1;
    const u = (k: number): number => (flip > 0 ? k : 1 - k);
    const U0 = (cx + 4) / W;
    const U1 = (cx + cellW - 4) / W;
    const V0 = 1 - (cy + cellH - 4) / H;
    const V1 = 1 - (cy + 4) / H;
    const uvs = [
      [U0 + (U1 - U0) * u(0), V0],
      [U0 + (U1 - U0) * u(1), V0],
      [U0 + (U1 - U0) * u(1), V1],
      [U0 + (U1 - U0) * u(0), V1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(quad[k]!.x, quad[k]!.y, quad[k]!.z);
      uv.push(uvs[k]![0]!, uvs[k]![1]!);
    }
  });
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  const glass: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  for (const f of windowFaces) {
    const cols = (f.u1 - f.u0) > 9 ? 2 : 1;
    const rows = Math.max(1, Math.min(4, Math.floor((f.y1 - f.y0) / 3.4)));
    for (let c = 0; c < cols; c++) {
      const uc = f.u0 + 1.4 + c * 3.2 + f.seed * 1.5;
      for (let r = 0; r < rows; r++) {
        if (hash(f.seed * 100 + c * 7 + r) < 0.25) continue;
        const yb = f.y0 + 0.6 + r * 3.4;
        glass.push(frameBox(f.frame, uc, uc + 0.9, yb, yb + 1.5, -0.01, 0.12));
        trim.push(frameBox(f.frame, uc - 0.08, uc + 0.98, yb - 0.14, yb, -0.1, 0.12));
        trim.push(frameBox(f.frame, uc - 0.06, uc + 0.96, yb + 1.5, yb + 1.62, -0.06, 0.12));
      }
    }
  }
  if (glass.length) group.add(new THREE.Mesh(mergeGeometries(glass), mats.glass));
  if (trim.length) {
    const m = new THREE.Mesh(mergeGeometries(trim), mats.trim);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
