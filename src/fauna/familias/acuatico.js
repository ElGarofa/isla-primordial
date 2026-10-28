// GENERADOR DE ANIMALES ACUÁTICOS — esqueleto nadador + malla procedural paramétrica (reptiles marinos y peces).
// Todas las proporciones son fracciones de la longitud total L (m). Un arquetipo (mosasaurio, plesiosaurio, elasmosáurido, pliosaurio, ictiosaurio, pez
// depredador, pez filtrador…) fija reparto cabeza/cuello/tronco/cola, perfil del cráneo, aletas, aleta dorsal, aleta caudal y tipo de nado; cada especie lo ajusta con `o`.
// Esqueleto (lo anima `fauna/nado.js`): hips (raíz, a media altura del tronco), spine1, neck1..N, head, jaw, tail1..tail5, fluke, dorsal y aletas
// fl{F|H}{L|R}{1|2} (F = delanteras/pectorales, H = traseras/pélvicas; 1 = base, 2 = tramo distal).
// Las aletas son láminas finas (`SkinBuilder.sheet`). Se conoce bien el esqueleto de la mayoría de estos animales y, en ejemplares excepcionales
// (Holzmaden para ictiosaurios, Platecarpus para mosasaurios), el contorno del cuerpo y de la cola; el color, las aletas de tejido blando y la postura son
// hipótesis (cada fila de la tabla lo dice en su nota y su `conf`).
import { SkinBuilder, makeSkeleton, PART, V } from '../builder.js';
import { colorizer } from '../color.js';
import { crearHit, cadena } from './hit.js';

const { sin, cos, tan, max, min, PI } = Math;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => min(b, max(a, v));
function interp(ts, arr, t) {
  if (t <= ts[0]) return arr[0];
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]) return lerp(arr[i - 1], arr[i], (t - ts[i - 1]) / (ts[i] - ts[i - 1]));
  return arr[arr.length - 1];
}

// Perfiles de cráneo (t: 0 = articulación de la cabeza, 1 = punta del hocico; rx semianchura, ry semialtura: fracción de la longitud de la cabeza; dy desvío vertical del eje)
const CAB = {
  mosasaurio: { t: [0, 0.15, 0.4, 0.7, 1], rx: [0.15, 0.16, 0.105, 0.072, 0.04], ry: [0.135, 0.145, 0.095, 0.062, 0.034], dy: [0, 0, -0.004, -0.008, -0.012] }, // cuña larga de cocodrilo, hocico cónico
  tilosaurio: { t: [0, 0.15, 0.4, 0.7, 1], rx: [0.12, 0.13, 0.085, 0.055, 0.03], ry: [0.115, 0.125, 0.08, 0.05, 0.028], dy: [0, 0, -0.002, -0.004, -0.006] }, // hocico largo y estrecho, con la prolongación del premaxilar
  prognatodonte: { t: [0, 0.15, 0.4, 0.7, 1], rx: [0.2, 0.22, 0.16, 0.11, 0.07], ry: [0.17, 0.18, 0.13, 0.09, 0.06], dy: [0, 0, -0.006, -0.012, -0.016] }, // cráneo corto, ancho y muy robusto
  plesiosaurio: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.14, 0.15, 0.1, 0.07, 0.05], ry: [0.12, 0.13, 0.08, 0.055, 0.04], dy: [0, 0, -0.005, -0.01, -0.012] }, // cabeza pequeña y triangular
  elasmosaurido: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.17, 0.18, 0.12, 0.085, 0.055], ry: [0.12, 0.125, 0.08, 0.055, 0.04], dy: [0, 0, -0.005, -0.01, -0.012] }, // cabeza pequeñísima, plana y ancha
  pliosaurio: { t: [0, 0.15, 0.4, 0.7, 1], rx: [0.19, 0.2, 0.16, 0.125, 0.08], ry: [0.15, 0.16, 0.11, 0.08, 0.055], dy: [0, 0, -0.005, -0.01, -0.012] }, // cráneo enorme, hocico ancho de dientes cónicos
  ictiosaurio: { t: [0, 0.18, 0.5, 0.8, 1], rx: [0.1, 0.105, 0.06, 0.035, 0.018], ry: [0.125, 0.13, 0.07, 0.04, 0.02], dy: [0, 0, 0, 0, 0] }, // hocico largo en forma de pico de delfín
  oftalmosaurio: { t: [0, 0.18, 0.5, 0.8, 1], rx: [0.105, 0.11, 0.055, 0.03, 0.014], ry: [0.14, 0.15, 0.065, 0.032, 0.015], dy: [0, 0, 0, 0, 0] }, // órbitas enormes y pico fino
  xifactino: { t: [0, 0.15, 0.45, 0.8, 1], rx: [0.1, 0.11, 0.1, 0.08, 0.05], ry: [0.21, 0.23, 0.2, 0.16, 0.1], dy: [0, 0, 0, 0, 0.01] }, // cabeza alta y comprimida, boca enorme
  leedsictis: { t: [0, 0.15, 0.45, 0.8, 1], rx: [0.18, 0.2, 0.18, 0.14, 0.08], ry: [0.2, 0.22, 0.2, 0.15, 0.09], dy: [0, 0, 0, 0, 0] }, // cabeza ancha de filtrador, boca terminal
};

