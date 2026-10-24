// SENTIDOS Y ECOLOGÍA: percepción real (vista con cono, oído con ruido, olfato con viento), oclusión por terreno y vegetación,
// rastro de huellas del jugador y lista de cadáveres. Nada aquí “sabe” dónde está el jugador: cada criatura percibe con sus propios sentidos.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const shortest = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const _o = [];

// atenuación de la visión por vegetación (por metro de línea de visión, según bioma)
const VEG = { selva: 0.016, pantano: 0.01, pradera: 0.0025, montana: 0.004, playa: 0, nieve: 0 };

export function createSentidos(ctx, mgr) {
  const world = ctx.world;
  const W = ctx.time.weather;
  const trail = []; // huellas del jugador: { x, z, t }
  let lastTx = 1e9, lastTz = 1e9;

  /** Transmitancia 0..1 de la línea de visión entre dos puntos (terreno + vegetación). */
  function ocluir(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
    if (d < 4) return 1;
    const n = clamp(Math.ceil(d / 7), 3, 12), seg = d / n;
    let trans = 1, veg = 0;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + dx * t, z = az + dz * t, y = ay + (by - ay) * t;
      const h = world.getHeight(x, z);
      if (h > y - 0.25) trans *= 0.12;
      veg += (VEG[world.getBiome(x, z)] ?? 0.004) * seg;
    }
    // árboles y rocas cerca de la línea (tres muestras)
    let bloq = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const list = world.colliders.query(ax + dx * t, az + dz * t, 1.6, _o);
      for (let i = 0; i < list.length; i++) if (list[i].radius > 0.3) { bloq++; break; }
    }
    trans *= Math.exp(-veg) * Math.pow(0.72, bloq);
    return clamp(trans, 0, 1);
  }

  /** Perfil de percepción del jugador (ruido y visibilidad según lo que hace). */
  const _pj = { x: 0, y: 0, z: 0, ruido: 0, visib: 1, tipo: 'jugador', ref: null };
  function perfilJugador() {
    const p = ctx.player, v = Math.hypot(p.velocity.x, p.velocity.z);
    _pj.x = p.position.x; _pj.y = p.position.y + 1.1; _pj.z = p.position.z;
    _pj.ruido = p.swimming ? 0.55 : p.sprinting ? 1 : v > 0.5 ? (p.crouching ? 0.16 : 0.5) : 0.05;
    _pj.ruido *= ctx.survival?.ruidoMul ?? 1; // la ropa (sandalias, coraza ósea) cambia el ruido
    if (p.ruidoExtra > _pj.ruido) _pj.ruido = p.ruidoExtra; // golpes, talar, disparos: ruido puntual que decae
    _pj.visib = p.crouching ? 0.55 : v < 0.3 ? 0.8 : p.sprinting ? 1.15 : 1;
    return _pj;
  }
  function perfilCriatura(o) {
    const sp = o.sp, mv = clamp(o.speed / Math.max(1, sp.vel.run), 0, 1);
    return { x: o.position.x, y: o.position.y + (sp.hit[0]?.[1] ?? 1), z: o.position.z, ruido: clamp((0.12 + mv * 0.9) * (0.55 + 0.45 * Math.min(2, sp.radius)), 0, 1.4), visib: clamp(0.7 + sp.radius * 0.3, 0.7, 1.6), tipo: 'criatura', ref: o };
  }

  /**
   * ¿Cuánto percibe `obs` de `tgt`? Devuelve { conf 0..1, via, d, bear } (bear = rumbo mundo hacia el objetivo, atan2(dx,dz)).
   * `bono` multiplica alcances (escaneo activo). Sin datos de objetivo lejano no hace trabajo.
   */
  function percibir(obs, tgt, bono = 1) {
    const ai = obs.sp.ai;
    const dx = tgt.x - obs.position.x, dz = tgt.z - obs.position.z, d = Math.hypot(dx, dz);
    const out = { conf: 0, via: '', d, bear: Math.atan2(dx, dz) };
    const S = obs.sp.sentidos ?? { vista: ai.vista ?? 0, fov: 2.2, oido: 0, olfato: 0 };
    const noche = ctx.time.nightFactor > 0.6 ? 0.55 : 1;
    const lluvia = W?.rain ?? 0, viento = W?.windStrength ?? 0.3;
    const eyeY = obs.position.y + (obs.sp.eye ?? (obs.sp.hips || 1) * 1.2);
    let vis = 0, oi = 0, ol = 0, occ = -1;
    // vista
    const rv = S.vista * noche * (1 - 0.35 * lluvia) * (tgt.visib ?? 1) * bono;
    if (rv > 0 && d < rv) {
      const rel = Math.abs(shortest(out.bear - obs.yaw - (obs.lookYaw ?? 0) * 0.5));
      const half = (S.fov ?? 2.2) / 2;
      // visión central (cono) y periférica: fuera del cono solo se detecta lo que se mueve, y mal
      const central = rel < half, perif = !central && rel < 2.5 && (tgt.ruido ?? 0) > 0.25;
      if (central || perif) {
        occ = ocluir(obs.position.x, eyeY, obs.position.z, tgt.x, tgt.y, tgt.z);
        vis = Math.pow(Math.max(0, 1 - (d / rv) * (d / rv)), 0.8) * occ * (central ? (rel < half * 0.55 ? 1 : 0.7) : 0.3);
      }
    }
    // oído (rodea obstáculos mejor que la vista)
    const ro = S.oido * (tgt.ruido ?? 0.3) * (1 - 0.3 * lluvia - 0.22 * viento) * bono;
    if (ro > 0 && d < ro) {
      if (occ < 0) occ = ocluir(obs.position.x, eyeY, obs.position.z, tgt.x, tgt.y, tgt.z);
      oi = Math.pow(1 - d / ro, 0.8) * (0.45 + 0.55 * Math.pow(occ, 0.4));
    }
    // olfato (depende del viento: a favor llega lejos, en contra casi nada)
    if (S.olfato > 0 && d < S.olfato * 1.1 * bono) {
      const wx = W?.wind?.x ?? 0, wz = W?.wind?.y ?? 0, wl = Math.hypot(wx, wz) || 1;
      const down = clamp(((obs.position.x - tgt.x) * wx + (obs.position.z - tgt.z) * wz) / (wl * Math.max(1, d)), -1, 1); // >0: el viento lleva el olor hacia el observador
      const ro2 = S.olfato * (0.3 + 0.7 * (down * 0.5 + 0.5)) * (1 - 0.4 * lluvia) * bono;
      if (d < ro2) ol = (1 - d / ro2) * 0.75;
    }
    if (vis >= oi * 0.85 && vis >= ol) { out.conf = vis; out.via = 'vista'; } else if (oi >= ol) { out.conf = oi * 0.85; out.via = 'oido'; } else { out.conf = ol * 0.7; out.via = 'olfato'; }
    out.conf = clamp(out.conf + (out.conf > 0.05 ? (Math.random() - 0.5) * 0.06 : 0), 0, 1);
    return out;
  }

  // ------------------------------------------------------------------------------------------ huellas del jugador (rastro de olor)
  function registrarRastro(now) {
    const p = ctx.player?.position;
    if (!p || ctx.state !== 'playing') return;
    if (Math.hypot(p.x - lastTx, p.z - lastTz) < 1.5) return;
    lastTx = p.x; lastTz = p.z;
    trail.push({ x: p.x, z: p.z, t: now });
    if (trail.length > 600) trail.shift();
  }
  /** Siguiente punto del rastro desde (x,z): solo si hay huellas frescas a su alcance. */
  function seguirRastro(x, z, now, alcance = 38) {
    const vida = 150 * (1 - 0.65 * (W?.rain ?? 0));
    let best = -1, bd = alcance * alcance;
    for (let i = trail.length - 1; i >= 0; i--) {
      const h = trail[i];
      if (now - h.t > vida) break;
      const dd = (h.x - x) * (h.x - x) + (h.z - z) * (h.z - z);
      if (dd < bd) { bd = dd; best = i; }
    }
    if (best < 0) return null;
    const next = trail[Math.min(trail.length - 1, best + 4)];
    return { x: next.x, z: next.z, edad: now - trail[best].t, final: best + 4 >= trail.length - 1 };
  }

  /** Cadáver más cercano que una criatura olfatea. */
  function carroñaCercana(c, olfato) {
    let best = null, bd = olfato * olfato;
    for (const o of mgr.list) {
      if (!o.muerta || o.deathT > 70 || o.devorado > 28) continue;
      const dx = o.position.x - c.position.x, dz = o.position.z - c.position.z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = o; }
    }
    return best;
  }

  return { ocluir, percibir, perfilJugador, perfilCriatura, registrarRastro, seguirRastro, carroñaCercana, shortest, clamp };
}
