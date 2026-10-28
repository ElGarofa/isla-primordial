// MANOS Y ANTEBRAZOS en primera persona (sustituyen a las de esferas y toros): palma de caja redondeada, dedos de tres falanges con nudillos,
// pulgar de dos, uñas, piel con poros y relieve, antebrazo con el perfil de los músculos y una muñequera de cuero atada.
// Misma interfaz que antes (viewmodel.js): mano de agarre (mango vertical en el eje Y, dorso hacia +Z), puño de guardia (-Z adelante,
// muñeca en +Z, `userData.wrist`) y antebrazo de longitud unidad en Y con `userData = { arm, cuff }`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from '../core/rng.js';

// ---------------------------------------------------------------------------------------------- texturas de piel y cuero (canvas)
function lienzo(size, pintar) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  pintar(c.getContext('2d'), size);
  return c;
}
/** Altura → mapa de normales (canvas RGBA). */
function normalDe(alturas, size, fuerza) {
  return lienzo(size, (g) => {
    const img = g.createImageData(size, size), d = img.data, H = (x, y) => alturas[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * fuerza, dy = (H(x, y - 1) - H(x, y + 1)) * fuerza, l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
      d[o] = (dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function texturaPiel() {
  const S = 256, rnd = mulberry32(4401), h = new Float32Array(S * S);
  // poros y pliegues finos: puntos hundidos + líneas cruzadas muy suaves
  for (let i = 0; i < 2600; i++) { const x = (rnd() * S) | 0, y = (rnd() * S) | 0, r = 1 + (rnd() * 1.4) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const k = (((y + dy) + S) % S) * S + (((x + dx) + S) % S); h[k] -= 0.35 * Math.max(0, 1 - Math.hypot(dx, dy) / (r + 0.5)); } }
  for (let i = 0; i < 90; i++) { const x0 = rnd() * S, y0 = rnd() * S, a = (rnd() < 0.5 ? 0.6 : -0.6) + (rnd() - 0.5) * 0.4, L = 20 + rnd() * 40; for (let t = 0; t < L; t++) { const x = (x0 + Math.cos(a) * t) | 0, y = (y0 + Math.sin(a) * t) | 0; h[((y % S) + S) % S * S + (((x % S) + S) % S)] -= 0.25; } }
  const color = lienzo(S, (g) => {
    g.fillStyle = '#b5836a'; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < S * S; i++) { const n = (rnd() - 0.5) * 10 + h[i] * 22; d[i * 4] += n; d[i * 4 + 1] += n * 0.85; d[i * 4 + 2] += n * 0.75; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${150 + rnd() * 40},${70 + rnd() * 30},${55 + rnd() * 20},${0.04 + rnd() * 0.06})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 4 + rnd() * 14, 0, 6.3); g.fill(); } // manchas rojizas suaves
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,50,35,${0.08 + rnd() * 0.1})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.2, 0, 6.3); g.fill(); } // pecas
  });
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  return { map: tex(color, true), normal: tex(normalDe(h, S, 2.2), false) };
}
function texturaCuero() {
  const S = 128, rnd = mulberry32(911), h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = rnd() * 0.25;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = y * S + x; if (y % 32 < 3) h[k] -= 0.9; if ((x + (y >> 4) * 9) % 24 < 2 && y % 32 > 6) h[k] -= 0.5; } // costuras de la tira y puntadas
  const color = lienzo(S, (g) => {
    g.fillStyle = '#6b4427'; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < S * S; i++) { const n = (rnd() - 0.5) * 22 + h[i] * 40; d[i * 4] += n; d[i * 4 + 1] += n * 0.8; d[i * 4 + 2] += n * 0.6; }
    g.putImageData(img, 0, 0);
  });
  const t = new THREE.CanvasTexture(color); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  const n = new THREE.CanvasTexture(normalDe(h, S, 3)); n.wrapS = n.wrapT = THREE.RepeatWrapping;
  return { map: t, normal: n };
}

/** Materiales de las manos (se crean una vez). */
export function materialesManos() {
  const p = texturaPiel(), c = texturaCuero();
  p.map.repeat.set(3, 3); p.normal.repeat.set(3, 3);
  return {
    piel: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: p.map, normalMap: p.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.58, metalness: 0, sheen: 0.22, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc4b0), emissive: 0x2a0c06, emissiveIntensity: 0.1 }),
    una: new THREE.MeshStandardMaterial({ color: 0xe8c2b0, roughness: 0.32, metalness: 0 }),
    cuero: new THREE.MeshStandardMaterial({ color: 0xffffff, map: c.map, normalMap: c.normal, roughness: 0.82, metalness: 0 }),
  };
}

