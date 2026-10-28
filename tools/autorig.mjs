#!/usr/bin/env node
// AUTO-RIG de los modelos estáticos de fauna (GLB texturizados de Higgsfield/Tripo) sobre el esqueleto procedural de su especie.
//
// Uso:  GLTF_TOOLS=<carpeta cuyo node_modules tiene @gltf-transform/* y meshoptimizer> node tools/autorig.mjs <carpeta_glb> [id ...] [--tris 14000] [--hoja-solo]
//
// Para cada especie con GLB en la carpeta (o las indicadas):
//   1) ORIENTA la malla: +Z cabeza, +Y arriba (pterosaurios: alas a lo largo de X), la apoya en y = 0 y la ESCALA a su tamaño del catálogo
//      (longitud total; envergadura en los pterosaurios). La orientación sale del eje principal en planta y de la tabla ORIENTACION.
//   2) SIMPLIFICA la malla (meshopt: respeta costuras de UV) y escribe public/models/fauna/hf/<id>.glb con la textura original.
//   3) AJUSTA EL ESQUELETO PROCEDURAL de la especie a la malla: mismos huesos, jerarquía y patas que su malla procedural (la IA, la marcha por IK
//      y las animaciones del juego no cambian). Cada articulación se lleva de la malla procedural a la generada con marcas medidas igual en las dos:
//        · eje del cuerpo: puntas de cola y hocico y apoyos de las patas → correspondencia a lo largo de z; altura relativa dentro del grosor del
//          cuerpo en cada tramo (centro y grosor medidos en la franja media) → las articulaciones quedan dentro del cuerpo aunque cambien las proporciones;
//          después cada articulación de cadena (cola, columna, cuello) se centra en la sección perpendicular a la cadena;
//        · patas: cada apoyo de la malla generada (grupo de vértices junto al suelo) se empareja con el de la procedural y la pata se reconstruye
//          en el marco cadera→apoyo conservando las proporciones y el sentido de la rodilla;
//        · alas: fracción de envergadura y borde de ataque; aletas: proporción del ancho del cuerpo.
//   4) escribe public/models/fauna/hf/<id>.rig.json (huesos en metros, puntas de los huesos finales, radios de las extremidades, medidas)
//      y una hoja de control shots/autorig/<id>.png (lateral, planta y frente con los huesos encima) para revisarla a ojo.
// Nada de esto toca los archivos originales.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = process.env.GLTF_TOOLS ?? RAIZ;
const req = createRequire(path.join(GT, 'x.js'));
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const { NodeIO, Document } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTTextureWebP } = await imp('@gltf-transform/extensions');
const { quantize, meshopt } = await imp('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;
const { SPECIES } = await import(pathToFileURL(path.join(RAIZ, 'src/fauna/species.js')).href);
const { POR_ID } = await import(pathToFileURL(path.join(RAIZ, 'src/fauna/catalogo.js')).href);
const { pesosGenerales } = await import(pathToFileURL(path.join(RAIZ, 'src/fauna/autorig.js')).href);

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const flag = (n) => args.includes(`--${n}`);
const DIR = args[0];
const IDS = args.slice(1).filter((a, i, A) => !a.startsWith('--') && !(i > 0 && A[i - 1].startsWith('--') && A[i - 1] !== '--hoja-solo'));
const TRIS = Number(opt('tris', 14000));
const SALIDA = path.join(RAIZ, 'public/models/fauna/hf');
const HOJAS = path.join(RAIZ, 'shots/autorig');

// giro (grados, sobre Y) que se suma al del eje principal, y si hay que dar media vuelta (cabeza hacia -z tras alinear el eje)
// Se rellena mirando la hoja de control: el eje principal deja el cuerpo a lo largo de z; aquí solo se decide el sentido.
const ORIENTACION = {
  // id: { vuelta: true }  (cabeza al otro extremo)  ·  { giro: n }  (corrección fina en grados)  ·  { boca: true } (boca abajo)
};
// Modelos que no se integran (con el motivo). Siguen con su malla procedural.
const EXCLUIR = {
  pteranodon: 'el modelo está en pose de viraje asimétrica (un ala adelantada y otra atrasada, como la imagen de referencia en 3/4): el aleteo del esqueleto no puede partir de ahí',
  quetzalcoatlus: 'el modelo está en pose de viraje asimétrica (alas cruzadas en planta, como la imagen de referencia en 3/4)',
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r4 = (a) => a.map((v) => Math.round(v * 1e4) / 1e4);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ------------------------------------------------------------------------------------------------ lectura
async function leerGLB(file) {
  const doc = await io.read(file);
  const nodos = doc.getRoot().listNodes().filter((n) => n.getMesh());
  if (nodos.length !== 1 || nodos[0].getMesh().listPrimitives().length !== 1) throw new Error(`${file}: se esperaba una sola malla con una primitiva`);
  const node = nodos[0], prim = node.getMesh().listPrimitives()[0], M = node.getWorldMatrix();
  const Pa = prim.getAttribute('POSITION'), Na = prim.getAttribute('NORMAL'), Ua = prim.getAttribute('TEXCOORD_0');
  const n = Pa.getCount(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), e = [0, 0, 0], u = [0, 0];
  for (let i = 0; i < n; i++) {
    Pa.getElement(i, e);
    pos[i * 3] = M[0] * e[0] + M[4] * e[1] + M[8] * e[2] + M[12]; pos[i * 3 + 1] = M[1] * e[0] + M[5] * e[1] + M[9] * e[2] + M[13]; pos[i * 3 + 2] = M[2] * e[0] + M[6] * e[1] + M[10] * e[2] + M[14];
    if (Na) { Na.getElement(i, e); const x = M[0] * e[0] + M[4] * e[1] + M[8] * e[2], y = M[1] * e[0] + M[5] * e[1] + M[9] * e[2], z = M[2] * e[0] + M[6] * e[1] + M[10] * e[2], l = Math.hypot(x, y, z) || 1; nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l; }
    if (Ua) { Ua.getElement(i, u); uv[i * 2] = u[0]; uv[i * 2 + 1] = u[1]; }
  }
  const ix = prim.getIndices(), idx = ix ? Uint32Array.from(ix.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
  const tex = prim.getMaterial()?.getBaseColorTexture();
  if (!tex) throw new Error(`${file}: sin textura de color`);
  return { pos, nor, uv, idx, img: tex.getImage(), mime: tex.getMimeType() };
}

// ------------------------------------------------------------------------------------------------ orientación y escala
function ejePrincipal(pos) {
  let mx = 0, mz = 0; const n = pos.length / 3;
  for (let i = 0; i < n; i++) { mx += pos[i * 3]; mz += pos[i * 3 + 2]; }
  mx /= n; mz /= n;
  let sxx = 0, szz = 0, sxz = 0;
  for (let i = 0; i < n; i++) { const dx = pos[i * 3] - mx, dz = pos[i * 3 + 2] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  return 0.5 * Math.atan2(2 * sxz, sxx - szz); // ángulo del eje mayor desde +x hacia +z
}
function girarY(arr, ang) { // misma convención que THREE.Matrix4.makeRotationY(ang)
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < arr.length; i += 3) { const x = arr[i], z = arr[i + 2]; arr[i] = c * x + s * z; arr[i + 2] = -s * x + c * z; }
}
function caja(pos) {
  const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], pos[i + k]); b[k] = Math.max(b[k], pos[i + k]); }
  return [a, b];
}
/** Ejes principales 3D (Jacobi sobre la covarianza): vectores propios ordenados de mayor a menor varianza. */
function ejes3D(pos) {
  const n = pos.length / 3, m = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) m[k] += pos[i * 3 + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const d = [pos[i * 3] - m[0], pos[i * 3 + 1] - m[1], pos[i * 3 + 2] - m[2]]; for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) C[a][c] += d[a] * d[c] / n; }
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], A = C.map((r) => r.slice());
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1; for (const [a, c] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(A[a][c]) > Math.abs(A[p][q])) { p = a; q = c; }
    if (Math.abs(A[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  return [0, 1, 2].map((i) => ({ val: A[i][i], vec: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.val - a.val).map((e) => e.vec);
}
/** Simetría especular (x → 2t − x) de la ocupación en el plano (x, eje2): mejor IoU sobre el desplazamiento t de la línea de simetría. */
function simetria(pos, eje2, n = 96) {
  const [a, b] = caja(pos), sx = (b[0] - a[0]) || 1e-6, s2 = (b[eje2] - a[eje2]) || 1e-6, G = new Uint8Array(n * n);
  for (let i = 0; i < pos.length; i += 3) { const x = Math.min(n - 1, Math.floor(((pos[i] - a[0]) / sx) * n)), y = Math.min(n - 1, Math.floor(((pos[i + eje2] - a[eje2]) / s2) * n)); G[y * n + x] = 1; }
  let mejor = 0;
  for (let t2 = Math.floor(n * 0.6); t2 <= Math.ceil(n * 1.4); t2++) { // eje de simetría x = t2/2 (en celdas)
    let inter = 0, uni = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const xm = t2 - 1 - x, A = G[y * n + x], B = xm >= 0 && xm < n ? G[y * n + xm] : 0; if (A && B) inter++; if (A || B) uni++; }
    mejor = Math.max(mejor, inter / (uni || 1));
  }
  return mejor;
}
function rotar(arr, eje, ang) { // eje: 0 = x, 1 = y, 2 = z (misma convención que THREE.Matrix4.makeRotation*)
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    if (eje === 0) { arr[i + 1] = c * y - s * z; arr[i + 2] = s * y + c * z; }
    else if (eje === 1) { arr[i] = c * x + s * z; arr[i + 2] = -s * x + c * z; }
    else { arr[i] = c * x - s * y; arr[i + 1] = s * x + c * y; }
  }
}
/** Busca el giro (sobre `eje`) que maximiza la simetría bilateral en el plano (x, eje2): el plano medio del animal queda en x = cte. */
function alinearSimetria(G, eje, eje2, rango, paso) {
  const muestra = new Float32Array(Math.min(G.pos.length, 9000 * 3));
  const k = Math.max(1, Math.floor(G.pos.length / 3 / 9000));
  for (let i = 0, j = 0; j < muestra.length; i += 3 * k, j += 3) { muestra[j] = G.pos[i]; muestra[j + 1] = G.pos[i + 1]; muestra[j + 2] = G.pos[i + 2]; }
  let mejor = { ang: 0, s: -1 };
  for (let g = -rango; g <= rango + 1e-9; g += paso) {
    const m = Float32Array.from(muestra); rotar(m, eje, (g * Math.PI) / 180);
    const sc = simetria(m, eje2);
    if (sc > mejor.s) mejor = { ang: g, s: sc };
  }
  rotar(G.pos, eje, (mejor.ang * Math.PI) / 180); rotar(G.nor, eje, (mejor.ang * Math.PI) / 180);
  return mejor;
}

function aplicarBase(arr, ex, ey, ez) { for (let i = 0; i < arr.length; i += 3) { const v = [arr[i], arr[i + 1], arr[i + 2]]; arr[i] = dot(v, ex); arr[i + 1] = dot(v, ey); arr[i + 2] = dot(v, ez); } }

/** Orienta (eje principal → z, o → x en voladores), aplica la tabla ORIENTACION, apoya en y = 0, centra y escala a metros. */
function normalizar(G, id, plantilla, L) {
  if (plantilla === 'pterosaurio') { // voladores en pose libre (ladeados, cabeceando): marco completo por PCA 3D — envergadura → x, cuerpo → z, grosor → y
    const [e1, e2, e3] = ejes3D(G.pos);
    let ex = e1, ez = e2, ey = [ez[1] * ex[2] - ez[2] * ex[1], ez[2] * ex[0] - ez[0] * ex[2], ez[0] * ex[1] - ez[1] * ex[0]]; // y = z × x (base dextrógira)
    if (dot(ey, [0, 1, 0]) < 0) { ey = mul(ey, -1); ex = mul(ex, -1); } // arriba lo que más se parecía a arriba
    aplicarBase(G.pos, ex, ey, ez); aplicarBase(G.nor, ex, ey, ez);
    // la PCA deja las alas aproximadamente en x; el giro fino lo da la simetría bilateral: en planta (guiñada) y de frente (alabeo)
    const yaw = alinearSimetria(G, 1, 2, 60, 2), roll = alinearSimetria(G, 2, 1, 30, 1.5);
    const yaw2 = alinearSimetria(G, 1, 2, 4, 0.5);
    G.simetria = { guinada: yaw.ang + yaw2.ang, alabeo: roll.ang, iou: +yaw2.s.toFixed(3) };
  }
  const th = plantilla === 'pterosaurio' ? 0 : ejePrincipal(G.pos);
  // makeRotationY(φ) lleva un ángulo α a α − φ: el eje queda en 90° (a lo largo de z) o en 0° (a lo largo de x) para los voladores
  let phi = plantilla === 'pterosaurio' ? 0 : th - Math.PI / 2;
  // el eje es una recta: se elige el giro mínimo (la mayoría de los modelos ya vienen con la cabeza hacia +z; la tabla decide el resto)
  while (phi > Math.PI / 2) phi -= Math.PI;
  while (phi <= -Math.PI / 2) phi += Math.PI;
  const o = ORIENTACION[id] ?? {};
  if (o.giro) phi -= (o.giro * Math.PI) / 180;
  if (o.vuelta) phi += Math.PI;
  girarY(G.pos, phi); girarY(G.nor, phi);
  if (o.boca) for (const A of [G.pos, G.nor]) for (let i = 0; i < A.length; i += 3) { A[i] = -A[i]; A[i + 1] = -A[i + 1]; } // boca abajo: media vuelta sobre z
  const [a, b] = caja(G.pos);
  const largo = plantilla === 'pterosaurio' ? b[0] - a[0] : b[2] - a[2], k = L / largo;
  const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
  for (let i = 0; i < G.pos.length; i += 3) { G.pos[i] = (G.pos[i] - cx) * k; G.pos[i + 1] = (G.pos[i + 1] - a[1]) * k; G.pos[i + 2] = (G.pos[i + 2] - cz) * k; }
  return { giroGrados: +(((phi * 180) / Math.PI) % 360).toFixed(1), escala: +k.toFixed(5), ejeOriginal: +((th * 180) / Math.PI).toFixed(1), ...(G.simetria ? { simetria: G.simetria } : {}) };
}

// ------------------------------------------------------------------------------------------------ simplificación
function simplificar(G, objetivo) {
  const tris = G.idx.length / 3;
  if (tris <= objetivo) return G;
  const [ni] = MeshoptSimplifier.simplify(G.idx, G.pos, 3, objetivo * 3, 0.02);
  const nuevo = new Int32Array(G.pos.length / 3).fill(-1); let nv = 0;
  for (const v of ni) if (nuevo[v] < 0) nuevo[v] = nv++;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  for (let v = 0; v < nuevo.length; v++) { const w = nuevo[v]; if (w < 0) continue; for (let k = 0; k < 3; k++) { pos[w * 3 + k] = G.pos[v * 3 + k]; nor[w * 3 + k] = G.nor[v * 3 + k]; } uv[w * 2] = G.uv[v * 2]; uv[w * 2 + 1] = G.uv[v * 2 + 1]; }
  return { ...G, pos, nor, uv, idx: Uint32Array.from(ni, (v) => nuevo[v]) };
}

// ------------------------------------------------------------------------------------------------ medidas
/** Muestreo uniforme de la superficie (por área): las dos mallas se miden igual aunque la procedural tenga pocos vértices. */
function muestrear(pos, idx, n = 60000, semilla = 7) {
  const nt = idx.length / 3, acc = new Float64Array(nt); let tot = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    tot += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); acc[t] = tot;
  }
  let st = semilla >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const r = rnd() * tot; let lo = 0, hi = nt - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (acc[m] < r) lo = m + 1; else hi = m; }
    const a = idx[lo * 3] * 3, b = idx[lo * 3 + 1] * 3, c = idx[lo * 3 + 2] * 3;
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    for (let q = 0; q < 3; q++) out[k * 3 + q] = pos[a + q] + (pos[b + q] - pos[a + q]) * u + (pos[c + q] - pos[a + q]) * v;
  }
  return out;
}

