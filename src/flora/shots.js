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

/** Punto llano del bioma más cercano al inicio (rejilla gruesa de 48 m hasta 5 km). */
function cercaDelInicio(ctx, biome, maxSlope = 0.25) {
  const w = ctx.world, s = w.spawn;
  for (let r = 0; r < 9000; r += 48) for (let a = 0; a < 6.283; a += 48 / Math.max(48, r)) {
    const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
    if (Math.abs(x) > w.limite || Math.abs(z) > w.limite) continue;
    if (w.getBiome(x, z) === biome && w.getSlope(x, z) < maxSlope && w.getHeight(x, z) > 1) return { x, z };
  }
  return { x: s.x, z: s.z };
}
/** Carga la flora alrededor de un punto y encuadra la roca más grande cerca (vista a `dist` m, a la altura `alto`). */
async function encuadrarRoca(ctx, biome, { dist = 7, alto = 1.8, minSc = 1.2, hora = 15, pendiente = 0.25 } = {}) {
  const p = cercaDelInicio(ctx, biome, pendiente);
  ctx.debug.freeCamera = true; ctx.camera.position.set(p.x, ctx.world.getHeight(p.x, p.z) + 3, p.z);
  window.__game.advance(40, 0.1);
  const lista = ctx.flora.getHarvestablesNear(p, 140, []).filter((e) => e.tipo === 'roca' && !e.it.mineral && e.it.bioma === biome).sort((a, b) => b.it.sc - a.it.sc);
  const r = lista.find((e) => e.it.sc >= minSc) ?? lista[0];
  if (!r) return { hour: hora, camera: { agl: true, pos: [p.x, 2, p.z], look: [p.x + 30, 1, p.z] } };
  const a = 2.3, x = r.it.x + Math.cos(a) * dist * r.it.sc, z = r.it.z + Math.sin(a) * dist * r.it.sc;
  return { hour: hora, weather: { rain: 0, storm: 0 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [x, alto * Math.max(1, r.it.sc * 0.7), z], look: [r.it.x, 0.4 * r.it.sc, r.it.z] } };
}

/** Encuadra el ejemplar de `tipo` más cercano a un punto del bioma: cámara a `dist`·escala del pie, a `alto` m, mirando a `mira`·escala de altura. */
async function encuadrarPlanta(ctx, tipo, biome, { dist = 8, alto = 1.7, mira = 4, hora = 11, angulo = 2.3 } = {}) {
  const p = cercaDelInicio(ctx, biome, 0.3);
  ctx.debug.freeCamera = true; ctx.camera.position.set(p.x, ctx.world.getHeight(p.x, p.z) + 3, p.z);
  window.__game.advance(40, 0.1);
  const it = ctx.flora.instanciasCerca(p, 300, tipo)[0];
  if (!it) return { hour: hora, camera: { agl: true, pos: [p.x, alto, p.z], look: [p.x + 30, 4, p.z] } };
  const sc = it.sc ?? 1, x = it.x + Math.cos(angulo) * dist * sc, z = it.z + Math.sin(angulo) * dist * sc;
  return { hour: hora, weather: { rain: 0, storm: 0 }, setup: () => { ctx.debug.hideViewmodel = true; }, camera: { agl: true, pos: [x, alto, z], look: [it.x, mira * sc, it.z] } };
}

export const shots = {
  flora_palmera_cerca: (ctx) => encuadrarPlanta(ctx, 'palma', 'playa', { dist: 7, mira: 8, hora: 11 }),
  flora_helecho_arb: (ctx) => encuadrarPlanta(ctx, 'helechoArb', 'selva', { dist: 4.5, mira: 3, hora: 11 }),
  flora_cicada: (ctx) => encuadrarPlanta(ctx, 'cicada', 'selva', { dist: 2.6, alto: 1.5, mira: 0.6, hora: 11 }),
  flora_araucaria: (ctx) => encuadrarPlanta(ctx, 'araucaria', 'bosque', { dist: 22, alto: 2, mira: 16, hora: 14 }),
  flora_arbusto: (ctx) => encuadrarPlanta(ctx, 'arbusto', 'pradera', { dist: 3.2, alto: 1.6, mira: 0.7, hora: 10 }),
  flora_conifera_cerca: (ctx) => encuadrarPlanta(ctx, 'conifera', 'taiga', { dist: 9, alto: 1.8, mira: 7, hora: 13 }),
  flora_rocas_montana: (ctx) => encuadrarRoca(ctx, 'montana', { dist: 5, hora: 14 }),
  flora_rocas_desierto: (ctx) => encuadrarRoca(ctx, 'desierto', { dist: 5, hora: 16.5 }),
  flora_rocas_volcan: (ctx) => encuadrarRoca(ctx, 'volcan', { dist: 5, hora: 12, pendiente: 0.5 }),
  flora_rocas_pradera: (ctx) => encuadrarRoca(ctx, 'pradera', { dist: 3.5, alto: 1.4, minSc: 0.5, hora: 10 }),
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
