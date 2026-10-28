// NÚCLEO DE FAMILIAS — paletas, escala de textura, ensamblado de la entrada de SPECIES + DETALLE + COSECHA y relaciones ecológicas.
// Cada familia (bípedos, cuadrúpedos, pterosaurios…) solo aporta la GEOMETRÍA y sus proporciones; el comportamiento biológico se deriva de
// roles.js y nucleo-medidas.js (una sola fuente de reglas, ver docs/ESPECIES_FAMILIAS.md).
import { POR_ID } from '../catalogo.js';
import { PRESETS } from '../skin.js';
import { ROLES } from './roles.js';
import { clamp, hash32, rng32, vidaDe, hambreTasa, cosechaDe, dropsDe, sentidosDe } from './nucleo-medidas.js';
export { clamp, hash32, rng32 };

// ---------------------------------------------------------------------------------------------------------------- color
// Paletas base por hábitat. El color real de casi todas las especies se desconoce (solo unas pocas tienen melanosomas fósiles): son hipótesis de camuflaje.
const BASES = {
  arido: { dorso: [0.55, 0.42, 0.26], vientre: [0.86, 0.78, 0.6] }, bosque: { dorso: [0.36, 0.34, 0.2], vientre: [0.7, 0.64, 0.46] },
  selva: { dorso: [0.24, 0.38, 0.17], vientre: [0.7, 0.72, 0.45] }, llanura: { dorso: [0.5, 0.38, 0.2], vientre: [0.82, 0.72, 0.5] },
  costa: { dorso: [0.34, 0.4, 0.4], vientre: [0.78, 0.8, 0.7] }, frio: { dorso: [0.38, 0.4, 0.42], vientre: [0.82, 0.83, 0.8] },
  oscuro: { dorso: [0.1, 0.12, 0.16], vientre: [0.3, 0.3, 0.34] }, rojizo: { dorso: [0.46, 0.24, 0.12], vientre: [0.8, 0.62, 0.42] },
  gris: { dorso: [0.36, 0.34, 0.31], vientre: [0.66, 0.62, 0.55] }, pantano: { dorso: [0.26, 0.3, 0.2], vientre: [0.62, 0.62, 0.44] },
  rocoso: { dorso: [0.42, 0.33, 0.27], vientre: [0.7, 0.6, 0.48] }, mar: { dorso: [0.2, 0.3, 0.38], vientre: [0.8, 0.84, 0.82] },
};
const jit = (c, r, k) => c.map((v) => clamp(v * (1 + (r() - 0.5) * 2 * k), 0.02, 1));

/** Paleta determinista de una especie: base de hábitat + variación por id + rasgos (raya/manchas/cresta/cuerno…). */
export function paleta(id, estilo = 'bosque', extra = {}) {
  const r = rng32(hash32(id)), B = BASES[estilo] ?? BASES.bosque;
  const pal = { dorso: jit(B.dorso, r, 0.14), vientre: jit(B.vientre, r, 0.08), ojo: [0.9, 0.65, 0.1], aoY: 0.5 };
  pal.cresta = pal.dorso.map((v) => v * 0.95); pal.cresta1 = pal.vientre.map((v) => v * 0.85); // plumas, velas y membranas: tono del cuerpo por defecto
  if (extra.raya === true) pal.raya = { freq: 4 + r() * 10, warp: 2 + r() * 4, th: 0.5 + r() * 0.15, color: pal.dorso.map((v) => v * 0.35), amp: 0.6 };
  else if (extra.raya) pal.raya = { freq: 8, warp: 4, th: 0.58, color: pal.dorso.map((v) => v * 0.35), amp: 0.6, ...extra.raya };
  if (extra.manchas) pal.manchas = extra.manchas === true ? pal.dorso.map((v) => v * 0.55) : extra.manchas;
  const { raya, manchas, ...resto } = extra; void raya; void manchas;
  return { ...pal, ...resto };
}

/** Densidad de textura de piel (repeticiones por metro de malla) según tamaño: la escama no crece como el animal. */
export function uvKde(skin, L) {
  const P = PRESETS[skin] ?? PRESETS.raptor;
  const celda = clamp(0.036 * Math.pow(L / 3.5, 0.6), 0.006, 0.12) * (skin === 'plumon' || skin === 'pelo' ? 0.5 : 1);
  return 1 / ((256 / P.cell) * celda);
}

