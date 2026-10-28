// GENERADOR DE PTEROSAURIOS — esqueleto volador + malla procedural paramétrica.
// Todas las proporciones son fracciones de la envergadura `b` (m). Cada arquetipo (azdárquido, ramforrincoideo, tapejárido…) fija cuello, cabeza, cola, cresta, dientes y
// forma del ala; cada especie lo ajusta con `o`. Esqueleto compatible con `Creature.applyFlight`: hips, spine1, neck1[, neck2], head, jaw, tail[, tail2],
// sh/el/wr/fg × L|R (hombro, codo, muñeca, mitad del dedo alar) y legU × L|R. Las membranas son láminas finas (`SkinBuilder.sheet`) ancladas al brazo, al dedo alar y al tobillo.
// Solo es una reconstrucción de proporciones: la forma exacta de cada cresta, el color y la orientación de la membrana de la cola son hipótesis (ver `conf` de cada fila).
import * as THREE from 'three';
import { SkinBuilder, makeSkeleton, PART, V } from '../builder.js';
import { colorizer } from '../color.js';
import { crearHit, cadena } from './hit.js';

const { sin, cos, sqrt, max, min, PI } = Math;
const clamp = (v, a, b) => min(b, max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function interp(ts, arr, t) {
  if (t <= ts[0]) return arr[0];
  for (let i = 1; i < ts.length; i++) if (t <= ts[i]) return lerp(arr[i - 1], arr[i], (t - ts[i - 1]) / (ts[i] - ts[i - 1]));
  return arr[arr.length - 1];
}

// Perfiles de cráneo (t a lo largo; rx semianchura, ry semialtura: fracción de la longitud de la cabeza; dy desvío vertical del eje)
const CAB = {
  pico: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.075, 0.07, 0.04, 0.025, 0.012], ry: [0.085, 0.075, 0.04, 0.025, 0.012], dy: [0, 0.01, 0, -0.01, -0.02] }, // pico largo y fino sin dientes (pteranodon)
  azdarquido: { t: [0, 0.15, 0.5, 0.85, 1], rx: [0.05, 0.05, 0.028, 0.017, 0.01], ry: [0.06, 0.055, 0.026, 0.016, 0.009], dy: [0, 0, 0, -0.005, -0.01] }, // pico lanzado, recto y muy largo
  ramforrinco: { t: [0, 0.25, 0.55, 0.85, 1], rx: [0.09, 0.09, 0.06, 0.04, 0.025], ry: [0.11, 0.1, 0.06, 0.04, 0.03], dy: [0, 0, -0.01, -0.02, -0.03] }, // hocico corto y profundo, dientes agudos
  ptero: { t: [0, 0.22, 0.55, 0.85, 1], rx: [0.08, 0.075, 0.045, 0.03, 0.02], ry: [0.1, 0.085, 0.045, 0.03, 0.02], dy: [0, 0, 0, -0.01, -0.02] }, // cabeza larga y estrecha, dientes finos
  dimorfo: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.12, 0.14, 0.12, 0.09, 0.05], ry: [0.17, 0.2, 0.17, 0.12, 0.08], dy: [0, 0.02, 0, -0.03, -0.05] }, // cabeza grande y alta, hocico romo
  tapejara: { t: [0, 0.2, 0.5, 0.8, 1], rx: [0.09, 0.1, 0.08, 0.05, 0.03], ry: [0.12, 0.15, 0.12, 0.08, 0.05], dy: [0, 0.01, -0.02, -0.04, -0.06] }, // pico corto y corvo, sin dientes
  ornitoqueiro: { t: [0, 0.2, 0.5, 0.75, 0.9, 1], rx: [0.06, 0.055, 0.035, 0.03, 0.06, 0.07], ry: [0.07, 0.065, 0.035, 0.028, 0.045, 0.05], dy: [0, 0, 0, 0, -0.005, -0.01] }, // hocico fino que acaba en una roseta ensanchada
};

const BASE = {
  cuerpo: 0.16, cuello: 0.1, cabeza: 0.2, cola: 0.04, nCuello: 1, bh: 1, ancho: 0.95, cuelloGrosor: 1, colaGrosor: 1, cab: 'pico', cabAlto: 1, cabAncho: 1, hp: -0.14,
  cuelloAng: [0.5, 0.25], ala: [0.2, 0.012], barrido: 0.2, diedro: 0.03, dedoMed: 0.5, pata: 0.1, dientes: 0, dienteL: 0.05, dienteDesde: 0.4, ojo: 1, pico: false, cresta: null,
  vane: null, garras: 3, vel: 11, orbita: [60, 110], alt: [45, 85], aleteo: 7.5, plano: 0.9,
};

