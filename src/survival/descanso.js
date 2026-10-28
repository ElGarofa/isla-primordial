// Descanso y sueño. Estadística `sueno` (100 = descansado) que baja estando despierto; el cansancio frena la recuperación de energía
// y de vida. Dormir (en una cama o en el suelo) acelera el tiempo de juego hasta el amanecer o hasta descansar, recupera sueño y
// algo de vida, y gasta comida y agua a medio ritmo. Despierta una amenaza cercana, el daño, el frío, el hambre o una tecla.
// La última cama en la que se durmió es el punto de reaparición. Todo lo de tiempo de juego usa ctx.time.escala.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const SUENO = {
  velocidad: 40, // segundos de juego por segundo real mientras duerme (una noche de 9 h ≈ 14 s)
  bajaDespierto: 100 / 2400, // por segundo de juego: de 100 a 0 en 1,6 días despierto
  sprintExtra: 0.5, // correr cansa un 50 % más
  recuperaCama: 100 / 375, // 6 h de juego en cama → descansado del todo
  recuperaSuelo: 100 / 620, // en el suelo hace falta casi el doble
  vidaCama: 0.05, vidaSuelo: 0.015, // por segundo de juego, si no hay hambre ni sed
  consumo: 0.5, // hambre y sed dormido, respecto de despierto
  amanecer: 6.5, // hora a la que despierta si se acostó de noche
  cansado: 25, agotado: 10, // umbrales de los efectos
  radioAmenaza: 32, // m: un depredador salvaje más cerca impide dormir y despierta
};

