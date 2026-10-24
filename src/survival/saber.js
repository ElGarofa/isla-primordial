// SISTEMA DE APRENDIZAJE: qué recetas conoce el jugador, experiencia por oficio y calidad de lo fabricado.
// Lógica pura (sin DOM ni Three.js): la usa survival/index.js y se prueba en Node.
import { RECIPES, HABILIDADES, nivelDeXp } from '../core/items.js';

/** Calidad (0 tosca … 3 excelente) según el oficio del fabricante frente al nivel que pide la receta. */
export function tirarCalidad(nivelOficio, nivelReceta, rnd = Math.random) {
  const diff = nivelOficio - nivelReceta;
  const score = diff * 0.9 + rnd() * 2 - 0.3;
  return Math.max(0, Math.min(3, Math.round(score)));
}

export function createSaber() {
  const conocidas = new Set();
  const vistos = new Set();        // objetos que ya tuvo en la mochila
  const despiezados = new Set();   // especies despiezadas al menos una vez
  const fabricados = new Set();    // productos fabricados al menos una vez
  const xp = Object.fromEntries(Object.keys(HABILIDADES).map((k) => [k, 0]));

  const nivel = (hab) => nivelDeXp(xp[hab] ?? 0);

  function cumple(r) {
    const a = r.aprende;
    if (a === 'inicio') return true;
    if (a.tiene) return vistos.has(a.tiene);
    if (a.despiece) return despiezados.has(a.despiece);
    if (a.receta) return fabricados.has(a.receta);
    if (a.nivel) return nivel(a.nivel[0]) >= a.nivel[1];
    return false;
  }

  /** Revisa todas las recetas y devuelve las recién aprendidas. */
  function evaluar() {
    const nuevas = [];
    for (const r of RECIPES) if (!conocidas.has(r.clave) && cumple(r)) { conocidas.add(r.clave); nuevas.push(r); }
    return nuevas;
  }

  const api = {
    conocidas, xp, vistos, despiezados, fabricados,
    nivel,
    conoce: (clave) => conocidas.has(clave),
    /** Anota que el jugador tiene un objeto (descubre recetas que lo usan). */
    verItem(item) { if (vistos.has(item)) return []; vistos.add(item); return evaluar(); },
    despiece(especie) { if (despiezados.has(especie)) return []; despiezados.add(especie); return evaluar(); },
    fabricar(producto) { const era = fabricados.has(producto); fabricados.add(producto); return era ? [] : evaluar(); },
    /** Suma experiencia; devuelve { subio, nivel, nuevas } */
    ganar(hab, n) {
      if (!(hab in xp) || n <= 0) return { subio: false, nivel: nivel(hab), nuevas: [] };
      const antes = nivel(hab); xp[hab] += n; const ahora = nivel(hab);
      return { subio: ahora > antes, nivel: ahora, nuevas: ahora > antes ? evaluar() : [] };
    },
    evaluar,
    reset() { conocidas.clear(); vistos.clear(); despiezados.clear(); fabricados.clear(); for (const k of Object.keys(xp)) xp[k] = 0; evaluar(); },
    serialize() { return { conocidas: [...conocidas], vistos: [...vistos], despiezados: [...despiezados], fabricados: [...fabricados], xp: { ...xp } }; },
    restore(d) {
      conocidas.clear(); vistos.clear(); despiezados.clear(); fabricados.clear();
      for (const k of Object.keys(xp)) xp[k] = 0;
      if (d) {
        d.vistos?.forEach((x) => vistos.add(x)); d.despiezados?.forEach((x) => despiezados.add(x)); d.fabricados?.forEach((x) => fabricados.add(x));
        for (const [k, v] of Object.entries(d.xp ?? {})) if (k in xp) xp[k] = v;
        d.conocidas?.forEach((x) => { if (RECIPES.some((r) => r.clave === x)) conocidas.add(x); });
      }
      evaluar();
    },
  };
  api.reset();
  return api;
}
