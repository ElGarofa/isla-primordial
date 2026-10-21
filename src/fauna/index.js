// Módulo FAUNA: dinosaurios procedurales con esqueleto, IK de patas, IA y botín. Contrato en docs/ARQUITECTURA.md.
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { Creature, prepareLegs } from './creature.js';
import { makeSkin } from './skin.js';
import { mulberry32 } from '../core/rng.js';
import { CONFIG } from '../core/config.js';

const TAU = Math.PI * 2;

// Población objetivo por especie y características de reaparición (m del jugador, segundos).
const POBLACION = [
  { id: 'raptor', grupos: [3, 3], biomes: ['selva', 'pradera'], minH: 4, maxH: 90, slope: 0.12, minSpawn: 150 },
  { id: 'compsognatus', grupos: [3, 3, 2], biomes: ['playa', 'pradera', 'selva'], minH: 1.5, maxH: 60, slope: 0.14, minSpawn: 70 },
  { id: 'triceratops', grupos: [3, 2], biomes: ['pradera', 'selva'], minH: 4, maxH: 70, slope: 0.1, minSpawn: 120 },
  { id: 'braquiosaurio', grupos: [1, 1, 1], biomes: ['pradera', 'selva'], minH: 5, maxH: 60, slope: 0.07, minSpawn: 160 },
  { id: 'pteranodon', grupos: [1, 1, 1], biomes: null, minH: -100, maxH: 999, slope: 9, minSpawn: 0, vuelo: true },
];
const ACTIVO = 320; // m: más lejos de la cámara las criaturas quedan congeladas
const DIST = { raptor: [140, 380], compsognatus: [60, 160], triceratops: [200, 520], braquiosaurio: [420, 1000], pteranodon: [700, 900] }; // [animación completa, visibilidad]

