// Océano: malla fina alrededor de la isla (color/espuma por profundidad real) + plano de mar profundo hasta el horizonte.
import * as THREE from 'three';
import { getHeight } from './heightfield.js';
import { CONFIG } from '../core/config.js';
import { createWaterNormal } from './textures.js';

export function createWater(ctx) {
  const seaLevel = CONFIG.world.seaLevel;
  const normalTex = createWaterNormal(256);
  const uniforms = { uWT: { value: 0 }, uWN: { value: normalTex }, uDeep: { value: new THREE.Color(0x06303f) }, uShallow: { value: new THREE.Color(0x2fb3b0) } };

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.07, metalness: 0.0, transparent: true, depthWrite: false,
    clearcoat: 0.3, clearcoatRoughness: 0.1, envMapIntensity: 1.1, side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec2 vWxz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth;\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vDepth; varying vec2 vWxz;
        uniform float uWT; uniform sampler2D uWN; uniform vec3 uDeep; uniform vec3 uShallow;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dpt = max(vDepth, 0.0);
        vec3 wc = mix(uShallow, uDeep, 1.0 - exp(-dpt * 0.16));
        diffuseColor.rgb = wc;
        diffuseColor.a = mix(0.16, 1.0, smoothstep(0.0, 3.4, dpt));
        // espuma: banda que avanza y retrocede con la ola + espuma dispersa en aguas muy someras
        float swash = 0.35 + 0.30 * sin(uWT * 0.9 + vWxz.x * 0.05 + vWxz.y * 0.043) + 0.12 * sin(uWT * 1.7 + vWxz.y * 0.11);
        float band = smoothstep(swash + 0.35, swash, dpt) * smoothstep(-0.05, 0.08, dpt);
        float lace = vn(vWxz * 0.9 + vec2(uWT * 0.25, -uWT * 0.18)) * 0.6 + vn(vWxz * 2.8 - uWT * 0.2) * 0.4;
        float foam = clamp(band * smoothstep(0.30, 0.62, lace + band * 0.35), 0.0, 1.0);
        float wash = smoothstep(0.9, 0.0, dpt) * 0.28 * lace;
        foam = max(foam, wash * (1.0 - band));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 0.97), foam);
        diffuseColor.a = mix(diffuseColor.a, 0.98, foam);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 n1 = texture2D(uWN, vWxz * 0.043 + vec2(uWT * 0.020, uWT * 0.012)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uWN, vWxz * 0.121 + vec2(-uWT * 0.028, uWT * 0.016)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uWN, vWxz * 0.47 + vec2(uWT * 0.065, -uWT * 0.047)).xyz * 2.0 - 1.0;
        vec2 pert = n1.xy * 0.85 + n2.xy * 0.6 + n3.xy * 0.28;
        pert *= mix(0.45, 1.0, smoothstep(0.0, 4.0, vDepth));
        vec3 nW = normalize(vec3(pert.x, 1.0, -pert.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'agua-v1';
  ctx.lighting?.setupMaterial?.(mat);

  const SEGS = 32;
  const _idxFull = (() => { const idx = new Uint32Array(SEGS * SEGS * 6); let p = 0; const st = SEGS + 1; for (let j = 0; j < SEGS; j++) for (let i = 0; i < SEGS; i++) { const a = j * st + i, b = (j + 1) * st + i, c = a + 1, d = b + 1; idx[p++] = a; idx[p++] = b; idx[p++] = c; idx[p++] = b; idx[p++] = d; idx[p++] = c; } return idx; })();
  const _idxQuad = new Uint32Array([0, 2, 1, 2, 3, 1]);
  const _normalFull = new Float32Array((SEGS + 1) * (SEGS + 1) * 3); for (let k = 0; k < _normalFull.length; k += 3) _normalFull[k + 1] = 1;
  const _normalQuad = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);

  /** Parche de agua para un nodo del terreno: cuadrícula con la profundidad real por vértice, o un solo cuadrado si todo el nodo es mar profundo. */
  function build(x0, z0, size, profundo) {
    const g = new THREE.BufferGeometry();
    if (profundo) {
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, seaLevel, 0, size, seaLevel, 0, 0, seaLevel, size, size, seaLevel, size]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(_normalQuad, 3));
      g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(4).fill(60), 1));
      g.setIndex(new THREE.BufferAttribute(_idxQuad, 1));
    } else {
      const st = SEGS + 1, step = size / SEGS;
      const pos = new Float32Array(st * st * 3), depth = new Float32Array(st * st);
      for (let j = 0; j < st; j++) for (let i = 0; i < st; i++) {
        const k = j * st + i, x = x0 + i * step, z = z0 + j * step;
        pos[k * 3] = i * step; pos[k * 3 + 1] = seaLevel; pos[k * 3 + 2] = j * step;
        depth[k] = seaLevel - getHeight(x, z); // >0 bajo el agua, <0 sobre tierra
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(_normalFull, 3));
      g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
      g.setIndex(new THREE.BufferAttribute(_idxFull, 1));
    }
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(size / 2, 0, size / 2), size * 0.72);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x0, 0, z0);
    m.renderOrder = 2;
    m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }

  // mar hasta el horizonte alrededor del cuadrado del mundo (el cuadrado lo cubren los nodos del terreno; las franjas no se solapan con él: la transparencia se sumaría)
  const H = CONFIG.world.size / 2, W = 40000;
  const strips = [[-W, -W, W, -H], [-W, H, W, W], [-W, -H, -H, H], [H, -H, W, H]]; // x0,z0,x1,z1
  const sp = [], si = [];
  strips.forEach(([x0, z0, x1, z1], k) => {
    sp.push(x0, seaLevel, z0, x1, seaLevel, z0, x0, seaLevel, z1, x1, seaLevel, z1);
    const o = k * 4;
    si.push(o, o + 2, o + 1, o + 2, o + 3, o + 1);
  });
  const big = new THREE.BufferGeometry();
  big.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3));
  big.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(16).fill(60), 1));
  big.setIndex(si);
  big.computeVertexNormals();
  const outer = new THREE.Mesh(big, mat);
  outer.frustumCulled = false;
  outer.name = 'mar_profundo';
  outer.renderOrder = 1;
  ctx.scene.add(outer);

  return {
    level: seaLevel,
    material: mat,
    build,
    getDepth: (x, z) => Math.max(0, seaLevel - getHeight(x, z)),
    /** Altura aproximada del oleaje (visual puramente normal-map; la amplitud real es mínima). */
    getWaveHeight: (x, z, t = 0) => 0.05 * Math.sin(x * 0.08 + t * 0.9) * Math.cos(z * 0.06 + t * 0.7),
    update(dt) {
      uniforms.uWT.value = ctx.time.elapsed;
    },
  };
}
