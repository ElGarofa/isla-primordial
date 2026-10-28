// ESFERAS DE IMPACTO — utilidades compartidas por los generadores de familias (bípedos, cuadrúpedos…).
// `sp.hit` es una lista de esferas [x, y, z, r] en metros (locales a la criatura, +z = adelante); la PRIMERA es el centro del cuerpo.
// En vez de unas pocas esferas sueltas, se reparten a lo largo de cada tramo (tronco, cuello, cola, patas…) con un solape suficiente para que
// las puntas largas (cola, cuello) y las patas también reciban el golpe y el "cadáver" ofrezca su punto de despiece más cercano.

const { hypot, ceil, max, min } = Math;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Crea un acumulador de esferas. `tramo(a, b, ra, rb, maxN)` añade entre 1 y `maxN` esferas a lo largo del segmento a→b ([x,y,z]) con radio
 * interpolado de ra a rb (un 20 % holgado). El espaciado es ≈ 1,9 radios, así que las esferas contiguas se solapan.
 */
export function crearHit() {
  const hit = [];
  const tramo = (a, b, ra, rb, maxN = 3) => {
    const len = hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), rm = max(0.05, (ra + rb) / 2);
    const n = min(maxN, max(1, ceil(len / (1.9 * rm))));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      hit.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), max(0.1, lerp(ra, rb, f) * 1.2)]);
    }
  };
  return { hit, tramo };
}

/** Recorre una cadena de articulaciones (nombres en `J`) con radios `r0`→`r1` repartidos linealmente por la longitud de la cadena. */
export function cadena(tramo, J, nombres, r0, r1, maxN = 3) {
  for (let i = 0; i < nombres.length - 1; i++) {
    const f0 = i / (nombres.length - 1), f1 = (i + 1) / (nombres.length - 1);
    tramo(J[nombres[i]], J[nombres[i + 1]], max(0.08, lerp(r0, r1, f0)), max(0.08, lerp(r0, r1, f1)), maxN);
  }
}
