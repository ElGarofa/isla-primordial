// PIELES TEXTURIZADAS SOBRE EL ESQUELETO DE LA ESPECIE (rig versión 2, generado por tools/autorig.mjs).
//
// El modelo (GLB de Higgsfield/Tripo ya orientado, simplificado y en metros) trae su textura y sus UV; el rig trae las articulaciones del
// esqueleto procedural de la especie (mismos nombres y jerarquía) colocadas sobre la malla, las puntas de los huesos finales y los apoyos de
// las patas. Aquí, una vez por especie al cargar:
//   · pesos de piel GENERALES (sirven para bípedos, cuadrúpedos, voladores y nadadores): el cuerpo (cadena cola–caderas–columna–cuello–cabeza)
//     y cada extremidad (pata trasera, pata delantera, brazo, ala, patita, aleta) son sistemas separados; cada vértice pertenece a una
//     extremidad en la medida en que está de su lado, más cerca de ella que del cuerpo y a su alcance (radio medido en la malla); dentro de
//     cada sistema el peso se reparte entre los huesos más cercanos con una franja de mezcla (rodillas y codos doblan suave);
//   · geometría indexada con la textura original (sin color de vértice) y esferas de impacto ajustadas a la malla.
// La mandíbula no se abre (no hay boca separada en el modelo): toda la cabeza va al hueso `head`.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Tipo de extremidad de un hueso (o null si es del cuerpo) y su lado (+1 izquierda, -1 derecha). */
export function extremidad(n) {
  let m = /^(thigh|shin|foot)([LR])$/.exec(n); if (m) return { tipo: 'pata', lado: m[2] === 'L' ? 1 : -1 };
  m = /^(fup|flow|ffoot)([LR])$/.exec(n); if (m) return { tipo: 'mano', lado: m[2] === 'L' ? 1 : -1 };
  m = /^(arm|forearm)([LR])$/.exec(n); if (m) return { tipo: 'brazo', lado: m[2] === 'L' ? 1 : -1 };
  m = /^(sh|el|wr|fg)([LR])$/.exec(n); if (m) return { tipo: 'ala', lado: m[2] === 'L' ? 1 : -1 };
  m = /^legU([LR])$/.exec(n); if (m) return { tipo: 'patita', lado: m[1] === 'L' ? 1 : -1 };
  m = /^fl([FH])([LR])[12]$/.exec(n); if (m) return { tipo: `aleta${m[1]}`, lado: m[2] === 'L' ? 1 : -1 };
  return null;
}