/**
 * Perfil a lo largo de z: en cada tramo, lomo (y máx.), vientre (y mín. en la franja media), centro lateral y medio ancho.
 * `xLim`: ignora lo que esté más lejos del eje (las alas de los voladores).
 */
function perfil(pos, n = 120, xLim = Infinity) {
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i]) <= xLim) { z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
  const bin = (z) => clamp(Math.floor(((z - z0) / (z1 - z0)) * n), 0, n - 1);
  const top = new Float64Array(n).fill(-Infinity), hw = new Float64Array(n), sx = new Float64Array(n), cnt = new Float64Array(n);
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i]; if (Math.abs(x) > xLim) continue; const b = bin(pos[i + 2]); top[b] = Math.max(top[b], pos[i + 1]); hw[b] = Math.max(hw[b], Math.abs(x)); sx[b] += x; cnt[b]++; }
  const bel = new Float64Array(n).fill(Infinity), cx = new Float64Array(n), cc = new Float64Array(n);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]; if (Math.abs(x) > xLim) continue;
    const b = bin(pos[i + 2]); if (!cnt[b]) continue;
    const xm = sx[b] / cnt[b];
    if (Math.abs(x - xm) < 0.3 * Math.max(hw[b], 1e-6)) { bel[b] = Math.min(bel[b], pos[i + 1]); cx[b] += x; cc[b]++; }
  }
  const T = [], B = [], C = [], W = [];
  for (let b = 0; b < n; b++) { T.push(cnt[b] ? top[b] : NaN); B.push(cc[b] ? bel[b] : NaN); C.push(cc[b] ? cx[b] / cc[b] : NaN); W.push(cnt[b] ? hw[b] : NaN); }
  const rellenar = (A) => { for (let b = 0; b < n; b++) if (Number.isNaN(A[b])) { let l = b - 1, r = b + 1; while (l >= 0 && Number.isNaN(A[l])) l--; while (r < n && Number.isNaN(A[r])) r++; A[b] = l < 0 ? A[r] : r >= n ? A[l] : lerp(A[l], A[r], (b - l) / (r - l)); } };
  const mediana = (A, k = 2) => A.map((_, b) => { const w = []; for (let j = Math.max(0, b - k); j <= Math.min(n - 1, b + k); j++) w.push(A[j]); w.sort((p, q) => p - q); return w[w.length >> 1]; });
  for (const A of [T, B, C, W]) rellenar(A);
  const Tm = mediana(T), Bm = mediana(B), Cm = mediana(C), Wm = mediana(W);
  // tramo «sin patas»: lo más bajo de la franja media queda lejos del suelo (si no, el vientre medido es en realidad una pata cruzada)
  const libre = Tm.map((t, b) => Bm[b] > 0.22 * t);
  const at = (z) => {
    const f = clamp(((z - z0) / (z1 - z0)) * n - 0.5, 0, n - 1), i = Math.floor(f), j = Math.min(n - 1, i + 1), t = f - i;
    const top2 = lerp(Tm[i], Tm[j], t), bel2 = lerp(Bm[i], Bm[j], t);
    return { top: top2, bel: bel2, c: (top2 + bel2) / 2, h: Math.max(1e-3, top2 - bel2), cx: lerp(Cm[i], Cm[j], t), hw: Math.max(1e-3, lerp(Wm[i], Wm[j], t)), libre: libre[t < 0.5 ? i : j] };
  };
  return { z0, z1, n, at, T: Tm, B: Bm, libre };
}

