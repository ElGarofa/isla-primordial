// GENERADOR DEL MUNDO — construye una vez (determinista por semilla) las rejillas macro del mapa grande:
//   H   altura base (m) · B bioma (id de BIOMAS) · P provincia (255 = mar) · Z zona de mar (255 = tierra) · DC distancia a la costa (m, + tierra, − mar) · HUM humedad 0..255
// Después heightfield.js muestrea H con interpolación bicúbica y le suma relieve fino; las rejillas también alimentan el mapa, la fauna y los recursos.
// Sin dependencias de three: se puede ejecutar en Node (tools/mundo-preview.mjs).
import { createNoise2D, fbm, ridged } from '../core/noise.js';
import { PROVINCIAS, MARES, RASGOS, BIOMAS, PROV_ID, MAR_ID } from './provincias.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Perfil del lecho marino según la distancia a la costa (m): plataforma suave que se hunde hacia mar abierto. */
const PERFIL_MAR = [[0, 0], [28, -1.0], [80, -3.0], [170, -6.5], [330, -13], [650, -28], [1200, -60], [2000, -100], [3200, -145], [6000, -190]];
export function perfilMar(d) {
  if (d <= 0) return 0;
  for (let i = 1; i < PERFIL_MAR.length; i++) {
    if (d <= PERFIL_MAR[i][0]) { const [d0, h0] = PERFIL_MAR[i - 1], [d1, h1] = PERFIL_MAR[i]; return lerp(h0, h1, (d - d0) / (d1 - d0)); }
  }
  return PERFIL_MAR[PERFIL_MAR.length - 1][1];
}

/** Transformada de distancia por chamfer (pesos 3-4): rellena `dist` (en celdas·3) a partir de las celdas `fuente`. */
function chamfer(n, fuente, dist) {
  const INF = 1e9;
  for (let k = 0; k < n * n; k++) dist[k] = fuente[k] ? 0 : INF;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let d = dist[k]; if (d === 0) continue;
    if (i > 0) d = Math.min(d, dist[k - 1] + 3);
    if (j > 0) { d = Math.min(d, dist[k - n] + 3); if (i > 0) d = Math.min(d, dist[k - n - 1] + 4); if (i < n - 1) d = Math.min(d, dist[k - n + 1] + 4); }
    dist[k] = d;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let d = dist[k]; if (d === 0) continue;
    if (i < n - 1) d = Math.min(d, dist[k + 1] + 3);
    if (j < n - 1) { d = Math.min(d, dist[k + n] + 3); if (i < n - 1) d = Math.min(d, dist[k + n + 1] + 4); if (i > 0) d = Math.min(d, dist[k + n - 1] + 4); }
    dist[k] = d;
  }
}

