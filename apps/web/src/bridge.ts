import * as THREE from 'three';
import { PLACE_BY_ID, groundY, placeDoor, type Projected, type Vec3, type Viewport } from '@lumen/shared';
import { keepOuts, nearestS, pointAt, type Sim } from '@lumen/sim';
import {
  LIGHT_COLOR,
  LIGHT_SIZE,
  leaderPoint,
  type ColumnHandle,
  type GroundTextHandle,
  type KeepOut,
  type LeaderHandle,
  type LightHandle,
  type LightKind,
  type RouteHandle,
  type SceneBridge,
} from '@lumen/overlay';

const PIP_TOWARD_CAMERA = 0.6;
const HERO_DISTANCE = 24;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,236,190,.9)');
  r.addColorStop(0.6, 'rgba(255,217,138,.25)');
  r.addColorStop(1, 'rgba(255,217,138,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function flareTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createLinearGradient(0, 0, 512, 0);
  r.addColorStop(0, 'rgba(255,240,210,0)');
  r.addColorStop(0.5, 'rgba(255,248,230,1)');
  r.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = r;
  g.fillRect(0, 12, 512, 8);
  const v = g.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(0.5, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, 512, 32);
  return new THREE.CanvasTexture(c);
}

function columnTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 256, 0, 0);
  v.addColorStop(0, 'rgba(255,214,130,.7)');
  v.addColorStop(0.6, 'rgba(255,214,130,.18)');
  v.addColorStop(1, 'rgba(255,214,130,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

const TONE: Record<'go' | 'warn' | 'stop', string> = { go: '#9ff0bd', warn: '#ffc98a', stop: '#ff8f7a' };

export class ThreeBridge implements SceneBridge {
  readonly group = new THREE.Group();
  private readonly glow = glowTexture();
  private readonly flare = flareTexture();
  private readonly colTex = columnTexture();
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(
    private cam: THREE.PerspectiveCamera,
    private sim: Sim,
  ) {
    this.group.name = 'overlay-light';
  }

  setSim(sim: Sim): void {
    this.sim = sim;
  }

  dispose(): void {
    this.glow.dispose();
    this.flare.dispose();
    this.colTex.dispose();
    this.group.clear();
  }

  viewport(): Viewport {
    return { w: innerWidth, h: innerHeight };
  }

  project(v: Vec3): Projected {
    const cam = this.cam;
    this.tmp.set(v.x, v.y, v.z);
    cam.getWorldDirection(this.fwd);
    const depth = this.tmp.clone().sub(cam.position).dot(this.fwd);
    this.tmp.project(cam);
    const vp = this.viewport();
    return { x: (this.tmp.x * 0.5 + 0.5) * vp.w, y: (-this.tmp.y * 0.5 + 0.5) * vp.h, depth, inFront: depth > 0.05 };
  }

  unprojectAtDepth(x: number, y: number, depth: number): Vec3 {
    const vp = this.viewport();
    const cam = this.cam;
    const p = new THREE.Vector3((x / vp.w) * 2 - 1, -((y / vp.h) * 2 - 1), 0.5).unproject(cam);
    const dir = p.sub(cam.position).normalize();
    cam.getWorldDirection(this.fwd);
    const k = depth / Math.max(1e-4, dir.dot(this.fwd));
    return { x: cam.position.x + dir.x * k, y: cam.position.y + dir.y * k, z: cam.position.z + dir.z * k };
  }

  camera(): { pos: Vec3; yaw: number; pitch: number } {
    const p = this.sim.cameraPose();
    return { pos: { x: this.cam.position.x, y: this.cam.position.y, z: this.cam.position.z }, yaw: p.yaw, pitch: p.pitch };
  }

  anchor(id: string): Vec3 | undefined {
    if (id.startsWith('column:')) {
      const p = PLACE_BY_ID.get(id.slice(7));
      if (!p) return undefined;
      const d = placeDoor(p);
      return { x: d.x, y: groundY(d.x, d.z), z: d.z };
    }
    return this.sim.anchorOf(id);
  }

  keepOuts(maxDepth = Infinity): KeepOut[] {
    const eye = this.cam.position;
    return keepOuts(this.sim, (v) => this.project(v), this.viewport(), { x: eye.x, y: eye.y, z: eye.z }, maxDepth);
  }

  routePath(to: string, offset: 'center' | 'curb'): Vec3[] {
    const sim = this.sim;
    const r = sim.route;
    const s0 = sim.wearer.s + 0.8;
    let end = r.length;
    const place = PLACE_BY_ID.get(to);
    if (place) {
      const door = placeDoor(place);
      const sd = nearestS(r, door);
      if (sd > s0) end = sd;
    }
    const s1 = Math.min(end, s0 + 30);
    const out: Vec3[] = [];
    for (let s = s0; s <= s1 + 1e-6; s += 0.5) {
      const p = pointAt(r, Math.min(s, s1)).pos;
      let x = p.x;
      if (offset === 'curb' && Math.abs(x) > 7.2) x = Math.sign(x) * Math.max(7.45, Math.abs(x) - 0.45);
      out.push({ x, y: groundY(x, p.z) + 0.012, z: p.z });
    }
    return out;
  }

  safetyAnchor(id: string): { pos: Vec3; yaw: number } | undefined {
    const sim = this.sim;
    if (id.startsWith('bike:') || sim.wearer.state === 'crossing') {
      const h = sim.wearer.heading;
      const x = sim.wearer.pos.x + h.x * 5.5;
      const z = sim.wearer.pos.z + h.z * 5.5;
      return { pos: { x, y: groundY(x, z) + 0.014, z }, yaw: Math.atan2(-h.x, -h.z) };
    }
    const st = sim.route.stops[0];
    if (!st) return undefined;
    const a = pointAt(sim.route, st.s).pos;
    const b = pointAt(sim.route, st.s + 2.4).pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const x = a.x + (dx / l) * 1.9;
    const z = a.z + (dz / l) * 1.9;
    return { pos: { x, y: groundY(x, z) + 0.014, z }, yaw: Math.atan2(-dx, -dz) };
  }

  curbDistance(): number {
    return this.sim.wearer.curbDistance();
  }

  createLight(kind: LightKind): LightHandle {
    const mat = new THREE.SpriteMaterial({
      map: kind === 'flare' ? this.flare : this.glow,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      opacity: 0,
    });
    const c = LIGHT_COLOR[kind];
    mat.color.setRGB(c[0], c[1], c[2]);
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 20;
    sp.visible = false;
    const base = kind === 'pip' ? LIGHT_SIZE.pip : kind === 'aura' ? LIGHT_SIZE.aura : kind === 'head' ? LIGHT_SIZE.head : 1;
    this.group.add(sp);
    const cam = this.cam;
    let scale = 1;
    let scaleX = 1.2;
    return {
      set: (p) => {
        if (p.pos) {
          const toCam = new THREE.Vector3(cam.position.x - p.pos.x, cam.position.y - p.pos.y, cam.position.z - p.pos.z);
          const l = toCam.length();
          const k = kind === 'head' ? 0 : Math.min(PIP_TOWARD_CAMERA, l * 0.5) / Math.max(l, 1e-3);
          sp.position.set(p.pos.x + toCam.x * k, p.pos.y + toCam.y * k, p.pos.z + toCam.z * k);
        }
        if (p.opacity !== undefined) {
          mat.opacity = p.opacity;
          sp.visible = p.opacity > 0.002;
        }
        if (p.scaleX !== undefined) scaleX = p.scaleX;
        if (p.scale !== undefined) scale = p.scale;
        const near = Math.min(1, sp.position.distanceTo(cam.position) / HERO_DISTANCE);
        if (kind === 'flare') sp.scale.set(scaleX * near, LIGHT_SIZE.flareH * near, 1);
        else sp.scale.setScalar(base * scale * near);
        if (p.tint) mat.color.setRGB(c[0] * p.tint[0], c[1] * p.tint[1], c[2] * p.tint[2]);
      },
      dispose: () => {
        this.group.remove(sp);
        mat.dispose();
      },
    };
  }

  createLeader(): LeaderHandle {
    const pos = new Float32Array(6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = LIGHT_COLOR.leader;
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 21;
    line.visible = false;
    this.group.add(line);
    return {
      set: ({ from, to, progress, opacity }) => {
        const tip = leaderPoint(from, to, progress);
        pos.set([from.x, from.y, from.z, tip.x, tip.y, tip.z]);
        geo.attributes.position!.needsUpdate = true;
        mat.opacity = opacity;
        line.visible = opacity > 0.002 && progress > 0.001;
      },
      dispose: () => {
        this.group.remove(line);
        geo.dispose();
        mat.dispose();
      },
    };
  }

  createRoute(): RouteHandle {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 15;
    this.group.add(mesh);
    const outer = new THREE.Color(1.0, 0.72, 0.36);
    const core = new THREE.Color(1.0, 0.88, 0.62);
    return {
      set: ({ points, opacity, drawn, fadeEnd }) => {
        const pos: number[] = [];
        const col: number[] = [];
        if (points.length >= 2 && opacity > 0.002 && drawn > 0.001) {
          const cum = [0];
          for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
          const total = cum[cum.length - 1]!;
          const reach = Math.min(total, fadeEnd) * drawn;
          const ribbon = (hw: number, color: THREE.Color, amul: number): void => {
            for (let i = 1; i < points.length; i++) {
              if (cum[i - 1]! > reach) break;
              const a = points[i - 1]!;
              let b = points[i]!;
              let cb = cum[i]!;
              if (cb > reach) {
                const k = (reach - cum[i - 1]!) / Math.max(1e-4, cb - cum[i - 1]!);
                b = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
                cb = reach;
              }
              let dx = b.x - a.x;
              let dz = b.z - a.z;
              const l = Math.hypot(dx, dz) || 1;
              dx /= l;
              dz /= l;
              const nx = -dz * hw;
              const nz = dx * hw;
              const fa = Math.max(0, 1 - cum[i - 1]! / fadeEnd) * Math.min(1, cum[i - 1]! / 1.2 + 0.25);
              const fb = Math.max(0, 1 - cb / fadeEnd) * Math.min(1, cb / 1.2 + 0.25);
              const ca = color.clone().multiplyScalar(fa * amul * opacity);
              const cb2 = color.clone().multiplyScalar(fb * amul * opacity);
              const verts: [number, number, number, THREE.Color][] = [];
              const strip = (s0: number, s1: number, c0a: THREE.Color, c1a: THREE.Color, c0b: THREE.Color, c1b: THREE.Color): void => {
                const A0: [number, number, number, THREE.Color] = [a.x + nx * s0, a.y, a.z + nz * s0, c0a];
                const A1: [number, number, number, THREE.Color] = [a.x + nx * s1, a.y, a.z + nz * s1, c1a];
                const B0: [number, number, number, THREE.Color] = [b.x + nx * s0, b.y, b.z + nz * s0, c0b];
                const B1: [number, number, number, THREE.Color] = [b.x + nx * s1, b.y, b.z + nz * s1, c1b];
                verts.push(A0, B1, A1, A0, B0, B1);
              };
              const zero = new THREE.Color(0, 0, 0);
              strip(1, 0, zero, ca, zero, cb2);
              strip(0, -1, ca, zero, cb2, zero);
              const quad = verts;
              for (const [x, y, z, c] of quad) {
                pos.push(x, y, z);
                col.push(c.r, c.g, c.b);
              }
            }
          };
          ribbon(0.23, outer, 0.62);
          ribbon(0.07, core, 0.4);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        mesh.visible = pos.length > 0;
      },
      dispose: () => {
        this.group.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    };
  }

  createColumn(): ColumnHandle {
    const mat = new THREE.MeshBasicMaterial({ map: this.colTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0 });
    mat.color.setRGB(1.5, 1.3, 0.95);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1).translate(0, 0.5, 0), mat);
    plane.renderOrder = 16;
    const discMat = new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    discMat.color.setRGB(1.6, 1.35, 0.9);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), discMat);
    disc.renderOrder = 16;
    const g = new THREE.Group();
    g.add(plane, disc);
    g.visible = false;
    this.group.add(g);
    const cam = this.cam;
    return {
      set: ({ pos, opacity, height }) => {
        g.position.set(pos.x, pos.y + 0.012, pos.z);
        plane.scale.set(1, Math.max(0.001, height), 1);
        plane.rotation.y = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z);
        mat.opacity = opacity;
        discMat.opacity = opacity * 0.9;
        g.visible = opacity > 0.002;
      },
      dispose: () => {
        this.group.remove(g);
        mat.dispose();
        discMat.dispose();
      },
    };
  }

  createGroundText(): GroundTextHandle {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mat.color.setRGB(1.25, 1.25, 1.25);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9).rotateX(-Math.PI / 2), mat);
    mesh.renderOrder = 17;
    mesh.visible = false;
    this.group.add(mesh);
    let key = '';
    const draw = (text: string, tone: 'go' | 'warn' | 'stop', arrow?: 'left' | 'right'): void => {
      const g = canvas.getContext('2d')!;
      g.clearRect(0, 0, 2048, 256);
      g.font = '500 132px "Martian Mono", ui-monospace, monospace';
      g.textBaseline = 'middle';
      const spacing = 132 * 0.16;
      const m = text.match(/^(\D+?)\s*(\d+.*)?$/);
      const word = m?.[1]?.trim() ?? text;
      const rest = m?.[2] ?? '';
      const glyphs: { ch: string; color: string }[] = [];
      for (const ch of word) glyphs.push({ ch, color: '#fff8ea' });
      if (rest) {
        glyphs.push({ ch: ' ', color: '#fff8ea' });
        for (const ch of rest) glyphs.push({ ch, color: TONE[tone] });
      }
      if (tone !== 'go' && !rest) for (const gl of glyphs) gl.color = TONE[tone];
      if (word.startsWith('BIKE')) for (const gl of glyphs) gl.color = TONE.stop;
      const widths = glyphs.map((gl) => g.measureText(gl.ch).width + spacing);
      const arrowW = arrow ? 150 : 0;
      const total = widths.reduce((a, b) => a + b, 0) - spacing + arrowW;
      let x = 1024 - total / 2;
      const under = g.createRadialGradient(1024, 128, 20, 1024, 128, Math.max(220, total * 0.62));
      under.addColorStop(0, 'rgba(8,11,16,0.62)');
      under.addColorStop(0.7, 'rgba(8,11,16,0.4)');
      under.addColorStop(1, 'rgba(8,11,16,0)');
      g.save();
      g.translate(1024, 128);
      g.scale(1, 0.32);
      g.translate(-1024, -128);
      g.fillStyle = under;
      g.fillRect(0, -200, 2048, 656);
      g.restore();
      g.shadowColor = 'rgba(255,240,210,.55)';
      g.shadowBlur = 28;
      if (arrow === 'left') {
        drawArrow(g, x + 60, 128, -1, TONE[tone]);
        x += arrowW;
      }
      glyphs.forEach((gl, i) => {
        g.fillStyle = gl.color;
        g.shadowColor = gl.color === '#fff8ea' ? 'rgba(255,240,210,.55)' : gl.color;
        g.fillText(gl.ch, x, 128);
        x += widths[i]!;
      });
      if (arrow === 'right') drawArrow(g, x + 60, 128, 1, TONE[tone]);
      tex.needsUpdate = true;
    };
    return {
      set: ({ pos, yaw, text, tone, opacity, arrow }) => {
        const k = `${text}|${tone}|${arrow ?? ''}`;
        if (k !== key) {
          key = k;
          draw(text, tone, arrow);
        }
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.rotation.set(0, yaw, 0);
        mat.opacity = opacity;
        mesh.visible = opacity > 0.002;
      },
      dispose: () => {
        this.group.remove(mesh);
        tex.dispose();
        mat.dispose();
      },
    };
  }
}

function drawArrow(g: CanvasRenderingContext2D, cx: number, cy: number, dir: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.shadowColor = color;
  g.beginPath();
  g.moveTo(cx + dir * 54, cy);
  g.lineTo(cx - dir * 6, cy - 50);
  g.lineTo(cx - dir * 6, cy - 18);
  g.lineTo(cx - dir * 54, cy - 18);
  g.lineTo(cx - dir * 54, cy + 18);
  g.lineTo(cx - dir * 6, cy + 18);
  g.lineTo(cx - dir * 6, cy + 50);
  g.closePath();
  g.fill();
  g.restore();
}
