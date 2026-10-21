import * as THREE from 'three';

export type InteriorKind = 'office' | 'home' | 'shop';

const PARAMS: Record<InteriorKind, { depth: number; light: number; dark: number; blinds: number; warm: number }> = {
  office: { depth: 4.5, light: 0.34, dark: 0.07, blinds: 0.55, warm: 0.15 },
  home: { depth: 3.6, light: 0.26, dark: 0.06, blinds: 0.7, warm: 0.6 },
  shop: { depth: 6.0, light: 0.5, dark: 0.5, blinds: 0.0, warm: 0.7 },
};

const GLSL = `
varying vec3 vLocalPos;
varying vec3 vLocalCam;
varying float vSeed;
varying float vKind;
uniform float uDepth;
uniform float uLight;
uniform float uDark;
uniform float uBlinds;
uniform float uWarm;
uniform float uShop;
float h1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
vec3 goods(vec2 q, float seed) {
  vec2 cell = floor(q * vec2(9.0, 7.0));
  float r = h1(dot(cell, vec2(17.3, 31.7)) + seed * 13.0);
  vec3 c = mix(vec3(0.72, 0.36, 0.22), vec3(0.22, 0.4, 0.62), step(0.5, r));
  c = mix(c, vec3(0.86, 0.76, 0.42), step(0.8, r));
  c = mix(c, vec3(0.9, 0.88, 0.84), step(0.92, fract(r * 7.0)));
  float gap = step(0.12, fract(q.x * 9.0)) * step(0.2, fract(q.y * 7.0));
  return mix(vec3(0.16, 0.14, 0.12), c * (0.7 + 0.3 * h1(r * 3.0)), gap);
}
float boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out vec3 n) {
  vec3 t0 = (bmin - ro) / rd;
  vec3 t1 = (bmax - ro) / rd;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z);
  float b = min(min(tf.x, tf.y), tf.z);
  n = vec3(0.0, 1.0, 0.0);
  if (a > b || b < 0.0) return 1e9;
  n = a == tn.x ? vec3(-sign(rd.x), 0.0, 0.0) : a == tn.y ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z));
  return a;
}
vec3 interior() {
  vec3 ro = vLocalPos;
  vec3 rd = normalize(vLocalPos - vLocalCam);
  if (rd.z > -0.001) rd.z = -0.001;
  if (abs(rd.x) < 1e-4) rd.x = 1e-4;
  if (abs(rd.y) < 1e-4) rd.y = 1e-4;
  float depth = uDepth * (0.75 + 0.5 * h1(vSeed * 3.1));
  vec3 tw = vec3((sign(rd.x) * 0.5 - ro.x) / rd.x, (sign(rd.y) * 0.5 - ro.y) / rd.y, (-depth - ro.z) / rd.z);
  tw = max(tw, vec3(0.0));
  float t = min(tw.x, min(tw.y, tw.z));
  vec3 hp = ro + rd * t;
  float lit = uShop > 0.5 ? 1.0 : step(0.45, h1(vSeed * 7.7));
  vec3 warm = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.86, 0.66), uWarm);
  vec3 wallC = mix(vec3(0.78, 0.76, 0.72), vec3(0.6, 0.66, 0.7), h1(vSeed * 5.3)) * warm;
  float store = vKind > 1.5 && vKind < 2.5 ? 1.0 : vKind > 0.5 ? 0.0 : step(0.55, h1(vSeed * 23.0));
  float lobby = step(2.5, vKind);
  if (uShop > 0.5) wallC = mix(vec3(0.66, 0.52, 0.4), vec3(0.46, 0.5, 0.48), h1(vSeed * 4.1)) * warm;
  vec3 col;
  float shade;
  if (t == tw.z) {
    col = wallC * 0.9;
    shade = 0.85;
    if (uShop > 0.5) {
      vec3 cafe = mix(wallC, vec3(0.22, 0.15, 0.11), step(hp.y, -0.2));
      float board = step(abs(hp.x + 0.18), 0.17) * step(abs(hp.y - 0.24), 0.11);
      float lines = step(0.55, fract(hp.y * 38.0)) * step(abs(hp.x + 0.18), 0.13);
      cafe = mix(cafe, mix(vec3(0.08), vec3(0.75, 0.72, 0.62), lines * step(abs(hp.y - 0.24), 0.08)), board * (1.0 - lobby));
      for (int k = 0; k < 2; k++) {
        float px = k == 0 ? -0.24 : 0.18;
        float frameM = step(abs(hp.x - px), 0.13) * step(abs(hp.y - 0.12), 0.19);
        float art = step(abs(hp.x - px), 0.11) * step(abs(hp.y - 0.12), 0.17);
        vec3 poster = mix(vec3(0.55, 0.12, 0.1), vec3(0.12, 0.2, 0.42), float(k)) * (0.8 + 0.4 * step(0.6, fract((hp.y + float(k)) * 6.0)));
        cafe = mix(cafe, mix(vec3(0.1, 0.08, 0.06), poster, art), frameM * lobby);
      }
      col = mix(cafe, hp.y < 0.25 ? goods(hp.xy + 0.5, vSeed) : wallC, store);
    } else {
      float art = step(0.6, h1(vSeed * 11.0)) * step(abs(hp.x - 0.1), 0.18) * step(abs(hp.y + 0.05), 0.14);
      col = mix(col, vec3(0.35, 0.3, 0.26), art);
    }
  } else if (t == tw.y) {
    if (rd.y > 0.0) {
      col = vec3(0.92, 0.91, 0.88) * warm;
      float panel = uShop > 0.5 ? step(0.62, fract(hp.x * 2.0 + 0.25)) * step(0.7, fract(hp.z * 0.7)) : 0.0;
      shade = 1.0 + lit * 0.6 * smoothstep(1.2, 0.0, length(hp.xz + vec2(0.0, depth * 0.5)) / max(depth, 1.0)) + panel * 2.5;
    } else {
      vec2 tile = floor(hp.xz * vec2(4.0, 1.4));
      float chk = mod(tile.x + tile.y, 2.0);
      col = uShop > 0.5 ? mix(mix(vec3(0.32, 0.3, 0.28), vec3(0.5, 0.48, 0.44), chk), vec3(0.4, 0.1, 0.1), lobby) : mix(vec3(0.32, 0.25, 0.2), vec3(0.45, 0.44, 0.42), h1(vSeed * 2.2));
      shade = 0.6;
    }
  } else {
    col = wallC * 0.78;
    shade = 0.75;
    if (uShop > 0.5 && store > 0.5 && hp.y < 0.25 && hp.y > -0.45) col = goods(vec2(hp.z * 0.4, hp.y + 0.5), vSeed + 1.0);
    else {
      float shelf = step(0.92, fract((hp.y + 0.5) * 5.0)) * step(0.5, h1(vSeed * 9.0));
      col = mix(col, vec3(0.2, 0.18, 0.16), shelf);
    }
  }
  if (uShop > 0.5) {
    vec3 n;
    float cz = -depth * (0.35 + 0.2 * h1(vSeed * 29.0));
    vec3 bmin = store > 0.5 ? vec3(-0.12, -0.5, cz - depth * 0.25) : vec3(-0.42, -0.5, cz - 0.35);
    vec3 bmax = store > 0.5 ? vec3(0.12, -0.12, cz) : vec3(0.38, -0.18, cz);
    float tb = boxHit(ro, rd, bmin, bmax, n);
    if (tb < t) {
      t = tb;
      vec3 bp = ro + rd * tb;
      col = store > 0.5 ? goods(vec2(bp.z * 0.5, bp.y + 0.5), vSeed + 2.0) : mix(vec3(0.24, 0.17, 0.12), vec3(0.72, 0.68, 0.6), step(bmax.y - 0.03, bp.y));
      shade = n.y > 0.5 ? 1.0 : n.z > 0.5 ? 0.8 : 0.6;
    }
  }
  float fog = exp(-t * 0.05);
  vec3 c = col * shade * fog;
  vec3 inside = c * mix(uDark, uLight, lit);
  float blindTop = 0.5 - uBlinds * h1(vSeed * 13.0) * (1.0 - 0.4 * h1(vSeed * 17.0));
  if (vLocalPos.y > blindTop) {
    float slat = 0.85 + 0.15 * step(0.5, fract(vLocalPos.y * 26.0));
    vec3 blind = mix(vec3(0.82, 0.8, 0.74), vec3(0.62, 0.6, 0.58), h1(vSeed * 19.0));
    inside = blind * slat * 0.16;
  }
  return inside;
}
`;

