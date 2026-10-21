// Herramientas de depuración y captura (solo con ?debug=1). Las usa tools/shot.mjs.
// Cada módulo puede aportar presets de cámara en src/<modulo>/shots.js:
//   export const shots = { nombre_unico: (ctx) => ({ camera: { pos:[x,y,z], look:[x,y,z], fov?, agl? }, hour?, weather?, setup?(ctx) }) };
// Con `agl: true` las coordenadas Y de pos y look se interpretan como metros SOBRE el terreno en ese (x, z).
import * as THREE from 'three';

// Carga tolerante a fallos: un shots.js roto de un módulo no debe afectar a los de los demás.
const found = import.meta.glob('../*/shots.js');
const PRESETS = {};

export async function installDebug(ctx, { step }) {
  for (const [file, load] of Object.entries(found)) {
    try {
      Object.assign(PRESETS, (await load()).shots ?? {});
    } catch (e) {
      console.error(`[debug] no se pudo cargar ${file}`, e);
    }
  }
  const api = {
    ready: true,
    manual: true, // el bucle automático queda en pausa; se avanza con advance()
    ctx,
    listPresets: () => Object.keys(PRESETS),

    async applyPreset(name) {
      const make = PRESETS[name];
      if (!make) throw new Error(`Preset desconocido: ${name}. Disponibles: ${Object.keys(PRESETS).join(', ')}`);
      const p = await make(ctx);
      ctx.debug.freeCamera = true;
      if (p.hour != null) { ctx.time.hour = p.hour; ctx.time.locked = true; }
      if (p.weather) Object.assign(ctx.time.weather, p.weather);
      if (p.setup) await p.setup(ctx);
      const c = p.camera;
      const h = (x, z) => (c.agl && ctx.world ? ctx.world.getHeight(x, z) : 0);
      ctx.camera.position.set(c.pos[0], c.pos[1] + h(c.pos[0], c.pos[2]), c.pos[2]);
      ctx.camera.lookAt(c.look[0], c.look[1] + h(c.look[0], c.look[2]), c.look[2]);
      if (c.fov) { ctx.camera.fov = c.fov; ctx.camera.updateProjectionMatrix(); }
      return true;
    },

    /** Avanza n pasos con dt fijo. Renderiza solo el último (o todos si renderEvery=true). */
    advance(n = 1, dt = 1 / 30, renderEvery = false) {
      for (let i = 0; i < n; i++) step(dt, renderEvery || i === n - 1);
    },

    setHour(h) { ctx.time.hour = h; ctx.time.locked = true; },

    stats() {
      const r = ctx.renderer;
      if (!r) return null;
      const i = r.info;
      return {
        calls: i.render.calls,
        triangles: i.render.triangles,
        geometries: i.memory.geometries,
        textures: i.memory.textures,
        programs: i.programs ? i.programs.length : 0,
      };
    },
  };
  window.__game = api;
  return api;
}

export { THREE };
