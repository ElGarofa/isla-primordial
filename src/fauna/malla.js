// Preparación de mallas esqueléticas importadas (GLB): soldar vértices, suavizar con subdivisión de Loop (opcional), normales con
// aristas vivas, color de vértice por zona y UV proyectadas por caja. Todo se hace UNA vez por especie al cargar el modelo
// (no se guarda ningún modelo procesado: el archivo original queda intacto) y el resultado se comparte entre todos los ejemplares.
import * as THREE from 'three';

const q = (v) => Math.round(v * 1e4);

/**
 * Une varias SkinnedMesh (una por material) en una malla indexada y soldada.
 * @returns {{ pos: number[], si: number[][], sw: number[][], tri: number[], zona: number[], zonas: string[] }}
 */
export function unir(meshes) {
  const pos = [], si = [], sw = [], tri = [], zona = [], zonas = [];
  const map = new Map();
  let difieren = 0;
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    const nombre = Array.isArray(m.material) ? m.material[0].name : m.material.name;
    let z = zonas.indexOf(nombre); if (z < 0) { z = zonas.length; zonas.push(nombre); }
    const remap = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), zz = P.getZ(i), key = `${q(x)},${q(y)},${q(zz)}`;
      const s = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)], w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)];
      let id = map.get(key);
      if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, zz); si.push(s); sw.push(w); } else if (s[0] !== si[id][0] || Math.abs(w[0] - sw[id][0]) > 0.2) difieren++;
      remap[i] = id;
    }
    const idx = g.index;
    const n = idx ? idx.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const a = remap[idx ? idx.getX(i) : i], b = remap[idx ? idx.getX(i + 1) : i + 1], c = remap[idx ? idx.getX(i + 2) : i + 2];
      if (a === b || b === c || a === c) continue; // triángulo degenerado tras soldar
      tri.push(a, b, c); zona.push(z);
    }
  }
  return { pos, si, sw, tri, zona, zonas, difieren };
}

/** Mezcla dos conjuntos de influencias de hueso (hasta 4) con pesos ta/tb. */
function mezclarPiel(sa, wa, sb, wb, ta = 0.5) {
  const acc = new Map();
  for (let i = 0; i < 4; i++) { if (wa[i] > 0) acc.set(sa[i], (acc.get(sa[i]) ?? 0) + wa[i] * ta); if (wb[i] > 0) acc.set(sb[i], (acc.get(sb[i]) ?? 0) + wb[i] * (1 - ta)); }
  const top = [...acc.entries()].sort((p, r) => r[1] - p[1]).slice(0, 4);
  const sum = top.reduce((a, e) => a + e[1], 0) || 1;
  const s = [0, 0, 0, 0], w = [0, 0, 0, 0];
  top.forEach(([b, v], i) => { s[i] = b; w[i] = v / sum; });
  return [s, w];
}

/**
 * Subdivisión de Loop (una pasada) con interpolación de pesos de piel. `suavidad` (0–1) reduce el encogimiento típico de Loop:
 * 1 = Loop puro, 0 = vértices originales intactos (solo se inserta geometría).
 */
