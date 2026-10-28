// Módulo PLAYER: input, controlador en primera persona (caminar, correr, agacharse, saltar, nadar), colisiones contra el
// terreno y los colisionadores estáticos, cámara con inercia y balanceo, interacción (golpear / recoger / beber),
// cámara cinematográfica del menú y físicas ligeras para objetos sueltos (ctx.physics).
import * as THREE from 'three';
import { createProps } from './props.js';
import { createViewmodel } from './viewmodel.js';
import { createProyectiles } from './proyectiles.js';
import { createMontura } from './montura.js';
import { ITEMS } from '../core/items.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export async function create(ctx) {
  const cfg = ctx.config.player;
  const world = ctx.world;
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, buttons: 0 };
  const input = (ctx.input = { keys, mouse, pointerLocked: false });
  const tmpArr = [];
  const interactables = new Map();
  let nextInteractableId = 1;

  const spawn = world.spawn.clone();
  const player = (ctx.player = {
    position: spawn.clone(), // pies
    velocity: new THREE.Vector3(),
    yaw: Math.atan2(spawn.x, spawn.z), // mirando hacia el centro de la isla (adelante = (-sen yaw, 0, -cos yaw))
    pitch: 0,
    onGround: true,
    inWater: false,
    swimming: false,
    sprinting: false,
    crouching: false,
    eyePosition: new THREE.Vector3(),
    get target() { return target; }, // objetivo apuntado (pruebas y depuración)
    ruidoExtra: 0, // ruido puntual (0..1.4) que oyen las criaturas; decae solo
    registerInteractable(def) {
      const id = nextInteractableId++;
      interactables.set(id, def);
      return () => interactables.delete(id);
    },
    teleport(x, z) {
      this.position.set(x, world.getHeight(x, z), z);
      this.velocity.set(0, 0, 0);
    },
    getLookRay(origin = new THREE.Vector3(), dir = new THREE.Vector3()) {
      ctx.camera.getWorldPosition(origin);
      ctx.camera.getWorldDirection(dir);
      return { origin, dir };
    },
  });

  ctx.physics = createProps(ctx);
  const viewmodel = (ctx.viewmodel = createViewmodel(ctx));
  const proyectiles = (ctx.proyectiles = createProyectiles(ctx));
  const montura = (ctx.montura = createMontura(ctx, player));

  // ------------------------------------------------------------------ input
  const BINDS = { KeyE: 'interactuar', Tab: 'inventario', Escape: 'pausa', KeyM: 'mapa', KeyG: 'montar' };
  const emitAction = (action, pressed, index) => ctx.events.emit('input:action', { action, pressed, index });
  const canvas = ctx.container;

  const onKeyDown = (e) => {
    if (e.repeat) return;
    if (e.code === 'Tab') e.preventDefault();
    keys.add(e.code);
    if (BINDS[e.code]) emitAction(BINDS[e.code], true);
    if (/^Digit[1-9]$/.test(e.code)) emitAction('hotbar', true, Number(e.code.slice(5)) - 1);
  };
  const onKeyUp = (e) => { keys.delete(e.code); if (BINDS[e.code]) emitAction(BINDS[e.code], false); };
  const onMouseMove = (e) => {
    if (!input.pointerLocked) return;
    mouse.dx += e.movementX; mouse.dy += e.movementY;
  };
  const onMouseDown = (e) => {
    if (ctx.state === 'playing' && !ctx.ui?.blocksInput && !input.pointerLocked && !ctx.debug.enabled) {
      canvas.requestPointerLock?.();
      return;
    }
    mouse.buttons |= 1 << e.button;
    if (e.button === 0) emitAction('usar', true);
  };
  const onMouseUp = (e) => { mouse.buttons &= ~(1 << e.button); if (e.button === 0) emitAction('usar', false); };
  const onLockChange = () => {
    input.pointerLocked = document.pointerLockElement === canvas;
    if (!input.pointerLocked && ctx.state === 'playing' && !ctx.ui?.blocksInput) emitAction('pausa', true);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', () => { keys.clear(); mouse.buttons = 0; });
  ctx.events.on('state', ({ state, prev }) => {
    if (state === 'playing' && prev === 'menu') {
      transition = 1;
      // el menú fue un gesto del usuario: pedimos el bloqueo del puntero ahora
      if (!ctx.debug.enabled) canvas.requestPointerLock?.();
    }
    if (state !== 'playing' && document.pointerLockElement) document.exitPointerLock?.();
  });
  ctx.events.on('player:died', () => ctx.setState('dead'));
  ctx.events.on('player:respawn', () => {
    ctx.setState('playing');
    const p = world.spawn;
    player.teleport(p.x, p.z);
  });

  // ------------------------------------------------------------------ estado interno
  let eye = cfg.eyeHeight;
  let bob = 0, bobAmp = 0, landKick = 0, fovBoost = 0, roll = 0, shake = 0;
  let coyote = 0, jumpQueued = false, swingCd = 0, fall = 0;
  let stepDist = 0;
  let transition = 0; // 1 → 0: fundido de la cámara orbital a la del jugador
  const menuCam = { angle: 0.6, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const wish = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const rayO = new THREE.Vector3();
  const rayD = new THREE.Vector3();
  let target = null;
  let lastTargetKey = '';

  ctx.events.on('player:damage', ({ cantidad }) => { shake = Math.min(1, shake + (cantidad ?? 5) / 30); });
  ctx.events.on('camera:shake', ({ intensidad = 0.5 } = {}) => { shake = Math.min(1, shake + intensidad); });

  // ------------------------------------------------------------------ colisiones
  function resolveColliders(pos, radius) {
    const list = world.colliders.query(pos.x, pos.z, radius, tmpArr);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (pos.y > world.getHeight(c.x, c.z) + c.height) continue; // por encima del obstáculo
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz) || 1e-4;
      const min = c.radius + radius;
      if (d < min) { pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
    }
  }

  function tryMove(pos, dx, dz) {
    // sube escalones y pendientes suaves; bloquea paredes (se desliza por cada eje por separado)
    const maxStep = 0.55 + (player.onGround ? 0.25 : 0);
    const nx = pos.x + dx, nz = pos.z + dz;
    if (world.getHeight(nx, nz) - pos.y <= maxStep) { pos.x = nx; pos.z = nz; return; }
    if (world.getHeight(pos.x + dx, pos.z) - pos.y <= maxStep) pos.x += dx;
    else if (world.getHeight(pos.x, pos.z + dz) - pos.y <= maxStep) pos.z += dz;
  }

  // ------------------------------------------------------------------ física del jugador (60 Hz)
  function fixedUpdate(dt) {
    if (ctx.state !== 'playing' || ctx.debug.freeCamera || ctx.ui?.blocksInput) return;
    if (player.montura) return; // montado: la posición la fija la montura (montura.js)
    const p = player.position, v = player.velocity;
    const sea = world.seaLevel;
    const ground = world.getHeight(p.x, p.z);
    const depth = sea - ground; // >0 bajo el agua
    const wasSwimming = player.swimming;
    player.inWater = depth > 0.15;
    player.swimming = depth > 1.05 || (wasSwimming && depth > 0.7);

    // dirección deseada
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const energy = ctx.survival?.stats?.energia ?? 100;
    const wantsSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    player.crouching = (keys.has('ControlLeft') || keys.has('KeyC')) && !player.swimming;
    player.sprinting = wantsSprint && f > 0 && !player.crouching && energy > 4 && !player.swimming;

    fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    wish.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
    if (wish.lengthSq() > 1) wish.normalize();

    let speed = player.swimming ? cfg.swimSpeed : player.crouching ? cfg.crouchSpeed : player.sprinting ? cfg.sprintSpeed : cfg.walkSpeed;
    if (player.inWater && !player.swimming) speed *= 0.72; // vadeo
    if (player.onGround && !player.swimming) speed *= 1 - clamp(world.getSlope(p.x, p.z) * 0.9, 0, 0.35); // cuesta arriba/abajo

    const accel = player.onGround || player.swimming ? 11 : 2.4;
    v.x = damp(v.x, wish.x * speed, accel, dt);
    v.z = damp(v.z, wish.z * speed, accel, dt);

    if (player.swimming) {
      // flotación: sube a la superficie salvo que se bucee; espacio = subir, Ctrl = bucear
      const surfaceY = sea + world.water.getWaveHeight(p.x, p.z, ctx.time.elapsed) - 0.3; // los ojos (0.55 m) quedan 25 cm sobre el agua
      const vertWish = (keys.has('Space') ? 1 : 0) - (player.crouching || keys.has('ControlLeft') ? 1 : 0);
      const diving = p.y < surfaceY - 0.15;
      let target = vertWish * 2.6;
      if (vertWish === 0) target = (surfaceY - p.y) * (diving ? 1.2 : 3.0);
      v.y = damp(v.y, target, 4, dt);
      if (wish.lengthSq() > 0.01) v.y += Math.sin(pitchForSwim()) * speed * 0.55 * Math.min(1, wish.length());
      player.onGround = false;
    } else {
      v.y -= ctx.config.physics.gravity * dt;
      if (jumpQueued && coyote > 0 && !player.crouching) {
        v.y = cfg.jumpSpeed; coyote = 0; player.onGround = false;
        ctx.events.emit('player:jump', { position: p });
        if (ctx.survival?.stats) ctx.survival.stats.energia = Math.max(0, ctx.survival.stats.energia - 3);
      }
    }
    jumpQueued = false;

    const hMag = Math.hypot(v.x, v.z);
    if (hMag > 1e-3) {
      // subpasos para no atravesar obstáculos finos a alta velocidad
      const n = Math.max(1, Math.ceil((hMag * dt) / 0.25));
      for (let i = 0; i < n; i++) {
        tryMove(p, (v.x * dt) / n, (v.z * dt) / n);
        resolveColliders(p, cfg.radius);
      }
    }
    p.y += v.y * dt;

    const gy = world.getHeight(p.x, p.z);
    const wasGround = player.onGround;
    if (!player.swimming && p.y <= gy) {
      if (!wasGround && v.y < -3) {
        landKick = clamp(-v.y / 14, 0, 1);
        ctx.events.emit('player:land', { position: p, speed: -v.y });
        if (-v.y > 15) ctx.survival?.damage?.((-v.y - 15) * 7, 'caída');
      }
      p.y = gy; v.y = 0; player.onGround = true; coyote = 0.12;
    } else {
      player.onGround = !player.swimming && p.y - gy < 0.06;
      if (!player.onGround) coyote = Math.max(0, coyote - dt);
    }
    if (player.swimming) {
      const top = sea - 0.3 + 0.12; // no se puede nadar por encima de la superficie
      if (p.y > top) { p.y = top; if (v.y > 0) v.y = 0; }
      if (p.y < gy + 0.3) p.y = gy + 0.3;
    }

    // pasos
    if (player.onGround && hMag > 0.6) {
      stepDist += hMag * dt;
      const stride = player.sprinting ? 2.6 : player.crouching ? 1.6 : 2.0;
      if (stepDist > stride) {
        stepDist = 0;
        ctx.events.emit('player:footstep', { surface: player.inWater ? 'agua' : world.getSurface(p.x, p.z), speed: hMag, position: p });
      }
    }
    // límites del mundo: pared invisible (cuadrada) lejos de la costa, en mar abierto
    const lim = world.limite;
    if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim;
    if (p.z > lim) p.z = lim; else if (p.z < -lim) p.z = -lim;
  }
  const pitchForSwim = () => -player.pitch; // mirar hacia abajo = bucear

  // ------------------------------------------------------------------ interacción
  function currentWeapon() { return ctx.survival?.equipped ?? null; }

  function scanTarget() {
    player.getLookRay(rayO, rayD);
    let best = null;
    const ws = ctx.survival?.weaponStats?.();
    const reach = ws && !ws.distancia ? Math.max(cfg.reach, ws.alcance || 0) : cfg.reach;
    const fl = ctx.flora?.pick?.(rayO, rayD, reach);
    if (fl) best = { kind: 'flora', hit: fl, dist: fl.distance, nombre: fl.nombre ?? labelFlora(fl.tipo), tipo: fl.tipo, vida: fl.vida };
    const fa = ctx.fauna?.pick?.(rayO, rayD, reach + 0.6);
    if (fa && (!best || fa.distance < best.dist)) best = { kind: 'fauna', hit: fa, dist: fa.distance, nombre: fa.criatura?.nombre ?? 'Criatura', tipo: 'criatura', vida: fa.criatura?.vida };
    // interactuables genéricos
    let ib = null, bd = 1e9;
    for (const def of interactables.values()) {
      const dx = def.position.x - player.position.x, dz = def.position.z - player.position.z, dy = def.position.y - player.position.y;
      const d = Math.hypot(dx, dy, dz);
      if (d > (def.radius ?? 2.2) + 1.0) continue;
      // dentro del cono de la mirada
      const tx = def.position.x - rayO.x, ty = def.position.y + 0.3 - rayO.y, tz = def.position.z - rayO.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const dot = (tx * rayD.x + ty * rayD.y + tz * rayD.z) / tl;
      if (dot > 0.86 && tl < bd) { bd = tl; ib = def; }
    }
    if (ib && (!best || bd < best.dist)) best = { kind: 'interactuable', hit: ib, dist: bd, nombre: ib.label ?? 'Objeto', tipo: 'objeto' };
    // agua
    if (!best && rayD.y < -0.05) {
      const t = (world.seaLevel - rayO.y) / rayD.y;
      if (t > 0 && t < reach + 1.2) best = { kind: 'agua', dist: t, nombre: 'Agua', tipo: 'agua' };
    }
    return best;
  }
  const labelFlora = (t) => ({ arbol: 'Árbol', roca: 'Roca', arbusto: 'Arbusto', baya: 'Bayas', planta: 'Planta', cactus: 'Cactus' }[t] ?? 'Recurso');
  const actionFor = (t) => {
    if (!t) return null;
    if (t.kind === 'agua') return 'Beber';
    if (t.kind === 'interactuable') return t.hit.getPrompt?.() ?? t.hit.label ?? 'Usar';
    if (t.kind === 'fauna') return 'Atacar';
    if (t.tipo === 'arbol') return 'Talar';
    if (t.tipo === 'roca') return 'Picar';
    if (t.tipo === 'baya') return 'Recoger';
    if (t.tipo === 'cactus') return ctx.survival?.weaponStats?.()?.tags?.includes('corta') ? 'Sacar agua' : 'Recolectar';
    return 'Recolectar';
  };

  function publishTarget() {
    target = scanTarget();
    // criaturas con trato posible: nivel de relación y acción de la tecla E
    let rel = null;
    if (target?.kind === 'fauna' && target.hit.criatura?.rel) {
      const c = target.hit.criatura, V = ctx.fauna.vinculo, i = V.info(c);
      rel = { nivel: i.nivel, nivelNombre: i.nivelNombre, max: i.max, hab: i.hab, conf: i.conf, propio: i.propio, nombre: i.nombre, accionE: V.accionE(c), hambre: i.hambre, montable: i.montable };
    }
    const key = target ? `${target.kind}|${target.nombre}|${Math.round((target.vida ?? 0))}${rel ? `|${rel.nivel}|${Math.round(rel.hab * 20)}|${Math.round(rel.conf * 20)}|${rel.accionE}|${rel.nombre}` : ''}` : '';
    if (key === lastTargetKey) return;
    lastTargetKey = key;
    ctx.events.emit('player:target', target ? { nombre: rel?.propio ? rel.nombre : target.nombre, tipo: target.tipo, accion: actionFor(target), vida: target.vida, rel } : null);
  }

  function doInteract() {
    if (!target) return;
    if (target.kind === 'agua') { ctx.survival?.drink?.(18); ctx.audio?.play?.('beber'); return; }
    if (target.kind === 'interactuable') { target.hit.onInteract?.(); return; }
    if (target.kind === 'fauna') { if (target.hit.criatura?.rel) ctx.fauna.vinculo.interactuar(target.hit.criatura); return; }
    if (target.kind === 'flora' && (target.tipo === 'baya' || target.tipo === 'planta' || target.tipo === 'cactus')) strike(true);
  }

  const FISTS = { item: null, dano: 4, cd: 0.7, alcance: 0, penetra: 0, aturde: 0, tags: [], cal: 1, distancia: false };
  const ruido = (v) => { player.ruidoExtra = Math.max(player.ruidoExtra, v); };
  let pendiente = null; // disparo cargándose: { t, item }
  let sinMunAviso = 0;

  function strike(gather = false) {
    if (swingCd > 0 || pendiente) return;
    const sv = ctx.survival;
    const ws = sv?.weaponStats?.() ?? FISTS;
    if (ws.distancia && !gather) { iniciarDisparo(ws); return; }
    swingCd = ws.cd;
    ctx.events.emit('player:attack', { tool: ws.item, position: player.position, cd: ws.cd });
    fovBoost -= 0.4;
    const t = scanTarget();
    if (!t) { ruido(0.2); return; }
    if (t.kind === 'flora') {
      const esBaya = t.tipo === 'baya' || t.tipo === 'planta' || t.tipo === 'cactus';
      const r = ctx.flora.damage(t.hit.id, ws.dano, ws.item, ws.tags);
      if (r?.drops) for (const d of r.drops) {
        const left = sv?.inventory?.add?.(d.item, d.cantidad) ?? d.cantidad;
        if (left > 0) ctx.physics.spawnProp('loot', t.hit.position.clone().setY(t.hit.position.y + 1), new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3), d);
      }
      if (!esBaya) {
        ruido(t.tipo === 'roca' ? 0.9 : 0.7);
        const ok = (t.tipo === 'arbol' && ws.tags.includes('talar')) || (t.tipo === 'roca' && ws.tags.includes('picar'));
        sv?.desgastarMano?.(ok ? 1 : 2);
        if (r?.drops?.length) sv?.saber?.ganar?.('talla', 0.25);
      } else ruido(0.15);
      landKick += 0.12;
    } else if (t.kind === 'fauna') {
      ctx.fauna.damage(t.hit.criatura, ws.dano, 'jugador', { penetra: ws.penetra, aturde: ws.aturde });
      ruido(0.5);
      sv?.desgastarMano?.(1);
      const g = sv?.saber?.ganar?.('caza', 0.6);
      if (g?.subio) ctx.events.emit('saber:nivel', { hab: 'caza', nivel: g.nivel });
      landKick += 0.18;
    }
  }

  const _fd = new THREE.Vector3(), _fo = new THREE.Vector3(), _fr = new THREE.Vector3();
  function iniciarDisparo(ws) {
    const sv = ctx.survival, it = ITEMS[ws.item];
    if (it.municion) {
      if (sv.municion(it.municion) < 0) {
        if (ctx.time.elapsed > sinMunAviso) { sinMunAviso = ctx.time.elapsed + 1.5; ctx.ui?.notify?.(`Sin munición: ${it.municion === 'flecha' ? 'flechas' : 'guijarros'}`, 'warn'); ctx.events.emit('ui:sound', { nombre: 'ui_error' }); }
        swingCd = 0.3; return;
      }
    }
    swingCd = ws.cd;
    pendiente = { t: it.carga ?? 0, item: ws.item };
    ctx.events.emit('player:attack', { tool: ws.item, position: player.position, cd: ws.cd });
    fovBoost -= 0.25;
    if ((it.carga ?? 0) <= 0) soltarDisparo();
  }
  function soltarDisparo() {
    const sv = ctx.survival, pend = pendiente; pendiente = null;
    if (!pend) return;
    const ws = sv.weaponStats();
    if (ws.item !== pend.item) return; // cambió de objeto mientras cargaba
    const it = ITEMS[ws.item];
    player.getLookRay(_fo, _fd);
    // dispersión: peor al correr o al estar cansado
    const rapidez = Math.hypot(player.velocity.x, player.velocity.z);
    const disp = (it.arrojadiza ? 0.012 : it.municion === 'guijarro' ? 0.02 : 0.008) + Math.min(0.03, rapidez * 0.004) + (sv.stats.energia < 20 ? 0.01 : 0);
    _fd.x += (Math.random() - 0.5) * disp; _fd.y += (Math.random() - 0.5) * disp; _fd.z += (Math.random() - 0.5) * disp; _fd.normalize();
    _fr.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const origen = _fo.clone().addScaledVector(_fd, 0.6).addScaledVector(_fr, 0.12).add(new THREE.Vector3(0, -0.12, 0));
    if (it.arrojadiza) {
      const s = sv.tomarMano(); if (!s) return;
      proyectiles.disparar({ origin: origen, dir: _fd, vel: it.vel, dano: ws.dano, item: ws.item, clase: 'jabalina', rotura: 0, penetra: ws.penetra, arma: ws.item, dur: s.dur, cal: s.cal, rep: s.rep });
      ruido(0.4);
    } else {
      const idx = sv.municion(it.municion); if (idx < 0) return;
      const mun = sv.slots[idx].item, mi = ITEMS[mun];
      sv.inventory.remove(mun, 1);
      proyectiles.disparar({ origin: origen, dir: _fd, vel: it.vel, dano: ws.dano + mi.dano, item: mun, clase: mi.clase, rotura: mi.rotura ?? 0.3, penetra: ws.penetra + (mi.penetra ?? 0), arma: ws.item });
      sv.desgastarMano(1);
      ruido(it.municion === 'guijarro' ? 0.25 : 0.35);
      ctx.audio?.play?.(it.municion === 'guijarro' ? 'honda_disparo' : 'arco_disparo', player.position);
    }
    landKick += 0.1;
  }

  ctx.events.on('input:action', ({ action, pressed }) => {
    if (ctx.state !== 'playing' || ctx.ui?.blocksInput) return;
    if (!pressed) return;
    if (action === 'interactuar') doInteract();
    if (action === 'montar') {
      if (montura.activa) montura.desmontar();
      else {
        // el animal apuntado, o el montable más cercano
        let c = target?.kind === 'fauna' ? target.hit.criatura : null;
        if (!c?.rel?.dom) { let bd = 1e9; c = null; for (const o of ctx.fauna?.propios?.() ?? []) { const d = o.distToPlayer(); if (d < bd && o.sp.montura?.jinete) { bd = d; c = o; } } }
        if (c) montura.montar(c); else ctx.ui?.notify?.('No hay ningún animal montable cerca', 'info');
      }
    }
    if (action === 'usar' && input.pointerLocked) strike();
    if (action === 'usar' && ctx.debug.enabled) strike();
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) jumpQueued = true; });

  // ------------------------------------------------------------------ cámara
  function playerCamera(dt) {
    const p = player.position;
    // mirada
    const sens = (ctx.settings.sensibilidad ?? 1) * 0.0022;
    if (input.pointerLocked && !ctx.ui?.blocksInput) {
      player.yaw -= mouse.dx * sens;
      player.pitch = clamp(player.pitch - mouse.dy * sens, -1.5, 1.5);
    }
    mouse.dx = mouse.dy = 0;

    const targetEye = player.crouching ? cfg.eyeHeight * 0.62 : player.swimming ? 0.55 : cfg.eyeHeight;
    eye = damp(eye, targetEye, 10, dt);
    const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround && hSpeed > 0.5;
    bobAmp = damp(bobAmp, moving ? clamp(hSpeed / cfg.sprintSpeed, 0.25, 1) : 0, 8, dt);
    bob += hSpeed * dt * (player.sprinting ? 1.35 : 1.15);
    landKick = damp(landKick, 0, 7, dt);
    shake = damp(shake, 0, 6, dt);
    fovBoost = damp(fovBoost, player.sprinting ? 1 : 0, 6, dt);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    roll = damp(roll, -side * 0.018 * clamp(hSpeed / cfg.walkSpeed, 0, 1.4), 7, dt);
    swingCd = Math.max(0, swingCd - dt);

    const bobY = Math.sin(bob * 2) * 0.034 * bobAmp - landKick * 0.16;
    const bobX = Math.cos(bob) * 0.022 * bobAmp;
    const waveY = player.swimming ? world.water.getWaveHeight(p.x, p.z, ctx.time.elapsed) : 0;
    player.eyePosition.set(p.x, p.y + eye + bobY + waveY, p.z);

    const cam = ctx.camera;
    cam.position.copy(player.eyePosition).addScaledVector(right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw)), bobX);
    const sx = (Math.random() - 0.5) * shake * 0.05, sy = (Math.random() - 0.5) * shake * 0.05;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(player.pitch + sy - landKick * 0.04, player.yaw + sx, roll);
    const fov = ctx.config.render.fov + (ctx.settings.fovExtra ?? 0) + fovBoost * 5;
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // cámara cinematográfica del menú: vuelo lento de dron sobre la costa de inicio (zona que se precarga al arrancar: mar al sur, selva y montes al norte)
  function menuCamera(dt) {
    menuCam.angle += dt * 0.03;
    const sp = world.spawn, cx = sp.x, cz = sp.z - 260, R = 430, a = menuCam.angle;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = Math.max(world.getHeight(x, z), 0) + 52 + Math.sin(a * 2.3) * 14;
    menuCam.pos.set(x, y, z);
    const lx = cx + Math.cos(a + 1.15) * 170, lz = cz + Math.sin(a + 1.15) * 170;
    menuCam.look.set(lx, Math.max(world.getHeight(lx, lz), 0) + 18, lz);
    ctx.camera.position.lerp(menuCam.pos, 1 - Math.exp(-dt * 2));
    ctx.camera.lookAt(menuCam.look);
    if (ctx.camera.fov !== 52) { ctx.camera.fov = 52; ctx.camera.updateProjectionMatrix(); }
  }

  function deathCamera(dt) {
    ctx.camera.position.y = damp(ctx.camera.position.y, player.position.y + 0.35, 3, dt);
    ctx.camera.rotation.z = damp(ctx.camera.rotation.z, 1.1, 2, dt);
  }

  return {
    name: 'player',
    fixedUpdate,
    lateUpdate(dt) { montura.lateUpdate(dt); },
    update(dt) {
      tick(dt);
      viewmodel.update(dt);
    },
  };

  function tick(dt) {
    {
      ctx.physics.update?.(dt);
      if (ctx.state !== 'paused') {
        proyectiles.update(dt);
        player.ruidoExtra = Math.max(0, player.ruidoExtra - dt * 1.6);
        if (pendiente) { if (ctx.state !== 'playing') pendiente = null; else { pendiente.t -= dt; if (pendiente.t <= 0) soltarDisparo(); } }
      }
      if (ctx.debug.freeCamera) return;
      if (ctx.state === 'menu' || ctx.state === 'loading') { menuCamera(dt); return; }
      if (ctx.state === 'dead') { deathCamera(dt); return; }
      if (ctx.state === 'paused') return;
      playerCamera(dt);
      if (keys.has('Space') && player.swimming) jumpQueued = false;
      publishTarget();
      if (input.pointerLocked && (mouse.buttons & 1) && !ctx.ui?.blocksInput) strike(); // mantener clic = golpear repetidamente
      ctx.audio?.setListener?.(ctx.camera);
    }
  }
}
