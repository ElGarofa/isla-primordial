// Conservación de la comida. Cada casilla de un objeto perecedero (ITEMS[id].pudre = segundos de juego hasta pudrirse) lleva su
// frescura `fr` (1 = recién conseguida, 0 = podrida). Baja con el tiempo de juego (ctx.time.escala: también mientras se duerme), más
// despacio dentro de una vasija; al apilar se promedia por cantidad (survival/index.js); a 0 la casilla pasa a «restos podridos».
// Comer algo pasado alimenta menos y puede intoxicar (survival/heridas.js).
import { ITEMS } from '../core/items.js';

export const FRESCURA = {
  pasada: 0.6, // por debajo: alimenta un 80 %
  podrida: 0.25, // por debajo: alimenta la mitad y puede intoxicar
  probIntox: 0.45, // al comer algo casi podrido
  probIntoxCruda: 0.12, // al comer carne cruda aunque esté fresca
  cada: 1, // s de juego entre pasadas (el deterioro es lento: no hace falta cada cuadro)
};

export const estadoFrescura = (fr) => (fr == null ? null : fr >= FRESCURA.pasada ? 'Fresca' : fr >= FRESCURA.podrida ? 'Pasada' : 'Casi podrida');
export const perecedero = (id) => !!ITEMS[id]?.pudre;

export function crearFrescura(ctx, S) {
  let acc = 0;
  const nombre = (id) => ITEMS[id]?.nombre ?? id;

  /** Avanza `g` segundos de juego sobre una lista de casillas; `conserva` multiplica el deterioro. Devuelve las que se pudrieron. */
  function avanzar(casillas, g, conserva = 1) {
    const podridas = [];
    for (let i = 0; i < casillas.length; i++) {
      const s = casillas[i]; if (!s) continue;
      const vida = ITEMS[s.item]?.pudre; if (!vida) continue;
      s.fr = (s.fr ?? 1) - (g * conserva) / vida;
      if (s.fr <= 0) { podridas.push({ item: s.item, cantidad: s.cantidad }); casillas[i] = { item: 'podredumbre', cantidad: s.cantidad }; }
    }
    return podridas;
  }

  function tick(dt) {
    acc += dt * (ctx.time.escala ?? 1); // tiempo de juego acumulado; se procesa cada segundo de juego
    if (acc < FRESCURA.cada) return;
    const g = acc; acc = 0;
    const enMochila = avanzar(S.slots, g, 1);
    for (const p of ctx.construccion?.contenedores?.() ?? []) {
      const pud = avanzar(p.cont.casillas, g, p.cont.conserva ?? 1);
      if (pud.length) ctx.events.emit('contenedor:cambio', { pieza: p });
    }
    if (enMochila.length) {
      for (const d of enMochila) ctx.ui?.notify?.(`Se pudrió: ${nombre(d.item)} ×${d.cantidad}`, 'warn');
      ctx.events.emit('inventory:changed', {});
      ctx.events.emit('comida:podrida', { items: enMochila });
    }
  }

  /** Al comer: cuánto alimenta (multiplicador) y si intoxica. */
  function alComer(s) {
    const it = ITEMS[s.item], fr = s.fr ?? 1;
    let mult = 1, intox = 0;
    if (it.pudre) {
      if (fr < FRESCURA.podrida) { mult = 0.5; if (Math.random() < FRESCURA.probIntox) intox = 2; }
      else if (fr < FRESCURA.pasada) mult = 0.8;
    }
    if (s.item === 'carne_cruda' && !intox && Math.random() < FRESCURA.probIntoxCruda) intox = 1;
    return { mult, intox, fr };
  }

  return { tick, avanzar, alComer, estado: estadoFrescura };
}
