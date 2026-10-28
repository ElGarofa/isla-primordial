// FAMILIA BÍPEDOS — generador paramétrico de terópodos, dinosaurios tempranos, ornitisquios pequeños y paquicefalosaurios.
//
// Una especie se describe con unas pocas cifras absolutas (longitud total y masa del catálogo) más un ARQUETIPO (proporciones típicas del grupo)
// y los rasgos propios (cuernos, velas, plumas, garra en hoz, domo…). `medirBipedo` convierte eso en medidas reales (metros) y
// `construirBipedo` en esqueleto + malla con piel + patas para IK, con el MISMO contrato que `buildTheropod` (species.js).
//
// HONESTIDAD: son reconstrucciones procedurales, no escaneos. Las proporciones siguen la literatura de forma aproximada; la silueta (cabeza, cuello,
// cola, brazos, patas, cuernos, velas) distingue a cada especie, pero el detalle fino (musculatura, plumas individuales) no está representado.
import * as THREE from 'three';
import { SkinBuilder, makeSkeleton, PART, V } from '../builder.js';
import { colorizer } from '../color.js';
import { crearHit, cadena } from './hit.js';

const { sin, cos, sqrt, max, min, PI } = Math;
const clamp = (v, a, b) => min(b, max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const unit = (x, y, z, l) => { const k = l / (Math.hypot(x, y, z) || 1); return [x * k, y * k, z * k]; };
function interp(ts, arr, t) {
  if (t <= ts[0]) return arr[0];
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]) return lerp(arr[i - 1], arr[i], (t - ts[i - 1]) / (ts[i] - ts[i - 1]));
  return arr[arr.length - 1];
}

// Perfiles de cráneo: t (a lo largo de la cabeza), semianchura y semialtura (fracción de la longitud de la cabeza) y desvío vertical del eje.
const CAB = {
  normal: { t: [0, 0.22, 0.47, 0.75, 1], rx: [0.148, 0.164, 0.133, 0.09, 0.062], ry: [0.156, 0.18, 0.14, 0.097, 0.07], dy: [0, 0.047, 0, -0.06, -0.125] },
  profunda: { t: [0, 0.22, 0.47, 0.75, 1], rx: [0.2, 0.26, 0.22, 0.15, 0.11], ry: [0.23, 0.28, 0.22, 0.15, 0.105], dy: [0, 0.04, 0, -0.05, -0.1] },
  alta: { t: [0, 0.22, 0.47, 0.75, 1], rx: [0.13, 0.15, 0.12, 0.085, 0.06], ry: [0.2, 0.25, 0.2, 0.14, 0.09], dy: [0, 0.05, 0.01, -0.05, -0.1] },
  corta: { t: [0, 0.25, 0.55, 0.8, 1], rx: [0.2, 0.26, 0.23, 0.17, 0.12], ry: [0.27, 0.33, 0.29, 0.22, 0.15], dy: [0, 0.03, -0.02, -0.07, -0.1] },
  croco: { t: [0, 0.2, 0.45, 0.7, 0.88, 1], rx: [0.11, 0.115, 0.095, 0.08, 0.07, 0.105], ry: [0.13, 0.15, 0.115, 0.085, 0.07, 0.08], dy: [0, 0.02, -0.01, -0.03, -0.04, -0.04] },
  pico: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.12, 0.14, 0.11, 0.065, 0.04], ry: [0.17, 0.2, 0.15, 0.095, 0.06], dy: [0, 0.02, 0, -0.04, -0.09] },
  loro: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.18, 0.24, 0.2, 0.12, 0.07], ry: [0.27, 0.33, 0.27, 0.17, 0.1], dy: [0, 0.03, 0, -0.07, -0.13] },
  caballo: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.1, 0.12, 0.105, 0.1, 0.12], ry: [0.2, 0.22, 0.16, 0.12, 0.1], dy: [0, 0.02, -0.01, -0.06, -0.12] },
  fina: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.09, 0.1, 0.07, 0.04, 0.025], ry: [0.13, 0.15, 0.09, 0.055, 0.035], dy: [0, 0.02, -0.01, -0.04, -0.07] },
  domo: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.17, 0.22, 0.18, 0.1, 0.06], ry: [0.22, 0.28, 0.2, 0.12, 0.08], dy: [0, 0.03, -0.01, -0.05, -0.1] },
};
const OWN = { cuerpoT: [0, 0.105, 0.3, 0.51, 0.7, 0.88] }; // posiciones de las articulaciones de la cola (fracción de su longitud)

