// Presets del módulo ui (prefijo ui_). Usar con --ui para que el HUD aparezca en la captura.
function spot(ctx) {
  const s = ctx.world.spawn;
  return { x: s.x, z: s.z };
}
function fill(c) {
  const S = c.survival;
  S.newGame?.();
  for (const [i, n] of [['hacha_piedra', 1], ['antorcha', 1], ['baya', 12], ['carne_cruda', 3], ['madera', 24], ['piedra', 11], ['fibra', 17], ['pedernal', 2], ['fogata', 1], ['cuero', 4], ['hueso', 3], ['agua', 5], ['carne_cocida', 2], ['lanza', 1]]) S.inventory.add(i, n);
  S.stats.vida = 72; S.stats.hambre = 58; S.stats.sed = 36; S.stats.energia = 84; S.stats.temperatura = 24;
  S.select(0);
  if (S.tutorial) S.tutorial.step = 4;
}
export const shots = {
  ui_hud: (ctx) => {
    const p = spot(ctx);
    return { hour: 16.4, setup: async (c) => { fill(c); c.ui.notify('Partida guardada', 'ok'); c.events.emit('item:added', { item: 'madera', cantidad: 3 }); c.events.emit('player:target', { nombre: 'Árbol', tipo: 'arbol', accion: 'Talar', vida: 64 }); }, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x * 0.2, 6, p.z * 0.2] } };
  },
  ui_inventario: (ctx) => {
    const p = spot(ctx);
    return { hour: 12, setup: async (c) => { fill(c); c.events.emit('input:action', { action: 'inventario', pressed: true }); }, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x * 0.2, 6, p.z * 0.2] } };
  },
  ui_mapa: (ctx) => {
    const p = spot(ctx);
    return { hour: 12, setup: async (c) => { fill(c); c.events.emit('input:action', { action: 'mapa', pressed: true }); }, camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x * 0.2, 6, p.z * 0.2] } };
  },
  ui_menu: (ctx) => {
    return { hour: 17.2, setup: async (c) => { c.setState('menu'); }, camera: { agl: false, pos: [-520, 110, 480], look: [0, 30, 0] } };
  },
  ui_muerte: (ctx) => {
    const p = spot(ctx);
    return { hour: 12, setup: async (c) => { fill(c); c.survival.damage(500, 'Raptor'); }, camera: { agl: true, pos: [p.x, 1.2, p.z], look: [p.x * 0.2, 6, p.z * 0.2] } };
  },
};
