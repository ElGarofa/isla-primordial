// Presets del módulo fauna (prefijo fauna_). Colocan criaturas en un claro llano y encuadran de lado, de frente o en grupo.
function findFlat(ctx, ox = 0, oz = 0, big = 0) {
  const w = ctx.world, s = w.spawn, tmp = [];
  const clear = (x, z, r) => w.colliders.query(x, z, r, tmp).length === 0;
  // 1) arena llana sin árboles ni rocas (no crece hierba alta), 2) cualquier claro llano
  for (const [h0, h1, minR] of [[1.5, 2.7, Math.max(18, big)], [1.5, 40, Math.max(14, big)], [1.5, 40, 14]]) {
    for (let r = 0; r < 700; r += 8) {
      for (let a = 0; a < 6.283; a += 0.25) {
        const x = s.x + ox + Math.cos(a) * r, z = s.z + oz + Math.sin(a) * r, h = w.getHeight(x, z);
        if (h < h0 || h > h1 || w.getSlope(x, z) > 0.03 || !clear(x, z, minR)) continue;
        let ok = true;
        for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) if (w.getHeight(x + dx, z + dz) < h0 - 0.2 || w.getSlope(x + dx, z + dz) > 0.07) { ok = false; break; }
        if (ok) return { x, z };
      }
    }
  }
  return { x: s.x, z: s.z };
}

/** Coloca criaturas en el claro. Cada item: { e, dx, dz, yaw, speed, ... }. Devuelve la lista creada. */
function place(ctx, items, ox = 0, oz = 0, hideGrass = true, big = 0) {
  ctx.fauna.clear();
  if (ctx.flora?.root) ctx.flora.root.visible = !hideGrass;
  const p = findFlat(ctx, ox, oz, big);
  const out = [];
  for (const it of items) {
    const c = ctx.fauna.spawnAt(it.e, p.x + (it.dx ?? 0), p.z + (it.dz ?? 0), { frozen: true, yaw: it.yaw ?? 0, tint: it.tint ?? 0.5 });
    c.state = it.state ?? 'idle';
    if (it.speed != null) c.override = { speed: it.speed, hold: true };
    if (it.state) c.state = it.state;
    if (it.roar) c.jawAnim = 1.2;
    out.push(c);
  }
  ctx.player.position.set(p.x + 400, 0, p.z + 400); // el jugador lejos para que nada reaccione
  return { p, out };
}

const SPD = { raptor: [1.7, 7.0], compsognatus: [1.2, 6.2], triceratops: [1.3, 5.8], braquiosaurio: [1.5, 3.0] };

// cámara de lado: la criatura mira hacia +x; la cámara en -z (a su izquierda)
function side(p, dist, h, tx = 0, ty = 0, back = 0) {
  return { camera: { agl: true, pos: [p.x + back, h, p.z - dist], look: [p.x + tx, ty, p.z] } };
}
async function run(ctx, items, shotCam, warm = 20, big = 0) {
  const { p, out } = place(ctx, items, 0, 0, true, big);
  for (let i = 0; i < warm; i++) ctx.fauna.creatures.forEach((c) => c.update(1 / 30, true));
  return { out, ...shotCam(p, out) };
}