// ---------------------------------------------------------------------------------------------- piezas
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0);
/** Cápsula de `a` a `b` con radio r0→r1 (cono redondeado): cilindro + dos semiesferas. */
function hueso(a, b, r0, r1 = r0) {
  const d = V().subVectors(b, a), L = d.length();
  const cil = new THREE.CylinderGeometry(r1, r0, L, 12, 2, true); cil.translate(0, L / 2, 0);
  const s0 = new THREE.SphereGeometry(r0, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const s1 = new THREE.SphereGeometry(r1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); s1.translate(0, L, 0);
  const g = mergeGeometries([cil, s0, s1].map((x) => x.index ? x.toNonIndexed() : x));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize())); g.translate(a.x, a.y, a.z);
  return g;
}
/** Uña: lámina curva sobre la punta de la falange distal (de `a` a `b`), mirando hacia `fuera`. */
function una(a, b, r, fuera) {
  const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  g.scale(r * 0.85, r * 0.32, r * 1.25);
  const dir = V().subVectors(b, a).normalize(), out = fuera.clone().sub(dir.clone().multiplyScalar(fuera.dot(dir))).normalize();
  const m = new THREE.Matrix4().makeBasis(V().crossVectors(out, dir).normalize(), out, dir);
  g.applyMatrix4(m);
  const c = a.clone().lerp(b, 0.62).addScaledVector(out, r * 0.78); g.translate(c.x, c.y, c.z);
  return g;
}
/** Dedo como cadena de puntos [mcp, pip, dip, punta] con radios; devuelve { piel: [geo], unas: [geo] }. */
function dedo(pts, r, fueraPunta) {
  const piel = [hueso(pts[0], pts[1], r, r * 0.95), hueso(pts[1], pts[2], r * 0.95, r * 0.88), hueso(pts[2], pts[3], r * 0.88, r * 0.78)];
  // nudillos algo más anchos
  for (const k of [0, 1, 2]) { const s = new THREE.SphereGeometry(r * (k === 0 ? 1.12 : 1.04), 10, 8); s.translate(pts[k].x, pts[k].y, pts[k].z); piel.push(s.toNonIndexed()); }
  return { piel, unas: [una(pts[2], pts[3], r * 0.88, fueraPunta)] };
}
function malla(piel, unas, M, mirror) {
  const g = new THREE.Group();
  const gp = mergeGeometries(piel.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { x.deleteAttribute?.('uv'); return x; }));
  // UV por proyección de caja (la textura de piel es uniforme)
  const p = gp.attributes.position, n = gp.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const [u, v] = ax > ay ? [p.getZ(i), p.getY(i)] : ay > 0.6 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]; uv[i * 2] = u * 12; uv[i * 2 + 1] = v * 12; }
  gp.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mp = new THREE.Mesh(gp, M.piel), mu = new THREE.Mesh(mergeGeometries(unas.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { x.deleteAttribute?.('uv'); return x; })), M.una);
  g.add(mp, mu);
  if (mirror) g.scale.x = -1;
  return g;
}

/**
 * Mano que empuña un mango vertical (eje Y) de radio `radio`. El dorso mira a +Z (hacia la cámara), los dedos rodean el mango por detrás (-Z)
 * y el pulgar cierra por delante. Origen en el eje del mango, a la altura del dedo corazón.
 */
