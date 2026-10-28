// Geometrías procedurales de la flora. Cada constructor devuelve un BufferGeometry con grupos:
//   grupo 0 = madera/corteza (material de corteza), grupo 1 = follaje (alfa recortado), grupo 2 = extras (bayas, etc.).
// Atributos extra: aSway (0 en la base → 1 en la punta, para el viento) y color por vértice (AO horneado).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

class Builder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.sway = [];
    this.idx = [[], [], []];
    this.n = 0;
  }
  vert(p, n, u, v, c, sway) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]); this.sway.push(sway);
    return this.n++;
  }
  tri(g, a, b, c) { this.idx[g].push(a, b, c); }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    const all = []; let start = 0;
    for (let g = 0; g < 3; g++) {
      const count = this.idx[g].length;
      geo.addGroup(start, count, g); start += count;
      all.push(...this.idx[g]);
    }
    geo.setIndex(all);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3();

/** Tubo cónico siguiendo `pathFn(t)->Vector3`, radio `radFn(t, ang)`. AO: más oscuro en la base y bajo la copa. */
function tube(B, pathFn, radFn, rings, radial, { uvScaleV = 1, uvScaleU = 1, tint = [1, 1, 1], swayBase = 0, swayTop = 1, cap = false, group = 0, aoBase = 0.55 } = {}) {
  const first = B.n;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = pathFn(t);
    const c2 = pathFn(Math.min(1, t + 0.01)), c1 = pathFn(Math.max(0, t - 0.01));
    _t.subVectors(c2, c1).normalize();
    _a.set(0, 0, 1); if (Math.abs(_t.z) > 0.9) _a.set(1, 0, 0);
    _n.crossVectors(_t, _a).normalize(); _bn.crossVectors(_t, _n).normalize();
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const r = radFn(t, ang);
      const dir = _b.copy(_n).multiplyScalar(Math.cos(ang)).addScaledVector(_bn, Math.sin(ang));
      const p = V(c.x + dir.x * r, c.y + dir.y * r, c.z + dir.z * r);
      const ao = aoBase + (1 - aoBase) * Math.min(1, t * 3.2);
      B.vert(p, dir.clone(), (j / radial) * uvScaleU, t * uvScaleV, [tint[0] * ao, tint[1] * ao, tint[2] * ao], swayBase + (swayTop - swayBase) * t);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = first + i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    B.tri(group, a, c, b); B.tri(group, b, c, d);
  }
  if (cap) { // tapa superior (un punto)
    const t = 1, c = pathFn(t); const apex = B.vert(c, V(0, 1, 0), 0.5, 1, tint, swayTop);
    const base = first + rings * stride;
    for (let j = 0; j < radial; j++) B.tri(group, base + j, apex, base + j + 1);
  }
}

/** Tarjeta (quad) orientada. `ctr` centro, `right` y `up` ejes (con su longitud = semiancho/semialto). Normal esférica opcional. */
function card(B, ctr, right, up, group, tint, normalFrom, sway, uvRect = [0, 0, 1, 1], flip = false) {
  const nrm = _n.crossVectors(right, up).normalize().clone();
  const pts = [
    ctr.clone().sub(right).sub(up), ctr.clone().add(right).sub(up), ctr.clone().add(right).add(up), ctr.clone().sub(right).add(up),
  ];
  const us = [uvRect[0], uvRect[2], uvRect[2], uvRect[0]], vs = [uvRect[1], uvRect[1], uvRect[3], uvRect[3]];
  const ids = pts.map((p, k) => {
    const n = normalFrom ? p.clone().sub(normalFrom).normalize().lerp(nrm, 0.25).normalize() : nrm;
    const dy = (p.y - ctr.y);
    const shade = 0.78 + 0.22 * Math.min(1, Math.max(0, (dy / (up.length() + 1e-4) + 1) * 0.5));
    return B.vert(p, n, us[k], vs[k], [tint[0] * shade, tint[1] * shade, tint[2] * shade], sway);
  });
  if (!flip) { B.tri(group, ids[0], ids[1], ids[2]); B.tri(group, ids[0], ids[2], ids[3]); }
  else { B.tri(group, ids[0], ids[2], ids[1]); B.tri(group, ids[0], ids[3], ids[2]); }
}

/** Racimo de 3 tarjetas cruzadas centrado en `ctr` (volumen sin ver el plano). */
function cluster(B, ctr, size, rnd, group, tint, crownCenter, sway, count = 3) {
  const yaw0 = rnd() * Math.PI;
  for (let k = 0; k < count; k++) {
    const yaw = yaw0 + (k * Math.PI) / count;
    const tilt = (rnd() - 0.5) * 0.9;
    const right = V(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size * 0.5);
    const up = V(-Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt)).multiplyScalar(size * 0.5 * (0.8 + rnd() * 0.3));
    card(B, ctr, right, up, group, tint, crownCenter, sway);
  }
  // una tarjeta horizontal ayuda a cerrar la vista desde arriba
  if (count >= 3) card(B, ctr, V(size * 0.5, 0, 0).applyAxisAngle(V(0, 1, 0), rnd() * 6), V(0, 0, size * 0.5), group, tint, crownCenter, sway);
}