export function generarMundo({ seed = 1337, size = 12288, n = 768 } = {}) {
  const half = size / 2, cell = size / n;
  const nW1 = createNoise2D(seed + 1001), nW2 = createNoise2D(seed + 1002), nCoast = createNoise2D(seed + 1003), nHill = createNoise2D(seed + 1004);
  const nMont = createNoise2D(seed + 1005), nPass = createNoise2D(seed + 1006), nHum = createNoise2D(seed + 1007), nBio = createNoise2D(seed + 1008);
  const nPond = createNoise2D(seed + 1009), nSea = createNoise2D(seed + 1010), nTemp = createNoise2D(seed + 1011);
  const N2 = n * n;
  const H = new Float32Array(N2), B = new Uint8Array(N2), P = new Uint8Array(N2).fill(255), Z = new Uint8Array(N2).fill(255);
  const DC = new Float32Array(N2), HUM = new Uint8Array(N2), DB = new Float32Array(N2);
  const land = new Uint8Array(N2), score = new Float32Array(N2), wAlt = new Float32Array(N2), wAmp = new Float32Array(N2), wMont = new Float32Array(N2);
  const wTemp = new Float32Array(N2), wHum = new Float32Array(N2), wRef = new Float32Array(N2), wTer = new Float32Array(N2), wCor = new Float32Array(N2);
  const nP = PROVINCIAS.length;
  const prov = PROVINCIAS.map((p) => ({ cx: p.centro[0], cz: p.centro[1], r: p.radio, ...p.clima, ...p.relieve }));

  // 1) provincias y tierra firme: cada celda pertenece a la provincia de mayor «influencia»; la costa sigue ruido
  const w = new Float32Array(nP), nearP = new Uint8Array(n * n), nearS = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
    const wx = x + 470 * fbm(nW1, x * 0.00042, z * 0.00042, 3), wz = z + 470 * fbm(nW2, x * 0.00042 + 9.1, z * 0.00042 - 4.3, 3);
    let best = -9, bk = 0, sw = 0;
    for (let q = 0; q < nP; q++) {
      const p = prov[q], d = Math.hypot(wx - p.cx, wz - p.cz) / p.r, s = 1 - d;
      w[q] = s; if (s > best) { best = s; bk = q; }
    }
    const coastN = 0.1 * fbm(nCoast, x * 0.0013, z * 0.0013, 5) + 0.035 * nCoast(x * 0.006 + 40, z * 0.006);
    for (const v of RASGOS) { // los volcanes también crean tierra (islas dentro de una bahía)
      const dv = Math.hypot(x - v.centro[0], z - v.centro[1]) / v.radio, sv = 0.95 - dv * 1.05;
      if (sv > best) { best = sv; bk = PROV_ID[v.provincia] ?? bk; }
    }
    score[k] = best - coastN; nearP[k] = bk; nearS[k] = best;
    if (best - coastN > 0.02) { land[k] = 1; P[k] = bk; }
    // parámetros de relieve y clima mezclados con suavidad entre provincias vecinas (softmax de la influencia)
    let a = 0, am = 0, mo = 0, te = 0, hu = 0, rf = 0, tz = 0, cr = 0; sw = 0;
    for (let q = 0; q < nP; q++) { const e = Math.exp(Math.max(-3, w[q]) * 7); sw += e; a += e * prov[q].alt0; am += e * prov[q].amp; mo += e * prov[q].mont; te += e * prov[q].temp; hu += e * prov[q].hum; rf += e * prov[q].r * 0.5; tz += e * (prov[q].terraza ?? 0); cr += e * (prov[q].cordillera ?? 0.7); }
    wAlt[k] = a / sw; wAmp[k] = am / sw; wMont[k] = mo / sw; wTemp[k] = te / sw; wHum[k] = hu / sw; wRef[k] = rf / sw; wTer[k] = tz / sw; wCor[k] = cr / sw;
  }
  // 2) elimina islotes y lagunas diminutas de 1-2 celdas (ruido de costa)
  for (let pass = 0; pass < 2; pass++) for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; let c = 0;
    c += land[k - 1] + land[k + 1] + land[k - n] + land[k + n] + land[k - n - 1] + land[k - n + 1] + land[k + n - 1] + land[k + n + 1];
    if (land[k] && c <= 1) { land[k] = 0; P[k] = 255; } else if (!land[k] && c >= 7) { land[k] = 1; let bq = 0, bs = -9; for (const o of [-1, 1, -n, n]) { if (P[k + o] !== 255 && score[k + o] > bs) { bs = score[k + o]; bq = P[k + o]; } } P[k] = bq; }
  }
  // 3) distancia a la costa (m): positiva en tierra, negativa en el mar
  const dTierra = new Float32Array(N2), dMar = new Float32Array(N2), mar = new Uint8Array(N2);
  for (let k = 0; k < N2; k++) mar[k] = land[k] ? 0 : 1;
  chamfer(n, mar, dTierra); // distancia desde cada celda hasta el mar más cercano (para tierra)
  chamfer(n, land, dMar);
  for (let k = 0; k < N2; k++) DC[k] = land[k] ? Math.max(0.5, (dTierra[k] / 3) * cell - cell * 0.5) : -Math.max(0.5, (dMar[k] / 3) * cell - cell * 0.5);
  // 4) distancia a la frontera con otra provincia (m) — sirve para las cordilleras fronterizas
  const frontera = new Uint8Array(N2), dF = new Float32Array(N2);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; if (!land[k]) continue;
    if ((land[k - 1] && P[k - 1] !== P[k]) || (land[k + 1] && P[k + 1] !== P[k]) || (land[k - n] && P[k - n] !== P[k]) || (land[k + n] && P[k + n] !== P[k])) frontera[k] = 1;
  }
  chamfer(n, frontera, dF);
  for (let k = 0; k < N2; k++) DB[k] = land[k] ? (dF[k] / 3) * cell : 99999;

  // 5) alturas
  const vol = RASGOS.filter((r) => r.tipo === 'volcan');
  const volc = new Float32Array(N2); // influencia volcánica 0..1
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell, dc = DC[k];
    if (!land[k]) { // fondo marino
      const d = -dc;
      const ruido = 1 + 0.18 * fbm(nSea, x * 0.0016, z * 0.0016, 3);
      let h = perfilMar(d) * ruido - 0.8 * smooth(0, 120, d) * (0.5 + 0.5 * nSea(x * 0.01 + 5, z * 0.01));
      // volcanes submarinos: no hay; islas de otro mar: no
      H[k] = Math.min(h, -0.3);
      continue;
    }
    const ref = Math.min(1700, wRef[k]); // la tierra «de verdad» empieza más cerca de la costa en las provincias pequeñas
    const inl = smooth(0, ref, dc);
    const base = wAlt[k] * inl;
    const hills = fbm(nHill, x * 0.0017, z * 0.0017, 5) * wAmp[k] * smooth(40, ref * 0.4, dc);
    // las crestas se calculan en coordenadas deformadas y giradas: así no se alinean con la retícula del ruido simplex
    const ux = x + 240 * nW1(x * 0.0005 + 31, z * 0.0005), uz = z + 240 * nW2(x * 0.0005, z * 0.0005 - 17);
    const rx = 0.80 * ux - 0.60 * uz, rz = 0.60 * ux + 0.80 * uz;
    const mr = ridged(nMont, rx * 0.00085, rz * 0.00085, 5);
    const mont = wMont[k] * Math.pow(mr, 1.9) * 430 * smooth(ref * 0.25, ref * 1.1, dc);
    // cordillera fronteriza con pasos
    const pass = smooth(-0.22, 0.28, fbm(nPass, x * 0.0014, z * 0.0014, 3));
    const ridge = 150 * wCor[k] * Math.exp(-((DB[k] / 300) ** 2)) * (0.1 + 0.9 * pass) * (0.55 + 0.9 * ridged(nMont, rx * 0.0021 + 3, rz * 0.0021, 3)) * smooth(ref * 0.15, ref * 0.55, dc);
    let h = base + hills + mont + ridge + Math.min(3.2, dc * 0.045) * (1 - smooth(0, 90, base + hills));
    // mesetas y terrazas (tierras malas): el relieve se «escalona» en peldaños de 16 m
    if (wTer[k] > 0.02 && h > 20) { const q = Math.round(h / 16) * 16, t = clamp(wTer[k], 0, 1) * smooth(20, 70, h); h = lerp(h, q + (h - q) * 0.25, t * 0.8); }
    // volcanes
    let vi = 0;
    for (const v of vol) {
      const d = Math.hypot(x - v.centro[0], z - v.centro[1]) / v.radio;
      if (d < 1) {
        const cono = v.altura * Math.pow(1 - d, 1.45);
        const rim = 0.085;
        let c = cono; if (d < rim) c -= (1 - d / rim) * v.crater * 1.2;
        h += c * smooth(0, 120, dc); vi = Math.max(vi, 1 - smooth(0.35, 0.85, d));
      }
    }
    volc[k] = vi;
    H[k] = h;
  }
  // 6) clima local, humedad y bioma
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
    if (!land[k]) {
      B[k] = BIOMAS.mar; HUM[k] = 255;
      let bq = 0, bd = 1e9; for (let q = 0; q < MARES.length; q++) { const m = MARES[q], d = Math.hypot(x - m.centro[0], z - m.centro[1]) / m.radio; if (d < bd) { bd = d; bq = q; } }
      const pm = nearS[k] > -0.55 ? PROVINCIAS[nearP[k]].mar : null; // mar costero: el de la provincia más cercana (también en golfos interiores)
      Z[k] = pm != null ? MAR_ID[pm] : bq; continue;
    }
    const h = H[k], dc = DC[k];
    const hl = H[k - 1 >= 0 ? k - 1 : k], hr = H[k + 1 < N2 ? k + 1 : k], hu = H[k - n >= 0 ? k - n : k], hd = H[k + n < N2 ? k + n : k];
    const gx = (hr - hl) / (2 * cell), gz = (hd - hu) / (2 * cell), slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
    const temp = wTemp[k] + 2.5 * fbm(nTemp, x * 0.0009, z * 0.0009, 3) - 6.5 * Math.max(0, h) / 1000 * 1.9;
    const hum = clamp(wHum[k] + 0.3 * fbm(nHum, x * 0.0008, z * 0.0008, 4) + (dc < 900 ? 0.06 * (1 - dc / 900) : 0), 0, 1);
    HUM[k] = Math.round(hum * 255);
    const bn = fbm(nBio, x * 0.0021, z * 0.0021, 3);
    const snowH = 150 + (wTemp[k] - 3) * 11;
    let b;
    if (volc[k] > 0.42) b = BIOMAS.volcan;
    else if (h > snowH) b = BIOMAS.nieve;
    else if (h > snowH * 0.66 || slope > 0.14 && h > 60) b = BIOMAS.montana;
    else if (dc < 85 && h < 3.4) b = BIOMAS.playa;
    else if (h < 6 && hum > 0.5 && dc > 85 && nPond(x * 0.0021, z * 0.0021) > 0.18 - (hum - 0.5) * 0.9) b = BIOMAS.pantano;
    else if (temp < 7) b = BIOMAS.taiga;
    else if (hum < 0.27) b = BIOMAS.desierto;
    else if (hum < 0.43) b = bn > 0.35 ? BIOMAS.desierto : BIOMAS.pradera;
    else if (hum < 0.6) b = bn > -0.05 ? BIOMAS.bosque : BIOMAS.pradera;
    else b = temp > 19.5 ? (bn > 0.5 ? BIOMAS.pradera : BIOMAS.selva) : BIOMAS.bosque;
    B[k] = b;
    // lagunas dentro del pantano (por debajo del nivel del mar)
    if (b === BIOMAS.pantano) {
      const q = nPond(x * 0.0048 + 77, z * 0.0048);
      const pond = smooth(0.12, 0.34, q);
      if (pond > 0) H[k] = lerp(H[k], -0.5 - 2.4 * pond, pond);
    }
  }
  return { size, n, cell, half, H, B, P, Z, DC, DB, HUM, land };
}
