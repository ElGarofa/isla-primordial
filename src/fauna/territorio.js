// TERRITORIO de una criatura salvaje: la provincia (o la zona de mar) a la que pertenece. Las especies de épocas distintas no se mezclan porque ningún animal
// salvaje cruza el límite de su territorio (los animales propios y los que monta el jugador quedan exentos).
//   TIERRA   → camina solo por tierra de su provincia
//   AIRE     → vuela dentro del disco de su provincia (+12 %)
//   MAR      → nada solo en su zona de mar
//   AIRE_MAR → vuela dentro del disco de su mar
import { PROVINCIAS, MARES } from '../world/provincias.js';

export const TERR = { TIERRA: 0, AIRE: 1, MAR: 2, AIRE_MAR: 3 };

/** ¿(x, z) está dentro del territorio `t` ({ k, i })? */
export function dentro(world, t, x, z) {
  switch (t.k) {
    case TERR.TIERRA: return world.provinceIdx(x, z) === t.i;
    case TERR.MAR: return world.seaIdx(x, z) === t.i;
    case TERR.AIRE: { const p = PROVINCIAS[t.i]; return Math.hypot(x - p.centro[0], z - p.centro[1]) < p.radio * 1.12; }
    case TERR.AIRE_MAR: { const m = MARES[t.i]; return Math.hypot(x - m.centro[0], z - m.centro[1]) < m.radio; }
    default: return true;
  }
}

/** Nombre legible del territorio (depuración y pruebas). */
export function nombreTerritorio(t) {
  if (!t) return '—';
  return (t.k === TERR.TIERRA || t.k === TERR.AIRE ? PROVINCIAS[t.i] : MARES[t.i])?.nombre ?? '?';
}