export function manoAgarre(M, radio = 0.019, mirror = false) {
  const piel = [], unas = [];
  // DORSO: elipsoide aplanado «doblado» alrededor del mango (x → ángulo), así abraza el mango y se ve curvo (nada de caja).
  const rD = radio + 0.013; // radio del centro del dorso
  const dorso = new THREE.SphereGeometry(1, 28, 20);
  { const q = dorso.attributes.position; for (let i = 0; i < q.count; i++) {
    let x = q.getX(i), y = q.getY(i), z = q.getZ(i);
    // semiejes: 0,031 (alrededor del mango) × 0,046 (a lo largo) × 0,0125 (grosor); más fino hacia los nudillos (+x) y hacia la muñeca (-y)
    const fx = 1 - 0.28 * Math.max(0, x), fy = 1 - 0.2 * Math.max(0, -y);
    x = x * 0.031 - 0.004; y = y * 0.046 * (1 - 0.1 * Math.max(0, x / 0.031)); z = z * 0.0125 * fx * fy;
    q.setXYZ(i, x, y, rD + z);
  } }
  doblar(dorso, rD, radio + 0.0015); piel.push(dorso);
  // tendones extensores: crestas suaves de la muñeca a cada nudillo, sobre el dorso
  const D = [[0.03, 0.0098, 0.045, 0.027, 0.021], [0.0105, 0.0102, 0.049, 0.03, 0.022], [-0.0095, 0.0098, 0.046, 0.028, 0.021], [-0.0295, 0.0088, 0.037, 0.022, 0.018]];
  for (const [y] of D) {
    const t = hueso(V(-0.01, -0.03, rD + 0.0062), V(0.025, y * 0.92, rD + 0.0072), 0.003, 0.0042);
    doblar(t, rD, radio + 0.0015); piel.push(t);
  }
  // dedos: índice arriba → meñique abajo; cada uno nace en su nudillo (borde +X del dorso) y rodea el mango por detrás
  for (const [y, r, l1, l2, l3] of D) {
    const R = radio + r * 1.02, f0 = 0.5; // ángulo del nudillo (rad, desde +X hacia +Z)
    const ang = [f0, f0 - l1 / R, f0 - (l1 + l2) / R, f0 - (l1 + l2 + l3) / R];
    const pts = ang.map((a, k) => V(Math.cos(a) * (R + (k === 0 ? 0.0035 : 0)), y - k * 0.0015, Math.sin(a) * (R + (k === 0 ? 0.0035 : 0))));
    const fin = ang[3], fuera = V(Math.cos(fin), 0, Math.sin(fin));
    const d = dedo(pts, r, fuera); piel.push(...d.piel); unas.push(...d.unas);
    const nud = new THREE.SphereGeometry(r * 1.22, 14, 10); nud.scale(1, 0.92, 1); nud.translate(pts[0].x, pts[0].y, pts[0].z); piel.push(nud.toNonIndexed()); // cabeza del metacarpo
  }
  // pulgar: del borde -X del dorso, cruza por delante del mango sobre la punta del índice
  const t0 = V(-0.026, 0.022, radio + 0.017), t1 = V(-radio - 0.015, 0.031, radio * 0.35), t2 = V(-radio * 0.62, 0.036, -radio - 0.006), t3 = V(0.002, 0.036, -radio - 0.014);
  piel.push(hueso(t0, t1, 0.0128, 0.0116), hueso(t1, t2, 0.0116, 0.0106), hueso(t2, t3, 0.0106, 0.0093));
  for (const p of [t1, t2]) { const s2 = new THREE.SphereGeometry(0.0119, 12, 8); s2.translate(p.x, p.y, p.z); piel.push(s2.toNonIndexed()); }
  unas.push(una(t2, t3, 0.01, V(0, 0.4, -1).normalize()));
  // eminencia tenar (la base del pulgar, que une el pulgar con el dorso) y talón de la mano hacia la muñeca
  const ten = new THREE.SphereGeometry(1, 16, 12); ten.scale(0.019, 0.026, 0.013); ten.translate(-0.021, 0.008, radio + 0.009); piel.push(ten);
  const talon = new THREE.SphereGeometry(1, 18, 14); talon.scale(0.021, 0.024, 0.0125); talon.translate(-0.003, -0.036, radio + 0.016); piel.push(talon); // talón: une el dorso con la muñeca
  return malla(piel, unas, M, mirror);
}

/** Dobla una pieza modelada «en plano» (x a lo largo del dorso, z = distancia al eje) alrededor del eje Y del mango, sin dejarla entrar en él. */
function doblar(geo, rRef, rMin) {
  const q = geo.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i), y = q.getY(i), z = q.getZ(i), th = Math.PI / 2 - x / rRef, rho = Math.max(rMin, z);
    q.setXYZ(i, rho * Math.cos(th), y, rho * Math.sin(th));
  }
  geo.deleteAttribute('normal'); geo.computeVertexNormals();
  return geo;
}

