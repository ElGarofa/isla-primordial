#!/usr/bin/env node
// Prueba automática del MAPA del mundo (src/world, src/fauna/poblacion.js + territorio.js, flora por bioma, mapa de la interfaz).
//   Parte A (Node puro, sin navegador): rejillas macro (coherencia, determinismo), provincias (superficie, conectividad por tierra, islas aisladas),
//     biomas (reparto), recursos por bioma (tabla de recolección) y coherencia de épocas de la fauna por provincia y por mar.
//   Parte B (navegador, ?debug=1&stream=1): terreno (alturas finitas, LOD acotado al teletransportarse por todo el mundo), flora y recursos reales alrededor de un
//     punto interior de cada bioma, población por provincia (especies de su época y de su ecosistema), frontera (un animal salvaje no la cruza), mapa M.
// Uso: tools/lock.sh node tools/mundo-test.mjs [regex de escenario]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const only = process.argv[2] && !process.argv[2].startsWith('--') ? new RegExp(process.argv[2]) : null;

const resultados = [];
function informe(nombre, res) {
  const ok = res == null || (typeof res === 'object' && res.ok === true);
  resultados.push({ nombre, ok });
  console.log(`${ok ? '✔' : '✘'} ${nombre}${ok ? (res && res.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
}
async function A(nombre, fn) { if (only && !only.test(nombre)) return; let r; try { r = await fn(); } catch (e) { r = 'EXCEPCIÓN: ' + String(e.stack ?? e).slice(0, 400); } informe(nombre, r); }

// =================================================================================================== PARTE A (Node)
const { CONFIG } = await imp('src/core/config.js');
const { generarMundo } = await imp('src/world/generador.js');
const P = await imp('src/world/provincias.js');
const { BIOMAS, BIOMA_ID, PROVINCIAS, MARES, RASGOS } = P;
const cat = await imp('src/fauna/catalogo.js');
const items = await imp('src/core/items.js');

const t0 = Date.now();
const W = generarMundo({ seed: CONFIG.seed, size: CONFIG.world.size, n: CONFIG.world.macro });
const msGen = Date.now() - t0;
const { n, cell, half, H, B, P: PR, Z } = W, N2 = n * n;
const km2 = (celdas) => +(celdas * cell * cell / 1e6).toFixed(2);

const hash = (w) => { let h = 2166136261 >>> 0; const mix = (v) => { h = Math.imul(h ^ (v & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ ((v >>> 16) & 0xffff), 16777619) >>> 0; }; for (let k = 0; k < w.n * w.n; k++) { mix(Math.round(w.H[k] * 16)); mix(w.B[k] | (w.P[k] << 8) | (w.Z[k] << 16)); } return h.toString(16); };

await A('datos: rejillas macro coherentes (tierra ⇔ provincia ⇔ no-mar) y tamaño del mundo', () => {
  const mal = [];
  if (n * cell !== CONFIG.world.size) mal.push(`n·celda ${n * cell} ≠ tamaño ${CONFIG.world.size}`);
  let tierra = 0, mar = 0, bad = 0, nanH = 0, minH = 1e9, maxH = -1e9, pondsNegativos = 0;
  for (let k = 0; k < N2; k++) {
    if (!Number.isFinite(H[k])) { nanH++; continue; }
    minH = Math.min(minH, H[k]); maxH = Math.max(maxH, H[k]);
    const esMar = B[k] === BIOMAS.mar, sinProv = PR[k] === 255, conMar = Z[k] !== 255;
    if (esMar !== sinProv || esMar !== conMar) bad++;
    if (esMar) { mar++; if (Z[k] >= MARES.length) bad++; } else { tierra++; if (PR[k] >= PROVINCIAS.length) bad++; if (H[k] < 0) pondsNegativos++; }
  }
  if (nanH) mal.push(`${nanH} alturas no finitas`);
  if (bad) mal.push(`${bad} celdas incoherentes (bioma/provincia/mar)`);
  if (km2(tierra) < 40) mal.push(`solo ${km2(tierra)} km² de tierra`);
  return mal.length ? { motivo: mal.join('; ') } : { ok: true, info: { mundo: `${CONFIG.world.size / 1000}×${CONFIG.world.size / 1000} km`, km2Total: km2(N2), km2Tierra: km2(tierra), km2Mar: km2(mar), alturaMin: Math.round(minH), alturaMax: Math.round(maxH), lagunasEnTierra_km2: km2(pondsNegativos), msGenerar: msGen } };
});

await A('determinismo: la misma semilla da exactamente el mismo mundo; otra semilla, otro', () => {
  const h1 = hash(W), h2 = hash(generarMundo({ seed: CONFIG.seed, size: CONFIG.world.size, n: CONFIG.world.macro })), h3 = hash(generarMundo({ seed: CONFIG.seed + 1, size: CONFIG.world.size, n: CONFIG.world.macro }));
  if (h1 !== h2) return { motivo: 'no determinista', h1, h2 };
  if (h1 === h3) return { motivo: 'la semilla no cambia el mundo' };
  return { ok: true, info: { hash: h1, otraSemilla: h3 } };
});

// componentes conexos de tierra (8 vecinos) por celdas macro (16 m): ¿qué provincias se pueden recorrer a pie?
const comp = new Int32Array(N2).fill(-1); const tamComp = [];
for (let s = 0; s < N2; s++) {
  if (B[s] === BIOMAS.mar || comp[s] >= 0) continue;
  const id = tamComp.length; let cnt = 0; const pila = [s]; comp[s] = id;
  while (pila.length) {
    const k = pila.pop(); cnt++; const i = k % n, j = (k - i) / n;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const q = b * n + a; if (comp[q] < 0 && B[q] !== BIOMAS.mar) { comp[q] = id; pila.push(q); }
    }
  }
  tamComp.push(cnt);
}

await A('provincias: cada una existe, tiene superficie y su época coincide con su ecosistema; la de inicio es la de Hell Creek', () => {
  const area = new Array(PROVINCIAS.length).fill(0), compDe = PROVINCIAS.map(() => new Map());
  for (let k = 0; k < N2; k++) if (PR[k] !== 255) { area[PR[k]]++; compDe[PR[k]].set(comp[k], (compDe[PR[k]].get(comp[k]) ?? 0) + 1); }
  const mal = [], tabla = {};
  PROVINCIAS.forEach((p, i) => {
    const principal = [...compDe[i].entries()].sort((a, b) => b[1] - a[1])[0];
    tabla[p.id] = { km2: km2(area[i]), partesSeparadas: compDe[i].size };
    if (km2(area[i]) < 1.0) mal.push(`${p.id}: solo ${km2(area[i])} km²`);
    const cx = Math.floor((p.centro[0] + half) / cell), cz = Math.floor((p.centro[1] + half) / cell);
    if (cx >= 0 && cz >= 0 && cx < n && cz < n && PR[cz * n + cx] !== i && !p.centro) mal.push(`${p.id}: el centro no está en su provincia`);
  });
  const inicio = PROVINCIAS[0];
  if (inicio.id !== 'hell_creek') mal.push('la primera provincia no es hell_creek');
  return mal.length ? { motivo: mal.join('; ') } : { ok: true, info: tabla };
});

await A('conectividad: el continente se recorre a pie desde el inicio y las tres islas de otras épocas quedan aisladas por mar', () => {
  const spawnComp = (() => { // componente de la playa de inicio (primera tierra viniendo del mar por x = 0)
    for (let q = 0; q < n; q++) { const k = (n - 1 - q) * n + n / 2; if (B[k] !== BIOMAS.mar) return comp[k]; }
    return -1;
  })();
  const porProv = PROVINCIAS.map(() => new Set()); for (let k = 0; k < N2; k++) if (PR[k] !== 255) porProv[PR[k]].add(comp[k]);
  const alcanzables = PROVINCIAS.filter((p, i) => porProv[i].has(spawnComp)).map((p) => p.id);
  const aisladas = PROVINCIAS.filter((p, i) => !porProv[i].has(spawnComp)).map((p) => p.id);
  const mal = [];
  for (const isla of ['jur_temprano', 'triasico', 'mioceno']) if (alcanzables.includes(isla)) mal.push(`${isla} está unida por tierra al continente (las épocas se mezclarían)`);
  for (const id of ['hell_creek', 'laramidia', 'gobi', 'cret_calido', 'jur_tardio']) if (!alcanzables.includes(id)) mal.push(`${id} no es alcanzable a pie desde el inicio`);
  const grandes = tamComp.map((c, i) => [i, c]).filter(([, c]) => c * cell * cell > 1e6).map(([i, c]) => `${i}:${km2(c)} km²`);
  return mal.length ? { motivo: mal.join('; '), alcanzables, aisladas } : { ok: true, info: { alcanzablesAPie: alcanzables, aisladas, componentesDeMasDe1km2: grandes } };
});

await A('biomas: los 10 biomas de tierra existen con superficie apreciable y cada provincia grande mezcla varios', () => {
  const por = {}; let tierra = 0;
  const bProv = PROVINCIAS.map(() => new Map());
  for (let k = 0; k < N2; k++) { const b = B[k]; if (b === BIOMAS.mar) continue; tierra++; por[BIOMA_ID[b]] = (por[BIOMA_ID[b]] ?? 0) + 1; const m = bProv[PR[k]]; m.set(b, (m.get(b) ?? 0) + 1); }
  const mal = [], pct = {};
  for (const nombre of Object.keys(BIOMAS).filter((x) => x !== 'mar')) { const c = por[nombre] ?? 0; pct[nombre] = +(100 * c / tierra).toFixed(1); if (c / tierra < 0.004) mal.push(`${nombre}: ${pct[nombre]} % de la tierra (menos del 0,4 %)`); }
  const variedad = {};
  PROVINCIAS.forEach((p, i) => { const sig = [...bProv[i].values()].filter((c) => c >= 40).length; variedad[p.id] = sig; if (km2([...bProv[i].values()].reduce((a, b) => a + b, 0)) > 8 && sig < 3) mal.push(`${p.id}: solo ${sig} biomas`); });
  return mal.length ? { motivo: mal.join('; '), pct } : { ok: true, info: { porcentajeDeTierra: pct, biomasPorProvincia: variedad } };
});

await A('recursos: cada bioma tiene algo propio que recolectar y los cuatro recursos nuevos (arcilla, obsidiana, sal, ámbar) se pueden conseguir', () => {
  const porBioma = {}; const veta = (b, v) => { (porBioma[b] ??= new Set()).add(v); };
  for (const [tipo, fases] of Object.entries(items.RECOLECCION)) for (const lista of Object.values(fases)) for (const e of lista) if (e.bioma) veta(e.bioma, e.item);
  // flora/index.js reparte las vetas y cactus por bioma (ver MINERAL / genUnder); aquí se comprueba que existan sus tablas
  const faltan = ['veta_obsidiana', 'veta_sal', 'veta_arcilla', 'cactus'].filter((t) => !items.RECOLECCION[t]);
  const nuevos = ['arcilla', 'obsidiana', 'sal', 'ambar'].filter((it) => !items.ITEMS[it]);
  const obtenibles = new Set([...Object.values(items.RECOLECCION).flatMap((f) => Object.values(f).flat().map((e) => e.item))]);
  const sinFuente = ['arcilla', 'obsidiana', 'sal', 'ambar'].filter((it) => !obtenibles.has(it));
  const mal = [];
  if (faltan.length) mal.push('faltan tablas: ' + faltan.join(', '));
  if (nuevos.length) mal.push('items sin definir: ' + nuevos.join(', '));
  if (sinFuente.length) mal.push('sin fuente de recolección: ' + sinFuente.join(', '));
  return mal.length ? { motivo: mal.join('; ') } : { ok: true, info: Object.fromEntries(Object.entries(porBioma).map(([b, s]) => [b, [...s]])) };
});

// épocas: la familia de cada provincia/mar frente al periodo de cada especie de sus ecosistemas
const familia = (t) => (/Mioceno|Cenozoico/.test(t) ? 'Mioceno' : /Triásico/.test(t) ? 'Triásico' : /Jurásico/.test(t) ? 'Jurásico' : 'Cretácico');
const porEco = {}; for (const r of cat.CATALOGO) (porEco[r.ecosistema] ??= []).push(r);
const especiesDe = (t) => t.ecosistemas.flatMap((k) => porEco[k] ?? []);
await A('épocas: toda especie de una provincia o mar pertenece a la época de esa provincia (o a su frontera con la vecina) y ningún par de épocas lejanas comparte especies', () => {
  const mal = [], avisos = [], tabla = {};
  const lista = [...PROVINCIAS.map((p) => ({ ...p, tipo: 'provincia' })), ...MARES.map((m) => ({ ...m, tipo: 'mar' }))];
  for (const t of lista) {
    const f = familia(t.era), es = especiesDe(t);
    tabla[t.id] = es.length;
    if (!es.length) mal.push(`${t.id}: sin especies`);
    for (const r of es) {
      if (!r.periodo.includes(f)) mal.push(`${t.id} (${t.era}): ${r.id} es de «${r.periodo}»`);
      else if (familia(r.periodo) !== f) avisos.push(`${t.id}: ${r.id} «${r.periodo}»`);
      else if (/Jurásico (tardío|medio)/.test(r.periodo) && /temprano/.test(t.era)) avisos.push(`${t.id}: ${r.id} «${r.periodo}» en una isla «${t.era}»`);
    }
  }
  const ids = lista.map((t) => new Set(especiesDe(t).map((r) => r.id)));
  const saltos = [['Triásico', 'Cretácico'], ['Triásico', 'Mioceno'], ['Jurásico', 'Mioceno'], ['Cretácico', 'Mioceno'], ['Triásico', 'Jurásico']];
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
    const fa = familia(lista[i].era), fb = familia(lista[j].era);
    if (!saltos.some(([a, b]) => (a === fa && b === fb) || (a === fb && b === fa))) continue;
    const comunes = [...ids[i]].filter((x) => ids[j].has(x)); if (comunes.length) mal.push(`${lista[i].id} y ${lista[j].id} comparten ${comunes.join(', ')}`);
  }
  return mal.length ? { motivo: mal.slice(0, 12).join('; ') } : { ok: true, info: { especiesPorTerritorio: tabla, fronterasYAvisos: avisos } };
});

// =================================================================================================== PARTE B (navegador)
const hayB = !only || /terreno|flora|población|frontera|recorrido|mapa/.test(only.source);
let server, browser, page, pageUI; const errs = [];
if (hayB) {
  const { chromium } = require('/opt/npm-tools/node_modules/playwright');
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const abrir = async (query, w = 480, h = 270) => {
    const pg = await browser.newPage({ viewport: { width: w, height: h } });
    pg.on('pageerror', (e) => errs.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(`http://127.0.0.1:${port}/?debug=1&quality=low${query}`);
    await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    return pg;
  };
  page = await abrir('&ui=0&stream=1');
  await page.evaluate(async () => {
    const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, w = c.world;
    const T = window.__T = { g, c, p, F, w };
    c.render = () => {};
    c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
    T.prov = await import('/src/world/provincias.js');
    T.terr = await import('/src/fauna/territorio.js');
    T.cat = await import('/src/fauna/catalogo.js');
    T.avanza = (seg, dt = 0.1) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
    T.jug = (x, z) => { if (c.state === 'dead') c.survival.respawn(); p.teleport(x, z); p.velocity.set(0, 0, 0); c.survival.heal(100); };
    // punto interior de un bioma (mayor cuadrado de celdas macro del mismo bioma, en suelo poco inclinado), como mundo/shots.js
    T.puntoBioma = (id) => {
      const M = w.macro, n = M.n;
      const mismo = (i, j, r) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n || M.B[b * n + a] !== id) return false; } return true; };
      let best = null, br = -1, bd = 1e18;
      for (let j = 3; j < n - 3; j += 2) for (let i = 3; i < n - 3; i += 2) {
        if (M.B[j * n + i] !== id) continue;
        let r = 1; while (r < 14 && mismo(i, j, r + 1)) r++;
        const x = -M.half + (i + 0.5) * M.cell, z = -M.half + (j + 0.5) * M.cell, d = (x - w.spawn.x) ** 2 + (z - w.spawn.z) ** 2;
        if (w.getSlope(x, z) > 0.18 || Math.abs(x) > w.limite - 60 || Math.abs(z) > w.limite - 60) continue;
        if (r > br || (r === br && d < bd)) { br = r; bd = d; best = [x, z, r]; }
      }
      return best;
    };
  });
  pageUI = !only || /mapa/.test(only.source) ? await abrir('&ui=1', 1100, 800) : null;
}
async function EB(nombre, fn, arg, pg) {
  if (only && !only.test(nombre)) return;
  let r; try { r = await (pg ?? page).evaluate(fn, arg); } catch (e) { r = 'EXCEPCIÓN: ' + String(e).slice(0, 400); }
  informe(nombre, r);
}