// ---------------------------------------------------------------------------------------------------------------- ensamblado
/**
 * Convierte una geometría de familia en una especie jugable. `g`: { build(pal), hit, vel, cycle, stance, step, hips, radius, anim, skin, L, masa, scale?, pal, montura? }.
 * `e`: datos de ecología de la tabla: { rol, nota, vul, inter, lic, conf, extra:{…} }. Devuelve { sp, det, cos }.
 */
// Tipo de voz y tono de una especie (ver las recetas `voz_*` de audio/synth.js): sale de la anatomía/rol y la masa; más masa = más grave.
const VOCES = { // tipo → [masa de referencia (kg) con tono 1, tono mínimo, tono máximo]
  colosal: [20000, 0.8, 1.7], bramido: [2500, 0.7, 1.6], rugido: [6000, 0.75, 1.5], rugido_agudo: [120, 0.8, 1.5], gruñido: [3000, 0.7, 1.7],
  trompeta: [3000, 0.75, 1.7], graznido: [150, 0.8, 1.6], chillido: [5, 0.8, 1.8], chirrido: [20, 0.8, 1.8], siseo: [3000, 0.7, 1.7], bufido: [8000, 0.75, 1.5],
};
export function vozDe(tipoRol, anim, masa, forzado = null) {
  let tipo = forzado;
  if (!tipo) {
    if (anim === 'braquio') tipo = 'colosal'; else if (anim === 'tricera') tipo = 'bramido'; else if (anim === 'hadrosaurio') tipo = 'trompeta';
    else if (anim === 'estegosaurio' || anim === 'anquilosaurio') tipo = 'gruñido'; else if (anim === 'ornitomimo') tipo = 'graznido'; else if (anim === 'ptera') tipo = 'chirrido';
    else if (tipoRol === 'depredador') tipo = masa > 600 ? 'rugido' : masa > 40 ? 'rugido_agudo' : 'chillido';
    else tipo = masa > 3000 ? 'colosal' : masa > 600 ? 'bramido' : masa > 60 ? 'graznido' : 'chillido';
  }
  const [ref, lo, hi] = VOCES[tipo];
  return { tipo, tono: +clamp(Math.pow(ref / Math.max(1, masa), 0.2), lo, hi).toFixed(3), alt: tipo === 'gruñido' && anim === 'anquilosaurio' };
}

