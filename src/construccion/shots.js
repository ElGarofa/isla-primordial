// Presets de captura de la construcción (prefijo construccion_).
function llano(ctx, radio = 4) {
  const w = ctx.world, s = w.spawn;
  for (let r = 10; r < 600; r += 8) for (let a = 0; a < 6.283; a += 0.4) {
    const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
    if (w.getHeight(x, z) < 2.5 || w.getSlope(x, z) > 0.12 || w.colliders.query(x, z, radio + 3, []).length) continue;
    let ok = true; for (const [dx, dz] of [[radio, 0], [-radio, 0], [0, radio], [0, -radio]]) if (Math.abs(w.getHeight(x + dx, z + dz) - w.getHeight(x, z)) > 0.5) ok = false;
    if (ok) return { x, z };
  }
  return { x: s.x, z: s.z };
}
const listo = async (ctx) => { await ctx.survival?.campfires?.listo; };

export const shots = {
  // las cinco piezas en fila, de día
  construccion_piezas: async (ctx) => {
    const p = llano(ctx, 7), K = ctx.construccion;
    K.restaurar([]);
    K.crear('refugio_ramas', p.x - 4.2, p.z, 0.2);
    K.crear('cama_hojas', p.x - 0.6, p.z, 0);
    K.crear('cofre_madera', p.x + 1.6, p.z + 0.4, -0.3);
    K.crear('cesta', p.x + 3.0, p.z + 0.6, 0);
    K.crear('vasija_barro', p.x + 3.9, p.z + 0.2, 0);
    ctx.player.teleport(p.x + 20, p.z + 20);
    return { hour: 10.5, weather: { rain: 0, storm: 0, cloudCover: 0.25 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [p.x + 0.4, 2.4, p.z + 6.4], look: [p.x - 0.4, 0.5, p.z] } };
  },
  // campamento al atardecer: refugio con la cama debajo, cofre, cesta y fogata delante
  construccion_campamento: async (ctx) => {
    const p = llano(ctx, 6), K = ctx.construccion;
    await listo(ctx);
    K.restaurar([]);
    K.crear('refugio_ramas', p.x, p.z, 0);
    K.crear('cama_hojas', p.x - 0.3, p.z - 0.15, Math.PI / 2);
    K.crear('cofre_madera', p.x + 1.9, p.z + 1.6, -0.5);
    K.crear('cesta', p.x - 1.9, p.z + 1.7, 0);
    ctx.survival?.campfires?.restore?.([{ x: p.x + 0.2, z: p.z + 2.6, fuel: 600 }]);
    ctx.player.teleport(p.x + 20, p.z + 20);
    return { hour: 18.1, weather: { rain: 0, storm: 0, cloudCover: 0.2 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [p.x + 3.2, 1.6, p.z + 6.2], look: [p.x - 0.2, 0.7, p.z] } };
  },
  // vista previa de colocación (fantasma verde) desde los ojos del jugador; con --ui se ve la barra de colocación
  construccion_fantasma: async (ctx) => {
    const p = llano(ctx, 6), K = ctx.construccion, S = ctx.survival;
    K.restaurar([]);
    ctx.player.teleport(p.x, p.z + 3.5); ctx.player.yaw = 0; ctx.player.pitch = -0.42;
    S.slots[0] = { item: 'refugio_ramas', cantidad: 1 }; S.select(0); S.consume(0);
    return { hour: 11, weather: { rain: 0, storm: 0, cloudCover: 0.3 }, setup: () => { ctx.debug.hideViewmodel = true; ctx.debug.freeCamera = true; }, camera: { agl: true, pos: [p.x, 1.7, p.z + 3.5], look: [p.x, 0.3, p.z - 0.5] } };
  },
  construccion_fantasma_mal: async (ctx) => {
    const p = llano(ctx, 6), K = ctx.construccion, S = ctx.survival;
    K.restaurar([]);
    K.crear('cofre_madera', p.x, p.z, 0);
    ctx.player.teleport(p.x, p.z + 3.0); ctx.player.yaw = 0; ctx.player.pitch = -0.5;
    S.slots[0] = { item: 'cama_hojas', cantidad: 1 }; S.select(0); S.consume(0);
    return { hour: 11, weather: { rain: 0, storm: 0, cloudCover: 0.3 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [p.x, 1.7, p.z + 3.0], look: [p.x, 0.3, p.z] } };
  },
};