export function subdividir(M, suavidad = 0.6) {
  const nv = M.pos.length / 3, nt = M.tri.length / 3;
  const edge = new Map(); // "a_b" -> { id, caras:[opuestos] }
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const vecinos = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = M.tri[t * 3 + k], b = M.tri[t * 3 + (k + 1) % 3], c = M.tri[t * 3 + (k + 2) % 3];
      const kk = key(a, b);
      let e = edge.get(kk); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), op: [], id: -1 }; edge.set(kk, e); }
      e.op.push(c); vecinos[a].add(b); vecinos[b].add(a);
    }
  }
  // vértices en el borde o no-variedad (aristas con 1 o ≥3 caras) quedan fijos
  const borde = new Uint8Array(nv);
  for (const e of edge.values()) if (e.op.length !== 2) { borde[e.a] = 1; borde[e.b] = 1; }
  const pos = M.pos.slice(), si = M.si.slice(), sw = M.sw.slice();
  // vértices nuevos en las aristas
  for (const e of edge.values()) {
    const { a, b } = e;
    const ax = M.pos[a * 3], ay = M.pos[a * 3 + 1], az = M.pos[a * 3 + 2], bx = M.pos[b * 3], by = M.pos[b * 3 + 1], bz = M.pos[b * 3 + 2];
    let x, y, z;
    if (e.op.length === 2) {
      const c = e.op[0] * 3, d = e.op[1] * 3;
      x = 0.375 * (ax + bx) + 0.125 * (M.pos[c] + M.pos[d]); y = 0.375 * (ay + by) + 0.125 * (M.pos[c + 1] + M.pos[d + 1]); z = 0.375 * (az + bz) + 0.125 * (M.pos[c + 2] + M.pos[d + 2]);
    } else { x = (ax + bx) / 2; y = (ay + by) / 2; z = (az + bz) / 2; }
    e.id = pos.length / 3; pos.push(x, y, z);
    const [s, w] = mezclarPiel(M.si[a], M.sw[a], M.si[b], M.sw[b]); si.push(s); sw.push(w);
  }
  // vértices antiguos: suavizado de Loop mezclado con la posición original
  for (let v = 0; v < nv; v++) {
    if (borde[v]) continue;
    const ns = [...vecinos[v]], n = ns.length;
    const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
    let sx = 0, sy = 0, sz = 0;
    for (const u of ns) { sx += M.pos[u * 3]; sy += M.pos[u * 3 + 1]; sz += M.pos[u * 3 + 2]; }
    const lx = (1 - n * beta) * M.pos[v * 3] + beta * sx, ly = (1 - n * beta) * M.pos[v * 3 + 1] + beta * sy, lz = (1 - n * beta) * M.pos[v * 3 + 2] + beta * sz;
    pos[v * 3] = M.pos[v * 3] + (lx - M.pos[v * 3]) * suavidad; pos[v * 3 + 1] = M.pos[v * 3 + 1] + (ly - M.pos[v * 3 + 1]) * suavidad; pos[v * 3 + 2] = M.pos[v * 3 + 2] + (lz - M.pos[v * 3 + 2]) * suavidad;
  }
  const tri = [], zona = [];
  for (let t = 0; t < nt; t++) {
    const a = M.tri[t * 3], b = M.tri[t * 3 + 1], c = M.tri[t * 3 + 2];
    const ab = edge.get(key(a, b)).id, bc = edge.get(key(b, c)).id, ca = edge.get(key(c, a)).id;
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    for (let i = 0; i < 4; i++) zona.push(M.zona[t]);
  }
  return { ...M, pos, si, sw, tri, zona };
}

/**
 * Añade un elipsoide (ojo, ornamento) a la malla soldada, ligado al 100 % a un hueso. Se usa para detalles que el modelo original no trae.
 * `c`: centro y `r`: semiejes en unidades del modelo (pose de reposo); `x` se refleja si `espejo`.
 */
export function elipsoide(M, { c, r, hueso, zona, espejo = true, seg = 10, anillos = 6 }) {
  let z = M.zonas.indexOf(zona); if (z < 0) { z = M.zonas.length; M.zonas.push(zona); }
  for (const sx of espejo ? [1, -1] : [1]) {
    const base = M.pos.length / 3;
    for (let i = 0; i <= anillos; i++) {
      const th = (i / anillos) * Math.PI, sy = Math.cos(th), rr = Math.sin(th);
      for (let j = 0; j < seg; j++) {
        const ph = (j / seg) * Math.PI * 2;
        M.pos.push(c[0] * sx + Math.cos(ph) * rr * r[0] * sx, c[1] + sy * r[1], c[2] + Math.sin(ph) * rr * r[2]);
        M.si.push([hueso, 0, 0, 0]); M.sw.push([1, 0, 0, 0]);
      }
    }
    for (let i = 0; i < anillos; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg, d = base + (i + 1) * seg + j, e = base + (i + 1) * seg + (j + 1) % seg;
      const flip = sx < 0;
      if (i > 0) { M.tri.push(a, b, d); if (flip) { const n = M.tri.length; [M.tri[n - 2], M.tri[n - 1]] = [M.tri[n - 1], M.tri[n - 2]]; } M.zona.push(z); }
      if (i < anillos - 1) { M.tri.push(b, e, d); if (flip) { const n = M.tri.length; [M.tri[n - 2], M.tri[n - 1]] = [M.tri[n - 1], M.tri[n - 2]]; } M.zona.push(z); }
    }
  }
  return M;
}

/**
 * Geometría final no indexada con: normales suaves (con arista viva por encima de `angulo` grados), color de vértice (media de las zonas
 * incidentes → degradados suaves entre zonas), UV proyectadas por caja (la cara elige el eje dominante) y pesos de piel.
 * `colorZona(zonaIdx, x, y, z, nx, ny, nz, out)` rellena `out` con el color en espacio de modelo ya escalado (metros).
 * Alternativa: `colorVert(indiceVertice, out)` para mallas que traen su propio color por vértice (ver estatico.js).
 */
