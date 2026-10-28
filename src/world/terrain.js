// Terreno por ÁRBOL DE NODOS con LOD (cuadrícula de 3×3 raíces de 4096 m que se subdividen hasta 64 m según la distancia a la cámara), con faldones (sin grietas)
// y un parche de agua por nodo. Altura = heightfield.js (fuente única); color = bioma de la rejilla macro + pendiente + altura.
// Los nodos se construyen repartidos entre fotogramas: un nodo solo se divide cuando sus cuatro hijos ya están construidos y solo se funde cuando el padre lo está,
// así nunca hay huecos ni mallas solapadas.
import * as THREE from 'three';
import { getHeight, alturaMacro, getMundo } from './heightfield.js';
import { createNoise2D, fbm } from '../core/noise.js';
import { CONFIG } from '../core/config.js';
import { createTerrainDetail } from './textures.js';
import { CAPA, CAPAS, N_CAPAS } from './suelos.js';
import { BIOMAS } from './provincias.js';

const SIZE = CONFIG.world.size, HALF = SIZE / 2;
const ROOT = 4096, NROOT = Math.ceil(SIZE / ROOT), MIN = 64;
const segDe = (size) => (size <= 128 ? 48 : size <= 256 ? 40 : 32); // segmentos por lado: los nodos lejanos llevan menos malla
const R_IN = 1.1, R_OUT = 1.4; // se divide a < size·R_IN, se vuelve a fundir a > size·R_OUT
const PROFUNDO = -24; // por debajo, el fondo no se dibuja (el agua es opaca); el agua entera es un solo cuadrado si todo el nodo es mar profundo
const CAP = 320; // nodos con malla en memoria

const nM = createNoise2D(CONFIG.seed + 200);
const nD = createNoise2D(CONFIG.seed + 211);
const nS = createNoise2D(CONFIG.seed + 223);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (h) => new THREE.Color(h);
const _c = new THREE.Color(), _a = new THREE.Color(), _b = new THREE.Color(), _v = new THREE.Color(), _r = new THREE.Color();
const _pw = new Float32Array(8);

// Paleta (sRGB). three convierte a lineal al usar Color.set(hex).
const P = { seabed: C(0x8d8668), mud: C(0x4d4936), wetSand: C(0xa59470), drySand: C(0xdcc891), snow: C(0xeef3f8), dirt: C(0x6e5a3b) };
// vegetación por bioma: a, b = tonos base mezclados por ruido; seco = tono de tierra reseca; ks = cuánto se mezcla el seco; kd = cuánto la tierra
const VEG = {
  [BIOMAS.playa]: { a: C(0xd8c58c), b: C(0xcdb97e), seco: C(0xb9a572), ks: 0.3, kd: 0.1, roca: C(0x8d8476) },
  [BIOMAS.pradera]: { a: C(0x4f7d30), b: C(0x6b9a3c), seco: C(0x9a9a45), ks: 0.55, kd: 0.45, roca: C(0x8d8476) },
  [BIOMAS.selva]: { a: C(0x1f4a1b), b: C(0x2c6224), seco: C(0x3b5a24), ks: 0.25, kd: 0.2, roca: C(0x5d5a50) },
  [BIOMAS.bosque]: { a: C(0x2f5a2a), b: C(0x3f6f34), seco: C(0x6a7a3c), ks: 0.35, kd: 0.35, roca: C(0x6c675f) },
  [BIOMAS.pantano]: { a: C(0x3d4f2e), b: C(0x4b5c35), seco: C(0x5d5a38), ks: 0.4, kd: 0.5, roca: C(0x5d5a50) },
  [BIOMAS.desierto]: { a: C(0xc9a468), b: C(0xb98550), seco: C(0xd7bd86), ks: 0.55, kd: 0.5, roca: C(0xa4694a) },
  [BIOMAS.montana]: { a: C(0x6a7355), b: C(0x7a7468), seco: C(0x8a8576), ks: 0.5, kd: 0.3, roca: C(0x6c675f) },
  [BIOMAS.nieve]: { a: C(0xe4eaf0), b: C(0xf3f6f9), seco: C(0xcdd7e0), ks: 0.3, kd: 0, roca: C(0x6c675f) },
  [BIOMAS.volcan]: { a: C(0x3a3330), b: C(0x4a403a), seco: C(0x5a4034), ks: 0.5, kd: 0.2, roca: C(0x2b2726) },
  [BIOMAS.taiga]: { a: C(0x4a6a4a), b: C(0x607a58), seco: C(0x8a8a66), ks: 0.5, kd: 0.35, roca: C(0x6c675f) },
  [BIOMAS.mar]: { a: C(0x8d8668), b: C(0x8d8668), seco: C(0x8d8668), ks: 0, kd: 0, roca: C(0x6c675f) },
};

