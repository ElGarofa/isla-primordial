// Piezas colocables de la construcción: datos (huella, apoyo, colisión, techo, contenedor, acción) y su malla.
// Módulo de DATOS + mallas procedurales. Las texturas de corteza y hojas son las fotos de la flora (ctx.flora.texturas) cuando
// existen; los tejidos, tablas y barro se dibujan por código. Medidas en metros; +z es el frente de la pieza (cabecera, abertura).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/**
 * Campos:
 *   nombre, item (objeto del inventario que la coloca)
 *   huella [ancho x, largo z]: rectángulo que debe apoyar en tierra firme
 *   desnivel: diferencia máxima de altura del terreno bajo la huella (m)
 *   colision: círculos { x, z, r, h } en coordenadas de la pieza (el jugador y las criaturas no los atraviesan)
 *   techo: rectángulo { x0, x1, z0, z1, alto } que queda cubierto (refugio de la lluvia)
 *   contenedor: { casillas, conserva } (conserva = multiplicador del deterioro de la comida guardada)
 *   accion: 'dormir' | 'abrir' | null
 *   reembolso: fracción de los materiales que se recupera al desmontarla (las piezas pequeñas se recogen enteras)
 */
export const PIEZAS = {
  cama_hojas: {
    nombre: 'Cama de hojas', item: 'cama_hojas', huella: [1.05, 2.2], desnivel: 0.4,
    colision: [], accion: 'dormir', recoger: true,
  },
  refugio_ramas: {
    nombre: 'Refugio de ramas', item: 'refugio_ramas', huella: [2.7, 2.5], desnivel: 0.6,
    // horcones delante y el faldón bajo detrás (no se atraviesa la pared de frondas; se entra por delante)
    colision: [{ x: -1.2, z: 0.9, r: 0.14, h: 1.8 }, { x: 1.2, z: 0.9, r: 0.14, h: 1.8 }, { x: -0.85, z: -0.85, r: 0.45, h: 0.6 }, { x: 0, z: -0.85, r: 0.45, h: 0.6 }, { x: 0.85, z: -0.85, r: 0.45, h: 0.6 }],
    techo: { x0: -1.3, x1: 1.3, z0: -1.1, z1: 0.95, alto: 1.7 }, accion: null, recoger: true,
  },
  cesta: {
    nombre: 'Cesta de fibra', item: 'cesta', huella: [0.6, 0.6], desnivel: 0.25,
    colision: [{ x: 0, z: 0, r: 0.3, h: 0.45 }], contenedor: { casillas: 8, conserva: 1 }, accion: 'abrir', recoger: true,
  },
  cofre_madera: {
    nombre: 'Cofre de madera', item: 'cofre_madera', huella: [1.05, 0.65], desnivel: 0.25,
    colision: [{ x: -0.25, z: 0, r: 0.32, h: 0.65 }, { x: 0.25, z: 0, r: 0.32, h: 0.65 }], contenedor: { casillas: 16, conserva: 1 }, accion: 'abrir', recoger: true,
  },
  vasija_barro: {
    nombre: 'Vasija de barro', item: 'vasija_barro', huella: [0.55, 0.55], desnivel: 0.25,
    colision: [{ x: 0, z: 0, r: 0.27, h: 0.6 }], contenedor: { casillas: 6, conserva: 0.4 }, accion: 'abrir', recoger: true,
  },
};

// ------------------------------------------------------------------------------------------------ texturas dibujadas por código
const cacheTex = new Map();
function lienzo(clave, w, h, pintar, { repetir = true } = {}) {
  if (cacheTex.has(clave)) return cacheTex.get(clave);
  let t;
  if (typeof document === 'undefined') { t = new THREE.Texture(); }
  else {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    pintar(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c);
  }
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cacheTex.set(clave, t);
  return t;
}

