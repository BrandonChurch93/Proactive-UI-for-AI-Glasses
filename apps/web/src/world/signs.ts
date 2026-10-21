import * as THREE from 'three';

export interface SignStyle {
  text: string;
  sub?: string;
  bg: string;
  fg: string;
  font?: 'sign' | 'ui' | 'script' | 'serif';
  w: number;
  h: number;
  pad?: number;
  transparent?: boolean;
  stripes?: string;
  glow?: string;
  align?: 'center' | 'left';
  border?: string;
}

const FAMILY: Record<NonNullable<SignStyle['font']>, string> = {
  sign: '"Archivo Black", "Arial Black", sans-serif',
  ui: '"Instrument Sans", Arial, sans-serif',
  script: '"Instrument Sans", Georgia, serif',
  serif: 'Georgia, "Times New Roman", serif',
};

export function signCanvas(s: SignStyle, pxPerM = 180): HTMLCanvasElement {
  const W = Math.max(64, Math.round(Math.min(2048, s.w * pxPerM)));
  const H = Math.max(32, Math.round(Math.min(1024, s.h * pxPerM)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  if (!s.transparent) {
    g.fillStyle = s.bg;
    g.fillRect(0, 0, W, H);
    if (s.stripes) {
      g.fillStyle = s.stripes;
      const sw = W / Math.max(4, Math.round(s.w / 0.32));
      for (let x = 0; x < W; x += sw * 2) g.fillRect(x, 0, sw, H);
    }
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  if (s.border) {
    g.strokeStyle = s.border;
    g.lineWidth = Math.max(2, H * 0.05);
    g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
  }
  const pad = (s.pad ?? 0.14) * H;
  const family = FAMILY[s.font ?? 'sign'];
  const weight = s.font === 'ui' || s.font === 'script' ? '700' : s.font === 'serif' ? '700' : '400';
  const mainH = s.sub ? H * 0.52 : H - pad * 2;
  let size = mainH * 0.86;
  g.font = `${weight} ${size}px ${family}`;
  const maxW = W - pad * 2.2;
  while (g.measureText(s.text).width > maxW && size > 6) {
    size *= 0.94;
    g.font = `${weight} ${size}px ${family}`;
  }
  g.textBaseline = 'middle';
  g.textAlign = s.align === 'left' ? 'left' : 'center';
  const x = s.align === 'left' ? pad * 1.2 : W / 2;
  const y = s.sub ? H * 0.38 : H / 2 + size * 0.04;
  if (s.glow) {
    g.shadowColor = s.glow;
    g.shadowBlur = size * 0.35;
  }
  g.fillStyle = s.fg;
  g.fillText(s.text, x, y);
  g.shadowBlur = 0;
  if (s.sub) {
    let sub = H * 0.2;
    g.font = `600 ${sub}px "Instrument Sans", Arial, sans-serif`;
    while (g.measureText(s.sub).width > maxW && sub > 5) {
      sub *= 0.94;
      g.font = `600 ${sub}px "Instrument Sans", Arial, sans-serif`;
    }
    g.fillText(s.sub, x, H * 0.78);
  }
  return c;
}

export function signTexture(s: SignStyle, renderer: THREE.WebGLRenderer, pxPerM?: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(signCanvas(s, pxPerM));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  return t;
}

export function signMaterial(t: THREE.Texture, opts: { emissive?: number; transparent?: boolean; rough?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: t,
    roughness: opts.rough ?? 0.55,
    metalness: 0.05,
    transparent: Boolean(opts.transparent),
    alphaTest: opts.transparent ? 0.35 : 0,
  });
  if (opts.emissive) {
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = t;
    m.emissiveIntensity = opts.emissive;
  }
  return m;
}

export function muralCanvas(w: number, h: number, a: string, b: string, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 120);
  c.height = Math.round(h * 120);
  const g = c.getContext('2d')!;
  let s = seed;
  const R = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.fillStyle = '#e9dcc4';
  g.fillRect(0, 0, c.width, c.height);
  const palette = [a, b, '#f2b33d', '#1d3a5f', '#e86a4a', '#f4efe2', '#2e6f6a'];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = palette[i % palette.length]!;
    g.beginPath();
    const cx = R() * c.width;
    const cy = R() * c.height;
    const r = (0.15 + R() * 0.35) * c.height;
    if (i % 3 === 0) g.arc(cx, cy, r, 0, Math.PI * 2);
    else {
      g.moveTo(cx, cy);
      g.lineTo(cx + r * (R() - 0.2) * 2, cy - r);
      g.lineTo(cx + r * 1.4, cy + r * (R() - 0.5));
      g.closePath();
    }
    g.fill();
  }
  g.globalAlpha = 0.9;
  g.fillStyle = '#14171c';
  g.font = `400 ${c.height * 0.16}px "Archivo Black", sans-serif`;
  g.textAlign = 'center';
  g.fillText('HELLO NEIGHBOR', c.width / 2, c.height * 0.9);
  g.globalAlpha = 0.18;
  for (let y = 0; y < c.height; y += c.height / 28) {
    g.fillStyle = '#000';
    g.fillRect(0, y, c.width, 1.5);
  }
  return c;
}