// capas de textura por bioma (ver suelos.js): p = principal, s = secundaria (fracción k, modulada por ruido), t = tierra/suelo desnudo donde el color va a tierra
const MEZCLA = {
  [BIOMAS.playa]: { p: CAPA.arena, s: CAPA.arena, k: 0, t: CAPA.arena },
  [BIOMAS.pradera]: { p: CAPA.hierba, s: CAPA.hojarasca, k: 0.1, t: CAPA.hojarasca },
  [BIOMAS.selva]: { p: CAPA.hojarasca, s: CAPA.hierba, k: 0.35, t: CAPA.hojarasca },
  [BIOMAS.bosque]: { p: CAPA.hojarasca, s: CAPA.hierba, k: 0.45, t: CAPA.hojarasca },
  [BIOMAS.pantano]: { p: CAPA.barro, s: CAPA.hierba, k: 0.35, t: CAPA.barro },
  [BIOMAS.desierto]: { p: CAPA.desierto, s: CAPA.arena, k: 0.35, t: CAPA.desierto },
  [BIOMAS.montana]: { p: CAPA.hierba, s: CAPA.roca, k: 0.22, t: CAPA.hojarasca },
  [BIOMAS.nieve]: { p: CAPA.nieve, s: CAPA.roca, k: 0.08, t: CAPA.nieve },
  [BIOMAS.volcan]: { p: CAPA.ceniza, s: CAPA.roca, k: 0.15, t: CAPA.ceniza },
  [BIOMAS.taiga]: { p: CAPA.hojarasca, s: CAPA.hierba, k: 0.5, t: CAPA.hojarasca },
};
MEZCLA[BIOMAS.mar] = MEZCLA[BIOMAS.playa];
const _wv = new Float32Array(N_CAPAS), _ws = new Float32Array(N_CAPAS);
const mezclarPesos = (w, cap, k) => { for (let i = 0; i < N_CAPAS; i++) w[i] *= 1 - k; w[cap] += k; };