export function interiorMaterial(kind: InteriorKind): THREE.MeshStandardMaterial {
  const p = PARAMS[kind];
  const m = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.06, metalness: 0.0, envMapIntensity: kind === 'shop' ? 0.9 : 1.6 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDepth = { value: p.depth };
    shader.uniforms.uLight = { value: p.light };
    shader.uniforms.uDark = { value: p.dark };
    shader.uniforms.uBlinds = { value: p.blinds };
    shader.uniforms.uWarm = { value: p.warm };
    shader.uniforms.uShop = { value: kind === 'shop' ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalCam;
        varying float vSeed;
        varying float vKind;
        attribute float aKind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        mat4 instM = modelMatrix;
        #ifdef USE_INSTANCING
          instM = modelMatrix * instanceMatrix;
          vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        #else
          vSeed = 0.5;
        #endif
        vKind = aKind;
        vLocalPos = position;
        vLocalCam = (inverse(instM) * vec4(cameraPosition, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL}`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vLocalPos - vLocalCam);
          float fres = pow(1.0 - clamp(-vd.z, 0.0, 1.0), 3.0);
          vec3 inner = interior() * (1.0 - 0.75 * fres);
          if (any(isnan(inner)) || any(isinf(inner))) inner = vec3(0.0);
          totalEmissiveRadiance += clamp(inner, 0.0, 0.92);
        }`,
    );
  };
  m.customProgramCacheKey = () => `interior-${kind}`;
  return m;
}