export async function create(ctx) {
  const world = ctx.world;
  const rng = mulberry32((CONFIG.seed ?? 1) + 7777);
  const built = new Map();
  const bases = new Map();
  const list = [];
  let nextId = 1;
  let respawnT = 20;
  let ambT = 12;
  let grace = 0;
  let tick = 0;

  const mgr = {
    ctx,
    get grace() { return grace; },
    getBuilt(sp) {
      let b = built.get(sp.id);
      if (!b) { b = sp.build(); b.legs = prepareLegs(b); built.set(sp.id, b); }
      return b;
    },
    /** Materiales en pozas (4 tonos por especie): nunca se liberan, así los programas de shader no se recompilan al reaparecer. */
    makeMaterial(sp, tint = 0.5) {
      const idx = Math.min(3, Math.floor(tint * 4));
      const key = `${sp.id}|${idx}`;
      let m = bases.get(key);
      if (m) return m;
      let base = bases.get(sp.id);
      if (!base) {
        const skin = makeSkin(sp.skin, 256);
        base = new THREE.MeshStandardMaterial({
          vertexColors: true, map: skin.albedo, normalMap: skin.normal, normalScale: new THREE.Vector2(0.9, 0.9),
          roughness: sp.roughness ?? 0.8, metalness: 0, side: sp.id === 'pteranodon' ? THREE.DoubleSide : THREE.FrontSide,
        });
        for (const t of [skin.albedo, skin.normal]) t.repeat.set(sp.uvK ?? 1, sp.uvK ?? 1);
        ctx.lighting?.setupMaterial?.(base);
        bases.set(sp.id, base);
      }
      m = base.clone();
      const t = (idx + 0.5) / 4, v = (sp.tono ?? 1.0) + (t - 0.5) * 0.25;
      m.color.setRGB(v * (1 + (t - 0.5) * 0.08), v, v * (1 - (t - 0.5) * 0.1));
      ctx.lighting?.setupMaterial?.(m);
      bases.set(key, m);
      return m;
    },
    onHit(c, n, fuente) {
      const p = c.center.clone();
      ctx.events.emit('creature:hit', { especie: c.especie, position: p, fuerza: n });
      const pp = ctx.player?.position;
      if (pp && fuente === 'jugador') {
        const dx = c.position.x - pp.x, dz = c.position.z - pp.z, l = Math.hypot(dx, dz) || 1;
        const k = Math.min(3.5, n * 0.12) / Math.max(0.6, c.sp.radius);
        c.kn.x += (dx / l) * k; c.kn.z += (dz / l) * k;
      }
    },
    onKilled(c) {
      const pos = c.center.clone();
      const drops = c.sp.drops.map(([item, n]) => ({ item, cantidad: Math.max(1, Math.round(n * (0.75 + rng() * 0.5))) }));
      ctx.events.emit('creature:killed', { especie: c.especie, position: pos, drops });
      for (const d of drops) {
        const v = new THREE.Vector3((rng() - 0.5) * 3.2, 2.6 + rng() * 1.6, (rng() - 0.5) * 3.2);
        ctx.physics?.spawnProp?.('loot', pos.clone().setY(Math.max(pos.y, world.getHeight(pos.x, pos.z) + 0.8)), v, { item: d.item, cantidad: d.cantidad, noPickup: 0.9 });
      }
    },
    hitPlayer(c, dmg) { ctx.survival?.damage?.(dmg, c.nombre.toLowerCase()); },
    separate(c, dt) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === c || o.muerta || o.flight) continue;
        const dx = c.position.x - o.position.x, dz = c.position.z - o.position.z, m = (c.sp.radius + o.sp.radius) * 0.85;
        if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
        const d = Math.hypot(dx, dz) || 1e-3;
        if (d < m) { const push = (m - d) * Math.min(1, dt * 6) * (c.sp.radius >= o.sp.radius ? 0.35 : 0.65); c.position.x += (dx / d) * push; c.position.z += (dz / d) * push; }
      }
    },
  };

  // ---------------------------------------------------------------------------------------------- API pública
  const _tmp = new THREE.Vector3();
  function spawnAt(especie, x, z, opts = {}) {
    const sp = SPECIES[especie];
    if (!sp) return null;
    const c = new Creature(mgr, sp, nextId++, x, z, opts);
    c.idleLen = 3 + rng() * 4;
    ctx.scene.add(c.group);
    list.push(c);
    api.creatures = list;
    c.update(1 / 60, true);
    return c;
  }
  function remove(c) {
    const i = list.indexOf(c);
    if (i >= 0) list.splice(i, 1);
    ctx.scene.remove(c.group);
    c.dispose();
  }

  const _sph = new THREE.Vector3();
  const api = {
    creatures: list,
    /** Rayo de interacción/ataque contra las esferas de impacto de cada criatura viva. */
    pick(origin, dir, maxDist = 4) {
      let best = null;
      for (const c of list) {
        if (c.muerta || !c.group.visible) continue;
        const dxo = c.position.x - origin.x, dzo = c.position.z - origin.z;
        if (dxo * dxo + dzo * dzo > (maxDist + 22) * (maxDist + 22)) continue;
        const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
        for (const [hx, hy, hz, hr] of c.sp.hit) {
          // esfera en el mundo (el modelo mira a +z local; yaw = rotación sobre Y)
          const wx = c.position.x + hx * cy + hz * sy, wy = c.position.y + hy, wz = c.position.z - hx * sy + hz * cy;
          const ox = wx - origin.x, oy = wy - origin.y, oz = wz - origin.z;
          const tc = ox * dir.x + oy * dir.y + oz * dir.z;
          if (tc < 0) continue;
          const d2 = ox * ox + oy * oy + oz * oz - tc * tc, r = hr + 0.12;
          if (d2 > r * r) continue;
          const t = tc - Math.sqrt(r * r - d2);
          if (t > maxDist || (best && t >= best.distance)) continue;
          best = { criatura: c, distance: Math.max(0, t), point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t) };
        }
      }
      return best;
    },
    damage(criatura, cantidad, fuente = 'jugador') { criatura?.damage?.(cantidad, fuente); },
    spawnAt,
    getNear(pos, radius, out = []) {
      out.length = 0;
      const r2 = radius * radius;
      for (const c of list) { const dx = c.position.x - pos.x, dz = c.position.z - pos.z; if (dx * dx + dz * dz <= r2) out.push(c); }
      return out;
    },
    remove,
    clear() { for (let i = list.length - 1; i >= 0; i--) remove(list[i]); },
    stats() { return { total: list.length, vivas: list.filter((c) => !c.muerta).length, visibles: list.filter((c) => c.group.visible).length }; },
    populate,
    setGrace(t) { grace = t; },
  };
  ctx.fauna = api;

  // ---------------------------------------------------------------------------------------------- población
  function findSpot(f, from) {
    const sp = world.spawn;
    for (let i = 0; i < 400; i++) {
      let x, z;
      if (from) { const a = rng() * TAU, r = 6 + rng() * 20; x = from.x + Math.cos(a) * r; z = from.z + Math.sin(a) * r; } else { const a = rng() * TAU, r = Math.sqrt(rng()) * world.size * 0.4; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const h = world.getHeight(x, z);
      if (h < f.minH || h > f.maxH) continue;
      if (!f.vuelo) {
        if (world.getSlope(x, z) > f.slope) continue;
        if (f.biomes && !f.biomes.includes(world.getBiome(x, z))) continue;
      }
      if (Math.hypot(x - sp.x, z - sp.z) < f.minSpawn) continue;
      const pp = ctx.player?.position;
      if (pp && ctx.state === 'playing' && Math.hypot(x - pp.x, z - pp.z) < 90) continue;
      return { x, z };
    }
    return null;
  }

  function spawnGroup(def, n) {
    const centro = findSpot(def);
    if (!centro) return 0;
    const herd = { center: new THREE.Vector3(centro.x, 0, centro.z), members: [] };
    let made = 0;
    for (let i = 0; i < n; i++) {
      const s = def.vuelo ? centro : findSpot(def, centro);
      if (!s) continue;
      const c = spawnAt(def.id, s.x, s.z, { herd, tint: rng() });
      if (c) { herd.members.push(c); made++; }
    }
    return made;
  }

  function populate() {
    for (const def of POBLACION) for (const n of def.grupos) spawnGroup(def, n);
  }
  populate();
  grace = 45;

  const target = {};
  for (const def of POBLACION) target[def.id] = def.grupos.reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------------------------------------- bucle
  const cam = ctx.camera;
  function update(dt) {
    if (dt <= 0) return;
    tick++;
    if ((tick & 31) === 0 && ctx.flora?.root && !ctx.flora.root.visible && !list.some((c) => c.frozen)) ctx.flora.root.visible = true; // presets de captura la ocultan
    const playing = ctx.state === 'playing' || ctx.state === 'menu';
    if (ctx.state === 'playing') grace = Math.max(0, grace - dt);
    const cx = cam.position.x, cz = cam.position.z;

    // centro de las manadas
    if ((tick & 15) === 0) {
      for (const c of list) {
        const h = c.herd; if (!h || h._t === tick) continue; h._t = tick;
        let sx = 0, sz = 0, n = 0;
        for (const m of h.members) if (!m.muerta) { sx += m.position.x; sz += m.position.z; n++; }
        if (n) { h.center.set(sx / n, 0, sz / n); }
      }
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const dx = c.position.x - cx, dz = c.position.z - cz, d = Math.hypot(dx, dz);
      const [dAnim, dVis] = DIST[c.especie] ?? [150, 400];
      const vis = d < dVis;
      c.group.visible = vis;
      if (c.muerta) {
        if (vis || c.deathT < 3) c.update(dt, true);
        else c.deathT += dt;
        if (c.deathT > 80) remove(c);
        continue;
      }
      if (!playing && ctx.state !== 'dead') continue;
      if (d > ACTIVO) continue;
      c.mesh.castShadow = d < 55 + 30 * c.sp.radius;
      // lejos: se actualiza cada pocos cuadros con un dt acumulado
      if (d > dAnim * 0.6) { c._acc = (c._acc ?? 0) + dt; if ((tick + c.id) % 4 !== 0) continue; const adt = c._acc; c._acc = 0; c.update(adt, d < dAnim); } else c.update(dt, true);
    }

    // rugidos ambientales de criaturas cercanas (dan vida al bosque aunque no se vean)
    ambT -= dt;
    if (ambT <= 0 && ctx.state === 'playing') {
      ambT = 14 + rng() * 26;
      const cand = list.filter((c) => !c.muerta && !c.flight && Math.hypot(c.position.x - cx, c.position.z - cz) < 130);
      if (cand.length) cand[Math.floor(rng() * cand.length)].roar();
    }
    // reaparición: mantiene la población lejos del jugador
    respawnT -= dt;
    if (respawnT <= 0 && ctx.state === 'playing') {
      respawnT = 18;
      for (const def of POBLACION) {
        const vivos = list.filter((c) => c.especie === def.id && !c.muerta).length;
        if (vivos < target[def.id] * 0.7) { spawnGroup(def, Math.min(def.grupos[0], target[def.id] - vivos)); break; }
      }
    }
  }

  ctx.events.on('player:respawn', () => { grace = 30; for (const c of list) if (!c.muerta && (c.state === 'chase' || c.state === 'charge')) c.setState('idle'); });

  return { name: 'fauna', update };
}
