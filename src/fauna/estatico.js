// MODELOS ESTÁTICOS (GLB sin esqueleto) acoplados al esqueleto procedural de la especie.
//
// Un generador de 3D (p. ej. texto→3D) entrega una malla coloreada pero SIN huesos ni animación. Aquí esa malla se usa como PIEL de un esqueleto
// que el juego ya sabe mover (IK de patas, cola, cuello, mandíbula: ver `Creature`), de modo que nada de la IA, el movimiento ni las habilidades cambia.
//   · `*.rig.json` (junto al GLB): posición de las articulaciones en unidades del modelo, colocadas sobre la propia malla y comprobadas a ojo.
//   · pesos de piel: por distancia a los segmentos de cada hueso, con reglas de lado y de altura para que un muslo no arrastre el flanco.
//   · la mandíbula se separa por la línea de la boca del modelo; si el modelo no la trae abierta/marcada, se deja fija (no se inventa).
// Todo se calcula UNA vez por especie al cargar (nunca se guarda un modelo procesado: el archivo original queda intacto) y se comparte entre ejemplares.
// Si algo falla (archivo ausente, rig incoherente), la especie conserva su malla procedural y el juego sigue.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { geometria } from './malla.js';
import { makeSkeleton } from './builder.js';
import { POR_ID } from './catalogo.js';
import { pesosGenerales, gruposImpacto, extraerTexturizada, geometriaTexturizada, anclaSobreLomo } from './autorig.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Ritmo de marcha (ciclo y altura de paso) a partir de la altura de cadera H (m): mismas fórmulas que `medirBipedo`. */
export function ritmoDeMarcha(H) {
  const rw = clamp(1.6 - 0.1 * H, 1.3, 1.7), rr = clamp(3.6 - 0.35 * H, 2.2, 3.7);
  return { cycle: { walk: rw * H, run: rr * H }, step: 0.13 * H };
}

// ---------------------------------------------------------------------------------------------------------------- malla
/** Une las mallas del GLB en una sola lista de vértices en espacio de modelo (matrices de nodo aplicadas) con color lineal. */
function extraerMalla(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const pos = [], col = [], tri = [], v = new THREE.Vector3(), c = new THREE.Color();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, C = g.attributes.color, b0 = pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
      if (C) { c.setRGB(C.getX(i), C.getY(i), C.getZ(i), THREE.SRGBColorSpace); col.push(c.r, c.g, c.b); } else col.push(0.5, 0.5, 0.5); // COLOR_0 viene en sRGB: se pasa al espacio lineal de trabajo
    }
    const n = g.index ? g.index.count : P.count;
    for (let i = 0; i < n; i += 3) tri.push(b0 + (g.index ? g.index.getX(i) : i), b0 + (g.index ? g.index.getX(i + 1) : i + 1), b0 + (g.index ? g.index.getX(i + 2) : i + 2));
  });
  if (!pos.length) throw new Error('el GLB no contiene mallas');
  return { pos, col, tri };
}

// ---------------------------------------------------------------------------------------------------------------- esqueleto
/** Huesos (mismos nombres y jerarquía que los bípedos procedurales) con posiciones de reposo; `k` escala del modelo a metros. */
export function esqueletoDeRig(rig, k) {
  const S = (a) => [a[0] * k, a[1] * k, a[2] * k], m = rig.mediana, J = {};
  for (const n of Object.keys(m)) J[n] = S(m[n]);
  const specs = [
    { name: 'hips', parent: null, pos: J.hips }, { name: 'spine1', parent: 'hips', pos: J.spine1 }, { name: 'spine2', parent: 'spine1', pos: J.spine2 },
    { name: 'neck1', parent: 'spine2', pos: J.neck1 }, { name: 'neck2', parent: 'neck1', pos: J.neck2 }, { name: 'head', parent: 'neck2', pos: J.head }, { name: 'jaw', parent: 'head', pos: S(rig.mandibula.pivote) },
    { name: 'tail1', parent: 'hips', pos: J.tail1 }, { name: 'tail2', parent: 'tail1', pos: J.tail2 }, { name: 'tail3', parent: 'tail2', pos: J.tail3 }, { name: 'tail4', parent: 'tail3', pos: J.tail4 }, { name: 'tail5', parent: 'tail4', pos: J.tail5 },
  ];
  const p = rig.pata, a = rig.brazo, legs = [];
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const X = (yz, x) => S([x * sx, yz[0], yz[1]]);
    specs.push({ name: `thigh${side}`, parent: 'hips', pos: X(p.cadera, p.x) }, { name: `shin${side}`, parent: `thigh${side}`, pos: X(p.rodilla, p.x) }, { name: `foot${side}`, parent: `shin${side}`, pos: X(p.tobillo, p.x) });
    if (a) specs.push({ name: `arm${side}`, parent: 'spine2', pos: X(a.hombro, a.x) }, { name: `forearm${side}`, parent: `arm${side}`, pos: X(a.codo, a.x) });
    legs.push({ name: side, thigh: `thigh${side}`, shin: `shin${side}`, foot: `foot${side}`, phase: side === 'L' ? 0 : 0.5, bendFwd: true, toe: new THREE.Vector3(...X(p.punta, p.x)) });
  }
  return { specs, legs, J };
}

