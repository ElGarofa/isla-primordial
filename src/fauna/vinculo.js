// VÍNCULO: relación entre el jugador y una criatura en seis niveles. Todo lo que ocurre aquí pasa por la IA real de la fauna
// (cerebro.js / sentidos.js): no hay estados falsos ni porcentajes mágicos.
//
//   1 Salvaje         no se ha hecho nada
//   2 Alertado        (derivado) te ha detectado y está en alerta o huyendo
//   3 Habituado       toleró tu presencia tranquila durante el tiempo que pide su especie (rel.hab ≥ 1). NO es domesticación
//   4 Bajo manejo     confía en ti (ofrendas del alimento correcto) y acepta un cabestro/collar (rel.manejo)
//   5 Domesticado     cuidado correcto durante varios días de juego (rel.dom)
//   6 Equipado        domesticado y con silla, alforjas o coraza, solo si su anatomía lo permite (catalogo.js → montura)
//
// Cada especie declara en catalogo.js hasta qué nivel puede llegar (doma.max), qué come, cuánto tarda, qué equipo admite…
// Los grandes depredadores no pasan del nivel 3 y, habituados, siguen cazando cuando tienen hambre.

import * as THREE from 'three';
import { ITEMS, RANURAS_ANIMAL } from '../core/items.js';
import { CONFIG } from '../core/config.js';

const DIA = CONFIG.time.dayLengthSec;

export const NIVEL_NOMBRE = ['', 'Salvaje', 'Alertado', 'Habituado', 'Bajo manejo', 'Domesticado', 'Equipado'];
export const NIVEL_DESC = [
  '',
  'No te conoce: te trata como a cualquier intruso.',
  'Te ha detectado y está en alerta o huyendo.',
  'Tolera tu presencia tranquila. Habituación no es domesticación: sigue siendo un animal salvaje.',
  'Confía en ti y lleva cabestro: puede seguirte o quedarse donde se lo pidas.',
  'Domesticado tras varios días de cuidado: ya no te teme y puede llevar equipo.',
  'Domesticado y equipado para transporte o trabajo.',
];
export const CALMA = new Set(['idle', 'graze', 'wander', 'rest', 'feed', 'follow']);
const ORDENES = ['libre', 'seguir', 'quedarse'];
export const ORDEN_NOMBRE = { libre: 'Libre', seguir: 'Seguir', quedarse: 'Quedarse' };

export const dias = (s) => s / DIA;

/** Datos de relación de una criatura (null si la especie no admite ningún trato). */
export function crearRel(c) {
  const d = c.sp.doma;
  if (!d || d.max <= 0) return null;
  return {
    hab: 0, conf: 0, ofrecidas: 0, manejo: false, dom: false, cuid: 0, orden: 'libre', nombre: null, hogar: null,
    equipo: { cabeza: null, lomo: null, carga: null, proteccion: null }, almacen: [],
    cdOfrece: 0, estres: 0, ayuno: 0, contacto: -1e9,
  };
}

export const esPropio = (c) => !!(c.rel && (c.rel.manejo || c.rel.dom));

export function nivelDe(c) {
  const r = c.rel, max = c.sp.doma?.max ?? 1;
  if (!r) return 1;
  let n = 1;
  if (r.hab >= 1) n = 3;
  if (r.manejo && max >= 4) n = 4;
  if (r.dom && max >= 5) n = 5;
  if (n === 5 && max >= 6 && c.sp.montura && (r.equipo.lomo || r.equipo.carga || r.equipo.proteccion)) n = 6;
  if (n < 3 && (c.state === 'alert' || c.state === 'flee') && c.amenaza?.jugador && c.ctx.time.elapsed - c.amenaza.t < 6) n = 2;
  return n;
}
export function nivelBase(c) { const r = c.rel; if (!r) return 1; return r.dom ? 5 : r.manejo ? 4 : r.hab >= 1 ? 3 : 1; }

