// Heridas y males: SANGRADO (mordiscos, zarpazos, cornadas), FRACTURA (caídas, pisotones, embestidas, coletazos) e INTOXICACIÓN
// (comida casi podrida o carne cruda). Cada una tiene efecto, duración y cura:
//   · sangrado (niveles 1–3): quita vida cada segundo; el nivel 1 se corta solo, los graves bajan de nivel despacio; el VENDAJE lo corta.
//   · fractura: cojeas (sin correr y saltando poco) durante un día de juego; con una FÉRULA se cura en un tercio y cojeas menos.
//   · intoxicación: náuseas que gastan agua y comida y algo de vida; pasa sola y beber agua la acorta.
// No se puede dormir sangrando. Todo se guarda con la partida.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const HERIDAS = {
  sangrado: { vidaPorNivel: 0.12, coagula: 45, bajaNivel: 90, max: 3 }, // vida/s real por nivel; s hasta que el nivel 1 para; s para bajar un nivel
  fractura: { dura: 1500, conFerula: 500, lento: 0.68, lentoFerula: 0.85, salto: 0.55 }, // s de juego; multiplicadores de velocidad y salto
  intox: { dura: 150, sed: 0.12, hambre: 0.06, vida: 0.04, aguaAcorta: 40 }, // s de juego; consumo extra por s; s que quita cada trago
};

/** Probabilidad de sangrar y de fracturarse por un golpe de criatura, según el tipo de ataque y el daño ya amortiguado. */
export function probHerida(tipo, dano, armadura = 0) {
  const prot = armadura / (armadura + 30); // la misma curva que amortigua el daño
  const corte = { mordisco: 1, zarpazo: 1, cuerno: 0.8, golpe: 0.25, cola: 0.35, pisoton: 0.2, embestida: 0.4 }[tipo] ?? 0.5;
  const rompe = { pisoton: 1, embestida: 0.85, cola: 0.7, golpe: 0.3, cuerno: 0.3 }[tipo] ?? 0;
  return {
    sangrado: clamp((dano - 5) / 35, 0, 0.8) * corte * (1 - 0.6 * prot),
    fractura: clamp((dano - 15) / 40, 0, 0.6) * rompe * (1 - 0.4 * prot),
  };
}

