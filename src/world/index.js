// Módulo WORLD: mundo grande por provincias y biomas — terreno por árbol de nodos con LOD, océano, API de consulta del mundo y colisionadores estáticos.
import * as THREE from 'three';
import { getHeight, getNormal, getSlope, findSpawn, getMundo, biomaId, provinciaId, marId, distCosta, humedad } from './heightfield.js';
import { StaticColliders } from './colliders.js';
import { createTerrain } from './terrain.js';
import { cargarSuelos } from './suelos.js';
import { createWater } from './water.js';
import { CONFIG } from '../core/config.js';
import { PROVINCIAS, MARES, BIOMA_ID, BIOMA_NOMBRE, BIOMAS } from './provincias.js';

export async function create(ctx) {
  const seaLevel = CONFIG.world.seaLevel;
  getMundo(); // genera las rejillas macro (≈ 1 s) mientras la pantalla de carga está visible
  const LIM = CONFIG.world.size / 2 - 260; // pared invisible del mundo (cuadrada): el último tramo es mar abierto

  const world = {
    size: CONFIG.world.size,
    half: CONFIG.world.size / 2,
    limite: LIM,
    seaLevel,
    getHeight,
    getNormal,
    getSlope,
    isWater: (x, z) => getHeight(x, z) < seaLevel,
    /** 'agua' | 'arena' | 'roca' | 'nieve' | 'barro' | 'hierba' — coherente con los colores del terreno. */
    getSurface(x, z) {
      const h = getHeight(x, z);
      if (h < seaLevel - 0.05) return 'agua';
      const s = getSlope(x, z), b = biomaId(x, z);
      if (b === BIOMAS.nieve) return s > 0.3 ? 'roca' : 'nieve';
      if (b === BIOMAS.volcan) return 'roca';
      if (s > 0.25 || (b === BIOMAS.montana && s > 0.12)) return 'roca';
      if (h < 2.8 || b === BIOMAS.playa || b === BIOMAS.desierto) return 'arena';
      if (b === BIOMAS.pantano) return 'barro';
      return 'hierba';
    },
    /** 'mar' | 'playa' | 'pradera' | 'selva' | 'bosque' | 'pantano' | 'desierto' | 'montana' | 'nieve' | 'volcan' | 'taiga' (según la rejilla macro; en el agua, 'mar'). */
    getBiome(x, z) {
      const b = biomaId(x, z);
      if (b === BIOMAS.mar) return 'mar';
      if (b === BIOMAS.pantano) return 'pantano';
      return getHeight(x, z) < -0.3 && b === BIOMAS.playa ? 'mar' : BIOMA_ID[b];
    },
    /** Provincia (objeto de provincias.js, con `idx`) en (x,z), o null si es mar. */
    getProvince(x, z) { const k = provinciaId(x, z); return k === 255 ? null : PROVINCIAS[k]; },
    /** Índice numérico de provincia (255 = mar). */
    provinceIdx: provinciaId,
    /** Zona de mar (objeto de provincias.js) o null en tierra. */
    getSea(x, z) { const k = marId(x, z); return k === 255 ? null : MARES[k]; },
    /** Índice numérico de la zona de mar (255 = tierra). */
    seaIdx: marId,
    /** Distancia firmada a la costa (m): + tierra, − mar. */
    coastDist: distCosta,
    humidity: humedad,
    /** Rejillas macro (altura, bioma, provincia…) para el mapa, la fauna y las pruebas. */
    macro: getMundo(),
    /** Rayo contra el terreno. Devuelve { point, normal, distance } o null. */
    raycastTerrain(origin, dir, maxDist = 500) {
      let t = 0, prevT = 0;
      const step = Math.max(0.5, 1.0);
      while (t <= maxDist) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        if (y < getHeight(x, z)) {
          let lo = prevT, hi = t;
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) * 0.5;
            if (origin.y + dir.y * mid < getHeight(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid; else lo = mid;
          }
          const point = new THREE.Vector3(origin.x + dir.x * hi, 0, origin.z + dir.z * hi);
          point.y = getHeight(point.x, point.z);
          return { point, normal: getNormal(point.x, point.z, new THREE.Vector3()), distance: hi };
        }
        prevT = t;
        t += step;
      }
      return null;
    },
    colliders: new StaticColliders(),
    spawn: findSpawn(),
  };
  ctx.world = world;

  const water = createWater(ctx);
  world.water = water;
  // capas del suelo: se cargan antes de construir el terreno (si faltan archivos, se generan por código; ver suelos.js). `?suelos=0` fuerza las de código.
  const suelos = await cargarSuelos(ctx.settings?.quality ?? 'high', { sinArchivos: new URLSearchParams(location.search).get('suelos') === '0' });
  { const fallos = Object.entries(suelos.errores).filter(([, e]) => e !== 'sin archivo' && e !== 'desactivado'); if (fallos.length) console.warn('[world] capas del suelo que no cargaron (se generan por código):', fallos.map(([k, e]) => `${k}: ${e}`).join('; ')); }
  const terrain = createTerrain(ctx, suelos);
  terrain.suelos = suelos;
  world.terrain = terrain;
  // Posiciona la cámara en el spawn para que el LOD inicial sea el correcto, y construye todo de una vez.
  ctx.camera.position.set(world.spawn.x, world.spawn.y + 2, world.spawn.z);
  terrain.prime();

  return {
    name: 'world',
    update(dt) {
      terrain.update(ctx.state === 'loading' ? 1000 : 5);
      water.update(dt);
    },
  };
}

export { BIOMA_NOMBRE };
