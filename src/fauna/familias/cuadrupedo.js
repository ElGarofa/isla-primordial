// FAMILIA CUADRÚPEDOS — generador paramétrico de saurópodos, ceratópsidos, estegosaurios, anquilosaurios, hadrosaurios y otros dinosaurios de cuatro apoyos
// (y, con otros arquetipos, cocodrilomorfos, mamíferos mesozoicos y anfibios: mismo esqueleto de 4 patas con cinemática inversa).
//
// Misma idea que bipedo.js: una especie son unas pocas cifras absolutas (longitud y masa del catálogo) más un ARQUETIPO (proporciones típicas del grupo) y
// los rasgos propios (gola, cuernos, placas, maza, crestas, espinas…). `medirCuadrupedo` convierte eso en medidas reales (metros) y `construirCuadrupedo` en
// esqueleto + malla con piel + patas para la cinemática inversa del juego, con el MISMO contrato que `buildStego`/`buildAnkylo` (modelos.js):
//   huesos hips, spine1, spine2, neck1…neckN, head, jaw, tail1…tail5 · patas traseras thigh/shin/foot L|R · delanteras fup/flow/ffoot L|R.
//
// HONESTIDAD: son reconstrucciones procedurales, no escaneos. Las proporciones siguen la literatura de forma aproximada (longitud y masa del catálogo); la silueta
// (cuello, cola, cabeza, gola, cuernos, placas, maza) distingue a cada especie, pero el detalle fino (musculatura, escamas individuales) no está representado.
// Los colores casi nunca se conocen: son hipótesis de camuflaje (ver paleta en nucleo.js).
import * as THREE from 'three';
import { SkinBuilder, makeSkeleton, PART, V } from '../builder.js';
import { colorizer } from '../color.js';
import { crearHit } from './hit.js';

const { sin, cos, sqrt, max, min, PI, abs, floor } = Math;
const clamp = (v, a, b) => min(b, max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function interp(ts, arr, t) {
  if (t <= ts[0]) return arr[0];
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]) return lerp(arr[i - 1], arr[i], (t - ts[i - 1]) / (ts[i] - ts[i - 1]));
  return arr[arr.length - 1];
}
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Perfiles de cráneo: t a lo largo de la cabeza; semianchura rx y semialtura ry (fracción de la longitud de la cabeza) y desvío vertical dy del eje.
const CAB = {
  camara: { t: [0, 0.22, 0.5, 0.78, 1], rx: [0.15, 0.18, 0.16, 0.14, 0.14], ry: [0.2, 0.25, 0.21, 0.17, 0.15], dy: [0, 0.04, 0.02, -0.02, -0.06] }, // macronarios: cráneo alto y romo
  diplo: { t: [0, 0.22, 0.5, 0.78, 1], rx: [0.09, 0.1, 0.09, 0.085, 0.09], ry: [0.11, 0.15, 0.1, 0.075, 0.07], dy: [0, 0.06, 0.03, 0, -0.04] }, // diplodócidos: largo y bajo, hocico romo
  titano: { t: [0, 0.22, 0.5, 0.78, 1], rx: [0.1, 0.12, 0.1, 0.085, 0.08], ry: [0.14, 0.17, 0.13, 0.095, 0.085], dy: [0, 0.05, 0.02, -0.02, -0.06] },
  nigero: { t: [0, 0.25, 0.5, 0.75, 0.9, 1], rx: [0.09, 0.12, 0.14, 0.22, 0.34, 0.38], ry: [0.12, 0.14, 0.1, 0.07, 0.055, 0.05], dy: [0, 0.03, 0, -0.03, -0.05, -0.06] }, // hocico ancho y plano
  cerat: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.13, 0.2, 0.18, 0.11, 0.05], ry: [0.18, 0.27, 0.28, 0.2, 0.12], dy: [0, 0, -0.05, -0.12, -0.18] }, // ceratópsido de cara corta y profunda
  ceratLargo: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.1, 0.15, 0.14, 0.09, 0.045], ry: [0.14, 0.2, 0.2, 0.14, 0.09], dy: [0, 0, -0.04, -0.09, -0.14] }, // caz. de cara larga (casmosaurinos)
  proto: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.14, 0.2, 0.17, 0.1, 0.05], ry: [0.18, 0.25, 0.25, 0.17, 0.1], dy: [0, 0, -0.04, -0.1, -0.15] },
  estego: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.07, 0.09, 0.075, 0.055, 0.04], ry: [0.11, 0.13, 0.1, 0.075, 0.06], dy: [0, 0, -0.03, -0.06, -0.1] },
  anquilo: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.3, 0.34, 0.26, 0.17, 0.12], ry: [0.15, 0.17, 0.12, 0.085, 0.065], dy: [0, 0, -0.02, -0.04, -0.06] }, // ancho y triangular
  nodoso: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.15, 0.17, 0.12, 0.08, 0.06], ry: [0.16, 0.18, 0.13, 0.09, 0.07], dy: [0, 0, -0.02, -0.04, -0.06] }, // estrecho en forma de pera
  hadro: { t: [0, 0.22, 0.5, 0.78, 0.92, 1], rx: [0.1, 0.12, 0.1, 0.11, 0.17, 0.2], ry: [0.17, 0.2, 0.14, 0.095, 0.075, 0.065], dy: [0, 0.02, 0, -0.04, -0.08, -0.11] }, // pico de pato
  hadroCorto: { t: [0, 0.22, 0.5, 0.78, 0.92, 1], rx: [0.11, 0.14, 0.11, 0.11, 0.17, 0.2], ry: [0.18, 0.23, 0.17, 0.11, 0.085, 0.07], dy: [0, 0.03, 0, -0.05, -0.09, -0.12] },
  hadroArco: { t: [0, 0.22, 0.5, 0.78, 0.92, 1], rx: [0.1, 0.12, 0.1, 0.1, 0.14, 0.17], ry: [0.17, 0.2, 0.19, 0.16, 0.1, 0.07], dy: [0, 0.02, 0.03, 0, -0.07, -0.11] }, // nariz arqueada
  sceli: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.1, 0.12, 0.09, 0.065, 0.05], ry: [0.12, 0.15, 0.1, 0.08, 0.065], dy: [0, 0, -0.02, -0.05, -0.08] },
  prosauro: { t: [0, 0.25, 0.5, 0.78, 1], rx: [0.09, 0.11, 0.09, 0.07, 0.06], ry: [0.12, 0.15, 0.11, 0.085, 0.07], dy: [0, 0.02, 0, -0.03, -0.07] },
  // cocodrilomorfos: hocico plano (no sube en el perfil), ojos y narinas arriba
  croco: { t: [0, 0.2, 0.5, 0.78, 1], rx: [0.25, 0.27, 0.2, 0.15, 0.135], ry: [0.14, 0.15, 0.1, 0.08, 0.075], dy: [0, 0.03, 0, -0.015, -0.02] }, // aligatoroide: hocico ancho y en U
  crocoLargo: { t: [0, 0.16, 0.5, 0.8, 0.93, 1], rx: [0.15, 0.15, 0.085, 0.06, 0.07, 0.085], ry: [0.11, 0.11, 0.058, 0.045, 0.05, 0.06], dy: [0, 0.02, 0, -0.01, -0.012, -0.012] }, // longirrostro con ensanchamiento en la punta
  crocoMaza: { t: [0, 0.2, 0.5, 0.78, 1], rx: [0.28, 0.3, 0.23, 0.17, 0.15], ry: [0.2, 0.22, 0.15, 0.12, 0.11], dy: [0, 0.04, 0.01, -0.01, -0.02] }, // cráneo muy robusto y profundo (caimanino gigante)
  crocoCorto: { t: [0, 0.22, 0.5, 0.8, 1], rx: [0.22, 0.25, 0.2, 0.16, 0.15], ry: [0.2, 0.24, 0.19, 0.15, 0.13], dy: [0, 0.05, 0.02, -0.02, -0.05] }, // hocico alto y corto (cocodrilo terrestre de colmillos)
  // mamíferos y anfibios
  mamiferoFuerte: { t: [0, 0.22, 0.5, 0.8, 1], rx: [0.22, 0.28, 0.22, 0.15, 0.1], ry: [0.2, 0.24, 0.18, 0.12, 0.085], dy: [0, 0.02, -0.01, -0.03, -0.05] }, // cráneo robusto con crestas temporales y hocico corto
  mamiferoRomo: { t: [0, 0.22, 0.5, 0.8, 1], rx: [0.24, 0.31, 0.24, 0.15, 0.11], ry: [0.22, 0.27, 0.2, 0.12, 0.09], dy: [0, 0.03, -0.01, -0.03, -0.05] },
  rana: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.46, 0.5, 0.4, 0.22, 0.12], ry: [0.2, 0.24, 0.17, 0.1, 0.06], dy: [0, 0.03, 0.0, -0.02, -0.05] }, // cabeza ancha y plana, boca enorme
};

// Longitud relativa de los tramos del cuello según el número de huesos (tramos = huesos + 1: tronco→neck1, …, neckN→cabeza).
const TRAMOS = { 1: [0.55, 0.45], 2: [0.34, 0.36, 0.3], 3: [0.24, 0.27, 0.26, 0.23], 4: [0.17, 0.22, 0.22, 0.22, 0.17] };
const TZ = [0.105, 0.3, 0.51, 0.7, 0.88, 1.0]; // posición de las articulaciones de la cola (fracción de su longitud)