/**
 * Cuánto asusta el jugador a esta criatura: 1 = salvaje, 0 = nada (propio), valores intermedios mientras se habitúa.
 * Multiplica las distancias de huida, defensa de territorio y vigilancia.
 */
export function trato(c) {
  const r = c.rel;
  if (!r) return 1;
  const pl = c.ctx.player;
  if (r.manejo || r.dom) return c.provocado > 0 ? 1 : 0;
  const hab = Math.min(1, r.hab);
  const brusco = pl.sprinting || (pl.ruidoExtra ?? 0) > 0.5 || c.provocado > 0;
  if (hab >= 1) return brusco ? 0.6 : 0.05;
  const h = (hab - 0.03) / 0.97; // los primeros instantes de calma no cambian nada: un animal salvaje sigue huyendo a su distancia habitual
  if (h <= 0) return 1;
  return 1 - 0.95 * Math.sqrt(h) * (brusco ? 0.4 : 1); // después la tolerancia crece rápido: así la primera fase no exige una distancia exacta
}
/** ¿Un depredador habituado tiene todavía motivos para atacar al jugador? Solo el hambre o la provocación. */
export const depredadorHabituado = (c) => !!c.rel && c.rel.hab >= 1 && !esPropio(c);
/** Un depredador habituado y saciado no va tras el jugador (ni por rastro ni a la vista): solo el hambre o la provocación lo cambian. */
export const noCazaJugador = (c) => depredadorHabituado(c) && !(c.hambre >= (c.sp.hambre?.caza ?? 0.45) || c.provocado > 0);

// ------------------------------------------------------------------------------------------------------------------------------
// Percepción periódica (cada SENSE_DT): habituación, cansancio de la confianza, abandono
export function sentirRel(c, dtS, now, playing) {
  const r = c.rel;
  if (!r) return;
  const d = c.sp.doma, pl = c.ctx.player;
  if (esPropio(c)) {
    // el abandono (hambre prolongada) erosiona la confianza hasta perder el manejo
    if (c.hambre >= 0.95) r.ayuno += dtS; else r.ayuno = Math.max(0, r.ayuno - dtS * 2);
    if (r.ayuno > 150) { r.conf = Math.max(0, r.conf - dtS / 200); if (r.conf < 0.5) perderConfianza(c, 'abandono'); }
    return;
  }
  if (!playing) return;
  const calmo = CALMA.has(c.state) && !(c.amenaza && now - c.amenaza.t < 3) && c.provocado <= 0;
  const vel = Math.hypot(pl.velocity.x, pl.velocity.z);
  const quieto = !pl.sprinting && (pl.ruidoExtra ?? 0) < 0.25 && !pl.swimming && vel < 3.2 && !pl.montura;
  const sosegado = c.hambre < Math.min(0.9, (c.sp.hambre?.caza ?? 0.5) * 0.85 + (c.sp.ai.caza?.length ? 0 : 0.3));
  // la criatura te percibe pero no se alarma (si te acercas demasiado, la IA de huida/defensa lo impide y no hay ganancia)
  if (calmo && c.pConf > 0.05 && quieto && sosegado && c.pDist >= (d.hab.dMin ?? 0)) {
    if (r.hab < 1) {
      r.hab = Math.min(1, r.hab + dtS / d.hab.seg);
      if (r.hab >= 1) c.ctx.events.emit('fauna:habituada', { criatura: c, especie: c.especie, nombre: c.nombre });
    }
    r.contacto = now;
  } else if (c.pConf < 0.05 && now - r.contacto > 90 && r.hab > 0) {
    r.hab = Math.max(0, r.hab - dtS / (d.hab.seg * 6)); // sin contacto se olvida despacio
  }
  // un susto provocado por el jugador deshace parte de lo ganado
  // (solo si el jugador hizo algo: correr, hacer ruido o moverse hacia él; si el animal paseó hasta pegarse a un jugador quieto, se aparta sin castigo)
  const huyendo = c.state === 'flee' && c.amenaza?.jugador && now - c.amenaza.t < 3;
  const activo = pl.sprinting || (pl.ruidoExtra ?? 0) > 0.25 || vel > 1.5 || c.provocado > 0;
  if (huyendo && !r.susto) { r.susto = true; if (activo) r.hab = Math.max(0, r.hab - 0.25); } else if (!huyendo && c.state !== 'flee') r.susto = false; // una huida = un solo castigo
}

