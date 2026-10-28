// POBLACIÓN POR PROVINCIA — reparte las criaturas por el mapa grande sin mezclar épocas.
//
// Reglas:
//  · Cada provincia terrestre (world/provincias.js) tiene los ecosistemas del catálogo que se le asignaron; cada zona de mar, los suyos. En una provincia solo viven especies de
//    sus ecosistemas, y un animal salvaje no cruza su frontera (creature.js + territorio.js), así que Triásico, Jurásico, Cretácico y Mioceno nunca se encuentran.
//  · El mundo se divide en celdas de 360 m. Cada celda tiene un contenido determinista (semilla + coordenadas): hasta tres grupos de tierra, uno de aire y uno de mar.
//    Las celdas cercanas al jugador (≈1 km) se pueblan de forma incremental y las lejanas (>1,5 km) se vacían, de modo que la población activa es de ~150–220 criaturas
//    y el mapa entero «existe» sin simularse. Si matas a todo un grupo, su celda no se repuebla hasta pasados ~20 minutos de juego.
//  · Qué especie aparece en cada punto depende del bioma (pesos de hábitat deducidos del texto del catálogo), de la abundancia (los herbívoros pequeños son comunes, los
//    depredadores grandes y los gigantes, raros) y de la pendiente. Los cocodrilos van junto al agua; los voladores orbitan dentro de su provincia; los marinos, en su mar y a
//    profundidad suficiente.
// HONESTIDAD: los pesos de hábitat y las densidades son heurísticas de diseño, no datos paleontológicos; las especies de cada provincia se reparten por ecosistema de catálogo.
import * as THREE from 'three';
import { mulberry32, hash2 } from '../core/rng.js';
import { PROVINCIAS, MARES } from '../world/provincias.js';
import { SPECIES } from './species.js';
import { CATALOGO } from './catalogo.js';
import { esPropio } from './vinculo.js';
import { TERR } from './territorio.js';

const CELL = 360;
const R_SPAWN = 1000; // se pueblan las celdas a menos de esto del jugador
const R_MIN = 110; // …pero en juego no más cerca de esto; y entre 110 y 300 m solo FUERA del campo de visión de la cámara (ver `aplazar`)
const R_VISTA = 300;
const R_DESPAWN = 1500;
const MAX_SALVAJES = 220;
const GRUPOS_TIERRA = [1, 0.75, 0.5]; // intentos de grupo de tierra por celda (probabilidad relativa de cada uno)
const P_TIERRA = 0.5, P_AIRE = 0.09, P_MAR = 0.13;
const REPOSO_MATANZA = 1200; // s de juego antes de repoblar una celda cuyo grupo fue exterminado
const SEGURA_CARN = 380, SEGURA_HERB = 60; // alrededor del punto de aparición del jugador (los herbívoros pueden pastar cerca del inicio)

/** Densidad relativa de grupos por bioma. */
const DENS = { pradera: 1, bosque: 1.1, selva: 1.1, pantano: 0.8, playa: 0.5, desierto: 0.45, taiga: 0.6, montana: 0.4, nieve: 0.1, volcan: 0.1, mar: 0 };
// provincias con poca fauna en el catálogo (el Polo boreal solo tiene dos especies y es casi todo montaña y nieve): se compensa con más grupos por celda
const DENS_PROV = { boreal: 2.4, mioceno: 1.3 };
const BASE_HAB = { pradera: 1, bosque: 1, selva: 0.9, pantano: 0.45, playa: 0.35, desierto: 0.25, montana: 0.3, taiga: 0.5, nieve: 0.02, volcan: 0.04 };

/** Pesos de hábitat por bioma a partir del texto de región del catálogo (heurística). */
function pesosHabitat(row, rol) {
  const w = { ...BASE_HAB };
  const t = `${row.region} ${row.grupo}`.toLowerCase();
  const por = (bs, f) => { for (const b of bs) w[b] *= f; };
  if (/desiert|árid|arid|dunas/.test(t)) { por(['desierto'], 6); por(['pradera'], 0.8); por(['selva', 'pantano', 'bosque', 'taiga'], 0.35); }
  if (/manglar|delta|pantan|marism|río|ríos|fluvial|inundaci|lagun|lago|humedal|amaz/.test(t)) por(['pantano', 'playa'], 3);
  if (/costa|costera|costero|isla|litoral/.test(t)) por(['playa'], 2.2);
  if (/bosque|selva|forest|templad/.test(t)) por(['bosque', 'selva', 'taiga'], 1.8);
  if (/llanura|pradera|sabana|estepa|abiert/.test(t)) por(['pradera'], 1.6);
  if (/montañ|sierra|altiplano|ladera|meseta/.test(t)) por(['montana'], 3);
  if (/polar|ártic|antárt|alaska/.test(t)) por(['taiga', 'nieve'], 3);
  if (rol === 'cocodrilo') { for (const b of Object.keys(w)) w[b] *= 0.15; w.pantano = 4; w.playa = 2.5; }
  return w;
}

