#!/usr/bin/env node
// Prueba de los modelos estáticos acoplados al esqueleto procedural (src/fauna/estatico.js): carga, pesos de piel, deformación en marcha/carrera,
// contacto de los pies con el terreno, mandíbula, esferas de impacto y respaldo procedural. Usa window.__game (?debug=1). No renderiza.
// Uso: tools/lock.sh node tools/estatico-test.mjs [regex de escenario]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
async function abrir(query = '', rutas = null) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (rutas) await rutas(page);
  await page.goto(`http://127.0.0.1:${port}/?debug=1&ui=0&quality=low${query}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.ctx, p = c.player, F = c.fauna, S = c.survival;
    const T = window.__T = { g, c, p, F, S };
    c.render = () => {};
    c.time.hour = 12; c.time.locked = true; Object.assign(c.time.weather, { rain: 0, storm: 0 });
    T.site = () => {
      if (T._site) return T._site;
      const w = c.world;
      for (let x = -480; x <= 480; x += 16) for (let z = -480; z <= 480; z += 16) {
        if (w.getBiome(x, z) !== 'pradera' || w.colliders.query(x, z, 22, []).length) continue;
        let lo = 1e9, hi = -1e9, ok = true;
        for (let dx = -80; dx <= 80 && ok; dx += 20) for (let dz = -80; dz <= 80; dz += 20) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (ok && hi - lo < 9) return (T._site = { x, z });
      }
      return null;
    };
    T.avanza = (seg, dt = 1 / 20) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
    T.limpia = () => { F.clear(); };
    T.jug = (x, z) => { p.teleport(x, z); p.velocity.set(0, 0, 0); S.heal(100); };
    T.modelo = (esp, v, o = {}) => {
      T.limpia();
      const s = T.site(); T.jug(s.x + 14, s.z + 14);
      const c2 = F.spawnAt(esp, s.x, s.z, { frozen: true, yaw: o.yaw ?? Math.PI / 2, tint: 0.5 });
      c2.override = v > 0 ? { speed: v, hold: true } : null;
      return c2;
    };
  });
  return page;
}

let page = await abrir();
const resultados = [];
async function R(nombre, fn, arg) {
  if (only && !only.test(nombre)) return;
  const t0 = Date.now(); let res;
  try { res = await page.evaluate(fn, arg); } catch (e) { res = 'EXCEPCIÓN: ' + String(e).slice(0, 300); }
  const ok = res == null || (typeof res === 'object' && res.ok === true);
  resultados.push({ nombre, ok });
  console.log(`${ok ? '✔' : '✘'} ${nombre}  (${Date.now() - t0} ms)${ok ? (res && res.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
}

await R('carga: el modelo estático del Carnotaurus carga, se acopla y adopta sus medidas', () => {
  const { F } = window.__T, E = F.estaticos;
  if (!E.cargados.includes('carnotaurus')) return 'no cargó: ' + JSON.stringify(E.errores);
  const s = E.stats('carnotaurus');
  if (s.tris < 3000 || s.tris > 20000) return 'triángulos fuera de rango ' + s.tris;
  if (!(s.hit.length >= 6) || s.hit.some((h) => h.some((v) => !Number.isFinite(v)))) return 'esferas de impacto raras ' + JSON.stringify(s.hit);
  if (!(s.hit[0][3] > 0.5)) return 'la primera esfera (cuerpo) debería ser grande: ' + s.hit[0];
  return { ok: true, info: { tris: s.tris, H: +s.H.toFixed(2), esferas: s.hit.length } };
});

await R('pesos: todo vértice tiene influencias válidas; cabeza, mandíbula, patas y cola tienen piel propia', () => {
  const T = window.__T, c = T.modelo('carnotaurus', 0), g = c.mesh.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = SI.count;
  const nombres = c.mesh.skeleton.bones.map((b) => b.name), cuenta = {}; let malos = 0;
  for (let v = 0; v < n; v++) {
    let s = 0, best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (!(w >= 0)) malos++; s += w; if (w > bw) { bw = w; best = SI.getComponent(v, k); } }
    if (Math.abs(s - 1) > 1e-3) malos++;
    cuenta[nombres[best]] = (cuenta[nombres[best]] ?? 0) + 1;
  }
  if (malos) return `${malos} vértices con pesos inválidos`;
  const falta = ['head', 'jaw', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'tail1', 'tail3', 'tail5', 'neck1', 'armL', 'armR', 'hips'].filter((b) => !(cuenta[b] > 20));
  if (falta.length) return 'huesos casi sin piel: ' + falta + ' ' + JSON.stringify(cuenta);
  return { ok: true, info: cuenta };
});

await R('reposo: con el esqueleto sin rotar la malla coincide con la geometría (no hay deformación de base)', () => {
  const T = window.__T, c = T.modelo('carnotaurus', 0); c.group.updateMatrixWorld(true);
  const m = c.mesh, P = m.geometry.attributes.position, v = new c.position.constructor();
  // se anula cualquier rotación de la animación para medir la pose de enlace
  for (const b of m.skeleton.bones) b.quaternion.identity();
  c.bones.hips.position.copy(c.rest.hips); c.group.updateMatrixWorld(true); m.skeleton.update();
  let mx = 0;
  for (let i = 0; i < P.count; i += 7) { m.getVertexPosition(i, v); mx = Math.max(mx, Math.hypot(v.x - P.getX(i), v.y - P.getY(i), v.z - P.getZ(i))); }
  return mx < 0.02 ? { ok: true, info: { desvio_max_m: +mx.toFixed(4) } } : 'desvío ' + mx;
});

await R('mandíbula: al abrir el hueso `jaw` se mueve el maxilar inferior (y solo el inferior)', () => {
  const T = window.__T, c = T.modelo('carnotaurus', 0), m = c.mesh, P = m.geometry.attributes.position, v = new c.position.constructor();
  for (const b of m.skeleton.bones) b.quaternion.identity(); c.group.updateMatrixWorld(true); m.skeleton.update();
  const antes = []; for (let i = 0; i < P.count; i++) { m.getVertexPosition(i, v); antes.push([v.x, v.y, v.z]); }
  c.bones.jaw.rotation.x = 0.6; c.group.updateMatrixWorld(true); m.skeleton.update();
  let mov = 0, mx = 0, zmin = 1e9, ymax = -1e9;
  for (let i = 0; i < P.count; i++) { m.getVertexPosition(i, v); const d = Math.hypot(v.x - antes[i][0], v.y - antes[i][1], v.z - antes[i][2]); if (d > 0.05) { mov++; zmin = Math.min(zmin, antes[i][2]); ymax = Math.max(ymax, antes[i][1]); } mx = Math.max(mx, d); }
  if (mov < 60) return 'casi no se mueve nada (' + mov + ' vértices)';
  if (mx < 0.2 || mx > 1.6) return 'amplitud rara ' + mx;
  const H = c.sp.hips; if (ymax > H * 1.6 || zmin < 0.3 * 7.5 * 0.55) return `se mueve fuera del hocico: zmin ${zmin} ymax ${ymax}`;
  return { ok: true, info: { vertices: mov, max_m: +mx.toFixed(2), zmin: +zmin.toFixed(2) } };
});

for (const [esc, v, seg] of [['marcha', 2.0, 5], ['carrera', 6.6, 5]]) {
  await R(`${esc}: sin vértices rotos ni estiramientos, y los pies apoyan en el terreno`, ({ v, seg }) => {
    const T = window.__T, c = T.modelo('carnotaurus', v); T.avanza(2);
    const m = c.mesh, G = m.geometry, P = G.attributes.position, n = P.count, vec = new c.position.constructor();
    const rest = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) rest[i] = P.array[i];
    // aristas de muestra (triángulos consecutivos)
    const aristas = []; for (let t = 0; t < n / 3; t += 5) { aristas.push([t * 3, t * 3 + 1], [t * 3 + 1, t * 3 + 2]); }
    const SI = G.attributes.skinIndex, SW = G.attributes.skinWeight, nombres = m.skeleton.bones.map((b) => b.name);
    const pie = []; for (let i = 0; i < n; i++) { let best = -1, bw = 0; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } } if (/^foot/.test(nombres[best])) pie.push(i); }
    const w = T.c.world; let nan = 0, estir = 0, maxEst = 0, hundido = 0, apoyos = 0, flota = 0, maxHund = 0; const rat = [], donde = {};
    const hueso = (i) => { let best = -1, bw = 0; for (let k = 0; k < 4; k++) { const w2 = SW.getComponent(i, k); if (w2 > bw) { bw = w2; best = SI.getComponent(i, k); } } return nombres[best]; };
    for (let f = 0; f < seg * 10; f++) {
      T.avanza(0.1, 1 / 20); c.group.updateMatrixWorld(true); m.skeleton.update();
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, vec); pos[i * 3] = vec.x; pos[i * 3 + 1] = vec.y; pos[i * 3 + 2] = vec.z; if (!Number.isFinite(vec.x + vec.y + vec.z)) nan++; }
      for (const [a, b] of aristas) {
        const l0 = Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]); if (l0 < 0.08) continue; // las aristas diminutas (garras, punta de la cola) no se juzgan por proporción
        const l1 = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); const r = l1 / l0; rat.push(r); if (r > maxEst) maxEst = r; if (r > 2.2 && l1 - l0 > 0.15) { estir++; const k2 = `${hueso(a)}|${hueso(b)} @z${rest[a * 3 + 2].toFixed(1)},y${rest[a * 3 + 1].toFixed(1)}`; donde[k2] = (donde[k2] ?? 0) + 1; }
      }
      // suelo: el punto más bajo de los vértices de los pies, en el mundo, frente a la altura del terreno bajo ese punto
      let low = 1e9, lx = 0, lz = 0; for (const i of pie) if (pos[i * 3 + 1] < low) { low = pos[i * 3 + 1]; lx = pos[i * 3]; lz = pos[i * 3 + 2]; }
      const wy = c.position.y + low, wx = c.position.x + lx, wz = c.position.z + lz; vec.set(lx, low, lz); vec.applyMatrix4(m.matrixWorld);
      const gy = w.getHeight(vec.x, vec.z), d = vec.y - gy;
      if (d < -0.25) hundido++; maxHund = Math.min(maxHund, d); if (d > -0.12 && d < 0.12) apoyos++; if (d > 0.9) flota++;
      void wy; void wx; void wz;
    }
    const frames = seg * 10; rat.sort((a, b) => a - b);
    if (nan) return nan + ' vértices no finitos';
    if (hundido > frames * 0.1) return `el pie se hunde en el terreno en ${hundido}/${frames} fotogramas (peor ${maxHund.toFixed(2)} m)`;
    if (apoyos < frames * 0.25) return `apenas hay apoyo en el suelo (${apoyos}/${frames})`;
    // una piel de ~6 000 triángulos estira algunas aristas grandes junto a las articulaciones; se tolera una fracción mínima y se informa el peor caso
    const muestras = rat.length, fraccion = estir / Math.max(1, muestras);
    if (fraccion > 0.003 || maxEst > 4.5) return `${estir}/${muestras} aristas estiradas (×2,2 y más de 15 cm de alargamiento) (máx ×${maxEst.toFixed(2)}) ` + JSON.stringify(Object.entries(donde).sort((a2, b2) => b2[1] - a2[1]).slice(0, 12));
    return { ok: true, info: { apoyo: `${apoyos}/${frames}`, hundido: hundido, flota, estiramiento_p99: +rat[Math.floor(rat.length * 0.99)].toFixed(2), estiramiento_max: +maxEst.toFixed(2), aristas_muy_estiradas: `${(fraccion * 100).toFixed(2)} %`, peor_hundimiento_m: +maxHund.toFixed(2) } };
  }, { v, seg });
}

