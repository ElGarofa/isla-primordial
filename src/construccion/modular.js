// Construcción modular (fase F3 del GDD): cimientos, suelos, paredes (lisa, con puerta, con ventana), puertas, techos, pilares,
// escaleras, rampas, vallas y empalizadas, en paja, madera o piedra, sobre una rejilla de 2,5 m. Aquí están los DATOS (costes,
// resistencia, deterioro, cómo encaja cada pieza) y las MALLAS; la colocación con encaje, apoyos, colisión, demolición,
// reparación y deterioro vive en construccion/index.js. Coordenadas locales: +z adelante, origen en la base de la pieza
// (cimientos, suelos, rampas y escaleras: origen en la cara de arriba del tablero sobre el que se camina).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { texTablas, texPaja } from './piezas.js';

export const TILE = 2.5; // lado de la rejilla
export const ALTO = 2.5; // alto de una pared (un piso)
export const GROSOR = 0.22; // grosor de pared

/** hp: resistencia; deterioro: fracción de la resistencia que pierde por día de juego a la intemperie; coste: materiales por pieza (× factor). */
export const MATERIALES = {
  paja: { nombre: 'Paja', hp: 90, deterioro: 0.06, coste: { fibra: 8, rama: 4 } },
  madera: { nombre: 'Madera', hp: 260, deterioro: 0.015, coste: { madera: 8, cuerda: 1 } },
  piedra: { nombre: 'Piedra', hp: 750, deterioro: 0.003, coste: { piedra: 10, arcilla: 2 } },
};

/**
 * encaje: cómo se coloca
 *   'rejilla'  sobre el terreno o junto a otro cimiento (alineado)            → cimiento, rampa
 *   'losa'     sobre una casilla (cimiento o suelo), o junto a otro suelo       → suelo (encima de paredes también), escalera
 *   'borde'    en el borde de una casilla, o encima de otra pared               → paredes
 *   'marco'    dentro del hueco de una pared con puerta                         → puerta
 *   'cubierta' encima de las paredes, cubriendo una casilla                     → techo
 *   'esquina'  en la esquina de una casilla                                     → pilar
 *   'linea'    en el terreno, unida por los extremos a otra igual               → valla, empalizada
 * pisable: se camina por encima (superficie); solido: colisión de caja; techo: cubre de la lluvia la casilla de debajo
 */
export const MODULOS = {
  cimiento: { nombre: 'Cimiento', mats: ['madera', 'piedra'], factor: 1.5, encaje: 'rejilla', pisable: true, libre: true },
  suelo: { nombre: 'Suelo', mats: ['madera', 'piedra'], factor: 1, encaje: 'losa', pisable: true, techo: true },
  pared: { nombre: 'Pared', mats: ['paja', 'madera', 'piedra'], factor: 1, encaje: 'borde', solido: true },
  pared_puerta: { nombre: 'Pared con puerta', mats: ['paja', 'madera', 'piedra'], factor: 0.85, encaje: 'borde', solido: true },
  pared_ventana: { nombre: 'Pared con ventana', mats: ['paja', 'madera', 'piedra'], factor: 0.9, encaje: 'borde', solido: true },
  puerta: { nombre: 'Puerta', mats: ['madera'], factor: 0.6, encaje: 'marco', solido: true },
  techo: { nombre: 'Techo', mats: ['paja', 'madera', 'piedra'], factor: 1.1, encaje: 'cubierta', techo: true },
  pilar: { nombre: 'Pilar', mats: ['madera', 'piedra'], factor: 0.4, encaje: 'esquina', solido: true },
  escalera: { nombre: 'Escalera', mats: ['madera', 'piedra'], factor: 1.2, encaje: 'losa', pisable: true },
  rampa: { nombre: 'Rampa', mats: ['madera', 'piedra'], factor: 1, encaje: 'rejilla', pisable: true, libre: true },
  valla: { nombre: 'Valla', mats: ['madera'], factor: 0.5, encaje: 'linea', solido: true, libre: true },
  empalizada: { nombre: 'Empalizada', mats: ['madera'], factor: 1.6, encaje: 'linea', solido: true, libre: true },
};
export const PUERTA = { ancho: 1.1, alto: 2.05 }; // hueco de la pared con puerta
export const VENTANA = { ancho: 1.0, y0: 0.95, y1: 1.75 };

