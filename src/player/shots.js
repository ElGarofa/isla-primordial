// Presets del módulo player (prefijo jugador_). La cámara del menú y una vista en primera persona de prueba.
export const shots = {
  jugador_costa_primera_persona: (ctx) => {
    const p = ctx.world.spawn;
    return { hour: 9.5, camera: { agl: true, pos: [p.x, ctx.config.player.eyeHeight, p.z - 4], look: [p.x * 0.6, 3, p.z * 0.4] } };
  },
  // primera persona con cada herramienta (brazos y objetos en la mano)
  ...Object.fromEntries([
    ['jugador_vm_puno', null, 12, 0],
    ['jugador_vm_hacha', 'hacha_piedra', 12, 0],
    ['jugador_vm_hacha_golpe', 'hacha_piedra', 12, 0.2],
    ['jugador_vm_pico', 'pico_piedra', 12, 0],
    ['jugador_vm_lanza', 'lanza', 12, 0],
    ['jugador_vm_lanza_estocada', 'lanza', 12, 0.3],
    ['jugador_vm_antorcha_noche', 'antorcha', 12, 0, 21.8],
  ].map(([name, item, , atk, hour]) => [name, (ctx) => {
    const p = ctx.world.spawn;
    return {
      hour: hour ?? 14.5,
      camera: { agl: true, pos: [p.x, ctx.config.player.eyeHeight, p.z - 4], look: [p.x * 0.6, 3, p.z * 0.4] },
      setup: () => {
        const vm = ctx.viewmodel;
        vm.equipNow(item);
        if (atk) vm.state.attack = { t: atk - 12 / 30, dur: 0.55, kind: item ?? 'puno', side: 0 };
      },
    };
  }])),
};