export function crearHeridas(ctx, S) {
  const st = { sangrado: 0, tSang: 0, fractura: null, intox: 0 }; // fractura: { t: s de juego restantes, ferula }
  const avisar = (t, tipo = 'warn') => ctx.ui?.notify?.(t, tipo);
  const emitir = () => ctx.events.emit('heridas:cambio', estados());

  function sangrar(niveles = 1) {
    const antes = st.sangrado;
    st.sangrado = Math.min(HERIDAS.sangrado.max, st.sangrado + niveles); st.tSang = 0;
    if (st.sangrado > antes) { avisar(st.sangrado >= 2 ? 'Sangras mucho: véndate' : 'Estás sangrando'); emitir(); }
  }
  function fracturar() {
    if (st.fractura) { st.fractura.t = Math.max(st.fractura.t, HERIDAS.fractura.dura * 0.5); return; }
    st.fractura = { t: HERIDAS.fractura.dura, ferula: false };
    avisar('Te has roto un hueso: cojeas. Una férula ayuda a curarlo');
    ctx.audio?.play?.('dano'); emitir();
  }
  function intoxicar(gravedad = 1) {
    const antes = st.intox;
    st.intox = Math.max(st.intox, HERIDAS.intox.dura * (gravedad >= 2 ? 1 : 0.6));
    if (!antes) { avisar(gravedad >= 2 ? 'Esa comida estaba podrida: te sienta fatal' : 'Te sentó mal: náuseas'); emitir(); }
  }

  /** Lo llama survival.damage con el daño ya amortiguado por la armadura. */
  function alDano(cantidad, fuente, opts) {
    if (cantidad <= 0 || S.dead) return;
    if (opts?.armadura) {
      const p = probHerida(opts.tipo ?? 'golpe', cantidad, S.armadura?.() ?? 0);
      if (Math.random() < p.sangrado) sangrar(cantidad > 30 ? 2 : 1);
      if (Math.random() < p.fractura) fracturar();
    } else if (/caída/.test(fuente ?? '')) {
      // caídas: la fractura depende de la altura (el daño ya la mide)
      if (Math.random() < clamp((cantidad - 6) / 30, 0, 0.9)) fracturar();
    }
  }

  /** Cura con un objeto: devuelve true si sirvió (para no gastarlo en vano). */
  function curar(item) {
    if (item === 'vendaje') {
      if (!st.sangrado) return false;
      st.sangrado = 0; st.tSang = 0; avisar('Detuviste el sangrado', 'ok'); emitir(); return true;
    }
    if (item === 'ferula') {
      if (!st.fractura || st.fractura.ferula) return false;
      st.fractura.ferula = true; st.fractura.t = Math.min(st.fractura.t, HERIDAS.fractura.conFerula);
      avisar('Entablillaste el hueso: se curará antes', 'ok'); emitir(); return true;
    }
    return false;
  }

  function beberAgua() { if (st.intox > 0) st.intox = Math.max(0, st.intox - HERIDAS.intox.aguaAcorta); }

  /** dt real; los plazos largos (fractura, intoxicación) corren con el tiempo de juego. */
  function tick(dt) {
    if (S.dead) return;
    const g = dt * (ctx.time.escala ?? 1), s = S.stats;
    let cambio = false;
    if (st.sangrado > 0) {
      s.vida = Math.max(0, s.vida - dt * HERIDAS.sangrado.vidaPorNivel * st.sangrado);
      st.tSang += dt;
      if (st.sangrado === 1 && st.tSang > HERIDAS.sangrado.coagula) { st.sangrado = 0; st.tSang = 0; avisar('La herida dejó de sangrar', 'ok'); cambio = true; }
      else if (st.sangrado > 1 && st.tSang > HERIDAS.sangrado.bajaNivel) { st.sangrado--; st.tSang = 0; cambio = true; }
      if (s.vida <= 0) S.morir?.('Desangrado');
    }
    if (st.fractura) {
      st.fractura.t -= g;
      if (st.fractura.t <= 0) { st.fractura = null; avisar('El hueso soldó: ya no cojeas', 'ok'); cambio = true; }
    }
    if (st.intox > 0) {
      st.intox = Math.max(0, st.intox - g);
      s.sed = Math.max(0, s.sed - g * HERIDAS.intox.sed); s.hambre = Math.max(0, s.hambre - g * HERIDAS.intox.hambre);
      s.vida = Math.max(1, s.vida - g * HERIDAS.intox.vida);
      if (st.intox <= 0) { avisar('Se te pasaron las náuseas', 'ok'); cambio = true; }
    }
    if (cambio) emitir();
  }

  /** Multiplicadores de movimiento: andar, correr (con fractura no se corre) y salto. */
  function movilidad() {
    if (!st.fractura) return { andar: 1, correr: 1, salto: 1, cojea: false };
    const k = st.fractura.ferula ? HERIDAS.fractura.lentoFerula : HERIDAS.fractura.lento;
    return { andar: k, correr: 0, salto: HERIDAS.fractura.salto, cojea: true };
  }

  function estados() {
    const out = [];
    if (st.sangrado) out.push({ id: 'sangrado', nivel: st.sangrado, texto: st.sangrado >= 2 ? 'Sangrado grave' : 'Sangrando', ayuda: 'usa un vendaje' });
    if (st.fractura) { const h = (st.fractura.t / ctx.config.time.dayLengthSec) * 24; out.push({ id: 'fractura', nivel: 1, texto: st.fractura.ferula ? 'Hueso entablillado' : 'Hueso roto', ayuda: `${h >= 1 ? Math.ceil(h) + ' h' : 'menos de 1 h'}${st.fractura.ferula ? '' : ' · una férula lo acorta'}` }); }
    if (st.intox) out.push({ id: 'intox', nivel: 1, texto: 'Intoxicado', ayuda: 'bebe agua' });
    return out;
  }

  function limpiar() { st.sangrado = 0; st.tSang = 0; st.fractura = null; st.intox = 0; emitir(); }

  return {
    HERIDAS, st, sangrar, fracturar, intoxicar, alDano, curar, beberAgua, tick, movilidad, estados, limpiar,
    get sangrando() { return st.sangrado > 0; },
    serializar: () => ({ sangrado: st.sangrado, tSang: st.tSang, fractura: st.fractura ? { ...st.fractura } : null, intox: st.intox }),
    restaurar(d) { st.sangrado = d?.sangrado ?? 0; st.tSang = d?.tSang ?? 0; st.fractura = d?.fractura ? { ...d.fractura } : null; st.intox = d?.intox ?? 0; emitir(); },
  };
}