await R('ejemplares: geometría compartida y esqueletos propios', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 30, s.z);
  const a = F.spawnAt('carnotaurus', s.x, s.z, { tint: 0.1 }), b = F.spawnAt('carnotaurus', s.x + 8, s.z, { tint: 0.9 });
  if (a.mesh.geometry !== b.mesh.geometry) return 'la geometría no se comparte';
  if (a.bones.hips === b.bones.hips) return 'comparten esqueleto';
  T.avanza(3);
  return { ok: true };
});

await R('IA: el Carnotaurus se comporta como siempre (persigue, muerde, muere) con la malla nueva', () => {
  const T = window.__T, { F } = T; T.limpia();
  const s = T.site(); T.jug(s.x + 30, s.z + 10);
  const c = F.spawnAt('carnotaurus', s.x, s.z); T.avanza(2);
  const d0 = Math.hypot(c.position.x - T.p.position.x, c.position.z - T.p.position.z);
  c.setState('chase'); c.tgtJugador = true; T.avanza(4);
  const d1 = Math.hypot(c.position.x - T.p.position.x, c.position.z - T.p.position.z);
  if (!(d1 < d0 - 3)) return `no se acerca (${d0.toFixed(1)} → ${d1.toFixed(1)})`;
  c.damage(1e5); T.avanza(2);
  if (!c.muerta) return 'no muere';
  if (![c.position.x, c.position.y, c.position.z].every(Number.isFinite)) return 'posición no finita';
  return { ok: true, info: { dist: [+d0.toFixed(1), +d1.toFixed(1)] } };
});
await page.close();

