#!/usr/bin/env node
// Prueba de las pieles texturizadas generadas (Higgsfield + tools/autorig.mjs, rig versión 2) sobre el esqueleto de cada especie:
// carga, huesos completos (los que usa la animación), pesos válidos y repartidos, pose de enlace exacta, marcha sin estiramientos rotos con los
// pies apoyando en el suelo (terrestres), vuelo y nado sin valores no finitos, material texturizado y respaldo (?hf=0 y archivo ausente).
// Uso: tools/lock.sh node tools/hf-test.mjs [regex de especie o escenario]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const ids = (/\[(.*)\]/.exec(fs.readFileSync(path.join(root, 'src/fauna/estaticos-hf.js'), 'utf8'))?.[1] ?? '').split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(root + '/node_modules/.bin/vite', ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
const matar = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* ya no está */ } };
const vigia = setTimeout(() => { console.log('✘ VIGÍA: la prueba superó 20 min'); matar(); process.exit(3); }, 20 * 60 * 1000);
let browser, codigo = 0;
const resultados = [];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  async function abrir(query = '', rutas = null) {
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
    page.on('pageerror', (e) => errs.push(String(e)));
    // en la página con rutas cortadas a propósito (respaldo), los fallos de carga de esos archivos son lo esperado
    page.on('console', (m) => { if (m.type() === 'error' && !(rutas && /ERR_FAILED|Failed to fetch/.test(m.text()))) errs.push(m.text()); });
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
        const w = c.world, s0 = w.spawn;
        for (let r = 0; r < 4000; r += 40) for (let a = 0; a < 6.283; a += 0.3) {
          const x = s0.x + Math.cos(a) * r, z = s0.z + Math.sin(a) * r;
          if (w.getHeight(x, z) < 3 || w.colliders.query(x, z, 30, []).length) continue;
          let lo = 1e9, hi = -1e9, ok = true;
          for (let dx = -60; dx <= 60 && ok; dx += 20) for (let dz = -60; dz <= 60; dz += 20) { const h = w.getHeight(x + dx, z + dz); if (h < 2.5) { ok = false; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
          if (ok && hi - lo < 5) return (T._site = { x, z });
        }
        return null;
      };
      T.avanza = (seg, dt = 1 / 20) => { g.advance(Math.max(1, Math.round(seg / dt)), dt); };
      T.modelo = (esp, v, o = {}) => {
        F.clear();
        const s = T.site(); p.teleport(s.x + 60, s.z + 60); p.velocity.set(0, 0, 0); S.heal(100);
        const c2 = F.spawnAt(esp, s.x, s.z, { frozen: true, yaw: o.yaw ?? Math.PI / 2, tint: 0.5 });
        c2.override = v > 0 ? { speed: v, hold: true } : null;
        return c2;
      };
      // vértices de la malla con piel en el mundo, por índice
      T.malla = (c2) => { const m = c2.mesh, P = m.geometry.attributes.position, n = P.count, v = new c2.position.constructor(), out = new Float32Array(n * 3); c2.group.updateMatrixWorld(true); m.skeleton.update(); for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; } return out; };
      T.huesoDe = (c2) => { const g2 = c2.mesh.geometry, SI = g2.attributes.skinIndex, SW = g2.attributes.skinWeight, nb = c2.mesh.skeleton.bones.map((b) => b.name), out = []; for (let i = 0; i < SI.count; i++) { let b = -1, bw = 0; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; b = SI.getComponent(i, k); } } out.push(nb[b]); } return out; };
    });
    return page;
  }
  let page = await abrir();
  async function R(nombre, fn, arg) {
    if (only && !only.test(nombre)) return;
    const t0 = Date.now(); let res;
    try { res = await page.evaluate(fn, arg); } catch (e) { res = 'EXCEPCIÓN: ' + String(e).slice(0, 300); }
    const ok = res == null || (typeof res === 'object' && res.ok === true);
    resultados.push({ nombre, ok });
    console.log(`${ok ? '✔' : '✘'} ${nombre}  (${Date.now() - t0} ms)${ok ? (res && res.info ? '  ' + JSON.stringify(res.info) : '') : '\n    → ' + (typeof res === 'string' ? res : JSON.stringify(res))}`);
  }

  await R(`carga: las ${ids.length} pieles del manifiesto cargan, sin errores y con material texturizado`, (lista) => {
    const { F } = window.__T, E = F.estaticos, faltan = lista.filter((id) => !E.cargados.includes(id));
    if (faltan.length) return 'no cargaron: ' + faltan.join(', ') + ' ' + JSON.stringify(E.errores);
    for (const id of lista) {
      const c = window.__T.modelo(id, 0), m = c.mesh.material;
      if (!m.map) return `${id}: el material no tiene la textura del modelo`;
      if (m.vertexColors) return `${id}: el material usa color de vértice (la piel saldría negra)`;
    }
    return { ok: true, info: { especies: lista.length } };
  }, ids);

  for (const id of ids) {
    await R(`${id}: huesos, pesos y pose de enlace`, (esp) => {
      const T = window.__T, c = T.modelo(esp, 0), g = c.mesh.geometry, SW = g.attributes.skinWeight, n = SW.count, d = c.sp.estatico?.datos;
      if (!d || d.v !== 2) return 'no usa la piel v2';
      // huesos: todos los de la procedural (la animación los busca por nombre)
      const proc = c.sp.buildProcedural.call(c.sp).specs.map((s) => s.name), tiene = new Set(c.mesh.skeleton.bones.map((b) => b.name));
      const faltan = proc.filter((x) => !tiene.has(x)); if (faltan.length) return 'faltan huesos: ' + faltan;
      let malos = 0; for (let v = 0; v < n; v++) { let s = 0; for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (!(w >= 0)) malos++; s += w; } if (Math.abs(s - 1) > 1e-3) malos++; }
      if (malos) return `${malos} vértices con pesos inválidos`;
      const dom = T.huesoDe(c), cuenta = {}; for (const b of dom) cuenta[b] = (cuenta[b] ?? 0) + 1;
      const pl = d.plantilla, req = ['hips', 'head'];
      if (pl === 'bipedo' || pl === 'cuadrupedo') req.push('thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'tail2');
      if (pl === 'cuadrupedo') req.push('fupL', 'fupR', 'flowL', 'flowR');
      if (pl === 'pterosaurio') req.push('elL', 'elR', 'wrL', 'wrR');
      if (pl === 'acuatico') req.push('tail2', 'tail4');
      const pobres = req.filter((b) => !(cuenta[b] > 15)); if (pobres.length) return 'huesos casi sin piel: ' + pobres + ' ' + JSON.stringify(cuenta);
      // pose de enlace: sin rotaciones, la malla coincide con la geometría
      for (const b of c.mesh.skeleton.bones) b.quaternion.identity();
      c.bones.hips.position.copy(c.rest.hips); c.group.updateMatrixWorld(true); c.mesh.skeleton.update();
      const P = g.attributes.position, v = new c.position.constructor(); let mx = 0;
      for (let i = 0; i < P.count; i += 5) { c.mesh.getVertexPosition(i, v); mx = Math.max(mx, Math.hypot(v.x - P.getX(i), v.y - P.getY(i), v.z - P.getZ(i))); }
      if (mx > 0.02) return 'la pose de enlace deforma la malla: ' + mx.toFixed(3) + ' m';
      if (!(c.sp.hit?.length >= 4) || c.sp.hit.some((h) => h.some((x) => !Number.isFinite(x)))) return 'esferas de impacto raras';
      // cobertura: fracción de vértices (pose de enlace, espacio local = el de sp.hit) dentro de alguna esfera de impacto
      let dentro = 0, total = 0;
      for (let i = 0; i < P.count; i += 3) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i); total++;
        if (c.sp.hit.some(([hx, hy, hz, r]) => (x - hx) ** 2 + (y - hy) ** 2 + (z - hz) ** 2 <= r * r)) dentro++;
      }
      const cobertura = dentro / total;
      if (cobertura < 0.9) return `las esferas de impacto cubren poco el cuerpo: ${(cobertura * 100).toFixed(1)} % de los vértices`;
      return { ok: true, info: { plantilla: pl, tris: d.tris, H: +d.H.toFixed(2), esferas: c.sp.hit.length, cobertura: +cobertura.toFixed(3) } };
    }, id);
  }

  for (const id of ids) {
    await R(`${id}: marcha/vuelo/nado sin vértices rotos ni estiramientos (y apoyando en el suelo si camina)`, (esp) => {
      const T = window.__T, d0 = T.F.estaticos.stats(esp), sp0 = T.c.fauna;
      void d0; void sp0;
      const c = T.modelo(esp, 0), pl = c.sp.estatico.datos.plantilla, L = c.sp.cat?.tamano ?? 3;
      const camina = pl === 'bipedo' || pl === 'cuadrupedo';
      const v = camina ? Math.min(2.5, c.sp.vel?.walk ?? 1.5) : 0;
      const c2 = T.modelo(esp, v);
      T.avanza(1.5);
      const g = c2.mesh.geometry, idx = g.index.array, n = g.attributes.position.count;
      const rest = T.malla(c2);
      // longitudes de las aristas en reposo (del cuadro inicial, ya en marcha: se compara con la geometría original)
      const P = g.attributes.position, aris = [];
      for (let t = 0; t < idx.length; t += 3 * 4) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]]]) { const l0 = Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)); if (l0 > 0.004 * L) aris.push([a, b, l0]); }
      const dom = T.huesoDe(c2), pies = []; for (let i = 0; i < n; i++) if (/^(foot|ffoot)/.test(dom[i])) pies.push(i);
      const w = T.c.world; let nan = 0, maxEst = 0, muy = 0, apoyo = 0, hundido = 0, cuadros = 0; const rat = [];
      for (let f = 0; f < 40; f++) {
        T.avanza(0.1);
        const pos = T.malla(c2); cuadros++;
        for (let i = 0; i < n; i++) if (!Number.isFinite(pos[i * 3] + pos[i * 3 + 1] + pos[i * 3 + 2])) { nan++; break; }
        for (const [a, b, l0] of aris) { const l1 = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]) / (c2.mesh.matrixWorld.elements[0] ? Math.hypot(c2.mesh.matrixWorld.elements[0], c2.mesh.matrixWorld.elements[1], c2.mesh.matrixWorld.elements[2]) : 1); const r = l1 / l0; rat.push(r); if (r > maxEst) maxEst = r; if (r > 2.5 && l1 - l0 > 0.03 * L) muy++; }
        if (camina && pies.length) { let low = 1e9, lx = 0, lz = 0; for (const i of pies) if (pos[i * 3 + 1] < low) { low = pos[i * 3 + 1]; lx = pos[i * 3]; lz = pos[i * 3 + 2]; } const dd = low - w.getHeight(lx, lz); if (Math.abs(dd) < 0.06 * Math.max(1, c2.sp.hips)) apoyo++; if (dd < -0.12 * Math.max(1, c2.sp.hips)) hundido++; }
      }
      void rest;
      rat.sort((a, b) => a - b);
      if (nan) return `${nan} cuadros con vértices no finitos`;
      const frac = muy / Math.max(1, rat.length);
      // Umbral: una piel con esqueleto automático estira algunas aristas en los pliegues (ingle, axila) al doblar mucho la pata; se tolera una
      // fracción mínima y un máximo de ×7,5 (más es un desgarro visible de lejos). El informe da p99 y máximo de cada especie.
      if (frac > 0.004 || maxEst > 7.5) return `estiramientos: ${muy}/${rat.length} aristas ×2,5 (máx ×${maxEst.toFixed(2)})`;
      if (camina && apoyo < cuadros * 0.3) return `apenas apoya en el suelo (${apoyo}/${cuadros} cuadros)`;
      if (camina && hundido > cuadros * 0.15) return `se hunde en el suelo (${hundido}/${cuadros})`;
      return { ok: true, info: { plantilla: pl, p99: +rat[Math.floor(rat.length * 0.99)].toFixed(2), max: +maxEst.toFixed(2), estiradas: `${(frac * 100).toFixed(3)} %`, apoyo: camina ? `${apoyo}/${cuadros}` : '—', bajaCaderas: +(c2.sp.bajarCaderas ?? 0).toFixed(2) } };
    }, id);
  }

  // Capas de animación del esqueleto procedural sobre la piel (pastar, llamar, mirar, comer) y muerte: la cabeza se mueve hacia donde debe,
  // la piel no se desgarra en esas poses y el cadáver queda apoyado en el suelo, quieto y sin valores no finitos.
  for (const id of ids) {
    await R(`${id}: capas (pastar, llamar, mirar) y muerte sobre la piel`, (esp) => {
      const T = window.__T, c = T.modelo(esp, 0), pl = c.sp.estatico.datos.plantilla, H = Math.max(0.2, c.sp.hips ?? 1), L = c.sp.cat?.tamano ?? 3;
      if (pl !== 'bipedo' && pl !== 'cuadrupedo') return { ok: true, info: { plantilla: pl, nota: 'sin capas terrestres' } };
      T.p.teleport(c.position.x + 6, c.position.z + 6); // cerca: las capas solo se animan a corta distancia de la cámara (los animales pequeños, aún más cerca)
      // la cabeza se mide por el centro de los vértices que mueve el hueso de la cabeza (o la mandíbula), en coordenadas de la criatura
      const dom = T.huesoDe(c), deCabeza = []; for (let i = 0; i < dom.length; i++) if (dom[i] === 'head' || dom[i] === 'jaw') deCabeza.push(i);
      if (deCabeza.length < 10) return 'la cabeza casi no tiene piel';
      const cab = (pos) => { let x = 0, y = 0, z = 0; for (const i of deCabeza) { x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; } const n = deCabeza.length, dx = x / n - c.position.x, dz = z / n - c.position.z, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw); return { x: dx * cy - dz * sy, y: y / n - c.position.y, z: dx * sy + dz * cy }; };
      // estiramiento máximo de las aristas en la pose actual
      const g = c.mesh.geometry, idx = g.index.array, P = g.attributes.position, aris = [];
      for (let t = 0; t < idx.length; t += 3 * 6) { const a = idx[t], b = idx[t + 1], l0 = Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)); if (l0 > 0.004 * L) aris.push([a, b, l0]); }
      const pose = () => { const pos = T.malla(c); let mx = 0, nan = 0; for (const [a, b, l0] of aris) { const l1 = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); if (!Number.isFinite(l1)) nan++; else mx = Math.max(mx, l1 / l0); } return { mx, nan, pos, cab: cab(pos) }; };
      // base del cuello: distancia hasta la cabeza para medir el giro
      const v = new c.position.constructor();
      const pastor = c.sp.tipo === 'herbivoro' || c.sp.tipo === 'presa' || c.sp.anim === 'ornitomimo';
      T.avanza(2); const base = pose();
      c.group.updateMatrixWorld(true); (c.bones.neck1 ?? c.bones.head).getWorldPosition(v);
      const nx = v.x - c.position.x, nz = v.z - c.position.z, ys = Math.sin(c.yaw), yc = Math.cos(c.yaw);
      const cuello = Math.max(0.15, Math.hypot(nx * yc - nz * ys - base.cab.x, v.y - c.position.y - base.cab.y, nx * ys + nz * yc - base.cab.z));
      c.state = 'graze'; T.avanza(2.5); const pasta = pose(); c.state = 'idle'; T.avanza(2.5);
      c.llamadaAnim = 3; T.avanza(1.2); const llama = pose(); c.llamadaAnim = 0; T.avanza(2.5);
      c.lookYaw = 0.8; c.lock = true; T.avanza(1.2); const mira = pose(); c.lookYaw = 0; c.lock = false; T.avanza(2);
      const o = { pastor, baja: +(base.cab.y - pasta.cab.y).toFixed(2), sube: +(llama.cab.y - base.cab.y).toFixed(2), giro: +(mira.cab.x - base.cab.x).toFixed(2), cuello: +cuello.toFixed(2), est: +Math.max(pasta.mx, llama.mx, mira.mx).toFixed(2) };
      if (pasta.nan || llama.nan || mira.nan) return 'vértices no finitos en las capas';
      if (!(base.cab.y - pasta.cab.y > (pastor ? 0.15 : 0.05) * H)) return { motivo: 'pastar no baja la cabeza', ...o };
      if (!(llama.cab.y - base.cab.y > 0.02 * H)) return { motivo: 'llamar no sube la cabeza', ...o };
      if (!(mira.cab.x - base.cab.x > 0.12 * cuello)) return { motivo: 'mirar a +x no gira la cabeza hacia +x', ...o };
      if (o.est > 7.5) return { motivo: 'la piel se desgarra en las capas', ...o };
      // muerte: cae, queda quieta, apoyada (ni flotando ni enterrada) y sin desgarros
      const alto0 = (() => { const p0 = pose().pos; let hi = -1e9; for (let i = 1; i < p0.length; i += 3) hi = Math.max(hi, p0[i]); return hi; })();
      c.die(); T.avanza(5); const m1 = pose(); T.avanza(1); const m2 = pose();
      let lo = 1e9, hi = -1e9, quieto = 0; const w = T.c.world;
      for (let i = 0; i < m2.pos.length; i += 3) { lo = Math.min(lo, m2.pos[i + 1] - w.getHeight(m2.pos[i], m2.pos[i + 2])); hi = Math.max(hi, m2.pos[i + 1]); quieto = Math.max(quieto, Math.abs(m2.pos[i + 1] - m1.pos[i + 1])); }
      Object.assign(o, { muerteMin: +lo.toFixed(2), bajo: +(alto0 - hi).toFixed(2), mov: +quieto.toFixed(3), estMuerte: +m2.mx.toFixed(2) });
      if (m2.nan) return { motivo: 'cadáver con vértices no finitos', ...o };
      if (lo > 0.25 * H) return { motivo: 'el cadáver flota sobre el suelo', ...o };
      if (lo < -0.6 * H) return { motivo: 'el cadáver se hunde en el suelo', ...o };
      if (quieto > 0.02) return { motivo: 'el cadáver sigue moviéndose', ...o };
      if (m2.mx > 7.5) return { motivo: 'la piel se desgarra al morir', ...o };
      return { ok: true, info: o };
    }, id);
  }
  await page.close();

  page = await abrir('&hf=0');
  await R('respaldo: con ?hf=0 no se carga ninguna piel generada y las especies usan su malla anterior', (lista) => {
    const { F } = window.__T;
    const cargadas = lista.filter((id) => F.estaticos.cargados.includes(id));
    if (cargadas.length) return 'cargaron igual: ' + cargadas.join(', ');
    const c = window.__T.modelo('tyrannosaurus', 1.5); window.__T.avanza(1);
    if (!Number.isFinite(c.position.y)) return 'posición no finita';
    return { ok: true };
  }, ids);
  await page.close();

  page = await abrir('', async (pg) => { await pg.route('**/models/fauna/hf/triceratops*', (r) => r.abort()); });
  await R('respaldo: si un archivo de piel no carga, esa especie usa su malla procedural y el resto sigue', () => {
    const { F } = window.__T;
    if (!F.estaticos.errores.triceratops) return 'no registró el error';
    if (!F.estaticos.cargados.includes('tyrannosaurus')) return 'arrastró a las demás especies';
    const c = window.__T.modelo('triceratops', 1.3); window.__T.avanza(2);
    if (c.sp.estatico?.datos) return 'tiene datos de piel sin haberla cargado';
    if (!Number.isFinite(c.position.y)) return 'posición no finita';
    return { ok: true, info: { error: String(F.estaticos.errores.triceratops).slice(0, 60) } };
  });
  await page.close();
  if (errs.length) { console.log('✘ errores en la página:', errs.slice(0, 5)); codigo = 1; }
} catch (e) { console.log('✘ EXCEPCIÓN', e); codigo = 1; } finally {
  clearTimeout(vigia);
  await browser?.close().catch(() => {}); matar();
}
const mal = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - mal}/${resultados.length} escenarios correctos`);
process.exit(mal || codigo ? 1 : 0);