export function buildPalm(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 977 + 13), B = new Builder();
  const H = 8 + rnd() * 6, bendA = rnd() * 6.28, bend = 0.8 + rnd() * 2.6;
  const path = (t) => V(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t);
  const ringsN = lod === 0 ? 16 : lod === 1 ? 7 : 3;
  tube(B, path, (t, a) => (0.30 - 0.14 * t) * (1 + 0.5 * Math.exp(-t * 22)) * (1 + 0.04 * Math.sin(t * 90)), ringsN, lod === 0 ? 10 : lod === 1 ? 6 : 4, { uvScaleV: H / 1.6, uvScaleU: 1, swayBase: 0, swayTop: 0.7, aoBase: 0.6 });
  const top = path(1);
  const nFr = lod === 0 ? 14 : lod === 1 ? 9 : 6;
  for (let i = 0; i < nFr; i++) {
    const yaw = (i / nFr) * Math.PI * 2 + rnd() * 0.3;
    const len = 3.2 + rnd() * 1.6, segs = lod === 0 ? 7 : 3;
    const lift = 0.5 + rnd() * 0.55; // ángulo inicial hacia arriba
    const dir = V(Math.cos(yaw), 0, Math.sin(yaw)), side = V(-Math.sin(yaw), 0, Math.cos(yaw));
    const pts = []; let p = top.clone().add(V(0, 0.15, 0)); let ang = lift;
    for (let s = 0; s <= segs; s++) { pts.push(p.clone()); const st = len / segs; p = p.clone().addScaledVector(dir, Math.cos(ang) * st).add(V(0, Math.sin(ang) * st, 0)); ang -= 0.95 / segs * (0.7 + s / segs); }
    const wid = 0.9 + rnd() * 0.25, tint = [0.85 + rnd() * 0.15, 0.9 + rnd() * 0.1, 0.8];
    const ids = [];
    for (let s = 0; s <= segs; s++) {
      const w = wid * (Math.sin(Math.PI * (0.18 + 0.82 * (s / segs))) * 0.55 + 0.45) * (1 - 0.3 * (s / segs));
      const tg = V().subVectors(pts[Math.min(segs, s + 1)], pts[Math.max(0, s - 1)]).normalize();
      const nn = V().crossVectors(side, tg).normalize();
      const sw = 0.55 + 0.45 * (s / segs);
      const l = B.vert(pts[s].clone().addScaledVector(side, -w), nn.clone(), 0, 1 - s / segs, tint, sw);
      const r = B.vert(pts[s].clone().addScaledVector(side, w), nn.clone(), 1, 1 - s / segs, tint, sw);
      ids.push([l, r]);
    }
    for (let s = 0; s < segs; s++) {
      const [l0, r0] = ids[s], [l1, r1] = ids[s + 1];
      B.tri(1, l0, r0, r1); B.tri(1, l0, r1, l1);
    }
  }
  return B.build();
}

export function buildJungleTree(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 7919 + 5), B = new Builder();
  const H = 20 + rnd() * 16, bendA = rnd() * 6.28, bend = 0.5 + rnd() * 2.2;
  const baseR = 0.55 + rnd() * 0.45;
  const path = (t) => V(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t);
  const lobes = 3 + ((rnd() * 3) | 0), lobePhase = rnd() * 6;
  const radFn = (t, a) => {
    const flare = 1 + (1.6 + rnd() * 0 + 0.0) * Math.exp(-t * 16) * (0.55 + 0.45 * Math.max(0, Math.cos(lobes * a + lobePhase)));
    return baseR * (1 - 0.72 * Math.pow(t, 0.75)) * flare;
  };
  tube(B, path, radFn, lod === 0 ? 22 : lod === 1 ? 9 : 4, lod === 0 ? 12 : lod === 1 ? 7 : 4, { uvScaleV: H / 2.4, uvScaleU: 2.2, swayBase: 0, swayTop: 0.55 });
  const top = path(1);
  const crownCenter = top.clone().add(V(0, 1.5, 0));
  const hasBranches = lod === 0;
  const nCl = lod === 0 ? 30 : lod === 1 ? 12 : 4;
  const R = 5.5 + rnd() * 2.5;
  for (let i = 0; i < nCl; i++) {
    // posiciones en un elipsoide aplanado; las más bajas más abiertas
    const u = rnd(), a = rnd() * 6.28, rr = Math.sqrt(rnd()) * R;
    const y = (u - 0.35) * R * 0.85;
    const ctr = crownCenter.clone().add(V(Math.cos(a) * rr, y, Math.sin(a) * rr));
    if (hasBranches && i < 7) {
      const from = path(0.72 + rnd() * 0.2), to = ctr.clone().add(V(0, -1.2, 0));
      tube(B, (t) => from.clone().lerp(to, t).add(V(0, Math.sin(t * Math.PI) * 0.7, 0)), (t) => 0.2 * (1 - 0.8 * t), 4, 5, { uvScaleV: 2, swayBase: 0.3, swayTop: 0.8, aoBase: 0.7 });
    }
    const size = (lod === 2 ? 11 : 6.2) * (0.8 + rnd() * 0.5);
    const tint = [0.8 + rnd() * 0.3, 0.9 + rnd() * 0.2, 0.75 + rnd() * 0.2];
    cluster(B, ctr, size, rnd, 1, tint, crownCenter, 0.75 + 0.25 * (ctr.y / (H + R)), lod === 0 ? 3 : 2);
  }
  return B.build();
}