/** Color base del terreno en (x, z). `ny` = componente Y de la normal. Devuelve THREE.Color (reutilizado). Si se pasa `pesos` (Float32Array de N_CAPAS), escribe en él cuánto aporta cada capa de textura del suelo (suma 1). */
export function terrainColor(x, z, h, ny, out = _c, pesos = null) {
  const slope = 1 - ny;
  const macro = fbm(nM, x * 0.0035, z * 0.0035, 3); // -1..1 regiones grandes
  const patch = fbm(nD, x * 0.03, z * 0.03, 3);
  const fine = nS(x * 0.35, z * 0.35);

  if (h < 0) {
    out.copy(P.seabed).lerp(P.wetSand, smooth(-2, 0, h)).multiplyScalar(0.55 + 0.45 * smooth(-18, -1, h));
    if (pesos) { const M = getMundo(), i = Math.min(M.n - 1, Math.max(0, Math.floor((x + M.half) / M.cell))), j = Math.min(M.n - 1, Math.max(0, Math.floor((z + M.half) / M.cell))); pesos.fill(0); pesos[M.B[j * M.n + i] === BIOMAS.pantano ? CAPA.barro : CAPA.arena] = 1; }
    return out;
  }
  // los 4 vecinos de la rejilla macro (bioma) con pesos bilinear: transiciones suaves entre biomas
  const M = getMundo(), fx = (x + M.half) / M.cell - 0.5, fz = (z + M.half) / M.cell - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fz), tx = fx - i0, tz = fz - j0, n = M.n;
  _v.setRGB(0, 0, 0); _r.setRGB(0, 0, 0);
  let wSnow = 0, wSand = 0, wRoc = 0, wMud = 0;
  if (pesos) _wv.fill(0);
  for (let q = 0; q < 4; q++) {
    const ci = Math.min(n - 1, Math.max(0, i0 + (q & 1))), cj = Math.min(n - 1, Math.max(0, j0 + (q >> 1)));
    const w = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? tz : 1 - tz);
    let b = M.B[cj * n + ci]; if (b === BIOMAS.mar) b = BIOMAS.playa;
    const V = VEG[b];
    _b.copy(V.a).lerp(V.b, smooth(-0.3, 0.4, macro + patch * 0.4));
    _b.lerp(V.seco, smooth(0.25, 0.7, patch + macro * 0.3) * V.ks);
    _b.lerp(P.dirt, smooth(0.35, 0.65, -patch) * V.kd);
    _v.r += _b.r * w; _v.g += _b.g * w; _v.b += _b.b * w;
    if (pesos) { // misma lógica que el color: secundaria por ruido, tierra donde el color va a tierra
      const Z = MEZCLA[b], ws = Z.k * (0.4 + 1.2 * smooth(-0.3, 0.4, macro + patch * 0.4)), wt = smooth(0.35, 0.65, -patch) * V.kd * 0.8;
      const sS = Math.min(ws, 1), sT = Math.min(wt, 1 - sS);
      _wv[Z.p] += w * (1 - sS - sT); _wv[Z.s] += w * sS; _wv[Z.t] += w * sT;
    }
    _r.r += V.roca.r * w; _r.g += V.roca.g * w; _r.b += V.roca.b * w;
    if (b === BIOMAS.nieve) wSnow += w;
    if (b === BIOMAS.pantano) wMud += w;
    if (b === BIOMAS.playa || b === BIOMAS.desierto) wSand += w;
    if (b === BIOMAS.montana || b === BIOMAS.volcan || b === BIOMAS.nieve) wRoc += w;
  }
  _v.multiplyScalar(0.94 + fine * 0.08);
  // arena: húmeda cerca del mar, seca arriba; se funde con la vegetación del bioma sobre ~2–5 m
  _a.copy(P.wetSand).lerp(P.drySand, smooth(0.2, 1.6, h));
  if (wMud > 0) _a.lerp(P.mud, Math.min(1, wMud * 1.1)); // en los pantanos, el fondo bajo es barro, no arena
  _a.multiplyScalar(0.96 + fine * 0.05);
  // el pantano es llano y bajo: su vegetación empieza casi a nivel del agua
  const h0 = 1.8 - 1.6 * wMud, h1 = 5.5 - 4.6 * wMud;
  const tVegW = smooth(h0, h1, h + patch * 1.2 * (1 - wMud * 0.7)), tVeg = tVegW * (1 - wSand * 0.92);
  out.copy(_a).lerp(_v, tVeg);
  if (pesos) { // orilla: arena (o barro en el pantano) bajo la vegetación
    _ws.fill(0); const km = Math.min(1, wMud * 1.1); _ws[CAPA.arena] = 1 - km; _ws[CAPA.barro] += km;
    // (en playa y desierto la mezcla propia del bioma ya es arena/tierra agrietada: se usa tVegW, sin el freno de wSand que solo afecta al color)
    for (let i = 0; i < N_CAPAS; i++) pesos[i] = _ws[i] * (1 - tVegW) + _wv[i] * tVegW;
  }
  // roca por pendiente (más pronto en tierras altas) con estratos
  const rockiness = Math.max(smooth(0.17 - wRoc * 0.08, 0.33 - wRoc * 0.1, slope + patch * 0.04), wRoc * 0.35 * smooth(-0.2, 0.5, patch));
  if (rockiness > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 0.9 + nM(x * 0.02, z * 0.02) * 4.0);
    _a.copy(_r).multiplyScalar(0.8 + strata * 0.36);
    out.lerp(_a, Math.min(1, rockiness));
    if (pesos) mezclarPesos(pesos, CAPA.roca, Math.min(1, rockiness));
  }
  // nieve en las cumbres según el bioma, sobre superficies poco empinadas
  // (umbral de pendiente amplio y blando: con vértices cada 1–3 m un corte seco dibuja dientes de sierra en las laderas)
  const snow = smooth(0.3, 0.7, wSnow + patch * 0.18) * smooth(0.66, 0.14, slope + patch * 0.05);
  if (snow > 0) { out.lerp(P.snow, snow); if (pesos) mezclarPesos(pesos, CAPA.nieve, snow); }
  return out;
}

