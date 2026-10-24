// MONTURA: el jugador cabalga una criatura domesticada y equipada con montura. Solo las especies cuya anatomía lo permite
// (catalogo.js → montura.jinete / tipos / ancla). La criatura sigue siendo la misma: usa su marcha con IK, su energía y sus
// límites de terreno; aquí solo se sustituye la IA por las órdenes del jinete mientras está montada.
//
// Controles: G monta / desmonta · W trote · Mayús galope (gasta energía del animal) · S frena · A/D desvían a los lados · el ratón dirige.
import { ITEMS } from '../core/items.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const shortest = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const SENTADO = 0.55; // los pies del jugador cuelgan por debajo del punto de silla

export function createMontura(ctx, player) {
  const cfg = ctx.config.player;
  let tiempo = 0;
  const api = {
    activa: null,

    /** Punto de silla en el mundo (x, y, z). */
    ancla(c, out = { x: 0, y: 0, z: 0 }) {
      const a = c.sp.montura.ancla, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      out.x = c.position.x + a[0] * cy + a[2] * sy; out.z = c.position.z - a[0] * sy + a[2] * cy;
      out.y = c.position.y + a[1] + (c.bobY ?? 0) * 0.6;
      return out;
    },

    /** ¿Puede el jugador montar a esta criatura ahora? { ok, motivo } */
    puede(c) {
      const r = c.rel, m = c.sp.montura;
      if (api.activa) return { ok: false, motivo: 'Ya vas montado' };
      if (!r || !m?.jinete) return { ok: false, motivo: `La anatomía de ${c.sp.nombre.toLowerCase()} no permite cabalgarla` };
      if (c.muerta) return { ok: false, motivo: 'Está muerta' };
      if (!r.dom) return { ok: false, motivo: 'Todavía no está domesticada' };
      const lomo = r.equipo.lomo, ap = lomo && ITEMS[lomo.item]?.aparejo;
      if (!ap?.monta || !m.tipos.includes(ap.monta)) return { ok: false, motivo: 'Necesita una montura adecuada' };
      if (c.distToPlayer() > c.sp.radius + 5) return { ok: false, motivo: 'Acércate más' };
      if (player.swimming || player.inWater) return { ok: false, motivo: 'No puedes montar en el agua' };
      if (['flee', 'charge', 'chase', 'defend'].includes(c.state)) return { ok: false, motivo: 'Está demasiado alterada' };
      if (c.hambre >= 0.95 || c.hp / c.hpMax < 0.25) return { ok: false, motivo: 'Está hambrienta o malherida' };
      return { ok: true };
    },

    montar(c) {
      const p = api.puede(c);
      if (!p.ok) { ctx.ui?.notify?.(p.motivo, 'warn'); return p; }
      api.activa = c; c.jinete = true; c.setState('ride'); c.speed = 0; c.wish = 0; c.tgt = null; c.tgtJugador = false;
      player.montura = c; player.velocity.set(0, 0, 0); player.onGround = true; player.sprinting = false; player.crouching = false;
      ctx.events.emit('montura:montar', { criatura: c, especie: c.especie });
      ctx.ui?.notify?.(`Montas a ${c.rel.nombre ?? c.nombre}`, 'ok');
      api.lateUpdate(0);
      return { ok: true };
    },

    /** Baja del animal. `forzado`: caída (muerte, pérdida de confianza). */
    desmontar(forzado = false) {
      const c = api.activa;
      if (!c) return false;
      api.activa = null; c.jinete = false; player.montura = null;
      if (!c.muerta) { c.setState('idle'); c.wish = 0; }
      const lado = c.sp.radius + 1.1, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      let x = c.position.x + cy * lado, z = c.position.z - sy * lado;
      if (!ctx.world.getHeight || ctx.world.getHeight(x, z) < 0.1) { x = c.position.x - cy * lado; z = c.position.z + sy * lado; }
      player.position.set(x, ctx.world.getHeight(x, z), z); player.velocity.set(0, 0, 0); player.onGround = true;
      if (forzado) ctx.survival?.damage?.(6, 'caída de la montura');
      ctx.events.emit('montura:desmontar', { criatura: c, forzado });
      return true;
    },

    /** Órdenes del jinete (la llama cerebro.js en lugar de la IA mientras `c.jinete`). */
    conducir(c, dt) {
      const k = ctx.input?.keys, sp = c.sp;
      c.setState('ride'); c.lookYaw = 0; c.lookPitch = 0; c.wish = 0;
      if (!k || ctx.state !== 'playing' || ctx.ui?.blocksInput) return;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      if (f === 0 && s === 0) return;
      // el animal gira hacia donde mira el jinete (con desvío lateral); no puede girar en seco
      const rumbo = player.yaw + Math.PI - s * 0.9, dy = shortest(rumbo - c.yaw), giro = (f > 0 ? 2.3 : 1.3) * dt;
      const paso = clamp(dy, -giro, giro);
      c.yaw += paso; c.yawRate = paso / Math.max(dt, 1e-4);
      if (f > 0) {
        const galope = (k.has('ShiftLeft') || k.has('ShiftRight')) && c.energia > 0.12;
        const v = galope ? sp.vel.run : sp.vel.walk + (sp.vel.run - sp.vel.walk) * 0.55;
        c.wish = Math.abs(dy) < 1.2 ? v : v * 0.3;
      }
    },

    /** Coloca al jugador sobre la silla DESPUÉS de que la fauna haya movido al animal (evita el desfase de un cuadro). */
    lateUpdate(dt) {
      const c = api.activa;
      if (!c) return;
      if (c.muerta || ctx.survival?.dead || ctx.state === 'dead') { api.desmontar(!!c.muerta); return; }
      const a = api.ancla(c, _a);
      player.position.set(a.x, a.y - SENTADO, a.z);
      player.velocity.set(Math.sin(c.yaw) * c.speed, 0, Math.cos(c.yaw) * c.speed);
      player.onGround = true; player.swimming = false; player.inWater = false; player.sprinting = false;
      ctx.camera.position.set(a.x, a.y - SENTADO + cfg.eyeHeight * 0.92, a.z);
      player.eyePosition.copy(ctx.camera.position);
      if (dt > 0 && c.speed > 0.5) {
        tiempo += dt;
        if (tiempo >= 60) { tiempo = 0; const g = ctx.survival?.saber?.ganar?.('manejo', 0.5); if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'manejo', nombre: 'Manejo de animales', nivel: g.nivel }); }
      }
    },
  };
  const _a = { x: 0, y: 0, z: 0 };
  ctx.events.on('player:died', () => { if (api.activa) api.desmontar(false); });
  return api;
}