/** Coste de una pieza en un material (enteros, mínimo 1 de cada). */
export function costeDe(mod, mat) {
  const f = MODULOS[mod].factor, base = MATERIALES[mat].coste, out = {};
  for (const [k, n] of Object.entries(base)) out[k] = Math.max(1, Math.round(n * f));
  return out;
}
export const hpDe = (mod, mat) => Math.round(MATERIALES[mat].hp * (mod === 'cimiento' ? 1.6 : mod === 'pilar' ? 0.8 : mod === 'puerta' ? 0.7 : mod === 'valla' ? 0.5 : 1));

/** Alto de la superficie pisable en coordenadas locales (lx, lz) o null si está fuera. Escalera y rampa suben hacia +z. */
export function alturaLocal(mod, lx, lz) {
  const h = TILE / 2;
  if (Math.abs(lx) > h + 0.02 || Math.abs(lz) > h + 0.02) return null;
  if (mod === 'cimiento' || mod === 'suelo') return 0;
  const t = Math.min(1, Math.max(0, (lz + h) / TILE));
  if (mod === 'escalera') return t * ALTO;
  if (mod === 'rampa') return t * (ALTO / 2);
  return null;
}

// ------------------------------------------------------------------------------------------------ materiales de las mallas
let MAT = null;
function lienzoPiedra() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = mulberry32(211);
  g.fillStyle = '#6f6a62'; g.fillRect(0, 0, 512, 512);
  // sillares irregulares con junta de argamasa
  const filas = 6, h = 512 / filas;
  for (let j = 0; j < filas; j++) {
    let x = -r() * 60;
    while (x < 512) {
      const w = 70 + r() * 70, v = 0.75 + r() * 0.4, y0 = j * h;
      g.fillStyle = `rgb(${Math.round(120 * v)},${Math.round(114 * v)},${Math.round(104 * v)})`;
      g.beginPath(); g.roundRect(x + 3, y0 + 3, w - 6, h - 6, 10); g.fill();
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,36,30' : '200,194,182'},${0.05 + r() * 0.08})`; g.fillRect(x + r() * w, y0 + r() * h, 2 + r() * 8, 2 + r() * 5); }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
/** Materiales de los módulos (una vez). `tex` = texturas de la flora (corteza y frondas); `ajustar` = ctx.lighting.setupMaterial. */
export function materialesModulos(tex = null, ajustar = () => {}) {
  if (MAT) return MAT;
  const corteza = tex?.bark?.selva ?? tex?.bark?.conifera ?? null;
  const tronco = new THREE.MeshStandardMaterial({ color: corteza ? 0xf2e6d8 : 0x6b4a2c, map: corteza?.albedo ?? null, normalMap: corteza?.normal ?? null, roughness: 0.95, metalness: 0 });
  const tablas = new THREE.MeshStandardMaterial({ map: texTablas(4), roughness: 0.88, metalness: 0 });
  const tablasV = new THREE.MeshStandardMaterial({ map: texTablas(6), roughness: 0.88, metalness: 0 });
  const piedra = new THREE.MeshStandardMaterial({ map: lienzoPiedra(), roughness: 0.92, metalness: 0 });
  const paja = new THREE.MeshStandardMaterial({ map: texPaja(), roughness: 1, metalness: 0, side: THREE.DoubleSide, color: 0xd8c08a });
  const hoja = new THREE.MeshStandardMaterial({ color: 0xcfc39a, map: tex?.frond ?? null, alphaTest: tex?.frond ? 0.5 : 0, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  const cuerda = new THREE.MeshStandardMaterial({ color: 0xb0905a, roughness: 1, metalness: 0 });
  MAT = { tronco, tablas, tablasV, piedra, paja, hoja, cuerda };
  for (const m of Object.values(MAT)) ajustar(m);
  return MAT;
}

// ------------------------------------------------------------------------------------------------ utilidades
const _v = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
function caja(w, h, d, mat, x, y, z, uv = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  // UV en metros: la textura no se estira con el tamaño de la caja
  const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
  for (let i = 0; i < U.count; i++) {
    const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i));
    const a = nx > 0.5 ? P.getZ(i) : P.getX(i), b = ny > 0.5 ? P.getZ(i) : P.getY(i);
    U.setXY(i, (a + 50) * 0.4 * uv, (b + 50) * 0.4 * uv);
  }
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function palo(a, b, r, mat, lados = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(r * 0.94, r, L, lados, 1);
  const U = geo.attributes.uv; for (let i = 0; i < U.count; i++) U.setY(i, U.getY(i) * L * 0.8);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_u, _v.copy(B).sub(A).normalize());
  return m;
}

/** Pared de troncos horizontales (madera), panel de paja con marco, o sillería (piedra) entre x0 y x1 y de y0 a y1. */
function lienzoPared(g, M, mat, x0, x1, y0, y1, r) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2;
  if (w < 0.05 || h < 0.05) return;
  if (mat === 'piedra') { g.add(caja(w, h, GROSOR, M.piedra, cx, y0 + h / 2, 0)); return; }
  if (mat === 'paja') {
    g.add(caja(w, h, GROSOR * 0.55, M.paja, cx, y0 + h / 2, 0, 1.6));
    return;
  }
  // madera: troncos apilados
  const rad = GROSOR * 0.55, n = Math.max(1, Math.round(h / (rad * 1.85)));
  for (let i = 0; i < n; i++) {
    const y = y0 + (h / n) * (i + 0.5), j = (r() - 0.5) * 0.04;
    g.add(palo([x0 - 0.02, y, j], [x1 + 0.02, y, j], rad * (0.92 + r() * 0.12), M.tronco, 9));
  }
}
/** Postes del marco de una pared de paja (y esquineros de las demás). */
function postes(g, M, mat, xs, y0, y1) {
  if (mat === 'piedra') return;
  for (const x of xs) g.add(palo([x, y0, 0], [x, y1, 0], mat === 'paja' ? 0.07 : 0.085, M.tronco, 7));
}

// ------------------------------------------------------------------------------------------------ mallas
const CONSTRUIR = {
  cimiento(M, mat, o) {
    const g = new THREE.Group(), h = Math.max(0.4, o.alto ?? 0.6), T = TILE;
    if (mat === 'piedra') {
      g.add(caja(T, h, T, M.piedra, 0, -h / 2, 0));
      g.add(caja(T + 0.04, 0.08, T + 0.04, M.piedra, 0, -0.04, 0)); // canto superior
    } else {
      // tablero de tablas sobre vigas y pies derechos de tronco hasta el suelo
      g.add(caja(T, 0.12, T, M.tablas, 0, -0.06, 0));
      for (const z of [-T / 2 + 0.15, 0, T / 2 - 0.15]) g.add(palo([-T / 2, -0.2, z], [T / 2, -0.2, z], 0.1, M.tronco));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) g.add(palo([x * (T / 2 - 0.12), -h - 0.3, z * (T / 2 - 0.12)], [x * (T / 2 - 0.12), -0.12, z * (T / 2 - 0.12)], 0.11, M.tronco));
    }
    return g;
  },
  suelo(M, mat) {
    const g = new THREE.Group(), T = TILE;
    if (mat === 'piedra') g.add(caja(T, 0.2, T, M.piedra, 0, -0.1, 0));
    else { g.add(caja(T, 0.1, T, M.tablas, 0, -0.05, 0)); for (const z of [-T / 2 + 0.2, T / 2 - 0.2]) g.add(palo([-T / 2, -0.17, z], [T / 2, -0.17, z], 0.08, M.tronco)); }
    return g;
  },
  pared(M, mat) {
    const g = new THREE.Group(), r = mulberry32(31), h = TILE / 2;
    lienzoPared(g, M, mat, -h, h, 0, ALTO, r);
    postes(g, M, mat, [-h + 0.04, h - 0.04], 0, ALTO);
    return g;
  },
  pared_puerta(M, mat) {
    const g = new THREE.Group(), r = mulberry32(37), h = TILE / 2, a = PUERTA.ancho / 2;
    lienzoPared(g, M, mat, -h, -a, 0, ALTO, r); lienzoPared(g, M, mat, a, h, 0, ALTO, r);
    lienzoPared(g, M, mat, -a, a, PUERTA.alto, ALTO, r);
    postes(g, M, mat, [-h + 0.04, h - 0.04, -a - 0.04, a + 0.04], 0, ALTO);
    if (mat !== 'piedra') g.add(palo([-a - 0.1, PUERTA.alto + 0.03, 0], [a + 0.1, PUERTA.alto + 0.03, 0], 0.09, M.tronco)); // dintel
    return g;
  },
  pared_ventana(M, mat) {
    const g = new THREE.Group(), r = mulberry32(41), h = TILE / 2, a = VENTANA.ancho / 2;
    lienzoPared(g, M, mat, -h, -a, 0, ALTO, r); lienzoPared(g, M, mat, a, h, 0, ALTO, r);
    lienzoPared(g, M, mat, -a, a, 0, VENTANA.y0, r); lienzoPared(g, M, mat, -a, a, VENTANA.y1, ALTO, r);
    postes(g, M, mat, [-h + 0.04, h - 0.04], 0, ALTO);
    if (mat !== 'piedra') for (const y of [VENTANA.y0, VENTANA.y1]) g.add(palo([-a - 0.08, y, 0], [a + 0.08, y, 0], 0.06, M.tronco));
    return g;
  },
  puerta(M) {
    // hoja de tablas con dos travesaños; bisagra en x = -ancho/2 (el grupo interior gira para abrir)
    const g = new THREE.Group(), hoja = new THREE.Group(), w = PUERTA.ancho - 0.06, h = PUERTA.alto - 0.04;
    hoja.add(caja(w, h, 0.07, M.tablasV, w / 2, h / 2, 0));
    for (const y of [0.35, h - 0.35]) hoja.add(caja(w - 0.1, 0.12, 0.05, M.tablas, w / 2, y, 0.06));
    hoja.add(caja(0.12, h * 0.9, 0.05, M.tablas, w / 2, h / 2, 0.06)); hoja.children.at(-1).rotation.z = Math.atan2(h - 0.7, w - 0.1) - Math.PI / 2; // tornapunta
    hoja.position.set(-PUERTA.ancho / 2 + 0.03, 0.02, 0);
    hoja.name = 'hoja';
    g.add(hoja);
    return g;
  },
  techo(M, mat) {
    // faldón de una casilla: alto en -z, bajo en +z, con alero; cumbrera de tronco
    const g = new THREE.Group(), T = TILE, sube = 0.9, largo = Math.hypot(T + 0.5, sube), ang = Math.atan2(sube, T + 0.5);
    const tabla = new THREE.Mesh(new THREE.BoxGeometry(T + 0.3, mat === 'piedra' ? 0.16 : 0.1, largo), mat === 'piedra' ? M.piedra : mat === 'paja' ? M.paja : M.tablas);
    const U = tabla.geometry.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 2.2, U.getY(i) * 2.2);
    tabla.position.set(0, sube / 2 + 0.06, 0); tabla.rotation.x = ang; tabla.castShadow = true; tabla.receiveShadow = true;
    g.add(tabla);
    if (mat === 'paja') { // manojos de fronda sobre la paja
      const r = mulberry32(53);
      for (let f = 0; f < 4; f++) for (let c = 0; c < 4; c++) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), M.hoja); q.castShadow = false;
        const t = -0.4 + f * 0.27, z = t * largo, y = sube / 2 + 0.13 - t * sube;
        q.position.set(-T / 2 + 0.35 + c * 0.6 + (r() - 0.5) * 0.1, y, z); q.rotation.set(-Math.PI / 2 + ang, (r() - 0.5) * 0.3, 0, 'YXZ');
        g.add(q);
      }
    }
    for (const x of [-T / 2 + 0.05, T / 2 - 0.05]) g.add(palo([x, sube + 0.02, -T / 2 - 0.25], [x, 0.02, T / 2 + 0.25], 0.07, M.tronco)); // cabios
    g.add(palo([-T / 2 - 0.15, sube + 0.04, -T / 2], [T / 2 + 0.15, sube + 0.04, -T / 2], 0.09, M.tronco));
    return g;
  },
  pilar(M, mat) {
    const g = new THREE.Group();
    if (mat === 'piedra') g.add(caja(0.34, ALTO, 0.34, M.piedra, 0, ALTO / 2, 0));
    else g.add(palo([0, 0, 0], [0, ALTO, 0], 0.15, M.tronco, 10));
    return g;
  },
  escalera(M, mat) {
    const g = new THREE.Group(), n = 8, T = TILE, sh = ALTO / n, sd = T / n;
    for (let i = 0; i < n; i++) {
      const y = sh * (i + 1), z = -T / 2 + sd * (i + 0.5);
      if (mat === 'piedra') g.add(caja(T * 0.8, y, sd, M.piedra, 0, y / 2, z));
      else g.add(caja(T * 0.8, 0.07, sd + 0.02, M.tablas, 0, y - 0.035, z));
    }
    if (mat !== 'piedra') for (const x of [-T * 0.4, T * 0.4]) g.add(palo([x, 0, -T / 2], [x, ALTO, T / 2], 0.08, M.tronco)); // zancas
    return g;
  },
  rampa(M, mat) {
    const g = new THREE.Group(), T = TILE, sube = ALTO / 2, largo = Math.hypot(T, sube), ang = Math.atan2(sube, T);
    const l = caja(T, mat === 'piedra' ? 0.25 : 0.1, largo, mat === 'piedra' ? M.piedra : M.tablas, 0, sube / 2 - 0.05, 0);
    l.rotation.x = -ang; g.add(l);
    if (mat !== 'piedra') for (const x of [-T / 2 + 0.15, T / 2 - 0.15]) g.add(palo([x, -0.05, -T / 2], [x, sube - 0.12, T / 2], 0.08, M.tronco));
    return g;
  },
  valla(M) {
    const g = new THREE.Group(), h = TILE / 2;
    for (const x of [-h + 0.06, h - 0.06]) g.add(palo([x, -0.25, 0], [x, 1.05, 0], 0.07, M.tronco));
    for (const y of [0.45, 0.85]) g.add(palo([-h, y, 0], [h, y, 0], 0.045, M.tronco, 6));
    return g;
  },
  empalizada(M) {
    const g = new THREE.Group(), r = mulberry32(61), n = 9, h = TILE / 2;
    for (let i = 0; i < n; i++) {
      const x = -h + (TILE / n) * (i + 0.5), alto = 2.8 + r() * 0.4, rad = 0.12 + r() * 0.03;
      g.add(palo([x, -0.3, 0], [x, alto, 0], rad, M.tronco, 8));
      const punta = new THREE.Mesh(new THREE.ConeGeometry(rad, 0.45, 8), M.tronco); punta.position.set(x, alto + 0.22, 0); punta.castShadow = true; g.add(punta);
    }
    g.add(palo([-h, 1.9, -0.16], [h, 1.9, -0.16], 0.06, M.tronco, 6)); g.add(palo([-h, 0.8, -0.16], [h, 0.8, -0.16], 0.06, M.tronco, 6));
    return g;
  },
};