const BASE = {
  cab: 0.13, cuello: 0.05, tronco: 0.35, cola: 0.47, nCuello: 1,
  h: 0.045, ancho: 0.92, // semialtura del tronco (× L) y relación semianchura/semialtura
  colaH: [0.78, 0.66, 0.52, 0.4, 0.31, 0.24], colaW: [0.62, 0.46, 0.33, 0.23, 0.16, 0.1], // radios (× semialtura / semianchura del tronco) en tail1..tail5 y la punta
  cuelloR: 0.6, cuelloBase: null, hombro: 0.94, cabFusion: 0, cuelloAng: [0.04], // cuelloR: radio del cuello junto a la cabeza (× tronco); cuelloBase: radio al inicio del cuello (× tronco, null = afinado geométrico); hombro: radio del frente del tronco; cabFusion: fracción trasera de la cabeza que se funde con el cuerpo
  cab_: 'mosasaurio', cabAlto: 1, cabAncho: 1, hp: 0, mandibula: 1, ojo: 1, ojoT: 0.3,
  dientes: null,
  aletaD: { largo: 0.08, ancho: 0.035, z: 0.34, y: -0.55, barrido: 0.55, caida: 0.5 },
  aletaT: { largo: 0.07, ancho: 0.03, z: -0.36, y: -0.55, barrido: 0.55, caida: 0.5 },
  dorsal: null, fluke: null,
  nado: { tipo: 'undulante', amp: 0.1, paso: 0.55, lag: 0.6 },
  vel: [2, 8], prof: [1.5, 8], respira: [45, 110], crucero: 0.3,
};