/** Apoyos: grupos de vértices junto al suelo (y < corte), por componentes conexas en una rejilla en planta. */
function apoyos(pos, L, corteRel = 0.05) {
  let H = 0; for (let i = 1; i < pos.length; i += 3) H = Math.max(H, pos[i]);
  const corte = corteRel * H, celda = 0.012 * L, M = new Map();
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] < corte) {
    const k = `${Math.floor(pos[i] / celda)},${Math.floor(pos[i + 2] / celda)}`;
    let c = M.get(k); if (!c) M.set(k, (c = [])); c.push(i / 3);
  }
  const vistos = new Set(), grupos = [];
  for (const k of M.keys()) {
    if (vistos.has(k)) continue;
    const cola = [k], vs = []; vistos.add(k);
    while (cola.length) {
      const q = cola.pop(); vs.push(...M.get(q));
      const [gx, gz] = q.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const kk = `${gx + dx},${gz + dz}`; if (M.has(kk) && !vistos.has(kk)) { vistos.add(kk); cola.push(kk); } }
    }
    let x = 0, z = 0, z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const v of vs) { x += pos[v * 3]; z += pos[v * 3 + 2]; z0 = Math.min(z0, pos[v * 3 + 2]); z1 = Math.max(z1, pos[v * 3 + 2]); x0 = Math.min(x0, pos[v * 3]); x1 = Math.max(x1, pos[v * 3]); }
    grupos.push({ n: vs.length, x: x / vs.length, z: z / vs.length, z0, z1, x0, x1, vs });
  }
  // dedos separados de un mismo pie: se funden los grupos cercanos
  const cerca = 0.045 * L;
  for (let hecho = false; !hecho;) {
    hecho = true;
    for (let i = 0; i < grupos.length && hecho; i++) for (let j = i + 1; j < grupos.length && hecho; j++) {
      const A = grupos[i], B = grupos[j], gx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1)), gz = Math.max(0, Math.max(A.z0, B.z0) - Math.min(A.z1, B.z1));
      if (Math.hypot(gx, gz) < cerca && Math.sign(A.x) === Math.sign(B.x)) { grupos[i] = resumen([...A.vs, ...B.vs], pos); grupos.splice(j, 1); hecho = false; }
    }
  }
  const total = grupos.reduce((s, g) => s + g.n, 0);
  return grupos.filter((g) => g.n > total * 0.03).sort((a, b) => b.n - a.n);
}