/** Cuidados (cada fotograma): el tiempo de doma solo corre mientras el animal está bien atendido y cerca. */
export function tickRel(c, dt) {
  const r = c.rel;
  if (!r) return;
  const ctx = c.ctx, d = c.sp.doma;
  r.cdOfrece = Math.max(0, r.cdOfrece - dt);
  r.estres = Math.max(0, r.estres - dt * 0.02);
  c.vinculo = nivelDe(c); // el aviso de vigía al jugador (habilidades.js) solo lo da quien ya es de confianza (≥ 4)
  if (!r.manejo || r.dom || d.max < 5 || !d.cuidado) return;
  const bien = c.hambre < 0.75 && c.hp / c.hpMax > 0.5 && (CALMA.has(c.state) || c.state === 'ride') && r.estres < 0.6
    && d.cuidado.biomas.includes(ctx.world.getBiome(c.position.x, c.position.z)) && c.distToPlayer() < 150;
  const tormenta = (ctx.time.weather?.storm ?? 0) > 0.5 && !ctx.survival?.nearFire?.(c.position, 12);
  if (tormenta) r.estres = Math.min(1, r.estres + dt * 0.04);
  if (bien && !tormenta) r.cuid += dt;
  if (r.cuid >= d.cuidado.dias * DIA) domesticar(c);
}

function domesticar(c) {
  const r = c.rel, ctx = c.ctx;
  r.dom = true; r.cuid = c.sp.doma.cuidado.dias * DIA; r.conf = 1;
  if (!r.nombre) r.nombre = c.nombre;
  const g = ctx.survival?.saber?.ganar?.('manejo', 12);
  if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'manejo', nombre: 'Manejo de animales', nivel: g.nivel });
  ctx.events.emit('fauna:domesticada', { criatura: c, especie: c.especie, nombre: r.nombre });
  ctx.ui?.notify?.(`${r.nombre} está domesticado`, 'ok');
}

// ------------------------------------------------------------------------------------------------------------------------------
// Consecuencias de maltratar o abandonar
/** El jugador (u otro) hirió a la criatura. */
export function golpeado(c, fuente) {
  const r = c.rel;
  if (!r) return;
  if (fuente === 'jugador') {
    r.hab = Math.max(0, r.hab - 0.6);
    if (esPropio(c)) { r.conf = Math.max(0, r.conf - 0.6); r.estres = Math.min(1, r.estres + 0.4); if (r.conf < 0.5) perderConfianza(c, 'maltrato'); }
    else r.conf = Math.max(0, r.conf - 0.5);
  }
}

/** Deja un objeto en el suelo junto al animal. */
function soltarItem(c, item, cantidad, extra = null) {
  const v = new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3);
  const pos = c.center.clone(); pos.y = Math.max(pos.y, c.ctx.world.getHeight(c.position.x, c.position.z) + 1);
  c.ctx.physics?.spawnProp?.('loot', pos, v, { item, cantidad, extra, noPickup: 1.2 });
}