// Proporciones por defecto y por arquetipo. Fracciones de la longitud total L salvo indicación. Se normalizan cola+torso+cuello+cabeza.
const BASE = {
  cola: 0.35, torso: 0.3, cuello: 0.15, cabeza: 0.1, nCuello: 2,
  H: 0.2, hs: 1, arco: 0.02, // altura de la cadera (fracción de L), altura del hombro / altura de la cadera, arqueo del lomo (fracción de H)
  bh: 1, ancho: 1.1, cuelloGrosor: 1, colaGrosor: 1, colaForma: 1, colaCaida: 0.3, nb: 0.6,
  cuelloAng: [0.3, 0.3, 0.2], hp: -0.2, cab: 'camara', cabAlto: 1, cabAncho: 1, ojo: 1, // ángulos de elevación de cada tramo del cuello (rad) y cabeceo de la cabeza
  pg: 1, xT: 0.85, xF: 0.85, codo: 1, rodilla: 1, rT: 0.52, rF: 0.5, recT: 0.97, recF: 0.97, ahT: 0.1, ahF: 0.1, pieT: 0.12, pieF: 0.1, atrasT: -0.02, adelF: 0.02, // patas
  unasT: 3, unasF: 3, unaL: 0.5, unaAncho: 1, pezuna: true, garraPulgar: 0, colaAncho: 1, ojoPos: [0.93, 0.3], ondula: 1, bhMax: 0.62, jaw: [0.55, 0.3, 0.95], // colaAncho: anchura de la cola/altura (cocodrilos: comprimida); ojoPos: [x/rx, y/ry] de los ojos; ondula: ondulación lateral del cuerpo al andar
  dientes: 0, dienteL: 0.03, pico: null, picoParte: 'cuerno', rasgos: [],
  skin: 'brach', anim: 'braquio', walk: 1.3, run: 3.4, cw: 1.0, cr: 1.6, step: 0.1, stance: 0.7,
};
export const ARQ = {
  // ---- saurópodos
  titanosaurio: { cola: 0.4, torso: 0.2, cuello: 0.36, cabeza: 0.035, nCuello: 4, H: 0.185, hs: 1.03, cuelloAng: [0.5, 0.5, 0.45, 0.35, 0.0], hp: -0.5, cab: 'titano', nb: 0.5, pg: 1.15, xT: 0.9, xF: 0.84, recT: 0.975, recF: 0.98, ahT: 0.07, ahF: 0.07, pieT: 0.09, pieF: 0.075, unasT: 4, unasF: 0, colaCaida: 0.42, colaForma: 0.95, walk: 1.3, run: 3.0, cw: 0.9, cr: 1.4, step: 0.09, stance: 0.74 },
  diplodocido: { cola: 0.52, torso: 0.13, cuello: 0.3, cabeza: 0.032, nCuello: 4, H: 0.17, hs: 0.88, ancho: 0.82, cuelloAng: [0.22, 0.16, 0.1, 0.06, 0.0], hp: -0.55, cab: 'diplo', nb: 0.42, cuelloGrosor: 0.9, pg: 1.05, xT: 0.9, xF: 0.84, recT: 0.975, recF: 0.98, ahT: 0.07, ahF: 0.07, pieT: 0.09, pieF: 0.075, unasT: 3, unasF: 0, colaCaida: -0.1, colaForma: 0.8, dientes: 8, dienteL: 0.1, walk: 1.4, run: 3.4, cw: 0.9, cr: 1.4, step: 0.09, stance: 0.74 },
  macronario: { cola: 0.25, torso: 0.21, cuello: 0.42, cabeza: 0.05, nCuello: 4, H: 0.21, hs: 1.32, cuelloAng: [0.95, 1.05, 1.0, 0.9, 0.35], hp: -0.5, cab: 'camara', nb: 0.45, pg: 1.2, xT: 0.9, xF: 0.84, recT: 0.975, recF: 0.98, ahT: 0.07, ahF: 0.07, pieT: 0.09, pieF: 0.075, unasT: 4, unasF: 0, colaCaida: 0.45, walk: 1.4, run: 3.2, cw: 0.9, cr: 1.4, step: 0.09, stance: 0.74 },
  camarasaurio: { cola: 0.28, torso: 0.25, cuello: 0.3, cabeza: 0.07, nCuello: 3, H: 0.2, hs: 1.1, cuelloAng: [0.55, 0.5, 0.4, 0.05], hp: -0.55, cab: 'camara', nb: 0.55, cuelloGrosor: 1.2, pg: 1.2, xT: 0.9, xF: 0.84, recT: 0.975, recF: 0.98, ahT: 0.07, ahF: 0.07, pieT: 0.09, pieF: 0.075, unasT: 4, unasF: 0, colaCaida: 0.4, walk: 1.4, run: 3.4, cw: 0.9, cr: 1.4, step: 0.09, stance: 0.74 },
  dicreosaurido: { cola: 0.38, torso: 0.25, cuello: 0.22, cabeza: 0.06, nCuello: 3, H: 0.18, hs: 0.95, cuelloAng: [0.35, 0.3, 0.2, -0.1], hp: -0.5, cab: 'diplo', nb: 0.6, pg: 1.1, xT: 0.9, xF: 0.84, recT: 0.97, recF: 0.975, ahT: 0.08, ahF: 0.08, pieT: 0.1, pieF: 0.08, unasT: 3, unasF: 0, colaCaida: 0.3, walk: 1.3, run: 3.4, cw: 0.9, cr: 1.5, step: 0.1, stance: 0.72 },
  rebaquisaurido: { cola: 0.36, torso: 0.22, cuello: 0.28, cabeza: 0.06, nCuello: 3, H: 0.17, hs: 0.92, cuelloAng: [0.2, 0.1, 0.0, -0.45], hp: -1.2, cab: 'nigero', nb: 0.55, pg: 1.1, xT: 0.9, xF: 0.84, recT: 0.97, recF: 0.975, ahT: 0.08, ahF: 0.08, pieT: 0.1, pieF: 0.08, unasT: 3, unasF: 0, colaCaida: 0.3, dientes: 0, walk: 1.3, run: 3.4, cw: 0.9, cr: 1.5, step: 0.1, stance: 0.72 },
  mamenquisaurido: { cola: 0.22, torso: 0.16, cuello: 0.5, cabeza: 0.03, nCuello: 4, H: 0.145, hs: 0.97, cuelloAng: [0.3, 0.3, 0.22, 0.12, 0.0], hp: -0.5, cab: 'titano', nb: 0.4, cuelloGrosor: 0.8, pg: 1.1, xT: 0.9, xF: 0.84, recT: 0.975, recF: 0.98, ahT: 0.07, ahF: 0.07, pieT: 0.09, pieF: 0.075, unasT: 4, unasF: 0, colaCaida: 0.3, walk: 1.3, run: 3.0, cw: 0.9, cr: 1.4, step: 0.09, stance: 0.74 },
  prosauropodo: { cola: 0.38, torso: 0.26, cuello: 0.26, cabeza: 0.055, nCuello: 3, H: 0.135, hs: 0.86, cuelloAng: [0.55, 0.6, 0.5, 0.1], hp: -0.3, cab: 'prosauro', nb: 0.5, cuelloGrosor: 0.9, pg: 1.0, xT: 0.9, xF: 0.84, recT: 0.94, recF: 0.95, ahT: 0.1, ahF: 0.1, pieT: 0.14, pieF: 0.1, unasT: 4, unasF: 3, garraPulgar: 0.05, colaCaida: 0.3, walk: 1.5, run: 4.5, cw: 1.1, cr: 1.8, step: 0.12, stance: 0.66 },
  // ---- ceratópsidos
  centrosaurino: { cola: 0.27, torso: 0.36, cuello: 0.09, cabeza: 0.2, nCuello: 1, H: 0.21, hs: 0.97, ancho: 1.15, cuelloAng: [0.05, 0.0], hp: -0.35, cab: 'cerat', nb: 0.85, cuelloGrosor: 1.1, pg: 1.05, xT: 0.8, xF: 0.84, codo: 1.14, rodilla: 1.06, recT: 0.93, recF: 0.93, ahT: 0.1, ahF: 0.1, pieT: 0.12, pieF: 0.11, unasT: 3, unasF: 3, colaCaida: 0.28, skin: 'tri', anim: 'tricera', walk: 1.3, run: 6.2, cw: 1.2, cr: 2.2, step: 0.15, stance: 0.66, pico: { largo: 0.14, alto: 1, ancho: 0.95 } },
  casmosaurino: { cola: 0.27, torso: 0.34, cuello: 0.09, cabeza: 0.22, nCuello: 1, H: 0.2, hs: 0.97, ancho: 1.12, cuelloAng: [0.05, 0.0], hp: -0.35, cab: 'ceratLargo', nb: 0.85, cuelloGrosor: 1.1, pg: 1.05, xT: 0.8, xF: 0.84, codo: 1.14, rodilla: 1.06, recT: 0.93, recF: 0.93, ahT: 0.1, ahF: 0.1, pieT: 0.12, pieF: 0.11, unasT: 3, unasF: 3, colaCaida: 0.28, skin: 'tri', anim: 'tricera', walk: 1.3, run: 6.0, cw: 1.2, cr: 2.2, step: 0.15, stance: 0.66, pico: { largo: 0.13, alto: 0.9, ancho: 0.9 } },
  protoceratopsido: { cola: 0.34, torso: 0.3, cuello: 0.1, cabeza: 0.2, nCuello: 1, H: 0.26, hs: 0.95, ancho: 1.0, cuelloAng: [0.1, 0.0], hp: -0.3, cab: 'proto', nb: 0.8, pg: 0.95, xT: 0.78, xF: 0.8, codo: 1.2, rodilla: 1.1, recT: 0.92, recF: 0.92, ahT: 0.12, ahF: 0.12, pieT: 0.14, pieF: 0.12, unasT: 3, unasF: 4, colaCaida: 0.2, skin: 'tri', anim: 'tricera', walk: 1.2, run: 5.8, cw: 1.3, cr: 2.4, step: 0.14, stance: 0.62, pico: { largo: 0.16, alto: 0.9, ancho: 0.9 } },
  // ---- estegosaurios
  estegosaurio: { cola: 0.4, torso: 0.26, cuello: 0.2, cabeza: 0.07, nCuello: 2, H: 0.23, hs: 0.72, arco: 0.1, cuelloAng: [-0.15, -0.3, -0.4], hp: -0.5, cab: 'estego', nb: 0.5, pg: 1.0, xT: 0.8, xF: 0.84, recT: 0.94, recF: 0.93, ahT: 0.09, ahF: 0.1, pieT: 0.12, pieF: 0.1, unasT: 3, unasF: 5, colaCaida: 0.45, skin: 'stego', anim: 'estegosaurio', walk: 1.2, run: 3.8, cw: 1.2, cr: 2.0, step: 0.1, stance: 0.66, pico: { largo: 0.2, alto: 0.7, ancho: 0.6 } },
  // ---- anquilosaurios
  anquilosaurido: { cola: 0.38, torso: 0.3, cuello: 0.1, cabeza: 0.12, nCuello: 1, H: 0.17, hs: 0.95, ancho: 1.7, bh: 1.0, cuelloAng: [0.0, -0.05], hp: -0.3, cab: 'anquilo', nb: 0.85, pg: 0.95, xT: 0.84, xF: 0.88, codo: 1.1, rodilla: 1.06, recT: 0.9, recF: 0.9, ahT: 0.1, ahF: 0.1, pieT: 0.13, pieF: 0.11, unasT: 4, unasF: 4, colaCaida: 0.3, skin: 'ankylo', anim: 'anquilosaurio', walk: 1.0, run: 3.4, cw: 1.3, cr: 2.5, step: 0.1, stance: 0.68 },
  nodosaurido: { cola: 0.35, torso: 0.3, cuello: 0.13, cabeza: 0.12, nCuello: 1, H: 0.2, hs: 0.97, ancho: 1.35, cuelloAng: [0.0, -0.1], hp: -0.35, cab: 'nodoso', nb: 0.85, pg: 1.0, xT: 0.84, xF: 0.88, codo: 1.1, rodilla: 1.06, recT: 0.92, recF: 0.92, ahT: 0.1, ahF: 0.1, pieT: 0.13, pieF: 0.11, unasT: 4, unasF: 4, colaCaida: 0.3, skin: 'ankylo', anim: 'anquilosaurio', walk: 1.0, run: 3.4, cw: 1.3, cr: 2.5, step: 0.11, stance: 0.68 },
  // ---- hadrosaurios
  hadrosaurino: { cola: 0.42, torso: 0.27, cuello: 0.18, cabeza: 0.11, nCuello: 2, H: 0.24, hs: 0.9, ancho: 0.85, cuelloAng: [0.6, 0.85, 0.35], hp: -0.2, cab: 'hadro', nb: 0.5, pg: 1.0, xT: 0.84, xF: 0.84, recT: 0.93, recF: 0.94, ahT: 0.17, ahF: 0.12, pieT: 0.17, pieF: 0.11, unasT: 3, unasF: 4, unaAncho: 1.3, colaCaida: 0.12, skin: 'parasaur', anim: 'hadrosaurio', walk: 1.6, run: 6.6, cw: 1.4, cr: 2.7, step: 0.12, stance: 0.62, pico: { largo: 0.12, alto: 0.7, ancho: 1.0 } },
  lambeosaurino: { cola: 0.42, torso: 0.27, cuello: 0.17, cabeza: 0.11, nCuello: 2, H: 0.24, hs: 0.9, ancho: 0.85, cuelloAng: [0.6, 0.85, 0.35], hp: -0.3, cab: 'hadroCorto', nb: 0.5, pg: 1.0, xT: 0.84, xF: 0.84, recT: 0.93, recF: 0.94, ahT: 0.17, ahF: 0.12, pieT: 0.17, pieF: 0.11, unasT: 3, unasF: 4, unaAncho: 1.3, colaCaida: 0.12, skin: 'parasaur', anim: 'hadrosaurio', walk: 1.6, run: 6.6, cw: 1.4, cr: 2.7, step: 0.12, stance: 0.62, pico: { largo: 0.1, alto: 0.7, ancho: 1.0 } },
  // ---- cocodrilomorfos: tronco largo y bajo, cola alta y comprimida, patas semierguidas (rodillas y codos hacia fuera), ojos arriba
  cocodrilo: { cola: 0.46, torso: 0.3, cuello: 0.05, cabeza: 0.19, nCuello: 1, H: 0.062, hs: 1.0, ancho: 0.9, bhMax: 0.56, jaw: [0.88, 0.5, 0.72], cuelloAng: [0.02, 0.0], hp: 0.0, cab: 'croco', nb: 0.95, pg: 1.15, xT: 1.0, xF: 0.95, codo: 1.35, rodilla: 1.3, rT: 0.5, rF: 0.5, recT: 0.9, recF: 0.9, ahT: 0.14, ahF: 0.14, pieT: 0.2, pieF: 0.17, unasT: 4, unasF: 5, pezuna: false, unaL: 0.9, colaCaida: 0.45, colaGrosor: 1.15, colaAncho: 0.55, ojoPos: [0.62, 0.85], ojo: 1.3, skin: 'croco', anim: 'cocodrilo', walk: 1.1, run: 4.2, cw: 1.8, cr: 2.8, step: 0.3, stance: 0.7, ondula: 2.6, dientes: 0,
    rasgos: [['dientesMandibula', {}], ['escudos', { filas: 12, cols: 4, tam: 0.0085, desde: ['spine2', 0.4], hasta: ['tail3', 0.5], cola: 0.75, arco: 0.7 }]] },
  cocodriloTerrestre: { cola: 0.33, torso: 0.32, cuello: 0.07, cabeza: 0.22, nCuello: 1, H: 0.15, hs: 1.04, ancho: 1.0, jaw: [0.85, 0.5, 0.72], cuelloAng: [0.1, 0.0], hp: -0.15, cab: 'crocoCorto', nb: 0.85, pg: 1.6, xT: 0.8, xF: 0.8, codo: 1.15, rodilla: 1.12, rT: 0.5, rF: 0.5, recT: 0.95, recF: 0.95, ahT: 0.1, ahF: 0.1, pieT: 0.13, pieF: 0.11, unasT: 4, unasF: 5, pezuna: true, unaL: 0.6, colaCaida: 0.4, colaGrosor: 0.9, colaAncho: 0.6, ojoPos: [0.7, 0.8], ojo: 1.1, skin: 'croco', anim: 'cocodrilo', walk: 1.8, run: 8.0, cw: 1.6, cr: 2.6, step: 0.2, stance: 0.64, ondula: 1.4,
    rasgos: [['dientesMandibula', { n: 8, desde: 0.35, hasta: 0.97, largo: 0.045 }], ['colmillos', { t: 0.72, largo: 0.17 }], ['colmillos', { t: 0.5, largo: 0.11, grosor: 0.16 }], ['escudos', { filas: 8, cols: 3, tam: 0.01, desde: ['spine2', 0.4], hasta: ['tail2', 0.5], cola: 0.8, arco: 0.6 }]] },
  // ---- mamíferos mesozoicos (patas semierguidas, pies plantígrados, cuerpo cubierto de pelo)
  mamiferoRobusto: { cola: 0.2, torso: 0.38, cuello: 0.07, cabeza: 0.3, jaw: [0.8, 0.4, 0.8], nCuello: 1, H: 0.21, hs: 1.0, arco: 0.05, ancho: 1.0, cuelloAng: [0.12, 0.0], hp: -0.25, cab: 'mamiferoFuerte', nb: 0.85, pg: 1.0, xT: 0.95, xF: 0.9, codo: 1.15, rodilla: 1.15, rT: 0.5, rF: 0.5, recT: 0.9, recF: 0.9, ahT: 0.09, ahF: 0.09, pieT: 0.19, pieF: 0.16, unasT: 5, unasF: 5, pezuna: false, unaL: 0.55, colaCaida: 0.4, colaGrosor: 0.55, colaAncho: 1.0, ojoPos: [0.88, 0.45], ojo: 1.1, skin: 'pelo', anim: 'mamifero', walk: 1.1, run: 4.6, cw: 1.6, cr: 2.6, step: 0.2, stance: 0.62, ondula: 1.6, rasgos: [['orejas', {}], ['colmillos', { t: 0.8, largo: 0.1, grosor: 0.16 }]] },
  mamiferoOmnivoro: { cola: 0.42, torso: 0.32, cuello: 0.06, cabeza: 0.27, jaw: [0.8, 0.4, 0.8], nCuello: 1, H: 0.14, hs: 1.0, arco: 0.06, ancho: 0.95, cuelloAng: [0.1, 0.0], hp: -0.3, cab: 'mamiferoRomo', nb: 0.85, pg: 1.0, xT: 0.9, xF: 0.85, codo: 1.12, rodilla: 1.12, rT: 0.5, rF: 0.5, recT: 0.9, recF: 0.9, ahT: 0.09, ahF: 0.09, pieT: 0.17, pieF: 0.15, unasT: 5, unasF: 5, pezuna: false, unaL: 0.5, colaCaida: 0.55, colaGrosor: 0.5, colaAncho: 1.0, ojoPos: [0.88, 0.45], ojo: 1.1, skin: 'pelo', anim: 'mamifero', walk: 0.9, run: 4.0, cw: 1.5, cr: 2.5, step: 0.2, stance: 0.62, ondula: 1.6, rasgos: [['orejas', { tam: 0.14 }]] },
  // ---- anfibios
  ranaGigante: { cola: 0.02, torso: 0.43, cuello: 0.03, cabeza: 0.52, nCuello: 1, H: 0.24, jaw: [0.9, 0.35, 0.8], hs: 1.2, arco: 0.1, ancho: 1.25, cuelloAng: [0.15, 0.0], hp: -0.2, cab: 'rana', nb: 0.9, pg: 1.2, xT: 0.95, xF: 0.7, codo: 1.1, rodilla: 1.25, rT: 0.5, rF: 0.5, recT: 0.78, recF: 0.9, ahT: 0.07, ahF: 0.09, pieT: 0.3, pieF: 0.17, unasT: 4, unasF: 4, pezuna: false, unaL: 0.4, colaCaida: 0.0, colaGrosor: 0.3, colaAncho: 1.0, ojoPos: [0.7, 0.95], ojo: 1.5, skin: 'aspero', anim: 'anfibio', walk: 0.5, run: 2.2, cw: 1.4, cr: 2.2, step: 0.25, stance: 0.55, ondula: 0.5, rasgos: [] },
  // ---- tireóforos basales
  tireoforo: { cola: 0.44, torso: 0.28, cuello: 0.14, cabeza: 0.1, nCuello: 1, H: 0.17, hs: 0.9, ancho: 1.1, cuelloAng: [0.1, -0.1], hp: -0.35, cab: 'sceli', nb: 0.7, pg: 0.9, xT: 0.8, xF: 0.84, codo: 1.08, rodilla: 1.05, recT: 0.9, recF: 0.9, ahT: 0.1, ahF: 0.1, pieT: 0.13, pieF: 0.11, unasT: 4, unasF: 5, colaCaida: 0.2, skin: 'ankylo', anim: 'anquilosaurio', walk: 1.1, run: 4.2, cw: 1.3, cr: 2.4, step: 0.12, stance: 0.66, pico: { largo: 0.15, alto: 0.7, ancho: 0.7 } },
};

