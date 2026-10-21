// Texturas procedurales (tileables) para el terreno y el agua. Todo se genera por código al cargar.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/** Ruido de valor tileable: lattice con envoltura (periodo p). */
function makeLattice(p, seed) {
  const r = mulberry32(seed);
  const a = new Float32Array(p * p);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function sampleLattice(a, p, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = fade(x - xi), fy = fade(y - yi);
  const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p;
  const y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p;
  const v00 = a[y0 * p + x0], v10 = a[y0 * p + x1], v01 = a[y1 * p + x0], v11 = a[y1 * p + x1];
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

/** Campo de alturas tileable (fbm de ruido de valor) en Float32Array size*size, normalizado a 0..1. */
export function tileableHeight(size, octaves = 6, seed = 1, basePeriod = 4, gain = 0.55) {
  const h = new Float32Array(size * size);
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = basePeriod * (1 << o);
    const lat = makeLattice(p, seed + o * 101);
    const amp = Math.pow(gain, o);
    norm += amp;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        h[y * size + x] += amp * sampleLattice(lat, p, (x / size) * p, (y / size) * p);
      }
    }
  }
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < h.length; i++) { h[i] /= norm; mn = Math.min(mn, h[i]); mx = Math.max(mx, h[i]); }
  const k = 1 / (mx - mn || 1);
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) * k;
  return h;
}

function heightToNormalData(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
      const yd = h[((y - 1 + size) % size) * size + x], yu = h[((y + 1) % size) * size + x];
      let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (y * size + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  return data;
}

function dataTexture(data, size, colorSpace) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = colorSpace;
  t.needsUpdate = true;
  return t;
}

/** Detalle del terreno: albedo en escala de grises (guijarros, granos, grietas) + normal map a juego. */
export function createTerrainDetail(size = 512) {
  const base = tileableHeight(size, 6, 7, 4, 0.58);
  const grit = tileableHeight(size, 4, 31, 32, 0.6); // grano fino
  const pebbles = tileableHeight(size, 3, 77, 12, 0.5);
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let i = 0; i < h.length; i++) {
    // guijarros: realce de picos locales del campo "pebbles"
    const pb = Math.pow(Math.max(0, pebbles[i] - 0.52) * 2.1, 1.4);
    h[i] = base[i] * 0.55 + grit[i] * 0.25 + pb * 0.9;
    const v = 0.62 + base[i] * 0.34 + (grit[i] - 0.5) * 0.28 + pb * 0.12;
    const g = Math.max(0, Math.min(1, v));
    alb[i * 4] = alb[i * 4 + 1] = alb[i * 4 + 2] = g * 255;
    alb[i * 4 + 3] = 255;
  }
  return {
    albedo: dataTexture(alb, size, THREE.NoColorSpace),
    normal: dataTexture(heightToNormalData(h, size, 3.2), size, THREE.NoColorSpace),
  };
}

/** Normal map tileable de agua (olas pequeñas con crestas). */
export function createWaterNormal(size = 256) {
  const a = tileableHeight(size, 5, 5, 6, 0.55);
  const b = tileableHeight(size, 4, 19, 10, 0.5);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) {
    // crestas: 1-|2v-1| da líneas afiladas como las olas de viento
    const r1 = 1 - Math.abs(a[i] * 2 - 1);
    const r2 = 1 - Math.abs(b[i] * 2 - 1);
    h[i] = r1 * 0.7 + r2 * 0.3;
  }
  return dataTexture(heightToNormalData(h, size, 5.5), size, THREE.NoColorSpace);
}