function distSeg(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz || 1e-9;
  const t = clamp(((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2, 0, 1);
  return Math.hypot(x - (a[0] + bx * t), y - (a[1] + by * t), z - (a[2] + bz * t));
}

/** Segmentos de cada hueso: de su articulación a la del hijo de su misma cadena (o a su punta, si es el último). */
export function segmentos(rig) {
  const P = Object.fromEntries(rig.huesos.map((h) => [h.nombre, h.pos])), hijos = {};
  for (const h of rig.huesos) if (h.padre) (hijos[h.padre] ??= []).push(h.nombre);
  const out = {};
  const ORDEN_CUERPO = ['spine1', 'spine2', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'head'];
  for (const h of rig.huesos) {
    const n = h.nombre, ex = extremidad(n), segs = [];
    if (n === 'jaw') continue; // sin boca separada: la cabeza entera es del hueso `head`
    let hijo = null;
    if (ex) hijo = (hijos[n] ?? []).find((c) => extremidad(c)?.tipo === ex.tipo && extremidad(c)?.lado === ex.lado) ?? null;
    else if (n === 'hips') { hijo = (hijos[n] ?? []).find((c) => ORDEN_CUERPO.includes(c)) ?? null; const cola = (hijos[n] ?? []).find((c) => /^tail/.test(c)); if (cola) segs.push([P[cola], P[n]]); }
    else hijo = (hijos[n] ?? []).find((c) => !extremidad(c) && c !== 'jaw' && c !== 'dorsal' && c !== 'fluke') ?? (hijos[n] ?? []).find((c) => c === 'fluke') ?? null;
    if (hijo) segs.push([P[n], P[hijo]]);
    const punta = rig.puntas?.[n] ?? (ex && (ex.tipo === 'pata' || ex.tipo === 'mano') ? rig.patas?.find((p) => p.foot === n)?.toeMalla : null);
    if (!hijo && punta) segs.push([P[n], punta]);
    if (!segs.length) segs.push([P[n], P[n]]);
    out[n] = { segs, ex };
  }
  return out;
}

/**
 * Pesos de piel generales. `pos`: posiciones (m, Float32Array). Devuelve { si, sw } (arrays de 4 por vértice).
 * L: tamaño del animal (m) para las franjas de mezcla.
 */
/** Grafo de la superficie: vértices soldados por posición (las costuras de UV duplican vértices) y aristas con su longitud. */
function grafoSuperficie(pos, idx) {
  const n = pos.length / 3, nodo = new Int32Array(n), mapa = new Map(); let nn = 0;
  for (let i = 0; i < n; i++) { const k = `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`; let id = mapa.get(k); if (id === undefined) { id = nn++; mapa.set(k, id); } nodo[i] = id; }
  const rep = new Int32Array(nn); for (let i = n - 1; i >= 0; i--) rep[nodo[i]] = i;
  const ady = Array.from({ length: nn }, () => []);
  const une = (a, b) => { const A = nodo[a], B = nodo[b]; if (A === B) return; const l = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); ady[A].push(B, l); ady[B].push(A, l); };
  for (let t = 0; t < idx.length; t += 3) { une(idx[t], idx[t + 1]); une(idx[t + 1], idx[t + 2]); une(idx[t + 2], idx[t]); }
  return { nodo, nn, ady, rep };
}
/** Distancia geodésica (Dijkstra con montículo binario) desde un conjunto de nodos fuente. */
function geodesica(G, fuentes) {
  // (Float64: con Float32 el redondeo hace que una arista «mejore» una y otra vez y Dijkstra no termina)
  const d = new Float64Array(G.nn).fill(Infinity), heap = [], push = (k, v) => { heap.push([k, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const f of fuentes) if (d[f] > 0) { d[f] = 0; push(0, f); }
  while (heap.length) { const [dv, v] = pop(); if (dv > d[v]) continue; const a = G.ady[v]; for (let j = 0; j < a.length; j += 2) { const u = a[j], nd = dv + a[j + 1]; if (nd < d[u]) { d[u] = nd; push(nd, u); } } }
  return d;
}

export function pesosGenerales(pos, rig, indice, L, idx = null) {
  const S = segmentos(rig), cuerpo = [], limbs = new Map();
  for (const [n, s] of Object.entries(S)) {
    if (indice[n] == null) continue;
    if (!s.ex) { cuerpo.push({ i: indice[n], segs: s.segs }); continue; }
    const key = `${s.ex.tipo}${s.ex.lado}`;
    if (!limbs.has(key)) limbs.set(key, { tipo: s.ex.tipo, lado: s.ex.lado, huesos: [], raiz: null });
    limbs.get(key).huesos.push({ i: indice[n], segs: s.segs, nombre: n });
  }
  // raíz y radio de cada extremidad: radio medido en el autorig para las patas; el resto, proporcional a su largo
  for (const lb of limbs.values()) {
    lb.raiz = lb.huesos[0].segs[0][0];
    let largo = 0; for (const h of lb.huesos) for (const [a, b] of h.segs) largo += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    lb.largo = largo;
    const medido = rig.radios?.[lb.huesos[0].nombre];
    lb.radio = medido ?? (lb.tipo === 'ala' ? 0.22 * largo : lb.tipo.startsWith('aleta') ? 0.45 * largo : lb.tipo === 'brazo' ? 0.18 * largo : 0.16 * largo);
    lb.mezcla = Math.max(0.01 * L, 0.35 * Math.min(lb.radio, 0.25 * largo));
  }
  const mezclaCuerpo = 0.035 * L, buf = new Float32Array(64);
  const reparto = (tabla, x, y, z, mezcla) => {
    let dmin = Infinity;
    for (let t = 0; t < tabla.length; t++) { let d = Infinity; for (const [a, b] of tabla[t].segs) d = Math.min(d, distSeg(x, y, z, a, b)); buf[t] = d; if (d < dmin) dmin = d; }
    const out = []; let sum = 0;
    for (let t = 0; t < tabla.length; t++) { const f = Math.max(0, 1 - (buf[t] - dmin) / mezcla); if (f > 0) { out.push([tabla[t].i, f * f]); sum += f * f; } }
    for (const e of out) e[1] /= sum;
    return { out, dmin };
  };
  // punto más cercano de la cadena del cuerpo (para saber de qué lado de la línea media está un vértice)
  const cercanoCuerpo = (x, y, z) => {
    let best = Infinity, bx = 0;
    for (const c of cuerpo) for (const [a, b] of c.segs) {
      const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], l2 = vx * vx + vy * vy + vz * vz || 1e-9;
      const t = clamp(((x - a[0]) * vx + (y - a[1]) * vy + (z - a[2]) * vz) / l2, 0, 1), px = a[0] + vx * t, py = a[1] + vy * t, pz = a[2] + vz * t;
      const d = Math.hypot(x - px, y - py, z - pz); if (d < best) { best = d; bx = px; }
    }
    return { d: best, x: bx };
  };
  const n = pos.length / 3, si = new Array(n), sw = new Array(n), lista = [...limbs.values()];
  // ---- etiquetas por la superficie (geodésicas): un vértice «claramente» de una cadena (mucho más cerca de ella que de cualquier otra) siembra
  // su región; el resto toma la región más cercana CAMINANDO POR LA PIEL. Así una mano apoyada junto a la rodilla sigue al brazo (por la
  // superficie está lejos de la pierna) y la cara interna del muslo no se pega a la otra pierna aunque estén a centímetros en el aire.
  let geo = null;
  if (idx && lista.length) {
    const G = grafoSuperficie(pos, idx), dist = (tabla, x, y, z) => { let d = Infinity; for (const h of tabla) for (const [a, b] of h.segs) d = Math.min(d, distSeg(x, y, z, a, b)); return d; };
    const semillas = lista.map(() => []), semCuerpo = [];
    for (let k = 0; k < G.nn; k++) {
      const v = G.rep[k], x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const dc = dist(cuerpo, x, y, z), dl = lista.map((lb) => dist(lb.huesos, x, y, z));
      let b = 0; for (let i = 1; i < dl.length; i++) if (dl[i] < dl[b]) b = i;
      const otra = Math.min(dc, ...dl.filter((_, i) => i !== b));
      const raiz = Math.hypot(x - lista[b].raiz[0], y - lista[b].raiz[1], z - lista[b].raiz[2]);
      if (dl[b] < 0.5 * otra && dl[b] < 1.2 * lista[b].radio && raiz > 0.7 * lista[b].radio) semillas[b].push(k);
      else if (dc < 0.55 * Math.min(...dl)) semCuerpo.push(k);
    }
    geo = { G, cuerpo: geodesica(G, semCuerpo), limbs: semillas.map((sm) => (sm.length > 4 ? geodesica(G, sm) : null)) };
  }
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const cc = cercanoCuerpo(x, y, z), acc = new Map();
    const lam = [];
    let suma = 0;
    for (const lb of lista) {
      const r = reparto(lb.huesos, x, y, z, lb.mezcla);
      // (sin prueba de «lado» respecto a la línea media: en una malla en pose de carrera una pata puede quedar bajo el eje; la exclusividad
      // de abajo ya separa izquierda de derecha por cercanía)
      const margen = Math.max(0.006 * L, 0.55 * lb.radio); // franja ancha: la unión pata–cuerpo reparte el giro entre más vértices
      const cerca = sstep(-margen, margen, cc.d - r.dmin);
      const alcance = lb.tipo === 'ala' ? 1 : 1 - sstep(1.05 * lb.radio, 1.7 * lb.radio, r.dmin);
      lam.push([cerca * alcance, r.out, r.dmin, lb]);
    }
    // EXCLUSIVIDAD: un vértice es del cuerpo y, como mucho, de UNA extremidad. Si está casi igual de cerca de dos (entre las dos patas
    // delanteras, el brazo pegado al muslo...), no es claramente de ninguna y pasa al cuerpo: si no, al moverse cada una en su fase, lo desgarran.
    let mejor = -1;
    if (geo) {
      // por la piel: la extremidad geodésicamente más cercana, y cuánto más cerca está que el cuerpo
      const k = geo.G.nodo[v], gc = geo.cuerpo[k];
      let g1 = Infinity, g2 = Infinity;
      // (una extremidad sin semillas —muy fina o mal ajustada— usa su distancia en el aire como si fuera por la piel)
      for (let i = 0; i < lam.length; i++) { const gi = geo.limbs[i] ? geo.limbs[i][k] : lam[i][2]; if (gi < g1) { g2 = g1; g1 = gi; mejor = i; } else if (gi < g2) g2 = gi; }
      if (mejor >= 0 && Number.isFinite(g1)) {
        const lb = lam[mejor][3], m = Math.max(0.008 * L, 0.8 * lb.radio), m2 = Math.max(0.006 * L, 0.45 * lb.radio);
        // frente al cuerpo (franja ancha: la raíz de la pata reparte el giro entre muchos vértices) y frente a la otra extremidad
        const lim = sstep(-m, m, (Number.isFinite(gc) ? gc : 1e9) - g1) * sstep(0, m2, g2 - g1);
        const alcance = lb.tipo === 'ala' ? 1 : 1 - sstep(2.2 * lb.radio, 3.2 * lb.radio, lam[mejor][2]);
        for (let i = 0; i < lam.length; i++) lam[i][0] = i === mejor ? lim * alcance : 0;
        suma = lam[mejor][0];
      } else mejor = -1;
    }
    if (!geo || mejor < 0) {
      mejor = -1;
      for (let i = 0; i < lam.length; i++) if (lam[i][0] > 1e-4 && (mejor < 0 || lam[i][2] < lam[mejor][2])) mejor = i;
      if (mejor >= 0) {
        let d2 = Infinity; for (let i = 0; i < lam.length; i++) if (i !== mejor && lam[i][0] > 1e-4) d2 = Math.min(d2, lam[i][2]);
        const m = Math.max(0.004 * L, 0.35 * lam[mejor][3].radio);
        for (let i = 0; i < lam.length; i++) if (i !== mejor) lam[i][0] = 0;
        if (Number.isFinite(d2)) lam[mejor][0] *= sstep(0, m, d2 - lam[mejor][2]);
        suma = lam[mejor][0];
      } else suma = 0;
    }
    const k = suma > 1 ? 1 / suma : 1;
    const resto = 1 - suma * k;
    const add = (b, w) => { if (w > 1e-5) acc.set(b, (acc.get(b) ?? 0) + w); };
    if (resto > 1e-4) for (const [b, w] of reparto(cuerpo, x, y, z, mezclaCuerpo).out) add(b, w * resto);
    for (const [l, out] of lam) if (l * k > 1e-4) for (const [b, w] of out) add(b, w * l * k);
    const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4), tot = top.reduce((s, e) => s + e[1], 0) || 1;
    si[v] = [0, 0, 0, 0]; sw[v] = [0, 0, 0, 0];
    top.forEach(([b, w], i) => { si[v][i] = b; sw[v][i] = w / tot; });
    if (!top.length) { si[v][0] = indice.hips; sw[v][0] = 1; }
  }
  return { si, sw };
}

