// CEREBRO: percepción periódica, metabolismo (energía y hambre), reacción por rol (presa / defensor / depredador / pasivo) y máquina de estados.
// Estados: idle graze wander rest alert flee stalk chase charge search feed defend follow (vuelve a su correa) ride (montado). Las habilidades (habilidades.js) se evalúan aquí cada ciclo.

import { tickHab, tieneHab, escanear, registrarUso } from './habilidades.js';
import { trato, sentirRel, tickRel, depredadorHabituado, noCazaJugador, correa } from './vinculo.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const sh = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const vivo = (o) => !o.muerta && !o.flight;

export const SENSE_DT = 0.28;

/** Prepara en la criatura los campos de IA nuevos (se llama desde el constructor). */
export function iniciarCerebro(c) {
  const sp = c.sp, ai = sp.ai;
  c.energia = 1; c.hambre = (ai.caza?.length ? rnd(0.35, 0.8) : rnd(0.1, 0.5)); c.sosp = 0; c.pConf = 0; c.pDist = 1e9; c.pBear = 0; c.lastSeen = null;
  c.senseT = rnd(0, SENSE_DT); c.autoT = rnd(0, 0.2); c.amenaza = null; c.presa = null; c.tgt = null; c.tgtJugador = false;
  c.provocado = 0; c.display = 0; c.lastDisplay = -99; c.scanT = 0; c.scanPend = false; c.lastScan = rnd(-6, 0); c.llamadaAnim = 0;
  c.carga = 0; c.cargaDano = 0; c.tailSwing = -1; c.tailSide = 1; c.tailHit = true; c.tailDano = 0; c.tailStun = 0; c.tailRadio = 5;
  c.burst = 0; c.emboscadaBonus = 1; c.distMin = 1e9; c.cdCaza = 0; c.restLen = 8; c.stun = 0; c.movMul = 1; c.speedMul = 1;
  c.noRastroHasta = 0; c.searchT = 0; c.perdidoT = 0; c.alertaPend = []; c.carcass = null; c.feedT = 0; c.devorado = 0; c.dueno = null; c.vinculo = 0;
  c.armaduraF = null; c.armaduraT = null; c.formacionActiva = false; c.zig = 0; c.zigT = 0; c.alertaT = 0; c.fleeFrom = null;
}

const esDepMayor = (o) => (o.sp.ai.caza?.length ?? 0) > 0 && o.sp.peligro >= 0.5;