// ---------------------------------------------------------------------------------------------------------------- pesos de piel
function distSeg(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz || 1e-9;
  const t = clamp(((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2, 0, 1);
  return Math.hypot(x - (a[0] + bx * t), y - (a[1] + by * t), z - (a[2] + bz * t));
}

/**
 * Pesos de piel por vértice (en unidades del modelo), en dos sistemas que se mezclan de forma continua:
 *   · CUERPO (caderas, columna, cuello, cabeza, cola, brazos): cada hueso posee desde su articulación hasta la siguiente (como en la malla
 *     procedural) y reparte su influencia según la distancia a su segmento; los huesos a menos de `mezcla` del más cercano participan.
 *   · PATA de cada lado (muslo, pierna, pie): igual, entre los tres huesos de esa pata.
 * El factor `lambda` (0 = cuerpo, 1 = pata) crece de forma suave al bajar de la cadera y al alejarse de la línea media: el muslo se funde con
 * el flanco en una banda ancha en vez de saltar de un hueso a otro (un salto brusco estira los triángulos cuando el muslo gira).
 */
export function pesosDePiel(pos, rig, indice, mezcla = 0.035) {
  const m = rig.mediana, p = rig.pata, a = rig.brazo, cuerpo = [], patas = { L: [], R: [] };
  const J = (n) => m[n];
  const cad = (sx) => [p.x * sx, p.cadera[0], p.cadera[1]], rod = (sx) => [p.x * sx, p.rodilla[0], p.rodilla[1]], tob = (sx) => [p.x * sx, p.tobillo[0], p.tobillo[1]], pun = (sx) => [p.x * sx, p.punta[0], p.punta[1]];
  const dedo = (sx) => [p.x * sx, p.punta[0], p.punta[1] + (p.dedos ?? 0.03)];
  const add = (lista, nombre, segs, pen = null) => { if (indice[nombre] != null) lista.push({ i: indice[nombre], segs, pen }); };
  add(cuerpo, 'hips', [[J('tail1'), J('hips')], [J('hips'), J('spine1')]]); add(cuerpo, 'spine1', [[J('spine1'), J('spine2')]]); add(cuerpo, 'spine2', [[J('spine2'), J('neck1')]]);
  add(cuerpo, 'neck1', [[J('neck1'), J('neck2')]]); add(cuerpo, 'neck2', [[J('neck2'), J('head')]]); add(cuerpo, 'head', [[J('head'), J('hocico')]]);
  const cola = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tailTip'];
  for (let i = 0; i < 5; i++) add(cuerpo, cola[i], [[J(cola[i]), J(cola[i + 1])]]);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    add(patas[side], `thigh${side}`, [[cad(sx), rod(sx)]]); add(patas[side], `shin${side}`, [[rod(sx), tob(sx)]]); add(patas[side], `foot${side}`, [[tob(sx), pun(sx)], [pun(sx), dedo(sx)]]);
    if (a) { // los brazos solo actúan por su lado del cuerpo
      const penBrazo = (x) => 0.012 + clamp((0.02 - x * sx) / 0.05, 0, 1) * 0.25, h = [a.x * sx, a.hombro[0], a.hombro[1]], e = [a.x * sx, a.codo[0], a.codo[1]], mn = [a.x * sx, a.mano[0], a.mano[1]];
      add(cuerpo, `arm${side}`, [[h, e]], penBrazo); add(cuerpo, `forearm${side}`, [[e, mn], [mn, [mn[0], mn[1] - 0.02, mn[2] + 0.02]]], penBrazo);
    }
  }
  const hipY = p.cadera[0], banda = p.banda ?? 0.12;
  // reparto de pesos de un sistema: [[hueso, peso]] normalizado
  const buf = new Float32Array(16);
  const sistema = (tabla, x, y, z) => {
    let dmin = 1e9;
    for (let t = 0; t < tabla.length; t++) {
      const T = tabla[t]; let d = 1e9;
      for (const [s0, s1] of T.segs) d = Math.min(d, distSeg(x, y, z, s0, s1));
      if (T.pen) d += T.pen(x, y, z);
      buf[t] = d; if (d < dmin) dmin = d;
    }
    const out = []; let sum = 0;
    for (let t = 0; t < tabla.length; t++) { const f = Math.max(0, 1 - (buf[t] - dmin) / mezcla); if (f > 0) { out.push([tabla[t].i, f * f]); sum += f * f; } }
    for (const e of out) e[1] /= sum;
    return out;
  };
  const n = pos.length / 3, si = new Array(n), sw = new Array(n), idJaw = indice.jaw, idHead = indice.head, bc = rig.mandibula?.boca;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const lh = 1 - sstep(hipY - banda, hipY, y); // 1 por debajo de la banda de la cadera
    // transición lateral: estrecha en la pierna baja (las patas están separadas) y ancha bajo el vientre (el muslo se funde con él)
    const bajo = 1 - sstep(hipY - banda - 0.06, hipY - banda, y), x0 = 0.015 * bajo, x1 = 0.085 - 0.04 * bajo;
    // la pata solo reclama vértices cercanos a ella: la cola y el cuello no deben heredar su movimiento por estar a su altura
    const prox = (sx) => { const c = cad(sx), r = rod(sx), t = tob(sx), q = pun(sx), d = dedo(sx); return 1 - sstep(0.045, 0.11, Math.min(distSeg(x, y, z, c, r), distSeg(x, y, z, r, t), distSeg(x, y, z, t, q), distSeg(x, y, z, q, d))); };
    const lamL = x > 0 ? lh * sstep(x0, x1, x) * prox(1) : 0, lamR = x < 0 ? lh * sstep(x0, x1, -x) * prox(-1) : 0, lam = lamL + lamR;
    const acc = new Map(), suma = (lista, k) => { if (k > 1e-4) for (const [b, w] of lista) acc.set(b, (acc.get(b) ?? 0) + w * k); };
    if (lam < 1) suma(sistema(cuerpo, x, y, z), 1 - lam);
    if (lamL > 0) suma(sistema(patas.L, x, y, z), lamL);
    if (lamR > 0) suma(sistema(patas.R, x, y, z), lamR);
    // mandíbula: parte del peso de la cabeza pasa al hueso `jaw` por debajo de la línea de la boca (y delante del hinge)
    if (bc && idJaw != null && acc.has(idHead)) {
      const u = clamp((z - bc.z0) / (bc.z1 - bc.z0), 0, 1), yBoca = bc.y0 + (bc.y1 - bc.y0) * u;
      const wj = sstep(bc.z0 + 0.005, bc.z0 + 0.06, z) * sstep(yBoca + 0.002, yBoca - 0.012, y);
      if (wj > 0) { const mv = acc.get(idHead) * wj; acc.set(idHead, acc.get(idHead) - mv); acc.set(idJaw, mv); }
    }
    const top = [...acc.entries()].filter((e) => e[1] > 1e-4).sort((q, r) => r[1] - q[1]).slice(0, 4), sum = top.reduce((s2, e) => s2 + e[1], 0) || 1;
    si[v] = [0, 0, 0, 0]; sw[v] = [0, 0, 0, 0];
    top.forEach(([b, wt], i) => { si[v][i] = b; sw[v][i] = wt / sum; });
    if (!top.length) { si[v][0] = indice.hips; sw[v][0] = 1; }
  }
  return { si, sw };
}