/** Pierde un nivel: domesticado → bajo manejo → habituado. El cabestro se suelta y cae al suelo. */
export function perderConfianza(c, causa) {
  const r = c.rel, ctx = c.ctx;
  if (!r) return;
  if (c.jinete) ctx.montura?.desmontar?.(true);
  if (r.dom) { r.dom = false; r.cuid = 0; r.orden = r.orden === 'quedarse' ? 'quedarse' : 'libre'; }
  else if (r.manejo) {
    r.manejo = false; r.orden = 'libre'; r.hogar = null; r.conf = Math.min(r.conf, 0.4);
    // el cabestro se suelta y todo lo que llevaba encima se cae
    soltarCarga(c);
    for (const k of RANURAS_ANIMAL) if (r.equipo[k]) { const a = r.equipo[k]; r.equipo[k] = null; soltarItem(c, a.item, 1, { dur: a.dur, cal: a.cal, rep: a.rep }); }
  }
  ctx.events.emit('fauna:vinculo_perdido', { criatura: c, especie: c.especie, nombre: r.nombre ?? c.nombre, causa });
  ctx.ui?.notify?.(`${r.nombre ?? c.nombre} ya no confía en ti (${causa})`, 'warn');
}

function soltarCarga(c) {
  for (const s of c.rel.almacen.splice(0)) soltarItem(c, s.item, s.cantidad, s.extra);
}
/** Muerte de una criatura con vínculo: la carga queda en el suelo. */
export function murio(c) {
  const r = c.rel;
  if (!r) return;
  if (r.almacen.length) soltarCarga(c);
  if (esPropio(c)) { c.ctx.ui?.notify?.(`${r.nombre ?? c.nombre} ha muerto`, 'warn'); c.ctx.events.emit('fauna:vinculo_perdido', { criatura: c, especie: c.especie, nombre: r.nombre ?? c.nombre, causa: 'muerte' }); }
}

// ------------------------------------------------------------------------------------------------------------------------------
// Acciones del jugador
const mensaje = (c, txt, tipo = 'info') => c.ctx.ui?.notify?.(txt, tipo);
const nombreItem = (id) => ITEMS[id]?.nombre ?? id;
export const listaComida = (c) => Object.keys(c.sp.doma?.comida ?? {}).map((i) => nombreItem(i).toLowerCase()).join(', ');

/** Alimento que se ofrecería ahora: el objeto de la mano si es comestible; si no, el primero adecuado de la mochila. */
export function elegirAlimento(c) {
  const sv = c.ctx.survival, comida = c.sp.doma?.comida ?? {};
  if (!sv) return null;
  const sel = sv.slots[sv.selected]?.item;
  if (sel && (comida[sel] != null || ITEMS[sel]?.tipo === 'comida')) return sel;
  let best = null;
  for (const id of Object.keys(comida)) if (sv.inventory.count(id) > 0 && (!best || comida[id] > comida[best])) best = id;
  return best;
}

export function ofrecer(c, itemId) {
  const r = c.rel, ctx = c.ctx, d = c.sp.doma, sv = ctx.survival;
  if (!r || c.muerta) return { ok: false, motivo: 'Nada que ofrecer' };
  if (!itemId) { mensaje(c, `No llevas alimento adecuado. Come: ${listaComida(c)}`, 'warn'); return { ok: false, motivo: 'sin alimento' }; }
  if (!sv.inventory.has(itemId)) return { ok: false, motivo: 'no lo tienes' };
  if (r.hab < 1 && !esPropio(c)) { mensaje(c, 'Todavía no se deja acercar: sigue siendo un animal salvaje', 'warn'); return { ok: false, motivo: 'no habituado' }; }
  if (c.distToPlayer() > 7) { mensaje(c, 'Acércate más', 'warn'); return { ok: false, motivo: 'lejos' }; }
  if (!CALMA.has(c.state)) { mensaje(c, 'Está nervioso: espera a que se calme', 'warn'); return { ok: false, motivo: 'nervioso' }; }
  const val = d.comida[itemId];
  if (val == null) {
    r.conf = Math.max(0, r.conf - 0.04); r.estres = Math.min(1, r.estres + 0.1);
    mensaje(c, `${c.nombre} rechaza ${nombreItem(itemId).toLowerCase()}. Come: ${listaComida(c)}`, 'warn');
    return { ok: false, motivo: 'dieta', penaliza: true };
  }
  if (r.cdOfrece > 0) { mensaje(c, 'Acaba de comer: espera un poco', 'info'); return { ok: false, motivo: 'cooldown' }; }
  if (c.hambre < 0.25) { mensaje(c, `${c.nombre} no tiene hambre`, 'info'); return { ok: false, motivo: 'saciado' }; }
  sv.inventory.remove(itemId, 1);
  c.hambre = Math.max(0, c.hambre - val); r.cdOfrece = 20; r.ofrecidas++;
  const antes = r.conf;
  if (r.conf < 1) r.conf = Math.min(1, r.conf + 1 / d.ofrendas);
  if (c.state !== 'graze') c.setState('graze');
  c.jawAnim = 0.8;
  ctx.audio?.play?.('recoger', c.position, { v: 0.5 });
  const g = sv.saber?.ganar?.('manejo', 1);
  if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'manejo', nombre: 'Manejo de animales', nivel: g.nivel });
  ctx.events.emit('fauna:ofrenda', { criatura: c, item: itemId, conf: r.conf });
  if (antes < 1 && r.conf >= 1) mensaje(c, d.max >= 4 ? `${c.nombre} confía en ti: ya puedes ponerle ${nombreItem(d.manejo.equipo).toLowerCase()}` : `${c.nombre} confía en ti, pero esta especie no admite más trato`, 'ok');
  return { ok: true, conf: r.conf };
}