/** Malla nueva de un módulo en un material. `o.alto` = alto del cimiento (hasta el suelo). */
export function mallaModulo(mod, mat, M, o = {}) { return CONSTRUIR[mod](M, mat, o); }

/** Cajas de colisión en coordenadas locales: { cx, cz, hx, hz, y0, y1 } (y relativo a la base de la pieza). */
export function cajasDe(mod, o = {}) {
  const h = TILE / 2, g = GROSOR / 2;
  switch (mod) {
    case 'pared': case 'pared_ventana': return [{ cx: 0, cz: 0, hx: h, hz: g, y0: 0, y1: ALTO }];
    case 'pared_puerta': { const a = PUERTA.ancho / 2, w = (h - a) / 2; return [{ cx: -(a + w), cz: 0, hx: w, hz: g, y0: 0, y1: ALTO }, { cx: a + w, cz: 0, hx: w, hz: g, y0: 0, y1: ALTO }, { cx: 0, cz: 0, hx: a, hz: g, y0: PUERTA.alto, y1: ALTO }]; }
    case 'puerta': return o.abierta ? [] : [{ cx: 0, cz: 0, hx: PUERTA.ancho / 2, hz: 0.06, y0: 0, y1: PUERTA.alto }];
    case 'pilar': return [{ cx: 0, cz: 0, hx: 0.17, hz: 0.17, y0: 0, y1: ALTO }];
    case 'valla': return [{ cx: 0, cz: 0, hx: h, hz: 0.08, y0: 0, y1: 1.05 }];
    case 'empalizada': return [{ cx: 0, cz: 0, hx: h, hz: 0.18, y0: 0, y1: 3.0 }];
    case 'cimiento': return [{ cx: 0, cz: 0, hx: h, hz: h, y0: -(o.alto ?? 0.6), y1: 0 }]; // sólido para las criaturas; el jugador lo sube como un escalón
    default: return [];
  }
}
