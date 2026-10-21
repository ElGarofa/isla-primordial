// Presets del módulo flora (prefijo flora_). Buscan zonas por bioma de forma determinista.
function findBiome(ctx, biome, { minH = 0, maxH = 999, maxSlope = 0.12, from = 0 } = {}) {
  for (let r = 60 + from; r < 560; r += 18) {
    for (let a = 0; a < 6.283; a += 0.21) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = ctx.world.getHeight(x, z);
      if (h > minH && h < maxH && ctx.world.getBiome(x, z) === biome && ctx.world.getSlope(x, z) < maxSlope) return { x, z, a };
    }
  }
  return null;
}
const toward = (p, d = 30) => [p.x - Math.cos(p.a) * d, p.z - Math.sin(p.a) * d];

export const shots = {
  flora_selva: (ctx) => {
    const p = findBiome(ctx, 'selva', { minH: 6 }) ?? { x: 0, z: 0, a: 0 };
    const [lx, lz] = toward(p, 40);
    return { hour: 10.5, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [lx, 6, lz] } };
  },
  flora_selva_contraluz: (ctx) => {
    const p = findBiome(ctx, 'selva', { minH: 6 }) ?? { x: 0, z: 0, a: 0 };
    const [lx, lz] = toward(p, 40);
    return { hour: 7.2, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [lx, 8, lz] } };
  },
  flora_palmeras_playa: (ctx) => {
    const p = findBiome(ctx, 'playa', { minH: 1.3, maxH: 3.0, from: 200 }) ?? { x: 0, z: 0, a: 0 };
    return { hour: 16.5, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x - Math.cos(p.a) * 40, 7, p.z - Math.sin(p.a) * 40] } };
  },
  flora_hierba_detalle: (ctx) => {
    const p = findBiome(ctx, 'pradera', { minH: 6 }) ?? findBiome(ctx, 'selva', { minH: 6 }) ?? { x: 0, z: 0, a: 0 };
    return { hour: 11, camera: { agl: true, pos: [p.x, 0.55, p.z], look: [p.x - Math.cos(p.a) * 6, 0.6, p.z - Math.sin(p.a) * 6] } };
  },
  flora_conifera_montana: (ctx) => {
    const p = findBiome(ctx, 'montana', { maxSlope: 0.3 }) ?? { x: 0, z: 0, a: 0 };
    return { hour: 15, camera: { agl: true, pos: [p.x, 2.0, p.z], look: [p.x - Math.cos(p.a) * 40, 12, p.z - Math.sin(p.a) * 40] } };
  },
  flora_vista_costa: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 17.8, camera: { agl: true, pos: [s.x * 0.9, 40, s.z * 0.9 + 60], look: [s.x * 0.2, 5, s.z * 0.3] } };
  },
};