export function buildConifer(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 131 + 7), B = new Builder();
  const H = 14 + rnd() * 10;
  const path = (t) => V(0, t * H, 0);
  tube(B, path, (t) => 0.38 * (1 - 0.88 * t) * (1 + 0.6 * Math.exp(-t * 14)), lod === 0 ? 10 : 4, lod === 0 ? 8 : 5, { uvScaleV: H / 2, swayBase: 0, swayTop: 0.5, cap: true });
  const tiers = lod === 0 ? 11 : lod === 1 ? 6 : 3;
  for (let k = 0; k < tiers; k++) {
    const t = 0.22 + 0.78 * (k / tiers), y = t * H;
    const rad = (1 - t) * 4.2 + 0.4;
    const n = lod === 0 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rnd() * 0.6;
      const ctr = V(Math.cos(a) * rad * 0.55, y, Math.sin(a) * rad * 0.55);
      const right = V(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)).multiplyScalar(rad * 0.55);
      const up = V(Math.cos(a) * rad * 0.55, -rad * 0.28, Math.sin(a) * rad * 0.55);
      card(B, ctr, right, up, 1, [0.55 + rnd() * 0.2, 0.7 + rnd() * 0.15, 0.55], V(0, y + 1, 0), 0.4 + 0.6 * t);
    }
  }
  return B.build();
}

/** Arbusto bajo (hojas) con bayas opcionales (grupo 2). */
export function buildBush(seed = 1, lod = 0, berries = false) {
  const rnd = mulberry32(seed * 313 + 11), B = new Builder();
  const n = lod === 0 ? 9 : 5;
  const s = 1 + rnd() * 0.7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rnd(), r = 0.35 * s + rnd() * 0.35 * s;
    cluster(B, V(Math.cos(a) * r, 0.6 * s + rnd() * 0.6 * s, Math.sin(a) * r), 1.5 * s * (0.8 + rnd() * 0.5), rnd, 1, [0.75 + rnd() * 0.3, 0.9 + rnd() * 0.15, 0.7], V(0, 0.5, 0), 0.35 + rnd() * 0.5, 2);
  }
  if (berries) {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.28, r = (0.2 + rnd() * 0.75) * s, y = 0.45 * s + rnd() * 0.9 * s;
      const c = V(Math.cos(a) * r, y, Math.sin(a) * r);
      const ico = new THREE.IcosahedronGeometry(0.06 + rnd() * 0.02, 0);
      const p = ico.attributes.position, nn = ico.attributes.normal, ix = ico.index;
      const base = B.n;
      for (let v = 0; v < p.count; v++) B.vert(V(c.x + p.getX(v), c.y + p.getY(v), c.z + p.getZ(v)), V(nn.getX(v), nn.getY(v), nn.getZ(v)), 0, 0, [0.9, 0.12 + rnd() * 0.1, 0.18], 0.5);
      if (ix) for (let k = 0; k < ix.count; k += 3) B.tri(2, base + ix.getX(k), base + ix.getX(k + 1), base + ix.getX(k + 2));
      else for (let k = 0; k < p.count; k += 3) B.tri(2, base + k, base + k + 1, base + k + 2);
    }
  }
  return B.build();
}