export const shots = {
  fauna_raptor_lado: async (ctx) => ({ hour: 14, setup: async () => {}, ...(await run(ctx, [{ e: 'raptor', yaw: Math.PI / 2, speed: SPD.raptor[0] }], (p) => side(p, 5.2, 1.2, 0, 0.9))) }),
  fauna_raptor_carrera: async (ctx) => ({ hour: 15.5, ...(await run(ctx, [{ e: 'raptor', yaw: Math.PI / 2, speed: SPD.raptor[1] }], (p) => side(p, 5.4, 1.3, 0, 0.9), 40)) }),
  fauna_raptor_rugido: async (ctx) => ({ hour: 16.5, ...(await run(ctx, [{ e: 'raptor', yaw: 2.3, roar: true }], (p) => ({ camera: { agl: true, pos: [p.x + 0.6, 1.75, p.z - 4.2], look: [p.x + 0.6, 1.5, p.z] } }))) }),
  fauna_raptor_manada: async (ctx) => ({ hour: 8.2, ...(await run(ctx, [{ e: 'raptor', dx: 0, dz: 0, yaw: 0.9, speed: 5, tint: 0.2 }, { e: 'raptor', dx: -4, dz: 3, yaw: 1.1, speed: 5.5, tint: 0.6 }, { e: 'raptor', dx: 3, dz: 5, yaw: 0.7, speed: 4.8, tint: 0.9 }], (p) => ({ camera: { agl: true, pos: [p.x - 9, 1.8, p.z - 9], look: [p.x, 1, p.z + 2] } }), 30)) }),
  fauna_compsognatus: async (ctx) => ({ hour: 13, ...(await run(ctx, [{ e: 'compsognatus', yaw: Math.PI / 2, speed: SPD.compsognatus[0] }, { e: 'compsognatus', dx: -1.2, dz: 0.8, yaw: 1.2, speed: SPD.compsognatus[1] * 0.5, tint: 0.8 }], (p) => side(p, 1.7, 0.45, -0.5, 0.25))) }),
  fauna_triceratops_lado: async (ctx) => ({ hour: 13, ...(await run(ctx, [{ e: 'triceratops', yaw: Math.PI / 2, speed: SPD.triceratops[0] }], (p) => side(p, 9, 1.7, 0, 1.6), 30)) }),
  fauna_triceratops_frente: async (ctx) => ({ hour: 16, ...(await run(ctx, [{ e: 'triceratops', yaw: 0 }], (p) => ({ camera: { agl: true, pos: [p.x + 1.5, 1.5, p.z + 8.5], look: [p.x, 1.9, p.z] } }))) }),
  fauna_triceratops_embestida: async (ctx) => ({ hour: 17.3, ...(await run(ctx, [{ e: 'triceratops', yaw: 0, speed: SPD.triceratops[1], state: 'charge' }], (p) => ({ camera: { agl: true, pos: [p.x + 3.5, 0.9, p.z + 8], look: [p.x, 1.5, p.z] } }), 40)) }),
  fauna_braquiosaurio: async (ctx) => ({ hour: 12.5, ...(await run(ctx, [{ e: 'braquiosaurio', yaw: Math.PI / 2, speed: SPD.braquiosaurio[0] }], (p) => side(p, 34, 4, 0, 6), 40, 44)) }),
  fauna_braquiosaurio_cerca: async (ctx) => ({ hour: 9, ...(await run(ctx, [{ e: 'braquiosaurio', yaw: 0.5 }], (p) => ({ camera: { agl: true, pos: [p.x - 9, 1.7, p.z - 12], look: [p.x, 3.5, p.z] } }), 20, 30)) }),
  fauna_pteranodon: async (ctx) => {
    const r = await run(ctx, [{ e: 'pteranodon', yaw: 0 }], (p) => ({ camera: { agl: true, pos: [p.x, 1.7, p.z], look: [p.x + 20, 28, p.z - 20] } }), 5);
    const c = r.out[0];
    c.frozen = true; c.flight.flap = 1; c.flight.flapPh = 0.4;
    c.position.set(r.camera.pos[0] + 17, ctx.world.getHeight(r.camera.pos[0] + 17, r.camera.pos[2] - 14) + 22, r.camera.pos[2] - 14);
    c.yaw = 2.3; c.group.rotation.y = c.yaw;
    c.update = function (dt) { this.t += dt; this.flight.flapPh += dt * 7.5; this.applyFlight(dt); this.group.rotation.set(0, this.yaw, 0); this.group.position.copy(this.position); };
    return { hour: 16.5, camera: r.camera };
  },
  fauna_escala: async (ctx) => ({ hour: 15, ...(await run(ctx, [
    { e: 'braquiosaurio', dx: 14, dz: 14, yaw: Math.PI / 2 }, { e: 'triceratops', dx: 4, dz: 5, yaw: Math.PI / 2 }, { e: 'raptor', dx: -2, dz: 1.5, yaw: Math.PI / 2 }, { e: 'compsognatus', dx: -5, dz: 0.4, yaw: Math.PI / 2 },
  ], (p) => ({ camera: { agl: true, pos: [p.x + 2, 5, p.z - 38], look: [p.x + 4, 4, p.z + 6] } }), 20, 44)) }),
  fauna_muerto: async (ctx) => {
    const r = await run(ctx, [{ e: 'raptor', yaw: Math.PI / 2 }], (p) => ({ camera: { agl: true, pos: [p.x + 1.5, 2.4, p.z - 4.5], look: [p.x, 0.4, p.z] } }));
    const c = r.out[0]; c.hp = 0; c.muerta = true; c.state = 'dead'; c.deathT = 0;
    for (let i = 0; i < 40; i++) c.update(1 / 30, true);
    return { hour: 12, camera: r.camera };
  },
  fauna_bosque_manada: async (ctx) => {
    const { p, out } = place(ctx, [{ e: 'raptor', dx: 0, dz: 0, yaw: 0.9, speed: 3.2, tint: 0.2 }, { e: 'raptor', dx: -3.5, dz: 2.5, yaw: 1.1, speed: 3.6, tint: 0.6 }, { e: 'raptor', dx: 2, dz: 4.5, yaw: 0.7, speed: 3, tint: 0.9 }], 0, 0, false, 8);
    for (let i = 0; i < 25; i++) out.forEach((c) => c.update(1 / 30, true));
    return { hour: 9, camera: { agl: true, pos: [p.x - 13, 1.7, p.z - 11], look: [p.x, 1.0, p.z + 2] } };
  },
  fauna_noche: async (ctx) => ({ hour: 22.5, ...(await run(ctx, [{ e: 'raptor', yaw: 2.4, speed: 1.7 }, { e: 'triceratops', dx: 7, dz: 5, yaw: 3.6 }], (p) => ({ camera: { agl: true, pos: [p.x - 2, 1.7, p.z - 9], look: [p.x + 2, 1.3, p.z] } }))) }),
};
