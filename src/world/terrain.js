// Terreno por chunks con LOD y faldones (sin grietas). Altura = heightfield.js (fuente única).
import * as THREE from 'three';
import { getHeight } from './heightfield.js';
import { createNoise2D, fbm } from '../core/noise.js';
import { CONFIG } from '../core/config.js';
import { createTerrainDetail } from './textures.js';

const CHUNK = 64;
const SEGS = [64, 32, 16, 8, 4]; // segmentos por LOD (1 m, 2 m, 4 m, 8 m, 16 m)
const LOD_DIST = [110, 240, 480, 900]; // distancia (m) hasta la que se usa cada LOD
const R = CONFIG.world.size / 2;
const HALF = Math.ceil((R * 1.2) / CHUNK); // chunks por lado desde el centro

const nM = createNoise2D(CONFIG.seed + 200);
const nD = createNoise2D(CONFIG.seed + 211);
const nS = createNoise2D(CONFIG.seed + 223);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new THREE.Color();
const _a = new THREE.Color();
const _b = new THREE.Color();

// Paleta (sRGB). three convierte a lineal al usar Color.set(hex).
const P = {
  seabed: new THREE.Color(0x8d8668), wetSand: new THREE.Color(0xa59470), drySand: new THREE.Color(0xdcc891),
  grassA: new THREE.Color(0x3c6a28), grassB: new THREE.Color(0x5b8a36), grassDry: new THREE.Color(0x8a9440),
  jungle: new THREE.Color(0x27511f), dirt: new THREE.Color(0x6e5a3b), rockA: new THREE.Color(0x6c675f),
  rockB: new THREE.Color(0x8d8476), rockDark: new THREE.Color(0x4b4741), snow: new THREE.Color(0xeef3f8),
};

/** Color base del terreno en (x, z). `ny` = componente Y de la normal. Devuelve THREE.Color (reutilizado). */
export function terrainColor(x, z, h, ny, out = _c) {
  const slope = 1 - ny;
  const macro = fbm(nM, x * 0.0035, z * 0.0035, 3); // -1..1 regiones grandes
  const patch = fbm(nD, x * 0.03, z * 0.03, 3);
  const fine = nS(x * 0.35, z * 0.35);

  if (h < 0) {
    out.copy(P.seabed).lerp(P.wetSand, smooth(-2, 0, h)).multiplyScalar(0.55 + 0.45 * smooth(-18, -1, h));
    return out;
  }
  // arena: húmeda cerca del mar, seca arriba
  _a.copy(P.wetSand).lerp(P.drySand, smooth(0.2, 1.6, h));
  _a.multiplyScalar(0.96 + fine * 0.05);
  // vegetación: mezcla por macro-regiones (selva oscura vs pradera clara) y parches de tierra
  _b.copy(P.grassA).lerp(P.grassB, smooth(-0.3, 0.4, macro + patch * 0.4));
  _b.lerp(P.jungle, smooth(0.0, 0.55, -macro) * 0.8);
  _b.lerp(P.grassDry, smooth(0.25, 0.7, patch + macro * 0.3) * 0.55);
  _b.lerp(P.dirt, smooth(0.35, 0.65, -patch) * 0.55);
  _b.multiplyScalar(0.94 + fine * 0.08);
  out.copy(_a).lerp(_b, smooth(1.8, 5.5, h + patch * 1.2));
  // roca por pendiente, con estratos
  const rockiness = smooth(0.17, 0.33, slope + (patch * 0.04)) ;
  if (rockiness > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 0.9 + nM(x * 0.02, z * 0.02) * 4.0);
    _a.copy(P.rockA).lerp(P.rockB, strata * 0.7).lerp(P.rockDark, smooth(0.3, 0.5, slope) * 0.6);
    out.lerp(_a, rockiness);
  }
  // nieve en altura sobre superficies poco empinadas
  const snow = smooth(105, 135, h + patch * 14) * smooth(0.5, 0.2, slope);
  if (snow > 0) out.lerp(P.snow, snow);
  return out;
}