// Proporciones por defecto y por arquetipo. Fracciones de la longitud total L salvo indicación. Se normalizan cola+torso+cuello+cabeza = 1.
const BASE = {
  cola: 0.5, torso: 0.22, cuello: 0.12, cabeza: 0.12, H: 0.28, pit: 0.15, colaCaida: 0.17, colaGrosor: 1, colaForma: 1, lomo: 0.55, bh: 1, ancho: 0.8,
  cuelloAng: [0.47, 0.94, 0.66], cuelloGrosor: 1, hp: -0.1, cab: 'normal', cabAlto: 1, cabAncho: 1, dientes: 6, dienteL: 0.07,
  pata: [0.44, 0.4], phi: [0.58, 0.55], muslo: 1, patasGrosor: 1, dedos: 3, garraPie: 0.02, pezuna: false, hoz: 0,
  brazo: 0.12, brazoR: 0.075, dedosB: 3, garraB: 0.15, pulgar: 0, rasgos: [], ojo: 1, plumon: 1,
  skin: 'raptor', anim: 'teropodo', run: 7, rol: 'depredador',
};
export const ARQ = {
  tirano: { bh: 1.0, colaForma: 1.3, cola: 0.5, torso: 0.22, cuello: 0.1, cabeza: 0.13, H: 0.27, pit: 0.12, cab: 'profunda', dientes: 8, dienteL: 0.075, pata: [0.46, 0.4], muslo: 1.25, patasGrosor: 1.25, colaGrosor: 1.12, cuelloGrosor: 1.4, ancho: 0.9, brazo: 0.07, brazoR: 0.1, dedosB: 2, garraB: 0.2, cuelloAng: [0.35, 0.75, 0.45], hp: -0.12, skin: 'rex', run: 7 },
  alosaurio: { bh: 1.1, cuelloGrosor: 1.3, colaForma: 1.2, cola: 0.5, torso: 0.22, cuello: 0.11, cabeza: 0.13, H: 0.29, pit: 0.12, cab: 'alta', dientes: 7, dienteL: 0.07, pata: [0.45, 0.42], muslo: 1.15, patasGrosor: 1.1, ancho: 0.8, brazo: 0.13, brazoR: 0.085, dedosB: 3, garraB: 0.28, cuelloAng: [0.4, 0.8, 0.5], hp: -0.1, skin: 'rex', run: 7.2 },
  abelisaurio: { bh: 1.12, colaForma: 1.3, cola: 0.52, torso: 0.23, cuello: 0.12, cabeza: 0.1, H: 0.27, cab: 'corta', pata: [0.42, 0.42], patasGrosor: 1.25, colaGrosor: 1.15, cuelloGrosor: 1.6, brazo: 0.04, brazoR: 0.11, dedosB: 3, garraB: 0.1, dientes: 6, dienteL: 0.055, ancho: 0.9, cuelloAng: [0.3, 0.7, 0.4], skin: 'rex', run: 6.8 },
  espinosaurio: { colaForma: 1.15, cola: 0.46, torso: 0.23, cuello: 0.14, cabeza: 0.17, H: 0.24, pit: 0.1, cab: 'croco', pata: [0.4, 0.38], patasGrosor: 1.1, brazo: 0.14, brazoR: 0.1, dedosB: 3, garraB: 0.22, dientes: 9, dienteL: 0.045, run: 5.8, ancho: 0.85, cuelloAng: [0.4, 0.85, 0.5], skin: 'croco' },
  dromeosaurio: { cola: 0.59, torso: 0.17, cuello: 0.12, cabeza: 0.12, H: 0.3, pit: 0.15, cab: 'normal', pata: [0.43, 0.43], bh: 1.0, ancho: 0.78, brazo: 0.17, brazoR: 0.07, dedosB: 3, garraB: 0.2, hoz: 0.05, dientes: 7, colaGrosor: 0.8, skin: 'raptor', run: 8.5 },
  celofisoide: { cola: 0.54, torso: 0.2, cuello: 0.15, cabeza: 0.11, H: 0.27, cab: 'normal', pata: [0.43, 0.46], bh: 1.0, ancho: 0.75, brazo: 0.14, brazoR: 0.065, dedosB: 3, garraB: 0.2, dientes: 8, dienteL: 0.06, colaGrosor: 0.85, cuelloAng: [0.55, 1.0, 0.7], skin: 'raptor', run: 8 },
  ornitomimido: { cola: 0.52, torso: 0.2, cuello: 0.18, cabeza: 0.09, H: 0.37, pit: 0.12, cab: 'pico', dientes: 0, pata: [0.4, 0.47], bh: 1.0, ancho: 0.72, brazo: 0.2, brazoR: 0.05, dedosB: 3, garraB: 0.14, cuelloAng: [0.6, 1.25, 0.3], hp: -0.05, anim: 'ornitomimo', skin: 'gall', run: 12, rol: 'omnivoro' },
  oviraptorido: { cola: 0.5, torso: 0.2, cuello: 0.17, cabeza: 0.11, H: 0.36, cab: 'pico', dientes: 0, pata: [0.4, 0.46], bh: 1.0, ancho: 0.8, brazo: 0.22, brazoR: 0.055, dedosB: 3, garraB: 0.2, cuelloAng: [0.6, 1.15, 0.4], hp: -0.2, anim: 'ornitomimo', skin: 'comps', run: 9, plumon: 1, rol: 'omnivoro' },
  terizinosaurio: { cola: 0.24, torso: 0.3, cuello: 0.23, cabeza: 0.09, H: 0.3, pit: 0.26, cab: 'fina', dientes: 0, pata: [0.38, 0.38], patasGrosor: 1.3, bh: 1.0, ancho: 1.0, brazo: 0.36, brazoR: 0.06, dedosB: 3, garraB: 0.85, cuelloAng: [0.7, 1.2, 0.45], hp: -0.2, colaCaida: 0.05, anim: 'ornitomimo', skin: 'plumon', run: 5.5, plumon: 1, rol: 'herbivoro' },
  alvarezsaurido: { cola: 0.5, torso: 0.18, cuello: 0.16, cabeza: 0.12, H: 0.34, cab: 'fina', dientes: 10, dienteL: 0.025, pata: [0.38, 0.5], bh: 1.0, ancho: 0.75, brazo: 0.07, brazoR: 0.07, dedosB: 1, garraB: 0.55, cuelloAng: [0.6, 1.0, 0.4], skin: 'plumon', run: 11, rol: 'insectivoro', plumon: 1 },
  avialano: { cola: 0.5, torso: 0.24, cuello: 0.13, cabeza: 0.13, H: 0.28, pit: 0.3, cab: 'normal', dientes: 5, dienteL: 0.04, pata: [0.4, 0.42], bh: 1.0, ancho: 0.85, brazo: 0.3, brazoR: 0.05, dedosB: 3, garraB: 0.12, skin: 'plumon', run: 6, plumon: 1, rol: 'insectivoro', cuello: 0.15 },
  basal: { cola: 0.54, torso: 0.22, cuello: 0.13, cabeza: 0.11, H: 0.31, cab: 'normal', pata: [0.43, 0.45], bh: 1.0, ancho: 0.8, brazo: 0.2, brazoR: 0.07, dedosB: 3, garraB: 0.16, dientes: 6, dienteL: 0.055, skin: 'raptor', run: 8 },
  sauropodomorfo: { cola: 0.42, torso: 0.28, cuello: 0.22, cabeza: 0.08, H: 0.28, pit: 0.14, cab: 'fina', dientes: 0, pata: [0.43, 0.4], patasGrosor: 1.25, bh: 1.1, ancho: 0.95, brazo: 0.2, brazoR: 0.11, dedosB: 3, garraB: 0.12, pulgar: 0.2, cuelloAng: [0.55, 1.05, 0.4], hp: -0.18, colaCaida: 0.1, colaGrosor: 1.2, anim: 'ornitomimo', skin: 'parasaur', run: 5, rol: 'herbivoro', pezuna: true },
  ornitisquio: { cola: 0.56, torso: 0.22, cuello: 0.12, cabeza: 0.1, H: 0.33, cab: 'loro', dientes: 0, pata: [0.4, 0.46], bh: 1.05, ancho: 0.85, brazo: 0.15, brazoR: 0.065, dedosB: 4, garraB: 0.1, hp: -0.16, anim: 'ornitomimo', skin: 'gall', run: 9, rol: 'herbivoro', pezuna: true },
  iguanodontido: { cola: 0.5, torso: 0.27, cuello: 0.12, cabeza: 0.11, H: 0.28, pit: 0.2, cab: 'caballo', dientes: 0, pata: [0.44, 0.42], patasGrosor: 1.3, bh: 1.05, ancho: 0.92, brazo: 0.2, brazoR: 0.11, dedosB: 4, garraB: 0.1, pulgar: 0.22, cuelloAng: [0.5, 0.95, 0.65], hp: -0.22, colaGrosor: 1.15, skin: 'parasaur', run: 6.2, rol: 'herbivoro', pezuna: true },
  paquicefalosaurio: { bh: 1.1, cuelloGrosor: 1.3, colaForma: 1.2, cola: 0.5, torso: 0.22, cuello: 0.1, cabeza: 0.12, H: 0.3, cab: 'domo', dientes: 0, pata: [0.42, 0.44], bh: 1.1, ancho: 0.95, brazo: 0.14, brazoR: 0.07, dedosB: 4, garraB: 0.1, cuelloAng: [0.4, 0.8, 0.5], hp: -0.1, colaGrosor: 1.1, skin: 'parasaur', run: 7.5, rol: 'herbivoro', pezuna: true },
};

