import * as THREE from 'three';
import { AVENUE_CROSSWALK, BLOCK, CROSS_CROSSWALK } from '@lumen/shared';
import { aabbBox, GeoBucket, worldUV } from './geom';
import type { MaterialLibrary } from './materials';

const CURB_H = 0.15;
const NORTH_AVE_CW = 106.4;

export function buildStreet(mats: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'street';
  const bucket = new GeoBucket();
  const V = (x: number, y: number, n: number): THREE.Vector3 => new THREE.Vector3(x, y, -n);

  const road = new THREE.PlaneGeometry(1400, 1400);
  road.rotateX(-Math.PI / 2);
  road.translate(0, 0, -250);
  worldUV(road, 7, 7);
  const roadMesh = new THREE.Mesh(road, mats.road);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const slab = (x0: number, x1: number, n0: number, n1: number): void => {
    const g = aabbBox(V(Math.min(x0, x1), 0, Math.max(n0, n1)), V(Math.max(x0, x1), CURB_H, Math.min(n0, n1)));
    bucket.add(mats.sidewalk, worldUV(g, 3.0, 3.0));
  };
  const curb = (x0: number, x1: number, n0: number, n1: number): void => {
    const g = aabbBox(V(Math.min(x0, x1), 0, Math.max(n0, n1)), V(Math.max(x0, x1), CURB_H + 0.012, Math.min(n0, n1)));
    bucket.add(mats.curb, worldUV(g, 1.5, 1.5));
  };
  const half = BLOCK.avenueHalf;
  const line = BLOCK.buildingLine;
  const s = BLOCK.southLineN;
  const nl = BLOCK.northLineN;
  for (const side of [-1, 1]) {
    slab(side * half, side * line, -260, BLOCK.crossFrom);
    slab(side * half, side * line, BLOCK.crossTo, 700);
    slab(side * line, side * 320, s, BLOCK.crossFrom);
    slab(side * line, side * 320, BLOCK.crossTo, nl);
    curb(side * (half - 0.3), side * half, -260, BLOCK.crossFrom);
    curb(side * (half - 0.3), side * half, BLOCK.crossTo, 700);
    curb(side * half, side * 320, BLOCK.crossFrom, BLOCK.crossFrom + 0.3);
    curb(side * half, side * 320, BLOCK.crossTo - 0.3, BLOCK.crossTo);
  }
  bucket.build(group, { cast: false });

  const paint = new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9a92b, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const marks: { x: number; n: number; w: number; l: number; yellow?: boolean }[] = [];
  const inX = (n: number): boolean => n > BLOCK.crossFrom - 0.5 && n < BLOCK.crossTo + 0.5;
  for (let n = -250; n < 680; n += 9) {
    if (inX(n) || inX(n + 3)) continue;
    for (const x of [-3.5, 3.5]) marks.push({ x, n: n + 1.5, w: 0.13, l: 3 });
  }
  for (const [a, b] of [
    [-260, 83.4],
    [109.8, 700],
  ] as const) {
    for (const off of [-0.12, 0.12]) marks.push({ x: off, n: (a + b) / 2, w: 0.1, l: b - a, yellow: true });
  }
  for (const n of [AVENUE_CROSSWALK.n, NORTH_AVE_CW]) {
    for (let x = -half + 0.5; x < half - 0.3; x += 1.1) marks.push({ x: x + 0.3, n, w: 0.55, l: AVENUE_CROSSWALK.half * 2 });
  }
  marks.push({ x: half / 2, n: AVENUE_CROSSWALK.n - AVENUE_CROSSWALK.half - 1.0, w: half, l: 0.4 });
  marks.push({ x: -half / 2, n: NORTH_AVE_CW + AVENUE_CROSSWALK.half + 1.0, w: half, l: 0.4 });
  const crossMid = (BLOCK.crossFrom + BLOCK.crossTo) / 2;
  const group2: { x: number; n: number; w: number; l: number; yellow?: boolean }[] = [];
  for (const cx of [CROSS_CROSSWALK.x, -CROSS_CROSSWALK.x]) {
    for (let n = BLOCK.crossFrom + 0.5; n < BLOCK.crossTo - 0.3; n += 1.1) group2.push({ x: cx, n: n + 0.3, w: CROSS_CROSSWALK.half * 2, l: 0.55 });
  }
  group2.push({ x: -CROSS_CROSSWALK.x - CROSS_CROSSWALK.half - 1.0, n: crossMid - 3.5, w: 0.4, l: 7 });
  group2.push({ x: CROSS_CROSSWALK.x + CROSS_CROSSWALK.half + 1.0, n: crossMid + 3.5, w: 0.4, l: 7 });
  for (const sx of [-1, 1]) {
    for (let x = 14; x < 300; x += 9) group2.push({ x: sx * (x + 1.5), n: crossMid - 3.5 + 0, w: 3, l: 0.13 }, { x: sx * (x + 1.5), n: crossMid + 3.5, w: 3, l: 0.13 });
    group2.push({ x: sx * 160, n: crossMid - 0.12, w: 300, l: 0.1, yellow: true }, { x: sx * 160, n: crossMid + 0.12, w: 300, l: 0.1, yellow: true });
  }
  const all = [...marks, ...group2];
  for (const [mat, pick] of [
    [paint, false],
    [yellow, true],
  ] as const) {
    const list = all.filter((m) => Boolean(m.yellow) === pick);
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(plane, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((m, i) => {
      m4.compose(new THREE.Vector3(m.x, 0.006, -m.n), new THREE.Quaternion(), new THREE.Vector3(m.w, 1, m.l));
      im.setMatrixAt(i, m4);
    });
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}