/** Paja / fibra seca: trazos cortos en tonos de heno. */
export function texPaja() {
  return lienzo('paja', 256, 256, (g, w, h) => {
    const r = mulberry32(41);
    g.fillStyle = '#8a7444'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI / 2) * 0.15, l = 8 + r() * 26;
      const v = 0.55 + r() * 0.6;
      g.strokeStyle = `rgba(${Math.round(196 * v)},${Math.round(170 * v)},${Math.round(98 * v)},${0.35 + r() * 0.5})`;
      g.lineWidth = 0.8 + r() * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
}

/** Cestería: trama de tiras horizontales y montantes verticales con sombreado. */
export function texCesteria() {
  return lienzo('cesteria', 256, 256, (g, w, h) => {
    const r = mulberry32(57);
    g.fillStyle = '#5e4526'; g.fillRect(0, 0, w, h);
    const filas = 16, cols = 12, fh = h / filas, cw = w / cols;
    for (let j = 0; j < filas; j++) for (let i = 0; i < cols; i++) {
      const arriba = (i + j) % 2 === 0, v = 0.78 + r() * 0.35;
      const grad = g.createLinearGradient(0, j * fh, 0, (j + 1) * fh);
      grad.addColorStop(0, `rgb(${Math.round(150 * v)},${Math.round(118 * v)},${Math.round(70 * v)})`);
      grad.addColorStop(0.5, `rgb(${Math.round(196 * v)},${Math.round(160 * v)},${Math.round(98 * v)})`);
      grad.addColorStop(1, `rgb(${Math.round(120 * v)},${Math.round(92 * v)},${Math.round(52 * v)})`);
      g.fillStyle = grad;
      if (arriba) g.fillRect(i * cw + 1, j * fh + 1, cw - 2, fh - 2);
      else { g.fillRect(i * cw + 1, j * fh + fh * 0.3, cw - 2, fh * 0.4); }
    }
    for (let i = 0; i < cols; i++) { g.fillStyle = 'rgba(40,28,14,0.55)'; g.fillRect(i * cw + cw * 0.46, 0, cw * 0.08, h); }
  });
}

/** Tablas de madera: vetas, nudos y juntas oscuras. `filas` tablas horizontales en la altura de la textura. */
export function texTablas(filas = 4) {
  return lienzo(`tablas${filas}`, 512, 512, (g, w, h) => {
    const r = mulberry32(73 + filas);
    const th = h / filas;
    for (let j = 0; j < filas; j++) {
      const base = 0.75 + r() * 0.3, y0 = j * th;
      g.fillStyle = `rgb(${Math.round(124 * base)},${Math.round(86 * base)},${Math.round(52 * base)})`; g.fillRect(0, y0, w, th);
      for (let k = 0; k < 70; k++) { // vetas
        const yy = y0 + r() * th, v = 0.6 + r() * 0.5, amp = 2 + r() * 5, fase = r() * 6;
        g.strokeStyle = `rgba(${Math.round(90 * v)},${Math.round(60 * v)},${Math.round(34 * v)},${0.25 + r() * 0.35})`; g.lineWidth = 0.6 + r() * 1.5;
        g.beginPath(); for (let x = 0; x <= w; x += 16) { const y = yy + Math.sin(x * 0.012 + fase) * amp; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
      for (let k = 0; k < 2; k++) { // nudos
        const nx = r() * w, ny = y0 + th * (0.3 + r() * 0.4), nr = 4 + r() * 6;
        const gr = g.createRadialGradient(nx, ny, 0, nx, ny, nr * 2); gr.addColorStop(0, 'rgba(50,30,14,0.9)'); gr.addColorStop(1, 'rgba(50,30,14,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(nx, ny, nr * 2.2, nr, 0, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(20,12,6,0.85)'; g.fillRect(0, y0, w, 3); // junta
    }
  });
}

/** Barro cocido: terracota con moteado, marcas de torno y dos franjas incisas. */
export function texBarro() {
  return lienzo('barro', 256, 256, (g, w, h) => {
    const r = mulberry32(91);
    g.fillStyle = '#9a5a36'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const v = 0.7 + r() * 0.55; g.fillStyle = `rgba(${Math.round(170 * v)},${Math.round(104 * v)},${Math.round(66 * v)},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(60,30,16,${0.04 + r() * 0.05})`; g.fillRect(0, y, w, 1); } // torno
    for (const fy of [0.34, 0.62]) { g.fillStyle = 'rgba(52,26,14,0.7)'; g.fillRect(0, h * fy, w, 3); g.fillStyle = 'rgba(210,150,110,0.35)'; g.fillRect(0, h * fy + 3, w, 1); }
    g.fillStyle = 'rgba(30,16,8,0.18)'; g.fillRect(0, h * 0.86, w, h * 0.14); // pie tiznado
  });
}

/** Cuero oscuro para correas. */
export function texCuero() {
  return lienzo('cuero', 128, 128, (g, w, h) => {
    const r = mulberry32(19);
    g.fillStyle = '#4a2e18'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = 0.6 + r() * 0.7; g.fillStyle = `rgba(${Math.round(110 * v)},${Math.round(70 * v)},${Math.round(40 * v)},0.3)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  });
}

// ------------------------------------------------------------------------------------------------ materiales compartidos
let MAT = null;
/** Materiales de las piezas (una vez). `tex` = texturas de la flora: { bark: { selva: { albedo, normal } }, frond, foliage } (opcional). */
export function materiales(tex = null, ajustar = () => {}) {
  if (MAT) return MAT;
  const corteza = tex?.bark?.selva ?? tex?.bark?.palma ?? null;
  const madera = new THREE.MeshStandardMaterial({ color: corteza ? 0xffffff : 0x6b4a2c, map: corteza?.albedo ?? null, normalMap: corteza?.normal ?? null, roughness: 0.95, metalness: 0 });
  const hojaMap = tex?.frond ?? tex?.foliage ?? null;
  const hoja = new THREE.MeshStandardMaterial({ color: hojaMap ? 0xd8e0c8 : 0x4f7a33, map: hojaMap, alphaTest: hojaMap ? 0.5 : 0, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const hojaSeca = new THREE.MeshStandardMaterial({ color: hojaMap ? 0xc8a878 : 0x8a7444, map: hojaMap, alphaTest: hojaMap ? 0.5 : 0, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  const paja = new THREE.MeshStandardMaterial({ map: texPaja(), roughness: 1, metalness: 0 });
  const pajaDoble = new THREE.MeshStandardMaterial({ map: texPaja(), roughness: 1, metalness: 0, side: THREE.DoubleSide, color: 0xb8a070 });
  const cesteria = new THREE.MeshStandardMaterial({ map: texCesteria(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const tablas = new THREE.MeshStandardMaterial({ map: texTablas(4), roughness: 0.88, metalness: 0 });
  const tapa = new THREE.MeshStandardMaterial({ map: texTablas(3), roughness: 0.88, metalness: 0 });
  const cuero = new THREE.MeshStandardMaterial({ map: texCuero(), roughness: 0.7, metalness: 0 });
  const barro = new THREE.MeshStandardMaterial({ map: texBarro(), roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  const cuerda = new THREE.MeshStandardMaterial({ color: 0xb0905a, roughness: 1, metalness: 0 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 1, metalness: 0 });
  MAT = { madera, hoja, hojaSeca, paja, pajaDoble, cesteria, tablas, tapa, cuero, barro, cuerda, interior };
  for (const m of Object.values(MAT)) ajustar(m);
  return MAT;
}

// ------------------------------------------------------------------------------------------------ utilidades de malla
const malla = (geo, mat, sombra = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = sombra; m.receiveShadow = true; return m; };

/** Palo o tronco entre dos puntos (cilindro con algo de conicidad y UV repetida a lo largo). */
function palo(a, b, r0, r1, mat, lados = 7) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), L = A.distanceTo(Bv);
  const geo = new THREE.CylinderGeometry(r1, r0, L, lados, 1);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L * 1.2); // la corteza no se estira con el largo
  const m = malla(geo, mat);
  m.position.copy(A).add(Bv).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
  return m;
}

/** Hoja o fronda plana (tarjeta con transparencia). `rot` = [x, y, z] en radianes. */
function tarjeta(w, l, mat, pos, rot) {
  const geo = new THREE.PlaneGeometry(w, l);
  const m = malla(geo, mat, false);
  m.position.set(...pos); m.rotation.set(...rot, 'YXZ');
  return m;
}

// ------------------------------------------------------------------------------------------------ mallas de cada pieza
const CONSTRUIR = {
  cama_hojas(M) {
    const g = new THREE.Group(), r = mulberry32(7);
    // bastidor de ramas
    g.add(palo([-0.48, 0.07, -1.08], [-0.48, 0.07, 1.08], 0.065, 0.055, M.madera));
    g.add(palo([0.48, 0.07, -1.08], [0.48, 0.07, 1.08], 0.065, 0.055, M.madera));
    g.add(palo([-0.56, 0.1, -1.0], [0.56, 0.1, -1.0], 0.055, 0.05, M.madera));
    g.add(palo([-0.56, 0.1, 1.0], [0.56, 0.1, 1.0], 0.055, 0.05, M.madera));
    // colchón de fibra abombado
    const geo = new THREE.BoxGeometry(0.9, 0.16, 1.96, 8, 2, 16), P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (y > 0) P.setY(i, y + 0.06 * (1 - (2 * x / 0.9) ** 2) * (1 - (z / 0.98) ** 4) + (r() - 0.5) * 0.02);
    }
    geo.computeVertexNormals();
    const col = malla(geo, M.paja); col.position.y = 0.16; g.add(col);
    // hojas encima, solapadas
    for (let i = 0; i < 16; i++) {
      const z = -0.85 + (i % 8) * 0.24 + (r() - 0.5) * 0.08, x = (i < 8 ? -0.2 : 0.2) + (r() - 0.5) * 0.12;
      g.add(tarjeta(0.42 + r() * 0.12, 0.7 + r() * 0.2, i % 3 ? M.hoja : M.hojaSeca, [x, 0.3 + r() * 0.015, z], [-Math.PI / 2 + (r() - 0.5) * 0.12, (r() - 0.5) * 1.2 + (i < 8 ? 0.3 : -0.3), 0]));
    }
    // almohada de fibra en la cabecera
    const alm = malla(new THREE.SphereGeometry(0.2, 12, 8), M.paja); alm.scale.set(1.6, 0.42, 0.9); alm.position.set(0, 0.33, 0.78); g.add(alm);
    return g;
  },

  refugio_ramas(M) {
    const g = new THREE.Group(), r = mulberry32(13);
    const frente = 0.9, atras = -1.15, alto = 1.72;
    // horcones delanteros con su horqueta
    for (const sx of [-1.2, 1.2]) {
      g.add(palo([sx, -0.05, frente], [sx * 1.02, alto + 0.08, frente], 0.075, 0.06, M.madera));
      g.add(palo([sx * 1.02, alto - 0.05, frente], [sx * 1.06 + 0.06 * Math.sign(sx), alto + 0.22, frente + 0.05], 0.035, 0.025, M.madera));
    }
    // cumbrera
    g.add(palo([-1.36, alto, frente], [1.36, alto, frente], 0.06, 0.055, M.madera));
    // varas inclinadas de la cumbrera al suelo (sobresalen un poco por delante)
    const N = 8, dz = frente - atras, dy = alto;
    for (let i = 0; i < N; i++) {
      const x = -1.22 + (2.44 * i) / (N - 1) + (r() - 0.5) * 0.05;
      g.add(palo([x, 0.0, atras], [x, alto + 0.12, frente + 0.12 * (dz / dy) * 0.4], 0.045, 0.035, M.madera, 6));
    }
    // travesaños
    for (const f of [0.28, 0.55, 0.8]) {
      const y = alto * f, z = atras + dz * f;
      g.add(palo([-1.3, y + 0.04, z], [1.3, y + 0.04, z], 0.028, 0.025, M.madera, 5));
    }
    // techado: una capa continua de hojarasca trenzada sobre las varas (tapa la luz) y encima frondas en hileras, de abajo arriba
    // (cada hilera tapa la base de la siguiente)
    const ang = Math.atan2(dy, dz), largo = Math.hypot(dy, dz) + 0.25; // inclinación y largo del faldón
    const capa = malla(new THREE.PlaneGeometry(2.75, largo), M.paja); capa.material = M.pajaDoble;
    capa.position.set(0, alto / 2 + 0.06 * Math.cos(ang), (atras + frente) / 2 - 0.06 * Math.sin(ang)); // centro del faldón, 6 cm sobre las varas
    capa.rotation.set(-(Math.PI / 2 - ang), Math.PI, 0, 'YXZ'); // misma orientación que las frondas (ver tarjeta)
    const uvc = capa.geometry.attributes.uv; for (let i = 0; i < uvc.count; i++) { uvc.setX(i, uvc.getX(i) * 2.2); uvc.setY(i, uvc.getY(i) * 2.0); }
    g.add(capa);
    for (let fila = 0; fila < 5; fila++) {
      for (let c = 0; c < 6; c++) {
        const f = 0.08 + fila * 0.2, x = -1.15 + c * 0.46 + (r() - 0.5) * 0.12;
        const y = alto * f + 0.13, z = atras + dz * f + 0.02;
        g.add(tarjeta(0.85 + r() * 0.2, 1.05 + r() * 0.2, (fila + c) % 3 === 0 ? M.hojaSeca : M.hoja, [x, y, z], [-(Math.PI / 2 - ang) + (r() - 0.5) * 0.12, Math.PI + (r() - 0.5) * 0.3, (r() - 0.5) * 0.25]));
      }
    }
    // lecho de hojas en el suelo, bajo el faldón
    for (let i = 0; i < 6; i++) g.add(tarjeta(0.6, 0.9, M.hojaSeca, [-0.9 + i * 0.36 + (r() - 0.5) * 0.1, 0.03, -0.1 + (r() - 0.5) * 0.4], [-Math.PI / 2, r() * 3, 0]));
    return g;
  },

  cesta(M) {
    const g = new THREE.Group();
    const perfil = [[0.0, 0.0], [0.19, 0.0], [0.23, 0.08], [0.27, 0.22], [0.27, 0.34], [0.25, 0.42]].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(perfil, 20);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3);
    g.add(malla(geo, M.cesteria));
    const borde = malla(new THREE.TorusGeometry(0.25, 0.022, 6, 24), M.cuerda); borde.rotation.x = Math.PI / 2; borde.position.y = 0.42; g.add(borde);
    const fondo = malla(new THREE.CircleGeometry(0.24, 16), M.interior, false); fondo.rotation.x = -Math.PI / 2; fondo.position.y = 0.06; g.add(fondo);
    return g;
  },

  cofre_madera(M) {
    const g = new THREE.Group();
    const cuerpo = malla(new THREE.BoxGeometry(1.0, 0.46, 0.58), M.tablas); cuerpo.position.y = 0.23; g.add(cuerpo);
    const tapa = malla(new THREE.BoxGeometry(1.03, 0.13, 0.61), M.tapa); tapa.position.y = 0.53; g.add(tapa);
    for (const sx of [-0.3, 0.3]) { // correas de cuero que abrazan cofre y tapa
      const c = malla(new THREE.BoxGeometry(0.07, 0.61, 0.625), M.cuero); c.position.set(sx, 0.305, 0); g.add(c);
    }
    for (const sx of [-1, 1]) { // asas de cuerda
      const a = malla(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), M.cuerda); a.rotation.set(0, Math.PI / 2, 0); a.position.set(sx * 0.505, 0.33, 0); a.rotation.z = Math.PI; g.add(a);
    }
    return g;
  },

  vasija_barro(M) {
    const g = new THREE.Group();
    const perfil = [[0.0, 0.0], [0.12, 0.0], [0.2, 0.08], [0.26, 0.22], [0.25, 0.34], [0.19, 0.44], [0.13, 0.5], [0.14, 0.54], [0.165, 0.575], [0.15, 0.58]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(malla(new THREE.LatheGeometry(perfil, 24), M.barro));
    // tapa de fibra atada con cordel (la vasija tapada conserva la comida)
    const tapa = malla(new THREE.CircleGeometry(0.175, 18), M.paja, false); tapa.rotation.x = -Math.PI / 2; tapa.position.y = 0.583; g.add(tapa);
    const cordel = malla(new THREE.TorusGeometry(0.15, 0.01, 5, 24), M.cuerda); cordel.rotation.x = Math.PI / 2; cordel.position.y = 0.55; g.add(cordel);
    return g;
  },
};

/** Malla nueva de una pieza (grupo con sus hijos). */
export function construirMalla(tipo, M) { return CONSTRUIR[tipo](M); }