/** Grupos de huesos para las esferas de impacto según la plantilla. */
export function gruposImpacto(plantilla, nombres) {
  const hay = (n) => nombres.includes(n), cuello = nombres.filter((n) => /^neck\d$/.test(n)), cola = nombres.filter((n) => /^tail\d?$/.test(n) || n === 'fluke');
  // cuerpos largos (cuadrúpedos y nadadores) llevan tres esferas en el tronco; los cuellos de dos huesos, dos (galimimo, terizinosaurio)
  const g = [{ huesos: ['hips', 'spine1', 'spine2'].filter(hay), n: plantilla === 'cuadrupedo' || plantilla === 'acuatico' ? 3 : 2 }];
  if (cuello.length) g.push({ huesos: cuello, n: cuello.length > 2 ? 3 : cuello.length });
  g.push({ huesos: ['head'] });
  if (cola.length) { const m = Math.ceil(cola.length / 2); g.push({ huesos: cola.slice(0, m), n: 1 }, { huesos: cola.slice(m), n: 1 }); }
  for (const sd of ['L', 'R']) {
    if (plantilla === 'pterosaurio') g.push({ huesos: [`sh${sd}`, `el${sd}`, `wr${sd}`, `fg${sd}`].filter(hay), lado: true, n: 3 });
    else if (plantilla === 'acuatico') { for (const p of ['F', 'H']) if (hay(`fl${p}${sd}1`)) g.push({ huesos: [`fl${p}${sd}1`, `fl${p}${sd}2`].filter(hay), lado: true }); }
    else {
      g.push({ huesos: [`thigh${sd}`, `shin${sd}`, `foot${sd}`].filter(hay), lado: true });
      if (hay(`fup${sd}`)) g.push({ huesos: [`fup${sd}`, `flow${sd}`, `ffoot${sd}`].filter(hay), lado: true });
      // brazos de los bípedos (las garras del terizinosaurio o del espinosaurio también reciben golpes)
      if (hay(`arm${sd}`)) g.push({ huesos: [`arm${sd}`, `forearm${sd}`].filter(hay), lado: true });
    }
  }
  return g.filter((x) => x.huesos.length);
}