/**
 * Medidas reales (m) de un cuadrúpedo a partir de su definición {arq, L, masa, o:{…}}. Datos puros: sin geometría.
 * Sistema de coordenadas: +z hacia delante, +y arriba; el origen queda en el centro del tronco (entre cadera y hombros) a nivel del suelo.
 */
export function medirCuadrupedo(def) {
  const A = ARQ[def.arq];
  if (!A) throw new Error(`Arquetipo de cuadrúpedo desconocido: ${def.arq}`);
  const d = { ...BASE, ...A, ...(def.o ?? {}) };
  const { L, masa } = def;
  const sum = d.cola + d.torso + d.cuello + d.cabeza;
  const Lc = (d.cola / sum) * L, Lt = (d.torso / sum) * L, Ln = (d.cuello / sum) * L, Lh = (d.cabeza / sum) * L;
  const Hh = d.H * L, Hs = Hh * d.hs;
  // el tronco sale de la masa (densidad ≈ 1 t/m³ → profundidad ∝ ∛masa); nunca pasa de un 62 % de la altura de la cadera (necesita holgura bajo el vientre)
  let bh = clamp(0.5 * Math.cbrt(masa / 1000) * d.bh, 0.035 * L, 0.15 * L), ancho = d.ancho;
  if (bh > d.bhMax * Hh) { ancho *= bh / (d.bhMax * Hh); bh = d.bhMax * Hh; }
  const bw = bh * ancho;
  const zc = Lt / 2;
  const J = {};
  J.hips = [0, Hh, -zc];
  J.spine1 = [0, lerp(Hh, Hs, 0.5) + d.arco * Hh, 0];
  J.spine2 = [0, Hs, zc];
  // cuello: tramos con ángulo de elevación propio
  const nN = d.nCuello, tr = TRAMOS[nN];
  if (!tr) throw new Error(`Número de huesos de cuello no soportado: ${nN}`);
  if (d.cuelloAng.length < nN + 1) throw new Error(`cuelloAng necesita ${nN + 1} ángulos`);
  let pos = J.spine2;
  for (let i = 0; i <= nN; i++) {
    const a = d.cuelloAng[i], l = Ln * tr[i];
    pos = [0, pos[1] + l * sin(a), pos[2] + l * cos(a)];
    J[i < nN ? `neck${i + 1}` : 'head'] = pos;
  }
  // cola
  const tailY = (t) => Hh * (1 - d.colaCaida * t);
  TZ.forEach((t, i) => { J[i < 5 ? `tail${i + 1}` : 'tailTip'] = [0, tailY(t), -zc - Lc * t]; });
  // cabeza
  const cab = CAB[d.cab];
  if (!cab) throw new Error(`Perfil de cabeza desconocido: ${d.cab}`);
  const dirH = [cos(d.hp), sin(d.hp)]; // (z, y)
  const O = [0, J.head[1] - 0.094 * Lh * dirH[1], J.head[2] - 0.094 * Lh * dirH[0]];
  const headPt = (t) => [0, O[1] + t * Lh * dirH[1] + interp(cab.t, cab.dy, t) * Lh, O[2] + t * Lh * dirH[0]];
  const headR = (t) => [interp(cab.t, cab.rx, t) * Lh * d.cabAncho, interp(cab.t, cab.ry, t) * Lh * d.cabAlto];
  J.jaw = [0, headPt(0.25)[1] - 0.094 * Lh, headPt(0.25)[2]];
  // patas: se resuelve la rodilla/codo por intersección de dos círculos (segmentos de longitud l1,l2 con alcance 1/rec veces la distancia cadera–tobillo)
  const toeY = max(0.03, 0.009 * Hh);
  const solve = (hip, ank, rel, rec, fwd) => { // hip/ank: [z,y]; devuelve rodilla [z,y]
    const dz = ank[0] - hip[0], dy = ank[1] - hip[1], D = Math.hypot(dz, dy), l1 = (D * rel) / rec, l2 = (D * (1 - rel)) / rec;
    const a = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
    const ux = dz / D, uy = dy / D, nx = -uy, ny = ux; // n: perpendicular, apunta a +z cuando u apunta hacia abajo
    const s = fwd ? 1 : -1;
    return { knee: [hip[0] + ux * l1 * cos(a) + nx * l1 * sin(a) * s, hip[1] + uy * l1 * cos(a) + ny * l1 * sin(a) * s], l1, l2, D };
  };
  const hipT = [J.hips[2] - 0.05 * Lt, Hh * 0.97], ankT = [hipT[0] + d.atrasT * Hh, max(toeY + 0.02, d.ahT * Hh)];
  const hipF = [J.spine2[2] + 0.04 * Lt, Hs * 0.97], ankF = [hipF[0] + d.adelF * Hs, max(toeY + 0.02, d.ahF * Hs)];
  const sT = solve(hipT, ankT, d.rT, d.recT, true), sF = solve(hipF, ankF, d.rF, d.recF, false);
  const xT = bw * d.xT, xF = bw * d.xF;
  const leg = { xT, xF, hipT, kneeT: sT.knee, ankT, hipF, elbF: sF.knee, ankF, l1T: sT.l1, l2T: sT.l2, l1F: sF.l1, l2F: sF.l2, toeY, fT: d.pieT * Hh, fF: d.pieF * Hs };
  // el paso no puede ser mayor que lo que alcanza la pata más justa: se acota el ciclo (si no, el pie se levantaría del suelo a mitad de apoyo)
  const reach = (D, rec) => D * sqrt(1 / (rec * rec * 0.9409) - 1); // tolerancia: el pie puede quedar hasta un 3 % de la pata por encima del suelo en los extremos del paso
  const dzMax = min(reach(sT.D, d.recT), reach(sF.D, d.recF)), cicloMax = (2 * dzMax) / (d.stance * 0.9);
  const cycle = { walk: min(d.cw * Hh, cicloMax * 0.9), run: min(d.cr * Hh, cicloMax) };
  const vel = { walk: d.walk, run: d.run };
  // esferas de impacto: tronco, cuello, cabeza, cola y las cuatro patas (la primera es el centro del cuerpo); en cada tramo se reparten esferas para cubrirlo
  const { hit, tramo } = crearHit();
  const rT = Math.max(bh, bw) * 1.02;
  hit.push([0, lerp(Hh, Hs, 0.5) + d.arco * Hh * 0.5, 0, Math.max(0.15, rT)]);
  tramo(J.hips, J.spine1, rT * 0.95, rT, 2); tramo(J.spine1, J.spine2, rT, rT * 0.98, 2);
  { // cuello
    const hr0 = headR(0.08), base = d.nb * bh * d.cuelloGrosor, cadena = ['spine2', ...Array.from({ length: nN }, (_, i) => `neck${i + 1}`), 'head'];
    for (let i = 0; i < cadena.length - 1; i++) { const f0 = i / (cadena.length - 1), f1 = (i + 1) / (cadena.length - 1); tramo(J[cadena[i]], J[cadena[i + 1]], Math.max(0.1, lerp(base, hr0[1], f0)), Math.max(0.1, lerp(base, hr0[1], f1)), 3); }
  }
  hit.push([0, headPt(0.55)[1], headPt(0.55)[2], max(0.12, Lh * 0.42)]);
  if (Lh > 0.9) hit.push([0, headPt(0.2)[1], headPt(0.2)[2], max(0.12, Lh * 0.36)]);
  const gl = d.rasgos.find((r) => (Array.isArray(r) ? r[0] : r) === 'gola');
  if (gl) { const o = gl[1] ?? {}, ax = (o.ancho ?? 1.4) * Lh, ay = (o.alto ?? 1.1) * Lh, inc = o.incl ?? 0.25, p0 = headPt(0.04), k = o.centro ?? 0.6; hit.push([0, p0[1] + headR(0.04)[1] * (o.bisagra ?? 0.55) + cos(inc) * ay * k, p0[2] - 0.1 * Lh - sin(inc) * ay * k, Math.max(ax, ay) * 0.75]); }
  { // cola
    const cadena = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tailTip'], rr = [0.6, 0.36, 0.22, 0.13, 0.07, 0.03];
    tramo(J.hips, J.tail1, bh * 0.75 * d.colaGrosor, bh * 0.6 * d.colaGrosor, 2);
    for (let i = 0; i < cadena.length - 1; i++) tramo(J[cadena[i]], J[cadena[i + 1]], Math.max(0.08, rr[i] * bh * d.colaGrosor), Math.max(0.07, rr[i + 1] * bh * d.colaGrosor), 2);
  }
  { // patas (ambos lados)
    const th = (v) => v * bh * d.pg;
    for (const sx of [1, -1]) {
      const kx = xT * d.rodilla * sx, ex = xF * d.codo * sx;
      tramo([xT * sx, hipT[1], hipT[0]], [kx, sT.knee[1], sT.knee[0]], th(0.5), th(0.34), 2);
      tramo([kx, sT.knee[1], sT.knee[0]], [xT * sx, ankT[1], ankT[0]], th(0.34), th(0.26), 2);
      tramo([xT * sx, ankT[1], ankT[0]], [xT * sx, toeY + th(0.2), ankT[0] + d.pieT * Hh * 0.8], th(0.26), th(0.26), 1);
      tramo([xF * sx, hipF[1], hipF[0]], [ex, sF.knee[1], sF.knee[0]], th(0.42), th(0.3), 2);
      tramo([ex, sF.knee[1], sF.knee[0]], [xF * (1 + (d.codo - 1) * 0.6) * sx, ankF[1], ankF[0]], th(0.3), th(0.24), 2);
      tramo([xF * (1 + (d.codo - 1) * 0.6) * sx, ankF[1], ankF[0]], [xF * (1 + (d.codo - 1) * 0.6) * sx, toeY + th(0.2), ankF[0] + d.pieF * Hs * 0.8], th(0.24), th(0.24), 1);
    }
  }
  const radius = max(0.3, 0.78 * Lt);
  return { d, L, masa, Lc, Lt, Ln, Lh, Hh, Hs, bh, bw, zc, J, O, cab, dirH, headPt, headR, leg, vel, cycle, hit, hips: Hh, step: d.step * Hh, stance: d.stance, radius, toeY, nN };
}

