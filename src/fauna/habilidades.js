// SISTEMA DE HABILIDADES. Cada habilidad es un objeto de datos (identificador, tipo, condiciones, coste, recuperación, radio, objetivos, efectos,
// animación, sonido, retroalimentación, limitaciones, parámetros) más dos funciones reales: `puede(c, p)` y `usar(c, p, info)`.
// Las criaturas de IA las evalúan solas (autoHab) y las usan sin que nadie pulse nada; la IA (cerebro.js) reacciona a sus efectos.

import { trato, noCazaJugador } from './vinculo.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const sh = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const deg = (dx, dz) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; // rumbo de brújula (N=0, E=90)
const now = (c) => c.ctx.time.elapsed;
const vivo = (o) => !o.muerta && !o.flight;
const dist2 = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

function coincide(c, a, filtros) {
  if (!filtros) return true;
  return filtros.some((f) => (f === 'jugador' ? a.jugador : f === 'depredador_mayor' ? a.grande : f === 'cualquiera'));
}

/** Registra el uso en el bus de eventos y en el registro de depuración. */
function notificar(c, def, extra = {}) {
  const p = c.center.clone();
  c.ctx.events.emit('creature:skill', { especie: c.especie, id: def.id, nombre: def.nombre, position: p, criatura: c.id, ...extra });
  const reg = c.mgr.registro; reg.push({ t: now(c), id: def.id, especie: c.especie, c: c.id, ...extra }); if (reg.length > 400) reg.shift();
}

/** Registra (y emite) el uso de una habilidad que el cerebro dispara por su cuenta (p. ej. pasar a búsqueda por rastro). */
export function registrarUso(c, id, extra = {}) { if (HAB[id]) notificar(c, HAB[id], extra); }