function grupoDe(e) {
  const m = e.masa, manada = !!e.sp.ai?.manada;
  if (e.rol === 'marino') return m > 3000 ? [1, 1] : m > 300 ? [1, 3] : [3, 6];
  if (e.rol === 'volador') return m > 100 ? [1, 2] : [2, 5];
  if (e.rol === 'cocodrilo') return [1, 2];
  if (e.trofico === 'carn') { if (manada) return [2, 4]; return m > 800 ? [1, 1] : m > 50 ? [1, 2] : [1, 3]; }
  if (manada) return m > 20000 ? [2, 3] : m > 3000 ? [3, 5] : m > 300 ? [4, 7] : [5, 9];
  return m > 20000 ? [1, 2] : m > 3000 ? [1, 3] : [2, 4];
}

/** Ficha de población de cada especie implementada. */
function fichas() {
  const out = new Map();
  for (const row of CATALOGO) {
    const sp = SPECIES[row.id];
    if (!sp) continue;
    const dieta = row.dieta.toLowerCase();
    const carn = /carn[ií]voro|pisc[ií]voro/.test(dieta) && !/omn[ií]voro|herb[ií]voro/.test(dieta);
    const omn = !carn && /omn[ií]voro|insect[ií]voro|frug[ií]voro|(carn[ií]voro.*herb)/.test(dieta);
    const trofico = carn ? 'carn' : omn ? 'omn' : 'herb';
    const rol = sp.nada ? 'marino' : sp.ai?.vuelo ? 'volador' : row.tipoAnimal === 'cocodrilomorfo' ? 'cocodrilo' : 'terrestre';
    const masa = Math.max(0.1, row.masa || sp.masa || 1);
    let w = (trofico === 'carn' ? 0.2 : trofico === 'omn' ? 0.55 : 1) / Math.sqrt(1 + masa / 2500);
    if (rol === 'volador') w *= 0.7; else if (rol === 'cocodrilo') w *= 0.4;
    const e = { id: row.id, sp, row, rol, trofico, masa, w, hab: pesosHabitat(row, rol), pend: sp.radius > 2 ? 0.12 : sp.radius > 1 ? 0.17 : 0.25 };
    e.grupo = grupoDe(e);
    out.set(row.id, e);
  }
  return out;
}

