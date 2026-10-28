// MEDIDAS BIOLÓGICAS — funciones puras de escala (vida, daño, hambre, cosecha, sentidos) y utilidades numéricas compartidas por roles y familias.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------------------------- biología por tamaño
export const vidaDe = (masa, blindaje = 1) => Math.round(clamp(22 * Math.pow(masa, 0.34) * blindaje, 8, 1100));
export const danoDe = (masa) => Math.round(clamp(3.2 * Math.pow(masa, 0.28), 3, 44));
export const cdDe = (masa) => +clamp(1.2 + 0.17 * Math.pow(masa, 0.25), 1.2, 3.2).toFixed(2);
export const peligroDepredador = (masa) => +clamp(0.036 + 0.247 * Math.log10(Math.max(1, masa)), 0.05, 1).toFixed(2);
export const hambreTasa = (masa) => +clamp(0.2 * Math.pow(masa, -0.2), 0.03, 0.1).toFixed(3);

/** Cosecha de un cadáver: [item, [min,max], herramienta|null, prob]. Cantidad de carne ∝ masa^0.38; el resto sigue la anatomía de la especie. */
export function cosechaDe(masa, rasgos = {}) {
  const c = Math.max(1, 0.55 * Math.pow(masa, 0.38));
  const rng = (m, a = 0.8, b = 1.2) => [Math.max(1, Math.floor(m * a)), Math.max(1, Math.ceil(m * b))];
  const t = [['carne_cruda', rng(c), null, 1], ['cuero', rng(c * 0.45), 'corta', masa < 10 ? 0.7 : 1], ['hueso', rng(c * 0.5), 'corta', masa < 10 ? 0.8 : 1]];
  if (masa > 150 && !rasgos.sinGrasa) t.push(['grasa', rng(c * 0.18, 0.5, 1.2), 'corta', 1]);
  if (masa > 60) t.push(['tendon', rng(c * 0.16, 0.5, 1.3), 'corta', masa < 300 ? 0.5 : 1]);
  if (rasgos.pluma) t.push(['pluma', rng(rasgos.pluma, 0.6, 1.4), 'corta', 0.9]);
  if (rasgos.diente) t.push(['diente', [1, Math.max(2, Math.round(rasgos.diente))], 'corta', 0.7]);
  if (rasgos.cuerno) t.push(['cuerno', [1, Math.max(1, Math.round(rasgos.cuerno))], 'talar', 0.9]);
  if (rasgos.osteodermo) t.push(['osteodermo', rng(rasgos.osteodermo, 0.6, 1.2), 'talar', 1]);
  for (const [item, n, req, p] of rasgos.extra ?? []) t.push([item, n, req, p ?? 1]);
  return t;
}
/** Versión resumida [item, cantidad media] (campo `drops` de la especie). */
export const dropsDe = (cos) => cos.map(([item, n]) => [item, Math.max(1, Math.round((n[0] + n[1]) / 2))]);

/** Sentidos: alcance (m) ∝ L^0.3. `rol.sent` da los coeficientes. */
export function sentidosDe(rol, L) {
  const k = Math.pow(Math.max(0.3, L), 0.3), s = rol.sent;
  return { vista: Math.round(s.vista * k), fov: s.fov, oido: Math.round(s.oido * k), olfato: Math.round(s.olfato * k) };
}

