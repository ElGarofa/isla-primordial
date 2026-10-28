// El clima sobre el jugador. MOJADO (0–100) sube con la lluvia y al meterse en el agua, y se seca solo: despacio al aire, deprisa
// junto al fuego. Bajo un techo construido (refugio, F3: tejados) no llueve; bajo un árbol, la mitad. Estar mojado da frío
// (hasta −8 °C sentidos) y la capa impermeable lo frena. La tormenta además enfría con el viento si no hay techo.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const CLIMA = {
  mojaLluvia: 6, // puntos/s con lluvia 1 y sin techo
  mojaAgua: 40, // puntos/s dentro del agua
  secaAire: 0.35, secaSol: 0.6, secaFuego: 5, // puntos/s
  frioMojado: 8, // °C a 100 de mojado
  vientoTormenta: 3, // °C con tormenta 1 sin techo
  arbol: 0.55, // cobertura bajo la copa de un árbol
  impermeable: 0.25, // la capa impermeable deja pasar este tanto
};

export function crearClima(ctx, S) {
  const st = { techo: 0, chequeo: 0, aviso: false };
  const tmp = [];

  /** Cobertura (0..1) sobre un punto: techo construido = 1, bajo un árbol = 0,55. */
  function cobertura(p = ctx.player.position) {
    const t = ctx.construccion?.techoEn?.(p.x, p.z, p.y) ?? 0;
    if (t >= 1) return 1;
    for (const c of ctx.world.colliders.query(p.x, p.z, 2.4, tmp)) if (c.kind === 'arbol') return Math.max(t, CLIMA.arbol);
    return t;
  }

  /** dt real (el mojado es inmediato: no se acelera con el sueño salvo la parte de secarse). Devuelve los °C que resta. */
  function tick(dt, { calor = 0, impermeable = false } = {}) {
    const s = S.stats, w = ctx.time.weather, p = ctx.player;
    st.chequeo -= dt; if (st.chequeo <= 0) { st.chequeo = 0.3; st.techo = cobertura(); }
    const lluvia = (w.rain ?? 0) * (1 - st.techo) * (impermeable ? CLIMA.impermeable : 1);
    if (p.inWater || p.swimming) s.mojado = clamp((s.mojado ?? 0) + dt * CLIMA.mojaAgua, 0, 100);
    else if (lluvia > 0.03) s.mojado = clamp((s.mojado ?? 0) + dt * lluvia * CLIMA.mojaLluvia, 0, 100);
    else {
      const g = dt * (ctx.time.escala ?? 1), sol = (1 - ctx.time.nightFactor) * (1 - (w.cloudCover ?? 0) * 0.6);
      s.mojado = clamp((s.mojado ?? 0) - g * (CLIMA.secaAire + sol * CLIMA.secaSol + calor * CLIMA.secaFuego), 0, 100);
    }
    if (s.mojado > 60 && !st.aviso) { st.aviso = true; ctx.ui?.notify?.('Estás empapado: busca techo o un fuego', 'warn'); }
    if (s.mojado < 30) st.aviso = false;
    return (s.mojado / 100) * CLIMA.frioMojado + (w.storm ?? 0) * CLIMA.vientoTormenta * (1 - st.techo * 0.8);
  }

  function estados() {
    const out = [], m = S.stats.mojado ?? 0, w = ctx.time.weather;
    if (m > 12) out.push({ id: 'mojado', nivel: m > 60 ? 2 : 1, texto: m > 60 ? 'Empapado' : 'Mojado', ayuda: 'sécate junto al fuego' });
    if (st.techo > 0.5 && (w.rain ?? 0) > 0.08) out.push({ id: 'refugio', nivel: 1, texto: st.techo >= 1 ? 'A cubierto' : 'Bajo el árbol', ayuda: st.techo >= 1 ? 'aquí no llueve' : 'te mojas menos' });
    return out;
  }

  return { CLIMA, tick, cobertura, estados, get techo() { return st.techo; } };
}