/** Empareja los apoyos con las patas: [{lado: ±1, delante: bool}] → grupo (o null). */
function emparejarApoyos(grupos, patas, perfilG) {
  const out = new Map();
  const quads = patas.some((p) => p.delante);
  // descarta apoyos sobre la línea media en los extremos (punta de la cola o barbilla apoyadas)
  const usables = grupos.filter((g) => Math.abs(g.x - perfilG.at(g.z).cx) > 0.12 * perfilG.at(g.z).hw || (g.x1 - g.x0) > 0.5 * perfilG.at(g.z).hw);
  for (const lado of [1, -1]) {
    let cand = usables.filter((g) => Math.sign(g.x - perfilG.at(g.z).cx) === lado);
    // un solo grupo que cruza la línea media (pies juntos): se parte por x
    if (!cand.length) cand = usables.filter((g) => g.x0 < 0 && g.x1 > 0).map((g) => { const vs = g.vs.filter((v) => Math.sign(perfilG.pos[v * 3]) === lado); return resumen(vs, perfilG.pos); }).filter((g) => g.n > 3);
    cand.sort((a, b) => b.n - a.n);
    if (!quads) { out.set(`${lado}|0`, cand[0] ?? null); continue; }
    const dos = cand.slice(0, 2).sort((a, b) => a.z - b.z);
    out.set(`${lado}|0`, dos.length === 2 ? dos[0] : null); out.set(`${lado}|1`, dos.length === 2 ? dos[1] : null);
  }
  return out;
}
function resumen(vs, pos) {
  let x = 0, z = 0, z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const v of vs) { x += pos[v * 3]; z += pos[v * 3 + 2]; z0 = Math.min(z0, pos[v * 3 + 2]); z1 = Math.max(z1, pos[v * 3 + 2]); x0 = Math.min(x0, pos[v * 3]); x1 = Math.max(x1, pos[v * 3]); }
  return { n: vs.length, x: x / vs.length, z: z / vs.length, z0, z1, x0, x1, vs };
}

/** Correspondencia monótona por tramos entre dos listas de marcas z (procedural → generada). */
function mapaZ(pares) {
  const p = pares.filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).sort((a, b) => a[0] - b[0]);
  const ok = p.every((q, i) => i === 0 || (q[0] > p[i - 1][0] + 1e-6 && q[1] > p[i - 1][1] + 1e-6));
  const P = ok ? p : [p[0], p[p.length - 1]];
  return (z) => {
    if (z <= P[0][0]) return P[0][1] + (z - P[0][0]) * ((P[1][1] - P[0][1]) / (P[1][0] - P[0][0]));
    for (let i = 0; i < P.length - 1; i++) if (z <= P[i + 1][0]) return lerp(P[i][1], P[i + 1][1], (z - P[i][0]) / (P[i + 1][0] - P[i][0]));
    const a = P[P.length - 2], b = P[P.length - 1]; return b[1] + (z - b[0]) * ((b[1] - a[1]) / (b[0] - a[0]));
  };
}

/** Centra un punto en la sección de la malla perpendicular a `dir` (losa de grosor `losa`, radio `r`), sin moverlo a lo largo de `dir`. */
function centrarEnSeccion(pos, p, dir, r, losa, filtro = null) {
  let q = p.slice();
  for (let it = 0; it < 4; it++) {
    let s = [0, 0, 0], n = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const v = [pos[i], pos[i + 1], pos[i + 2]], d = sub(v, q), a = dot(d, dir);
      if (Math.abs(a) > losa) continue;
      const perp = sub(d, mul(dir, a));
      if (len(perp) > r) continue;
      if (filtro && !filtro(v)) continue;
      s = add(s, perp); n++;
    }
    if (n < 8) break;
    q = add(q, mul(s, 1 / n));
  }
  return q;
}

/** Radio de la extremidad alrededor del segmento a→b (percentil 75 de la distancia de los vértices cercanos de ese lado). */
function radioSegmento(pos, a, b, lado, rMax) {
  const ab = sub(b, a), L2 = dot(ab, ab) || 1e-9, ds = [];
  for (let i = 0; i < pos.length; i += 3) {
    if (lado && Math.sign(pos[i]) !== lado) continue;
    const v = [pos[i], pos[i + 1], pos[i + 2]], t = dot(sub(v, a), ab) / L2;
    if (t < 0.25 || t > 0.75) continue;
    const d = len(sub(v, add(a, mul(ab, t))));
    if (d < rMax) ds.push(d);
  }
  if (ds.length < 6) return rMax * 0.5;
  ds.sort((p, q) => p - q);
  return ds[Math.floor(ds.length * 0.75)];
}