// ---------------------------------------------------------------------------------------------------------------- impactos
/** Esferas de impacto ajustadas a la malla ya enganchada al esqueleto: por grupo de huesos, tramos a lo largo de z. Misma forma que `sp.hit`. */
function esferasDeImpacto(pos, si, sw, indice, grupos) {
  const n = pos.length / 3, out = [];
  for (const g of grupos) {
    const set = new Set(g.huesos.map((h) => indice[h]).filter((i) => i != null)), vs = [];
    for (let v = 0; v < n; v++) { let best = -1, bw = 0; for (let k = 0; k < 4; k++) if (sw[v][k] > bw) { bw = sw[v][k]; best = si[v][k]; } if (set.has(best)) vs.push(v); }
    if (vs.length < 6) continue;
    vs.sort((a, b) => pos[a * 3 + 2] - pos[b * 3 + 2]);
    const tramos = g.n ?? 1, esf = [];
    for (let t = 0; t < tramos; t++) {
      const sub = vs.slice(Math.floor((t * vs.length) / tramos), Math.floor(((t + 1) * vs.length) / tramos));
      if (!sub.length) continue;
      const c = [0, 0, 0]; for (const v of sub) { c[0] += pos[v * 3]; c[1] += pos[v * 3 + 1]; c[2] += pos[v * 3 + 2]; }
      c[0] = g.lado ? c[0] / sub.length : 0; c[1] /= sub.length; c[2] /= sub.length;
      const d = sub.map((v) => Math.hypot(pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2])).sort((a, b) => a - b);
      esf.push([+c[0].toFixed(2), +c[1].toFixed(2), +c[2].toFixed(2), +(d[Math.floor(d.length * 0.9)] * (g.k ?? 1) + 0.08).toFixed(2)]);
    }
    if (!out.length) esf.sort((a, b) => b[3] - a[3]); // la primera esfera es el cuerpo principal
    out.push(...esf);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- carga
/** Carga el GLB y el rig de una especie y devuelve todo lo necesario para construir su malla (compartido por los ejemplares). */
export async function prepararEstatico(sp, loader) {
  const e = sp.estatico, fila = POR_ID[sp.id];
  if (!fila) throw new Error(`${sp.id}: fuera del catálogo`);
  const [gltf, rig] = await Promise.all([loader.loadAsync(base() + e.glb), fetch(base() + e.rig).then((r) => { if (!r.ok) throw new Error(`${e.rig}: ${r.status}`); return r.json(); })]);
  if (rig.version === 2) return prepararV2(sp, gltf, rig, fila);
  const M = extraerMalla(gltf);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < M.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], M.pos[i + k]); mx[k] = Math.max(mx[k], M.pos[i + k]); }
  const largo = mx[2] - mn[2];
  if (Math.abs(largo - 1) > 0.05 || mn[1] < -0.02 || mn[1] > 0.03) throw new Error(`${e.glb}: el modelo no está normalizado (largo z = ${largo.toFixed(3)}, suelo y = ${mn[1].toFixed(3)}); se esperaba largo 1 y pies en y = 0`);
  const L = fila.tamano, k = L / largo;
  const { specs, legs } = esqueletoDeRig(rig, k);
  const indice = Object.fromEntries(specs.map((s, i) => [s.name, i]));
  const { si, sw } = pesosDePiel(M.pos, rig, indice);
  const pos = M.pos.map((v) => v * k);
  // borde de la boca: al abrirse la mandíbula, las aristas que unen ambos labios se estiran y dejan ver un abanico de piel; se oscurece como interior de boca
  const bc = rig.mandibula?.boca, interior = [0.05, 0.012, 0.012];
  const enBoca = (v) => { if (!bc) return 0; const z = M.pos[v * 3 + 2], u = clamp((z - bc.z0) / (bc.z1 - bc.z0), 0, 1), yb = bc.y0 + (bc.y1 - bc.y0) * u; return z < bc.z0 - 0.01 || z > bc.z1 + 0.02 ? 0 : 1 - sstep(0.004, 0.016, Math.abs(M.pos[v * 3 + 1] - yb)); };
  const geo = geometria({ pos, si, sw, tri: M.tri, zona: new Array(M.tri.length / 3).fill(0), zonas: ['cuerpo'] }, {
    escala: 1, angulo: e.angulo ?? 60, uvM: 1,
    colorVert: (v, out) => { const g = e.brillo ?? 1.12, t = enBoca(v) * 0.85; for (let c = 0; c < 3; c++) out[c] = (M.col[v * 3 + c] * g) * (1 - t) + interior[c] * t; },
  });
  geo.boundingSphere.radius *= 1.35;
  const hit = esferasDeImpacto(pos, si, sw, indice, [
    { huesos: ['hips', 'spine1', 'spine2'], n: 2 }, { huesos: ['neck1', 'neck2'] }, { huesos: ['head', 'jaw'] }, { huesos: ['tail1', 'tail2', 'tail3'] }, { huesos: ['tail4', 'tail5'] },
    { huesos: ['thighL', 'shinL', 'footL'], lado: true }, { huesos: ['thighR', 'shinR', 'footR'], lado: true },
  ]);
  const H = rig.mediana.hips[1] * k;
  return { geo, specs, legs, hit, H, k, rig, tris: M.tri.length / 3, verts: M.pos.length / 3 };
}

