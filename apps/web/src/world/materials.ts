import * as THREE from 'three';
import type { FacadeStyle } from '@lumen/sim';

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap?: THREE.Texture;
}

export interface MaterialLibrary {
  wall: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  trim: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  curtain: { glass: THREE.MeshStandardMaterial; bronze: THREE.MeshStandardMaterial; grid: THREE.MeshStandardMaterial };
  sidewalk: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  metalPaint: THREE.MeshStandardMaterial;
  storefront: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
}

const loader = new THREE.TextureLoader();

function tex(url: string, srgb: boolean, aniso: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(t);
      },
      undefined,
      () => reject(new Error(`texture ${url}`)),
    );
  });
}

async function pbr(name: string, aniso: number, ao = true): Promise<PbrSet> {
  const base = `/assets/tex/${name}`;
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
    tex(`${base}_color.jpg`, true, aniso),
    tex(`${base}_normal.jpg`, false, aniso),
    tex(`${base}_rough.jpg`, false, aniso),
    ao ? tex(`${base}_ao.jpg`, false, aniso).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const set: PbrSet = { map, normalMap, roughnessMap };
  if (aoMap) set.aoMap = aoMap;
  return set;
}

function std(set: PbrSet, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...(set.aoMap ? { aoMap: set.aoMap, aoMapIntensity: 0.85 } : {}),
    ...opts,
  });
}

export async function loadMaterials(renderer: THREE.WebGLRenderer): Promise<MaterialLibrary> {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [brick, oldBrick, lime, granite, conc, concRough, plaster, paving, road, glass, bronze, grid, bark] = await Promise.all([
    pbr('bricks085', aniso),
    pbr('bricks094', aniso),
    pbr('tiles143', aniso),
    pbr('granite002b', aniso),
    pbr('concrete034', aniso),
    pbr('concrete044d', aniso),
    pbr('paintedplaster017', aniso),
    pbr('pavingstones136', aniso),
    pbr('road012a', aniso),
    pbr('facade001', aniso, false),
    pbr('facade018a', aniso, false),
    pbr('facade020a', aniso, false),
    pbr('bark014', aniso),
  ]);
  const ns = (k: number): THREE.Vector2 => new THREE.Vector2(k, k);
  const wall: MaterialLibrary['wall'] = {
    limestone: std(lime, { color: new THREE.Color(0.78, 0.8, 0.84), normalScale: ns(0.9) }),
    brick: std(brick, { color: new THREE.Color(0.96, 0.9, 0.88), normalScale: ns(1.1) }),
    granite: std(granite, { color: new THREE.Color(0.74, 0.71, 0.7), normalScale: ns(0.6) }),
    concrete: std(conc, { color: new THREE.Color(0.76, 0.76, 0.76), normalScale: ns(0.7) }),
    glass: std(glass, { metalness: 0.55, roughness: 0.5, envMapIntensity: 1.1 }),
    bronze: std(bronze, { metalness: 0.45, roughness: 0.65, envMapIntensity: 1.0, color: new THREE.Color(1.0, 0.92, 0.8) }),
    painted: std(plaster, { color: new THREE.Color(0.8, 0.74, 0.62), normalScale: ns(0.7) }),
  };
  const trim: MaterialLibrary['trim'] = {
    limestone: std(lime, { color: new THREE.Color(1.04, 1.0, 0.92) }),
    brick: std(lime, { color: new THREE.Color(0.98, 0.94, 0.86) }),
    granite: std(granite, { color: new THREE.Color(0.78, 0.76, 0.76) }),
    concrete: std(concRough, { color: new THREE.Color(0.88, 0.88, 0.88) }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.8 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.45, metalness: 0.85 }),
    painted: std(conc, { color: new THREE.Color(0.95, 0.93, 0.88) }),
  };
  void oldBrick;
  return {
    wall,
    trim,
    curtain: {
      glass: wall.glass,
      bronze: wall.bronze,
      grid: std(grid, { metalness: 0.35, roughness: 0.55, envMapIntensity: 0.9 }),
    },
    sidewalk: std(paving, { color: new THREE.Color(0.96, 0.98, 1.08), normalScale: ns(0.8) }),
    road: std(road, { color: new THREE.Color(0.82, 0.82, 0.84), normalScale: ns(0.8) }),
    curb: std(granite, { color: new THREE.Color(0.8, 0.79, 0.77) }),
    concrete: std(concRough),
    bark: std(bark),
    roof: new THREE.MeshStandardMaterial({ color: 0x6a6763, roughness: 0.95 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.62, metalness: 0.3 }),
    metalPaint: new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.55, metalness: 0.4 }),
    storefront: new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.45, metalness: 0.5 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  };
}

export const TEXTURE_METERS: Record<FacadeStyle, [number, number]> = {
  limestone: [3.2, 3.2],
  brick: [2.2, 2.2],
  granite: [2.5, 2.5],
  concrete: [3.5, 3.5],
  glass: [14, 14],
  bronze: [14, 14],
  painted: [2.6, 2.6],
};
