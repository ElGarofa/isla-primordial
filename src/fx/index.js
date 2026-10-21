// Módulo FX: partículas (polvo, chispas, hojas, astillas, humo…), fuego con luz, clima (lluvia, tormenta, viento) y ambiente (luciérnagas).
import * as THREE from 'three';
import { ParticleLayer, SPRITES, rnd } from './particles.js';
import { createRain } from './rain.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function create(ctx) {
  const scene = ctx.scene;
  const W = ctx.time.weather;
  W.wetness ??= 0;
  const maps = { humo: SPRITES.humo(), brillo: SPRITES.brillo(), llama: SPRITES.llama(), duro: SPRITES.duro(), hoja: SPRITES.hoja() };
  const L = {
    humo: new ParticleLayer(scene, { max: 700, map: maps.humo, renderOrder: 6 }),
    duro: new ParticleLayer(scene, { max: 900, map: maps.duro, renderOrder: 6 }),
    hoja: new ParticleLayer(scene, { max: 300, map: maps.hoja, renderOrder: 6 }),
    llama: new ParticleLayer(scene, { max: 900, map: maps.llama, additive: true, renderOrder: 7 }),
    brillo: new ParticleLayer(scene, { max: 900, map: maps.brillo, additive: true, renderOrder: 7 }),
  };
  const layers = Object.values(L);
  const rain = createRain(ctx);

  // ------------------------------------------------------------------ luces de fuego (pool fijo: los shaders no se recompilan)
  const POOL = 4;
  const lights = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xff8a3a, 0, 18, 2);
    l.castShadow = false; scene.add(l); lights.push(l);
  }
  const fires = new Set();

  // ------------------------------------------------------------------ emisores puntuales
  const v3 = new THREE.Vector3();
  const rad = (s) => { const a = Math.random() * 6.283; return [Math.cos(a) * s * Math.random(), Math.sin(a) * s * Math.random()]; };
  const PRESETS = {
    polvo(p, o) {
      const n = o.cantidad ?? 10, e = o.escala ?? 1;
      for (let i = 0; i < n; i++) { const [rx, rz] = rad(0.9 * e); L.humo.emit({ x: p.x + rx * 0.3, y: p.y + 0.05, z: p.z + rz * 0.3, vx: rx, vy: rnd(0.3, 0.9), vz: rz, life: rnd(0.7, 1.3), s0: 0.2 * e, s1: rnd(0.7, 1.2) * e, r: 0.66, g: 0.58, b: 0.46, a: 0.42, drag: 2.2, rot: Math.random() * 6, spin: rnd(-1, 1) }); }
    },
    arena(p, o) { PRESETS.polvo(p, { cantidad: o.cantidad ?? 6, escala: (o.escala ?? 1) * 0.7 }); },
    salpicadura(p, o) {
      const n = o.cantidad ?? 14, e = o.escala ?? 1;
      for (let i = 0; i < n; i++) { const [rx, rz] = rad(1.6 * e); L.duro.emit({ x: p.x, y: p.y + 0.05, z: p.z, vx: rx, vy: rnd(2.2, 4.6) * e, vz: rz, life: rnd(0.5, 0.9), s0: 0.09 * e, s1: 0.06 * e, r: 0.85, g: 0.93, b: 1, a: 0.75, grav: 12, fadeIn: 0, fade: 0.5 }); }
      for (let i = 0; i < 3; i++) L.humo.emit({ x: p.x, y: p.y + 0.1, z: p.z, vy: 0.4, life: 0.8, s0: 0.3 * e, s1: 1.1 * e, r: 0.9, g: 0.95, b: 1, a: 0.28, drag: 1.5 });
    },
    chispas(p, o) {
      const n = o.cantidad ?? 10;
      for (let i = 0; i < n; i++) L.brillo.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-3, 3), vy: rnd(1.5, 5), vz: rnd(-3, 3), life: rnd(0.3, 0.8), s0: 0.08, s1: 0.015, r: 1, g: rnd(0.55, 0.85), b: 0.25, a: 1, grav: 9, fadeIn: 0, fade: 0.4 });
    },
    hojas(p, o) {
      const n = o.cantidad ?? 16;
      for (let i = 0; i < n; i++) { const [rx, rz] = rad(2.2); const g = rnd(0.5, 0.9); L.hoja.emit({ x: p.x + rx * 0.3, y: p.y + rnd(0, 1.2), z: p.z + rz * 0.3, vx: rx, vy: rnd(0.5, 2.6), vz: rz, life: rnd(1.8, 3.2), s0: 0.22, s1: 0.22, r: rnd(0.2, 0.5), g, b: rnd(0.1, 0.3), a: 1, grav: 1.6, drag: 1.2, turb: 5, spin: rnd(-4, 4), fadeIn: 0, fade: 0.8 }); }
    },
    astillas(p, o) {
      const n = o.cantidad ?? 12, N = o.normal;
      for (let i = 0; i < n; i++) { const k = rnd(0.6, 1); L.duro.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-2.5, 2.5) + (N?.x ?? 0) * 2, vy: rnd(1, 4), vz: rnd(-2.5, 2.5) + (N?.z ?? 0) * 2, life: rnd(0.6, 1.1), s0: 0.06, s1: 0.045, r: 0.55 * k, g: 0.38 * k, b: 0.2 * k, a: 1, grav: 12, fadeIn: 0, fade: 0.7, drag: 0.4 }); }
      PRESETS.hojas(p, { cantidad: 3 });
    },
    sangre(p, o) {
      const n = o.cantidad ?? 10;
      for (let i = 0; i < n; i++) L.duro.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-2.2, 2.2), vy: rnd(0.8, 3.2), vz: rnd(-2.2, 2.2), life: rnd(0.45, 0.9), s0: 0.09, s1: 0.05, r: 0.5, g: 0.04, b: 0.05, a: 0.95, grav: 10, fadeIn: 0, fade: 0.6 });
    },
    humo(p, o) {
      const n = o.cantidad ?? 4, e = o.escala ?? 1;
      for (let i = 0; i < n; i++) L.humo.emit({ x: p.x + rnd(-0.1, 0.1), y: p.y, z: p.z + rnd(-0.1, 0.1), vx: rnd(-0.15, 0.15), vy: rnd(0.7, 1.4), vz: rnd(-0.15, 0.15), life: rnd(2, 3.6), s0: 0.4 * e, s1: rnd(1.8, 2.8) * e, r: 0.34, g: 0.33, b: 0.33, a: 0.34, drag: 0.2, turb: 0.8, spin: rnd(-0.4, 0.4) });
    },
    impacto_roca(p, o) {
      const n = o.cantidad ?? 10;
      for (let i = 0; i < n; i++) { const k = rnd(0.45, 0.7); L.duro.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-3, 3), vy: rnd(1, 4), vz: rnd(-3, 3), life: rnd(0.5, 1), s0: 0.06, s1: 0.04, r: k, g: k * 0.97, b: k * 0.92, a: 1, grav: 12, fadeIn: 0, fade: 0.7 }); }
      PRESETS.chispas(p, { cantidad: 4 });
      PRESETS.polvo(p, { cantidad: 4, escala: 0.6 });
    },
  };
  PRESETS.hojas_ = PRESETS.hojas;

  // ------------------------------------------------------------------ fuego
  function createFire(position, opts = {}) {
    const f = { pos: position.clone(), escala: opts.escala ?? 1, intensidad: opts.intensidad ?? 1, luz: opts.luz !== false, antorcha: !!opts.antorcha, acc: 0, accS: 0, accH: 0, accB: 0, seed: Math.random() * 100, light: null, dist: 0 };
    fires.add(f);
    return {
      setPosition(p) { f.pos.copy(p); },
      setIntensity(i) { f.intensidad = i; },
      dispose() { fires.delete(f); },
    };
  }

  function updateFires(dt, t) {
    const cam = ctx.camera.position;
    // las más cercanas con luz real
    const arr = [...fires];
    for (const f of arr) f.dist = f.pos.distanceToSquared(cam);
    arr.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < POOL; i++) {
      const f = arr[i], l = lights[i];
      if (!f || !f.luz) { l.intensity = Math.max(0, l.intensity - dt * 20); continue; }
      const fl = 0.78 + 0.22 * Math.sin(t * 17 + f.seed) * Math.sin(t * 7.3 + f.seed * 2) + 0.1 * Math.sin(t * 31 + f.seed);
      l.position.copy(f.pos).y += 0.5 * f.escala;
      l.distance = (f.antorcha ? 9 : 18) * Math.max(0.6, f.escala);
      const dayK = 1 - ctx.time.nightFactor * 0.55; // de día la fogata se nota menos
      l.intensity = (f.antorcha ? 4.5 : 11) * f.intensidad * fl * f.escala * dayK;
      l.color.setHSL(0.07 + 0.015 * fl, 1, 0.55);
    }
    if (dt <= 0) return;
    const wind = W.wind;
    for (const f of arr) {
      if (f.dist > 90 * 90) continue; // lejos: sin partículas
      const e = f.escala, inten = f.intensidad;
      // llamas
      f.acc += dt * 46 * e * inten;
      while (f.acc >= 1) {
        f.acc -= 1;
        const a = Math.random() * 6.283, r = Math.random() * 0.17 * e;
        const y = Math.random();
        L.llama.emit({ x: f.pos.x + Math.cos(a) * r, y: f.pos.y + 0.05 * e, z: f.pos.z + Math.sin(a) * r, vx: wind.x * 0.35 + rnd(-0.12, 0.12), vy: rnd(0.9, 1.7) * e, vz: wind.y * 0.35 + rnd(-0.12, 0.12), life: rnd(0.42, 0.78), s0: rnd(0.42, 0.66) * e, s1: 0.08 * e, r: 1, g: 0.38 + y * 0.3, b: 0.05 + y * 0.08, a: 0.8, turb: 3, rot: 0, spin: 0, fadeIn: 0.05, fade: 0.35 });
        if (Math.random() < 0.35) L.brillo.emit({ x: f.pos.x + Math.cos(a) * r * 0.5, y: f.pos.y + 0.08 * e, z: f.pos.z + Math.sin(a) * r * 0.5, vy: rnd(0.8, 1.4) * e, life: rnd(0.3, 0.5), s0: 0.6 * e, s1: 0.18 * e, r: 1, g: 0.42, b: 0.08, a: 0.2, fadeIn: 0.1, fade: 0.3 });
      }
      // chispas / brasas
      f.accS += dt * 7 * e * inten;
      while (f.accS >= 1) { f.accS -= 1; L.brillo.emit({ x: f.pos.x + rnd(-0.12, 0.12) * e, y: f.pos.y + 0.2 * e, z: f.pos.z + rnd(-0.12, 0.12) * e, vx: wind.x * 0.6 + rnd(-0.5, 0.5), vy: rnd(1.2, 2.8) * e, vz: wind.y * 0.6 + rnd(-0.5, 0.5), life: rnd(0.9, 2), s0: 0.05, s1: 0.012, r: 1, g: 0.5, b: 0.15, a: 1, turb: 4, fadeIn: 0, fade: 0.5 }); }
      // humo
      f.accH += dt * 5 * e * inten;
      while (f.accH >= 1) { f.accH -= 1; L.humo.emit({ x: f.pos.x + rnd(-0.1, 0.1), y: f.pos.y + 0.9 * e, z: f.pos.z + rnd(-0.1, 0.1), vx: wind.x * 0.5, vy: rnd(0.8, 1.3), vz: wind.y * 0.5, life: rnd(2.2, 3.6), s0: 0.3 * e, s1: rnd(1.4, 2.2) * e, r: 0.22, g: 0.21, b: 0.21, a: 0.26 * Math.min(1, inten), drag: 0.1, turb: 0.9, spin: rnd(-0.3, 0.3), fadeIn: 0.15, fade: 0.4 }); }
    }
  }

  // ------------------------------------------------------------------ luciérnagas / polen
  const fly = new ParticleLayer(scene, { max: 160, map: maps.brillo, additive: true, renderOrder: 7 });
  const flyState = { acc: 0 };
  function updateAmbient(dt) {
    if (ctx.state !== 'playing' || dt <= 0) return;
    const p = ctx.camera.position;
    const biome = ctx.world.getBiome?.(p.x, p.z);
    const night = ctx.time.nightFactor;
    const eligible = biome === 'selva' || biome === 'pradera' || biome === 'pantano';
    if (!eligible || W.rain > 0.3) return;
    flyState.acc += dt * (night > 0.5 ? 14 : 5);
    while (flyState.acc >= 1 && fly.n < (night > 0.5 ? 150 : 50)) {
      flyState.acc -= 1;
      const a = Math.random() * 6.283, r = rnd(3, 24);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const y = ctx.world.getHeight(x, z) + rnd(0.4, 3.2);
      if (night > 0.5) fly.emit({ x, y, z, life: rnd(5, 11), s0: 0.1, s1: 0.1, r: 0.65, g: 1, b: 0.3, a: 0.95, turb: 1.6, drag: 0.8, fadeIn: 0.2, fade: 0.65 });
      else fly.emit({ x, y, z, life: rnd(6, 12), s0: 0.05, s1: 0.05, r: 1, g: 0.95, b: 0.75, a: 0.22, turb: 0.9, drag: 0.6, fadeIn: 0.25, fade: 0.6 });
    }
    flyState.acc = Math.min(flyState.acc, 2);
  }

  // ------------------------------------------------------------------ clima
  const climate = { target: { rain: 0, storm: 0, cloudCover: 0.35, windStrength: 0.35 }, timer: 90, kind: 'despejado', lightning: 8, manual: false };
  const KINDS = {
    despejado: { rain: 0, storm: 0, cloudCover: 0.18, windStrength: 0.22 },
    nublado: { rain: 0, storm: 0, cloudCover: 0.62, windStrength: 0.4 },
    llovizna: { rain: 0.35, storm: 0, cloudCover: 0.75, windStrength: 0.45 },
    lluvia: { rain: 0.75, storm: 0.1, cloudCover: 0.9, windStrength: 0.6 },
    tormenta: { rain: 1, storm: 1, cloudCover: 1, windStrength: 0.95 },
  };
  function nextKind(cur) {
    const r = Math.random();
    const table = { despejado: [['despejado', 0.2], ['nublado', 0.8]], nublado: [['despejado', 0.4], ['llovizna', 0.3], ['lluvia', 0.2], ['nublado', 0.1]], llovizna: [['nublado', 0.4], ['lluvia', 0.4], ['despejado', 0.2]], lluvia: [['llovizna', 0.4], ['tormenta', 0.3], ['nublado', 0.3]], tormenta: [['lluvia', 0.6], ['nublado', 0.4]] };
    let acc = 0; for (const [k, p] of table[cur]) { acc += p; if (r < acc) return k; }
    return 'despejado';
  }
  function setKind(k, silent = false) {
    climate.kind = k; Object.assign(climate.target, KINDS[k]);
    if (!silent) ctx.events.emit('weather:changed', { rain: climate.target.rain, storm: climate.target.storm, cloudCover: climate.target.cloudCover });
  }
  let t = 0;
  const _lp = new THREE.Vector3();
  function updateWeather(dt) {
    if (dt <= 0) return;
    if (!ctx.time.locked && !climate.manual && ctx.state === 'playing') {
      climate.timer -= dt;
      if (climate.timer <= 0) { setKind(nextKind(climate.kind)); climate.timer = rnd(150, 420); }
    }
    const k = Math.min(1, dt * 0.07);
    for (const key of ['rain', 'storm', 'cloudCover', 'windStrength']) {
      if (climate.manual || ctx.time.locked) continue; // los presets fijan el clima a mano
      W[key] += (climate.target[key] - W[key]) * k;
    }
    // la dirección del viento deriva lentamente
    const ang = Math.atan2(W.wind.y, W.wind.x) + dt * 0.012 * Math.sin(t * 0.05 + 1.3);
    W.wind.set(Math.cos(ang), Math.sin(ang));
    const gust = 0.08 * Math.sin(t * 0.31) + 0.05 * Math.sin(t * 0.83 + 2);
    W.windStrength = clamp(W.windStrength + gust * dt * 0.4, 0.05, 1);
    // humedad de superficies
    W.wetness = clamp(W.wetness + (W.rain > 0.15 ? dt * 0.04 * W.rain : -dt * 0.006), 0, 1);
    // relámpagos
    if (W.storm > 0.55 && ctx.state === 'playing') {
      climate.lightning -= dt;
      if (climate.lightning <= 0) {
        climate.lightning = rnd(5, 18) / W.storm;
        const a = Math.random() * 6.283, d = rnd(250, 1600);
        _lp.set(ctx.camera.position.x + Math.cos(a) * d, 300, ctx.camera.position.z + Math.sin(a) * d);
        ctx.events.emit('weather:lightning', { intensity: rnd(0.55, 1), position: _lp.clone() });
      }
    }
  }

  // ------------------------------------------------------------------ eventos del juego
  ctx.events.on('player:footstep', ({ surface, speed, position }) => {
    if (!position) return;
    const s = Math.min(1.6, (speed ?? 3) / 5);
    if (surface === 'arena') PRESETS.arena(position, { cantidad: 3 + ((s * 3) | 0), escala: 0.6 * s });
    else if (surface === 'agua') PRESETS.salpicadura(position, { cantidad: 5, escala: 0.4 * s });
    else if (surface === 'barro') PRESETS.polvo(position, { cantidad: 3, escala: 0.5 });
    else if (surface === 'nieve') PRESETS.polvo(position, { cantidad: 4, escala: 0.5 });
    else if (surface === 'hierba' && s > 0.9) PRESETS.hojas(position, { cantidad: 1 });
  });
  ctx.events.on('player:land', ({ position, speed }) => {
    if (!position || (speed ?? 0) < 4) return;
    PRESETS.polvo(position, { cantidad: Math.min(20, 6 + ((speed - 4) * 1.4) | 0), escala: Math.min(2, 0.7 + (speed - 4) * 0.1) });
  });
  ctx.events.on('creature:hit', ({ position }) => { if (position) PRESETS.sangre(position, { cantidad: 8 }); });
  ctx.events.on('creature:killed', ({ position }) => { if (position) { PRESETS.sangre(position, { cantidad: 18 }); PRESETS.polvo(position, { cantidad: 14, escala: 1.6 }); } });
  ctx.events.on('flora:felled', ({ position }) => { if (position) { PRESETS.hojas(v3.copy(position).setY(position.y + 6), { cantidad: 40 }); PRESETS.polvo(position, { cantidad: 12, escala: 1.5 }); } });

  ctx.fx = {
    emit(nombre, position, opts = {}) { const f = PRESETS[nombre]; if (f && position) f(position, opts); },
    createFire,
    setWeather(w) { climate.manual = true; Object.assign(W, w); Object.assign(climate.target, w); ctx.events.emit('weather:changed', { rain: W.rain, storm: W.storm, cloudCover: W.cloudCover }); },
    setClimate(kind) { if (KINDS[kind]) { climate.manual = false; setKind(kind); } },
    get climate() { return climate.kind; },
    layers: L,
  };

  return {
    name: 'fx',
    update(dt) {
      t += dt;
      updateWeather(dt);
      // iluminación de las partículas no aditivas según el momento del día
      const night = ctx.time.nightFactor;
      const k = 1 - W.cloudCover * 0.22;
      const tr = (1 - night) * k + night * 0.11, tg = (1 - night) * k * 0.98 + night * 0.14, tb = (1 - night) * k * 0.95 + night * 0.22;
      for (const l of layers) if (!l.additive) l.setTint(tr, tg, tb);
      updateFires(dt, t);
      updateAmbient(dt);
      const windV = { x: W.wind.x * W.windStrength * 2, z: W.wind.y * W.windStrength * 2 };
      for (const l of layers) l.update(dt, ctx.camera, windV);
      fly.update(dt, ctx.camera, null);
      rain.update(dt, W, ctx.state);
      // pequeñas salpicaduras de la lluvia cerca del jugador
      if (W.rain > 0.2 && dt > 0 && ctx.state === 'playing') {
        const n = W.rain * 55 * dt, p = ctx.camera.position;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, r = Math.random() * 14;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = ctx.world.getHeight(x, z);
          if (y > ctx.world.seaLevel + 0.1) L.duro.emit({ x, y: y + 0.03, z, vy: rnd(0.8, 1.6), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3), life: 0.25, s0: 0.04, s1: 0.07, r: 0.8, g: 0.88, b: 1, a: 0.55, grav: 9, fadeIn: 0, fade: 0.2 });
        }
      }
    },
  };
}