/** Malla texturizada del GLB (una primitiva): posiciones, normales, UV e índices en el espacio de la escena, y la textura de color. */
export function extraerTexturizada(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('el GLB no contiene mallas');
  const g = mesh.geometry, P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, M = mesh.matrixWorld, Nm = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3();
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(M); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    if (Nn) { v.fromBufferAttribute(Nn, i).applyMatrix3(Nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    if (U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
  }
  const idx = g.index ? Uint32Array.from({ length: g.index.count }, (_, i) => g.index.getX(i)) : Uint32Array.from({ length: n }, (_, i) => i);
  const mapa = mesh.material?.map ?? null;
  if (mapa) { mapa.colorSpace = THREE.SRGBColorSpace; mapa.anisotropy = 4; }
  // pesos de piel precalculados por tools/autorig.mjs (JOINTS_0/WEIGHTS_0 → skinIndex/skinWeight)
  let piel = null;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  if (SI && SW && SI.count === n) {
    const si = new Array(n), sw = new Array(n);
    for (let i = 0; i < n; i++) {
      si[i] = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
      const w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)], t = w[0] + w[1] + w[2] + w[3] || 1;
      sw[i] = w.map((x) => x / t);
    }
    piel = { si, sw };
  }
  return { pos, nor, uv, idx, mapa, hayNormales: !!Nn, piel };
}

/** Geometría con piel: indexada, con las UV y normales del modelo. */
export function geometriaTexturizada(M, si, sw) {
  const n = M.pos.length / 3, aSi = new Uint16Array(n * 4), aSw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) for (let j = 0; j < 4; j++) { aSi[v * 4 + j] = si[v][j]; aSw[v * 4 + j] = sw[v][j]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(M.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(M.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(aSi, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(aSw, 4));
  g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(M.idx) : M.idx, 1));
  if (!M.hayNormales) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Punto de silla sobre el lomo: lo más alto de la malla cerca de `z` y de la línea media (m). */
export function anclaSobreLomo(pos, z, L, x0 = 0) {
  let top = -Infinity;
  for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 2] - z) < 0.04 * L && Math.abs(pos[i] - x0) < 0.1 * L) top = Math.max(top, pos[i + 1]);
  return Number.isFinite(top) ? [0, +(top + 0.04).toFixed(3), +z.toFixed(3)] : null;
}