function setAmenaza(c, rec, now) {
  const a = c.amenaza;
  if (!a || now - a.t > 1.2 || rec.conf >= a.conf * 0.9 || (rec.ref && rec.ref === a.ref)) { rec.t = now; c.amenaza = rec; }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
/** Percepción periódica: jugador y criaturas relacionadas (teme / caza). */
function sentir(c, playing, now) {
  const S = c.mgr.sentidos, ai = c.sp.ai, sp = c.sp, list = c.mgr.list;
  const sen = sp.sentidos ?? { vista: ai.vista ?? 0, oido: 0, olfato: 0 };
  // ---- jugador
  if (playing && c.ctx.player) {
    const pr = S.percibir(c, S.perfilJugador());
    c.pConf = pr.conf; c.pDist = pr.d; c.pBear = pr.bear;
    if (pr.conf > 0.12) { c.sosp = Math.min(1.6, c.sosp + pr.conf * 2.2 * SENSE_DT); if (pr.conf > 0.3) c.lastSeen = { x: c.ctx.player.position.x, z: c.ctx.player.position.z, t: now }; } else c.sosp = Math.max(0, c.sosp - SENSE_DT * 0.22);
    // ¿el jugador es una amenaza para esta criatura?
    // el vínculo (habituación, manejo) reduce cuánto le asusta el jugador (trato: 1 salvaje … 0 propio)
    const tr = trato(c);
    const huyeJ = ai.huye === 1 && pr.d < (ai.huyeDist ?? sen.vista * 0.6) * tr;
    const intruso = ai.defiende && pr.d < (c.state === 'defend' ? 16 : 10.5) * tr && pr.conf > 0.25 && c.sosp > 0.5;
    const vigiaJ = sp.vigia && pr.conf > 0.3 && tr > 0.5; // el vigía sí registra al jugador a mayor distancia (para avisar)
    if ((huyeJ || intruso || vigiaJ) && pr.conf > 0.25) setAmenaza(c, { x: c.ctx.player.position.x, z: c.ctx.player.position.z, conf: pr.conf, ref: null, jugador: true, grande: false, d: pr.d }, now);
  } else { c.pConf = 0; c.pDist = 1e9; c.sosp = Math.max(0, c.sosp - SENSE_DT * 0.5); }
  if (c.rel) sentirRel(c, SENSE_DT, now, playing);
  // ---- criaturas
  const maxR = Math.max(sen.vista, sen.oido, sen.olfato) * 1.2;
  const teme = ai.teme, caza = ai.caza;
  let best = null, bs = 0.25;
  const hunt = caza?.length && c.cdCaza <= 0 && c.hambre >= (sp.hambre?.caza ?? 0.4) && c.energia > 0.45;
  if (!(teme?.length) && !hunt) { c.presa = null; return; }
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === c || !vivo(o) || o.especie === c.especie) continue;
    const dx = o.position.x - c.position.x, dz = o.position.z - c.position.z;
    if (dx * dx + dz * dz > maxR * maxR) continue;
    const esTeme = teme?.includes(o.especie), esPresa = hunt && caza.includes(o.especie);
    if (!esTeme && !esPresa) continue;
    const pr = S.percibir(c, S.perfilCriatura(o));
    if (esTeme && pr.conf > 0.22) setAmenaza(c, { x: o.position.x, z: o.position.z, conf: pr.conf, ref: o, jugador: false, grande: esDepMayor(o), d: pr.d }, now);
    if (esPresa && pr.conf > 0.2) {
      let near = 0; if (o.herd) for (const m of o.herd.members) if (m !== o && vivo(m) && Math.hypot(m.position.x - o.position.x, m.position.z - o.position.z) < 18) near++;
      const riesgo = o.sp.peligro * (1 + 0.35 * near), beneficio = 0.4 + c.hambre * 0.8 + 0.25 * Math.min(1, (o.sp.masa ?? 100) / Math.max(1, sp.masa ?? 100));
      if (riesgo > beneficio * (sp.peligro >= 1 ? 1.15 : 0.9)) continue; // no compensa
      const s = pr.conf * 0.9 + (1 - Math.min(1, pr.d / Math.max(30, sen.vista))) * 0.35 + (1 - Math.min(1, riesgo)) * 0.5 + (1 - o.hp / o.hpMax) * 0.2;
      if (s > bs) { bs = s; best = { c: o, conf: pr.conf, t: now }; }
    }
  }
  c.presa = best;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
function metabolismo(c, dt) {
  const sp = c.sp, E = sp.energia ?? { esprint: 8, recup: 0.05 }, H = sp.hambre ?? { tasa: 0.05 };
  const rapido = c.speed > sp.vel.walk * 1.35;
  if (rapido) c.energia = Math.max(0, c.energia - (dt / E.esprint) * clamp(c.speed / sp.vel.run, 0.5, 1.2) * ((c.jinete || c.state === 'follow') && c.speed < sp.vel.run * 0.85 ? 0.2 : 1)); // al trote (con jinete o siguiéndote) se cansa poco; al galope, como siempre
  else c.energia = Math.min(1, c.energia + dt * E.recup * (c.state === 'rest' ? 2.4 : 1));
  c.hambre = Math.min(1.2, c.hambre + (dt * H.tasa) / 60);
  if (c.state === 'graze') c.hambre = Math.max(0, c.hambre - dt * 0.035);
  c.speedMul = (c.energia > 0.15 ? 1 : 0.45 + c.energia * 3.6) * c.movMul;
  c.provocado = Math.max(0, c.provocado - dt); c.cdCaza = Math.max(0, c.cdCaza - dt);
  c.carga = Math.max(0, c.carga - dt); c.burst = Math.max(0, c.burst - dt);
}