export const ARQ = {
  mosasaurido: { // Mosasaurus: cuerpo largo y cilíndrico, cola muy larga con aleta caudal asimétrica (lóbulo inferior mayor), cuatro aletas cortas
    cab: 0.13, cuello: 0.05, tronco: 0.35, cola: 0.47, h: 0.045, cab_: 'mosasaurio', cabFusion: 0.25,
    dientes: { n: 13, L: 0.07, desde: 0.32, forma: 'conico' }, ojo: 1,
    fluke: { forma: 'tiburon', alto: 0.1, c: 0.055, baja: 1.9, barrido: 0.8 },
    nado: { tipo: 'undulante', amp: 0.11, paso: 0.5, lag: 0.55 },
  },
  plesiosaurio: { // Plesiosaurus: cuello largo (≈1/3), tronco ancho y plano, cuatro aletas largas, cola corta
    cab: 0.065, cuello: 0.33, tronco: 0.34, cola: 0.265, nCuello: 3, h: 0.07, ancho: 1.1, cab_: 'plesiosaurio', cuelloR: 0.14, cuelloBase: 0.3, hombro: 0.8, cuelloAng: [0.1, 0.06, 0.03, 0.0],
    colaH: [0.5, 0.36, 0.26, 0.18, 0.12, 0.08], colaW: [0.5, 0.36, 0.26, 0.18, 0.12, 0.08],
    dientes: { n: 10, L: 0.1, desde: 0.3, forma: 'conico' },
    aletaD: { largo: 0.28, ancho: 0.085, z: 0.3, y: -0.7, barrido: 0.75, caida: 0.4 }, aletaT: { largo: 0.3, ancho: 0.09, z: -0.28, y: -0.7, barrido: 0.75, caida: 0.4 },
    nado: { tipo: 'plesiosaurio', amp: 0.5, paso: 0.0, lag: 0.7 },
  },
  elasmosaurido: { // Elasmosaurus: cuello de ≈½ de la longitud (71 vértebras), cabeza diminuta
    cab: 0.05, cuello: 0.45, tronco: 0.28, cola: 0.22, nCuello: 4, h: 0.055, ancho: 1.12, cab_: 'elasmosaurido', cuelloR: 0.2, cuelloBase: 0.4, hombro: 0.8, cuelloAng: [0.06, 0.05, 0.04, 0.03, 0.02],
    colaH: [0.45, 0.33, 0.24, 0.17, 0.11, 0.07], colaW: [0.45, 0.33, 0.24, 0.17, 0.11, 0.07],
    dientes: { n: 9, L: 0.1, desde: 0.3, forma: 'conico' },
    aletaD: { largo: 0.165, ancho: 0.04, z: 0.34, y: -0.7, barrido: 0.7, caida: 0.4 }, aletaT: { largo: 0.17, ancho: 0.042, z: -0.3, y: -0.7, barrido: 0.7, caida: 0.4 },
    nado: { tipo: 'plesiosaurio', amp: 0.45, paso: 0.0, lag: 0.7 },
  },
  pliosaurido: { // Kronosaurus: cabeza gigante (≈¼ de la longitud), cuello corto y grueso, cuatro aletas grandes
    cab: 0.26, cuello: 0.08, tronco: 0.35, cola: 0.31, nCuello: 1, h: 0.062, ancho: 1.0, cab_: 'pliosaurio', cuelloR: 0.75, cabFusion: 0.2,
    colaH: [0.55, 0.42, 0.3, 0.21, 0.14, 0.09], colaW: [0.5, 0.38, 0.27, 0.19, 0.12, 0.08],
    dientes: { n: 12, L: 0.075, desde: 0.3, forma: 'conico' },
    aletaD: { largo: 0.2, ancho: 0.07, z: 0.32, y: -0.65, barrido: 0.65, caida: 0.4 }, aletaT: { largo: 0.19, ancho: 0.065, z: -0.3, y: -0.65, barrido: 0.65, caida: 0.4 },
    nado: { tipo: 'plesiosaurio', amp: 0.45, paso: 0.0, lag: 0.7 },
  },
  ictiosaurio: { // cuerpo de delfín: cabeza de pico largo, tronco fusiforme, aleta dorsal y caudal lunada (lóbulo inferior sostenido por la columna)
    cab: 0.2, cuello: 0.03, tronco: 0.35, cola: 0.42, nCuello: 0, h: 0.075, ancho: 0.8, cab_: 'ictiosaurio', cuelloR: 0.82, cabFusion: 0.55,
    colaH: [0.72, 0.5, 0.32, 0.2, 0.14, 0.12], colaW: [0.55, 0.38, 0.24, 0.15, 0.1, 0.08],
    dientes: { n: 18, L: 0.025, desde: 0.2, forma: 'pequeno' }, ojo: 1.8,
    aletaD: { largo: 0.15, ancho: 0.06, z: 0.34, y: -0.5, barrido: 0.5, caida: 0.5 }, aletaT: { largo: 0.07, ancho: 0.035, z: -0.4, y: -0.6, barrido: 0.5, caida: 0.5 },
    dorsal: { alto: 0.09, ancho: 0.075, z: 0.05, barrido: 0.55 },
    fluke: { forma: 'lunada', alto: 0.2, c: 0.07, baja: 1.15, barrido: 0.95 },
    nado: { tipo: 'carangiforme', amp: 0.09, paso: 0.75, lag: 0.55 }, vel: [2.4, 9], crucero: 0.4,
  },
  pez_depredador: { // Xiphactinus: cuerpo comprimido, cabeza alta y mandíbula inferior prominente, dorsal retrasada, caudal ahorquillada
    cab: 0.2, cuello: 0.03, tronco: 0.45, cola: 0.34, nCuello: 0, h: 0.065, ancho: 0.55, cab_: 'xifactino', cuelloR: 0.9, cabFusion: 0.5, mandibula: 1.07,
    colaH: [0.55, 0.36, 0.22, 0.15, 0.12, 0.1], colaW: [0.4, 0.28, 0.2, 0.15, 0.12, 0.1],
    dientes: { n: 9, L: 0.14, desde: 0.18, forma: 'colmillo' }, ojo: 1.3,
    aletaD: { largo: 0.09, ancho: 0.04, z: 0.36, y: -0.8, barrido: 0.9, caida: 0.35 }, aletaT: { largo: 0.055, ancho: 0.03, z: -0.15, y: -0.9, barrido: 0.9, caida: 0.35 },
    dorsal: { alto: 0.07, ancho: 0.06, z: -0.22, barrido: 0.5 },
    fluke: { forma: 'horquilla', alto: 0.23, c: 0.06, baja: 1.0, barrido: 0.95 },
    nado: { tipo: 'carangiforme', amp: 0.08, paso: 0.75, lag: 0.5 }, vel: [2.5, 9], crucero: 0.6, respira: null,
  },
  pez_filtrador: { // Leedsichthys: pez óseo gigantesco de boca ancha y sin dientes funcionales, pectorales largas y caudal ahorquillada
    cab: 0.2, cuello: 0.03, tronco: 0.46, cola: 0.33, nCuello: 0, h: 0.07, ancho: 0.6, cab_: 'leedsictis', cuelloR: 0.92, cabFusion: 0.5,
    colaH: [0.58, 0.38, 0.24, 0.16, 0.12, 0.1], colaW: [0.4, 0.28, 0.2, 0.15, 0.12, 0.1],
    dientes: null, ojo: 1.1,
    aletaD: { largo: 0.12, ancho: 0.035, z: 0.3, y: -0.85, barrido: 0.8, caida: 0.35 }, aletaT: { largo: 0.05, ancho: 0.03, z: -0.2, y: -0.9, barrido: 0.9, caida: 0.35 },
    dorsal: { alto: 0.05, ancho: 0.065, z: -0.08, barrido: 0.5 },
    fluke: { forma: 'horquilla', alto: 0.27, c: 0.07, baja: 1.0, barrido: 0.95 },
    nado: { tipo: 'carangiforme', amp: 0.07, paso: 0.6, lag: 0.5 }, vel: [1.2, 3.6], crucero: 0.7, respira: null, prof: [1.2, 5],
  },
};