export const ARQ = {
  pteranodontoideo: { cuerpo: 0.17, cuello: 0.11, cabeza: 0.26, cola: 0.035, cab: 'pico', cuelloAng: [0.4, 0.15], ala: [0.2, 0.01], barrido: 0.2, cresta: { forma: 'cuchilla', alto: 0.25, t0: 0.15, t1: -0.55 } },
  azdarquido: { cuerpo: 0.1, cuello: 0.3, cabeza: 0.27, cola: 0.0, nCuello: 2, cab: 'azdarquido', cuelloAng: [0.35, 0.1, 0.05], hp: -0.1, ala: [0.17, 0.01], barrido: 0.12, pata: 0.14, cuelloGrosor: 0.8, bh: 0.9, vel: 18, orbita: [120, 220], alt: [100, 170], aleteo: 3.6, plano: 0.97, cresta: { forma: 'cuchilla', alto: 0.05, t0: 0.12, t1: -0.05 } },
  ramforrincoideo: { cuerpo: 0.16, cuello: 0.07, cabeza: 0.16, cola: 0.55, cab: 'ramforrinco', cuelloAng: [0.3, 0.1], ala: [0.2, 0.014], barrido: 0.16, dientes: 10, dienteL: 0.09, dienteDesde: 0.28, vel: 8, orbita: [30, 60], alt: [8, 30], aleteo: 11, plano: 0.45, colaGrosor: 0.55, vane: { largo: 0.1, ancho: 0.05 } },
  pterodactiloideo: { cuerpo: 0.13, cuello: 0.14, cabeza: 0.21, cola: 0.045, cab: 'ptero', cuelloAng: [0.5, 0.2], ala: [0.18, 0.012], barrido: 0.15, dientes: 14, dienteL: 0.05, dienteDesde: 0.25, vel: 7, orbita: [25, 55], alt: [6, 25], aleteo: 12, plano: 0.5 },
  dimorfodontido: { cuerpo: 0.2, cuello: 0.07, cabeza: 0.2, cola: 0.62, cab: 'dimorfo', cuelloAng: [0.25, 0.05], ala: [0.25, 0.02], barrido: 0.08, dientes: 8, dienteL: 0.08, dienteDesde: 0.3, vel: 7, orbita: [25, 50], alt: [5, 20], aleteo: 13, plano: 0.3, colaGrosor: 0.65, bh: 1.15, cabAlto: 1.1 },
  tapejarido: { cuerpo: 0.17, cuello: 0.1, cabeza: 0.22, cola: 0.04, cab: 'tapejara', cuelloAng: [0.4, 0.2], ala: [0.2, 0.012], barrido: 0.14, vel: 9, orbita: [40, 80], alt: [20, 55], aleteo: 9,
    cresta: { forma: 'vela', alto: 0.55, t0: 0.92, t1: -0.3, pico: 0.38, sesgo: 0.5 } },
  tupandactilo: { cuerpo: 0.17, cuello: 0.1, cabeza: 0.2, cola: 0.04, cab: 'tapejara', cuelloAng: [0.4, 0.2], ala: [0.2, 0.012], barrido: 0.14, vel: 9, orbita: [40, 80], alt: [20, 55], aleteo: 9,
    cresta: { forma: 'vela', alto: 1.3, t0: 0.9, t1: -0.5, pico: 0.3, sesgo: 0.6, espiga: true } },
  ornitoqueirido: { cuerpo: 0.15, cuello: 0.14, cabeza: 0.28, cola: 0.04, cab: 'ornitoqueiro', cuelloAng: [0.45, 0.15], ala: [0.18, 0.011], barrido: 0.16, dientes: 16, dienteL: 0.05, dienteDesde: 0.22, vel: 12, orbita: [70, 130], alt: [30, 70], aleteo: 6, plano: 0.85,
    cresta: { forma: 'quilla', alto: 0.05, largo: 0.3, t0: 0.72, t1: 1.0, doble: true } },
};

