// OBJETOS EN LA MANO CON MODELO 3D GENERADO (Higgsfield/Tripo, public/models/objetos/<id>.glb: 1 unidad de alto, +Y arriba, mango abajo).
// Cada modelo sustituye a la malla procedural de la herramienta CONSERVANDO su marco (origen = punto de agarre, +Y hacia la cabeza):
//   · largo: el del objeto procedural (así el agarre cae en el mismo punto del mango y las posturas/golpes no cambian);
//   · eje del mango: el centro de la franja inferior del modelo se lleva al eje Y (la mano rodea el mango);
//   · giro: el eje mayor (en planta) de la cabeza se alinea con el de la procedural, y el lado hacia el que se carga la cabeza (filo del hacha) también.
// Si el modelo falta o no carga, se usa la procedural. ?objetos=0 fuerza las procedurales (para comparar).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJETOS } from './objetos-disponibles.js';

const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
// ajustes por objeto: 'medio' = se empuña por el centro (arco); voltear = el modelo viene con la cabeza abajo (honda: bolsa colgando);
// adelgazar = false: no se toca el grosor del mango (en el resto, los mangos gruesos del modelo se afinan al grosor de la procedural)
const OPCIONES = { arco: { agarre: 'medio', adelgazar: false }, honda: { voltear: true, adelgazar: false } };

/**
 * Copia «plana» del modelo: una malla por primitiva con la geometría en coma flotante y en el espacio de la raíz (sin la cuantización ni las
 * matrices de nodo del GLB), lista para medirse y deformarse. Comparte materiales y texturas con el original.
 */
function aplanar(escena) {
  escena.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(escena.matrixWorld).invert(), M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3(), g = new THREE.Group();
  escena.traverse((o) => {
    if (!o.isMesh) return;
    M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
    const src = o.geometry, geo = new THREE.BufferGeometry(), P = src.attributes.position, Nn = src.attributes.normal, U = src.attributes.uv;
    const pos = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (Nn) { const nor = new Float32Array(Nn.count * 3); for (let i = 0; i < Nn.count; i++) { v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; } geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); }
    if (U) { const uv = new Float32Array(U.count * 2); for (let i = 0; i < U.count; i++) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    if (src.index) geo.setIndex(src.index.clone());
    if (!Nn) geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, o.material); m.castShadow = m.receiveShadow = false;
    g.add(m);
  });
  return g;
}

export async function cargarObjetos3D() {
  const modelos = {}, errores = {};
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('objetos') === '0') return { modelos, errores };
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(OBJETOS.map(async (id) => {
    try {
      const g = await loader.loadAsync(`${base()}models/objetos/${id}.glb`);
      g.scene.traverse((o) => {
        const m = o.isMesh ? o.material : null;
        if (m?.isMeshStandardMaterial) { m.metalness = 0; m.envMapIntensity = 0.6; } // útiles prehistóricos: nada metálico (el canal de metal del ORM de Tripo no es fiable)
      });
      modelos[id] = aplanar(g.scene);
    } catch (e) { errores[id] = String(e?.message ?? e); }
  }));
  if (Object.keys(errores).length) console.warn('[objetos] modelos que no cargaron (se usa la malla procedural):', errores);
  return { modelos, errores };
}

/** Vértices (muestreados) de `obj` en su propio espacio, incluidas las matrices internas (cuantización del GLB). */
function puntos(obj, max = 6000) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3(), out = [];
  let total = 0;
  obj.traverse((o) => { if (o.isMesh) total += o.geometry.attributes.position.count; });
  const paso = Math.max(1, Math.floor(total / max));
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position;
    M.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < P.count; i += paso) { v.fromBufferAttribute(P, i).applyMatrix4(M); out.push(v.x, v.y, v.z); }
  });
  return out;
}

/** Medidas de un objeto empuñable: alto, eje del mango, radio del mango y orientación de la cabeza en planta. */
export function medirEmpunable(pts, { agarre = 'abajo' } = {}) {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < pts.length; i += 3) { y0 = Math.min(y0, pts[i]); y1 = Math.max(y1, pts[i]); }
  const H = y1 - y0;
  const banda = agarre === 'medio' ? [y0 + H * 0.42, y0 + H * 0.58] : [y0 + H * 0.04, y0 + H * 0.24];
  let hx = 0, hz = 0, n = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= banda[0] && pts[i + 1] <= banda[1]) { hx += pts[i]; hz += pts[i + 2]; n++; }
  if (n) { hx /= n; hz /= n; }
  let r = 0, nr = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= banda[0] && pts[i + 1] <= banda[1]) { r += Math.hypot(pts[i] - hx, pts[i + 2] - hz); nr++; }
  r = nr ? r / nr : 0;
  // cabeza: el tramo superior (más corto en los objetos largos, para que el asta no domine); en el arco, todo
  const frac = agarre === 'medio' ? 1 : H > 1.2 ? 0.14 : 0.3, yc = y1 - H * frac;
  let cx = 0, cz = 0, m = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= yc) { cx += pts[i] - hx; cz += pts[i + 2] - hz; m++; }
  cx /= m || 1; cz /= m || 1;
  let sxx = 0, szz = 0, sxz = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= yc) { const dx = pts[i] - hx - cx, dz = pts[i + 2] - hz - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz); // eje mayor en planta (x,z)
  const ax = Math.cos(ang), az = Math.sin(ang);
  let ext = 0;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= yc) ext = Math.max(ext, Math.abs((pts[i] - hx) * ax + (pts[i + 2] - hz) * az));
  const desv = cx * ax + cz * az; // hacia qué lado del eje mayor se carga la cabeza
  const elong = Math.sqrt(Math.max(sxx, szz) / Math.max(1e-9, Math.min(sxx, szz)));
  return { y0, y1, H, hx, hz, r, ang, desv, ext, elong };
}