export function createPoblacion(ctx, mgr, api, { eco = null, activo = true } = {}) {
  const world = ctx.world;
  const todas = fichas();
  // tablas por territorio
  const porEco = new Map();
  for (const e of todas.values()) { const k = e.row.ecosistema; if (!porEco.has(k)) porEco.set(k, []); porEco.get(k).push(e); }
  const delEco = (ids) => ids.flatMap((k) => porEco.get(k) ?? []);
  const filtro = eco ? new Set(eco) : null; // modo ?eco=: solo estas especies, en cualquier provincia
  const aplica = (lista) => (filtro ? lista.filter((e) => filtro.has(e.id)) : lista);
  const tierra = PROVINCIAS.map((p) => { const l = aplica(delEco(p.ecosistemas)); return { terrestres: l.filter((e) => e.rol === 'terrestre' || e.rol === 'cocodrilo'), voladores: l.filter((e) => e.rol === 'volador'), todas: l }; });
  const mar = MARES.map((m) => { const l = aplica(delEco(m.ecosistemas)); return { marinos: l.filter((e) => e.rol === 'marino'), voladores: l.filter((e) => e.rol === 'volador'), todas: l }; });
  if (filtro) { // en modo ecosistema, todo vale en cualquier provincia: la lista terrestre es la misma en todas
    const T = [...todas.values()].filter((e) => filtro.has(e.id));
    for (const t of tierra) { t.terrestres = T.filter((e) => e.rol === 'terrestre' || e.rol === 'cocodrilo'); t.voladores = T.filter((e) => e.rol === 'volador'); }
    for (const m of mar) { m.marinos = T.filter((e) => e.rol === 'marino'); m.voladores = []; }
  }

  const cells = new Map(); // key -> { grupos, poblada, hasta, n, muertos }
  const state = { activo, tickT: 0, lastX: 1e9, lastZ: 1e9, cola: [], nSalvajes: 0, precalT: 0, precal: null };

  function elegir(lista, pesoDe, rng) {
    let tot = 0; const ws = lista.map((e) => { const w = pesoDe(e); tot += w; return w; });
    if (tot <= 0) return null;
    let r = rng() * tot;
    for (let i = 0; i < lista.length; i++) { r -= ws[i]; if (r <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  /** Contenido determinista de la celda (ci, cj): lista de grupos { id, n, x, z, terr }. */
  function generar(ci, cj) {
    const rng = mulberry32((((hash2(ci, cj, 91) * 4294967296) >>> 0) ^ 0x5bd1e995) >>> 0);
    const out = [];
    const x0 = ci * CELL, z0 = cj * CELL, lim = world.limite;
    if (x0 > lim || z0 > lim || x0 + CELL < -lim || z0 + CELL < -lim) return out;
    const M = world.macro;
    const grupoDeEntrada = (e) => e.grupo[0] + Math.floor(rng() * (e.grupo[1] - e.grupo[0] + 1));
    // --- tierra (hasta tres grupos, cada uno en su propio punto de la celda)
    for (const fk of GRUPOS_TIERRA) {
    let hecho = false;
    for (let t = 0; t < 6 && !hecho; t++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      if (Math.abs(x) > lim - 20 || Math.abs(z) > lim - 20) continue; // la celda puede cruzar el borde del área jugable
      const pi = world.provinceIdx(x, z);
      if (pi === 255) continue;
      const h = world.getHeight(x, z);
      if (h < 1.2) continue;
      const b = world.getBiome(x, z);
      if (rng() > P_TIERRA * fk * (DENS[b] ?? 0.5) * (DENS_PROV[PROVINCIAS[pi].id] ?? 1)) { hecho = true; break; }
      const slope = world.getSlope(x, z), dc = world.coastDist(x, z);
      const e = elegir(tierra[pi].terrestres, (s) => {
        if (slope > s.pend) return 0;
        if (s.rol === 'cocodrilo' && !(dc < 320 || b === 'pantano')) return 0;
        return s.w * (s.hab[b] ?? 0.2);
      }, rng);
      if (!e) continue;
      out.push({ id: e.id, n: grupoDeEntrada(e), x, z, terr: { k: TERR.TIERRA, i: pi } });
      hecho = true;
    }
    }
    // --- aire sobre tierra
    if (rng() < P_AIRE) {
      for (let t = 0; t < 6; t++) {
        const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
        const pi = world.provinceIdx(x, z);
        if (Math.abs(x) > lim - 20 || Math.abs(z) > lim - 20) continue;
        if (pi === 255 || M.DB[Math.min(M.n - 1, Math.max(0, Math.floor((z + M.half) / M.cell))) * M.n + Math.min(M.n - 1, Math.max(0, Math.floor((x + M.half) / M.cell)))] < 300) continue;
        const e = elegir(tierra[pi].voladores, (s) => s.w, rng);
        if (!e) break;
        out.push({ id: e.id, n: grupoDeEntrada(e), x, z, terr: { k: TERR.AIRE, i: pi } });
        break;
      }
    }
    // --- mar
    for (let t = 0; t < 6; t++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      if (Math.abs(x) > lim - 20 || Math.abs(z) > lim - 20) continue;
      const mi = world.seaIdx(x, z);
      if (mi === 255) continue;
      const h = world.getHeight(x, z);
      if (h > -4) continue;
      if (rng() > P_MAR) break;
      const dc = world.coastDist(x, z);
      if (rng() < 0.2 && mar[mi].voladores.length) { // voladores marinos (p. ej. Pteranodon del Niobrara) orbitan el mar abierto
        const e = elegir(mar[mi].voladores, (s) => s.w, rng);
        if (e && dc < -260) out.push({ id: e.id, n: grupoDeEntrada(e), x, z, terr: { k: TERR.AIRE_MAR, i: mi } });
        break;
      }
      const e = elegir(mar[mi].marinos, (s) => {
        if (-h < s.sp.nada.minAgua + 1.5) return 0;
        if (s.sp.radius > 1.5 && dc > -220) return 0; // los gigantes, mar adentro
        return s.w;
      }, rng);
      if (!e) continue;
      out.push({ id: e.id, n: grupoDeEntrada(e), x, z, terr: { k: TERR.MAR, i: mi } });
      break;
    }
    return out;
  }

  function celda(ci, cj) {
    const key = `${ci},${cj}`;
    let c = cells.get(key);
    if (!c) { c = { key, ci, cj, grupos: generar(ci, cj), poblada: false, hasta: 0, n: 0, muertos: 0 }; cells.set(key, c); }
    return c;
  }

  // ------------------------------------------------------------------------------------------ creación de un grupo
  function crearGrupo(g, cel, enJuego) {
    const sp = SPECIES[g.id], e = todas.get(g.id);
    if (!sp || !e) return 0;
    const sx = world.spawn.x, sz = world.spawn.z, ds = Math.hypot(g.x - sx, g.z - sz);
    if (ds < (e.trofico === 'carn' && e.masa > 100 ? SEGURA_CARN : SEGURA_HERB)) return 0; // entorno seguro del punto de aparición
    if (enJuego && aplazar(g.x, g.z)) return -1; // demasiado cerca o a la vista: se reintenta en unos segundos
    const herd = { center: new THREE.Vector3(g.x, 0, g.z), members: [] };
    let hechos = 0;
    for (let i = 0; i < g.n; i++) {
      let x = g.x, z = g.z;
      if (e.rol !== 'volador' && i > 0) { // el resto del grupo, alrededor del primero y en terreno válido
        let ok = false;
        for (let t = 0; t < 8 && !ok; t++) {
          const a = Math.random() * Math.PI * 2, r = (3 + 2.5 * sp.radius) * (0.5 + Math.random());
          x = g.x + Math.cos(a) * r; z = g.z + Math.sin(a) * r;
          if (e.rol === 'marino') ok = world.seaIdx(x, z) === g.terr.i && world.getHeight(x, z) < -(sp.nada.minAgua + 1.5);
          else ok = world.provinceIdx(x, z) === g.terr.i && world.getHeight(x, z) > 0.8 && world.getSlope(x, z) < e.pend + 0.05;
        }
        if (!ok) continue;
      }
      const c = api.spawnAt(g.id, x, z, { herd, tint: Math.random() });
      if (!c) continue;
      c.terr = g.terr; c.pob = cel.key;
      // el constructor de un nadador busca agua suficiente si no la hay donde nace, y lo hace antes de tener territorio: si acabó fuera de su mar, se descarta
      if (c.nada && !c.dentro(c.position.x, c.position.z)) { api.remove(c); continue; }
      herd.members.push(c); hechos++;
    }
    return hechos;
  }

  // ¿Hay que aplazar la aparición en (x, z)? Nunca a menos de R_MIN del jugador; hasta R_VISTA, solo si la cámara no mira hacia ahí.
  const _dir = new THREE.Vector3();
  function aplazar(x, z) {
    const pp = ctx.player?.position ?? ctx.camera.position, d = Math.hypot(x - pp.x, z - pp.z);
    if (d < R_MIN) return true;
    if (d >= R_VISTA) return false;
    const cam = ctx.camera; cam.getWorldDirection(_dir);
    const dx = x - cam.position.x, dz = z - cam.position.z, l = Math.hypot(dx, dz) * Math.hypot(_dir.x, _dir.z) + 1e-6;
    const medioH = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (cam.aspect || 1.6));
    return (dx * _dir.x + dz * _dir.z) / l > Math.cos(Math.min(Math.PI * 0.95, medioH + 0.35)); // dentro del campo de visión (con margen)
  }

  function poblarCelda(cel, enJuego) {
    if (!cel.poblada) { cel.n = 0; for (const g of cel.grupos) g.hecho = false; } // población nueva de la celda
    let pend = 0;
    for (const g of cel.grupos) {
      if (g.hecho) continue;
      const r = crearGrupo(g, cel, enJuego);
      if (r < 0) { pend++; continue; }
      g.hecho = true; cel.n += r;
    }
    cel.poblada = true; cel.pend = pend; cel.reintento = ctx.time.elapsed + 3;
    if (cel.n === 0 && !pend) { cel.poblada = false; cel.hasta = ctx.time.elapsed + 30; } // nada que poner (zona segura): se reintenta más tarde
  }

  const contarSalvajes = () => { let n = 0; for (const c of api.creatures) if (c.pob && !c.muerta) n++; return n; };

  /** Candidatas a poblar alrededor de (px, pz): celdas aún vacías entre `dmin` y `dmax`, de la más cercana a la más lejana. */
  function candidatas(px, pz, dmin, dmax) {
    const ci0 = Math.floor(px / CELL), cj0 = Math.floor(pz / CELL), rad = Math.ceil(dmax / CELL) + 1, out = [];
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const ci = ci0 + di, cj = cj0 + dj, d = Math.hypot((ci + 0.5) * CELL - px, (cj + 0.5) * CELL - pz);
      if (d > dmax || d < dmin) continue;
      const cel = celda(ci, cj);
      if (!cel.grupos.length || ctx.time.elapsed < cel.hasta) continue;
      if (cel.poblada && !(cel.pend > 0 && ctx.time.elapsed >= cel.reintento)) continue; // poblada (salvo grupos aplazados listos para reintentar)
      out.push({ cel, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  /**
   * Rebaño de bienvenida: el punto de inicio es una playa con mar abierto delante y las celdas de tierra más cercanas suelen tener su primer grupo a
   * más de 300 m, así que al empezar no se veía ningún animal. Se coloca UNA vez por partida un grupo de herbívoros de la provincia a 100–180 m,
   * en el arco hacia el que mira el jugador al aparecer (tierra adentro), sobre terreno firme y llano.
   */
  let bienvenidaHecha = false;
  function bienvenida() {
    if (bienvenidaHecha) return 0;
    bienvenidaHecha = true;
    const sp = world.spawn, yaw = Math.atan2(sp.x, sp.z), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let mejor = null;
    for (let r = 100; r <= 180 && !mejor; r += 20) for (let k = -6; k <= 6; k++) {
      const a = Math.atan2(fz, fx) + k * 0.14, x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      const pi = world.provinceIdx(x, z);
      if (pi === 255 || world.getHeight(x, z) < 1.6 || world.getSlope(x, z) > 0.12) continue;
      const pts = Math.abs(k); if (!mejor || pts < mejor.pts) mejor = { x, z, pi, pts };
    }
    if (!mejor) return 0;
    const b = world.getBiome(mejor.x, mejor.z);
    const e = elegir(tierra[mejor.pi].terrestres.filter((s2) => s2.trofico === 'herb' && s2.rol === 'terrestre' && s2.masa >= 80 && s2.masa <= 6000), (s2) => s2.w * (s2.hab[b] ?? 0.2) * (s2.sp.ai?.manada ? 2 : 1), Math.random);
    if (!e) return 0;
    const g = { id: e.id, n: Math.max(3, e.grupo[1]), x: mejor.x, z: mejor.z, terr: { k: TERR.TIERRA, i: mejor.pi } };
    return Math.max(0, crearGrupo(g, { key: 'bienvenida' }, false));
  }

  /** Puebla de golpe todo el entorno del jugador (inicio, teletransporte, pruebas). Devuelve cuántas criaturas creó. `conBienvenida`: añade el rebaño de bienvenida (inicio de partida). */
  function llenar({ x, z, radio = R_SPAWN, min = 40, conBienvenida = false } = {}) {
    const p = ctx.player?.position ?? ctx.camera.position;
    const px = x ?? p.x, pz = z ?? p.z;
    const antes = api.creatures.length;
    if (conBienvenida) bienvenida();
    for (const { cel } of candidatas(px, pz, min, radio)) { if (contarSalvajes() >= MAX_SALVAJES) break; poblarCelda(cel, false); }
    return api.creatures.length - antes;
  }

  // ------------------------------------------------------------------------------------------ mantenimiento
  function vaciarLejanas(px, pz) {
    for (const c of [...api.creatures]) {
      if (!c.pob) continue;
      const cel = cells.get(c.pob);
      if (c.muerta) { if (!c.contada) { c.contada = true; if (cel) { cel.n--; cel.muertos++; } } if (cel && cel.poblada && cel.n <= 0) { cel.poblada = false; cel.hasta = ctx.time.elapsed + REPOSO_MATANZA; } continue; }
      const d = Math.hypot(c.position.x - px, c.position.z - pz);
      if (d < R_DESPAWN) continue;
      if (esPropio(c) || (c.rel && c.rel.hab >= 1) || c.jinete || ['chase', 'charge', 'ride', 'defend'].includes(c.state)) continue;
      api.remove(c);
      if (cel) { cel.n--; if (cel.n <= 0) { cel.poblada = false; cel.hasta = cel.muertos ? ctx.time.elapsed + REPOSO_MATANZA * 0.5 : 0; } }
    }
  }

  /** Construye por adelantado (en ratos libres) los modelos de las especies de la provincia del jugador: así su primera aparición no congela el juego. */
  function precalentar(px, pz) {
    if (!state.precal) {
      const pi = world.provinceIdx(px, pz), mi = world.seaIdx(px, pz);
      const lista = pi !== 255 ? [...tierra[pi].todas] : mi !== 255 ? [...mar[mi].todas] : [];
      // las de la provincia vecina también: el jugador cruza fronteras
      state.precal = { clave: `${pi}|${mi}`, lista: lista.sort((a, b) => b.w - a.w) };
    }
    const t = state.precal.lista.shift();
    if (t) mgr.getBuilt(t.sp);
  }

  function update(dt) {
    if (!state.activo || ctx.state === 'loading') return;
    state.tickT -= dt;
    if (state.cola.length) { // reparte la creación de una celda por actualización
      const c = state.cola.shift();
      if ((!c.cel.poblada || c.cel.pend > 0) && contarSalvajes() < MAX_SALVAJES) poblarCelda(c.cel, ctx.state === 'playing');
      return;
    }
    if (state.tickT > 0) return;
    state.tickT = 0.5;
    const p = ctx.player?.position ?? ctx.camera.position;
    const salto = Math.hypot(p.x - state.lastX, p.z - state.lastZ);
    state.lastX = p.x; state.lastZ = p.z;
    if (salto > 700) { llenar({ min: 90 }); state.precal = null; return; } // teletransporte o reaparición
    vaciarLejanas(p.x, p.z);
    if (contarSalvajes() < MAX_SALVAJES) state.cola = candidatas(p.x, p.z, R_MIN, R_SPAWN).slice(0, 4);
    if (!state.cola.length) {
      state.precalT -= 0.5;
      if (state.precalT <= 0) { state.precalT = 1.5; if (!state.precal || state.precal.clave !== `${world.provinceIdx(p.x, p.z)}|${world.seaIdx(p.x, p.z)}`) state.precal = null; precalentar(p.x, p.z); }
    }
  }

  return {
    update, llenar,
    get activo() { return state.activo; },
    set activo(v) { state.activo = !!v; },
    /** Olvida el estado de las celdas (tras `fauna.clear()`). */
    reiniciar() { cells.clear(); state.cola.length = 0; },
    tabla: { tierra, mar, todas },
    celdas: cells,
    /** Territorio ({ k, i }) que le corresponde a una especie en (x, z): su provincia (tierra o aire) o su zona de mar; null si no encaja (p. ej. un marino en tierra). */
    territorioEn(id, x, z) {
      const e = todas.get(id); if (!e) return null;
      const pi = world.provinceIdx(x, z), mi = world.seaIdx(x, z);
      if (e.rol === 'marino') return mi !== 255 ? { k: TERR.MAR, i: mi } : null;
      if (e.rol === 'volador') return pi !== 255 ? { k: TERR.AIRE, i: pi } : mi !== 255 ? { k: TERR.AIRE_MAR, i: mi } : null;
      return pi !== 255 ? { k: TERR.TIERRA, i: pi } : null;
    },
    /** Especies que viven en el punto (x, z) (provincia o mar). */
    especiesEn(x, z) {
      const pi = world.provinceIdx(x, z);
      if (pi !== 255) return tierra[pi].todas.map((e) => e.id);
      const mi = world.seaIdx(x, z);
      return mi !== 255 ? mar[mi].todas.map((e) => e.id) : [];
    },
    generar,
    stats() {
      const por = {};
      for (const c of api.creatures) if (c.pob && !c.muerta) { por[c.especie] = (por[c.especie] ?? 0) + 1; }
      return { salvajes: contarSalvajes(), celdas: cells.size, pobladas: [...cells.values()].filter((c) => c.poblada).length, cola: state.cola.length, porEspecie: por };
    },
    constantes: { CELL, R_SPAWN, R_MIN, R_VISTA, R_DESPAWN, MAX_SALVAJES },
  };
}
