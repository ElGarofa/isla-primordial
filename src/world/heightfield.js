// Altura determinista del terreno. FUENTE ÚNICA DE VERDAD: malla, físicas, flora y fauna la usan.
// El agente de `world` puede refinar la forma de la isla, pero DEBE mantener estas firmas,
// el determinismo (misma semilla => mismo terreno) y que getHeight sea barata (se llama miles de veces por frame).
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { createNoise2D, fbm, ridged } from '../core/noise.js';

const R = CONFIG.world.size / 2;
const nA = createNoise2D(CONFIG.seed);
const nB = createNoise2D(CONFIG.seed + 17);
const nC = createNoise2D(CONFIG.seed + 53);
const nD = createNoise2D(CONFIG.seed + 91);

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Máscara de isla 0..1 (0 = mar abierto, 1 = interior). La costa está alrededor de 0.30. */
export function islandMask(x, z) {
  const d = Math.hypot(x, z) / R;
  const wob = fbm(nA, x * 0.0021, z * 0.0021, 4) * 0.28 + fbm(nB, x * 0.007, z * 0.007, 3) * 0.07;
  return 1 - smoothstep(0.42, 0.95, d + wob);
}

/** Altura en metros sobre el nivel del mar (negativa bajo el agua). */
export function getHeight(x, z) {
  const m = islandMask(x, z);
  const d = Math.hypot(x, z) / R;
  if (m <= 0.3) {
    // fondo marino: plataforma suave que se hunde hacia mar abierto
    return (m - 0.3) * 70 - smoothstep(0.35, 1.0, d) * 22;
  }
  const inland = smoothstep(0.3, 0.62, m);
  let h = Math.pow(inland, 1.4) * 14 + (m - 0.3) * 10;
  h += fbm(nC, x * 0.006, z * 0.006, 5) * 9 * inland;
  const region = smoothstep(-0.15, 0.35, fbm(nD, x * 0.0011 + 13, z * 0.0011 - 7, 2));
  const peaks = Math.pow(ridged(nB, x * 0.0026, z * 0.0026, 5), 1.6);
  h += peaks * 150 * region * smoothstep(0.45, 0.8, m);
  return h;
}

/** Normal del terreno (unitaria) por diferencias centrales. */
export function getNormal(x, z, out = new THREE.Vector3(), e = 1.0) {
  const hl = getHeight(x - e, z);
  const hr = getHeight(x + e, z);
  const hd = getHeight(x, z - e);
  const hu = getHeight(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

/** Pendiente 0..1: 0 = llano, 1 = vertical (1 - normal.y). */
const _n = new THREE.Vector3();
export function getSlope(x, z) {
  return 1 - getNormal(x, z, _n).y;
}

/** Busca una playa llana y accesible para aparecer (spawn). Determinista. */
export function findSpawn() {
  // Recorre ángulos empezando por el sur (+z) y avanza hacia el interior buscando la primera playa suave.
  for (let k = 0; k < 72; k++) {
    const ang = Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 36);
    for (let r = R * 0.95; r > R * 0.15; r -= 3) {
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const h = getHeight(x, z);
      if (h > 1.4 && h < 3.2 && getSlope(x, z) < 0.04) {
        const inx = Math.cos(ang) * (r - 14);
        const inz = Math.sin(ang) * (r - 14);
        if (getHeight(inx, inz) > h) return new THREE.Vector3(x, h, z);
      }
    }
  }
  return new THREE.Vector3(0, getHeight(0, 0), 0);
}