const mezcla = (A, def, k) => {
  const a = A[k] === undefined ? BASE[k] : A[k], o = def.o?.[k];
  if (o === null) return null;
  if (a === null && o === undefined) return null;
  return { ...(a ?? {}), ...(o ?? {}) };
};

/** Medidas (m) de un acuático: def = {arq, L (longitud total), masa, o}. Datos puros. */
export function medirAcuatico(def) {
  const A = ARQ[def.arq];
  if (!A) throw new Error(`Arquetipo acuático desconocido: ${def.arq}`);
  const d = { ...BASE, ...A, ...(def.o ?? {}) };
  for (const k of ['aletaD', 'aletaT', 'dorsal', 'fluke', 'dientes', 'nado']) d[k] = mezcla(A, def, k);
  const L = def.L, suma = d.cab + d.cuello + d.tronco + d.cola;
  const Lh = (L * d.cab) / suma, Ln = (L * d.cuello) / suma, Lt = (L * d.tronco) / suma, Lc = (L * d.cola) / suma;
  const hT = d.h * L, wT = hT * d.ancho, nN = d.nCuello;
  const Hy = hT * 1.5 + 0.1; // altura del eje del cuerpo sobre el origen del modelo
  const J = { hips: [0, Hy, 0], spine1: [0, Hy, Lt / 2] };
  // cuello: tramos iguales con ángulo de elevación propio
  let pos = J.spine1;
  for (let i = 1; i <= nN + 1; i++) {
    const a = d.cuelloAng[min(i - 1, d.cuelloAng.length - 1)], l = Ln / (nN + 1);
    pos = [0, pos[1] + l * sin(a), pos[2] + l * cos(a)];
    J[i <= nN ? `neck${i}` : 'head'] = pos;
  }
  const cab = CAB[d.cab_];
  if (!cab) throw new Error(`Perfil de cabeza desconocido: ${d.cab_}`);
  const dirH = [cos(d.hp), sin(d.hp)], O = J.head;
  const headPt = (t) => [0, O[1] + t * Lh * dirH[1] + interp(cab.t, cab.dy, t) * Lh, O[2] + t * Lh * dirH[0]];
  const cw = d.cuelloR * wT, ch = d.cuelloR * hT, fus = d.cabFusion;
  const headR = (t) => { // perfil del cráneo; su parte trasera se funde con el cuerpo (peces, ictiosaurios: la cabeza continúa el contorno del tronco)
    const rx = interp(cab.t, cab.rx, t) * Lh * d.cabAncho, ry = interp(cab.t, cab.ry, t) * Lh * d.cabAlto;
    if (fus > 0 && t < fus) { const b = (1 - t / fus) ** 1.6; return [lerp(rx, max(rx, cw), b), lerp(ry, max(ry, ch), b)]; }
    return [rx, ry];
  };
  const tj = headPt(0.15), rj = headR(0.15);
  J.jaw = [0, tj[1] - rj[1] * 0.55, tj[2]];
  // cola: cinco articulaciones repartidas en el 96 % de su longitud; la punta lleva la aleta caudal
  const z0 = -Lt / 2, util = Lc * 0.96;
  for (let k = 1; k <= 5; k++) J[`tail${k}`] = [0, Hy, z0 - (util * (k - 1)) / 5];
  J.tailTip = [0, Hy, z0 - util];
  J.dorsal = d.dorsal ? [0, Hy + hT * 0.8, d.dorsal.z * Lt] : null;
  // aletas pares: raíz, tramo medio y punta de cada una
  const aletas = {};
  for (const [par, A2, bone] of [['F', d.aletaD, 'spine1'], ['H', d.aletaT, 'hips']]) {
    if (!A2) continue;
    const Lf = A2.largo * L, cf = A2.ancho * L;
    const s = [cos(A2.caida) * cos(A2.barrido), -sin(A2.caida), -cos(A2.caida) * sin(A2.barrido)];
    for (const [lado, sx] of [['L', 1], ['R', -1]]) {
      const raiz = [sx * wT * 0.8, Hy + A2.y * hT, A2.z * Lt];
      const P = (f) => [raiz[0] + s[0] * sx * Lf * f, raiz[1] + s[1] * Lf * f, raiz[2] + s[2] * Lf * f];
      aletas[`${par}${lado}`] = { par, lado, sx, Lf, cf, raiz, P, bone, nombre: `fl${par}${lado}` };
    }
  }
  // esferas de impacto (el cuerpo ondula: las de la cola son holgadas)
  const { hit, tramo } = crearHit();
  hit.push([0, Hy, 0, max(hT, wT) * 1.3]);
  const rTr = max(hT, wT);
  tramo(J.tail1, J.hips, rTr * 0.9, rTr, 3);
  tramo(J.hips, J.spine1, rTr, rTr * 0.95, 3);
  const nombresCab = ['spine1', ...Array.from({ length: nN }, (_, i) => `neck${i + 1}`), 'head'];
  cadena(tramo, J, nombresCab, rTr * 0.9, max(0.06, headR(0.1)[1] * 1.1), nN > 2 ? 4 : 2);
  hit.push([0, headPt(0.5)[1], headPt(0.5)[2], max(0.1, headR(0.5)[1] * 1.35)]);
  hit.push([0, headPt(0.85)[1], headPt(0.85)[2], max(0.08, headR(0.85)[1] * 1.6)]);
  const rc = (k) => max(0.1, interp([0, 1, 2, 3, 4, 5], d.colaH, k) * hT * 1.2, 0.035 * L);
  tramo(J.tail1, J.tail3, rc(0), rc(2), 3);
  tramo(J.tail3, J.tailTip, rc(2), rc(5), 3);
  for (const a of Object.values(aletas)) { const m = a.P(0.5); hit.push([m[0], m[1], m[2], max(0.12, a.cf * 0.55)]); }
  const medidas = { d, L, Lh, Ln, Lt, Lc, hT, wT, Hy, nN, J, O, cab, dirH, headPt, headR, cw, ch, aletas, hit };
  const [vw, vr] = d.vel;
  return {
    ...medidas, vel: { walk: vw, run: vr }, hips: Hy, cycle: { walk: 1, run: 1 }, stance: 0.5, step: 0, radius: max(0.5, 0.2 * L),
    nada: { prof: d.prof, alto: hT, minAgua: +(2 * hT + 0.9).toFixed(2), respira: d.respira, crucero: d.crucero, tipo: d.nado.tipo, amp: d.nado.amp, paso: d.nado.paso, lag: d.nado.lag, largo: L, filtra: d.fluke?.forma === 'horquilla' && !d.dientes },
  };
}