/** Puño de guardia. Marco: -Z hacia delante, +Y arriba, el antebrazo sale hacia +Z. */
export function puno(M, mirror = false) {
  const piel = [], unas = [];
  const cuerpo = new THREE.SphereGeometry(1, 28, 18);
  { const q = cuerpo.attributes.position; for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i), z = q.getZ(i); q.setXYZ(i, x * 0.04 * (1 - 0.12 * Math.max(0, z)), y * 0.0165 * (1 + 0.25 * Math.max(0, y)) + 0.002, z * 0.039); } }
  cuerpo.deleteAttribute('normal'); cuerpo.computeVertexNormals();
  for (const x of [-0.027, -0.0088, 0.0095, 0.027]) piel.push(hueso(V(x * 0.4, 0.012, 0.055), V(x, 0.014, 0.0), 0.003, 0.0042)); // tendones extensores
  cuerpo.translate(0.0, 0.0, 0.03); piel.push(cuerpo);
  // dedos plegados: nudillos al frente arriba, falanges hacia abajo y hacia atrás (las puntas quedan bajo la palma)
  const D = [[-0.027, 0.0098, 0.042, 0.026, 0.02], [-0.0088, 0.0104, 0.046, 0.028, 0.021], [0.0095, 0.0099, 0.044, 0.027, 0.02], [0.027, 0.009, 0.035, 0.021, 0.017]];
  for (const [x, r, l1, l2, l3] of D) {
    const mcp = V(x, 0.009, -0.006), pip = mcp.clone().add(V(0, -l1 * 0.55, -l1 * 0.83)), dip = pip.clone().add(V(0, -l2 * 0.85, l2 * 0.53)), tip = dip.clone().add(V(0, -l3 * 0.15, l3 * 0.99));
    const d = dedo([mcp, pip, dip, tip], r, V(0, -1, 0)); piel.push(...d.piel); unas.push(...d.unas);
    const nud = new THREE.SphereGeometry(r * 1.32, 12, 10); nud.scale(1, 0.85, 1); nud.translate(mcp.x, mcp.y + 0.002, mcp.z); piel.push(nud.toNonIndexed());
  }
  // pulgar cruzando por delante de las falanges medias del índice y el corazón
  const t0 = V(-0.036, -0.004, 0.034), t1 = V(-0.044, -0.02, 0.0), t2 = V(-0.03, -0.031, -0.03), t3 = V(-0.007, -0.034, -0.044);
  piel.push(hueso(t0, t1, 0.0135, 0.0125), hueso(t1, t2, 0.0125, 0.0112), hueso(t2, t3, 0.0112, 0.0098));
  for (const p of [t1, t2]) { const s = new THREE.SphereGeometry(0.0128, 10, 8); s.translate(p.x, p.y, p.z); piel.push(s.toNonIndexed()); }
  unas.push(una(t2, t3, 0.0105, V(0, 0.2, -1).normalize()));
  const g = malla(piel, unas, M, false);
  g.userData.wrist = new THREE.Vector3(0.002, -0.004, 0.075);
  g.userData.fist = true;
  if (mirror) g.scale.x = -1;
  return g;
}

/** Antebrazo de longitud 1 en Y (lo estira viewmodel.placeArm del codo a la muñeca) y muñequera de cuero atada. */
export function antebrazo(M) {
  const g = new THREE.Group();
  const perfil = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const r = 0.026 + 0.016 * Math.pow(1 - t, 0.8) + 0.004 * Math.sin(t * Math.PI) * (1 - t); perfil.push(new THREE.Vector2(r, t - 0.5)); }
  const geo = new THREE.LatheGeometry(perfil, 20);
  // aplastado: el antebrazo es más ancho que alto
  geo.scale(1.08, 1, 0.9);
  const arm = new THREE.Mesh(geo, M.piel);
  const cuffGeo = new THREE.CylinderGeometry(0.0335, 0.036, 0.085, 20, 4, true);
  const p = cuffGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.06 * Math.sin((y + 0.05) * 140) * 0.3; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * 0.92); } // vueltas de la tira
  cuffGeo.computeVertexNormals();
  const cuff = new THREE.Mesh(cuffGeo, M.cuero);
  const lazo = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 6, 22), M.cuero); lazo.rotation.x = Math.PI / 2; lazo.position.y = 0.035; cuff.add(lazo);
  g.add(arm, cuff);
  g.userData = { arm, cuff };
  return g;
}