/**
 * Rig versión 2 (tools/autorig.mjs): malla texturizada ya en metros y orientada; los huesos son los de la procedural de la especie
 * (se comprueba que no falte ninguno: la animación los busca por nombre) colocados sobre la malla.
 */
function prepararV2(sp, gltf, rig, fila) {
  if (rig.id && rig.id !== sp.id) throw new Error(`${sp.estatico.rig}: el rig es de ${rig.id}`);
  const proc = sp.buildProcedural?.call(sp);
  if (proc) {
    const faltan = proc.specs.map((s) => s.name).filter((n) => !rig.huesos.some((h) => h.nombre === n));
    if (faltan.length) throw new Error(`${sp.estatico.rig}: faltan huesos de la especie (${faltan.join(', ')})`);
  }
  const M = extraerTexturizada(gltf);
  if (!M.mapa) throw new Error(`${sp.estatico.glb}: sin textura de color`);
  const specs = rig.huesos.map((h) => ({ name: h.nombre, parent: h.padre, pos: h.pos.slice() }));
  const indice = Object.fromEntries(specs.map((s, i) => [s.name, i]));
  const L = fila.tamano;
  // pesos: los precalculados en el GLB (rápido); ?pesos=calcular los recalcula aquí con la misma función (para ajustar el algoritmo sin regenerar)
  const recalcular = typeof location !== 'undefined' && new URLSearchParams(location.search).get('pesos') === 'calcular';
  const maxHueso = M.piel ? Math.max(...M.piel.si.map((q) => Math.max(...q))) : -1;
  const { si, sw } = M.piel && !recalcular && maxHueso < specs.length ? M.piel : pesosGenerales(M.pos, rig, indice, L, M.idx);
  const geo = geometriaTexturizada(M, si, sw);
  geo.boundingSphere.radius *= 1.35;
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // apoyo de reposo = el de la malla (no el simétrico del rig): cada pie oscila alrededor de donde está en el modelo, así la pata se aparta
  // poco de la pose de enlace y la piel apenas se estira (con el simétrico, una malla a mitad de zancada se deforma mucho al estar quieta)
  const simetrico = sp.estatico?.apoyoSimetrico === true;
  const legs = (rig.patas ?? []).map((p) => ({ name: p.name, thigh: p.thigh, shin: p.shin, foot: p.foot, phase: p.phase, bendFwd: p.bendFwd, quad: p.quad, toe: V3(simetrico ? p.toe : (p.toeMalla ?? p.toe)), toeMalla: V3(p.toeMalla ?? p.toe) }));
  const hit = esferasDeImpacto(M.pos, si, sw, indice, gruposImpacto(rig.plantilla, specs.map((s) => s.name)));
  const H = rig.huesos.find((h) => h.nombre === 'hips').pos[1];
  return { v: 2, geo, specs, legs, hit, H, rig, mapa: M.mapa, plantilla: rig.plantilla, pos: M.pos, L, tris: M.idx.length / 3, verts: M.pos.length / 3 };
}

