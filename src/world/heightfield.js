// Altura determinista del terreno. FUENTE ÚNICA DE VERDAD: malla, físicas, flora y fauna la usan.
// La forma gruesa del continente (islas, provincias, cordilleras, costas, plataforma submarina) sale de las rejillas macro de generador.js (16 m por celda,
// interpolación bicúbica) y a eso se le suma relieve fino analítico. getHeight debe seguir siendo barata (se llama miles de veces por frame): ≈ 1 µs.
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { createNoise2D, fbm, ridged } from '../core/noise.js';
import { generarMundo } from './generador.js';
import { PROV_ID } from './provincias.js';

const nA = createNoise2D(CONFIG.seed + 17);
const nB = createNoise2D(CONFIG.seed + 53);
const nC = createNoise2D(CONFIG.seed + 91);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let M = null;
/** Rejillas macro del mundo (se generan la primera vez que hacen falta: ≈ 1 s). */
export function getMundo() {
  if (!M) M = generarMundo({ seed: CONFIG.seed, size: CONFIG.world.size, n: CONFIG.world.macro });
  return M;
}

const _hs = new Float32Array(4);
/** Altura macro (m) en (x,z) por interpolación bicúbica de Catmull-Rom. */
export function alturaMacro(x, z) {
  const m = M ?? getMundo(), n = m.n, H = m.H;
  const fx = (x + m.half) / m.cell - 0.5, fz = (z + m.half) / m.cell - 0.5;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const tx2 = tx * tx, tx3 = tx2 * tx, tz2 = tz * tz, tz3 = tz2 * tz;
  const ax0 = -0.5 * tx3 + tx2 - 0.5 * tx, ax1 = 1.5 * tx3 - 2.5 * tx2 + 1, ax2 = -1.5 * tx3 + 2 * tx2 + 0.5 * tx, ax3 = 0.5 * tx3 - 0.5 * tx2;
  const az0 = -0.5 * tz3 + tz2 - 0.5 * tz, az1 = 1.5 * tz3 - 2.5 * tz2 + 1, az2 = -1.5 * tz3 + 2 * tz2 + 0.5 * tz, az3 = 0.5 * tz3 - 0.5 * tz2;
  const lim = n - 1;
  const x0 = Math.min(lim, Math.max(0, ix - 1)), x1 = Math.min(lim, Math.max(0, ix)), x2 = Math.min(lim, Math.max(0, ix + 1)), x3 = Math.min(lim, Math.max(0, ix + 2));
  for (let r = 0; r < 4; r++) {
    const row = Math.min(lim, Math.max(0, iz - 1 + r)) * n;
    _hs[r] = H[row + x0] * ax0 + H[row + x1] * ax1 + H[row + x2] * ax2 + H[row + x3] * ax3;
  }
  return _hs[0] * az0 + _hs[1] * az1 + _hs[2] * az2 + _hs[3] * az3;
}

/** Altura en metros sobre el nivel del mar (negativa bajo el agua). */
export function getHeight(x, z) {
  const hm = alturaMacro(x, z);
  if (hm < 0.35) {
    // fondo marino y orilla: solo un leve rizado en aguas someras (la plataforma ya viene de la rejilla)
    const f = smooth(-0.2, -3, hm) * smooth(-80, -6, hm);
    return hm + f * nA(x * 0.03, z * 0.03) * 0.35;
  }
  const t = smooth(0.35, 7, hm);
  // relieve fino: ondulaciones de 10–60 m, rugosidad de 3–10 m y roca a más altura
  const amp = 0.7 + Math.min(11, hm * 0.045);
  let d = (fbm(nA, x * 0.0125, z * 0.0125, 3) * 1.6 + nB(x * 0.055, z * 0.055) * 0.42 + nC(x * 0.21, z * 0.21) * 0.1) * amp * t;
  if (hm > 70) d += (ridged(nB, x * 0.011, z * 0.011, 3) - 0.35) * smooth(70, 220, hm) * 14;
  return hm + d;
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

// ------------------------------------------------------------------------------------------------ consulta de rejillas
function celda(x, z) {
  const m = M ?? getMundo();
  const i = Math.min(m.n - 1, Math.max(0, Math.floor((x + m.half) / m.cell))), j = Math.min(m.n - 1, Math.max(0, Math.floor((z + m.half) / m.cell)));
  return j * m.n + i;
}
/** Id de bioma (BIOMAS) según la rejilla macro; 0 = mar. */
export function biomaId(x, z) { return (M ?? getMundo()).B[celda(x, z)]; }
/** Índice de provincia (PROVINCIAS) o 255 si es mar. */
export function provinciaId(x, z) { return (M ?? getMundo()).P[celda(x, z)]; }
/** Índice de zona de mar (MARES) o 255 si es tierra. */
export function marId(x, z) { return (M ?? getMundo()).Z[celda(x, z)]; }
/** Distancia firmada a la costa (m): positiva en tierra, negativa en el mar. */
export function distCosta(x, z) { return (M ?? getMundo()).DC[celda(x, z)]; }
/** Humedad 0..1 de la celda. */
export function humedad(x, z) { return (M ?? getMundo()).HUM[celda(x, z)] / 255; }

/** Busca una playa llana y accesible para aparecer (spawn): la costa sur de las llanuras de Hell Creek. Determinista. */
export function findSpawn() {
  const hc = PROV_ID.hell_creek;
  for (let k = 0; k < 90; k++) {
    const x = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 60;
    for (let z = 5400; z > 1500; z -= 6) {
      if (getHeight(x, z) > 1.4) {
        // primera tierra viniendo del mar: busca hacia el interior un punto llano de playa
        for (let q = 0; q < 160; q += 3) {
          const zz = z - q, h = getHeight(x, zz);
          if (h > 1.5 && h < 3.2 && getSlope(x, zz) < 0.035 && provinciaId(x, zz) === hc && getHeight(x, zz - 14) > h - 0.05 && getHeight(x, zz - 14) < 9) return new THREE.Vector3(x, h, zz);
        }
        break;
      }
    }
  }
  return new THREE.Vector3(0, getHeight(0, 2300), 2300);
}