// ---- respaldo: con ?glb=0 la especie usa su malla procedural
page = await abrir('&glb=0');
await R('respaldo: con ?glb=0 el Carnotaurus usa su malla procedural', () => {
  const T = window.__T, { F } = T; T.limpia();
  if (F.estaticos.cargados.length) return 'cargó un modelo estático con glb=0';
  const s = T.site(); T.jug(s.x + 20, s.z);
  const c = F.spawnAt('carnotaurus', s.x, s.z); T.avanza(2);
  if (!c.bones.neck1 || c.mesh.geometry.attributes.position.count < 2000 || !c.mesh.geometry.index) return 'no es la malla procedural';
  return { ok: true };
});
await page.close();

// ---- respaldo: el archivo GLB no existe / no hay red
page = await abrir('', async (pg) => { await pg.route('**/models/fauna/generados/*', (r) => r.abort()); });
await R('respaldo: si el GLB o el rig no cargan, la especie usa su malla procedural y el juego sigue', () => {
  const T = window.__T, { F } = T; T.limpia();
  if (!F.estaticos.errores.carnotaurus) return 'no registró el error de carga';
  const s = T.site(); T.jug(s.x + 20, s.z);
  const c = F.spawnAt('carnotaurus', s.x, s.z); T.avanza(3);
  if (!c.mesh.geometry.index) return 'no cayó a la malla procedural';
  if (!Number.isFinite(c.position.y)) return 'posición no finita';
  return { ok: true, info: { error: String(F.estaticos.errores.carnotaurus).slice(0, 80) } };
});
await page.close();

const okN = resultados.filter((r) => r.ok).length;
console.log(`\nRESUMEN: ${okN}/${resultados.length} OK`);
const erroresReales = errs.filter((e) => !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED|aborted/i.test(e));
console.log('ERRORES de consola/página:', erroresReales.length ? erroresReales.slice(0, 6) : 'ninguno');
await browser.close(); server.kill();
process.exit(okN === resultados.length && !erroresReales.length ? 0 : 1);