function buildGeometry(x0, z0, size) {
  const N = segDe(size);
  const step = size / N;
  const stride = N + 1;
  const nGrid = stride * stride;
  const nSkirt = 4 * stride;
  const total = nGrid + nSkirt;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  const pa = new Uint8Array(total * 4), pb = new Uint8Array(total * 4); // pesos de las 8 capas del suelo (0..255)
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
      terrainColor(x, z, h, ny, _c, _pw);
      col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
      for (let q = 0; q < 4; q++) { pa[k * 4 + q] = Math.round(_pw[q] * 255); pb[k * 4 + q] = Math.round(_pw[q + 4] * 255); }
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
    for (let q = 0; q < 4; q++) { pa[d * 4 + q] = pa[s * 4 + q]; pb[d * 4 + q] = pb[s * 4 + q]; }
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
  g.setAttribute('aPesoA', new THREE.BufferAttribute(pa, 4, true));
  g.setAttribute('aPesoB', new THREE.BufferAttribute(pb, 4, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Rango de alturas del nodo (muestreo grueso de la rejilla macro; basta para decidir qué mallas necesita). */
function rango(x0, z0, size) {
  const k = size >= 1024 ? 17 : size >= 256 ? 9 : 5, st = size / (k - 1);
  let lo = 1e9, hi = -1e9;
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const h = alturaMacro(x0 + i * st, z0 + j * st); if (h < lo) lo = h; if (h > hi) hi = h; }
  return [lo, hi];
}

/**
 * Crea el terreno. `suelos` = capas de textura (suelos.js · cargarSuelos); si no se pasa, se usan capas generadas por código.
 * El color del terreno = color del vértice × Σ capa_i ÷ medio_i, con mezcla por altura entre capas (la hierba asoma entre la tierra,
 * la arena rellena las grietas…). La roca se proyecta en tres planos (acantilados sin estirar); el resto, desde arriba.
 */
export function createTerrain(ctx, suelos = null) {
  const detail = createTerrainDetail(256); // solo para la variación de brillo a gran escala (manchas de 100–700 m)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const baja = (ctx.settings?.quality ?? 'high') === 'low';
  const giros = new Float32Array(N_CAPAS * 2); CAPAS.forEach((c, i) => { giros[i * 2] = Math.cos(c.giro); giros[i * 2 + 1] = Math.sin(c.giro); });
  const U = {
    tSueloA: { value: suelos?.albedo ?? null }, tSueloN: { value: suelos?.normal ?? null }, tMacro: { value: detail.albedo },
    uMedio: { value: suelos?.medios ?? new Float32Array(N_CAPAS * 3).fill(0.5) },
    uMetros: { value: new Float32Array(CAPAS.map((c) => c.metros)) }, uRug: { value: new Float32Array(CAPAS.map((c) => c.rugosidad)) }, uGiro: { value: giros },
    uMezclaAltura: { value: 0.42 }, uNormalK: { value: 1.0 },
  };
  mat.userData.suelo = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPesoA;\nattribute vec4 aPesoB;\nvarying vec4 vPA;\nvarying vec4 vPB;\nvarying float vWY;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
        vWY = wp4.y; vWP = wp4.xyz; vPA = aPesoA; vPB = aPesoB;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vPA; varying vec4 vPB; varying float vWY; varying vec3 vWP; varying vec3 vWN;
        uniform highp sampler2DArray tSueloA; uniform highp sampler2DArray tSueloN; uniform sampler2D tMacro;
        uniform vec3 uMedio[${N_CAPAS}]; uniform float uMetros[${N_CAPAS}]; uniform float uRug[${N_CAPAS}]; uniform vec2 uGiro[${N_CAPAS}];
        uniform float uMezclaAltura; uniform float uNormalK;
        vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-5); }
        vec2 uvCapa(int i, vec2 p) { vec2 g = uGiro[i]; return vec2(p.x * g.x - p.y * g.y, p.x * g.y + p.y * g.x) / uMetros[i]; }
        vec2 aMundo(int i, vec2 t) { vec2 g = uGiro[i]; return vec2(g.x * t.x + g.y * t.y, -g.y * t.x + g.x * t.y); }
        vec3 nCompleta(vec2 xy) { vec2 t = xy * 2.0 - 1.0; return vec3(t, sqrt(max(0.0, 1.0 - dot(t, t)))); }`)
      .replace('#include <map_fragment>', `
        // ---------------- capas del suelo (ver suelos.js)
        vec3 nWo = normalize(vWN), tw = triW(nWo);
        float wts[${N_CAPAS}];
        wts[0] = vPA.x; wts[1] = vPA.y; wts[2] = vPA.z; wts[3] = vPA.w; wts[4] = vPB.x; wts[5] = vPB.y; wts[6] = vPB.z; wts[7] = vPB.w;
        float lejos = ${baja ? '0.0' : 'smoothstep(14.0, 90.0, distance(vWP, cameraPosition))'};
        vec4 nh[${N_CAPAS}]; float hb[${N_CAPAS}]; float ma = -1.0;
        vec3 nRoca = nWo; float sR = 1.0 / uMetros[3];
        for (int i = 0; i < ${N_CAPAS}; i++) {
          nh[i] = vec4(0.5, 0.5, 0.5, 1.0); hb[i] = -1.0;
          if (wts[i] > 0.004) {
            if (i == 3) { // roca: tres proyecciones
              vec4 rx = texture(tSueloN, vec3(vWP.zy * sR, 3.0)), ry = texture(tSueloN, vec3(vWP.xz * sR, 3.0)), rz = texture(tSueloN, vec3(vWP.xy * sR, 3.0));
              nh[i].b = rx.b * tw.x + ry.b * tw.y + rz.b * tw.z;
              vec3 tx = nCompleta(rx.xy), ty = nCompleta(ry.xy), tz = nCompleta(rz.xy);
              tx = vec3(tx.xy * uNormalK + nWo.zy, abs(tx.z) * nWo.x); ty = vec3(ty.xy * uNormalK + nWo.xz, abs(ty.z) * nWo.y); tz = vec3(tz.xy * uNormalK + nWo.xy, abs(tz.z) * nWo.z);
              nRoca = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
            } else nh[i] = texture(tSueloN, vec3(uvCapa(i, vWP.xz), float(i)));
            hb[i] = wts[i] + nh[i].b * uMezclaAltura;
            ma = max(ma, hb[i]);
          }
        }
        ma -= 0.16 * uMezclaAltura + 0.02;
        float sumB = 0.0; float bw[${N_CAPAS}];
        for (int i = 0; i < ${N_CAPAS}; i++) { bw[i] = max(hb[i] - ma, 0.0); sumB += bw[i]; }
        vec3 alb = vec3(0.0); vec2 nxz = vec2(0.0); float sueloRug = 0.0, kRoca = 0.0;
        for (int i = 0; i < ${N_CAPAS}; i++) {
          if (bw[i] <= 0.0) continue;
          float k = bw[i] / sumB; vec3 a;
          if (i == 3) {
            a = texture(tSueloA, vec3(vWP.zy * sR, 3.0)).rgb * tw.x + texture(tSueloA, vec3(vWP.xz * sR, 3.0)).rgb * tw.y + texture(tSueloA, vec3(vWP.xy * sR, 3.0)).rgb * tw.z;
            kRoca += k;
          } else {
            vec2 uv = uvCapa(i, vWP.xz);
            a = texture(tSueloA, vec3(uv, float(i))).rgb;
            if (lejos > 0.01) a = mix(a, texture(tSueloA, vec3(uv * 0.27 + vec2(0.37, 0.71), float(i))).rgb, lejos * 0.55); // a distancia, otra escala: oculta el mosaico
            nxz += k * aMundo(i, nh[i].xy * 2.0 - 1.0);
          }
          alb += k * a / max(uMedio[i], vec3(0.02));
          sueloRug += k * uRug[i];
        }
        vec3 nSuelo = normalize(nWo + vec3(nxz.x, 0.0, nxz.y) * uNormalK);
        nSuelo = normalize(mix(nSuelo, nRoca, kRoca));
        diffuseColor.rgb *= alb;
        // manchas de brillo a gran escala y orilla mojada
        float d3 = texture2D(tMacro, vWP.xz * 0.0058 + vec2(0.71, 0.23)).r, d4 = texture2D(tMacro, vWP.xz * 0.0013 + vec2(0.13, 0.57)).r;
        diffuseColor.rgb *= (0.84 + 0.3 * d3) * (0.9 + 0.2 * d4);
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(-0.1, 1.1, vWY));
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.6, roughness * sueloRug * mix(0.78, 1.0, smoothstep(-0.1, 0.8, vWY)));') // mojado solo junto al agua y sin espejos
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(nSuelo, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => `terreno-capas-v1-${baja ? 'b' : 'a'}`;
  ctx.lighting?.setupMaterial?.(mat);

  const group = new THREE.Group();
  group.name = 'terreno';
  ctx.scene.add(group);
  const waterGroup = new THREE.Group();
  waterGroup.name = 'agua';
  ctx.scene.add(waterGroup);

  // ------------------------------------------------------------ árbol de nodos
  let frame = 0, nBuilt = 0;
  function crearNodo(lvl, x0, z0, size, padre) {
    const [lo, hi] = rango(x0, z0, size);
    return { lvl, x0, z0, size, padre, hijos: null, split: false, built: false, mesh: null, water: null, hi, tieneTerreno: hi > PROFUNDO, tieneAgua: lo < 0.6, profundo: hi < -40, vis: false, lastVis: 0, dist: 0, ronda: -1 };
  }
  const roots = [];
  for (let j = 0; j < NROOT; j++) for (let i = 0; i < NROOT; i++) roots.push(crearNodo(0, -HALF + i * ROOT, -HALF + j * ROOT, ROOT, null));
  const all = new Set(roots);

  function hijosDe(n) {
    if (!n.hijos) {
      const h = n.size / 2;
      n.hijos = [crearNodo(n.lvl + 1, n.x0, n.z0, h, n), crearNodo(n.lvl + 1, n.x0 + h, n.z0, h, n), crearNodo(n.lvl + 1, n.x0, n.z0 + h, h, n), crearNodo(n.lvl + 1, n.x0 + h, n.z0 + h, h, n)];
      for (const c of n.hijos) all.add(c);
    }
    return n.hijos;
  }

  function construir(n) {
    if (n.built) return;
    if (n.tieneTerreno) {
      const g = buildGeometry(n.x0, n.z0, n.size);
      const m = new THREE.Mesh(g, mat);
      m.position.set(n.x0, 0, n.z0);
      m.receiveShadow = true; m.castShadow = n.size <= 128;
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.visible = false;
      group.add(m); n.mesh = m;
    }
    if (n.tieneAgua && ctx.world?.water) {
      const w = ctx.world.water.build(n.x0, n.z0, n.size, n.profundo);
      w.visible = false; waterGroup.add(w); n.water = w;
    }
    n.built = true; nBuilt++;
  }
  function liberar(n) {
    if (!n.built) return;
    if (n.mesh) { group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh = null; }
    if (n.water) { waterGroup.remove(n.water); n.water.geometry.dispose(); n.water = null; }
    n.built = false; n.vis = false; nBuilt--;
  }
  function mostrar(n, v) {
    if (n.vis === v) return;
    n.vis = v;
    if (n.mesh) n.mesh.visible = v;
    if (n.water) n.water.visible = v;
    if (v) n.lastVis = frame;
  }
  function ocultarSubarbol(n) {
    mostrar(n, false);
    if (n.hijos) for (const c of n.hijos) { c.split = false; ocultarSubarbol(c); }
  }

  const queue = [];
  let cx = 0, cy = 0, cz = 0;
  function dist(n) {
    const dx = Math.max(n.x0 - cx, 0, cx - (n.x0 + n.size)), dz = Math.max(n.z0 - cz, 0, cz - (n.z0 + n.size));
    return Math.hypot(dx, dz, Math.max(0, cy - Math.max(n.hi, 0))); // distancia 3D a la caja del nodo: desde muy arriba basta con mallas gruesas
  }
  let cambios = 0, ronda = 0; // `ronda`: sello de cada recorrido; los nodos que el corte actual necesita (o espera) llevan el sello y no se liberan
  function visitar(n) {
    n.dist = dist(n); n.ronda = ronda;
    const dividir = n.size > MIN && n.dist < n.size * (n.split ? R_OUT : R_IN);
    if (dividir) {
      const hs = hijosDe(n);
      if (!n.split) {
        let listos = true;
        for (const c of hs) { c.ronda = ronda; if (!c.built) { listos = false; c.dist = dist(c); queue.push(c); } }
        if (listos) { n.split = true; mostrar(n, false); cambios++; }
        // mientras sus hijos no estén todos construidos, este nodo sigue a la vista (si no, queda un hueco: su padre ya está oculto)
        else if (n.built) mostrar(n, true); else queue.push(n);
      }
      if (n.split) for (const c of hs) visitar(c);
    } else {
      if (n.split) {
        if (!n.built) queue.push(n);
        else { n.split = false; if (n.hijos) for (const c of n.hijos) { c.split = false; ocultarSubarbol(c); } cambios++; }
      }
      if (!n.split) {
        if (!n.built) queue.push(n); else mostrar(n, true);
      }
    }
  }

  let lastX = 1e9, lastY = 1e9, lastZ = 1e9, lastT = -1;
  function refrescar(force) {
    const cam = ctx.camera.position;
    if (!force && Math.hypot(cam.x - lastX, cam.z - lastZ) < 6 && Math.abs(cam.y - lastY) < 12 && frame - lastT < 20) return;
    lastX = cam.x; lastY = cam.y; lastZ = cam.z; lastT = frame; cx = cam.x; cy = cam.y; cz = cam.z;
    queue.length = 0; cambios = 0; ronda++;
    for (const r of roots) visitar(r);
    queue.sort((a, b) => a.dist - b.dist);
    // memoria: libera los nodos menos recientes que no se ven
    if (nBuilt > CAP) {
      // candidatos: construidos, ocultos y que el corte actual no necesita ni espera (liberar un hijo en espera impide que su padre se divida nunca)
      const cand = []; for (const n of all) if (n.built && !n.vis && !n.split && n.ronda !== ronda) cand.push(n);
      cand.sort((a, b) => a.lastVis - b.lastVis);
      for (const n of cand) { if (nBuilt <= CAP * 0.85) break; liberar(n); }
    }
  }

  /** Marca como visibles los hijos de un nodo dividido que ya estén construidos (se ve cada hoja del árbol actual). */
  function mostrarHojas(n) {
    if (n.split) { for (const c of n.hijos) mostrarHojas(c); } else if (n.built) mostrar(n, true);
  }

  function procesar(budgetMs) {
    const t0 = performance.now(); let hechos = 0;
    while (queue.length) {
      const n = queue.shift();
      if (n.built) continue;
      construir(n); hechos++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return hechos;
  }

  const api = {
    group, waterGroup, material: mat,
    /** Construye todo lo pendiente de golpe (carga inicial o teletransporte): repite hasta que el árbol deja de cambiar. */
    prime() {
      for (let it = 0; it < 14; it++) {
        refrescar(true);
        const n = procesar(1e9);
        if (!n && !cambios) break;
      }
      refrescar(true); for (const r of roots) mostrarHojas(r);
    },
    /** Reparte la construcción entre frames: construye nodos hasta agotar `budgetMs` (siempre al menos uno). */
    update(budgetMs = 5) {
      frame++;
      const cam = ctx.camera.position;
      if (Math.hypot(cam.x - lastX, cam.z - lastZ, cam.y - lastY) > 700) { api.prime(); return; } // salto grande (teletransporte, reaparición): sin huecos
      refrescar(false);
      if (queue.length) { procesar(budgetMs); if (!queue.length) refrescar(true); }
    },
    stats() {
      let vis = 0, tri = 0; for (const n of all) if (n.vis && n.mesh) { vis++; tri += n.mesh.geometry.index.count / 3; }
      return { construidos: nBuilt, visibles: vis, pendientes: queue.length, triangulos: tri, nodos: all.size };
    },
    /** Diagnóstico: cadena de nodos (raíz → hoja) que cubre el punto (x, z), con su estado. */
    cadena(x, z) {
      const out = []; let n = roots.find((r) => x >= r.x0 && x < r.x0 + r.size && z >= r.z0 && z < r.z0 + r.size);
      while (n) { out.push({ lvl: n.lvl, size: n.size, built: n.built, split: n.split, vis: n.vis, mesh: !!n.mesh, malla: !!n.mesh && n.mesh.visible, terreno: n.tieneTerreno, lastVis: n.lastVis }); n = n.hijos?.find((c) => x >= c.x0 && x < c.x0 + c.size && z >= c.z0 && z < c.z0 + c.size); }
      return { frame, nBuilt, cola: queue.length, out };
    },
    nodosVisibles() { const o = []; for (const n of all) if (n.vis) o.push({ lvl: n.lvl, x0: n.x0, z0: n.z0, size: n.size, mesh: !!n.mesh, agua: !!n.water }); return o; },
  };
  return api;
}