/** Medidas (m) de un pterosaurio: def = {arq, L (envergadura), masa, o}. Datos puros. */
export function medirPterosaurio(def) {
  const A = ARQ[def.arq];
  if (!A) throw new Error(`Arquetipo de pterosaurio desconocido: ${def.arq}`);
  const d = { ...BASE, ...A, ...(def.o ?? {}) };
  const b = def.L, s = b / 2;
  const Lt = d.cuerpo * b, Ln = d.cuello * b, Lh = d.cabeza * b, Lc = d.cola * b;
  const bh = max(0.02, 0.028 * b * d.bh), bw = bh * d.ancho;
  const J = {};
  J.hips = [0, 0, 0];
  J.spine1 = [0, 0.05 * bh, 0.5 * Lt];
  // cuello: tramos con ángulo de elevación propio
  const nN = d.nCuello, tr = nN === 2 ? [0.5, 0.5] : [1];
  let pos = J.spine1;
  const spineEnd = [0, J.spine1[1] + 0.05 * bh, 0.5 * Lt + 0.18 * Lt];
  pos = spineEnd;
  for (let i = 0; i <= nN; i++) {
    const a = d.cuelloAng[i] ?? d.cuelloAng[d.cuelloAng.length - 1], l = i < nN ? Ln * tr[i] : 0.0;
    pos = [0, pos[1] + l * sin(a), pos[2] + l * cos(a)];
    J[i < nN ? `neck${i + 1}` : 'head'] = pos;
  }
  const cab = CAB[d.cab];
  if (!cab) throw new Error(`Perfil de cabeza desconocido: ${d.cab}`);
  const dirH = [cos(d.hp), sin(d.hp)];
  const O = [0, J.head[1], J.head[2]];
  const headPt = (t) => [0, O[1] + t * Lh * dirH[1] + interp(cab.t, cab.dy, t) * Lh, O[2] + t * Lh * dirH[0]];
  const headR = (t) => [interp(cab.t, cab.rx, t) * Lh * d.cabAncho, interp(cab.t, cab.ry, t) * Lh * d.cabAlto];
  J.jaw = [0, headPt(0.25)[1] - headR(0.25)[1] * 0.6, headPt(0.25)[2]];
  // cola
  J.tail = [0, -0.02 * bh, -0.35 * Lt];
  J.tail2 = [0, -0.02 * bh, -0.35 * Lt - Lc * 0.5];
  J.tailTip = [0, -0.02 * bh, -0.35 * Lt - Lc];
  // ala (por lado): hombro, codo, muñeca, mitad del dedo alar y punta (borde de ataque) + borde de fuga recto del tobillo a la punta
  const x0 = bw * 0.9, xT = s, zS = 0.42 * Lt, yS = 0.35 * bh;
  const fx = (f) => x0 + f * (xT - x0);
  const lead = [
    [fx(0), yS, zS], [fx(0.22), yS + d.diedro * (xT - x0) * 0.22, zS - 0.25 * d.barrido * s], [fx(0.42), yS + d.diedro * (xT - x0) * 0.42, zS - 0.55 * d.barrido * s * 0.8],
    [fx(0.71), yS + d.diedro * (xT - x0) * 0.71, zS - 0.8 * d.barrido * s], [fx(1), yS + d.diedro * (xT - x0), zS - d.barrido * s],
  ];
  const cRoot = d.ala[0] * s, cTip = max(0.01, d.ala[1] * b);
  const tA = [x0 * 1.05, -0.08 * bh, zS - cRoot], tT = [fx(1), lead[4][1], lead[4][2] - cTip];
  const trail = [tA, ...[0.22, 0.42, 0.71].map((f) => [fx(f) * 1.0, lerp(tA[1], tT[1], f), lerp(tA[2], tT[2], f)]), tT];
  const alaChord = lead.map((p, i) => Math.abs(p[2] - trail[i][2]));
  // patas traseras (pequeñas, cuelgan bajo la membrana)
  const legL = d.pata * b * 0.8;
  // esferas de impacto: tronco, cuello, cabeza, cola y las dos alas a lo largo de la envergadura
  const { hit, tramo } = crearHit();
  hit.push([0, 0.05 * bh, 0.1 * Lt, max(0.15, bh * 1.4)]);
  tramo(J.hips, J.spine1, bh * 1.2, bh * 1.3, 2);
  cadena(tramo, J, ['spine1', ...Array.from({ length: nN }, (_, i) => `neck${i + 1}`), 'head'], bh * 0.5 * d.cuelloGrosor, max(0.05, headR(0.1)[1]), 3);
  hit.push([0, headPt(0.6)[1], headPt(0.6)[2], max(0.1, Lh * 0.34)]);
  if (Lc > 0.25 * b) tramo(J.tail, J.tailTip, bh * 0.4, bh * 0.15, 3);
  for (const sx of [1, -1]) for (let i = 0; i < lead.length - 1; i++) {
    const a = lead[i], c = lead[i + 1], ca = alaChord[i] * 0.5, cc = alaChord[i + 1] * 0.5;
    tramo([a[0] * sx, a[1], a[2] - ca], [c[0] * sx, c[1], c[2] - cc], max(0.06, ca * 0.8, 0.045 * s), max(0.06, cc * 0.8, 0.045 * s), 2); // el ala se inclina al virar: esferas holgadas en la punta
  }
  const vel = { walk: d.vel, run: d.vel * 1.3 };
  return { d, b, s, Lt, Ln, Lh, Lc, bh, bw, J, O, cab, dirH, headPt, headR, lead, trail, alaChord, x0, legL, hit, vel, hips: 0, cycle: { walk: 1, run: 1 }, stance: 0.5, step: 0, radius: max(0.6, 0.12 * b), nN };
}