export function crearDescanso(ctx, S) {
  const st = { dur: null, chequeo: 0, avisos: { cansado: false, agotado: false }, despertoPor: null };
  const avisar = (t, tipo = 'info') => ctx.ui?.notify?.(t, tipo);
  const dayLen = ctx.config.time.dayLengthSec;
  const esNoche = (h = ctx.time.hour) => h >= 20 || h < SUENO.amanecer - 0.25;

  /** Criaturas que impiden dormir: depredadores salvajes cerca, o cualquiera que esté cazando o cargando contra el jugador. */
  function amenaza(radio = SUENO.radioAmenaza) {
    const p = ctx.player.position;
    for (const c of ctx.fauna?.creatures ?? []) {
      if (c.muerta || c.rel?.dom || c.rel?.propio) continue;
      const d = Math.hypot(c.position.x - p.x, c.position.z - p.z);
      if (d > radio * 1.8) continue;
      const contraMi = (c.state === 'chase' || c.state === 'stalk' || c.state === 'charge') && (c.tgt?.jugador || c.amenaza?.jugador);
      if (contraMi && d < radio * 1.8) return c;
      if (c.sp.tipo === 'depredador' && d < radio && !(c.rel?.hab >= 1 && (c.hambre ?? 1) < 0.5)) return c;
    }
    return null;
  }

  function puede(cama = null) {
    if (ctx.state !== 'playing' || S.dead) return { ok: false, motivo: '' };
    if (st.dur) return { ok: false, motivo: 'Ya estás durmiendo' };
    if (ctx.player.montura) return { ok: false, motivo: 'Baja de tu montura para dormir' };
    if (ctx.player.inWater || ctx.player.swimming) return { ok: false, motivo: 'No puedes dormir en el agua' };
    if (S.heridas?.sangrando) return { ok: false, motivo: 'Véndate antes de dormir: estás sangrando' };
    if (S.stats.sueno > 90 && !esNoche()) return { ok: false, motivo: 'No tienes sueño' };
    const a = amenaza(SUENO.radioAmenaza * 1.25);
    if (a) return { ok: false, motivo: `No puedes dormir con ${a.nombre ? 'un ' + a.nombre.toLowerCase() : 'una amenaza'} cerca` };
    if (!cama && S.stats.sueno > 70 && !esNoche()) return { ok: false, motivo: 'No tienes sueño' };
    return { ok: true, motivo: '' };
  }

  function dormir({ cama = null } = {}) {
    const r = puede(cama);
    if (!r.ok) { if (r.motivo) { avisar(r.motivo, 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); } return false; }
    const noche = esNoche();
    st.dur = { cama, noche, hora0: ctx.time.hour, sueno0: S.stats.sueno, vida0: S.stats.vida, horasDormidas: 0 };
    st.chequeo = 0; st.despertoPor = null;
    if (cama) {
      // se acuesta en la cama: se apunta como lugar de reaparición
      ctx.player.teleport(cama.x, cama.z); ctx.player.yaw = cama.rot + Math.PI;
      S.reaparicion = { x: cama.x, z: cama.z, id: cama.id };
    }
    ctx.player.velocity.set(0, 0, 0);
    ctx.player.durmiendo = true;
    ctx.time.escala = SUENO.velocidad;
    ctx.events.emit('descanso:inicio', { cama: !!cama, noche });
    return true;
  }

  function despertar(motivo = 'tecla') {
    if (!st.dur) return;
    const d = st.dur; st.dur = null; st.despertoPor = motivo;
    ctx.time.escala = 1;
    ctx.player.durmiendo = false;
    const horas = d.horasDormidas;
    ctx.events.emit('descanso:fin', { motivo, horas, cama: !!d.cama, sueno: S.stats.sueno });
    const TXT = { amanecer: 'Amanece', descansado: 'Te despiertas descansado', amenaza: '¡Algo se acerca! Te despiertas sobresaltado', dano: 'Te despierta el dolor', frio: 'Te despierta el frío', hambre: 'Te despierta el hambre', sed: 'Te despierta la sed', tecla: 'Te levantas' };
    avisar(`${TXT[motivo] ?? 'Despiertas'} · dormiste ${horas >= 1 ? `${horas.toFixed(1).replace('.', ',')} h` : `${Math.round(horas * 60)} min`}`, motivo === 'amenaza' || motivo === 'dano' ? 'warn' : 'ok');
  }

  // cualquier tecla de movimiento o acción despierta (el resto de la entrada está bloqueada mientras duerme)
  if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
    if (!st.dur || e.repeat) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'Escape', 'Enter', 'KeyZ'].includes(e.code)) despertar('tecla');
  });
  ctx.events.on('player:damage', () => { if (st.dur) despertar('dano'); });
  ctx.events.on('player:died', () => { if (st.dur) { st.dur = null; ctx.time.escala = 1; ctx.player.durmiendo = false; } });
  ctx.events.on('input:action', ({ action, pressed }) => {
    if (!pressed || action !== 'dormir' || ctx.state !== 'playing' || ctx.ui?.blocksInput) return;
    // Z: si hay una cama propia a mano, en ella; si no, en el suelo
    const p = ctx.player.position;
    const cama = (ctx.construccion?.camas?.() ?? []).find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 3) ?? null;
    dormir({ cama });
  });

  /**
   * Un paso de simulación (dt real, ya con el juego en marcha). Devuelve el multiplicador de consumo de comida y agua para este paso.
   * Despierto: baja el sueño y avisa del cansancio. Dormido: adelanta el reloj, recupera y comprueba si hay que despertar.
   */
  function tick(dt, { corriendo = false, temp = 26 } = {}) {
    const s = S.stats;
    if (!st.dur) {
      s.sueno = clamp(s.sueno - dt * SUENO.bajaDespierto * (corriendo ? 1 + SUENO.sprintExtra : 1) * (S.mult?.consumo ?? 1), 0, 100);
      if (s.sueno < SUENO.cansado && !st.avisos.cansado) { st.avisos.cansado = true; avisar('Estás cansado: necesitas dormir', 'warn'); }
      if (s.sueno < SUENO.agotado && !st.avisos.agotado) { st.avisos.agotado = true; avisar('Estás agotado: sin dormir no te recuperas', 'warn'); }
      if (s.sueno > SUENO.cansado + 10) st.avisos.cansado = false;
      if (s.sueno > SUENO.agotado + 10) st.avisos.agotado = false;
      return 1;
    }
    const d = st.dur, k = SUENO.velocidad, g = dt * k; // segundos de juego de este paso
    // el reloj corre `k` veces más deprisa (el bucle principal ya sumó dt)
    ctx.time.hour = (ctx.time.hour + ((k - 1) * dt * 24) / dayLen) % 24;
    ctx.time.elapsed += (k - 1) * dt;
    d.horasDormidas += (g * 24) / dayLen;
    const enCama = !!d.cama;
    s.sueno = clamp(s.sueno + g * (enCama ? SUENO.recuperaCama : SUENO.recuperaSuelo), 0, 100);
    s.energia = clamp(s.energia + g * 0.5, 0, 100);
    if (s.hambre > 30 && s.sed > 30) s.vida = clamp(s.vida + g * (enCama ? SUENO.vidaCama : SUENO.vidaSuelo), 0, 100);
    // ¿despertar?
    const h = ctx.time.hour;
    // de noche se duerme hasta el alba (con el primer claro, si ya descansó del todo); de día, hasta descansar
    if (d.noche && h < 12 && d.horasDormidas > 0.5 && (h >= SUENO.amanecer || (s.sueno >= 99.5 && !esNoche(h)))) { despertar('amanecer'); return SUENO.consumo * k; }
    if (!d.noche && s.sueno >= 99.5) { despertar('descansado'); return SUENO.consumo * k; }
    if (s.hambre < 5) { despertar('hambre'); return SUENO.consumo * k; }
    if (s.sed < 5) { despertar('sed'); return SUENO.consumo * k; }
    if (temp < 6) { despertar('frio'); return SUENO.consumo * k; }
    st.chequeo -= dt;
    if (st.chequeo <= 0) { st.chequeo = 0.4; if (amenaza()) { despertar('amenaza'); return SUENO.consumo * k; } }
    return SUENO.consumo * k;
  }

  /** Multiplicadores del cansancio sobre la recuperación (energía, vida) y el máximo de energía. */
  function efectos() {
    const z = S.stats.sueno;
    if (st.dur) return { energiaRec: 1, vidaRec: 1, energiaMax: 100 };
    if (z < SUENO.agotado) return { energiaRec: 0.35, vidaRec: 0, energiaMax: 45 };
    if (z < SUENO.cansado) return { energiaRec: 0.6, vidaRec: 0.5, energiaMax: 80 };
    return { energiaRec: 1, vidaRec: 1, energiaMax: 100 };
  }

  return {
    SUENO,
    get durmiendo() { return !!st.dur; },
    get estado() { return st.dur ? { ...st.dur, cama: !!st.dur.cama } : null; },
    get despertoPor() { return st.despertoPor; },
    puede, dormir, despertar, tick, efectos, amenaza,
    /** Texto de la tecla E sobre una cama. */
    prompt(cama) { const r = puede(cama); return r.ok ? (esNoche() ? 'Dormir hasta el amanecer' : 'Dormir') : r.motivo ? `Dormir · ${r.motivo.toLowerCase()}` : 'Dormir'; },
  };
}