/** ¿Puede ponérsele ya el equipo de manejo? { ok, motivo } */
export function puedeManejo(c) {
  const r = c.rel, d = c.sp.doma, sv = c.ctx.survival;
  if (!r || d.max < 4 || !d.manejo) return { ok: false, motivo: 'Esta especie no admite manejo' };
  if (r.manejo) return { ok: false, motivo: 'Ya está bajo manejo' };
  if (r.hab < 1) return { ok: false, motivo: 'Todavía no está habituado' };
  if (r.conf < 1) return { ok: false, motivo: `Aún no confía lo bastante (ofrécele ${listaComida(c)})` };
  if (sv.saber.nivel('manejo') < d.manejo.nivel) return { ok: false, motivo: `Necesitas manejo de animales nivel ${d.manejo.nivel}` };
  if (!sv.inventory.has(d.manejo.equipo)) return { ok: false, motivo: `Necesitas ${nombreItem(d.manejo.equipo).toLowerCase()}` };
  if (!CALMA.has(c.state)) return { ok: false, motivo: 'Está nervioso' };
  if (c.distToPlayer() > 6) return { ok: false, motivo: 'Acércate más' };
  if (c.hambre > 0.9) return { ok: false, motivo: 'Está demasiado hambriento para dejarse manejar' };
  return { ok: true };
}
export function colocarManejo(c) {
  const ctx = c.ctx, sv = ctx.survival, r = c.rel, d = c.sp.doma, p = puedeManejo(c);
  if (!p.ok) { mensaje(c, p.motivo, 'warn'); return p; }
  const idx = sv.slots.findIndex((s) => s && s.item === d.manejo.equipo);
  const t = sv.inventory.tomar(idx, 1);
  r.equipo.cabeza = { item: t.item, ...(t.extra ?? {}) };
  r.manejo = true; r.orden = 'seguir'; r.hogar = null; r.cuid = 0;
  const g = sv.saber.ganar('manejo', 4);
  if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'manejo', nombre: 'Manejo de animales', nivel: g.nivel });
  ctx.events.emit('fauna:manejo', { criatura: c, especie: c.especie });
  mensaje(c, `${c.nombre} acepta el ${nombreItem(t.item).toLowerCase()}: te seguirá`, 'ok');
  if (d.max < 5) mensaje(c, 'Esta especie no llega a domesticarse del todo, pero te obedece', 'info');
  return { ok: true };
}

