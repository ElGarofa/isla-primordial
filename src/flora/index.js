// Módulo FLORA: árboles, arbustos, helechos, rocas y hierba. Colocación determinista por bioma, streaming por celdas con LOD,
// instancing, viento en el vertex shader y recolección (pick/damage) con drops.
import * as THREE from 'three';
import { mulberry32, hash2 } from '../core/rng.js';
import { createNoise2D, fbm } from '../core/noise.js';
import { CONFIG } from '../core/config.js';
import { ITEMS, recolectar } from '../core/items.js';
import { getHeight, getSlope } from '../world/heightfield.js';
import { makeFoliage, makeFrond, makeGrass, makeNeedles, makeBark } from './textures.js';
import { buildPalm, buildJungleTree, buildConifer, buildBush, buildFern, buildRock, buildGrassClump } from './geometry.js';

const CELL = 96;
const R_TREES = 560; // radio de carga de árboles (m)
const R_UNDER = 130; // radio del sotobosque (arbustos/helechos/rocas pequeñas)
const R_UNLOAD = 640;
const LOD_D = [70, 210];
const noiseF = createNoise2D(CONFIG.seed + 500);
const noiseM = createNoise2D(CONFIG.seed + 300); // el mismo de world.getBiome (humedad)

/** Parche de viento + fundido por distancia (para la hierba). Usa los uniforms compartidos de render. */
function windify(mat, ctx, key, { fade = null, leaf = false } = {}) {
  const u = ctx.lighting?.uniforms;
  mat.onBeforeCompile = (sh) => {
    if (u) { sh.uniforms.uTime = u.uTime; sh.uniforms.uWind = u.uWind; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 iw = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 iw = vec2(0.0);
        #endif
        ${fade ? `float fdist = length((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz - cameraPosition);
        transformed *= 1.0 - smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, fdist);` : ''}
        float ph = iw.x * 0.045 + iw.y * 0.037;
        float gust = 0.5 + 0.5 * sin(uTime * 0.9 + ph) * (0.65 + 0.35 * sin(uTime * 0.37 + iw.x * 0.011));
        vec3 wd = normalize(vec3(uWind.x, 0.0001, uWind.z));
        float amp = (0.18 + uWind.y * 1.7) * gust;
        float sw2 = aSway * aSway;
        transformed += wd * amp * sw2 * ${leaf ? '1.1' : '0.75'};
        transformed.y -= amp * 0.12 * sw2;
        float fl = sin(uTime * (5.0 + uWind.y * 6.0) + position.x * 2.3 + position.z * 1.9 + ph * 3.0);
        transformed.xz += vec2(fl, cos(uTime * 4.3 + position.y * 3.0 + ph)) * 0.03 * aSway * (0.3 + uWind.y) * ${leaf ? '1.0' : '0.3'};`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export async function create(ctx) {
  const world = ctx.world;
  const scene = ctx.scene;
  const root = new THREE.Group(); root.name = 'flora'; scene.add(root);

  // ------------------------------------------------------------ materiales
  const T = { bark: { selva: makeBark('selva'), palma: makeBark('palma'), conifera: makeBark('conifera') }, foliage: makeFoliage(3, 98), foliageDark: makeFoliage(8, 104), frond: makeFrond(5), needles: makeNeedles(11), grass: makeGrass(9) };
  const mats = {};
  const barkMat = (kind, rep) => {
    const t = T.bark[kind]; t.albedo.repeat.set(rep[0], rep[1]); t.normal.repeat.set(rep[0], rep[1]);
    return windify(new THREE.MeshStandardMaterial({ map: t.albedo, normalMap: t.normal, vertexColors: true, roughness: 0.95, metalness: 0 }), ctx, 'bark-' + kind);
  };
  const leafMat = (map, key, emissive = 0x16260c) => {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.78, metalness: 0, emissive, emissiveMap: map, emissiveIntensity: 0.55 });
    return windify(m, ctx, key, { leaf: true });
  };
  const berryMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }), ctx, 'baya');
  mats.palma = [barkMat('palma', [1, 1]), leafMat(T.frond, 'frond', 0x1a2a0a), berryMat];
  mats.selva = [barkMat('selva', [1, 1]), leafMat(T.foliage, 'selva'), berryMat];
  mats.conifera = [barkMat('conifera', [1, 1]), leafMat(T.needles, 'aguja', 0x0e1a10), berryMat];
  mats.arbusto = [barkMat('selva', [1, 1]), leafMat(T.foliageDark, 'arbusto'), berryMat];
  mats.baya = mats.arbusto;
  mats.helecho = [barkMat('selva', [1, 1]), leafMat(T.frond, 'helecho', 0x1a2a0a), berryMat];
  const rockTex = makeBark('conifera', 128);
  mats.roca = [new THREE.MeshStandardMaterial({ vertexColors: true, map: rockTex.albedo, normalMap: rockTex.normal, roughness: 0.92, metalness: 0, color: 0xcfc9bf })];
  for (const m of Object.values(mats)) m.forEach((x) => ctx.lighting?.setupMaterial?.(x));

  // ------------------------------------------------------------ geometrías (perezosas, cacheadas)
  const geoCache = new Map();
  const builders = {
    palma: { n: 2, fn: buildPalm }, selva: { n: 3, fn: buildJungleTree }, conifera: { n: 2, fn: buildConifer },
    arbusto: { n: 2, fn: (s, l) => buildBush(s, l, false) }, baya: { n: 1, fn: (s, l) => buildBush(s + 50, l, true) },
    helecho: { n: 1, fn: buildFern }, roca: { n: 3, fn: (s, l) => buildRock(s, l === 0 ? 3 : 2) },
  };
  function geoFor(type, variant, lod) {
    const l = type === 'roca' || type === 'arbusto' || type === 'baya' || type === 'helecho' ? Math.min(lod, 1) : lod;
    const key = `${type}|${variant}|${l}`;
    let g = geoCache.get(key);
    if (!g) { g = builders[type].fn(variant + 1, l); geoCache.set(key, g); }
    return g;
  }

  // ------------------------------------------------------------ registro de recolectables y colisiones
  const registry = new Map(); // id -> entrada
  const removed = new Set();
  const cells = new Map();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const HP = { arbol: 100, roca: 90, baya: 30 };
  const TRUNK_R = { palma: 0.34, selva: 0.62, conifera: 0.42 };
  const HEIGHT = { palma: 11, selva: 28, conifera: 20 };

  // ------------------------------------------------------------ generación determinista de una celda
  function biomeAt(x, z, h) {
    if (h < 3.2) return 'playa';
    if (h > 125) return 'nieve';
    if (h > 62) return 'montana';
    return fbm(noiseM, x * 0.0035, z * 0.0035, 3) > -0.02 ? 'selva' : 'pradera';
  }

  function genTrees(cx, cz) {
    const rnd = mulberry32((hash2(cx, cz, 11) * 4294967296) >>> 0);
    const out = [];
    const SP = 6.2, n = Math.ceil(CELL / SP);
    for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
      const x = cx * CELL + (gx + rnd()) * SP, z = cz * CELL + (gz + rnd()) * SP;
      const h = getHeight(x, z);
      if (h < 0.9) { rnd(); rnd(); continue; }
      const slope = getSlope(x, z);
      const b = biomeAt(x, z, h);
      const dens = fbm(noiseF, x * 0.012, z * 0.012, 3); // claros y arboledas
      const r = rnd(), r2 = rnd();
      let type = null;
      if (b === 'playa') { if (h > 1.1 && slope < 0.22 && r < 0.085 + Math.max(0, dens) * 0.06) type = 'palma'; }
      else if (b === 'selva') { if (slope < 0.3 && r < 0.46 + dens * 0.42 && dens > -0.5) type = 'selva'; else if (slope < 0.3 && r > 0.97) type = 'palma'; }
      else if (b === 'pradera') { if (slope < 0.28 && r < 0.035 + Math.max(0, dens) * 0.08) type = 'selva'; }
      else if (b === 'montana') { if (slope < 0.4 && r < 0.26 + dens * 0.15 && h < 108) type = 'conifera'; }
      if (!type && slope < 0.5 && r2 < (b === 'montana' ? 0.05 : b === 'nieve' ? 0.04 : 0.012)) type = 'roca';
      if (!type) continue;
      const variant = (rnd() * builders[type].n) | 0;
      out.push({ type, variant, x, y: h, z, rot: rnd() * 6.283, sc: type === 'roca' ? 0.8 + rnd() * 2.6 : 0.85 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.08 });
    }
    return out;
  }

  function genUnder(cx, cz) {
    const rnd = mulberry32((hash2(cx, cz, 23) * 4294967296) >>> 0);
    const out = [];
    const SP = 3.4, n = Math.ceil(CELL / SP);
    for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
      const x = cx * CELL + (gx + rnd()) * SP, z = cz * CELL + (gz + rnd()) * SP;
      const h = getHeight(x, z);
      const r = rnd(), r2 = rnd();
      if (h < 2.4 || h > 100) continue;
      const slope = getSlope(x, z);
      if (slope > 0.32) continue;
      const b = biomeAt(x, z, h);
      const dens = fbm(noiseF, x * 0.02 + 40, z * 0.02, 3);
      let type = null;
      if (b === 'selva') { if (r < 0.2 + dens * 0.1) type = 'helecho'; else if (r < 0.3 + dens * 0.1) type = 'arbusto'; else if (r < 0.325) type = 'baya'; else if (r2 < 0.02) type = 'roca'; }
      else if (b === 'pradera') { if (r < 0.1) type = 'arbusto'; else if (r < 0.13) type = 'baya'; else if (r < 0.2) type = 'helecho'; else if (r2 < 0.03) type = 'roca'; }
      else if (b === 'playa' && h > 2.4) { if (r < 0.06) type = 'arbusto'; else if (r2 < 0.02) type = 'roca'; }
      if (!type) continue;
      const variant = (rnd() * builders[type].n) | 0;
      const small = type === 'roca';
      out.push({ type, variant, x, y: h, z, rot: rnd() * 6.283, sc: small ? 0.25 + rnd() * 0.5 : 0.8 + rnd() * 0.6, tilt: 0 });
    }
    return out;
  }

  // ------------------------------------------------------------ mallas globales (una InstancedMesh por tipo|variante|LOD)
  // Todas las celdas cargadas aportan sus instancias a estos cubos: así el número de draw calls no crece con el número de celdas.
  const buckets = new Map();
  let needRebuild = false;
  function finalize(it) {
    _e.set(it.tilt, it.rot, it.tilt * 0.7); _q.setFromEuler(_e);
    _p.set(it.x, it.y - (it.type === 'roca' ? 0.12 * it.sc : 0.05), it.z);
    _s.set(it.sc * (it.type === 'roca' ? 1.2 : 1), it.sc, it.sc * (it.type === 'roca' ? 1.1 : 1));
    _m.compose(_p, _q, _s); it.mat = new Float32Array(16); _m.toArray(it.mat);
  }
  function createBucket(key, cap) {
    const [type, v, lod] = key.split('|');
    const mesh = new THREE.InstancedMesh(geoFor(type, +v, +lod), mats[type], cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = +lod <= 1 && (type === 'palma' || type === 'selva' || type === 'conifera' || type === 'roca'); mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false; mesh.count = 0; mesh.name = 'flora:' + key;
    root.add(mesh);
    return { mesh, cap };
  }
  function rebuildBuckets() {
    needRebuild = false;
    const lists = new Map();
    for (const cell of cells.values()) {
      const push = (it) => {
        if (removed.has(it.id)) return;
        const k = `${it.type}|${it.variant}|${cell.lod}`;
        let l = lists.get(k); if (!l) lists.set(k, (l = [])); l.push(it);
      };
      for (const it of cell.trees) push(it);
      if (cell.underOn && cell.underList) for (const it of cell.underList) push(it);
    }
    for (const b of buckets.values()) b.mesh.count = 0;
    for (const [k, list] of lists) {
      let b = buckets.get(k);
      if (!b || b.cap < list.length) {
        if (b) { root.remove(b.mesh); b.mesh.dispose(); }
        b = createBucket(k, Math.ceil((list.length * 1.4) / 256) * 256 + 256); buckets.set(k, b);
      }
      const arr = b.mesh.instanceMatrix.array;
      for (let i = 0; i < list.length; i++) arr.set(list[i].mat, i * 16);
      b.mesh.count = list.length; b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function register(cell, list) {
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      it.id = `${cell.key}:${it.type}:${it.variant}:${i}:${list === cell.trees ? 't' : 'u'}`;
      if (removed.has(it.id)) continue;
      const tipo = it.type === 'roca' ? 'roca' : it.type === 'baya' ? 'baya' : (it.type === 'palma' || it.type === 'selva' || it.type === 'conifera') ? 'arbol' : null;
      if (!tipo) continue;
      const r = tipo === 'arbol' ? TRUNK_R[it.type] * it.sc : tipo === 'roca' ? 0.9 * it.sc : 0.5 * it.sc;
      const hgt = tipo === 'arbol' ? HEIGHT[it.type] * it.sc : tipo === 'roca' ? 1.1 * it.sc : 1.2;
      it.coll = world.colliders.addCircle(it.x, it.z, r, { height: hgt, kind: tipo, owner: it.id });
      registry.set(it.id, { id: it.id, tipo, it, hp: HP[tipo], hpMax: HP[tipo], cooldown: 0 });
    }
  }
  function unregister(list) {
    for (const it of list) { if (it.coll != null) { world.colliders.remove(it.coll); it.coll = null; } registry.delete(it.id); }
  }

  function loadCell(cx, cz, distance) {
    const key = `${cx},${cz}`;
    const cell = { key, cx, cz, trees: genTrees(cx, cz), underList: null, lod: distance < LOD_D[0] ? 0 : distance < LOD_D[1] ? 1 : 2, underOn: false };
    for (const it of cell.trees) it.cell = cell;
    register(cell, cell.trees);
    for (const it of cell.trees) finalize(it);
    cells.set(key, cell);
    if (distance < R_UNDER) setUnder(cell);
    needRebuild = true;
    return cell;
  }
  function setUnder(cell) {
    if (!cell.underList) { cell.underList = genUnder(cell.cx, cell.cz); register(cell, cell.underList); for (const it of cell.underList) finalize(it); }
    cell.underOn = true;
  }
  function unloadCell(cell) {
    unregister(cell.trees); if (cell.underList) unregister(cell.underList);
    cells.delete(cell.key); needRebuild = true;
  }

  // ------------------------------------------------------------ hierba (rejilla toroidal alrededor de la cámara)
  const GRASS_G = 120, GRASS_SP = 0.66;
  const grassGeo = buildGrassClump();
  const grassMat = windify(new THREE.MeshStandardMaterial({ map: T.grass, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9, metalness: 0, emissive: 0x0f1c08, emissiveMap: T.grass, emissiveIntensity: 0.5 }), ctx, 'hierba', { fade: [28, 40], leaf: true });
  ctx.lighting?.setupMaterial?.(grassMat);
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_G * GRASS_G);
  grass.frustumCulled = false; grass.castShadow = false; grass.receiveShadow = true;
  grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_G * GRASS_G * 3).fill(1), 3);
  root.add(grass);
  const slotCell = new Int32Array(GRASS_G * GRASS_G * 2).fill(-999999);
  const _c = new THREE.Color();
  let lastGi = 1e9, lastGj = 1e9;

  function updateGrass(force = false) {
    const cam = ctx.camera.position;
    const gi = Math.floor(cam.x / GRASS_SP), gj = Math.floor(cam.z / GRASS_SP);
    if (!force && gi === lastGi && gj === lastGj) return;
    lastGi = gi; lastGj = gj;
    const G = GRASS_G, half = G >> 1;
    let dirty = false;
    for (let b = 0; b < G; b++) {
      const cj = b + G * Math.floor((gj - b + half) / G);
      for (let a = 0; a < G; a++) {
        const ci = a + G * Math.floor((gi - a + half) / G);
        const k = b * G + a;
        if (slotCell[k * 2] === ci && slotCell[k * 2 + 1] === cj) continue;
        slotCell[k * 2] = ci; slotCell[k * 2 + 1] = cj; dirty = true;
        const r1 = hash2(ci, cj, 1), r2 = hash2(ci, cj, 2), r3 = hash2(ci, cj, 3), r4 = hash2(ci, cj, 4);
        const x = (ci + r1) * GRASS_SP, z = (cj + r2) * GRASS_SP;
        const h = getHeight(x, z);
        let ok = h > 1.7 && h < 95;
        if (ok) {
          const b2 = biomeAt(x, z, h);
          ok = (b2 === 'selva' || b2 === 'pradera' || (b2 === 'playa' && h > 3.0 && r3 > 0.55)) && getSlope(x, z) < 0.3;
          if (ok && b2 === 'selva') ok = fbm(noiseF, x * 0.012, z * 0.012, 2) > -0.45 || r3 > 0.5;
        }
        if (!ok) { grass.setMatrixAt(k, zeroM); continue; }
        const sc = 0.75 + r3 * 0.9;
        _e.set(0, r4 * 6.283, 0); _q.setFromEuler(_e); _p.set(x, h - 0.02, z); _s.set(sc * (0.9 + r1 * 0.5), sc * (0.7 + r2 * 0.7), sc);
        _m.compose(_p, _q, _s); grass.setMatrixAt(k, _m);
        const dry = fbm(noiseM, x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
        _c.setRGB(0.82 + dry * 0.35 + r2 * 0.12, 0.92 + r1 * 0.15 - dry * 0.05, 0.62 + r3 * 0.2);
        grass.setColorAt(k, _c);
      }
    }
    if (dirty) { grass.instanceMatrix.needsUpdate = true; grass.instanceColor.needsUpdate = true; }
  }

  // ------------------------------------------------------------ árboles que caen
  const falling = [];
  const stumps = new THREE.Group(); root.add(stumps);
  const stumpGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.55, 8);
  const stumpMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 });

  function removeInstance(it) {
    removed.add(it.id); needRebuild = true;
    if (it.coll != null) { world.colliders.remove(it.coll); it.coll = null; }
    registry.delete(it.id);
  }

  function fellTree(e, awayDir) {
    const it = e.it;
    removeInstance(it);
    const mesh = new THREE.Mesh(geoFor(it.type, it.variant, 1), mats[it.type]);
    mesh.castShadow = true; mesh.position.set(it.x, it.y, it.z); mesh.scale.setScalar(it.sc); mesh.rotation.y = it.rot;
    root.add(mesh);
    const axis = new THREE.Vector3(awayDir.z, 0, -awayDir.x).normalize();
    falling.push({ mesh, axis, t: 0, it, awayDir: awayDir.clone() });
    const st = new THREE.Mesh(stumpGeo, stumpMat); st.position.set(it.x, it.y + 0.2, it.z); st.castShadow = true; stumps.add(st);
    ctx.events.emit('flora:felled', { tipo: it.type, position: new THREE.Vector3(it.x, it.y, it.z), direccion: awayDir.clone() });
  }

  function updateFalling(dt) {
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const k = Math.min(1, f.t / 2.6);
      const ang = (Math.PI / 2 - 0.05) * (k * k * (3 - 2 * k) * 0.6 + k * k * k * 0.4);
      f.mesh.quaternion.setFromAxisAngle(f.axis, ang).multiply(_q.setFromEuler(_e.set(0, f.it.rot, 0)));
      if (k >= 1) {
        const base = new THREE.Vector3(f.it.x, f.it.y, f.it.z);
        ctx.fx?.emit?.('hojas', base.clone().addScaledVector(f.awayDir, 6), { cantidad: 30 });
        for (let n = 0; n < 2; n++) ctx.physics?.spawnProp?.('tronco', base.clone().addScaledVector(f.awayDir, 3 + n * 2.2).setY(f.it.y + 0.7), new THREE.Vector3(f.awayDir.x * 1.5, 1, f.awayDir.z * 1.5));
        root.remove(f.mesh); falling.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ API pública
  const _o = new THREE.Vector3();
  ctx.flora = {
    root, registry, cells, grass,
    /** Rayo contra troncos/rocas/arbustos con bayas. */
    pick(origin, dir, maxDist = 4) {
      for (let t = 0.3; t <= maxDist; t += 0.4) {
        _o.copy(origin).addScaledVector(dir, t);
        const list = world.colliders.query(_o.x, _o.z, 0.2);
        for (const c of list) {
          const e = registry.get(c.owner);
          if (!e) continue;
          const gy = getHeight(c.x, c.z);
          if (_o.y < gy - 0.3 || _o.y > gy + c.height + 0.3) continue;
          const dx = _o.x - c.x, dz = _o.z - c.z;
          if (dx * dx + dz * dz <= (c.radius + 0.15) ** 2) {
            return { id: e.id, tipo: e.tipo, position: new THREE.Vector3(c.x, gy, c.z), distance: t, vida: Math.round((e.hp / e.hpMax) * 100), nombre: { arbol: 'Árbol', roca: 'Roca', baya: 'Arbusto de bayas' }[e.tipo] };
          }
        }
      }
      return null;
    },
    /** Aplica daño; devuelve { destruido, drops } o null. `tags` = etiquetas de la herramienta en mano (core/items.js). */
    damage(id, cantidad, herramienta = null, tags = null) {
      const e = registry.get(id);
      if (!e) return null;
      tags = tags ?? ITEMS[herramienta]?.etiquetas ?? (herramienta === 'hacha_piedra' ? ['talar'] : herramienta === 'pico_piedra' ? ['picar'] : []);
      const pos = new THREE.Vector3(e.it.x, e.it.y, e.it.z);
      const bioma = ctx.world.getBiome(e.it.x, e.it.z);
      ctx.events.emit('flora:hit', { tipo: e.tipo, position: pos, herramienta });
      ctx.fx?.emit?.(e.tipo === 'roca' ? 'impacto_roca' : 'astillas', pos.clone().setY(pos.y + 1.2), {});
      if (e.tipo === 'arbol') {
        e.hp -= cantidad * (tags.includes('talar') ? 1 : 0.3);
        const drops = recolectar('arbol', 'golpe', tags, bioma);
        if (e.hp <= 0) {
          drops.push(...recolectar('arbol', 'caida', tags, bioma));
          const away = new THREE.Vector3(pos.x - ctx.camera.position.x, 0, pos.z - ctx.camera.position.z).normalize();
          fellTree(e, away);
          return { destruido: true, drops };
        }
        return { destruido: false, drops };
      }
      if (e.tipo === 'roca') {
        e.hp -= cantidad * (tags.includes('picar') ? 1 : 0.25);
        const drops = recolectar('roca', 'golpe', tags, bioma);
        if (e.hp <= 0) { drops.push(...recolectar('roca', 'caida', tags, bioma)); removeInstance(e.it); return { destruido: true, drops }; }
        return { destruido: false, drops };
      }
      if (e.tipo === 'baya') {
        if (ctx.time.elapsed < e.cooldown) return { destruido: false, drops: [] };
        e.cooldown = ctx.time.elapsed + 240;
        return { destruido: false, drops: recolectar('baya', 'golpe', tags, bioma) };
      }
      return { destruido: false, drops: [] };
    },
    getHarvestablesNear(pos, radius, out = []) {
      out.length = 0;
      for (const e of registry.values()) if (Math.hypot(e.it.x - pos.x, e.it.z - pos.z) < radius) out.push(e);
      return out;
    },
    stats() { let n = 0; for (const b of buckets.values()) n += b.mesh.count; return { celdas: cells.size, instancias: n, mallas: buckets.size, geometrias: geoCache.size, caidos: falling.length }; },
  };

  // ------------------------------------------------------------ streaming de celdas con presupuesto de tiempo
  let lastCx = 1e9, lastCz = 1e9;
  let queue = [];
  function plan() {
    const cam = ctx.camera.position;
    const ci = Math.floor(cam.x / CELL), cj = Math.floor(cam.z / CELL);
    if (ci === lastCx && cj === lastCz && queue.length === 0) return;
    lastCx = ci; lastCz = cj;
    queue = [];
    const rad = Math.ceil(R_TREES / CELL) + 1;
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const cx = ci + di, cz = cj + dj;
      const dist = Math.hypot((cx + 0.5) * CELL - cam.x, (cz + 0.5) * CELL - cam.z);
      if (dist > R_TREES + CELL * 0.7) continue;
      if (Math.hypot((cx + 0.5) * CELL, (cz + 0.5) * CELL) > world.size * 0.75) continue;
      const cell = cells.get(`${cx},${cz}`);
      const wantLod = dist < LOD_D[0] ? 0 : dist < LOD_D[1] ? 1 : 2;
      const wantUnder = dist < R_UNDER;
      if (!cell) queue.push({ cx, cz, dist, kind: 'load' });
      else if (cell.lod !== wantLod || (wantUnder && !cell.underOn)) queue.push({ cx, cz, dist, kind: 'rebuild', cell, wantLod, wantUnder });
    }
    queue.sort((a, b) => a.dist - b.dist);
    for (const cell of [...cells.values()]) {
      if (Math.hypot((cell.cx + 0.5) * CELL - cam.x, (cell.cz + 0.5) * CELL - cam.z) > R_UNLOAD) unloadCell(cell);
    }
  }
  function pump(budgetMs) {
    const t0 = performance.now();
    while (queue.length) {
      const q = queue.shift();
      if (q.kind === 'load') loadCell(q.cx, q.cz, q.dist);
      else {
        if (q.wantUnder) setUnder(q.cell);
        q.cell.lod = q.wantLod; needRebuild = true;
      }
      if (performance.now() - t0 > budgetMs) break;
    }
    if (needRebuild) rebuildBuckets();
  }

  // Carga inicial: todo lo cercano antes de mostrar el mundo
  ctx.camera.position.set(world.spawn.x, world.spawn.y + 2, world.spawn.z);
  plan(); pump(1e9);
  updateGrass(true);

  return {
    name: 'flora',
    update(dt) {
      plan();
      pump(ctx.state === 'loading' ? 1e9 : 4);
      updateGrass();
      updateFalling(dt);
    },
  };
}