// ------------------------------------------------------------------------------------------------ plantillas
function plantillaDe(id, b) {
  const cat = POR_ID[id];
  if (cat?.tipoAnimal === 'pterosaurio') return 'pterosaurio';
  if (cat?.tipoAnimal === 'reptil_marino' || SPECIES[id].nada) return 'acuatico';
  return b.legs.length === 4 ? 'cuadrupedo' : 'bipedo';
}
const CADENA_CUERPO = (nombres) => ['tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'tail', 'hips', 'spine1', 'spine2', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'head'].filter((n) => nombres.includes(n));

/**
 * Ajusta el esqueleto. Devuelve { huesos: [{nombre, padre, pos}], patas, puntas, radios, medidas }.
 * Pm/Gm: muestras de superficie de la malla procedural y de la generada (m). G: la malla generada (para la hoja).
 */
function ajustar(id, plantilla, b, Pm, Gm) {
  const L = POR_ID[id].tamano;
  const specs = b.specs.map((s) => ({ nombre: s.name, padre: s.parent, pos: s.pos.slice ? s.pos.slice() : [s.pos.x, s.pos.y, s.pos.z] }));
  const J = Object.fromEntries(specs.map((s) => [s.nombre, s.pos]));
  const nombres = specs.map((s) => s.nombre);
  const volador = plantilla === 'pterosaurio';
  const semiEnv = (pts) => { let m = 0; for (let i = 0; i < pts.length; i += 3) m = Math.max(m, Math.abs(pts[i])); return m; };
  const prP = perfil(Pm, 120, volador ? semiEnv(Pm) * 0.12 : Infinity), prG = perfil(Gm, 120, volador ? semiEnv(Gm) * 0.12 : Infinity);
  prP.pos = Pm; prG.pos = Gm;
  const medidas = { plantilla };
  // ---- marcas a lo largo de z: puntas de cola y hocico + apoyos de las patas
  const pares = [[prP.z0, prG.z0], [prP.z1, prG.z1]];
  const patas = (b.legs ?? []).map((l) => ({ ...l, lado: Math.sign((l.toe?.x ?? J[l.thigh][0]) || 1), delante: l.quad === 'front' }));
  let apP = null, apG = null;
  if (patas.length) {
    const gp = apoyos(Pm, L), gg = apoyos(Gm, L);
    apP = emparejarApoyos(gp, patas, prP); apG = emparejarApoyos(gg, patas, prG);
    medidas.apoyos = { procedural: gp.length, generada: gg.length };
    for (const del of [0, 1]) {
      const p = [apP.get(`1|${del}`), apP.get(`-1|${del}`)], g = [apG.get(`1|${del}`), apG.get(`-1|${del}`)];
      if (p.every(Boolean) && g.every(Boolean)) pares.push([(p[0].z + p[1].z) / 2, (g[0].z + g[1].z) / 2]);
    }
  }
  const Wz = mapaZ(pares);
  medidas.marcasZ = pares.map((q) => q.map((v) => +v.toFixed(3)));
  // grosor: donde la franja media de la generada toca una pata, el grosor se estima con el de la procedural por un factor común
  const ratios = [];
  for (let k = 0; k < 60; k++) { const z = lerp(prP.z0, prP.z1, (k + 0.5) / 60), a = prP.at(z), c = prG.at(Wz(z)); if (a.libre && c.libre) ratios.push(c.h / a.h); }
  ratios.sort((p, q) => p - q);
  const kh = ratios.length ? ratios[ratios.length >> 1] : 1;
  medidas.factorGrosor = +kh.toFixed(3);
  const seccionG = (zg, a) => { const c = prG.at(zg); if (c.libre) return c; const h = a.h * kh; return { ...c, h, c: c.top - h / 2 }; };
  // ---- transformación axial (altura relativa dentro del grosor del cuerpo; lateral proporcional al ancho)
  const axial = (p) => {
    const zg = Wz(p[2]), a = prP.at(p[2]), c = seccionG(zg, a);
    const rel = clamp((p[1] - a.c) / a.h, -2.5, 2.5);
    return [c.cx + (p[0] - a.cx) * (c.hw / a.hw), c.c + rel * c.h, zg];
  };
  const N = {};
  for (const s of specs) N[s.nombre] = axial(s.pos);
  // ---- cadenas del cuerpo: cada articulación se centra en la sección perpendicular a la cadena
  // (el tronco —caderas y columna— conserva la altura relativa de la procedural: ahí se enganchan las patas y la franja incluye sus raíces)
  const cad = CADENA_CUERPO(nombres), TRONCO = new Set(['hips', 'spine1', 'spine2']);
  for (let pasada = 0; pasada < 2; pasada++) for (let i = 0; i < cad.length; i++) {
    if (TRONCO.has(cad[i]) && !volador && plantilla !== 'acuatico') continue;
    const nm = cad[i], prev = N[cad[Math.max(0, i - 1)]], next = N[cad[Math.min(cad.length - 1, i + 1)]];
    const dir = norm(sub(next, prev)), seg = Math.max(0.02 * L, len(sub(next, prev)) / 2);
    const c = prG.at(N[nm][2]), r = Math.max(Math.min(c.h, 2 * c.hw) * 0.7, 0.03 * L);
    N[nm] = centrarEnSeccion(Gm, N[nm], dir, r, seg * 0.45, volador ? (v) => Math.abs(v[0]) < prG.at(v[2]).hw * 1.2 : (v) => v[1] > 0.12 * c.top);
  }
  // ---- patas: marco cadera → apoyo, con las proporciones y el sentido de la rodilla de la procedural
  const puntas = {}, radios = {};
  for (const pt of patas) {
    const lado = pt.lado, del = pt.delante ? 1 : 0;
    const gP = apP?.get(`${lado}|${del}`), gG = apG?.get(`${lado}|${del}`);
    const H0 = J[pt.thigh], K0 = J[pt.shin], A0 = J[pt.foot], T0 = [pt.toe.x, pt.toe.y, pt.toe.z];
    // cadera: a la altura y z de la transformación axial, y en la vertical del apoyo (corregida por la separación de la procedural)
    if (!gP || !gG) {
      medidas.avisos = [...(medidas.avisos ?? []), `${pt.name}: apoyo no encontrado (pata por transformación axial)`];
      pt.toeMalla = axial(T0); continue;
    }
    const F0 = [gP.x, 0, gP.z], F1 = [gG.x, 0, gG.z];
    const H1 = N[pt.thigh].slice();
    H1[0] = F1[0] + (H0[0] - F0[0]) * (Math.abs(F1[0]) / Math.max(1e-3, Math.abs(F0[0])));
    N[pt.thigh] = H1;
    const marco = (H, F) => { const u = norm(sub(F, H)); let w = norm([0, u[2], -u[1]]); if (w[2] < 0) w = mul(w, -1); return { u, w, l: len(sub(F, H)) }; };
    const m0 = marco(H0, F0), m1 = marco(H1, F1);
    const llevar = (P) => {
      const d = sub(P, H0), t = dot(d, m0.u) / m0.l, nn = dot(d, m0.w) / m0.l;
      const q = add(H1, add(mul(m1.u, t * m1.l), mul(m1.w, nn * m1.l)));
      q[0] = H1[0] + (P[0] - H0[0]) * (Math.abs(F1[0] - H1[0]) > 1e-3 && Math.abs(F0[0] - H0[0]) > 1e-3 ? (F1[0] - H1[0]) / (F0[0] - H0[0]) : 1);
      return q;
    };
    N[pt.shin] = llevar(K0); N[pt.foot] = llevar(A0);
    // la punta es el CONTACTO con el suelo: a la altura de lo más bajo del apoyo (la IK la deja 2 cm sobre el terreno)
    let yMin = Infinity; for (const v of gG.vs) yMin = Math.min(yMin, Gm[v * 3 + 1]);
    const T1 = llevar(T0); T1[1] = Math.max(0, Number.isFinite(yMin) ? yMin : 0) + 0.002 * L;
    T1[2] = Math.max(T1[2], gG.z1 - 0.02 * L); // la punta llega a lo más adelantado del apoyo
    pt.toeMalla = T1;
    // el tobillo y la rodilla, centrados en la sección de la pata (la procedural puede tener la pata más o menos gruesa)
    for (const [nm, a, c] of [[pt.shin, N[pt.thigh], N[pt.foot]], [pt.foot, N[pt.shin], T1]]) {
      const dir = norm(sub(c, a)), rr = 0.06 * L;
      N[nm] = centrarEnSeccion(Gm, N[nm], dir, rr, 0.02 * L, (v) => Math.sign(v[0] - prG.at(v[2]).cx) === lado && v[1] < H1[1]);
    }
  }
  // apoyos en reposo simétricos: si la malla está a mitad de zancada, la IK lleva los pies a una postura simétrica (el hueso sigue en la malla)
  for (const del of [false, true]) {
    const par = patas.filter((p) => p.delante === del && p.toeMalla);
    if (par.length !== 2) { for (const p of par) p.toeReposo = p.toeMalla; continue; }
    const z = (par[0].toeMalla[2] + par[1].toeMalla[2]) / 2, x = (Math.abs(par[0].toeMalla[0]) + Math.abs(par[1].toeMalla[0])) / 2, y = (par[0].toeMalla[1] + par[1].toeMalla[1]) / 2;
    for (const p of par) p.toeReposo = [x * p.lado, y, z];
  }
  // ---- puntas de los huesos finales del cuerpo: hocico y punta de la cola (lo más adelantado / atrasado cerca del eje)
  const extremo = (signo, filtro) => { let best = null; for (let i = 0; i < Gm.length; i += 3) { if (volador && Math.abs(Gm[i]) > prG.at(Gm[i + 2]).hw * 1.5) continue; const v = [Gm[i], Gm[i + 1], Gm[i + 2]]; if (filtro && !filtro(v)) continue; if (!best || (signo > 0 ? v[2] > best[2] : v[2] < best[2])) best = v; } return best; };
  // hocico: lo más adelantado CERCA DE LA CABEZA (las garras o los cuernos pueden llegar más lejos)
  const hc = N.head, hs = prG.at(hc[2]), rCab = Math.max(0.6 * hs.h, 0.04 * L);
  const hocico = extremo(1, (v) => v[2] > hc[2] && Math.abs(v[1] - hc[1]) < rCab && Math.abs(v[0] - hc[0]) < rCab) ?? extremo(1), colaP = extremo(-1);
  puntas.head = [hocico[0], lerp(hocico[1], prG.at(hocico[2] - 0.02 * L).c, 0.5), hocico[2]];
  const ultimaCola = ['fluke', 'tail5', 'tail4', 'tail3', 'tail2', 'tail'].find((n) => nombres.includes(n));
  if (ultimaCola) puntas[ultimaCola] = [colaP[0], lerp(colaP[1], prG.at(colaP[2] + 0.02 * L).c, 0.5), colaP[2]];
  // ---- brazos (bípedos): desde la columna (spine2) con la proporción de grosor del pecho; mano = codo + antebrazo
  if (N.spine2 && N.armL) {
    const a = prP.at(J.spine2[2]), c = seccionG(N.spine2[2], a), sR = clamp(c.h / a.h, 0.5, 2.5), sX = clamp(c.hw / a.hw, 0.5, 2.5);
    const desde = (P) => { const d = sub(P, J.spine2); return add(N.spine2, [d[0] * sX, d[1] * sR, d[2] * sR]); };
    for (const sd of ['L', 'R']) {
      const a0 = J[`arm${sd}`], e0 = J[`forearm${sd}`];
      N[`arm${sd}`] = desde(a0); N[`forearm${sd}`] = desde(e0);
      puntas[`forearm${sd}`] = desde(add(e0, mul(sub(e0, a0), 1.1)));
      puntas[`forearm${sd}`][1] = Math.max(puntas[`forearm${sd}`][1], 0.03 * L);
    }
  }
  // ---- alas (pterosaurios): fracción de envergadura y borde de ataque
  if (volador) {
    const semi = semiEnv(Gm), semiP = semiEnv(Pm);
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      for (const nm of [`el${sd}`, `wr${sd}`, `fg${sd}`]) {
        if (!J[nm]) continue;
        const x = (J[nm][0] / semiP) * semi, banda = 0.03 * semi;
        let zl = -Infinity; const ys = [];
        for (let i = 0; i < Gm.length; i += 3) if (Math.abs(Gm[i] - x) < banda) zl = Math.max(zl, Gm[i + 2]);
        for (let i = 0; i < Gm.length; i += 3) if (Math.abs(Gm[i] - x) < banda && Gm[i + 2] > zl - 0.06 * semi) ys.push(Gm[i + 1]);
        ys.sort((p, q) => p - q);
        if (Number.isFinite(zl)) N[nm] = [x, ys.length ? ys[ys.length >> 1] : N[nm][1], zl - 0.015 * semi];
      }
      let tip = null; for (let i = 0; i < Gm.length; i += 3) if (Math.sign(Gm[i]) === sg && (!tip || Math.abs(Gm[i]) > Math.abs(tip[0]))) tip = [Gm[i], Gm[i + 1], Gm[i + 2]];
      puntas[[`fg${sd}`, `wr${sd}`].find((n) => J[n])] = tip;
      if (J[`legU${sd}`]) puntas[`legU${sd}`] = axial(add(J[`legU${sd}`], [0, -0.3 * Math.abs(J[`legU${sd}`][0]) - 0.05, -0.05]));
    }
  }
  // ---- aletas (acuáticos): raíz y mitad por la transformación axial; punta = lo más alejado del cuerpo en ese tramo
  if (plantilla === 'acuatico') {
    for (const nm of nombres.filter((n) => /^fl[FH][LR]1$/.test(n))) {
      const nm2 = nm.replace(/1$/, '2'), sg = nm[3] === 'L' ? 1 : -1, z = N[nm][2], banda = 0.1 * L;
      let tip = null, dmax = 0;
      for (let i = 0; i < Gm.length; i += 3) {
        if (Math.sign(Gm[i]) !== sg || Math.abs(Gm[i + 2] - z) > banda) continue;
        const d = Math.abs(Gm[i]) + 0.3 * Math.abs(Gm[i + 2] - z) * 0;
        if (d > dmax) { dmax = d; tip = [Gm[i], Gm[i + 1], Gm[i + 2]]; }
      }
      if (tip) { puntas[nm2] = tip; if (N[nm2]) N[nm2] = [lerp(N[nm][0], tip[0], 0.5), lerp(N[nm][1], tip[1], 0.5), lerp(N[nm][2], tip[2], 0.5)]; }
    }
    if (N.dorsal) { let top = null; for (let i = 0; i < Gm.length; i += 3) if (!top || Gm[i + 1] > top[1]) top = [Gm[i], Gm[i + 1], Gm[i + 2]]; puntas.dorsal = top; }
  }
  // ---- radios de las extremidades (para los pesos de piel)
  for (const pt of patas) radios[pt.thigh] = radioSegmento(Gm, N[pt.thigh], N[pt.shin], pt.lado, 0.25 * L);
  // ---- salida
  const huesos = specs.map((s) => ({ nombre: s.nombre, padre: s.padre, pos: r4(N[s.nombre]) }));
  const patasOut = patas.map((pt) => ({ name: pt.name, thigh: pt.thigh, shin: pt.shin, foot: pt.foot, phase: pt.phase, bendFwd: pt.bendFwd, quad: pt.quad, toe: r4(pt.toeReposo ?? pt.toeMalla ?? N[pt.foot]), toeMalla: r4(pt.toeMalla ?? N[pt.foot]) }));
  for (const k of Object.keys(puntas)) puntas[k] = r4(puntas[k]);
  const dist = (a, c) => len(sub(a, c));
  medidas.caderaY = +N.hips[1].toFixed(3); medidas.caderaYProcedural = +J.hips[1].toFixed(3);
  medidas.largoPatas = Object.fromEntries(patas.map((pt) => [pt.name, +(dist(N[pt.thigh], N[pt.shin]) + dist(N[pt.shin], N[pt.foot])).toFixed(3)]));
  medidas.largoPatasProcedural = Object.fromEntries(patas.map((pt) => [pt.name, +(dist(J[pt.thigh], J[pt.shin]) + dist(J[pt.shin], J[pt.foot])).toFixed(3)]));
  return { huesos, patas: patasOut, puntas, radios: Object.fromEntries(Object.entries(radios).map(([k, v]) => [k, +v.toFixed(4)])), medidas };
}

