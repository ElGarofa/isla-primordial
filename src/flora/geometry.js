// Geometrías procedurales de la flora. Cada constructor devuelve un BufferGeometry con grupos:
//   grupo 0 = madera/corteza (material de corteza), grupo 1 = follaje (alfa recortado), grupo 2 = extras (bayas, etc.).
// Atributos extra: aSway (0 en la base → 1 en la punta, para el viento) y color por vértice (AO horneado).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

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

/** Roca: icosfera desplazada con ruido y achatada; color por vértice (más oscura abajo, líquen arriba). */
export function buildRock(seed = 1, detail = 3) {
  const rnd = mulberry32(seed * 2713 + 1);
  const geo = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const p = geo.attributes.position;
  const ph = [rnd() * 9, rnd() * 9, rnd() * 9], fr = [1.3 + rnd(), 2.7 + rnd() * 1.4, 5.5 + rnd() * 2];
  const sx = 0.9 + rnd() * 0.5, sy = 0.55 + rnd() * 0.3, sz = 0.8 + rnd() * 0.5;
  const mp = (x, y, z) => {
    let d = 0; for (let o = 0; o < 3; o++) d += Math.sin(x * fr[o] + ph[o]) * Math.cos(z * fr[o] * 0.9 + ph[(o + 1) % 3]) * Math.sin(y * fr[o] * 1.1 + ph[(o + 2) % 3]) / (o + 1.2);
    return 1 + d * 0.28;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = mp(x, y, z);
    // facetas: cuantiza un poco la altura para sugerir planos de fractura
    p.setXYZ(i, x * k * sx, Math.max(-0.35, y * k * sy), z * k * sz);
  }
  geo.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), up = geo.attributes.normal.getY(i);
    const base = 0.62 + 0.25 * Math.max(0, y) + (rnd() * 0.02);
    const moss = Math.max(0, up - 0.45) * 0.9;
    col[i * 3] = base * (0.92 - moss * 0.35); col[i * 3 + 1] = base * (0.9 + moss * 0.18); col[i * 3 + 2] = base * (0.86 - moss * 0.35);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.9 + p.getZ(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.9 + p.getZ(i) * 0.6; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  geo.clearGroups(); geo.addGroup(0, p.count, 0);
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