/** Helecho: frondas arqueadas desde el centro. */
export function buildFern(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 457 + 3), B = new Builder();
  const nFr = lod === 0 ? 11 : 6;
  for (let i = 0; i < nFr; i++) {
    const yaw = (i / nFr) * 6.28 + rnd() * 0.4, len = 1.1 + rnd() * 0.9, segs = lod === 0 ? 5 : 3;
    const dir = V(Math.cos(yaw), 0, Math.sin(yaw)), side = V(-Math.sin(yaw), 0, Math.cos(yaw));
    let p = V(0, 0.05, 0), ang = 0.9 + rnd() * 0.3; const pts = [];
    for (let s = 0; s <= segs; s++) { pts.push(p.clone()); const st = len / segs; p = p.clone().addScaledVector(dir, Math.cos(ang) * st).add(V(0, Math.sin(ang) * st, 0)); ang -= 1.5 / segs; }
    const ids = [];
    for (let s = 0; s <= segs; s++) {
      const w = 0.3 * Math.sin(Math.PI * (0.1 + 0.9 * (s / segs)));
      const tg = V().subVectors(pts[Math.min(segs, s + 1)], pts[Math.max(0, s - 1)]).normalize();
      const nn = V().crossVectors(side, tg).normalize();
      const tint = [0.8 + 0.2 * rnd(), 1, 0.75];
      ids.push([B.vert(pts[s].clone().addScaledVector(side, -w), nn.clone(), 0, 1 - s / segs, tint, 0.3 + 0.7 * (s / segs)), B.vert(pts[s].clone().addScaledVector(side, w), nn.clone(), 1, 1 - s / segs, tint, 0.3 + 0.7 * (s / segs))]);
    }
    for (let s = 0; s < segs; s++) { const [l0, r0] = ids[s], [l1, r1] = ids[s + 1]; B.tri(1, l0, r0, r1); B.tri(1, l0, r1, l1); }
  }
  return B.build();
}

/**
 * Roca con fracturas: icosfera deformada con ruido y cortada por varios planos (caras de fractura planas), en varias formas:
 *   'canto' (rodado, pocas fracturas) · 'bloque' (anguloso) · 'losa' (plana y ancha) · 'aguja' (alta y estrecha) · 'afloramiento' (3–5 bloques soldados).
 * Color por vértice: AO (más oscuro abajo y en las concavidades) y verdín en lo que mira hacia arriba. La textura la pone el material (triplanar en mundo).
 */
const FORMAS_ROCA = ['canto', 'bloque', 'canto', 'losa', 'bloque', 'aguja', 'afloramiento'];
export const N_ROCAS = FORMAS_ROCA.length;
function piezaRoca(rnd, detail, forma) {
  const geo0 = new THREE.IcosahedronGeometry(1, detail), geo = geo0.index ? geo0.toNonIndexed() : geo0;
  const p = geo.attributes.position;
  const ph = [rnd() * 9, rnd() * 9, rnd() * 9], fr = [1.1 + rnd(), 2.6 + rnd() * 1.4, 6 + rnd() * 2];
  const esc = { canto: [1 + rnd() * 0.4, 0.62 + rnd() * 0.25, 0.9 + rnd() * 0.3], bloque: [1 + rnd() * 0.5, 0.75 + rnd() * 0.35, 0.85 + rnd() * 0.4], losa: [1.4 + rnd() * 0.5, 0.32 + rnd() * 0.12, 1.1 + rnd() * 0.4], aguja: [0.55 + rnd() * 0.2, 1.7 + rnd() * 0.8, 0.5 + rnd() * 0.2] }[forma === 'afloramiento' ? 'bloque' : forma];
  const amp = forma === 'canto' ? 0.16 : 0.1;
  const ruido = (x, y, z) => { let d = 0; for (let o = 0; o < 3; o++) d += Math.sin(x * fr[o] + ph[o]) * Math.cos(z * fr[o] * 0.9 + ph[(o + 1) % 3]) * Math.sin(y * fr[o] * 1.1 + ph[(o + 2) % 3]) / (o + 1.2); return d; };
  // planos de fractura: normal al azar (sesgada a los lados y arriba) y distancia < 1: lo que sobresale se proyecta sobre el plano
  const nPl = { canto: 2, bloque: 7, losa: 5, aguja: 6 }[forma === 'afloramiento' ? 'bloque' : forma];
  const planos = [];
  for (let k = 0; k < nPl; k++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.25) * 1.3;
    planos.push({ n: [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], d: 0.62 + rnd() * 0.28 });
  }
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + ruido(x, y, z) * amp;
    x *= k; y *= k; z *= k;
    // los cortes se hacen en el espacio de la esfera unidad (antes de estirar): una transformación afín conserva las caras planas
    for (const pl of planos) {
      const d = pl.d * (forma === 'aguja' ? 0.8 : 1), s2 = x * pl.n[0] + y * pl.n[1] + z * pl.n[2];
      if (s2 > d) { const t = s2 - d; x -= pl.n[0] * t; y -= pl.n[1] * t; z -= pl.n[2] * t; }
    }
    p.setXYZ(i, x * esc[0], Math.max(-0.3, y) * esc[1], z * esc[2]); // la base queda plana y algo enterrada
  }
  return geo;
}
export function buildRock(seed = 1, detail = 3, forma = null) {
  const rnd = mulberry32(seed * 2713 + 1);
  forma = forma ?? FORMAS_ROCA[(seed - 1) % FORMAS_ROCA.length];
  let geo;
  if (forma === 'afloramiento') {
    const partes = [], n = 3 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const g = piezaRoca(rnd, Math.max(1, detail - 1), k === 0 ? 'bloque' : rnd() < 0.5 ? 'bloque' : 'losa');
      const sc = k === 0 ? 1 : 0.45 + rnd() * 0.45, a = rnd() * 6.28, r = k === 0 ? 0 : 0.7 + rnd() * 0.6;
      g.scale(sc, sc * (0.8 + rnd() * 0.5), sc); g.rotateY(rnd() * 6.28); g.rotateZ((rnd() - 0.5) * 0.35); g.translate(Math.cos(a) * r, sc * 0.1, Math.sin(a) * r);
      partes.push(g);
    }
    const tot = partes.reduce((s2, g) => s2 + g.attributes.position.count, 0), pos = new Float32Array(tot * 3);
    let o = 0; for (const g of partes) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
    geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  } else geo = piezaRoca(rnd, detail, forma);
  geo = toCreasedNormals(geo, 0.85); // suave dentro de cada cara, arista viva entre caras de fractura
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  geo.computeBoundingBox(); const bb = geo.boundingBox, alto = Math.max(0.01, bb.max.y - bb.min.y);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const hy = (p.getY(i) - bb.min.y) / alto, up = nrm.getY(i);
    const ao = 0.5 + 0.5 * Math.min(1, hy * 1.6 + 0.15) - Math.max(0, -up) * 0.12; // base y panzas más oscuras
    const moss = Math.max(0, up - 0.55) * (forma === 'aguja' ? 0.4 : 1.1) * (0.6 + 0.4 * Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3));
    col[i * 3] = ao * (1 - moss * 0.42); col[i * 3 + 1] = ao * (1 - moss * 0.08); col[i * 3 + 2] = ao * (1 - moss * 0.5);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.9 + p.getZ(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.9 + p.getZ(i) * 0.6; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  geo.clearGroups(); geo.addGroup(0, p.count, 0);
  geo.userData.forma = forma;
  return geo;
}