// ------------------------------------------------------------------------------------------------ hoja de control
async function hoja(G, rig, archivo, titulo) {
  const S = 360, vistas = [[2, 1], [0, 2], [0, 1]], imgs = [];
  const [a, b] = caja(G.pos), L = Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const centro = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const huesos = Object.fromEntries(rig.huesos.map((h) => [h.nombre, h]));
  for (const [hx, vy] of vistas) {
    const img = new Uint8Array(S * S * 3).fill(24), prof = 3 - hx - vy;
    const P = (v) => [Math.round(((v[hx] - centro[hx]) / L * 0.92 + 0.5) * (S - 1)), Math.round((0.5 - (v[vy] - centro[vy]) / L * 0.92 * (vy === 2 ? -1 : 1)) * (S - 1))];
    for (let i = 0; i < G.pos.length; i += 3) {
      const v = [G.pos[i], G.pos[i + 1], G.pos[i + 2]], [x, y] = P(v);
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const d = (v[prof] - a[prof]) / ((b[prof] - a[prof]) || 1), k = (y * S + x) * 3, c = 60 + d * 110;
      img[k] = Math.max(img[k], c * 0.8); img[k + 1] = Math.max(img[k + 1], c * 0.8); img[k + 2] = Math.max(img[k + 2], c);
    }
    const linea = (p, q, col) => { const [x0, y0] = P(p), [x1, y1] = P(q), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let t = 0; t <= n; t++) { const x = Math.round(lerp(x0, x1, t / n)), y = Math.round(lerp(y0, y1, t / n)); for (let ox = 0; ox <= 1; ox++) for (let oy = 0; oy <= 1; oy++) { const xx = x + ox, yy = y + oy; if (xx >= 0 && yy >= 0 && xx < S && yy < S) { const k = (yy * S + xx) * 3; img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]; } } } };
    const punto = (p, col, r = 2) => { const [x, y] = P(p); for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) { const xx = x + ox, yy = y + oy; if (xx >= 0 && yy >= 0 && xx < S && yy < S) { const k = (yy * S + xx) * 3; img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]; } } };
    const color = (n) => (/L$|L\d$/.test(n) ? [255, 90, 90] : /R$|R\d$/.test(n) ? [90, 170, 255] : /tail|fluke/.test(n) ? [255, 200, 60] : /neck|head|jaw/.test(n) ? [120, 255, 120] : [255, 255, 255]);
    for (const h of rig.huesos) if (h.padre && huesos[h.padre]) linea(huesos[h.padre].pos, h.pos, color(h.nombre));
    for (const [n, p] of Object.entries(rig.puntas)) if (huesos[n]) linea(huesos[n].pos, p, color(n).map((c) => c * 0.6));
    for (const h of rig.huesos) punto(h.pos, color(h.nombre));
    for (const pt of rig.patas) punto(pt.toe, [255, 0, 255], 3);
    imgs.push(await sharp(Buffer.from(img), { raw: { width: S, height: S, channels: 3 } }).png().toBuffer());
  }
  const svg = Buffer.from(`<svg width="${S * 3}" height="24"><rect width="100%" height="100%" fill="#111"/><text x="8" y="17" font-family="sans-serif" font-size="15" fill="#eee">${titulo}</text></svg>`);
  await sharp({ create: { width: S * 3, height: S + 24, channels: 3, background: '#000' } })
    .composite([{ input: svg, left: 0, top: 0 }, ...imgs.map((im, i) => ({ input: im, left: i * S, top: 24 }))]).png().toFile(archivo);
}

