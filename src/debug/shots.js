// Presets de integración (propiedad del director). Vistas generales de la isla en distintos momentos.
export const shots = {
  integracion_vista_aerea: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 10, camera: { pos: [s.x * 0.2, 520, s.z * 1.55 + 400], look: [0, 0, 0] } };
  },
  integracion_playa_dia: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 10.5, camera: { agl: true, pos: [s.x, 2.2, s.z], look: [s.x * 0.8, 6, s.z * 0.55] } };
  },
  integracion_amanecer: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 6.2, camera: { agl: true, pos: [s.x, 2.2, s.z], look: [s.x * 0.8, 6, s.z * 0.55] } };
  },
  integracion_atardecer: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 18.1, camera: { agl: true, pos: [s.x, 2.2, s.z], look: [s.x * 0.8, 6, s.z * 0.55] } };
  },
  integracion_noche: (ctx) => {
    const s = ctx.world.spawn;
    return { hour: 23.0, camera: { agl: true, pos: [s.x, 2.2, s.z], look: [s.x * 0.8, 6, s.z * 0.55] } };
  },
};
