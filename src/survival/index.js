// Módulo SUPERVIVENCIA: estadísticas vitales, inventario, barra rápida, crafteo, fogatas, muerte/reaparición y guardado.
import * as THREE from 'three';
import { ITEMS, RECIPES } from '../core/items.js';
import { createCampfires } from './campfire.js';

const SAVE_KEY = 'isla-primordial:partida:v1';
const SLOTS = 30; // los 9 primeros son la barra rápida
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function create(ctx) {
  const world = ctx.world;
  const cfgPlayer = ctx.config.player;
  const baseSprint = cfgPlayer.sprintSpeed;
  const baseWalk = cfgPlayer.walkSpeed;

  // ------------------------------------------------------------------ inventario
  const slots = new Array(SLOTS).fill(null);
  const changed = () => ctx.events.emit('inventory:changed', {});
  const stackMax = (id) => ITEMS[id]?.apilable ?? 1;

  const inventory = {
    slots,
    count(item) { let n = 0; for (const s of slots) if (s && s.item === item) n += s.cantidad; return n; },
    has(item, cantidad = 1) { return this.count(item) >= cantidad; },
    /** Devuelve lo que NO cupo. */
    add(item, cantidad = 1) {
      if (!ITEMS[item] || cantidad <= 0) return cantidad;
      let left = cantidad;
      const max = stackMax(item);
      for (const s of slots) {
        if (left <= 0) break;
        if (s && s.item === item && s.cantidad < max) { const n = Math.min(max - s.cantidad, left); s.cantidad += n; left -= n; }
      }
      for (let i = 0; i < SLOTS && left > 0; i++) {
        if (!slots[i]) { const n = Math.min(max, left); slots[i] = { item, cantidad: n }; left -= n; }
      }
      const added = cantidad - left;
      if (added > 0) { ctx.events.emit('item:added', { item, cantidad: added }); changed(); refreshEquipped(); }
      return left;
    },
    remove(item, cantidad = 1) {
      if (this.count(item) < cantidad) return false;
      let left = cantidad;
      for (let i = SLOTS - 1; i >= 0 && left > 0; i--) {
        const s = slots[i];
        if (!s || s.item !== item) continue;
        const n = Math.min(s.cantidad, left); s.cantidad -= n; left -= n;
        if (s.cantidad <= 0) slots[i] = null;
      }
      changed(); refreshEquipped();
      return true;
    },
    /** Intercambia o fusiona dos casillas. */
    move(a, b) {
      if (a === b || a < 0 || b < 0 || a >= SLOTS || b >= SLOTS) return;
      const A = slots[a], B = slots[b];
      if (A && B && A.item === B.item) {
        const n = Math.min(stackMax(A.item) - B.cantidad, A.cantidad);
        B.cantidad += n; A.cantidad -= n; if (A.cantidad <= 0) slots[a] = null;
      } else { slots[a] = B; slots[b] = A; }
      changed(); refreshEquipped();
    },
    /** Suelta parte de una casilla delante del jugador. */
    drop(i, cantidad = null) {
      const s = slots[i]; if (!s) return;
      const n = cantidad == null ? s.cantidad : Math.min(cantidad, s.cantidad);
      s.cantidad -= n; if (s.cantidad <= 0) slots[i] = null;
      const { origin, dir } = ctx.player.getLookRay();
      ctx.physics?.spawnProp?.('loot', origin.clone().addScaledVector(dir, 1.2), dir.clone().multiplyScalar(3).setY(2), { item: s.item, cantidad: n, noPickup: 1.5 });
      changed(); refreshEquipped();
    },
  };

  // ------------------------------------------------------------------ estadísticas
  const stats = { vida: 100, hambre: 100, sed: 100, energia: 100, oxigeno: 100, temperatura: 26 };
  let selected = 0;
  let equipped = null;
  let dead = false;
  let sprintTime = 0;

  function refreshEquipped() {
    const s = slots[selected];
    const it = s ? ITEMS[s.item] : null;
    const next = it && (it.tipo === 'herramienta' || it.tipo === 'arma') ? s.item : null;
    if (next !== survival.equipped) { survival.equipped = next; ctx.events.emit('equip:changed', { item: next }); }
    survival.selected = selected;
  }

  function select(i) {
    selected = clamp(i, 0, 8);
    refreshEquipped();
    changed();
  }

  function consume(i) {
    const s = slots[i]; if (!s) return false;
    const it = ITEMS[s.item];
    if (it.tipo === 'comida' || it.tipo === 'bebida') {
      stats.hambre = clamp(stats.hambre + (it.comida ?? 0), 0, 100);
      stats.sed = clamp(stats.sed + (it.sed ?? 0), 0, 100);
      if (it.vida) stats.vida = clamp(stats.vida + it.vida, 1, 100);
      inventory.remove(s.item, 1);
      ctx.audio?.play?.(it.tipo === 'bebida' ? 'beber' : 'comer');
      ctx.events.emit('ui:sound', { nombre: 'ui_click' });
      return true;
    }
    if (s.item === 'fogata') return campfires.placeFromPlayer();
    if (it.tipo === 'herramienta' || it.tipo === 'arma') { if (i < 9) select(i); return true; }
    return false;
  }

  function damage(cantidad, fuente = 'desconocido') {
    if (dead || cantidad <= 0 || ctx.state === 'menu') return;
    stats.vida = Math.max(0, stats.vida - cantidad);
    ctx.events.emit('player:damage', { cantidad, fuente });
    ctx.audio?.play?.('dano');
    if (stats.vida <= 0) die(fuente);
  }

  let bag = null;
  function die(causa) {
    if (dead) return;
    dead = true;
    // la bolsa con las pertenencias queda en el lugar de la muerte
    const items = slots.filter(Boolean).map((s) => ({ ...s }));
    if (items.length) {
      const pos = ctx.player.position.clone();
      bag?.unregister?.();
      const unregister = ctx.player.registerInteractable({
        id: 'bolsa', position: pos.clone().setY(pos.y + 0.4), radius: 2.2, label: 'Bolsa de pertenencias',
        getPrompt: () => 'Recoger pertenencias',
        onInteract: () => {
          for (const s of items) inventory.add(s.item, s.cantidad);
          unregister(); bag = null; ctx.ui?.notify?.('Recuperaste tus pertenencias', 'ok');
        },
      });
      bag = { unregister, mesh: null };
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.95 }));
      mesh.position.copy(pos).setY(world.getHeight(pos.x, pos.z) + 0.3); mesh.castShadow = true; ctx.scene.add(mesh);
      ctx.lighting?.setupMaterial?.(mesh.material);
      bag.mesh = mesh;
      const old = unregister;
      bag.unregister = () => { old(); ctx.scene.remove(mesh); };
      for (let i = 0; i < SLOTS; i++) slots[i] = null;
      changed(); refreshEquipped();
    }
    ctx.events.emit('player:died', { causa });
    ctx.audio?.play?.('muerte');
    save(true);
  }

  function respawn() {
    if (!dead) return;
    dead = false;
    Object.assign(stats, { vida: 70, hambre: 70, sed: 70, energia: 80, oxigeno: 100 });
    ctx.events.emit('player:respawn', { position: world.spawn.clone() });
  }

  // ------------------------------------------------------------------ crafteo
  function recipeInfo(r) {
    const faltan = {};
    for (const [item, n] of Object.entries(r.costo)) { const have = inventory.count(item); if (have < n) faltan[item] = n - have; }
    const estacionOk = !r.estacion || campfires.nearLit(ctx.player.position, 5);
    return { ...r, nombre: ITEMS[r.id].nombre, faltan, estacionOk, posible: Object.keys(faltan).length === 0 && estacionOk };
  }
  function craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return false;
    const info = recipeInfo(r);
    if (!info.posible) { ctx.events.emit('ui:sound', { nombre: 'ui_error' }); ctx.ui?.notify?.(info.estacionOk ? 'Te faltan materiales' : 'Necesitas una fogata encendida cerca', 'warn'); return false; }
    // comprobar espacio antes de gastar
    for (const [item, n] of Object.entries(r.costo)) inventory.remove(item, n);
    const left = inventory.add(r.id, r.cantidad);
    if (left > 0) ctx.physics?.spawnProp?.('loot', ctx.player.position.clone().setY(ctx.player.position.y + 1), new THREE.Vector3(0, 3, 0), { item: r.id, cantidad: left });
    ctx.events.emit('ui:sound', { nombre: 'craft' });
    ctx.audio?.play?.('craft');
    ctx.events.emit('crafted', { item: r.id });
    return true;
  }

  // ------------------------------------------------------------------ guardado
  function snapshot() {
    return {
      v: 1, fecha: Date.now(),
      stats: { ...stats }, slots: slots.map((s) => (s ? { ...s } : null)), selected,
      hora: ctx.time.hour, elapsed: ctx.time.elapsed,
      pos: [ctx.player.position.x, ctx.player.position.z], yaw: ctx.player.yaw,
      fogatas: campfires.serialize(), tutorial: tutorial.step,
    };
  }
  function save(silent = false) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); if (!silent) ctx.ui?.notify?.('Partida guardada', 'ok'); return true; } catch { return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (!d || d.v !== 1) return false;
      Object.assign(stats, d.stats, { vida: Math.max(15, d.stats.vida) });
      for (let i = 0; i < SLOTS; i++) slots[i] = d.slots?.[i] ?? null;
      selected = d.selected ?? 0;
      ctx.time.hour = d.hora ?? ctx.time.hour; ctx.time.elapsed = d.elapsed ?? 0;
      ctx.player.teleport(d.pos[0], d.pos[1]);
      if (d.yaw != null) ctx.player.yaw = d.yaw;
      campfires.restore(d.fogatas ?? []);
      tutorial.step = d.tutorial ?? 0;
      dead = false; changed(); refreshEquipped();
      return true;
    } catch { return false; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* sin almacenamiento */ } }
  function newGame() {
    Object.assign(stats, { vida: 100, hambre: 100, sed: 100, energia: 100, oxigeno: 100, temperatura: 26 });
    for (let i = 0; i < SLOTS; i++) slots[i] = null;
    selected = 0; dead = false; tutorial.step = 0;
    campfires.restore([]);
    ctx.player.teleport(world.spawn.x, world.spawn.z);
    ctx.time.hour = ctx.config.time.startHour;
    changed(); refreshEquipped();
  }

  // ------------------------------------------------------------------ API pública
  const survival = (ctx.survival = {
    stats, inventory, equipped: null, selected: 0, slots,
    get dead() { return dead; },
    recipes: RECIPES,
    recipeInfo, craft, select, consume, use: consume, damage, respawn,
    save, load, hasSave, clearSave, newGame,
    drink(cantidad = 20) {
      stats.sed = clamp(stats.sed + cantidad, 0, 100);
      if (survival.equipped === 'cantimplora') inventory.add('agua', 1);
      ctx.events.emit('ui:sound', { nombre: 'beber' });
      ctx.audio?.play?.('beber');
    },
    heal(n) { stats.vida = clamp(stats.vida + n, 0, 100); },
    nearFire(pos = ctx.player.position, r = 8) { return campfires.nearLit(pos, r); },
  });

  const campfires = createCampfires(ctx, inventory);
  const tutorial = { step: 0 };
  survival.tutorial = tutorial;
  survival.fires = () => campfires.list.map((f) => ({ x: f.x, z: f.z, lit: f.fuel > 0 }));

  // ------------------------------------------------------------------ entrada
  ctx.events.on('input:action', ({ action, pressed, index }) => {
    if (!pressed || ctx.state !== 'playing' || ctx.ui?.blocksInput) return;
    if (action === 'hotbar') {
      if (index === selected && slots[index] && ITEMS[slots[index].item].tipo !== 'herramienta' && ITEMS[slots[index].item].tipo !== 'arma') consume(index);
      else select(index);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat && ctx.state === 'playing' && !ctx.ui?.blocksInput) consume(selected);
  });
  window.addEventListener('wheel', (e) => {
    if (ctx.state !== 'playing' || ctx.ui?.blocksInput || !document.pointerLockElement) return;
    select((selected + (e.deltaY > 0 ? 1 : 8)) % 9);
  }, { passive: true });
  ctx.events.on('player:respawn', () => { bag?.unregister?.(); /* la bolsa queda hasta recogerla */ });

  // Recoger cosas del suelo hace sonido
  ctx.events.on('item:added', () => { ctx.audio?.play?.('recoger'); });

  // ------------------------------------------------------------------ bucle
  let saveTimer = 0;
  const hand = new THREE.Vector3();
  let torchFire = null;
  const _r = new THREE.Vector3(), _f = new THREE.Vector3();

  function updateTorch(dt) {
    const on = survival.equipped === 'antorcha' && ctx.state !== 'menu' && !dead;
    if (on && !torchFire) torchFire = ctx.fx?.createFire?.(hand, { escala: 0.35, luz: true, intensidad: 1.0, antorcha: true }) ?? null;
    if (!on && torchFire) { torchFire.dispose(); torchFire = null; }
    if (torchFire) {
      const cam = ctx.camera;
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
      hand.copy(cam.position).addScaledVector(_f, 0.75).addScaledVector(_r, 0.38).add(_f.set(0, -0.36, 0));
      torchFire.setPosition(hand);
    }
    void dt;
  }

  function simulate(dt) {
    const p = ctx.player;
    const w = ctx.time.weather;
    // temperatura ambiente "sentida"
    const h = world.getHeight(p.position.x, p.position.z);
    let tAmb = 14 + 14 * (1 - ctx.time.nightFactor);
    tAmb -= Math.max(0, h - 25) * 0.075;
    tAmb -= w.rain * 5 + w.storm * 3;
    if (p.inWater) tAmb -= 7;
    const fire = campfires.heatAt(p.position);
    tAmb += fire * 16 + (survival.equipped === 'antorcha' ? 2 : 0);
    stats.temperatura += (tAmb - stats.temperatura) * Math.min(1, dt * 0.25);

    // consumo
    const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.6;
    const sprinting = p.sprinting && moving;
    const hot = stats.temperatura > 36 ? 1.8 : 1;
    stats.hambre = Math.max(0, stats.hambre - dt * (0.055 + (sprinting ? 0.05 : 0)));
    stats.sed = Math.max(0, stats.sed - dt * (0.085 + (sprinting ? 0.08 : 0)) * hot);
    if (sprinting) { stats.energia = Math.max(0, stats.energia - dt * 3.2); sprintTime += dt; }
    else { stats.energia = Math.min(100, stats.energia + dt * (moving ? 0.9 : 2.4)); sprintTime = 0; }
    stats.energia = Math.max(0, stats.energia - dt * 0.01);

    // oxígeno
    const under = ctx.camera.position.y < (world.seaLevel + (world.water?.getWaveHeight?.(p.position.x, p.position.z, ctx.time.elapsed) ?? 0) - 0.05);
    if (under) stats.oxigeno = Math.max(0, stats.oxigeno - dt * 6);
    else stats.oxigeno = Math.min(100, stats.oxigeno + dt * 35);

    // salud
    let dv = 0;
    if (stats.hambre <= 0) dv -= 0.9;
    if (stats.sed <= 0) dv -= 1.4;
    if (stats.temperatura < 9) dv -= (9 - stats.temperatura) * 0.12;
    if (stats.oxigeno <= 0) dv -= 9;
    if (dv < 0) { stats.vida = Math.max(0, stats.vida + dv * dt); if (stats.vida <= 0) die(stats.oxigeno <= 0 ? 'Ahogamiento' : stats.sed <= 0 ? 'Sed' : stats.hambre <= 0 ? 'Hambre' : 'Frío'); }
    else if (stats.hambre > 45 && stats.sed > 45 && stats.vida < 100 && !under) stats.vida = Math.min(100, stats.vida + dt * (0.6 + (fire > 0 ? 0.4 : 0)));

    // la fatiga limita el sprint
    cfgPlayer.sprintSpeed = baseSprint * (stats.energia > 12 ? 1 : 0.62);
    cfgPlayer.walkSpeed = baseWalk * (stats.vida < 25 ? 0.85 : 1);
  }

  return {
    name: 'survival',
    update(dt) {
      if (ctx.state === 'playing' && !dead && dt > 0) {
        simulate(dt);
        saveTimer += dt;
        if (saveTimer > 25) { saveTimer = 0; save(true); }
      }
      campfires.update(dt);
      updateTorch(dt);
    },
  };
}