/** Mechón de hierba: 3 tarjetas cruzadas (dos caras visibles). Pensado para instancing masivo. */
export function buildGrassClump() {
  const rnd = mulberry32(99), B = new Builder();
  for (let k = 0; k < 3; k++) {
    const yaw = (k * Math.PI) / 3 + 0.2;
    const right = V(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.42), up = V(0, 0.34, 0);
    const ctr = V(0, 0.34, 0);
    card(B, ctr, right, up, 1, [1, 1, 1], null, 1, [0, 0, 1, 1]);
  }
  void rnd;
  const g = B.build();
  // normal hacia arriba: la hierba recibe luz como el suelo (evita parches oscuros)
  const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  // oscurece la base (AO)
  const col = g.attributes.color, pos = g.attributes.position;
  for (let i = 0; i < col.count; i++) { const h = Math.min(1, pos.getY(i) / 0.68); const ao = 0.45 + 0.55 * h; col.setXYZ(i, ao, ao, ao); g.attributes.aSway.setX(i, h * h); }
  return g;
}

/** Cactus columnar acanalado con 1–3 brazos (material liso de vertex colors: grupo 2). */
export function buildCactus(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 619 + 17), B = new Builder();
  const H = 3.0 + rnd() * 2.8, R = 0.27 + rnd() * 0.12;
  const rings = lod === 0 ? 9 : lod === 1 ? 5 : 3, radial = lod === 0 ? 14 : lod === 1 ? 9 : 6;
  const ribs = 9 + ((rnd() * 4) | 0), tint = [0.36, 0.56, 0.30];
  tube(B, (t) => V(0, t * H, 0), (t, a) => R * (1 - 0.4 * Math.pow(t, 3.2)) * (1 + 0.09 * Math.cos(a * ribs)) * Math.min(1, 0.55 + t * 5), rings, radial, { uvScaleV: 1, tint, group: 2, swayBase: 0, swayTop: 0.06, cap: true, aoBase: 0.7 });
  const nArms = lod === 2 ? 1 : 1 + ((rnd() * 3) | 0);
  for (let i = 0; i < nArms; i++) {
    const a = (i / nArms) * 6.28 + rnd() * 1.4, y0 = H * (0.32 + rnd() * 0.3), out = 0.9 + rnd() * 0.7, up = 1.0 + rnd() * 1.5;
    const p0 = V(0, y0, 0), p1 = V(Math.cos(a) * out * 1.1, y0 + 0.05, Math.sin(a) * out * 1.1), p2 = V(Math.cos(a) * out * 1.3, y0 + up, Math.sin(a) * out * 1.3);
    const bez = (t) => p0.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
    tube(B, bez, (t, ang) => R * 0.62 * (1 - 0.35 * t * t) * (1 + 0.08 * Math.cos(ang * ribs)), Math.max(4, rings), Math.max(6, radial - 2), { uvScaleV: 1, tint, group: 2, swayBase: 0.02, swayTop: 0.1, cap: true, aoBase: 0.75 });
  }
  return B.build();
}

