import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sunDirection } from '@lumen/sim';

export type Quality = 'high' | 'fast';

export interface RenderCore {
  sky: Sky;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  sun: THREE.DirectionalLight;
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  resize(w: number, h: number): void;
  setQuality(q: Quality): void;
  quality: Quality;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.022 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uVignette; uniform float uGrain; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.96, 1.0, 1.05), (1.0 - smoothstep(0.0, 0.45, l)) * 0.35);
      c = mix(c, c * vec3(1.04, 1.0, 0.95), smoothstep(0.6, 1.0, l) * 0.3);
      c = mix(vec3(l), c, 1.08);
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d * vec2(1.05, 1.0), d * vec2(1.05, 1.0)) * uVignette;
      float n = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createRenderCore(canvas: HTMLCanvasElement, opts: { still: boolean; quality: Quality }): RenderCore {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: opts.still,
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.58;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfcbd8, 120, 900);
  const camera = new THREE.PerspectiveCamera(56, 16 / 10, 0.1, 2500);
  camera.rotation.order = 'YXZ';

  const sky = new Sky();
  sky.scale.setScalar(4500);
  const su = sky.material.uniforms;
  su['turbidity']!.value = 3.6;
  su['rayleigh']!.value = 1.3;
  su['mieCoefficient']!.value = 0.004;
  su['mieDirectionalG']!.value = 0.82;
  const sd = sunDirection();
  const sunDir = new THREE.Vector3(sd.x, sd.y, sd.z);
  (su['sunPosition']!.value as THREE.Vector3).copy(sunDir);
  su['cloudCoverage']!.value = 0.32;
  su['cloudDensity']!.value = 0.35;
  sky.material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor, vec3( 0.98 ) ), 1.0 );');
  };
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -58;
  sc.right = 58;
  sc.top = 58;
  sc.bottom = -58;
  sc.near = 1;
  sc.far = 500;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  sun.userData.dir = sunDir;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xd3dbe4, 0x7a6d5e, 0.42));
  const bounce = new THREE.DirectionalLight(0xffe0c0, 0.55);
  bounce.position.set(100, 22, -12);
  scene.add(bounce);

  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky();
  const su2 = sky2.material.uniforms;
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) su2[k]!.value = su[k]!.value;
  (su2['sunPosition']!.value as THREE.Vector3).copy(sunDir);
  su2['cloudCoverage']!.value = 0.32;
  su2['cloudDensity']!.value = 0.35;
  su2['showSunDisc']!.value = 0;
  sky2.scale.setScalar(4000);
  envScene.add(sky2);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 32), new THREE.MeshBasicMaterial({ color: 0x5a5650 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  envScene.add(ground);
  scene.environment = pm.fromScene(envScene, 0, 1, 5000).texture;
  scene.environmentIntensity = 0.26;
  pm.dispose();

  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.42, 0.45, 1.02);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const core: RenderCore = {
    sky,
    renderer,
    scene,
    camera,
    composer,
    sun,
    grade,
    bloom,
    quality: opts.quality,
    resize(w: number, h: number) {
      const pr = Math.min(window.devicePixelRatio || 1, core.quality === 'high' ? 1.6 : 1);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      bloom.setSize(w * 0.8, h * 0.8);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 70 : camera.aspect < 1.2 ? 62 : 56;
      camera.updateProjectionMatrix();
      (grade.uniforms['uRes']!.value as THREE.Vector2).set(w * pr, h * pr);
    },
    setQuality(q: Quality) {
      core.quality = q;
      target.samples = q === 'high' ? 4 : 0;
      sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
  };
  return core;
}

export function followSun(sun: THREE.DirectionalLight, focus: THREE.Vector3): void {
  const dir = sun.userData.dir as THREE.Vector3;
  const snap = 4;
  const fx = Math.round(focus.x / snap) * snap;
  const fz = Math.round(focus.z / snap) * snap;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx + dir.x * 250, dir.y * 250, fz + dir.z * 250);
  sun.target.updateMatrixWorld();
}