/** Ajusta los parámetros de la especie a la piel v2 cargada (altura de cadera, ritmo de marcha, silla, boca). */
function adoptarV2(sp, d) {
  const Hp = sp.hips || 1;
  if (d.plantilla === 'bipedo') Object.assign(sp, { hips: d.H, ...ritmoDeMarcha(d.H) });
  else if (d.plantilla === 'cuadrupedo') {
    const k = clamp(d.H / Math.max(0.05, Hp), 0.5, 2);
    sp.hips = d.H; sp.cycle = { walk: sp.cycle.walk * k, run: sp.cycle.run * k }; sp.step = (sp.step ?? 0.2) * k;
  } else if (d.plantilla === 'acuatico') sp.hips = d.H;
  // pterosaurios: en vuelo las caderas se llevan al origen (sp.hips no se usa)
  sp.aperturaMandibula = 0; // el modelo no tiene la boca separada: la mandíbula no se abre
  // ¿llegan las patas al suelo en los extremos del paso? La IK trabaja en el plano (y, z) de cada pata: con la pata casi estirada en reposo
  // (mallas en pose alta), a mitad de zancada el pie se quedaría en el aire. Primero se ACORTA EL PASO (más cadencia, misma velocidad);
  // solo si ni con un paso corto llega, se bajan las caderas lo justo (cocodrilo en «marcha alta»).
  if (d.legs.length && sp.cycle) {
    const P = Object.fromEntries(d.specs.map((s) => [s.name, s.pos])), stance = sp.stance ?? 0.55;
    let libre = Infinity, bajar = 0;
    const minimo = 0.22 * d.H; // medio paso mínimo aceptable
    for (const l of d.legs) {
      const hip = P[l.thigh], knee = P[l.shin], ank = P[l.foot], tm = l.toeMalla ?? l.toe;
      const L1 = Math.hypot(knee[1] - hip[1], knee[2] - hip[2]), L2 = Math.hypot(ank[1] - knee[1], ank[2] - knee[2]);
      const ay = 0.02 + (ank[1] - tm.y), az = l.toe.z + (ank[2] - tm.z); // tobillo pedido en reposo (pie 2 cm sobre el suelo)
      const alcance = 0.985 * (L1 + L2), dy = hip[1] - ay, z0 = Math.abs(az - hip[2]);
      const dzMax = dy < alcance ? Math.sqrt(alcance * alcance - dy * dy) - z0 : -z0; // medio paso que admite esta pata
      libre = Math.min(libre, dzMax);
      if (dzMax < minimo) { const dyOk = Math.sqrt(Math.max(0, alcance * alcance - (z0 + minimo) ** 2)); bajar = Math.max(bajar, dy - dyOk); }
    }
    sp.bajarCaderas = Math.min(Math.max(0, bajar), 0.2 * d.H);
    if (Number.isFinite(libre)) {
      const medio = Math.max(minimo, libre), cicloMax = (2 * medio) / (stance * 0.9);
      sp.cicloOriginal = { ...sp.cycle };
      sp.cycle = { walk: Math.min(sp.cycle.walk, cicloMax), run: Math.min(sp.cycle.run, cicloMax * 1.5) }; // al correr hay fase de vuelo: se tolera algo más de paso
    }
  }
  if (sp.montura?.ancla) { const a = anclaSobreLomo(d.pos, sp.montura.ancla[2], d.L); if (a) sp.montura = { ...sp.montura, ancla: a, anclaProcedural: sp.montura.ancla }; }
}