/** Árbol seco o calcinado: tronco retorcido y ramas peladas, sin follaje. */
export function buildDeadTree(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 733 + 29), B = new Builder();
  const H = 6 + rnd() * 4.5, bendA = rnd() * 6.28, bend = 0.5 + rnd() * 1.5, tint = [0.8, 0.76, 0.72];
  const path = (t) => V(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t);
  tube(B, path, (t) => 0.34 * (1 - 0.84 * t) * (1 + 0.55 * Math.exp(-t * 14)), lod === 0 ? 10 : 5, lod === 0 ? 8 : 5, { uvScaleV: H / 2, swayBase: 0, swayTop: 0.15, tint, cap: true });
  const nb = lod === 0 ? 7 : lod === 1 ? 4 : 2;
  for (let i = 0; i < nb; i++) {
    const t0 = 0.3 + 0.62 * (i / nb) + rnd() * 0.05, a = rnd() * 6.28, L = (1.8 + rnd() * 2.3) * (1.2 - t0 * 0.55);
    const from = path(t0), to = from.clone().add(V(Math.cos(a) * L, L * (0.45 + rnd() * 0.6), Math.sin(a) * L));
    tube(B, (t) => from.clone().lerp(to, t).add(V(0, Math.sin(t * Math.PI) * 0.25, 0)), (t) => 0.11 * (1 - 0.86 * t), 3, 5, { uvScaleV: 1.4, swayBase: 0.15, swayTop: 0.4, tint, cap: true, aoBase: 0.7 });
  }
  return B.build();
}

// ================================================================================================ flora mesozoica (añadida)
/** Fronda pinnada (tira con textura de fronda) que sale de `base` hacia `yaw`, sube con ángulo `lift` y se curva hacia abajo `caida` rad. */
function fronda(B, base, yaw, len, lift, caida, wid, segs, tint, swayBase = 0.5) {
  const dir = V(Math.cos(yaw), 0, Math.sin(yaw)), side = V(-Math.sin(yaw), 0, Math.cos(yaw));
  const pts = []; let p = base.clone(), ang = lift;
  for (let s = 0; s <= segs; s++) { pts.push(p.clone()); const st = len / segs; p = p.clone().addScaledVector(dir, Math.cos(ang) * st).add(V(0, Math.sin(ang) * st, 0)); ang -= caida / segs * (0.6 + 0.8 * s / segs); }
  const ids = [];
  for (let s = 0; s <= segs; s++) {
    const w = wid * (Math.sin(Math.PI * (0.12 + 0.88 * (s / segs))) * 0.6 + 0.4) * (1 - 0.35 * (s / segs));
    const tg = V().subVectors(pts[Math.min(segs, s + 1)], pts[Math.max(0, s - 1)]).normalize();
    const nn = V().crossVectors(side, tg).normalize();
    const sw = swayBase + (1 - swayBase) * (s / segs);
    ids.push([B.vert(pts[s].clone().addScaledVector(side, -w), nn.clone(), 0, 1 - s / segs, tint, sw), B.vert(pts[s].clone().addScaledVector(side, w), nn.clone(), 1, 1 - s / segs, tint, sw)]);
  }
  for (let s = 0; s < segs; s++) { const [l0, r0] = ids[s], [l1, r1] = ids[s + 1]; B.tri(1, l0, r0, r1); B.tri(1, l0, r1, l1); }
}