export interface AtlasOpts {
  emissive?: number;
  alpha?: boolean;
  rough?: number;
  doubleSided?: boolean;
}

interface AtlasItem {
  canvas: HTMLCanvasElement;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  opts: AtlasOpts;
  page?: number;
  rect?: { x: number; y: number; w: number; h: number };
}

const PAGE = 2048;

export class SignAtlas {
  private items: AtlasItem[] = [];

  add(canvas: HTMLCanvasElement, corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], opts: AtlasOpts = {}): void {
    this.items.push({ canvas, corners, opts });
  }

  build(renderer: THREE.WebGLRenderer): THREE.Group {
    const group = new THREE.Group();
    group.name = 'signs';
    const pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; x: number; y: number; row: number }[] = [];
    const newPage = (): void => {
      const c = document.createElement('canvas');
      c.width = PAGE;
      c.height = PAGE;
      pages.push({ canvas: c, ctx: c.getContext('2d')!, x: 0, y: 0, row: 0 });
    };
    newPage();
    const sorted = [...this.items].sort((a, b) => b.canvas.height - a.canvas.height);
    for (const it of sorted) {
      let w = it.canvas.width;
      let h = it.canvas.height;
      const k = Math.min(1, 1000 / w, 512 / h);
      w = Math.max(8, Math.floor(w * k));
      h = Math.max(8, Math.floor(h * k));
      let p = pages[pages.length - 1]!;
      if (p.x + w + 2 > PAGE) {
        p.x = 0;
        p.y += p.row + 2;
        p.row = 0;
      }
      if (p.y + h + 2 > PAGE) {
        newPage();
        p = pages[pages.length - 1]!;
      }
      p.ctx.drawImage(it.canvas, p.x + 1, p.y + 1, w, h);
      it.page = pages.length - 1;
      it.rect = { x: p.x + 1, y: p.y + 1, w, h };
      p.x += w + 2;
      p.row = Math.max(p.row, h);
    }
    const textures = pages.map((p) => {
      const t = new THREE.CanvasTexture(p.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    });
    const groups = new Map<string, AtlasItem[]>();
    for (const it of this.items) {
      const key = `${it.page}|${it.opts.emissive ?? 0}|${it.opts.alpha ? 1 : 0}|${it.opts.rough ?? 0.55}|${it.opts.doubleSided ? 1 : 0}`;
      const list = groups.get(key) ?? [];
      list.push(it);
      groups.set(key, list);
    }
    for (const [key, list] of groups) {
      const [page, emissive, alpha, rough, ds] = key.split('|').map(Number) as [number, number, number, number, number];
      const pos: number[] = [];
      const uv: number[] = [];
      for (const it of list) {
        const r = it.rect!;
        const u0 = r.x / PAGE;
        const u1 = (r.x + r.w) / PAGE;
        const v0 = 1 - (r.y + r.h) / PAGE;
        const v1 = 1 - r.y / PAGE;
        const [bl, br, tr, tl] = it.corners;
        for (const [p, u, v] of [
          [bl, u0, v0],
          [br, u1, v0],
          [tr, u1, v1],
          [bl, u0, v0],
          [tr, u1, v1],
          [tl, u0, v1],
        ] as const) {
          pos.push(p.x, p.y, p.z);
          uv.push(u, v);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        map: textures[page]!,
        roughness: rough,
        metalness: 0.05,
        transparent: Boolean(alpha),
        alphaTest: alpha ? 0.35 : 0,
        side: ds ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (emissive > 0) {
        m.emissive = new THREE.Color(0xffffff);
        m.emissiveMap = textures[page]!;
        m.emissiveIntensity = emissive;
      }
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}