/** Esqueleto + malla. Devuelve {geo, sk, legs: [], specs}. */
export function construirAcuatico(P, pal0) {
  const { d, L, Lh, hT, wT, Hy, nN, J, aletas, headPt, headR, cab, cw, ch } = P;
  const V3 = (a) => V(a[0], a[1], a[2]);
  const pal = { ...pal0 };
  const specs = [{ name: 'hips', parent: null, pos: J.hips }, { name: 'spine1', parent: 'hips', pos: J.spine1 }];
  let par = 'spine1';
  for (let i = 1; i <= nN; i++) { specs.push({ name: `neck${i}`, parent: par, pos: J[`neck${i}`] }); par = `neck${i}`; }
  specs.push({ name: 'head', parent: par, pos: J.head }, { name: 'jaw', parent: 'head', pos: J.jaw });
  let pt = 'hips';
  for (let k = 1; k <= 5; k++) { specs.push({ name: `tail${k}`, parent: pt, pos: J[`tail${k}`] }); pt = `tail${k}`; }
  if (d.fluke) specs.push({ name: 'fluke', parent: 'tail5', pos: J.tailTip });
  if (d.dorsal) specs.push({ name: 'dorsal', parent: 'hips', pos: J.dorsal });
  for (const a of Object.values(aletas)) {
    specs.push({ name: `${a.nombre}1`, parent: a.bone, pos: a.raiz }, { name: `${a.nombre}2`, parent: `${a.nombre}1`, pos: a.P(0.5) });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  const neckNames = Array.from({ length: nN }, (_, i) => `neck${i + 1}`);

  // ---- cuerpo: un solo tubo de la punta de la cola al cuello (articulaciones = estaciones; cada tramo pertenece al hueso más cercano al tronco)
  const est = ['tailTip', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'spine1', ...neckNames, 'head'];
  const pts = est.map((n) => V3(J[n]));
  const rx = [], ry = [];
  for (let k = 5; k >= 0; k--) { rx.push(max(0.006, d.colaW[k] * wT)); ry.push(max(0.006, d.colaH[k] * hT)); } // tailTip … tail1
  const w1 = wT * d.hombro, h1 = hT * d.hombro, hr0 = headR(0.04);
  rx.push(wT, w1); ry.push(hT, h1); // hips, spine1
  const geo2 = (a, b, e) => a * Math.pow(max(1e-4, b) / a, e); // sin radio de base propio, el cuello se afina de forma geométrica hacia la cabeza
  for (let k = 1; k <= nN; k++) {
    if (d.cuelloBase != null) { const e = nN > 1 ? (k - 1) / (nN - 1) : 0; rx.push(lerp(d.cuelloBase * wT, cw * 1.25, e)); ry.push(lerp(d.cuelloBase * hT, ch * 1.25, e)); } else { const e = k / (nN + 1); rx.push(geo2(w1, cw, e)); ry.push(geo2(h1, ch, e)); }
  }
  rx.push(max(hr0[0] * 0.97, nN ? 0 : cw * 0.97)); ry.push(max(hr0[1] * 0.97, nN ? 0 : ch * 0.97));
  const owners = ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'hips', 'hips', 'spine1', ...neckNames];
  B.tube({ lateral: true, pts, rx, ry, owners, sides: 12, sub: 3, uscale: 2, vscale: 1.2 });

  // ---- cabeza, mandíbula, ojos, dientes
  const ts = cab.t;
  B.tube({ lateral: true, pts: ts.map((t) => V3(headPt(t))), rx: ts.map((t) => headR(t)[0]), ry: ts.map((t) => headR(t)[1]), owners: 'head', sides: 10, sub: 2, uscale: 2, vscale: 1 });
  const jt = [0.15, 0.4, 0.7, 1.0].map((t) => t * (t > 0.9 ? d.mandibula : 1));
  const jpts = jt.map((t) => { const tt = min(1, t), p = headPt(tt), r = headR(tt); return V(0, p[1] - r[1] * 0.88, p[2] + (t > 1 ? (t - 1) * Lh : 0)); });
  B.tube({ lateral: true, pts: jpts, rx: jt.map((t) => headR(min(1, t))[0] * 0.62), ry: jt.map((t) => max(0.006, headR(min(1, t))[1] * 0.42)), owners: 'jaw', sides: 8, sub: 2, uscale: 2, vscale: 1 });
  const e = headPt(d.ojoT), er = headR(d.ojoT), rojo = max(0.01, Lh * 0.034 * d.ojo);
  for (const sx of [1, -1]) B.blob(V(er[0] * (d.ojo > 2 ? 0.72 : 0.9) * sx, e[1] + er[1] * 0.28, e[2]), rojo * 0.8, rojo, rojo, 'head', PART.ojo, 8);
  if (d.dientes) {
    const D = d.dientes, dl = D.L * Lh, rr = D.forma === 'pequeno' ? 0.0035 * L : max(0.004, dl * 0.14);
    for (let i = 0; i < D.n; i++) {
      const t = lerp(D.desde, 0.97, i / max(1, D.n - 1)), p = headPt(t), r = headR(t);
      for (const sx of [1, -1]) {
        B.spike(V(r[0] * 0.78 * sx, p[1] - r[1] * 0.6, p[2]), V(r[0] * 0.8 * sx, p[1] - r[1] * 0.6 - dl, p[2] + dl * 0.2), rr, 'head', PART.diente, { sides: 4 });
        if (D.forma === 'colmillo' || D.forma === 'conico') { // dientes de la mandíbula inferior, apuntando hacia arriba
          const pj = headPt(min(1, t * 0.98)), rj2 = headR(min(1, t * 0.98)), yb = pj[1] - rj2[1] * 0.88 + rj2[1] * 0.38 * 0.8;
          B.spike(V(rj2[0] * 0.55 * sx, yb, pj[2]), V(rj2[0] * 0.58 * sx, yb + dl * 0.85, pj[2] + dl * 0.15), rr * 0.9, 'jaw', PART.diente, { sides: 4 });
        }
      }
    }
  }

  // ---- aletas pares
  const th = (c) => max(0.012, c * 0.09);
  for (const a of Object.values(aletas)) {
    const f5 = [0, 0.25, 0.5, 0.75, 1], chord = (f) => interp([0, 0.3, 0.65, 1], [0.8, 1.0, 0.82, 0.22], f) * a.cf;
    const lead = f5.map((f) => { const p = a.P(f); return V(p[0], p[1], p[2] + 0.35 * chord(f)); });
    const trail = f5.map((f) => { const p = a.P(f); return V(p[0], p[1], p[2] - 0.65 * chord(f)); });
    B.sheet({ lead, trail, owners: [`${a.nombre}1`, `${a.nombre}1`, `${a.nombre}2`, `${a.nombre}2`], th: th(a.cf), eje: 'y', curva: 0.03, sub: 3, filas: 4, part: PART.membrana, uscale: 1, vscale: 0.5 });
  }
  // ---- aleta dorsal (lámina vertical triangular y algo falcada)
  if (d.dorsal) {
    const D = d.dorsal, Hd = D.alto * L, cd = D.ancho * L, y0 = Hy + hT * 0.72, z0 = J.dorsal[2];
    const A = [0, y0, z0 + cd * 0.5], Bp = [0, y0, z0 - cd * 0.5], T = [0, y0 + Hd, z0 - Hd * tan(D.barrido) * 0.6 - cd * 0.05];
    const mid = (p, q, dz) => [0, lerp(p[1], q[1], 0.5), lerp(p[2], q[2], 0.5) + dz];
    B.sheet({ lead: [V3(A), V3(mid(A, T, cd * 0.08)), V3(T)], trail: [V3(Bp), V3(mid(Bp, T, cd * 0.14)), V3(T)], owners: ['dorsal', 'dorsal'], th: th(cd * 0.7), eje: 'x', sub: 3, filas: 4, part: PART.membrana, uscale: 1, vscale: 0.5 });
  }
  // ---- aleta caudal: dos lóbulos (el inferior, mayor en ictiosaurios y mosasaurios) hacia arriba y hacia abajo del extremo de la cola
  if (d.fluke) {
    const F = d.fluke, c = F.c * L, Hu = (F.alto * L) / (1 + F.baja), Hl = Hu * F.baja, zr = J.tailTip[2], yr = J.tailTip[1];
    for (const [sg, H] of [[1, Hu], [-1, Hl]]) {
      if (H < 0.02) continue;
      const bw = H * F.barrido;
      const lead = [V(0, yr + sg * 0.04 * H, zr + c * 0.55), V(0, yr + sg * 0.5 * H, zr + c * 0.3 - bw * 0.22), V(0, yr + sg * H, zr - bw)];
      const trail = [V(0, yr + sg * 0.04 * H, zr - c * 0.45), V(0, yr + sg * 0.5 * H, zr - c * 0.2 - bw * 0.5), V(0, yr + sg * H, zr - bw - c * 0.05)];
      B.sheet({ lead, trail, owners: ['fluke', 'fluke'], th: th(c), eje: 'x', curva: 0, sub: 3, filas: 4, part: PART.membrana, uscale: 1, vscale: 0.5 });
    }
  }
  pal.aoY = pal.aoY ?? Hy * 0.5;
  const geo = B.finish(colorizer(pal));
  return { geo, sk, legs: [], specs };
}