/** Helecho arborescente (Cyatheales): tronco fibroso fino de 3–6 m y una corona de frondas largas que se arquean hacia abajo. */
export function buildTreeFern(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 4241 + 9), B = new Builder();
  const H = 3 + rnd() * 3.2, bendA = rnd() * 6.28, bend = 0.2 + rnd() * 0.6;
  const path = (t) => V(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t);
  tube(B, path, (t) => (0.2 - 0.05 * t) * (1 + 0.6 * Math.exp(-t * 10)) * (1 + 0.06 * Math.sin(t * 60)), lod === 0 ? 10 : 4, lod === 0 ? 8 : 5, { uvScaleV: H / 1.2, swayBase: 0, swayTop: 0.4, aoBase: 0.55, tint: [0.75, 0.68, 0.6] });
  const top = path(1).add(V(0, 0.05, 0)), n = lod === 0 ? 13 : lod === 1 ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * 6.28 + rnd() * 0.35;
    fronda(B, top, yaw, 2.3 + rnd() * 1.2, 0.55 + rnd() * 0.5, 2.0 + rnd() * 0.6, 0.55 + rnd() * 0.15, lod === 0 ? 7 : 3, [0.78 + rnd() * 0.15, 0.95, 0.7 + rnd() * 0.12], 0.45);
  }
  if (lod === 0) for (let i = 0; i < 4; i++) fronda(B, top.clone().add(V(0, 0.1, 0)), rnd() * 6.28, 0.9 + rnd() * 0.4, 1.35, 0.9, 0.3, 4, [0.7, 0.92, 0.6], 0.5); // frondas nuevas, enrolladas hacia arriba
  return B.build();
}

/** Cícada (Cycadales): tronco corto y grueso de escamas y roseta de frondas rígidas casi verticales; a veces un cono central. */
export function buildCycad(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 6151 + 21), B = new Builder();
  const H = 0.35 + rnd() * 1.3, R = 0.26 + rnd() * 0.16;
  tube(B, (t) => V(0, t * H, 0), (t, a) => R * (1 - 0.25 * t) * (1 + 0.1 * Math.sin(a * 9 + t * 40) * Math.sin(t * 50)), lod === 0 ? 8 : 4, lod === 0 ? 12 : 7, { uvScaleV: H / 0.5, uvScaleU: 2, swayBase: 0, swayTop: 0.05, aoBase: 0.6, tint: [0.72, 0.62, 0.48] });
  const top = V(0, H, 0), n = lod === 0 ? 18 : 10;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * 6.28 + rnd() * 0.25, anillo = i % 2;
    fronda(B, top.clone().add(V(0, anillo * 0.08, 0)), yaw, 1.3 + rnd() * 0.8, 0.95 + anillo * 0.3 + rnd() * 0.2, 0.75 + rnd() * 0.4, 0.42 + rnd() * 0.1, lod === 0 ? 5 : 3, [0.62 + rnd() * 0.12, 0.85, 0.55], 0.2);
  }
  if (rnd() < 0.45) tube(B, (t) => V(0, H + t * 0.45, 0), (t) => 0.13 * Math.sin(Math.PI * (0.15 + 0.85 * t)) + 0.02, 5, 8, { group: 2, tint: [0.62, 0.42, 0.18], swayBase: 0.05, swayTop: 0.1, cap: true, aoBase: 0.8 });
  return B.build();
}

/** Araucaria: fuste recto y alto, ramas en verticilos solo en el tercio superior y copa aplanada en forma de paraguas. */
export function buildAraucaria(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 8761 + 3), B = new Builder();
  const H = 22 + rnd() * 12, R0 = 0.42 + rnd() * 0.15;
  tube(B, (t) => V(0, t * H, 0), (t) => R0 * (1 - 0.8 * t) * (1 + 0.5 * Math.exp(-t * 18)), lod === 0 ? 12 : 5, lod === 0 ? 10 : 6, { uvScaleV: H / 2.2, swayBase: 0, swayTop: 0.35, cap: true });
  const verticilos = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  for (let k = 0; k < verticilos; k++) {
    const t0 = 0.7 + 0.28 * (k / verticilos), y = t0 * H, L = (1 - (k / verticilos) * 0.55) * (4.2 + rnd() * 1.6);
    const nr = lod === 0 ? 6 : 4;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.28 + k * 0.5 + rnd() * 0.3, d = V(Math.cos(a), 0, Math.sin(a));
      const from = V(0, y, 0), to = from.clone().addScaledVector(d, L).add(V(0, L * 0.18, 0));
      if (lod < 2) tube(B, (t) => from.clone().lerp(to, t).add(V(0, -Math.sin(t * Math.PI) * 0.35, 0)), (t) => 0.13 * (1 - 0.75 * t), 4, 4, { uvScaleV: 1.4, swayBase: 0.3, swayTop: 0.7, aoBase: 0.75 });
      // racimos de hojas escamosas al final de la rama, más horizontales que en la conífera
      const n2 = lod === 0 ? 3 : 2;
      for (let j = 0; j < n2; j++) {
        const c = from.clone().lerp(to, 0.55 + 0.45 * (j / n2)).add(V(0, 0.25, 0));
        const right = V(-d.z, 0, d.x).multiplyScalar(1.3 + rnd() * 0.5), up = d.clone().multiplyScalar(1.2 + rnd() * 0.4).add(V(0, 0.18, 0));
        card(B, c, right, up, 1, [0.5 + rnd() * 0.12, 0.66 + rnd() * 0.1, 0.5], V(0, y + 1.5, 0), 0.55 + 0.4 * (k / verticilos));
        card(B, c.clone().add(V(0, 0.15, 0)), up.clone().multiplyScalar(0.8), V(0, 0.65, 0), 1, [0.48, 0.64, 0.48], V(0, y + 1.5, 0), 0.6);
      }
    }
  }
  return B.build();
}