// ---------------------------------------------------------------------------------------------------------------------------------------------
export const HAB = {
  // ------------------------------------------------------------------------------------------ vigilancia y comunicación
  escaneo_vigia: {
    id: 'escaneo_vigia', nombre: 'Escaneo de vigía', tipo: 'contextual',
    condiciones: 'En reposo, pastando o paseando, cada cierto tiempo levanta la cabeza y examina el entorno; no escanea si ya está alertado.',
    energia: 0.01, cd: 7, radio: 85, alcance: 85, objetivos: ['jugador', 'depredadores que teme la especie'],
    efectos: 'Percepción ampliada (×1.35 de alcance, umbral más bajo) en un barrido. Si detecta algo, emite la llamada de alerta.',
    anim: 'cabeza y cresta erguidas, cuello arriba durante ~2 s', sonido: 'ninguno (la llamada sí suena)', feedback: 'la criatura se detiene y mira; el HUD avisa si es una llamada audible',
    limites: 'Oclusión por terreno y vegetación, ruido de lluvia/viento, distancia, campo visual y falsos positivos (sombras o ruidos inofensivos).',
    params: { cada: 9, radio: 85, falsosPositivos: 0.06, umbral: 0.28 },
    puede(c, p) { return vivo(c) && (c.state === 'idle' || c.state === 'graze' || c.state === 'wander') && !c.scanPend && c.scanT <= 0 && now(c) - c.lastScan > p.cada * rnd(0.8, 1.25) && c.ctx.state === 'playing'; },
    usar(c) { c.lastScan = now(c); c.scanT = 2.1; c.scanPend = true; c.wish = 0; },
  },

  llamada_alerta: {
    id: 'llamada_alerta', nombre: 'Llamada de alerta', tipo: 'activa',
    condiciones: 'Tiene una amenaza reciente con confianza suficiente que encaja con el filtro de la especie (jugador y/o depredador mayor).',
    energia: 0.02, cd: 16, radio: 150, alcance: 150, objetivos: ['individuos de la manada', 'herbívoros y presas cercanas', 'jugador (si oye)'],
    efectos: 'Emite una llamada audible. Los receptores perciben la señal atenuada por distancia, oclusión y ruido ambiental, y reaccionan tras una latencia propia.',
    anim: 'mandíbula abierta y cabeza arriba ~1.5 s', sonido: 'llamada_<especie> (o rugido)', feedback: 'marca en la brújula con rumbo, distancia aproximada y confianza',
    limites: 'Enfriamiento largo; la señal no llega si el receptor está fuera de alcance auditivo; puede ser un falso positivo.',
    params: { radio: 150, cd: 16, confMin: 0.28, solo: ['jugador', 'depredador_mayor'] },
    puede(c, p) { const a = c.amenaza; return vivo(c) && a && !a.indirecta && now(c) - a.t < 3 && a.conf >= p.confMin && coincide(c, a, p.solo) && c.state !== 'dead'; }, // una alerta recibida de otro no se vuelve a emitir (evita eco)
    usar(c, p, info) {
      const a = info?.amenaza ?? c.amenaza; if (!a) return;
      const ctx = c.ctx, mgr = c.mgr, t = now(c);
      c.llamadaAnim = 1.6; c.jawAnim = 1.2;
      ctx.events.emit('creature:roar', { especie: c.especie, position: c.center.clone(), llamada: true });
      const S = mgr.sentidos, W = ctx.time.weather;
      const masking = 1 - 0.3 * (W?.rain ?? 0) - 0.2 * (W?.windStrength ?? 0.3);
      let oyen = 0;
      for (const o of mgr.list) {
        if (o === c || !vivo(o)) continue;
        const rolRec = o.sp.ai.huye === 1 || o.sp.vigia || o.sp.ai.coordinada || o.especie === c.especie;
        if (!rolRec) continue;
        const d = dist2(c, o);
        const R = (o.especie === c.especie ? p.radio : p.radio * 0.55);
        if (d > R) continue;
        const ocl = S.ocluir(c.position.x, c.position.y + 2, c.position.z, o.position.x, o.position.y + 2, o.position.z);
        const audible = (1 - d / R) * (0.4 + 0.6 * Math.pow(ocl, 0.5)) * masking;
        if (audible < 0.12) continue;
        oyen++;
        o.recibirAlerta({ x: a.x, z: a.z, conf: clamp(a.conf, 0.2, 1), ref: a.ref ?? null, jugador: !!a.jugador, grande: !!a.grande, de: c, falso: !!a.falso }, audible, d / 340 + rnd(0.15, 0.6));
      }
      // aviso al jugador: si el jugador es la amenaza siempre sabe de dónde viene el aviso; si es otra amenaza solo con un vigía vinculado
      const pl = ctx.player?.position;
      if (pl && ctx.state === 'playing') {
        const dpj = Math.hypot(pl.x - c.position.x, pl.z - c.position.z);
        if (dpj < p.radio * 1.15) {
          const aliado = (c.vinculo ?? 0) >= 4; // solo un animal bajo manejo (o domesticado) avisa de otras amenazas
          const tipo = a.jugador ? 'jugador' : aliado ? 'amenaza' : 'llamada';
          const ex = tipo === 'amenaza' ? a.x : c.position.x, ez = tipo === 'amenaza' ? a.z : c.position.z;
          const dd = Math.hypot(ex - pl.x, ez - pl.z);
          const fuzz = tipo === 'amenaza' ? 0.12 + (1 - a.conf) * 0.3 : 0.25;
          ctx.events.emit('fauna:alerta', {
            tipo, especie: c.especie, nombre: c.nombre, rumbo: deg(ex - pl.x, ez - pl.z), dist: dd * (1 + (Math.random() - 0.5) * fuzz), conf: a.conf,
            causa: a.jugador ? 'te han detectado' : a.grande ? 'depredador' : 'movimiento', falso: !!a.falso, receptores: oyen,
          });
        }
      }
      notificar(c, this, { amenaza: a.jugador ? 'jugador' : a.ref?.especie ?? 'desconocida', conf: +a.conf.toFixed(2), receptores: oyen, falso: !!a.falso });
      void t;
    },
  },

  huida_coordinada: {
    id: 'huida_coordinada', nombre: 'Huida coordinada', tipo: 'pasiva',
    condiciones: 'Siempre activa; se aplica cuando la especie huye con manada.',
    energia: 0, cd: 0, radio: 60, alcance: 60, objetivos: ['miembros de la manada'],
    efectos: 'Los individuos huyen en la misma dirección, atraídos por el centro del grupo, en lugar de dispersarse al azar.',
    anim: 'carrera en grupo', sonido: 'pasos', feedback: 'grupo compacto huyendo', limites: 'Si pierde a la manada huye solo.', params: {},
    puede() { return false; },
    usar() {},
  },

  // ------------------------------------------------------------------------------------------ defensa de herbívoros
  embestida: {
    id: 'embestida', nombre: 'Embestida defensiva', tipo: 'contextual',
    condiciones: 'Amenaza o agresor entre 4 y 24 m, alineado con la cabeza, con energía suficiente.',
    energia: 0.22, cd: 9, radio: 24, alcance: 24, objetivos: ['jugador', 'criaturas hostiles'],
    efectos: 'Carga a +25% de velocidad durante ~1.6 s; el impacto hace el daño de la embestida y lanza al objetivo.',
    anim: 'cabeza baja, gola y cuernos al frente', sonido: 'rugido', feedback: 'sacudida y empuje al jugador', limites: 'Gira mal a alta velocidad y gasta mucha energía; si falla queda expuesto.',
    params: { dano: 28, dur: 1.6, nuevo: 1.25 },
    puede(c, p) {
      if (!vivo(c) || c.carga > 0 || !(c.state === 'charge' || c.state === 'defend' || c.state === 'chase')) return false;
      const t = c.objetivoPos(); if (!t) return false;
      return t.d > 3.2 && t.d < p.alcance && Math.abs(sh(Math.atan2(t.dx, t.dz) - c.yaw)) < 0.4;
    },
    usar(c, p) { c.carga = p.dur; c.cargaDano = p.dano; c.setState('charge'); c.enrage = Math.max(c.enrage, 8); c.roar(true); notificar(c, this); },
  },

  formacion_defensiva: {
    id: 'formacion_defensiva', nombre: 'Formación defensiva', tipo: 'contextual',
    condiciones: 'Al menos otro individuo de la manada a ≤30 m y un depredador mayor perceptible entre 10 y 70 m.',
    energia: 0.05, cd: 30, radio: 30, alcance: 70, objetivos: ['miembros de la manada'],
    efectos: 'La manada se coloca en círculo con los cuernos hacia fuera alrededor de su centro, hasta que la amenaza se aleja o ataca.',
    anim: 'giro y desplazamiento a posiciones del anillo', sonido: 'rugidos breves', feedback: 'anillo visible de cuernos',
    limites: 'Se rompe si un miembro es atacado de cerca (entonces embiste); dura un tiempo limitado.', params: { dur: 16 },
    puede(c) {
      const a = c.amenaza; if (!vivo(c) || !c.herd || !a || !a.grande || now(c) - a.t > 3 || c.herd.formacion) return false;
      const d = Math.hypot(a.x - c.position.x, a.z - c.position.z);
      if (d < 10 || d > 70) return false;
      let n = 0; for (const m of c.herd.members) if (m !== c && vivo(m) && dist2(c, m) < 30) n++;
      return n >= 1;
    },
    usar(c, p) {
      const a = c.amenaza, h = c.herd;
      h.formacion = { t: now(c), dur: p.dur, x: a.x, z: a.z };
      for (const m of h.members) if (vivo(m) && dist2(c, m) < 45) { m.amenaza = { ...a, t: now(c) }; if (m.state !== 'charge') m.setState('defend'); m.formacionActiva = true; }
      c.roar(true); notificar(c, this, { miembros: h.members.filter(vivo).length });
    },
  },

  postura_intimidacion: {
    id: 'postura_intimidacion', nombre: 'Postura de intimidación', tipo: 'contextual',
    condiciones: 'Amenaza percibida con confianza entre 5 m y el radio, sin haberla exhibido en los últimos 18 s.',
    energia: 0.04, cd: 18, radio: 24, alcance: 24, objetivos: ['jugador', 'depredadores pequeños', 'presas rivales'],
    efectos: 'Se detiene, adopta la postura (cabeza baja y gola al frente) y ruge. Las criaturas más débiles huyen; los demás reciben el aviso antes de la embestida.',
    anim: 'cabeza baja, gola alta, pata delantera rasca', sonido: 'rugido', feedback: 'aviso de HUD “te advierte”', limites: 'No hace daño por sí misma; si la amenaza persiste, la criatura ataca.',
    params: { dur: 2.2, radio: 24, cd: 18 },
    puede(c, p) { const a = c.amenaza; return vivo(c) && (c.state === 'alert' || c.state === 'defend') && a && now(c) - a.t < 2 && a.conf > 0.35 && now(c) - c.lastDisplay > p.cd && c.display <= 0 && Math.hypot(a.x - c.position.x, a.z - c.position.z) > 5 && Math.hypot(a.x - c.position.x, a.z - c.position.z) < p.radio; },
    usar(c, p) { mostrarDisplay(c, p, this); },
  },

  exhibicion_territorial: {
    id: 'exhibicion_territorial', nombre: 'Exhibición territorial', tipo: 'contextual',
    condiciones: 'Percibe algo en su territorio con sospecha parcial (antes de decidir cazar) y no ha rugido en los últimos 35 s.',
    energia: 0.03, cd: 35, radio: 55, alcance: 55, objetivos: ['jugador', 'competidores'],
    efectos: 'Ruge y se yergue como advertencia. Los depredadores menores y las presas huyen; el jugador recibe un aviso antes de ser perseguido.',
    anim: 'postura erguida y rugido prolongado', sonido: 'rugido', feedback: 'aviso de HUD', limites: 'Es una señal: no garantiza ataque ni retirada.',
    params: { dur: 2.6, radio: 55, cd: 35 },
    puede(c, p) {
      if (!vivo(c) || !(c.state === 'idle' || c.state === 'wander' || c.state === 'alert' || c.state === 'graze')) return false;
      const lsp = c.sosp; return lsp > 0.35 && lsp < 1 && c.display <= 0 && now(c) - c.lastDisplay > p.cd && c.pDist < p.radio && c.pConf > 0.15;
    },
    usar(c, p) { mostrarDisplay(c, p, this, true); },
  },

  cola_defensiva: {
    id: 'cola_defensiva', nombre: 'Golpe de cola', tipo: 'contextual',
    condiciones: 'Amenaza dentro del radio y en el arco trasero (±43°); fuera de ese arco primero gira para colocar la cola hacia ella.',
    energia: 0.1, cd: 3.2, radio: 5.5, alcance: 5.5, objetivos: ['jugador', 'criaturas hostiles'],
    efectos: 'Barrido lateral de la cola armada (thagomizer / maza): daño al impacto, empuje y, si procede, aturdimiento.',
    anim: 'giro del cuerpo y barrido de cola de ~0.75 s', sonido: 'golpe seco', feedback: 'empuje y sacudida', limites: 'Solo cubre el arco trasero; hay que girar antes; enfriamiento corto pero energía limitada.',
    params: { radio: 5.5, dano: 34, aturde: 0 },
    puede(c, p) {
      if (!vivo(c) || c.tailSwing >= 0 || !(c.state === 'defend' || c.state === 'charge' || c.state === 'alert')) return false;
      const t = c.objetivoPos(); if (!t || t.d > p.radio) return false;
      return Math.abs(sh(Math.atan2(t.dx, t.dz) - (c.yaw + Math.PI))) < 0.75;
    },
    usar(c, p) { c.tailSwing = 0; c.tailSide = Math.random() < 0.5 ? -1 : 1; c.tailHit = false; c.tailDano = p.dano; c.tailStun = p.aturde ?? 0; c.tailRadio = p.radio; notificar(c, this); },
  },

  armadura_natural: {
    id: 'armadura_natural', nombre: 'Armadura natural', tipo: 'pasiva',
    condiciones: 'Siempre activa.', energia: 0, cd: 0, radio: 0, alcance: 0, objetivos: ['daño recibido'],
    efectos: 'Reduce el daño de golpes frontales, laterales y dorsales; el flanco trasero y el vientre quedan más expuestos.',
    anim: 'ninguna', sonido: 'golpe amortiguado', feedback: 'chispas/golpe sordo', limites: 'Sin protección contra ataques por detrás.',
    params: { frontal: 0.55, trasera: 0.2 },
    puede() { return false; }, usar() {},
    tick(c, p) { c.armaduraF = p.frontal; c.armaduraT = p.trasera; },
  },

  movilidad_reducida: {
    id: 'movilidad_reducida', nombre: 'Movilidad reducida por lesiones', tipo: 'pasiva',
    condiciones: 'Siempre evaluada.', energia: 0, cd: 0, radio: 0, alcance: 0, objetivos: ['propia'],
    efectos: 'Por debajo del 50% de vida cojea (−30% de velocidad), por debajo del 25% (−50%).',
    anim: 'marcha más lenta', sonido: 'ninguno', feedback: 'velocidad menor', limites: 'No se recupera durante el combate.', params: {},
    puede() { return false; }, usar() {},
    tick(c) { const f = c.hp / c.hpMax; c.movMul = f < 0.25 ? 0.5 : f < 0.5 ? 0.7 : 1; },
  },

  pisoteo: {
    id: 'pisoteo', nombre: 'Pisoteo', tipo: 'pasiva',
    condiciones: 'Al moverse o alarmado: cualquier criatura pequeña o el jugador bajo una de sus patas.', energia: 0, cd: 1.4, radio: 1.35, alcance: 1.35, objetivos: ['jugador', 'criaturas pequeñas'],
    efectos: 'Daño por aplastamiento y empuje a quien quede bajo un pie en movimiento; sacudida de cámara cercana.',
    anim: 'marcha', sonido: 'paso pesado', feedback: 'sacudida y daño', limites: 'Solo patas apoyadas y en movimiento; no persigue.',
    params: { dano: 45, radio: 1.35 },
    puede() { return false; }, usar() {},
    tick(c, p, dt) {
      c.pisoCd = Math.max(0, (c.pisoCd ?? 0) - dt);
      if (c.pisoCd > 0 || c.speed < 0.3 || !c.legs?.length) return;
      const pl = c.ctx.player, pp = pl?.position;
      for (const l of c.legs) {
        if (l.wx == null || l.ik.lift > 0.15) continue; // solo pata apoyada
        if (pp && c.ctx.state === 'playing' && Math.hypot(pp.x - l.wx, pp.z - l.wz) < p.radio && pp.y - c.ctx.world.getHeight(l.wx, l.wz) < 1.6) {
          c.pisoCd = 1.5; c.mgr.hitPlayer(c, p.dano * rnd(0.85, 1.15), 'pisotón');
          pl.velocity.x += (pp.x - l.wx) * 5; pl.velocity.z += (pp.z - l.wz) * 5; pl.velocity.y = Math.max(pl.velocity.y, 3);
          c.ctx.events.emit('camera:shake', { intensidad: 0.6, dur: 0.5 });
          notificar(c, HAB.pisoteo, { objetivo: 'jugador' }); return;
        }
        for (const o of c.mgr.list) {
          if (o === c || !vivo(o) || o.sp.radius > 0.9) continue;
          if (Math.hypot(o.position.x - l.wx, o.position.z - l.wz) < p.radio) { c.pisoCd = 1.5; o.damage(p.dano * 2, 'criatura', c); notificar(c, HAB.pisoteo, { objetivo: o.especie }); return; }
        }
      }
    },
  },

  // ------------------------------------------------------------------------------------------ depredadores
  rastreo_olor: {
    id: 'rastreo_olor', nombre: 'Rastreo por olor y huellas', tipo: 'contextual',
    condiciones: 'Sospecha sin contacto visual (sospecha ≥0.25) y rastro fresco al alcance; el viento y la lluvia lo limitan.',
    energia: 0.02, cd: 6, radio: 38, alcance: 38, objetivos: ['jugador (rastro de huellas)'],
    efectos: 'Pasa a “búsqueda”: sigue el rastro de huellas del jugador, de la huella más cercana hacia la más reciente. Si el rastro es viejo o se pierde, se rinde.',
    anim: 'cabeza baja olfateando', sonido: 'ninguno', feedback: 'la criatura sigue tu camino y no tu posición real',
    limites: 'Huellas >150 s (menos con lluvia) no sirven; necesita acercarse a ≤38 m del rastro; no sabe dónde estás ahora.', params: { radio: 38 },
    puede(c) { return vivo(c) && (c.state === 'idle' || c.state === 'wander' || c.state === 'alert' || c.state === 'graze') && c.sosp > 0.25 && c.pConf < 0.2 && c.ctx.state === 'playing' && now(c) > c.noRastroHasta && !c.grace() && !noCazaJugador(c); },
    usar(c, p) { const r = c.mgr.sentidos.seguirRastro(c.position.x, c.position.z, now(c), p.radio); if (!r) { c.noRastroHasta = now(c) + 10; return; } c.setState('search'); c.searchT = 0; notificar(c, this); },
  },

  acecho: {
    id: 'acecho', nombre: 'Acecho y aproximación', tipo: 'contextual',
    condiciones: 'Objetivo (jugador o presa) detectado a más de 1.3× la distancia de emboscada, depredador con hambre suficiente o provocado.',
    energia: 0.01, cd: 4, radio: 70, alcance: 70, objetivos: ['jugador', 'presas'],
    efectos: 'Se acerca despacio y agachado (velocidad de paseo, cuello bajo); al llegar a la distancia de emboscada lanza el ataque.',
    anim: 'cuello bajo, cola recta, paso lento', sonido: 'ninguno', feedback: 'se aproxima sin rugir',
    limites: 'Si el objetivo mira de frente y se acerca, la sospecha del objetivo no cambia pero la criatura abandona el acecho si pierde el contacto.', params: { dEmboscada: 12 },
    puede(c, p) { const t = c.objetivoPos(); return vivo(c) && c.state === 'alert' && !!t && t.d > p.dEmboscada * 1.3 && c.stateT > 0.5; },
    usar(c) { c.setState('stalk'); notificar(c, this); },
  },

  emboscada: {
    id: 'emboscada', nombre: 'Ataque de emboscada', tipo: 'contextual',
    condiciones: 'En acecho, a la distancia de emboscada del objetivo.', energia: 0.12, cd: 12, radio: 14, alcance: 14, objetivos: ['jugador', 'presas'],
    efectos: 'Arranque a +20% durante 1.4 s y primer golpe con +40% de daño.', anim: 'salto de arranque', sonido: 'rugido corto', feedback: 'ataque súbito',
    limites: 'Gasta energía; si el objetivo se aleja demasiado la caza se abandona.', params: { dEmboscada: 11, bonus: 1.4 },
    puede(c, p) { const t = c.objetivoPos(); return vivo(c) && c.state === 'stalk' && !!t && t.d < p.dEmboscada; },
    usar(c, p) { c.burst = 1.4; c.emboscadaBonus = p.bonus; c.setState('chase'); c.roar(true); notificar(c, this); },
  },

  abandonar_caza: {
    id: 'abandonar_caza', nombre: 'Abandono de la caza', tipo: 'contextual',
    condiciones: 'Energía <18%, caza >22 s sin acortar distancia, vida baja, o presa demasiado lejos para el beneficio.', energia: 0, cd: 5, radio: 0, alcance: 0, objetivos: ['propia'],
    efectos: 'Deja de perseguir, descansa y no vuelve a cazar hasta pasados ~25 s.', anim: 'frena y se tumba', sonido: 'resoplido', feedback: 'la criatura se rinde',
    limites: 'Su umbral depende de la especie (resistencia de esprint).', params: {},
    puede(c) {
      if (!vivo(c) || c.state !== 'chase') return false;
      const t = c.objetivoPos(); if (!t) return true;
      return c.energia < 0.18 || (c.stateT > 22 && t.d > 9) || c.hp / c.hpMax < 0.3 || t.d > (c.sp.sentidos?.vista ?? 40) * 2 || (c.stateT > 8 && c.distMin - t.d < -6);
    },
    usar(c) { c.cdCaza = 28; c.tgt = null; c.setState('rest'); c.restLen = rnd(7, 12); notificar(c, this, { energia: +c.energia.toFixed(2) }); },
  },

  defensa_cadaver: {
    id: 'defensa_cadaver', nombre: 'Defensa del cadáver', tipo: 'contextual',
    condiciones: 'Está comiendo y algo (jugador o criatura) se acerca a menos de 20 m.', energia: 0.05, cd: 12, radio: 20, alcance: 20, objetivos: ['jugador', 'carroñeros'],
    efectos: 'Ruge en postura de exhibición; si el intruso sigue a menos de 10 m, lo ataca.', anim: 'exhibición sobre el cadáver', sonido: 'rugido', feedback: 'aviso de HUD',
    limites: 'Si está herido o cansado puede abandonar la presa.', params: { radio: 20, atacaA: 10 },
    puede(c, p) {
      if (!vivo(c) || c.state !== 'feed' || !c.carcass) return false;
      return !!c.intruso(p.radio);
    },
    usar(c, p) {
      const i = c.intruso(p.radio); if (!i) return;
      c.display = 1.8; c.lastDisplay = now(c); c.roar(true);
      if (i.d < p.atacaA) { c.tgt = i.jugador ? null : { c: i.ref }; c.tgtJugador = !!i.jugador; c.setState('chase'); }
      c.ctx.events.emit('fauna:alerta', { tipo: 'advertencia', especie: c.especie, nombre: c.nombre, rumbo: deg(i.x - c.ctx.player.position.x, i.z - c.ctx.player.position.z), dist: i.d, conf: 1, causa: 'defiende su presa' });
      notificar(c, this, { intruso: i.jugador ? 'jugador' : i.ref?.especie });
    },
  },

  carroneo: {
    id: 'carroneo', nombre: 'Detección de carroña', tipo: 'contextual',
    condiciones: 'Con hambre (≥0.3), sin amenazas, olfatea un cadáver reciente al alcance de su olfato.', energia: 0, cd: 5, radio: 60, alcance: 60, objetivos: ['cadáveres'],
    efectos: 'Se dirige al cadáver y se alimenta (reduce el hambre); un depredador mayor puede echarlo.', anim: 'cabeza baja comiendo', sonido: 'ninguno', feedback: 'criatura comiendo',
    limites: 'Solo cadáveres de menos de 70 s; el viento y la lluvia reducen el olor.', params: {},
    puede(c) {
      if (!vivo(c) || !(c.state === 'idle' || c.state === 'wander' || c.state === 'graze') || c.hambre < 0.3 || (c.amenaza && now(c) - c.amenaza.t < 6) || c.ctx.state === 'loading') return false;
      const olf = c.sp.sentidos?.olfato ?? 0; if (olf <= 0) return false;
      c.carroniaT = (c.carroniaT ?? 0); const o = c.mgr.sentidos.carroñaCercana(c, olf * 0.8);
      c._carr = o ?? null; return !!o && (!o.dueno || o.dueno === c || o.dueno.muerta || o.dueno.sp.peligro < c.sp.peligro);
    },
    usar(c) { c.carcass = c._carr; c.setState('feed'); c.feedT = 0; notificar(c, this, { sobre: c.carcass?.especie }); },
  },

  esprint_zigzag: {
    id: 'esprint_zigzag', nombre: 'Esprint en zigzag', tipo: 'pasiva',
    condiciones: 'Al huir.', energia: 0, cd: 0, radio: 0, alcance: 0, objetivos: ['propia'],
    efectos: 'Durante la huida cambia de rumbo cada ~0.8 s (±26°), dificultando que el depredador la alcance.', anim: 'quiebros', sonido: 'pasos rápidos', feedback: 'trayectoria sinuosa',
    limites: 'Pierde algo de velocidad neta (-8%) a cambio de evasión.', params: { amp: 0.45 },
    puede() { return false; }, usar() {},
  },
};

