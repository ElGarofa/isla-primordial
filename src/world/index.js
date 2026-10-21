// Módulo WORLD: terreno por chunks con LOD, océano, API de consulta del mundo y colisionadores estáticos.
import * as THREE from 'three';
import { getHeight, getNormal, getSlope, findSpawn, islandMask } from './heightfield.js';
import { StaticColliders } from './colliders.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createNoise2D, fbm } from '../core/noise.js';
import { CONFIG } from '../core/config.js';

const nMoist = createNoise2D(CONFIG.seed + 300);

export async function create(ctx) {
  const seaLevel = CONFIG.world.seaLevel;

  const world = {
    size: CONFIG.world.size,
    seaLevel,
    getHeight,
    getNormal,
    getSlope,
    isWater: (x, z) => getHeight(x, z) < seaLevel,
    /** 'agua' | 'arena' | 'roca' | 'nieve' | 'barro' | 'hierba' — coherente con los colores del terreno. */
    getSurface(x, z) {
      const h = getHeight(x, z);
      if (h < seaLevel - 0.05) return 'agua';
      const s = getSlope(x, z);
      if (s > 0.25 || h > 120) return h > 135 && s < 0.3 ? 'nieve' : 'roca';
      if (h < 2.8) return 'arena';
      return 'hierba';
    },
    /** 'playa' | 'selva' | 'pradera' | 'montana' | 'nieve' | 'pantano' */
    getBiome(x, z) {
      const h = getHeight(x, z);
      if (h < 3.2) return h < 0.5 && fbm(nMoist, x * 0.01, z * 0.01, 2) > 0.35 && islandMask(x, z) > 0.45 ? 'pantano' : 'playa';
      if (h > 125) return 'nieve';
      if (h > 62) return 'montana';
      return fbm(nMoist, x * 0.0035, z * 0.0035, 3) > -0.02 ? 'selva' : 'pradera';
    },
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

  const terrain = createTerrain(ctx);
  const water = createWater(ctx);
  world.water = water;
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