function buildGeometry(cx, cz, lod) {
  const N = SEGS[lod];
  const step = CHUNK / N;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const stride = N + 1;
  const nGrid = stride * stride;
  const nSkirt = 4 * stride;
  const total = nGrid + nSkirt;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  const skirtDepth = 2.5 + step * 0.9;

  // alturas con un anillo de borde (N+3)^2: las normales salen de diferencias finitas de la propia grilla (1 muestra/vértice)
  const hs = (N + 3);
  const hgrid = new Float32Array(hs * hs);
  for (let j = -1; j <= N + 1; j++) {
    for (let i = -1; i <= N + 1; i++) hgrid[(j + 1) * hs + (i + 1)] = getHeight(x0 + i * step, z0 + j * step);
  }
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const gi = (j + 1) * hs + (i + 1);
      const h = hgrid[gi];
      let nx = hgrid[gi - 1] - hgrid[gi + 1], ny = 2 * step, nz = hgrid[gi - hs] - hgrid[gi + hs];
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const k = j * stride + i;
      pos[k * 3] = x - x0; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - z0;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
      terrainColor(x, z, h, ny, _c);
      col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
    }
  }
  // faldones: duplican los vértices del borde hacia abajo
  const edge = [];
  for (let i = 0; i <= N; i++) edge.push(i); // z = 0
  for (let i = 0; i <= N; i++) edge.push(N * stride + i); // z = N
  for (let j = 0; j <= N; j++) edge.push(j * stride); // x = 0
  for (let j = 0; j <= N; j++) edge.push(j * stride + N); // x = N
  for (let e = 0; e < edge.length; e++) {
    const s = edge[e], d = nGrid + e;
    pos[d * 3] = pos[s * 3]; pos[d * 3 + 1] = pos[s * 3 + 1] - skirtDepth; pos[d * 3 + 2] = pos[s * 3 + 2];
    nor[d * 3] = nor[s * 3]; nor[d * 3 + 1] = nor[s * 3 + 1]; nor[d * 3 + 2] = nor[s * 3 + 2];
    uv[d * 2] = uv[s * 2]; uv[d * 2 + 1] = uv[s * 2 + 1];
    col[d * 3] = col[s * 3]; col[d * 3 + 1] = col[s * 3 + 1]; col[d * 3 + 2] = col[s * 3 + 2];
  }
  const idx = new Uint32Array(N * N * 6 + 4 * N * 6);
  let p = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * stride + i, b = (j + 1) * stride + i, c = j * stride + i + 1, d = (j + 1) * stride + i + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = c;
      idx[p++] = b; idx[p++] = d; idx[p++] = c;
    }
  }
  for (let side = 0; side < 4; side++) {
    const base = side * stride;
    for (let i = 0; i < N; i++) {
      const t0 = edge[base + i], t1 = edge[base + i + 1], b0 = nGrid + base + i, b1 = nGrid + base + i + 1;
      idx[p++] = t0; idx[p++] = t1; idx[p++] = b0;
      idx[p++] = t1; idx[p++] = b1; idx[p++] = b0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function createTerrain(ctx) {
  const detail = createTerrainDetail(512);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: detail.albedo, normalMap: detail.normal, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.96, metalness: 0, side: THREE.DoubleSide,
  });
  // Rompe la repetición del detalle: dos escalas distintas mezcladas, y un toque de humedad cerca del mar.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
        vWY = wp4.y; vWP = wp4.xyz;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWY; varying vec3 vWP; varying vec3 vWN;
        vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-5); }
        float triSample(sampler2D t, vec3 p, vec3 w, float s) {
          return texture2D(t, p.zy * s).r * w.x + texture2D(t, p.xz * s).r * w.y + texture2D(t, p.xy * s).r * w.z;
        }`)
      .replace('#include <map_fragment>', `
        vec3 tw = triW(normalize(vWN));
        float d1 = triSample(map, vWP, tw, 0.3333);
        float d2 = triSample(map, vWP + vec3(17.3, 5.1, 41.7), tw, 0.0437);
        float d3 = texture2D(map, vWP.xz * 0.0058 + vec2(0.71, 0.23)).r;
        float dd = (d1 * 0.55 + d2 * 0.45) * (0.78 + 0.5 * d3) * 1.38;
        diffuseColor.rgb *= dd;
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(-0.1, 1.1, vWY));
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 nWo = normalize(vWN);
        vec3 tx = texture2D(normalMap, vWP.zy * 0.3333).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(normalMap, vWP.xz * 0.3333).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(normalMap, vWP.xy * 0.3333).xyz * 2.0 - 1.0;
        vec3 ty2 = texture2D(normalMap, vWP.xz * 0.0437 + 0.5).xyz * 2.0 - 1.0;
        tx = vec3(tx.xy + nWo.zy, abs(tx.z) * nWo.x);
        ty = vec3((ty.xy + ty2.xy * 0.7) + nWo.xz, abs(ty.z) * nWo.y);
        tz = vec3(tz.xy + nWo.xy, abs(tz.z) * nWo.z);
        vec3 nTri = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
        nTri = normalize(mix(nWo, nTri, 0.85));
        normal = normalize((viewMatrix * vec4(nTri, 0.0)).xyz);
      `);
  };
  mat.customProgramCacheKey = () => 'terreno-v2';
  ctx.lighting?.setupMaterial?.(mat);

  const group = new THREE.Group();
  group.name = 'terreno';
  ctx.scene.add(group);

  const chunks = new Map(); // "cx,cz" -> { mesh, lod, want }
  const pending = [];

  for (let cz = -HALF; cz < HALF; cz++) {
    for (let cx = -HALF; cx < HALF; cx++) {
      // salta chunks de mar profundo (el agua es opaca allí)
      let maxH = -1e9;
      for (let sj = 0; sj <= 4; sj++) for (let si = 0; si <= 4; si++) maxH = Math.max(maxH, getHeight(cx * CHUNK + si * 16, cz * CHUNK + sj * 16));
      if (maxH < -16) continue;
      chunks.set(`${cx},${cz}`, { cx, cz, mesh: null, lod: -1, want: 0, dist: 0 });
    }
  }

  function lodFor(d) {
    for (let i = 0; i < LOD_DIST.length; i++) if (d < LOD_DIST[i]) return i;
    return LOD_DIST.length;
  }

  function build(c, lod) {
    const g = buildGeometry(c.cx, c.cz, lod);
    if (!c.mesh) {
      c.mesh = new THREE.Mesh(g, mat);
      c.mesh.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
      c.mesh.receiveShadow = true;
      group.add(c.mesh);
    } else {
      c.mesh.geometry.dispose();
      c.mesh.geometry = g;
    }
    c.mesh.castShadow = lod <= 2;
    c.lod = lod;
  }

  let lastX = 1e9, lastZ = 1e9;
  function refresh(force = false) {
    const cam = ctx.camera.position;
    if (!force && Math.hypot(cam.x - lastX, cam.z - lastZ) < 12) return;
    lastX = cam.x; lastZ = cam.z;
    pending.length = 0;
    for (const c of chunks.values()) {
      const dx = (c.cx + 0.5) * CHUNK - cam.x, dz = (c.cz + 0.5) * CHUNK - cam.z;
      c.dist = Math.hypot(dx, dz);
      c.want = lodFor(Math.max(0, c.dist - CHUNK * 0.5));
      if (c.want !== c.lod) pending.push(c);
    }
    pending.sort((a, b) => a.dist - b.dist);
  }

  return {
    group, material: mat, chunks,
    /** Construye todo lo pendiente de golpe (carga inicial). */
    prime() { refresh(true); while (pending.length) { const c = pending.shift(); build(c, c.want); } },
    /** Reparte la construcción entre frames: construye chunks hasta agotar `budgetMs` (siempre al menos uno). */
    update(budgetMs = 5) {
      refresh();
      const t0 = performance.now();
      while (pending.length) {
        const c = pending.shift();
        build(c, c.want);
        if (performance.now() - t0 > budgetMs) break;
      }
    },
  };
}