/** Medidas reales (m) de un bípedo a partir de su definición {arq, L, masa, o:{…}}. Datos puros: sin geometría. */
export function medirBipedo(def) {
  const A = ARQ[def.arq];
  if (!A) throw new Error(`Arquetipo de bípedo desconocido: ${def.arq}`);
  const d = { ...BASE, ...A, ...(def.o ?? {}) };
  const { L, masa } = def;
  const sum = d.cola + d.torso + d.cuello + d.cabeza;
  const Lc = (d.cola / sum) * L, Lt = (d.torso / sum) * L, Ln = (d.cuello / sum) * L, Lh = (d.cabeza / sum) * L;
  const H = d.H * L;
  const rho = masa / (L * L * L);
  const bh = clamp(0.072 * L * Math.cbrt(rho / 3), 0.05 * L, 0.115 * L) * d.bh * d.plumon;
  const bw = bh * d.ancho;
  const J = {};
  J.hips = [0, H, 0];
  const cp = cos(d.pit), sp = sin(d.pit);
  J.spine1 = [0, H + 0.5 * Lt * sp, 0.5 * Lt * cp];
  J.spine2 = [0, H + 1.15 * Lt * sp, Lt * cp];
  let pos = J.spine2;
  const nr = [0.38, 0.31, 0.31];
  ['neck1', 'neck2', 'head'].forEach((nm, i) => { const a = d.cuelloAng[i], l = Ln * nr[i]; pos = [0, pos[1] + l * sin(a), pos[2] + l * cos(a)]; J[nm] = pos; });
  // cola: articulaciones a lo largo de -z, ligera caída
  const tz = [0.105, 0.3, 0.51, 0.7, 0.88, 1.0];
  const tailY = (t) => H - d.colaCaida * H * t;
  tz.forEach((t, i) => { J[i < 5 ? `tail${i + 1}` : 'tailTip'] = [0, tailY(t), -Lc * t]; });
  // cabeza
  const cab = CAB[d.cab];
  if (!cab) throw new Error(`Perfil de cabeza desconocido: ${d.cab}`);
  const dirH = [cos(d.hp), sin(d.hp)]; // (z, y)
  const O = [0, J.head[1] - 0.094 * Lh * dirH[1], J.head[2] - 0.094 * Lh * dirH[0]];
  const headPt = (t) => [0, O[1] + t * Lh * dirH[1] + interp(cab.t, cab.dy, t) * Lh, O[2] + t * Lh * dirH[0]];
  const headR = (t) => [interp(cab.t, cab.rx, t) * Lh * d.cabAncho, interp(cab.t, cab.ry, t) * Lh * d.cabAlto];
  J.jaw = [0, headPt(0.25)[1] - 0.094 * Lh, headPt(0.25)[2]];
  // patas
  const legX = max(bw * 0.92, 0.03 * L);
  const hipY = H * 0.97, toeY = max(0.012, 0.03 * H);
  let lf = d.pata[0] * H, lt = d.pata[1] * H;
  const [p1, p2] = d.phi;
  const vert = lf * cos(p1) + lt * cos(p2), avail = hipY - toeY - 0.15 * H;
  if (vert > avail) { const k = avail / vert; lf *= k; lt *= k; }
  const z0 = 0.07 * Lt;
  const kneeY = hipY - lf * cos(p1), kneeZ = z0 + lf * sin(p1);
  const ankY = kneeY - lt * cos(p2), ankZ = kneeZ - lt * sin(p2);
  const toeZ = ankZ + 0.55 * (ankY - toeY);
  const leg = { x: legX, hip: [legX, hipY, z0], knee: [legX, kneeY, kneeZ], ank: [legX, ankY, ankZ], toe: [legX, toeY, toeZ], lf, lt };
  // vel/ciclo/hit derivados
  const walk = 1.15 + 0.3 * sqrt(H);
  const vel = { walk, run: d.run };
  const rw = clamp(1.6 - 0.1 * H, 1.3, 1.7), rr = clamp(3.6 - 0.35 * H, 2.2, 3.7);
  // el paso no puede ser mayor que lo que alcanza la pata (el IK pone el objetivo en el tobillo); se tolera un 3 % de pie levantado en los extremos
  const dyA = hipY - ankY, alcance = Math.max(0.05 * H, sqrt(Math.max(0, (lf + lt) * (lf + lt) * 1.0609 - dyA * dyA)) - Math.abs(ankZ - z0));
  const cicloMax = (2 * alcance) / (0.6 * 0.9);
  const cycle = { walk: Math.min(rw * H, cicloMax * 0.9), run: Math.min(rr * H, cicloMax) };
  const hp = headPt(0.55), { hit, tramo } = crearHit();
  const rT = max(bh, bw) * 1.05;
  hit.push([0, H, 0.05 * Lt, max(0.13, rT * 1.1)]);
  tramo(J.hips, J.spine1, rT, rT * 1.02, 2); tramo(J.spine1, J.spine2, rT * 1.02, rT * 0.95, 2);
  cadena(tramo, J, ['spine2', 'neck1', 'neck2', 'head'], bh * 0.6 * d.cuelloGrosor, max(0.06, headR(0.08)[1]), 3);
  hit.push([0, hp[1], hp[2], max(0.12, Lh * 0.42)]);
  if (Lh > 0.8) hit.push([0, headPt(0.2)[1], headPt(0.2)[2], max(0.12, Lh * 0.36)]);
  tramo(J.hips, J.tail1, bh * 0.8 * d.colaGrosor, bh * 0.62 * d.colaGrosor, 2);
  cadena(tramo, J, ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tailTip'], bh * 0.62 * d.colaGrosor, bh * 0.04, 2);
  const tg = (v) => v * bh * d.patasGrosor, La = d.brazo * L;
  for (const sx of [1, -1]) { // patas (muslo, caña y pie) y brazos
    tramo([leg.x * sx, hipY, z0], [leg.x * sx, kneeY, kneeZ], tg(0.55) * d.muslo, tg(0.36), 3);
    tramo([leg.x * sx, kneeY, kneeZ], [leg.x * sx, ankY, ankZ], tg(0.36), tg(0.24), 3);
    tramo([leg.x * sx, ankY, ankZ], [leg.x * sx, toeY + tg(0.18), toeZ], tg(0.24), tg(0.2), 1);
    if (La > 0.25 * bh) tramo([bw * 0.9 * sx, J.spine2[1] - 0.1 * bh, J.spine2[2]], [bw * 0.95 * sx, J.spine2[1] - 0.55 * La, J.spine2[2] + 0.6 * La], max(0.05, La * d.brazoR * 1.6), max(0.05, La * d.brazoR * 1.3), 2);
  }
  return { d, L, masa, Lc, Lt, Ln, Lh, H, bh, bw, J, O, cab, dirH, headPt, headR, leg, vel, cycle, hit, hips: H, step: 0.13 * H, stance: 0.6, radius: max(0.18, 0.11 * L), toeY, tz };
}

// perfiles de radios del tronco (tail tip → head): fracciones de bh (alto) y bw (ancho)
const RY = [0.044, 0.127, 0.218, 0.327, 0.51, 0.727, 0.945, 1.0, 0.91, 0.51, 0.345, 0.365];
const RX = [0.056, 0.14, 0.233, 0.349, 0.535, 0.79, 0.93, 1.0, 0.88, 0.535, 0.395, 0.395];

/** Esqueleto + malla de un bípedo medido. `pal` es la paleta de color (ver color.js). Devuelve {geo, sk, legs, specs}. */
export function construirBipedo(P, pal) {
  const { d, J, L, Lh, bh, bw, H, leg, headPt, headR, dirH } = P;
  const V3 = (a) => V(a[0], a[1], a[2]);
  const specs = [
    { name: 'hips', parent: null, pos: J.hips }, { name: 'spine1', parent: 'hips', pos: J.spine1 }, { name: 'spine2', parent: 'spine1', pos: J.spine2 },
    { name: 'neck1', parent: 'spine2', pos: J.neck1 }, { name: 'neck2', parent: 'neck1', pos: J.neck2 }, { name: 'head', parent: 'neck2', pos: J.head }, { name: 'jaw', parent: 'head', pos: J.jaw },
    { name: 'tail1', parent: 'hips', pos: J.tail1 }, { name: 'tail2', parent: 'tail1', pos: J.tail2 }, { name: 'tail3', parent: 'tail2', pos: J.tail3 }, { name: 'tail4', parent: 'tail3', pos: J.tail4 }, { name: 'tail5', parent: 'tail4', pos: J.tail5 },
  ];
  // brazos: hombro, codo, mano (mano = punta del último segmento)
  const La = d.brazo * L;
  const shY = J.spine2[1] - 0.22 * bh, shZ = J.spine2[2] - 0.02 * L, shX = bw * 0.82;
  const up = unit(0.12, -0.82, 0.56, 0.45 * La), lo = unit(0, -0.3, 0.95, 0.55 * La);
  const arm = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const s = [shX * sx, shY, shZ], e = [s[0] + up[0] * sx, s[1] + up[1], s[2] + up[2]], h = [e[0], e[1] + lo[1], e[2] + lo[2]];
    arm[side] = { s, e, h, sx };
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: [leg.x * sx, leg.hip[1], leg.hip[2]] }, { name: `shin${side}`, parent: `thigh${side}`, pos: [leg.x * sx, leg.knee[1], leg.knee[2]] }, { name: `foot${side}`, parent: `shin${side}`, pos: [leg.x * sx, leg.ank[1], leg.ank[2]] });
    specs.push({ name: `arm${side}`, parent: 'spine2', pos: s }, { name: `forearm${side}`, parent: `arm${side}`, pos: e });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);

  // ---- tronco, cola y cuello en un solo tubo
  const st = [J.tailTip, J.tail5, J.tail4, J.tail3, J.tail2, J.tail1, J.hips, J.spine1, J.spine2, J.neck1, J.neck2, J.head];
  const fx = (f, i) => (i <= 5 ? Math.pow(f, 1 / d.colaForma) : f);
  const hr0 = headR(0.08);
  const ryS = RY.map((f, i) => fx(f, i) * bh * (i >= 1 && i <= 5 ? d.colaGrosor : i >= 9 ? d.cuelloGrosor : 1));
  const rxS = RX.map((f, i) => fx(f, i) * bw * (i >= 1 && i <= 5 ? d.colaGrosor : i >= 9 ? d.cuelloGrosor : 1));
  // el cuello se afina hacia la cabeza (sin bulbo en la articulación) pero nunca queda más fino que ella
  { const e = (a, h) => max(h * 1.02, min(a, lerp(h, a, 0.5))); ryS[10] = e(ryS[10], hr0[1]); rxS[10] = e(rxS[10], hr0[0]); ryS[11] = max(hr0[1] * 0.95, min(ryS[11], hr0[1] * 1.05)); rxS[11] = max(hr0[0] * 0.95, min(rxS[11], hr0[0] * 1.05)); }
  // línea del lomo más plana que la del vientre: el tubo se desplaza respecto a las articulaciones (los huesos no cambian)
  const lomoF = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.3, 0];
  const stC = st.map((p, i) => [p[0], p[1] + d.lomo * (0.6 * bh - ryS[i]) * 0.8 * lomoF[i], p[2]]);
  B.tube({
    pts: stC.map(V3), rx: rxS, ry: ryS, owners: ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', 'spine2', 'neck1', 'neck2'],
    sides: 12, sub: 2, uscale: 3, vscale: 1,
  });
  // altura de la cara superior del tronco en z (para velas, crestas y osteodermos)
  const zS = st.map((p) => p[2]);
  const topAt = (z) => {
    for (let i = 0; i < st.length - 1; i++) {
      const a = zS[i], b = zS[i + 1];
      if (z >= min(a, b) && z <= max(a, b)) { const u = (z - a) / (b - a || 1e-6); return lerp(st[i][1] + ryS[i], st[i + 1][1] + ryS[i + 1], u); }
    }
    return H + bh;
  };
  const ownerAt = (z) => (z > J.spine2[2] ? 'spine2' : z > J.spine1[2] ? 'spine1' : z > J.tail1[2] ? 'hips' : z > J.tail2[2] ? 'tail1' : z > J.tail3[2] ? 'tail2' : z > J.tail4[2] ? 'tail3' : 'tail4');

  // ---- cabeza y mandíbula
  const nCab = P.cab.t.length;
  B.tube({
    pts: P.cab.t.map((t) => V3(headPt(t))), rx: P.cab.t.map((t) => headR(t)[0]), ry: P.cab.t.map((t) => headR(t)[1]),
    owners: 'head', sides: 10, sub: 2, uscale: 2, vscale: 1,
  });
  void nCab;
  const jt = [0.3, 0.55, 0.8, 1.0].map((t) => (t > 1 ? 1 : t));
  B.tube({
    pts: jt.map((t) => { const p = headPt(t), r = headR(t); return V(0, p[1] - r[1] * 0.95, p[2] - (t === 1 ? 0.02 * Lh : 0)); }),
    rx: jt.map((t) => headR(t)[0] * 0.55), ry: jt.map((t) => max(0.004, headR(t)[1] * 0.3)), owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 1,
  });
  const ojoR = max(0.006, headR(0.4)[1] * 0.22 * d.ojo);
  for (const sx of [1, -1]) {
    const p = headPt(0.4), r = headR(0.4);
    B.blob(V(r[0] * 0.93 * sx, p[1] + r[1] * 0.35, p[2]), ojoR, ojoR * 1.1, ojoR * 1.1, 'head', PART.ojo, 8);
    const dl = d.dienteL * Lh;
    for (let i = 0; i < d.dientes; i++) {
      const t = 0.5 + (0.46 * i) / max(1, d.dientes), p2 = headPt(t), r2 = headR(t), x = r2[0] * 0.8 * sx;
      B.spike(V(x, p2[1] - r2[1] * 0.9, p2[2]), V(x * 0.97, p2[1] - r2[1] * 0.9 - dl, p2[2] + 0.004), max(0.002, dl * 0.2), 'head', PART.diente, { sides: 5 });
      if (i > 0 && i < d.dientes - 1) B.spike(V(x * 0.8, p2[1] - r2[1] * 1.0 + 0.02 * Lh, p2[2] - 0.02 * Lh), V(x * 0.8, p2[1] - r2[1] * 1.0 + 0.02 * Lh + dl * 0.9, p2[2] - 0.02 * Lh), max(0.002, dl * 0.18), 'jaw', PART.diente, { sides: 5 });
    }
  }
  const topY = (t) => headPt(t)[1] + headR(t)[1];

  // ---- patas
  const th = (v) => v * bh * d.patasGrosor;
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const x = leg.x * sx;
    const toeBase = [x, leg.toe[1] + 0.04 * H, leg.toe[2]];
    B.tube({
      pts: [V(x, leg.hip[1] + 0.02 * H, leg.hip[2]), V3(leg.knee.map((v, i) => (i === 0 ? x : v))), V3(leg.ank.map((v, i) => (i === 0 ? x : v))), V(...toeBase)],
      rx: [th(0.42), th(0.27), max(0.006, th(0.17)), max(0.006, th(0.14))], ry: [th(0.52), th(0.33), max(0.007, th(0.19)), max(0.007, th(0.155))],
      owners: [`thigh${side}`, `shin${side}`, `foot${side}`], sides: 8, sub: 3, uscale: 2, vscale: 1,
    });
    B.blob(V(x * 1.04, H * 0.9, leg.hip[2] + 0.03 * L), th(0.42) * d.muslo, th(0.55) * d.muslo, th(0.65) * d.muslo, `thigh${side}`, PART.cuerpo, 8);
    // dedos
    const nd = d.dedos, tl = max(0.03 * L, 0.7 * (leg.ank[1] - leg.toe[1]) * (d.pezuna ? 0.55 : 1));
    const toeR = max(0.005, th(0.1)), gl = max(0.012, d.garraPie * L);
    for (let k = 0; k < nd; k++) {
      const dx = (k - (nd - 1) / 2) * (2.2 * toeR) * (nd > 3 ? 0.9 : 1.1), spread = 0.6 * dx;
      const tip = [x + spread * 1.4, leg.toe[1] * 0.7, leg.toe[2] + tl * (k === (nd - 1) / 2 ? 1 : 0.88)];
      B.tube({ pts: [V(...toeBase), V(x + spread * 0.6, toeBase[1] * 0.7, toeBase[2] + tl * 0.5), V(...tip)], rx: [toeR * 1.25, toeR, toeR * 0.75], ry: [toeR * 1.1, toeR * 0.85, toeR * 0.7], owners: `foot${side}`, sides: 6, sub: 1, uscale: 1, vscale: 1, cap0: false });
      if (d.pezuna) B.spike(V(...tip), V(tip[0] + dx * 0.15, tip[1] - 0.2 * gl, tip[2] + 0.9 * gl), toeR * 0.95, `foot${side}`, PART.garra, { sides: 5 });
      else B.spike(V(...tip), V(tip[0] + dx * 0.2, max(0, tip[1] - 0.5 * gl), tip[2] + gl), toeR * 0.8, `foot${side}`, PART.garra, { sides: 5, bend: V(0, -0.15 * gl, 0) });
    }
    if (d.hoz > 0) {
      const hl = d.hoz * L;
      B.spike(V(x * 0.88, leg.ank[1] * 0.5, leg.toe[2] - 0.3 * tl), V(x * 0.88, max(0.01, leg.ank[1] * 0.12), leg.toe[2] + hl * 0.9), max(0.006, hl * 0.2), `foot${side}`, PART.garra, { sides: 6, bend: V(0, hl * 0.35, hl * 0.2) });
    }
    // ---- brazos
    const a = arm[side], ar = max(0.01, La * d.brazoR);
    B.tube({
      pts: [V3(a.s), V3(a.e), V((a.e[0] + a.h[0]) / 2, (a.e[1] + a.h[1]) / 2, (a.e[2] + a.h[2]) / 2), V3(a.h)],
      rx: [ar * 1.15, ar * 0.85, ar * 0.7, ar * 0.62], ry: [ar * 1.15, ar * 0.85, ar * 0.7, ar * 0.62], owners: [`arm${side}`, `forearm${side}`, `forearm${side}`], sides: 6, sub: 2, uscale: 1, vscale: 1,
    });
    const gb = max(0.012, d.garraB * La);
    for (let k = 0; k < d.dedosB; k++) {
      const dx = (k - (d.dedosB - 1) / 2) * ar * 0.9 * sx;
      B.spike(V(a.h[0] + dx * 0.5, a.h[1], a.h[2]), V(a.h[0] + dx * 1.1, a.h[1] - 0.45 * gb, a.h[2] + 0.9 * gb), max(0.004, ar * 0.42), `forearm${side}`, PART.garra, { sides: 5, bend: V(0, -0.1 * gb, 0) });
    }
    if (d.pulgar > 0) {
      const pl = d.pulgar * La;
      B.spike(V(a.h[0] - 0.5 * ar * sx, a.h[1] + 0.3 * ar, a.h[2] - 0.1 * ar), V(a.h[0] - 0.9 * ar * sx, a.h[1] + 0.15 * pl, a.h[2] + 0.8 * pl), max(0.006, ar * 0.5), `forearm${side}`, PART.garra, { sides: 5 });
    }
  }

  // ---- rasgos de la especie
  for (const r of d.rasgos) {
    const [tipo, o] = Array.isArray(r) ? r : [r, {}];
    switch (tipo) {
      case 'cuernoNasal': {
        const t = o.t ?? 0.7, p = headPt(t), rr = headR(t), h = (o.alto ?? 0.2) * Lh;
        B.spike(V(0, p[1] + rr[1] * 0.85, p[2]), V(0, p[1] + rr[1] * 0.85 + h, p[2] + 0.2 * h), max(0.006, h * 0.28), 'head', PART.cuerno, { sides: 6 });
        break;
      }
      case 'lagrimales': {
        for (const sx of [1, -1]) {
          const p = headPt(0.34), rr = headR(0.34), h = (o.alto ?? 0.14) * Lh;
          B.spike(V(rr[0] * 0.55 * sx, p[1] + rr[1] * 0.9, p[2]), V(rr[0] * 0.5 * sx, p[1] + rr[1] * 0.9 + h, p[2] + 0.05 * h), max(0.006, h * 0.4), 'head', PART.cuerno, { sides: 5 });
        }
        break;
      }
      case 'cuernosCeja': {
        for (const sx of [1, -1]) {
          const p = headPt(0.4), rr = headR(0.4), h = (o.alto ?? 0.2) * Lh;
          B.spike(V(rr[0] * 0.8 * sx, p[1] + rr[1] * 0.8, p[2]), V(rr[0] * 1.5 * sx, p[1] + rr[1] * 0.8 + h, p[2] - 0.05 * h), max(0.006, h * 0.3), 'head', PART.cuerno, { sides: 6 });
        }
        break;
      }
      case 'crestaDoble': {
        for (const sx of [1, -1]) {
          const t0 = 0.1, t1 = 0.62, n = 4, pts = [], rx = [], ry = [];
          for (let i = 0; i < n; i++) {
            const t = lerp(t0, t1, i / (n - 1)), p = headPt(t), rr = headR(t), h = (o.alto ?? 0.13) * Lh * sin(PI * (0.15 + 0.7 * i / (n - 1)));
            pts.push(V(rr[0] * 0.38 * sx, p[1] + rr[1] * 0.92 + h * 0.8, p[2])); rx.push(max(0.003, 0.012 * Lh)); ry.push(max(0.006, h));
          }
          B.tube({ pts, rx, ry, owners: 'head', sides: 6, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
        }
        break;
      }
      case 'crestaMedia': {
        const t0 = o.t0 ?? 0.12, t1 = o.t1 ?? 0.6, n = 5, pts = [], rx = [], ry = [];
        for (let i = 0; i < n; i++) {
          const t = lerp(t0, t1, i / (n - 1)), p = headPt(t), rr = headR(t), h = (o.alto ?? 0.28) * Lh * sin(PI * (0.08 + 0.84 * i / (n - 1)));
          pts.push(V(0, p[1] + rr[1] * 0.9 + h * 0.8, p[2])); rx.push(max(0.004, 0.02 * Lh)); ry.push(max(0.006, h));
        }
        B.tube({ pts, rx, ry, owners: 'head', sides: 6, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
        break;
      }
      case 'domo': {
        const p = headPt(0.3), rr = headR(0.3);
        B.blob(V(0, p[1] + rr[1] * 0.75, p[2] + 0.02 * Lh), rr[0] * 1.02, rr[1] * (o.alto ?? 0.95), 0.27 * Lh, 'head', PART.cuerpo, 10);
        if (o.nodulos) {
          for (let i = 0; i < o.nodulos; i++) {
            const a = PI * (0.1 + 0.8 * i / max(1, o.nodulos - 1)), sx = i % 2 ? 1 : -1;
            const bx = sin(a) * rr[0] * 1.0 * (i < o.nodulos / 2 ? 1 : -1), bz = p[2] - 0.2 * Lh + 0.45 * Lh * (i / max(1, o.nodulos - 1));
            void sx;
            B.spike(V(bx, p[1] + rr[1] * 0.5, bz), V(bx * 1.2, p[1] + rr[1] * 0.5 + 0.12 * Lh, bz + 0.01), max(0.005, 0.03 * Lh), 'head', PART.cuerno, { sides: 5 });
          }
        }
        break;
      }
      case 'colmillos': {
        for (const sx of [1, -1]) {
          const p = headPt(0.72), rr = headR(0.72), l = (o.largo ?? 0.14) * Lh;
          B.spike(V(rr[0] * 0.7 * sx, p[1] - rr[1] * 0.85, p[2]), V(rr[0] * 0.7 * sx, p[1] - rr[1] * 0.85 - l, p[2] + 0.1 * l), max(0.003, l * 0.13), 'head', PART.diente, { sides: 5 });
        }
        break;
      }
      case 'vela': case 'cresta': {
        const alto = (o.alto ?? 0.1) * L, z0 = (o.z0 ?? -0.04) * L, z1 = (o.z1 ?? 0.2) * L, n = o.n ?? 9, pts = [], rx = [], ry = [], own = [];
        const prof = (u) => (o.forma === 'sesgada' ? sin(PI * u ** 0.75) : sin(PI * u)) ** 0.8;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), z = lerp(z0, z1, u), base = topAt(z), h = max(0.01, alto * prof(u) * (o.membrana ?? 0.82));
          pts.push(V(0, base - 0.1 * h + h * 0.5, z)); rx.push(max(0.004, 0.008 * L * (o.grosor ?? 1))); ry.push(max(0.006, h * 0.5));
          if (i < n - 1) own.push(ownerAt(z));
        }
        B.tube({ pts, rx, ry, owners: own, sides: 6, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
        if (o.espinas ?? alto > 0.05 * L) { // espinas neurales: varillas que sobresalen de la membrana
          const ne = o.espinas === true || o.espinas == null ? n + 4 : o.espinas;
          for (let i = 0; i < ne; i++) {
            const u = 0.03 + (0.94 * i) / (ne - 1), z = lerp(z0, z1, u), base = topAt(z), h = alto * prof(u);
            B.spike(V(0, base - 0.03 * L, z), V(0, base + h * 1.0, z - 0.012 * L), max(0.004, 0.006 * L * (o.grosor ?? 1)), ownerAt(z), PART.cuerno, { sides: 5 });
          }
        }
        break;
      }
      case 'osteodermos': {
        const n = o.n ?? 10, z0 = (o.z0 ?? -0.3) * L, z1 = (o.z1 ?? 0.15) * L, h = (o.alto ?? 0.02) * L;
        for (let i = 0; i < n; i++) {
          const z = lerp(z0, z1, i / (n - 1)), b = topAt(z) - 0.01 * L;
          B.spike(V(0, b, z), V(0, b + h, z - 0.2 * h), max(0.006, h * 0.35), ownerAt(z), PART.placa, { sides: 5 });
        }
        break;
      }
      case 'filamentos': {
        const n = o.n ?? 16, z0 = (o.z0 ?? -0.35) * L, z1 = (o.z1 ?? 0.28) * L, l = (o.largo ?? 0.04) * L;
        for (let i = 0; i < n; i++) {
          const z = lerp(z0, z1, i / (n - 1)), b = topAt(z) - 0.2 * l;
          B.spike(V(0, b, z), V(0, b + 0.45 * l, z - 0.9 * l), max(0.003, l * 0.08), ownerAt(z), PART.cresta, { sides: 4 });
        }
        break;
      }
      case 'alas': { // plumas plegadas contra el flanco (cuchilla vertical fina que sigue al brazo)
        for (const [side, sx] of [['L', 1], ['R', -1]]) {
          const a = arm[side], largo = (o.largo ?? 0.25) * L, alto = (o.alto ?? 0.06) * L * 0.55, y = a.s[1] - 0.15 * bh;
          B.tube({
            pts: [V(bw * 1.0 * sx, y, a.s[2] + 0.02 * L), V(bw * 1.0 * sx, y - 0.02 * alto, a.s[2] - 0.3 * largo), V(bw * 0.98 * sx, y - 0.08 * alto, a.s[2] - 0.65 * largo), V(bw * 0.92 * sx, y - 0.2 * alto, a.s[2] - largo)],
            rx: [max(0.003, bh * 0.05), max(0.003, bh * 0.06), max(0.003, bh * 0.045), 0.002], ry: [alto * 0.35, alto * 0.5, alto * 0.42, alto * 0.12],
            owners: [`arm${side}`, `arm${side}`, `arm${side}`], sides: 6, sub: 3, part: PART.cresta, uscale: 1, vscale: 1,
          });
        }
        break;
      }
      case 'alasAbiertas': { // alas con membrana abiertas a los lados (p. ej. Yi)
        for (const [side, sx] of [['L', 1], ['R', -1]]) {
          const a = arm[side], span = (o.largo ?? 0.35) * L, ch = (o.cuerda ?? 0.1) * L;
          B.tube({
            pts: [V(bw * 0.9 * sx, a.s[1], a.s[2]), V((bw + 0.3 * span) * sx, a.s[1] + 0.02 * L, a.s[2] - 0.02 * L), V((bw + 0.65 * span) * sx, a.s[1] + 0.02 * L, a.s[2] - 0.05 * L), V((bw + span) * sx, a.s[1], a.s[2] - 0.1 * L)],
            rx: [ch * 0.6, ch * 0.55, ch * 0.4, ch * 0.12], ry: [0.004, 0.004, 0.003, 0.002], owners: [`arm${side}`, `forearm${side}`, `forearm${side}`], sides: 6, sub: 3, part: PART.membrana, uscale: 1, vscale: 1,
          });
        }
        break;
      }
      case 'abanicoCola': { // pluma caudal en abanico
        const lf = o.largo ?? 0.18, ancho = (o.ancho ?? 0.12) * L, y = tailYat(P, 1) + 0.002;
        const zA = -P.Lc * (1 - lf), zB = -P.Lc * 1.0 - 0.04 * L;
        B.tube({
          pts: [V(0, tailYat(P, 1 - lf), zA), V(0, tailYat(P, 0.94), -P.Lc * 0.94), V(0, y, -P.Lc), V(0, y - 0.01 * L, zB)],
          rx: [ancho * 0.25, ancho * 0.5, ancho * 0.42, ancho * 0.08], ry: [0.004, 0.004, 0.003, 0.002], owners: ['tail4', 'tail5', 'tail5'], sides: 6, sub: 3, part: PART.cresta, uscale: 1, vscale: 1,
        });
        break;
      }
      case 'alasPierna': { // plumas largas de las patas (Microraptor, Anchiornis)
        for (const [side, sx] of [['L', 1], ['R', -1]]) {
          const largo = (o.largo ?? 0.22) * L, alto = (o.alto ?? 0.06) * L, x = leg.x * sx * 1.12;
          B.tube({
            pts: [V(x, leg.hip[1] - 0.25 * lf2(P), leg.hip[2]), V(x, leg.hip[1] - 0.35 * lf2(P), leg.hip[2] - 0.3 * largo), V(x, leg.hip[1] - 0.45 * lf2(P), leg.hip[2] - 0.7 * largo), V(x, leg.hip[1] - 0.6 * lf2(P), leg.hip[2] - largo)],
            rx: [max(0.003, bh * 0.05), max(0.003, bh * 0.05), max(0.003, bh * 0.04), 0.002], ry: [alto * 0.3, alto * 0.38, alto * 0.34, alto * 0.12], owners: [`thigh${side}`, `thigh${side}`, `thigh${side}`], sides: 6, sub: 3, part: PART.cresta, uscale: 1, vscale: 1,
          });
        }
        break;
      }
      default: throw new Error(`Rasgo de bípedo desconocido: ${tipo}`);
    }
  }

  const geo = B.finish(colorizer(pal));
  const legs = ['L', 'R'].map((side, i) => ({
    name: side, thigh: `thigh${side}`, shin: `shin${side}`, foot: `foot${side}`, phase: i * 0.5, bendFwd: true,
    toe: V(leg.x * (side === 'L' ? 1 : -1), leg.toe[1], leg.toe[2]),
  }));
  return { geo, sk, legs, specs };
}

const lf2 = (P) => P.leg.lf;
const tailYat = (P, t) => P.H - P.d.colaCaida * P.H * t;