export function ordenar(c, orden) {
  const r = c.rel;
  if (!r?.manejo || !ORDENES.includes(orden)) return false;
  r.orden = orden;
  r.hogar = orden === 'quedarse' ? { x: c.position.x, z: c.position.z } : null;
  if (orden === 'libre' && c.state === 'follow') c.setState('idle');
  c.ctx.events.emit('fauna:orden', { criatura: c, orden });
  return true;
}
export function renombrar(c, txt) {
  const r = c.rel; if (!r || !esPropio(c)) return false;
  txt = String(txt ?? '').replace(/[<>&"]/g, '').trim().slice(0, 24);
  r.nombre = txt || null; return true;
}
export function liberar(c) {
  const r = c.rel; if (!r) return false;
  const ctx = c.ctx;
  if (c.jinete) ctx.montura?.desmontar?.(true);
  soltarCarga(c);
  for (const k of RANURAS_ANIMAL) if (r.equipo[k]) { const a = r.equipo[k]; r.equipo[k] = null; const extra = { dur: a.dur, cal: a.cal, rep: a.rep }; if (ctx.survival.inventory.add(a.item, 1, extra) > 0) soltarItem(c, a.item, 1, extra); } // si la mochila está llena, cae al suelo: no se pierde
  r.manejo = false; r.dom = false; r.cuid = 0; r.orden = 'libre'; r.hogar = null; r.conf = 0; r.hab = Math.min(r.hab, 0.5); r.nombre = null;
  ctx.events.emit('fauna:liberada', { criatura: c });
  return true;
}

// ------------------------------------------------------------------------------------------------------------------------------
// Equipo según la anatomía
export function puedeEquipar(c, itemId) {
  const r = c.rel, it = ITEMS[itemId], ap = it?.aparejo, sp = c.sp, m = sp.montura;
  if (!ap) return { ok: false, motivo: 'No es equipo para animales' };
  if (!r || !esPropio(c)) return { ok: false, motivo: 'Solo se equipa a un animal bajo tu manejo' };
  if (ap.ranura === 'cabeza') return { ok: false, motivo: 'El equipo de manejo se coloca ofreciéndole comida y pulsando E' };
  if (!r.dom) return { ok: false, motivo: 'Primero debe estar domesticado' };
  if (!m) return { ok: false, motivo: `La anatomía de ${sp.nombre.toLowerCase()} no admite equipo` };
  if (r.equipo[ap.ranura]) return { ok: false, motivo: 'Esa ranura ya está ocupada' };
  if (ap.ranura === 'lomo') {
    if (ap.monta && !(m.jinete && m.tipos.includes(ap.monta))) return { ok: false, motivo: `${sp.nombre} no admite montura ${ap.monta}` };
    if (!ap.monta && !m.arnes) return { ok: false, motivo: 'No admite arnés' };
  }
  if (ap.ranura === 'carga') {
    if (!r.equipo.lomo) return { ok: false, motivo: 'Las bolsas se sujetan a un arnés o montura' };
    if (!m.carga || !m.carga.items.includes(itemId)) return { ok: false, motivo: `${sp.nombre} no puede llevar ${nombreItem(itemId).toLowerCase()}` };
  }
  if (ap.ranura === 'proteccion' && !m.proteccion) return { ok: false, motivo: 'No admite protección' };
  return { ok: true };
}
export function equipar(c, slotIdx) {
  const ctx = c.ctx, sv = ctx.survival, s = sv.slots[slotIdx];
  if (!s) return { ok: false, motivo: 'Casilla vacía' };
  const p = puedeEquipar(c, s.item);
  if (!p.ok) { mensaje(c, p.motivo, 'warn'); return p; }
  const t = sv.inventory.tomar(slotIdx, 1);
  const ap = ITEMS[t.item].aparejo;
  c.rel.equipo[ap.ranura] = { item: t.item, ...(t.extra ?? {}) };
  const g = sv.saber.ganar('manejo', 3);
  if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'manejo', nombre: 'Manejo de animales', nivel: g.nivel });
  ctx.events.emit('fauna:equipado', { criatura: c, item: t.item, ranura: ap.ranura });
  return { ok: true };
}
export function quitarEquipo(c, ranura) {
  const r = c.rel, ctx = c.ctx;
  const a = r?.equipo[ranura]; if (!a) return { ok: false, motivo: 'No lleva nada ahí' };
  if (ranura === 'cabeza') return { ok: false, motivo: 'Para quitar el cabestro hay que liberar al animal' };
  if (ranura === 'lomo' && r.equipo.carga) return { ok: false, motivo: 'Quita antes las bolsas' };
  if (ranura === 'lomo' && c.jinete) return { ok: false, motivo: 'Desmonta primero' };
  if (ranura === 'carga' && r.almacen.length) return { ok: false, motivo: 'Vacía antes la carga' };
  const left = ctx.survival.inventory.add(a.item, 1, { dur: a.dur, cal: a.cal, rep: a.rep });
  if (left > 0) return { ok: false, motivo: 'No te cabe en la mochila' };
  r.equipo[ranura] = null;
  ctx.events.emit('fauna:equipado', { criatura: c, item: null, ranura });
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------------------------------------
// Carga transportada (alforjas / bolsas): peso y volumen reales
export function capacidadCarga(c) {
  const r = c.rel, a = r?.equipo.carga;
  if (!a) return { peso: 0, vol: 0 };
  const g = ITEMS[a.item].aparejo.carga, mul = c.sp.montura?.carga?.mul ?? 1;
  return { peso: g.peso * mul, vol: g.vol * mul };
}
export function cargaActual(c) {
  let peso = 0, vol = 0;
  for (const s of c.rel?.almacen ?? []) { peso += (ITEMS[s.item]?.peso ?? 0) * s.cantidad; vol += (ITEMS[s.item]?.vol ?? 0) * s.cantidad; }
  return { peso, vol };
}
export function guardar(c, slotIdx, cantidad = null) {
  const ctx = c.ctx, sv = ctx.survival, r = c.rel, s = sv.slots[slotIdx];
  if (!r?.equipo.carga) return { ok: false, motivo: 'No lleva alforjas ni bolsa' };
  if (!s) return { ok: false, motivo: 'Casilla vacía' };
  if (c.distToPlayer() > 8) return { ok: false, motivo: 'Está demasiado lejos' };
  const it = ITEMS[s.item], cap = capacidadCarga(c), cur = cargaActual(c);
  let n = Math.min(cantidad ?? s.cantidad, s.cantidad);
  const porPeso = it.peso > 0 ? Math.floor((cap.peso - cur.peso) / it.peso + 1e-6) : n, porVol = it.vol > 0 ? Math.floor((cap.vol - cur.vol) / it.vol + 1e-6) : n;
  n = Math.min(n, porPeso, porVol);
  if (n <= 0) return { ok: false, motivo: 'No cabe: la carga está llena' };
  const t = ctx.survival.inventory.tomar(slotIdx, n);
  const igual = (a) => a.item === t.item && !t.extra && !a.extra && ITEMS[t.item].apilable > 1;
  const ex = r.almacen.find(igual);
  if (ex) ex.cantidad += t.cantidad; else r.almacen.push({ item: t.item, cantidad: t.cantidad, extra: t.extra ?? null });
  return { ok: true, cantidad: t.cantidad };
}
export function sacar(c, idx, cantidad = null) {
  const ctx = c.ctx, r = c.rel, s = r?.almacen[idx];
  if (!s) return { ok: false, motivo: 'No está' };
  if (c.distToPlayer() > 8) return { ok: false, motivo: 'Está demasiado lejos' };
  const n = Math.min(cantidad ?? s.cantidad, s.cantidad);
  const left = ctx.survival.inventory.add(s.item, n, s.extra);
  const sacado = n - left;
  if (sacado <= 0) return { ok: false, motivo: 'No te cabe en la mochila' };
  s.cantidad -= sacado; if (s.cantidad <= 0) r.almacen.splice(idx, 1);
  return { ok: true, cantidad: sacado };
}

// ------------------------------------------------------------------------------------------------------------------------------
// Órdenes: la correa que mantiene al animal cerca de lo que debe
export function correa(c) {
  const r = c.rel;
  if (!r?.manejo || c.jinete) return null;
  if (r.orden === 'seguir') { const p = c.ctx.player?.position; if (!p || c.ctx.state !== 'playing') return null; return { x: p.x, z: p.z, R: 7 + c.sp.radius * 1.5 }; }
  if (r.orden === 'quedarse' && r.hogar) return { x: r.hogar.x, z: r.hogar.z, R: 8 + c.sp.radius };
  return null;
}

// ------------------------------------------------------------------------------------------------------------------------------
// Información para la interfaz
export function info(c) {
  const r = c.rel, d = c.sp.doma, n = nivelDe(c);
  if (!r) return { nivel: 1, nivelNombre: NIVEL_NOMBRE[1], max: 0, domesticable: false, nota: d?.nota ?? 'No se puede domesticar' };
  return {
    nivel: n, nivelNombre: NIVEL_NOMBRE[n], max: d.max, domesticable: d.max >= 5, nota: d.nota, riesgo: d.riesgo,
    hab: r.hab, conf: r.conf, cuid: r.cuid, cuidTotal: d.cuidado ? d.cuidado.dias * DIA : 0, hambre: c.hambre,
    propio: esPropio(c), dom: r.dom, manejo: r.manejo, orden: r.orden, nombre: r.nombre ?? c.nombre, comida: listaComida(c),
    montable: !!(r.dom && c.sp.montura?.jinete && r.equipo.lomo?.item && ITEMS[r.equipo.lomo.item].aparejo.monta),
  };
}

/** Texto de la acción de la tecla E sobre una criatura viva (o null). */
export function accionE(c) {
  const r = c.rel;
  if (!r) return null;
  if (esPropio(c)) return `Atender a ${r.nombre ?? c.nombre}`;
  if (r.hab < 1) return null;
  const d = c.sp.doma;
  if (d.max >= 4 && r.conf >= 1) return d.manejo ? `Colocar ${nombreItem(d.manejo.equipo).toLowerCase()}` : null;
  const it = elegirAlimento(c);
  return it ? `Ofrecer ${nombreItem(it).toLowerCase()}` : 'Ofrecer comida';
}
export function interactuar(c) {
  const r = c.rel;
  if (!r || c.muerta) return false;
  if (esPropio(c)) { c.ctx.ui?.abrirAnimal?.(c); return true; }
  if (r.hab < 1) { mensaje(c, `Todavía no se deja acercar (habituación ${Math.round(r.hab * 100)} %): quédate quieto a distancia`, 'info'); return true; }
  const d = c.sp.doma;
  if (d.max >= 4 && r.conf >= 1) { colocarManejo(c); return true; }
  ofrecer(c, elegirAlimento(c));
  return true;
}

// ------------------------------------------------------------------------------------------------------------------------------
// Guardado
export function serializar(c) {
  const r = c.rel;
  return { e: c.especie, x: c.position.x, z: c.position.z, yaw: c.yaw, hp: c.hp, hambre: c.hambre, rel: { ...r, equipo: { ...r.equipo }, almacen: r.almacen.map((s) => ({ ...s })), hogar: r.hogar ? { ...r.hogar } : null } };
}
export function restaurarRel(c, d) {
  if (!c.rel || !d) return;
  const base = crearRel(c);
  Object.assign(c.rel, base, d, { equipo: { ...base.equipo, ...(d.equipo ?? {}) }, almacen: (d.almacen ?? []).filter((s) => ITEMS[s.item]) });
  for (const k of RANURAS_ANIMAL) if (c.rel.equipo[k] && !ITEMS[c.rel.equipo[k].item]) c.rel.equipo[k] = null;
  c.rel.contacto = -1e9; c.rel.cdOfrece = 0;
  c.vinculo = nivelDe(c);
}
