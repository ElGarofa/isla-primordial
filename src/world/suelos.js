// CAPAS DEL SUELO: un material por tipo de terreno (hierba, hojarasca, arena, roca, nieve, barro, ceniza, desierto), cada uno con su textura
// de color y su mapa de normales + altura, empaquetados en dos DataArrayTexture (una capa por material).
//   · Archivos: public/textures/suelo/<capa>_a.jpg (color sRGB) y <capa>_n.jpg (R,G = normal XY; B = altura). Los prepara tools/preparar-texturas.py.
//   · El color final del terreno = color del vértice (bioma, pendiente, humedad: ver terrain.js) × textura ÷ su color medio, así que el mapa y los
//     biomas conservan su paleta y la textura solo aporta detalle real (hojas, granos, grietas).
//   · Si un archivo falta o no decodifica, esa capa se genera por código (ruido tileable): el juego nunca depende de las texturas para arrancar.
import * as THREE from 'three';
import { tileableHeight } from './textures.js';
import { DISPONIBLES } from './suelos-disponibles.js';

export const CAPAS = [
  { id: 'hierba', metros: 2.2, rugosidad: 0.95, giro: 0.0 },
  { id: 'hojarasca', metros: 2.6, rugosidad: 0.93, giro: 1.1 },
  { id: 'arena', metros: 3.4, rugosidad: 0.9, giro: 0.4 },
  { id: 'roca', metros: 4.5, rugosidad: 0.82, giro: 2.0 },
  { id: 'nieve', metros: 4.0, rugosidad: 0.62, giro: 0.7 },
  { id: 'barro', metros: 3.0, rugosidad: 0.5, giro: 2.6 },
  { id: 'ceniza', metros: 2.8, rugosidad: 0.95, giro: 1.6 },
  { id: 'desierto', metros: 3.8, rugosidad: 0.93, giro: 0.2 },
];
export const CAPA = Object.fromEntries(CAPAS.map((c, i) => [c.id, i]));
export const N_CAPAS = CAPAS.length;
const LADO = { low: 256, medium: 512, high: 1024, ultra: 1024 };

const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
const aLineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Decodifica una imagen y la devuelve como RGBA de lado×lado (redimensionada si hace falta). */
async function leerImagen(url, lado) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(lado, lado) : Object.assign(document.createElement('canvas'), { width: lado, height: lado });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, lado, lado);
  bmp.close?.();
  return g.getImageData(0, 0, lado, lado).data;
}

/** Capa de respaldo por código: gris con grano y guijarros, normal y altura a juego (misma convención que los archivos). */
function capaProcedural(i, lado) {
  const h0 = tileableHeight(lado, 5, 900 + i * 17, 4, 0.58), h1 = tileableHeight(lado, 3, 950 + i * 17, 24, 0.6);
  const a = new Uint8ClampedArray(lado * lado * 4), n = new Uint8ClampedArray(lado * lado * 4), h = new Float32Array(lado * lado);
  for (let k = 0; k < h.length; k++) { h[k] = h0[k] * 0.6 + h1[k] * 0.4; const v = (0.55 + h[k] * 0.4) * 255; a[k * 4] = a[k * 4 + 1] = a[k * 4 + 2] = v; a[k * 4 + 3] = 255; }
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
    const k = y * lado + x, dx = (h[y * lado + ((x + 1) % lado)] - h[y * lado + ((x - 1 + lado) % lado)]) * 6, dy = (h[((y + 1) % lado) * lado + x] - h[((y - 1 + lado) % lado) * lado + x]) * 6, l = Math.hypot(dx, dy, 1);
    n[k * 4] = (-dx / l * 0.5 + 0.5) * 255; n[k * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255; n[k * 4 + 2] = h[k] * 255; n[k * 4 + 3] = 255;
  }
  return { a, n };
}

function arrayTex(data, lado, capas, colorSpace) {
  const t = new THREE.DataArrayTexture(data, lado, lado, capas);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = colorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Carga (o genera) las capas. Devuelve { albedo, normal, medios: Float32Array(3·N), lado, origen: ['archivo'|'codigo'...], errores }.
 * `calidad` decide el lado de cada capa (256 / 512 / 1024).
 */
export async function cargarSuelos(calidad = 'high', { sinArchivos = false } = {}) {
  const lado = LADO[calidad] ?? 512, N = CAPAS.length, px = lado * lado * 4;
  const A = new Uint8Array(px * N), Nm = new Uint8Array(px * N), medios = new Float32Array(N * 3), origen = [], errores = {};
  await Promise.all(CAPAS.map(async (c, i) => {
    let a, n;
    try {
      if (sinArchivos) throw new Error('desactivado');
      if (!DISPONIBLES.includes(c.id)) throw new Error('sin archivo');
      [a, n] = await Promise.all([leerImagen(`${base()}textures/suelo/${c.id}_a.jpg`, lado), leerImagen(`${base()}textures/suelo/${c.id}_n.jpg`, lado)]);
      origen[i] = 'archivo';
    } catch (e) { ({ a, n } = capaProcedural(i, lado)); origen[i] = 'codigo'; errores[c.id] = String(e?.message ?? e); }
    A.set(a, px * i); Nm.set(n, px * i);
    // color medio en espacio lineal (la textura se divide por él en el shader: media = 1)
    let r = 0, g = 0, b = 0; const paso = 4 * 7; let m = 0;
    for (let k = 0; k < px; k += paso) { r += aLineal(a[k] / 255); g += aLineal(a[k + 1] / 255); b += aLineal(a[k + 2] / 255); m++; }
    medios[i * 3] = r / m; medios[i * 3 + 1] = g / m; medios[i * 3 + 2] = b / m;
  }));
  return { albedo: arrayTex(A, lado, N, THREE.SRGBColorSpace), normal: arrayTex(Nm, lado, N, THREE.NoColorSpace), medios, lado, origen, errores };
}