// ------------------------------------------------------------------------------------------------ escritura del GLB
async function escribirGLB(G, archivo, piel = null) {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(G.mime === 'image/webp');
  const buf = doc.createBuffer();
  const acc = (tipo, arr) => doc.createAccessor().setType(tipo).setArray(arr).setBuffer(buf);
  const tex = doc.createTexture('piel').setImage(G.img).setMimeType(G.mime);
  const mat = doc.createMaterial('piel').setBaseColorTexture(tex).setRoughnessFactor(0.85).setMetallicFactor(0);
  const nv = G.pos.length / 3;
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', G.pos)).setAttribute('NORMAL', acc('VEC3', G.nor)).setAttribute('TEXCOORD_0', acc('VEC2', G.uv))
    .setIndices(acc('SCALAR', nv < 65536 ? Uint16Array.from(G.idx) : G.idx)).setMaterial(mat);
  if (piel) { // pesos de piel precalculados (los mismos que calcularía el juego): JOINTS_0 = índice de hueso en el orden de rig.huesos
    const J = new Uint16Array(nv * 4), W = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) for (let k = 0; k < 4; k++) { J[v * 4 + k] = piel.si[v][k]; W[v * 4 + k] = piel.sw[v][k]; }
    prim.setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W));
  }
  doc.createScene('s').addChild(doc.createNode('dino').setMesh(doc.createMesh('malla').addPrimitive(prim)));
  doc.getRoot().getAsset().generator = 'isla-primordial/tools/autorig.mjs (fuente: GLB de Higgsfield/Tripo)';
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 16 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(archivo, doc);
}