/** Exhibición compartida (postura de intimidación y exhibición territorial). */
function mostrarDisplay(c, p, def, territorial = false) {
  c.display = p.dur; c.lastDisplay = now(c); c.wish = 0;
  c.roar(true);
  const t = c.objetivoPos();
  let asustados = 0;
  for (const o of c.mgr.list) {
    if (o === c || !vivo(o) || o.especie === c.especie) continue;
    const d = dist2(c, o);
    if (d > p.radio) continue;
    const debil = o.sp.ai.huye === 1 || o.sp.peligro < c.sp.peligro * 0.45;
    if (debil && (o.sp.ai.teme?.includes(c.especie) || o.sp.ai.huye === 1)) { o.intimidar(c); asustados++; }
  }
  const pl = c.ctx.player?.position;
  if (pl && c.ctx.state === 'playing' && (territorial || (t && t.jugador))) {
    const d = Math.hypot(pl.x - c.position.x, pl.z - c.position.z);
    if (d < p.radio * 1.4) c.ctx.events.emit('fauna:alerta', { tipo: 'advertencia', especie: c.especie, nombre: c.nombre, rumbo: deg(c.position.x - pl.x, c.position.z - pl.z), dist: d, conf: 1, causa: territorial ? 'territorio' : 'te advierte' });
  }
  notificar(c, def, { asustados });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
/** Instancia las habilidades de una especie en una criatura (con parámetros de especie sobre los de la habilidad). */
export function crearHabilidades(sp) {
  return (sp.habilidades ?? []).map((id) => {
    const def = HAB[id];
    if (!def) throw new Error(`Habilidad desconocida: ${id} (${sp.id})`);
    return { def, id, p: { ...def.params, ...(sp.habParams?.[id] ?? {}) }, cd: rnd(0, def.cd * 0.4), usos: 0 };
  });
}

export function tieneHab(c, id) { return c.hab.some((h) => h.id === id); }

/** Activa una habilidad concreta (respeta recuperación y energía salvo `forzar`). */
export function activarHab(c, id, info = {}) {
  const h = c.hab.find((x) => x.id === id);
  if (!h) return false;
  if (!info.forzar && (h.cd > 0 || c.energia < h.def.energia)) return false;
  c.energia = Math.max(0, c.energia - h.def.energia);
  h.cd = h.p.cd ?? h.def.cd; h.usos++;
  h.def.usar(c, h.p, info);
  return true;
}

/** Bucle de habilidades de una criatura: recuperación, pasivas y evaluación autónoma de las activas/contextuales. */
export function tickHab(c, dt) {
  c.autoT -= dt;
  const eval_ = c.autoT <= 0; if (eval_) c.autoT = 0.2 + Math.random() * 0.05;
  for (const h of c.hab) {
    if (h.cd > 0) h.cd -= dt;
    if (h.def.tipo === 'pasiva') { h.def.tick?.(c, h.p, dt); continue; }
    if (!eval_ || h.cd > 0 || c.energia < h.def.energia || c.stun > 0) continue;
    if (h.def.puede(c, h.p)) { c.energia = Math.max(0, c.energia - h.def.energia); h.cd = h.p.cd ?? h.def.cd; h.usos++; h.def.usar(c, h.p, null); }
  }
}

/** Escaneo activo del vigía (se ejecuta a mitad de la animación de escaneo). */
export function escanear(c) {
  const h = c.hab.find((x) => x.id === 'escaneo_vigia'); if (!h) return null;
  const p = h.p, mgr = c.mgr, S = mgr.sentidos, ctx = c.ctx, hall = [];
  c.scanPend = false;
  const bono = 1.35;
  if (ctx.state === 'playing' && c.ctx.player && trato(c) > 0.5) { // un vigía habituado o de confianza no da la alarma por el jugador
    const pr = S.percibir(c, S.perfilJugador(), bono);
    if (pr.conf * 1.15 >= p.umbral && pr.d < p.radio) hall.push({ jugador: true, x: ctx.player.position.x, z: ctx.player.position.z, conf: Math.min(1, pr.conf * 1.15), grande: false, ref: null, t: now(c) });
  }
  for (const o of mgr.list) {
    if (o === c || !vivo(o) || !c.sp.ai.teme?.includes(o.especie)) continue;
    const d = dist2(c, o); if (d > p.radio) continue;
    const pr = S.percibir(c, S.perfilCriatura(o), bono);
    if (pr.conf * 1.15 >= p.umbral) hall.push({ jugador: false, x: o.position.x, z: o.position.z, conf: Math.min(1, pr.conf * 1.15), grande: o.sp.ai.caza?.length > 0 && o.sp.peligro >= 0.5, ref: o, t: now(c) });
  }
  if (!hall.length && Math.random() < p.falsosPositivos) {
    const a = Math.random() * TAU, r = rnd(25, p.radio * 0.8);
    hall.push({ jugador: false, falso: true, x: c.position.x + Math.cos(a) * r, z: c.position.z + Math.sin(a) * r, conf: rnd(0.3, 0.45), grande: Math.random() < 0.5, ref: null, t: now(c) });
  }
  if (!hall.length) { notificar(c, h.def, { resultado: 'sin_hallazgos' }); return null; }
  hall.sort((a, b) => b.conf - a.conf);
  const best = hall[0];
  c.amenaza = best;
  notificar(c, h.def, { resultado: best.falso ? 'falso_positivo' : best.jugador ? 'jugador' : best.ref?.especie, conf: +best.conf.toFixed(2) });
  activarHab(c, 'llamada_alerta', { amenaza: best, forzar: false });
  return best;
}
