// Texturas procedurales de piel de reptil: escamas hexagonales / placas / arrugas, con mapa de normales. Teselables.
import * as THREE from 'three';
import { tileableHeight } from '../world/textures.js';
import { mulberry32 } from '../core/rng.js';

export const PRESETS = {
  raptor: { cell: 12, round: 0.62, bump: 1.5, mottle: 0.12, wrinkle: 0.3, base: 0.86 },
  comps: { cell: 9, round: 0.6, bump: 1.4, mottle: 0.12, wrinkle: 0.25, base: 0.88 },
  tri: { cell: 28, round: 0.7, bump: 2.6, mottle: 0.2, wrinkle: 0.6, base: 0.84 },
  brach: { cell: 40, round: 0.78, bump: 2.6, mottle: 0.12, wrinkle: 0.9, base: 0.84 },
  rex: { cell: 18, round: 0.64, bump: 2.0, mottle: 0.14, wrinkle: 0.5, base: 0.84 },
  parasaur: { cell: 22, round: 0.6, bump: 1.8, mottle: 0.12, wrinkle: 0.45, base: 0.86 },
  stego: { cell: 26, round: 0.68, bump: 2.4, mottle: 0.18, wrinkle: 0.6, base: 0.84 },
  ankylo: { cell: 30, round: 0.7, bump: 2.6, mottle: 0.2, wrinkle: 0.7, base: 0.82 },
  gall: { cell: 10, round: 0.55, bump: 1.2, mottle: 0.1, wrinkle: 0.25, base: 0.88 },
  ptera: { cell: 20, round: 0.5, bump: 1.4, mottle: 0.1, wrinkle: 0.5, base: 0.88 },
  // familias generadas (docs/ESPECIES_FAMILIAS.md)
  croco: { cell: 22, round: 0.42, bump: 3.0, mottle: 0.2, wrinkle: 0.35, base: 0.82 },
  plumon: { cell: 7, round: 0.5, bump: 0.7, mottle: 0.1, wrinkle: 0.2, base: 0.9 },
  liso: { cell: 6, round: 0.5, bump: 0.55, mottle: 0.08, wrinkle: 0.35, base: 0.9 },
  pez: { cell: 8, round: 0.82, bump: 1.2, mottle: 0.1, wrinkle: 0.15, base: 0.9 },
  pelo: { cell: 5, round: 0.4, bump: 0.6, mottle: 0.12, wrinkle: 0.2, base: 0.88 },
  acorazado: { cell: 24, round: 0.55, bump: 3.2, mottle: 0.22, wrinkle: 0.5, base: 0.8 },
  aspero: { cell: 36, round: 0.75, bump: 2.8, mottle: 0.14, wrinkle: 1.0, base: 0.84 },
};

const cache = new Map();

export function makeSkin(kind = 'raptor', size = 256) {
  if (cache.has(kind)) return cache.get(kind);
  const P = PRESETS[kind] ?? PRESETS.raptor;
  const rnd = mulberry32(kind.length * 977 + 13);
  const noise = tileableHeight(size, 5, 31 + kind.length, 4, 0.55);
  const wr = tileableHeight(size, 4, 77 + kind.length, 9, 0.5);
  const h = new Float32Array(size * size), alb = new Uint8Array(size * size * 4), nor = new Uint8Array(size * size * 4);
  const s = P.cell, rowH = s * 0.866, rows = Math.ceil(size / rowH);
  const cellRand = new Float32Array((Math.ceil(size / s) + 3) * (rows + 3));
  for (let i = 0; i < cellRand.length; i++) cellRand[i] = rnd();
  const cols = Math.ceil(size / s);
  const R = (cx, cy) => cellRand[((((cy % rows) + rows) % rows) * cols + (((cx % cols) + cols) % cols)) % cellRand.length];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // celda hexagonal más cercana (3x3 vecinas)
      const r0 = Math.floor(y / rowH);
      let best = 1e9, bc = 0, br = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const r = r0 + dr, off = (((r % 2) + 2) % 2) ? s / 2 : 0, c0 = Math.floor((x - off) / s);
        for (let dc = -1; dc <= 1; dc++) {
          const c = c0 + dc, cx = c * s + off + s / 2, cy = r * rowH + rowH / 2;
          const d = Math.hypot(x - cx, (y - cy) * 1.04);
          if (d < best) { best = d; bc = c; br = r; }
        }
      }
      const rel = best / (s * 0.58);
      let dome = 1 - Math.pow(Math.min(1, rel), 2.2 / P.round);
      const i = y * size + x;
      const nz = noise[i], w = wr[i];
      // arrugas: crestas del ruido que rompen las escamas
      const ridge = 1 - Math.abs(w * 2 - 1);
      dome = dome * (1 - P.wrinkle * 0.35) + ridge * P.wrinkle * 0.55 + nz * 0.25;
      h[i] = dome;
      const cellTone = R(bc, br);
      const edge = Math.min(1, rel);
      const v = P.base * (1 - P.mottle * 0.5 + cellTone * P.mottle) * (0.78 + 0.22 * Math.min(1, dome * 1.1)) * (1 - 0.18 * edge * edge) * (0.93 + nz * 0.14);
      alb[i * 4] = Math.min(255, v * 255 * 1.02); alb[i * 4 + 1] = Math.min(255, v * 255 * 0.99); alb[i * 4 + 2] = Math.min(255, v * 255 * 0.95); alb[i * 4 + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * P.bump, ny = (d - u) * P.bump, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      nor[i * 4] = (nx * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nor[i * 4 + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  const out = { albedo: mk(alb, true), normal: mk(nor, false) };
  cache.set(kind, out);
  return out;
}