const info0 = (p) => p.info;
function procesarAlertas(c, dt, now) {
  if (!c.alertaPend.length) return;
  for (let i = c.alertaPend.length - 1; i >= 0; i--) {
    const p = c.alertaPend[i]; p.t -= dt;
    if (p.t > 0) continue;
    c.alertaPend.splice(i, 1);
    if (info0(p).jugador && c.rel?.manejo && c.provocado <= 0) continue; // quien ya es de confianza sabe que el jugador no es una amenaza
    const { info, aud } = p, conf = info.conf * (0.55 + 0.45 * aud);
    const rec = { x: info.x, z: info.z, conf, ref: info.ref, jugador: info.jugador, grande: info.grande, indirecta: true, falso: info.falso, d: Math.hypot(info.x - c.position.x, info.z - c.position.z), t: now };
    if (!c.amenaza || now - c.amenaza.t > 2 || conf > c.amenaza.conf) c.amenaza = rec;
    if (c.state === 'idle' || c.state === 'graze' || c.state === 'wander' || c.state === 'rest' || c.state === 'feed') { c.setState('alert'); c.alertaT = 0; }
    c.lookPoint = { x: info.x, z: info.z, t: now };
    if (conf >= 0.4 && !info.falso && rec.d < 90 && (c.sp.ai.huye === 1 || c.sp.vigia)) { c.fleeT = rnd(4.5, 7); c.setState('flee'); }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
function iniciaHuida(c, secs = rnd(4, 7)) { c.fleeT = secs; c.setState('flee'); }

function ataqueGolpe(c, t, ai, dmgBase) {
  const ctx = c.ctx;
  let dmg = dmgBase * rnd(0.8, 1.2);
  if (c.emboscadaBonus > 1) { dmg *= c.emboscadaBonus; c.emboscadaBonus = 1; }
  if (c.carga > 0 && c.cargaDano) dmg = c.cargaDano * rnd(0.9, 1.15);
  const l = Math.max(0.01, Math.hypot(t.dx, t.dz));
  if (t.jugador) {
    c.mgr.hitPlayer(c, dmg);
    if (ai.defiende) { const pl = ctx.player; const k = c.carga > 0 ? 13 : 9; pl.velocity.x += (t.dx / l) * k; pl.velocity.z += (t.dz / l) * k; pl.velocity.y = Math.max(pl.velocity.y, c.carga > 0 ? 5.5 : 4.5); }
  } else if (t.ref && vivo(t.ref)) {
    t.ref.damage(dmg, 'criatura', c);
    t.ref.kn.x += (t.dx / l) * (c.carga > 0 ? 7 : 3.5) / Math.max(0.6, t.ref.sp.radius); t.ref.kn.z += (t.dz / l) * (c.carga > 0 ? 7 : 3.5) / Math.max(0.6, t.ref.sp.radius);
  }
  if (c.carga > 0) c.carga = 0;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
/** Decide la reacción de una criatura que está en reposo / paseando según lo que percibe. */
function reaccionar(c, playing, now) {
  const sp = c.sp, ai = sp.ai;
  const hot = c.amenaza && now - c.amenaza.t < 4 ? c.amenaza : null;
  const pred = (ai.caza?.length ?? 0) > 0 || ai.agresivo;
  // depredador: primero lo que le amenaza; luego presa; luego jugador
  if (hot && sp.ai.teme?.length && hot.conf >= 0.3 && (!hot.ref || sp.ai.teme.includes(hot.ref.especie)) && !ai.defiende) {
    if (c.state !== 'alert' && c.state !== 'flee') { c.setState('alert'); c.alertaT = 0; }
    return;
  }
  if (hot && ai.defiende && hot.conf >= 0.3) { c.setState('defend'); return; }
  if (pred && c.cdCaza <= 0) {
    if (c.presa && vivo(c.presa.c) && now - c.presa.t < 4) { c.tgt = { c: c.presa.c }; c.tgtJugador = false; c.setState('alert'); c.alertaT = 0; return; }
    if (playing && c.sosp >= 1 && !c.grace() && c.alcanza(c.ctx.player.position.x, c.ctx.player.position.z)) {
      // un depredador habituado ya no te teme ni defiende su territorio contra ti, pero el hambre sigue mandando
      const quiere = depredadorHabituado(c) ? !noCazaJugador(c)
        : ai.agresivo === true && (c.hambre >= 0.2 || c.pDist < 30) || c.hambre >= (sp.hambre?.caza ?? 0.45) || c.pDist < 14 || c.provocado > 0;
      if (quiere) { c.tgt = null; c.tgtJugador = true; c.setState('alert'); c.alertaT = 0; return; }
    }
  } else if (!pred && hot && hot.conf >= 0.3 && (c.sp.ai.huye === 1 || sp.vigia)) {
    if (c.state !== 'alert') { c.setState('alert'); c.alertaT = 0; }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
export function pensar(c, dt) {
  const sp = c.sp, ai = sp.ai, ctx = c.ctx, now = ctx.time.elapsed;
  const playing = ctx.state === 'playing' && !ctx.survival?.dead;
  c.stateT += dt; c.enrage = Math.max(0, c.enrage - dt);
  c.wish = 0; c.yawRate = 0;
  c.display = Math.max(0, c.display - dt); c.llamadaAnim = Math.max(0, c.llamadaAnim - dt);
  const pl = ctx.player?.position;
  const d = playing ? c.distToPlayer() : 1e9;
  metabolismo(c, dt);
  if (c.rel) tickRel(c, dt);
  if (c.jinete) { c.ctx.montura?.conducir(c, dt); c.wish *= c.speedMul; return; } // el jugador manda: sin IA propia mientras lo monta
  if (c.stun > 0) { c.stun -= dt; c.speed *= 0.9; return; }
  procesarAlertas(c, dt, now);
  c.senseT -= dt; if (c.senseT <= 0) { c.senseT = SENSE_DT + rnd(0, 0.08); sentir(c, playing, now); }
  tickHab(c, dt);
  if (c.rel?.manejo && (c.state === 'idle' || c.state === 'graze' || c.state === 'wander' || c.state === 'rest')) {
    const L = correa(c);
    if (L && Math.hypot(L.x - c.position.x, L.z - c.position.z) > L.R * 1.3) { c.scanT = 0; c.setState('follow'); } // un animal bajo manejo deja de vigilar si lo llaman
  }
  if (c.hp / c.hpMax > 0.6 || c.state === 'flee') { /* sin efecto: se mantiene la lógica del estado */ }

  // escaneo de vigía: se queda quieto con la cabeza alta
  if (c.scanT > 0 && (c.state === 'idle' || c.state === 'graze' || c.state === 'wander')) {
    c.scanT -= dt; c.wish = 0;
    if (c.scanPend && c.scanT < 1.0) escanear(c);
    if (c.amenaza && now - c.amenaza.t < 1) { c.scanT = 0; c.setState('alert'); }
    return;
  }

  const t = c.objetivoPos();
  const S = sp.sentidos;
  const sight = (S?.vista ?? ai.vista ?? 40) * (ctx.player?.crouching ? 0.55 : 1);
  void sight;

  switch (c.state) {
    case 'idle': {
      reaccionar(c, playing, now);
      if (c.state !== 'idle') break;
      c.lookYaw = Math.sin(c.t * 0.4 + c.id) * 0.5; c.lookPitch = 0;
      if (c.lookPoint && now - c.lookPoint.t < 3) c.lookYaw = clamp(sh(Math.atan2(c.lookPoint.x - c.position.x, c.lookPoint.z - c.position.z) - c.yaw), -0.9, 0.9);
      if (c.stateT > c.idleLen) {
        const pasta = sp.tipo === 'herbivoro' || sp.tipo === 'presa' ? 0.3 + 0.5 * c.hambre : 0.15;
        if (!ai.vuelo && Math.random() < pasta) c.setState('graze'); else { c.pickGoal(sp.scale < 0.5 ? 14 : 30); c.setState('wander'); }
        c.idleLen = rnd(2.5, 7);
      }
      break;
    }
    case 'graze': {
      reaccionar(c, playing, now);
      if (c.state !== 'graze') break;
      if (c.stateT > rnd(5, 9)) { c.pickGoal(30); c.setState('wander'); }
      break;
    }
    case 'wander': {
      reaccionar(c, playing, now);
      if (c.state !== 'wander') break;
      // los animales grandes y tranquilos no pasan por encima del jugador: si lo tienen delante y cerca, eligen otro rumbo
      // (el pisoteo sigue alcanzando a quien se mete bajo sus patas, pero un saurópodo que pasea no aplasta a quien está quieto)
      if (playing && ctx.player && sp.scale > 0.9) {
        const pp = ctx.player.position, dx = pp.x - c.position.x, dz = pp.z - c.position.z, d = Math.hypot(dx, dz);
        if (d < sp.radius + 5 && (dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw)) / Math.max(0.01, d) > 0.35) {
          const a = Math.atan2(-dx, -dz) + rnd(-0.8, 0.8), R = rnd(14, 30);
          c.goal.set(c.position.x + Math.sin(a) * R, 0, c.position.z + Math.cos(a) * R);
        }
      }
      const dist = Math.hypot(c.goal.x - c.position.x, c.goal.z - c.position.z);
      if (dist < 1.5 + sp.radius || c.stateT > 30) { c.setState('idle'); c.idleLen = rnd(2.5, 7); break; }
      c.steer(c.goal.x, c.goal.z, dt, sp.vel.walk, sp.scale > 0.9 ? 1.1 : 2.2);
      break;
    }
    case 'follow': {
      reaccionar(c, playing, now);
      if (c.state !== 'follow') break;
      const L = correa(c);
      if (!L) { c.setState('idle'); break; }
      const dd = Math.hypot(L.x - c.position.x, L.z - c.position.z);
      if (dd < L.R * 0.55) { c.setState('idle'); c.idleLen = rnd(1.5, 4); break; }
      const pv = c.rel.orden === 'seguir' && ctx.player ? Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) : 0;
      let v = clamp(Math.max(pv * 1.15, sp.vel.walk * 1.25) + Math.max(0, dd - L.R) * 0.3, sp.vel.walk, sp.vel.run * 0.85); // más rápido cuanto más rezagado
      if (dd > L.R * 4) v = sp.vel.run * 0.85;
      c.steer(L.x, L.z, dt, v, 2.4);
      break;
    }
    case 'rest': {
      reaccionar(c, playing, now);
      if (c.state !== 'rest') break;
      c.lookPitch = 0.2;
      if (c.stateT > c.restLen && c.energia > 0.5) { c.setState('idle'); c.idleLen = rnd(2, 5); }
      break;
    }
    case 'alert': {
      c.alertaT += dt;
      const a = c.amenaza && now - c.amenaza.t < 6 ? c.amenaza : null;
      const predador = c.tgt || c.tgtJugador;
      if (predador) {
        const tt = t;
        if (!tt) { c.setState('idle'); break; }
        c.steer(c.position.x + tt.dx * 0.01, c.position.z + tt.dz * 0.01, dt, 0, 3.5);
        c.lookYaw = clamp(sh(Math.atan2(tt.dx, tt.dz) - c.yaw), -0.9, 0.9); c.lookPitch = -0.1;
        // sin habilidad de acecho decide solo (tras un breve examen)
        if (c.stateT > 0.95 && c.state === 'alert') { if (!tieneHab(c, 'acecho') || tt.d < (c.sp.habParams?.acecho?.dEmboscada ?? 12) * 1.3) { if (ai.agresivo) c.roar(true); c.setState('chase'); } }
        if (tt.jugador ? c.sosp < 0.2 && c.pConf < 0.05 : false) c.setState('idle');
        if (tt.d > (S?.vista ?? 40) * 2.2) c.setState('idle');
        break;
      }
      if (!a) { if (c.alertaT > 1.5) c.setState('idle'); break; }
      // presa / defensor: mira a la amenaza y decide
      const ax = a.x - c.position.x, az = a.z - c.position.z, ad = Math.hypot(ax, az);
      c.steer(c.position.x + ax * 0.01, c.position.z + az * 0.01, dt, 0, 3.2);
      c.lookYaw = clamp(sh(Math.atan2(ax, az) - c.yaw), -0.9, 0.9); c.lookPitch = -0.05;
      if (ai.defiende) { if (a.conf >= 0.3) c.setState('defend'); break; }
      const huyeD = ai.huyeDist ?? (S?.vista ?? 40) * 0.6;
      if (!a.falso && (ad < huyeD || (a.conf > 0.6 && c.alertaT > 1.1 && a.grande) || (a.indirecta && a.conf > 0.5 && c.alertaT > 0.8))) iniciaHuida(c);
      else if (c.alertaT > (a.falso ? 2.4 : 4.2) && now - a.t > 1.5) { c.setState('idle'); c.amenaza = null; }
      break;
    }
    case 'flee': {
      c.fleeT -= dt;
      const a = c.amenaza && now - c.amenaza.t < 8 ? c.amenaza : null;
      let fx, fz;
      if (a) { fx = a.x; fz = a.z; } else if (pl && playing) { fx = pl.x; fz = pl.z; } else { fx = c.position.x - Math.sin(c.yaw); fz = c.position.z - Math.cos(c.yaw); }
      const ax = c.position.x - fx, az = c.position.z - fz, l = Math.hypot(ax, az) || 1;
      let tx = c.position.x + (ax / l) * 22, tz = c.position.z + (az / l) * 22;
      if (!c.walkable(tx, tz)) { tx = c.position.x - (az / l) * 22; tz = c.position.z + (ax / l) * 22; }
      if (tieneHab(c, 'huida_coordinada') && c.herd?.center) { tx += (c.herd.center.x - c.position.x) * 0.22; tz += (c.herd.center.z - c.position.z) * 0.22; }
      if (tieneHab(c, 'esprint_zigzag')) {
        c.zigT -= dt; if (c.zigT <= 0) { c.zigT = rnd(0.6, 1.0); c.zig = (Math.random() < 0.5 ? -1 : 1) * (c.sp.habParams?.esprint_zigzag?.amp ?? 0.45); }
        const dx = tx - c.position.x, dz = tz - c.position.z, cs = Math.cos(c.zig), sn = Math.sin(c.zig);
        tx = c.position.x + dx * cs - dz * sn; tz = c.position.z + dx * sn + dz * cs;
      }
      c.steer(tx, tz, dt, sp.vel.run * (tieneHab(c, 'esprint_zigzag') ? 0.94 : 1), 3.4);
      const lejos = a ? Math.hypot(a.x - c.position.x, a.z - c.position.z) > 42 : d > 24 || !playing;
      if (c.fleeT <= 0 && (lejos || !a)) { c.setState('idle'); c.amenaza = null; }
      break;
    }
    case 'stalk': {
      if (!t) { c.setState('idle'); break; }
      const dE = c.sp.habParams?.acecho?.dEmboscada ?? 12;
      c.steer(t.x, t.z, dt, sp.vel.walk * (c.sp.habParams?.acecho?.vel ?? 1.5), 1.6);
      c.lookPitch = 0.25; c.lookYaw = 0;
      if (t.jugador && c.pConf < 0.08) { c.perdidoT += dt; if (c.perdidoT > 3.5) { c.perdidoT = 0; c.setState('idle'); c.cdCaza = 8; break; } } else c.perdidoT = 0;
      if (t.d < dE && !tieneHab(c, 'emboscada')) { c.roar(true); c.setState('chase'); }
      if (t.d > (S?.vista ?? 40) * 2) c.setState('idle');
      break;
    }
    case 'chase': case 'charge': {
      const tt = t;
      if (!tt && !c.lastSeen) { c.setState('idle'); break; }
      if (c.nada && tt && tt.jugador && !c.alcanza(tt.x, tt.z)) { c.tgtJugador = false; c.setState('idle'); c.cdCaza = 6; c.sosp = Math.min(c.sosp, 0.4); break; } // el jugador salió del agua: un nadador no puede seguirlo
      if (c.tgt && c.tgt.c.muerta) { // presa abatida → a comer
        c.carcass = c.tgt.c; c.tgt = null; c.setState('feed'); c.feedT = 0; break;
      }
      const dist = tt ? tt.d : 1e9;
      if (c.stateT < 0.1) c.distMin = dist; c.distMin = Math.min(c.distMin, dist);
      if (c.state === 'chase') {
        if (c.tgtJugador && c.pConf < 0.1) { c.perdidoT += dt; if (c.perdidoT > 4.2) { c.perdidoT = 0; c.tgtJugador = false; if (tieneHab(c, 'rastreo_olor')) { c.setState('search'); c.searchT = 0; registrarUso(c, 'rastreo_olor', { causa: 'perdió de vista al jugador' }); } else c.setState('idle'); c.noRastroHasta = 0; if (c.state === 'idle') c.sosp = Math.min(c.sosp, 0.5); break; } } else c.perdidoT = 0;
        if (!c.tgtJugador && c.tgt && !(c.tgt.c && vivo(c.tgt.c))) { c.setState('idle'); break; }
      }
      if (c.state === 'charge' && c.enrage <= 0 && c.carga <= 0) { c.setState('idle'); break; }
      let tx = tt ? tt.x : c.lastSeen.x, tz = tt ? tt.z : c.lastSeen.z;
      if (ai.manada && dist > 6 && tt) { const a = Math.atan2(tt.dz, tt.dx) + Math.PI + c.flank * Math.min(1, dist / 18) * 0.5; tx = tt.x + Math.cos(a) * 2.2; tz = tt.z + Math.sin(a) * 2.2; }
      const mulV = (c.state === 'charge' ? 0.9 : 1) * (c.carga > 0 ? (sp.habParams?.embestida?.nuevo ?? 1.25) : 1) * (c.burst > 0 ? 1.2 : 1);
      c.steer(tx, tz, dt, sp.vel.run * mulV, c.carga > 0 ? 1.4 : 4.2);
      c.lookYaw = 0; c.atkCd -= dt;
      const reach = ai.ataque ?? 2;
      if (tt && dist < reach + (tt.ref ? tt.ref.sp.radius * 0.6 : 0) && c.atkCd <= 0 && Math.abs(sh(Math.atan2(tt.dx, tt.dz) - c.yaw)) < 0.7) { c.atkCd = ai.cd ?? 1.6; c.biteT = 0; c.struck = false; }
      if (c.hp / c.hpMax < (ai.huye ?? 0) && (ai.agresivo || ai.caza?.length)) iniciaHuida(c, rnd(5, 8));
      break;
    }
    case 'search': {
      c.searchT += dt;
      if (c.pConf > 0.3 && c.sosp >= 1) { if (noCazaJugador(c)) { c.setState('idle'); c.cdCaza = 10; c.sosp = Math.min(c.sosp, 0.4); break; } c.tgtJugador = true; c.setState('alert'); break; }
      c.rastroT = (c.rastroT ?? 0) - dt;
      if (c.rastroT <= 0) { c.rastroT = 0.45; c.rastro = c.mgr.sentidos.seguirRastro(c.position.x, c.position.z, now, 38); }
      if (!c.rastro || c.searchT > 60) { c.setState('idle'); c.cdCaza = 10; c.sosp = Math.min(c.sosp, 0.4); break; }
      c.steer(c.rastro.x, c.rastro.z, dt, sp.vel.walk * 1.7, 2.6);
      c.lookPitch = 0.3; c.lookYaw = Math.sin(c.t * 2.2) * 0.35;
      break;
    }
    case 'feed': {
      const o = c.carcass;
      if (!o || (o.deathT > 75) || o.devorado > 28) { c.carcass = null; c.setState('rest'); c.restLen = rnd(6, 10); break; }
      const dx = o.position.x - c.position.x, dz = o.position.z - c.position.z, dd = Math.hypot(dx, dz);
      const a = c.amenaza && now - c.amenaza.t < 3 ? c.amenaza : null;
      if (a && !ai.defiende && (ai.teme?.length) && a.conf > 0.35 && (!a.ref || ai.teme.includes(a.ref.especie))) { c.carcass = null; iniciaHuida(c); break; }
      const reachF = 1.2 + sp.radius;
      if (dd > reachF) { c.steer(o.position.x, o.position.z, dt, sp.vel.walk * 1.3, 2.0); c.lookPitch = 0.1; } else {
        c.feedT += dt; c.wish = 0; o.devorado += dt; o.dueno = c;
        c.hambre = Math.max(0, c.hambre - dt * 0.05);
        c.lookPitch = 0.55; c.jaw = Math.max(c.jaw, 0.25 + Math.sin(c.t * 7) * 0.2);
        c.steer(o.position.x, o.position.z, dt, 0, 2.5);
        if (c.hambre < 0.08 || c.feedT > 18) { c.carcass = null; c.setState('rest'); c.restLen = rnd(6, 10); }
      }
      break;
    }
    case 'defend': {
      const a = c.amenaza && now - c.amenaza.t < 7 ? c.amenaza : null;
      const hF = c.herd?.formacion;
      if (hF && now - hF.t > hF.dur) { c.herd.formacion = null; for (const m of c.herd.members) m.formacionActiva = false; }
      if (!a && c.provocado <= 0 && !(c.herd?.formacion)) { if (c.stateT > 2) { c.setState('idle'); c.formacionActiva = false; } break; }
      const ax = a ? a.x - c.position.x : 0, az = a ? a.z - c.position.z : 0, ad = Math.hypot(ax, az);
      const colas = tieneHab(c, 'cola_defensiva');
      // anillo de formación
      if (c.herd?.formacion && c.formacionActiva) {
        const miembros = c.herd.members.filter(vivo).sort((p, q) => p.id - q.id), n = miembros.length, i = Math.max(0, miembros.indexOf(c));
        const ang0 = Math.atan2(c.herd.formacion.z - c.herd.center.z, c.herd.formacion.x - c.herd.center.x), ang = ang0 + (TAU * i) / Math.max(1, n);
        const R = 2.8 + 1.0 * n;
        const sx = c.herd.center.x + Math.cos(ang) * R, sz = c.herd.center.z + Math.sin(ang) * R;
        if (Math.hypot(sx - c.position.x, sz - c.position.z) > 1.2) c.steer(sx, sz, dt, sp.vel.walk * 1.6, 2.2);
        else c.steer(c.position.x + Math.cos(ang), c.position.z + Math.sin(ang), dt, 0, 2.5);
        c.lookYaw = 0;
        if (ad < 9 && a) { c.enrage = 16; c.tgt = a.ref ? { c: a.ref } : null; c.tgtJugador = !!a.jugador; c.formacionActiva = false; c.setState('charge'); }
        break;
      }
      if (!a) { c.steer(c.position.x + Math.sin(c.yaw), c.position.z + Math.cos(c.yaw), dt, 0, 2); break; }
      if (colas) {
        // presenta la cola: gira para dar la espalda a la amenaza; si está muy lejos se aparta despacio
        const want = Math.atan2(ax, az) + Math.PI, dy = sh(want - c.yaw);
        c.yaw += clamp(dy, -2.0 * dt, 2.0 * dt); c.yawRate = clamp(dy, -2, 2);
        c.lookYaw = clamp(sh(Math.atan2(ax, az) - c.yaw), -0.6, 0.6) * 0.2;
        if (ad > 14 && c.provocado <= 0) c.stateT += dt; // se relaja
        if (ad > 22 && c.provocado <= 0) { c.setState('idle'); c.amenaza = null; }
        c.wish = ad < 3.5 && Math.abs(dy) < 0.6 ? sp.vel.walk * 0.6 : 0; // avanza algo para alejarse (la cola queda hacia la amenaza)
      } else {
        const dy = sh(Math.atan2(ax, az) - c.yaw);
        c.yaw += clamp(dy, -2.4 * dt, 2.4 * dt); c.yawRate = clamp(dy, -2.4, 2.4);
        c.lookYaw = 0;
        if ((ad < 9 && c.stateT > 1.2) || c.provocado > 0) { c.enrage = 18; c.tgt = a.ref ? { c: a.ref } : null; c.tgtJugador = !!a.jugador; c.setState('charge'); }
        else if (ad > 36) { c.setState('idle'); c.amenaza = null; }
      }
      break;
    }
    default: break;
  }
  if (c.override) { if (c.override.speed != null) c.wish = c.override.speed; }
  c.wish *= c.speedMul;
  // golpe (mordisco / embestida)
  if (c.biteT >= 0) {
    c.biteT += dt / (ai.agresivo ? 0.55 : 0.8);
    c.jaw = Math.sin(clamp(c.biteT, 0, 1) * Math.PI) * 0.7;
    if (!c.struck && c.biteT > 0.4) {
      c.struck = true;
      const tt = c.objetivoPos();
      if (tt && tt.d < (ai.ataque ?? 2) * 1.45 + (tt.ref ? tt.ref.sp.radius * 0.7 : 0)) ataqueGolpe(c, tt, ai, ai.dano ?? 5);
    }
    if (c.biteT >= 1) c.biteT = -1;
  }
  // golpe de cola
  if (c.tailSwing >= 0) {
    c.tailSwing += dt / 0.75;
    if (!c.tailHit && c.tailSwing > 0.38) {
      c.tailHit = true;
      const dirx = -Math.sin(c.yaw), dirz = -Math.cos(c.yaw), R = c.tailRadio, ctx2 = c.ctx;
      const objs = [];
      if (playing && pl) objs.push({ jugador: true, x: pl.x, z: pl.z });
      for (const o of c.mgr.list) if (o !== c && vivo(o) && o.especie !== c.especie && o.sp.peligro > 0.3 && o.sp.ai.caza?.length) objs.push({ ref: o, x: o.position.x, z: o.position.z });
      for (const ob of objs) {
        const dx = ob.x - c.position.x, dz = ob.z - c.position.z, dd = Math.hypot(dx, dz);
        if (dd > R + (ob.ref ? ob.ref.sp.radius : 0.4) || (dx * dirx + dz * dirz) / Math.max(0.01, dd) < 0.35) continue;
        const l = Math.max(0.01, dd), k = c.tailStun > 0 ? 12 : 9;
        if (ob.jugador) { c.mgr.hitPlayer(c, c.tailDano * rnd(0.85, 1.15), 'golpe de cola'); ctx2.player.velocity.x += (dx / l) * k; ctx2.player.velocity.z += (dz / l) * k; ctx2.player.velocity.y = Math.max(ctx2.player.velocity.y, 5); ctx2.events.emit('camera:shake', { intensidad: 0.5, dur: 0.4 }); } else { ob.ref.damage(c.tailDano * rnd(0.9, 1.1), 'criatura', c); ob.ref.kn.x += (dx / l) * k; ob.ref.kn.z += (dz / l) * k; if (c.tailStun > 0) ob.ref.stun = c.tailStun; }
      }
    }
    if (c.tailSwing >= 1) c.tailSwing = -1;
  }
}