/** Esqueleto + malla. Devuelve {geo, sk, legs: [], specs}. */
export function construirPterosaurio(P, pal0) {
  const { d, b, s, Lt, Lh, Lc, bh, bw, J, lead, trail, x0, legL, headPt, headR, nN } = P;
  const V3 = (a) => V(a[0], a[1], a[2]);
  const pal = { ...pal0 };
  const specs = [
    { name: 'hips', parent: null, pos: J.hips }, { name: 'spine1', parent: 'hips', pos: J.spine1 },
  ];
  let par = 'spine1';
  for (let i = 1; i <= nN; i++) { specs.push({ name: `neck${i}`, parent: par, pos: J[`neck${i}`] }); par = `neck${i}`; }
  specs.push({ name: 'head', parent: par, pos: J.head }, { name: 'jaw', parent: 'head', pos: J.jaw });
  specs.push({ name: 'tail', parent: 'hips', pos: J.tail });
  const largaCola = Lc > 0.25 * b;
  if (largaCola) specs.push({ name: 'tail2', parent: 'tail', pos: J.tail2 });
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const p = (i) => [lead[i][0] * sx, lead[i][1], lead[i][2]];
    specs.push({ name: `sh${side}`, parent: 'spine1', pos: p(0) }, { name: `el${side}`, parent: `sh${side}`, pos: p(1) }, { name: `wr${side}`, parent: `el${side}`, pos: p(2) }, { name: `fg${side}`, parent: `wr${side}`, pos: p(3) });
    specs.push({ name: `legU${side}`, parent: 'hips', pos: [bw * 0.7 * sx, -0.1 * bh, -0.1 * Lt] });
  }
  const sk = makeSkeleton(specs);
  const B = new SkinBuilder(sk.index);
  const neckNames = Array.from({ length: nN }, (_, i) => `neck${i + 1}`);

  // ---- tronco, cuello y cola: un tubo
  const names = ['tail', 'hips', 'spine1', ...neckNames, 'head'];
  const body = [V3(J.tail), V3(J.hips), V3(J.spine1), ...neckNames.map((n) => V3(J[n])), V3(J.head)];
  const hr0 = headR(0.06);
  const baseR = d.cuelloGrosor * bh * 0.5;
  const ryS = [bh * 0.35 * d.colaGrosor, bh * 0.8, bh * 1.15], rxS = [bw * 0.35 * d.colaGrosor, bw * 0.8, bw * 1.1];
  for (let k = 0; k < nN; k++) { const e = (k + 1) / (nN + 1); ryS.push(lerp(baseR * 1.3, hr0[1] * 1.05, e)); rxS.push(lerp(baseR * 1.2, hr0[0] * 1.05, e)); }
  ryS.push(hr0[1] * 0.95); rxS.push(hr0[0] * 0.95);
  const owners = ['tail', 'hips', 'spine1', ...neckNames];
  B.tube({ lateral: true, pts: body, rx: rxS, ry: ryS, owners, sides: 10, sub: 2, uscale: 2, vscale: 1.2 });
  // cola larga: varilla fina (la rigidizan los huesos alargados) con paleta en el extremo
  if (largaCola) {
    const t0 = V3(J.tail), t1 = V3(J.tail2), t2 = V3(J.tailTip), rc = max(0.006, bh * 0.2 * d.colaGrosor);
    B.tube({ lateral: true, pts: [t0, t1, t2], rx: [rc * 1.6, rc, rc * 0.5], ry: [rc * 1.6, rc, rc * 0.5], owners: ['tail', 'tail2'], sides: 6, sub: 3, uscale: 1, vscale: 1 });
    if (d.vane) { // paleta en forma de rombo (su orientación vertical/horizontal es discutida: se modela vertical)
      const vl = d.vane.largo * b, va = d.vane.ancho * b, z1 = J.tailTip[2];
      B.sheet({ lead: [V(0, J.tailTip[1] + va * 0.5, z1 + vl * 0.05), V(0, J.tailTip[1] + va * 0.5, z1 - vl * 0.3), V(0, J.tailTip[1], z1 - vl * 0.6)], trail: [V(0, J.tailTip[1], z1 + vl * 0.3), V(0, J.tailTip[1] - va * 0.5, z1 - vl * 0.3), V(0, J.tailTip[1], z1 - vl * 0.6)], owners: ['tail2', 'tail2'], th: 0.01, eje: 'x', sub: 2, filas: 3 });
    }
  }

  // ---- cabeza, mandíbula, ojos, dientes
  const hp = P.headPt, hr = P.headR;
  const ts = P.cab.t;
  B.tube({ lateral: true, pts: ts.map((t) => V3(hp(t))), rx: ts.map((t) => hr(t)[0]), ry: ts.map((t) => hr(t)[1]), owners: 'head', sides: 10, sub: 2, uscale: 2, vscale: 1 });
  const jt = [0.25, 0.55, 0.85, 1.0];
  B.tube({ lateral: true, pts: jt.map((t) => { const p = hp(t), r = hr(t); return V(0, p[1] - r[1] * 0.85, p[2] - (t === 1 ? 0.01 * Lh : 0)); }), rx: jt.map((t) => hr(t)[0] * 0.55), ry: jt.map((t) => max(0.004, hr(t)[1] * 0.38)), owners: 'jaw', sides: 6, sub: 2, uscale: 2, vscale: 1 });
  const e = hp(0.3), er = hr(0.3);
  for (const sx of [1, -1]) B.blob(V(er[0] * 0.92 * sx, e[1] + er[1] * 0.25, e[2]), max(0.008, Lh * 0.022 * d.ojo), max(0.008, Lh * 0.026 * d.ojo), max(0.008, Lh * 0.026 * d.ojo), 'head', PART.ojo, 8);
  if (d.dientes > 0) {
    const n = d.dientes, dl = d.dienteL * Lh;
    for (let i = 0; i < n; i++) {
      const t = lerp(d.dienteDesde, 0.97, i / max(1, n - 1)), p = hp(t), r = hr(t), lado = [1, -1];
      for (const sx of lado) {
        B.spike(V(r[0] * 0.8 * sx, p[1] - r[1] * 0.55, p[2]), V(r[0] * 0.85 * sx, p[1] - r[1] * 0.55 - dl, p[2] + dl * 0.15), max(0.003, dl * 0.13), 'head', PART.diente, { sides: 4 });
      }
    }
  }
  // ---- cresta (de hueso y tejido blando): una lámina fina en el plano medio, anclada a la cabeza
  if (d.cresta) {
    const c = d.cresta, alto = c.alto * Lh, n = 9;
    const kp = Math.log(0.5) / Math.log(clamp(c.pico ?? 0.5, 0.1, 0.9)); // exponente que coloca el máximo de la vela en `pico`
    const base = [], top = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), t = lerp(c.t0, c.t1, u), p = hp(clamp(t, -0.8, 1.2)), r = hr(clamp(t, 0, 1));
      const yb = p[1] + r[1] * 0.45;
      const h = c.forma === 'cuchilla' ? alto * (0.2 + 0.8 * u) ** 1.2 * (1 - 0.25 * u) : alto * (sin(PI * clamp(u ** kp, 0, 1)) ** 0.75 + 0.04);
      base.push(V(0, yb, p[2]));
      top.push(V(0, yb + h * (c.forma === 'cuchilla' ? 0.55 : 1), p[2] - (c.forma === 'cuchilla' ? alto * 0.4 * u : (c.sesgo ?? 0) * h * 0.6)));
    }
    B.sheet({ lead: top, trail: base, owners: new Array(n - 1).fill('head'), th: max(0.006, Lh * 0.02), eje: 'x', sub: 2, filas: 3, part: PART.cresta });
    if (c.doble) { // quilla inferior (roseta de los ornitoqueíridos)
      const base2 = [], bot = [];
      for (let i = 0; i < 5; i++) { const u = i / 4, t = lerp(c.t0, c.t1, u), p = hp(t), r = hr(t), h = alto * (sin(PI * u) ** 0.7 + 0.05) * 1.2; base2.push(V(0, p[1] - r[1] * 0.8, p[2])); bot.push(V(0, p[1] - r[1] * 0.8 - h, p[2])); }
      B.sheet({ lead: base2, trail: bot, owners: ['jaw', 'jaw', 'jaw', 'jaw'], th: max(0.006, Lh * 0.02), eje: 'x', sub: 2, filas: 3, part: PART.cresta });
    }
    if (c.espiga) { // varilla ósea del borde anterior que sostiene la vela (Tupandactylus)
      const a = top[1], b2 = top[2], r0 = Lh * 0.012;
      B.tube({ lateral: true, pts: [base[0], a, V(0, b2.y + (b2.y - a.y) * 0.4, b2.z + (b2.z - a.z) * 0.4)], rx: [r0 * 1.2, r0, r0 * 0.5], ry: [r0 * 1.2, r0, r0 * 0.5], owners: 'head', sides: 5, sub: 2, part: PART.cuerno, uscale: 1, vscale: 1 });
    }
  }

  // ---- alas
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const L = lead.map((p) => V(p[0] * sx, p[1], p[2])), T = trail.map((p) => V(p[0] * sx, p[1], p[2]));
    // membrana (curvada ligeramente hacia abajo = perfil alar)
    B.sheet({ lead: L, trail: T, owners: [`sh${side}`, `el${side}`, `wr${side}`, `fg${side}`], th: 0.008 * max(1, b / 3), eje: 'y', curva: -0.05, sub: 4, filas: 5, part: PART.membrana, uscale: 1, vscale: 0.3 });
    // brazo y dedo alar (borde de ataque)
    const ar = max(0.012, 0.012 * b * (b > 6 ? 1.2 : 1));
    B.tube({ lateral: true, pts: L, rx: [ar * 1.4, ar * 1.0, ar * 0.9, ar * 0.5, ar * 0.2], ry: [ar * 1.3, ar * 1.0, ar * 0.9, ar * 0.5, ar * 0.2], owners: [`sh${side}`, `el${side}`, `wr${side}`, `fg${side}`], sides: 6, sub: 3, uscale: 1, vscale: 0.5 });
    // garras de la mano (tres dedos libres), cerca de la muñeca
    for (let i = 0; i < d.garras; i++) { const w = lead[2], gl = max(0.02, ar * 3.2); B.spike(V(w[0] * sx, w[1] - ar * 0.4, w[2] + ar * 0.5 * i), V(w[0] * sx - 0.4 * sx * gl, w[1] - gl * 0.8, w[2] + gl * (0.9 + 0.2 * i)), max(0.003, ar * 0.25), `wr${side}`, PART.garra, { sides: 4 }); }
    // pata trasera
    const hy = -0.1 * bh;
    B.tube({ lateral: true, pts: [V(bw * 0.7 * sx, hy, -0.1 * Lt), V(bw * 0.8 * sx, hy - legL * 0.55, -0.2 * Lt - legL * 0.25), V(bw * 0.8 * sx, hy - legL, -0.25 * Lt - legL * 0.55)], rx: [bh * 0.34, bh * 0.2, bh * 0.1], ry: [bh * 0.34, bh * 0.2, bh * 0.1], owners: `legU${side}`, sides: 6, sub: 2, uscale: 1, vscale: 1 });
  }
  const geo = B.finish(colorizer(pal));
  return { geo, sk, legs: [], specs };
}

void THREE;
