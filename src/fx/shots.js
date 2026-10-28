// Presets del módulo fx (prefijo fx_).
import * as THREE from 'three';

function flatSpot(ctx) {
  const s = ctx.world.spawn;
  for (let r = 6; r < 120; r += 6) for (let a = 0; a < 6.283; a += 0.5) {
    const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, h = ctx.world.getHeight(x, z);
    if (h > 2.5 && ctx.world.getSlope(x, z) < 0.1) return { x, z, a };
  }
  return { x: s.x, z: s.z, a: 0 };
}

export const shots = {
  fx_fogata_noche: (ctx) => {
    const p = flatSpot(ctx);
    return {
      hour: 22, weather: { rain: 0, storm: 0, cloudCover: 0.2 },
      setup: async (c) => {
        c.fx.createFire(new THREE.Vector3(p.x, c.world.getHeight(p.x, p.z) + 0.25, p.z), { escala: 1, luz: true });
        for (let i = 0; i < 80; i++) c.fx.layers.llama.update(0.03, c.camera, null);
      },
      camera: { agl: true, pos: [p.x + 3.2, 1.4, p.z + 3.2], look: [p.x, 0.7, p.z] },
    };
  },
  // fogata colocada de verdad (malla 3D de la fogata + fuego + luz), al atardecer y de cerca
  fx_fogata_modelo: async (ctx) => {
    const p = flatSpot(ctx);
    await ctx.survival?.campfires?.listo;
    ctx.survival?.campfires?.restore?.([{ x: p.x, z: p.z, fuel: 600 }]);
    return { hour: 19.2, weather: { rain: 0, storm: 0, cloudCover: 0.2 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [p.x + 1.9, 1.25, p.z + 1.9], look: [p.x, 0.25, p.z] } };
  },
  fx_fogata_atardecer: (ctx) => {
    const p = flatSpot(ctx);
    return {
      hour: 18.3,
      setup: async (c) => { c.fx.createFire(new THREE.Vector3(p.x, c.world.getHeight(p.x, p.z) + 0.25, p.z), { escala: 1 }); },
      camera: { agl: true, pos: [p.x + 2.4, 1.1, p.z + 2.4], look: [p.x, 0.6, p.z] },
    };
  },
  fx_lluvia: (ctx) => {
    const p = flatSpot(ctx);
    return { hour: 14, weather: { rain: 0.8, storm: 0.1, cloudCover: 0.92, windStrength: 0.6, wetness: 0.9 }, setup: async (c) => { c.fx.setWeather({ rain: 0.8, storm: 0.1, cloudCover: 0.92, windStrength: 0.6, wetness: 0.9 }); }, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x - 20, 5, p.z - 20] } };
  },
  fx_tormenta: (ctx) => {
    const p = flatSpot(ctx);
    return { hour: 17, setup: async (c) => { c.fx.setWeather({ rain: 1, storm: 1, cloudCover: 1, windStrength: 0.95, wetness: 1 }); }, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x - 20, 7, p.z - 20] } };
  },
  fx_particulas: (ctx) => {
    const p = flatSpot(ctx);
    return {
      hour: 11,
      setup: async (c) => {
        const o = (dx, dz) => new THREE.Vector3(p.x + dx, c.world.getHeight(p.x + dx, p.z + dz) + 0.3, p.z + dz);
        c.fx.emit('polvo', o(-2, -6), { cantidad: 30 }); c.fx.emit('hojas', o(0, -6), { cantidad: 40 }); c.fx.emit('astillas', o(2, -6), { cantidad: 30 });
        c.fx.emit('chispas', o(-1, -4), { cantidad: 30 }); c.fx.emit('sangre', o(1, -4), { cantidad: 30 }); c.fx.emit('humo', o(3, -4), { cantidad: 10 });
        for (let i = 0; i < 12; i++) for (const k of Object.keys(c.fx.layers)) c.fx.layers[k].update(0.03, c.camera, null);
      },
      camera: { agl: true, pos: [p.x, 1.5, p.z], look: [p.x, 1.2, p.z - 6] },
    };
  },
  fx_luciernagas: (ctx) => {
    const p = flatSpot(ctx);
    return { hour: 23, camera: { agl: true, pos: [p.x, 1.6, p.z], look: [p.x - 8, 1.4, p.z - 8] } };
  },
};