/** Mata de colas de caballo (Equisetum): tallos verdes segmentados que crecen en la orilla y el pantano. */
export function buildHorsetail(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 3301 + 47), B = new Builder();
  const n = lod === 0 ? 13 : 8;
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.45, H = 0.6 + rnd() * 1.1, lean = 0.08 + rnd() * 0.22;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r, dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
    const tint = [0.36 + rnd() * 0.08, 0.55 + rnd() * 0.08, 0.26];
    const anillos = lod === 0 ? 5 : 2;
    const f = B.n;
    tube(B, (t) => V(x0 + dx * t * t * H, t * H, z0 + dz * t * t * H), (t) => 0.018 * (1 - 0.5 * t) + 0.006, anillos, lod === 0 ? 4 : 3, { group: 2, tint, swayBase: 0, swayTop: 0.9, cap: true, aoBase: 0.65 });
    // nudos oscuros en los segmentos (bandas de color)
    for (let v = f; v < B.n; v++) { const y = B.pos[v * 3 + 1], u = (y / H) * 7, band = Math.abs(u - Math.round(u)) < 0.12 ? 0.55 : 1; B.col[v * 3] *= band; B.col[v * 3 + 1] *= band; B.col[v * 3 + 2] *= band; }
  }
  return B.build();
}

/** Tronco caído: cilindro irregular tumbado a lo largo de X (centrado), extremos rotos, muñones de rama y verdín encima. */
export function buildLog(seed = 1, lod = 0) {
  const rnd = mulberry32(seed * 5303 + 77), B = new Builder();
  const L = 5 + rnd() * 5, R = 0.32 + rnd() * 0.25, bend = (rnd() - 0.5) * 0.6;
  const path = (t) => V((t - 0.5) * L, R * 0.85 + Math.sin(t * Math.PI) * bend * 0.3, Math.sin(t * Math.PI) * bend);
  tube(B, path, (t, a) => R * (1 - 0.18 * t) * (1 + 0.07 * Math.sin(a * 5 + t * 23)) * (t < 0.04 || t > 0.96 ? 0.92 + 0.12 * Math.sin(a * 7) : 1), lod === 0 ? 14 : 5, lod === 0 ? 10 : 6, { uvScaleV: L / 2, uvScaleU: 2, swayBase: 0, swayTop: 0, aoBase: 1 });
  // verdín y sombra: arriba verdoso, abajo oscuro
  for (let v = 0; v < B.n; v++) {
    const ny = B.nor[v * 3 + 1], up = Math.max(0, ny), down = Math.max(0, -ny);
    const k = 0.62 + 0.38 * (1 - down);
    B.col[v * 3] = k * (1 - up * 0.35); B.col[v * 3 + 1] = k * (1 + up * 0.12); B.col[v * 3 + 2] = k * (1 - up * 0.45);
  }
  // tapas de los extremos (madera clara, partida)
  for (const t of [0, 1]) {
    const c = path(t), n = V(t ? 1 : -1, 0, 0), centro = B.vert(c.clone().addScaledVector(n, 0.05), n, 0.5, 0.5, [1.25, 1.05, 0.8], 0), first = B.n;
    for (let j = 0; j <= 10; j++) { const a = (j / 10) * 6.28, rr = R * (t ? 0.82 : 1) * (0.9 + 0.12 * Math.sin(a * 7)); B.vert(V(c.x, c.y + Math.cos(a) * rr, c.z + Math.sin(a) * rr), n, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, [1.1, 0.92, 0.7], 0); }
    for (let j = 0; j < 10; j++) t ? B.tri(0, centro, first + j, first + j + 1) : B.tri(0, centro, first + j + 1, first + j);
  }
  if (lod === 0) for (let i = 0; i < 3; i++) { // muñones de ramas
    const t0 = 0.2 + rnd() * 0.6, a = rnd() * 6.28, from = path(t0), d = V(rnd() - 0.5, Math.cos(a) * 0.8, Math.sin(a)).normalize(), lr = 0.5 + rnd() * 0.4;
    tube(B, (t) => from.clone().addScaledVector(d, t * lr), (t) => R * 0.32 * (1 - 0.5 * t), 2, 5, { uvScaleV: 0.6, cap: true, aoBase: 0.8 });
  }
  return B.build();
}