if (hayB) {
  await EB('terreno: alturas finitas en todo el mundo y teletransporte a 8 lugares sin caerse, sin NaN y con los nodos de terreno acotados', () => {
    const T = window.__T, { w, p, c } = T, mal = [];
    let nan = 0; for (let k = 0; k < 40000; k++) { const x = (Math.sin(k * 12.9898) * 43758.5453 % 1) * w.size / 2, z = (Math.sin(k * 78.233) * 12345.678 % 1) * w.size / 2; if (!Number.isFinite(w.getHeight(x, z)) || !Number.isFinite(w.getSlope(x, z))) nan++; }
    if (nan) mal.push(`${nan} alturas/pendientes no finitas`);
    const lugares = [['inicio', w.spawn.x, w.spawn.z], ...[['gobi', 3800, 400], ['boreal', 0, -4550], ['laramidia', -3700, 700], ['meseta', 0, -1250], ['isla del Triásico', -5000, -4500], ['isla del Lias', -5250, 3700], ['Mioceno', 5200, 4600]].map(([n, x, z]) => [n, x, z])];
    const info = {}; let maxNodos = 0, maxTris = 0;
    for (const [nombre, x, z] of lugares) {
      T.jug(x, z); T.avanza(4, 0.1);
      const y = p.position.y, gy = w.getHeight(p.position.x, p.position.z), st = w.terrain.stats();
      if (![p.position.x, y, p.position.z].every(Number.isFinite)) mal.push(`${nombre}: posición no finita`);
      if (y < gy - 0.5 && gy > 0) mal.push(`${nombre}: el jugador atraviesa el suelo (y ${y.toFixed(1)} < ${gy.toFixed(1)})`);
      maxNodos = Math.max(maxNodos, st.construidos); maxTris = Math.max(maxTris, st.triangulos);
      info[nombre] = { y: +y.toFixed(1), suelo: +gy.toFixed(1), construidos: st.construidos, nodosEnArbol: st.nodos, tris: st.triangulos };
    }
    if (maxNodos > 330) mal.push(`demasiados nodos de terreno con malla (${maxNodos}; tope 320)`);
    if (maxTris > 900000) mal.push(`demasiados triángulos de terreno (${maxTris})`);
    const ray = w.raycastTerrain({ x: w.spawn.x, y: 400, z: w.spawn.z }, { x: 0, y: -1, z: 0 }, 1000);
    if (!ray || Math.abs(ray.point.y - w.getHeight(w.spawn.x, w.spawn.z)) > 0.05) mal.push('raycastTerrain no acierta el suelo');
    return mal.length ? { motivo: mal.join('; '), info } : { ok: true, info: { maxNodosConMalla: maxNodos, maxTris, lugares: info } };
  });

  await EB('terreno sin huecos: cámara volando a 80 m/s a baja altura por el continente y órbita del menú; ningún punto de tierra queda sin malla a la vista', () => {
    const T = window.__T, { w, c } = T, g = window.__game, mal = [];
    const huecos = () => {
      const p = c.camera.position, vis = w.terrain.nodosVisibles(); let n = 0;
      for (let dz = -600; dz <= 600; dz += 60) for (let dx = -600; dx <= 600; dx += 60) {
        const x = p.x + dx, z = p.z + dz; if (Math.abs(x) > w.size / 2 - 10 || Math.abs(z) > w.size / 2 - 10) continue;
        const tierra = w.getHeight(x, z) > 0.5;
        if (!vis.some((q) => x >= q.x0 && x < q.x0 + q.size && z >= q.z0 && z < q.z0 + q.size && (q.mesh || !tierra))) n++;
      }
      return n;
    };
    // vuelo: tramos rectos entre puntos del continente
    const ruta = [[w.spawn.x, w.spawn.z - 100], [-1500, 2500], [-3700, 700], [-1000, -1250], [1500, -2600], [3800, 400], [1200, 3000]];
    c.debug.freeCamera = true;
    let fr = 0, conHuecos = 0, maxH = 0, maxNodos = 0;
    c.camera.position.set(ruta[0][0], w.getHeight(ruta[0][0], ruta[0][1]) + 80, ruta[0][1]); T.avanza(1, 0.1);
    for (let k = 1; k < ruta.length; k++) {
      const [ax, az] = ruta[k - 1], [bx, bz] = ruta[k], L = Math.hypot(bx - ax, bz - az), pasos = Math.ceil(L / 8);
      for (let i = 1; i <= pasos; i++) {
        const t = i / pasos, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        c.camera.position.set(x, Math.max(w.getHeight(x, z), 0) + 60 + 40 * Math.sin(i * 0.05), z);
        g.advance(1, 0.1); fr++;
        if (fr % 5 === 0) { const h = huecos(); if (h) conHuecos++; maxH = Math.max(maxH, h); maxNodos = Math.max(maxNodos, w.terrain.stats().construidos); }
      }
    }
    if (conHuecos) mal.push(`vuelo: ${conHuecos} muestreos con huecos (máx. ${maxH} puntos de 441)`);
    // órbita del menú
    c.setState('menu'); let menuH = 0;
    for (let i = 0; i < 300; i++) { g.advance(1, 0.1); if (i % 10 === 0) menuH = Math.max(menuH, huecos()); }
    c.setState('playing'); c.debug.freeCamera = false; T.jug(w.spawn.x, w.spawn.z); T.avanza(2, 0.1);
    if (menuH) mal.push(`menú: hasta ${menuH} puntos sin malla`);
    if (maxNodos > 480) mal.push(`memoria: ${maxNodos} nodos con malla durante el vuelo`);
    const info = { cuadros: fr, maxNodosConMalla: maxNodos, huecosMenu: menuH };
    return mal.length ? { motivo: mal.join('; '), info } : { ok: true, info };
  });

  await EB('flora y recursos: alrededor de un punto interior de cada bioma hay árboles/rocas propios y los recursos del bioma se pueden recolectar', () => {
    const T = window.__T, { w, p, c } = T, flora = c.flora, mal = [], info = {};
    const BIOMAS = T.prov.BIOMAS, esperado = { desierto: ['cactus', 'veta_sal'], volcan: ['veta_obsidiana'], nieve: [], montana: ['roca'], playa: ['arbol'], pradera: ['arbol'], selva: ['arbol'], bosque: ['arbol'], taiga: ['arbol'], pantano: ['arbol', 'veta_arcilla'] };
    for (const [nombre, id] of Object.entries(BIOMAS)) {
      if (nombre === 'mar') continue;
      const pt = T.puntoBioma(id); if (!pt) { mal.push(`${nombre}: sin punto interior`); continue; }
      T.jug(pt[0], pt[1]); T.avanza(14, 0.1);
      const lista = flora.getHarvestablesNear(p.position, 450, []), tipos = {};
      for (const e of lista) { const k = e.tipo === 'roca' && e.it?.mineral ? 'veta_' + e.it.mineral : e.tipo; tipos[k] = (tipos[k] ?? 0) + 1; }
      info[nombre] = { punto: [Math.round(pt[0]), Math.round(pt[1])], radioCeldas: pt[2], recolectables: tipos }; // radio 450 m
      for (const t of esperado[nombre]) if (!tipos[t]) mal.push(`${nombre}: no hay «${t}» a 450 m`);
      if (!Object.keys(tipos).length && nombre !== 'nieve') mal.push(`${nombre}: ningún recolectable a 450 m`);
    }
    return mal.length ? { motivo: mal.join('; '), info } : { ok: true, info };
  });

  await EB('población: en cada provincia y mar nacen solo especies de su ecosistema (y de su época), con el territorio asignado', () => {
    const T = window.__T, { w, p, F, c } = T, pob = F.poblacion, mal = [], info = {};
    const { PROVINCIAS, MARES } = T.prov;
    const sitios = [...PROVINCIAS.map((pv) => ({ id: pv.id, x: pv.centro[0], z: pv.centro[1], tipo: 'provincia', idx: PROVINCIAS.indexOf(pv) })), ...MARES.map((m, i) => ({ id: m.id, x: m.centro[0], z: m.centro[1], tipo: 'mar', idx: i }))];
    for (const s of sitios) {
      // busca un punto del propio territorio cerca del centro
      let x = s.x, z = s.z, ok = false;
      for (let r = 0; r < 3200 && !ok; r += 60) for (let k = 0; k < 16 && !ok; k++) { const a = k / 16 * Math.PI * 2, xx = s.x + Math.cos(a) * r, zz = s.z + Math.sin(a) * r; if (Math.abs(xx) > w.limite - 100 || Math.abs(zz) > w.limite - 100) continue; if (s.tipo === 'provincia' ? w.provinceIdx(xx, zz) === s.idx && w.getHeight(xx, zz) > 1.5 : w.seaIdx(xx, zz) === s.idx && w.getHeight(xx, zz) < -12) { x = xx; z = zz; ok = true; } }
      if (!ok) { mal.push(`${s.id}: sin punto de prueba`); continue; }
      F.clear(); T.jug(x, z); pob.llenar({ min: 24 }); T.avanza(30, 0.1);
      const vivas = F.creatures.filter((q) => !q.muerta && q.pob);
      // las criaturas del anillo de población pueden ser de la provincia o el mar vecinos: cada una debe ser de las especies de SU territorio
      const tabla = (t) => new Set((t.k === T.terr.TERR.TIERRA || t.k === T.terr.TERR.AIRE ? pob.tabla.tierra[t.i] : pob.tabla.mar[t.i]).todas.map((e) => e.id));
      const fuera = vivas.filter((q) => !q.terr || !tabla(q.terr).has(q.especie)).map((q) => q.especie);
      const sinTerr = vivas.filter((q) => !q.terr).length;
      const territorios = [...new Set(vivas.map((q) => F.territorioDe(q)))];
      const permitidas = new Set(pob.especiesEn(x, z));
      info[s.id] = { criaturas: vivas.length, especies: [...new Set(vivas.map((q) => q.especie))].length, territorios };
      if (fuera.length) mal.push(`${s.id}: especies ajenas ${[...new Set(fuera)].join(', ')}`);
      if (sinTerr) mal.push(`${s.id}: ${sinTerr} sin territorio`);
      if (!vivas.length && permitidas.size) mal.push(`${s.id}: no apareció ninguna criatura (hay ${permitidas.size} especies posibles)`);
      for (const q of vivas) if (!q.dentro(q.position.x, q.position.z) && !q.flight) { mal.push(`${s.id}: ${q.especie} nace fuera de su territorio`); break; }
    }
    F.clear();
    return mal.length ? { motivo: mal.slice(0, 10).join('; '), info } : { ok: true, info };
  });

  await EB('frontera: un animal salvaje de tierra empujado hacia el borde de su provincia no la cruza (ni persiguiendo), y uno domado sí puede', () => {
    const T = window.__T, { w, p, F } = T, { TERR } = T.terr, mal = [];
    // busca un borde entre dos provincias de tierra: un punto de A con un vecino de B a 14 m en alguna dirección
    let borde = null;
    for (let x = -3000; x <= 3000 && !borde; x += 24) for (let z = -3000; z <= 3000 && !borde; z += 24) {
      const a = w.provinceIdx(x, z); if (a === 255 || w.getHeight(x, z) < 3) continue;
      for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, dx = Math.sin(ang), dz = Math.cos(ang), b = w.provinceIdx(x + dx * 30, z + dz * 30); if (b !== 255 && b !== a && w.getHeight(x + dx * 30, z + dz * 30) > 3 && w.getHeight(x - dx * 20, z - dz * 20) > 3 && w.provinceIdx(x - dx * 20, z - dz * 20) === a) { borde = { x: x - dx * 20, z: z - dz * 20, dx, dz, a, b, yaw: Math.atan2(dx, dz) }; break; } }
    }
    if (!borde) return { motivo: 'no se encontró un borde entre provincias de tierra' };
    const prueba = (exento) => {
      F.clear(); T.jug(borde.x - borde.dx * 20, borde.z - borde.dz * 20);
      const c = F.spawnAt('parasaurolophus', borde.x, borde.z, { frozen: true, yaw: borde.yaw });
      c.terr = { k: TERR.TIERRA, i: borde.a };
      if (exento) { c.rel = { dom: true, manejo: true }; }
      c.override = { speed: 4 }; // el cuerpo avanza hacia el borde sin que decida la IA
      let cruzo = false, minD = 1e9;
      for (let t = 0; t < 400; t++) { T.avanza(0.1, 0.1); if (w.provinceIdx(c.position.x, c.position.z) !== borde.a) { cruzo = true; break; } }
      const rec = Math.hypot(c.position.x - borde.x, c.position.z - borde.z);
      F.clear();
      return { cruzo, recorrido: +rec.toFixed(1) };
    };
    const salvaje = prueba(false), propio = prueba(true);
    if (salvaje.cruzo) mal.push('el animal salvaje cruzó a otra provincia');
    if (salvaje.recorrido < 8) mal.push(`el salvaje apenas avanzó (${salvaje.recorrido} m): la prueba no llegó al borde`);
    if (!propio.cruzo) mal.push('un animal propio (exento) no pudo cruzar: la frontera debería ser solo para salvajes');
    return mal.length ? { motivo: mal.join('; '), salvaje, propio, borde } : { ok: true, info: { de: borde.a, a: borde.b, salvaje, propio } };
  });

  await EB('frontera marina: un nadador salvaje empujado hacia el borde de su mar no lo cruza, y uno propio sí', () => {
    const T = window.__T, { w, F } = T, { TERR } = T.terr, mal = [];
    const { MARES } = T.prov;
    // un punto de mar profundo cuyo vecino a 90 m en alguna dirección es de otro mar (y también profundo)
    let sp = null;
    for (let x = -w.limite + 100; x <= w.limite - 100 && !sp; x += 48) for (let z = -w.limite + 100; z <= w.limite - 100 && !sp; z += 48) {
      const a = w.seaIdx(x, z); if (a === 255 || w.getHeight(x, z) > -22) continue;
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4, dx = Math.sin(ang), dz = Math.cos(ang), b = w.seaIdx(x + dx * 90, z + dz * 90);
        if (b !== 255 && b !== a && w.getHeight(x + dx * 90, z + dz * 90) < -22 && w.seaIdx(x - dx * 40, z - dz * 40) === a && w.getHeight(x - dx * 40, z - dz * 40) < -22) { sp = { x: x - dx * 40, z: z - dz * 40, dx, dz, a, b, yaw: ang }; break; }
      }
    }
    if (!sp) return { motivo: 'no se encontró un borde entre dos mares profundos' };
    const prueba = (propio) => {
      F.clear(); T.jug(sp.x - sp.dx * 30, sp.z - sp.dz * 30);
      const c = F.spawnAt('mosasaurus', sp.x, sp.z, { frozen: true, yaw: sp.yaw }); c.terr = { k: TERR.MAR, i: sp.a };
      if (propio) c.rel = { dom: true, manejo: true };
      c.override = { speed: 3 }; let cruzo = false;
      let db = 0; while (db < 400 && w.seaIdx(sp.x + sp.dx * db, sp.z + sp.dz * db) === sp.a) db += 2; // distancia al borde en la dirección de marcha
      for (let t = 0; t < (db + 60) / 0.3 && !cruzo; t++) { T.avanza(0.1, 0.1); if (w.seaIdx(c.position.x, c.position.z) !== sp.a) cruzo = true; }
      const rec = Math.hypot(c.position.x - sp.x, c.position.z - sp.z); F.clear();
      return { cruzo, recorrido: +rec.toFixed(1), borde: db };
    };
    const salvaje = prueba(false), propio = prueba(true);
    if (salvaje.cruzo) mal.push('el nadador salvaje cruzó a otro mar');
    if (salvaje.recorrido < salvaje.borde * 0.6) mal.push(`el salvaje apenas avanzó (${salvaje.recorrido} m): la prueba no llegó al borde`);
    if (!propio.cruzo) mal.push('un nadador propio (exento) no pudo cruzar');
    return mal.length ? { motivo: mal.join('; '), salvaje, propio, sp } : { ok: true, info: { de: MARES[sp.a].id, a: MARES[sp.b].id, salvaje, propio } };
  });

  await EB('recorrido: 120 s de juego con población en streaming caminando por el continente sin errores, con criaturas acotadas', () => {
    const T = window.__T, { w, p, F, c } = T, mal = [];
    const ruta = [[w.spawn.x, w.spawn.z], [0, 2300], [-1500, 900], [0, -1250], [3500, -2700], [3800, 400]];
    let maxCrea = 0, maxSalv = 0;
    for (const [x, z] of ruta) {
      T.jug(x, z); F.setGrace?.(999);
      for (let t = 0; t < 80; t++) { T.avanza(0.5, 0.1); const s = F.poblacion.stats(); maxCrea = Math.max(maxCrea, F.creatures.length); maxSalv = Math.max(maxSalv, s.salvajes); }
      if (![p.position.x, p.position.y, p.position.z].every(Number.isFinite)) mal.push('jugador no finito');
    }
    for (const q of F.creatures) if (![q.position.x, q.position.y, q.position.z].every(Number.isFinite)) { mal.push(`criatura ${q.especie} con posición no finita`); break; }
    if (maxSalv > F.poblacion.constantes.MAX_SALVAJES + 4) mal.push(`más salvajes (${maxSalv}) que el tope (${F.poblacion.constantes.MAX_SALVAJES})`);
    return mal.length ? { motivo: mal.join('; ') } : { ok: true, info: { maxCriaturas: maxCrea, maxSalvajes: maxSalv, tope: F.poblacion.constantes.MAX_SALVAJES } };
  });

  if (pageUI) {
    await pageUI.evaluate(() => { const c = window.__game.ctx; c.render = () => {}; });
    await EB('mapa M: se abre, dibuja el mundo entero con provincias y mares, hace zoom y da la lectura de cualquier punto', async () => {
      const c = window.__game.ctx, g = window.__game, mal = [];
      c.survival.newGame?.();
      c.events.emit('input:action', { action: 'mapa', pressed: true });
      g.advance(3, 0.05);
      const cv = document.querySelector('.map canvas'), ui = c.ui?.mapa;
      if (!cv || !ui) return { motivo: 'no existe el mapa en la interfaz' };
      const visible = !document.querySelector('.map').closest('.screen').classList.contains('hide');
      if (!visible) mal.push('el mapa no se mostró al pulsar M');
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, colores = new Set();
      for (let i = 0; i < px.length; i += 4 * 997) colores.add((px[i] >> 4) * 256 + (px[i + 1] >> 4) * 16 + (px[i + 2] >> 4));
      if (colores.size < 25) mal.push(`el mapa tiene muy pocos colores (${colores.size})`);
      const w = c.world;
      const lecturas = [[w.spawn.x, w.spawn.z], [3800, 400], [0, -4550], [-5600, 400], [5200, 4600]].map(([x, z]) => ui.lectura(x, z));
      if (lecturas.some((t) => !t || /undefined|NaN/.test(t))) mal.push('lecturas inválidas: ' + lecturas.join(' | '));
      const span0 = ui.view.span;
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cv.getBoundingClientRect().left + 300, clientY: cv.getBoundingClientRect().top + 300, bubbles: true, cancelable: true }));
      if (!(ui.view.span < span0)) mal.push('la rueda no hace zoom');
      c.events.emit('input:action', { action: 'mapa', pressed: true }); g.advance(2, 0.05);
      return mal.length ? { motivo: mal.join('; ') } : { ok: true, info: { colores: colores.size, lecturas } };
    }, undefined, pageUI);
  }
}

console.log(`\nErrores de consola/página: ${errs.length}`);
errs.slice(0, 8).forEach((e) => console.log('  ' + e.slice(0, 200)));
const fallos = resultados.filter((r) => !r.ok).length + (errs.length ? 1 : 0);
console.log(fallos ? `\n${fallos} escenario(s) con fallos` : `\nTodo en orden (${resultados.length} escenarios)`);
if (browser) await browser.close();
if (server) server.kill();
process.exit(fallos ? 1 : 0);