// ------------------------------------------------------------------------------------------------ principal
fs.mkdirSync(SALIDA, { recursive: true }); fs.mkdirSync(HOJAS, { recursive: true });
const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).filter((id) => !IDS.length || IDS.includes(id));
const resumenTodo = {};
for (const id of archivos) {
  const sp = SPECIES[id];
  if (!sp) { console.log(`${id}: no es una especie del juego; se omite`); continue; }
  if (EXCLUIR[id] && !flag('incluir-excluidos')) { console.log(`– ${id}: no se integra — ${EXCLUIR[id]}`); resumenTodo[id] = { excluido: EXCLUIR[id] }; continue; }
  try {
    const b = sp.build();
    const plantilla = plantillaDe(id, b), L = POR_ID[id].tamano;
    let G = await leerGLB(path.join(DIR, `${id}.glb`));
    const trisOrig = G.idx.length / 3;
    const orient = normalizar(G, id, plantilla, L);
    G = simplificar(G, TRIS);
    const Pidx = b.geo.index ? Uint32Array.from(b.geo.index.array) : Uint32Array.from({ length: b.geo.attributes.position.count }, (_, i) => i);
    const Pm = muestrear(Float32Array.from(b.geo.attributes.position.array), Pidx), Gm = muestrear(G.pos, G.idx);
    const rig = ajustar(id, plantilla, b, Pm, Gm);
    if (flag('depurar')) for (const h of rig.huesos) console.log('   ', h.nombre.padEnd(9), JSON.stringify(h.pos), 'proc', JSON.stringify(r4(b.specs.find((s2) => s2.name === h.nombre).pos)));
    // albedo medio (lineal) de la textura: el juego aclara las pieles muy oscuras (Tripo hornea parte de la sombra en la textura)
    const px = await sharp(Buffer.from(G.img)).removeAlpha().resize(64, 64, { fit: 'fill' }).raw().toBuffer();
    let lin = 0, nl = 0;
    for (let i = 0; i < px.length; i += 3) { const r = px[i] / 255, g2 = px[i + 1] / 255, b2 = px[i + 2] / 255; const Ls = 0.2126 * r + 0.7152 * g2 + 0.0722 * b2; if (Ls < 0.02) continue; lin += 0.2126 * r ** 2.2 + 0.7152 * g2 ** 2.2 + 0.0722 * b2 ** 2.2; nl++; }
    const salida = { version: 2, id, plantilla, unidades: 'm', fuente: `${id}.glb (Higgsfield/Tripo)`, orientacion: orient, triangulos: { original: trisOrig, juego: G.idx.length / 3 }, albedoMedio: +(lin / Math.max(1, nl)).toFixed(4), ...rig };
    // pesos de piel con la misma función que usa el juego (src/fauna/autorig.js) sobre la malla ya escrita en metros
    const indice = Object.fromEntries(salida.huesos.map((h, i) => [h.nombre, i]));
    const piel = pesosGenerales(G.pos, salida, indice, L, G.idx);
    salida.pesos = 'precalculados en el GLB (JOINTS_0/WEIGHTS_0, índices en el orden de huesos)';
    if (!flag('hoja-solo')) {
      await escribirGLB(G, path.join(SALIDA, `${id}.glb`), piel);
      fs.writeFileSync(path.join(SALIDA, `${id}.rig.json`), JSON.stringify(salida, null, 1));
    }
    await hoja(G, rig, path.join(HOJAS, `${id}.png`), `${id} · ${plantilla} · ${L} m · giro ${orient.giroGrados}° · ${G.idx.length / 3} tri · avisos: ${(rig.medidas.avisos ?? []).length}`);
    resumenTodo[id] = { plantilla, giro: orient.giroGrados, tris: G.idx.length / 3, avisos: rig.medidas.avisos ?? [], apoyos: rig.medidas.apoyos, caderaY: rig.medidas.caderaY, caderaYProcedural: rig.medidas.caderaYProcedural };
    console.log(`✔ ${id} (${plantilla}) giro ${orient.giroGrados}° · ${G.idx.length / 3} tri · cadera ${rig.medidas.caderaY} m (proc. ${rig.medidas.caderaYProcedural}) · apoyos ${JSON.stringify(rig.medidas.apoyos ?? {})}${(rig.medidas.avisos ?? []).length ? ' · AVISOS: ' + rig.medidas.avisos.join('; ') : ''}`);
  } catch (e) { console.log(`✘ ${id}: ${e.stack ?? e}`); resumenTodo[id] = { error: String(e?.message ?? e) }; }
}
fs.writeFileSync(path.join(HOJAS, 'resumen.json'), JSON.stringify(resumenTodo, null, 1));
// manifiesto para el juego: las especies con GLB y rig en public/models/fauna/hf/ (el juego no pide lo que falta)
const listos = fs.readdirSync(SALIDA).filter((f) => f.endsWith('.rig.json')).map((f) => f.slice(0, -9)).filter((id) => fs.existsSync(path.join(SALIDA, `${id}.glb`)) && !EXCLUIR[id]).sort();
fs.writeFileSync(path.join(RAIZ, 'src/fauna/estaticos-hf.js'),
  '// Especies con piel texturizada generada (Higgsfield/Tripo) y esqueleto ajustado por tools/autorig.mjs: public/models/fauna/hf/<id>.glb + <id>.rig.json.\n' +
  '// Lo reescribe tools/autorig.mjs. ?hf=0 las desactiva (vuelven a su malla procedural o a su GLB animado).\n' +
  `export const ESTATICOS_HF = ${JSON.stringify(listos)};\n`);
console.log(`manifiesto: ${listos.length} especies`);