/**
 * Carga los modelos estáticos de todas las especies que los declaran (`sp.estatico = { glb, rig }`). Las que fallan se anotan en `errores`
 * y siguen usando su malla procedural. Al cargar, la especie adopta altura de cadera, ritmo de marcha y esferas de impacto del modelo.
 */
export async function cargarEstaticos(especies, errores = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(especies.filter((s) => s.estatico && !s.estatico.datos).map(async (sp) => {
    try {
      const d = await prepararEstatico(sp, loader);
      sp.estatico.datos = d;
      if (d.v === 2) adoptarV2(sp, d);
      else Object.assign(sp, { hips: d.H, ...ritmoDeMarcha(d.H), aperturaMandibula: d.rig.mandibula?.apertura ?? 1 });
      if (d.hit.length) { sp.hitProcedural = sp.hit; sp.hit = d.hit; }
    } catch (e) { errores[sp.id] = String(e?.message ?? e); console.warn(`[fauna] ${sp.id}: modelo estático no disponible, se usa la malla procedural —`, e?.message ?? e); }
  }));
}

/** `build()` de una especie con modelo estático cargado: mismo contrato que el de las mallas procedurales. */
export function construirEstatico(sp) {
  const d = sp.estatico.datos;
  return { geo: d.geo, sk: makeSkeleton(d.specs), legs: d.legs.map((l) => ({ ...l, toe: l.toe.clone(), ...(l.toeMalla ? { toeMalla: l.toeMalla.clone() } : {}) })), specs: d.specs };
}