export function geometria(M, { escala = 1, angulo = 55, colorZona, colorVert = null, uvM = 0.5 }) {
  const nv = M.pos.length / 3, nt = M.tri.length / 3;
  const P = (i) => [M.pos[i * 3] * escala, M.pos[i * 3 + 1] * escala, M.pos[i * 3 + 2] * escala];
  const fn = new Float32Array(nt * 3), fa = new Float32Array(nt);
  const inc = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) {
    const a = P(M.tri[t * 3]), b = P(M.tri[t * 3 + 1]), c = P(M.tri[t * 3 + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1e-9; fa[t] = l / 2; nx /= l; ny /= l; nz /= l;
    fn[t * 3] = nx; fn[t * 3 + 1] = ny; fn[t * 3 + 2] = nz;
    for (let k = 0; k < 3; k++) inc[M.tri[t * 3 + k]].push(t);
  }
  // normal suave de vértice (sin arista viva) para el color y la proyección
  const vn = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) { let x = 0, y = 0, z = 0; for (const t of inc[v]) { x += fn[t * 3] * fa[t]; y += fn[t * 3 + 1] * fa[t]; z += fn[t * 3 + 2] * fa[t]; } const l = Math.hypot(x, y, z) || 1; vn[v * 3] = x / l; vn[v * 3 + 1] = y / l; vn[v * 3 + 2] = z / l; }
  // color por vértice soldado: media de los colores de las zonas de sus caras
  const col = new Float32Array(nv * 3), o = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    if (colorVert) { colorVert(v, o); col[v * 3] = o[0]; col[v * 3 + 1] = o[1]; col[v * 3 + 2] = o[2]; continue; } // color propio de cada vértice (modelos con color de vértice)
    const p = P(v); let r = 0, g = 0, b = 0;
    const cnt = new Map(); for (const t of inc[v]) cnt.set(M.zona[t], (cnt.get(M.zona[t]) ?? 0) + 1);
    for (const [z, n] of cnt) { colorZona(z, p[0], p[1], p[2], vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2], o); r += o[0] * n; g += o[1] * n; b += o[2] * n; }
    const tot = inc[v].length || 1; col[v * 3] = r / tot; col[v * 3 + 1] = g / tot; col[v * 3 + 2] = b / tot;
  }
  const cos = Math.cos((angulo * Math.PI) / 180);
  const out = nt * 3;
  const aPos = new Float32Array(out * 3), aNor = new Float32Array(out * 3), aUv = new Float32Array(out * 2), aCol = new Float32Array(out * 3);
  const aSi = new Uint16Array(out * 4), aSw = new Float32Array(out * 4);
  let w = 0;
  for (let t = 0; t < nt; t++) {
    const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
    const ax = Math.abs(fx), ay = Math.abs(fy), az = Math.abs(fz);
    const eje = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    for (let k = 0; k < 3; k++) {
      const v = M.tri[t * 3 + k], p = P(v);
      // normal: suma de las caras incidentes dentro del ángulo de suavizado
      let nx = 0, ny = 0, nz = 0;
      for (const u of inc[v]) { const d = fn[u * 3] * fx + fn[u * 3 + 1] * fy + fn[u * 3 + 2] * fz; if (d >= cos) { nx += fn[u * 3] * fa[u]; ny += fn[u * 3 + 1] * fa[u]; nz += fn[u * 3 + 2] * fa[u]; } }
      const l = Math.hypot(nx, ny, nz) || 1;
      aPos[w * 3] = M.pos[v * 3]; aPos[w * 3 + 1] = M.pos[v * 3 + 1]; aPos[w * 3 + 2] = M.pos[v * 3 + 2]; // la geometría queda en unidades del modelo (los huesos también); la escala la aplica el nodo raíz
      aNor[w * 3] = nx / l; aNor[w * 3 + 1] = ny / l; aNor[w * 3 + 2] = nz / l;
      const uu = eje === 0 ? p[2] : p[0], vv = eje === 1 ? p[2] : p[1];
      aUv[w * 2] = uu * uvM; aUv[w * 2 + 1] = vv * uvM;
      aCol[w * 3] = col[v * 3]; aCol[w * 3 + 1] = col[v * 3 + 1]; aCol[w * 3 + 2] = col[v * 3 + 2];
      for (let j = 0; j < 4; j++) { aSi[w * 4 + j] = M.si[v][j]; aSw[w * 4 + j] = M.sw[v][j]; }
      w++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(aNor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(aUv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(aCol, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(aSi, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(aSw, 4));
  g.computeBoundingSphere();
  return g;
}