/** Radio del contorno (percentil 80 de la distancia al eje del mango) en `n` franjas de altura. */
function perfilRadial(pts, m, n = 48) {
  const bins = Array.from({ length: n }, () => []);
  for (let i = 0; i < pts.length; i += 3) {
    const b = Math.min(n - 1, Math.max(0, Math.floor(((pts[i + 1] - m.y0) / m.H) * n)));
    bins[b].push(Math.hypot(pts[i] - m.hx, pts[i + 2] - m.hz));
  }
  return bins.map((b) => { if (!b.length) return 0; b.sort((p, q) => p - q); return b[Math.floor(b.length * 0.8)]; });
}

/**
 * Afina el mango: los vértices por debajo de la cabeza se acercan al eje (factor `k`); en los últimos `trans` de altura antes de la cabeza
 * el factor vuelve a 1 de forma suave (la cabeza y sus ataduras quedan intactas).
 */
function adelgazar(grupo, m, yCabeza, k, trans) {
  for (const o of grupo.children) {
    const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), t = Math.min(1, Math.max(0, (yCabeza - y) / trans)), f = 1 - (1 - k) * t * t * (3 - 2 * t);
      if (f >= 0.999) continue;
      P.setX(i, m.hx + (P.getX(i) - m.hx) * f); P.setZ(i, m.hz + (P.getZ(i) - m.hz) * f);
    }
    P.needsUpdate = true; o.geometry.computeBoundingSphere();
  }
}

/**
 * Devuelve un grupo con el modelo colocado en el marco de la herramienta procedural `proc` (que no se modifica).
 * El grupo hereda `proc.userData` (punta del arma, etc.) y guarda en userData.ajuste las medidas (para pruebas e informe).
 */
export function ajustarAHerramienta(id, modelo, proc) {
  const op = OPCIONES[id] ?? {};
  const mp = medirEmpunable(puntos(proc), op);
  // copia con geometría propia (se deforma) y materiales compartidos
  const inner = new THREE.Group();
  for (const o of modelo.children) { const c = new THREE.Mesh(o.geometry.clone(), o.material); c.castShadow = c.receiveShadow = false; inner.add(c); }
  if (op.voltear) for (const o of inner.children) o.geometry.rotateZ(Math.PI); // la geometría ya está en el espacio del modelo
  const crudo = puntos(inner, 12000);
  const mg = medirEmpunable(crudo, op);
  // mango: si el del modelo es mucho más grueso que el de la procedural (la mano no lo rodearía), se afina por debajo de la cabeza
  let afinado = 1, yCabeza = null;
  if (op.adelgazar !== false && mg.r > 0) {
    const perfil = perfilRadial(crudo, mg), n = perfil.length;
    let b = Math.ceil(n * 0.26);
    while (b < n && perfil[b] < mg.r * 1.8) b++;
    yCabeza = mg.y0 + (b / n) * mg.H;
    const s0 = mp.H / Math.max(1e-6, mg.H), objetivo = (mp.r * 1.12) / s0; // radio del mango procedural (algo holgado), en unidades del modelo
    afinado = Math.min(1, Math.max(0.3, objetivo / mg.r));
    if (afinado < 0.97 && yCabeza > mg.y0 + mg.H * 0.2) adelgazar(inner, mg, yCabeza, afinado, Math.min(mg.H * 0.08, (yCabeza - mg.y0) * 0.3));
    else afinado = 1;
  }
  let giro = mp.ang - mg.ang;
  // el sentido solo importa si la cabeza está claramente cargada hacia un lado y es alargada (hacha, cuchillo curvo); si es simétrica, da igual
  const decide = Math.abs(mp.desv) > 0.12 * mp.ext && Math.abs(mg.desv) > 0.12 * mg.ext && mp.elong > 1.3 && mg.elong > 1.3;
  if (decide && Math.sign(mp.desv) !== Math.sign(mg.desv)) giro += Math.PI;
  const s = mp.H / Math.max(1e-6, mg.H);
  const M = new THREE.Matrix4()
    .makeTranslation(0, mp.y0 - mg.y0 * s, 0)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeRotationY(-giro)) // three: rotación +θ lleva x→-z; el ángulo medido es atan2(z, x)
    .multiply(new THREE.Matrix4().makeTranslation(-mg.hx, 0, -mg.hz));
  inner.matrixAutoUpdate = false; inner.matrix.copy(M);
  const g = new THREE.Group();
  g.add(inner);
  g.userData = { ...proc.userData, ajuste: { escala: +s.toFixed(4), giro: +(giro * 180 / Math.PI).toFixed(1), radioMango: +(mg.r * s * afinado).toFixed(4), radioMangoModelo: +(mg.r * s).toFixed(4), radioProcedural: +mp.r.toFixed(4), afinado: +afinado.toFixed(3), cabeza: yCabeza == null ? null : +((yCabeza - mg.y0) / mg.H).toFixed(3), decide, largo: +mp.H.toFixed(3) } };
  return g;
}