export function ensamblar(id, g, e) {
  const fila = POR_ID[id];
  if (!fila) throw new Error(`Especie fuera del catálogo: ${id}`);
  const rol = ROLES[e.rol];
  if (!rol) throw new Error(`Rol desconocido (${e.rol}) en ${id}`);
  const L = fila.tamano, masa = fila.masa;
  const m = { id, L, masa, fila, g, e };
  const blind = e.blindaje ?? rol.blindaje ?? 1;
  const sentidos = sentidosDe(rol, L);
  const cos = cosechaDe(masa, { ...(rol.cos ? rol.cos(m) : {}), ...(e.cos ?? {}) });
  const peligro = e.peligro ?? rol.peligro(m);
  const ai = { ...rol.ai(m), ...(e.ai ?? {}) };
  const hab = [...new Set([...(rol.hab ?? []), ...(e.hab ?? [])].filter((h) => !(e.sinHab ?? []).includes(h)))];
  const habParams = { ...(rol.habParams ? rol.habParams(m) : {}), ...(e.habParams ?? {}) };
  const dom = e.doma === false ? { max: 0, nota: 'No se puede habituar ni manejar con los medios del juego.', comida: {}, hab: { seg: 1 }, ofrendas: 1 } : { ...rol.doma(m), ...(e.doma ?? {}) };
  const montura = e.montura === undefined ? (rol.montura ? rol.montura(m) : false) : e.montura;
  const det = {
    temperamento: e.temperamento ?? rol.temperamento, social: e.social ?? rol.social(m), ciclo: e.ciclo ?? rol.ciclo,
    sentidos, energia: { ...rol.energia(m), ...(e.energia ?? {}) }, hambre: { tasa: hambreTasa(masa), caza: rol.cazaUmbral ?? 1, ...(e.hambre ?? {}) },
    caza: e.caza ?? [], teme: e.teme ?? [], peligro, habilidades: hab, habParams,
    vulnerabilidades: e.vul ?? rol.vul, interacciones: [rol.inter(m), e.nota].filter(Boolean).join(' '),
    cosecha: dropsDe(cos), doma: dom, montura,
    reproduccion: 'no implementada', confianza: { anatomia: fila.confianza === 'alta' ? 'alta' : fila.confianza === 'media' ? 'media' : 'baja', comportamiento: e.conf ?? (fila.confianza === 'alta' ? 'media' : 'baja') },
    licencia: [e.lic, `Reconstrucción procedural a partir de proporciones de la literatura (${fila.confianza === 'ficcion' ? 'ficción' : `confianza ${fila.confianza}`}); color y conducta son hipótesis salvo lo indicado.`].filter(Boolean).join(' '),
    vigia: !!rol.vigia, coordinada: !!rol.coordinada,
  };
  if (rol.tipo === 'depredador' && !det.hambre.caza) det.hambre.caza = 0.45;
  const sk = g.skin;
  const sp = {
    id, nombre: fila.nombre, skin: sk, uvK: g.uvK ?? uvKde(sk, L), tono: 1, scale: g.scale ?? Math.min(1, L / 3.5), tipo: rol.tipo, vidaMax: e.vida ?? vidaDe(masa, blind),
    pal: g.pal, build() { return g.build(this.pal); }, roughness: g.roughness ?? 0.8, hips: g.hips, hit: g.hit, vel: g.vel, cycle: g.cycle, stance: g.stance ?? 0.6, step: g.step, radius: g.radius,
    ai, rugido: clamp(0.25 + 0.04 * L, 0.25, 0.6), familia: g.familia ?? null, voz: e.voz === 'ninguna' ? null : vozDe(rol.tipo, g.anim, masa, e.voz),
  };
  if (g.anim) sp.anim = g.anim;
  if (g.ondula && g.ondula !== 1) sp.ondula = g.ondula; // ondulación lateral extra del cuerpo al andar (cocodrilos)
  if (g.nada) sp.nada = g.nada; // animal acuático (ver fauna/nado.js)
  if (g.doble) sp.doble = true; // láminas finas (membranas, velas): se dibujan por las dos caras
  return { sp, det, cos };
}

// ---------------------------------------------------------------------------------------------------------------- relaciones ecológicas
const esDepredador = (d) => d.__rol === 'depredador';

/**
 * Rellena `caza` y `teme` de todas las especies según el ecosistema (mismo ecosistema primero) y la proporción de masas.
 * `todos`: Map id → { det, masa, eco, tipo, peligro, manada }. Los depredadores cazan presas de un décimo a la mitad de su masa (manadas: hasta ×2).
 */
export function resolverRelaciones(todos) {
  const lista = [...todos.entries()];
  const mismoEco = (a, b) => a.eco === b.eco || a.eco === 'isla_ficcion' || b.eco === 'isla_ficcion';
  for (const [id, p] of lista) {
    if (p.tipo !== 'depredador' || p.sinCaza) continue;
    const cand = [];
    for (const [oid, o] of lista) {
      if (oid === id || o.tipo === 'depredador' || o.acuatico !== p.acuatico && !p.anfibio || o.volador) continue;
      const r = o.masa / p.masa;
      const ideal = p.manada ? 0.3 : 0.1, max = p.manada ? 2 : 0.7, min = p.masa > 1500 ? 0.004 : 0.0004;
      if (r > max || r < min) continue;
      if (o.defensivo && r > 0.25 && !p.manada) continue; // blindados y con cuernos: demasiado riesgo para un solitario
      const sc = (o.eco === p.eco ? 0 : mismoEco(o, p) ? 2 : 5) + Math.abs(Math.log10(r / ideal));
      cand.push([sc, oid]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const nuevo = cand.slice(0, 14).map((c) => c[1]);
    p.det.caza = [...new Set([...(p.det.caza ?? []), ...nuevo])];
  }
  for (const [id, h] of lista) {
    if (h.tipo === 'depredador') continue;
    const t = [];
    for (const [pid, p] of lista) {
      if (pid === id || p.tipo !== 'depredador' || !p.det.caza.includes(id)) continue;
      t.push([p.eco === h.eco ? 0 : 1, pid]);
    }
    t.sort((a, b) => a[0] - b[0]);
    h.det.teme = [...new Set([...(h.det.teme ?? []), ...t.slice(0, 12).map((x) => x[1])])];
  }
  void esDepredador;
}