// Perfiles de radios del tronco (cola → hombros), fracciones de bh (alto) y bw (ancho)
const RY = [0.03, 0.07, 0.13, 0.22, 0.36, 0.6, 0.9, 1.0, 0.96];
const RX = [0.035, 0.08, 0.15, 0.25, 0.4, 0.64, 0.92, 1.0, 0.95];

/** Esqueleto + malla de un cuadrúpedo medido. `pal` es la paleta de color (ver color.js). Devuelve {geo, sk, legs, specs, ancla}. */
export function construirCuadrupedo(P, pal0) {
  const { d, J, L, Lh, bh, bw, Hh, Hs, leg, headPt, headR, nN } = P;
  const V3 = (a) => V(a[0], a[1], a[2]);
  const pal = { ...pal0 };
  const neckNames = Array.from({ length: nN }, (_, i) => `neck${i + 1}`);
  const specs = [
    { name: 'hips', parent: null, pos: J.hips }, { name: 'spine1', parent: 'hips', pos: J.spine1 }, { name: 'spine2', parent: 'spine1', pos: J.spine2 },
  ];
  let par = 'spine2';
  for (const nm of neckNames) { specs.push({ name: nm, parent: par, pos: J[nm] }); par = nm; }
  specs.push({ name: 'head', parent: par, pos: J.head }, { name: 'jaw', parent: 'head', pos: J.jaw });
  specs.push({ name: 'tail1', parent: 'hips', pos: J.tail1 }, { name: 'tail2', parent: 'tail1', pos: J.tail2 }, { name: 'tail3', parent: 'tail2', pos: J.tail3 }, { name: 'tail4', parent: 'tail3', pos: J.tail4 }, { name: 'tail5', parent: 'tail4', pos: J.tail5 });
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const kx = leg.xT * d.rodilla, ex = leg.xF * d.codo, wx = leg.xF * (1 + (d.codo - 1) * 0.6);
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: [leg.xT * sx, leg.hipT[1], leg.hipT[0]] }, { name: `shin${side}`, parent: `thigh${side}`, pos: [kx * sx, leg.kneeT[1], leg.kneeT[0]] }, { name: `foot${side}`, parent: `shin${side}`, pos: [leg.xT * sx, leg.ankT[1], leg.ankT[0]] });
    specs.push({ name: `fup${side}`, parent: 'spine2', pos: [leg.xF * sx, leg.hipF[1], leg.hipF[0]] }, { name: `flow${side}`, parent: `fup${side}`, pos: [ex * sx, leg.elbF[1], leg.elbF[0]] }, { name: `ffoot${side}`, parent: `flow${side}`, pos: [wx * sx, leg.ankF[1], leg.ankF[0]] });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);

  // ---- tronco, cola y cuello en un solo tubo
  const names = ['tailTip', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', 'spine2', ...neckNames, 'head'];
  const pts = names.map((n) => V3(J[n]));
  const fx = (f, i) => (i >= 1 && i <= 5 ? Math.pow(f, 1 / d.colaForma) : f);
  const ryS = RY.map((f, i) => fx(f, i) * bh * (i >= 1 && i <= 5 ? d.colaGrosor : 1));
  const rxS = RX.map((f, i) => fx(f, i) * bw * (i >= 1 && i <= 5 ? d.colaGrosor * d.colaAncho : 1));
  const hr0 = headR(0.08);
  // el cuello pasa del radio de su base (nb·bh) al radio posterior del cráneo
  for (let k = 0; k <= nN; k++) {
    const u = (k + 1) / (nN + 1), e = Math.pow(u, 0.75);
    const baseY = d.nb * bh * d.cuelloGrosor, baseX = d.nb * bw * d.cuelloGrosor * 0.9;
    if (k === nN) { ryS.push(max(hr0[1] * 0.98, 0.01)); rxS.push(max(hr0[0] * 0.98, 0.01)); }
    else { ryS.push(max(hr0[1] * 1.02, lerp(baseY, hr0[1], e))); rxS.push(max(hr0[0] * 1.02, lerp(baseX, hr0[0], e))); }
  }
  const owners = ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', 'spine2', ...neckNames];
  B.tube({ lateral: true, pts, rx: rxS, ry: ryS, owners, sides: L > 12 ? 18 : 14, sub: 2, uscale: 3, vscale: 0.5 });
  // muestreo de la superficie del tubo (para colocar rasgos sobre el lomo, los flancos o el cuello)
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const nP = pts.length;
  const sample = (a, b, f) => {
    const ia = names.indexOf(a), ib = names.indexOf(b);
    if (ia < 0 || ib < 0) throw new Error(`Punto de cadena desconocido: ${a}/${b}`);
    const idx = lerp(ia, ib, f), i = clamp(floor(idx), 0, nP - 2), u = clamp(idx - i, 0, 1), t = clamp((i + u) / (nP - 1), 0, 1);
    const c = curve.getPoint(t), dd = curve.getTangent(t).normalize(), sm = u * u * (3 - 2 * u);
    const rx = lerp(rxS[i], rxS[i + 1], sm), ry = lerp(ryS[i], ryS[i + 1], sm), n = norm3([0, dd.z, -dd.y]); // n: dirección dorsal (el eje lateral es siempre x)
    return { c: [c.x, c.y, c.z], d: [dd.x, dd.y, dd.z], n, rx, ry, top: [c.x + n[0] * ry, c.y + n[1] * ry, c.z + n[2] * ry], owner: owners[min(i, owners.length - 1)] };
  };

  // ---- cabeza y mandíbula
  B.tube({ lateral: true, pts: P.cab.t.map((t) => V3(headPt(t))), rx: P.cab.t.map((t) => headR(t)[0]), ry: P.cab.t.map((t) => headR(t)[1]), owners: 'head', sides: 12, sub: 2, uscale: 2, vscale: 1 });
  const jt = [0.3, 0.55, 0.8, 1.0];
  B.tube({ lateral: true,
    pts: jt.map((t) => { const p = headPt(t), r = headR(t); return V(0, p[1] - r[1] * d.jaw[2], p[2] - (t === 1 ? 0.02 * Lh : 0)); }),
    rx: jt.map((t) => headR(t)[0] * d.jaw[0]), ry: jt.map((t) => max(0.004, headR(t)[1] * d.jaw[1])), owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 1,
  });
  if (d.pico) { // pico córneo en la punta del hocico (ceratópsidos, estegosaurios…)
    const p = headPt(1), r = headR(0.92), pl = d.pico.largo * Lh;
    B.blob(V(0, p[1] + r[1] * 0.1, p[2] - pl * 0.25), max(0.01, r[0] * d.pico.ancho * 1.05), max(0.01, r[1] * d.pico.alto * 1.0), pl, 'head', d.picoParte === 'cuerpo' ? PART.cuerpo : PART.cuerno, 8);
  }
  const ojoR = max(0.006, headR(0.4)[1] * 0.2 * d.ojo);
  for (const sx of [1, -1]) {
    const p = headPt(0.4), r = headR(0.4);
    B.blob(V(r[0] * d.ojoPos[0] * sx, p[1] + r[1] * d.ojoPos[1], p[2]), ojoR, ojoR * 1.1, ojoR * 1.1, 'head', PART.ojo, 8);
    if (d.dientes > 0) { // dientes en hilera al frente de la mandíbula (diplodócidos: lápices; nigersaurio: peine)
      const dl = d.dienteL * Lh;
      for (let i = 0; i < d.dientes; i++) {
        const t = 0.74 + (0.24 * i) / max(1, d.dientes - 1), p2 = headPt(t), r2 = headR(t), x = r2[0] * (d.cab === 'nigero' ? 0.95 : 0.7) * sx * (1 - 0.7 * i / max(1, d.dientes) * (d.cab === 'nigero' ? 0 : 1));
        B.spike(V(x, p2[1] - r2[1] * 0.9, p2[2]), V(x, p2[1] - r2[1] * 0.9 - dl, p2[2] + 0.004), max(0.002, dl * 0.16), 'head', PART.diente, { sides: 4 });
      }
    }
  }

  // ---- patas
  const th = (v) => v * bh * d.pg;
  const nailsAt = (cx, y, z, n, w, len, bone, sx, hoof) => { // uñas o pezuñas romas en el borde delantero del pie
    const sp = n > 1 ? (w * 1.6) / (n - 1) : 0;
    for (let k = 0; k < n; k++) B.blob(V(cx + (k - (n - 1) / 2) * sp * sx, y, z), w * 0.55 * (hoof ? 1.15 : 0.9), max(0.012, len * 0.45), len, bone, PART.garra, 7);
  };
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const kx = leg.xT * d.rodilla * sx, x = leg.xT * sx;
    const fz = leg.fT, ty = leg.toeY;
    // pie: tubo aplanado que baja desde el tobillo y acaba horizontal, apoyado en el suelo (sus anillos nunca bajan de toeY)
    const foot = (hx, ank, fl, rfx, own) => {
      const rfy = max(0.012, rfx * 0.55), cy = ty + rfy * 1.12, zA = ank[0], aY = ank[1];
      return {
        pts: [V(hx, cy + (aY - cy) * 0.45, zA + fl * 0.1), V(hx, cy + rfy * 0.1, zA + fl * 0.42), V(hx, cy, zA + fl * 0.92)],
        rx: [rfx * 0.95, rfx * 1.05, rfx * 0.8], ry: [rfx * 0.95, rfy * 1.1, rfy * 0.8], own,
      };
    };
    // trasera: muslo, tibia y pie
    const rfT = th(0.24), fT = foot(x, leg.ankT, fz, rfT, `foot${side}`);
    B.tube({ lateral: true,
      pts: [V(x, leg.hipT[1] + 0.02 * Hh, leg.hipT[0]), V(kx, leg.kneeT[1], leg.kneeT[0]), V(x, leg.ankT[1], leg.ankT[0]), ...fT.pts],
      rx: [th(0.4), th(0.28), th(0.2), ...fT.rx], ry: [th(0.46), th(0.31), th(0.21), ...fT.ry],
      owners: [`thigh${side}`, `shin${side}`, `foot${side}`, `foot${side}`, `foot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5,
    });
    B.blob(V(x * 1.03, Hh * 0.92, leg.hipT[0] + 0.02 * P.Lt), th(0.42), th(0.52), th(0.62), `thigh${side}`, PART.cuerpo, 8);
    const zcT = leg.ankT[0] + fz * 0.92, wr = rfT, nT = d.unasT;
    if (nT > 0) nailsAt(x, ty + 0.02, zcT, nT, wr * d.unaAncho, max(0.02, wr * d.unaL * 0.9), `foot${side}`, sx, d.pezuna);
    // delantera
    const ex = leg.xF * d.codo * sx, wx = leg.xF * (1 + (d.codo - 1) * 0.6) * sx, xf = leg.xF * sx, fzF = leg.fF;
    const rfF = th(0.22), fF = foot(wx, leg.ankF, fzF, rfF, `ffoot${side}`);
    B.tube({ lateral: true,
      pts: [V(xf, leg.hipF[1] + 0.02 * Hs, leg.hipF[0]), V(ex, leg.elbF[1], leg.elbF[0]), V(wx, leg.ankF[1], leg.ankF[0]), ...fF.pts],
      rx: [th(0.34), th(0.25), th(0.19), ...fF.rx], ry: [th(0.38), th(0.28), th(0.2), ...fF.ry],
      owners: [`fup${side}`, `flow${side}`, `ffoot${side}`, `ffoot${side}`, `ffoot${side}`], sides: 10, sub: 3, uscale: 3, vscale: 0.5,
    });
    B.blob(V(xf * 1.04, Hs * 0.9, leg.hipF[0] - 0.02 * P.Lt), th(0.36), th(0.46), th(0.5), `fup${side}`, PART.cuerpo, 8);
    const zcF = leg.ankF[0] + fzF * 0.92, wf = rfF, nF = d.unasF;
    if (nF > 0) nailsAt(wx, ty + 0.02, zcF, nF, wf * d.unaAncho, max(0.02, wf * d.unaL * 0.9), `ffoot${side}`, sx, d.pezuna);
    if (d.garraPulgar > 0) { // saurópodos y prosaurópodos: gran garra en el primer dedo de la mano
      const gl = d.garraPulgar * Hs + 0.05 * wf;
      B.spike(V(wx - 0.5 * wf * sx, ty + 0.1 * Hs * 0.2, leg.ankF[0] + fzF * 0.6), V(wx - 0.7 * wf * sx, ty + 0.01, leg.ankF[0] + fzF * 0.7 + gl), max(0.008, wf * 0.3), `ffoot${side}`, PART.garra, { sides: 5 });
    }
  }

  // ---- rasgos de la especie
  const gola = { y: 0, r: 1, x: 1 };
  for (const r of d.rasgos) {
    const [tipo, o] = Array.isArray(r) ? r : [r, {}];
    switch (tipo) {
      case 'gola': { // escudo óseo del cuello (ceratópsidos): elipse inclinada hacia atrás, con borde de nudos, ganchos o púas
        const ax = (o.ancho ?? 1.4) * Lh, ay = (o.alto ?? 1.1) * Lh, inc = o.incl ?? 0.25, th2 = (o.grosor ?? 0.08) * Lh;
        const p0 = headPt(0.04), r0 = headR(0.04);
        const U = [0, cos(inc), -sin(inc)], N = [0, sin(inc), cos(inc)];
        const hinge = [0, p0[1] + r0[1] * (o.bisagra ?? 0.55), p0[2] - 0.1 * Lh];
        const k = o.centro ?? 0.6;
        const c = [0, hinge[1] + U[1] * ay * k, hinge[2] + U[2] * ay * k];
        const at = (s) => [c[0] + N[0] * s, c[1] + N[1] * s, c[2] + N[2] * s];
        B.tube({ lateral: true, pts: [V3(at(-th2)), V3(at(-th2 * 0.35)), V3(at(th2 * 0.35)), V3(at(th2))], rx: [ax * 0.07, ax, ax, ax * 0.07], ry: [ay * 0.06, ay, ay, ay * 0.06], owners: 'head', sides: 22, sub: 1, part: PART.gola, uscale: 2, vscale: 1, cap0: true, cap1: true });
        gola.y = c[1]; gola.r = max(ax, ay); gola.x = ax; gola.c = c; gola.U = U; gola.N = N; gola.ay = ay;
        const edge = (a) => { const cx = cos(a) * ax, cu = sin(a) * ay; return { p: [c[0] + cx, c[1] + U[1] * cu, c[2] + U[2] * cu], out: norm3([cos(a) / ax, U[1] * sin(a) / ay, U[2] * sin(a) / ay]) }; };
        for (const g of o.bordes ?? []) {
          const n = g.n ?? 8, a0 = (g.a0 ?? 0) * PI, a1 = (g.a1 ?? 1) * PI;
          for (let i = 0; i < n; i++) {
            const a = n === 1 ? (a0 + a1) / 2 : lerp(a0, a1, i / (n - 1)), e = edge(a);
            const len = (g.largo ?? 0.1) * Lh * (g.perfil ? g.perfil(i / max(1, n - 1)) : 1), rr = max(0.006, (g.r ?? 0.03) * Lh);
            const ad = g.adelante ?? 0, dir = norm3([e.out[0] + ad * N[0], e.out[1] + ad * N[1] - (g.abajo ?? 0), e.out[2] + ad * N[2]]);
            const base = [e.p[0] * 0.97 + c[0] * 0.03, e.p[1] * 0.97 + c[1] * 0.03, e.p[2] * 0.97 + c[2] * 0.03];
            const tip = [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];
            const bend = g.curva ? V(N[0] * g.curva * len, N[1] * g.curva * len, N[2] * g.curva * len) : null;
            B.spike(V3(base), V3(tip), rr, 'head', PART.cuerno, { sides: 5, bend });
          }
        }
        break;
      }
      case 'cuernoNasal': {
        const t = o.t ?? 0.72, p = headPt(t), rr = headR(t), h = (o.alto ?? 0.3) * Lh, lean = o.lean ?? 0.2;
        B.spike(V(0, p[1] + rr[1] * 0.7, p[2]), V(0, p[1] + rr[1] * 0.7 + h, p[2] + lean * h), max(0.008, h * (o.grosor ?? 0.2)), 'head', PART.cuerno, { sides: 7, bend: V(0, 0.05 * h, (o.curva ?? 0.1) * h) });
        break;
      }
      case 'cuernosCeja': {
        for (const sx of [1, -1]) {
          const t = o.t ?? 0.42, p = headPt(t), rr = headR(t), l = (o.largo ?? 0.6) * Lh;
          const dir = norm3([(o.abre ?? 0.2) * sx, o.arriba ?? 0.25, o.adelante ?? 1]);
          const b = [rr[0] * 0.75 * sx, p[1] + rr[1] * 0.85, p[2]], tip = [b[0] + dir[0] * l, b[1] + dir[1] * l, b[2] + dir[2] * l];
          B.spike(V3(b), V3(tip), max(0.008, l * (o.grosor ?? 0.13)), 'head', PART.cuerno, { sides: 7, bend: V(0, (o.curva ?? 0.06) * l, 0.03 * l) });
        }
        break;
      }
      case 'cuernosYugal': {
        for (const sx of [1, -1]) {
          const p = headPt(0.55), rr = headR(0.55), l = (o.largo ?? 0.14) * Lh;
          B.spike(V(rr[0] * 0.95 * sx, p[1] - rr[1] * 0.5, p[2]), V((rr[0] + l * 0.7) * sx, p[1] - rr[1] * 0.6, p[2] - l * 0.5), max(0.006, l * 0.3), 'head', PART.cuerno, { sides: 5 });
        }
        break;
      }
      case 'protuberancia': { // bulto óseo (paquirrinosaurio: nasal y sobre los ojos)
        const t = o.t ?? 0.62, p = headPt(t), rr = headR(t);
        for (const sx of o.par ? [1, -1] : [0]) B.blob(V(sx * (o.x ?? 0.5) * rr[0], p[1] + rr[1] * 0.75, p[2]), rr[0] * (o.ancho ?? 0.8), rr[1] * (o.alto ?? 0.6), (o.largo ?? 0.14) * Lh, 'head', PART.cuerno, 9);
        break;
      }
      case 'placas': { // placas dorsales (estegosaurios): alternas o en pares, más altas hacia las caderas
        const n = o.n ?? 12, h0 = (o.alto ?? 0.12) * L, a = o.desde ?? ['neck1', 0.3], b = o.hasta ?? ['tail3', 0.4];
        const pk = o.pico ?? 0.45, pares = o.modo === 'pares';
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1);
          const ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx));
          const prof = 0.25 + 0.75 * Math.exp(-(((f - pk) / (o.dispersion ?? 0.32)) ** 2)), h = h0 * prof, w = h * (o.ancho ?? 0.3), thick = max(0.012, 0.045 * h);
          const lados = pares ? [1, -1] : [i % 2 ? -1 : 1];
          for (const sd of lados) {
            const off = (pares ? 0.3 : 0.12) * s.rx * sd, lat = (o.abre ?? (pares ? 0.3 : 0.22)) * h * sd, nn = s.n;
            const base = [off, s.top[1] - nn[1] * 0.07 * s.ry, s.top[2] - nn[2] * 0.07 * s.ry];
            const forma = o.forma ?? 'rombo', wprof = forma === 'lanza' ? [0.4, 0.55, 0.4, 0.1] : forma === 'hoja' ? [0.5, 0.95, 0.8, 0.12] : forma === 'cuchilla' ? [0.8, 1.0, 0.7, 0.3] : [0.45, 1.0, 0.8, 0.12];
            const pp = [0, 0.38, 0.72, 1].map((u) => [base[0] + lat * u * u, base[1] + nn[1] * h * u, base[2] + nn[2] * h * u - (o.atras ?? 0.04) * h * u]);
            B.tube({ lateral: true, pts: pp.map(V3), rx: [thick * 1.3, thick, thick * 0.8, 0.008], ry: wprof.map((v) => max(0.01, w * v)), owners: s.owner, sides: 6, sub: 2, part: PART.placa, uscale: 1, vscale: 1 });
          }
        }
        gola.placaY0 = Hh + 0.3 * bh; gola.placaH = h0;
        break;
      }
      case 'puasCola': { // púas del extremo de la cola (thagomizer)
        const np = o.pares ?? 2, l = (o.largo ?? 0.1) * L;
        for (let i = 0; i < np; i++) {
          const s = sample('tail2', 'tailTip', lerp(o.f0 ?? 0.45, o.f1 ?? 0.85, np === 1 ? 0.5 : i / (np - 1))), sz = 1 - 0.15 * i;
          for (const sx of [1, -1]) {
            const b = [0.3 * s.rx * sx, s.c[1] + s.ry * 0.4, s.c[2]], dir = norm3([(o.abre ?? 0.55) * sx, o.arriba ?? 0.35, -(o.atras ?? 0.8)]);
            B.spike(V3(b), V(b[0] + dir[0] * l * sz, b[1] + dir[1] * l * sz, b[2] + dir[2] * l * sz), max(0.01, l * 0.11), 'tail4', PART.cuerno, { sides: 6 });
          }
        }
        break;
      }
      case 'puaHombro': { // gran púa sobre el hombro / la cadera
        const s = sample(o.en?.[0] ?? 'spine2', o.en?.[1] ?? 'spine2', 0), l = (o.largo ?? 0.12) * L, sx0 = o.lateral ?? 0.85;
        for (const sx of [1, -1]) {
          const b = [sx * s.rx * sx0, s.c[1] + s.ry * (o.y ?? 0.55), s.c[2] + (o.dz ?? 0) * L], dir = norm3([(o.abre ?? 0.8) * sx, o.arriba ?? 0.5, o.adelante ?? -0.25]);
          B.spike(V3(b), V(b[0] + dir[0] * l, b[1] + dir[1] * l, b[2] + dir[2] * l), max(0.012, l * (o.grosor ?? 0.13)), o.hueso ?? 'spine2', PART.cuerno, { sides: 6, bend: V(0, 0.04 * l, 0) });
        }
        break;
      }
      case 'puasFlanco': { // hilera de púas laterales (nodosaurios y estegosaurios basales)
        const n = o.n ?? 8, l = (o.largo ?? 0.07) * L, a = o.desde ?? ['spine2', 0.4], b = o.hasta ?? ['hips', 0.2];
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1), ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx)), sz = o.perfil ? o.perfil(f) : 1 - 0.35 * f;
          for (const sx of [1, -1]) {
            const bb = [s.rx * sx * (o.lateral ?? 0.92), s.c[1] + s.ry * (o.y ?? 0.35), s.c[2]], dir = norm3([(o.abre ?? 1) * sx, o.arriba ?? 0.2, -(o.atras ?? 0.2)]);
            B.spike(V3(bb), V(bb[0] + dir[0] * l * sz, bb[1] + dir[1] * l * sz, bb[2] + dir[2] * l * sz), max(0.01, l * 0.16 * sz), s.owner, PART.cuerno, { sides: 6 });
          }
        }
        break;
      }
      case 'escudos': { // osteodermos del dorso (anquilosaurios): filas transversales de placas con quilla
        const nf = o.filas ?? 9, nc = o.cols ?? 5, a = o.desde ?? ['spine2', 0.7], b = o.hasta ?? ['tail1', 0.4], tam = (o.tam ?? 0.028) * L;
        for (let i = 0; i < nf; i++) {
          const f = i / max(1, nf - 1), ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx)), cols = f > (o.cola ?? 0.7) ? max(1, nc - 2) : nc;
          for (let k = 0; k < cols; k++) {
            const q = cols === 1 ? 0 : (k / (cols - 1)) * 2 - 1, ang = q * (o.arco ?? 0.95), x = sin(ang) * s.rx, y = s.c[1] + cos(ang) * s.ry;
            const sz = tam * (1 - 0.3 * abs(q)) * (f > (o.cola ?? 0.7) ? 0.7 : 1);
            B.blob(V(x, y, s.c[2]), sz, sz * 0.55, sz * 1.05, s.owner, PART.cuerno, 7);
            if (o.puas) B.spike(V(x, y + sz * 0.1, s.c[2]), V(x * 1.04 + q * sz * 0.4, y + sz * (o.puaAlto ?? 1.1), s.c[2] - sz * 0.15), max(0.008, sz * 0.32), s.owner, PART.cuerno, { sides: 5 });
          }
        }
        break;
      }
      case 'maza': { // maza caudal (anquilosáuridos): nódulo central y dos laterales
        const s = o.tam ?? 1, bwT = bw * 0.55 * s, p = J.tailTip;
        B.blob(V(0, p[1], p[2] - bwT * 0.45), bwT * 0.95, bwT * 0.62, bwT * 0.85, 'tail5', PART.cuerno, 10);
        for (const sx of [1, -1]) B.blob(V(sx * bwT * 0.9, p[1], p[2] - bwT * 0.4), bwT * 0.4, bwT * 0.4, bwT * 0.5, 'tail5', PART.cuerno, 8);
        break;
      }
      case 'hojasCola': { // cola con hojas laterales (Stegouros)
        const n = o.n ?? 6, l = (o.largo ?? 0.1) * L;
        for (let i = 0; i < n; i++) {
          const s = sample('tail1', 'tailTip', lerp(0.1, 0.95, i / (n - 1))), sz = 1 - 0.4 * (i / (n - 1));
          for (const sx of [1, -1]) {
            const b = [s.rx * 0.8 * sx, s.c[1], s.c[2]], tip = [b[0] + sx * l * sz, b[1] + 0.02 * l, b[2] - 0.28 * l * sz];
            B.tube({ lateral: true, pts: [V3(b), V((b[0] + tip[0]) / 2, b[1], (b[2] + tip[2]) / 2), V3(tip)], rx: [l * 0.3, l * 0.34, l * 0.06], ry: [max(0.01, l * 0.05), max(0.01, l * 0.05), 0.006], owners: s.owner, sides: 6, sub: 2, part: PART.cuerno, uscale: 1, vscale: 1 });
          }
        }
        break;
      }
      case 'espinasDorsales': { // hilera de espinas (queratina o apófisis neurales) por el cuello, el lomo y la cola
        const n = o.n ?? 20, l = (o.alto ?? 0.04) * L, a = o.desde ?? ['neck1', 0.2], b = o.hasta ?? ['hips', 0.2], par = !!o.par;
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1), ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx)), sz = o.perfil ? o.perfil(f) : 1;
          for (const sd of par ? [1, -1] : [0]) {
            const off = sd * s.rx * (o.sep ?? 0.28), b0 = [off, s.top[1] - s.n[1] * 0.05 * s.ry, s.top[2] - s.n[2] * 0.05 * s.ry];
            const tip = [b0[0] + sd * l * sz * (o.abre ?? 0.15), b0[1] + s.n[1] * l * sz, b0[2] + s.n[2] * l * sz - 0.1 * l * sz];
            B.spike(V3(b0), V3(tip), max(0.006, l * sz * (o.grosor ?? 0.12)), s.owner, PART.cuerno, { sides: 5 });
          }
        }
        break;
      }
      case 'vela': { // joroba de apófisis neurales altas (hipacrosaurio): lámina fina sobre el lomo
        const n = o.n ?? 9, h0 = (o.alto ?? 0.07) * L, a = o.desde ?? ['hips', 0.4], b = o.hasta ?? ['spine2', 0.1], ptsV = [], rxV = [], ryV = [], ow = [];
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1), ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx)), h = max(0.01, h0 * sin(PI * (0.1 + 0.8 * f)) ** 0.8);
          ptsV.push(V(0, s.top[1] - 0.1 * h + h * 0.5, s.top[2] - 0.1 * h * s.n[2] + 0)); rxV.push(max(0.006, 0.01 * L)); ryV.push(max(0.008, h * 0.5));
          if (i < n - 1) ow.push(s.owner);
        }
        B.tube({ lateral: true, pts: ptsV, rx: rxV, ry: ryV, owners: ow, sides: 6, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
        break;
      }
      case 'nodulos': { // pequeños osteodermos dispersos (titanosaurios acorazados)
        const n = o.n ?? 40, tam = (o.tam ?? 0.014) * L, a = o.desde ?? ['spine2', 0.8], b = o.hasta ?? ['tail1', 0.5];
        for (let i = 0; i < n; i++) {
          const f = ((i * 0.6180339) % 1), ia = names.indexOf(a[0]) + a[1], ib = names.indexOf(b[0]) + b[1], idx = lerp(ia, ib, f);
          const s = sample(names[floor(idx)], names[min(nP - 1, floor(idx) + 1)], idx - floor(idx)), ang = (((i * 0.7548776) % 1) * 2 - 1) * 1.15;
          const x = sin(ang) * s.rx, y = s.c[1] + cos(ang) * s.ry, sz = tam * (0.6 + 0.8 * (((i * 0.5698403) % 1)));
          B.blob(V(x, y, s.c[2]), sz, sz * 0.7, sz, s.owner, PART.cuerno, 6);
          if (o.puas && i % 5 === 0) B.spike(V(x, y, s.c[2]), V(x * 1.02, y + sz * 3, s.c[2] - sz * 0.4), sz * 0.5, s.owner, PART.cuerno, { sides: 5 });
        }
        break;
      }
      case 'narizArco': { // arco óseo de las narinas sobre los ojos (braquiosáuridos)
        const p = headPt(0.28), rr = headR(0.28);
        B.blob(V(0, p[1] + rr[1] * 0.85, p[2]), rr[0] * 0.75, rr[1] * (o.alto ?? 0.75), (o.largo ?? 0.3) * Lh, 'head', PART.cuerpo, 9);
        break;
      }
      case 'crestaHadro': { // crestas de hadrosaurios: bulto, semicírculo, hacha, abanico, varilla, espina, paleta
        const f = o.forma ?? 'semicirculo', h = (o.alto ?? 0.4) * Lh, t0 = o.t0 ?? 0.1, t1 = o.t1 ?? 0.55;
        if (f === 'bulto') {
          const p = headPt(t0 + 0.2), rr = headR(t0 + 0.2);
          B.blob(V(0, p[1] + rr[1] * 0.8, p[2]), rr[0] * 0.6, h, (t1 - t0) * 0.5 * Lh, 'head', PART.cresta, 9);
          break;
        }
        if (f === 'varilla' || f === 'espina') { // varilla fina: vertical u oblicua hacia atrás desde la frente
          const p = headPt(o.t ?? 0.3), rr = headR(o.t ?? 0.3), ang = o.ang ?? (f === 'varilla' ? 1.45 : 0.55), len = h * 1.4;
          const base = [0, p[1] + rr[1] * 0.85, p[2]], dir = [0, sin(ang), -cos(ang) * (f === 'varilla' ? 0.12 : 1)];
          B.tube({ lateral: true, pts: [V3(base), V(0, base[1] + dir[1] * len * 0.5, base[2] + dir[2] * len * 0.5), V(0, base[1] + dir[1] * len, base[2] + dir[2] * len)], rx: [max(0.01, 0.045 * Lh), max(0.008, 0.035 * Lh), 0.006], ry: [max(0.012, 0.06 * Lh), max(0.01, 0.045 * Lh), 0.006], owners: 'head', sides: 6, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
          break;
        }
        const m = 9, ptsC = [], rxC = [], ryC = [];
        for (let i = 0; i < m; i++) {
          const u = i / (m - 1), t = lerp(t0, t1, u), p = headPt(t), rr = headR(t);
          let hh;
          if (f === 'semicirculo') hh = h * sqrt(max(0, 1 - (2 * u - 1) ** 2));
          else if (f === 'hacha') hh = h * (u < 0.7 ? sqrt(max(0, 1 - ((u - 0.35) / 0.4) ** 2)) : 0.25 * (1 - u) / 0.3);
          else if (f === 'abanico') hh = h * (0.35 + 0.65 * sin(PI * clamp(u * 1.1, 0, 1))) * (u > 0.95 ? 0.4 : 1);
          else if (f === 'paleta') hh = h * 0.35 * sin(PI * clamp(u, 0, 1)) ** 0.7;
          else hh = h * sin(PI * u);
          hh = max(0.012, hh);
          ptsC.push(V(0, p[1] + rr[1] * 0.75 + hh * 0.42, p[2])); rxC.push(f === 'paleta' ? max(0.01, rr[0] * 0.9) : max(0.008, (o.grosor ?? 0.05) * Lh)); ryC.push(f === 'paleta' ? max(0.01, hh * 0.5) : max(0.01, hh * 0.58));
        }
        B.tube({ lateral: true, pts: ptsC, rx: rxC, ry: ryC, owners: 'head', sides: 8, sub: 2, part: PART.cresta, uscale: 1, vscale: 1 });
        if (o.espiga) { // prolongación posterior en forma de púa (lambeosaurio)
          const pe = headPt(t0), re = headR(t0), l = o.espiga * Lh;
          B.spike(V(0, pe[1] + re[1] * 0.85, pe[2] + 0.05 * Lh), V(0, pe[1] + re[1] * 0.95 + l * 0.25, pe[2] - l), max(0.01, 0.05 * Lh), 'head', PART.cresta, { sides: 6 });
        }
        break;
      }
      case 'dientesMandibula': { // hilera de dientes cónicos a lo largo de las dos mandíbulas (cocodrilos): la superior cuelga del cráneo y la inferior sube de la mandíbula
        const n = o.n ?? 14, t0 = o.desde ?? 0.3, t1 = o.hasta ?? 0.98, dl = (o.largo ?? 0.05) * Lh;
        for (let i = 0; i < n; i++) {
          const t = lerp(t0, t1, n === 1 ? 0.5 : i / (n - 1)), p = headPt(t), r = headR(t), big = i % 4 === 2 ? 1.4 : 1, x = r[0] * 0.86;
          for (const sx of [1, -1]) {
            B.spike(V(x * sx, p[1] - r[1] * 0.8, p[2]), V((x - 0.05 * Lh) * sx, p[1] - r[1] * 0.8 - dl * big, p[2] + 0.004), max(0.003, dl * 0.2), 'head', PART.diente, { sides: 4 });
            B.spike(V(r[0] * d.jaw[0] * 0.9 * sx, p[1] - r[1] * d.jaw[2] + r[1] * d.jaw[1] * 0.6, p[2] + 0.008), V(r[0] * d.jaw[0] * 0.85 * sx, p[1] - r[1] * d.jaw[2] + r[1] * d.jaw[1] * 0.6 + dl * 0.8 * big, p[2] + 0.01), max(0.003, dl * 0.18), 'jaw', PART.diente, { sides: 4 });
          }
        }
        break;
      }
      case 'orejas': { // orejas redondeadas (mamíferos)
        const t = o.t ?? 0.12, p = headPt(t), r = headR(t), sz = (o.tam ?? 0.16) * Lh;
        for (const sx of [1, -1]) B.blob(V(r[0] * 0.72 * sx, p[1] + r[1] * 0.82, p[2] - 0.03 * Lh), sz * 0.55, sz * 0.75, sz * 0.22, 'head', PART.cuerpo, 8);
        break;
      }
      case 'colmillos': { // grandes caninos (cocodrilos terrestres, mamíferos): salen de la mandíbula superior hacia abajo
        const t = o.t ?? 0.66, p = headPt(t), r = headR(t), l = (o.largo ?? 0.18) * Lh;
        for (const sx of [1, -1]) B.spike(V(r[0] * 0.8 * sx, p[1] - r[1] * 0.7, p[2]), V(r[0] * 0.75 * sx, p[1] - r[1] * 0.7 - l, p[2] + l * 0.12), max(0.006, l * (o.grosor ?? 0.2)), 'head', PART.diente, { sides: 6, bend: V(0, 0, l * 0.05) });
        break;
      }
      default: throw new Error(`Rasgo de cuadrúpedo desconocido: ${tipo}`);
    }
  }

  // pesos para colorear partes dependientes de la altura (gola, placas): se calculan de la geometría real
  if (gola.c) { pal.golaY = gola.y; pal.golaR = gola.r; }
  if (gola.placaY0 != null) { pal.placaY0 = gola.placaY0; pal.placaH = gola.placaH; }
  const geo = B.finish(colorizer(pal));

  const legs = [
    { name: 'FL', thigh: 'fupL', shin: 'flowL', foot: 'ffootL', phase: 0, bendFwd: false, toe: V(leg.xF * (1 + (d.codo - 1) * 0.6), leg.toeY, leg.ankF[0] + leg.fF * 0.5), quad: 'front' },
    { name: 'BR', thigh: 'thighR', shin: 'shinR', foot: 'footR', phase: 0, bendFwd: true, toe: V(-leg.xT, leg.toeY, leg.ankT[0] + leg.fT * 0.5) },
    { name: 'FR', thigh: 'fupR', shin: 'flowR', foot: 'ffootR', phase: 0.5, bendFwd: false, toe: V(-leg.xF * (1 + (d.codo - 1) * 0.6), leg.toeY, leg.ankF[0] + leg.fF * 0.5), quad: 'front' },
    { name: 'BL', thigh: 'thighL', shin: 'shinL', foot: 'footL', phase: 0.5, bendFwd: true, toe: V(leg.xT, leg.toeY, leg.ankT[0] + leg.fT * 0.5) },
  ];
  // punto de silla (entre cadera y hombros, sobre el lomo)
  const sd = sample('hips', 'spine2', 0.45);
  return { geo, sk, legs, specs, ancla: [0, sd.top[1] + 0.05, sd.top[2]] };
}
